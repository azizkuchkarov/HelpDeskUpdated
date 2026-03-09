"""
Seed default inventory types. Run once.
From backend directory: python seed_inventory_types.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal
from models.inventory import InventoryType

DEFAULT_TYPES = [
    ("PC", "ПК", "Компьютер"),
    ("Laptop", "Ноутбук", "Ноутбук"),
    ("Monitor", "Монитор", "Монитор"),
    ("Phone", "Телефон", "Телефон"),
    ("SIM Card", "SIM-карта", "SIM-карта"),
    ("Notebook", "Блокнот", "Блокнот"),
    ("Table", "Стол", "Стол"),
    ("Chair", "Стул", "Стул"),
    ("Keyboard", "Клавиатура", "Клавиатура"),
    ("Mouse", "Мышь", "Мышь"),
    ("Headset", "Гарнитура", "Гарнитура"),
    ("Other", "Другое", "Другое"),
]

def main():
    db = SessionLocal()
    try:
        for name, name_ru, desc in DEFAULT_TYPES:
            existing = db.query(InventoryType).filter(InventoryType.name == name).first()
            if not existing:
                t = InventoryType(name=name, name_ru=name_ru, description=desc)
                db.add(t)
                print(f"Added: {name}")
        db.commit()
        print("Done.")
    finally:
        db.close()

if __name__ == "__main__":
    main()
