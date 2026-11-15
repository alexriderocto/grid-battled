import type { ReactElement } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { apiPost } from "@/lib/api";
import { errorDetail } from "@/lib/errors";
import type { AdminOk, BanEntry, GameSettings } from "@/lib/game";
import BanList from "@/components/game/BanList";
import PlayerCapControl from "@/components/game/PlayerCapControl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const BADGE = "font-mono text-[10px] uppercase tracking-wider";

/** Replaces the commander banner while signed in as Admin: status, player cap, ban list, sign out. */
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
}): ReactElement {
  const queryClient = useQueryClient();
  const bans = useQuery({
    queryKey: ["admin-bans"],
    queryFn: () => apiPost<BanEntry[]>("/game/admin/bans", { password }),
  });
  const unban = useMutation<AdminOk, Error, string>({
    mutationFn: (username) => apiPost<AdminOk>("/game/admin/unban", { password, username }),
    onSuccess: (res) => {
      toast.success(res.detail);
      void queryClient.invalidateQueries({ queryKey: ["admin-bans"] });
    },
    onError: (err) => toast.error(errorDetail(err, "Unban failed")),
  });
  const list = bans.data ?? [];

  return (
    <Card data-testid="admin-console" className="w-full max-w-4xl border-amber-500/40 bg-card/90 shadow-xl backdrop-blur-md">
      <CardContent className="flex flex-col gap-4 py-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-amber-400 bg-amber-500/20 text-amber-300">
            <ShieldAlert className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-amber-300">Admin console</p>
            <p className="font-heading text-xl font-bold tracking-tight text-slate-100">Signed in as Admin</p>
          </div>
          <Badge variant="secondary" className={BADGE}>
            {playerCount} commanders
          </Badge>
          <Badge variant="secondary" data-testid="admin-ban-count" className={BADGE}>
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
        <BanList bans={list} pending={unban.isPending} onUnban={(u) => unban.mutate(u)} />
      </CardContent>
    </Card>
  );
}
