from __future__ import annotations

import re
import secrets
import unicodedata
from datetime import datetime, timedelta, timezone

ID_PATTERN = re.compile(r"^[a-f0-9]{16}$")


def new_id() -> str:
    """Random, URL-safe identifier used for models, jobs and history entries."""
    return secrets.token_hex(8)


def is_valid_id(value: str) -> bool:
    return bool(ID_PATTERN.match(value))


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def to_iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def now_iso() -> str:
    return to_iso(utcnow())


def iso_in(hours: float) -> str:
    return to_iso(utcnow() + timedelta(hours=hours))


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


_UNSAFE_CHARS = re.compile(r"[^A-Za-z0-9._\- ()\[\]]+")


def display_filename(name: str | None, fallback: str = "file") -> str:
    """Return a printable version of a client supplied filename.

    The result is only ever used for display. Files are stored under
    server-generated names, so this never influences filesystem paths.
    """
    if not name:
        return fallback
    name = name.replace("\\", "/").split("/")[-1]
    name = unicodedata.normalize("NFKC", name)
    name = _UNSAFE_CHARS.sub("_", name).strip(" .")
    return (name[:120] or fallback)


def file_extension(name: str | None) -> str:
    if not name or "." not in name:
        return ""
    return name.rsplit(".", 1)[-1].lower()
