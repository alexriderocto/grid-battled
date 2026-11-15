import type { DragEvent, MouseEvent, ReactElement } from "react";
import { motion } from "motion/react";
import { MAX_HEALTH, PALETTE } from "@/lib/game";
import type { Player } from "@/lib/game";
import AvatarFace from "@/components/game/AvatarFace";

export interface RangeTint {
  color: string;
  own: boolean;
}

function AvatarToken({ player, isSelf }: { player: Player; isSelf: boolean }): ReactElement {
  const tint = PALETTE[player.color % PALETTE.length];
  const pulse = isSelf ? "animate-radar ring-2 ring-emerald-400 ring-offset-1 ring-offset-slate-900" : "";
  const faded = player.online || isSelf ? "" : "opacity-50 grayscale-[40%]";
  return (
    <span data-testid={isSelf ? "self-avatar-highlight" : undefined} className="relative flex size-full items-center justify-center">
      <motion.span
        data-testid={`player-avatar-${player.username}`}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
        className={`flex size-[74%] max-h-[30px] max-w-[30px] items-center justify-center overflow-hidden rounded-full border font-mono text-[10px] font-bold text-white shadow-md select-none md:text-xs ${pulse} ${faded}`}
        style={{ backgroundColor: tint.bg, borderColor: tint.border }}
      >
        <AvatarFace player={player} />
      </motion.span>
      {player.health < MAX_HEALTH && (
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

/** Base look of a square: my token, a rival token, a range-tinted square, or plain ground. */
function baseClass(player: Player | undefined, isSelf: boolean, tint: RangeTint | null): string {
  if (isSelf) return "border-emerald-500/70 bg-emerald-950/60";
  if (player) return "border-blue-700/40 bg-[#172554]/70";
  if (tint) return "hover:brightness-150";
  return "border-slate-800/80 bg-[#0F172A] hover:border-sky-500/60 hover:bg-slate-800/90";
}

export interface BoardCellProps {
  row: number;
  col: number;
  player: Player | undefined;
  isSelf: boolean;
  tint: RangeTint | null;
  /** Extra state classes (target ring, spawn/teleport/drag highlights, cursors). */
  stateClass: string;
  isSpawn: boolean;
  draggable: boolean;
  onClick: () => void;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onPointer: (e: MouseEvent<HTMLDivElement>) => void;
  onPointerLeave: () => void;
}

/** One square of the 15×15 map. */
export default function BoardCell(props: BoardCellProps): ReactElement {
  const { row, col, player, isSelf, tint } = props;
  const label = player
    ? `Grid cell row ${row + 1} col ${col + 1}, occupied by ${player.username}`
    : `Grid cell row ${row + 1} col ${col + 1}`;
  // your own diamond a touch stronger (15% fill) than rivals' (8%)
  const style = tint
    ? { backgroundColor: `${tint.color}${tint.own ? "26" : "14"}`, borderColor: `${tint.color}55` }
    : undefined;
  return (
    <div
      data-testid={`grid-cell-${row}-${col}`}
      role="gridcell"
      aria-label={label}
      onClick={props.onClick}
      draggable={props.draggable}
      onDragStart={props.onDragStart}
      onDragOver={props.onDragOver}
      onDragLeave={props.onDragLeave}
      onDrop={props.onDrop}
      onMouseEnter={props.onPointer}
      onMouseMove={props.onPointer}
      onMouseLeave={props.onPointerLeave}
      data-range-tint={tint?.color ?? undefined}
      style={style}
      className={`relative flex aspect-square items-center justify-center rounded-[3px] border transition-colors duration-150 ${baseClass(player, isSelf, tint)} ${props.stateClass}`}
    >
      {player && <AvatarToken player={player} isSelf={isSelf} />}
      {!player && props.isSpawn && (
        <span data-testid="spawn-marker" className="size-2.5 animate-pulse rounded-full bg-amber-300" />
      )}
    </div>
  );
}
