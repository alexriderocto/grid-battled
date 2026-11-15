import type { ReactElement } from "react";
import { HeartPulse, MapPin, Pickaxe, Shield, Shuffle, Skull, Wind } from "lucide-react";
import { CLASS_INFO } from "@/lib/game";
import type { PlayerClass } from "@/lib/game";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import ClassOptionCard from "@/components/game/ClassOptionCard";

type Spawn = { x: number; y: number };

const ICONS: Record<PlayerClass, typeof Shield> = {
  standard: Shuffle,
  alliance: Shield,
  ap_mine: Pickaxe,
  sprinter: Wind,
  murderer: Skull,
  healer: HeartPulse,
};
const ORDER: PlayerClass[] = ["standard", "alliance", "ap_mine", "sprinter", "murderer", "healer"];

function deployLabel(pending: boolean, selected: PlayerClass | null): string {
  if (pending) return "Deploying…";
  if (selected) return `Deploy as ${CLASS_INFO[selected].label}`;
  return "Pick a class";
}

function SpawnHint({ spawn }: { spawn: Spawn | null }): ReactElement {
  return (
    <p
      data-testid="spawn-hint"
      className={`flex items-center gap-2 rounded-md border px-3 py-2 font-mono text-[11px] uppercase tracking-wider ${
        spawn ? "border-amber-500/40 bg-amber-500/10 text-amber-200" : "border-sky-500/40 bg-sky-500/10 text-sky-200"
      }`}
    >
      <MapPin className="size-3.5" />
      {spawn
        ? `Spawn set to sector [${spawn.x + 1}, ${spawn.y + 1}] — click another free square to change`
        : "Click any free square on the map below to choose your spawn"}
    </p>
  );
}

/** Second step of creating a profile: pick a class (and, for Alliance, a spawn square on the map). */
export default function ClassPicker({
  username,
  selected,
  spawn,
  pending,
  onSelect,
  onDeploy,
  onBack,
}: {
  username: string;
  selected: PlayerClass | null;
  spawn: Spawn | null;
  pending: boolean;
  onSelect: (c: PlayerClass) => void;
  onDeploy: () => void;
  onBack: () => void;
}): ReactElement {
  const needsSpawn = selected === "alliance" && !spawn;
  return (
    <Card data-testid="class-picker" className="w-full max-w-4xl border-slate-800 bg-card/90 shadow-xl backdrop-blur-md">
      <CardHeader>
        <CardTitle className="font-heading text-xl font-bold tracking-tight text-slate-100">
          Choose your class, {username}
        </CardTitle>
        <CardDescription className="text-sm text-slate-400">Your class is locked in for this profile.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ORDER.map((c) => (
            <ClassOptionCard key={c} cls={c} icon={ICONS[c]} active={selected === c} onSelect={() => onSelect(c)} />
          ))}
        </div>
        {selected === "alliance" && <SpawnHint spawn={spawn} />}
        <div className="flex flex-wrap items-center gap-2">
          <Button data-testid="deploy-class-button" disabled={!selected || needsSpawn || pending} onClick={onDeploy}>
            {deployLabel(pending, selected)}
          </Button>
          <Button variant="ghost" data-testid="class-back-button" onClick={onBack} disabled={pending}>
            Back
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
