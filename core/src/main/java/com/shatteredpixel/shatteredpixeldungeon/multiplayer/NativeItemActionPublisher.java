package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.badlogic.gdx.utils.Json;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;

/**
 * Publishes synchronous native DRINK/EAT item uses only after SPD has completed them.
 * Targeted or asynchronous effects must publish from their actual native callback instead.
 */
public final class NativeItemActionPublisher {
    private NativeItemActionPublisher() {}

    public static void execute(Hero hero, Item item, String action, Runnable nativeAction) {
        if (nativeAction == null) return;
        boolean consumeAction = "DRINK".equals(action) || "EAT".equals(action);
        MultiplayerManager manager = MultiplayerManager.getInstance();
        boolean multiplayerHero = hero != null && hero == Dungeon.hero && manager.isMultiplayerActive();
        if (!consumeAction || !multiplayerHero) {
            nativeAction.run();
            return;
        }
        if (Dungeon.level == null || Dungeon.branch != 0 || Dungeon.level.locked) {
            hero.rejectUnsupportedMultiplayerWorldAction();
            return;
        }
        if (item == null || !hero.belongings.contains(item)) return;

        String itemId = item.multiplayerItemId();
        String itemClass = item.getClass().getName();
        int quantityBefore = item.quantity();
        int depthBefore = Dungeon.depth;
        int posBefore = hero.pos;
        float cooldownBefore = hero.cooldown();
        String heroStateBefore = SPDLevelSnapshot.currentHeroStateJson(hero);
        nativeAction.run();

        if (heroStateBefore == null || Dungeon.level == null || Dungeon.depth != depthBefore
                || Dungeon.branch != 0 || hero.pos != posBefore) {
            if (Dungeon.level != null) manager.requestResync(manager.getLastSequence());
            return;
        }

        int quantityAfter = 0;
        for (Item owned : hero.belongings.getAllItems(Item.class)) {
            if (owned != null && itemId.equals(owned.multiplayerItemId())) {
                quantityAfter = owned.quantity();
                break;
            }
        }
        if (quantityBefore - quantityAfter != 1) return;

        Json json = new Json();
        String details = "{\"itemId\":" + json.toJson(itemId)
                + ",\"itemClass\":" + json.toJson(itemClass)
                + ",\"itemAction\":" + json.toJson(action)
                + ",\"expectedQuantity\":1"
                + ",\"sourceQuantityBefore\":" + quantityBefore
                + ",\"stackable\":" + item.stackable + "}";
        hero.queueNativeWorldMutation("USE_ITEM", posBefore, posBefore, cooldownBefore, heroStateBefore, details);
        hero.publishPendingNativeWorldMutation();
    }
}
