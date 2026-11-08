package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.badlogic.gdx.utils.Json;
import com.badlogic.gdx.utils.JsonReader;
import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Buff;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.items.wands.Wand;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Correlates one native Hero-targeted Buff.act() with its complete pre/post Hero state.
 * The server accepts only buff classes with a strict native tick validator.
 */
public final class NativeHeroBuffTickPublisher {

    private NativeHeroBuffTickPublisher() {
    }

    public static final class TickCapture {
        private final Hero hero;
        private String beforeState;
        private float actorClockBefore;
        private final long sequenceBefore;
        private final String buffClass;
        private final int buffId;
        private final int depth;
        private final int heroPos;
        private final String wandItemId;
        private final Map<Integer, NativeMobCombatDelta.State> secondaryMobStateBefore;

        private TickCapture(Hero hero, String beforeState, String buffClass, int buffId,
                            int depth, int heroPos, float actorClockBefore, long sequenceBefore,
                            String wandItemId,
                            Map<Integer, NativeMobCombatDelta.State> secondaryMobStateBefore) {
            this.hero = hero;
            this.beforeState = beforeState;
            this.buffClass = buffClass;
            this.buffId = buffId;
            this.depth = depth;
            this.heroPos = heroPos;
            this.actorClockBefore = actorClockBefore;
            this.sequenceBefore = sequenceBefore;
            this.wandItemId = wandItemId == null ? "" : wandItemId;
            this.secondaryMobStateBefore = secondaryMobStateBefore == null
                    ? java.util.Collections.emptyMap() : secondaryMobStateBefore;
        }
    }

    private static final String NATIVE_POISON =
            "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Poison";

    private static TickCapture activeCapture;

    private static boolean supportedBuffClass(String name) {
        return "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Hunger".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.WellFed".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Healing".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Poison".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Barrier".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Haste".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Foresight".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Invulnerability".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.FrostImbue".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Invisibility".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Chill".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Cripple".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Slow".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Speed".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Weakness".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Recharging".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Adrenaline".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Bless".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Daze".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Charm".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Terror".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Stamina".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Vertigo".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.BlobImmunity".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.HeroDisguise".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Hex".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Sleep".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Vulnerable".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Drowsy".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Dread".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.items.wands.Wand$Charger".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.items.weapon.enchantments.Blocking$BlockBuff".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.items.BrokenSeal$WarriorShield".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Berserk".equals(name);
    }

    private static float actorClock(String stateJson) {
        try {
            JsonValue state = new JsonReader().parse(stateJson);
            JsonValue combatValue = state == null ? null : state.get("combatBundle");
            JsonValue cooldownValue = state == null ? null : state.get("cooldown");
            if (combatValue == null || !combatValue.isString() || cooldownValue == null) return Float.NaN;
            JsonValue combat = new JsonReader().parse(combatValue.asString());
            JsonValue timeValue = combat == null ? null : combat.get("time");
            if (timeValue == null) return Float.NaN;
            float clock = timeValue.asFloat() - cooldownValue.asFloat();
            return Float.isFinite(clock) && clock >= 0 ? clock : Float.NaN;
        } catch (RuntimeException ignored) {
            return Float.NaN;
        }
    }

    public static TickCapture capture(Actor actor) {
        if (activeCapture != null || !(actor instanceof Buff)) return null;
        Buff buff = (Buff) actor;
        Hero hero = Dungeon.hero;
        MultiplayerManager manager = MultiplayerManager.getInstance();
        if (hero == null || buff.target != hero || !hero.isAlive()
                || !manager.isMultiplayerActive() || Dungeon.level == null
                || Dungeon.branch != 0) return null;
        String buffClass = buff.getClass().getName();
        if (!supportedBuffClass(buffClass)) return null;

        String wandItemId = "";
        if (buff instanceof Wand.Charger) {
            Wand wand = ((Wand.Charger) buff).wand();
            if (wand == null || hero.belongings == null
                    || !hero.belongings.getAllItems(com.shatteredpixel.shatteredpixeldungeon.items.Item.class).contains(wand)) {
                return null;
            }
            wandItemId = ((Wand.Charger) buff).multiplayerWandItemId();
        }

        String before = SPDLevelSnapshot.currentHeroStateJson(hero);
        if (before == null || before.length() < 2) return null;
        float clock = actorClock(before);
        if (!Float.isFinite(clock)) {
            manager.requestResync(manager.getLastSequence());
            return null;
        }
        // Poison may split damage through Char.damage() into one or more LifeLink targets.
        // Capture every shared Mob now; the server later restricts any changed row to an exact
        // LifeLink object ID and accepts it only from the designated level publisher.
        Map<Integer, NativeMobCombatDelta.State> secondaryMobStateBefore =
                NATIVE_POISON.equals(buffClass)
                        ? NativeMobCombatDelta.capture(null) : java.util.Collections.emptyMap();
        activeCapture = new TickCapture(hero, before, buffClass, buff.id(), Dungeon.depth,
                hero.pos, clock, manager.getLastSequence(), wandItemId, secondaryMobStateBefore);
        return activeCapture;
    }

