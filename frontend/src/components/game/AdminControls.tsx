import { useState } from "react";
import type { ReactElement } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, Gauge, Move, Skull, Zap } from "lucide-react";
import { toast } from "sonner";
import { apiPost } from "@/lib/api";
import { errorDetail } from "@/lib/errors";
import { ADMIN_MAX_RANGE, CLASS_INFO } from "@/lib/game";
import type { AdminOk, Player, PlayerClass } from "@/lib/game";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import AdminNumberForm from "@/components/game/AdminNumberForm";

type AdminCall =
  | { kind: "kill" }
  | { kind: "ban" }
  | { kind: "range"; range: number }
  | { kind: "ap"; amount: number }
  | { kind: "class"; player_class: PlayerClass };

function callAdmin(call: AdminCall, password: string, targetId: string): Promise<AdminOk | Player> {
  const base = { password, target_id: targetId };
  switch (call.kind) {
    case "kill":
      return apiPost<AdminOk>("/game/admin/kill", base);
    case "ban":
      return apiPost<AdminOk>("/game/admin/ban", base);
    case "range":
      return apiPost<Player>("/game/admin/set-range", { ...base, range: call.range });
    case "ap":
      return apiPost<Player>("/game/admin/give-ap", { ...base, amount: call.amount });
    case "class":
      return apiPost<Player>("/game/admin/set-class", { ...base, player_class: call.player_class });
  }
}

function successMessage(res: AdminOk | Player, call: AdminCall, name: string): string {
  switch (call.kind) {
    case "kill":
    case "ban":
      return (res as AdminOk).detail;
    case "class":
      return `${name} is now ${CLASS_INFO[(res as Player).player_class].label}`;
    case "range":
      return `${name}'s range set to ${(res as Player).range}`;
    case "ap": {
      const verb = call.amount >= 0 ? `Gave ${call.amount} AP to` : `Removed ${-call.amount} AP from`;
      return `${verb} ${name} — now ${(res as Player).ap} AP`;
    }
  }
}

function ConfirmButton({
  kind,
  armed,
  disabled,
  icon: Icon,
  idle,
  confirm,
  onArm,
  onConfirm,
}: {
  kind: "kill" | "ban";
  armed: boolean;
  disabled: boolean;
  icon: typeof Skull;
  idle: string;
  confirm: string;
  onArm: () => void;
  onConfirm: () => void;
}): ReactElement {
  return (
    <Button variant="destructive" data-testid={`admin-${kind}-button`} disabled={disabled} onClick={armed ? onConfirm : onArm}>
      <Icon className="mr-2 size-4" />
      {armed ? confirm : idle}
    </Button>
  );
}

function ClassSelect({ value, onChange }: { value: PlayerClass; onChange: (c: PlayerClass) => void }): ReactElement {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[5.5rem] shrink-0 font-mono text-[10px] uppercase tracking-wider text-slate-400">Class</span>
      <Select
        value={value}
        onValueChange={(v: string) => {
          if (v !== value) onChange(v as PlayerClass);
        }}
      >
        <SelectTrigger data-testid="admin-class-select" size="sm" className="flex-1 border-slate-700 bg-slate-950/60">
          <SelectValue>{(v) => CLASS_INFO[v as PlayerClass]?.label ?? "Class"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(CLASS_INFO) as PlayerClass[]).map((c) => (
            <SelectItem key={c} value={c} data-testid={`admin-class-option-${c}`}>
              {CLASS_INFO[c].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Admin-only controls inside a commander's profile: kill, ban, teleport, class, range, AP.
 * The parent keys this by player id + range, so the inputs reset when either changes. */
export default function AdminControls({
  player,
  password,
  onTeleport,
}: {
  player: Player;
  password: string;
  onTeleport: () => void;
}): ReactElement {
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<"kill" | "ban" | null>(null);

  const run = useMutation<AdminOk | Player, Error, AdminCall>({
    mutationFn: (call) => callAdmin(call, password, player.id),
    onSuccess: (res, call) => {
      setConfirm(null);
      void queryClient.invalidateQueries({ queryKey: ["board"] });
      if (call.kind === "ban") void queryClient.invalidateQueries({ queryKey: ["admin-bans"] });
      toast.success(successMessage(res, call, player.username));
    },
    onError: (err) => toast.error(errorDetail(err, "Admin action failed")),
  });

  return (
    <div data-testid="admin-controls" className="flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/[0.06] p-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-amber-300">Admin controls</p>

      <div className="grid grid-cols-2 gap-2">
        <ConfirmButton
          kind="kill"
          armed={confirm === "kill"}
          disabled={run.isPending}
          icon={Skull}
          idle="Kill instantly"
          confirm="Confirm kill"
          onArm={() => setConfirm("kill")}
          onConfirm={() => run.mutate({ kind: "kill" })}
        />
        <ConfirmButton
          kind="ban"
          armed={confirm === "ban"}
          disabled={run.isPending}
          icon={Ban}
          idle="Ban callsign"
          confirm="Confirm ban"
          onArm={() => setConfirm("ban")}
          onConfirm={() => run.mutate({ kind: "ban" })}
        />
      </div>

      <Button variant="outline" data-testid="admin-teleport-button" onClick={onTeleport}>
        <Move className="mr-2 size-4" />
        Teleport — then click a free square
      </Button>

      <ClassSelect value={player.player_class} onChange={(c) => run.mutate({ kind: "class", player_class: c })} />

      <AdminNumberForm
        icon={Gauge}
        label="Range"
        testId="admin-range"
        initial={String(player.range)}
        min={0}
        max={ADMIN_MAX_RANGE}
        isValid={(n) => n >= 0 && n <= ADMIN_MAX_RANGE}
        submitLabel="Set"
        disabled={run.isPending}
        onSubmit={(n) => run.mutate({ kind: "range", range: n })}
      />
      <AdminNumberForm
        icon={Zap}
        label="Give AP"
        testId="admin-ap"
        initial="1"
        min={-99}
        max={99}
        isValid={(n) => n !== 0 && Math.abs(n) <= 99}
        submitLabel="Give"
        disabled={run.isPending}
        onSubmit={(n) => run.mutate({ kind: "ap", amount: n })}
      />
      <p className="font-mono text-[9px] uppercase tracking-wider text-slate-500">
        Tip: you can also drag tokens on the map · Range 0–{ADMIN_MAX_RANGE} · negative AP removes it
      </p>
    </div>
  );
}
