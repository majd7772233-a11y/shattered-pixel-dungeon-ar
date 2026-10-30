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
const expectedTypes = {
  sourceTerrain: "integer",
  heapId: "string",
  itemId: "string",
  itemClass: "string",
  expectedQuantity: "integer",
  stackable: "boolean",
  resultItemId: "string",
  sourceQuantityBefore: "integer",
  itemLevel: "integer",
  cursed: "boolean",
  cursedKnown: "boolean",
  price: "integer",
  acquiredByInventory: "boolean",
  resultHeapId: "string",
  expectedEquipped: "boolean",
  heapType: "string",
  alchemyEnergyBefore: "integer",
  alchemyEnergyAfter: "integer",
  ingredients: "array",
  resultItemClass: "string",
  resultQuantity: "integer",
  resultStackable: "boolean",
  resultLocation: "string",
  abilityClass: "string",
  armorItemId: "string",
  armorClass: "string",
  armorChargeBefore: "number",
  armorChargeAfter: "number",
  armorChargeUse: "number",
  shopEntityId: "string",
  sourceItemId: "string",
  soldQuantity: "integer",
  sourceNativeValue: "integer",
  sourceNativeUnitValue: "integer",
  sourceItemLevel: "integer",
  sourceCursed: "boolean",
  sourceCursedKnown: "boolean",
  resultItemBundle: "string",
  resultNativeValue: "integer",
  resultNativeUnitValue: "integer",
  resultItemLevel: "integer",
  resultCursed: "boolean",
  resultCursedKnown: "boolean",
  itemAction: "string",
  itemBundle: "string",
  buybackItemId: "string",
  buybackItemClass: "string",
  buybackQuantity: "integer",
  nativeValue: "integer",
  nativeUnitValue: "integer"
};

for (const [field, expectedType] of Object.entries(expectedTypes)) {
  assert.ok(Object.hasOwn(properties, field), `nativeMutationDetails is missing emitted field: ${field}`);
  assert.equal(properties[field].type, expectedType, `nativeMutationDetails.${field} has the wrong schema type`);
}

const boundedString = (field, minLength, maxLength) => {
  assert.equal(properties[field].minLength, minLength, `nativeMutationDetails.${field}.minLength`);
  assert.equal(properties[field].maxLength, maxLength, `nativeMutationDetails.${field}.maxLength`);
};
const boundedInteger = (field, minimum, maximum) => {
  assert.equal(properties[field].minimum, minimum, `nativeMutationDetails.${field}.minimum`);
  assert.equal(properties[field].maximum, maximum, `nativeMutationDetails.${field}.maximum`);
};

boundedString("heapId", 8, 80);
boundedString("itemId", 8, 80);
boundedString("itemClass", 1, 256);
boundedString("resultItemId", 8, 80);
boundedString("resultHeapId", 0, 80);
boundedString("itemBundle", 1, 200000);
boundedString("buybackItemId", 8, 80);
boundedString("buybackItemClass", 1, 256);
boundedInteger("expectedQuantity", 1, 100000);
boundedInteger("sourceQuantityBefore", 1, 100000);
boundedInteger("buybackQuantity", 1, 100000);
boundedInteger("price", 0, 10000000);
boundedInteger("nativeValue", 0, 10000000);
boundedInteger("nativeUnitValue", -1, 10000000);
assert.deepEqual(properties.itemAction.enum, ["DRINK", "EAT", "READ"]);
assert.deepEqual(properties.resultLocation.enum, ["INVENTORY", "HEAP"]);
assert.deepEqual(properties.heapType.enum, ["CHEST", "LOCKED_CHEST", "CRYSTAL_CHEST"]);
assert.equal(properties.ingredients.minItems, 1);
assert.equal(properties.ingredients.maxItems, 3);
assert.equal(properties.ingredients.items.additionalProperties, false);
assert.deepEqual(properties.ingredients.items.required, [
  "itemId", "itemClass", "sourceQuantityBefore", "consumedQuantity", "stackable"
]);

const expectedActions = [
  "MOVE", "UNLOCK", "MINE", "INTERACT", "OPEN_CHEST", "PICKUP", "DROP",
  "EQUIP", "UNEQUIP", "BUY", "BUYBACK", "SELL", "USE_ITEM", "THROW",
  "ALCHEMY", "USE_ABILITY"
];
assert.deepEqual(level.properties.nativeMutationAction.enum, expectedActions);
assert.deepEqual(definitions.NativeUseItemAction.enum, ["DRINK", "EAT", "READ"]);
console.log("Phase 7 native mutation protocol schema: valid");
