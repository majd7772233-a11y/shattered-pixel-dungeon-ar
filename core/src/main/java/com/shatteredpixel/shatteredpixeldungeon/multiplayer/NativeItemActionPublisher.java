package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.badlogic.gdx.utils.Json;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Talent;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.shatteredpixel.shatteredpixeldungeon.items.food.Food;
import com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHealing;
import com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHaste;
import com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfStrength;
import com.shatteredpixel.shatteredpixeldungeon.items.potions.exotic.PotionOfShielding;
import com.shatteredpixel.shatteredpixeldungeon.items.weapon.missiles.MissileWeapon;

/**
 * Publishes synchronous native consumptions only for item classes whose state changes have
 * a server-side transaction validator. Every other multiplayer action fails closed; it must
 * first acquire its own native callback and action-bound world mutation implementation.
 */
public final class NativeItemActionPublisher {
    private NativeItemActionPublisher() {}

    private static boolean hasUnsupportedMealTalent(Hero hero) {
        return hero.hasTalent(Talent.HEARTY_MEAL)
                || hero.hasTalent(Talent.IRON_STOMACH)
                || hero.hasTalent(Talent.EMPOWERING_MEAL)
                || hero.hasTalent(Talent.ENERGIZING_MEAL)
                || hero.hasTalent(Talent.MYSTICAL_MEAL)
                || hero.hasTalent(Talent.INVIGORATING_MEAL)
                || hero.hasTalent(Talent.STRENGTHENING_MEAL)
                || hero.hasTalent(Talent.FOCUSED_MEAL)
                || hero.hasTalent(Talent.SATIATED_SPELLS)
                || hero.hasTalent(Talent.ENLIGHTENING_MEAL);
    }

    private static boolean supportedSynchronousConsumption(Hero hero, Item item, String action) {
        if (item == null || action == null) return false;
        if ("EAT".equals(action)) {
            return item.getClass() == Food.class && !hasUnsupportedMealTalent(hero);
        }
        if ("DRINK".equals(action)) {
            return item.getClass() == PotionOfHealing.class
                    || item.getClass() == PotionOfHaste.class
                    || item.getClass() == PotionOfStrength.class
                    || item.getClass() == PotionOfShielding.class;
        }
        return false;
    }

    public static boolean execute(Hero hero, Item item, String action, Runnable nativeAction) {
        if (nativeAction == null) return false;
        MultiplayerManager manager = MultiplayerManager.getInstance();
        boolean multiplayerHero = hero != null && hero == Dungeon.hero && manager.isMultiplayerActive();
        if (!multiplayerHero) {
            nativeAction.run();
            return true;
        }
        if (Dungeon.level == null || Dungeon.branch != 0 || Dungeon.level.locked) {
            hero.rejectUnsupportedMultiplayerWorldAction();
            return false;
        }

        // Drop and missile throws already publish from Item's real native callbacks.
        // Do not wrap them as USE_ITEM or allow other throwable classes to consume locally.
        if ("DROP".equals(action)) {
            nativeAction.run();
            return true;
        }
        if ("THROW".equals(action)) {
            if (!(item instanceof MissileWeapon)) {
                hero.rejectUnsupportedMultiplayerWorldAction();
                return false;
            }
            nativeAction.run();
            return true;
        }

        boolean consumeAction = "DRINK".equals(action) || "EAT".equals(action);
        if (!consumeAction || !supportedSynchronousConsumption(hero, item, action)) {
            hero.rejectUnsupportedMultiplayerWorldAction();
            return false;
        }
        if (!hero.belongings.contains(item)) return false;

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
            return false;
        }

        int quantityAfter = 0;
        for (Item owned : hero.belongings.getAllItems(Item.class)) {
            if (owned != null && itemId.equals(owned.multiplayerItemId())) {
                quantityAfter = owned.quantity();
                break;
            }
        }
        if (quantityBefore - quantityAfter != 1) return true;

        Json json = new Json();
        String details = "{\"itemId\":" + json.toJson(itemId)
                + ",\"itemClass\":" + json.toJson(itemClass)
                + ",\"itemAction\":" + json.toJson(action)
                + ",\"expectedQuantity\":1"
                + ",\"sourceQuantityBefore\":" + quantityBefore
                + ",\"stackable\":" + item.stackable + "}";
        hero.queueNativeWorldMutation("USE_ITEM", posBefore, posBefore, cooldownBefore, heroStateBefore, details);
        hero.publishPendingNativeWorldMutation();
        return true;
    }
}
