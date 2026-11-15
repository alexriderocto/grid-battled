import type { ReactElement } from "react";
import { ArrowLeftRight, Footprints, HeartPulse, Maximize2, Swords } from "lucide-react";
import { MAX_RANGE } from "@/lib/game";
import type { Player } from "@/lib/game";
import type { ActionMode } from "@/hooks/useActions";
import { Button } from "@/components/ui/button";

const ACTION_HINTS: Record<ActionMode, string> = {
  attack: "Select a commander in range to strike — deals 1 damage · 1 AP",
  move: "Select an empty square in range to relocate · 1 AP",
  transfer: "Select a commander in range to gift 1 of your AP",
  heal: "Select another commander in range to restore 1 HP · free, once per 2-day period",
};

function hintFor(mode: ActionMode, self: Player | null): string {
  if (mode === "attack" && self?.player_class === "murderer")
    return "Select a commander in range to strike — Murderer: deals 2 damage · 1 AP";
  if (mode === "move" && self?.player_class === "sprinter")
    return `Select an empty square within ${self.range * 2} (Sprinter double range) · 1 AP`;
  return ACTION_HINTS[mode];
}

function ActionButton({
  kind,
  active,
  icon: Icon,
  label,
  disabled,
  onToggle,
  cost = "1 AP",
}: {
  kind: ActionMode;
  active: boolean;
  icon: typeof Swords;
  label: string;
  disabled: boolean;
  onToggle: (kind: ActionMode) => void;
  cost?: string;
}): ReactElement {
  return (
    <Button
      variant={active ? "default" : "outline"}
      data-testid={`${kind}-button`}
      disabled={disabled}
      onClick={() => onToggle(kind)}
      className={active ? "ring-2 ring-sky-400/60 ring-offset-2 ring-offset-slate-950" : ""}
    >
      <Icon className="mr-2 size-4" />
      {label}
      <span className="ml-2 font-mono text-[10px] opacity-70">{cost}</span>
    </Button>
  );
}

/** The line under the buttons: teleport prompt (admin), armed-mode hint, or the AP rule. */
function ActionHint({
  self,
  mode,
  teleportName,
  onCancelTeleport,
}: {
  self: Player | null;
  mode: ActionMode | null;
  teleportName: string | null;
  onCancelTeleport: () => void;
}): ReactElement {
  if (teleportName !== null) {
    return (
      <p
        data-testid="teleport-hint"
        className="flex items-center gap-3 text-center font-mono text-[11px] uppercase tracking-[0.25em] text-amber-300"
      >
        Teleporting {teleportName} — click a free square
        <button
          type="button"
          data-testid="teleport-cancel-button"
          onClick={onCancelTeleport}
          className="rounded border border-amber-400/50 px-2 py-0.5 text-[10px] text-amber-200 transition-colors duration-150 hover:bg-amber-500/20"
        >
          Cancel
        </button>
      </p>
    );
  }
  if (mode) {
    return (
      <p data-testid="action-hint" className="text-center font-mono text-[11px] uppercase tracking-[0.25em] text-sky-300">
        {hintFor(mode, self)} — click the button again to cancel
      </p>
    );
  }
  return (
    <p data-testid="ap-rule-hint" className="text-center font-mono text-[10px] uppercase tracking-[0.25em] text-slate-500">
      AP top-up daily at 6pm UK time · AP Mine +2 · Murderer none · Alliance skips the first two
    </p>
  );
}

/** Attack / Move / Transfer / (Heal) / Expand — below the grid. */
export default function ActionBar({
  self,
  mode,
  pending,
  teleportName,
  onToggle,
  onExpand,
  onCancelTeleport,
}: {
  self: Player | null;
  mode: ActionMode | null;
  pending: boolean;
  /** Set while the admin is placing a teleported commander. */
  teleportName: string | null;
  onToggle: (kind: ActionMode) => void;
  onExpand: () => void;
  onCancelTeleport: () => void;
}): ReactElement {
  const noAp = !self || pending || self.ap < 1;
  const apMine = self?.player_class === "ap_mine";
  return (
    <div className="flex w-full max-w-4xl flex-col items-center gap-2">
      <div className="flex flex-wrap items-center justify-center gap-2" data-testid="action-bar">
        <ActionButton kind="attack" active={mode === "attack"} icon={Swords} label="Attack" disabled={noAp || apMine} onToggle={onToggle} />
        <ActionButton
          kind="move"
          active={mode === "move"}
          icon={Footprints}
          label="Move"
          disabled={noAp || Boolean(self?.immovable)}
          onToggle={onToggle}
        />
        <ActionButton kind="transfer" active={mode === "transfer"} icon={ArrowLeftRight} label="Transfer" disabled={noAp} onToggle={onToggle} />
        {self?.player_class === "healer" && (
          <ActionButton
            kind="heal"
            active={mode === "heal"}
            icon={HeartPulse}
            label="Heal"
            cost="free"
            disabled={pending || !self.heal_available}
            onToggle={onToggle}
          />
        )}
        <Button
          variant="outline"
          data-testid="expand-button"
          disabled={noAp || apMine || (self?.range ?? 0) >= MAX_RANGE}
          onClick={onExpand}
        >
          <Maximize2 className="mr-2 size-4" />
          Expand
          <span className="ml-2 font-mono text-[10px] opacity-70">1 AP</span>
        </Button>
      </div>
      <ActionHint self={self} mode={mode} teleportName={teleportName} onCancelTeleport={onCancelTeleport} />
    </div>
  );
}
