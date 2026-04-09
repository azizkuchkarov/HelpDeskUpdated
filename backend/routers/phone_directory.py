"""Phone Directory: Admin uploads Excel, all users download."""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from database import get_db
from auth.deps import get_current_user
from models.user import User, UserRole
from models.phone_directory import PhoneDirectoryFile
from services.minio_service import upload_file, stream_object, content_disposition_for_filename

router = APIRouter()


def _is_global_admin(user: User, db: Session) -> bool:
    return db.query(UserRole).filter(
        UserRole.user_id == user.id,
        UserRole.role_type == "global_admin",
    ).first() is not None


@router.get("/info")
def get_latest_info(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get info about latest phone directory file. All users."""
    latest = (
        db.query(PhoneDirectoryFile)
        .order_by(PhoneDirectoryFile.uploaded_at.desc())
        .first()
    )
    if not latest:
        return {"file_name": None, "uploaded_at": None, "uploaded_by_name": None}
    return {
        "file_name": latest.file_name,
        "uploaded_at": latest.uploaded_at.isoformat() if latest.uploaded_at else None,
        "uploaded_by_name": (latest.uploaded_by.display_name or latest.uploaded_by.ldap_username) if latest.uploaded_by else None,
    }


@router.post("/upload")
async def upload_file_endpoint(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload Excel file. Global Admin only."""
    if not _is_global_admin(user, db):
        raise HTTPException(403, "Global Admin only")
    file_data = await file.read()
    if len(file_data) == 0:
        raise HTTPException(400, "File is empty")
    file_name = file.filename or "phone_directory.xlsx"
    if not file_name.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(400, "Only Excel files (.xlsx, .xls) are allowed")
    try:
        file_path = upload_file(
            file_data=file_data,
            content_type=file.content_type or "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            folder="phone-directory",
        )
    except Exception as e:
        raise HTTPException(500, f"Upload failed: {str(e)}")
    record = PhoneDirectoryFile(
        file_name=file_name,
        file_path=file_path,
        uploaded_by_id=user.id,
    )
    db.add(record)
    db.commit()
    return {
        "ok": True,
        "file_name": file_name,
        "uploaded_at": record.uploaded_at.isoformat() if record.uploaded_at else None,
    }


@router.get("/download")
def download_file(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Download latest phone directory Excel. All users."""
    latest = (
        db.query(PhoneDirectoryFile)
        .order_by(PhoneDirectoryFile.uploaded_at.desc())
        .first()
    )
    if not latest:
        raise HTTPException(404, "No phone directory file uploaded yet")
    try:
        return StreamingResponse(
            stream_object(latest.file_path),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": content_disposition_for_filename(latest.file_name)},
        )
    except Exception as e:
        raise HTTPException(500, f"Download failed: {str(e)}")
