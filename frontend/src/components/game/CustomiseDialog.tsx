import { useState } from "react";
import type { ReactElement } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiPost } from "@/lib/api";
import { errorDetail } from "@/lib/errors";
import { OWN_RANGE_DEFAULT, PALETTE } from "@/lib/game";
import type { Player } from "@/lib/game";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import AvatarFace from "@/components/game/AvatarFace";
import FlagPicker from "@/components/game/FlagPicker";
import RangeColorPicker from "@/components/game/RangeColorPicker";

/** Dialog body — mounted fresh on every open so the draft starts from my saved choices. */
function CustomiseForm({ self, onClose }: { self: Player; onClose: () => void }): ReactElement {
  const queryClient = useQueryClient();
  const [flag, setFlag] = useState<string | null>(self.flag);
  const [color, setColor] = useState<string | null>(self.range_color);
  const tint = PALETTE[self.color % PALETTE.length];
  const shown = color ?? OWN_RANGE_DEFAULT;

  const save = useMutation<Player, Error, void>({
    mutationFn: () => apiPost<Player>("/game/profile", { flag, range_color: color }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["board"] });
      toast.success("Profile updated");
      onClose();
    },
    onError: (err) => toast.error(errorDetail(err, "Could not save your profile")),
  });

  return (
    <>
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
        <div className="h-12 flex-1 rounded-md border" style={{ backgroundColor: `${shown}26`, borderColor: `${shown}80` }}>
          <p className="px-3 pt-3.5 font-mono text-[10px] uppercase tracking-wider text-slate-300">Range preview</p>
        </div>
      </div>

      <FlagPicker value={flag} initial={self.username.charAt(0).toUpperCase()} onChange={setFlag} />
      <RangeColorPicker value={color} onChange={setColor} />

      <DialogFooter>
        <Button data-testid="customise-save-button" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </>
  );
}

/** Commander cosmetics: country-flag token + range diamond colour. */
export default function CustomiseDialog({
  open,
  self,
  onClose,
}: {
  open: boolean;
  self: Player | null;
  onClose: () => void;
}): ReactElement | null {
  if (!self) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent data-testid="customise-dialog" className="border-slate-800 bg-slate-900 sm:max-w-lg">
        {open && <CustomiseForm key={self.id} self={self} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}
