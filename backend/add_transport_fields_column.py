"""
One-time migration: add from_location and approximate_time to transport_tickets if missing.
Run from backend directory: python add_transport_fields_column.py
"""
import sys
from sqlalchemy import text
from database import engine


def main():
    with engine.connect() as conn:
        try:
            conn.execute(
                text(
                    "ALTER TABLE transport_tickets "
                    "ADD COLUMN IF NOT EXISTS from_location VARCHAR(500);"
                )
            )
            conn.execute(
                text(
                    "ALTER TABLE transport_tickets "
                    "ADD COLUMN IF NOT EXISTS approximate_time VARCHAR(50);"
                )
            )
            conn.commit()
            print("OK: transport_tickets.from_location")
            print("OK: transport_tickets.approximate_time")
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            sys.exit(1)
    print("Done.")


if __name__ == "__main__":
    main()
