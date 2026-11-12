// Shared game constants, types and helpers — mirror of backend/models/game.py. Keep in sync.

export const BOARD = 15;
export const BASE_RANGE = 2;
export const MAX_RANGE = 5;
export const MAX_HEALTH = 3;

// Hand-written mirror of backend/models/game.py::Player — nothing infers across the HTTP boundary.
export interface Player {
  id: string;
  username: string;
  x: number;
  y: number;
  color: number;
  health: number;
  ap: number;
  range: number;
  created_at: string;
  last_active: string;
  last_moved: string;
  online: boolean; // true while the commander has a visible browser tab open on the game
}

export interface Credentials {
  username: string;
  password: string;
}

export interface AttackResult {
  attacker: Player;
  target: Player | null; // null once the target's health reaches 0
  target_username: string | null;
  eliminated: boolean;
}

export interface TransferResult {
  source: Player;
  target: Player;
}

// Mirror of backend/models/game.py::ChatMessage.
export interface ChatMessage {
  id: string;
  username: string;
  color: number;
  text: string;
  created_at: string;
}

// Mirror of backend/models/game.py::BoardSnapshot — what GET /game/state and the SSE stream carry.
export interface BoardState {
  players: Player[];
  chat: ChatMessage[];
}

// Mirror of the backend's token palette (models/game.py TOKEN_COLORS = 8).
export const PALETTE = [
  { bg: "#10B981", border: "#34D399" },
  { bg: "#D97706", border: "#FBBF24" },
  { bg: "#0284C7", border: "#38BDF8" },
  { bg: "#E11D48", border: "#FB7185" },
  { bg: "#7C3AED", border: "#A78BFA" },
  { bg: "#4F46E5", border: "#818CF8" },
  { bg: "#C026D3", border: "#E879F9" },
  { bg: "#0D9488", border: "#2DD4BF" },
] as const;

/** Diamond (manhattan) distance on the board — a commander's range is manhattan <= range. */
export function manhattan(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}
