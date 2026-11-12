"""Game map routes: join/rejoin as a commander, and the shared 15x15 board state."""

import random

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from passlib.context import CryptContext
from pymongo.errors import DuplicateKeyError

from lib.db import db
from models.game import TOKEN_COLORS, JoinRequest, Player

router = APIRouter(prefix="/game", tags=["game"])

BOARD = 15
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def to_player(doc: dict) -> Player:
    """Normalise naive BSON datetimes to aware UTC before Pydantic serialises them."""
    return Player(
        id=doc["id"],
        username=doc["username"],
        x=doc["x"],
        y=doc["y"],
        color=doc["color"],
        created_at=doc["created_at"].replace(tzinfo=timezone.utc),
        last_active=doc["last_active"].replace(tzinfo=timezone.utc),
    )


@router.post("/join", response_model=Player)
async def join(req: JoinRequest):
    username = req.username.strip()
    if not username:
        raise HTTPException(status_code=422, detail="Username cannot be empty")
    username_key = username.lower()
    now = utc_now()

    # Rejoin: same callsign + access code restores the same commander in the same square.
    existing = await db.players.find_one({"username_key": username_key})
    if existing:
        if not pwd_context.verify(req.password, existing["password_hash"]):
            raise HTTPException(status_code=401, detail=f"Invalid password for commander {username}")
        await db.players.update_one({"id": existing["id"]}, {"$set": {"last_active": now}})
        return to_player({**existing, "last_active": now})

    # New commander: drop onto a random FREE square (pure-random fallback once the board fills up),
    # wearing the least-used token color.
    placed = await db.players.find({}, {"x": 1, "y": 1, "color": 1}).to_list(BOARD * BOARD)
    taken = {(d["x"], d["y"]) for d in placed}
    free = [(x, y) for x in range(BOARD) for y in range(BOARD) if (x, y) not in taken]
    x, y = random.choice(free) if free else (random.randrange(BOARD), random.randrange(BOARD))
    usage = [0] * TOKEN_COLORS
    for d in placed:
        usage[d.get("color", 0) % TOKEN_COLORS] += 1
    color = random.choice([c for c, n in enumerate(usage) if n == min(usage)])

    player = Player(username=username, x=x, y=y, color=color, created_at=now, last_active=now)
    try:
        await db.players.insert_one(
            {
                **player.model_dump(),
                "username_key": username_key,
                "password_hash": pwd_context.hash(req.password),
            }
        )
    except DuplicateKeyError:
        # Lost a race against a concurrent join with the same callsign — settle it here.
        existing = await db.players.find_one({"username_key": username_key})
        if existing and pwd_context.verify(req.password, existing["password_hash"]):
            return to_player(existing)
        raise HTTPException(status_code=409, detail=f"Commander {username} already exists")
    return player


@router.get("/players", response_model=list[Player])
async def list_players():
    docs = await db.players.find().sort("created_at", 1).to_list(BOARD * BOARD)
    return [to_player(d) for d in docs]
