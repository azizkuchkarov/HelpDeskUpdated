"""
Seed initial data for HelpDesk system.
Run: python seed_data.py

This script creates:
- Default departments (if they don't exist)
- Default meeting rooms (if they don't exist)
- Other initial data

Note: Users are created automatically on first LDAP login.
"""
import sys
from sqlalchemy.orm import Session
from database import engine, get_db
from models.department import Department
from models.administration import MeetingRoom

# Default departments (you can modify this list)
DEFAULT_DEPARTMENTS = [
    {"name": "IT", "name_ru": "ИТ"},
    {"name": "Administration", "name_ru": "Администрация"},
    {"name": "Transport", "name_ru": "Транспорт"},
    {"name": "HR", "name_ru": "HR"},
    {"name": "Finance", "name_ru": "Финансы"},
    {"name": "Translation", "name_ru": "Перевод"},
]

# Default meeting rooms
DEFAULT_MEETING_ROOMS = [
    {"name": "B Block 401 Left", "name_ru": "Блок B 401 Левая"},
    {"name": "B Block 402 Right", "name_ru": "Блок B 402 Правая"},
    {"name": "C Block 106", "name_ru": "Блок C 106"},
]


def seed_departments(db: Session):
    """Create default departments if they don't exist."""
    created = 0
    for dept_data in DEFAULT_DEPARTMENTS:
        existing = db.query(Department).filter(Department.name == dept_data["name"]).first()
        if not existing:
            dept = Department(
                name=dept_data["name"],
                name_ru=dept_data.get("name_ru"),
                is_active=True,
            )
            db.add(dept)
            created += 1
            print(f"✓ Created department: {dept_data['name']}")
        else:
            print(f"- Department already exists: {dept_data['name']}")
    db.commit()
    return created


def seed_meeting_rooms(db: Session):
    """Create default meeting rooms if they don't exist."""
    created = 0
    for room_data in DEFAULT_MEETING_ROOMS:
        existing = db.query(MeetingRoom).filter(MeetingRoom.name == room_data["name"]).first()
        if not existing:
            room = MeetingRoom(
                name=room_data["name"],
                name_ru=room_data.get("name_ru"),
                is_active=True,
            )
            db.add(room)
            created += 1
            print(f"✓ Created meeting room: {room_data['name']}")
        else:
            print(f"- Meeting room already exists: {room_data['name']}")
    db.commit()
    return created


def main():
    print("=" * 60)
    print("Seeding initial data for HelpDesk")
    print("=" * 60)
    
    db = next(get_db())
    try:
        dept_count = seed_departments(db)
        room_count = seed_meeting_rooms(db)
        
        print("\n" + "=" * 60)
        print(f"Summary:")
        print(f"  - Departments created: {dept_count}")
        print(f"  - Meeting rooms created: {room_count}")
        print("=" * 60)
        print("\nNote: Users are created automatically on first LDAP login.")
        print("After login, Global Admin should assign roles and departments in Admin panel.")
        print("\nDone.")
    except Exception as e:
        print(f"\n✗ Error: {e}", file=sys.stderr)
        db.rollback()
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
