"""Add translator_started_at and confirmed_by_user_at to translator_tickets.
Run from backend directory: python add_translator_confirm_columns.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from database import engine


def main():
    # PostgreSQL uses TIMESTAMP; SQLite uses DATETIME
    col_type = "TIMESTAMP" if "postgresql" in str(engine.url) else "DATETIME"
    with engine.connect() as conn:
        for col in ["translator_started_at", "translator_submitted_at", "confirmed_by_user_at"]:
            try:
                conn.execute(text(f"ALTER TABLE translator_tickets ADD COLUMN IF NOT EXISTS {col} {col_type}"))
                conn.commit()
                print(f"OK: translator_tickets.{col}")
            except Exception as e:
                if "already exists" in str(e).lower() or "duplicate" in str(e).lower():
                    print(f"OK: translator_tickets.{col} (already exists)")
                else:
                    print(f"Error: {e}", file=sys.stderr)
                    raise


if __name__ == "__main__":
    main()
