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
from services.telegram_service import (
    notify_translator_new_ticket,
    notify_translator_assigned_to_engineers,
    notify_translator_ready_for_checkin,
)

router = APIRouter()

SOURCE_LANGUAGES = ["UZ", "RU", "ENG", "CHN"]
TARGET_LANGUAGES = ["UZ", "RU", "ENG", "CHN"]


def _is_internal_user_for_ticket(ticket: TranslatorTicket, user: User, db: Session) -> bool:
    return (
        _is_translator_admin(user, db)
        or ticket.assigned_translator_id == user.id
        or ticket.assigned_checkin_id == user.id
    )


def _final_translated_category(db: Session, ticket_id: int) -> str | None:
    """Pick which translated files are considered 'final' for the requester."""
    # Priority: admin > checkin > translator > legacy translated
    cats = ["admin", "checkin", "translator", "translated"]
    for c in cats:
        exists = (
            db.query(FileAttachment.id)
            .filter(
                FileAttachment.ticket_type == "translator",
                FileAttachment.ticket_id == ticket_id,
                FileAttachment.file_category == c,
            )
            .first()
        )
        if exists:
            return c
    return None


def _latest_final_translated_attachment_id(db: Session, ticket_id: int) -> int | None:
    """Return the single final translated attachment id visible to requester."""
    final_cat = _final_translated_category(db, ticket_id)
    if not final_cat:
        return None
    row = (
        db.query(FileAttachment.id)
        .filter(
            FileAttachment.ticket_type == "translator",
            FileAttachment.ticket_id == ticket_id,
            FileAttachment.file_category == final_cat,
        )
        .order_by(FileAttachment.created_at.desc(), FileAttachment.id.desc())
        .first()
    )
    return row[0] if row else None


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
    # Own request (requester) — before engineer roles: user may have translator + check-in roles too
    if ticket.created_by_id == user.id:
        return True
    if _is_translator_engineer(user, db) and (
        ticket.assigned_translator_id == user.id or ticket.status == "open"
    ):
        return True
    if _is_checkin_engineer(user, db) and (
        ticket.assigned_checkin_id == user.id or ticket.status == "open"
    ):
        return True
    return False


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
    # Admin sees all tickets — must run before engineer branch (admins may also have translator/check-in roles)
    if is_admin:
        pass
    elif not is_trans and not is_checkin:
        q = q.filter(TranslatorTicket.created_by_id == user.id)
    elif is_trans or is_checkin:
        # Translator and/or Check-in Engineer: assigned to them OR still open (unassigned queue)
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
            "checkin_completed_at": t.checkin_completed_at.isoformat() if getattr(t, "checkin_completed_at", None) else None,
            "admin_approved_at": t.admin_approved_at.isoformat() if getattr(t, "admin_approved_at", None) else None,
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
        "checkin_completed_at": ticket.checkin_completed_at.isoformat() if getattr(ticket, "checkin_completed_at", None) else None,
        "admin_approved_at": ticket.admin_approved_at.isoformat() if getattr(ticket, "admin_approved_at", None) else None,
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
    created_name = user.display_name or user.ldap_username
    notify_translator_new_ticket(
        db,
        ticket.id,
        ticket.title,
        ticket.source_language,
        ticket.target_language,
        created_name,
    )
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
    translator_u = db.query(User).get(d.translator_id)
    checkin_u = db.query(User).get(d.checkin_id)
    if translator_u and checkin_u:
        notify_translator_assigned_to_engineers(
            ticket.id,
            ticket.title,
            ticket.source_language,
            ticket.target_language,
            translator_u,
            checkin_u,
        )
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
    is_admin = _is_translator_admin(user, db)
    can_translator_upload = ticket.assigned_translator_id == user.id and ticket.status in ("assigned", "in_translation")
    can_checkin_upload = ticket.assigned_checkin_id == user.id and ticket.status == "in_checkin"
    can_admin_upload = is_admin and ticket.status == "in_admin_review"
    if not (can_translator_upload or can_checkin_upload or can_admin_upload):
        raise HTTPException(403, "You cannot upload translated files for this ticket in current status")
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
    if can_admin_upload:
        category = "admin"
    elif can_checkin_upload:
        category = "checkin"
    else:
        category = "translator"

    attachment = FileAttachment(
        ticket_type="translator",
        ticket_id=ticket_id,
        file_name=file.filename or "unknown",
        file_path=file_path,
        file_size=len(file_data),
        content_type=file.content_type,
        uploaded_by_id=user.id,
        file_category=category,
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
        FileAttachment.file_category.in_(["translator", "translated"]),
    ).first()
    if not has_translated:
        raise HTTPException(400, "Upload at least one translated file before submitting")
    ticket.status = "in_checkin"
    ticket.translator_submitted_at = datetime.utcnow()
    db.commit()
    if ticket.assigned_checkin_id:
        checkin_u = db.query(User).get(ticket.assigned_checkin_id)
        if checkin_u:
            notify_translator_ready_for_checkin(ticket.id, ticket.title, checkin_u)
    return {"ok": True, "status": "in_checkin"}


