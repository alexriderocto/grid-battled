import type { ReactElement } from "react";
import { formatDistanceToNow } from "date-fns";
import type { BanEntry } from "@/lib/game";

/** Banned callsigns with an Unban button each. */
export default function BanList({
  bans,
  pending,
  onUnban,
}: {
  bans: BanEntry[];
  pending: boolean;
  onUnban: (username: string) => void;
}): ReactElement {
  return (
    <div data-testid="admin-ban-list" className="flex flex-wrap gap-2">
      {bans.length === 0 && (
        <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">No banned callsigns</span>
      )}
      {bans.map((b) => (
        <span
          key={b.username}
          data-testid={`ban-entry-${b.username}`}
          className="flex items-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 font-mono text-[11px] text-red-200"
        >
          {b.username}
          <span className="text-[9px] text-red-300/70">{formatDistanceToNow(new Date(b.banned_at), { addSuffix: true })}</span>
          <button
            type="button"
            data-testid={`unban-button-${b.username}`}
            disabled={pending}
            onClick={() => onUnban(b.username)}
            className="rounded border border-red-400/40 px-1.5 text-[9px] uppercase tracking-wider text-red-100 transition-colors duration-150 hover:bg-red-500/30"
          >
            Unban
          </button>
        </span>
      ))}
    </div>
  );
}
