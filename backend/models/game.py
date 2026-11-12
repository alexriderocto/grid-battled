"""Pydantic models for the 15x15 grid map.

Mirror pair: frontend/src/pages/Home.tsx declares the matching TS interfaces by hand.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

# Length of the token palette the frontend paints avatars with — keep in sync with PALETTE in Home.tsx.
TOKEN_COLORS = 8


class JoinRequest(BaseModel):
    username: str = Field(min_length=1, max_length=24)
    password: str = Field(pattern=r"^\d{6}$")


class Player(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    username: str
    x: int = Field(ge=0, le=14)
    y: int = Field(ge=0, le=14)
    color: int = Field(ge=0, le=TOKEN_COLORS - 1)
    created_at: datetime
    last_active: datetime
