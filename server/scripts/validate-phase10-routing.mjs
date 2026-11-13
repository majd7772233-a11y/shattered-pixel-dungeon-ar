import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const readRepoFile = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");

function parseJavaEnum(source, enumName) {
  const start = source.indexOf("enum " + enumName);
  assert.ok(start >= 0, "Java enum " + enumName + " must exist");
  const open = source.indexOf("{", start);
  const close = source.indexOf("}", open + 1);
  assert.ok(open >= 0 && close > open, "Java enum " + enumName + " must have a body");
  return source.slice(open + 1, close)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .split(",").map(value => value.trim()).filter(Boolean);
}

function parseStringArray(source, exportName) {
  const match = source.match(new RegExp("export const " + exportName + "\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as const"));
  assert.ok(match, exportName + " must be an exported const tuple");
  return [...match[1].matchAll(/"([A-Z][A-Z0-9_]*)"/g)].map(value => value[1]);
}

const messageEnum = parseJavaEnum(readRepoFile(
  "core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/MessageType.java"
), "MessageType");
const actionEnum = parseJavaEnum(readRepoFile(
  "core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/NetworkActionType.java"
), "NetworkActionType");
const schema = JSON.parse(readRepoFile("protocol/schema.json"));
const admissionSource = readRepoFile("server/src/protocol/message-admission.ts");
const messageRouterSource = readRepoFile("server/src/match-room/messages.ts");
const actionSource = readRepoFile("server/src/match-room/actions.ts");

const inbound = parseStringArray(admissionSource, "WORKER_INBOUND_MESSAGE_TYPES");
const knownNonInbound = parseStringArray(admissionSource, "KNOWN_NON_INBOUND_MESSAGE_TYPES");
const inboundSet = new Set(inbound);
const nonInboundSet = new Set(knownNonInbound);

assert.equal(inboundSet.size, inbound.length, "Worker inbound message list must not contain duplicates");
assert.equal(nonInboundSet.size, knownNonInbound.length, "Non-inbound message list must not contain duplicates");
assert.equal([...inboundSet].filter(value => nonInboundSet.has(value)).length, 0,
  "A message cannot be both inbound and non-inbound");
assert.equal(inbound.length + knownNonInbound.length, messageEnum.length,
  "Every canonical outer message must have exactly one Worker ingress classification");
assert.deepEqual(
  messageEnum.filter(value => inboundSet.has(value) || nonInboundSet.has(value)),
  messageEnum,
  "Worker ingress classifications must cover all Java MessageType values"
);
assert.deepEqual(schema.properties?.messageType?.enum, messageEnum,
  "Worker ingress matrix baseline must match the canonical JSON Schema messageType enum");

const routeBranches = [...messageRouterSource.matchAll(/msg\.messageType\s*===\s*"([A-Z][A-Z0-9_]*)"/g)]
  .map(match => match[1]);
assert.deepEqual(routeBranches, inbound,
  "Worker inbound classification must exactly match the explicit webSocketMessage branches");

const actionBranches = new Set();
for (const match of actionSource.matchAll(/actionStr\s*===\s*"([A-Z][A-Z0-9_]*)"/g)) {
  actionBranches.add(match[1]);
}
for (const match of actionSource.matchAll(/\[([^\]]+)\]\.includes\(String\(actionStr\)\)/g)) {
  for (const token of match[1].matchAll(/"([A-Z][A-Z0-9_]*)"/g)) actionBranches.add(token[1]);
}
for (const action of actionEnum) {
  assert.ok(actionBranches.has(action),
    "NetworkActionType " + action + " must have an explicit Worker ACTION branch");
}
assert.equal(actionBranches.size, actionEnum.length,
  "Worker ACTION branch inventory must not contain undeclared NetworkActionType values");
assert.match(actionSource, /let actionValid\s*=\s*false\s*;/,
  "Unknown/unaccepted actions must remain invalid by default");
assert.match(actionSource, /let actionErrorCode\s*=\s*"INVALID_ACTION"\s*;/,
  "Unknown/unaccepted actions must retain the fail-closed INVALID_ACTION result");

console.log(
  "Phase 10 routing contract: " + inbound.length + " Worker inbound message types, "
  + knownNonInbound.length + " known non-inbound types, " + actionEnum.length
  + " explicit Worker ACTION branches"
);
