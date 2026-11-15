import type { ReactElement } from "react";
import { formatDistanceToNow } from "date-fns";
import { CLASS_INFO, MAX_HEALTH, MAX_RANGE, PALETTE } from "@/lib/game";
import type { Player } from "@/lib/game";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import AdminControls from "@/components/game/AdminControls";
import AvatarFace from "@/components/game/AvatarFace";
import DMThread from "@/components/game/DMThread";

function Stat({ label, value, testId }: { label: string; value: string; testId: string }): ReactElement {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2">
      <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p data-testid={testId} className="font-heading text-lg font-bold text-slate-100">
        {value}
      </p>
    </div>
  );
}

/** Why there's no private channel on this profile. */
function dmHint(isAdmin: boolean, signedIn: boolean): string {
  if (isAdmin) return "Admin view — private messages stay between commanders";
  if (signedIn) return "This is you";
  return "Deploy to message this commander privately";
}

function ProfileHeader({ player, isSelf }: { player: Player; isSelf: boolean }): ReactElement {
  const tint = PALETTE[player.color % PALETTE.length];
  const moved = new Date(player.last_moved);
  return (
    <DialogHeader>
      <div className="flex items-center gap-3">
        <span
          className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border font-mono text-base font-bold text-white"
          style={{ backgroundColor: tint.bg, borderColor: tint.border }}
        >
          <AvatarFace player={player} />
        </span>
        <div className="min-w-0">
          <DialogTitle
            data-testid="profile-username"
            className="font-heading truncate text-xl font-bold tracking-tight text-slate-100"
          >
            {player.username}
            {isSelf && <span className="ml-2 font-mono text-[10px] uppercase text-emerald-300">You</span>}
          </DialogTitle>
          <DialogDescription className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
            <span data-testid="profile-class" className="text-sky-300">
              {CLASS_INFO[player.player_class ?? "standard"].label}
            </span>{" "}
            · Sector [{player.x + 1}, {player.y + 1}] ·{" "}
            <span data-testid="profile-presence" className={player.online ? "text-emerald-300" : "text-slate-500"}>
              {player.online ? "Online" : "Away"}
            </span>
            {!Number.isNaN(moved.getTime()) && <> · moved {formatDistanceToNow(moved, { addSuffix: true })}</>}
          </DialogDescription>
        </div>
      </div>
    </DialogHeader>
  );
}

/** Click-a-commander profile: AP, range, HP, presence — plus a private message thread. */
export default function ProfileDialog({
  player,
  self,
  adminPassword,
  onTeleport,
  onClose,
}: {
  player: Player | null;
  self: Player | null;
  adminPassword: string | null;
  onTeleport: (playerId: string) => void;
  onClose: () => void;
}): ReactElement {
  const canMessage = Boolean(player && self && player.id !== self.id);
  const rangeLabel = (p: Player): string => (p.range > MAX_RANGE ? `${p.range} ★` : `${p.range} / ${MAX_RANGE}`);

  return (
    <Dialog open={player !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid="profile-dialog" className="border-slate-800 bg-slate-900 sm:max-w-md">
        {player && (
          <>
            <ProfileHeader player={player} isSelf={self?.id === player.id} />
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Action points" value={`${player.ap} AP`} testId="profile-ap" />
              <Stat label="Range" value={rangeLabel(player)} testId="profile-range" />
              <Stat label="Health" value={`${player.health} / ${MAX_HEALTH}`} testId="profile-health" />
            </div>
            {adminPassword && (
              // keyed so the inputs reset whenever another commander (or a new range) is shown
              <AdminControls
                key={`${player.id}:${player.range}`}
                player={player}
                password={adminPassword}
                onTeleport={() => onTeleport(player.id)}
              />
            )}
            {canMessage && self ? (
              <DMThread key={player.id} self={self} player={player} />
            ) : (
              <p data-testid="profile-dm-hint" className="font-mono text-[10px] uppercase tracking-wider text-slate-500">
                {dmHint(Boolean(adminPassword), Boolean(self))}
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
