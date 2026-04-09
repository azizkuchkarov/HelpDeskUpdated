from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base
import enum


class RoleType(str, enum.Enum):
    GLOBAL_ADMIN = "global_admin"
    MANAGER = "manager"
    INVENTORY_MANAGER = "inventory_manager"
    IT_ADMIN = "it_admin"
    IT_ENGINEER = "it_engineer"
    IT_REASSIGN_ENGINEER = "it_reassign_engineer"  # workflow: only these users can reassign IT tickets after initial assign
    ADM_ENGINEER = "adm_engineer"
    ADM_MANAGER = "adm_manager"
    ADM_TICKET_ENGINEER = "adm_ticket_engineer"
    HOTEL_ENGINEER = "hotel_engineer"
    SECRETARY = "secretary"
    TRANSPORT_ENGINEER = "transport_engineer"
    HR_MANAGER = "hr_manager"
    ADM_MONITORING_MANAGER = "adm_monitoring_manager"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    ldap_username = Column(String(255), unique=True, nullable=False, index=True)
    display_name = Column(String(255), nullable=True)
    email = Column(String(255), nullable=True)
    phone_number = Column(String(50), nullable=True)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    department = relationship("Department", foreign_keys=[department_id], back_populates="users")
    roles = relationship("UserRole", back_populates="user", cascade="all, delete-orphan")
    approver = relationship("UserApprover", foreign_keys="UserApprover.user_id", back_populates="user", uselist=False)
    as_approver_for = relationship("UserApprover", foreign_keys="UserApprover.approver_id", back_populates="approver")

    # Tickets
    it_tickets_created = relationship("ITTicket", foreign_keys="ITTicket.created_by_id", back_populates="created_by")
    it_tickets_opened_on_behalf = relationship("ITTicket", foreign_keys="ITTicket.opened_on_behalf_by_id", back_populates="opened_on_behalf_by")
    it_tickets_assigned = relationship("ITTicket", foreign_keys="ITTicket.assigned_engineer_id", back_populates="assigned_engineer")
    adm_tickets_created = relationship("AdmTicket", foreign_keys="AdmTicket.created_by_id", back_populates="created_by")
    transport_tickets_created = relationship("TransportTicket", foreign_keys="TransportTicket.created_by_id", back_populates="created_by")
    travel_tickets_created = relationship("TravelTicket", foreign_keys="TravelTicket.created_by_id", back_populates="created_by")


class UserRole(Base):
    __tablename__ = "user_roles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role_type = Column(String(64), nullable=False)  # RoleType value
    section = Column(String(64), nullable=True)  # "it", "administration", "transport", "travel", "top_managers"
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="roles")


class UserApprover(Base):
    """Global Admin sets per user (in department) who approves their tickets - the Manager."""
    __tablename__ = "user_approvers"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    approver_id = Column(Integer, ForeignKey("users.id"), nullable=False)  # Manager who approves
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id], back_populates="approver")
    approver = relationship("User", foreign_keys=[approver_id], back_populates="as_approver_for")
    department = relationship("Department", back_populates="user_approvers")
