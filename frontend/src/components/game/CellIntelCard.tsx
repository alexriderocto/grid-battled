import { formatDistanceToNow } from "date-fns";
import { MAX_HEALTH, PALETTE } from "@/lib/game";
import type { Player } from "@/lib/game";

const CARD_WIDTH = 232;
const CARD_HEIGHT = 140;

/** Cell Intel — hover card on any occupied square: who's there, their status, when they last moved. */
export default function CellIntelCard({ player, cx, cy }: { player: Player; cx: number; cy: number }) {
  const tint = PALETTE[player.color % PALETTE.length];
  const width = typeof window === "undefined" ? 1280 : window.innerWidth;
  const height = typeof window === "undefined" ? 800 : window.innerHeight;
  const left = Math.max(8, Math.min(cx + 14, width - CARD_WIDTH - 8));
  const top = Math.max(8, Math.min(cy + 16, height - CARD_HEIGHT - 8));
  const moved = new Date(player.last_moved);
  const movedText = Number.isNaN(moved.getTime())
    ? "unknown"
    : formatDistanceToNow(moved, { addSuffix: true });

  return (
    <div
      data-testid="cell-intel-card"
      className="pointer-events-none fixed z-50 w-56 rounded-lg border border-slate-700 bg-slate-900/95 p-3 shadow-2xl backdrop-blur"
      style={{ left, top }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-bold text-white"
          style={{ backgroundColor: tint.bg, borderColor: tint.border }}
        >
          {player.username.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p data-testid="intel-username" className="font-heading truncate text-sm font-bold text-slate-100">
            {player.username}
          </p>
          <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
            Sector [{player.x + 1}, {player.y + 1}]
          </p>
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">HP</span>
        {Array.from({ length: MAX_HEALTH }, (_, i) => (
          <span
            key={i}
            className={`size-2 rounded-full ${i < player.health ? "bg-emerald-400" : "bg-slate-600"}`}
          />
        ))}
        <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-sky-300">
          {player.ap} AP
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
          rng {player.range}
        </span>
      </div>
      <p
        data-testid="intel-last-moved"
        className="mt-2 font-mono text-[10px] uppercase tracking-wider text-slate-500"
      >
        Last moved {movedText}
      </p>
    </div>
  );
}
