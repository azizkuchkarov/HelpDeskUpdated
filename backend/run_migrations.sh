#!/bin/bash
# Run database migrations
# This script should be run inside the backend container

echo "Running database migrations..."

# Add department manager column if not exists
python add_department_manager_column.py

# Add transport approver column if not exists
python add_transport_approver_column.py

# Add IT problem_type column if not exists
python add_it_problem_type_column.py

# Add transport start_date/start_time columns if not exists
python add_transport_start_time_column.py

# Make meeting subject nullable if not already
python make_meeting_subject_nullable.py

echo "Migrations completed!"

echo ""
echo "Seeding initial data (departments, meeting rooms)..."
python seed_data.py

echo ""
echo "All done!"
