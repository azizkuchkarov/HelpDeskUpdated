"""Add telegram_chat_id to users table.
Run from backend directory: python add_telegram_chat_id_column.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import text
from database import engine


def main():
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_chat_id VARCHAR(64)"))
            conn.commit()
            print("OK: users.telegram_chat_id")
        except Exception as e:
            if "already exists" in str(e).lower() or "duplicate" in str(e).lower():
                print("OK: users.telegram_chat_id (already exists)")
            else:
                print(f"Error: {e}", file=sys.stderr)
                raise


if __name__ == "__main__":
    main()
