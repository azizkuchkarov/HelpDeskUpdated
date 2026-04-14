"""Transport Section: Daily, Overtime, Maxsus - per-ticket approver (Manager or other user), HR approval, car/driver assign."""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional
from database import get_db
from auth.deps import get_current_user
from models.user import User, UserRole
from models.department import Department
from models.transport import TransportTicket, TransportTicketType, Car, Driver
from models.file_attachment import FileAttachment
from models.ticket_comment import TicketComment
from services.minio_service import upload_file, get_presigned_url, stream_object, content_disposition_for_filename
from services.telegram_service import notify_transport_new_ticket

router = APIRouter()


def _is_transport_engineer(user: User, db: Session) -> bool:
    return db.query(UserRole).filter(
        UserRole.user_id == user.id,
        UserRole.role_type == "transport_engineer",
    ).first() is not None


def _is_hr_manager(user: User, db: Session) -> bool:
    return db.query(UserRole).filter(
        UserRole.user_id == user.id,
        UserRole.role_type == "hr_manager",
    ).first() is not None


class TransportTicketCreate(BaseModel):
    ticket_type: str  # daily, overtime, maxsus
    priority: Optional[str] = "medium"  # low, medium, high, urgent
    from_location: Optional[str] = None  # From location (where user is leaving from)
    destination: str
    start_date: Optional[str] = None  # Start date
    start_time: Optional[str] = None  # Start time (24H format)
    passenger_count: int = 1
    approximate_time: Optional[str] = None  # 30m, 1h, 1h 30m, 2h, and more
    comment: Optional[str] = None
    approver_id: Optional[int] = None  # per-ticket approver (must be from same department)
    requester_phone: Optional[str] = None


class AssignCarDriver(BaseModel):
    car_id: int
    driver_id: int


class CommentCreate(BaseModel):
    body: str


def _can_access_transport_ticket(ticket: TransportTicket, user: User, db: Session) -> bool:
    if ticket.created_by_id == user.id:
        return True
    if ticket.approver_id == user.id:
        return True
    if _is_transport_engineer(user, db):
        return True
    if _is_hr_manager(user, db):
        return True
    return False


