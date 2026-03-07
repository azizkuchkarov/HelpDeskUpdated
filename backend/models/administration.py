from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class AdmTicketType:
    SERVICE = "service"
    SUPPLY = "supply"
    MEETING_ROOM = "meeting_room"


class AdmTicket(Base):
    __tablename__ = "adm_tickets"

    id = Column(Integer, primary_key=True, index=True)
    ticket_type = Column(String(50), nullable=False)  # service, supply, meeting_room
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    priority = Column(String(20), default="medium")  # low, medium, high, urgent
    status = Column(String(50), default="open")  # open, in_progress, closed_by_engineer, confirmed_by_user, closed
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_engineer_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    # If IT also needed (meeting room): ticket goes to IT section too
    requires_it = Column(Boolean, default=False)
    it_ticket_id = Column(Integer, ForeignKey("it_tickets.id"), nullable=True)  # linked IT ticket if requires_it
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    closed_at = Column(DateTime, nullable=True)
    confirmed_by_user_at = Column(DateTime, nullable=True)

    created_by = relationship("User", foreign_keys=[created_by_id], back_populates="adm_tickets_created")
    meeting_room_booking = relationship(
        "MeetingRoomBooking",
        back_populates="adm_ticket",
        uselist=False,
        primaryjoin="AdmTicket.id == MeetingRoomBooking.adm_ticket_id",
    )


class MeetingRoom(Base):
    __tablename__ = "meeting_rooms"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)  # B Block 401 Left, etc.
    name_ru = Column(String(255), nullable=True)
    name_zh = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    bookings = relationship("MeetingRoomBooking", back_populates="room")


class MeetingRoomBooking(Base):
    __tablename__ = "meeting_room_bookings"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("meeting_rooms.id"), nullable=False)
    adm_ticket_id = Column(Integer, ForeignKey("adm_tickets.id"), nullable=True)
    subject = Column(String(500), nullable=True)  # Optional - can be removed in future
    start_at = Column(DateTime, nullable=False)
    end_at = Column(DateTime, nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    room = relationship("MeetingRoom", back_populates="bookings")
    adm_ticket = relationship("AdmTicket", back_populates="meeting_room_booking", uselist=False)
