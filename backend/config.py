"""Application configuration."""
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # PostgreSQL
    database_url: str = "postgresql://postgres:postgre@192.168.2.18:5432/HelpDesk"

    # LDAP
    ldap_server: str = "DC03.atg.uz"
    ldap_port: int = 389
    ldap_use_ssl: bool = False
    ldap_base_dn: str = "DC=atg,DC=uz"
    ldap_bind_dn: str = ""
    ldap_bind_password: str = ""
    # Auth style: "openldap" (uid=user,base_dn) or "ad" (Active Directory: user@domain)
    ldap_auth_style: str = "ad"
    # For AD: domain for UPN, e.g. "atg.uz". If empty, derived from ldap_base_dn (DC=atg,DC=uz -> atg.uz).
    ldap_domain: str = ""

    # MinIO
    minio_endpoint: str = "192.168.2.18:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "helpdesk-files"
    minio_secure: bool = False

    # JWT
    jwt_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480

    # App
    cors_origins: str = "http://192.168.2.18:3000"
    # First user to log in gets Global Admin (for local dev). Set to false in production.
    auto_admin_first_user: bool = True
    # Local admin (bypass LDAP). Faqat lokal uchun. Production da bo'sh qoldiring.
    local_admin_username: str = ""
    local_admin_password: str = ""
    # Qo'shimcha local userlar: "user1:1234,user2:1234,..." (LDAP siz kirish)
    local_users: str = ""

    # GeoNames username for travel autocomplete
    geonames_username: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"


def _parse_local_users(s: str) -> list[tuple[str, str]]:
    out = []
    for part in (s or "").strip().split(","):
        part = part.strip()
        if ":" in part:
            u, p = part.split(":", 1)
            if u.strip() and p.strip():
                out.append((u.strip(), p.strip()))
    return out


@lru_cache
def get_settings() -> Settings:
    return Settings()


def get_local_users_list() -> list[tuple[str, str]]:
    return _parse_local_users(get_settings().local_users)
