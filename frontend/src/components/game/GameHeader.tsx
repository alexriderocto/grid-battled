import type { ReactElement } from "react";
import { Users } from "lucide-react";
import { BOARD } from "@/lib/game";
import type { GameSettings, Player } from "@/lib/game";
import { Badge } from "@/components/ui/badge";

function headcount(players: Player[], settings: GameSettings | undefined, offline: boolean): string {
  if (offline) return "MAP OFFLINE";
  const online = players.filter((p) => p.online).length;
  const capped = settings?.max_players_enabled ?? false;
  const cap = capped && settings ? `/${settings.max_players}` : "";
  const full = capped && settings && players.length >= settings.max_players ? " · FULL" : "";
  return `${online} ONLINE · ${players.length}${cap} DEPLOYED${full}`;
}

/** Title + live headcount + live-sync indicator. */
export default function GameHeader({
  players,
  settings,
  offline,
  live,
}: {
  players: Player[];
  settings: GameSettings | undefined;
  offline: boolean;
  live: boolean;
}): ReactElement {
  return (
    <header className="flex w-full max-w-4xl items-end justify-between gap-4 border-b border-slate-800 pb-4">
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-sky-400">Tactical operations</p>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-slate-100 md:text-4xl">
          GRID <span className="text-sky-400">BATTLE</span>
        </h1>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Badge
          variant="outline"
          className="border-slate-700 font-mono text-[10px] uppercase tracking-wider text-slate-300"
        >
          Sector {BOARD}×{BOARD}
        </Badge>
        <Badge
          data-testid="player-count-badge"
          className="border border-sky-500/40 bg-sky-500/15 font-mono text-[10px] uppercase tracking-wider text-sky-300"
        >
          <Users className="mr-1 size-3" />
          {headcount(players, settings, offline)}
        </Badge>
        <Badge
          data-testid="live-sync-badge"
          className={`border font-mono text-[10px] uppercase tracking-wider ${
            live
              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
              : "border-slate-700 bg-slate-800/60 text-slate-400"
          }`}
        >
          <span className={`mr-1.5 size-1.5 rounded-full ${live ? "animate-pulse bg-emerald-400" : "bg-slate-500"}`} />
          {live ? "Live" : "Syncing"}
        </Badge>
      </div>
    </header>
  );
}
