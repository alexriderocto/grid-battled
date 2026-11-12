import { MAX_HEALTH, PALETTE } from "@/lib/game";
import type { Player } from "@/lib/game";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Live roster — every commander on the grid: who, where, how hurt, how much AP. */
export default function Roster({
  players,
  selfId,
  unread,
  onSelect,
}: {
  players: Player[];
  selfId: string | null;
  unread: Record<string, number>;
  onSelect: (p: Player) => void;
}) {
  const ordered = [...players].sort((a, b) => (a.id === selfId ? -1 : b.id === selfId ? 1 : 0));

  return (
    <Card
      data-testid="roster-panel"
      className="flex-1 border-slate-800 bg-card/90 shadow-xl backdrop-blur-md"
    >
      <CardHeader>
        <CardTitle className="font-heading flex items-center justify-between text-base font-bold tracking-tight text-slate-100">
          Commanders online
          <Badge
            variant="secondary"
            data-testid="roster-count"
            className="font-mono text-[10px] tracking-wider"
          >
            {players.filter((p) => p.online).length}/{players.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        {ordered.length === 0 && (
          <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">
            No commanders yet — deploy first
          </p>
        )}
        {ordered.map((p) => (
          <button
            type="button"
            key={p.id}
            data-testid={`roster-row-${p.username}`}
            onClick={() => onSelect(p)}
            className={`flex w-full cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors duration-150 hover:border-sky-500/50 ${
              p.id === selfId
                ? "border-emerald-500/40 bg-emerald-950/40"
                : "border-slate-800/70 bg-slate-950/50"
            }`}
          >
            <span
              className="flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] font-bold text-white"
              style={{
                backgroundColor: PALETTE[p.color % PALETTE.length].bg,
                borderColor: PALETTE[p.color % PALETTE.length].border,
              }}
            >
              {p.username.charAt(0).toUpperCase()}
            </span>
            <span className="font-heading truncate text-sm font-bold text-slate-100">
              {p.username}
            </span>
            <span
              data-testid={`presence-${p.username}`}
              className={`flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider ${
                p.online ? "text-emerald-300" : "text-slate-500"
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${p.online ? "animate-pulse bg-emerald-400" : "bg-slate-600"}`}
              />
              {p.online ? "Online" : "Away"}
            </span>
            {p.id === selfId && (
              <Badge className="border border-emerald-500/40 bg-emerald-500/15 font-mono text-[9px] uppercase text-emerald-300">
                You
              </Badge>
            )}
            <span className="font-mono ml-auto text-[10px] uppercase tracking-wider text-slate-400">
              [{p.x + 1},{p.y + 1}]
            </span>
            <span className="flex items-center gap-0.5" aria-label={`${p.health}/${MAX_HEALTH} HP`}>
              {Array.from({ length: MAX_HEALTH }, (_, i) => (
                <span
                  key={i}
                  className={`size-1.5 rounded-full ${i < p.health ? "bg-emerald-400" : "bg-slate-600"}`}
                />
              ))}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-sky-300">
              {p.ap} AP
            </span>
            {(unread[p.id] ?? 0) > 0 && (
              <span
                data-testid={`unread-badge-${p.username}`}
                className="flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 font-mono text-[9px] font-bold text-white"
              >
                {unread[p.id]}
              </span>
            )}
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
