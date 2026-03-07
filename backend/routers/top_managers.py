"""Top Managers Availability: Secretary sets at_work / not_at_work; users see list."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
from database import get_db
from auth.deps import get_current_user
from models.user import User, UserRole
from models.top_managers import TopManager, SecretaryTopManager, TopManagerAvailability, AvailabilityStatus

router = APIRouter()


class SetAvailabilityBody(BaseModel):
    status: str  # at_work | not_at_work
    comment: Optional[str] = None


def _is_secretary(user: User, db: Session) -> bool:
    return db.query(UserRole).filter(
        UserRole.user_id == user.id,
        UserRole.role_type == "secretary",
    ).first() is not None


@router.get("/availability")
def list_availability(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """All users can see Top Managers' availability."""
    top_managers = db.query(TopManager).filter(TopManager.is_active == True).all()
    result = []
    for tm in top_managers:
        latest = (
            db.query(TopManagerAvailability)
            .filter(TopManagerAvailability.top_manager_id == tm.id)
            .order_by(TopManagerAvailability.updated_at.desc())
            .first()
        )
        result.append({
            "id": tm.id,
            "name": tm.name,
            "user_id": tm.user_id,
            "status": latest.status if latest else None,
            "comment": getattr(latest, "comment", None) if latest else None,
            "updated_at": latest.updated_at.isoformat() if latest and latest.updated_at else None,
        })
    return result


@router.post("/availability/{top_manager_id}")
def set_availability(
    top_manager_id: int,
    body: SetAvailabilityBody,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not _is_secretary(user, db):
        raise HTTPException(403, "Secretary only")
    link = db.query(SecretaryTopManager).filter(
        SecretaryTopManager.secretary_id == user.id,
        SecretaryTopManager.top_manager_id == top_manager_id,
    ).first()
    if not link:
        raise HTTPException(403, "You are not assigned to this Top Manager")
    tm = db.query(TopManager).get(top_manager_id)
    if not tm:
        raise HTTPException(404, "Top Manager not found")
    status = body.status if body.status in (AvailabilityStatus.AT_WORK, AvailabilityStatus.NOT_AT_WORK) else AvailabilityStatus.NOT_AT_WORK
    comment = (body.comment or "").strip() or None
    avail = TopManagerAvailability(
        top_manager_id=top_manager_id,
        status=status,
        comment=comment,
        updated_by_id=user.id,
    )
    db.add(avail)
    db.commit()
    return {"ok": True, "status": avail.status, "comment": avail.comment}


@router.get("/my-managers")
def my_top_managers(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """For Secretary: list Top Managers linked to me (each TM listed once)."""
    if not _is_secretary(user, db):
        return []
    links = db.query(SecretaryTopManager).filter(SecretaryTopManager.secretary_id == user.id).all()
    seen = set()
    result = []
    for link in links:
        tm_id = link.top_manager.id
        if tm_id not in seen:
            seen.add(tm_id)
            result.append({
                "id": link.top_manager.id,
                "name": link.top_manager.name,
                "user_id": link.top_manager.user_id,
            })
    return result
