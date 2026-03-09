"""Travel (Ticket) Section: flight/travel tickets, stats for Admin Manager."""
import os
import json
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional, List
from decimal import Decimal
import httpx
from config import get_settings
from database import get_db
from auth.deps import get_current_user
from models.user import User, UserRole
from models.travel import TravelTicket, TravelTicketStat
from models.file_attachment import FileAttachment
from models.ticket_comment import TicketComment
from services.minio_service import upload_file, get_presigned_url, stream_object, content_disposition_for_filename

# Load local places (offline autocomplete)
LOCAL_PLACES: list[dict] = []
try:
    _places_path = Path(__file__).resolve().parent.parent / "data" / "travel_places.json"
    if _places_path.is_file():
        with _places_path.open(encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                LOCAL_PLACES = data
except Exception:
    LOCAL_PLACES = []

router = APIRouter()


def _is_adm_ticket_engineer(user: User, db: Session) -> bool:
    return db.query(UserRole).filter(
        UserRole.user_id == user.id,
        UserRole.role_type == "adm_ticket_engineer",
    ).first() is not None


def _is_hotel_engineer(user: User, db: Session) -> bool:
    return db.query(UserRole).filter(
        UserRole.user_id == user.id,
        UserRole.role_type == "hotel_engineer",
    ).first() is not None


def _can_access_travel_ticket(user: User, ticket: TravelTicket, db: Session) -> bool:
    """Creator, adm_ticket_engineer, or hotel_engineer (when book_hotel) can access."""
    if ticket.created_by_id == user.id:
        return True
    if _is_adm_ticket_engineer(user, db):
        return True
    if getattr(ticket, "book_hotel", False) and _is_hotel_engineer(user, db):
        return True
    if _is_adm_manager(user, db):
        return True
    return False


def _is_adm_manager(user: User, db: Session) -> bool:
    return db.query(UserRole).filter(
        UserRole.user_id == user.id,
        UserRole.role_type.in_(["adm_manager", "adm_monitoring_manager"]),
    ).first() is not None


class Segment(BaseModel):
    source: str
    destination: str
    date: Optional[str] = None
    time: Optional[str] = None


class TravelTicketCreate(BaseModel):
    segments: List[Segment]  # source, destination, date, time
    comment: Optional[str] = None
    priority: Optional[str] = "medium"  # low, medium, high, urgent
    book_hotel: Optional[bool] = False


class CommentCreate(BaseModel):
    body: str


class TravelTicketStatCreate(BaseModel):
    travel_ticket_id: int
    username: Optional[str] = None
    source_destination: str
    date_time: str
    company: str
    price: float


@router.get("/places")
def search_places(
    q: str,
    user: User = Depends(get_current_user),
):
    """Search cities/places for travel source/destination autocomplete.

    1) Prefer local JSON data (backend/data/travel_places.json)
    2) If no local match, optionally fall back to GeoNames (if configured)
    """
    q = (q or "").strip()
    if len(q) < 2:
        return []

    # 1) Try local places first (offline)
    if LOCAL_PLACES:
        q_lower = q.lower()
        local_matches = [
            p
            for p in LOCAL_PLACES
            if q_lower in (p.get("name", "") or "").lower()
            or q_lower in (p.get("display", "") or "").lower()
        ]
        if local_matches:
            # Return at most 10
            return local_matches[:10]

    # 2) Fallback to GeoNames if available
    settings = get_settings()
    username = settings.geonames_username or os.environ.get("GEONAMES_USERNAME", "")
    if not username:
        return []
    try:
        with httpx.Client(timeout=5.0) as client:
            r = client.get(
                "https://api.geonames.org/search",
                params={"q": q, "maxRows": 10, "type": "json", "username": username},
            )
            r.raise_for_status()
            data = r.json()
    except Exception:
        return []
    geonames = data.get("geonames") or []
    return [
        {
            "name": g.get("name", ""),
            "countryName": g.get("countryName", ""),
            "display": f"{g.get('name', '')}, {g.get('countryName', '')}".strip(", "),
        }
        for g in geonames
    ]


@router.get("/tickets")
def list_tickets(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(TravelTicket)
    is_ticket_engineer = _is_adm_ticket_engineer(user, db)
    is_hotel_engineer = _is_hotel_engineer(user, db)
    is_manager = _is_adm_manager(user, db)
    if not is_ticket_engineer and not is_manager:
        if is_hotel_engineer:
            q = q.filter(
                (TravelTicket.created_by_id == user.id) |
                (TravelTicket.book_hotel == True)
            )
        else:
            q = q.filter(TravelTicket.created_by_id == user.id)
    if status:
        q = q.filter(TravelTicket.status == status)
    tickets = q.order_by(TravelTicket.created_at.desc()).all()
    return [
        {
            "id": t.id,
            "source_destination_json": t.source_destination_json,
            "comment": t.comment,
            "priority": getattr(t, "priority", None) or "medium",
            "status": t.status,
            "book_hotel": getattr(t, "book_hotel", False) or False,
            "created_by_id": t.created_by_id,
            "created_by_name": t.created_by.display_name or t.created_by.ldap_username,
            "assigned_engineer_id": t.assigned_engineer_id,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "closed_at": t.closed_at.isoformat() if t.closed_at else None,
        }
        for t in tickets
    ]


@router.post("/tickets")
def create_ticket(d: TravelTicketCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    import json
    segments_json = [s.model_dump() for s in d.segments]
    priority = (d.priority or "medium").lower() if d.priority else "medium"
    if priority not in ("low", "medium", "high", "urgent"):
        priority = "medium"
    ticket = TravelTicket(
        source_destination_json=json.dumps(segments_json),
        comment=d.comment,
        priority=priority,
        book_hotel=bool(d.book_hotel),
        created_by_id=user.id,
        status="open",
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return {"id": ticket.id, "status": "open", "message": "Ticket created"}


@router.post("/tickets/{ticket_id}/close")
def close_ticket(ticket_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ticket = db.query(TravelTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    is_ticket_engineer = _is_adm_ticket_engineer(user, db)
    is_hotel_engineer = _is_hotel_engineer(user, db)
    book_hotel = getattr(ticket, "book_hotel", False)
    can_close = is_ticket_engineer or (book_hotel and is_hotel_engineer)
    if not can_close:
        raise HTTPException(403, "Travel Ticket Engineer or Hotel Engineer (for hotel bookings) only")
    # Ticket Engineer: require at least one stat. Hotel Engineer: can close without stat (hotel part only).
    if is_ticket_engineer:
        stat_count = db.query(TravelTicketStat).filter(TravelTicketStat.travel_ticket_id == ticket_id).count()
        if stat_count == 0:
            raise HTTPException(400, "Cannot close ticket without adding at least one ticket stat. Please add ticket stat first.")
    ticket.status = "closed"
    ticket.closed_at = datetime.utcnow()
    ticket.assigned_engineer_id = ticket.assigned_engineer_id or user.id
    db.commit()
    return {"ok": True, "status": "closed"}


@router.post("/tickets/{ticket_id}/reject")
def reject_ticket(ticket_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Reject a Travel ticket. Only Ticket Engineer can reject tickets."""
    if not _is_adm_ticket_engineer(user, db):
        raise HTTPException(403, "Administration Ticket Engineer only")
    ticket = db.query(TravelTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if ticket.status == "closed":
        raise HTTPException(400, "Cannot reject a closed ticket")
    ticket.status = "rejected"
    ticket.assigned_engineer_id = ticket.assigned_engineer_id or user.id
    ticket.closed_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "status": "rejected"}


@router.get("/stats")
def list_stats(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not _is_adm_ticket_engineer(user, db) and not _is_adm_manager(user, db):
        raise HTTPException(403, "Access denied")
    stats = db.query(TravelTicketStat).order_by(TravelTicketStat.created_at.desc()).all()
    return [
        {
            "id": s.id,
            "travel_ticket_id": s.travel_ticket_id,
            "username": s.username,
            "source_destination": s.source_destination,
            "date_time": s.date_time,
            "company": s.company,
            "price": float(s.price) if s.price else None,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in stats
    ]


@router.post("/stats")
def create_stat(d: TravelTicketStatCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not _is_adm_ticket_engineer(user, db):
        raise HTTPException(403, "Administration Ticket Engineer only")
    stat = TravelTicketStat(
        travel_ticket_id=d.travel_ticket_id,
        username=d.username,
        source_destination=d.source_destination,
        date_time=d.date_time,
        company=d.company,
        price=Decimal(str(d.price)),
    )
    db.add(stat)
    db.commit()
    db.refresh(stat)
    return {"id": stat.id}


class TravelTicketStatUpdate(BaseModel):
    company: str
    price: float


@router.patch("/stats/{stat_id}")
def update_stat(stat_id: int, d: TravelTicketStatUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Update a travel ticket stat. Only Ticket Engineer can update stats."""
    if not _is_adm_ticket_engineer(user, db):
        raise HTTPException(403, "Administration Ticket Engineer only")
    stat = db.query(TravelTicketStat).get(stat_id)
    if not stat:
        raise HTTPException(404, "Stat not found")
    stat.company = d.company
    stat.price = Decimal(str(d.price))
    db.commit()
    return {"ok": True, "id": stat.id}


@router.get("/tickets/{ticket_id}/comments")
def list_comments(
    ticket_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List comments on a Travel ticket."""
    ticket = db.query(TravelTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if not _can_access_travel_ticket(user, ticket, db):
        raise HTTPException(403, "Access denied")
    comments = (
        db.query(TicketComment)
        .filter(TicketComment.ticket_type == "travel", TicketComment.ticket_id == ticket_id)
        .order_by(TicketComment.created_at)
        .all()
    )
    return [
        {
            "id": c.id,
            "author_id": c.author_id,
            "author_name": c.author.display_name or c.author.ldap_username,
            "body": c.body,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in comments
    ]


@router.post("/tickets/{ticket_id}/comments")
def add_comment(
    ticket_id: int,
    d: CommentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Add a comment. Any user with access to the ticket can comment."""
    ticket = db.query(TravelTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if not _can_access_travel_ticket(user, ticket, db):
        raise HTTPException(403, "Access denied")
    body = (d.body or "").strip()
    if not body:
        raise HTTPException(400, "Comment body is required")
    comment = TicketComment(
        ticket_type="travel",
        ticket_id=ticket_id,
        author_id=user.id,
        body=body,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return {
        "id": comment.id,
        "author_id": comment.author_id,
        "author_name": user.display_name or user.ldap_username,
        "body": comment.body,
        "created_at": comment.created_at.isoformat() if comment.created_at else None,
    }


@router.post("/tickets/{ticket_id}/files")
async def upload_file_to_ticket(
    ticket_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload a file to a Travel ticket. User must have access to the ticket."""
    ticket = db.query(TravelTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if not _can_access_travel_ticket(user, ticket, db):
        raise HTTPException(403, "Access denied")
    
    # Read file data
    file_data = await file.read()
    if len(file_data) == 0:
        raise HTTPException(400, "File is empty")
    
    # Upload to MinIO
    try:
        file_path = upload_file(
            file_data=file_data,
            content_type=file.content_type or "application/octet-stream",
            folder=f"travel/{ticket_id}",
        )
    except Exception as e:
        raise HTTPException(500, f"Failed to upload file: {str(e)}")
    
    # Save attachment record
    attachment = FileAttachment(
        ticket_type="travel",
        ticket_id=ticket_id,
        file_name=file.filename or "unknown",
        file_path=file_path,
        file_size=len(file_data),
        content_type=file.content_type,
        uploaded_by_id=user.id,
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    
    return {
        "id": attachment.id,
        "file_name": attachment.file_name,
        "file_size": attachment.file_size,
        "content_type": attachment.content_type,
        "uploaded_by_name": user.display_name or user.ldap_username,
        "created_at": attachment.created_at.isoformat() if attachment.created_at else None,
    }


@router.get("/tickets/{ticket_id}/files")
def list_ticket_files(
    ticket_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List files attached to a Travel ticket."""
    ticket = db.query(TravelTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if not _can_access_travel_ticket(user, ticket, db):
        raise HTTPException(403, "Access denied")
    
    attachments = db.query(FileAttachment).filter(
        FileAttachment.ticket_type == "travel",
        FileAttachment.ticket_id == ticket_id,
    ).order_by(FileAttachment.created_at.desc()).all()
    
    return [
        {
            "id": a.id,
            "file_name": a.file_name,
            "file_size": a.file_size,
            "content_type": a.content_type,
            "uploaded_by_name": a.uploaded_by.display_name or a.uploaded_by.ldap_username,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in attachments
    ]


@router.get("/tickets/{ticket_id}/files/{file_id}/download")
def download_ticket_file(
    ticket_id: int,
    file_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get download URL for a file attached to a Travel ticket."""
    ticket = db.query(TravelTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if not _can_access_travel_ticket(user, ticket, db):
        raise HTTPException(403, "Access denied")
    
    attachment = db.query(FileAttachment).filter(
        FileAttachment.id == file_id,
        FileAttachment.ticket_type == "travel",
        FileAttachment.ticket_id == ticket_id,
    ).first()
    
    if not attachment:
        raise HTTPException(404, "File not found")
    
    # Generate presigned URL (valid for 1 hour)
    try:
        download_url = get_presigned_url(attachment.file_path, expires_seconds=3600)
        return {"download_url": download_url}
    except Exception as e:
        raise HTTPException(500, f"Failed to generate download URL: {str(e)}")


@router.get("/tickets/{ticket_id}/files/{file_id}/file")
def stream_ticket_file(
    ticket_id: int,
    file_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Stream file with Content-Disposition: attachment so the browser downloads it."""
    ticket = db.query(TravelTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if not _can_access_travel_ticket(user, ticket, db):
        raise HTTPException(403, "Access denied")
    attachment = db.query(FileAttachment).filter(
        FileAttachment.id == file_id,
        FileAttachment.ticket_type == "travel",
        FileAttachment.ticket_id == ticket_id,
    ).first()
    if not attachment:
        raise HTTPException(404, "File not found")
    try:
        return StreamingResponse(
            stream_object(attachment.file_path),
            media_type=attachment.content_type or "application/octet-stream",
            headers={"Content-Disposition": content_disposition_for_filename(attachment.file_name)},
        )
    except Exception as e:
        raise HTTPException(500, f"Failed to stream file: {str(e)}")
