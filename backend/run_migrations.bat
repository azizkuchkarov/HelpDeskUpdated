@echo off
REM Run database migrations and seed initial data (Windows)

echo Running database migrations...

python add_priority_columns.py
python add_department_manager_column.py
python add_transport_approver_column.py
python add_transport_fields_column.py
python add_transport_start_time_column.py
python add_it_problem_type_column.py
python add_car_driver_columns.py
python make_meeting_subject_nullable.py
python add_file_attachments_table.py
python add_translator_tables.py

echo Migrations completed!

echo.
echo Seeding initial data (departments, meeting rooms)...
python seed_data.py

echo.
echo All done!
