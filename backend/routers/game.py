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
from lib.name_filter import REJECTION, is_offensive
from models.game import (
    BASE_RANGE,
    CHAT_HISTORY,
    MAX_HEALTH,
    MAX_RANGE,
    TOKEN_COLORS,
    ALLIANCE_SKIPPED_GRANTS,
    ADMIN_USERNAME,
    ActionRequest,
    AttackResponse,
    BoardSnapshot,
    GameSettings,
    ChatMessage,
    ChatRequest,
    DirectMessage,
    DMSendRequest,
    DMThreadRequest,
    JoinRequest,
    MoveRequest,
    NameCheckRequest,
    NameCheckResponse,
    Player,
    TargetRequest,
    TransferResponse,
    UnreadCounts,
)

router = APIRouter(prefix="/game", tags=["game"])

BOARD = 15
BANNED = "This callsign has been banned by the Admin"
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

# --- Real-time fan-out: one queue per connected stream -> the commander id it belongs to (None = spectator) ---
SUBSCRIBERS: dict[asyncio.Queue[str], str | None] = {}
# Presence: player id -> number of open, visible-tab streams (a commander may have several tabs).
PRESENCE: dict[str, int] = {}


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
    d.setdefault("player_class", "standard")
    d.setdefault("ap_skip", 0)  # AP grants still to be withheld (alliance class)
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
        skipped = min(len(grants), d["ap_skip"])  # alliance: withhold the early grants
        d["ap"] += len(grants) - skipped
        d["ap_skip"] -= skipped
        d["ap_as_of"] = grants[-1]
        await db.players.update_one(
            {"id": d["id"]},
            {"$set": {"ap": d["ap"], "ap_as_of": d["ap_as_of"], "ap_skip": d["ap_skip"]}},
        )
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
        player_class=d["player_class"],
        online=PRESENCE.get(d["id"], 0) > 0,
    )


def to_message(doc: dict) -> ChatMessage:
    return ChatMessage(
        id=doc["id"],
        username=doc["username"],
        color=doc["color"],
        text=doc["text"],
        created_at=doc["created_at"].replace(tzinfo=timezone.utc),
    )


async def get_settings() -> GameSettings:
    doc = await db.settings.find_one({"_id": "game"})
    return GameSettings(**{k: v for k, v in (doc or {}).items() if k != "_id"})


async def full_message(count: int | None = None) -> str | None:
    """None if a NEW commander may deploy; otherwise the 'grid is full' message."""
    s = await get_settings()
    if not s.max_players_enabled:
        return None
    n = count if count is not None else await db.players.count_documents({})
    return f"The grid is full ({n}/{s.max_players} commanders) — try again later" if n >= s.max_players else None


async def build_snapshot() -> str:
    """Full board snapshot (players + recent chat) as JSON, with AP accrual applied."""
    docs = await db.players.find().sort("created_at", 1).to_list(BOARD * BOARD)
    players = []
    for raw in docs:
        players.append(to_player(await accrue(raw)).model_dump(mode="json"))
    chat_docs = await db.messages.find().sort("created_at", -1).to_list(CHAT_HISTORY)
    chat = [to_message(d).model_dump(mode="json") for d in reversed(chat_docs)]
    settings = (await get_settings()).model_dump()
    return json.dumps({"players": players, "chat": chat, "settings": settings})


async def broadcast() -> None:
    """Push a fresh snapshot to every connected commander's SSE stream."""
    if not SUBSCRIBERS:
        return
    snap = await build_snapshot()
    for queue in SUBSCRIBERS:
        queue.put_nowait(snap)


DM_PING = "__dm__"


def notify_dm(*player_ids: str) -> None:
    """Content-free 'you have DM activity' ping to the given commanders' streams.
    Message text is only ever returned by the credential-checked /dm endpoints."""
    targets = set(player_ids)
    for queue, pid in SUBSCRIBERS.items():
        if pid in targets:
            queue.put_nowait(DM_PING)


