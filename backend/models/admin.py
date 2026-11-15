"""Admin console models. Mirror pair: frontend/src/lib/game.ts (admin section)."""

from datetime import datetime

from pydantic import BaseModel, Field

from models.game import ADMIN_MAX_RANGE, GameSettings


class AdminAuth(BaseModel):
    password: str = Field(pattern=r"^\d{6}$")


class AdminTarget(AdminAuth):
    target_id: str


class AdminSetRange(AdminTarget):
    range: int = Field(ge=0, le=ADMIN_MAX_RANGE)


class AdminGiveAp(AdminTarget):
    amount: int = Field(ge=-99, le=99)  # negative removes AP (floored at 0)


class AdminTeleport(AdminTarget):
    x: int = Field(ge=0, le=14)
    y: int = Field(ge=0, le=14)


class AdminSettings(AdminAuth, GameSettings):
    """Password + the full settings object to save."""


class AdminUnban(AdminAuth):
    username: str = Field(min_length=1, max_length=24)


class BanEntry(BaseModel):
    username: str
    banned_at: datetime


class AdminOk(BaseModel):
    ok: bool = True
    detail: str
