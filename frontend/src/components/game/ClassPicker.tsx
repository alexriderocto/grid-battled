import { Check, MapPin, Shield, Shuffle } from "lucide-react";
import { CLASS_INFO } from "@/lib/game";
import type { PlayerClass } from "@/lib/game";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const ICONS: Record<PlayerClass, typeof Shield> = { standard: Shuffle, alliance: Shield };
const ORDER: PlayerClass[] = ["standard", "alliance"];

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
  spawn: { x: number; y: number } | null;
  pending: boolean;
  onSelect: (c: PlayerClass) => void;
  onDeploy: () => void;
  onBack: () => void;
}) {
  const needsSpawn = selected === "alliance" && !spawn;

  return (
    <Card
      data-testid="class-picker"
      className="w-full max-w-4xl border-slate-800 bg-card/90 shadow-xl backdrop-blur-md"
    >
      <CardHeader>
        <CardTitle className="font-heading text-xl font-bold tracking-tight text-slate-100">
          Choose your class, {username}
        </CardTitle>
        <CardDescription className="text-sm text-slate-400">
          Your class is locked in for this profile.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 md:grid-cols-2">
          {ORDER.map((c) => {
            const info = CLASS_INFO[c];
            const Icon = ICONS[c];
            const active = selected === c;
            return (
              <button
                key={c}
                type="button"
                data-testid={`class-option-${c}`}
                onClick={() => onSelect(c)}
                className={`flex flex-col gap-2 rounded-lg border p-4 text-left transition-[border-color,background-color,box-shadow] duration-150 ${
                  active
                    ? "border-sky-400 bg-sky-500/10 shadow-[0_0_0_1px_rgb(56_189_248_/_0.5)]"
                    : "border-slate-800 bg-slate-950/50 hover:border-slate-600"
                }`}
              >
                <span className="flex items-center gap-2">
                  <Icon className={`size-4 ${active ? "text-sky-300" : "text-slate-400"}`} />
                  <span className="font-heading text-base font-bold text-slate-100">{info.label}</span>
                  {active && <Check className="ml-auto size-4 text-sky-300" />}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  {info.tagline}
                </span>
                <ul className="flex flex-col gap-1 text-sm text-slate-300">
                  {info.perks.map((perk) => (
                    <li key={perk} className="flex gap-2">
                      <span className="text-slate-600">—</span>
                      {perk}
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        {selected === "alliance" && (
          <p
            data-testid="spawn-hint"
            className={`flex items-center gap-2 rounded-md border px-3 py-2 font-mono text-[11px] uppercase tracking-wider ${
              spawn
                ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                : "border-sky-500/40 bg-sky-500/10 text-sky-200"
            }`}
          >
            <MapPin className="size-3.5" />
            {spawn
              ? `Spawn set to sector [${spawn.x + 1}, ${spawn.y + 1}] — click another free square to change`
              : "Click any free square on the map below to choose your spawn"}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            data-testid="deploy-class-button"
            disabled={!selected || needsSpawn || pending}
            onClick={onDeploy}
          >
            {pending ? "Deploying…" : selected ? `Deploy as ${CLASS_INFO[selected].label}` : "Pick a class"}
          </Button>
          <Button variant="ghost" data-testid="class-back-button" onClick={onBack} disabled={pending}>
            Back
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