    public static boolean isCapturingPeriodicHeroDamage(Hero hero) {
        TickCapture capture = activeCapture;
        return capture != null && capture.hero == hero
                && ("com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Hunger".equals(capture.buffClass)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Poison".equals(capture.buffClass));
    }

    public static void refreshCaptureBaselineAfterRevive(Hero hero, String revivalRequestId) {
        TickCapture capture = activeCapture;
        if (capture == null || capture.hero != hero || !isCapturingPeriodicHeroDamage(hero)) return;
        if (revivalRequestId == null || revivalRequestId.isEmpty()) {
            capture.beforeState = null;
            MultiplayerManager.getInstance().requestResync(MultiplayerManager.getInstance().getLastSequence());
            return;
        }
        String state = SPDLevelSnapshot.currentHeroStateJson(hero);
        float clock = state == null ? Float.NaN : actorClock(state);
        if (state == null || state.length() < 2 || !Float.isFinite(clock)) {
            capture.beforeState = null;
            MultiplayerManager.getInstance().requestResync(MultiplayerManager.getInstance().getLastSequence());
            return;
        }
        capture.beforeState = state;
        capture.actorClockBefore = clock;
    }

    public static void abort(TickCapture capture) {
        if (capture == null) return;
        if (activeCapture == capture) activeCapture = null;
        MultiplayerManager manager = MultiplayerManager.getInstance();
        if (manager.isMultiplayerActive()) manager.requestResync(manager.getLastSequence());
    }

    public static void publish(TickCapture capture) {
        if (capture == null) return;
        try {
        Hero hero = capture.hero;
        MultiplayerManager manager = MultiplayerManager.getInstance();
        if (hero == null || hero != Dungeon.hero || !hero.isAlive()
                || !manager.isMultiplayerActive() || Dungeon.level == null
                || Dungeon.branch != 0) return;
        if (capture.beforeState == null) {
            manager.requestResync(manager.getLastSequence());
            return;
        }

        String after = SPDLevelSnapshot.currentHeroStateJson(hero);
        if (after == null || after.length() < 2) {
            manager.requestResync(manager.getLastSequence());
            return;
        }
        if (capture.beforeState.equals(after)) return;

        // Death/floor change/fall uses the native transition/death flow, not a scalar buff event.
        if (!hero.isAlive() || Dungeon.depth != capture.depth || hero.pos != capture.heroPos) {
            manager.requestResync(manager.getLastSequence());
            return;
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("sourceType", "BUFF_TICK");
        data.put("buffClass", capture.buffClass);
        data.put("buffId", capture.buffId);
        data.put("actorClockBefore", capture.actorClockBefore);
        data.put("sequenceBefore", capture.sequenceBefore);
        data.put("heroStateBeforeJson", capture.beforeState);
        if (!capture.wandItemId.isEmpty()) data.put("wandItemId", capture.wandItemId);
        String secondaryMobDeltas = NATIVE_POISON.equals(capture.buffClass)
                ? NativeMobCombatDelta.changedSince(capture.secondaryMobStateBefore, null)
                : "{\"complete\":true,\"deltas\":[]}";
        data.put("secondaryMobDeltas", secondaryMobDeltas);

        // Use the same strict plain-JSON Map writer as native combat actions. LibGDX's
        // generic Map serializer can emit runtime type wrappers that the Worker must reject.
        String requestId = manager.sendAction(NetworkActionType.SYNC_HERO_STATE,
                NativeCombatJson.strictWriter().toJson(new HashMap<>(data)), after);
        if (requestId == null || requestId.isEmpty()) {
            manager.requestResync(manager.getLastSequence());
        }
        } finally {
            if (activeCapture == capture) activeCapture = null;
        }
    }
}
