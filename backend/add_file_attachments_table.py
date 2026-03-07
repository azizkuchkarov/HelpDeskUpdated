"""
One-time migration: create file_attachments table.
Run from backend directory: python add_file_attachments_table.py
"""
import sys
from sqlalchemy import text
from database import engine


def main():
    with engine.connect() as conn:
        try:
            # Create file_attachments table
            conn.execute(
                text("""
                    CREATE TABLE IF NOT EXISTS file_attachments (
                        id SERIAL PRIMARY KEY,
                        ticket_type VARCHAR(50) NOT NULL,
                        ticket_id INTEGER NOT NULL,
                        file_name VARCHAR(500) NOT NULL,
                        file_path VARCHAR(1000) NOT NULL,
                        file_size INTEGER NOT NULL,
                        content_type VARCHAR(255),
                        uploaded_by_id INTEGER NOT NULL REFERENCES users(id),
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    );
                """)
            )
            # Create index for faster lookups
            conn.execute(
                text("""
                    CREATE INDEX IF NOT EXISTS idx_file_attachments_ticket 
                    ON file_attachments(ticket_type, ticket_id);
                """)
            )
            conn.commit()
            print("OK: file_attachments table created")
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            sys.exit(1)
    print("Done.")


if __name__ == "__main__":
    main()
