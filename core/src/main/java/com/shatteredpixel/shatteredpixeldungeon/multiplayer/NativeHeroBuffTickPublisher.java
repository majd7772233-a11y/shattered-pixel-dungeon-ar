package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.badlogic.gdx.utils.Json;
import com.badlogic.gdx.utils.JsonReader;
import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Buff;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;

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
        private final String buffClass;
        private final int buffId;
        private final int depth;
        private final int heroPos;

        private TickCapture(Hero hero, String beforeState, String buffClass, int buffId,
                            int depth, int heroPos, float actorClockBefore) {
            this.hero = hero;
            this.beforeState = beforeState;
            this.buffClass = buffClass;
            this.buffId = buffId;
            this.depth = depth;
            this.heroPos = heroPos;
            this.actorClockBefore = actorClockBefore;
        }
    }

    private static TickCapture activeCapture;

    private static boolean supportedBuffClass(String name) {
        return "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Hunger".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.WellFed".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Healing".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Poison".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Barrier".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Haste".equals(name)
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
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Drowsy".equals(name);
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
                || Dungeon.branch != 0 || Dungeon.level.locked) return null;
        String buffClass = buff.getClass().getName();
        if (!supportedBuffClass(buffClass)) return null;

        String before = SPDLevelSnapshot.currentHeroStateJson(hero);
        if (before == null || before.length() < 2) return null;
        float clock = actorClock(before);
        if (!Float.isFinite(clock)) {
            manager.requestResync(manager.getLastSequence());
            return null;
        }
        activeCapture = new TickCapture(hero, before, buffClass, buff.id(), Dungeon.depth, hero.pos, clock);
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
                || Dungeon.branch != 0 || Dungeon.level.locked) return;
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
        data.put("heroStateBeforeJson", capture.beforeState);

        String requestId = manager.sendAction(NetworkActionType.SYNC_HERO_STATE,
                new Json().toJson(data), after);
        if (requestId == null || requestId.isEmpty()) {
            manager.requestResync(manager.getLastSequence());
        }
        } finally {
            if (activeCapture == capture) activeCapture = null;
        }
    }
}
