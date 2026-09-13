"""IT Project Management: projects, members, change/bug requests, testing, team info."""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, UniqueConstraint, Date
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class ITProject(Base):
    __tablename__ = "it_projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    info = Column(Text, nullable=True)
    external_url = Column(String(1000), nullable=True)  # Live system URL (HR, Budget, etc.)
    status = Column(String(50), default="active")  # active, on_hold, completed
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    deadline = Column(Date, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    created_by = relationship("User", foreign_keys=[created_by_id])
    members = relationship("ProjectMember", back_populates="project", cascade="all, delete-orphan")
    requests = relationship("ProjectRequest", back_populates="project", cascade="all, delete-orphan")
    tester_tasks = relationship("TesterTask", back_populates="project", cascade="all, delete-orphan")


class ProjectMember(Base):
    __tablename__ = "project_members"
    __table_args__ = (
        UniqueConstraint("project_id", "user_id", "member_role", name="uq_project_member_role"),
    )

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("it_projects.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    member_role = Column(String(50), nullable=False)  # coder | tester
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("ITProject", back_populates="members")
    user = relationship("User", foreign_keys=[user_id])


class TesterTask(Base):
    """Coder assigns a testing task to a project tester."""
    __tablename__ = "tester_tasks"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("it_projects.id"), nullable=False)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(50), default="open")  # open, in_testing, done
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_tester_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    done_at = Column(DateTime, nullable=True)

    project = relationship("ITProject", back_populates="tester_tasks")
    created_by = relationship("User", foreign_keys=[created_by_id])
    assigned_tester = relationship("User", foreign_keys=[assigned_tester_id])
    bug_reports = relationship("ProjectRequest", back_populates="tester_task")


class ProjectRequest(Base):
    __tablename__ = "project_requests"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("it_projects.id"), nullable=False)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    request_type = Column(String(50), nullable=False)  # change_request | bug_report
    status = Column(String(50), default="open")  # open, in_progress, closed_by_coder, closed
    priority = Column(String(50), default="medium")  # low, medium, high, urgent
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_coder_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    tester_task_id = Column(Integer, ForeignKey("tester_tasks.id"), nullable=True)
    deadline = Column(Date, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    closed_at = Column(DateTime, nullable=True)
    confirmed_at = Column(DateTime, nullable=True)

    project = relationship("ITProject", back_populates="requests")
    created_by = relationship("User", foreign_keys=[created_by_id])
    assigned_coder = relationship("User", foreign_keys=[assigned_coder_id])
    tester_task = relationship("TesterTask", back_populates="bug_reports")


class PMTeamInfo(Base):
    """Admin-managed information about PM roles / people (Information tab)."""
    __tablename__ = "pm_team_info"

    id = Column(Integer, primary_key=True, index=True)
    role_type = Column(String(64), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    display_name = Column(String(255), nullable=False)
    title = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    photo_path = Column(String(1000), nullable=True)
    sort_order = Column(Integer, default=0)
    is_active = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id])


class PMModuleSettings(Base):
    """Module intro / information text."""
    __tablename__ = "pm_module_settings"

    id = Column(Integer, primary_key=True, index=True)
    intro_title = Column(String(255), nullable=True)
    intro_body = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
