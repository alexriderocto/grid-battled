import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { BoardState, ChatMessage, GameSettings, Player } from "@/lib/game";

const NO_PLAYERS: Player[] = [];
const NO_CHAT: ChatMessage[] = [];

export interface Board {
  query: UseQueryResult<BoardState>;
  players: Player[];
  chat: ChatMessage[];
  settings: GameSettings | undefined;
}

function useTabVisible(): boolean {
  const [visible, setVisible] = useState<boolean>(
    () => typeof document === "undefined" || document.visibilityState !== "hidden",
  );
  useEffect(() => {
    const onVisibility = (): void => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  return visible;
}

/** Shared board state (players + chat + settings). useBoardStream pushes every change instantly;
 * the slow poll is only a safety net if the stream drops behind a proxy. */
export function useBoard(): Board {
  const query = useQuery({
    queryKey: ["board"],
    queryFn: () => apiGet<BoardState>("/game/state"),
    refetchInterval: 15000,
  });
  return {
    query,
    players: query.data?.players ?? NO_PLAYERS,
    chat: query.data?.chat ?? NO_CHAT,
    settings: query.data?.settings,
  };
}

/**
 * Live sync over SSE; returns whether the stream is connected.
 * Presence: the stream carries your player id, so an open, visible tab = Online. Hiding the
 * tab closes it (= Away); returning reopens it and the first frame is a fresh full snapshot.
 */
export function useBoardStream(selfId: string | null): boolean {
  const queryClient = useQueryClient();
  const [live, setLive] = useState<boolean>(false);
  const tabVisible = useTabVisible();

  useEffect(() => {
    if (!tabVisible) {
      setLive(false);
      return;
    }
    const url = selfId ? `/api/game/stream?player_id=${encodeURIComponent(selfId)}` : "/api/game/stream";
    const source = new EventSource(url);
    source.addEventListener("board", (event: MessageEvent<string>) => {
      try {
        queryClient.setQueryData<BoardState>(["board"], JSON.parse(event.data) as BoardState);
        setLive(true);
      } catch (err) {
        // A malformed frame is harmless — the next snapshot replaces it — but leave a trace.
        console.warn("Grid Battle: skipped a malformed board frame", err);
      }
    });
    // Private-message activity ping (content-free): refetch my unread counts + any open thread.
    source.addEventListener("dm", () => {
      void queryClient.invalidateQueries({ queryKey: ["dm-unread"] });
      void queryClient.invalidateQueries({ queryKey: ["dm-thread"] });
    });
    source.onerror = () => setLive(false);
    return () => source.close();
  }, [queryClient, selfId, tabVisible]);

  return live;
}
