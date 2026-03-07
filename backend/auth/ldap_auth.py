"""LDAP authentication. Supports OpenLDAP (uid) and Active Directory (sAMAccountName / UPN)."""
import logging
import re
import ldap3
from ldap3 import Server, Connection, ALL
from config import get_settings

logger = logging.getLogger(__name__)


def _entry_attr(entry, *keys: str, default: str = "") -> str:
    """Get first value for any of the given attribute keys from ldap3 Entry (case-insensitive)."""
    d = getattr(entry, "entry_attributes_as_dict", None) or {}
    for k in keys:
        for attr, val in d.items():
            if attr and attr.lower() == k.lower() and val:
                return str(val[0]) if isinstance(val, (list, tuple)) else str(val)
    return default


def _domain_from_base_dn(base_dn: str) -> str:
    """Derive domain from base DN: DC=atg,DC=uz -> atg.uz"""
    parts = re.findall(r"DC=([^,]+)", base_dn, re.IGNORECASE)
    return ".".join(parts) if parts else ""


def verify_ldap(username: str, password: str) -> dict | None:
    """
    Verify user against LDAP. Returns user info dict if successful, None otherwise.
    Supports:
    - openldap: bind with uid=username,base_dn
    - ad (Active Directory): bind with username@domain (UPN) or DOMAIN\\username
    """
    settings = get_settings()
    style = (getattr(settings, "ldap_auth_style", None) or "ad").lower().strip()
    server = Server(
        settings.ldap_server,
        port=settings.ldap_port,
        use_ssl=settings.ldap_use_ssl,
        get_info=ALL,
    )
    try:
        if style == "ad":
            domain = (getattr(settings, "ldap_domain", None) or "").strip() or _domain_from_base_dn(settings.ldap_base_dn)
            # Determine bind user: if already UPN (contains @) or DOMAIN\user format, use as-is
            if "@" in username:
                # Already UPN format: a.kuchkarov@atg.uz
                bind_user = username
                sam_account = username.split("@")[0]  # Extract username part for search
            elif "\\" in username:
                # DOMAIN\username format: ATG\a.kuchkarov
                bind_user = username
                sam_account = username.split("\\")[-1]  # Extract username part
            else:
                # Plain username: a.kuchkarov -> convert to UPN
                bind_user = f"{username}@{domain}" if domain else username
                sam_account = username
            conn = Connection(
                server,
                user=bind_user,
                password=password,
                auto_bind=True,
            )
            # Optionally fetch display name from AD (sAMAccountName = sam_account)
            try:
                conn.search(
                    search_base=settings.ldap_base_dn,
                    search_filter=f"(sAMAccountName={sam_account})",
                    search_scope=ldap3.SUBTREE,
                    attributes=["cn", "mail", "displayName", "givenName", "sn", "sAMAccountName"],
                )
                entry = conn.entries[0] if conn.entries else None
            except Exception as search_err:
                logger.debug("LDAP AD search after bind failed: %s", search_err)
                entry = None
            conn.unbind()
            # Use sam_account as the stored username (without @domain)
            stored_username = sam_account
            if entry:
                return {
                    "username": stored_username,
                    "display_name": _entry_attr(entry, "displayName", "cn", default=stored_username),
                    "email": _entry_attr(entry, "mail"),
                }
            # Bind succeeded but search failed - still return success (we have valid auth)
            logger.debug("LDAP bind succeeded for %s but user search returned no results", bind_user)
            return {"username": stored_username, "display_name": stored_username, "email": ""}
        else:
            # OpenLDAP: uid=username,base_dn
            user_dn = f"uid={username},{settings.ldap_base_dn}"
            conn = Connection(
                server,
                user=user_dn,
                password=password,
                auto_bind=True,
            )
            conn.search(
                search_base=settings.ldap_base_dn,
                search_filter=f"(uid={username})",
                search_scope=ldap3.SUBTREE,
                attributes=["cn", "mail", "displayName", "givenName", "sn"],
            )
            entry = conn.entries[0] if conn.entries else None
            conn.unbind()
            if entry:
                return {
                    "username": username,
                    "display_name": _entry_attr(entry, "displayName", "cn", default=username),
                    "email": _entry_attr(entry, "mail"),
                }
            return {"username": username, "display_name": username, "email": ""}
    except Exception as e:
        logger.warning("LDAP auth failed for user %s: %s", username, e, exc_info=False)
        return None
