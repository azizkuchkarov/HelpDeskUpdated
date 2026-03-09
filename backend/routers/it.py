"""IT Section: tickets - open, assign, resolve, confirm."""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional, List
from database import get_db
from auth.deps import get_current_user
from models.user import User, UserRole
from models.it import ITTicket, ITTicketComment
from models.file_attachment import FileAttachment
from services.minio_service import upload_file, get_presigned_url, stream_object, content_disposition_for_filename

router = APIRouter()


def _is_it_admin(user: User, db: Session) -> bool:
    return db.query(UserRole).filter(
        UserRole.user_id == user.id,
        UserRole.role_type == "it_admin",
    ).first() is not None


def _is_it_engineer(user: User, db: Session) -> bool:
    return db.query(UserRole).filter(
        UserRole.user_id == user.id,
        UserRole.role_type == "it_engineer",
    ).first() is not None


class ITTicketCreate(BaseModel):
    problem_type: Optional[str] = None  # Hardware, Software, Installing programm, Printer, Telephone, SimCard
    title: str
    description: Optional[str] = None
    priority: Optional[str] = "medium"  # low, medium, high, urgent


class ITTicketAssign(BaseModel):
    engineer_id: int


class ITTicketCommentCreate(BaseModel):
    body: str


@router.get("/engineers")
def list_engineers(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """List users with it_engineer role — for IT Admin to assign tickets. Only it_admin can call."""
    if not _is_it_admin(user, db):
        raise HTTPException(403, "IT Admin only")
    from models.user import UserRole
    rows = (
        db.query(User.id, User.ldap_username, User.display_name)
        .join(UserRole, UserRole.user_id == User.id)
        .filter(User.is_active == True, UserRole.role_type == "it_engineer")
        .distinct()
        .all()
    )
    return [{"id": r.id, "display_name": r.display_name or r.ldap_username} for r in rows]


@router.get("/tickets")
def list_tickets(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(ITTicket)
    is_admin = _is_it_admin(user, db)
    is_engineer = _is_it_engineer(user, db)
    if not is_admin and not is_engineer:
        q = q.filter(ITTicket.created_by_id == user.id)
    elif is_engineer and not is_admin:
        q = q.filter(
            (ITTicket.assigned_engineer_id == user.id) | (ITTicket.status == "open")
        )
    if status:
        q = q.filter(ITTicket.status == status)
    tickets = q.order_by(ITTicket.created_at.desc()).all()
    return [
        {
            "id": t.id,
            "problem_type": getattr(t, "problem_type", None),
            "title": t.title,
            "description": t.description,
            "priority": getattr(t, "priority", None) or "medium",
            "status": t.status,
            "created_by_id": t.created_by_id,
            "created_by_name": t.created_by.display_name or t.created_by.ldap_username,
            "assigned_engineer_id": t.assigned_engineer_id,
            "assigned_engineer_name": t.assigned_engineer.display_name if t.assigned_engineer else None,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "closed_at": t.closed_at.isoformat() if t.closed_at else None,
        }
        for t in tickets
    ]


def _can_access_ticket(ticket: ITTicket, user: User, db: Session) -> bool:
    is_admin = _is_it_admin(user, db)
    is_engineer = _is_it_engineer(user, db)
    if is_admin:
        return True
    if is_engineer:
        return ticket.assigned_engineer_id == user.id or ticket.status == "open"
    return ticket.created_by_id == user.id or ticket.assigned_engineer_id == user.id


@router.get("/tickets/{ticket_id}")
def get_ticket(ticket_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ticket = db.query(ITTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if not _can_access_ticket(ticket, user, db):
        raise HTTPException(403, "Access denied")
    return {
        "id": ticket.id,
        "problem_type": getattr(ticket, "problem_type", None),
        "title": ticket.title,
        "description": ticket.description,
        "priority": getattr(ticket, "priority", None) or "medium",
        "status": ticket.status,
        "created_by_id": ticket.created_by_id,
        "created_by_name": ticket.created_by.display_name or ticket.created_by.ldap_username,
        "assigned_engineer_id": ticket.assigned_engineer_id,
        "assigned_engineer_name": ticket.assigned_engineer.display_name if ticket.assigned_engineer else None,
        "created_at": ticket.created_at.isoformat() if ticket.created_at else None,
        "closed_at": ticket.closed_at.isoformat() if ticket.closed_at else None,
        "confirmed_by_user_at": ticket.confirmed_by_user_at.isoformat() if ticket.confirmed_by_user_at else None,
    }


@router.post("/tickets")
def create_ticket(d: ITTicketCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    priority = (d.priority or "medium").lower() if d.priority else "medium"
    if priority not in ("low", "medium", "high", "urgent"):
        priority = "medium"
    ticket = ITTicket(
        problem_type=d.problem_type,
        title=d.title,
        description=d.description,
        priority=priority,
        created_by_id=user.id,
        status="open",
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return {"id": ticket.id, "status": "open", "message": "Ticket created"}


@router.post("/tickets/{ticket_id}/assign")
def assign_ticket(
    ticket_id: int,
    d: ITTicketAssign,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not _is_it_admin(user, db):
        raise HTTPException(403, "IT Admin only")
    ticket = db.query(ITTicket).get(ticket_id)
    if not ticket or ticket.status != "open":
        raise HTTPException(404, "Ticket not found or not open")
    ticket.assigned_engineer_id = d.engineer_id
    ticket.status = "assigned"
    db.commit()
    return {"ok": True, "status": "assigned"}


@router.post("/tickets/{ticket_id}/start")
def start_ticket(ticket_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ticket = db.query(ITTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if ticket.assigned_engineer_id != user.id:
        raise HTTPException(403, "Not assigned to you")
    ticket.status = "in_progress"
    db.commit()
    return {"ok": True, "status": "in_progress"}


@router.post("/tickets/{ticket_id}/close-by-engineer")
def close_by_engineer(ticket_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ticket = db.query(ITTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if ticket.assigned_engineer_id != user.id:
        raise HTTPException(403, "Not assigned to you")
    ticket.status = "closed_by_engineer"
    ticket.closed_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "status": "closed_by_engineer"}


@router.post("/tickets/{ticket_id}/confirm-by-user")
def confirm_by_user(ticket_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ticket = db.query(ITTicket).get(ticket_id)
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
    """List comments on a ticket. Same access as viewing the ticket."""
    ticket = db.query(ITTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if not _can_access_ticket(ticket, user, db):
        raise HTTPException(403, "Access denied")
    comments = (
        db.query(ITTicketComment)
        .filter(ITTicketComment.ticket_id == ticket_id)
        .order_by(ITTicketComment.created_at)
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
    d: ITTicketCommentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Add a comment. Any user with access to the ticket can comment."""
    ticket = db.query(ITTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if not _can_access_ticket(ticket, user, db):
        raise HTTPException(403, "Access denied")
    body = (d.body or "").strip()
    if not body:
        raise HTTPException(400, "Comment body is required")
    comment = ITTicketComment(
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
    """Upload a file to an IT ticket. User must have access to the ticket."""
    ticket = db.query(ITTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if not _can_access_ticket(ticket, user, db):
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
            folder=f"it/{ticket_id}",
        )
    except Exception as e:
        raise HTTPException(500, f"Failed to upload file: {str(e)}")
    
    # Save attachment record
    attachment = FileAttachment(
        ticket_type="it",
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
    """List files attached to an IT ticket."""
    ticket = db.query(ITTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if not _can_access_ticket(ticket, user, db):
        raise HTTPException(403, "Access denied")
    
    attachments = db.query(FileAttachment).filter(
        FileAttachment.ticket_type == "it",
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
    """Get download URL for a file attached to an IT ticket."""
    ticket = db.query(ITTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if not _can_access_ticket(ticket, user, db):
        raise HTTPException(403, "Access denied")
    
    attachment = db.query(FileAttachment).filter(
        FileAttachment.id == file_id,
        FileAttachment.ticket_type == "it",
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
    ticket = db.query(ITTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if not _can_access_ticket(ticket, user, db):
        raise HTTPException(403, "Access denied")
    
    attachment = db.query(FileAttachment).filter(
        FileAttachment.id == file_id,
        FileAttachment.ticket_type == "it",
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
