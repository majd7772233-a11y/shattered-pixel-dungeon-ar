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
assert.equal(envelope.oneOf.length, actionEnum.length);
assert.equal(schema.properties.payloadJson.type, "string");

const managerPath = "core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/MultiplayerManager.java";
const manager = readRepoFile(managerPath);
assert.match(manager, /\b[A-Za-z_$][\w$]*\.messageType\s*=\s*MessageType\.ACTION/);
for (const key of ["action", "data", "heroStateJson"]) {
  assert.ok(new RegExp("\\\\?\"" + key + "\\\\?\"").test(manager),
    "MultiplayerManager must serialize ACTION wrapper field " + key);
}
assert.match(manager, /sendAuthorityAction[\s\S]*?MessageType\.ACTION/);
assert.equal(contracts.envelope.serializer, managerPath + "#sendAction");

const actionFile = "server/src/match-room/actions.ts";
const actionHandler = readRepoFile(actionFile);
const bridge = readRepoFile(
  "core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/NetworkActionBridge.java"
);
const heroAction = readRepoFile(
  "core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/actors/hero/HeroAction.java"
);
let fieldCount = 0, producerFieldCount = 0, derivedFieldCount = 0;
const seenSchemaDefinitions = new Set();
for (let index = 0; index < contracts.actions.length; index++) {
  const item = contracts.actions[index];
  assert.ok(Array.isArray(item.dataFields) && new Set(item.dataFields).size === item.dataFields.length);
  assert.equal(item.workerHandler, actionFile + "#handleAction");
  const actionSource = [actionHandler, ...item.validatorFiles.map(readRepoFile)].join("\n");
  for (const field of item.dataFields) {
    assert.ok(actionSource.includes(field),
      item.action + " field " + field + " must exist in its own Worker handler/validator sources");
    fieldCount++;
  }
  const dataName = "NativeActionData_" + item.action;
  const dataSchema = schema.definitions[dataName];
  assert.ok(dataSchema && dataSchema.type === "object", item.action + " schema data definition is required");
  assert.deepEqual(Object.keys(dataSchema.properties || {}).sort(), [...item.dataFields].sort(),
    item.action + " schema fields must match its Worker field inventory");
  assert.equal(dataSchema.additionalProperties, true);
  seenSchemaDefinitions.add(dataName);
  const route = envelope.oneOf[index];
  assert.equal(route.properties.action.const, item.action);
  assert.equal(route.properties.data.$ref, "#/definitions/" + dataName);
  assert.ok(route.required.includes("action") && route.required.includes("data"));
  assert.equal(item.envelopeSerializer, managerPath);
  assert.ok(Array.isArray(item.nativeProducerFiles));
  assert.ok(Array.isArray(item.javaSourceReferencedFields) && Array.isArray(item.workerOnlyFields));
  assert.deepEqual(
    [...item.javaSourceReferencedFields, ...item.workerOnlyFields].sort(),
    [...item.dataFields].sort(),
    item.action + " must classify every Worker field as Java-source-referenced or Worker-derived"
  );
  let producerSource = "";
  for (const path of item.nativeProducerFiles) producerSource += "\n" + readRepoFile(path);
  for (const field of item.javaSourceReferencedFields) {
    assert.ok(producerSource.includes(field),
      item.action + " native producer field " + field + " must exist in its Java producer sources");
    producerFieldCount++;
  }
  for (const field of item.workerOnlyFields) {
    assert.ok(!producerSource.includes(field),
      item.action + " Worker-derived field " + field + " must not be claimed as Java-source-referenced");
    derivedFieldCount++;
  }
  if (item.nativeProducerStatus === "implemented") {
    assert.ok(item.nativeProducerFiles.length > 0);
  } else {
    assert.equal(item.nativeProducerStatus, "not_emitted_by_android");
    assert.equal(item.nativeProducerFiles.length, 0);
    assert.equal(item.javaSourceReferencedFields.length, 0);
    assert.ok(item.nativeProducerNote.length > 20);
    assert.ok(!bridge.includes("NetworkActionType." + item.action));
  }
}
assert.equal(seenSchemaDefinitions.size, actionEnum.length);
assert.ok(!/class\s+Wait\b/.test(heroAction),
  "HeroAction has no native Wait class; Worker WAIT remains declared but not emitted by Android");

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
console.log("Phase 10 payload contract: " + contracts.actions.length + " action envelopes, "
  + fieldCount + " per-action Worker field names (" + producerFieldCount + " referenced in Java producer source, "
  + derivedFieldCount + " Worker-only), " + levelSchema.required.length
  + " required native snapshot fields; "
  + contracts.actions.filter(a => a.nativeProducerStatus === "not_emitted_by_android").length
  + " declared actions explicitly remain non-emitted by Android");
