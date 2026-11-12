# Grid Battle — SPEC

Multiplayer strategy game (renamed from Terra Grid). Milestone 3: real-time multiplayer (SSE), live roster, in-map chat. Map is human-only — no bots; test accounts are wiped after each verification.

## Game rules (as specified by the user)
- **15×15 grid** = the map. All players' avatars visible; own avatar has an emerald radar ring.
- **Join panel above the grid**: username (≤24 chars) + 6-digit access code. Join → random FREE
  square, least-used token color (8-color palette). Rejoin with same pair → same position restored.
  Wrong password → 401 "Invalid password for commander <name>".
- **Range**: a shaded diamond around each commander, manhattan distance ≤ range. Base range 2
  (BASE_RANGE). Own range = sky tint; other commanders' reach = faint rose tint.
- **AP**: every commander gets 1 AP at deployment ("the beginning") and +1 AP at each daily 18:00
  in the server timezone (APP_TZ env in backend/.env, default UTC — "6pm local time"). Grants are
  accrued lazily on every read/write, so restarts/downtime never lose one. Next grant is NOT
  double-counted. Pre-milestone-2 players are backfilled (ap=1, health=3, range=2) on first read.
- **4 action buttons below the grid** (each costs 1 AP; identity = username+password in body):
  1. **Attack** — arm, click a commander in range → 1 damage. At 0/3 HP the commander is
     ELIMINATED (removed from the map); they can redeploy fresh (new square, 3 HP, 1 AP) by
     rejoining with the same callsign + code. Killing grants nothing extra.
  2. **Move** — arm, click an empty square in range → relocate (last_moved updated).
  3. **Transfer** — arm, click a commander in range → gift 1 of your AP to them (you -1, they +1).
  4. **Expand** — instant (no target): range +1, capped at MAX_RANGE 5 (assumption; user only
     said "make the range one block bigger" — cost set to 1 AP to match the other buttons).
- **Cell Intel**: hovering any occupied square shows a hover card — username, sector, HP pips,
  AP, range, and "last moved <relative time>".
- Eliminated mid-session: the client detects the commander missing from the board and forces
  the session back to the join panel with an "You were eliminated" toast.

## Multiplayer (milestone 3)
- **Real-time sync**: `GET /api/game/stream` (SSE, `event: board`, JSON BoardSnapshot `{players, chat}`).
  Every join/move/attack/transfer/expand/chat calls `broadcast()` -> pushes a full snapshot to every
  connected client (in-process subscriber set; single uvicorn worker). 15s keep-alive comments.
  Client: EventSource -> `setQueryData(["board"])`; `GET /api/game/state` polled every 15s as fallback.
  Header badge `live-sync-badge` shows LIVE / SYNCING.
- **Roster panel** (below action bar, left): every commander — token, name, Online/Away, YOU tag, sector, HP pips, AP.
- **Presence (Online/Away)**: client opens `/api/game/stream?player_id=<own id>` only while its tab is
  visible (visibilitychange closes/reopens the EventSource). Server `PRESENCE` dict counts open streams per
  player id (multi-tab safe); `Player.online` = count > 0; connect/disconnect triggers a broadcast.
  Unknown player_id is ignored (spectator stream). Away tokens render dimmed on the map; header badge
  shows "N ONLINE · M DEPLOYED"; Cell Intel shows Online/Away. Presence is in-memory (resets on restart;
  clients reconnect automatically).
- **Comms channel** (right): last 30 messages (`app.messages`), 1–140 chars, must be deployed to send.
  `POST /api/game/chat {username, password, text}` -> ChatMessage | 401 | 422.

## Data model — Mongo `app.players`
`{ id: uuid4-str, username, username_key (lowercase, UNIQUE idx), password_hash (pbkdf2_sha256),
x, y (0–14; displayed +1), color (0–7), health (0–3), ap (≥0), range (2–5), created_at,
last_active, last_moved, ap_as_of (last grant timestamp, aware UTC) }`
Indexes: username_key_unique, created_at_asc, xy (in backend/lib/db.py INDEXES["players"]).

## API (all under /api; errors carry a human-readable `detail`)
- `POST /api/game/join` `{username, password}` → Player (200) | 401 | 422 | 409
- `GET /api/game/players` → Player[] (accrues due AP; password_hash/username_key/ap_as_of never serialized)
- `POST /api/game/move` `{username, password, x, y}` → Player | 400 (AP/range/occupied) | 401
- `POST /api/game/attack` `{username, password, target_x, target_y}` →
  `{attacker, target | null, target_username, eliminated}` | 400 | 401 | 404
- `POST /api/game/transfer` `{username, password, target_x, target_y}` → `{source, target}` | 400 | 401 | 404
- `POST /api/game/expand` `{username, password}` → Player | 400 (no AP / max range) | 401

Mongo `app.messages`: `{id, username, color, text, created_at}` (index created_at_desc).

## TS mirror
`frontend/src/lib/game.ts` (Player, AttackResult, TransferResult, ChatMessage, BoardState, PALETTE, constants) mirrors
`backend/models/game.py`. Keep both in sync.

## Auth
No auth framework — callsign + 6-digit code IS the identity (hashed, passlib). Every action
request re-sends the pair; server verifies. No seeded accounts. No login gating.

## Frontend
- `frontend/src/pages/Home.tsx` (map, join, banner, action bar) + `src/components/game/CellIntelCard.tsx`
  + `src/lib/game.ts` + `Roster.tsx` + `ChatPanel.tsx`. Live via SSE (see Multiplayer).
- Dark war-room theme (Space Grotesk / JetBrains Mono / DM Sans) in `src/index.css`; dark-by-default.
- Targeting: click a button to arm a mode (highlighted, hint line appears), click a valid target
  cell; click the button again to cancel.

## Assumptions taken (user didn't specify)
- Expand costs 1 AP and is capped at range 5.
- Elimination at 0 HP removes the commander until they rejoin (fresh deploy).
- No kill rewards, no healing. "6pm local time" = server timezone (APP_TZ, default UTC).
