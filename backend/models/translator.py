"""Translator module: translation requests with Translator + Check-in workflow."""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class TranslatorTicket(Base):
    __tablename__ = "translator_tickets"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    source_language = Column(String(50), nullable=False)  # UZ, RU, ENG, Chinese
    target_language = Column(String(50), nullable=False)  # RU, ENG, Chinese
    status = Column(String(50), default="open")  # open, assigned, in_translation, in_checkin, closed
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_translator_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    assigned_checkin_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    closed_at = Column(DateTime, nullable=True)
    translator_started_at = Column(DateTime, nullable=True)
    translator_submitted_at = Column(DateTime, nullable=True)  # when translator submitted to check-in
    confirmed_by_user_at = Column(DateTime, nullable=True)

    created_by = relationship("User", foreign_keys=[created_by_id])
    assigned_translator = relationship("User", foreign_keys=[assigned_translator_id])
    assigned_checkin = relationship("User", foreign_keys=[assigned_checkin_id])
