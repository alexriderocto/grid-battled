"""Commander login pass: an httpOnly cookie holding a random token (only its SHA-256 is stored).

The 6-digit access code is checked once at /game/join; afterwards every commander call is
authenticated by this cookie, so the browser never has to keep the code anywhere.
"""

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Request, Response

from lib.db import db

COOKIE = "gb_session"
COOKIE_PATH = "/api"
LIFETIME = timedelta(days=30)


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _is_https(request: Request) -> bool:
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    return proto.split(",")[0].strip() == "https"


async def issue(request: Request, response: Response, player_id: str) -> None:
    """Start a new login pass for this commander and set it on the response."""
    now = datetime.now(timezone.utc)
    token = secrets.token_urlsafe(32)
    await db.sessions.insert_one(
        {"token_hash": _hash(token), "player_id": player_id, "created_at": now, "expires_at": now + LIFETIME}
    )
    response.set_cookie(
        COOKIE,
        token,
        max_age=int(LIFETIME.total_seconds()),
        httponly=True,
        samesite="lax",
        secure=_is_https(request),
        path=COOKIE_PATH,
    )


async def current_player(request: Request) -> dict | None:
    """The raw player doc behind this request's login pass, or None if absent/expired/eliminated."""
    token = request.cookies.get(COOKIE)
    if not token:
        return None
    session = await db.sessions.find_one(
        {"token_hash": _hash(token), "expires_at": {"$gt": datetime.now(timezone.utc)}}
    )
    if not session:
        return None
    doc = await db.players.find_one({"id": session["player_id"]})
    if not doc:  # commander was eliminated/banned — the pass dies with them
        await db.sessions.delete_one({"_id": session["_id"]})
    return doc


async def revoke(request: Request, response: Response) -> None:
    token = request.cookies.get(COOKIE)
    if token:
        await db.sessions.delete_one({"token_hash": _hash(token)})
    response.delete_cookie(COOKIE, path=COOKIE_PATH)


async def revoke_player(player_id: str) -> None:
    """End every login pass of a commander (eliminated, killed or banned)."""
    await db.sessions.delete_many({"player_id": player_id})
