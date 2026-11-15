import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { Lock, Send } from "lucide-react";
import { toast } from "sonner";
import { apiPost, ApiError } from "@/lib/api";
import { CLASS_INFO, MAX_HEALTH, MAX_RANGE, PALETTE } from "@/lib/game";
import type { Credentials, DirectMessage, Player } from "@/lib/game";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import AdminControls from "@/components/game/AdminControls";

function Stat({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2">
      <p className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p data-testid={testId} className="font-heading text-lg font-bold text-slate-100">
        {value}
      </p>
    </div>
  );
}

/** Click-a-commander profile: AP, range, HP, presence — plus a private message thread. */
export default function ProfileDialog({
  player,
  self,
  creds,
  adminPassword,
  onClose,
}: {
  player: Player | null;
  self: Player | null;
  creds: Credentials | null;
  adminPassword: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const canMessage = Boolean(player && self && creds && player.id !== self.id);

  const thread = useQuery({
    queryKey: ["dm-thread", self?.id, player?.id],
    queryFn: async () => {
      const msgs = await apiPost<DirectMessage[]>("/game/dm/thread", {
        ...creds,
        with_id: player?.id,
      });
      // Opening the thread marks their messages read — refresh the unread badges.
      void queryClient.invalidateQueries({ queryKey: ["dm-unread"] });
      return msgs;
    },
    enabled: canMessage,
  });
  const messages = thread.data ?? [];

  const send = useMutation({
    mutationFn: (body: string) =>
      apiPost<DirectMessage>("/game/dm/send", { ...creds, to_id: player?.id, text: body }),
    onSuccess: () => {
      setText("");
      void queryClient.invalidateQueries({ queryKey: ["dm-thread", self?.id, player?.id] });
    },
    onError: (err) => {
      const detail =
        err instanceof ApiError ? (err.body as { detail?: unknown } | null)?.detail : null;
      toast.error(typeof detail === "string" ? detail : "Message failed to send");
    },
  });

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // Fresh draft per commander.
  useEffect(() => setText(""), [player?.id]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = text.trim();
    if (body) send.mutate(body);
  };

  const tint = player ? PALETTE[player.color % PALETTE.length] : PALETTE[0];
  const moved = player ? new Date(player.last_moved) : null;

  return (
    <Dialog open={player !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        data-testid="profile-dialog"
        className="border-slate-800 bg-slate-900 sm:max-w-md"
      >
        {player && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <span
                  className="flex size-11 shrink-0 items-center justify-center rounded-full border font-mono text-base font-bold text-white"
                  style={{ backgroundColor: tint.bg, borderColor: tint.border }}
                >
                  {player.username.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <DialogTitle
                    data-testid="profile-username"
                    className="font-heading truncate text-xl font-bold tracking-tight text-slate-100"
                  >
                    {player.username}
                    {self?.id === player.id && (
                      <span className="ml-2 font-mono text-[10px] uppercase text-emerald-300">You</span>
                    )}
                  </DialogTitle>
                  <DialogDescription className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                    <span data-testid="profile-class" className="text-sky-300">
                      {CLASS_INFO[player.player_class ?? "standard"].label}
                    </span>{" "}
                    · Sector [{player.x + 1}, {player.y + 1}] ·{" "}
                    <span
                      data-testid="profile-presence"
                      className={player.online ? "text-emerald-300" : "text-slate-500"}
                    >
                      {player.online ? "Online" : "Away"}
                    </span>
                    {moved && !Number.isNaN(moved.getTime()) && (
                      <> · moved {formatDistanceToNow(moved, { addSuffix: true })}</>
                    )}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="grid grid-cols-3 gap-2">
              <Stat label="Action points" value={`${player.ap} AP`} testId="profile-ap" />
              <Stat label="Range" value={player.range > MAX_RANGE ? `${player.range} ★` : `${player.range} / ${MAX_RANGE}`} testId="profile-range" />
              <Stat label="Health" value={`${player.health} / ${MAX_HEALTH}`} testId="profile-health" />
            </div>

            {adminPassword && <AdminControls player={player} password={adminPassword} />}

            {canMessage ? (
              <div className="flex flex-col gap-2">
                <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  <Lock className="size-3" /> Private channel — only you two can read this
                </p>
                <div
                  ref={listRef}
                  data-testid="dm-thread"
                  className="flex h-52 flex-col gap-1.5 overflow-y-auto rounded-md border border-slate-800 bg-slate-950/60 p-2"
                >
                  {thread.isLoading && (
                    <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">Decrypting…</p>
                  )}
                  {!thread.isLoading && messages.length === 0 && (
                    <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">
                      No messages yet — open a private line
                    </p>
                  )}
                  {messages.map((m) => {
                    const mine = m.from_id === self?.id;
                    return (
                      <div
                        key={m.id}
                        data-testid={`dm-message-${m.id}`}
                        className={`max-w-[80%] rounded-lg px-2.5 py-1.5 text-sm ${
                          mine
                            ? "self-end bg-sky-600/80 text-white"
                            : "self-start border border-slate-700 bg-slate-800 text-slate-100"
                        }`}
                      >
                        <p className="break-words">{m.text}</p>
                        <p className="mt-0.5 text-right font-mono text-[9px] opacity-70">
                          {format(new Date(m.created_at), "HH:mm")}
                        </p>
                      </div>
                    );
                  })}
                </div>
                <form className="flex items-center gap-2" onSubmit={submit}>
                  <Input
                    data-testid="dm-input"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={`Message ${player.username} privately…`}
                    maxLength={280}
                    autoComplete="off"
                    className="border-slate-700 bg-slate-950/60"
                  />
                  <Button
                    type="submit"
                    size="icon"
                    data-testid="dm-send-button"
                    disabled={send.isPending || !text.trim()}
                  >
                    <Send className="size-4" />
                  </Button>
                </form>
              </div>
            ) : (
              <p
                data-testid="profile-dm-hint"
                className="font-mono text-[10px] uppercase tracking-wider text-slate-500"
              >
                {adminPassword
                  ? "Admin view — private messages stay between commanders"
                  : self
                    ? "This is you"
                    : "Deploy to message this commander privately"}
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
