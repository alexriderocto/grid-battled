import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { apiPost, ApiError } from "@/lib/api";
import type { AdminOk, BanEntry, GameSettings } from "@/lib/game";
import PlayerCapControl from "@/components/game/PlayerCapControl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** Replaces the commander banner while signed in as Admin: status, ban list with unban, sign out. */
export default function AdminConsole({
  password,
  playerCount,
  settings,
  onLeave,
}: {
  password: string;
  playerCount: number;
  settings: GameSettings | undefined;
  onLeave: () => void;
}) {
  const queryClient = useQueryClient();
  const bans = useQuery({
    queryKey: ["admin-bans"],
    queryFn: () => apiPost<BanEntry[]>("/game/admin/bans", { password }),
  });
  const unban = useMutation({
    mutationFn: (username: string) => apiPost<AdminOk>("/game/admin/unban", { password, username }),
    onSuccess: (res) => {
      toast.success(res.detail);
      void queryClient.invalidateQueries({ queryKey: ["admin-bans"] });
    },
    onError: (err) => {
      const d = err instanceof ApiError ? (err.body as { detail?: unknown } | null)?.detail : null;
      toast.error(typeof d === "string" ? d : "Unban failed");
    },
  });
  const list = bans.data ?? [];

  return (
    <Card
      data-testid="admin-console"
      className="w-full max-w-4xl border-amber-500/40 bg-card/90 shadow-xl backdrop-blur-md"
    >
      <CardContent className="flex flex-col gap-4 py-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-amber-400 bg-amber-500/20 text-amber-300">
            <ShieldAlert className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-amber-300">Admin console</p>
            <p className="font-heading text-xl font-bold tracking-tight text-slate-100">Signed in as Admin</p>
          </div>
          <Badge variant="secondary" className="font-mono text-[10px] uppercase tracking-wider">
            {playerCount} commanders
          </Badge>
          <Badge
            variant="secondary"
            data-testid="admin-ban-count"
            className="font-mono text-[10px] uppercase tracking-wider"
          >
            {list.length} banned
          </Badge>
          <div className="ml-auto">
            <Button variant="outline" data-testid="admin-leave-button" onClick={onLeave}>
              Sign out
            </Button>
          </div>
        </div>
        <p className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
          Click any commander to kill, ban, teleport, set range or give AP · drag a token to teleport it.
        </p>
        <PlayerCapControl password={password} settings={settings} playerCount={playerCount} />
        <div data-testid="admin-ban-list" className="flex flex-wrap gap-2">
          {list.length === 0 && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">No banned callsigns</span>
          )}
          {list.map((b) => (
            <span
              key={b.username}
              data-testid={`ban-entry-${b.username}`}
              className="flex items-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 font-mono text-[11px] text-red-200"
            >
              {b.username}
              <span className="text-[9px] text-red-300/70">
                {formatDistanceToNow(new Date(b.banned_at), { addSuffix: true })}
              </span>
              <button
                type="button"
                data-testid={`unban-button-${b.username}`}
                disabled={unban.isPending}
                onClick={() => unban.mutate(b.username)}
                className="rounded border border-red-400/40 px-1.5 text-[9px] uppercase tracking-wider text-red-100 transition-colors duration-150 hover:bg-red-500/30"
              >
                Unban
              </button>
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
