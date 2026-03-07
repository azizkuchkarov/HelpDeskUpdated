from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class AvailabilityStatus:
    AT_WORK = "at_work"
    NOT_AT_WORK = "not_at_work"


class TopManager(Base):
    __tablename__ = "top_managers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # optional link to user
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SecretaryTopManager(Base):
    """Secretary is linked to Top Manager(s)."""
    __tablename__ = "secretary_top_managers"

    id = Column(Integer, primary_key=True, index=True)
    secretary_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    top_manager_id = Column(Integer, ForeignKey("top_managers.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    top_manager = relationship("TopManager", backref="secretary_links")


class TopManagerAvailability(Base):
    """Current availability status of a Top Manager (set by Secretary)."""
    __tablename__ = "availability_statuses"

    id = Column(Integer, primary_key=True, index=True)
    top_manager_id = Column(Integer, ForeignKey("top_managers.id"), nullable=False)
    status = Column(String(50), nullable=False)  # at_work, not_at_work
    comment = Column(String(1000), nullable=True)  # Secretary's comment when not_at_work; visible to all
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    top_manager = relationship("TopManager", backref="availability")
