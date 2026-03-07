"""
One-time migration: add car_type, brand to cars and phone to drivers.
Run from backend directory: python add_car_driver_columns.py
"""
import sys
from sqlalchemy import text
from database import engine

STATEMENTS = [
    "ALTER TABLE cars ADD COLUMN IF NOT EXISTS car_type VARCHAR(255);",
    "ALTER TABLE cars ADD COLUMN IF NOT EXISTS brand VARCHAR(255);",
    "ALTER TABLE drivers ADD COLUMN IF NOT EXISTS phone VARCHAR(100);",
]


def main():
    with engine.connect() as conn:
        for sql in STATEMENTS:
            try:
                conn.execute(text(sql))
                parts = sql.split("TABLE ")[1].split(" ")
                table = parts[0]
                col = parts[3] if "COLUMN" in sql else "?"
                print(f"OK: {table}.{col}")
            except Exception as e:
                print(f"Skip or error: {e}", file=sys.stderr)
        conn.commit()
    print("Done.")


if __name__ == "__main__":
    main()
