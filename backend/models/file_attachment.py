"""File attachments for tickets."""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class FileAttachment(Base):
    __tablename__ = "file_attachments"

    id = Column(Integer, primary_key=True, index=True)
    ticket_type = Column(String(50), nullable=False)  # "it", "admin", "transport", "travel"
    ticket_id = Column(Integer, nullable=False)  # ID of the ticket (IT, Admin, Transport, etc.)
    file_name = Column(String(500), nullable=False)  # Original file name
    file_path = Column(String(1000), nullable=False)  # Path in MinIO
    file_size = Column(Integer, nullable=False)  # Size in bytes
    content_type = Column(String(255), nullable=True)  # MIME type
    uploaded_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    uploaded_by = relationship("User", foreign_keys=[uploaded_by_id])
