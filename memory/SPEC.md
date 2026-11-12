# Terra Grid — SPEC

Multiplayer strategy game (user: "The game will be a strategy game"). Milestone 1 only — user
instruction: "Do not go past this point without specification."

## What exists (milestone 1)
- **15×15 square grid** = the game map (225 cells, coordinate axes 1–15 on top/left).
- **All joined players' avatars visible** on the map; your own has an emerald radar ring +
  "YOU" context in the session banner.
- **Join panel directly above the grid**: username (≤24 chars) + 6-digit access code.
  Join → avatar placed on a random FREE square (pure-random only if the board is full),
  wearing the least-used token color (8-color palette).
- **Rejoin**: same username + password → same position and color restored.
  Wrong password for an existing callsign → 401 "Invalid password for commander <name>".
- **Leave game** clears only the local session — the token stays on the shared map.
- Refresh auto-rejoins via stored credentials (revalidated server-side; cleared if rejected).
- Map polls `GET /api/game/players` every 4s (TanStack Query) so other commanders appear.

## Data model — Mongo `app.players`
`{ id: uuid4-str, username, username_key (lowercase, UNIQUE idx), password_hash
(pbkdf2_sha256), x, y (0–14; displayed +1), color (0–7), created_at, last_active (aware UTC) }`
Indexes in `backend/lib/db.py` INDEXES["players"].

## API (all under /api)
- `POST /api/game/join` `{username, password}` → `Player` (200 new-or-rejoin) |
  401 wrong password | 422 bad body/empty username | 409 concurrent-join race lost
- `GET /api/game/players` → `Player[]` (password_hash/username_key never serialized)

## TS mirror
`frontend/src/pages/Home.tsx`: `interface Player` + `PALETTE` (8 entries) mirror
`backend/models/game.py`. Keep both in sync.

## Auth
No auth framework — callsign + 6-digit code IS the identity (hashed with passlib). No seeded
accounts; players self-register via UI or API. No login gating anywhere.

## Frontend theme
Dark war-room (Space Grotesk / JetBrains Mono / DM Sans), tokens in `frontend/src/index.css`,
per `design_guidelines.json`. Dark-by-default via `<html class="dark">`.

## Scope guard
Movement, chat, combat, resources etc. are explicitly OUT until the user specifies them.
