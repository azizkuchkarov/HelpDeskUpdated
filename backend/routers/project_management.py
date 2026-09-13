"""IT Project Management: projects, members, change/bug requests."""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload
from datetime import datetime, date
from typing import Optional
from database import get_db
from auth.deps import get_current_user
from models.user import User, UserRole
from models.project_management import (
    ITProject,
    ProjectMember,
    ProjectRequest,
    TesterTask,
    PMTeamInfo,
    PMModuleSettings,
)
from models.ticket_comment import TicketComment
from models.file_attachment import FileAttachment
from services.minio_service import upload_file, get_presigned_url, stream_object, content_disposition_for_filename
from services.telegram_service import (
    notify_pm_new_request,
    notify_pm_request_taken,
    notify_pm_request_closed,
)

router = APIRouter()

TICKET_TYPE = "project_request"
VALID_PROJECT_STATUSES = {"active", "on_hold", "completed"}
VALID_PRIORITIES = {"low", "medium", "high", "urgent"}
VALID_REQUEST_TYPES = {"change_request", "bug_report"}
VALID_MEMBER_ROLES = {"coder", "tester"}


def _has_role(user: User, db: Session, role_type: str) -> bool:
    return (
        db.query(UserRole)
        .filter(UserRole.user_id == user.id, UserRole.role_type == role_type)
        .first()
        is not None
    )


def _is_global_admin(user: User, db: Session) -> bool:
    return _has_role(user, db, "global_admin")


def _is_pm_manager(user: User, db: Session) -> bool:
    return _has_role(user, db, "pm_manager") or _is_global_admin(user, db)


def _is_team_leader(user: User, db: Session) -> bool:
    return _has_role(user, db, "pm_team_leader") or _is_global_admin(user, db)


def _is_deadline_monitor(user: User, db: Session) -> bool:
    return _has_role(user, db, "pm_deadline_monitor") or _is_global_admin(user, db)


def _is_pm_coder(user: User, db: Session) -> bool:
    return _has_role(user, db, "pm_coder")


def _is_project_coder(project_id: int, user_id: int, db: Session) -> bool:
    return (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
            ProjectMember.member_role == "coder",
        )
        .first()
        is not None
    )


def _is_project_tester(project_id: int, user_id: int, db: Session) -> bool:
    return (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
            ProjectMember.member_role == "tester",
        )
        .first()
        is not None
    )


def _user_name(u: Optional[User]) -> Optional[str]:
    if not u:
        return None
    return u.display_name or u.ldap_username


def _parse_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        raise HTTPException(400, "Invalid date format (use YYYY-MM-DD)")


def _normalize_url(value: Optional[str]) -> Optional[str]:
    url = (value or "").strip()
    if not url:
        return None
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    return url[:1000]


