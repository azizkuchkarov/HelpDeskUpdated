"""Add IT Project Management columns/tables if missing (idempotent)."""
from sqlalchemy import text
from database import engine, Base
from models.project_management import (  # noqa: F401
    ITProject,
    ProjectMember,
    ProjectRequest,
    TesterTask,
    PMTeamInfo,
    PMModuleSettings,
)


def column_exists(conn, table: str, column: str) -> bool:
    row = conn.execute(
        text(
            """
            SELECT 1 FROM information_schema.columns
            WHERE table_name = :table AND column_name = :column
            """
        ),
        {"table": table, "column": column},
    ).fetchone()
    return row is not None


def main():
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        if not column_exists(conn, "it_projects", "info"):
            conn.execute(text("ALTER TABLE it_projects ADD COLUMN info TEXT"))
            print("Added it_projects.info")
        else:
            print("it_projects.info already exists")
        if not column_exists(conn, "project_requests", "tester_task_id"):
            conn.execute(
                text(
                    "ALTER TABLE project_requests ADD COLUMN tester_task_id INTEGER "
                    "REFERENCES tester_tasks(id)"
                )
            )
            print("Added project_requests.tester_task_id")
        else:
            print("project_requests.tester_task_id already exists")
        if not column_exists(conn, "pm_team_info", "photo_path"):
            conn.execute(text("ALTER TABLE pm_team_info ADD COLUMN photo_path VARCHAR(1000)"))
            print("Added pm_team_info.photo_path")
        else:
            print("pm_team_info.photo_path already exists")
        if not column_exists(conn, "it_projects", "external_url"):
            conn.execute(text("ALTER TABLE it_projects ADD COLUMN external_url VARCHAR(1000)"))
            print("Added it_projects.external_url")
        else:
            print("it_projects.external_url already exists")
        if not column_exists(conn, "project_requests", "rating"):
            conn.execute(text("ALTER TABLE project_requests ADD COLUMN rating INTEGER"))
            print("Added project_requests.rating")
        else:
            print("project_requests.rating already exists")
        if not column_exists(conn, "project_requests", "rated_at"):
            conn.execute(text("ALTER TABLE project_requests ADD COLUMN rated_at TIMESTAMP"))
            print("Added project_requests.rated_at")
        else:
            print("project_requests.rated_at already exists")
    print("Done.")


if __name__ == "__main__":
    main()
