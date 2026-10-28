package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.badlogic.gdx.utils.Json;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;

/**
 * Bridges supported simple consumables to one action-bound native inventory transaction.
 * It never computes effects itself; the original engine remains the gameplay authority.
 */
public final class NativeItemUse {
    private static final Context BLOCKED = new Context();
    private NativeItemUse() {}

    public static final class Context {
        private final boolean blocked;
        private final Hero hero;
        private final int depth, branch, pos;
        private final float cooldownBefore;
        private final String heroStateBefore, itemId, itemClass, itemAction;
        private final int sourceQuantityBefore;
        private final boolean stackable;

        private Context() {
            blocked = true; hero = null; depth = -1; branch = -1; pos = -1;
            cooldownBefore = 0f; heroStateBefore = null; itemId = null; itemClass = null;
            itemAction = null; sourceQuantityBefore = 0; stackable = false;
        }

        private Context(Hero hero, Item item, String itemAction, String heroStateBefore) {
            blocked = false; this.hero = hero; depth = Dungeon.depth; branch = Dungeon.branch;
            pos = hero.pos; cooldownBefore = hero.cooldown(); this.heroStateBefore = heroStateBefore;
            itemId = item.multiplayerItemId(); itemClass = item.getClass().getName();
            this.itemAction = itemAction; sourceQuantityBefore = item.quantity(); stackable = item.stackable;
        }
    }

    public static boolean isLocalMultiplayerHero(Hero hero) {
        return hero != null && hero == Dungeon.hero && MultiplayerManager.getInstance().isMultiplayerActive();
    }

    public static boolean isSupportedAction(Item item, String action) {
        if (item == null || action == null) return false;
        String cls = item.getClass().getName();
        if ("DRINK".equals(action)) {
            return cls.equals("com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHealing")
                || cls.equals("com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHaste")
                || cls.equals("com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfInvisibility")
                || cls.equals("com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfLevitation")
                || cls.equals("com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfStrength")
                || cls.equals("com.shatteredpixel.shatteredpixeldungeon.items.potions.exotic.PotionOfShielding");
        }
        if ("EAT".equals(action)) {
            return cls.equals("com.shatteredpixel.shatteredpixeldungeon.items.food.Food")
                || cls.equals("com.shatteredpixel.shatteredpixeldungeon.items.food.SmallRation")
                || cls.equals("com.shatteredpixel.shatteredpixeldungeon.items.food.StewedMeat")
                || cls.equals("com.shatteredpixel.shatteredpixeldungeon.items.food.ChargrilledMeat")
                || cls.equals("com.shatteredpixel.shatteredpixeldungeon.items.food.MeatPie");
        }
        return false;
    }

    /** Reject unsupported use before any local-only item effect can be applied. */
    public static boolean rejectIfUnsupported(Hero hero, Item item, String action) {
        if (!isLocalMultiplayerHero(hero)) return false;
        if (!isSupportedAction(item, action) || Dungeon.level == null || Dungeon.branch != 0 || Dungeon.level.locked) {
            hero.rejectUnsupportedMultiplayerWorldAction();
            return true;
        }
        return false;
    }

    /** Captures native pre-state immediately before the original engine consumes the item. */
    public static Context begin(Hero hero, Item item, String action) {
        if (!isLocalMultiplayerHero(hero)) return null;
        if (rejectIfUnsupported(hero, item, action)) return BLOCKED;
        if (item.quantity() < 1 || !hero.belongings.getAllItems(Item.class).contains(item)) {
            hero.rejectUnsupportedMultiplayerWorldAction();
            return BLOCKED;
        }
        String before = SPDLevelSnapshot.currentHeroStateJson(hero);
        if (before == null || before.isEmpty()) {
            MultiplayerManager.getInstance().requestResync(MultiplayerManager.getInstance().getLastSequence());
            hero.rejectUnsupportedMultiplayerWorldAction();
            return BLOCKED;
        }
        return new Context(hero, item, action, before);
    }

    public static boolean isBlocked(Context context) {
        return context != null && context.blocked;
    }

    /** Publishes one transaction only after inventory, native effects and cooldown have resolved. */
    public static void finish(Context context) {
        if (context == null || context.blocked) return;
        MultiplayerManager manager = MultiplayerManager.getInstance();
        Hero hero = context.hero;
        if (!manager.isMultiplayerActive()) return;
        if (hero != Dungeon.hero || Dungeon.level == null || Dungeon.depth != context.depth
                || Dungeon.branch != context.branch || Dungeon.branch != 0 || Dungeon.level.locked
                || hero.pos != context.pos) {
            manager.requestResync(manager.getLastSequence());
            return;
        }
        Json json = new Json();
        String details = "{\"itemId\":" + json.toJson(context.itemId)
            + ",\"itemClass\":" + json.toJson(context.itemClass)
            + ",\"itemAction\":" + json.toJson(context.itemAction)
            + ",\"expectedQuantity\":1"
            + ",\"sourceQuantityBefore\":" + context.sourceQuantityBefore
            + ",\"stackable\":" + context.stackable + "}";
        hero.queueNativeWorldMutation(NetworkActionType.USE_ITEM.name(), context.pos, context.pos,
            context.cooldownBefore, context.heroStateBefore, details);
        hero.publishPendingNativeWorldMutation();
    }
}
