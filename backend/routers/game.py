"""Game map routes: join/rejoin, shared board state, the four commander actions, chat,
and the SSE stream that pushes every board change to all connected commanders in real time.

AP economy: every commander gets 1 AP on deployment and +1 AP at each daily 18:00
boundary in the server timezone (APP_TZ env, default UTC). Grants are accrued lazily
on every read/write, so restarts or downtime never lose a grant.
"""

import asyncio
import json
import os
import random
from datetime import datetime, time as dtime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from passlib.context import CryptContext
from pymongo.errors import DuplicateKeyError

from lib.db import db
from models.game import (
    BASE_RANGE,
    CHAT_HISTORY,
    MAX_HEALTH,
    MAX_RANGE,
    TOKEN_COLORS,
    ActionRequest,
    AttackResponse,
    BoardSnapshot,
    ChatMessage,
    ChatRequest,
    JoinRequest,
    MoveRequest,
    Player,
    TargetRequest,
    TransferResponse,
)

router = APIRouter(prefix="/game", tags=["game"])

BOARD = 15
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

# --- Real-time fan-out: one queue per connected commander (single-process server) ---
SUBSCRIBERS: set[asyncio.Queue[str]] = set()


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def app_tz() -> ZoneInfo:
    return ZoneInfo(os.environ.get("APP_TZ", "UTC"))


def manhattan(ax: int, ay: int, bx: int, by: int) -> int:
    """Diamond distance on the board — a commander's range is manhattan <= range."""
    return abs(ax - bx) + abs(ay - by)


def normalize(doc: dict) -> dict:
    """Backfill the AP/health/range fields on docs created before they existed."""
    d = dict(doc)
    now = utc_now()
    d.setdefault("health", MAX_HEALTH)
    d.setdefault("ap", 1)
    d.setdefault("range", BASE_RANGE)
    d.setdefault("last_moved", d.get("created_at") or now)
    d.setdefault("ap_as_of", now)
    return d


def due_boundaries(after: datetime, now: datetime, tz: ZoneInfo) -> list[datetime]:
    """Every daily 18:00 (in tz) strictly after `after` and up to `now`."""
    local_after = after.astimezone(tz)
    local_now = now.astimezone(tz)
    day = local_after.date()
    if local_after.time() >= dtime(18, 0):
        day += timedelta(days=1)
    grants: list[datetime] = []
    while len(grants) < 400:  # safety cap against a wild clock
        boundary = datetime.combine(day, dtime(18, 0), tzinfo=tz)
        if boundary > local_now:
            break
        grants.append(boundary)
        day += timedelta(days=1)
    return grants


async def accrue(doc: dict) -> dict:
    """Grant any due APs to one commander and persist the updated tally."""
    d = normalize(doc)
    ap_as_of = d["ap_as_of"]
    if ap_as_of.tzinfo is None:  # motor hands back naive datetimes
        ap_as_of = ap_as_of.replace(tzinfo=timezone.utc)
    grants = due_boundaries(ap_as_of, utc_now(), app_tz())
    if grants:
        d["ap"] += len(grants)
        d["ap_as_of"] = grants[-1]
        await db.players.update_one({"id": d["id"]}, {"$set": {"ap": d["ap"], "ap_as_of": d["ap_as_of"]}})
    return d


def to_player(doc: dict) -> Player:
    """Normalise naive BSON datetimes to aware UTC before Pydantic serialises them."""
    d = normalize(doc)
    return Player(
        id=d["id"],
        username=d["username"],
        x=d["x"],
        y=d["y"],
        color=d["color"],
        health=d["health"],
        ap=d["ap"],
        range=d["range"],
        created_at=d["created_at"].replace(tzinfo=timezone.utc),
        last_active=d["last_active"].replace(tzinfo=timezone.utc),
        last_moved=d["last_moved"].replace(tzinfo=timezone.utc),
    )


def to_message(doc: dict) -> ChatMessage:
    return ChatMessage(
        id=doc["id"],
        username=doc["username"],
        color=doc["color"],
        text=doc["text"],
        created_at=doc["created_at"].replace(tzinfo=timezone.utc),
    )


