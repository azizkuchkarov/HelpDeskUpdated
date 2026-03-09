"""Inventory: items assigned to users. inventory_manager can manage; all users see their items."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional, List
from database import get_db
from auth.deps import get_current_user
from models.user import User, UserRole
from models.inventory import InventoryType, InventoryItem

router = APIRouter()


def _is_inventory_manager(user: User, db: Session) -> bool:
    return db.query(UserRole).filter(
        UserRole.user_id == user.id,
        UserRole.role_type == "inventory_manager",
    ).first() is not None


# --- Types ---
class InventoryTypeCreate(BaseModel):
    name: str
    name_ru: Optional[str] = None
    description: Optional[str] = None


class InventoryTypeUpdate(BaseModel):
    name: Optional[str] = None
    name_ru: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/types")
def list_types(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """List all inventory item types (PC, Phone, etc.)."""
    types = db.query(InventoryType).filter(InventoryType.is_active == True).order_by(InventoryType.name).all()
    return [
        {
            "id": t.id,
            "name": t.name,
            "name_ru": t.name_ru,
            "description": t.description,
        }
        for t in types
    ]


@router.post("/types")
def create_type(
    d: InventoryTypeCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create inventory type. inventory_manager only."""
    if not _is_inventory_manager(user, db):
        raise HTTPException(403, "Inventory Manager only")
    existing = db.query(InventoryType).filter(InventoryType.name == d.name.strip()).first()
    if existing:
        raise HTTPException(400, "Type with this name already exists")
    t = InventoryType(name=d.name.strip(), name_ru=d.name_ru, description=d.description)
    db.add(t)
    db.commit()
    db.refresh(t)
    return {"id": t.id, "name": t.name, "name_ru": t.name_ru, "description": t.description}


