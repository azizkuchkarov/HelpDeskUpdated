"""
One-time migration: add book_hotel column to travel_tickets.
Run from backend directory: python add_travel_book_hotel_column.py
"""
import sys
from sqlalchemy import text
from database import engine

SQL = "ALTER TABLE travel_tickets ADD COLUMN IF NOT EXISTS book_hotel BOOLEAN DEFAULT FALSE;"

def main():
    with engine.connect() as conn:
        try:
            conn.execute(text(SQL))
            conn.commit()
            print("OK: travel_tickets.book_hotel")
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            sys.exit(1)
    print("Done.")

if __name__ == "__main__":
    main()
