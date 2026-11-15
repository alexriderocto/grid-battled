import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, Gauge, Move, Skull, Zap } from "lucide-react";
import { toast } from "sonner";
import { apiPost, ApiError } from "@/lib/api";
import { ADMIN_MAX_RANGE } from "@/lib/game";
import type { AdminOk, Player } from "@/lib/game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type AdminCall =
  | { kind: "kill" }
  | { kind: "ban" }
  | { kind: "range"; range: number }
  | { kind: "ap"; amount: number };

function detailOf(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const d = (err.body as { detail?: unknown } | null)?.detail;
    if (typeof d === "string") return d;
  }
  return fallback;
}

/** Admin-only controls inside a commander's profile: kill, ban, set range, give AP. */
export default function AdminControls({
  player,
  password,
  onTeleport,
}: {
  player: Player;
  password: string;
  onTeleport: () => void;
}) {
  const queryClient = useQueryClient();
  const [rangeInput, setRangeInput] = useState(String(player.range));
  const [apInput, setApInput] = useState("1");
  const [confirm, setConfirm] = useState<"kill" | "ban" | null>(null);

  useEffect(() => {
    setRangeInput(String(player.range));
    setConfirm(null);
  }, [player.id, player.range]);

  const run = useMutation<AdminOk | Player, Error, AdminCall>({
    mutationFn: (call) => {
      const base = { password, target_id: player.id };
      switch (call.kind) {
        case "kill":
          return apiPost<AdminOk>("/game/admin/kill", base);
        case "ban":
          return apiPost<AdminOk>("/game/admin/ban", base);
        case "range":
          return apiPost<Player>("/game/admin/set-range", { ...base, range: call.range });
        case "ap":
          return apiPost<Player>("/game/admin/give-ap", { ...base, amount: call.amount });
      }
    },
    onSuccess: (res, call) => {
      setConfirm(null);
      void queryClient.invalidateQueries({ queryKey: ["board"] });
      if (call.kind === "ban") void queryClient.invalidateQueries({ queryKey: ["admin-bans"] });
      if (call.kind === "kill" || call.kind === "ban") toast.success((res as AdminOk).detail);
      if (call.kind === "range") toast.success(`${player.username}'s range set to ${(res as Player).range}`);
      if (call.kind === "ap") {
        const verb = call.amount >= 0 ? `Gave ${call.amount} AP to` : `Removed ${-call.amount} AP from`;
        toast.success(`${verb} ${player.username} — now ${(res as Player).ap} AP`);
      }
    },
    onError: (err) => toast.error(detailOf(err, "Admin action failed")),
  });

  const rangeVal = Number(rangeInput);
  const rangeOk = rangeInput !== "" && Number.isInteger(rangeVal) && rangeVal >= 0 && rangeVal <= ADMIN_MAX_RANGE;
  const apVal = Number(apInput);
  const apOk = apInput !== "" && Number.isInteger(apVal) && apVal !== 0 && Math.abs(apVal) <= 99;

  return (
    <div
      data-testid="admin-controls"
      className="flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/[0.06] p-3"
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-amber-300">Admin controls</p>

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="destructive"
          data-testid="admin-kill-button"
          disabled={run.isPending}
          onClick={() => (confirm === "kill" ? run.mutate({ kind: "kill" }) : setConfirm("kill"))}
        >
          <Skull className="mr-2 size-4" />
          {confirm === "kill" ? "Confirm kill" : "Kill instantly"}
        </Button>
        <Button
          variant="destructive"
          data-testid="admin-ban-button"
          disabled={run.isPending}
          onClick={() => (confirm === "ban" ? run.mutate({ kind: "ban" }) : setConfirm("ban"))}
        >
          <Ban className="mr-2 size-4" />
          {confirm === "ban" ? "Confirm ban" : "Ban callsign"}
        </Button>
      </div>

      <Button variant="outline" data-testid="admin-teleport-button" onClick={onTeleport}>
        <Move className="mr-2 size-4" />
        Teleport — then click a free square
      </Button>

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (rangeOk) run.mutate({ kind: "range", range: rangeVal });
        }}
      >
        <Gauge className="size-4 shrink-0 text-amber-300" />
        <span className="w-16 shrink-0 font-mono text-[10px] uppercase tracking-wider text-slate-400">Range</span>
        <Input
          data-testid="admin-range-input"
          type="number"
          min={0}
          max={ADMIN_MAX_RANGE}
          value={rangeInput}
          onChange={(e) => setRangeInput(e.target.value)}
          className="h-8 border-slate-700 bg-slate-950/60 font-mono"
        />
        <Button type="submit" size="sm" variant="outline" data-testid="admin-range-button" disabled={!rangeOk || run.isPending}>
          Set
        </Button>
      </form>

      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (apOk) run.mutate({ kind: "ap", amount: apVal });
        }}
      >
        <Zap className="size-4 shrink-0 text-amber-300" />
        <span className="w-16 shrink-0 font-mono text-[10px] uppercase tracking-wider text-slate-400">Give AP</span>
        <Input
          data-testid="admin-ap-input"
          type="number"
          min={-99}
          max={99}
          value={apInput}
          onChange={(e) => setApInput(e.target.value)}
          className="h-8 border-slate-700 bg-slate-950/60 font-mono"
        />
        <Button type="submit" size="sm" variant="outline" data-testid="admin-ap-button" disabled={!apOk || run.isPending}>
          Give
        </Button>
      </form>
      <p className="font-mono text-[9px] uppercase tracking-wider text-slate-500">
        Tip: you can also drag tokens on the map · Range 0–{ADMIN_MAX_RANGE} · negative AP removes it
      </p>
    </div>
  );
}
