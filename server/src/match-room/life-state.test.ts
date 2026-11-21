import { describe, expect, it } from "vitest";
import {
  canCoopParticipantContinue,
  coopDeathStateFromHeroStateJson,
  hasPendingCoopRevival,
  hasUnblessedAnkh,
  isTerminalCoopParticipant,
  parseCoopLifeState,
  shouldEndCoopMatch
} from "./life-state";

const hero = (hp: number, ankhCount = 0, blessedAnkhCount = 0) =>
  JSON.stringify({ hp, ht: 20, ankhCount, blessedAnkhCount });

describe("Co-op player life policy", () => {
  it("keeps a living player ALIVE regardless of whether they carry Ankhs", () => {
    expect(coopDeathStateFromHeroStateJson(hero(5, 2, 1))).toBe("ALIVE");
    expect(coopDeathStateFromHeroStateJson(hero(1))).toBe("ALIVE");
  });

  it("keeps a zero-HP player DEAD only while an unblessed Ankh remains", () => {
    expect(coopDeathStateFromHeroStateJson(hero(0, 2, 1))).toBe("DEAD");
    expect(hasUnblessedAnkh(hero(0, 2, 1))).toBe(true);
  });

  it("makes a zero-HP player a spectator when no unblessed Ankh remains", () => {
    expect(coopDeathStateFromHeroStateJson(hero(0))).toBe("SPECTATOR");
    expect(coopDeathStateFromHeroStateJson(hero(0, 2, 2))).toBe("SPECTATOR");
    expect(coopDeathStateFromHeroStateJson(hero(0, 1, 1))).toBe("SPECTATOR");
  });

  it("fails closed for absent, malformed, negative, fractional or inconsistent Ankh counts", () => {
    expect(parseCoopLifeState(undefined)).toBeNull();
    expect(parseCoopLifeState("{")).toBeNull();
    expect(hasUnblessedAnkh(JSON.stringify({ hp: 0, ht: 20, ankhCount: 1 }))).toBe(false);
    expect(hasUnblessedAnkh(hero(0, 1, 2))).toBe(false);
    expect(hasUnblessedAnkh(hero(0, -1, 0))).toBe(false);
    expect(hasUnblessedAnkh(hero(0, 1.5, 0))).toBe(false);
    expect(hasUnblessedAnkh(JSON.stringify({ hp: 0, ht: 20, ankhCount: "1", blessedAnkhCount: 0 }))).toBe(false);
    expect(coopDeathStateFromHeroStateJson("{")).toBe("SPECTATOR");
  });

  it("requires ALIVE state and positive HP to agree before continuing", () => {
    expect(canCoopParticipantContinue({ state: "ALIVE", heroStateJson: hero(0, 1, 0) })).toBe(false);
    expect(canCoopParticipantContinue({ state: "ALIVE", heroStateJson: "{" })).toBe(false);
    expect(canCoopParticipantContinue({ state: "DEAD", heroStateJson: hero(2, 1, 0) })).toBe(false);
    expect(hasPendingCoopRevival([{ state: "DEAD", heroStateJson: hero(2, 1, 0) }])).toBe(true);
    expect(hasPendingCoopRevival([{ state: "DEAD", heroStateJson: "{" }])).toBe(true);
    expect(hasPendingCoopRevival([{ state: "SPECTATOR", heroStateJson: hero(0, 1, 0) }])).toBe(true);
    expect(hasPendingCoopRevival([{ state: "SPECTATOR", heroStateJson: hero(0) }])).toBe(false);
  });

  it("allows reconnecting dead players with a valid unblessed Ankh but not spectators or left members", () => {
    expect(canCoopParticipantContinue({ state: "DEAD", heroStateJson: hero(0, 1, 0) })).toBe(true);
    expect(canCoopParticipantContinue({ state: "DEAD", heroStateJson: hero(0, 0, 0) })).toBe(false);
    expect(canCoopParticipantContinue({ state: "SPECTATOR", heroStateJson: hero(0, 1, 0) })).toBe(false);
    expect(canCoopParticipantContinue({ state: "LEFT", heroStateJson: hero(1, 1, 0) })).toBe(false);
  });

  it("holds a floor transition while a dead participant still has an unblessed Ankh pending", () => {
    expect(hasPendingCoopRevival([
      { state: "ALIVE", heroStateJson: hero(5) },
      { state: "DEAD", heroStateJson: hero(0, 1, 0) }
    ])).toBe(true);
    expect(hasPendingCoopRevival([{ state: "DEAD", heroStateJson: hero(0) }])).toBe(false);
    expect(hasPendingCoopRevival([{ state: "DEAD", heroStateJson: "{" }])).toBe(true);
    expect(hasPendingCoopRevival([{ state: "SPECTATOR", heroStateJson: hero(0, 1, 0) }])).toBe(true);
    expect(hasPendingCoopRevival([{ state: "SPECTATOR", heroStateJson: hero(0) }])).toBe(false);
  });

  it("blocks floor transitions for unknown members and mismatched ALIVE snapshots", () => {
    expect(hasPendingCoopRevival([{ state: "UNKNOWN", heroStateJson: null }])).toBe(true);
    expect(hasPendingCoopRevival([{ state: "UNKNOWN", heroStateJson: hero(0) }])).toBe(true);
    expect(hasPendingCoopRevival([{ state: "ALIVE", heroStateJson: null }])).toBe(true);
    expect(hasPendingCoopRevival([{ state: "ALIVE", heroStateJson: hero(0) }])).toBe(true);
    expect(hasPendingCoopRevival([{ state: "ALIVE", heroStateJson: hero(5) }])).toBe(false);
    expect(hasPendingCoopRevival([{ state: "LEFT", heroStateJson: null }])).toBe(false);
  });
  it("does not convert missing or inconsistent life-state data into a terminal match result", () => {
    expect(isTerminalCoopParticipant({ state: "ALIVE", heroStateJson: "{" })).toBe(false);
    expect(isTerminalCoopParticipant({ state: "ALIVE", heroStateJson: hero(0) })).toBe(false);
    expect(isTerminalCoopParticipant({ state: "SPECTATOR", heroStateJson: "{" })).toBe(false);
    expect(isTerminalCoopParticipant({ state: "SPECTATOR", heroStateJson: hero(0, 1, 0) })).toBe(false);
    expect(shouldEndCoopMatch([{ state: "SPECTATOR", heroStateJson: "{" }])).toBe(false);
  });
  it("ends only when every participant is terminal, and ends an empty match", () => {
    expect(shouldEndCoopMatch([])).toBe(true);
    expect(shouldEndCoopMatch([
      { state: "SPECTATOR", heroStateJson: hero(0) },
      { state: "DEAD", heroStateJson: hero(0, 1, 0) }
    ])).toBe(false);
    expect(shouldEndCoopMatch([
      { state: "SPECTATOR", heroStateJson: hero(0) },
      { state: "LEFT", heroStateJson: hero(1) }
    ])).toBe(true);
  });
});