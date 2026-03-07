# HelpDesk System

Internal HelpDesk: IT, Administration, Transport, Travel tickets, Top Managers availability.  
3 languages: English, Russian, Chinese.  
Auth: LDAP. DB: PostgreSQL. Files: MinIO.

## Stack

- **Backend:** Python, FastAPI, SQLAlchemy, PostgreSQL, LDAP (ldap3), MinIO
- **Frontend:** Next.js 14, TypeScript, Tailwind CSS

## Backend setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate   # Windows
# source venv/bin/activate  # Linux/Mac
pip install -r requirements.txt
cp .env.example .env
# Edit .env: DATABASE_URL, LDAP_SERVER (DC03.atg.uz), MINIO_*, JWT_SECRET_KEY
```

Create DB and run migrations:

```bash
# Ensure PostgreSQL has database HelpDesk (owner postgres, password postgre)

# Run migrations and seed initial data
# Windows:
run_migrations.bat

# Linux/Mac:
chmod +x run_migrations.sh
./run_migrations.sh

# Or manually:
python add_priority_columns.py
python add_department_manager_column.py
python add_transport_approver_column.py
python add_transport_fields_column.py
python add_transport_start_time_column.py
python add_it_problem_type_column.py
python add_car_driver_columns.py
python make_meeting_subject_nullable.py
python add_file_attachments_table.py
python seed_data.py  # Creates default departments and meeting rooms
```

Then start the server:

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Important:** 
- Tables are created on first run via `Base.metadata.create_all()`
- Default departments and meeting rooms are created by `seed_data.py`
- First LDAP login creates the user in DB; Global Admin must assign roles and departments in Admin panel
- **When cloning from GitHub:** Run migrations and seed data script to get initial departments and meeting rooms

## Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Set `NEXT_PUBLIC_API_URL=http://localhost:8000/api` in `.env.local` if API is on another host.

## Access from other PCs / networks

If the app works on this PC but **not from other computers or networks**, see **[NETWORK_ACCESS.md](NETWORK_ACCESS.md)**. In short: set the server’s IP in `NEXT_PUBLIC_API_URL` and `CORS_ORIGINS`, rebuild the frontend (when using Docker), and allow ports 3000 and 8000 in Windows Firewall.

## Sections (summary)

- **IT:** User opens ticket → IT Admin assigns to IT Engineer → Engineer resolves and closes → User confirms.
- **Administration:** Service, Supply, Meeting Room (with optional IT). Direct to Administration Engineer; Manager monitoring.
- **Transport:** Daily (Manager approve) / Overtime & Maxsus (Manager + HR approve). Transport Engineer assigns car/driver.
- **Travel:** User requests tickets; Administration Ticket Engineer fulfills and records stats; Administration Manager sees stats.
- **Top Managers:** Secretary sets at work / not at work; all users see availability.

Admin panel (Global Admin): departments, users, approvers (who approves whose tickets), roles, meeting rooms, cars, drivers, top managers.

## Default meeting rooms (seed)

Add via Admin → Meeting Rooms:

- B Block 401 Left
- B Block 402 Right  
- C Block 106

Cars and drivers: add via Admin; you can provide lists later.
"# HelpDeskUpdated" 
