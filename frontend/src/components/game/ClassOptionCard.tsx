import type { ReactElement } from "react";
import { Check } from "lucide-react";
import { CLASS_INFO } from "@/lib/game";
import type { PlayerClass } from "@/lib/game";

/** One selectable class card in the class picker. */
export default function ClassOptionCard({
  cls,
  icon: Icon,
  active,
  onSelect,
}: {
  cls: PlayerClass;
  icon: typeof Check;
  active: boolean;
  onSelect: () => void;
}): ReactElement {
  const info = CLASS_INFO[cls];
  return (
    <button
      type="button"
      data-testid={`class-option-${cls}`}
      onClick={onSelect}
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
      <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">{info.tagline}</span>
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
}
