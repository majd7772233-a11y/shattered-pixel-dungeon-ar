import type { NetworkMessage } from "./types";

export const WORKER_INBOUND_MESSAGE_TYPES = [
  "RECONNECT", "LEVEL_DATA", "LEVEL_READY", "ACTION",
  "READY", "RESYNC", "PING", "CHAT"
] as const;

export const KNOWN_NON_INBOUND_MESSAGE_TYPES = [
  "HELLO", "SESSION", "CREATE_ROOM", "JOIN_ROOM", "ROOM_STATE",
  "PLAYER_JOINED", "PLAYER_LEFT", "MATCH_START", "LEVEL_PUBLISHER_CHANGED",
  "ACTION_ACCEPTED", "COMBAT_REQUEST", "EVENT_BATCH", "SNAPSHOT", "ACK",
  "MATCH_END", "LEAVE", "ERROR"
] as const;

const inboundTypes = new Set<string>(WORKER_INBOUND_MESSAGE_TYPES);
const knownNonInboundTypes = new Set<string>(KNOWN_NON_INBOUND_MESSAGE_TYPES);

export type WorkerMessageTypeClassification = "INBOUND" | "UNSUPPORTED" | "UNKNOWN" | "INVALID";

export function classifyWorkerMessageType(value: unknown): WorkerMessageTypeClassification {
  if (typeof value !== "string" || value.length === 0) return "INVALID";
  if (inboundTypes.has(value)) return "INBOUND";
  if (knownNonInboundTypes.has(value)) return "UNSUPPORTED";
  return "UNKNOWN";
}

export type WorkerEnvelopeAdmission =
  | { ok: true; message: NetworkMessage; requestId?: string }
  | { ok: false; error: string; requestId?: string };

export function validateWorkerInboundEnvelope(value: unknown): WorkerEnvelopeAdmission {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "INVALID_MESSAGE_ENVELOPE" };
  }

  const raw = value as Record<string, unknown>;
  const requestId = typeof raw.requestId === "string" && raw.requestId.length > 0
    ? raw.requestId : undefined;

  if (typeof raw.protocolVersion !== "string"
      || typeof raw.messageType !== "string"
      || typeof raw.payloadJson !== "string"
      || (raw.requestId !== undefined && typeof raw.requestId !== "string")
      || (raw.senderId !== undefined && typeof raw.senderId !== "string")
      || (raw.sequence !== undefined
        && (typeof raw.sequence !== "number" || !Number.isSafeInteger(raw.sequence) || raw.sequence < 0))) {
    return { ok: false, error: "INVALID_MESSAGE_ENVELOPE", requestId };
  }

  if (raw.protocolVersion !== "1.0.0") {
    return { ok: false, error: "UNSUPPORTED_PROTOCOL_VERSION", requestId };
  }

  const classification = classifyWorkerMessageType(raw.messageType);
  if (classification === "INVALID") {
    return { ok: false, error: "INVALID_MESSAGE_ENVELOPE", requestId };
  }
  if (classification === "UNKNOWN") {
    return { ok: false, error: "UNKNOWN_MESSAGE_TYPE", requestId };
  }
  if (classification === "UNSUPPORTED") {
    return { ok: false, error: "UNSUPPORTED_MESSAGE_TYPE", requestId };
  }

  try {
    JSON.parse(raw.payloadJson);
  } catch (_) {
    return { ok: false, error: "MALFORMED_MESSAGE_PAYLOAD", requestId };
  }

  return { ok: true, message: raw as unknown as NetworkMessage, requestId };
}
