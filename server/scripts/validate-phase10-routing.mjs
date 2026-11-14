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

const androidRouterSource = readRepoFile(
  "core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/MessageRouter.java"
);
const androidRouteStart = androidRouterSource.indexOf("public static void routeMessage(NetworkMessage message)");
const androidRouteEnd = androidRouterSource.indexOf("private static void handlePlayerLeftMessage", androidRouteStart);
assert.ok(androidRouteStart >= 0 && androidRouteEnd > androidRouteStart,
  "Android MessageRouter must expose one inspectable top-level routeMessage switch");
const androidRoute = androidRouterSource.slice(androidRouteStart, androidRouteEnd);
const androidRoutes = [...androidRoute.matchAll(/case\s+([A-Z][A-Z0-9_]*)\s*:/g)].map(match => match[1]);
assert.equal(new Set(androidRoutes).size, androidRoutes.length,
  "Android top-level routing must not contain duplicate message cases");
assert.deepEqual([...androidRoutes].sort(), [...messageEnum].sort(),
  "Every canonical MessageType must have exactly one explicit Android route decision");
assert.ok(!androidRoute.includes("RemotePlayerActionReceiver.handleNetworkMessage"),
  "The Android router must never forward unrelated message types into the legacy Hero receiver");
for (const [type, handler] of [
  ["PLAYER_JOINED", "handlePlayerJoinedMessage"],
  ["PLAYER_LEFT", "handlePlayerLeftMessage"],
  ["READY", "handleReadyMessage"],
  ["PING", "handlePingMessage"]
]) {
  const caseStart = androidRoute.indexOf("case " + type + ":");
  const nextCase = androidRoute.indexOf("\n            case ", caseStart + 1);
  const caseBlock = androidRoute.slice(caseStart, nextCase < 0 ? androidRoute.length : nextCase);
  assert.ok(caseStart >= 0 && caseBlock.includes(handler),
    "Android " + type + " must have its own typed handler");
}
const chatStart = androidRoute.indexOf("case CHAT:");
const chatEnd = androidRoute.indexOf("\n            case ", chatStart + 1);
assert.ok(chatStart >= 0 && androidRoute.slice(chatStart, chatEnd).includes("break;"),
  "CHAT must have an explicit support decision instead of falling through to a Hero parser");
assert.ok(androidRouterSource.includes('applySnapshotPlayerReadiness(root.get("players"))'),
  "A successful room snapshot must restore RemotePlayer readiness metadata");

console.log(
  "Phase 10 routing contract: " + inbound.length + " Worker inbound message types, "
  + knownNonInbound.length + " known non-inbound types, " + actionEnum.length
  + " explicit Worker ACTION branches, and " + androidRoutes.length + " explicit Android MessageType routes"
);
