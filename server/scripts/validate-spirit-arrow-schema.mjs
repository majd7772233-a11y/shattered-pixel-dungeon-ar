import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schema = JSON.parse(readFileSync(new URL("../../protocol/schema.json", import.meta.url), "utf8"));
const payload = schema.definitions?.NativeAttackPayload;
assert.ok(payload?.properties, "NativeAttackPayload must be defined");

const mode = payload.properties.attackWeaponMode;
assert.deepEqual(mode.enum, ["EQUIPPED", "THROWN", "ABILITY", "UNARMED", "SPIRIT_ARROW"],
  "NativeAttackPayload must expose the exact supported native weapon modes");

const details = payload.properties.spiritArrow;
assert.ok(details && details.type === "object", "spiritArrow must be a defined object");
assert.equal(details.additionalProperties, false, "spiritArrow metadata must reject undocumented fields");
assert.deepEqual(details.required, [
  "formatVersion", "markBuffId", "markBonus", "targetEntityId", "bowItemId"
]);
assert.deepEqual(Object.keys(details.properties).sort(), [
  "bowItemId", "formatVersion", "markBonus", "markBuffId", "targetEntityId"
].sort());

assert.equal(details.properties.formatVersion.type, "integer");
assert.equal(details.properties.formatVersion.const, 1);
assert.equal(details.properties.markBuffId.type, "integer");
assert.equal(details.properties.markBuffId.minimum, 1);
assert.equal(details.properties.markBuffId.maximum, 2147483647);
assert.equal(details.properties.markBonus.type, "number");
assert.equal(details.properties.markBonus.minimum, 0);
assert.equal(details.properties.markBonus.maximum, 1);
for (const field of ["targetEntityId", "bowItemId"]) {
  assert.equal(details.properties[field].type, "string");
  assert.equal(details.properties[field].minLength, 8);
  assert.equal(details.properties[field].maxLength, 80);
  assert.equal(details.properties[field].pattern, "^[A-Za-z0-9._:-]{8,80}$");
}

const modeCondition = payload.allOf.find(rule =>
  rule.if?.properties?.attackWeaponMode?.const === "SPIRIT_ARROW");
assert.ok(modeCondition, "SPIRIT_ARROW must have a conditional payload contract");
assert.deepEqual(modeCondition.then.required, ["spiritArrow", "engineRanged"]);
assert.equal(modeCondition.then.properties.targetType.const, "MOB");
assert.equal(modeCondition.then.properties.attackKind.const, "RANGED");
assert.equal(modeCondition.then.properties.engineRanged.const, true);
assert.equal(modeCondition.then.properties.attackWeaponBundle.minLength, 2);
assert.deepEqual(modeCondition.then.not.required, ["projectileMutation"]);
assert.deepEqual(modeCondition.else.not.required, ["spiritArrow"]);

console.log("SpiritArrow native attack protocol schema: valid");
