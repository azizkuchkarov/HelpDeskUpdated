"""Auth: login (LDAP), me."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
from auth.ldap_auth import verify_ldap
from auth.jwt_handler import create_access_token
from auth.deps import get_current_user
from models.user import User, UserRole
from config import get_settings, get_local_users_list

router = APIRouter()


class LoginRequest(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    ldap_username: str
    display_name: str | None
    email: str | None
    department_id: int | None
    roles: list[dict]
    approver_id: int | None

    class Config:
        from_attributes = True


@router.post("/login")
def login(data: LoginRequest, db: Session = Depends(get_db)):
    settings = get_settings()
    # Local admin: LDAP siz kirish (faqat lokal, .env da LOCAL_ADMIN_* berilganda)
    local_user = (getattr(settings, "local_admin_username", None) or "").strip()
    local_pass = getattr(settings, "local_admin_password", None) or ""
    if local_user and local_pass and data.username == local_user and data.password == local_pass:
        user = db.query(User).filter(User.ldap_username == local_user).first()
        if not user:
            user = User(
                ldap_username=local_user,
                display_name=local_user,
                email="",
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        has_admin = db.query(UserRole).filter(
            UserRole.user_id == user.id,
            UserRole.role_type == "global_admin",
        ).first()
        if not has_admin:
            db.add(UserRole(user_id=user.id, role_type="global_admin", section=None))
            db.commit()
        if not user.is_active:
            raise HTTPException(status_code=403, detail="User is disabled")
        token = create_access_token(data={"sub": user.ldap_username})
        return {"access_token": token, "token_type": "bearer", "user_id": user.id}

    # Local userlar (user1:1234, user2:1234, ...)
    local_list = get_local_users_list()
    if local_list and (data.username, data.password) in local_list:
        user = db.query(User).filter(User.ldap_username == data.username).first()
        if not user:
            user = User(
                ldap_username=data.username,
                display_name=data.username,
                email="",
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        if not user.is_active:
            raise HTTPException(status_code=403, detail="User is disabled")
        token = create_access_token(data={"sub": user.ldap_username})
        return {"access_token": token, "token_type": "bearer", "user_id": user.id}

    ldap_info = verify_ldap(data.username, data.password)
    if not ldap_info:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    user = db.query(User).filter(User.ldap_username == ldap_info["username"]).first()
    if not user:
        user = User(
            ldap_username=ldap_info["username"],
            display_name=ldap_info.get("display_name") or ldap_info["username"],
            email=ldap_info.get("email") or "",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        if getattr(settings, "auto_admin_first_user", True):
            total = db.query(func.count(User.id)).scalar() or 0
            if total == 1:
                db.add(UserRole(user_id=user.id, role_type="global_admin", section=None))
                db.commit()
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User is disabled")
    token = create_access_token(data={"sub": user.ldap_username})
    return {"access_token": token, "token_type": "bearer", "user_id": user.id}


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from models.user import UserRole, UserApprover
    roles = [{"role_type": r.role_type, "section": r.section} for r in user.roles]
    approver_id = user.approver.approver_id if user.approver else None
    return UserResponse(
        id=user.id,
        ldap_username=user.ldap_username,
        display_name=user.display_name,
        email=user.email,
        department_id=user.department_id,
        roles=roles,
        approver_id=approver_id,
    )
