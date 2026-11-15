import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiPost } from "@/lib/api";
import type { Player, UnreadCounts } from "@/lib/game";

const NONE: Record<string, number> = {};

/** Unread private messages per sender (refreshed by the SSE "dm" ping) + a toast for each new one. */
export function useUnreadMessages(
  self: Player | null,
  players: Player[],
  openProfileId: string | null,
  openProfile: (id: string) => void,
): Record<string, number> {
  const query = useQuery({
    queryKey: ["dm-unread", self?.id],
    queryFn: () => apiPost<UnreadCounts>("/game/dm/unread"),
    enabled: Boolean(self),
  });
  const unread = self ? (query.data?.counts ?? NONE) : NONE;
  const unreadKey = JSON.stringify(unread);
  const seen = useRef<Record<string, number>>({});

  useEffect(() => {
    const counts = JSON.parse(unreadKey) as Record<string, number>;
    // Only counts that GREW since the last run toast — re-runs for a board refresh stay silent.
    for (const [fromId, n] of Object.entries(counts)) {
      if (n > (seen.current[fromId] ?? 0) && fromId !== openProfileId) {
        const sender = players.find((p) => p.id === fromId);
        toast(`Private message from ${sender?.username ?? "a commander"}`, {
          action: { label: "Open", onClick: () => openProfile(fromId) },
        });
      }
    }
    seen.current = counts;
  }, [unreadKey, openProfileId, players, openProfile]);

  return unread;
}
