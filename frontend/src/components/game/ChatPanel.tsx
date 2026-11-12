import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { format } from "date-fns";
import { Send } from "lucide-react";
import { PALETTE } from "@/lib/game";
import type { ChatMessage } from "@/lib/game";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

/** In-map comms — every commander chats over the same SSE-fed channel. */
export default function ChatPanel({
  messages,
  disabled,
  onSend,
}: {
  messages: ChatMessage[];
  disabled: boolean;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the latest message in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <Card
      data-testid="chat-panel"
      className="flex-1 border-slate-800 bg-card/90 shadow-xl backdrop-blur-md"
    >
      <CardHeader>
        <CardTitle className="font-heading text-base font-bold tracking-tight text-slate-100">
          Comms channel
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div
          ref={listRef}
          data-testid="chat-messages"
          className="flex h-56 flex-col gap-2 overflow-y-auto pr-1"
        >
          {messages.length === 0 && (
            <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">
              Channel clear — say something, commander
            </p>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              data-testid={`chat-message-${m.id}`}
              className="flex items-start gap-2 rounded-md border border-slate-800/70 bg-slate-950/50 px-2.5 py-1.5"
            >
              <span
                className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] font-bold text-white"
                style={{
                  backgroundColor: PALETTE[m.color % PALETTE.length].bg,
                  borderColor: PALETTE[m.color % PALETTE.length].border,
                }}
              >
                {m.username.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  {m.username} · {format(new Date(m.created_at), "HH:mm")}
                </p>
                <p className="text-sm leading-snug break-words text-slate-200">{m.text}</p>
              </div>
            </div>
          ))}
        </div>
        <form className="flex items-center gap-2" onSubmit={submit}>
          <Input
            data-testid="chat-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={disabled ? "Deploy to transmit…" : "Message the grid…"}
            maxLength={140}
            autoComplete="off"
            disabled={disabled}
            className="border-slate-700 bg-slate-950/60"
          />
          <Button
            type="submit"
            data-testid="chat-send-button"
            size="icon"
            disabled={disabled || !text.trim()}
          >
            <Send className="size-4" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
