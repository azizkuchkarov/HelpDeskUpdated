from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    name_ru = Column(String(255), nullable=True)
    name_zh = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    manager_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Department Manager (approver for this dept)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    users = relationship("User", foreign_keys="User.department_id", back_populates="department")
    user_approvers = relationship("UserApprover", foreign_keys="UserApprover.department_id", back_populates="department")
    manager = relationship("User", foreign_keys=[manager_id])
