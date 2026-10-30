import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schemaUrl = new URL("../../protocol/schema.json", import.meta.url);
const schema = JSON.parse(readFileSync(schemaUrl, "utf8"));
const definitions = schema.definitions || {};
const level = definitions.NativeLevelSnapshot;
assert.ok(level && level.properties, "NativeLevelSnapshot must be defined");

const mutation = level.properties.nativeMutationDetails;
assert.ok(mutation && mutation.type === "object", "nativeMutationDetails must be an object");
assert.equal(mutation.additionalProperties, false, "native mutation details must reject undocumented fields");

const properties = mutation.properties || {};
const emittedPhase7Fields = [
  "heapId", "itemId", "itemClass", "expectedQuantity", "stackable", "resultItemId",
  "sourceQuantityBefore", "itemLevel", "cursed", "cursedKnown", "price", "acquiredByInventory",
  "resultHeapId", "expectedEquipped", "heapType", "alchemyEnergyBefore", "alchemyEnergyAfter",
  "ingredients", "resultItemClass", "resultQuantity", "resultStackable", "resultLocation",
  "abilityClass", "armorItemId", "armorClass", "armorChargeBefore", "armorChargeAfter",
  "armorChargeUse", "shopEntityId", "sourceItemId", "soldQuantity", "sourceNativeValue",
  "sourceNativeUnitValue", "sourceItemLevel", "sourceCursed", "sourceCursedKnown",
  "resultItemBundle", "resultNativeValue", "resultNativeUnitValue", "resultItemLevel",
  "resultCursed", "resultCursedKnown", "itemAction", "itemBundle", "buybackItemId",
  "buybackItemClass", "buybackQuantity", "nativeValue", "nativeUnitValue"
];
for (const field of emittedPhase7Fields) {
  assert.ok(Object.hasOwn(properties, field), `nativeMutationDetails is missing emitted field: ${field}`);
}

assert.deepEqual(properties.itemAction.enum, ["DRINK", "EAT", "READ"]);
assert.equal(properties.itemBundle.maxLength, 200000);
assert.equal(properties.buybackItemId.minLength, 8);
assert.equal(properties.buybackItemClass.maxLength, 256);
assert.equal(properties.buybackQuantity.maximum, 100000);
assert.equal(properties.nativeValue.minimum, 0);
assert.equal(properties.nativeUnitValue.minimum, -1);

const actions = new Set(level.properties.nativeMutationAction.enum);
for (const action of ["EQUIP", "UNEQUIP", "BUY", "BUYBACK", "SELL", "USE_ITEM", "ALCHEMY", "USE_ABILITY"]) {
  assert.ok(actions.has(action), `NativeLevelSnapshot does not declare action ${action}`);
}
assert.deepEqual(definitions.NativeUseItemAction.enum, ["DRINK", "EAT", "READ"]);
console.log("Phase 7 native mutation protocol schema: valid");
