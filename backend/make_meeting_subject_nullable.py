"""
One-time migration: make subject nullable in meeting_room_bookings.
Run from backend directory: python make_meeting_subject_nullable.py
"""
import sys
from sqlalchemy import text
from database import engine


def main():
    with engine.connect() as conn:
        try:
            conn.execute(
                text(
                    "ALTER TABLE meeting_room_bookings "
                    "ALTER COLUMN subject DROP NOT NULL;"
                )
            )
            conn.commit()
            print("OK: meeting_room_bookings.subject is now nullable")
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            sys.exit(1)
    print("Done.")


if __name__ == "__main__":
    main()
