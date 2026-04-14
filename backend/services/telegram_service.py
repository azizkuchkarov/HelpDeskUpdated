"""Telegram notification helpers."""
from __future__ import annotations

from typing import Iterable
import logging

import httpx
from sqlalchemy.orm import Session

from config import get_settings
from models.user import User, UserRole

logger = logging.getLogger(__name__)


def _frontend_base_url() -> str:
    settings = get_settings()
    origins = [x.strip() for x in (settings.cors_origins or "").split(",") if x.strip()]
    return origins[0] if origins else ""


def _send_message(chat_id: str, text: str) -> bool:
    settings = get_settings()
    token = (settings.telegram_bot_token or "").strip()
    if not token or not chat_id:
        logger.warning("Telegram send skipped: missing token or chat_id")
        return False
    base = (settings.telegram_api_base_url or "https://api.telegram.org").rstrip("/")
    url = f"{base}/bot{token}/sendMessage"
    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.post(url, json={"chat_id": chat_id, "text": text})
            if resp.status_code >= 400:
                logger.warning("Telegram send failed: status=%s body=%s", resp.status_code, resp.text)
                return False
            data = resp.json() if resp.content else {}
            if isinstance(data, dict) and data.get("ok") is False:
                logger.warning("Telegram send failed: %s", data)
                return False
            return True
    except Exception as e:
        # Notifications should never break business flow.
        logger.warning("Telegram send exception: %s", e)
        return False


def _active_users_by_role(db: Session, role_type: str) -> list[User]:
    return (
        db.query(User)
        .join(UserRole, UserRole.user_id == User.id)
        .filter(User.is_active == True, UserRole.role_type == role_type)  # noqa: E712
        .distinct()
        .all()
    )


def _active_users_by_roles(db: Session, role_types: list[str]) -> list[User]:
    if not role_types:
        return []
    return (
        db.query(User)
        .join(UserRole, UserRole.user_id == User.id)
        .filter(User.is_active == True, UserRole.role_type.in_(role_types))  # noqa: E712
        .distinct()
        .all()
    )


def notify_users(users: Iterable[User], message: str) -> None:
    seen_user_ids: set[int] = set()
    seen_chat_ids: set[str] = set()
    for user in users:
        if user.id in seen_user_ids:
            continue
        chat_id = (getattr(user, "telegram_chat_id", None) or "").strip()
        if chat_id and chat_id not in seen_chat_ids:
            _send_message(chat_id, message)
            seen_chat_ids.add(chat_id)
        seen_user_ids.add(user.id)


def notify_it_new_ticket(db: Session, ticket_id: int, title: str, priority: str, created_by_name: str) -> None:
    url = _frontend_base_url()
    link = f"{url}/it" if url else ""
    message = (
        f"🆕 IT Ticket #{ticket_id}\n"
        f"Title: {title}\n"
        f"Priority: {priority}\n"
        f"By: {created_by_name}"
    )
    if link:
        message += f"\nLink: {link}"
    users = _active_users_by_roles(db, ["it_engineer", "it_admin"])
    notify_users(users, message)


def notify_it_assigned(ticket_id: int, title: str, assignee: User) -> None:
    url = _frontend_base_url()
    link = f"{url}/it" if url else ""
    message = (
        f"📌 IT Ticket #{ticket_id} assigned to you\n"
        f"Title: {title}"
    )
    if link:
        message += f"\nLink: {link}"
    notify_users([assignee], message)


def notify_travel_new_ticket(
    db: Session,
    ticket_id: int,
    priority: str,
    created_by_name: str,
    book_hotel: bool,
) -> None:
    url = _frontend_base_url()
    link = f"{url}/travel" if url else ""
    message = (
        f"✈️ Travel Ticket #{ticket_id}\n"
        f"Priority: {priority}\n"
        f"By: {created_by_name}"
    )
    if book_hotel:
        message += "\nHotel booking: Yes"
    if link:
        message += f"\nLink: {link}"
    users = _active_users_by_role(db, "adm_ticket_engineer")
    notify_users(users, message)


def notify_travel_hotel_booking(db: Session, ticket_id: int, created_by_name: str) -> None:
    url = _frontend_base_url()
    link = f"{url}/travel" if url else ""
    message = (
        f"🏨 Hotel booking requested\n"
        f"Travel Ticket #{ticket_id}\n"
        f"By: {created_by_name}"
    )
    if link:
        message += f"\nLink: {link}"
    users = _active_users_by_role(db, "hotel_engineer")
    notify_users(users, message)


def notify_transport_new_ticket(
    db: Session,
    ticket_id: int,
    ticket_type: str,
    destination: str,
    priority: str,
    created_by_name: str,
) -> None:
    url = _frontend_base_url()
    link = f"{url}/transport" if url else ""
    message = (
        f"🚗 Transport Ticket #{ticket_id}\n"
        f"Type: {ticket_type}\n"
        f"Destination: {destination}\n"
        f"Priority: {priority}\n"
        f"By: {created_by_name}"
    )
    if link:
        message += f"\nLink: {link}"
    users = _active_users_by_role(db, "transport_engineer")
    notify_users(users, message)


def send_test_message_to_user(user: User) -> bool:
    name = user.display_name or user.ldap_username
    message = f"✅ Test notification from HelpDesk\nUser: {name}"
    chat_id = (getattr(user, "telegram_chat_id", None) or "").strip()
    return _send_message(chat_id, message)
