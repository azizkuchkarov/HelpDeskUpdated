from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class TransportTicketType:
    DAILY = "daily"
    OVERTIME = "overtime"
    MAXSUS = "maxsus"


class Car(Base):
    __tablename__ = "cars"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)  # e.g. plate or name
    car_type = Column(String(255), nullable=True)  # Тип автомобиля
    brand = Column(String(255), nullable=True)  # Марка
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    transport_tickets = relationship("TransportTicket", back_populates="car")


class Driver(Base):
    __tablename__ = "drivers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    phone = Column(String(100), nullable=True)  # Telefon raqam
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    transport_tickets = relationship("TransportTicket", back_populates="driver")


class TransportTicket(Base):
    __tablename__ = "transport_tickets"

    id = Column(Integer, primary_key=True, index=True)
    ticket_type = Column(String(50), nullable=False)  # daily, overtime, maxsus
    priority = Column(String(20), default="medium")  # low, medium, high, urgent
    from_location = Column(String(500), nullable=True)  # From location (where user is leaving from)
    destination = Column(String(500), nullable=False)
    start_date = Column(DateTime, nullable=True)  # Start date and time (when transport is needed)
    start_time = Column(String(50), nullable=True)  # Start time (24H format)
    passenger_count = Column(Integer, default=1)
    approximate_time = Column(String(50), nullable=True)  # 30m, 1h, 1h 30m, 2h, and more
    comment = Column(Text, nullable=True)
    status = Column(String(50), default="open")  # open, manager_approved, hr_approved, assigned, ready, closed
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    approver_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # per-ticket approver (Manager or other user)
    manager_approved_at = Column(DateTime, nullable=True)
    hr_approved_at = Column(DateTime, nullable=True)
    car_id = Column(Integer, ForeignKey("cars.id"), nullable=True)
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=True)
    ready_at = Column(DateTime, nullable=True)
    driver_returned_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)
    confirmed_by_user_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    created_by = relationship("User", foreign_keys=[created_by_id], back_populates="transport_tickets_created")
    approver = relationship("User", foreign_keys=[approver_id])
    car = relationship("Car", back_populates="transport_tickets")
    driver = relationship("Driver", back_populates="transport_tickets")
