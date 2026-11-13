import { describe, expect, it } from "vitest";
import {
  classifyWorkerMessageType,
  KNOWN_NON_INBOUND_MESSAGE_TYPES,
  validateWorkerInboundEnvelope,
  WORKER_INBOUND_MESSAGE_TYPES
} from "./message-admission";

describe("Worker outer-message admission", () => {
  it("classifies each of the eight implemented inbound message types", () => {
    for (const type of WORKER_INBOUND_MESSAGE_TYPES) {
      expect(classifyWorkerMessageType(type)).toBe("INBOUND");
    }
  });

  it("classifies every other declared outer message as non-inbound", () => {
    for (const type of KNOWN_NON_INBOUND_MESSAGE_TYPES) {
      expect(classifyWorkerMessageType(type)).toBe("UNSUPPORTED");
    }
  });

  it("does not confuse unknown names or invalid discriminator values with known output messages", () => {
    expect(classifyWorkerMessageType("UNLISTED_MESSAGE")).toBe("UNKNOWN");
    expect(classifyWorkerMessageType("action")).toBe("UNKNOWN");
    expect(classifyWorkerMessageType("")).toBe("INVALID");
    expect(classifyWorkerMessageType(null)).toBe("INVALID");
    expect(classifyWorkerMessageType(7)).toBe("INVALID");
  });

  it("admits a valid encoded ACTION envelope while preserving its correlation ID", () => {
    const result = validateWorkerInboundEnvelope({
      protocolVersion: "1.0.0",
      messageType: "ACTION",
      requestId: "req-phase10b",
      sequence: 12,
      senderId: "untrusted-client-value",
      payloadJson: JSON.stringify({ action: "WAIT", data: {} })
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.requestId).toBe("req-phase10b");
      expect(result.message.messageType).toBe("ACTION");
      expect(result.message.payloadJson).toBe(JSON.stringify({ action: "WAIT", data: {} }));
    }
  });

  it.each([null, [], "ACTION", 42])("rejects a non-object envelope: %s", value => {
    expect(validateWorkerInboundEnvelope(value)).toMatchObject({
      ok: false, error: "INVALID_MESSAGE_ENVELOPE"
    });
  });

  it("rejects missing required envelope fields and invalid optional field types", () => {
    const base = { protocolVersion: "1.0.0", messageType: "PING", payloadJson: "{}" };
    expect(validateWorkerInboundEnvelope({ messageType: "PING", payloadJson: "{}" }))
      .toMatchObject({ ok: false, error: "INVALID_MESSAGE_ENVELOPE" });
    expect(validateWorkerInboundEnvelope({ ...base, requestId: 9 }))
      .toMatchObject({ ok: false, error: "INVALID_MESSAGE_ENVELOPE" });
    expect(validateWorkerInboundEnvelope({ ...base, senderId: {} }))
      .toMatchObject({ ok: false, error: "INVALID_MESSAGE_ENVELOPE" });
    expect(validateWorkerInboundEnvelope({ ...base, sequence: "12" }))
      .toMatchObject({ ok: false, error: "INVALID_MESSAGE_ENVELOPE" });
    expect(validateWorkerInboundEnvelope({ ...base, sequence: -1 }))
      .toMatchObject({ ok: false, error: "INVALID_MESSAGE_ENVELOPE" });
  });

  it("rejects unsupported protocol versions before message dispatch", () => {
    expect(validateWorkerInboundEnvelope({
      protocolVersion: "2.0.0", messageType: "PING", payloadJson: "{}"
    })).toMatchObject({ ok: false, error: "UNSUPPORTED_PROTOCOL_VERSION" });
  });

  it("returns correlated errors for known non-inbound message types", () => {
    expect(validateWorkerInboundEnvelope({
      protocolVersion: "1.0.0", messageType: "SNAPSHOT",
      requestId: "not-a-client-route", payloadJson: "{}"
    })).toMatchObject({
      ok: false, error: "UNSUPPORTED_MESSAGE_TYPE", requestId: "not-a-client-route"
    });
  });

  it("returns a correlated error for an unknown message type", () => {
    expect(validateWorkerInboundEnvelope({
      protocolVersion: "1.0.0", messageType: "FUTURE_MESSAGE",
      requestId: "unknown-route", payloadJson: "{}"
    })).toMatchObject({
      ok: false, error: "UNKNOWN_MESSAGE_TYPE", requestId: "unknown-route"
    });
  });

  it("rejects malformed nested payload JSON and preserves the request ID", () => {
    expect(validateWorkerInboundEnvelope({
      protocolVersion: "1.0.0", messageType: "ACTION",
      requestId: "bad-payload", payloadJson: "{not-json"
    })).toMatchObject({
      ok: false, error: "MALFORMED_MESSAGE_PAYLOAD", requestId: "bad-payload"
    });
  });
});
