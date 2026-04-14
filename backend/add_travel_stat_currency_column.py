"""
One-time migration: add currency column to travel_ticket_stats.
Run from backend directory: python add_travel_stat_currency_column.py
"""
import sys
from sqlalchemy import text
from database import engine

SQL = "ALTER TABLE travel_ticket_stats ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'UZS';"


def main():
    with engine.connect() as conn:
        try:
            conn.execute(text(SQL))
            conn.commit()
            print("OK: travel_ticket_stats.currency")
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            sys.exit(1)
    print("Done.")


if __name__ == "__main__":
    main()
