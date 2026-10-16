package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.badlogic.gdx.utils.Json;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Captures native side effects on mobs other than the direct attack target.
 * This deliberately records only combat state; full mob bundles remain owned by level snapshots.
 */
public final class NativeMobCombatDelta {

    private NativeMobCombatDelta() {}

    public static final class State {
        public int actorId;
        public String entityId;
        public int hp;
        public int ht;
        public int pos;
        public int shielding;
        public String buffs;
    }

    public static final class Delta {
        public String entityId;
        public int hpBefore;
        public int htBefore;
        public int posBefore;
        public int shieldBefore;
        public String buffsBefore;
        public int hpAfter;
        public int htAfter;
        public int posAfter;
        public int shieldAfter;
        public String buffsAfter;
    }

    public static final class Payload {
        public boolean complete = true;
        public List<Delta> deltas = new ArrayList<>();
        public String heaps;
    }

    public static Map<Integer, State> capture(Mob excludedTarget) {
        Map<Integer, State> states = new HashMap<>();
        if (Dungeon.level == null || Dungeon.level.mobs == null) return states;
        MultiplayerManager manager = MultiplayerManager.getInstance();
        for (Mob mob : Dungeon.level.mobs.toArray(new Mob[0])) {
            if (mob == null || mob == excludedTarget) continue;
            State state = new State();
            state.actorId = mob.id();
            state.entityId = manager.getServerEntityId(mob.id());
            state.hp = mob.HP;
            state.ht = mob.HT;
            state.pos = mob.pos;
            state.shielding = mob.shielding();
            state.buffs = SPDLevelSnapshot.currentCombatBuffsJson(mob);
            states.put(state.actorId, state);
        }
        return states;
    }

    public static String changedSince(Map<Integer, State> before, Mob excludedTarget) {
        Payload payload = new Payload();
        Map<Integer, State> after = capture(excludedTarget);
        for (Map.Entry<Integer, State> entry : before.entrySet()) {
            State oldState = entry.getValue();
            State newState = after.get(entry.getKey());
            if (newState == null) {
                // A secondary mob disappearing from the local level must be reconciled by a
                // full snapshot; never silently omit a native death/removal.
                payload.complete = false;
                continue;
            }
            if (sameCombatState(oldState, newState)) continue;
            if (oldState.entityId == null || oldState.entityId.length() < 8
                    || !oldState.entityId.equals(newState.entityId)) {
                payload.complete = false;
                continue;
            }
            Delta delta = new Delta();
            delta.entityId = oldState.entityId;
            delta.hpBefore = oldState.hp;
            delta.htBefore = oldState.ht;
            delta.posBefore = oldState.pos;
            delta.shieldBefore = oldState.shielding;
            delta.buffsBefore = oldState.buffs;
            delta.hpAfter = newState.hp;
            delta.htAfter = newState.ht;
            delta.posAfter = newState.pos;
            delta.shieldAfter = newState.shielding;
            delta.buffsAfter = newState.buffs;
            payload.deltas.add(delta);
        }
        // New mobs created by an attack-side proc cannot be safely assigned by an attacker
        // without a server snapshot. Request reconciliation rather than fabricating identities.
        for (Integer actorId : after.keySet()) {
            if (!before.containsKey(actorId)) payload.complete = false;
        }
        if (!payload.deltas.isEmpty()) {
            boolean secondaryDeath = false;
            for (Delta delta : payload.deltas) if (delta.hpAfter <= 0) secondaryDeath = true;
            if (secondaryDeath) payload.heaps = SPDLevelSnapshot.currentHeapsJson();
        }
        return new Json().toJson(payload);
    }

    private static boolean sameCombatState(State a, State b) {
        return a.hp == b.hp && a.ht == b.ht && a.pos == b.pos
                && a.shielding == b.shielding && safeEquals(a.buffs, b.buffs);
    }

    private static boolean safeEquals(String a, String b) {
        return a == null ? b == null : a.equals(b);
    }
}