def _member_dict(m: ProjectMember) -> dict:
    return {
        "id": m.id,
        "project_id": m.project_id,
        "user_id": m.user_id,
        "user_name": _user_name(m.user),
        "member_role": m.member_role,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


def _project_dict(p: ITProject, include_members: bool = False) -> dict:
    data = {
        "id": p.id,
        "name": p.name,
        "description": p.description,
        "info": p.info,
        "external_url": p.external_url,
        "status": p.status,
        "created_by_id": p.created_by_id,
        "created_by_name": _user_name(p.created_by),
        "deadline": p.deadline.isoformat() if p.deadline else None,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }
    if include_members:
        data["members"] = [_member_dict(m) for m in (p.members or [])]
        data["coder_count"] = sum(1 for m in (p.members or []) if m.member_role == "coder")
        data["tester_count"] = sum(1 for m in (p.members or []) if m.member_role == "tester")
    return data


def _request_dict(r: ProjectRequest) -> dict:
    return {
        "id": r.id,
        "project_id": r.project_id,
        "project_name": r.project.name if r.project else None,
        "title": r.title,
        "description": r.description,
        "request_type": r.request_type,
        "status": r.status,
        "priority": r.priority,
        "created_by_id": r.created_by_id,
        "created_by_name": _user_name(r.created_by),
        "assigned_coder_id": r.assigned_coder_id,
        "assigned_coder_name": _user_name(r.assigned_coder),
        "tester_task_id": r.tester_task_id,
        "deadline": r.deadline.isoformat() if r.deadline else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        "closed_at": r.closed_at.isoformat() if r.closed_at else None,
        "confirmed_at": r.confirmed_at.isoformat() if r.confirmed_at else None,
        "is_overdue": bool(
            r.deadline
            and r.status not in ("closed",)
            and r.deadline < date.today()
        ),
    }


def _tester_task_dict(task: TesterTask) -> dict:
    return {
        "id": task.id,
        "project_id": task.project_id,
        "title": task.title,
        "description": task.description,
        "status": task.status,
        "created_by_id": task.created_by_id,
        "created_by_name": _user_name(task.created_by),
        "assigned_tester_id": task.assigned_tester_id,
        "assigned_tester_name": _user_name(task.assigned_tester),
        "created_at": task.created_at.isoformat() if task.created_at else None,
        "updated_at": task.updated_at.isoformat() if task.updated_at else None,
        "done_at": task.done_at.isoformat() if task.done_at else None,
    }


def _team_info_dict(row: PMTeamInfo) -> dict:
    photo_url = None
    if row.photo_path:
        try:
            photo_url = get_presigned_url(row.photo_path, expires_seconds=3600)
        except Exception:
            photo_url = None
    return {
        "id": row.id,
        "role_type": row.role_type,
        "user_id": row.user_id,
        "user_name": _user_name(row.user) if row.user else None,
        "display_name": row.display_name,
        "title": row.title,
        "description": row.description,
        "photo_url": photo_url,
        "has_photo": bool(row.photo_path),
        "sort_order": row.sort_order or 0,
        "is_active": bool(row.is_active),
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


# --- Schemas ---
class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    info: Optional[str] = None
    external_url: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    info: Optional[str] = None
    external_url: Optional[str] = None
    status: Optional[str] = None
    deadline: Optional[str] = None
    clear_deadline: Optional[bool] = None


class MemberCreate(BaseModel):
    user_id: int
    member_role: str  # coder | tester


class RequestCreate(BaseModel):
    project_id: int
    title: str
    description: Optional[str] = None
    request_type: str = "change_request"
    priority: str = "medium"
    tester_task_id: Optional[int] = None


class RequestDeadlineUpdate(BaseModel):
    deadline: Optional[str] = None
    clear_deadline: Optional[bool] = None


class CommentCreate(BaseModel):
    body: str


class TesterTaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    assigned_tester_id: int


class TesterTaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    assigned_tester_id: Optional[int] = None


class TeamInfoCreate(BaseModel):
    role_type: str
    display_name: str
    title: Optional[str] = None
    description: Optional[str] = None
    user_id: Optional[int] = None
    sort_order: Optional[int] = 0


class TeamInfoUpdate(BaseModel):
    role_type: Optional[str] = None
    display_name: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    user_id: Optional[int] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class ModuleSettingsUpdate(BaseModel):
    intro_title: Optional[str] = None
    intro_body: Optional[str] = None


VALID_TEAM_ROLES = {
    "pm_manager",
    "pm_team_leader",
    "pm_deadline_monitor",
    "pm_coder",
    "pm_tester",
}
VALID_TESTER_TASK_STATUSES = {"open", "in_testing", "done"}


# --- Helpers lists ---
@router.get("/coders")
def list_coders(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    users = (
        db.query(User)
        .join(UserRole, UserRole.user_id == User.id)
        .filter(User.is_active == True, UserRole.role_type == "pm_coder")  # noqa: E712
        .distinct()
        .order_by(User.display_name, User.ldap_username)
        .all()
    )
    return [{"id": u.id, "display_name": _user_name(u), "ldap_username": u.ldap_username} for u in users]


@router.get("/testers")
def list_testers(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    users = (
        db.query(User)
        .join(UserRole, UserRole.user_id == User.id)
        .filter(User.is_active == True, UserRole.role_type == "pm_tester")  # noqa: E712
        .distinct()
        .order_by(User.display_name, User.ldap_username)
        .all()
    )
    return [{"id": u.id, "display_name": _user_name(u), "ldap_username": u.ldap_username} for u in users]


# --- Projects ---
@router.get("/projects")
def list_projects(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = (
        db.query(ITProject)
        .options(
            joinedload(ITProject.created_by),
            joinedload(ITProject.members).joinedload(ProjectMember.user),
        )
        .order_by(ITProject.created_at.desc())
    )
    if status:
        q = q.filter(ITProject.status == status)
    projects = q.all()
    return [_project_dict(p, include_members=True) for p in projects]


@router.post("/projects")
def create_project(
    d: ProjectCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not _is_pm_manager(user, db):
        raise HTTPException(403, "Project Manager only")
    name = (d.name or "").strip()
    if not name:
        raise HTTPException(400, "Name is required")
    p = ITProject(
        name=name,
        description=(d.description or "").strip() or None,
        info=(d.info or "").strip() or None,
        external_url=_normalize_url(d.external_url),
        status="active",
        created_by_id=user.id,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    p = (
        db.query(ITProject)
        .options(
            joinedload(ITProject.created_by),
            joinedload(ITProject.members).joinedload(ProjectMember.user),
        )
        .get(p.id)
    )
    return _project_dict(p, include_members=True)


@router.get("/projects/{project_id}")
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    p = (
        db.query(ITProject)
        .options(
            joinedload(ITProject.created_by),
            joinedload(ITProject.members).joinedload(ProjectMember.user),
        )
        .get(project_id)
    )
    if not p:
        raise HTTPException(404, "Project not found")
    return _project_dict(p, include_members=True)


@router.patch("/projects/{project_id}")
def update_project(
    project_id: int,
    d: ProjectUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    p = db.query(ITProject).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")

    is_manager = _is_pm_manager(user, db)
    is_monitor = _is_deadline_monitor(user, db)

    if (
        d.name is not None
        or d.description is not None
        or d.info is not None
        or d.external_url is not None
        or d.status is not None
    ):
        if not is_manager:
            raise HTTPException(403, "Project Manager only")
        if d.name is not None:
            name = d.name.strip()
            if not name:
                raise HTTPException(400, "Name is required")
            p.name = name
        if d.description is not None:
            p.description = d.description.strip() or None
        if d.info is not None:
            p.info = d.info.strip() or None
        if d.external_url is not None:
            p.external_url = _normalize_url(d.external_url) if d.external_url.strip() else None
        if d.status is not None:
            if d.status not in VALID_PROJECT_STATUSES:
                raise HTTPException(400, f"Invalid status. Use: {', '.join(VALID_PROJECT_STATUSES)}")
            p.status = d.status

    if d.deadline is not None or d.clear_deadline:
        if not is_monitor and not is_manager:
            raise HTTPException(403, "Deadline Monitor or Project Manager only")
        if d.clear_deadline:
            p.deadline = None
        elif d.deadline is not None:
            p.deadline = _parse_date(d.deadline) if d.deadline else None

    p.updated_at = datetime.utcnow()
    db.commit()
    p = (
        db.query(ITProject)
        .options(
            joinedload(ITProject.created_by),
            joinedload(ITProject.members).joinedload(ProjectMember.user),
        )
        .get(project_id)
    )
    return _project_dict(p, include_members=True)


# --- Members ---
@router.post("/projects/{project_id}/members")
def add_member(
    project_id: int,
    d: MemberCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    p = db.query(ITProject).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    if d.member_role not in VALID_MEMBER_ROLES:
        raise HTTPException(400, "member_role must be coder or tester")

    target = db.query(User).get(d.user_id)
    if not target or not target.is_active:
        raise HTTPException(400, "Invalid user")

    if d.member_role == "coder":
        if not _is_team_leader(user, db):
            raise HTTPException(403, "Team Leader only")
        if not _has_role(target, db, "pm_coder"):
            raise HTTPException(400, "User must have pm_coder role")
    else:
        if not (_is_project_coder(project_id, user.id, db) or _is_team_leader(user, db) or _is_global_admin(user, db)):
            raise HTTPException(403, "Project coder only")
        if not _has_role(target, db, "pm_tester"):
            raise HTTPException(400, "User must have pm_tester role")

    existing = (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == d.user_id,
            ProjectMember.member_role == d.member_role,
        )
        .first()
    )
    if existing:
        raise HTTPException(400, "Member already assigned with this role")

    m = ProjectMember(project_id=project_id, user_id=d.user_id, member_role=d.member_role)
    db.add(m)
    db.commit()
    db.refresh(m)
    m = (
        db.query(ProjectMember)
        .options(joinedload(ProjectMember.user))
        .get(m.id)
    )
    return _member_dict(m)


@router.delete("/projects/{project_id}/members/{member_id}")
def remove_member(
    project_id: int,
    member_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = (
        db.query(ProjectMember)
        .filter(ProjectMember.id == member_id, ProjectMember.project_id == project_id)
        .first()
    )
    if not m:
        raise HTTPException(404, "Member not found")

    if m.member_role == "coder":
        if not _is_team_leader(user, db):
            raise HTTPException(403, "Team Leader only")
    else:
        if not (_is_project_coder(project_id, user.id, db) or _is_team_leader(user, db) or _is_global_admin(user, db)):
            raise HTTPException(403, "Project coder only")

    db.delete(m)
    db.commit()
    return {"ok": True}


# --- Requests ---
@router.get("/requests")
def list_requests(
    project_id: Optional[int] = None,
    status: Optional[str] = None,
    mine: Optional[bool] = None,
    assigned_to_me: Optional[bool] = None,
    overdue: Optional[bool] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = (
        db.query(ProjectRequest)
        .options(
            joinedload(ProjectRequest.project),
            joinedload(ProjectRequest.created_by),
            joinedload(ProjectRequest.assigned_coder),
        )
        .order_by(ProjectRequest.created_at.desc())
    )
    if project_id is not None:
        q = q.filter(ProjectRequest.project_id == project_id)
    if status:
        q = q.filter(ProjectRequest.status == status)
    if mine:
        q = q.filter(ProjectRequest.created_by_id == user.id)
    if assigned_to_me:
        q = q.filter(ProjectRequest.assigned_coder_id == user.id)
    if overdue:
        q = q.filter(
            ProjectRequest.deadline.isnot(None),
            ProjectRequest.deadline < date.today(),
            ProjectRequest.status != "closed",
        )
    return [_request_dict(r) for r in q.all()]


@router.get("/requests/{request_id}")
def get_request(
    request_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = (
        db.query(ProjectRequest)
        .options(
            joinedload(ProjectRequest.project),
            joinedload(ProjectRequest.created_by),
            joinedload(ProjectRequest.assigned_coder),
        )
        .get(request_id)
    )
    if not r:
        raise HTTPException(404, "Request not found")
    return _request_dict(r)


@router.post("/requests")
def create_request(
    d: RequestCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    p = db.query(ITProject).get(d.project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    if p.status == "completed":
        raise HTTPException(400, "Cannot create requests on completed projects")

    request_type = d.request_type or "change_request"
    if request_type not in VALID_REQUEST_TYPES:
        raise HTTPException(400, "Invalid request_type")
    if request_type == "bug_report":
        if not _is_project_tester(d.project_id, user.id, db):
            raise HTTPException(403, "Only project testers can create bug reports")
    # change_request: any authenticated user

    priority = d.priority or "medium"
    if priority not in VALID_PRIORITIES:
        raise HTTPException(400, "Invalid priority")
    title = (d.title or "").strip()
    if not title:
        raise HTTPException(400, "Title is required")

    tester_task_id = d.tester_task_id
    if tester_task_id is not None:
        task = db.query(TesterTask).get(tester_task_id)
        if not task or task.project_id != d.project_id:
            raise HTTPException(400, "Invalid tester_task_id")
        if request_type != "bug_report":
            raise HTTPException(400, "tester_task_id only allowed for bug_report")
        if task.assigned_tester_id != user.id and not _is_global_admin(user, db):
            raise HTTPException(403, "Only assigned tester can report bugs for this task")

    r = ProjectRequest(
        project_id=d.project_id,
        title=title,
        description=(d.description or "").strip() or None,
        request_type=request_type,
        status="open",
        priority=priority,
        created_by_id=user.id,
        tester_task_id=tester_task_id,
    )
    db.add(r)
    db.commit()
    db.refresh(r)

    try:
        notify_pm_new_request(
            db,
            request_id=r.id,
            project_id=p.id,
            project_name=p.name,
            title=r.title,
            request_type=r.request_type,
            priority=r.priority,
            created_by_name=_user_name(user) or "",
        )
    except Exception:
        pass

    r = (
        db.query(ProjectRequest)
        .options(
            joinedload(ProjectRequest.project),
            joinedload(ProjectRequest.created_by),
            joinedload(ProjectRequest.assigned_coder),
        )
        .get(r.id)
    )
    return _request_dict(r)


@router.post("/requests/{request_id}/take")
def take_request(
    request_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = db.query(ProjectRequest).get(request_id)
    if not r:
        raise HTTPException(404, "Request not found")
    if r.status != "open":
        raise HTTPException(400, "Only open requests can be taken")
    if not _is_project_coder(r.project_id, user.id, db):
        raise HTTPException(403, "Only project coders can take requests")

    r.assigned_coder_id = user.id
    r.status = "in_progress"
    r.updated_at = datetime.utcnow()
    db.commit()

    try:
        notify_pm_request_taken(
            db,
            request_id=r.id,
            title=r.title,
            coder=user,
            created_by_id=r.created_by_id,
        )
    except Exception:
        pass

    r = (
        db.query(ProjectRequest)
        .options(
            joinedload(ProjectRequest.project),
            joinedload(ProjectRequest.created_by),
            joinedload(ProjectRequest.assigned_coder),
        )
        .get(request_id)
    )
    return _request_dict(r)


@router.post("/requests/{request_id}/close")
def close_request(
    request_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = db.query(ProjectRequest).get(request_id)
    if not r:
        raise HTTPException(404, "Request not found")
    if r.status != "in_progress":
        raise HTTPException(400, "Only in-progress requests can be closed by coder")
    if r.assigned_coder_id != user.id and not _is_global_admin(user, db):
        raise HTTPException(403, "Only assigned coder can close")

    r.status = "closed_by_coder"
    r.closed_at = datetime.utcnow()
    r.updated_at = datetime.utcnow()
    db.commit()

    try:
        notify_pm_request_closed(
            db,
            request_id=r.id,
            title=r.title,
            created_by_id=r.created_by_id,
        )
    except Exception:
        pass

    r = (
        db.query(ProjectRequest)
        .options(
            joinedload(ProjectRequest.project),
            joinedload(ProjectRequest.created_by),
            joinedload(ProjectRequest.assigned_coder),
        )
        .get(request_id)
    )
    return _request_dict(r)


@router.post("/requests/{request_id}/confirm")
def confirm_request(
    request_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = db.query(ProjectRequest).get(request_id)
    if not r:
        raise HTTPException(404, "Request not found")
    if r.status != "closed_by_coder":
        raise HTTPException(400, "Request must be closed by coder first")
    if r.created_by_id != user.id and not _is_global_admin(user, db):
        raise HTTPException(403, "Only requester can confirm")

    r.status = "closed"
    r.confirmed_at = datetime.utcnow()
    r.updated_at = datetime.utcnow()
    db.commit()
    r = (
        db.query(ProjectRequest)
        .options(
            joinedload(ProjectRequest.project),
            joinedload(ProjectRequest.created_by),
            joinedload(ProjectRequest.assigned_coder),
        )
        .get(request_id)
    )
    return _request_dict(r)


@router.post("/requests/{request_id}/reopen")
def reopen_request(
    request_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = db.query(ProjectRequest).get(request_id)
    if not r:
        raise HTTPException(404, "Request not found")
    if r.status != "closed_by_coder":
        raise HTTPException(400, "Only closed-by-coder requests can be reopened")
    if r.created_by_id != user.id and not _is_global_admin(user, db):
        raise HTTPException(403, "Only requester can reopen")

    r.status = "in_progress"
    r.closed_at = None
    r.updated_at = datetime.utcnow()
    db.commit()
    r = (
        db.query(ProjectRequest)
        .options(
            joinedload(ProjectRequest.project),
            joinedload(ProjectRequest.created_by),
            joinedload(ProjectRequest.assigned_coder),
        )
        .get(request_id)
    )
    return _request_dict(r)


@router.patch("/requests/{request_id}/deadline")
def set_request_deadline(
    request_id: int,
    d: RequestDeadlineUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not _is_deadline_monitor(user, db):
        raise HTTPException(403, "Deadline Monitor only")
    r = db.query(ProjectRequest).get(request_id)
    if not r:
        raise HTTPException(404, "Request not found")
    if d.clear_deadline:
        r.deadline = None
    elif d.deadline is not None:
        r.deadline = _parse_date(d.deadline) if d.deadline else None
    r.updated_at = datetime.utcnow()
    db.commit()
    r = (
        db.query(ProjectRequest)
        .options(
            joinedload(ProjectRequest.project),
            joinedload(ProjectRequest.created_by),
            joinedload(ProjectRequest.assigned_coder),
        )
        .get(request_id)
    )
    return _request_dict(r)


# --- Monitoring summary ---
@router.get("/monitoring")
def monitoring_summary(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not _is_deadline_monitor(user, db):
        raise HTTPException(403, "Deadline Monitor only")

    today = date.today()
    projects = (
        db.query(ITProject)
        .options(joinedload(ITProject.created_by), joinedload(ITProject.members))
        .filter(ITProject.status != "completed")
        .all()
    )
    requests = (
        db.query(ProjectRequest)
        .options(
            joinedload(ProjectRequest.project),
            joinedload(ProjectRequest.created_by),
            joinedload(ProjectRequest.assigned_coder),
        )
        .filter(ProjectRequest.status != "closed")
        .order_by(ProjectRequest.created_at.desc())
        .all()
    )

    overdue_projects = [
        _project_dict(p, include_members=True)
        for p in projects
        if p.deadline and p.deadline < today
    ]
    overdue_requests = [
        _request_dict(r)
        for r in requests
        if r.deadline and r.deadline < today
    ]
    open_count = sum(1 for r in requests if r.status == "open")
    in_progress_count = sum(1 for r in requests if r.status == "in_progress")
    closed_by_coder_count = sum(1 for r in requests if r.status == "closed_by_coder")

    return {
        "counts": {
            "open": open_count,
            "in_progress": in_progress_count,
            "closed_by_coder": closed_by_coder_count,
            "overdue_projects": len(overdue_projects),
            "overdue_requests": len(overdue_requests),
            "active_projects": len(projects),
        },
        "overdue_projects": overdue_projects,
        "overdue_requests": overdue_requests,
        "open_requests": [_request_dict(r) for r in requests if r.status == "open"],
        "in_progress_requests": [_request_dict(r) for r in requests if r.status == "in_progress"],
    }


# --- Comments ---
@router.get("/requests/{request_id}/comments")
def list_comments(
    request_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = db.query(ProjectRequest).get(request_id)
    if not r:
        raise HTTPException(404, "Request not found")
    comments = (
        db.query(TicketComment)
        .options(joinedload(TicketComment.author))
        .filter(TicketComment.ticket_type == TICKET_TYPE, TicketComment.ticket_id == request_id)
        .order_by(TicketComment.created_at)
        .all()
    )
    return [
        {
            "id": c.id,
            "author_id": c.author_id,
            "author_name": _user_name(c.author),
            "body": c.body,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in comments
    ]


@router.post("/requests/{request_id}/comments")
def add_comment(
    request_id: int,
    d: CommentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = db.query(ProjectRequest).get(request_id)
    if not r:
        raise HTTPException(404, "Request not found")
    body = (d.body or "").strip()
    if not body:
        raise HTTPException(400, "Comment body is required")
    comment = TicketComment(
        ticket_type=TICKET_TYPE,
        ticket_id=request_id,
        author_id=user.id,
        body=body,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return {
        "id": comment.id,
        "author_id": comment.author_id,
        "author_name": _user_name(user),
        "body": comment.body,
        "created_at": comment.created_at.isoformat() if comment.created_at else None,
    }


# --- Files ---
@router.post("/requests/{request_id}/files")
async def upload_request_file(
    request_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = db.query(ProjectRequest).get(request_id)
    if not r:
        raise HTTPException(404, "Request not found")
    file_data = await file.read()
    if len(file_data) == 0:
        raise HTTPException(400, "File is empty")
    try:
        file_path = upload_file(
            file_data=file_data,
            content_type=file.content_type or "application/octet-stream",
            folder=f"project_request/{request_id}",
        )
    except Exception as e:
        raise HTTPException(500, f"Failed to upload file: {str(e)}")
    attachment = FileAttachment(
        ticket_type=TICKET_TYPE,
        ticket_id=request_id,
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
        "uploaded_by_name": _user_name(user),
        "created_at": attachment.created_at.isoformat() if attachment.created_at else None,
    }


@router.get("/requests/{request_id}/files")
def list_request_files(
    request_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = db.query(ProjectRequest).get(request_id)
    if not r:
        raise HTTPException(404, "Request not found")
    attachments = (
        db.query(FileAttachment)
        .options(joinedload(FileAttachment.uploaded_by))
        .filter(FileAttachment.ticket_type == TICKET_TYPE, FileAttachment.ticket_id == request_id)
        .order_by(FileAttachment.created_at.desc())
        .all()
    )
    return [
        {
            "id": a.id,
            "file_name": a.file_name,
            "file_size": a.file_size,
            "content_type": a.content_type,
            "uploaded_by_name": _user_name(a.uploaded_by),
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in attachments
    ]


@router.get("/requests/{request_id}/files/{file_id}/download")
def download_request_file(
    request_id: int,
    file_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = db.query(ProjectRequest).get(request_id)
    if not r:
        raise HTTPException(404, "Request not found")
    attachment = (
        db.query(FileAttachment)
        .filter(
            FileAttachment.id == file_id,
            FileAttachment.ticket_type == TICKET_TYPE,
            FileAttachment.ticket_id == request_id,
        )
        .first()
    )
    if not attachment:
        raise HTTPException(404, "File not found")
    try:
        return {"download_url": get_presigned_url(attachment.file_path, expires_seconds=3600)}
    except Exception as e:
        raise HTTPException(500, f"Failed to generate download URL: {str(e)}")


@router.get("/requests/{request_id}/files/{file_id}/file")
def stream_request_file(
    request_id: int,
    file_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = db.query(ProjectRequest).get(request_id)
    if not r:
        raise HTTPException(404, "Request not found")
    attachment = (
        db.query(FileAttachment)
        .filter(
            FileAttachment.id == file_id,
            FileAttachment.ticket_type == TICKET_TYPE,
            FileAttachment.ticket_id == request_id,
        )
        .first()
    )
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


# --- Information (module intro + team cards) ---
@router.get("/information")
def get_information(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    settings = db.query(PMModuleSettings).order_by(PMModuleSettings.id).first()
    team = (
        db.query(PMTeamInfo)
        .options(joinedload(PMTeamInfo.user))
        .filter(PMTeamInfo.is_active == 1)
        .order_by(PMTeamInfo.sort_order, PMTeamInfo.id)
        .all()
    )
    return {
        "intro_title": settings.intro_title if settings else None,
        "intro_body": settings.intro_body if settings else None,
        "team": [_team_info_dict(row) for row in team],
    }


@router.put("/information/settings")
def update_module_settings(
    d: ModuleSettingsUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not _is_global_admin(user, db):
        raise HTTPException(403, "Global Admin only")
    settings = db.query(PMModuleSettings).order_by(PMModuleSettings.id).first()
    if not settings:
        settings = PMModuleSettings()
        db.add(settings)
    if d.intro_title is not None:
        settings.intro_title = d.intro_title.strip() or None
    if d.intro_body is not None:
        settings.intro_body = d.intro_body.strip() or None
    settings.updated_by_id = user.id
    settings.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(settings)
    return {
        "intro_title": settings.intro_title,
        "intro_body": settings.intro_body,
    }


@router.get("/information/team")
def list_team_info(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(PMTeamInfo).options(joinedload(PMTeamInfo.user))
    if not include_inactive or not _is_global_admin(user, db):
        q = q.filter(PMTeamInfo.is_active == 1)
    rows = q.order_by(PMTeamInfo.sort_order, PMTeamInfo.id).all()
    return [_team_info_dict(row) for row in rows]


@router.post("/information/team")
def create_team_info(
    d: TeamInfoCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not _is_global_admin(user, db):
        raise HTTPException(403, "Global Admin only")
    if d.role_type not in VALID_TEAM_ROLES:
        raise HTTPException(400, f"Invalid role_type. Use: {', '.join(sorted(VALID_TEAM_ROLES))}")
    name = (d.display_name or "").strip()
    if not name:
        raise HTTPException(400, "display_name is required")
    if d.user_id is not None:
        u = db.query(User).get(d.user_id)
        if not u:
            raise HTTPException(400, "Invalid user_id")
    row = PMTeamInfo(
        role_type=d.role_type,
        display_name=name,
        title=(d.title or "").strip() or None,
        description=(d.description or "").strip() or None,
        user_id=d.user_id,
        sort_order=d.sort_order or 0,
        is_active=1,
    )
    db.add(row)
    db.commit()
    row = db.query(PMTeamInfo).options(joinedload(PMTeamInfo.user)).get(row.id)
    return _team_info_dict(row)


@router.patch("/information/team/{info_id}")
def update_team_info(
    info_id: int,
    d: TeamInfoUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not _is_global_admin(user, db):
        raise HTTPException(403, "Global Admin only")
    row = db.query(PMTeamInfo).get(info_id)
    if not row:
        raise HTTPException(404, "Not found")
    if d.role_type is not None:
        if d.role_type not in VALID_TEAM_ROLES:
            raise HTTPException(400, "Invalid role_type")
        row.role_type = d.role_type
    if d.display_name is not None:
        name = d.display_name.strip()
        if not name:
            raise HTTPException(400, "display_name is required")
        row.display_name = name
    if d.title is not None:
        row.title = d.title.strip() or None
    if d.description is not None:
        row.description = d.description.strip() or None
    if d.user_id is not None:
        if d.user_id == 0:
            row.user_id = None
        else:
            u = db.query(User).get(d.user_id)
            if not u:
                raise HTTPException(400, "Invalid user_id")
            row.user_id = d.user_id
    if d.sort_order is not None:
        row.sort_order = d.sort_order
    if d.is_active is not None:
        row.is_active = 1 if d.is_active else 0
    row.updated_at = datetime.utcnow()
    db.commit()
    row = db.query(PMTeamInfo).options(joinedload(PMTeamInfo.user)).get(info_id)
    return _team_info_dict(row)


@router.delete("/information/team/{info_id}")
def delete_team_info(
    info_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not _is_global_admin(user, db):
        raise HTTPException(403, "Global Admin only")
    row = db.query(PMTeamInfo).get(info_id)
    if not row:
        raise HTTPException(404, "Not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.post("/information/team/{info_id}/photo")
async def upload_team_photo(
    info_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not _is_global_admin(user, db):
        raise HTTPException(403, "Global Admin only")
    row = db.query(PMTeamInfo).get(info_id)
    if not row:
        raise HTTPException(404, "Not found")
    content_type = (file.content_type or "").lower()
    if not content_type.startswith("image/"):
        raise HTTPException(400, "Only image files are allowed")
    file_data = await file.read()
    if len(file_data) == 0:
        raise HTTPException(400, "File is empty")
    if len(file_data) > 5 * 1024 * 1024:
        raise HTTPException(400, "Image must be under 5MB")
    try:
        file_path = upload_file(
            file_data=file_data,
            content_type=content_type or "image/jpeg",
            folder=f"pm_team/{info_id}",
        )
    except Exception as e:
        raise HTTPException(500, f"Failed to upload photo: {str(e)}")
    row.photo_path = file_path
    row.updated_at = datetime.utcnow()
    db.commit()
    row = db.query(PMTeamInfo).options(joinedload(PMTeamInfo.user)).get(info_id)
    return _team_info_dict(row)


@router.delete("/information/team/{info_id}/photo")
def delete_team_photo(
    info_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not _is_global_admin(user, db):
        raise HTTPException(403, "Global Admin only")
    row = db.query(PMTeamInfo).get(info_id)
    if not row:
        raise HTTPException(404, "Not found")
    row.photo_path = None
    row.updated_at = datetime.utcnow()
    db.commit()
    row = db.query(PMTeamInfo).options(joinedload(PMTeamInfo.user)).get(info_id)
    return _team_info_dict(row)


@router.get("/information/team/{info_id}/photo")
def stream_team_photo(
    info_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    row = db.query(PMTeamInfo).get(info_id)
    if not row or not row.photo_path:
        raise HTTPException(404, "Photo not found")
    try:
        return StreamingResponse(
            stream_object(row.photo_path),
            media_type="image/jpeg",
            headers={"Cache-Control": "private, max-age=300"},
        )
    except Exception as e:
        raise HTTPException(500, f"Failed to stream photo: {str(e)}")


# --- Testing tasks ---
@router.get("/projects/{project_id}/tester-tasks")
def list_tester_tasks(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    p = db.query(ITProject).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    tasks = (
        db.query(TesterTask)
        .options(joinedload(TesterTask.created_by), joinedload(TesterTask.assigned_tester))
        .filter(TesterTask.project_id == project_id)
        .order_by(TesterTask.created_at.desc())
        .all()
    )
    return [_tester_task_dict(t) for t in tasks]


@router.post("/projects/{project_id}/tester-tasks")
def create_tester_task(
    project_id: int,
    d: TesterTaskCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    p = db.query(ITProject).get(project_id)
    if not p:
        raise HTTPException(404, "Project not found")
    if not (
        _is_project_coder(project_id, user.id, db)
        or _is_team_leader(user, db)
        or _is_pm_manager(user, db)
        or _is_global_admin(user, db)
    ):
        raise HTTPException(403, "Project coder, Team Leader or Project Manager only")
    if not _is_project_tester(project_id, d.assigned_tester_id, db):
        raise HTTPException(400, "Assign a tester to this project first (Assign tester), then select them here")
    title = (d.title or "").strip()
    if not title:
        raise HTTPException(400, "Title is required")
    task = TesterTask(
        project_id=project_id,
        title=title,
        description=(d.description or "").strip() or None,
        status="open",
        created_by_id=user.id,
        assigned_tester_id=d.assigned_tester_id,
    )
    db.add(task)
    db.commit()
    task = (
        db.query(TesterTask)
        .options(joinedload(TesterTask.created_by), joinedload(TesterTask.assigned_tester))
        .get(task.id)
    )
    return _tester_task_dict(task)


@router.patch("/projects/{project_id}/tester-tasks/{task_id}")
def update_tester_task(
    project_id: int,
    task_id: int,
    d: TesterTaskUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    task = (
        db.query(TesterTask)
        .filter(TesterTask.id == task_id, TesterTask.project_id == project_id)
        .first()
    )
    if not task:
        raise HTTPException(404, "Task not found")
    is_coder = _is_project_coder(project_id, user.id, db) or _is_global_admin(user, db)
    is_assignee = task.assigned_tester_id == user.id
    if not is_coder and not is_assignee:
        raise HTTPException(403, "Access denied")

    if d.title is not None or d.description is not None or d.assigned_tester_id is not None:
        if not is_coder:
            raise HTTPException(403, "Only coder can edit task details")
        if d.title is not None:
            title = d.title.strip()
            if not title:
                raise HTTPException(400, "Title is required")
            task.title = title
        if d.description is not None:
            task.description = d.description.strip() or None
        if d.assigned_tester_id is not None:
            if not _is_project_tester(project_id, d.assigned_tester_id, db):
                raise HTTPException(400, "assigned_tester_id must be a project tester")
            task.assigned_tester_id = d.assigned_tester_id

    if d.status is not None:
        if d.status not in VALID_TESTER_TASK_STATUSES:
            raise HTTPException(400, "Invalid status")
        # Tester can start/done; coder can also update
        if not is_coder and not is_assignee:
            raise HTTPException(403, "Access denied")
        task.status = d.status
        task.done_at = datetime.utcnow() if d.status == "done" else None

    task.updated_at = datetime.utcnow()
    db.commit()
    task = (
        db.query(TesterTask)
        .options(joinedload(TesterTask.created_by), joinedload(TesterTask.assigned_tester))
        .get(task_id)
    )
    return _tester_task_dict(task)


@router.delete("/projects/{project_id}/tester-tasks/{task_id}")
def delete_tester_task(
    project_id: int,
    task_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    task = (
        db.query(TesterTask)
        .filter(TesterTask.id == task_id, TesterTask.project_id == project_id)
        .first()
    )
    if not task:
        raise HTTPException(404, "Task not found")
    if not (_is_project_coder(project_id, user.id, db) or _is_global_admin(user, db)):
        raise HTTPException(403, "Project coder only")
    db.delete(task)
    db.commit()
    return {"ok": True}