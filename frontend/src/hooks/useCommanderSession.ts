import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/lib/api";
import { errorDetail } from "@/lib/errors";
import { CLASS_INFO } from "@/lib/game";
import type { Credentials, LogoutResult, Player, PlayerClass } from "@/lib/game";

// Older builds kept the callsign + raw access code here. Wipe it on sight — the login pass
// is now an httpOnly cookie the browser's scripts can't read.
const LEGACY_STORAGE_KEY = "terra-grid-commander";

export interface JoinVars {
  creds: Credentials;
  create?: { player_class: PlayerClass; spawn_x?: number; spawn_y?: number };
}

export interface CommanderSession {
  /** Live board copy of me (falls back to my last server response until the board catches up). */
  self: Player | null;
  setSelf: (p: Player) => void;
  join: UseMutationResult<Player, Error, JoinVars>;
  resuming: boolean;
  leave: () => void;
  /** Forget me locally after the server rejected my login pass. */
  expire: () => void;
}

function deployToast(player: Player, v: JoinVars): void {
  const sector = `[${player.x + 1}, ${player.y + 1}]`;
  if (!v.create) {
    toast.success(`Welcome back, ${player.username}`, { description: `Position restored to sector ${sector}` });
    return;
  }
  if (v.create.player_class === "alliance") {
    toast.success(`Alliance commander ${player.username} deployed`, {
      description: `Holding your chosen sector ${sector} · AP starts from your second 6pm top-up`,
    });
    return;
  }
  toast.success(`Commander ${player.username} deployed`, {
    description: `Dropped into sector ${sector} · ${CLASS_INFO[player.player_class].label} · ${player.ap} AP`,
  });
}

/** Who I am: join (code checked once → login-pass cookie), silent resume after refresh, leave, elimination. */
export function useCommanderSession(board: {
  players: Player[];
  ready: boolean;
  updatedAt: number;
}): CommanderSession {
  const queryClient = useQueryClient();
  const [sessionSelf, setSessionSelf] = useState<Player | null>(null);
  const joinedAtRef = useRef<number>(0);
  const resumedRef = useRef<boolean>(false);

  const signedIn = (player: Player): void => {
    setSessionSelf(player);
    joinedAtRef.current = Date.now();
    void queryClient.invalidateQueries({ queryKey: ["board"] });
  };

  const forget = (): void => {
    setSessionSelf(null);
    queryClient.removeQueries({ queryKey: ["dm-unread"] });
    queryClient.removeQueries({ queryKey: ["dm-thread"] });
  };

  const join = useMutation<Player, Error, JoinVars>({
    mutationFn: (v) => apiPost<Player>("/game/join", { ...v.creds, ...v.create }),
    onSuccess: (player, v) => {
      signedIn(player);
      deployToast(player, v);
    },
    onError: (err) => toast.error(errorDetail(err, "Cannot reach command — try again shortly")),
  });

  // Returning from a refresh: the httpOnly cookie restores the commander (no code stored anywhere).
  // No pass / an expired pass comes back as null and simply leaves the join form showing.
  const resume = useQuery({
    queryKey: ["session"],
    queryFn: () => apiGet<Player | null>("/game/session"),
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const resumed = resume.data;
  useEffect(() => {
    if (!resumed || resumedRef.current) return;
    resumedRef.current = true;
    setSessionSelf(resumed);
    joinedAtRef.current = Date.now();
    void queryClient.invalidateQueries({ queryKey: ["board"] });
    toast.success(`Welcome back, ${resumed.username}`, {
      description: `Position restored to sector [${resumed.x + 1}, ${resumed.y + 1}]`,
    });
  }, [resumed, queryClient]);
  useEffect(() => localStorage.removeItem(LEGACY_STORAGE_KEY), []);

  const logout = useMutation<LogoutResult, Error, void>({
    mutationFn: () => apiPost<LogoutResult>("/game/logout"),
    onError: (err) => console.warn("Grid Battle: logout request failed", err),
  });

  const self = sessionSelf ? (board.players.find((p) => p.id === sessionSelf.id) ?? sessionSelf) : null;

  // If this commander vanishes from the shared board, they were eliminated mid-session.
  const busy = join.isPending || resume.isLoading;
  useEffect(() => {
    if (!self || busy || !board.ready) return;
    // Only judge from a board snapshot taken AFTER this session's join completed —
    // the first invalidation refetch lags the join response by a beat.
    if (board.updatedAt <= joinedAtRef.current) return;
    if (board.players.length > 0 && !board.players.some((p) => p.id === self.id)) {
      setSessionSelf(null);
      toast.error("You were eliminated", {
        description: "Rejoin with the same callsign and access code to redeploy fresh.",
      });
    }
  }, [self, busy, board.ready, board.updatedAt, board.players]);

  return {
    self,
    setSelf: setSessionSelf,
    join,
    resuming: resume.isLoading,
    leave: () => {
      logout.mutate();
      forget();
      toast("Session terminated", {
        description: "Your token holds its position on the map. Rejoin with the same callsign and access code.",
      });
    },
    expire: () => {
      forget();
      toast.error("Signed out", { description: "Your login pass expired — sign in again with your access code." });
    },
  };
}
