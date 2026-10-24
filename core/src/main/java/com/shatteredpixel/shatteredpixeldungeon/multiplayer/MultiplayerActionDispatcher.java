package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.HeroAction;
import com.shatteredpixel.shatteredpixeldungeon.levels.features.LevelTransition;

public class MultiplayerActionDispatcher {

    public static void onHeroPerformAction(HeroAction action) {
        Hero hero = Dungeon.hero;
        onHeroPerformAction(action, hero == null ? 0f : hero.cooldown(),
                hero == null ? "" : SPDLevelSnapshot.currentHeroStateJson(hero));
    }

    /** Called before native act(): delayed world changes are queued until SPD has actually resolved them. */
    public static void onHeroPerformAction(HeroAction action, float cooldownBefore, String heroStateBefore) {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        Hero hero = Dungeon.hero;
        if (!manager.isMultiplayerActive() || action == null || hero == null || Dungeon.level == null) return;

        NetworkActionType actionType = NetworkActionBridge.mapHeroActionToNetworkAction(action);
        int currentPos = hero.pos;
        int currentDepth = Dungeon.depth;
        int targetPos = action.dst;

        if (action instanceof HeroAction.Attack) return;
        if (action instanceof HeroAction.Move) return;
        // The purchase is committed only when WndTradeItem has resolved its native price,
        // inventory merge/full-bag outcome, and stable item IDs.
        if (action instanceof HeroAction.Buy) return;

        if (action instanceof HeroAction.LvlTransition) {
            if (currentPos != targetPos) return; // native SPD still walks to the stair and reports that step.
            LevelTransition transition = Dungeon.level.getTransition(currentPos);
            if (Dungeon.branch != 0 || Dungeon.level.locked || transition == null || !transition.inside(currentPos)
                    || transition.destBranch != 0
                    || !(transition.type == LevelTransition.Type.REGULAR_EXIT
                        || transition.type == LevelTransition.Type.REGULAR_ENTRANCE)
                    || !(transition.destType == LevelTransition.Type.REGULAR_ENTRANCE
                        || transition.destType == LevelTransition.Type.REGULAR_EXIT)) {
                hero.rejectUnsupportedMultiplayerWorldAction();
                return;
            }
            String details = "{\"from\":" + currentPos + ",\"to\":" + currentPos
                    + ",\"stairsPos\":" + currentPos + ",\"depth\":" + currentDepth
                    + ",\"branch\":" + Dungeon.branch + "}";
            manager.markFloorTransitionPending();
            manager.sendAction(NetworkActionType.LVL_TRANSITION, details, heroStateBefore);
            return;
        }

        if (action instanceof HeroAction.Unlock || action instanceof HeroAction.Mine
                || action instanceof HeroAction.Interact || action instanceof HeroAction.OpenChest) {
            if (Dungeon.branch != 0) {
                hero.rejectUnsupportedMultiplayerWorldAction();
                return;
            }
            if (action instanceof HeroAction.Interact) {
                targetPos = ((HeroAction.Interact) action).ch == null ? -1 : ((HeroAction.Interact) action).ch.pos;
            }
            if (targetPos < 0 || Dungeon.level.distance(currentPos, targetPos) > 1) return;
            if (action instanceof HeroAction.OpenChest) {
                com.shatteredpixel.shatteredpixeldungeon.items.Heap chest = Dungeon.level.heaps.get(targetPos);
                if (chest == null || !(chest.type == com.shatteredpixel.shatteredpixeldungeon.items.Heap.Type.CHEST
                        || chest.type == com.shatteredpixel.shatteredpixeldungeon.items.Heap.Type.LOCKED_CHEST
                        || chest.type == com.shatteredpixel.shatteredpixeldungeon.items.Heap.Type.CRYSTAL_CHEST)) {
                    hero.rejectUnsupportedMultiplayerWorldAction();
                    return;
                }
                com.badlogic.gdx.utils.Json json = new com.badlogic.gdx.utils.Json();
                String chestDetails = "{\"heapId\":" + json.toJson(chest.multiplayerHeapId())
                        + ",\"heapType\":" + json.toJson(chest.type.name()) + "}";
                hero.queueNativeWorldMutation(actionType.name(), currentPos, targetPos, cooldownBefore, heroStateBefore, chestDetails);
            } else {
                hero.queueNativeWorldMutation(actionType.name(), currentPos, targetPos, cooldownBefore, heroStateBefore);
            }
            return;
        }

        String details;
        if (action instanceof HeroAction.PickUp) {
            // A pickup can first walk; only queue a transaction while standing on the exact heap.
            if (currentPos != targetPos) return;
            if (Dungeon.branch != 0 || Dungeon.level.locked) {
                hero.rejectUnsupportedMultiplayerWorldAction();
                return;
            }
            com.shatteredpixel.shatteredpixeldungeon.items.Heap heap = Dungeon.level.heaps.get(targetPos);
            com.shatteredpixel.shatteredpixeldungeon.items.Item item = heap == null ? null : heap.peek();
            if (item == null) return;
            com.badlogic.gdx.utils.Json json = new com.badlogic.gdx.utils.Json();
            String transactionDetails = "{\"heapId\":" + json.toJson(heap.multiplayerHeapId())
                    + ",\"itemId\":" + json.toJson(item.multiplayerItemId())
                    + ",\"itemClass\":" + json.toJson(item.getClass().getName())
                    + ",\"expectedQuantity\":" + item.quantity()
                    + ",\"stackable\":" + item.stackable + "}";
            details = "{\"from\":" + currentPos + ",\"to\":" + targetPos
                    + ",\"targetPos\":" + targetPos + ",\"itemPos\":" + targetPos
                    + ",\"depth\":" + currentDepth + ",\"heapId\":" + json.toJson(heap.multiplayerHeapId())
                    + ",\"itemId\":" + json.toJson(item.multiplayerItemId())
                    + ",\"itemClass\":" + json.toJson(item.getClass().getName())
                    + ",\"expectedQuantity\":" + item.quantity()
                    + ",\"stackable\":" + item.stackable + "}";
            hero.queueNativeWorldMutation("PICKUP", currentPos, targetPos, cooldownBefore, heroStateBefore, transactionDetails);
            return;
        } else {
            details = "{\"from\":" + currentPos + ",\"to\":" + targetPos
                    + ",\"targetPos\":" + targetPos + ",\"depth\":" + currentDepth + "}";
        }
        manager.sendAction(actionType, details, heroStateBefore);
    }

