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

# Commander classes, picked once when a profile is created.
#   standard — random spawn, 1 AP at deploy, +1 AP every 6pm UK time.
#   alliance — choose your spawn square, but the first two AP grants (deploy + first 6pm) are skipped.
PlayerClass = Literal["standard", "alliance"]
ALLIANCE_SKIPPED_GRANTS = 2


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
    x: int = Field(ge=0, le=14)
    y: int = Field(ge=0, le=14)
    color: int = Field(ge=0, le=TOKEN_COLORS - 1)
    health: int = Field(ge=0, le=MAX_HEALTH)
    ap: int = Field(ge=0)
    range: int = Field(ge=0, le=ADMIN_MAX_RANGE)  # Expand caps at MAX_RANGE; admin may go higher
    created_at: datetime
    last_active: datetime
    last_moved: datetime
    player_class: PlayerClass = "standard"
    online: bool = False  # True while this commander has a visible browser tab streaming the board


class ActionRequest(BaseModel):
    """Identity for every commander action — the callsign + 6-digit code pair IS the session."""

    username: str = Field(min_length=1, max_length=24)
    password: str = Field(pattern=r"^\d{6}$")


class MoveRequest(ActionRequest):
    x: int = Field(ge=0, le=14)
    y: int = Field(ge=0, le=14)


class TargetRequest(ActionRequest):
    target_x: int = Field(ge=0, le=14)
    target_y: int = Field(ge=0, le=14)


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


class BoardSnapshot(BaseModel):
    players: list[Player]
    chat: list[ChatMessage]


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
