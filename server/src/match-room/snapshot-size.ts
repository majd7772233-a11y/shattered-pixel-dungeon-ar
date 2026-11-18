import type { NetworkMessage } from "../protocol/types";

/** Android rejects complete multiplayer WebSocket frames above 16 MiB. */
export const ANDROID_MAX_WEBSOCKET_MESSAGE_BYTES = 16 * 1024 * 1024;
/** Keep 512 KiB for framing/implementation headroom instead of targeting the client ceiling. */
export const MAX_SERVER_SNAPSHOT_BYTES = ANDROID_MAX_WEBSOCKET_MESSAGE_BYTES - 512 * 1024;

/** Count a JavaScript string's UTF-8 representation without allocating a byte array. */
export function getUtf8ByteLength(value: string, stopAfterBytes = Number.POSITIVE_INFINITY): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff
        && index + 1 < value.length
        && value.charCodeAt(index + 1) >= 0xdc00
        && value.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4;
      index++;
    } else {
      bytes += 3;
    }
    if (bytes > stopAfterBytes) return bytes;
  }
  return bytes;
}

/** Count the exact JSON-escaped UTF-8 width of a string, including its quote delimiters. */
function getQuotedJsonStringByteLength(value: string, stopAfterBytes: number): number {
  let bytes = 2;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code === 0x22 || code === 0x5c) {
      bytes += 2;
    } else if (code <= 0x1f) {
      // JSON uses short escapes for backspace, tab, LF, form feed and CR.
      bytes += code === 0x08 || code === 0x09 || code === 0x0a
        || code === 0x0c || code === 0x0d ? 2 : 6;
    } else if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff
        && index + 1 < value.length
        && value.charCodeAt(index + 1) >= 0xdc00
        && value.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4;
      index++;
    } else if (code >= 0xd800 && code <= 0xdfff) {
      // JSON.stringify escapes lone UTF-16 surrogates as six ASCII bytes.
      bytes += 6;
    } else {
      bytes += 3;
    }
    if (bytes > stopAfterBytes) return bytes;
  }
  return bytes;
}

/**
 * Count the exact bytes JSON.stringify emits for JSON values without first building that
 * serialized string. Match JSON.stringify's omission/null behavior for undefined/function/symbol
 * values; protocol snapshots themselves are plain JSON data.
 */
export function getJsonUtf8ByteLength(value: unknown, stopAfterBytes = Number.POSITIVE_INFINITY): number {
  const add = (total: number, next: number): number => {
    const combined = total + next;
    return combined > stopAfterBytes ? stopAfterBytes + 1 : combined;
  };

  const visit = (current: unknown, remaining: number): number => {
    if (current === null) return 4;
    if (typeof current === "string") return getQuotedJsonStringByteLength(current, remaining);
    if (typeof current === "boolean") return current ? 4 : 5;
    if (typeof current === "number") {
      const encoded = JSON.stringify(current);
      return encoded === undefined ? 4 : encoded.length;
    }
    if (typeof current === "bigint") throw new TypeError("Do not know how to serialize a BigInt");
    if (typeof current === "undefined" || typeof current === "function" || typeof current === "symbol") {
      return 0;
    }
    if (Array.isArray(current)) {
      let bytes = 2;
      for (let index = 0; index < current.length; index++) {
        if (index > 0) bytes = add(bytes, 1);
        const item = current[index];
        const itemBytes = item === undefined || typeof item === "function" || typeof item === "symbol"
          ? 4 : visit(item, stopAfterBytes - bytes);
        bytes = add(bytes, itemBytes);
        if (bytes > stopAfterBytes) return bytes;
      }
      return bytes;
    }
    if (typeof current === "object") {
      const record = current as Record<string, unknown>;
      let bytes = 2;
      let emitted = 0;
      for (const key of Object.keys(record)) {
        const item = record[key];
        if (item === undefined || typeof item === "function" || typeof item === "symbol") continue;
        if (emitted > 0) bytes = add(bytes, 1);
        bytes = add(bytes, getQuotedJsonStringByteLength(key, stopAfterBytes - bytes));
        bytes = add(bytes, 1); // colon
        bytes = add(bytes, visit(item, stopAfterBytes - bytes));
        emitted++;
        if (bytes > stopAfterBytes) return bytes;
      }
      return bytes;
    }
    return 0;
  };

  return visit(value, stopAfterBytes);
}

/** Serialize only JSON values that fit a byte ceiling; reject before allocating an oversized string. */
export function serializeJsonWithinBudget(value: unknown, maxBytes: number): string {
  if (getJsonUtf8ByteLength(value, maxBytes) > maxBytes) throw new Error("SNAPSHOT_TOO_LARGE");
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new TypeError("Snapshot data is not JSON-serializable");
  return serialized;
}

/** Measure the complete escaped NetworkMessage envelope as UTF-8 bytes. */
export function getSerializedSnapshotBytes(message: NetworkMessage): number {
  return getJsonUtf8ByteLength(message);
}

/** Serialize once, enforce the complete wire-byte ceiling, and return the exact text to send. */
export function serializeSnapshotWithinBudget(message: NetworkMessage): string {
  return serializeJsonWithinBudget(message, MAX_SERVER_SNAPSHOT_BYTES);
}