@router.get("/cars")
def list_cars(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(Car).filter(Car.is_active == True).all()


@router.get("/drivers")
def list_drivers(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(Driver).filter(Driver.is_active == True).all()


@router.get("/tickets")
def list_tickets(
    status: Optional[str] = None,
    pending_my_approval: Optional[bool] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(TransportTicket)
    if pending_my_approval:
        # Tickets where I am explicitly selected as approver and status is open
        q = q.filter(TransportTicket.approver_id == user.id, TransportTicket.status == "open")
    elif not _is_transport_engineer(user, db) and not _is_hr_manager(user, db):
        q = q.filter(TransportTicket.created_by_id == user.id)
    if status:
        q = q.filter(TransportTicket.status == status)
    tickets = q.order_by(TransportTicket.created_at.desc()).all()
    return [
        {
            "id": t.id,
            "ticket_type": t.ticket_type,
            "priority": getattr(t, "priority", None) or "medium",
            "from_location": getattr(t, "from_location", None),
            "destination": t.destination,
            "start_date": getattr(t, "start_date", None).isoformat() if getattr(t, "start_date", None) else None,
            "start_time": getattr(t, "start_time", None),
            "passenger_count": t.passenger_count,
            "approximate_time": getattr(t, "approximate_time", None),
            "comment": t.comment,
            "status": t.status,
            "created_by_id": t.created_by_id,
            "created_by_name": t.created_by.display_name or t.created_by.ldap_username,
            "requester_phone": getattr(t, "requester_phone", None),
            "approver_id": t.approver_id,
            "approver_name": t.approver.display_name or t.approver.ldap_username if t.approver else None,
            "manager_approved_at": t.manager_approved_at.isoformat() if t.manager_approved_at else None,
            "hr_approved_at": t.hr_approved_at.isoformat() if t.hr_approved_at else None,
            "car_id": t.car_id,
            "driver_id": t.driver_id,
            "car_name": t.car.name if t.car else None,
            "driver_name": t.driver.name if t.driver else None,
            "driver_phone": t.driver.phone if t.driver else None,
            "ready_at": t.ready_at.isoformat() if t.ready_at else None,
            "closed_at": t.closed_at.isoformat() if t.closed_at else None,
            "created_at": t.created_at.isoformat() if t.created_at else None,
        }
        for t in tickets
    ]


@router.get("/approvers")
def list_approvers(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """
    List possible approvers for the current user:
    - If current user IS the Department Manager → return only themselves
    - If current user is NOT the manager → return all active users in the department
    """
    if user.department_id is None:
        return []
    dept = db.query(Department).get(user.department_id)
    if not dept:
        return []
    
    # Check if current user is the Department Manager
    is_current_user_manager = dept.manager_id == user.id
    
    if is_current_user_manager:
        # Manager can only select themselves as approver
        return [
            {
                "id": user.id,
                "display_name": user.display_name or user.ldap_username,
                "is_manager": True,
            }
        ]
    else:
        # Regular user: show all active users in the department
        users_q = db.query(User).filter(
            User.is_active == True,
            User.department_id == user.department_id,
        )
        users_list = list(users_q.all())
        # Sort: manager first, then by display_name / ldap_username
        def sort_key(u: User):
            is_manager = 0
            if dept.manager_id and u.id == dept.manager_id:
                is_manager = -1
            name = (u.display_name or u.ldap_username or "").lower()
            return (is_manager, name)

        users_list.sort(key=sort_key)
        return [
            {
                "id": u.id,
                "display_name": u.display_name or u.ldap_username,
                "is_manager": bool(dept.manager_id and u.id == dept.manager_id),
            }
            for u in users_list
        ]


@router.post("/tickets")
def create_ticket(d: TransportTicketCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    priority = (d.priority or "medium").lower() if d.priority else "medium"
    if priority not in ("low", "medium", "high", "urgent"):
        priority = "medium"
    # Validate approver (must be in same department as creator, if provided)
    approver_id: Optional[int] = None
    if d.approver_id is not None:
        approver = db.query(User).get(d.approver_id)
        if not approver or not approver.is_active:
            raise HTTPException(400, "Approver not found or inactive")
        if user.department_id is None or approver.department_id != user.department_id:
            raise HTTPException(400, "Approver must be from your department")
        approver_id = approver.id

    phone = (d.requester_phone or "").strip() or None
    if phone:
        user.phone_number = phone
    ticket = TransportTicket(
        ticket_type=d.ticket_type,
        priority=priority,
        from_location=d.from_location,
        destination=d.destination,
        start_date=datetime.fromisoformat(d.start_date.replace("Z", "")) if d.start_date else None,
        start_time=d.start_time,
        passenger_count=d.passenger_count,
        approximate_time=d.approximate_time,
        comment=d.comment,
        created_by_id=user.id,
        requester_phone=phone or user.phone_number,
        approver_id=approver_id,
        status="open",
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    created_by_name = ticket.created_by.display_name or ticket.created_by.ldap_username
    notify_transport_new_ticket(
        db=db,
        ticket_id=ticket.id,
        ticket_type=str(ticket.ticket_type),
        destination=ticket.destination,
        priority=ticket.priority or "medium",
        created_by_name=created_by_name,
    )
    return {"id": ticket.id, "status": "open", "message": "Ticket created"}


@router.post("/tickets/{ticket_id}/manager-approve")
def manager_approve(ticket_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ticket = db.query(TransportTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if ticket.approver_id != user.id:
        raise HTTPException(403, "You are not the approver for this ticket")
    ticket.status = "manager_approved"
    ticket.manager_approved_at = datetime.utcnow()
    if ticket.ticket_type == TransportTicketType.DAILY:
        ticket.status = "approved"  # Daily only needs manager
    db.commit()
    return {"ok": True, "status": ticket.status}


@router.post("/tickets/{ticket_id}/hr-approve")
def hr_approve(ticket_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not _is_hr_manager(user, db):
        raise HTTPException(403, "HR Manager only")
    ticket = db.query(TransportTicket).get(ticket_id)
    if not ticket or ticket.status != "manager_approved":
        raise HTTPException(404, "Ticket not found or Manager not yet approved")
    ticket.status = "hr_approved"
    ticket.hr_approved_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "status": "hr_approved"}


@router.post("/tickets/{ticket_id}/assign")
def assign_car_driver(
    ticket_id: int,
    d: AssignCarDriver,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not _is_transport_engineer(user, db):
        raise HTTPException(403, "Transport Engineer only")
    ticket = db.query(TransportTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    need_hr = ticket.ticket_type in (TransportTicketType.OVERTIME, TransportTicketType.MAXSUS)
    if need_hr and ticket.status != "hr_approved":
        raise HTTPException(400, "HR approval required first for Overtime/Maxsus")
    if not need_hr and ticket.status not in ("open", "manager_approved", "approved"):
        raise HTTPException(400, "Invalid status")
    ticket.car_id = d.car_id
    ticket.driver_id = d.driver_id
    ticket.status = "assigned"
    ticket.ready_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "status": "assigned", "ready_at": ticket.ready_at.isoformat()}


@router.post("/tickets/{ticket_id}/driver-returned")
def driver_returned(ticket_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not _is_transport_engineer(user, db):
        raise HTTPException(403, "Transport Engineer only")
    ticket = db.query(TransportTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    ticket.driver_returned_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.post("/tickets/{ticket_id}/close-by-engineer")
def close_by_engineer(ticket_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not _is_transport_engineer(user, db):
        raise HTTPException(403, "Transport Engineer only")
    ticket = db.query(TransportTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    ticket.status = "closed"
    ticket.closed_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "status": "closed"}


@router.post("/tickets/{ticket_id}/confirm-by-user")
def confirm_by_user(ticket_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    ticket = db.query(TransportTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if ticket.created_by_id != user.id:
        raise HTTPException(403, "Not your ticket")
    ticket.confirmed_by_user_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


@router.get("/tickets/{ticket_id}/comments")
def list_comments(
    ticket_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List comments on a Transport ticket. Same access as viewing the ticket."""
    ticket = db.query(TransportTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if not _can_access_transport_ticket(ticket, user, db):
        raise HTTPException(403, "Access denied")
    comments = (
        db.query(TicketComment)
        .filter(TicketComment.ticket_type == "transport", TicketComment.ticket_id == ticket_id)
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
    ticket = db.query(TransportTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if not _can_access_transport_ticket(ticket, user, db):
        raise HTTPException(403, "Access denied")
    body = (d.body or "").strip()
    if not body:
        raise HTTPException(400, "Comment body is required")
    comment = TicketComment(
        ticket_type="transport",
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
    """Upload a file to a Transport ticket. User must have access to the ticket."""
    ticket = db.query(TransportTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    # Check access: creator, assigned engineer, or transport engineer
    is_transport_engineer = _is_transport_engineer(user, db)
    if ticket.created_by_id != user.id and not is_transport_engineer:
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
            folder=f"transport/{ticket_id}",
        )
    except Exception as e:
        raise HTTPException(500, f"Failed to upload file: {str(e)}")
    
    # Save attachment record
    attachment = FileAttachment(
        ticket_type="transport",
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
    """List files attached to a Transport ticket."""
    ticket = db.query(TransportTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    # Check access: creator, assigned engineer, or transport engineer
    is_transport_engineer = _is_transport_engineer(user, db)
    if ticket.created_by_id != user.id and not is_transport_engineer:
        raise HTTPException(403, "Access denied")
    
    attachments = db.query(FileAttachment).filter(
        FileAttachment.ticket_type == "transport",
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
    """Get download URL for a file attached to a Transport ticket."""
    ticket = db.query(TransportTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    # Check access: creator, assigned engineer, or transport engineer
    is_transport_engineer = _is_transport_engineer(user, db)
    if ticket.created_by_id != user.id and not is_transport_engineer:
        raise HTTPException(403, "Access denied")
    
    attachment = db.query(FileAttachment).filter(
        FileAttachment.id == file_id,
        FileAttachment.ticket_type == "transport",
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
    ticket = db.query(TransportTicket).get(ticket_id)
    if not ticket:
        raise HTTPException(404, "Ticket not found")
    if ticket.created_by_id != user.id and not _is_transport_engineer(user, db):
        raise HTTPException(403, "Access denied")
    attachment = db.query(FileAttachment).filter(
        FileAttachment.id == file_id,
        FileAttachment.ticket_type == "transport",
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
