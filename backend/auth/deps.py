"""Auth dependencies for FastAPI."""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import get_db
from auth.jwt_handler import decode_token
from models.user import User

security = HTTPBearer(auto_error=False)


def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User | None:
    if not credentials:
        return None
    payload = decode_token(credentials.credentials)
    if not payload or "sub" not in payload:
        return None
    username = payload["sub"]
    user = db.query(User).filter(User.ldap_username == username, User.is_active == True).first()
    return user


def get_current_user(
    user: User | None = Depends(get_current_user_optional),
) -> User:
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user


def get_current_admin(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from models.user import UserRole
    from models.user import RoleType
    has_admin = db.query(UserRole).filter(
        UserRole.user_id == user.id,
        UserRole.role_type == RoleType.GLOBAL_ADMIN.value,
    ).first()
    if not has_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin required")
    return user
