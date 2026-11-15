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
  at 6pm UK time all year (APP_TZ="Europe/London" in backend/.env — GMT in winter, BST in summer). Grants are
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

## Player cap + admin teleport (milestone 8)
- **Max player count (toggleable)**: `app.settings {_id:"game", max_players_enabled, max_players 1–225}`
  (defaults off/20). GameSettings is public in every snapshot (`BoardState.settings`). When ON and
  deployed count >= cap, NEW callsigns are refused by /name-check and /join (403 "The grid is full (n/max …)");
  existing commanders can always rejoin; lowering the cap never kicks anyone. Header shows "n/max DEPLOYED · FULL".
  Admin console: PlayerCapControl (checkbox + number + Save) -> `POST /api/game/admin/settings {password, max_players_enabled, max_players}`.
- **Teleport**: `POST /api/game/admin/teleport {password, target_id, x, y}` (400 occupied, 404 gone, 422 off-board;
  updates last_moved). UI: admin drags any token onto an empty square (HTML5 DnD, amber drop highlight), OR
  profile -> "Teleport" -> click a free square (phone-friendly; amber hint + Cancel under the map).

## Admin (milestone 7) — creds in memory/test_credentials.md
- Sign in with callsign `Admin` + ADMIN_PASSWORD (backend/.env, "314159") in the normal join form ->
  `POST /api/game/admin/login {password}`. Admin is NOT a token on the map; AdminConsole replaces the banner
  (ban list + Unban, Sign out). Session is memory-only (refresh signs out). "admin" callsign reserved (403 on /join).
- Click any commander (map/roster) -> ProfileDialog shows AdminControls: Kill instantly / Ban callsign
  (two-click confirm), set Range 0–14 (ADMIN_MAX_RANGE; Expand still caps at 5; >5 shows "n ★"),
  Give AP (−99..99, floored at 0). All broadcast live.
- Endpoints (all POST, body carries `password`): /api/game/admin/{login,kill,ban,unban,bans,set-range,give-ap}.
  401 wrong code, 404 unknown target, 429 after 5 wrong codes/IP (10 min, in-memory).
- Ban = upsert `app.bans {username_key, username, banned_at}` + delete player. /join and /name-check reject
  banned callsigns (403 "This callsign has been banned by the Admin"). Kill = delete player (they may redeploy).
- Banner/range-shading now read the LIVE board copy of yourself (Home `self` = players.find(sessionSelf.id)),
  so admin edits, AP transfers and damage from others show instantly.

## Callsign filter (milestone 6)
- `backend/lib/name_filter.py` `is_offensive()` blocks swearing + racial/hate slurs. Normalises case, accents,
  leetspeak (0/1/3/4/5/7/@/$…), separators, stretched letters (3+ repeats). Two tiers: SUBSTRING_TERMS
  blocked anywhere; TOKEN_TERMS (short words like dick/paki/spic/ass) only as a whole word-part
  (split on camelCase/digits/separators) so Dickens, Pakistan, Spicy, Cassandra, Therapist pass.
  Known accepted trade-off: "Scunthorpe" is blocked (contains a slur substring).
- `POST /api/game/name-check {username}` -> `{allowed, detail}` — join form calls it for NEW callsigns
  before the class picker. `POST /api/game/join` enforces it again (400 + REJECTION message) for both
  new profiles and sign-ins to existing callsigns. Chat/DM text is NOT filtered (not requested).

## Classes (milestone 5) — chosen once, when a NEW profile is created
- Flow: enter callsign + code -> Join. If the callsign is on the board (case-insensitive) it's a straight
  rejoin (class locked). Otherwise the ClassPicker replaces the join panel: pick Standard or Alliance
  (Alliance: click a free map square to set spawn, amber marker) -> "Deploy as …". Back returns to the form.
- **Standard**: no modifiers — random free spawn, 1 AP at deploy, +1 AP every 6pm UK time.
- **Alliance**: choose spawn square (must be free, else 400); first two AP grants skipped = 0 AP at deploy
  AND the first 6pm grant withheld (stored `ap_skip`=1, decremented in accrue); AP starts at the 2nd 6pm.
- `POST /api/game/join` accepts optional `player_class` ("standard" default | "alliance"), `spawn_x`,
  `spawn_y` (0–14, required for alliance -> else 422). Ignored on rejoin. Player gains `player_class`.
- Shown in: banner "Class: …", profile dialog, roster "Alliance" tag. Pre-class players default to standard.
- Eliminated commanders are deleted, so redeploying = new profile = choose class again.

## Commander profile + private messages (milestone 4)
- Click any commander (map token when no action is armed, or roster row) -> ProfileDialog: AP, range
  (n/5), HP, sector, Online/Away, last moved; plus a private DM thread (if you're deployed and it isn't you).
- `POST /api/game/dm/send {username,password,to_id,text<=280}` -> DirectMessage | 400 self | 404 gone | 401 | 422
- `POST /api/game/dm/thread {username,password,with_id}` -> DirectMessage[] (oldest first, last 100);
  marks their messages to you read. Only returns the pair (you <-> with_id), so nobody can read others' DMs.
- `POST /api/game/dm/unread {username,password}` -> `{counts: {sender_id: n}}`
- Real-time: SSE `event: dm` (empty `{}` payload — content-free ping) goes only to the streams of the
  sender + recipient; client refetches unread + thread. Roster shows a rose unread badge; a toast with
  an "Open" action pops for new messages (not for the thread currently open).
- Mongo `app.dms`: `{id, from_id, from_username, to_id, to_username, text, created_at, read}`
  (indexes to_read, pair_created). Stream presence id is unauthenticated, so a spoofer could at most
  learn *that* someone had DM activity — never the content.

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
- No kill rewards, no healing. "6pm local time" = 6pm UK time (APP_TZ=Europe/London).