@router.post("/tickets/{ticket_id}/checkin-approve")
def checkin_approve(
    ticket_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Check-in Engineer: finish own review and send to Translator Admin for final approval."""
    ticket = db.query(TranslatorTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if ticket.assigned_checkin_id != user.id:
        raise HTTPException(403, "Not assigned to you")
    if ticket.status != "in_checkin":
        raise HTTPException(400, "Ticket must be in check-in phase")
    ticket.status = "in_admin_review"
    ticket.checkin_completed_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "status": "in_admin_review"}


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


@router.post("/tickets/{ticket_id}/admin-approve")
def admin_approve(
    ticket_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Translator Admin: final approval after check-in review."""
    if not _is_translator_admin(user, db):
        raise HTTPException(403, "Translator Admin only")
    ticket = db.query(TranslatorTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if ticket.status != "in_admin_review":
        raise HTTPException(400, "Ticket must be in admin review phase")
    ticket.status = "closed"
    ticket.closed_at = datetime.utcnow()
    ticket.admin_approved_at = ticket.closed_at
    db.commit()
    return {"ok": True, "status": "closed"}


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

    is_admin = _is_translator_admin(user, db)
    is_internal = _is_internal_user_for_ticket(ticket, user, db)
    is_requester_only = (ticket.created_by_id == user.id) and not is_internal and not is_admin

    q = db.query(FileAttachment).filter(
        FileAttachment.ticket_type == "translator",
        FileAttachment.ticket_id == ticket_id,
    )
    if category:
        q = q.filter(FileAttachment.file_category == category)

    # Requester-only view:
    # - before CLOSED: only originals
    # - after CLOSED: originals + final translated (admin/checkin/translator fallback)
    if is_requester_only:
        if ticket.status != "closed":
            q = q.filter(FileAttachment.file_category == "original")
        else:
            final_id = _latest_final_translated_attachment_id(db, ticket_id)
            from sqlalchemy import or_
            if final_id:
                q = q.filter(or_(FileAttachment.file_category == "original", FileAttachment.id == final_id))
            else:
                q = q.filter(FileAttachment.file_category == "original")

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
    is_admin = _is_translator_admin(user, db)
    is_internal = _is_internal_user_for_ticket(ticket, user, db)
    is_requester_only = (ticket.created_by_id == user.id) and not is_internal and not is_admin
    cat = getattr(attachment, "file_category", None)
    if is_requester_only:
        if cat != "original" and ticket.status != "closed":
            raise HTTPException(403, "Final files available only after admin approval")
        if cat != "original" and ticket.status == "closed":
            final_id = _latest_final_translated_attachment_id(db, ticket_id)
            if final_id and attachment.id != final_id:
                raise HTTPException(403, "Only final translated files are available")
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
    is_admin = _is_translator_admin(user, db)
    is_internal = _is_internal_user_for_ticket(ticket, user, db)
    is_requester_only = (ticket.created_by_id == user.id) and not is_internal and not is_admin
    cat = getattr(attachment, "file_category", None)
    if is_requester_only:
        if cat != "original" and ticket.status != "closed":
            raise HTTPException(403, "Final files available only after admin approval")
        if cat != "original" and ticket.status == "closed":
            final_id = _latest_final_translated_attachment_id(db, ticket_id)
            if final_id and attachment.id != final_id:
                raise HTTPException(403, "Only final translated files are available")
    try:
        return StreamingResponse(
            stream_object(attachment.file_path),
            media_type=attachment.content_type or "application/octet-stream",
            headers={"Content-Disposition": content_disposition_for_filename(attachment.file_name)},
        )
    except Exception as e:
        raise HTTPException(500, f"Failed to stream file: {str(e)}")
