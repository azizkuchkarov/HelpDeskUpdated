"""
One-time migration: add `priority` column to ticket tables if missing.
Run from backend directory: python add_priority_columns.py
"""
import sys
from sqlalchemy import text
from database import engine

STATEMENTS = [
    "ALTER TABLE it_tickets ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'medium';",
    "ALTER TABLE adm_tickets ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'medium';",
    "ALTER TABLE transport_tickets ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'medium';",
    "ALTER TABLE travel_tickets ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'medium';",
]

def main():
    with engine.connect() as conn:
        for sql in STATEMENTS:
            try:
                conn.execute(text(sql))
                table = sql.split("TABLE ")[1].split(" ")[0]
                print(f"OK: {table}")
            except Exception as e:
                print(f"Skip or error: {e}", file=sys.stderr)
        conn.commit()
    print("Done.")

if __name__ == "__main__":
    main()
