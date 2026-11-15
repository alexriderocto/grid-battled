"""Admin console: kill, ban/unban, set range, give AP. Every call re-checks ADMIN_PASSWORD.

Brute-force guard: 5 wrong admin codes from one IP lock that IP out for 10 minutes.
"""

import hmac
import os
import time

from fastapi import APIRouter, HTTPException, Request

from lib import sessions
from lib.db import db
from models.admin import (
    AdminAuth, AdminGiveAp, AdminSetClass, AdminOk, AdminSetRange, AdminSettings, AdminTarget, AdminTeleport, AdminUnban, BanEntry,
)
from models.game import GameSettings, Player
from routers.game import accrue, broadcast, get_settings, heal_period, off_map_since_after_move, to_player, utc_now

router = APIRouter(prefix="/game/admin", tags=["admin"])

MAX_FAILS = 5
LOCKOUT_SECONDS = 600
_fails: dict[str, list[float]] = {}


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "?")


def check_admin(request: Request, password: str) -> None:
    expected = os.environ.get("ADMIN_PASSWORD", "")
    ip = _client_ip(request)
    now = time.monotonic()
    recent = [t for t in _fails.get(ip, []) if now - t < LOCKOUT_SECONDS]
    if len(recent) >= MAX_FAILS:
        raise HTTPException(status_code=429, detail="Too many wrong admin codes — try again in 10 minutes")
    if not expected or not hmac.compare_digest(password, expected):
        recent.append(now)
        _fails[ip] = recent
        raise HTTPException(status_code=401, detail="Invalid admin credentials")
    _fails.pop(ip, None)


async def _target(target_id: str) -> dict:
    doc = await db.players.find_one({"id": target_id})
    if not doc:
        raise HTTPException(status_code=404, detail="That commander is no longer on the grid")
    return doc


@router.post("/login", response_model=AdminOk)
async def login(req: AdminAuth, request: Request):
    check_admin(request, req.password)
    return AdminOk(detail="Admin console unlocked")


@router.post("/kill", response_model=AdminOk)
async def kill(req: AdminTarget, request: Request):
    check_admin(request, req.password)
    doc = await _target(req.target_id)
    await db.players.delete_one({"id": doc["id"]})
    await sessions.revoke_player(doc["id"])
    await broadcast()
    return AdminOk(detail=f"{doc['username']} was eliminated by the Admin")


@router.post("/ban", response_model=AdminOk)
async def ban(req: AdminTarget, request: Request):
    check_admin(request, req.password)
    doc = await _target(req.target_id)
    await db.bans.update_one(
        {"username_key": doc["username_key"]},
        {"$set": {"username_key": doc["username_key"], "username": doc["username"], "banned_at": utc_now()}},
        upsert=True,
    )
    await db.players.delete_one({"id": doc["id"]})
    await sessions.revoke_player(doc["id"])
    await broadcast()
    return AdminOk(detail=f"{doc['username']} has been banned")


@router.post("/unban", response_model=AdminOk)
async def unban(req: AdminUnban, request: Request):
    check_admin(request, req.password)
    res = await db.bans.delete_one({"username_key": req.username.strip().lower()})
    if not res.deleted_count:
        raise HTTPException(status_code=404, detail="That callsign isn't banned")
    return AdminOk(detail=f"{req.username} can sign in again")


@router.post("/bans", response_model=list[BanEntry])
async def bans(req: AdminAuth, request: Request):
    check_admin(request, req.password)
    docs = await db.bans.find().sort("banned_at", -1).to_list(500)
    return [BanEntry(username=d["username"], banned_at=d["banned_at"]) for d in docs]


@router.post("/set-range", response_model=Player)
async def set_range(req: AdminSetRange, request: Request):
    check_admin(request, req.password)
    doc = await _target(req.target_id)
    await db.players.update_one({"id": doc["id"]}, {"$set": {"range": req.range}})
    await broadcast()
    return to_player({**doc, "range": req.range})


@router.post("/give-ap", response_model=Player)
async def give_ap(req: AdminGiveAp, request: Request):
    check_admin(request, req.password)
    doc = await accrue(await _target(req.target_id))
    if doc.get("_eliminated"):
        raise HTTPException(status_code=404, detail="That commander is no longer on the grid")
    ap = max(0, doc["ap"] + req.amount)
    await db.players.update_one({"id": doc["id"]}, {"$set": {"ap": ap}})
    await broadcast()
    return to_player({**doc, "ap": ap})


@router.post("/teleport", response_model=Player)
async def teleport(req: AdminTeleport, request: Request):
    check_admin(request, req.password)
    doc = await _target(req.target_id)
    if (doc["x"], doc["y"]) == (req.x, req.y):
        return to_player(doc)
    occupant = await db.players.find_one({"x": req.x, "y": req.y}, {"username": 1})
    if occupant:
        raise HTTPException(status_code=400, detail=f"Square occupied by {occupant['username']}")
    now = utc_now()
    update = {"x": req.x, "y": req.y, "last_moved": now, "off_map_since": off_map_since_after_move(doc, req.x, req.y, now)}
    await db.players.update_one({"id": doc["id"]}, {"$set": update})
    await broadcast()
    return to_player({**doc, **update})


@router.post("/settings", response_model=GameSettings)
async def save_settings(req: AdminSettings, request: Request):
    check_admin(request, req.password)
    settings = GameSettings(max_players_enabled=req.max_players_enabled, max_players=req.max_players)
    await db.settings.update_one({"_id": "game"}, {"$set": settings.model_dump()}, upsert=True)
    await broadcast()
    return settings


@router.post("/set-class", response_model=Player)
async def set_class(req: AdminSetClass, request: Request):
    check_admin(request, req.password)
    doc = await accrue(await _target(req.target_id))
    if doc.get("_eliminated"):
        raise HTTPException(status_code=404, detail="That commander is no longer on the grid")
    update = {"player_class": req.player_class, "ap_skip": 0}
    if req.player_class == "healer":  # fresh duty clock: no damage for periods before becoming a healer
        update |= {"heal_checked": heal_period(doc, utc_now()), "heal_period_done": None}
    await db.players.update_one({"id": doc["id"]}, {"$set": update})
    await broadcast()
    return to_player({**doc, **update})
