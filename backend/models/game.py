"""Pydantic models for the 15x15 grid map.

Mirror pair: frontend/src/lib/game.ts declares the matching TS interfaces by hand.
"""

import uuid
from datetime import datetime

from typing import Literal

from pydantic import BaseModel, Field

# Shared game constants — keep in sync with frontend/src/lib/game.ts.
TOKEN_COLORS = 8
BASE_RANGE = 2
MAX_RANGE = 5
MAX_HEALTH = 3
ADMIN_MAX_RANGE = 14
ADMIN_USERNAME = "Admin"  # reserved callsign; password from ADMIN_PASSWORD env
CHAT_HISTORY = 30
BOARD = 15  # the 15x15 map proper: x, y in 0..14
# One hazard ring around the map: x, y = -1 or 15 is "off the map" — reachable, but every daily
# 6pm UK top-up spent out there costs 1 HP.
MIN_COORD = -1
MAX_COORD = BOARD
EXPAND_COST = 2  # AP per Expand

# Commander classes, picked once when a profile is created.
#   standard — random spawn, 1 AP at deploy, +1 AP every 6pm UK time.
#   alliance — choose your spawn square, but the first two AP grants (deploy + first 6pm) are skipped.
#   ap_mine  — double AP (2 at deploy, 2 every 6pm) but cannot Attack or Expand.
#   sprinter — may Move up to double range, but every 3rd day since deploying they are immovable.
#   murderer — attacks deal double damage, but never receive AP after the deploy grant (no 6pm, no transfers).
#   healer   — one free Heal (+1 HP to another commander in range) per 2-day period since deploying;
#              a period that ends with no heal costs the healer 1 HP.
PlayerClass = Literal["standard", "alliance", "ap_mine", "sprinter", "murderer", "healer"]
ALLIANCE_SKIPPED_GRANTS = 2
SPRINTER_REST_EVERY_DAYS = 3
HEALER_PERIOD_HOURS = 48


class JoinRequest(BaseModel):
    username: str = Field(min_length=1, max_length=24)
    password: str = Field(pattern=r"^\d{6}$")
    # Only used when creating a NEW commander; ignored on rejoin.
    player_class: PlayerClass = "standard"
    spawn_x: int | None = Field(default=None, ge=0, le=14)  # required for alliance
    spawn_y: int | None = Field(default=None, ge=0, le=14)


class Player(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    x: int = Field(ge=MIN_COORD, le=MAX_COORD)
    y: int = Field(ge=MIN_COORD, le=MAX_COORD)
    color: int = Field(ge=0, le=TOKEN_COLORS - 1)
    health: int = Field(ge=0, le=MAX_HEALTH)
    ap: int = Field(ge=0)
    range: int = Field(ge=0, le=ADMIN_MAX_RANGE)  # Expand caps at MAX_RANGE; admin may go higher
    created_at: datetime
    last_active: datetime
    last_moved: datetime
    player_class: PlayerClass = "standard"
    flag: str | None = None  # ISO country code (lib/countries.py) shown instead of the letter token
    range_color: str | None = None  # "#RRGGBB" tint for this commander's range diamond
    immovable: bool = False  # sprinter rest day (every 3rd day since deploy)
    off_map: bool = False  # standing in the hazard ring outside the 15x15 map
    heal_available: bool = False  # healer hasn't healed yet in the current 2-day period
    heal_deadline: datetime | None = None  # healer: end of the current period (miss it = -1 HP)
    online: bool = False  # True while this commander has a visible browser tab streaming the board


class ActionRequest(BaseModel):
    """Base body for commander actions. Identity comes from the httpOnly login-pass cookie
    issued by /game/join (lib/sessions.py) — the access code is never re-sent."""


class LogoutResponse(BaseModel):
    ok: bool = True


class MoveRequest(ActionRequest):
    x: int = Field(ge=MIN_COORD, le=MAX_COORD)
    y: int = Field(ge=MIN_COORD, le=MAX_COORD)


class TargetRequest(ActionRequest):
    target_x: int = Field(ge=MIN_COORD, le=MAX_COORD)
    target_y: int = Field(ge=MIN_COORD, le=MAX_COORD)


class ChatRequest(ActionRequest):
    text: str = Field(min_length=1, max_length=140)


class AttackResponse(BaseModel):
    attacker: Player
    target: Player | None = None  # None once the target's health reaches 0
    target_username: str | None = None
    eliminated: bool


class TransferResponse(BaseModel):
    source: Player
    target: Player


class ChatMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    color: int = Field(ge=0, le=TOKEN_COLORS - 1)
    text: str = Field(min_length=1, max_length=140)
    created_at: datetime


class GameSettings(BaseModel):
    max_players_enabled: bool = False
    max_players: int = Field(default=20, ge=1, le=225)


class BoardSnapshot(BaseModel):
    players: list[Player]
    chat: list[ChatMessage]
    settings: GameSettings


class ProfileUpdate(ActionRequest):
    flag: str | None = Field(default=None, max_length=6)
    range_color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")


class NameCheckRequest(BaseModel):
    username: str = Field(min_length=1, max_length=24)


class NameCheckResponse(BaseModel):
    allowed: bool
    detail: str | None = None


class DirectMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    from_id: str
    from_username: str
    to_id: str
    to_username: str
    text: str = Field(min_length=1, max_length=280)
    created_at: datetime
    read: bool = False


class DMSendRequest(ActionRequest):
    to_id: str
    text: str = Field(min_length=1, max_length=280)


class DMThreadRequest(ActionRequest):
    with_id: str


class UnreadCounts(BaseModel):
    counts: dict[str, int]  # sender player id -> unread private messages from them
