import { useMemo, useState } from "react";
import type { ReactElement } from "react";
import { Check } from "lucide-react";
import { COUNTRIES, flagUrl } from "@/lib/countries";
import { Input } from "@/components/ui/input";

const OPTION = "flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors duration-150";

function optionTone(active: boolean): string {
  return active ? "bg-sky-500/20 text-sky-200" : "text-slate-300 hover:bg-slate-800";
}

/** Searchable country-flag list (plus "No flag" = letter token). */
export default function FlagPicker({
  value,
  initial,
  onChange,
}: {
  value: string | null;
  /** Letter shown on the "No flag" option. */
  initial: string;
  onChange: (code: string | null) => void;
}): ReactElement {
  const [search, setSearch] = useState<string>("");
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q);
  }, [search]);

  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400">Flag</p>
      <Input
        data-testid="flag-search-input"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search countries…"
        className="border-slate-700 bg-slate-950/60"
      />
      <div
        data-testid="flag-list"
        className="grid max-h-52 grid-cols-2 gap-1 overflow-y-auto rounded-md border border-slate-800 bg-slate-950/50 p-1"
      >
        <button
          type="button"
          data-testid="flag-option-none"
          onClick={() => onChange(null)}
          className={`${OPTION} ${optionTone(value === null)}`}
        >
          <span className="flex h-4 w-6 items-center justify-center rounded-sm bg-slate-700 font-mono text-[9px]">
            {initial}
          </span>
          No flag (letter)
        </button>
        {list.map((c) => (
          <button
            key={c.code}
            type="button"
            data-testid={`flag-option-${c.code}`}
            onClick={() => onChange(c.code)}
            className={`${OPTION} ${optionTone(value === c.code)}`}
          >
            <img src={flagUrl(c.code)} alt="" loading="lazy" className="h-4 w-6 rounded-sm object-cover" />
            <span className="truncate">{c.name}</span>
            {value === c.code && <Check className="ml-auto size-3.5 shrink-0" />}
          </button>
        ))}
      </div>
    </div>
  );
}
