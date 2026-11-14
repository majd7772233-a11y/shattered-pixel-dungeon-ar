import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const readRepoFile = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");
const schema = JSON.parse(readRepoFile("protocol/schema.json"));
const contracts = JSON.parse(readRepoFile("protocol/action-data-contracts.json"));
const parseJavaEnum = (source, enumName) => {
  const start = source.indexOf("enum " + enumName);
  assert.ok(start >= 0, "Java enum " + enumName + " must exist");
  const open = source.indexOf("{", start), close = source.indexOf("}", open + 1);
  assert.ok(open >= 0 && close > open, "Java enum " + enumName + " must have a body");
  return source.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "").split(",").map(value => value.trim()).filter(Boolean);
};
const actionEnum = parseJavaEnum(readRepoFile(
  "core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/NetworkActionType.java"
), "NetworkActionType");
assert.deepEqual(schema.definitions.NetworkActionType.enum, actionEnum);
assert.deepEqual(contracts.actions.map(item => item.action), actionEnum);
assert.equal(new Set(contracts.actions.map(item => item.action)).size, contracts.actions.length);
const envelope = schema.definitions.NativeActionEnvelope;
assert.ok(envelope && envelope.type === "object");
assert.deepEqual(envelope.required, ["action", "data", "heroStateJson"]);
assert.equal(envelope.properties.action.$ref, "#/definitions/NetworkActionType");
assert.equal(envelope.properties.data.type, "object");
assert.equal(envelope.properties.heroStateJson.type, "string");
assert.equal(envelope.additionalProperties, false);
assert.equal(schema.properties.payloadJson.type, "string");
const manager = readRepoFile(
  "core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/MultiplayerManager.java"
);
assert.match(manager, /message\.messageType\s*=\s*MessageType\.ACTION/);
for (const key of ["action", "data", "heroStateJson"]) {
  assert.ok(new RegExp("\\\\?\"" + key + "\\\\?\"").test(manager),
    "MultiplayerManager must serialize ACTION wrapper field " + key);
}
assert.match(manager, /sendAuthorityAction[\s\S]*?MessageType\.ACTION/);
const workerSources = [
  "server/src/match-room/actions.ts",
  "server/src/validators/abilities.ts",
  "server/src/validators/combat-state.ts",
  "server/src/validators/equipment.ts",
  "server/src/validators/floor-transitions.ts",
  "server/src/validators/hero-buffs.ts",
  "server/src/validators/inventory-economy.ts",
  "server/src/validators/item-state.ts",
  "server/src/validators/shop.ts",
  "server/src/validators/world-actions.ts",
  "server/src/validators/world-items.ts"
].map(readRepoFile).join("\n");
let fieldCount = 0;
for (const item of contracts.actions) {
  assert.ok(Array.isArray(item.dataFields) && new Set(item.dataFields).size === item.dataFields.length,
    item.action + " must list unique action data fields");
  assert.ok(item.producerFiles.length > 0 && item.validatorFiles.length > 0,
    item.action + " must identify Java producer and Worker validator evidence");
  for (const producer of item.producerFiles) readRepoFile(producer);
  const validators = item.validatorFiles.map(readRepoFile).join("\n");
  assert.ok(validators.length > 0 && item.workerHandler === "server/src/match-room/actions.ts#handleAction");
  for (const field of item.dataFields) {
    assert.ok(workerSources.includes(field),
      item.action + " field " + field + " must be present in Worker action/validator source");
    fieldCount++;
  }
}
const levelSchema = schema.definitions.NativeLevelSnapshot;
assert.ok(levelSchema && Array.isArray(levelSchema.required));
const levelSource = readRepoFile(
  "core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/SPDLevelSnapshot.java"
);
for (const field of levelSchema.required) {
  assert.ok(new RegExp("\\bpublic\\s+[A-Za-z0-9_<>, ?]+\\s+" + field + "\\s*(?:=|;)").test(levelSource),
    "NativeLevelSnapshot required field " + field + " must be declared by the Java wire model");
}
assert.match(levelSource, /wireJson\.setUsePrototypes\(false\)/);
assert.match(levelSource, /wireJson\.toJson\(out\)/);
assert.match(readRepoFile("server/src/validators/world-state.ts"), /hasCompleteNativeLevelSnapshot/);
console.log("Phase 10 payload contract: " + contracts.actions.length
  + " action envelopes, " + fieldCount + " referenced data fields, "
  + levelSchema.required.length + " required native snapshot fields");
