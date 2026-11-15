import type { ReactElement } from "react";
import type { Player } from "@/lib/game";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import RosterRow from "@/components/game/RosterRow";

/** Me first, everyone else in board order. */
function selfFirst(players: Player[], selfId: string | null): Player[] {
  const me = players.filter((p) => p.id === selfId);
  const others = players.filter((p) => p.id !== selfId);
  return [...me, ...others];
}

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
}): ReactElement {
  const ordered = selfFirst(players, selfId);
  return (
    <Card data-testid="roster-panel" className="flex-1 border-slate-800 bg-card/90 shadow-xl backdrop-blur-md">
      <CardHeader>
        <CardTitle className="font-heading flex items-center justify-between text-base font-bold tracking-tight text-slate-100">
          Commanders online
          <Badge variant="secondary" data-testid="roster-count" className="font-mono text-[10px] tracking-wider">
            {players.filter((p) => p.online).length}/{players.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        {ordered.length === 0 && (
          <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">No commanders yet — deploy first</p>
        )}
        {ordered.map((p) => (
          <RosterRow
            key={p.id}
            player={p}
            isSelf={p.id === selfId}
            unread={unread[p.id] ?? 0}
            onSelect={() => onSelect(p)}
          />
        ))}
      </CardContent>
    </Card>
  );
}
