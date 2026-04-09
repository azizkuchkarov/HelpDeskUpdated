"""HelpDesk API - FastAPI application."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import get_settings
from database import engine, Base
from models import (  # noqa: F401 - register all tables
    Department,
    User,
    UserRole,
    UserApprover,
    ITTicket,
    ITTicketComment,
    AdmTicket,
    MeetingRoom,
    MeetingRoomBooking,
    TransportTicket,
    Car,
    Driver,
    TravelTicket,
    TravelTicketStat,
    TranslatorTicket,
    InventoryType,
    InventoryItem,
    PhoneDirectoryFile,
    TopManager,
    SecretaryTopManager,
    TopManagerAvailability,
    FileAttachment,
    TicketComment,
)
from routers import auth, admin, it, administration, transport, travel, top_managers, translator, inventory, phone_directory

# Create tables
Base.metadata.create_all(bind=engine)

# Initialize MinIO bucket
try:
    from services.minio_service import ensure_bucket
    ensure_bucket()
except Exception as e:
    print(f"Warning: MinIO bucket initialization failed: {e}")

app = FastAPI(title="HelpDesk API", version="1.0.0")
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(it.router, prefix="/api/it", tags=["it"])
app.include_router(administration.router, prefix="/api/administration", tags=["administration"])
app.include_router(transport.router, prefix="/api/transport", tags=["transport"])
app.include_router(travel.router, prefix="/api/travel", tags=["travel"])
app.include_router(top_managers.router, prefix="/api/top-managers", tags=["top-managers"])
app.include_router(translator.router, prefix="/api/translator", tags=["translator"])
app.include_router(inventory.router, prefix="/api/inventory", tags=["inventory"])
app.include_router(phone_directory.router, prefix="/api/phone-directory", tags=["phone-directory"])


@app.get("/api/health")
def health():
    return {"status": "ok"}
