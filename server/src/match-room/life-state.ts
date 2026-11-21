export type CoopLifeState = "ALIVE" | "DEAD" | "SPECTATOR";

export interface CoopLifeParticipant {
  state: string;
  heroStateJson?: unknown;
}

interface ParsedLifeState {
  hp: number;
  ht: number;
  ankhCount: number;
  blessedAnkhCount: number;
}

export function parseCoopLifeState(value: unknown): ParsedLifeState | null {
  if (typeof value !== "string" || value.length < 1 || value.length > 200000) return null;
  try {
    const parsed = JSON.parse(value);
    const hp = parsed?.hp;
    const ht = parsed?.ht;
    const ankhCount = parsed?.ankhCount;
    const blessedAnkhCount = parsed?.blessedAnkhCount;
    if (!Number.isSafeInteger(hp) || hp < 0 || !Number.isSafeInteger(ht) || ht < 1 || hp > ht
        || !Number.isSafeInteger(ankhCount) || ankhCount < 0
        || !Number.isSafeInteger(blessedAnkhCount) || blessedAnkhCount < 0
        || blessedAnkhCount > ankhCount) return null;
    return { hp, ht, ankhCount, blessedAnkhCount };
  } catch (_) {
    return null;
  }
}

/** Only an unblessed Ankh can hold a dead Co-op player in the native resurrection flow. */
export function hasUnblessedAnkh(heroStateJson: unknown): boolean {
  const state = parseCoopLifeState(heroStateJson);
  return !!state && state.ankhCount - state.blessedAnkhCount > 0;
}

/** Blessed Ankhs are consumed by native Hero.die(); unblessed Ankhs keep the player DEAD for WndResurrect. */
export function coopDeathStateFromHeroStateJson(heroStateJson: unknown): CoopLifeState {
  const state = parseCoopLifeState(heroStateJson);
  if (state && state.hp > 0) return "ALIVE";
  return state && state.hp === 0 && state.ankhCount - state.blessedAnkhCount > 0
    ? "DEAD" : "SPECTATOR";
}

export function canCoopParticipantContinue(participant: CoopLifeParticipant): boolean {
  const state = parseCoopLifeState(participant.heroStateJson);
  if (!state) return false;
  if (participant.state === "ALIVE") return state.hp > 0;
  return participant.state === "DEAD" && state.hp === 0
    && state.ankhCount - state.blessedAnkhCount > 0;
}

export function hasPendingCoopRevival(participants: CoopLifeParticipant[]): boolean {
  return participants.some(participant => {
    if (participant.state === "LEFT") return false;
    const state = parseCoopLifeState(participant.heroStateJson);
    if (!state) return true;
    if (participant.state === "ALIVE") return state.hp === 0;
    if (participant.state !== "DEAD" && participant.state !== "SPECTATOR") return true;
    if (state.hp !== 0) return true;
    return state.ankhCount - state.blessedAnkhCount > 0;
  });
}

/** A match may end only on an explicit terminal state backed by coherent native state. Unknown or mismatched data is not proof of elimination. */
export function isTerminalCoopParticipant(participant: CoopLifeParticipant): boolean {
  if (participant.state === "LEFT") return true;
  const state = parseCoopLifeState(participant.heroStateJson);
  if (!state || state.hp !== 0 || state.ankhCount - state.blessedAnkhCount > 0) return false;
  return participant.state === "DEAD" || participant.state === "SPECTATOR";
}

export function shouldEndCoopMatch(participants: CoopLifeParticipant[]): boolean {
  return participants.length === 0 || participants.every(isTerminalCoopParticipant);
}