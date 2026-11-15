import { useState } from "react";
import type { ReactElement } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiPost } from "@/lib/api";
import { errorDetail, isAuthError } from "@/lib/errors";
import type { ChatMessage, Player } from "@/lib/game";
import type { AdminSession } from "@/hooks/useAdminSession";
import type { CommanderSession } from "@/hooks/useCommanderSession";
import type { JoinFlow } from "@/hooks/useJoinFlow";
import { useActions } from "@/hooks/useActions";
import { useAdminSession } from "@/hooks/useAdminSession";
import { useBoard, useBoardStream } from "@/hooks/useBoard";
import type { Board } from "@/hooks/useBoard";
import { useCommanderSession } from "@/hooks/useCommanderSession";
import { useJoinFlow } from "@/hooks/useJoinFlow";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { Toaster } from "@/components/ui/sonner";
import ActionBar from "@/components/game/ActionBar";
import AdminConsole from "@/components/game/AdminConsole";
import ChatPanel from "@/components/game/ChatPanel";
import ClassPicker from "@/components/game/ClassPicker";
import CommanderBanner from "@/components/game/CommanderBanner";
import CustomiseDialog from "@/components/game/CustomiseDialog";
import GameBoard from "@/components/game/GameBoard";
import GameHeader from "@/components/game/GameHeader";
import JoinPanel from "@/components/game/JoinPanel";
import ProfileDialog from "@/components/game/ProfileDialog";
import Roster from "@/components/game/Roster";

/** Panel above the map: admin console, my banner, the class picker, or the join form. */
function SessionPanel({
  admin,
  session,
  flow,
  playerCount,
  board,
  onCustomise,
  onLeave,
  onAdminLeave,
}: {
  admin: AdminSession;
  session: CommanderSession;
  flow: JoinFlow;
  playerCount: number;
  board: Board;
  onCustomise: () => void;
  onLeave: () => void;
  onAdminLeave: () => void;
}): ReactElement {
  if (admin.adminPw) {
    return <AdminConsole password={admin.adminPw} playerCount={playerCount} settings={board.settings} onLeave={onAdminLeave} />;
  }
  if (session.self) {
    return <CommanderBanner self={session.self} onCustomise={onCustomise} onLeave={onLeave} />;
  }
  if (flow.newProfile) {
    return (
      <ClassPicker
        username={flow.newProfile.username}
        selected={flow.pickedClass}
        spawn={flow.spawn}
        pending={session.join.isPending}
        onSelect={flow.pickClass}
        onDeploy={flow.deploy}
        onBack={flow.back}
      />
    );
  }
  return <JoinPanel flow={flow} />;
}

export default function Home(): ReactElement {
  const queryClient = useQueryClient();
  const board = useBoard();
  const { players } = board;
  const session = useCommanderSession({
    players,
    ready: board.query.isSuccess,
    updatedAt: board.query.dataUpdatedAt,
  });
  const { self } = session;
  // The SSE stream announces my presence once I'm signed in.
  const live = useBoardStream(self?.id ?? null);

  const admin = useAdminSession();
  const flow = useJoinFlow(session, admin, players);
  const actions = useActions(self, session.setSelf, session.expire);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [customiseOpen, setCustomiseOpen] = useState<boolean>(false);
  const unread = useUnreadMessages(self, players, profileId, setProfileId);

  const chat = useMutation<ChatMessage, Error, string>({
    mutationFn: (text) => apiPost<ChatMessage>("/game/chat", { text }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["board"] }),
    onError: (err) => {
      if (isAuthError(err)) session.expire();
      else toast.error(errorDetail(err, "Message failed to send"));
    },
  });

  const onCellClick = (x: number, y: number, occupant: Player | undefined): void => {
    if (admin.adminPw && admin.teleportId) {
      if (!occupant) admin.teleport.mutate({ id: admin.teleportId, x, y });
      else if (occupant.id === admin.teleportId) admin.setTeleportId(null);
      else toast.error(`Square occupied by ${occupant.username}`);
      return;
    }
    if (flow.pickingSpawn) {
      if (occupant) toast.error("That square is occupied — pick a free one");
      else flow.setSpawn({ x, y });
      return;
    }
    if (actions.mode) {
      actions.act.mutate({ kind: actions.mode, x, y });
      return;
    }
    // No action armed: clicking a commander opens their profile + private channel.
    if (occupant) setProfileId(occupant.id);
  };

  const teleportName = admin.adminPw && admin.teleportId
    ? (players.find((p) => p.id === admin.teleportId)?.username ?? "commander")
    : null;

  return (
    <div className="relative flex min-h-svh flex-col items-center gap-6 bg-background px-4 py-8 text-foreground">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgb(2_132_199_/_0.14),transparent_55%)]"
      />
      <Toaster />
      <GameHeader players={players} settings={board.settings} offline={board.query.isError} live={live} />

      <SessionPanel
        admin={admin}
        session={session}
        flow={flow}
        playerCount={players.length}
        board={board}
        onCustomise={() => setCustomiseOpen(true)}
        onLeave={() => {
          actions.setMode(null);
          flow.reset();
          session.leave();
        }}
        onAdminLeave={() => {
          setProfileId(null);
          admin.signOut();
        }}
      />

      <GameBoard
        players={players}
        self={self}
        mode={actions.mode}
        actionPending={actions.act.isPending}
        offline={board.query.isError}
        isAdmin={Boolean(admin.adminPw)}
        teleportId={admin.teleportId}
        spawn={flow.spawn}
        pickingSpawn={flow.pickingSpawn}
        onCellClick={onCellClick}
        onTeleportDrop={(id, x, y) => admin.teleport.mutate({ id, x, y })}
      />

      <ActionBar
        self={self}
        mode={actions.mode}
        pending={actions.act.isPending}
        teleportName={teleportName}
        onToggle={actions.toggleMode}
        onExpand={() => actions.act.mutate({ kind: "expand" })}
        onCancelTeleport={() => admin.setTeleportId(null)}
      />

      <div className="flex w-full max-w-4xl flex-col gap-4 md:flex-row">
        <Roster players={players} selfId={self?.id ?? null} unread={unread} onSelect={(p) => setProfileId(p.id)} />
        <ChatPanel messages={board.chat} disabled={!self || chat.isPending} onSend={(text) => chat.mutate(text)} />
      </div>

      <CustomiseDialog open={customiseOpen && Boolean(self)} self={self} onClose={() => setCustomiseOpen(false)} />

      <ProfileDialog
        player={players.find((p) => p.id === profileId) ?? null}
        self={self}
        adminPassword={admin.adminPw}
        onTeleport={(id) => {
          admin.setTeleportId(id);
          setProfileId(null);
        }}
        onClose={() => setProfileId(null)}
      />
    </div>
  );
}
