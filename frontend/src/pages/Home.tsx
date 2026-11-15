import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import {
  ArrowLeftRight,
  Crosshair,
  Footprints,
  Maximize2,
  Swords,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import {
  CLASS_INFO,
  MAX_HEALTH,
  MAX_RANGE,
  PALETTE,
  manhattan,
} from "@/lib/game";
import type {
  AttackResult,
  Credentials,
  Player,
  TransferResult,
  BoardState,
  ChatMessage,
  UnreadCounts,
  PlayerClass,
  NameCheckResult,
} from "@/lib/game";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toaster } from "@/components/ui/sonner";
import CellIntelCard from "@/components/game/CellIntelCard";
import Roster from "@/components/game/Roster";
import ChatPanel from "@/components/game/ChatPanel";
import ProfileDialog from "@/components/game/ProfileDialog";
import ClassPicker from "@/components/game/ClassPicker";

const BOARD = 15;
const STORAGE_KEY = "terra-grid-commander";

type ActionMode = "attack" | "move" | "transfer";

type ActionCall =
  | { kind: "attack"; x: number; y: number }
  | { kind: "move"; x: number; y: number }
  | { kind: "transfer"; x: number; y: number }
  | { kind: "expand" };

const ACTION_HINTS: Record<ActionMode, string> = {
  attack: "Select a commander in range to strike — deals 1 damage · 1 AP",
  move: "Select an empty square in range to relocate · 1 AP",
  transfer: "Select a commander in range to gift 1 of your AP",
};

interface HoverState {
  player: Player;
  cx: number;
  cy: number;
}

function loadCredentials(): Credentials | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as Credentials).username === "string" &&
      typeof (parsed as Credentials).password === "string"
    ) {
      return parsed as Credentials;
    }
  } catch {
    return null;
  }
  return null;
}

function errorDetail(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const detail = (err.body as { detail?: unknown } | null)?.detail;
    if (typeof detail === "string") return detail;
  }
  return fallback;
}

function AvatarToken({ player, isSelf }: { player: Player; isSelf: boolean }) {
  const tint = PALETTE[player.color % PALETTE.length];
  const damaged = player.health < MAX_HEALTH;
  return (
    <span
      data-testid={isSelf ? "self-avatar-highlight" : undefined}
      className="relative flex size-full items-center justify-center"
    >
      <motion.span
        data-testid={`player-avatar-${player.username}`}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className={`flex size-[74%] max-h-[30px] max-w-[30px] items-center justify-center rounded-full border font-mono text-[10px] font-bold text-white shadow-md select-none md:text-xs ${
          isSelf ? "animate-radar ring-2 ring-emerald-400 ring-offset-1 ring-offset-slate-900" : ""
        } ${player.online || isSelf ? "" : "opacity-50 grayscale-[40%]"}`}
        style={{ backgroundColor: tint.bg, borderColor: tint.border }}
      >
        {player.username.charAt(0).toUpperCase()}
      </motion.span>
      {damaged && (
        <span
          data-testid={`health-badge-${player.username}`}
          className="absolute -right-1 -bottom-1 flex size-3.5 items-center justify-center rounded-full border border-red-300 bg-red-600 font-mono text-[8px] font-bold text-white"
        >
          {player.health}
        </span>
      )}
    </span>
  );
}

function ActionButton({
  kind,
  active,
  icon: Icon,
  label,
  disabled,
  onToggle,
}: {
  kind: ActionMode;
  active: boolean;
  icon: typeof Swords;
  label: string;
  disabled: boolean;
  onToggle: (kind: ActionMode) => void;
}) {
  return (
    <Button
      variant={active ? "default" : "outline"}
      data-testid={`${kind}-button`}
      disabled={disabled}
      onClick={() => onToggle(kind)}
      className={active ? "ring-2 ring-sky-400/60 ring-offset-2 ring-offset-slate-950" : ""}
    >
      <Icon className="mr-2 size-4" />
      {label}
      <span className="ml-2 font-mono text-[10px] opacity-70">1 AP</span>
    </Button>
  );
}

