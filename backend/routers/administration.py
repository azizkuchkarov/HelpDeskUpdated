"""Administration Section: Service, Supply, Meeting Room Booking."""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional, List
from database import get_db
from auth.deps import get_current_user
from models.user import User, UserRole
from models.administration import AdmTicket, AdmTicketType, MeetingRoom, MeetingRoomBooking
from models.file_attachment import FileAttachment
from models.ticket_comment import TicketComment
from services.minio_service import upload_file, get_presigned_url, stream_object, content_disposition_for_filename

router = APIRouter()


def _is_adm_engineer(user: User, db: Session) -> bool:
    return db.query(UserRole).filter(
        UserRole.user_id == user.id,
        UserRole.role_type.in_(["adm_engineer", "adm_ticket_engineer"]),
    ).first() is not None


def _is_adm_manager(user: User, db: Session) -> bool:
    return db.query(UserRole).filter(
        UserRole.user_id == user.id,
        UserRole.role_type == "adm_manager",
    ).first() is not None


class CommentCreate(BaseModel):
    body: str


def _can_access_adm_ticket(ticket: AdmTicket, user: User, db: Session) -> bool:
    if ticket.created_by_id == user.id:
        return True
    if ticket.assigned_engineer_id == user.id:
        return True
    if _is_adm_engineer(user, db):
        return True
    if _is_adm_manager(user, db):
        return True
    return False


class AdmTicketCreate(BaseModel):
    ticket_type: str  # service, supply, meeting_room
    title: str
    description: Optional[str] = None
    priority: Optional[str] = "medium"  # low, medium, high, urgent
    requires_it: Optional[bool] = False
    # for meeting_room:
    room_id: Optional[int] = None
    subject: Optional[str] = None
    start_at: Optional[str] = None
    end_at: Optional[str] = None


