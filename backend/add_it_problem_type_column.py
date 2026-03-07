"""
One-time migration: add problem_type to it_tickets if missing.
Run from backend directory: python add_it_problem_type_column.py
"""
import sys
from sqlalchemy import text
from database import engine


def main():
    with engine.connect() as conn:
        try:
            conn.execute(
                text(
                    "ALTER TABLE it_tickets "
                    "ADD COLUMN IF NOT EXISTS problem_type VARCHAR(50);"
                )
            )
            conn.commit()
            print("OK: it_tickets.problem_type")
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            sys.exit(1)
    print("Done.")


if __name__ == "__main__":
    main()