async def sse_generator(request: Request, player_id: str | None):
    queue: asyncio.Queue[str] = asyncio.Queue()
    SUBSCRIBERS[queue] = player_id
    if player_id:
        PRESENCE[player_id] = PRESENCE.get(player_id, 0) + 1
        await broadcast()  # everyone sees this commander flip to Online
    try:
        yield f"event: board\ndata: {await build_snapshot()}\n\n"
        while True:
            if await request.is_disconnected():
                break
            try:
                snap = await asyncio.wait_for(queue.get(), timeout=10.0)
                if snap == DM_PING:
                    yield "event: dm\ndata: {}\n\n"
                else:
                    yield f"event: board\ndata: {snap}\n\n"
            except asyncio.TimeoutError:
                yield ": keep-alive\n\n"  # keeps proxies open and surfaces dead clients within ~10s
    finally:
        SUBSCRIBERS.pop(queue, None)
        if player_id:
            left = PRESENCE.get(player_id, 0) - 1
            if left > 0:
                PRESENCE[player_id] = left
            else:
                PRESENCE.pop(player_id, None)
            # The generator may be mid-cancellation here — announce Away from a fresh task.
            asyncio.get_running_loop().create_task(broadcast())


async def auth_commander(req: ActionRequest) -> dict:
    """Verify the callsign + access code pair; the raw doc (pre-accrual) on success."""
    username = req.username.strip()
    doc = await db.players.find_one({"username_key": username.lower()}) if username else None
    if not doc or not pwd_context.verify(req.password, doc["password_hash"]):
        raise HTTPException(status_code=401, detail=f"Invalid credentials for commander {username or '?'}")
    return doc


