from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class ITTicket(Base):
    __tablename__ = "it_tickets"

    id = Column(Integer, primary_key=True, index=True)
    problem_type = Column(String(50), nullable=True)  # Hardware, Software, Installing programm, Printer, Telephone, SimCard
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    priority = Column(String(20), default="medium")  # low, medium, high, urgent
    status = Column(String(50), default="open")  # open, assigned, in_progress, closed_by_engineer, confirmed_by_user, closed
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_engineer_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    closed_at = Column(DateTime, nullable=True)
    confirmed_by_user_at = Column(DateTime, nullable=True)

    created_by = relationship("User", foreign_keys=[created_by_id], back_populates="it_tickets_created")
    assigned_engineer = relationship("User", foreign_keys=[assigned_engineer_id], back_populates="it_tickets_assigned")
    comments = relationship("ITTicketComment", back_populates="ticket", order_by="ITTicketComment.created_at")


class ITTicketComment(Base):
    __tablename__ = "it_ticket_comments"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("it_tickets.id"), nullable=False)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    ticket = relationship("ITTicket", back_populates="comments")
    author = relationship("User", foreign_keys=[author_id])
