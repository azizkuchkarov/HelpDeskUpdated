"""Inventory: items assigned to users. Managed by inventory_manager role."""
from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class InventoryType(Base):
    """Item categories: PC, Phone, SIM card, Notebook, Table, Chair, etc."""
    __tablename__ = "inventory_types"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    name_ru = Column(String(100), nullable=True)
    description = Column(String(500), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    items = relationship("InventoryItem", back_populates="item_type")


class InventoryItem(Base):
    """Individual inventory item. Status: available, assigned, damaged, maintenance, retired."""
    __tablename__ = "inventory_items"

    id = Column(Integer, primary_key=True, index=True)
    type_id = Column(Integer, ForeignKey("inventory_types.id"), nullable=False)
    name = Column(String(255), nullable=False)  # e.g. "Dell Latitude 5520"
    serial_number = Column(String(255), nullable=True)
    model = Column(String(255), nullable=True)
    brand = Column(String(255), nullable=True)
    status = Column(String(50), default="available")  # available, assigned, damaged, maintenance, retired
    assigned_to_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    assigned_at = Column(DateTime, nullable=True)
    assigned_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    item_type = relationship("InventoryType", back_populates="items")
    assigned_to = relationship("User", foreign_keys=[assigned_to_id])
    assigned_by = relationship("User", foreign_keys=[assigned_by_id])