    /** Submits SPD's native Chasm fall path without pretending the Hero walked into the pit cell. */
    public static boolean onNativePitFall(int pitPos) {
        Hero hero = Dungeon.hero;
        MultiplayerManager manager = MultiplayerManager.getInstance();
        if (!manager.isMultiplayerActive() || hero == null || Dungeon.level == null || Dungeon.branch != 0
                || Dungeon.level.locked || pitPos < 0 || pitPos >= Dungeon.level.length()
                || !Dungeon.level.adjacent(hero.pos, pitPos)
                || !Dungeon.level.pit[pitPos] || Dungeon.level.solid[pitPos]) return false;

        int sourcePos = hero.pos;
        String details = "{\"transitionKind\":\"FALL\",\"from\":" + sourcePos
                + ",\"to\":" + sourcePos + ",\"stairsPos\":" + sourcePos
                + ",\"pitPos\":" + pitPos + ",\"depth\":" + Dungeon.depth
                + ",\"branch\":" + Dungeon.branch + "}";
        manager.markFloorTransitionPending();
        String requestId = manager.sendAction(NetworkActionType.LVL_TRANSITION, details,
                SPDLevelSnapshot.currentHeroStateJson(hero));
        if (requestId == null) {
            manager.markFloorTransitionComplete();
            return false;
        }
        return true;
    }

    /** Reports one cell actually entered by SPD, including its native environment effects. */
    public static void onNativeMovementStep(int from, int to, float nativeActionCost, String heroStateBefore) {
        Hero hero = Dungeon.hero;
        MultiplayerManager manager = MultiplayerManager.getInstance();
        if (!manager.isMultiplayerActive() || hero == null || Dungeon.level == null || Dungeon.branch != 0
                || heroStateBefore == null || from < 0 || to < 0 || from >= Dungeon.level.length()
                || to >= Dungeon.level.length() || from == to) return;
        float cost = Math.max(0f, Math.min(10f, nativeActionCost));
        String details = "{\"from\":" + from + ",\"to\":" + to + ",\"depth\":" + Dungeon.depth
                + ",\"branch\":" + Dungeon.branch + ",\"engineActionCost\":" + cost + "}";
        String requestId = manager.sendAction(NetworkActionType.MOVE, details, heroStateBefore);
        if (requestId != null) manager.publishNativeWorldMutation(requestId, "MOVE", from, to);
    }
}
