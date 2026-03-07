"""
One-time migration: add `comment` column to availability_statuses for Top Manager "not at work" comments.
Run from backend directory: python add_availability_comment_column.py
"""
import sys
from sqlalchemy import text
from database import engine

SQL = "ALTER TABLE availability_statuses ADD COLUMN IF NOT EXISTS comment VARCHAR(1000);"

def main():
    with engine.connect() as conn:
        try:
            conn.execute(text(SQL))
            conn.commit()
            print("OK: availability_statuses.comment")
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            sys.exit(1)
    print("Done.")

if __name__ == "__main__":
    main()
