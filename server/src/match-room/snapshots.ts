import type { SessionData } from "../protocol/types";
import { isValidNativeHeroStateJson } from "../validators/combat-state";
import { isValidNativeFallLanding, isValidNativeFallDestinationSnapshot, canFinalizeNativeFloorTransition } from "../validators/floor-transitions";
import { MatchRoomCombat } from "./combat";

export class MatchRoomSnapshots extends MatchRoomCombat {
  protected broadcastCurrentSnapshot(excludePlayerId: string | null = null) {
    const events = this.sql.exec("SELECT sequence,sender_id,event_type,payload FROM events ORDER BY sequence ASC").toArray();
    const connectedPlayerIds = this.connectedPlayerIds();
    const players = this.sql.exec("SELECT player_id,class_name,pos,hp,ht,ready,state FROM players").toArray()
      .filter((player: any) => connectedPlayerIds.has(String(player.player_id))).map((player: any) => {
      const savedHero = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + String(player.player_id)).toArray()[0];
      return { ...player, hero_state_json: savedHero && typeof savedHero.value === "string" ? String(savedHero.value) : "" };
    });
    const liveMobs = this.sql.exec("SELECT mob_id,name,pos,hp,ht FROM mobs WHERE depth = ?", this.currentDepth).toArray();
    const snapshotPayload = {
      sequence: this.currentSequence, seed: this.matchSeed, depth: this.currentDepth, gameMode: this.gameMode,
      players, mobs: liveMobs, events, worldTime: this.worldTime, level: this.getCurrentLevelSnapshot()
    };
    const message = JSON.stringify({ protocolVersion: "1.0.0", messageType: "SNAPSHOT",
      sequence: this.currentSequence, payloadJson: JSON.stringify(snapshotPayload) });
    for (const peer of this.state.getWebSockets()) {
      const peerSession = peer.deserializeAttachment() as SessionData | null;
      if (!peerSession || (excludePlayerId != null && peerSession.playerId === excludePlayerId)) continue;
      peer.send(message);
    }
  }

  protected tryFinalizeLevelTransition() {
    const pendingRow = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray()[0];
    if (!pendingRow) return;
    let pending: any = null;
    try { pending = JSON.parse(String(pendingRow.value)); } catch (_) { return; }
    if (!pending || pending.snapshotReady !== true || pending.fromDepth !== this.currentDepth
        || pending.depth === this.currentDepth || Math.abs(pending.depth - this.currentDepth) !== 1
        || pending.targetBranch !== 0
        || (pending.transitionType === "FALL" && pending.depth !== pending.fromDepth + 1)) return;

    const savedRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", `levelSnapshot:${pending.depth}`).toArray()[0];
    let level: any = null;
    try { level = savedRow ? JSON.parse(String(savedRow.value)) : null; } catch (_) { return; }
    if (!level || level.depth !== pending.depth || level.branch !== 0 || !Array.isArray(level.transitions)) return;

    const isFall = pending.transitionType === "FALL";
    let newPos = -1;
    let destinationValid = false;
    if (isFall) {
      if (!isValidNativeFallDestinationSnapshot(level)) return;
      try {
        const publisherHero = JSON.parse(String(level.heroStateJson));
        newPos = Number(publisherHero.pos);
      } catch (_) { return; }
      destinationValid = isValidNativeFallLanding(level, newPos);
    } else {
      const destination = level.transitions.filter((transition: any) =>
        String(transition?.type) === String(pending.targetType) && Number.isInteger(transition?.pos));
      if (destination.length !== 1) return;
      newPos = Number(destination[0].pos);
      const size = Number(level.width) * Number(level.height);
      const destinationTile = Array.isArray(level.tiles)
        ? level.tiles.find((tile: any) => tile?.pos === newPos) : null;
      destinationValid = newPos >= 0 && newPos < size && !!destinationTile
        && destinationTile.passable === true && destinationTile.solid === false && destinationTile.pit === false;
    }
    if (!destinationValid) return;

    const connected = this.sql.exec("SELECT player_id FROM players WHERE state = 'ALIVE' AND connected = 1").toArray();
    const readyStates: Array<{playerId: string; heroStateJson: string; hero: any}> = [];
    for (const player of connected) {
      const playerId = String(player.player_id);
      const readyRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", `transitionReady:${playerId}`).toArray()[0];
      if (!readyRow || typeof readyRow.value !== "string") return;
      let ready: any = null;
      try { ready = JSON.parse(String(readyRow.value)); } catch (_) { return; }
      if (!ready || ready.depth !== pending.depth || ready.branch !== 0 || Number(ready.seed) !== Number(level.seed)
          || typeof ready.heroStateJson !== "string") return;
      let hero: any = null;
      try { hero = JSON.parse(ready.heroStateJson); } catch (_) { return; }
      if (!hero || hero.pos !== newPos || !Number.isInteger(hero.hp) || hero.hp < 0
          || !Number.isInteger(hero.ht) || hero.ht < 1 || hero.hp > hero.ht
          || !Number.isInteger(hero.shielding) || hero.shielding < 0
          || !isValidNativeHeroStateJson(ready.heroStateJson, {
            hp: hero.hp, ht: hero.ht, pos: hero.pos, shielding: hero.shielding
          })
          || (isFall && !isValidNativeFallLanding(level, hero.pos))) return;
      readyStates.push({ playerId, heroStateJson: ready.heroStateJson, hero });
    }

    // Keep the barrier closed until the shared destination and every connected living player's
    // native Hero state agree on branch, seed, landing cell and serialized progression.
    if (!canFinalizeNativeFloorTransition(this.currentDepth, pending, pending.snapshotReady,
        destinationValid, readyStates.length, connected.length)) return;

    // Commit room depth and all player states together only after the destination is proven ready.
    this.currentDepth = pending.depth;
    this.sql.exec("INSERT INTO room_meta (key,value) VALUES ('depth',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      String(this.currentDepth));
    for (const ready of readyStates) {
      this.sql.exec("UPDATE players SET pos = ?, hp = ?, ht = ?, state = ? WHERE player_id = ?",
        newPos, ready.hero.hp, ready.hero.ht, ready.hero.hp > 0 ? "ALIVE" : "DEAD", ready.playerId);
      this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        `heroState:${ready.playerId}`, ready.heroStateJson);
    }

    this.sql.exec("DELETE FROM room_meta WHERE key = 'transitionPending'");
    this.sql.exec("DELETE FROM room_meta WHERE key LIKE 'transitionReady:%'");
    this.state.storage.deleteAlarm().catch(() => {});
    this.broadcastCurrentSnapshot(null);
  }

  protected getCurrentLevelSnapshot() {
    const level = this.sql.exec(`SELECT depth,width,height,entrance_pos,exit_pos,seed FROM levels WHERE depth = ?`, this.currentDepth).toArray()[0];
    if (!level) return null;
    const saved = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`, `levelSnapshot:${this.currentDepth}`).toArray()[0];
    let original: any = {};
    if (saved && typeof saved.value === "string") {
      try { original = JSON.parse(String(saved.value)); } catch (_) { original = {}; }
    }
    // Hero inventory/buffs belong to an individual player, never to the shared level snapshot.
    const { heroStateJson: _sharedHeroState, ...originalWorld } = original;
    const originalMobs = new Map<number, any>(
      (Array.isArray(original.mobs) ? original.mobs : []).map((mob: any) => [Number(mob.mobId), mob])
    );
    const originalTiles = new Map<number, any>(
      (Array.isArray(original.tiles) ? original.tiles : []).map((tile: any) => [Number(tile.pos), tile])
    );
    const liveMobs = this.sql.exec(`SELECT mob_id,name,pos,hp,ht,str,dmg_max,next_act_at,state FROM mobs WHERE depth = ?`, this.currentDepth).toArray();
    const acceptedTurnRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`, "nativeWorldTurnCounter").toArray()[0];
    const acceptedTurn = Math.max(0, Number.isSafeInteger(Number(acceptedTurnRow?.value))
      ? Number(acceptedTurnRow.value) : 0);
    return {
      ...originalWorld,
      nativeWorldTurnCounter: acceptedTurn,
      depth: Number(level.depth), width: Number(level.width), height: Number(level.height),
      entrancePos: Number(level.entrance_pos), exitPos: Number(level.exit_pos), seed: Number(level.seed),
      tiles: this.sql.exec(`SELECT pos,terrain,passable,solid,pit,los_blocking FROM level_tiles WHERE depth = ? ORDER BY pos`, this.currentDepth).toArray().map((tile: any) => {
        const savedTile = originalTiles.get(Number(tile.pos)) || {};
        return {
          ...savedTile, ...tile,
          pos: Number(tile.pos), terrain: Number(tile.terrain),
          passable: Number(tile.passable) !== 0, solid: Number(tile.solid) !== 0,
          pit: Number(tile.pit) !== 0, losBlocking: Number(tile.los_blocking) !== 0,
          flammable: Boolean(savedTile.flammable), secret: Boolean(savedTile.secret),
          avoid: Boolean(savedTile.avoid), water: Boolean(savedTile.water),
          discoverable: Boolean(savedTile.discoverable), openSpace: Boolean(savedTile.openSpace)
        };
      }),
      transitions: Array.isArray(original.transitions) ? original.transitions :
        this.sql.exec(`SELECT transition_id,pos,type,target_depth FROM level_transitions WHERE depth = ? ORDER BY pos`, this.currentDepth).toArray(),
      mobs: liveMobs.map((mob: any) => {
        const savedMob = originalMobs.get(Number(mob.mob_id)) || {};
        return {
          ...savedMob, ...mob,
          entityId: typeof savedMob.entityId === "string" ? savedMob.entityId : "",
          state: typeof savedMob.state === "string" ? savedMob.state : mob.state,
          defenseSkill: Number(savedMob.defenseSkill) || 0,
          baseSpeed: Number(savedMob.baseSpeed) || 1,
          cooldown: Number(savedMob.cooldown) || 0
        };
      }),
      // Keep every serialized dynamic-world collection in the authoritative resync payload.
      // Omitting these fields made plants and timed blobs disappear after a reconnect.
      heaps: Array.isArray(original.heaps) ? original.heaps : [],
      traps: Array.isArray(original.traps) ? original.traps : [],
      blobs: Array.isArray(original.blobs) ? original.blobs : [],
      plants: Array.isArray(original.plants) ? original.plants : []
    };
  }

  protected checkMatchEndCondition() {
    if (this.gameStatus === "ENDED") return;
    if (this.gameMode === "DEATHMATCH") {
      const topKills = this.sql.exec(`SELECT player_id, kills FROM players ORDER BY kills DESC LIMIT 1`).toArray();
      if (topKills.length > 0 && Number(topKills[0].kills) >= 10) {
        this.gameStatus = "ENDED";
        const winnerId = String(topKills[0].player_id);

        this.currentSequence++;
        const matchEndPayload = {
          reason: "KILL_LIMIT_REACHED",
          winnerId,
          kills: Number(topKills[0].kills)
        };

        this.sql.exec(
          `INSERT INTO events (sequence, sender_id, event_type, payload) VALUES (?, 'SERVER', 'MATCH_END', ?)`,
          this.currentSequence, JSON.stringify(matchEndPayload)
        );

        this.broadcast({
          protocolVersion: "1.0.0",
          messageType: "EVENT_BATCH",
          senderId: "SERVER",
          sequence: this.currentSequence,
          payloadJson: JSON.stringify([{ sequence: this.currentSequence, eventType: "MATCH_END", depth: this.currentDepth, action: matchEndPayload }])
        });
      }
    } else if (this.gameMode === "PVP_ARENA") {
      const playerCount = this.sql.exec(`SELECT COUNT(*) AS total FROM players`).toArray();
      const alivePlayers = this.sql.exec(`SELECT player_id FROM players WHERE state = 'ALIVE'`).toArray();
      if (Number(playerCount[0]?.total || 0) >= 2 && alivePlayers.length === 1) {
        this.gameStatus = "ENDED";
        const winnerId = String(alivePlayers[0].player_id);

        this.currentSequence++;
        const matchEndPayload = {
          reason: "LAST_PLAYER_STANDING",
          winnerId
        };

        this.sql.exec(
          `INSERT INTO events (sequence, sender_id, event_type, payload) VALUES (?, 'SERVER', 'MATCH_END', ?)`,
          this.currentSequence, JSON.stringify(matchEndPayload)
        );

        this.broadcast({
          protocolVersion: "1.0.0",
          messageType: "EVENT_BATCH",
          senderId: "SERVER",
          sequence: this.currentSequence,
          payloadJson: JSON.stringify([{ sequence: this.currentSequence, eventType: "MATCH_END", depth: this.currentDepth, action: matchEndPayload }])
        });
      }
    }
  }
}