@router.get("/meeting-rooms")
def list_meeting_rooms(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(MeetingRoom).filter(MeetingRoom.is_active == True).all()


@router.get("/bookings")
def list_bookings(
    room_id: Optional[int] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(MeetingRoomBooking)
    if room_id:
        q = q.filter(MeetingRoomBooking.room_id == room_id)
    if from_date:
        q = q.filter(MeetingRoomBooking.start_at >= datetime.fromisoformat(from_date.replace("Z", "+00:00")))
    if to_date:
        q = q.filter(MeetingRoomBooking.end_at <= datetime.fromisoformat(to_date.replace("Z", "+00:00")))
    return [
        {
            "id": b.id,
            "room_id": b.room_id,
            "subject": b.subject,
            "start_at": b.start_at.isoformat() if b.start_at else None,
            "end_at": b.end_at.isoformat() if b.end_at else None,
            "created_by_id": b.created_by_id,
        }
        for b in q.all()
    ]


@router.get("/tickets")
def list_tickets(
    status: Optional[str] = None,
    ticket_type: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(AdmTicket)
    if not _is_adm_engineer(user, db) and not _is_adm_manager(user, db):
        q = q.filter(AdmTicket.created_by_id == user.id)
    if status:
        q = q.filter(AdmTicket.status == status)
    if ticket_type:
        q = q.filter(AdmTicket.ticket_type == ticket_type)
    tickets = q.order_by(AdmTicket.created_at.desc()).all()
    return [
        {
            "id": t.id,
            "ticket_type": t.ticket_type,
            "title": t.title,
            "description": t.description,
            "priority": getattr(t, "priority", None) or "medium",
            "status": t.status,
            "created_by_id": t.created_by_id,
            "created_by_name": t.created_by.display_name or t.created_by.ldap_username,
            "assigned_engineer_id": t.assigned_engineer_id,
            "requires_it": t.requires_it,
            "it_ticket_id": t.it_ticket_id,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "closed_at": t.closed_at.isoformat() if t.closed_at else None,
            "meeting_booking": (
                {
                    "room_id": t.meeting_room_booking.room_id,
                    "subject": t.meeting_room_booking.subject,
                    "start_at": t.meeting_room_booking.start_at.isoformat(),
                    "end_at": t.meeting_room_booking.end_at.isoformat(),
                }
                if t.meeting_room_booking else None
            ),
        }
        for t in tickets
    ]


@router.post("/tickets")
def create_ticket(d: AdmTicketCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if d.ticket_type == AdmTicketType.MEETING_ROOM and (not d.room_id or not d.start_at or not d.end_at):
        raise HTTPException(400, "Meeting room booking requires room_id, start_at, end_at")
    start_at = datetime.fromisoformat(d.start_at.replace("Z", "+00:00")) if d.start_at else None
    end_at = datetime.fromisoformat(d.end_at.replace("Z", "+00:00")) if d.end_at else None
    if d.ticket_type == AdmTicketType.MEETING_ROOM and start_at and end_at:
        overlap = db.query(MeetingRoomBooking).filter(
            MeetingRoomBooking.room_id == d.room_id,
            MeetingRoomBooking.start_at < end_at,
            MeetingRoomBooking.end_at > start_at,
        ).first()
        if overlap:
            raise HTTPException(400, "This time slot is already booked for this room")
    priority = (d.priority or "medium").lower() if d.priority else "medium"
    if priority not in ("low", "medium", "high", "urgent"):
        priority = "medium"
    ticket = AdmTicket(
        ticket_type=d.ticket_type,
        title=d.title,
        description=d.description,
        priority=priority,
        created_by_id=user.id,
        status="open",
        requires_it=d.requires_it or False,
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    if d.ticket_type == AdmTicketType.MEETING_ROOM and d.room_id and start_at and end_at:
        booking = MeetingRoomBooking(
            room_id=d.room_id,
            adm_ticket_id=ticket.id,
            subject=None,  # Subject field is no longer used
            start_at=start_at,
            end_at=end_at,
            created_by_id=user.id,
        )
        db.add(booking)
        if d.requires_it:
            from models.it import ITTicket
            meeting_title = d.subject or ticket.title or "Meeting"
            it_ticket = ITTicket(
                title=f"IT support for meeting: {meeting_title}",
                description=f"Linked to Administration ticket #{ticket.id}",
                created_by_id=user.id,
                status="open",
            )
            db.add(it_ticket)
            db.flush()
            ticket.it_ticket_id = it_ticket.id
        db.commit()
    return {"id": ticket.id, "status": "open", "message": "Ticket created"}


@router.post("/tickets/{ticket_id}/close-by-engineer")
def close_by_engineer(ticket_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not _is_adm_engineer(user, db):
        raise HTTPException(403, "Administration Engineer only")
    ticket = db.query(AdmTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if ticket.status == "closed":
        raise HTTPException(400, "Ticket is already closed")
    ticket.status = "closed_by_engineer"
    ticket.closed_at = datetime.utcnow()
    ticket.assigned_engineer_id = ticket.assigned_engineer_id or user.id
    db.commit()
    return {"ok": True, "status": "closed_by_engineer"}


@router.post("/tickets/{ticket_id}/reject")
def reject_ticket(ticket_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Reject an Administration ticket. Only Ticket Engineer or Admin Engineer can reject tickets."""
    if not _is_adm_engineer(user, db):
        raise HTTPException(403, "Administration Engineer only")
    ticket = db.query(AdmTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if ticket.status == "closed":
        raise HTTPException(400, "Cannot reject a closed ticket")
    ticket.status = "rejected"
    ticket.assigned_engineer_id = ticket.assigned_engineer_id or user.id
    ticket.closed_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "status": "rejected"}


@router.post("/tickets/{ticket_id}/confirm-by-user")
def confirm_by_user(ticket_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ticket = db.query(AdmTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if ticket.created_by_id != user.id:
        raise HTTPException(403, "Not your ticket")
    ticket.status = "closed"
    ticket.confirmed_by_user_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "status": "closed"}


@router.get("/tickets/{ticket_id}/comments")
def list_comments(
    ticket_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List comments on an Administration ticket."""
    ticket = db.query(AdmTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if not _can_access_adm_ticket(ticket, user, db):
        raise HTTPException(403, "Access denied")
    comments = (
        db.query(TicketComment)
        .filter(TicketComment.ticket_type == "adm", TicketComment.ticket_id == ticket_id)
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
    ticket = db.query(AdmTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if not _can_access_adm_ticket(ticket, user, db):
        raise HTTPException(403, "Access denied")
    body = (d.body or "").strip()
    if not body:
        raise HTTPException(400, "Comment body is required")
    comment = TicketComment(
        ticket_type="adm",
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
    """Upload a file to an Admin ticket. User must have access to the ticket."""
    ticket = db.query(AdmTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    # Check access: creator, assigned engineer, or admin manager
    if ticket.created_by_id != user.id and ticket.assigned_engineer_id != user.id and not _is_adm_manager(user, db):
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
            folder=f"admin/{ticket_id}",
        )
    except Exception as e:
        raise HTTPException(500, f"Failed to upload file: {str(e)}")
    
    # Save attachment record
    attachment = FileAttachment(
        ticket_type="admin",
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
    """List files attached to an Admin ticket."""
    ticket = db.query(AdmTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    # Check access: creator, assigned engineer, or admin manager
    if ticket.created_by_id != user.id and ticket.assigned_engineer_id != user.id and not _is_adm_manager(user, db):
        raise HTTPException(403, "Access denied")
    
    attachments = db.query(FileAttachment).filter(
        FileAttachment.ticket_type == "admin",
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
    """Get download URL for a file attached to an Admin ticket."""
    ticket = db.query(AdmTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    # Check access: creator, assigned engineer, or admin manager
    if ticket.created_by_id != user.id and ticket.assigned_engineer_id != user.id and not _is_adm_manager(user, db):
        raise HTTPException(403, "Access denied")
    
    attachment = db.query(FileAttachment).filter(
        FileAttachment.id == file_id,
        FileAttachment.ticket_type == "admin",
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
    ticket = db.query(AdmTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if ticket.created_by_id != user.id and ticket.assigned_engineer_id != user.id and not _is_adm_manager(user, db):
        raise HTTPException(403, "Access denied")
    attachment = db.query(FileAttachment).filter(
        FileAttachment.id == file_id,
        FileAttachment.ticket_type == "admin",
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
