import { describe, expect, it } from "vitest";
import { isValidNativePickupIntent } from "./index";

describe("Native pickup status side-effect policy", () => {
  it("requires trusted talent state when a Ring can trigger native identification", () => {
    const ringClass = "com.shatteredpixel.shatteredpixeldungeon.items.rings.RingOfMight";
    const ringId = "stable-ring-pickup-001";
    const bundle = JSON.stringify({ item: { __className: ringClass, multiplayer_item_id: ringId, quantity: 1 } });
    const level = { depth: 4, branch: 0, locked: false, heaps: [{
      heapId: "stable-ring-heap-001", pos: 9, type: "HEAP",
      items: [{ itemId: ringId, className: ringClass, quantity: 1, level: 0,
        cursed: false, cursedKnown: false, stackable: false, serializedBundle: bundle }]
    }] };
    const intent = { from: 9, to: 9, targetPos: 9, itemPos: 9, depth: 4, branch: 0,
      engineActionCost: 1, heapId: "stable-ring-heap-001", itemId: ringId,
      itemClass: ringClass, expectedQuantity: 1, stackable: false, itemBundle: bundle };
    const player = { pos: 9, state: "ALIVE" };
    const talent = ["THIEFS", "INTUITION"].join("_");
    const state = (points: number) => JSON.stringify({ combatBundle: JSON.stringify({
      talents_tier_1: {}, talents_tier_2: { [talent]: points }, talents_tier_3: {}, talents_tier_4: {}
    }) });
    expect(isValidNativePickupIntent(level, intent, 4, "player-001", player, state(1))).toBe(true);
    expect(isValidNativePickupIntent(level, intent, 4, "player-001", player, state(2))).toBe(false);
    expect(isValidNativePickupIntent(level, intent, 4, "player-001", player)).toBe(false);
  });

  it("rejects LostBackpack pickup because it restores several native systems at once", () => {
    const itemClass = "com.shatteredpixel.shatteredpixeldungeon.items.LostBackpack";
    const itemId = "stable-lost-backpack-001";
    const bundle = JSON.stringify({ item: { __className: itemClass, multiplayer_item_id: itemId, quantity: 1 } });
    const level = { depth: 4, branch: 0, locked: false, heaps: [{
      heapId: "stable-lost-backpack-heap", pos: 9, type: "HEAP",
      items: [{ itemId, className: itemClass, quantity: 1, level: 0, cursed: false,
        cursedKnown: false, stackable: false, serializedBundle: bundle }]
    }] };
    const intent = { from: 9, to: 9, targetPos: 9, itemPos: 9, depth: 4, branch: 0,
      engineActionCost: 1, heapId: "stable-lost-backpack-heap", itemId,
      itemClass, expectedQuantity: 1, stackable: false, itemBundle: bundle };
    expect(isValidNativePickupIntent(level, intent, 4, "player-001", { pos: 9, state: "ALIVE" },
      JSON.stringify({ pos: 9, hp: 10, inventoryItemsJson: "[]" }))).toBe(false);
  });

  it("rejects a same-class dart merge while allowing a non-merging pickup", () => {
    const dartClass = "com.shatteredpixel.shatteredpixeldungeon.items.weapon.missiles.darts.HealingDart";
    const otherDartClass = "com.shatteredpixel.shatteredpixeldungeon.items.weapon.missiles.darts.PoisonDart";
    const itemId = "stable-healing-dart-001";
    const bundle = JSON.stringify({ item: { __className: dartClass, multiplayer_item_id: itemId, quantity: 1 } });
    const row = (id: string, className: string) => ({
      itemId: id, className, quantity: 1, level: 0, cursed: false, cursedKnown: false,
      stackable: true, equipped: false,
      serializedBundle: JSON.stringify({ item: { __className: className, multiplayer_item_id: id, quantity: 1 } })
    });
    const level = { depth: 4, branch: 0, locked: false, heaps: [{
      heapId: "stable-healing-dart-heap", pos: 9, type: "HEAP",
      items: [{ ...row(itemId, dartClass), serializedBundle: bundle }]
    }] };
    const intent = { from: 9, to: 9, targetPos: 9, itemPos: 9, depth: 4, branch: 0,
      engineActionCost: 1, heapId: "stable-healing-dart-heap", itemId,
      itemClass: dartClass, expectedQuantity: 1, stackable: true, itemBundle: bundle };
    const player = { pos: 9, state: "ALIVE" };
    const heroState = (items: any[]) => JSON.stringify({ pos: 9, hp: 10, inventoryItemsJson: JSON.stringify(items) });
    expect(isValidNativePickupIntent(level, intent, 4, "player-001", player, heroState([]))).toBe(true);
    expect(isValidNativePickupIntent(level, intent, 4, "player-001", player,
      heroState([row("stable-existing-healing-dart", dartClass)]))).toBe(false);
    expect(isValidNativePickupIntent(level, intent, 4, "player-001", player,
      heroState([row("stable-existing-poison-dart", otherDartClass)]))).toBe(true);
    expect(isValidNativePickupIntent(level, intent, 4, "player-001", player)).toBe(false);
  });
});