async def build_snapshot() -> str:
    """Full board snapshot (players + recent chat) as JSON, with AP accrual applied."""
    docs = await db.players.find().sort("created_at", 1).to_list(BOARD * BOARD)
    players = []
    for raw in docs:
        players.append(to_player(await accrue(raw)).model_dump(mode="json"))
    chat_docs = await db.messages.find().sort("created_at", -1).to_list(CHAT_HISTORY)
    chat = [to_message(d).model_dump(mode="json") for d in reversed(chat_docs)]
    return json.dumps({"players": players, "chat": chat})


async def broadcast() -> None:
    """Push a fresh snapshot to every connected commander's SSE stream."""
    if not SUBSCRIBERS:
        return
    snap = await build_snapshot()
    for queue in SUBSCRIBERS:
        queue.put_nowait(snap)


async def sse_generator(request: Request):
    queue: asyncio.Queue[str] = asyncio.Queue()
    SUBSCRIBERS.add(queue)
    try:
        yield f"event: board\ndata: {await build_snapshot()}\n\n"
        while True:
            if await request.is_disconnected():
                break
            try:
                snap = await asyncio.wait_for(queue.get(), timeout=15.0)
                yield f"event: board\ndata: {snap}\n\n"
            except asyncio.TimeoutError:
                yield ": keep-alive\n\n"  # keeps proxies from timing out the stream
    finally:
        SUBSCRIBERS.discard(queue)


async def auth_commander(req: ActionRequest) -> dict:
    """Verify the callsign + access code pair; the raw doc (pre-accrual) on success."""
    username = req.username.strip()
    doc = await db.players.find_one({"username_key": username.lower()}) if username else None
    if not doc or not pwd_context.verify(req.password, doc["password_hash"]):
        raise HTTPException(status_code=401, detail=f"Invalid credentials for commander {username or '?'}")
    return doc


