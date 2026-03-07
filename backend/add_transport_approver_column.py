"""
One-time migration: add approver_id to transport_tickets if missing.
Run from backend directory: python add_transport_approver_column.py
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
                    "ADD COLUMN IF NOT EXISTS approver_id INTEGER REFERENCES users(id);"
                )
            )
            conn.commit()
            print("OK: transport_tickets.approver_id")
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            sys.exit(1)
    print("Done.")


if __name__ == "__main__":
    main()

