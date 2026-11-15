import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiPost } from "@/lib/api";
import { errorDetail, isAuthError } from "@/lib/errors";
import { MAX_HEALTH } from "@/lib/game";
import type { AttackResult, Player, TransferResult } from "@/lib/game";

export type ActionMode = "attack" | "move" | "transfer" | "heal";

export type ActionCall =
  | { kind: "attack"; x: number; y: number }
  | { kind: "move"; x: number; y: number }
  | { kind: "transfer"; x: number; y: number }
  | { kind: "heal"; x: number; y: number }
  | { kind: "expand" };

type ActionResult = AttackResult | Player | TransferResult;

function callAction(call: ActionCall): Promise<ActionResult> {
  switch (call.kind) {
    case "move":
      return apiPost<Player>("/game/move", { x: call.x, y: call.y });
    case "attack":
      return apiPost<AttackResult>("/game/attack", { target_x: call.x, target_y: call.y });
    case "transfer":
      return apiPost<TransferResult>("/game/transfer", { target_x: call.x, target_y: call.y });
    case "heal":
      return apiPost<TransferResult>("/game/heal", { target_x: call.x, target_y: call.y });
    case "expand":
      return apiPost<Player>("/game/expand");
  }
}

/** Applies an action's result to my session copy and announces it; returns my updated self. */
function announce(result: ActionResult, call: ActionCall): Player {
  switch (call.kind) {
    case "move": {
      const p = result as Player;
      toast.success(`Relocated to [${p.x + 1}, ${p.y + 1}]`);
      return p;
    }
    case "attack": {
      const r = result as AttackResult;
      if (r.eliminated) {
        toast.success(`Commander ${r.target_username} eliminated!`, {
          description: "Their callsign is free — they can redeploy with the same code.",
        });
      } else if (r.target) {
        toast.success(`Direct hit on ${r.target.username} — ${r.target.health}/${MAX_HEALTH} HP`);
      }
      return r.attacker;
    }
    case "transfer": {
      const r = result as TransferResult;
      toast.success(`Transferred 1 AP to ${r.target.username}`, {
        description: `${r.target.username} now holds ${r.target.ap} AP.`,
      });
      return r.source;
    }
    case "heal": {
      const r = result as TransferResult;
      toast.success(`Healed ${r.target.username} — ${r.target.health}/${MAX_HEALTH} HP`);
      return r.source;
    }
    case "expand": {
      const p = result as Player;
      toast.success(`Range expanded to ${p.range}`);
      return p;
    }
  }
}

export interface Actions {
  /** The armed targeting mode (cleared automatically once the AP for it is gone). */
  mode: ActionMode | null;
  setMode: (m: ActionMode | null) => void;
  toggleMode: (m: ActionMode) => void;
  act: UseMutationResult<ActionResult, Error, ActionCall>;
}

export function useActions(
  self: Player | null,
  setSelf: (p: Player) => void,
  onAuthLost: () => void,
): Actions {
  const queryClient = useQueryClient();
  const [armed, setArmed] = useState<ActionMode | null>(null);

  const act = useMutation<ActionResult, Error, ActionCall>({
    mutationFn: callAction,
    onSuccess: (result, call) => {
      void queryClient.invalidateQueries({ queryKey: ["board"] });
      setSelf(announce(result, call));
      setArmed(null);
    },
    onError: (err) => {
      if (isAuthError(err)) {
        setArmed(null);
        onAuthLost();
        return;
      }
      toast.error(errorDetail(err, "Action failed — try again shortly"));
    },
  });

  // An armed mode is pointless once the AP for it is gone (Heal is free).
  const outOfAp = armed !== null && armed !== "heal" && (self?.ap ?? 0) < 1;
  const mode = self && !outOfAp ? armed : null;

  return {
    mode,
    setMode: setArmed,
    toggleMode: (m) => setArmed((cur) => (cur === m ? null : m)),
    act,
  };
}