@router.get("/stream")
async def stream(request: Request):
    return StreamingResponse(
        sse_generator(request),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/state", response_model=BoardSnapshot)
async def state():
    docs = await db.players.find().sort("created_at", 1).to_list(BOARD * BOARD)
    players = [to_player(await accrue(d)) for d in docs]
    chat_docs = await db.messages.find().sort("created_at", -1).to_list(CHAT_HISTORY)
    return BoardSnapshot(players=players, chat=[to_message(d) for d in reversed(chat_docs)])


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
        existing = await accrue(existing)
        await db.players.update_one({"id": existing["id"]}, {"$set": {"last_active": now}})
        await broadcast()
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

    player = Player(
        username=username,
        x=x,
        y=y,
        color=color,
        health=MAX_HEALTH,
        ap=1,  # "at the beginning" grant
        range=BASE_RANGE,
        created_at=now,
        last_active=now,
        last_moved=now,
    )
    doc = {
        **player.model_dump(),
        "ap_as_of": now,
        "username_key": username_key,
        "password_hash": pwd_context.hash(req.password),
    }
    try:
        await db.players.insert_one(doc)
    except DuplicateKeyError:
        # Lost a race against a concurrent join with the same callsign — settle it here.
        existing = await db.players.find_one({"username_key": username_key})
        if existing and pwd_context.verify(req.password, existing["password_hash"]):
            return to_player(existing)
        raise HTTPException(status_code=409, detail=f"Commander {username} already exists")
    await broadcast()
    return to_player(doc)


@router.get("/players", response_model=list[Player])
async def list_players():
    docs = await db.players.find().sort("created_at", 1).to_list(BOARD * BOARD)
    out = []
    for raw in docs:
        d = await accrue(raw)  # grant any 18:00 APs that came due since the last touch
        out.append(to_player(d))
    return out


@router.post("/move", response_model=Player)
async def move(req: MoveRequest):
    doc = await accrue(await auth_commander(req))
    me = to_player(doc)
    if me.ap < 1:
        raise HTTPException(status_code=400, detail="Not enough AP — next resupply at 18:00 server time")
    dist = manhattan(me.x, me.y, req.x, req.y)
    if dist == 0:
        raise HTTPException(status_code=400, detail="You are already standing there")
    if dist > me.range:
        raise HTTPException(status_code=400, detail=f"Target square is outside your range ({me.range})")
    occupant = await db.players.find_one({"x": req.x, "y": req.y})
    if occupant:
        raise HTTPException(status_code=400, detail=f"Square occupied by {occupant['username']}")
    now = utc_now()
    await db.players.update_one(
        {"id": me.id},
        {"$set": {"x": req.x, "y": req.y, "ap": me.ap - 1, "last_moved": now}},
    )
    await broadcast()
    return to_player({**doc, "x": req.x, "y": req.y, "ap": me.ap - 1, "last_moved": now})


@router.post("/attack", response_model=AttackResponse)
async def attack(req: TargetRequest):
    doc = await accrue(await auth_commander(req))
    me = to_player(doc)
    if me.ap < 1:
        raise HTTPException(status_code=400, detail="Not enough AP — next resupply at 18:00 server time")
    target_doc = await db.players.find_one({"x": req.target_x, "y": req.target_y})
    if not target_doc:
        raise HTTPException(status_code=404, detail="No commander on that square")
    if target_doc["id"] == me.id:
        raise HTTPException(status_code=400, detail="You cannot attack yourself")
    if manhattan(me.x, me.y, req.target_x, req.target_y) > me.range:
        raise HTTPException(status_code=400, detail=f"Target is outside your range ({me.range})")

    health = target_doc.get("health", MAX_HEALTH) - 1
    await db.players.update_one({"id": me.id}, {"$set": {"ap": me.ap - 1}})
    attacker = to_player({**doc, "ap": me.ap - 1})
    if health <= 0:
        await db.players.delete_one({"id": target_doc["id"]})
        await broadcast()
        return AttackResponse(
            attacker=attacker, target=None, target_username=target_doc["username"], eliminated=True
        )
    await db.players.update_one({"id": target_doc["id"]}, {"$set": {"health": health}})
    await broadcast()
    return AttackResponse(
        attacker=attacker,
        target=to_player({**target_doc, "health": health}),
        target_username=target_doc["username"],
        eliminated=False,
    )


@router.post("/transfer", response_model=TransferResponse)
async def transfer(req: TargetRequest):
    doc = await accrue(await auth_commander(req))
    me = to_player(doc)
    if me.ap < 1:
        raise HTTPException(status_code=400, detail="Not enough AP — next resupply at 18:00 server time")
    target_doc = await db.players.find_one({"x": req.target_x, "y": req.target_y})
    if not target_doc:
        raise HTTPException(status_code=404, detail="No commander on that square")
    if target_doc["id"] == me.id:
        raise HTTPException(status_code=400, detail="You cannot transfer to yourself")
    if manhattan(me.x, me.y, req.target_x, req.target_y) > me.range:
        raise HTTPException(status_code=400, detail=f"Target is outside your range ({me.range})")

    target = await accrue(target_doc)
    await db.players.update_one({"id": me.id}, {"$set": {"ap": me.ap - 1}})
    await db.players.update_one({"id": target["id"]}, {"$set": {"ap": target["ap"] + 1}})
    await broadcast()
    return TransferResponse(
        source=to_player({**doc, "ap": me.ap - 1}),
        target=to_player({**target, "ap": target["ap"] + 1}),
    )


@router.post("/expand", response_model=Player)
async def expand(req: ActionRequest):
    doc = await accrue(await auth_commander(req))
    me = to_player(doc)
    if me.ap < 1:
        raise HTTPException(status_code=400, detail="Not enough AP — next resupply at 18:00 server time")
    if me.range >= MAX_RANGE:
        raise HTTPException(status_code=400, detail=f"Range is already at maximum ({MAX_RANGE})")
    await db.players.update_one({"id": me.id}, {"$set": {"range": me.range + 1, "ap": me.ap - 1}})
    await broadcast()
    return to_player({**doc, "range": me.range + 1, "ap": me.ap - 1})


@router.post("/chat", response_model=ChatMessage)
async def chat(req: ChatRequest):
    doc = await auth_commander(req)
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Message cannot be empty")
    msg = ChatMessage(username=doc["username"], color=doc["color"], text=text, created_at=utc_now())
    await db.messages.insert_one(msg.model_dump())
    await broadcast()
    return msg