export default function Home() {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [self, setSelf] = useState<Player | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ActionMode | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  // New-profile step 2: class choice (and Alliance spawn square) before the commander is created.
  const [newProfile, setNewProfile] = useState<Credentials | null>(null);
  const [pickedClass, setPickedClass] = useState<PlayerClass | null>(null);
  const [spawn, setSpawn] = useState<{ x: number; y: number } | null>(null);
  const pickingSpawn = newProfile !== null && pickedClass === "alliance";
  const credsRef = useRef<Credentials | null>(null);
  const autoJoined = useRef(false);
  const joinedAtRef = useRef(0);

  // Shared board state (players + chat). The SSE stream below pushes every change instantly;
  // the slow poll is only a safety net if the stream drops behind a proxy.
  const playersQuery = useQuery({
    queryKey: ["board"],
    queryFn: () => apiGet<BoardState>("/game/state"),
    refetchInterval: 15000,
  });
  const players = playersQuery.data?.players ?? [];
  const chat = playersQuery.data?.chat ?? [];
  const [live, setLive] = useState(false);

  // Real-time sync: every join/move/attack/transfer/expand/chat is broadcast to all commanders.
  // Presence: the stream carries your player id, so an open, visible tab = Online. Hiding the
  // tab closes it (= Away); returning reopens it and the first frame is a fresh full snapshot.
  const selfId = self?.id ?? null;
  const [tabVisible, setTabVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState !== "hidden",
  );
  useEffect(() => {
    const onVisibility = () => setTabVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (!tabVisible) {
      setLive(false);
      return;
    }
    const url = selfId
      ? `/api/game/stream?player_id=${encodeURIComponent(selfId)}`
      : "/api/game/stream";
    const source = new EventSource(url);
    source.addEventListener("board", (event) => {
      try {
        const snapshot = JSON.parse((event as MessageEvent<string>).data) as BoardState;
        queryClient.setQueryData<BoardState>(["board"], snapshot);
        setLive(true);
      } catch {
        // ignore a malformed frame; the next one replaces it
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

  // Unread private messages, per sender — refreshed by the SSE "dm" ping.
  const unreadQuery = useQuery({
    queryKey: ["dm-unread", self?.id],
    queryFn: () => apiPost<UnreadCounts>("/game/dm/unread", credsRef.current),
    enabled: Boolean(self),
  });
  const unread = self ? (unreadQuery.data?.counts ?? {}) : {};
  const prevUnread = useRef<Record<string, number>>({});
  const unreadKey = JSON.stringify(unread);
  useEffect(() => {
    const counts = JSON.parse(unreadKey) as Record<string, number>;
    for (const [fromId, n] of Object.entries(counts)) {
      if (n > (prevUnread.current[fromId] ?? 0) && fromId !== profileId) {
        const sender = players.find((p) => p.id === fromId);
        toast(`Private message from ${sender?.username ?? "a commander"}`, {
          action: { label: "Open", onClick: () => setProfileId(fromId) },
        });
      }
    }
    prevUnread.current = counts;
    // players intentionally omitted: a board refresh must not re-toast old messages
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadKey, profileId]);

  const chatMutation = useMutation({
    mutationFn: (text: string) => {
      const creds = credsRef.current;
      if (!creds) return Promise.reject(new Error("Not deployed"));
      return apiPost<ChatMessage>("/game/chat", { ...creds, text });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["board"] }),
    onError: (err) => toast.error(errorDetail(err, "Message failed to send")),
  });

  const joinMutation = useMutation({
    mutationFn: (v: {
      creds: Credentials;
      auto: boolean;
      create?: { player_class: PlayerClass; spawn_x?: number; spawn_y?: number };
    }) => apiPost<Player>("/game/join", { ...v.creds, ...v.create }),
    onSuccess: (player, v) => {
      setSelf(player);
      setNewProfile(null);
      setPickedClass(null);
      setSpawn(null);
      setError(null);
      setMode(null);
      credsRef.current = v.creds;
      joinedAtRef.current = Date.now();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(v.creds));
      queryClient.invalidateQueries({ queryKey: ["board"] });
      if (v.auto) {
        toast.success(`Welcome back, ${player.username}`, {
          description: `Position restored to sector [${player.x + 1}, ${player.y + 1}]`,
        });
      } else if (v.create?.player_class === "alliance") {
        toast.success(`Alliance commander ${player.username} deployed`, {
          description: `Holding your chosen sector [${player.x + 1}, ${player.y + 1}] · AP starts from your second 6pm top-up`,
        });
      } else if (v.create) {
        toast.success(`Commander ${player.username} deployed`, {
          description: `Dropped into sector [${player.x + 1}, ${player.y + 1}] · 1 AP granted`,
        });
      } else {
        toast.success(`Welcome back, ${player.username}`, {
          description: `Position restored to sector [${player.x + 1}, ${player.y + 1}]`,
        });
      }
    },
    onError: (err, v) => {
      const message = errorDetail(err, "Cannot reach command — try again shortly");
      if (v.create?.player_class === "alliance") setSpawn(null); // likely taken meanwhile — re-pick
      setError(message);
      toast.error(message);
    },
  });

  const act = useMutation<AttackResult | Player | TransferResult, Error, ActionCall>({
    mutationFn: (call: ActionCall) => {
      const creds = credsRef.current;
      if (!creds) return Promise.reject(new Error("Not deployed"));
      switch (call.kind) {
        case "move":
          return apiPost<Player>("/game/move", { ...creds, x: call.x, y: call.y });
        case "attack":
          return apiPost<AttackResult>("/game/attack", {
            ...creds,
            target_x: call.x,
            target_y: call.y,
          });
        case "transfer":
          return apiPost<TransferResult>("/game/transfer", {
            ...creds,
            target_x: call.x,
            target_y: call.y,
          });
        case "expand":
          return apiPost<Player>("/game/expand", creds);
      }
    },
    onSuccess: (result, call) => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["board"] });
      switch (call.kind) {
        case "move": {
          const p = result as Player;
          setSelf(p);
          toast.success(`Relocated to [${p.x + 1}, ${p.y + 1}]`);
          break;
        }
        case "attack": {
          const r = result as AttackResult;
          setSelf(r.attacker);
          if (r.eliminated) {
            toast.success(`Commander ${r.target_username} eliminated!`, {
              description: "Their callsign is free — they can redeploy with the same code.",
            });
          } else if (r.target) {
            toast.success(`Direct hit on ${r.target.username} — ${r.target.health}/${MAX_HEALTH} HP`);
          }
          break;
        }
        case "transfer": {
          const r = result as TransferResult;
          setSelf(r.source);
          toast.success(`Transferred 1 AP to ${r.target.username}`, {
            description: `${r.target.username} now holds ${r.target.ap} AP.`,
          });
          break;
        }
        case "expand": {
          const p = result as Player;
          setSelf(p);
          toast.success(`Range expanded to ${p.range}`);
          break;
        }
      }
      setMode(null);
    },
    onError: (err) => {
      toast.error(errorDetail(err, "Action failed — try again shortly"));
    },
  });

  // Returning from a refresh: silently re-validate stored credentials against the server.
  useEffect(() => {
    if (autoJoined.current) return;
    autoJoined.current = true;
    const creds = loadCredentials();
    if (creds) {
      credsRef.current = creds;
      joinMutation.mutate(
        { creds, auto: true },
        { onError: () => {
            credsRef.current = null;
            localStorage.removeItem(STORAGE_KEY);
          } },
      );
    }
  }, [joinMutation.mutate]);

  // If this commander vanishes from the shared board, they were eliminated mid-session.
  useEffect(() => {
    if (!self || joinMutation.isPending || !playersQuery.isSuccess) return;
    // Only judge from a board snapshot taken AFTER this session's join completed —
    // the first invalidation refetch lags the join response by a beat.
    if (playersQuery.dataUpdatedAt <= joinedAtRef.current) return;
    if (players.length > 0 && !players.some((p) => p.id === self.id)) {
      credsRef.current = null;
      localStorage.removeItem(STORAGE_KEY);
      setSelf(null);
      setMode(null);
      toast.error("You were eliminated", {
        description: "Rejoin with the same callsign and access code to redeploy fresh.",
      });
    }
  }, [players, self, playersQuery.isSuccess, joinMutation.isPending, playersQuery.dataUpdatedAt]);

  // An armed mode is pointless once the AP for it is gone.
  useEffect(() => {
    if (mode && self && self.ap < 1) setMode(null);
  }, [mode, self]);

  const handleJoin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = username.trim();
    if (!name) {
      setError("Enter a commander name.");
      return;
    }
    if (name.length > 24) {
      setError("Commander names are 24 characters max.");
      return;
    }
    if (!/^\d{6}$/.test(password)) {
      setError("Access code must be exactly 6 digits.");
      return;
    }
    const creds = { username: name, password };
    // Existing callsign -> straight rejoin (class is already locked in). New -> pick a class first.
    if (players.some((p) => p.username.toLowerCase() === name.toLowerCase())) {
      joinMutation.mutate({ creds, auto: false });
    } else {
      nameCheck.mutate(creds);
    }
  };

  // New callsign: screen it for swearing/slurs before showing the class picker.
  const nameCheck = useMutation({
    mutationFn: (creds: Credentials) =>
      apiPost<NameCheckResult>("/game/name-check", { username: creds.username }),
    onSuccess: (res, creds) => {
      if (!res.allowed) {
        setError(res.detail ?? "That callsign isn't allowed — please choose another");
        return;
      }
      setError(null);
      setNewProfile(creds);
      setPickedClass(null);
      setSpawn(null);
    },
    onError: (err) => setError(errorDetail(err, "Cannot reach command — try again shortly")),
  });

  const deployNewProfile = () => {
    if (!newProfile || !pickedClass) return;
    if (pickedClass === "alliance") {
      if (!spawn) return;
      joinMutation.mutate({
        creds: newProfile,
        auto: false,
        create: { player_class: "alliance", spawn_x: spawn.x, spawn_y: spawn.y },
      });
    } else {
      joinMutation.mutate({ creds: newProfile, auto: false, create: { player_class: "standard" } });
    }
  };

  const handleLeave = () => {
    localStorage.removeItem(STORAGE_KEY);
    credsRef.current = null;
    setSelf(null);
    setMode(null);
    setUsername("");
    setPassword("");
    setError(null);
    toast("Session terminated", {
      description:
        "Your token holds its position on the map. Rejoin with the same callsign and access code.",
    });
  };

  const toggleMode = (kind: ActionMode) => setMode((m) => (m === kind ? null : kind));

  const onCellClick = (x: number, y: number) => {
    if (pickingSpawn) {
      if (occupied.has(`${y}:${x}`)) {
        toast.error("That square is occupied — pick a free one");
      } else {
        setSpawn({ x, y });
      }
      return;
    }
    if (mode) {
      act.mutate({ kind: mode, x, y });
      return;
    }
    // No action armed: clicking a commander opens their profile + private channel.
    const p = occupied.get(`${y}:${x}`);
    if (p) {
      setHover(null);
      setProfileId(p.id);
    }
  };

  const cols = Array.from({ length: BOARD }, (_, i) => i);
  const rows = Array.from({ length: BOARD }, (_, i) => i);
  const track = `repeat(${BOARD}, minmax(0, 1fr))`;
  const occupied = new Map<string, Player>();
  for (const p of players) occupied.set(`${p.y}:${p.x}`, p);

  // Shaded range diamonds: sky for your own, faint rose for rival reach. Occupied cells keep their own look.
  const rangeShadeFor = (x: number, y: number, p: Player | undefined): string => {
    if (p) return "";
    if (self) {
      const d = manhattan(x, y, self.x, self.y);
      if (d >= 1 && d <= self.range) return "border-sky-500/25 bg-sky-500/10 hover:border-sky-500/60";
    }
    for (const q of players) {
      if (self && q.id === self.id) continue;
      if (manhattan(x, y, q.x, q.y) <= q.range) return "border-rose-500/20 bg-rose-500/[0.07] hover:border-rose-500/40";
    }
    return "";
  };

  // While a mode is armed, valid targets get a crosshair ring.
  const targetRingFor = (x: number, y: number, p: Player | undefined): string => {
    if (!mode || !self || act.isPending) return "";
    const d = manhattan(x, y, self.x, self.y);
    if (d < 1 || d > self.range) return "";
    if (mode === "move") return p ? "" : "ring-1 ring-emerald-400/70 cursor-crosshair";
    return p && p.id !== self.id ? "ring-1 ring-rose-400/80 cursor-crosshair" : "";
  };

  const needsSelf = !self || act.isPending;

  return (
    <div className="relative flex min-h-svh flex-col items-center gap-6 bg-background px-4 py-8 text-foreground">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgb(2_132_199_/_0.14),transparent_55%)]"
      />
      <Toaster />

      {/* Command header */}
      <header className="flex w-full max-w-4xl items-end justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-sky-400">
            Tactical operations
          </p>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-slate-100 md:text-4xl">
            GRID <span className="text-sky-400">BATTLE</span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Badge
            variant="outline"
            className="border-slate-700 font-mono text-[10px] uppercase tracking-wider text-slate-300"
          >
            Sector {BOARD}×{BOARD}
          </Badge>
          <Badge
            data-testid="player-count-badge"
            className="border border-sky-500/40 bg-sky-500/15 font-mono text-[10px] uppercase tracking-wider text-sky-300"
          >
            <Users className="mr-1 size-3" />
            {playersQuery.isError
              ? "MAP OFFLINE"
              : `${players.filter((p) => p.online).length} ONLINE · ${players.length} DEPLOYED`}
          </Badge>
          <Badge
            data-testid="live-sync-badge"
            className={`border font-mono text-[10px] uppercase tracking-wider ${
              live
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
                : "border-slate-700 bg-slate-800/60 text-slate-400"
            }`}
          >
            <span
              className={`mr-1.5 size-1.5 rounded-full ${live ? "animate-pulse bg-emerald-400" : "bg-slate-500"}`}
            />
            {live ? "Live" : "Syncing"}
          </Badge>
        </div>
      </header>

      {/* Join / session panel — directly above the map */}
      {self ? (
        <Card
          data-testid="active-commander-banner"
          className="w-full max-w-4xl border-slate-800 bg-card/90 shadow-xl backdrop-blur-md"
        >
          <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-3 py-5">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-full border font-mono text-sm font-bold text-white"
              style={{
                backgroundColor: PALETTE[self.color % PALETTE.length].bg,
                borderColor: PALETTE[self.color % PALETTE.length].border,
              }}
            >
              {self.username.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-emerald-400">
                Commander in the field
              </p>
              <p
                data-testid="active-username-display"
                className="font-heading truncate text-xl font-bold tracking-tight text-slate-100"
              >
                {self.username}
              </p>
            </div>
            <Badge
              variant="secondary"
              data-testid="active-coords-display"
              className="font-mono text-[10px] uppercase tracking-wider"
            >
              <Crosshair className="mr-1 size-3" />
              Position [X: {self.x + 1}, Y: {self.y + 1}]
            </Badge>
            <Badge
              variant="secondary"
              data-testid="ap-display"
              className="font-mono text-[10px] uppercase tracking-wider"
            >
              AP: {self.ap}
            </Badge>
            <Badge
              variant="secondary"
              data-testid="health-display"
              className="font-mono text-[10px] uppercase tracking-wider"
            >
              HP: {self.health}/{MAX_HEALTH}
            </Badge>
            <Badge
              variant="secondary"
              data-testid="range-display"
              className="font-mono text-[10px] uppercase tracking-wider"
            >
              Range: {self.range}
            </Badge>
            <Badge
              variant="secondary"
              data-testid="class-display"
              className="font-mono text-[10px] uppercase tracking-wider"
            >
              Class: {CLASS_INFO[self.player_class ?? "standard"].label}
            </Badge>
            <Badge className="border border-emerald-500/40 bg-emerald-500/15 font-mono text-[10px] uppercase tracking-wider text-emerald-300">
              Active online
            </Badge>
            <div className="ml-auto">
              <Button variant="destructive" data-testid="leave-button" onClick={handleLeave}>
                Leave game
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : newProfile ? (
        <ClassPicker
          username={newProfile.username}
          selected={pickedClass}
          spawn={spawn}
          pending={joinMutation.isPending}
          onSelect={(c) => {
            setPickedClass(c);
            if (c !== "alliance") setSpawn(null);
          }}
          onDeploy={deployNewProfile}
          onBack={() => {
            setNewProfile(null);
            setPickedClass(null);
            setSpawn(null);
          }}
        />
      ) : (
        <Card
          data-testid="join-panel"
          className="w-full max-w-4xl border-slate-800 bg-card/90 shadow-xl backdrop-blur-md"
        >
          <CardHeader>
            <CardTitle className="font-heading text-xl font-bold tracking-tight text-slate-100">
              Deploy to the grid
            </CardTitle>
            <CardDescription className="text-sm text-slate-400">
              New commander? Pick a callsign and a 6-digit access code. Returning? Enter the same
              pair to reclaim your position.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4 md:flex-row md:items-end" onSubmit={handleJoin}>
              <div className="flex flex-1 flex-col gap-2">
                <Label
                  htmlFor="username"
                  className="font-mono text-[11px] uppercase tracking-wider text-slate-400"
                >
                  Callsign
                </Label>
                <Input
                  id="username"
                  data-testid="username-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. NightOwl"
                  maxLength={24}
                  autoComplete="off"
                  className="border-slate-700 bg-slate-950/60"
                />
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <Label
                  htmlFor="password"
                  className="font-mono text-[11px] uppercase tracking-wider text-slate-400"
                >
                  Access code (6 digits)
                </Label>
                <Input
                  id="password"
                  data-testid="password-input"
                  type="password"
                  inputMode="numeric"
                  value={password}
                  onChange={(e) => setPassword(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="••••••"
                  maxLength={6}
                  autoComplete="off"
                  className="border-slate-700 bg-slate-950/60 font-mono tracking-[0.4em]"
                />
              </div>
              <Button type="submit" data-testid="join-button" disabled={joinMutation.isPending || nameCheck.isPending}>
                {joinMutation.isPending || nameCheck.isPending ? "Checking…" : "Join map"}
              </Button>
            </form>
            {error && (
              <p
                data-testid="error-message"
                className="animate-error-shake mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 font-mono text-xs tracking-wide text-red-300"
              >
                {error}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* The map */}
      <section className="w-full max-w-4xl rounded-xl border-2 border-slate-800 bg-slate-950/80 p-3 shadow-2xl md:p-6">
        {playersQuery.isError && (
          <p
            data-testid="map-offline-notice"
            className="mb-3 text-center font-mono text-[11px] uppercase tracking-[0.25em] text-slate-500"
          >
            Map link offline — retrying…
          </p>
        )}
        <div className="mx-auto w-full max-w-[620px]">
          {/* X axis */}
          <div className="flex">
            <div className="w-6 shrink-0" />
            <div
              className="grid flex-1 gap-[2px] px-1 pb-1 md:gap-1"
              style={{ gridTemplateColumns: track }}
            >
              {cols.map((c) => (
                <span key={`col-${c}`} className="text-center font-mono text-[10px] text-slate-500">
                  {c + 1}
                </span>
              ))}
            </div>
          </div>
          <div className="flex">
            {/* Y axis */}
            <div className="grid w-6 shrink-0 py-1 pr-1" style={{ gridTemplateRows: track }}>
              {rows.map((r) => (
                <span
                  key={`row-${r}`}
                  className="flex items-center justify-center font-mono text-[10px] text-slate-500"
                >
                  {r + 1}
                </span>
              ))}
            </div>
            <div
              data-testid="game-grid-15x15"
              role="grid"
              aria-label={`${BOARD} by ${BOARD} game map`}
              className="grid flex-1 gap-[2px] rounded-lg bg-slate-800/60 p-1 md:gap-1"
              style={{ gridTemplateColumns: track }}
            >
              {rows.flatMap((r) =>
                cols.map((c) => {
                  const key = `${r}:${c}`;
                  const p = occupied.get(key);
                  const isSelf = p !== undefined && p.id === self?.id;
                  return (
                    <div
                      key={key}
                      data-testid={`grid-cell-${r}-${c}`}
                      role="gridcell"
                      aria-label={
                        p
                          ? `Grid cell row ${r + 1} col ${c + 1}, occupied by ${p.username}`
                          : `Grid cell row ${r + 1} col ${c + 1}`
                      }
                      onClick={() => onCellClick(c, r)}
                      onMouseEnter={(e) => {
                        if (p) setHover({ player: p, cx: e.clientX, cy: e.clientY });
                      }}
                      onMouseMove={(e) => {
                        if (p)
                          setHover((h) =>
                            h && h.player.id === p.id
                              ? { ...h, cx: e.clientX, cy: e.clientY }
                              : { player: p, cx: e.clientX, cy: e.clientY },
                          );
                      }}
                      onMouseLeave={() => {
                        if (p) setHover((h) => (h && h.player.id === p.id ? null : h));
                      }}
                      className={`relative flex aspect-square items-center justify-center rounded-[3px] border transition-colors duration-150 ${
                        p
                          ? isSelf
                            ? "border-emerald-500/70 bg-emerald-950/60"
                            : "border-blue-700/40 bg-[#172554]/70"
                          : rangeShadeFor(c, r, p) ||
                            "border-slate-800/80 bg-[#0F172A] hover:border-sky-500/60 hover:bg-slate-800/90"
                      } ${targetRingFor(c, r, p)} ${p && !mode ? "cursor-pointer" : ""} ${
                        pickingSpawn && !p ? "cursor-crosshair hover:ring-1 hover:ring-amber-400/70" : ""
                      } ${spawn && spawn.x === c && spawn.y === r ? "!border-amber-400 !bg-amber-500/25 ring-2 ring-amber-400" : ""}`}
                    >
                      {p && <AvatarToken player={p} isSelf={isSelf} />}
                      {!p && spawn && spawn.x === c && spawn.y === r && (
                        <span
                          data-testid="spawn-marker"
                          className="size-2.5 animate-pulse rounded-full bg-amber-300"
                        />
                      )}
                    </div>
                  );
                }),
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Action bar — below the grid */}
      <div className="flex w-full max-w-4xl flex-col items-center gap-2">
        <div className="flex flex-wrap items-center justify-center gap-2" data-testid="action-bar">
          <ActionButton
            kind="attack"
            active={mode === "attack"}
            icon={Swords}
            label="Attack"
            disabled={needsSelf || self.ap < 1}
            onToggle={toggleMode}
          />
          <ActionButton
            kind="move"
            active={mode === "move"}
            icon={Footprints}
            label="Move"
            disabled={needsSelf || self.ap < 1}
            onToggle={toggleMode}
          />
          <ActionButton
            kind="transfer"
            active={mode === "transfer"}
            icon={ArrowLeftRight}
            label="Transfer"
            disabled={needsSelf || self.ap < 1}
            onToggle={toggleMode}
          />
          <Button
            variant="outline"
            data-testid="expand-button"
            disabled={needsSelf || self.ap < 1 || self.range >= MAX_RANGE}
            onClick={() => act.mutate({ kind: "expand" })}
          >
            <Maximize2 className="mr-2 size-4" />
            Expand
            <span className="ml-2 font-mono text-[10px] opacity-70">1 AP</span>
          </Button>
        </div>
        {mode ? (
          <p
            data-testid="action-hint"
            className="text-center font-mono text-[11px] uppercase tracking-[0.25em] text-sky-300"
          >
            {ACTION_HINTS[mode]} — click the button again to cancel
          </p>
        ) : (
          <p
            data-testid="ap-rule-hint"
            className="text-center font-mono text-[10px] uppercase tracking-[0.25em] text-slate-500"
          >
            Standard deploys with 1 AP · Alliance skips the first two · +1 AP daily at 6pm UK time
          </p>
        )}
      </div>

      {/* Multiplayer: live roster + comms channel */}
      <div className="flex w-full max-w-4xl flex-col gap-4 md:flex-row">
        <Roster
          players={players}
          selfId={self?.id ?? null}
          unread={unread}
          onSelect={(p) => setProfileId(p.id)}
        />
        <ChatPanel
          messages={chat}
          disabled={!self || chatMutation.isPending}
          onSend={(text) => chatMutation.mutate(text)}
        />
      </div>

      <ProfileDialog
        player={players.find((p) => p.id === profileId) ?? null}
        self={self}
        creds={self ? credsRef.current : null}
        onClose={() => setProfileId(null)}
      />

      {hover && <CellIntelCard player={hover.player} cx={hover.cx} cy={hover.cy} />}
    </div>
  );
}
