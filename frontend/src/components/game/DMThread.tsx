import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactElement } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Lock, Send } from "lucide-react";
import { toast } from "sonner";
import { apiPost } from "@/lib/api";
import { errorDetail } from "@/lib/errors";
import type { DirectMessage, Player } from "@/lib/game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function Bubble({ message, mine }: { message: DirectMessage; mine: boolean }): ReactElement {
  return (
    <div
      data-testid={`dm-message-${message.id}`}
      className={`max-w-[80%] rounded-lg px-2.5 py-1.5 text-sm ${
        mine ? "self-end bg-sky-600/80 text-white" : "self-start border border-slate-700 bg-slate-800 text-slate-100"
      }`}
    >
      <p className="break-words">{message.text}</p>
      <p className="mt-0.5 text-right font-mono text-[9px] opacity-70">{format(new Date(message.created_at), "HH:mm")}</p>
    </div>
  );
}

/** Private channel between me and `player` — mount with key={player.id} for a fresh draft per commander. */
export default function DMThread({ self, player }: { self: Player; player: Player }): ReactElement {
  const queryClient = useQueryClient();
  const [text, setText] = useState<string>("");
  const listRef = useRef<HTMLDivElement>(null);
  const threadKey = ["dm-thread", self.id, player.id];

  const thread = useQuery({
    queryKey: threadKey,
    queryFn: async () => {
      const msgs = await apiPost<DirectMessage[]>("/game/dm/thread", { with_id: player.id });
      // Opening the thread marks their messages read — refresh the unread badges.
      void queryClient.invalidateQueries({ queryKey: ["dm-unread"] });
      return msgs;
    },
  });
  const messages = thread.data ?? [];

  const send = useMutation<DirectMessage, Error, string>({
    mutationFn: (body) => apiPost<DirectMessage>("/game/dm/send", { to_id: player.id, text: body }),
    onSuccess: () => {
      setText("");
      void queryClient.invalidateQueries({ queryKey: threadKey });
    },
    onError: (err) => toast.error(errorDetail(err, "Message failed to send")),
  });

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const body = text.trim();
    if (body) send.mutate(body);
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-400">
        <Lock className="size-3" /> Private channel — only you two can read this
      </p>
      <div
        ref={listRef}
        data-testid="dm-thread"
        className="flex h-52 flex-col gap-1.5 overflow-y-auto rounded-md border border-slate-800 bg-slate-950/60 p-2"
      >
        {thread.isLoading && <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">Decrypting…</p>}
        {!thread.isLoading && messages.length === 0 && (
          <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">No messages yet — open a private line</p>
        )}
        {messages.map((m) => (
          <Bubble key={m.id} message={m} mine={m.from_id === self.id} />
        ))}
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
        <Button type="submit" size="icon" data-testid="dm-send-button" disabled={send.isPending || !text.trim()}>
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}
