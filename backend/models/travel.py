from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Text, Numeric
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class TravelTicket(Base):
    __tablename__ = "travel_tickets"

    id = Column(Integer, primary_key=True, index=True)
    # Segments stored as JSON or separate table; for simplicity one main + comment for multi
    source_destination_json = Column(Text, nullable=False)  # JSON: [{source, destination, date, time}, ...]
    comment = Column(Text, nullable=True)
    priority = Column(String(20), default="medium")  # low, medium, high, urgent
    status = Column(String(50), default="open")  # open, in_progress, closed
    book_hotel = Column(Boolean, default=False)  # when true, ticket goes to Travel + Hotel Engineer
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_engineer_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    closed_at = Column(DateTime, nullable=True)

    created_by = relationship("User", foreign_keys=[created_by_id], back_populates="travel_tickets_created")


class TravelTicketStat(Base):
    __tablename__ = "travel_ticket_stats"

    id = Column(Integer, primary_key=True, index=True)
    travel_ticket_id = Column(Integer, ForeignKey("travel_tickets.id"), nullable=False)
    username = Column(String(255), nullable=True)
    source_destination = Column(String(500), nullable=True)
    date_time = Column(String(255), nullable=True)
    company = Column(String(255), nullable=True)
    price = Column(Numeric(14, 2), nullable=True)
    currency = Column(String(10), nullable=False, default="UZS")
    created_at = Column(DateTime, default=datetime.utcnow)

    travel_ticket = relationship("TravelTicket", backref="stats")
