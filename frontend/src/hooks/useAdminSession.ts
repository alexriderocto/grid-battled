import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UseMutationResult } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiPost } from "@/lib/api";
import { errorDetail } from "@/lib/errors";
import type { AdminOk, Player } from "@/lib/game";

export interface AdminSession {
  /** Admin code, memory only — a refresh signs the admin out. */
  adminPw: string | null;
  login: UseMutationResult<AdminOk, Error, string>;
  signOut: () => void;
  /** Player picked via the profile's Teleport button (then click a free square). */
  teleportId: string | null;
  setTeleportId: (id: string | null) => void;
  teleport: UseMutationResult<Player, Error, { id: string; x: number; y: number }>;
}

export function useAdminSession(): AdminSession {
  const queryClient = useQueryClient();
  const [adminPw, setAdminPw] = useState<string | null>(null);
  const [teleportId, setTeleportId] = useState<string | null>(null);

  const login = useMutation<AdminOk, Error, string>({
    mutationFn: (pw) => apiPost<AdminOk>("/game/admin/login", { password: pw }),
    onSuccess: (_res, pw) => {
      setAdminPw(pw);
      toast.success("Admin console unlocked");
    },
  });

  const teleport = useMutation<Player, Error, { id: string; x: number; y: number }>({
    mutationFn: (v) => apiPost<Player>("/game/admin/teleport", { password: adminPw, target_id: v.id, x: v.x, y: v.y }),
    onSuccess: (p) => {
      setTeleportId(null);
      void queryClient.invalidateQueries({ queryKey: ["board"] });
      toast.success(`Teleported ${p.username} to [${p.x + 1}, ${p.y + 1}]`);
    },
    onError: (err) => toast.error(errorDetail(err, "Teleport failed")),
  });

  return {
    adminPw,
    login,
    signOut: () => {
      setAdminPw(null);
      setTeleportId(null);
      queryClient.removeQueries({ queryKey: ["admin-bans"] });
      toast("Signed out of the admin console");
    },
    teleportId,
    setTeleportId,
    teleport,
  };
}
