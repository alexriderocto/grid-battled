import { useState } from "react";
import type { ReactElement } from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** One labelled number field + submit button (admin Range / Give AP rows). */
export default function AdminNumberForm({
  icon: Icon,
  label,
  testId,
  initial,
  min,
  max,
  isValid,
  submitLabel,
  disabled,
  onSubmit,
}: {
  icon: LucideIcon;
  label: string;
  /** Prefix for `${testId}-input` / `${testId}-button`. */
  testId: string;
  initial: string;
  min: number;
  max: number;
  isValid: (n: number) => boolean;
  submitLabel: string;
  disabled: boolean;
  onSubmit: (n: number) => void;
}): ReactElement {
  const [raw, setRaw] = useState<string>(initial);
  const value = Number(raw);
  const ok = raw !== "" && Number.isInteger(value) && isValid(value);
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) onSubmit(value);
      }}
    >
      <Icon className="size-4 shrink-0 text-amber-300" />
      <span className="w-16 shrink-0 font-mono text-[10px] uppercase tracking-wider text-slate-400">{label}</span>
      <Input
        data-testid={`${testId}-input`}
        type="number"
        min={min}
        max={max}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        className="h-8 border-slate-700 bg-slate-950/60 font-mono"
      />
      <Button type="submit" size="sm" variant="outline" data-testid={`${testId}-button`} disabled={!ok || disabled}>
        {submitLabel}
      </Button>
    </form>
  );
}
