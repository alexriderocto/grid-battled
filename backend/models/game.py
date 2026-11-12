"""Pydantic models for the 15x15 grid map.

Mirror pair: frontend/src/lib/game.ts declares the matching TS interfaces by hand.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

# Shared game constants — keep in sync with frontend/src/lib/game.ts.
TOKEN_COLORS = 8
BASE_RANGE = 2
MAX_RANGE = 5
MAX_HEALTH = 3
CHAT_HISTORY = 30


class JoinRequest(BaseModel):
    username: str = Field(min_length=1, max_length=24)
    password: str = Field(pattern=r"^\d{6}$")


class Player(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    x: int = Field(ge=0, le=14)
    y: int = Field(ge=0, le=14)
    color: int = Field(ge=0, le=TOKEN_COLORS - 1)
    health: int = Field(ge=0, le=MAX_HEALTH)
    ap: int = Field(ge=0)
    range: int = Field(ge=0, le=MAX_RANGE)
    created_at: datetime
    last_active: datetime
    last_moved: datetime


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
