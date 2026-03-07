"""
One-time migration: add start_date and start_time to transport_tickets, remove return_date and return_time.
Run from backend directory: python add_transport_start_time_column.py
"""
import sys
from sqlalchemy import text
from database import engine


def main():
    with engine.connect() as conn:
        try:
            # Add new columns
            conn.execute(
                text(
                    "ALTER TABLE transport_tickets "
                    "ADD COLUMN IF NOT EXISTS start_date TIMESTAMP;"
                )
            )
            conn.execute(
                text(
                    "ALTER TABLE transport_tickets "
                    "ADD COLUMN IF NOT EXISTS start_time VARCHAR(50);"
                )
            )
            # Note: We keep return_date and return_time columns for now to avoid data loss
            # They can be dropped later if needed: DROP COLUMN IF EXISTS return_date, return_time
            conn.commit()
            print("OK: transport_tickets.start_date")
            print("OK: transport_tickets.start_time")
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            sys.exit(1)
    print("Done.")


if __name__ == "__main__":
    main()
