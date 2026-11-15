import type { ReactElement } from "react";
import { OWN_RANGE_DEFAULT, RANGE_SWATCHES } from "@/lib/game";
import { Button } from "@/components/ui/button";

/** Preset swatches + custom picker + reset for the range-diamond colour. */
export default function RangeColorPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (hex: string | null) => void;
}): ReactElement {
  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400">Range colour</p>
      <div className="flex flex-wrap items-center gap-2">
        {RANGE_SWATCHES.map((hex) => (
          <button
            key={hex}
            type="button"
            data-testid={`range-color-${hex.slice(1)}`}
            aria-label={`Range colour ${hex}`}
            onClick={() => onChange(hex)}
            className={`size-7 rounded-full border-2 transition-transform duration-150 hover:scale-110 ${
              value === hex ? "border-white" : "border-transparent"
            }`}
            style={{ backgroundColor: hex }}
          />
        ))}
        <input
          type="color"
          data-testid="range-color-custom"
          aria-label="Custom range colour"
          value={value ?? OWN_RANGE_DEFAULT}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="size-7 cursor-pointer rounded-full border-0 bg-transparent p-0"
        />
        <Button variant="ghost" size="sm" data-testid="range-color-reset" onClick={() => onChange(null)}>
          Default
        </Button>
      </div>
    </div>
  );
}
