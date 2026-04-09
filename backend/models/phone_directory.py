"""Phone Directory: single Excel file, admin uploads, all users download."""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class PhoneDirectoryFile(Base):
    """Latest phone directory Excel file. Admin uploads, all users download."""
    __tablename__ = "phone_directory_files"

    id = Column(Integer, primary_key=True, index=True)
    file_name = Column(String(500), nullable=False)
    file_path = Column(String(1000), nullable=False)
    uploaded_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow)

    uploaded_by = relationship("User", foreign_keys=[uploaded_by_id])
