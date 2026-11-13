import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schema = JSON.parse(readFileSync(new URL("../../protocol/schema.json", import.meta.url), "utf8"));
assert.ok(schema.properties.messageType.enum.includes("LEVEL_PUBLISHER_CHANGED"),
  "The server-authored publisher-generation control message must be part of the outer protocol enum");

const level = schema.definitions?.NativeLevelSnapshot;
assert.ok(level?.properties, "NativeLevelSnapshot must be defined");
assert.equal(level.properties.publisherRebase?.type, "boolean");
assert.equal(level.properties.publisherRebase?.const, true);
assert.equal(level.properties.publisherRebaseTerm?.type, "integer");
assert.equal(level.properties.publisherRebaseTerm?.minimum, 1);

const payload = schema.definitions?.LevelPublisherChangedPayload;
assert.ok(payload?.type === "object", "LevelPublisherChangedPayload must be defined");
assert.equal(payload.additionalProperties, false);
assert.deepEqual(payload.required, ["publisherId", "term", "reason"]);
assert.deepEqual(payload.properties.publisherId.type, ["string", "null"]);
assert.equal(payload.properties.term.type, "integer");
assert.equal(payload.properties.term.minimum, 1);
assert.deepEqual(payload.properties.reason.enum, [
  "PUBLISHER_DISCONNECTED", "PUBLISHER_ASSIGNED_ON_CONNECT", "RECONNECT"
]);

console.log("Level Publisher handoff protocol schema: valid");
