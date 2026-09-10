"""Avatar storage via Supabase Storage.

Uploads happen server-side using the Supabase service_role key, so there's no
browser CORS involved and it works for password users too (who aren't Firebase-
authed). Returns a public URL to store in Postgres.

Requires a PUBLIC bucket (default name "avatars") in the Supabase project, plus
SUPABASE_URL + SUPABASE_SERVICE_KEY in the environment.

This function does blocking network I/O (httpx sync client); the /me/avatar
route offloads it to a threadpool so the event loop stays responsive.
"""
from __future__ import annotations

import uuid

import httpx
from fastapi import HTTPException

from app.core.config import settings

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_BYTES = 5 * 1024 * 1024  # 5 MB
EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}


def upload_avatar(user_id: int, data: bytes, content_type: str) -> str:
    """Upload avatar bytes to Supabase Storage and return a public URL.

    Raises HTTPException on any validation or upload failure.
    """
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail="Please upload a JPG, PNG, WEBP, or GIF image.")
    if len(data) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="Image is too large (max 5 MB).")

    base = settings.SUPABASE_URL
    key = settings.SUPABASE_SERVICE_KEY
    bucket = settings.SUPABASE_AVATAR_BUCKET
    if not base or not key:
        raise HTTPException(
            status_code=503,
            detail="Storage isn't configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY.",
        )

    path = f"{user_id}/{uuid.uuid4().hex}.{EXT[content_type]}"
    upload_url = f"{base}/storage/v1/object/{bucket}/{path}"
    headers = {
        "Authorization": f"Bearer {key}",
        "apikey": key,
        "Content-Type": content_type,
        # Overwrite if the same object path somehow already exists.
        "x-upsert": "true",
        "cache-control": "3600",
    }

    try:
        resp = httpx.post(upload_url, content=data, headers=headers, timeout=30.0)
    except Exception as exc:  # noqa: BLE001 — network/DNS/timeout
        raise HTTPException(
            status_code=502,
            detail=f"Couldn't reach storage. {type(exc).__name__}: {exc}",
        ) from exc

    if resp.status_code not in (200, 201):
        # Surface Supabase's own message so the cause is visible (e.g. bucket
        # not found, RLS/permission, invalid key).
        detail = resp.text.strip() or f"Upload failed ({resp.status_code})."
        raise HTTPException(status_code=502, detail=f"Storage upload failed: {detail}")

    # Public bucket -> deterministic public URL, no signing needed.
    return f"{base}/storage/v1/object/public/{bucket}/{path}"


def delete_user_avatars(user_id: int) -> None:
    """Delete every avatar object stored under this user's folder.

    Best-effort: swallows errors so it can be used during account deletion
    without ever blocking the DB delete. Avatars live under "{user_id}/..."
    so this can't touch shared assets (e.g. the email logo under "assets/").
    """
    base = settings.SUPABASE_URL
    key = settings.SUPABASE_SERVICE_KEY
    bucket = settings.SUPABASE_AVATAR_BUCKET
    if not base or not key:
        return

    headers = {"Authorization": f"Bearer {key}", "apikey": key}
    prefix = str(user_id)

    try:
        # List everything in the user's folder.
        list_resp = httpx.post(
            f"{base}/storage/v1/object/list/{bucket}",
            headers={**headers, "Content-Type": "application/json"},
            json={"prefix": f"{prefix}/", "limit": 1000},
            timeout=20.0,
        )
        if list_resp.status_code != 200:
            return
        items = list_resp.json() or []
        names = [f"{prefix}/{it['name']}" for it in items if it.get("name")]
        if not names:
            return

        # Bulk delete by full object paths.
        httpx.request(
            "DELETE",
            f"{base}/storage/v1/object/{bucket}",
            headers={**headers, "Content-Type": "application/json"},
            json={"prefixes": names},
            timeout=20.0,
        )
    except Exception:  # noqa: BLE001 — never let cleanup break account deletion
        pass
