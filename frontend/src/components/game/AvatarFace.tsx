import { flagUrl, countryName } from "@/lib/countries";
import type { Player } from "@/lib/game";

/** What sits inside a commander's token circle: their country flag, or their initial. */
export default function AvatarFace({ player }: { player: Pick<Player, "username" | "flag"> }) {
  if (player.flag) {
    return (
      <img
        src={flagUrl(player.flag)}
        alt={`${countryName(player.flag)} flag`}
        draggable={false}
        className="pointer-events-none size-full rounded-full object-cover"
      />
    );
  }
  return <>{player.username.charAt(0).toUpperCase()}</>;
}