@router.patch("/types/{type_id}")
def update_type(
    type_id: int,
    d: InventoryTypeUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update inventory type. inventory_manager only."""
    if not _is_inventory_manager(user, db):
        raise HTTPException(403, "Inventory Manager only")
    t = db.query(InventoryType).get(type_id)
    if not t:
        raise HTTPException(404, "Type not found")
    if d.name is not None:
        t.name = d.name.strip()
    if d.name_ru is not None:
        t.name_ru = d.name_ru
    if d.description is not None:
        t.description = d.description
    if d.is_active is not None:
        t.is_active = d.is_active
    db.commit()
    return {"ok": True}


# --- Items ---
class InventoryItemCreate(BaseModel):
    type_id: int
    name: str
    serial_number: Optional[str] = None
    model: Optional[str] = None
    brand: Optional[str] = None
    notes: Optional[str] = None


class InventoryItemUpdate(BaseModel):
    type_id: Optional[int] = None
    name: Optional[str] = None
    serial_number: Optional[str] = None
    model: Optional[str] = None
    brand: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class InventoryAssign(BaseModel):
    user_id: int


@router.post("/my-items")
def add_my_item(
    d: InventoryItemCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Any user can add an item and assign it to themselves (self-registration)."""
    itype = db.query(InventoryType).get(d.type_id)
    if not itype:
        raise HTTPException(400, "Invalid type_id")
    item = InventoryItem(
        type_id=d.type_id,
        name=d.name.strip(),
        serial_number=(d.serial_number or "").strip() or None,
        model=(d.model or "").strip() or None,
        brand=(d.brand or "").strip() or None,
        notes=(d.notes or "").strip() or None,
        status="assigned",
        assigned_to_id=user.id,
        assigned_at=datetime.utcnow(),
        assigned_by_id=user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {
        "id": item.id,
        "type_id": item.type_id,
        "type_name": itype.name,
        "name": item.name,
        "serial_number": item.serial_number,
        "model": item.model,
        "brand": item.brand,
        "status": item.status,
    }


@router.get("/my-items")
def my_items(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """List items assigned to current user."""
    items = (
        db.query(InventoryItem)
        .filter(InventoryItem.assigned_to_id == user.id,
                InventoryItem.status == "assigned")
        .order_by(InventoryItem.type_id, InventoryItem.name)
        .all()
    )
    return [
        {
            "id": i.id,
            "type_id": i.type_id,
            "type_name": i.item_type.name,
            "type_name_ru": i.item_type.name_ru,
            "name": i.name,
            "serial_number": i.serial_number,
            "model": i.model,
            "brand": i.brand,
            "status": i.status,
            "assigned_at": i.assigned_at.isoformat() if i.assigned_at else None,
            "notes": i.notes,
        }
        for i in items
    ]


@router.get("/items")
def list_items(
    user_id: Optional[int] = None,
    type_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List all inventory items. inventory_manager only. Filter by user_id, type_id, status."""
    if not _is_inventory_manager(user, db):
        raise HTTPException(403, "Inventory Manager only")
    q = db.query(InventoryItem)
    if user_id is not None:
        q = q.filter(InventoryItem.assigned_to_id == user_id)
    if type_id is not None:
        q = q.filter(InventoryItem.type_id == type_id)
    if status is not None:
        q = q.filter(InventoryItem.status == status)
    items = q.order_by(InventoryItem.type_id, InventoryItem.name).all()
    return [
        {
            "id": i.id,
            "type_id": i.type_id,
            "type_name": i.item_type.name,
            "type_name_ru": i.item_type.name_ru,
            "name": i.name,
            "serial_number": i.serial_number,
            "model": i.model,
            "brand": i.brand,
            "status": i.status,
            "assigned_to_id": i.assigned_to_id,
            "assigned_to_name": i.assigned_to.display_name or i.assigned_to.ldap_username if i.assigned_to else None,
            "assigned_at": i.assigned_at.isoformat() if i.assigned_at else None,
            "assigned_by_name": i.assigned_by.display_name or i.assigned_by.ldap_username if i.assigned_by else None,
            "notes": i.notes,
            "created_at": i.created_at.isoformat() if i.created_at else None,
        }
        for i in items
    ]


@router.post("/items")
def create_item(
    d: InventoryItemCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create inventory item. inventory_manager only."""
    if not _is_inventory_manager(user, db):
        raise HTTPException(403, "Inventory Manager only")
    itype = db.query(InventoryType).get(d.type_id)
    if not itype:
        raise HTTPException(400, "Invalid type_id")
    item = InventoryItem(
        type_id=d.type_id,
        name=d.name.strip(),
        serial_number=(d.serial_number or "").strip() or None,
        model=(d.model or "").strip() or None,
        brand=(d.brand or "").strip() or None,
        notes=(d.notes or "").strip() or None,
        status="available",
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {
        "id": item.id,
        "type_id": item.type_id,
        "type_name": itype.name,
        "name": item.name,
        "serial_number": item.serial_number,
        "model": item.model,
        "brand": item.brand,
        "status": item.status,
    }


@router.patch("/items/{item_id}")
def update_item(
    item_id: int,
    d: InventoryItemUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update inventory item. inventory_manager only."""
    if not _is_inventory_manager(user, db):
        raise HTTPException(403, "Inventory Manager only")
    item = db.query(InventoryItem).get(item_id)
    if not item:
        raise HTTPException(404, "Item not found")
    if d.type_id is not None:
        itype = db.query(InventoryType).get(d.type_id)
        if not itype:
            raise HTTPException(400, "Invalid type_id")
        item.type_id = d.type_id
    if d.name is not None:
        item.name = d.name.strip()
    if d.serial_number is not None:
        item.serial_number = (d.serial_number or "").strip() or None
    if d.model is not None:
        item.model = (d.model or "").strip() or None
    if d.brand is not None:
        item.brand = (d.brand or "").strip() or None
    if d.status is not None:
        if d.status not in ("available", "assigned", "damaged", "maintenance", "retired"):
            raise HTTPException(400, "Invalid status")
        item.status = d.status
        if d.status != "assigned":
            item.assigned_to_id = None
            item.assigned_at = None
            item.assigned_by_id = None
    if d.notes is not None:
        item.notes = (d.notes or "").strip() or None
    db.commit()
    return {"ok": True}


@router.post("/items/{item_id}/assign")
def assign_item(
    item_id: int,
    d: InventoryAssign,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Assign item to user. inventory_manager only."""
    if not _is_inventory_manager(user, db):
        raise HTTPException(403, "Inventory Manager only")
    item = db.query(InventoryItem).get(item_id)
    if not item:
        raise HTTPException(404, "Item not found")
    target = db.query(User).get(d.user_id)
    if not target or not target.is_active:
        raise HTTPException(400, "User not found or inactive")
    item.assigned_to_id = d.user_id
    item.assigned_at = datetime.utcnow()
    item.assigned_by_id = user.id
    item.status = "assigned"
    db.commit()
    return {"ok": True, "assigned_to": target.display_name or target.ldap_username}


@router.post("/items/{item_id}/unassign")
def unassign_item(
    item_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Unassign item (return to available). inventory_manager only."""
    if not _is_inventory_manager(user, db):
        raise HTTPException(403, "Inventory Manager only")
    item = db.query(InventoryItem).get(item_id)
    if not item:
        raise HTTPException(404, "Item not found")
    item.assigned_to_id = None
    item.assigned_at = None
    item.assigned_by_id = None
    item.status = "available"
    db.commit()
    return {"ok": True}


@router.get("/users")
def list_users_for_assign(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """List active users for assignment dropdown. inventory_manager only."""
    if not _is_inventory_manager(user, db):
        raise HTTPException(403, "Inventory Manager only")
    users = db.query(User).filter(User.is_active == True).order_by(User.display_name, User.ldap_username).all()
    return [
        {"id": u.id, "display_name": u.display_name or u.ldap_username, "ldap_username": u.ldap_username}
        for u in users
    ]
