import { describe, expect, it } from "vitest";
import { canPlayerTargetPlayer, getMatchModeRules, isMatchGameMode } from "./mode-rules";

describe("authoritative game-mode rule matrix", () => {
  it.each([
    ["COOP_DUNGEON", 2, 4, "DISABLED", "COOPERATIVE", false, true, false, true, "REVIVE_OR_GAMEOVER"],
    ["PVP_ARENA", 2, 4, "FREE_FOR_ALL", "FREE_FOR_ALL", true, false, false, false, "SPECTATOR"],
    ["DEATHMATCH", 2, 6, "FREE_FOR_ALL", "FREE_FOR_ALL", true, false, true, false, "AUTO_RESPAWN"],
    ["SURVIVAL", 2, 4, "DISABLED", "NONE", false, false, false, true, "SPECTATOR"]
  ] as const)(
    "%s has the documented limits and mode capabilities",
    (mode, minPlayers, maxPlayers, playerTargetPolicy, teamPolicy, friendlyFireAllowed,
      reviveAllowed, autoRespawnAllowed, sharedMap, deathBehavior) => {
      expect(getMatchModeRules(mode)).toEqual({
        minPlayers, maxPlayers, playerTargetPolicy, teamPolicy, friendlyFireAllowed,
        reviveAllowed, autoRespawnAllowed, sharedMap, deathBehavior
      });
    }
  );

  it("fails closed for unknown and malformed mode values", () => {
    for (const mode of [null, undefined, "", "PVP", "pvp_arena", {}, 1]) {
      expect(isMatchGameMode(mode)).toBe(false);
      expect(getMatchModeRules(mode)).toBeNull();
    }
  });

  it.each(["COOP_DUNGEON", "SURVIVAL"])("%s rejects player-vs-player targets", gameMode => {
    expect(canPlayerTargetPlayer({
      gameMode, attackerId: "player-a", targetPlayerId: "player-b",
      attackerState: "ALIVE", targetState: "ALIVE", attackerHp: 20, targetHp: 20,
      attackerIsRoomMember: true, targetIsRoomMember: true
    })).toBe(false);
  });

  it.each(["PVP_ARENA", "DEATHMATCH"])("%s permits only living members to target another living member", gameMode => {
    const valid = {
      gameMode, attackerId: "player-a", targetPlayerId: "player-b",
      attackerState: "ALIVE", targetState: "ALIVE", attackerHp: 20, targetHp: 20,
      attackerIsRoomMember: true, targetIsRoomMember: true
    };
    expect(canPlayerTargetPlayer(valid)).toBe(true);
    const rejected = [
      { ...valid, attackerId: "player-b" },
      { ...valid, targetPlayerId: "" },
      { ...valid, attackerState: "DEAD" },
      { ...valid, attackerState: "SPECTATOR" },
      { ...valid, targetState: "DEAD" },
      { ...valid, targetState: "SPECTATOR" },
      { ...valid, attackerHp: 0 },
      { ...valid, targetHp: 0 },
      { ...valid, attackerHp: -1 },
      { ...valid, targetHp: Number.NaN },
      { ...valid, attackerIsRoomMember: false },
      { ...valid, targetIsRoomMember: false }
    ];
    for (const candidate of rejected) expect(canPlayerTargetPlayer(candidate)).toBe(false);
  });

  it("does not accept truthy-but-nonboolean room membership claims", () => {
    expect(canPlayerTargetPlayer({
      gameMode: "DEATHMATCH", attackerId: "player-a", targetPlayerId: "player-b",
      attackerState: "ALIVE", targetState: "ALIVE", attackerHp: 20, targetHp: 20,
      attackerIsRoomMember: 1 as unknown as boolean, targetIsRoomMember: true
    })).toBe(false);
  });
});
