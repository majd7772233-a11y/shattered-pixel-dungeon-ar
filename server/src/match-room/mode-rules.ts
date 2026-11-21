export type MatchGameMode = "COOP_DUNGEON" | "PVP_ARENA" | "DEATHMATCH" | "SURVIVAL";

export type MatchPlayerTargetPolicy = "DISABLED" | "FREE_FOR_ALL";
export type MatchTeamPolicy = "COOPERATIVE" | "FREE_FOR_ALL" | "NONE";

export interface MatchModeRules {
  readonly minPlayers: number;
  readonly maxPlayers: number;
  readonly playerTargetPolicy: MatchPlayerTargetPolicy;
  readonly teamPolicy: MatchTeamPolicy;
  readonly friendlyFireAllowed: boolean;
  readonly reviveAllowed: boolean;
  readonly autoRespawnAllowed: boolean;
  readonly sharedMap: boolean;
  readonly deathBehavior: "REVIVE_OR_GAMEOVER" | "SPECTATOR" | "AUTO_RESPAWN";
}

/** Worker-side source of truth. Competitive modes are FFA because no team identity exists in the player schema. */
const MATCH_MODE_RULES: Readonly<Record<MatchGameMode, MatchModeRules>> = {
  COOP_DUNGEON: {
    minPlayers: 2, maxPlayers: 4, playerTargetPolicy: "DISABLED", teamPolicy: "COOPERATIVE",
    friendlyFireAllowed: false, reviveAllowed: true, autoRespawnAllowed: false,
    sharedMap: true, deathBehavior: "REVIVE_OR_GAMEOVER"
  },
  PVP_ARENA: {
    minPlayers: 2, maxPlayers: 4, playerTargetPolicy: "FREE_FOR_ALL", teamPolicy: "FREE_FOR_ALL",
    friendlyFireAllowed: true, reviveAllowed: false, autoRespawnAllowed: false,
    sharedMap: false, deathBehavior: "SPECTATOR"
  },
  DEATHMATCH: {
    minPlayers: 2, maxPlayers: 6, playerTargetPolicy: "FREE_FOR_ALL", teamPolicy: "FREE_FOR_ALL",
    friendlyFireAllowed: true, reviveAllowed: false, autoRespawnAllowed: true,
    sharedMap: false, deathBehavior: "AUTO_RESPAWN"
  },
  SURVIVAL: {
    minPlayers: 2, maxPlayers: 4, playerTargetPolicy: "DISABLED", teamPolicy: "NONE",
    friendlyFireAllowed: false, reviveAllowed: false, autoRespawnAllowed: false,
    sharedMap: true, deathBehavior: "SPECTATOR"
  }
};

export function isMatchGameMode(mode: unknown): mode is MatchGameMode {
  return typeof mode === "string" && Object.prototype.hasOwnProperty.call(MATCH_MODE_RULES, mode);
}

export function getMatchModeRules(mode: unknown): MatchModeRules | null {
  return isMatchGameMode(mode) ? MATCH_MODE_RULES[mode] : null;
}

/** Require an enabled FFA mode, distinct living identities, and verified room membership for both players. */
export function canPlayerTargetPlayer(input: {
  gameMode: unknown;
  attackerId: unknown;
  targetPlayerId: unknown;
  attackerState: unknown;
  targetState: unknown;
  attackerHp: unknown;
  targetHp: unknown;
  attackerIsRoomMember: boolean;
  targetIsRoomMember: boolean;
}): boolean {
  const rules = getMatchModeRules(input.gameMode);
  if (!rules || rules.playerTargetPolicy !== "FREE_FOR_ALL") return false;
  if (typeof input.attackerId !== "string" || input.attackerId.length === 0
      || typeof input.targetPlayerId !== "string" || input.targetPlayerId.length === 0
      || input.attackerId === input.targetPlayerId) return false;
  return input.attackerState === "ALIVE" && input.targetState === "ALIVE"
    && typeof input.attackerHp === "number" && Number.isSafeInteger(input.attackerHp) && input.attackerHp > 0
    && typeof input.targetHp === "number" && Number.isSafeInteger(input.targetHp) && input.targetHp > 0
    && input.attackerIsRoomMember === true && input.targetIsRoomMember === true;
}
