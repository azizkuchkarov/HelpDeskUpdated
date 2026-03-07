"""
One-time migration: add manager_id to departments if missing.
Run from backend directory: python add_department_manager_column.py
"""
import sys
from sqlalchemy import text
from database import engine

def main():
    with engine.connect() as conn:
        try:
            conn.execute(text(
                "ALTER TABLE departments ADD COLUMN IF NOT EXISTS manager_id INTEGER REFERENCES users(id);"
            ))
            conn.commit()
            print("OK: departments.manager_id")
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            sys.exit(1)
    print("Done.")

if __name__ == "__main__":
    main()
