import type { ReactElement } from "react";
import type { JoinFlow } from "@/hooks/useJoinFlow";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const LABEL = "font-mono text-[11px] uppercase tracking-wider text-slate-400";

/** Callsign + 6-digit access code form, directly above the map. */
export default function JoinPanel({ flow }: { flow: JoinFlow }): ReactElement {
  return (
    <Card data-testid="join-panel" className="w-full max-w-4xl border-slate-800 bg-card/90 shadow-xl backdrop-blur-md">
      <CardHeader>
        <CardTitle className="font-heading text-xl font-bold tracking-tight text-slate-100">Deploy to the grid</CardTitle>
        <CardDescription className="text-sm text-slate-400">
          New commander? Pick a callsign and a 6-digit access code. Returning? Enter the same pair to reclaim your
          position.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4 md:flex-row md:items-end" onSubmit={flow.submit}>
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="username" className={LABEL}>
              Callsign
            </Label>
            <Input
              id="username"
              data-testid="username-input"
              value={flow.username}
              onChange={(e) => flow.setUsername(e.target.value)}
              placeholder="e.g. NightOwl"
              maxLength={24}
              autoComplete="off"
              className="border-slate-700 bg-slate-950/60"
            />
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="password" className={LABEL}>
              Access code (6 digits)
            </Label>
            <Input
              id="password"
              data-testid="password-input"
              type="password"
              inputMode="numeric"
              value={flow.password}
              onChange={(e) => flow.setPassword(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="••••••"
              maxLength={6}
              autoComplete="off"
              className="border-slate-700 bg-slate-950/60 font-mono tracking-[0.4em]"
            />
          </div>
          <Button type="submit" data-testid="join-button" disabled={flow.checking}>
            {flow.checking ? "Checking…" : "Join map"}
          </Button>
        </form>
        {flow.error && (
          <p
            data-testid="error-message"
            className="animate-error-shake mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 font-mono text-xs tracking-wide text-red-300"
          >
            {flow.error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
