"""Translator: translation requests with Translator + Check-in workflow."""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional, List
from database import get_db
from auth.deps import get_current_user
from models.user import User, UserRole
from models.translator import TranslatorTicket
from models.file_attachment import FileAttachment
from models.ticket_comment import TicketComment
from services.minio_service import upload_file, get_presigned_url, stream_object, content_disposition_for_filename

router = APIRouter()

SOURCE_LANGUAGES = ["UZ", "RU", "ENG", "CHN"]
TARGET_LANGUAGES = ["UZ", "RU", "ENG", "CHN"]


def _is_translator_admin(user: User, db: Session) -> bool:
    return db.query(UserRole).filter(
        UserRole.user_id == user.id,
        UserRole.role_type == "translator_admin",
    ).first() is not None


def _is_translator_engineer(user: User, db: Session) -> bool:
    return db.query(UserRole).filter(
        UserRole.user_id == user.id,
        UserRole.role_type == "translator_engineer",
    ).first() is not None


def _is_checkin_engineer(user: User, db: Session) -> bool:
    return db.query(UserRole).filter(
        UserRole.user_id == user.id,
        UserRole.role_type == "checkin_engineer",
    ).first() is not None


def _can_access_ticket(ticket: TranslatorTicket, user: User, db: Session) -> bool:
    if _is_translator_admin(user, db):
        return True
    if _is_translator_engineer(user, db):
        return ticket.assigned_translator_id == user.id or ticket.status == "open"
    if _is_checkin_engineer(user, db):
        return ticket.assigned_checkin_id == user.id or ticket.status == "open"
    return ticket.created_by_id == user.id


class TranslatorTicketCreate(BaseModel):
    title: str
    description: Optional[str] = None
    source_language: str
    target_language: str


class CommentCreate(BaseModel):
    body: str


class TranslatorAssign(BaseModel):
    translator_id: int
    checkin_id: int


