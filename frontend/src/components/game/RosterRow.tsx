import type { ReactElement } from "react";
import AvatarFace from "@/components/game/AvatarFace";
import { CLASS_INFO, MAX_HEALTH, PALETTE } from "@/lib/game";
import type { Player } from "@/lib/game";
import { Badge } from "@/components/ui/badge";

function Presence({ player }: { player: Player }): ReactElement {
  return (
    <span
      data-testid={`presence-${player.username}`}
      className={`flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider ${
        player.online ? "text-emerald-300" : "text-slate-500"
      }`}
    >
      <span className={`size-1.5 rounded-full ${player.online ? "animate-pulse bg-emerald-400" : "bg-slate-600"}`} />
      {player.online ? "Online" : "Away"}
    </span>
  );
}

function HealthPips({ health }: { health: number }): ReactElement {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${health}/${MAX_HEALTH} HP`}>
      {Array.from({ length: MAX_HEALTH }, (_, i) => (
        <span key={i} className={`size-1.5 rounded-full ${i < health ? "bg-emerald-400" : "bg-slate-600"}`} />
      ))}
    </span>
  );
}

/** One commander in the live roster. */
export default function RosterRow({
  player,
  isSelf,
  unread,
  onSelect,
}: {
  player: Player;
  isSelf: boolean;
  unread: number;
  onSelect: () => void;
}): ReactElement {
  const tint = PALETTE[player.color % PALETTE.length];
  return (
    <button
      type="button"
      data-testid={`roster-row-${player.username}`}
      onClick={onSelect}
      className={`flex w-full cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors duration-150 hover:border-sky-500/50 ${
        isSelf ? "border-emerald-500/40 bg-emerald-950/40" : "border-slate-800/70 bg-slate-950/50"
      }`}
    >
      <span
        className="flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-full border font-mono text-[10px] font-bold text-white"
        style={{ backgroundColor: tint.bg, borderColor: tint.border }}
      >
        <AvatarFace player={player} />
      </span>
      <span className="font-heading truncate text-sm font-bold text-slate-100">{player.username}</span>
      <Presence player={player} />
      {player.player_class !== "standard" && (
        <span
          data-testid={`class-tag-${player.username}`}
          className="rounded border border-amber-500/40 bg-amber-500/10 px-1 font-mono text-[9px] whitespace-nowrap uppercase text-amber-300"
        >
          {CLASS_INFO[player.player_class].label}
        </span>
      )}
      {isSelf && (
        <Badge className="border border-emerald-500/40 bg-emerald-500/15 font-mono text-[9px] uppercase text-emerald-300">
          You
        </Badge>
      )}
      <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-slate-400">
        [{player.x + 1},{player.y + 1}]
      </span>
      <HealthPips health={player.health} />
      <span className="font-mono text-[10px] uppercase tracking-wider text-sky-300">{player.ap} AP</span>
      {unread > 0 && (
        <span
          data-testid={`unread-badge-${player.username}`}
          className="flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 font-mono text-[9px] font-bold text-white"
        >
          {unread}
        </span>
      )}
    </button>
  );
}
