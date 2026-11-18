import { describe, expect, it } from "vitest";
import type { NetworkMessage } from "../protocol/types";
import { ANDROID_MAX_WEBSOCKET_MESSAGE_BYTES, MAX_SERVER_SNAPSHOT_BYTES,
  getJsonUtf8ByteLength, getSerializedSnapshotBytes, getUtf8ByteLength,
  serializeJsonWithinBudget, serializeSnapshotWithinBudget } from "./snapshot-size";

function snapshot(payloadJson: string): NetworkMessage {
  return { protocolVersion: "1.0.0", messageType: "SNAPSHOT", payloadJson };
}

describe("full SNAPSHOT serialized byte budget", () => {
  it("matches JSON.stringify UTF-8 width for escapes, nested values, Unicode and supplementary code points", () => {
    const sample = {
      escaped: "\"\\\u0000\b\t\n\f\r",
      unicode: "\u0645\u062c\u062f \u4e2d \u00e9 \uD83D\uDE80 \uD800",
      values: [null, true, false, 0, -0, 1.25, undefined, ["\n", { key: "value" }]],
      omitted: undefined
    };
    expect(getJsonUtf8ByteLength(sample)).toBe(
      new TextEncoder().encode(JSON.stringify(sample)).byteLength
    );
    const sampleText = "A\u00e9\u4e2d\uD83D\uDE80";
    expect(getUtf8ByteLength(sampleText)).toBe(
      new TextEncoder().encode(sampleText).byteLength
    );
  });

  it("measures the complete nested JSON envelope and returns the exact same serialized text", () => {
    const message = snapshot(JSON.stringify({ level: { label: "\u0645\u062c\u062f", bundle: "{}" } }));
    expect(getSerializedSnapshotBytes(message)).toBe(
      new TextEncoder().encode(JSON.stringify(message)).byteLength
    );
    expect(serializeSnapshotWithinBudget(message)).toBe(JSON.stringify(message));
  });

  it("accepts the exact 15.5 MiB server ceiling and rejects the next byte", () => {
    const overhead = getSerializedSnapshotBytes(snapshot(""));
    const atLimit = snapshot("x".repeat(MAX_SERVER_SNAPSHOT_BYTES - overhead));
    expect(getSerializedSnapshotBytes(atLimit)).toBe(MAX_SERVER_SNAPSHOT_BYTES);
    expect(serializeSnapshotWithinBudget(atLimit)).toBe(JSON.stringify(atLimit));
    expect(() => serializeSnapshotWithinBudget(snapshot(atLimit.payloadJson + "x")))
      .toThrowError("SNAPSHOT_TOO_LARGE");
    expect(MAX_SERVER_SNAPSHOT_BYTES + 512 * 1024).toBe(ANDROID_MAX_WEBSOCKET_MESSAGE_BYTES);
  });

  it("rejects oversized nested JSON before allocating its serialized string", () => {
    const value = { nested: "x".repeat(MAX_SERVER_SNAPSHOT_BYTES + 1) };
    expect(getJsonUtf8ByteLength(value, MAX_SERVER_SNAPSHOT_BYTES))
      .toBeGreaterThan(MAX_SERVER_SNAPSHOT_BYTES);
    expect(() => serializeJsonWithinBudget(value, MAX_SERVER_SNAPSHOT_BYTES))
      .toThrowError("SNAPSHOT_TOO_LARGE");
  });

  it("counts escaped multi-byte and lone-surrogate strings exactly", () => {
    const value = { text: "\u00e9".repeat(20) + "\u4e2d" + "\uD83D\uDE80" + "\uD800" + "\u0001" }