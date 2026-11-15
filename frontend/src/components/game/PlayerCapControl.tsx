import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { toast } from "sonner";
import { apiPost } from "@/lib/api";
import { errorDetail } from "@/lib/errors";
import type { GameSettings } from "@/lib/game";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Admin console section: toggleable maximum player count. */
export default function PlayerCapControl({
  password,
  settings,
  playerCount,
}: {
  password: string;
  settings: GameSettings | undefined;
  playerCount: number;
}): ReactElement {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [cap, setCap] = useState("20");

  // Sync the form with the live server settings.
  const serverEnabled = settings?.max_players_enabled;
  const serverCap = settings?.max_players;
  useEffect(() => {
    if (serverEnabled === undefined || serverCap === undefined) return;
    setEnabled(serverEnabled);
    setCap(String(serverCap));
  }, [serverEnabled, serverCap]);

  const save = useMutation({
    mutationFn: (next: GameSettings) => apiPost<GameSettings>("/game/admin/settings", { password, ...next }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["board"] });
      toast.success(
        res.max_players_enabled ? `Player cap ON — max ${res.max_players} commanders` : "Player cap OFF — unlimited",
      );
    },
    onError: (err) => toast.error(errorDetail(err, "Could not save the player cap")),
  });

  const capVal = Number(cap);
  const capOk = cap !== "" && Number.isInteger(capVal) && capVal >= 1 && capVal <= 225;
  const dirty =
    !!settings && (enabled !== settings.max_players_enabled || (capOk && capVal !== settings.max_players));

  return (
    <form
      data-testid="player-cap-control"
      className="flex flex-wrap items-center gap-3 rounded-md border border-slate-800 bg-slate-950/50 px-3 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (capOk) save.mutate({ max_players_enabled: enabled, max_players: capVal });
      }}
    >
      <Users className="size-4 text-amber-300" />
      <div className="flex items-center gap-2">
        <Checkbox
          id="cap-enabled"
          data-testid="player-cap-toggle"
          checked={enabled}
          onCheckedChange={(v) => setEnabled(v === true)}
        />
        <Label htmlFor="cap-enabled" className="font-mono text-[11px] uppercase tracking-wider text-slate-300">
          Max players
        </Label>
      </div>
      <Input
        data-testid="player-cap-input"
        type="number"
        min={1}
        max={225}
        value={cap}
        disabled={!enabled}
        onChange={(e) => setCap(e.target.value)}
        className="h-8 w-20 border-slate-700 bg-slate-950/60 font-mono"
      />
      <span data-testid="player-cap-status" className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
        {settings?.max_players_enabled
          ? `${playerCount}/${settings.max_players} — ${playerCount >= settings.max_players ? "full, new joins blocked" : "open"}`
          : `${playerCount} deployed · unlimited`}
      </span>
      <Button
        type="submit"
        size="sm"
        variant="outline"
        data-testid="player-cap-save"
        disabled={!dirty || !capOk || save.isPending}
        className="ml-auto"
      >
        Save
      </Button>
    </form>
  );
}
