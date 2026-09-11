"""Add admin-review related columns to translator_tickets.

Run from backend directory:
  python add_translator_admin_review_columns.py
"""

from sqlalchemy import text

from database import engine


def _col_sql(col: str) -> str:
    # SQLite/Postgres compatible type
    # (existing migration scripts use DATETIME too)
    return f"ALTER TABLE translator_tickets ADD COLUMN IF NOT EXISTS {col} DATETIME"


def main() -> None:
    with engine.begin() as conn:
        for col in ["checkin_completed_at", "admin_approved_at"]:
            try:
                conn.execute(text(_col_sql(col)))
                print(f"OK: translator_tickets.{col}")
            except Exception:
                # Some DBs (older SQLite) may not support IF NOT EXISTS.
                # If it already exists, we ignore.
                try:
                    conn.execute(text(f"SELECT {col} FROM translator_tickets LIMIT 1"))
                    print(f"OK: translator_tickets.{col} (already exists)")
                except Exception as e:
                    raise RuntimeError(f"Failed to add/verify column {col}: {e}") from e


if __name__ == "__main__":
    main()

