import type { ReactElement, ReactNode } from "react";
import { formatDistanceToNow } from "date-fns";
import { Crosshair, Palette } from "lucide-react";
import { CLASS_INFO, MAX_HEALTH, PALETTE } from "@/lib/game";
import type { Player } from "@/lib/game";
import AvatarFace from "@/components/game/AvatarFace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const STAT_CLASS = "font-mono text-[10px] uppercase tracking-wider";
const GOOD = "border-emerald-500/40 bg-emerald-500/15 text-emerald-300";

function Stat({ testId, children }: { testId: string; children: ReactNode }): ReactElement {
  return (
    <Badge variant="secondary" data-testid={testId} className={STAT_CLASS}>
      {children}
    </Badge>
  );
}

/** Sprinter rest-day / Healer duty status, or nothing for other classes. */
function ClassStatus({ self }: { self: Player }): ReactElement | null {
  if (self.player_class === "sprinter") {
    const tone = self.immovable ? "border-red-500/40 bg-red-500/15 text-red-300" : GOOD;
    return (
      <Badge data-testid="sprinter-status" className={`border ${STAT_CLASS} ${tone}`}>
        {self.immovable ? "Rest day — immovable" : `Move reach ${self.range * 2}`}
      </Badge>
    );
  }
  if (self.player_class === "healer" && self.heal_deadline) {
    const when = formatDistanceToNow(new Date(self.heal_deadline), { addSuffix: true });
    const tone = self.heal_available ? "border-pink-500/40 bg-pink-500/15 text-pink-300" : GOOD;
    return (
      <Badge data-testid="healer-status" className={`border ${STAT_CLASS} ${tone}`}>
        {self.heal_available ? `Heal due ${when}` : `Healed ✓ · next ${when}`}
      </Badge>
    );
  }
  return null;
}

/** "Commander in the field" banner: my stats plus Customise / Leave. */
export default function CommanderBanner({
  self,
  onCustomise,
  onLeave,
}: {
  self: Player;
  onCustomise: () => void;
  onLeave: () => void;
}): ReactElement {
  const tint = PALETTE[self.color % PALETTE.length];
  return (
    <Card
      data-testid="active-commander-banner"
      className="w-full max-w-4xl border-slate-800 bg-card/90 shadow-xl backdrop-blur-md"
    >
      <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-3 py-5">
        <span
          className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border font-mono text-sm font-bold text-white"
          style={{ backgroundColor: tint.bg, borderColor: tint.border }}
        >
          <AvatarFace player={self} />
        </span>
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-emerald-400">Commander in the field</p>
          <p
            data-testid="active-username-display"
            className="font-heading truncate text-xl font-bold tracking-tight text-slate-100"
          >
            {self.username}
          </p>
        </div>
        <Stat testId="active-coords-display">
          <Crosshair className="mr-1 size-3" />
          Position [X: {self.x + 1}, Y: {self.y + 1}]
        </Stat>
        <Stat testId="ap-display">AP: {self.ap}</Stat>
        <Stat testId="health-display">
          HP: {self.health}/{MAX_HEALTH}
        </Stat>
        <Stat testId="range-display">Range: {self.range}</Stat>
        <Stat testId="class-display">Class: {CLASS_INFO[self.player_class ?? "standard"].label}</Stat>
        <ClassStatus self={self} />
        <Badge className={`border ${STAT_CLASS} ${GOOD}`}>Active online</Badge>
        <div className="ml-auto">
          <Button variant="outline" data-testid="customise-button" className="mr-2" onClick={onCustomise}>
            <Palette className="mr-2 size-4" />
            Customise
          </Button>
          <Button variant="destructive" data-testid="leave-button" onClick={onLeave}>
            Leave game
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
