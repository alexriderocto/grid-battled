import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiPost } from "@/lib/api";
import { errorDetail } from "@/lib/errors";
import { ADMIN_USERNAME } from "@/lib/game";
import type { Credentials, NameCheckResult, Player, PlayerClass } from "@/lib/game";
import type { AdminSession } from "@/hooks/useAdminSession";
import type { CommanderSession } from "@/hooks/useCommanderSession";

type Spawn = { x: number; y: number };

function validate(name: string, password: string): string | null {
  if (!name) return "Enter a commander name.";
  if (name.length > 24) return "Commander names are 24 characters max.";
  if (!/^\d{6}$/.test(password)) return "Access code must be exactly 6 digits.";
  return null;
}

export interface JoinFlow {
  username: string;
  setUsername: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  error: string | null;
  checking: boolean;
  submit: (event: FormEvent<HTMLFormElement>) => void;
  /** Step 2 of a NEW profile: class choice (and Alliance spawn square) before deployment. */
  newProfile: Credentials | null;
  pickedClass: PlayerClass | null;
  pickClass: (c: PlayerClass) => void;
  spawn: Spawn | null;
  pickingSpawn: boolean;
  setSpawn: (s: Spawn) => void;
  deploy: () => void;
  back: () => void;
  reset: () => void;
}

/** Join form → (new callsign) name check → class picker → deploy; "Admin" opens the console. */
export function useJoinFlow(session: CommanderSession, admin: AdminSession, players: Player[]): JoinFlow {
  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [newProfile, setNewProfile] = useState<Credentials | null>(null);
  const [pickedClass, setPickedClass] = useState<PlayerClass | null>(null);
  const [spawn, setSpawnState] = useState<Spawn | null>(null);

  const back = (): void => {
    setNewProfile(null);
    setPickedClass(null);
    setSpawnState(null);
  };
  const reset = (): void => {
    back();
    setUsername("");
    setPassword("");
    setError(null);
  };

  // New callsign: screen it for swearing/slurs before showing the class picker.
  const nameCheck = useMutation<NameCheckResult, Error, Credentials>({
    mutationFn: (creds) => apiPost<NameCheckResult>("/game/name-check", { username: creds.username }),
    onSuccess: (res, creds) => {
      if (!res.allowed) {
        setError(res.detail ?? "That callsign isn't allowed — please choose another");
        return;
      }
      setError(null);
      setNewProfile(creds);
      setPickedClass(null);
      setSpawnState(null);
    },
    onError: (err) => setError(errorDetail(err, "Cannot reach command — try again shortly")),
  });

  const joinWith = (creds: Credentials, create?: { player_class: PlayerClass; spawn_x?: number; spawn_y?: number }): void => {
    session.join.mutate(
      { creds, create },
      {
        onSuccess: reset,
        onError: (err) => {
          if (create?.player_class === "alliance") setSpawnState(null); // likely taken meanwhile — re-pick
          setError(errorDetail(err, "Cannot reach command — try again shortly"));
        },
      },
    );
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const name = username.trim();
    const problem = validate(name, password);
    if (problem) {
      setError(problem);
      return;
    }
    const creds: Credentials = { username: name, password };
    if (name.toLowerCase() === ADMIN_USERNAME.toLowerCase()) {
      admin.login.mutate(password, {
        onSuccess: reset,
        onError: (err) => setError(errorDetail(err, "Cannot reach command — try again shortly")),
      });
      return;
    }
    // Existing callsign -> straight rejoin (class is already locked in). New -> pick a class first.
    if (players.some((p) => p.username.toLowerCase() === name.toLowerCase())) joinWith(creds);
    else nameCheck.mutate(creds);
  };

  const deploy = (): void => {
    if (!newProfile || !pickedClass) return;
    if (pickedClass !== "alliance") {
      joinWith(newProfile, { player_class: pickedClass });
      return;
    }
    if (spawn) joinWith(newProfile, { player_class: "alliance", spawn_x: spawn.x, spawn_y: spawn.y });
  };

  return {
    username,
    setUsername,
    password,
    setPassword,
    error,
    checking: session.join.isPending || session.resuming || nameCheck.isPending || admin.login.isPending,
    submit,
    newProfile,
    pickedClass,
    pickClass: (c) => {
      setPickedClass(c);
      if (c !== "alliance") setSpawnState(null);
    },
    spawn,
    pickingSpawn: newProfile !== null && pickedClass === "alliance",
    setSpawn: setSpawnState,
    deploy,
    back,
    reset,
  };
}
