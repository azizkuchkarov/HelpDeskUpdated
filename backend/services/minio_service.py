"""MinIO file storage service."""
import io
import re
import uuid
from urllib.parse import quote
from datetime import timedelta
from minio import Minio
from config import get_settings

_settings = get_settings()
_client = None


def get_minio_client() -> Minio:
    global _client
    if _client is None:
        _client = Minio(
            _settings.minio_endpoint,
            access_key=_settings.minio_access_key,
            secret_key=_settings.minio_secret_key,
            secure=_settings.minio_secure,
        )
    return _client


def ensure_bucket():
    client = get_minio_client()
    if not client.bucket_exists(_settings.minio_bucket):
        client.make_bucket(_settings.minio_bucket)


def upload_file(file_data: bytes, content_type: str, folder: str = "") -> str:
    """Upload file to MinIO, return object name (path)."""
    ensure_bucket()
    client = get_minio_client()
    ext = ""
    if content_type:
        if "pdf" in content_type:
            ext = ".pdf"
        elif "image" in content_type:
            ext = ".png"
        elif "word" in content_type or "document" in content_type:
            ext = ".docx"
        elif "spreadsheet" in content_type or "excel" in content_type:
            ext = ".xlsx"
    name = f"{folder}/{uuid.uuid4()}{ext}" if folder else f"{uuid.uuid4()}{ext}"
    client.put_object(
        _settings.minio_bucket,
        name,
        data=io.BytesIO(file_data),
        length=len(file_data),
        content_type=content_type or "application/octet-stream",
    )
    return name


def get_presigned_url(object_name: str, expires_seconds: int = 3600) -> str:
    """Get presigned URL for download."""
    client = get_minio_client()
    return client.presigned_get_object(_settings.minio_bucket, object_name, expires=timedelta(seconds=expires_seconds))


def stream_object(object_name: str):
    """Yield chunks of object content from MinIO. Caller must consume the generator fully."""
    client = get_minio_client()
    response = client.get_object(_settings.minio_bucket, object_name)
    try:
        for chunk in response.stream(amt=8192):
            yield chunk
    finally:
        response.close()
        response.release_conn()


def content_disposition_for_filename(filename: str) -> str:
    """Build Content-Disposition header value, handling non-ASCII filenames (RFC 5987)."""
    if not filename or not filename.strip():
        return 'attachment; filename="download"'
    name = filename.strip().replace('"', "'").replace("\r", "").replace("\n", " ")
    # ASCII-only fallback for old clients
    ascii_name = re.sub(r"[^\x00-\x7F]+", "_", name) or "download"
    if ascii_name == name:
        return f'attachment; filename="{ascii_name}"'
    # RFC 5987: filename*=UTF-8''percent-encoded
    encoded = quote(name, safe="")
    return f'attachment; filename="{ascii_name}"; filename*=UTF-8\'\'{encoded}'
