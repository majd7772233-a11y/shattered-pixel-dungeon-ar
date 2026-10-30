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
});
