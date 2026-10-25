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
        private final String beforeState;
        private final String buffClass;
        private final int buffId;
        private final int depth;
        private final int heroPos;
        private final float actorClockBefore;

        private TickCapture(String beforeState, String buffClass, int buffId,
                            int depth, int heroPos, float actorClockBefore) {
            this.beforeState = beforeState;
            this.buffClass = buffClass;
            this.buffId = buffId;
            this.depth = depth;
            this.heroPos = heroPos;
            this.actorClockBefore = actorClockBefore;
        }
    }

    private static boolean supportedBuffClass(String name) {
        return "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Hunger".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.WellFed".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Healing".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Poison".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Barrier".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Haste".equals(name)
                || "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Invisibility".equals(name);
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
        if (!(actor instanceof Buff)) return null;
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
        return new TickCapture(before, buffClass, buff.id(), Dungeon.depth, hero.pos, clock);
    }

    public static void publish(TickCapture capture) {
        if (capture == null) return;
        Hero hero = Dungeon.hero;
        MultiplayerManager manager = MultiplayerManager.getInstance();
        if (hero == null || !manager.isMultiplayerActive() || Dungeon.level == null
                || Dungeon.branch != 0 || Dungeon.level.locked) return;

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
    }
}
