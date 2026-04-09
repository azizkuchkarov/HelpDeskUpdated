-- IT tickets: flag when closed automatically after 48h without user confirmation
-- PostgreSQL:
ALTER TABLE it_tickets
ADD COLUMN IF NOT EXISTS auto_closed_by_system BOOLEAN NOT NULL DEFAULT FALSE;
