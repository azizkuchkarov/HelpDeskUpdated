"""Admin: departments, users, approvers, roles, meeting rooms, cars, drivers, top managers."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload
from typing import Optional
from database import get_db
from auth.deps import get_current_admin
from models.user import User, UserRole, UserApprover, RoleType
from models.department import Department
from models.administration import MeetingRoom
from models.transport import Car, Driver
from models.top_managers import TopManager, SecretaryTopManager, TopManagerAvailability

router = APIRouter()


# --- Departments ---
class DepartmentCreate(BaseModel):
    name: str
    name_ru: Optional[str] = None


class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    name_ru: Optional[str] = None
    is_active: Optional[bool] = None
    manager_id: Optional[int] = None


class UserApproverSet(BaseModel):
    user_id: int
    approver_id: int  # Manager who approves this user's tickets
    department_id: Optional[int] = None


class UserRoleSet(BaseModel):
    user_id: int
    role_type: str
    section: Optional[str] = None


class UserDepartmentSet(BaseModel):
    user_id: int
    department_id: Optional[int] = None  # None to remove from department


@router.get("/departments")
def list_departments(db: Session = Depends(get_db), _=Depends(get_current_admin)):
    depts = db.query(Department).options(joinedload(Department.manager)).filter(Department.is_active == True).all()
    return [
        {
            "id": d.id,
            "name": d.name,
            "name_ru": d.name_ru,
            "manager_id": d.manager_id,
            "manager_name": d.manager.display_name or d.manager.ldap_username if d.manager else None,
        }
        for d in depts
    ]


@router.post("/departments")
def create_department(d: DepartmentCreate, db: Session = Depends(get_db), _=Depends(get_current_admin)):
    dept = Department(name=d.name, name_ru=d.name_ru)
    db.add(dept)
    db.commit()
    db.refresh(dept)
    return dept


@router.patch("/departments/{dept_id}")
def update_department(dept_id: int, d: DepartmentUpdate, db: Session = Depends(get_db), _=Depends(get_current_admin)):
    dept = db.query(Department).get(dept_id)
    if not dept:
        raise HTTPException(404, "Department not found")
    if d.name is not None:
        dept.name = d.name
    if d.name_ru is not None:
        dept.name_ru = d.name_ru
    if d.is_active is not None:
        dept.is_active = d.is_active
    if d.manager_id is not None:
        dept.manager_id = d.manager_id
        # Set this manager as approver for all users in this department
        for u in dept.users:
            existing = db.query(UserApprover).filter(UserApprover.user_id == u.id).first()
            if existing:
                existing.approver_id = d.manager_id
                existing.department_id = dept_id
            else:
                db.add(UserApprover(user_id=u.id, approver_id=d.manager_id, department_id=dept_id))
    db.commit()
    db.refresh(dept)
    return {
        "id": dept.id,
        "name": dept.name,
        "name_ru": dept.name_ru,
        "manager_id": dept.manager_id,
        "manager_name": dept.manager.display_name or dept.manager.ldap_username if dept.manager else None,
    }


@router.get("/users")
def list_users(db: Session = Depends(get_db), _=Depends(get_current_admin)):
    users = db.query(User).filter(User.is_active == True).all()
    return [
        {
            "id": u.id,
            "ldap_username": u.ldap_username,
            "display_name": u.display_name,
            "email": u.email,
            "department_id": u.department_id,
            "roles": [{"role_type": r.role_type, "section": r.section} for r in u.roles],
            "approver_id": u.approver.approver_id if u.approver else None,
        }
        for u in users
    ]


@router.post("/users/set-department")
def set_user_department(d: UserDepartmentSet, db: Session = Depends(get_db), _=Depends(get_current_admin)):
    user = db.query(User).get(d.user_id)
    if not user:
        raise HTTPException(404, "User not found")
    user.department_id = d.department_id
    # If removing from department, also remove approver relationship
    if d.department_id is None:
        existing = db.query(UserApprover).filter(UserApprover.user_id == user.id).first()
        if existing:
            db.delete(existing)
    else:
        dept = db.query(Department).get(d.department_id)
        if dept and dept.manager_id:
            existing = db.query(UserApprover).filter(UserApprover.user_id == user.id).first()
            if existing:
                existing.approver_id = dept.manager_id
                existing.department_id = d.department_id
            else:
                db.add(UserApprover(user_id=user.id, approver_id=dept.manager_id, department_id=d.department_id))
    db.commit()
    return {"ok": True}


@router.post("/users/set-approver")
def set_user_approver(d: UserApproverSet, db: Session = Depends(get_db), _=Depends(get_current_admin)):
    user = db.query(User).get(d.user_id)
    approver = db.query(User).get(d.approver_id)
    if not user or not approver:
        raise HTTPException(404, "User or approver not found")
    existing = db.query(UserApprover).filter(UserApprover.user_id == user.id).first()
    if existing:
        existing.approver_id = d.approver_id
        existing.department_id = d.department_id
    else:
        db.add(UserApprover(user_id=user.id, approver_id=d.approver_id, department_id=d.department_id))
    db.commit()
    return {"ok": True}


@router.post("/users/set-role")
def set_user_role(d: UserRoleSet, db: Session = Depends(get_db), _=Depends(get_current_admin)):
    user = db.query(User).get(d.user_id)
    if not user:
        raise HTTPException(404, "User not found")
    existing = db.query(UserRole).filter(
        UserRole.user_id == user.id,
        UserRole.role_type == d.role_type,
        UserRole.section == (d.section or ""),
    ).first()
    if not existing:
        db.add(UserRole(user_id=user.id, role_type=d.role_type, section=d.section))
    db.commit()
    return {"ok": True}


@router.delete("/users/{user_id}/roles/{role_type}")
def remove_user_role(user_id: int, role_type: str, section: Optional[str] = None, db: Session = Depends(get_db), _=Depends(get_current_admin)):
    q = db.query(UserRole).filter(UserRole.user_id == user_id, UserRole.role_type == role_type)
    if section is not None:
        q = q.filter(UserRole.section == section)
    for r in q.all():
        db.delete(r)
    db.commit()
    return {"ok": True}


# --- Meeting Rooms ---
class MeetingRoomCreate(BaseModel):
    name: str
    name_ru: Optional[str] = None


@router.get("/meeting-rooms")
def list_meeting_rooms(db: Session = Depends(get_db), _=Depends(get_current_admin)):
    return db.query(MeetingRoom).all()


@router.post("/meeting-rooms")
def create_meeting_room(d: MeetingRoomCreate, db: Session = Depends(get_db), _=Depends(get_current_admin)):
    room = MeetingRoom(name=d.name, name_ru=d.name_ru)
    db.add(room)
    db.commit()
    db.refresh(room)
    return room


# --- Cars & Drivers ---
class CarCreate(BaseModel):
    name: str
    car_type: Optional[str] = None  # Тип автомобиля
    brand: Optional[str] = None  # Марка


class DriverCreate(BaseModel):
    name: str
    phone: Optional[str] = None  # Telefon raqam


@router.get("/cars")
def list_cars(db: Session = Depends(get_db), _=Depends(get_current_admin)):
    return db.query(Car).filter(Car.is_active == True).all()


@router.post("/cars")
def create_car(d: CarCreate, db: Session = Depends(get_db), _=Depends(get_current_admin)):
    car = Car(name=d.name, car_type=d.car_type, brand=d.brand)
    db.add(car)
    db.commit()
    db.refresh(car)
    return car


@router.delete("/cars/{car_id}")
def delete_car(car_id: int, db: Session = Depends(get_db), _=Depends(get_current_admin)):
    car = db.query(Car).get(car_id)
    if not car:
        raise HTTPException(404, "Car not found")
    car.is_active = False
    db.commit()
    return {"ok": True}


@router.get("/drivers")
def list_drivers(db: Session = Depends(get_db), _=Depends(get_current_admin)):
    return db.query(Driver).filter(Driver.is_active == True).all()


@router.post("/drivers")
def create_driver(d: DriverCreate, db: Session = Depends(get_db), _=Depends(get_current_admin)):
    driver = Driver(name=d.name, phone=d.phone)
    db.add(driver)
    db.commit()
    db.refresh(driver)
    return driver


@router.delete("/drivers/{driver_id}")
def delete_driver(driver_id: int, db: Session = Depends(get_db), _=Depends(get_current_admin)):
    driver = db.query(Driver).get(driver_id)
    if not driver:
        raise HTTPException(404, "Driver not found")
    driver.is_active = False
    db.commit()
    return {"ok": True}


# --- Top Managers ---
class TopManagerCreate(BaseModel):
    name: str
    user_id: Optional[int] = None


@router.get("/top-managers")
def list_top_managers(db: Session = Depends(get_db), _=Depends(get_current_admin)):
    return db.query(TopManager).filter(TopManager.is_active == True).all()


@router.post("/top-managers")
def create_top_manager(d: TopManagerCreate, db: Session = Depends(get_db), _=Depends(get_current_admin)):
    tm = TopManager(name=d.name, user_id=d.user_id)
    db.add(tm)
    db.commit()
    db.refresh(tm)
    return tm


class TopManagerUpdate(BaseModel):
    name: Optional[str] = None
    user_id: Optional[int] = None


@router.patch("/top-managers/{tm_id}")
def update_top_manager(tm_id: int, d: TopManagerUpdate, db: Session = Depends(get_db), _=Depends(get_current_admin)):
    tm = db.query(TopManager).get(tm_id)
    if not tm:
        raise HTTPException(404, "Top manager not found")
    if d.name is not None:
        tm.name = d.name
    if d.user_id is not None:
        tm.user_id = d.user_id
    db.commit()
    db.refresh(tm)
    return tm


class SecretaryTopManagerLink(BaseModel):
    secretary_id: int
    top_manager_id: int


@router.post("/secretary-top-managers")
def link_secretary_top_manager(d: SecretaryTopManagerLink, db: Session = Depends(get_db), _=Depends(get_current_admin)):
    user = db.query(User).get(d.secretary_id)
    if not user:
        raise HTTPException(404, "User not found")
    tm = db.query(TopManager).filter(TopManager.id == d.top_manager_id, TopManager.is_active == True).first()
    if not tm:
        raise HTTPException(404, "Top manager not found")
    # Ensure user has secretary role when linked
    has_secretary = db.query(UserRole).filter(
        UserRole.user_id == d.secretary_id,
        UserRole.role_type == "secretary",
    ).first()
    if not has_secretary:
        db.add(UserRole(user_id=d.secretary_id, role_type="secretary", section=None))
    # Skip if link already exists (avoid duplicates)
    existing = db.query(SecretaryTopManager).filter(
        SecretaryTopManager.secretary_id == d.secretary_id,
        SecretaryTopManager.top_manager_id == d.top_manager_id,
    ).first()
    if not existing:
        db.add(SecretaryTopManager(secretary_id=d.secretary_id, top_manager_id=d.top_manager_id))
    db.commit()
    return {"ok": True}
