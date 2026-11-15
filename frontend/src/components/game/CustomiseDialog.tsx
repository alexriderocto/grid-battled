import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { apiPost, ApiError } from "@/lib/api";
import { COUNTRIES, flagUrl } from "@/lib/countries";
import { OWN_RANGE_DEFAULT, PALETTE, RANGE_SWATCHES } from "@/lib/game";
import type { Credentials, Player } from "@/lib/game";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import AvatarFace from "@/components/game/AvatarFace";

/** Commander cosmetics: country-flag token + range diamond colour. */
export default function CustomiseDialog({
  open,
  self,
  creds,
  onClose,
}: {
  open: boolean;
  self: Player | null;
  creds: Credentials | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [flag, setFlag] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open && self) {
      setFlag(self.flag);
      setColor(self.range_color);
      setSearch("");
    }
  }, [open, self?.id]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q) : COUNTRIES;
  }, [search]);

  const save = useMutation({
    mutationFn: () => apiPost<Player>("/game/profile", { ...creds, flag, range_color: color }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["board"] });
      toast.success("Profile updated");
      onClose();
    },
    onError: (err) => {
      const d = err instanceof ApiError ? (err.body as { detail?: unknown } | null)?.detail : null;
      toast.error(typeof d === "string" ? d : "Could not save your profile");
    },
  });

  if (!self) return null;
  const tint = PALETTE[self.color % PALETTE.length];
  const shown = color ?? OWN_RANGE_DEFAULT;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="customise-dialog" className="border-slate-800 bg-slate-900 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl font-bold text-slate-100">Customise your commander</DialogTitle>
          <DialogDescription className="text-sm text-slate-400">
            Your flag replaces your letter token everywhere; everyone sees your range colour.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3">
          <span
            data-testid="customise-preview"
            className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 font-mono text-base font-bold text-white"
            style={{ backgroundColor: tint.bg, borderColor: tint.border }}
          >
            <AvatarFace player={{ username: self.username, flag }} />
          </span>
          <div
            className="h-12 flex-1 rounded-md border"
            style={{ backgroundColor: `${shown}26`, borderColor: `${shown}80` }}
          >
            <p className="px-3 pt-3.5 font-mono text-[10px] uppercase tracking-wider text-slate-300">
              Range preview
            </p>
          </div>
        </div>

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
              onClick={() => setFlag(null)}
              className={`flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors duration-150 ${
                flag === null ? "bg-sky-500/20 text-sky-200" : "text-slate-300 hover:bg-slate-800"
              }`}
            >
              <span className="flex h-4 w-6 items-center justify-center rounded-sm bg-slate-700 font-mono text-[9px]">
                {self.username.charAt(0).toUpperCase()}
              </span>
              No flag (letter)
            </button>
            {list.map((c) => (
              <button
                key={c.code}
                type="button"
                data-testid={`flag-option-${c.code}`}
                onClick={() => setFlag(c.code)}
                className={`flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors duration-150 ${
                  flag === c.code ? "bg-sky-500/20 text-sky-200" : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                <img src={flagUrl(c.code)} alt="" loading="lazy" className="h-4 w-6 rounded-sm object-cover" />
                <span className="truncate">{c.name}</span>
                {flag === c.code && <Check className="ml-auto size-3.5 shrink-0" />}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400">Range colour</p>
          <div className="flex flex-wrap items-center gap-2">
            {RANGE_SWATCHES.map((hex) => (
              <button
                key={hex}
                type="button"
                data-testid={`range-color-${hex.slice(1)}`}
                aria-label={`Range colour ${hex}`}
                onClick={() => setColor(hex)}
                className={`size-7 rounded-full border-2 transition-transform duration-150 hover:scale-110 ${
                  color === hex ? "border-white" : "border-transparent"
                }`}
                style={{ backgroundColor: hex }}
              />
            ))}
            <input
              type="color"
              data-testid="range-color-custom"
              aria-label="Custom range colour"
              value={shown}
              onChange={(e) => setColor(e.target.value.toUpperCase())}
              className="size-7 cursor-pointer rounded-full border-0 bg-transparent p-0"
            />
            <Button
              variant="ghost"
              size="sm"
              data-testid="range-color-reset"
              onClick={() => setColor(null)}
            >
              Default
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button data-testid="customise-save-button" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
