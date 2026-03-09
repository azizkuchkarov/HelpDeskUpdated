"""One-time migration: create translator_tickets table and add file_category to file_attachments.
Run from backend directory: python add_translator_tables.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import engine, Base
from sqlalchemy import text

# Import model so create_all knows about it
from models.translator import TranslatorTicket  # noqa: F401


def run():
    # Create translator_tickets via SQLAlchemy (handles PostgreSQL/SQLite)
    Base.metadata.create_all(bind=engine, tables=[TranslatorTicket.__table__])
    print("OK: translator_tickets table")

    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE file_attachments ADD COLUMN IF NOT EXISTS file_category VARCHAR(50)"))
            conn.commit()
            print("OK: file_attachments.file_category")
        except Exception as e:
            if "already exists" in str(e).lower() or "duplicate" in str(e).lower():
                print("OK: file_attachments.file_category (already exists)")
            else:
                raise

if __name__ == "__main__":
    run()
