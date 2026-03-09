"""Generic ticket comments for Transport, Administration, Travel, Translator."""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class TicketComment(Base):
    """Comments on tickets. ticket_type: transport, adm, travel, translator."""
    __tablename__ = "ticket_comments"

    id = Column(Integer, primary_key=True, index=True)
    ticket_type = Column(String(50), nullable=False)  # transport, adm, travel, translator
    ticket_id = Column(Integer, nullable=False)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    author = relationship("User", foreign_keys=[author_id])