@router.get("/stream")
async def stream(request: Request, player_id: str | None = None):
    # Only real commanders count toward presence; spectators (no/unknown id) just watch.
    if player_id and not await db.players.find_one({"id": player_id}, {"_id": 1}):
        player_id = None
    return StreamingResponse(
        sse_generator(request, player_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/state", response_model=BoardSnapshot)
async def state():
    docs = await db.players.find().sort("created_at", 1).to_list(BOARD * BOARD)
    players = [to_player(await accrue(d)) for d in docs]
    chat_docs = await db.messages.find().sort("created_at", -1).to_list(CHAT_HISTORY)
    return BoardSnapshot(
        players=players, chat=[to_message(d) for d in reversed(chat_docs)], settings=await get_settings()
    )


@router.post("/name-check", response_model=NameCheckResponse)
async def name_check(req: NameCheckRequest):
    """Lets the join form reject a bad callsign before the class picker; /join enforces it again."""
    name = req.username.strip()
    if is_offensive(name):
        return NameCheckResponse(allowed=False, detail=REJECTION)
    if await db.bans.find_one({"username_key": name.lower()}):
        return NameCheckResponse(allowed=False, detail=BANNED)
    if not await db.players.find_one({"username_key": name.lower()}, {"_id": 1}):
        full = await full_message()
        if full:
            return NameCheckResponse(allowed=False, detail=full)
    return NameCheckResponse(allowed=True)


@router.post("/join", response_model=Player)
async def join(req: JoinRequest):
    username = req.username.strip()
    if not username:
        raise HTTPException(status_code=422, detail="Username cannot be empty")
    if is_offensive(username):  # blocks new profiles AND sign-ins to any existing offensive callsign
        raise HTTPException(status_code=400, detail=REJECTION)
    username_key = username.lower()
    if username_key == ADMIN_USERNAME.lower():
        raise HTTPException(status_code=403, detail="That callsign is reserved")
    if await db.bans.find_one({"username_key": username_key}):
        raise HTTPException(status_code=403, detail=BANNED)
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

    # New commander, wearing the least-used token color.
    #   standard: random FREE square (pure-random fallback once the board fills up), 1 AP now.
    #   alliance: the square they chose (must be free), and the first two AP grants are withheld.
    placed = await db.players.find({}, {"x": 1, "y": 1, "color": 1}).to_list(BOARD * BOARD)
    full = await full_message(len(placed))  # the cap only blocks NEW commanders; rejoins always work
    if full:
        raise HTTPException(status_code=403, detail=full)
    taken = {(d["x"], d["y"]) for d in placed}
    if req.player_class == "alliance":
        if req.spawn_x is None or req.spawn_y is None:
            raise HTTPException(status_code=422, detail="Alliance commanders must choose a spawn square")
        if (req.spawn_x, req.spawn_y) in taken:
            raise HTTPException(status_code=400, detail="That spawn square is already occupied — pick another")
        x, y = req.spawn_x, req.spawn_y
        start_ap, ap_skip = 0, ALLIANCE_SKIPPED_GRANTS - 1  # deploy grant withheld now, first 6pm later
    else:
        free = [(fx, fy) for fx in range(BOARD) for fy in range(BOARD) if (fx, fy) not in taken]
        x, y = random.choice(free) if free else (random.randrange(BOARD), random.randrange(BOARD))
        start_ap, ap_skip = 1, 0  # "at the beginning" grant
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
        ap=start_ap,
        range=BASE_RANGE,
        created_at=now,
        last_active=now,
        last_moved=now,
        player_class=req.player_class,
    )
    doc = {
        **player.model_dump(exclude={"online"}),
        "ap_skip": ap_skip,
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
        raise HTTPException(status_code=400, detail="Not enough AP — next resupply at 6pm UK time")
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
        raise HTTPException(status_code=400, detail="Not enough AP — next resupply at 6pm UK time")
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
        raise HTTPException(status_code=400, detail="Not enough AP — next resupply at 6pm UK time")
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
        raise HTTPException(status_code=400, detail="Not enough AP — next resupply at 6pm UK time")
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


# --- Private messages: only sender & recipient can read a thread (credential-checked) ---

def to_dm(doc: dict) -> DirectMessage:
    return DirectMessage(
        id=doc["id"],
        from_id=doc["from_id"],
        from_username=doc["from_username"],
        to_id=doc["to_id"],
        to_username=doc["to_username"],
        text=doc["text"],
        created_at=doc["created_at"].replace(tzinfo=timezone.utc),
        read=doc.get("read", False),
    )


@router.post("/dm/send", response_model=DirectMessage)
async def dm_send(req: DMSendRequest):
    me = await auth_commander(req)
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Message cannot be empty")
    if req.to_id == me["id"]:
        raise HTTPException(status_code=400, detail="You cannot message yourself")
    target = await db.players.find_one({"id": req.to_id}, {"id": 1, "username": 1})
    if not target:
        raise HTTPException(status_code=404, detail="That commander is no longer on the grid")
    msg = DirectMessage(
        from_id=me["id"],
        from_username=me["username"],
        to_id=target["id"],
        to_username=target["username"],
        text=text,
        created_at=utc_now(),
    )
    await db.dms.insert_one(msg.model_dump())
    notify_dm(me["id"], target["id"])
    return msg


@router.post("/dm/thread", response_model=list[DirectMessage])
async def dm_thread(req: DMThreadRequest):
    """The conversation between you and `with_id` (oldest first); marks their messages to you read."""
    me = await auth_commander(req)
    pair = {"$or": [
        {"from_id": me["id"], "to_id": req.with_id},
        {"from_id": req.with_id, "to_id": me["id"]},
    ]}
    docs = await db.dms.find(pair).sort("created_at", -1).to_list(100)
    result = await db.dms.update_many(
        {"from_id": req.with_id, "to_id": me["id"], "read": False}, {"$set": {"read": True}}
    )
    if result.modified_count:
        notify_dm(me["id"])  # other tabs of mine clear their unread badge
    return [to_dm({**d, "read": True} if d["to_id"] == me["id"] else d) for d in reversed(docs)]


@router.post("/dm/unread", response_model=UnreadCounts)
async def dm_unread(req: ActionRequest):
    me = await auth_commander(req)
    rows = await db.dms.aggregate([
        {"$match": {"to_id": me["id"], "read": False}},
        {"$group": {"_id": "$from_id", "n": {"$sum": 1}}},
    ]).to_list(500)
    return UnreadCounts(counts={r["_id"]: r["n"] for r in rows})
