import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Crosshair, Users } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost, ApiError } from "@/lib/api";
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

// Hand-written mirror of backend/models/game.py::Player — nothing infers across the HTTP boundary.
interface Player {
  id: string;
  username: string;
  x: number;
  y: number;
  color: number;
  created_at: string;
  last_active: string;
}

const BOARD = 15;
const STORAGE_KEY = "terra-grid-commander";

// Mirror of the backend's token palette (models/game.py TOKEN_COLORS = 8) — keep the pair in sync.
const PALETTE = [
  { bg: "#10B981", border: "#34D399" },
  { bg: "#D97706", border: "#FBBF24" },
  { bg: "#0284C7", border: "#38BDF8" },
  { bg: "#E11D48", border: "#FB7185" },
  { bg: "#7C3AED", border: "#A78BFA" },
  { bg: "#4F46E5", border: "#818CF8" },
  { bg: "#C026D3", border: "#E879F9" },
  { bg: "#0D9488", border: "#2DD4BF" },
] as const;

interface Credentials {
  username: string;
  password: string;
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
  const token = (
    <motion.span
      data-testid={`player-avatar-${player.username}`}
      title={`${player.username} [${player.x + 1}, ${player.y + 1}]`}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className={`flex size-[74%] max-h-[30px] max-w-[30px] items-center justify-center rounded-full border font-mono text-[10px] font-bold text-white shadow-md select-none md:text-xs ${
        isSelf ? "animate-radar ring-2 ring-emerald-400 ring-offset-1 ring-offset-slate-900" : ""
      }`}
      style={{ backgroundColor: tint.bg, borderColor: tint.border }}
    >
      {player.username.charAt(0).toUpperCase()}
    </motion.span>
  );
  if (!isSelf) return token;
  return (
    <span data-testid="self-avatar-highlight" className="flex items-center justify-center">
      {token}
    </span>
  );
}

export default function Home() {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [self, setSelf] = useState<Player | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoJoined = useRef(false);

  // Shared board state — polls so other commanders' drops appear on the map.
  const playersQuery = useQuery({
    queryKey: ["players"],
    queryFn: () => apiGet<Player[]>("/game/players"),
    refetchInterval: 4000,
  });
  const players = playersQuery.data ?? [];

  const joinMutation = useMutation({
    mutationFn: (v: { creds: Credentials; auto: boolean }) =>
      apiPost<Player>("/game/join", v.creds),
    onSuccess: (player, v) => {
      setSelf(player);
      setError(null);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(v.creds));
      queryClient.invalidateQueries({ queryKey: ["players"] });
      if (v.auto) {
        toast.success(`Welcome back, ${player.username}`, {
          description: `Position restored to sector [${player.x + 1}, ${player.y + 1}]`,
        });
      } else {
        toast.success(`Commander ${player.username} deployed`, {
          description: `Dropped into sector [${player.x + 1}, ${player.y + 1}]`,
        });
      }
    },
    onError: (err) => {
      const message = errorDetail(err, "Cannot reach command — try again shortly");
      setError(message);
      toast.error(message);
    },
  });

  // Returning from a refresh: silently re-validate stored credentials against the server.
  useEffect(() => {
    if (autoJoined.current) return;
    autoJoined.current = true;
    const creds = loadCredentials();
    if (creds) {
      joinMutation.mutate(
        { creds, auto: true },
        { onError: () => localStorage.removeItem(STORAGE_KEY) },
      );
    }
  }, [joinMutation.mutate]);

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
    joinMutation.mutate({ creds: { username: name, password }, auto: false });
  };

  const handleLeave = () => {
    localStorage.removeItem(STORAGE_KEY);
    setSelf(null);
    setUsername("");
    setPassword("");
    setError(null);
    toast("Session terminated", {
      description:
        "Your token holds its position on the map. Rejoin with the same callsign and access code.",
    });
  };

  const cols = Array.from({ length: BOARD }, (_, i) => i);
  const rows = Array.from({ length: BOARD }, (_, i) => i);
  const track = `repeat(${BOARD}, minmax(0, 1fr))`;
  const occupied = new Map<string, Player>();
  for (const p of players) occupied.set(`${p.y}:${p.x}`, p);

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
            TERRA GRID <span className="text-sky-400">15×15</span>
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
            {playersQuery.isError ? "MAP OFFLINE" : `${players.length} ONLINE`}
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
              <Button type="submit" data-testid="join-button" disabled={joinMutation.isPending}>
                {joinMutation.isPending ? "Deploying…" : "Join map"}
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
                      className={`relative flex aspect-square items-center justify-center rounded-[3px] border transition-colors duration-150 ${
                        p
                          ? isSelf
                            ? "border-emerald-500/70 bg-emerald-950/60"
                            : "border-blue-700/40 bg-[#172554]/70"
                          : "border-slate-800/80 bg-[#0F172A] hover:border-sky-500/60 hover:bg-slate-800/90"
                      }`}
                    >
                      {p && <AvatarToken player={p} isSelf={isSelf} />}
                    </div>
                  );
                }),
              )}
            </div>
          </div>
        </div>
      </section>

      <p className="pb-2 text-center font-mono text-[11px] uppercase tracking-[0.25em] text-slate-600">
        Milestone 1 — the map is live. Orders will follow.
      </p>
    </div>
  );
}
