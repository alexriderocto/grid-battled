import { useState } from "react";
import type { DragEvent, MouseEvent, ReactElement } from "react";
import { BOARD, OWN_RANGE_DEFAULT, RIVAL_RANGE_DEFAULT, manhattan } from "@/lib/game";
import type { Player } from "@/lib/game";
import type { ActionMode } from "@/hooks/useActions";
import BoardCell from "@/components/game/BoardCell";
import type { RangeTint } from "@/components/game/BoardCell";
import CellIntelCard from "@/components/game/CellIntelCard";

const AXIS = Array.from({ length: BOARD }, (_, i) => i);
const TRACK = `repeat(${BOARD}, minmax(0, 1fr))`;
const PICK_FREE = "cursor-crosshair hover:ring-1 hover:ring-amber-400/70";
const AMBER = "!border-amber-400 !bg-amber-500/25";

interface HoverState {
  player: Player;
  cx: number;
  cy: number;
}

export interface GameBoardProps {
  players: Player[];
  self: Player | null;
  mode: ActionMode | null;
  actionPending: boolean;
  offline: boolean;
  isAdmin: boolean;
  teleportId: string | null;
  spawn: { x: number; y: number } | null;
  pickingSpawn: boolean;
  onCellClick: (x: number, y: number, occupant: Player | undefined) => void;
  onTeleportDrop: (id: string, x: number, y: number) => void;
}

/** Range diamond tint for an empty cell: your own range wins, then the first rival covering it.
 * Each commander may pick their own colour (Customise); otherwise sky (yours) / rose (rivals). */
function rangeTint(x: number, y: number, self: Player | null, players: Player[]): RangeTint | null {
  if (self) {
    const d = manhattan(x, y, self.x, self.y);
    if (d >= 1 && d <= self.range) return { color: self.range_color ?? OWN_RANGE_DEFAULT, own: true };
  }
  const rival = players.find((q) => q.id !== self?.id && manhattan(x, y, q.x, q.y) <= q.range);
  return rival ? { color: rival.range_color ?? RIVAL_RANGE_DEFAULT, own: false } : null;
}

/** While a mode is armed, valid targets get a crosshair ring. */
function targetRing(x: number, y: number, p: Player | undefined, self: Player | null, mode: ActionMode | null): string {
  if (!mode || !self) return "";
  const d = manhattan(x, y, self.x, self.y);
  const reach = mode === "move" && self.player_class === "sprinter" ? self.range * 2 : self.range;
  if (d < 1 || d > reach) return "";
  if (mode === "move") return p ? "" : "ring-1 ring-emerald-400/70 cursor-crosshair";
  if (!p || p.id === self.id) return "";
  return mode === "heal" ? "ring-1 ring-pink-400/80 cursor-crosshair" : "ring-1 ring-rose-400/80 cursor-crosshair";
}

/** The 15×15 map with axes, range diamonds, targeting rings, admin drag-teleport and Cell Intel hover. */
export default function GameBoard(props: GameBoardProps): ReactElement {
  const { players, self, mode, isAdmin, teleportId, spawn, pickingSpawn } = props;
  const [hover, setHover] = useState<HoverState | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const occupied = new Map<string, Player>(players.map((p) => [`${p.y}:${p.x}`, p]));
  const armedMode = props.actionPending ? null : mode;

  const stateClassFor = (key: string, c: number, r: number, p: Player | undefined): string => {
    const parts = [targetRing(c, r, p, self, armedMode)];
    if (p && !mode) parts.push("cursor-pointer");
    if (pickingSpawn && !p) parts.push(PICK_FREE);
    if (spawn && spawn.x === c && spawn.y === r) parts.push(`${AMBER} ring-2 ring-amber-400`);
    if (dragOver === key) parts.push(AMBER);
    if (isAdmin && p) parts.push("cursor-grab active:cursor-grabbing");
    if (isAdmin && teleportId && !p) parts.push(PICK_FREE);
    if (isAdmin && teleportId && p?.id === teleportId) parts.push("ring-2 ring-amber-400");
    return parts.join(" ");
  };

  const renderCell = (r: number, c: number): ReactElement => {
    const key = `${r}:${c}`;
    const p = occupied.get(key);
    return (
      <BoardCell
        key={key}
        row={r}
        col={c}
        player={p}
        isSelf={p !== undefined && p.id === self?.id}
        tint={p ? null : rangeTint(c, r, self, players)}
        stateClass={stateClassFor(key, c, r, p)}
        isSpawn={spawn !== null && spawn.x === c && spawn.y === r}
        draggable={Boolean(isAdmin && p)}
        onClick={() => {
          if (p) setHover(null);
          props.onCellClick(c, r, p);
        }}
        onDragStart={(e: DragEvent<HTMLDivElement>) => {
          if (!isAdmin || !p) return;
          e.dataTransfer.setData("text/plain", p.id);
          e.dataTransfer.effectAllowed = "move";
          setHover(null);
        }}
        onDragOver={(e: DragEvent<HTMLDivElement>) => {
          if (!isAdmin || p) return;
          e.preventDefault(); // allow drop on empty squares only
          if (dragOver !== key) setDragOver(key);
        }}
        onDragLeave={() => setDragOver((k) => (k === key ? null : k))}
        onDrop={(e: DragEvent<HTMLDivElement>) => {
          e.preventDefault();
          setDragOver(null);
          const id = e.dataTransfer.getData("text/plain");
          if (isAdmin && id && !p) props.onTeleportDrop(id, c, r);
        }}
        // mousemove is authoritative: a token can arrive under a cursor that's already parked here
        onPointer={(e: MouseEvent<HTMLDivElement>) => {
          if (p) setHover({ player: p, cx: e.clientX, cy: e.clientY });
        }}
        onPointerLeave={() => {
          if (p) setHover((h) => (h && h.player.id === p.id ? null : h));
        }}
      />
    );
  };

  return (
    <section className="w-full max-w-4xl rounded-xl border-2 border-slate-800 bg-slate-950/80 p-3 shadow-2xl md:p-6">
      {props.offline && (
        <p
          data-testid="map-offline-notice"
          className="mb-3 text-center font-mono text-[11px] uppercase tracking-[0.25em] text-slate-500"
        >
          Map link offline — retrying…
        </p>
      )}
      <div className="mx-auto w-full max-w-[620px]">
        <div className="flex">
          <div className="w-6 shrink-0" />
          <div className="grid flex-1 gap-[2px] px-1 pb-1 md:gap-1" style={{ gridTemplateColumns: TRACK }}>
            {AXIS.map((c) => (
              <span key={`col-${c}`} className="text-center font-mono text-[10px] text-slate-500">
                {c + 1}
              </span>
            ))}
          </div>
        </div>
        <div className="flex">
          <div className="grid w-6 shrink-0 py-1 pr-1" style={{ gridTemplateRows: TRACK }}>
            {AXIS.map((r) => (
              <span key={`row-${r}`} className="flex items-center justify-center font-mono text-[10px] text-slate-500">
                {r + 1}
              </span>
            ))}
          </div>
          <div
            data-testid="game-grid-15x15"
            role="grid"
            aria-label={`${BOARD} by ${BOARD} game map`}
            className="grid flex-1 gap-[2px] rounded-lg bg-slate-800/60 p-1 md:gap-1"
            style={{ gridTemplateColumns: TRACK }}
          >
            {AXIS.flatMap((r) => AXIS.map((c) => renderCell(r, c)))}
          </div>
        </div>
      </div>
      {hover && <CellIntelCard player={hover.player} cx={hover.cx} cy={hover.cy} />}
    </section>
  );
}
