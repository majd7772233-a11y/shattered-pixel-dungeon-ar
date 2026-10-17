package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

/** Keeps native combat outcome publication explicit and independently testable. */
public final class NativeCombatAuthorityPolicy {
    private NativeCombatAuthorityPolicy() {}

    public static boolean shouldPublishAttackOutcome(
            boolean multiplayerActive,
            boolean localPlayerAttacker,
            boolean authoritySimulation,
            boolean targetIsMob,
            boolean targetIsRemotePlayer,
            boolean targetIsLocalPlayer) {
        if (!multiplayerActive || (!localPlayerAttacker && !authoritySimulation)) return false;
        return targetIsMob || targetIsRemotePlayer || (authoritySimulation && targetIsLocalPlayer);
    }
}
