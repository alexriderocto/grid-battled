"""Shared helpers for tscheck backend tests."""
import os
import random

import httpx

BACKEND_URL = os.environ.get("BACKEND_URL", "http://localhost:8001")
API_URL = f"{BACKEND_URL}/api"
ADMIN_PASSWORD = "314159"


def rand_name(prefix: str = "tscheck") -> str:
    name = f"{prefix}-{random.randint(1000, 9999)}"
    return name[:24]


def make_client() -> httpx.Client:
    return httpx.Client(base_url=API_URL, timeout=30.0)


def join(client: httpx.Client, username: str, code: str = "123456", player_class: str = "standard"):
    r = client.post("/game/join", json={"username": username, "password": code, "player_class": player_class})
    return r


def admin_kill(client: httpx.Client, target_id: str):
    return client.post("/game/admin/kill", json={"password": ADMIN_PASSWORD, "target_id": target_id})