@router.get("/tickets")
def list_tickets(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(TranslatorTicket)
    is_admin = _is_translator_admin(user, db)
    is_trans = _is_translator_engineer(user, db)
    is_checkin = _is_checkin_engineer(user, db)
    if not is_admin and not is_trans and not is_checkin:
        q = q.filter(TranslatorTicket.created_by_id == user.id)
    elif is_trans or is_checkin:
        # Translator and/or Check-in Engineer: see tickets assigned to them OR open
        from sqlalchemy import or_
        q = q.filter(
            or_(
                TranslatorTicket.assigned_translator_id == user.id,
                TranslatorTicket.assigned_checkin_id == user.id,
                TranslatorTicket.status == "open",
            )
        )
    if status:
        q = q.filter(TranslatorTicket.status == status)
    tickets = q.order_by(TranslatorTicket.created_at.desc()).all()
    return [
        {
            "id": t.id,
            "title": t.title,
            "description": t.description,
            "source_language": t.source_language,
            "target_language": t.target_language,
            "status": t.status,
            "created_by_id": t.created_by_id,
            "created_by_name": t.created_by.display_name or t.created_by.ldap_username,
            "assigned_translator_id": t.assigned_translator_id,
            "assigned_translator_name": t.assigned_translator.display_name if t.assigned_translator else None,
            "assigned_checkin_id": t.assigned_checkin_id,
            "assigned_checkin_name": t.assigned_checkin.display_name if t.assigned_checkin else None,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "closed_at": t.closed_at.isoformat() if t.closed_at else None,
            "translator_started_at": t.translator_started_at.isoformat() if t.translator_started_at else None,
            "translator_submitted_at": t.translator_submitted_at.isoformat() if t.translator_submitted_at else None,
            "confirmed_by_user_at": t.confirmed_by_user_at.isoformat() if t.confirmed_by_user_at else None,
        }
        for t in tickets
    ]


@router.get("/tickets/{ticket_id}")
def get_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ticket = db.query(TranslatorTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if not _can_access_ticket(ticket, user, db):
        raise HTTPException(403, "Access denied")
    return {
        "id": ticket.id,
        "title": ticket.title,
        "description": ticket.description,
        "source_language": ticket.source_language,
        "target_language": ticket.target_language,
        "status": ticket.status,
        "created_by_id": ticket.created_by_id,
        "created_by_name": ticket.created_by.display_name or ticket.created_by.ldap_username,
        "assigned_translator_id": ticket.assigned_translator_id,
        "assigned_translator_name": ticket.assigned_translator.display_name if ticket.assigned_translator else None,
        "assigned_checkin_id": ticket.assigned_checkin_id,
        "assigned_checkin_name": ticket.assigned_checkin.display_name if ticket.assigned_checkin else None,
        "created_at": ticket.created_at.isoformat() if ticket.created_at else None,
        "closed_at": ticket.closed_at.isoformat() if ticket.closed_at else None,
        "translator_started_at": ticket.translator_started_at.isoformat() if ticket.translator_started_at else None,
        "translator_submitted_at": ticket.translator_submitted_at.isoformat() if ticket.translator_submitted_at else None,
        "confirmed_by_user_at": ticket.confirmed_by_user_at.isoformat() if ticket.confirmed_by_user_at else None,
    }


@router.post("/tickets")
async def create_ticket(
    d: TranslatorTicketCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if d.source_language not in SOURCE_LANGUAGES or d.target_language not in TARGET_LANGUAGES:
        raise HTTPException(400, "Invalid source or target language")
    ticket = TranslatorTicket(
        title=d.title,
        description=d.description,
        source_language=d.source_language,
        target_language=d.target_language,
        created_by_id=user.id,
        status="open",
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return {"id": ticket.id, "status": "open", "message": "Ticket created"}


@router.get("/engineers")
def list_engineers(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """List translator_engineer and checkin_engineer users for assign."""
    if not _is_translator_admin(user, db):
        raise HTTPException(403, "Translator Admin only")
    roles = ["translator_engineer", "checkin_engineer"]
    rows = (
        db.query(User.id, User.ldap_username, User.display_name, UserRole.role_type)
        .join(UserRole, UserRole.user_id == User.id)
        .filter(User.is_active == True, UserRole.role_type.in_(roles))
        .distinct()
        .all()
    )
    return [{"id": r.id, "display_name": r.display_name or r.ldap_username, "role_type": r.role_type} for r in rows]


@router.post("/tickets/{ticket_id}/assign")
def assign_ticket(
    ticket_id: int,
    d: TranslatorAssign,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not _is_translator_admin(user, db):
        raise HTTPException(403, "Translator Admin only")
    ticket = db.query(TranslatorTicket).get(ticket_id)
    if not ticket or ticket.status != "open":
        raise HTTPException(404, "Ticket not found or not open")
    ticket.assigned_translator_id = d.translator_id
    ticket.assigned_checkin_id = d.checkin_id
    ticket.status = "assigned"
    db.commit()
    return {"ok": True, "status": "assigned"}


@router.get("/tickets/{ticket_id}/comments")
def list_comments(
    ticket_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List comments on a Translator ticket."""
    ticket = db.query(TranslatorTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if not _can_access_ticket(ticket, user, db):
        raise HTTPException(403, "Access denied")
    comments = (
        db.query(TicketComment)
        .filter(TicketComment.ticket_type == "translator", TicketComment.ticket_id == ticket_id)
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
    ticket = db.query(TranslatorTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if not _can_access_ticket(ticket, user, db):
        raise HTTPException(403, "Access denied")
    body = (d.body or "").strip()
    if not body:
        raise HTTPException(400, "Comment body is required")
    comment = TicketComment(
        ticket_type="translator",
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


@router.post("/tickets/{ticket_id}/upload-original")
async def upload_original(
    ticket_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ticket = db.query(TranslatorTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if ticket.created_by_id != user.id:
        raise HTTPException(403, "Access denied")
    if ticket.status != "open":
        raise HTTPException(400, "Cannot add files after assignment")
    file_data = await file.read()
    if len(file_data) == 0:
        raise HTTPException(400, "File is empty")
    try:
        file_path = upload_file(
            file_data=file_data,
            content_type=file.content_type or "application/octet-stream",
            folder=f"translator/{ticket_id}",
        )
    except Exception as e:
        raise HTTPException(500, f"Failed to upload file: {str(e)}")
    attachment = FileAttachment(
        ticket_type="translator",
        ticket_id=ticket_id,
        file_name=file.filename or "unknown",
        file_path=file_path,
        file_size=len(file_data),
        content_type=file.content_type,
        uploaded_by_id=user.id,
        file_category="original",
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return {"id": attachment.id, "file_name": attachment.file_name, "file_size": attachment.file_size}


@router.post("/tickets/{ticket_id}/upload-translated")
async def upload_translated(
    ticket_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ticket = db.query(TranslatorTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if ticket.assigned_translator_id != user.id:
        raise HTTPException(403, "Not assigned to you")
    if ticket.status not in ("assigned", "in_translation"):
        raise HTTPException(400, "Cannot upload translated file in current status")
    file_data = await file.read()
    if len(file_data) == 0:
        raise HTTPException(400, "File is empty")
    try:
        file_path = upload_file(
            file_data=file_data,
            content_type=file.content_type or "application/octet-stream",
            folder=f"translator/{ticket_id}",
        )
    except Exception as e:
        raise HTTPException(500, f"Failed to upload file: {str(e)}")
    attachment = FileAttachment(
        ticket_type="translator",
        ticket_id=ticket_id,
        file_name=file.filename or "unknown",
        file_path=file_path,
        file_size=len(file_data),
        content_type=file.content_type,
        uploaded_by_id=user.id,
        file_category="translated",
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return {"id": attachment.id, "file_name": attachment.file_name, "file_size": attachment.file_size}


@router.post("/tickets/{ticket_id}/submit-to-checkin")
def submit_to_checkin(
    ticket_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Translator Engineer: marks translation done, send to Check-in."""
    ticket = db.query(TranslatorTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if ticket.assigned_translator_id != user.id:
        raise HTTPException(403, "Not assigned to you")
    if ticket.status not in ("assigned", "in_translation"):
        raise HTTPException(400, "Invalid status")
    has_translated = db.query(FileAttachment).filter(
        FileAttachment.ticket_type == "translator",
        FileAttachment.ticket_id == ticket_id,
        FileAttachment.file_category == "translated",
    ).first()
    if not has_translated:
        raise HTTPException(400, "Upload at least one translated file before submitting")
    ticket.status = "in_checkin"
    ticket.translator_submitted_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "status": "in_checkin"}


@router.post("/tickets/{ticket_id}/checkin-approve")
def checkin_approve(
    ticket_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Check-in Engineer: approve translation, user gets final files."""
    ticket = db.query(TranslatorTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if ticket.assigned_checkin_id != user.id:
        raise HTTPException(403, "Not assigned to you")
    if ticket.status != "in_checkin":
        raise HTTPException(400, "Ticket must be in check-in phase")
    ticket.status = "closed"
    ticket.closed_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "status": "closed"}


@router.post("/tickets/{ticket_id}/checkin-reject")
def checkin_reject(
    ticket_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Check-in Engineer: reject, send back to Translator Engineer."""
    ticket = db.query(TranslatorTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if ticket.assigned_checkin_id != user.id:
        raise HTTPException(403, "Not assigned to you")
    if ticket.status != "in_checkin":
        raise HTTPException(400, "Ticket must be in check-in phase")
    ticket.status = "in_translation"
    db.commit()
    return {"ok": True, "status": "in_translation"}


@router.post("/tickets/{ticket_id}/start-translation")
def start_translation(
    ticket_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Translator Engineer: start working on translation."""
    ticket = db.query(TranslatorTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if ticket.assigned_translator_id != user.id:
        raise HTTPException(403, "Not assigned to you")
    if ticket.status != "assigned":
        raise HTTPException(400, "Invalid status")
    ticket.status = "in_translation"
    ticket.translator_started_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "status": "in_translation"}


@router.post("/tickets/{ticket_id}/confirm-by-user")
def confirm_by_user(
    ticket_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """User: confirm receipt of final translated files."""
    ticket = db.query(TranslatorTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if ticket.created_by_id != user.id:
        raise HTTPException(403, "Only the requester can confirm")
    if ticket.status != "closed":
        raise HTTPException(400, "Ticket must be closed by check-in first")
    if ticket.confirmed_by_user_at:
        raise HTTPException(400, "Already confirmed")
    ticket.confirmed_by_user_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.get("/tickets/{ticket_id}/files")
def list_ticket_files(
    ticket_id: int,
    category: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ticket = db.query(TranslatorTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if not _can_access_ticket(ticket, user, db):
        raise HTTPException(403, "Access denied")
    q = db.query(FileAttachment).filter(
        FileAttachment.ticket_type == "translator",
        FileAttachment.ticket_id == ticket_id,
    )
    if category:
        q = q.filter(FileAttachment.file_category == category)
    attachments = q.order_by(FileAttachment.created_at.desc()).all()
    return [
        {
            "id": a.id,
            "file_name": a.file_name,
            "file_size": a.file_size,
            "content_type": a.content_type,
            "file_category": getattr(a, "file_category", None),
            "uploaded_by_name": a.uploaded_by.display_name or a.uploaded_by.ldap_username,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in attachments
    ]


@router.get("/tickets/{ticket_id}/files/{file_id}/download")
def download_file(
    ticket_id: int,
    file_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ticket = db.query(TranslatorTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if not _can_access_ticket(ticket, user, db):
        raise HTTPException(403, "Access denied")
    attachment = db.query(FileAttachment).filter(
        FileAttachment.id == file_id,
        FileAttachment.ticket_type == "translator",
        FileAttachment.ticket_id == ticket_id,
    ).first()
    if not attachment:
        raise HTTPException(404, "File not found")
    if ticket.status != "closed" and getattr(attachment, "file_category", None) == "translated" and ticket.created_by_id == user.id:
        raise HTTPException(403, "Final files available only after check-in approval")
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
    ticket = db.query(TranslatorTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if not _can_access_ticket(ticket, user, db):
        raise HTTPException(403, "Access denied")
    attachment = db.query(FileAttachment).filter(
        FileAttachment.id == file_id,
        FileAttachment.ticket_type == "translator",
        FileAttachment.ticket_id == ticket_id,
    ).first()
    if not attachment:
        raise HTTPException(404, "File not found")
    if ticket.status != "closed" and getattr(attachment, "file_category", None) == "translated" and ticket.created_by_id == user.id:
        raise HTTPException(403, "Final files available only after check-in approval")
    try:
        return StreamingResponse(
            stream_object(attachment.file_path),
            media_type=attachment.content_type or "application/octet-stream",
            headers={"Content-Disposition": content_disposition_for_filename(attachment.file_name)},
        )
    except Exception as e:
        raise HTTPException(500, f"Failed to stream file: {str(e)}")
