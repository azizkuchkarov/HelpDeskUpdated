"""Add phone_number to users and requester_phone to ticket tables.
Run from backend directory: python add_phone_columns.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from database import engine


def main():
    col_type = "VARCHAR(50)" if "postgresql" in str(engine.url) else "VARCHAR(50)"
    changes = [
        ("users", "phone_number"),
        ("it_tickets", "requester_phone"),
        ("adm_tickets", "requester_phone"),
        ("transport_tickets", "requester_phone"),
        ("travel_tickets", "requester_phone"),
        ("translator_tickets", "requester_phone"),
    ]
    with engine.connect() as conn:
        for table, col in changes:
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {col_type}"))
                conn.commit()
                print(f"OK: {table}.{col}")
            except Exception as e:
                if "already exists" in str(e).lower() or "duplicate" in str(e).lower():
                    print(f"OK: {table}.{col} (already exists)")
                else:
                    print(f"Error: {e}", file=sys.stderr)
                    raise


if __name__ == "__main__":
    main()
