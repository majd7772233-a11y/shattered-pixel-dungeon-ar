import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const readRepoFile = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const schema = JSON.parse(readRepoFile("protocol/schema.json"));

function parseJavaEnum(source, enumName) {
  const declaration = source.match(new RegExp(`\\benum\\s+${enumName}\\s*\\{([\\s\\S]*?)\\}`));
  assert.ok(declaration, `Java enum ${enumName} must exist`);

  const values = declaration[1]
    .replace(/\\/\\*[\\s\\S]*?\\*\\//g, "")
    .replace(/\\/\\/.*$/gm, "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  for (const value of values) {
    assert.match(value, /^[A-Z][A-Z0-9_]*$/, `${enumName} contains a non-canonical value: ${value}`);
  }
  assert.equal(new Set(values).size, values.length, `${enumName} must not contain duplicate values`);
  return values;
}

const messageTypeSource = readRepoFile(
  "core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/MessageType.java"
);
const actionTypeSource = readRepoFile(
  "core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/NetworkActionType.java"
);
const networkMessageSource = readRepoFile(
  "core/src/main/java/com/shatteredpixel/shatteredpixeldungeon/multiplayer/NetworkMessage.java"
);

const javaMessageTypes = parseJavaEnum(messageTypeSource, "MessageType");
const javaActionTypes = parseJavaEnum(actionTypeSource, "NetworkActionType");

assert.deepEqual(
  schema.properties?.messageType?.enum,
  javaMessageTypes,
  "protocol/schema.json messageType enum must exactly match Java MessageType"
);

const actionDefinition = schema.definitions?.NetworkActionType;
assert.ok(actionDefinition && actionDefinition.type === "string",
  "protocol/schema.json must define NetworkActionType as a string enum");
assert.deepEqual(
  actionDefinition.enum,
  javaActionTypes,
  "protocol/schema.json NetworkActionType must exactly match Java NetworkActionType"
);

const nativeMutationActions = schema.definitions?.NativeLevelSnapshot?.properties?.nativeMutationAction?.enum;
assert.ok(Array.isArray(nativeMutationActions),
  "NativeLevelSnapshot.nativeMutationAction must retain its narrower mutation allowlist");
for (const action of nativeMutationActions) {
  assert.ok(javaActionTypes.includes(action),
    `NativeLevelSnapshot.nativeMutationAction contains undeclared NetworkActionType: ${action}`);
}

const version = networkMessageSource.match(/PROTOCOL_VERSION\\s*=\\s*"([^"]+)"/)?.[1];
assert.ok(version, "NetworkMessage.PROTOCOL_VERSION must be a string constant");
assert.equal(schema.version, version, "JSON Schema version must match NetworkMessage.PROTOCOL_VERSION");
assert.equal(schema.properties?.protocolVersion?.default, version,
  "protocolVersion default must match NetworkMessage.PROTOCOL_VERSION");
assert.deepEqual(schema.required, ["protocolVersion", "messageType", "payloadJson"],
  "the canonical envelope must keep its required fields explicit");

console.log(
  `Phase 10 protocol enum contract: ${javaMessageTypes.length} message types, ${javaActionTypes.length} action types, protocol ${version}`
);
