import type { NetworkMessage, SessionData } from "../protocol/types";
import { NATIVE_ENDURE_ABILITY, isValidNativeAbilityIntent } from "../validators/abilities";
import { isValidNativeWorldTurnSnapshot, isValidNativeHpTransition, isValidNativeDamageAccounting, nativeMobKillRewardIds, areNativeMobRewardClaimsAvailable, isValidNativeCombatRequestId, classifyRequestReplay, isValidNativeAttackIntent, hasMatchingNativeAttackIntent, hasStrictNativeCombatFields, hasStrictNativeSourceMobState, isValidNativeEnvironmentDamage, resolveAuthorizedNativeMobDamageTarget, isValidNativeMobNoEffectOutcome, hasStrictNativeDamageFields, isValidNativeHeroStateJson, mergeNativeHeroState, mergeNativeCombatAttackerState, isValidNativeCombatBuffs, comparableBuffs, isValidNativeMissTransition, hasMatchingNativeMobShieldSnapshot, hasValidBlessedAnkhConsumption, hasValidUnblessedAnkhConsumption, hasMatchingNativeHeroStateSnapshot, nativeBuffSnapshotFromHeroState, hasMatchingNativeHeroBuffSnapshot, hasMatchingNativeBuffSnapshot, hasOnlyNativeLostBackpackAdded, isValidNativeLootSnapshot, isValidNativeMobBundle, isAuthorizedNativeMobOwner, parseAndValidateNativeSecondaryMobDeltas, parseAndValidateNativeLifeLinkMobDeltas, buildNativeLifeLinkMobDamageEvents, removeDeadNativeMobsFromSnapshot, isValidNativeCombatEvent, isValidNativeSpiritArrowAttackIntent } from "../validators/combat-state";
import { assignStableEntityIds, resolveServerMobIdByEntityId } from "../validators/entity-identity";
import { parseNativeQuickslotIndex, isValidNativeEquipmentIntent } from "../validators/equipment";
import { isValidNativeMoveIntent, resolveNativeTransitionIntent, isValidNativeFallDestinationSnapshot, isPendingNativeFloorDestinationSnapshot, canStartNativeFloorTransition, classifyNativeTransitionRejection } from "../validators/floor-transitions";
import { isValidNativeHeroBuffTick, nativeHeroBuffLifeLinkMobEntityIds, nativeHeroBuffLifeLinkMobActorIds, validateNativeLifeLinkEnvironmentDeathRewardTransition, mergeNativeLifeLinkDeathExperienceBundle } from "../validators/hero-buffs";
import { isValidNativeFloorItemIdentitySet, reserveNativeLootClaim, requiresNativeMutationSnapshot, isNativeMutationLockForRequest, classifyNativeMutationLock } from "../validators/inventory-claims";
import { sameNativeItemValue } from "../validators/inventory-economy";
import { isValidNativeBuybackIntent, mergeNativeItemStatusState, isValidNativeUseItemIntent } from "../validators/item-state";
import { isValidNativeBuyIntent, isValidNativeSellIntent } from "../validators/shop";
import { isValidNativeWorldActionIntent } from "../validators/world-actions";
import { isValidNativeDropIntent, isValidNativePickupIntent, isValidNativeThrowIntent, isValidNativeProjectileCombatIntent, isValidNativeProjectileCombatResult, isValidNativeAlchemyIntent } from "../validators/world-items";
import { isValidNativeMutationActionCost, isValidNativeWorldMutation, hasCompleteNativeLevelSnapshot } from "../validators/world-state";
import { MatchRoomSnapshots } from "./snapshots";

export class MatchRoomActions extends MatchRoomSnapshots {
  private nativeActionTransactionActive = false;
  private nativeActionTransactionPeerMessages: Array<() => void> | null = null;

  /**
   * Native Hero Buff ticks and lethal Poison LifeLink batches use one Durable Object SQL transaction.
   * This keeps Hero state, player HP, event/deduplication/sequence updates and any linked Mob rows atomic.
   */
  protected async handleAction(ws: WebSocket, msg: NetworkMessage, session: SessionData) {
    let payload: any = null;
    try {
      payload = typeof msg.payloadJson === "string" ? JSON.parse(msg.payloadJson) : msg.payloadJson;
    } catch (_) {
      payload = null;
    }
    const data = payload?.data;
    const poisonClass = "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Poison";
    const isNativeHeroBuffTick = payload?.action === "SYNC_HERO_STATE"
      && data?.sourceType === "BUFF_TICK"
      && typeof data?.buffClass === "string"
      && Number.isSafeInteger(Number(data?.buffId))
      && typeof data?.heroStateBeforeJson === "string";
    const isLethalPoisonLifeLinkBatch = payload?.action === "SYNC_HERO_STATE"
      && data?.secondaryMobDeltas !== undefined
      && data?.sourceType === "ENVIRONMENT" && data?.sourceClass === poisonClass
      && data?.targetState === "DEAD" && typeof data?.heroStateBeforeJson === "string";
    const isNativeCombatAuthorityResult = ["SYNC_MOB_STATE", "SYNC_PLAYER_COMBAT"].includes(String(payload?.action || ""))
      && typeof data?.combatRequestId === "string";
    const requiresAtomicNativeAction = isNativeHeroBuffTick
      || isLethalPoisonLifeLinkBatch || isNativeCombatAuthorityResult;

    // Native Hero Buff ticks, delegated Mob combat outcomes and lethal Poison LifeLink batches
    // update authoritative state and append sequenced events. Keep their SQL writes atomic and
    // defer every ACK, owner error, and event broadcast until transactionSync has returned.
    if (!requiresAtomicNativeAction) {
      this.handleActionInTransaction(ws, msg, session);
      return;
    }

    const storage: any = this.state?.storage;
    if (!storage || typeof storage.transactionSync !== "function") {
      ws.send(JSON.stringify({
        protocolVersion: "1.0.0",
        messageType: "ERROR",
        requestId: msg.requestId,
        sequence: this.currentSequence,
        payloadJson: JSON.stringify({ error: "ATOMIC_NATIVE_BATCH_UNAVAILABLE" })
      }));
      return;
    }

    const checkpoint = {
      sequence: this.currentSequence,
      worldTime: this.worldTime,
      gameStatus: this.gameStatus
    };
    let combatOwnerId: string | null = null;
    let combatOwnerRequestId: string | null = null;
    if (isNativeCombatAuthorityResult) {
      const combatRequestKey = String(data.combatRequestId || msg.requestId || "");
      const pendingRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?",
        "pendingCombat:" + combatRequestKey).toArray()[0];
      try {
        const pending = pendingRow && typeof pendingRow.value === "string"
          ? JSON.parse(String(pendingRow.value)) : null;
        if (pending && String(pending.requestId) === combatRequestKey
            && String(pending.authorityId) === session.playerId
            && typeof pending.attackerId === "string") {
          combatOwnerId = pending.attackerId;
          combatOwnerRequestId = String(pending.requestId);
        }
      } catch (_) {}
    }
    const deferredSocketMessages: Array<string | ArrayBuffer> = [];
    const deferredPeerMessages: Array<() => void> = [];
    const deferredBroadcasts: Array<() => void> = [];
    const targetWs = ws;
    const transactionalWs = new Proxy(ws, {
      get(target, property) {
        if (property === "send") {
          return (data: string | ArrayBuffer) => { deferredSocketMessages.push(data); };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
    const room = this as any;
    const hadOwnBroadcast = Object.prototype.hasOwnProperty.call(room, "broadcast");
    const ownBroadcast = room.broadcast;
    const hadOwnBroadcastWithFov = Object.prototype.hasOwnProperty.call(room, "broadcastWithFOV");
    const ownBroadcastWithFov = room.broadcastWithFOV;
    const originalBroadcast = this.broadcast;
    const originalBroadcastWithFov = this.broadcastWithFOV;
    let transactionCommitted = false;

    // WebSocket sends are external side effects: Cloudflare SQL can roll back, but a message
    // already sent to a client cannot. Queue the action socket, delegated-owner errors and all
    // broadcasts until transactionSync succeeds. MATCH_END persistence stays inside the transaction.
    this.nativeActionTransactionActive = true;
    this.nativeActionTransactionPeerMessages = deferredPeerMessages;
    room.broadcast = (message: NetworkMessage, excludeWs?: WebSocket) => {
      deferredBroadcasts.push(() => originalBroadcast.call(this, message, excludeWs));
    };
    room.broadcastWithFOV = (senderId: string, eventType: string, actionPayload: any, excludeWs?: WebSocket) => {
      const committedExcludeWs = excludeWs === transactionalWs ? targetWs : excludeWs;
      deferredBroadcasts.push(() => originalBroadcastWithFov.call(
        this, senderId, eventType, actionPayload, committedExcludeWs
      ));
    };
    try {
      storage.transactionSync(() => this.handleActionInTransaction(transactionalWs, msg, session));
      transactionCommitted = true;
    } catch (error) {
      this.currentSequence = checkpoint.sequence;
      this.worldTime = checkpoint.worldTime;
      this.gameStatus = checkpoint.gameStatus;
      // A publisher may have failed while committing another player's combat. The transaction
      // has rolled back at this point, so return a correlated failure to the original requester
      // as well as allowing webSocketMessage to report the failure to the publisher.
      if (combatOwnerId && combatOwnerId !== session.playerId) {
        const failureMessage = JSON.stringify({
          protocolVersion: "1.0.0",
          messageType: "ERROR",
          requestId: combatOwnerRequestId || msg.requestId,
          sequence: checkpoint.sequence,
          payloadJson: JSON.stringify({ error: error instanceof Error ? error.message : String(error) })
        });
        for (const peer of this.state.getWebSockets()) {
          try {
            const peerSession = peer.deserializeAttachment() as SessionData | null;
            if (peerSession?.playerId === combatOwnerId) peer.send(failureMessage);
          } catch (_) {}
        }
      }
      throw error;
    } finally {
      this.nativeActionTransactionActive = false;
      this.nativeActionTransactionPeerMessages = null;
      if (hadOwnBroadcast) room.broadcast = ownBroadcast;
      else delete room.broadcast;
      if (hadOwnBroadcastWithFov) room.broadcastWithFOV = ownBroadcastWithFov;
      else delete room.broadcastWithFOV;
    }

    if (transactionCommitted) {
      // Preserve the native response-before-event order. A delivery failure after commit must
      // never turn a committed action into an ERROR; the client recovers through reconnect/RESYNC.
      for (const data of deferredSocketMessages) {
        try { targetWs.send(data); } catch (_) {}
      }
      for (const send of deferredPeerMessages) {
        try { send(); } catch (_) {}
      }
      for (const send of deferredBroadcasts) {
        try { send(); } catch (_) {}
      }
    }
  }
  /** Queue direct sends to another player until an atomic native action commits. */
  private sendNativeActionPeerMessage(peer: WebSocket, message: string): void {
    if (this.nativeActionTransactionActive && this.nativeActionTransactionPeerMessages) {
      this.nativeActionTransactionPeerMessages.push(() => peer.send(message));
    } else {
      peer.send(message);
    }
  }
  /** Avoid opening a nested transaction for item-claim helpers inside handleAction. */
  private nativeActionTransactionStorage(): any {
    if (!this.nativeActionTransactionActive) return this.state.storage;
    return { transactionSync: (callback: () => any) => callback() };
  }

  protected async handleReconnect(ws: WebSocket, msg: NetworkMessage, session: SessionData) {
        try {
          const payload = typeof msg.payloadJson === "string" ? JSON.parse(msg.payloadJson) : msg.payloadJson;
          const token = payload.sessionToken;
          const lastSeq = payload.lastSequence !== undefined ? Number(payload.lastSequence) : 0;

          const playerRow = this.sql.exec(`SELECT player_id FROM players WHERE session_token = ?`, token).toArray();
          if (playerRow.length > 0) {
            this.sql.exec(`UPDATE players SET connected = 1 WHERE player_id = ?`, session.playerId);
            const gap = this.currentSequence - lastSeq;

            if (gap > 0 && gap <= 50) {
              const missingEvents = this.sql.exec(`SELECT sequence, sender_id, event_type, payload FROM events WHERE sequence > ? ORDER BY sequence ASC`, lastSeq).toArray();
              if (missingEvents.length === gap) {
                ws.send(JSON.stringify({
                  protocolVersion: "1.0.0",
                  messageType: "EVENT_BATCH",
                  sequence: this.currentSequence,
                  payloadJson: JSON.stringify(missingEvents)
                }));
                return;
              }
            }

            const players = this.sql.exec(`SELECT player_id, class_name, pos, hp, ht, ready, state FROM players`).toArray().map((player: any) => {
              const savedHero = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`, `heroState:${player.player_id}`).toArray()[0];
              return { ...player, hero_state_json: savedHero && typeof savedHero.value === "string" ? String(savedHero.value) : "" };
            });
            const mobs = this.sql.exec(`SELECT mob_id, name, pos, hp, ht FROM mobs WHERE depth = ?`, this.currentDepth).toArray();

            ws.send(JSON.stringify({
              protocolVersion: "1.0.0",
              messageType: "SNAPSHOT",
              sequence: this.currentSequence,
              payloadJson: JSON.stringify({
                sequence: this.currentSequence,
                seed: this.matchSeed,
                depth: this.currentDepth,
                gameMode: this.gameMode,
                players,
                mobs,
                worldTime: this.worldTime,
                level: this.getCurrentLevelSnapshot()
              })
            }));
            return;
          }
        } catch (_) {}
  }

  protected async handleLevelData(ws: WebSocket, msg: NetworkMessage, session: SessionData) {
        const level = JSON.parse(msg.payloadJson || "{}");
        const isNativeWorldMutation = level.nativeWorldMutation === true;
        const authority = this.sql.exec(`SELECT value FROM room_meta WHERE key = 'levelPublisher'`).toArray();
        const isLevelPublisher = authority.length > 0 && String(authority[0].value) === session.playerId;
        if (!isLevelPublisher && !isNativeWorldMutation) {
          ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
            sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "LEVEL_PUBLISHER_ONLY" }) }));
          return;
        }
        const width = Number(level.width), height = Number(level.height), depth = Number(level.depth);
        const pendingAtLevelDataRow = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray()[0];
        let pendingAtLevelData: any = null;
        try { pendingAtLevelData = pendingAtLevelDataRow ? JSON.parse(String(pendingAtLevelDataRow.value)) : null; } catch (_) {}
        const isTransitionDestinationSnapshot = isPendingNativeFloorDestinationSnapshot(
          this.currentDepth, pendingAtLevelData, depth, level.branch, session.playerId);
        const tiles = level.tiles, transitions = level.transitions;
        const heaps = level.heaps, traps = level.traps, blobs = level.blobs, plants = level.plants;
        let mobs = level.mobs;
        const visitedPositions = level.visitedPositions, mappedPositions = level.mappedPositions;
        const size = width * height;
        const validBundle = (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 200000;
        const boundedArray = (value: unknown, max: number) => Array.isArray(value) && value.length <= max;
        const validPos = (p: number) => Number.isInteger(p) && p >= 0 && p < size;
        if (!hasCompleteNativeLevelSnapshot(level) || Number(level.schemaVersion) !== 1 || Number(level.branch) !== 0 || depth < 1 || depth > 100
          || (depth !== this.currentDepth && !isTransitionDestinationSnapshot)
          || !Number.isInteger(width) || !Number.isInteger(height) || width < 8 || height < 8
          || width > 100 || height > 100 || !Array.isArray(tiles) || tiles.length !== size
          || !boundedArray(transitions, 128) || !boundedArray(heaps, size)
          || !boundedArray(traps, size) || !boundedArray(blobs, 128)
          || !boundedArray(plants, size) || !boundedArray(mobs, 512)
          || !boundedArray(visitedPositions, size) || !boundedArray(mappedPositions, size)
          || typeof level.locked !== "boolean" || !["NONE","CHASM","WATER","GRASS","DARK","LARGE","TRAPS","SECRETS"].includes(String(level.feeling))
          || !validPos(Number(level.entrancePos)) || !validPos(Number(level.exitPos))
          || !Number.isFinite(Number(level.seed))
          || (typeof level.heroStateJson !== "string" || level.heroStateJson.length > 200000)) {
          ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
            sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "INVALID_SPD_LEVEL_SNAPSHOT" }) }));
          return;
        }
        const visitedSet = new Set<number>(), mappedSet = new Set<number>();
        for (const pos of visitedPositions) { if (!validPos(Number(pos)) || visitedSet.has(Number(pos))) { ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId, sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "INVALID_SPD_EXPLORATION" }) })); return; } visitedSet.add(Number(pos)); }
        for (const pos of mappedPositions) { if (!validPos(Number(pos)) || mappedSet.has(Number(pos))) { ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId, sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "INVALID_SPD_EXPLORATION" }) })); return; } mappedSet.add(Number(pos)); }
        const positions = new Set<number>();
        for (const tile of tiles) {
          const pos = Number(tile?.pos);
          if (!validPos(pos) || positions.has(pos) || !Number.isInteger(Number(tile?.terrain))
            || typeof tile?.passable !== "boolean" || typeof tile?.solid !== "boolean"
            || typeof tile?.pit !== "boolean" || typeof tile?.losBlocking !== "boolean"
            || typeof tile?.flammable !== "boolean" || typeof tile?.secret !== "boolean"
            || typeof tile?.avoid !== "boolean" || typeof tile?.water !== "boolean"
            || typeof tile?.discoverable !== "boolean" || typeof tile?.openSpace !== "boolean") {
            ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
              sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "INVALID_SPD_LEVEL_TILES" }) }));
            return;
          }
          positions.add(pos);
        }
        for (const t of transitions) {
          if (!validPos(Number(t?.pos)) || !Number.isInteger(Number(t?.targetDepth))
            || !["SURFACE", "REGULAR_ENTRANCE", "REGULAR_EXIT", "BRANCH_ENTRANCE", "BRANCH_EXIT"].includes(String(t?.type))) {
            ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
              sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "INVALID_SPD_TRANSITIONS" }) }));
            return;
          }
        }
        const mobIds = new Set<number>();
        const entityIds = new Set<string>();
        for (const mob of mobs) {
          const id = Number(mob?.mobId), hp = Number(mob?.hp), ht = Number(mob?.ht);
          if (!validPos(Number(mob?.pos)) || !Number.isInteger(id) || id < 0 || mobIds.has(id)
            || !Number.isInteger(hp) || !Number.isInteger(ht) || hp < 0 || ht < 1 || hp > ht
            || !Number.isInteger(mob?.shielding) || Number(mob.shielding) < 0 || Number(mob.shielding) > 100000
            || typeof mob?.name !== "string" || !validBundle(mob?.serializedBundle)
            || (level.nativeWorldTick === true && (!Number.isFinite(Number(mob?.baseSpeed)) || Number(mob.baseSpeed) <= 0
              || Number(mob.baseSpeed) > 1000 || !Number.isFinite(Number(mob?.effectiveSpeed))
              || Number(mob.effectiveSpeed) <= 0 || Number(mob.effectiveSpeed) > 1000
              || !Number.isFinite(Number(mob?.cooldown ?? 0)) || Number(mob.cooldown ?? 0) < 0
              || Number(mob.cooldown ?? 0) > 100000))
            || !Array.isArray(mob?.buffs) || mob.buffs.length > 256
            || mob.buffs.some((buff: any) => !validBundle(buff?.serializedBundle)
              || !Number.isFinite(Number(buff?.cooldown)) || Number(buff.cooldown) < 0 || Number(buff.cooldown) > 100000)) {
            ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
              sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "INVALID_SPD_MOBS" }) }));
            return;
          }
          mobIds.add(id);
          if (mob?.entityId != null && String(mob.entityId).length > 0) {
            const entityId = String(mob.entityId);
            if (entityId.length < 8 || entityId.length > 80 || entityIds.has(entityId)) {
              ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
                sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "INVALID_SPD_ENTITY_IDS" }) }));
              return;
            }
            entityIds.add(entityId);
          }
        }
        const invalidObjects =
          !isValidNativeFloorItemIdentitySet(heaps)
          || heaps.some((heap: any) => !validPos(Number(heap?.pos)) || !["HEAP","FOR_SALE","CHEST","LOCKED_CHEST","CRYSTAL_CHEST","TOMB","SKELETON","REMAINS"].includes(String(heap?.type))
            || !Array.isArray(heap?.items) || heap.items.length > 512
            || heap.items.some((item: any) => !validBundle(item?.serializedBundle) || !Number.isInteger(Number(item?.quantity)) || Number(item.quantity) < 1 || Number(item.quantity) > 100000))
          || traps.some((trap: any) => !validPos(Number(trap?.pos)) || !validBundle(trap?.serializedBundle))
          || plants.some((plant: any) => !validPos(Number(plant?.pos)) || !validBundle(plant?.serializedBundle))
          || blobs.some((blob: any) => typeof blob?.className !== "string" || !validBundle(blob?.serializedBundle)
            || !Number.isFinite(Number(blob?.cooldown)) || Number(blob.cooldown) < 0 || Number(blob.cooldown) > 100000);
        if (invalidObjects) {
          ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
            sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "INVALID_SPD_LEVEL_ENTITIES" }) }));
          return;
        }
        // Assign stable server identities before replacing the previous snapshot. Preserve an
        // existing identity supplied by the publisher; otherwise reuse a previous identity only
        // when the same native actor key/class can be matched, then fall back to a unique ID.
        const previousSnapshotRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`,
          `levelSnapshot:${depth}`).toArray()[0];
        let previousSnapshot: any = {};
        try {
          previousSnapshot = previousSnapshotRow && typeof previousSnapshotRow.value === "string"
            ? JSON.parse(String(previousSnapshotRow.value)) : {};
        } catch (_) { previousSnapshot = {}; }
        const storedTurnRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "nativeWorldTurnCounter").toArray()[0];
        const storedTurnCounter = Math.max(0,
          Number.isSafeInteger(Number(storedTurnRow?.value)) ? Number(storedTurnRow.value) : 0,
          Number.isSafeInteger(Number(previousSnapshot.nativeWorldTurnCounter))
            ? Number(previousSnapshot.nativeWorldTurnCounter) : 0);
        let verifiedMutationHeroStateJson: string | null = null;
        let verifiedMutationAction = "";
        let verifiedMutationFrom = -1;
        let verifiedMutationTargetPos = -1;
        let verifiedMutationDetails: any = null;
        let verifiedMutationRequestId = "";
        if (isNativeWorldMutation) {
          const mutationAction = String(level.nativeMutationAction || "");
          const mutationRequestId = String(level.nativeMutationRequestId || "");
          const mutationFrom = level.nativeMutationFrom;
          const mutationTarget = level.nativeMutationTargetPos;
          const transitionAlreadyPending = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray().length > 0;
          const acceptedRow = mutationRequestId.length > 0
            ? this.sql.exec("SELECT player_id,result_json FROM processed_actions WHERE request_id = ?", mutationRequestId).toArray()[0] : null;
          let accepted: any = null;
          try { accepted = acceptedRow ? JSON.parse(String(acceptedRow.result_json)) : null; } catch (_) {}
          const expectedEvent = mutationAction === "MOVE" ? "MOVE_INTENT_ACCEPTED"
            : mutationAction === "PICKUP" ? "ITEM_PICKUP_INTENT_ACCEPTED" : "WORLD_ACTION_RESOLVED";
          const acceptedPayload = accepted?.action;
          const mutationDetails = level.nativeMutationDetails || null;
          const mutationLockKey = "nativeMutationPending:" + session.playerId;
          const mutationLockRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", mutationLockKey).toArray()[0];
          const mutationLockMatches = !requiresNativeMutationSnapshot(mutationAction)
            || classifyNativeMutationLock(mutationLockRow?.value, session.playerId, mutationRequestId, mutationAction) === "OWNED";
          const hasItemClaim = mutationAction === "PICKUP" || mutationAction === "BUY" || mutationAction === "BUYBACK";
          const claimHeapId = mutationAction === "BUYBACK" ? mutationDetails?.shopEntityId : mutationDetails?.heapId;
          const claimItemId = mutationAction === "BUYBACK" ? mutationDetails?.buybackItemId : mutationDetails?.itemId;
          const pickupClaim = hasItemClaim && mutationDetails
            ? this.sql.exec("SELECT claimed_by,request_id FROM claimed_item_instances WHERE depth = ? AND branch = ? AND heap_id = ? AND item_id = ?",
                depth, Number(level.branch), String(claimHeapId || ""), String(claimItemId || "")).toArray()[0] : null;
          const chestClaim = mutationAction === "OPEN_CHEST" && mutationDetails
            ? this.sql.exec("SELECT claimed_by,request_id FROM claimed_chest_instances WHERE depth = ? AND heap_id = ?",
                depth, String(mutationDetails.heapId || "")).toArray()[0] : null;
          const playerRow = this.sql.exec("SELECT pos,hp,ht,state FROM players WHERE player_id = ?", session.playerId).toArray()[0];
          const trustedHeroRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + session.playerId).toArray()[0];
          let reportedHero: any = null;
          try { reportedHero = JSON.parse(String(level.heroStateJson || "")); } catch (_) {}
          const actionWasAccepted = !!acceptedRow && String(acceptedRow.player_id) === session.playerId
            && accepted?.status === "ACCEPTED" && accepted?.eventType === expectedEvent
            && (mutationAction === "MOVE"
              ? acceptedPayload?.playerId === session.playerId && acceptedPayload?.from === mutationFrom
                && acceptedPayload?.pos === mutationTarget
              : acceptedPayload?.playerId === session.playerId && acceptedPayload?.actionType === mutationAction
                && acceptedPayload?.from === mutationFrom && acceptedPayload?.targetPos === mutationTarget
                && (mutationAction !== "PICKUP" || mutationDetails != null && pickupClaim
                  && acceptedPayload?.branch === Number(level.branch)
                  && String(pickupClaim.claimed_by) === session.playerId
                  && String(pickupClaim.request_id) === mutationRequestId
                  && acceptedPayload?.heapId === mutationDetails.heapId
                  && acceptedPayload?.itemId === mutationDetails.itemId
                  && acceptedPayload?.itemClass === mutationDetails.itemClass
                  && acceptedPayload?.expectedQuantity === mutationDetails.expectedQuantity
                  && acceptedPayload?.stackable === mutationDetails.stackable)
                && (mutationAction !== "OPEN_CHEST" || mutationDetails != null && chestClaim
                  && String(chestClaim.claimed_by) === session.playerId
                  && String(chestClaim.request_id) === mutationRequestId
                  && acceptedPayload?.heapId === mutationDetails.heapId
                  && acceptedPayload?.heapType === mutationDetails.heapType)
                && ((mutationAction !== "EQUIP" && mutationAction !== "UNEQUIP") || mutationDetails != null
                  && acceptedPayload?.itemId === mutationDetails.itemId
                  && acceptedPayload?.itemClass === mutationDetails.itemClass
                  && acceptedPayload?.expectedEquipped === mutationDetails.expectedEquipped)
                && (mutationAction !== "BUY" || mutationDetails != null && pickupClaim
                  && acceptedPayload?.branch === Number(level.branch)
                  && String(pickupClaim.claimed_by) === session.playerId
                  && String(pickupClaim.request_id) === mutationRequestId
                  && acceptedPayload?.heapId === mutationDetails.heapId
                  && acceptedPayload?.itemId === mutationDetails.itemId
                  && acceptedPayload?.itemClass === mutationDetails.itemClass
                  && acceptedPayload?.expectedQuantity === mutationDetails.expectedQuantity
                  && acceptedPayload?.price === mutationDetails.price
                  && acceptedPayload?.resultItemId === mutationDetails.resultItemId
                  && acceptedPayload?.resultHeapId === mutationDetails.resultHeapId
                  && acceptedPayload?.acquiredByInventory === mutationDetails.acquiredByInventory)
                && (mutationAction !== "BUYBACK" || mutationDetails != null && pickupClaim
                  && String(pickupClaim.claimed_by) === session.playerId
                  && String(pickupClaim.request_id) === mutationRequestId
                  && acceptedPayload?.shopEntityId === mutationDetails.shopEntityId
                  && acceptedPayload?.buybackItemId === mutationDetails.buybackItemId
                  && acceptedPayload?.buybackItemClass === mutationDetails.buybackItemClass
                  && acceptedPayload?.buybackQuantity === mutationDetails.buybackQuantity
                  && acceptedPayload?.price === mutationDetails.price
                  && acceptedPayload?.resultItemId === mutationDetails.resultItemId
                  && acceptedPayload?.itemClass === mutationDetails.itemClass
                  && acceptedPayload?.itemLevel === mutationDetails.itemLevel
                  && acceptedPayload?.cursed === mutationDetails.cursed
                  && acceptedPayload?.cursedKnown === mutationDetails.cursedKnown
                  && acceptedPayload?.stackable === mutationDetails.stackable
                  && acceptedPayload?.nativeValue === mutationDetails.nativeValue
                  && acceptedPayload?.nativeUnitValue === mutationDetails.nativeUnitValue
                  && acceptedPayload?.resultItemBundle === mutationDetails.resultItemBundle)
                && (mutationAction !== "SELL" || mutationDetails != null
                  && acceptedPayload?.shopEntityId === mutationDetails.shopEntityId
                  && acceptedPayload?.sourceItemLevel === mutationDetails.sourceItemLevel
                  && acceptedPayload?.sourceCursed === mutationDetails.sourceCursed
                  && acceptedPayload?.sourceCursedKnown === mutationDetails.sourceCursedKnown
                  && acceptedPayload?.sourceItemId === mutationDetails.sourceItemId
                  && acceptedPayload?.resultItemId === mutationDetails.resultItemId
                  && acceptedPayload?.itemClass === mutationDetails.itemClass
                  && acceptedPayload?.sourceQuantityBefore === mutationDetails.sourceQuantityBefore
                  && acceptedPayload?.soldQuantity === mutationDetails.soldQuantity
                  && acceptedPayload?.sourceNativeValue === mutationDetails.sourceNativeValue
                  && acceptedPayload?.sourceNativeUnitValue === mutationDetails.sourceNativeUnitValue
                  && acceptedPayload?.price === mutationDetails.price
                  && acceptedPayload?.stackable === mutationDetails.stackable
                  && acceptedPayload?.resultItemBundle === mutationDetails.resultItemBundle
                  && acceptedPayload?.resultItemLevel === mutationDetails.resultItemLevel
                  && acceptedPayload?.resultCursed === mutationDetails.resultCursed
                  && acceptedPayload?.resultCursedKnown === mutationDetails.resultCursedKnown
                  && acceptedPayload?.resultNativeValue === mutationDetails.resultNativeValue
                  && acceptedPayload?.resultNativeUnitValue === mutationDetails.resultNativeUnitValue)
                && (mutationAction !== "DROP" || mutationDetails != null
                  && acceptedPayload?.heapId === mutationDetails.heapId
                  && acceptedPayload?.itemId === mutationDetails.itemId
                  && acceptedPayload?.resultItemId === mutationDetails.resultItemId
                  && acceptedPayload?.itemClass === mutationDetails.itemClass
                  && acceptedPayload?.expectedQuantity === mutationDetails.expectedQuantity
                  && acceptedPayload?.sourceQuantityBefore === mutationDetails.sourceQuantityBefore
                  && acceptedPayload?.stackable === mutationDetails.stackable)
                && (mutationAction !== "USE_ITEM" || mutationDetails != null
                  && acceptedPayload?.itemId === mutationDetails.itemId
                  && acceptedPayload?.itemClass === mutationDetails.itemClass
                  && acceptedPayload?.itemAction === mutationDetails.itemAction
                  && acceptedPayload?.expectedQuantity === mutationDetails.expectedQuantity
                  && acceptedPayload?.sourceQuantityBefore === mutationDetails.sourceQuantityBefore
                  && acceptedPayload?.stackable === mutationDetails.stackable)
                && (mutationAction !== "THROW" || mutationDetails != null
                  && acceptedPayload?.itemId === mutationDetails.itemId
                  && acceptedPayload?.itemClass === mutationDetails.itemClass
                  && acceptedPayload?.heapId === mutationDetails.heapId
                  && acceptedPayload?.resultItemId === mutationDetails.resultItemId
                  && acceptedPayload?.expectedQuantity === mutationDetails.expectedQuantity
                  && acceptedPayload?.sourceQuantityBefore === mutationDetails.sourceQuantityBefore
                  && acceptedPayload?.stackable === mutationDetails.stackable)
                && (mutationAction !== "ALCHEMY" || mutationDetails != null
                  && acceptedPayload?.resultNativeValue === mutationDetails.resultNativeValue
                  && acceptedPayload?.resultNativeUnitValue === mutationDetails.resultNativeUnitValue
                  && sameNativeItemValue(acceptedPayload?.ingredients, mutationDetails.ingredients)
                  && acceptedPayload?.alchemyEnergyBefore === mutationDetails.alchemyEnergyBefore
                  && acceptedPayload?.alchemyEnergyAfter === mutationDetails.alchemyEnergyAfter
                  && acceptedPayload?.resultItemId === mutationDetails.resultItemId
                  && acceptedPayload?.resultItemClass === mutationDetails.resultItemClass
                  && acceptedPayload?.resultQuantity === mutationDetails.resultQuantity
                  && acceptedPayload?.resultStackable === mutationDetails.resultStackable
                  && acceptedPayload?.resultLocation === mutationDetails.resultLocation
                  && acceptedPayload?.resultHeapId === mutationDetails.resultHeapId)
                && (mutationAction !== "USE_ABILITY" || mutationDetails != null
                  && acceptedPayload?.abilityClass === mutationDetails.abilityClass
                  && acceptedPayload?.armorItemId === mutationDetails.armorItemId
                  && acceptedPayload?.armorClass === mutationDetails.armorClass
                  && acceptedPayload?.armorChargeBefore === mutationDetails.armorChargeBefore
                  && acceptedPayload?.armorChargeAfter === mutationDetails.armorChargeAfter
                  && acceptedPayload?.armorChargeUse === mutationDetails.armorChargeUse
                  && Math.abs(Number(acceptedPayload?.engineActionCost)
                    - (String(mutationDetails.abilityClass) === NATIVE_ENDURE_ABILITY ? 3 : 1)) <= 0.05));
          const previousMutationHero: any = (() => {
            try { return JSON.parse(String(trustedHeroRow?.value || "")); } catch (_) { return null; }
          })();
          const mutationExpectedPos = mutationAction === "MOVE" ? Number(mutationTarget) : Number(playerRow?.pos);
          const previousTargetTerrain = Number(previousSnapshot?.tiles?.find((tile: any) => tile?.pos === Number(mutationTarget))?.terrain);
          const submittedTargetTerrain = Number(level.tiles?.find((tile: any) => tile?.pos === Number(mutationTarget))?.terrain);
          const consumedNativeWell = mutationAction === "MOVE" && previousTargetTerrain === 24 && submittedTargetTerrain === 3;
          const pickupDewdrop = mutationAction === "PICKUP"
            && String(mutationDetails?.itemClass || "").endsWith(".Dewdrop");
          const maxDewEffect = pickupDewdrop ? Math.round(Number(playerRow?.ht) * 0.05) : 0;
          const useItemDetails: any = mutationAction === "USE_ITEM" ? mutationDetails : null;
          const useItemStrength = !!useItemDetails && useItemDetails.itemAction === "DRINK"
            && String(useItemDetails.itemClass || "") === "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfStrength";
          const heroHpValid = mutationAction === "MOVE" || mutationAction === "PICKUP"
            ? Number.isInteger(reportedHero?.hp) && (reportedHero.hp <= Number(playerRow?.hp)
              || (pickupDewdrop && reportedHero.hp <= Number(playerRow?.hp) + maxDewEffect
                && reportedHero.hp <= Number(reportedHero.ht))
              || (mutationAction === "MOVE" && consumedNativeWell && reportedHero.hp <= Number(reportedHero.ht)))
            : Number(reportedHero?.hp) === Number(playerRow?.hp);
          const heroStateValid = !!playerRow && String(playerRow.state) === "ALIVE" && !!reportedHero
            && Number(reportedHero.pos) === mutationExpectedPos && heroHpValid
            && Number(reportedHero.ht) === Number(playerRow.ht)
            && ((mutationAction === "MOVE" || mutationAction === "PICKUP") ? !!previousMutationHero
              && (reportedHero.shielding <= Number(previousMutationHero.shielding)
                || (mutationAction === "MOVE" && consumedNativeWell)
                || (pickupDewdrop && reportedHero.shielding <= Number(previousMutationHero.shielding) + maxDewEffect))
              : mutationAction === "USE_ITEM" && useItemDetails
                ? Number.isInteger(reportedHero.shielding) && reportedHero.shielding >= 0
                  && reportedHero.shielding <= Number(previousMutationHero?.shielding || 0)
                    + (String(useItemDetails.itemClass || "") === "com.shatteredpixel.shatteredpixeldungeon.items.potions.exotic.PotionOfShielding"
                      ? Math.floor(0.6 * Number(reportedHero.ht) + 10) : 0)
                : !!previousMutationHero && reportedHero.shielding === Number(previousMutationHero.shielding))
            && isValidNativeHeroStateJson(String(level.heroStateJson || ""), {
              hp: Number(reportedHero.hp), ht: Number(reportedHero.ht), pos: mutationExpectedPos,
              shielding: Number(reportedHero.shielding)
            });
          if (depth !== this.currentDepth || transitionAlreadyPending || !actionWasAccepted || !trustedHeroRow
              || !mutationLockMatches || !heroStateValid
              || (requiresNativeMutationSnapshot(mutationAction)
                && !isValidNativeMutationActionCost(trustedHeroRow.value, level.heroStateJson, accepted?.actionCost))
              || !isValidNativeWorldMutation(previousSnapshot, level, mutationAction,
                mutationFrom, mutationTarget, trustedHeroRow.value, acceptedPayload)) {
            if ((mutationAction === "PICKUP" || mutationAction === "BUY" || mutationAction === "BUYBACK") && mutationDetails) this.sql.exec(
              "DELETE FROM claimed_item_instances WHERE depth = ? AND branch = ? AND heap_id = ? AND item_id = ? AND claimed_by = ? AND request_id = ?",
              depth, Number(level.branch),
              String((mutationAction === "BUYBACK" ? mutationDetails.shopEntityId : mutationDetails.heapId) || ""),
              String((mutationAction === "BUYBACK" ? mutationDetails.buybackItemId : mutationDetails.itemId) || ""),
              session.playerId, mutationRequestId);
            if (mutationAction === "OPEN_CHEST" && mutationDetails) this.sql.exec(
              "DELETE FROM claimed_chest_instances WHERE depth = ? AND heap_id = ? AND claimed_by = ? AND request_id = ?",
              depth, String(mutationDetails.heapId || ""), session.playerId, mutationRequestId);
            const activeMutationLock = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", mutationLockKey).toArray()[0];
            if (isNativeMutationLockForRequest(activeMutationLock?.value, session.playerId, mutationRequestId, mutationAction)) {
              this.sql.exec("DELETE FROM room_meta WHERE key = ?", mutationLockKey);
            }
            ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
              sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "INVALID_NATIVE_WORLD_MUTATION" }) }));
            return;
          }
          const merged = mergeNativeHeroState(String(trustedHeroRow.value), String(level.heroStateJson), {
            hp: Number(reportedHero.hp), ht: Number(playerRow.ht), pos: mutationExpectedPos,
            shielding: Number(reportedHero.shielding)
          }, nativeBuffSnapshotFromHeroState(String(level.heroStateJson)), false, false,
            mutationAction !== "PICKUP" && mutationAction !== "DROP" && mutationAction !== "BUY"
              && mutationAction !== "BUYBACK" && mutationAction !== "SELL" && mutationAction !== "USE_ITEM"
              && mutationAction !== "THROW" && mutationAction !== "ALCHEMY" && mutationAction !== "USE_ABILITY",
            mutationAction === "MOVE");
          if (merged == null) {
            if ((mutationAction === "PICKUP" || mutationAction === "BUY" || mutationAction === "BUYBACK") && mutationDetails) this.sql.exec(
              "DELETE FROM claimed_item_instances WHERE depth = ? AND branch = ? AND heap_id = ? AND item_id = ? AND claimed_by = ? AND request_id = ?",
              depth, Number(level.branch),
              String((mutationAction === "BUYBACK" ? mutationDetails.shopEntityId : mutationDetails.heapId) || ""),
              String((mutationAction === "BUYBACK" ? mutationDetails.buybackItemId : mutationDetails.itemId) || ""),
              session.playerId, mutationRequestId);
            if (mutationAction === "OPEN_CHEST" && mutationDetails) this.sql.exec(
              "DELETE FROM claimed_chest_instances WHERE depth = ? AND heap_id = ? AND claimed_by = ? AND request_id = ?",
              depth, String(mutationDetails.heapId || ""), session.playerId, mutationRequestId);
            const activeMutationLock = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", mutationLockKey).toArray()[0];
            if (isNativeMutationLockForRequest(activeMutationLock?.value, session.playerId, mutationRequestId, mutationAction)) {
              this.sql.exec("DELETE FROM room_meta WHERE key = ?", mutationLockKey);
            }
            ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
              sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "INVALID_NATIVE_HERO_MUTATION" }) }));
            return;
          }
          const mergedHero: any = JSON.parse(merged);
          mergedHero.cooldown = reportedHero.cooldown;
          if (["MOVE", "UNLOCK", "OPEN_CHEST", "INTERACT", "PICKUP"].includes(mutationAction)) {
            for (const field of ["notesBundle", "ironKeyCount", "crystalKeyCount", "wornKeyCount", "goldenKeyCount"]) {
              if (reportedHero[field] !== undefined) mergedHero[field] = reportedHero[field];
            }
          }
          if (reportedHero.questStateBundle !== undefined && mutationAction !== "MOVE") {
            mergedHero.questStateBundle = reportedHero.questStateBundle;
          }
          if (reportedHero.potionStatusBundle !== undefined && mutationAction === "USE_ITEM") {
            mergedHero.potionStatusBundle = reportedHero.potionStatusBundle;
          }
          if (reportedHero.scrollStatusBundle !== undefined && mutationAction === "USE_ITEM") {
            mergedHero.scrollStatusBundle = reportedHero.scrollStatusBundle;
          }
          if (mutationAction === "USE_ITEM") {
            const itemStatus = mergeNativeItemStatusState(trustedHeroRow.value, level.heroStateJson,
              String(mutationDetails?.itemAction || ""), String(mutationDetails?.itemClass || ""));
            if (itemStatus) Object.assign(mergedHero, itemStatus);
          }
          if (mutationAction === "INTERACT" || mutationAction === "MINE" || mutationAction === "PICKUP"
              || mutationAction === "DROP" || mutationAction === "EQUIP" || mutationAction === "UNEQUIP"
              || mutationAction === "BUY" || mutationAction === "BUYBACK" || mutationAction === "SELL" || mutationAction === "USE_ITEM" || mutationAction === "THROW" || mutationAction === "ALCHEMY" || mutationAction === "USE_ABILITY") {
            mergedHero.inventoryBundle = reportedHero.inventoryBundle;
            mergedHero.inventoryItemsJson = reportedHero.inventoryItemsJson;
            mergedHero.nativeItemEconomyJson = reportedHero.nativeItemEconomyJson;
            mergedHero.gold = reportedHero.gold;
            if (mutationAction === "ALCHEMY"
                || (mutationAction === "PICKUP" && String(mutationDetails?.itemClass || "").endsWith(".EnergyCrystal"))) {
              mergedHero.alchemyEnergy = reportedHero.alchemyEnergy;
            }
            if (mutationAction === "USE_ABILITY"
                || (mutationAction === "USE_ITEM" && useItemStrength)) {
              mergedHero.combatBundle = reportedHero.combatBundle;
            }
            if (typeof reportedHero.quickslotsJson === "string" && parseNativeQuickslotIndex(reportedHero) != null) {
              mergedHero.quickslotsJson = reportedHero.quickslotsJson;
            }
          }
          verifiedMutationHeroStateJson = JSON.stringify(mergedHero);
          verifiedMutationAction = mutationAction;
          verifiedMutationFrom = Number(mutationFrom);
          verifiedMutationTargetPos = Number(mutationTarget);
          verifiedMutationDetails = mutationDetails;
          verifiedMutationRequestId = mutationRequestId;
          const submittedMobs = Array.isArray(level.mobs) ? level.mobs : [];
          mobs = Array.isArray(previousSnapshot.mobs) ? previousSnapshot.mobs.map((previousMob: any) => {
            if (mutationAction === "INTERACT" && Number(previousMob?.pos) === Number(mutationTarget)) {
              const submittedMob = submittedMobs.find((candidate: any) =>
                String(candidate?.entityId || "") === String(previousMob?.entityId || ""));
              if (submittedMob && typeof submittedMob.serializedBundle === "string") {
                return { ...previousMob, serializedBundle: submittedMob.serializedBundle };
              }
            }
            if ((mutationAction === "SELL" || mutationAction === "BUYBACK")
                && String(previousMob?.entityId || "") === String(mutationDetails?.shopEntityId || "")) {
              const submittedMob = submittedMobs.find((candidate: any) =>
                String(candidate?.entityId || "") === String(previousMob?.entityId || ""));
              if (submittedMob && typeof submittedMob.serializedBundle === "string"
                  && Array.isArray(submittedMob.buybackItems)) {
                return { ...previousMob, serializedBundle: submittedMob.serializedBundle,
                  buybackItems: submittedMob.buybackItems,
                  shopkeeperTurnsSinceHarmed: submittedMob.shopkeeperTurnsSinceHarmed };
              }
            }
            return previousMob;
          }) : [];
          level.mobs = mobs;
          // Hero state is player-specific; never overwrite shared floor metadata with a guest copy.
          level.heroStateJson = String(previousSnapshot.heroStateJson || "");
          delete level.nativeWorldMutation;
          delete level.nativeMutationAction;
          delete level.nativeMutationRequestId;
          delete level.nativeMutationFrom;
          delete level.nativeMutationTargetPos;
          delete level.nativeMutationDetails;
        }
        const isNativeWorldTurn = level.nativeWorldTick === true;
        if (this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray().length > 0
            && (isNativeWorldTurn || isNativeWorldMutation)) {
          ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
            sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "TRANSITION_PENDING" }) }));
          return;
        }
        if (isNativeWorldTurn) {
          const trustedTurnHeroRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?",
            "heroState:" + session.playerId).toArray()[0];
          const turnPlayerRow = this.sql.exec("SELECT pos,hp,ht,state FROM players WHERE player_id = ?",
            session.playerId).toArray()[0];
          let trustedTurnHero: any = null;
          try { trustedTurnHero = JSON.parse(String(trustedTurnHeroRow?.value || "")); } catch (_) {}
          const mobBuffOwnerValid = String(level.nativeWorldActorKind || "") !== "MOB_BUFF"
            || (!!trustedTurnHero && !!turnPlayerRow && String(turnPlayerRow.state) === "ALIVE"
              && Number(trustedTurnHero.hp) === Number(turnPlayerRow.hp)
              && Number(trustedTurnHero.ht) === Number(turnPlayerRow.ht)
              && Number(trustedTurnHero.pos) === Number(turnPlayerRow.pos));
          if (!mobBuffOwnerValid
              || !isValidNativeWorldTurnSnapshot(previousSnapshot, level, storedTurnCounter, this.currentDepth,
                trustedTurnHeroRow?.value)) {
            ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
              sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "INVALID_OR_REPLAYED_NATIVE_WORLD_TURN" }) }));
            return;
          }
        }
        if (!isNativeWorldTurn && level.nativeWorldTurnCounter !== undefined) {
          ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
            sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "UNMARKED_NATIVE_WORLD_TURN" }) }));
          return;
        }
        const transitionPendingRow = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray()[0];
        let transitionPending: any = null;
        if (transitionPendingRow) {
          try { transitionPending = JSON.parse(String(transitionPendingRow.value)); } catch (_) {}
          const validFallDestination = transitionPending?.transitionType === "FALL"
            && isValidNativeFallDestinationSnapshot(level);
          const validStairDestination = transitionPending?.transitionType !== "FALL"
            && Array.isArray(transitions)
            && transitions.filter((transition: any) => String(transition?.type) === String(transitionPending.targetType)
              && Number.isInteger(transition?.pos)).length === 1;
          if (!transitionPending || transitionPending.fromDepth !== this.currentDepth
              || transitionPending.depth !== depth || transitionPending.snapshotReady === true
              || !isTransitionDestinationSnapshot || (!validFallDestination && !validStairDestination)) {
            ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
              sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "INVALID_TRANSITION_DESTINATION_SNAPSHOT" }) }));
            return;
          }
        }
        assignStableEntityIds(mobs, Array.isArray(previousSnapshot.mobs) ? previousSnapshot.mobs : []);
        level.mobs = mobs;

        this.sql.exec(`DELETE FROM level_tiles WHERE depth = ?`, depth);
        this.sql.exec(`DELETE FROM level_transitions WHERE depth = ?`, depth);
        this.sql.exec(`DELETE FROM mobs WHERE depth = ?`, depth);
        this.sql.exec(`INSERT INTO levels (depth,width,height,entrance_pos,exit_pos,seed) VALUES (?,?,?,?,?,?)
          ON CONFLICT(depth) DO UPDATE SET width=excluded.width,height=excluded.height,
          entrance_pos=excluded.entrance_pos,exit_pos=excluded.exit_pos,seed=excluded.seed`,
          depth,width,height,Number(level.entrancePos),Number(level.exitPos),Number(level.seed)||this.matchSeed);
        this.sql.exec(`INSERT INTO room_meta (key,value) VALUES (?,?)
          ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
          `levelSnapshot:${depth}`, JSON.stringify(level));
        const heroStateToStore = verifiedMutationHeroStateJson || level.heroStateJson;
        if (typeof heroStateToStore === "string" && heroStateToStore.length <= 200000) {
          this.sql.exec(`INSERT INTO room_meta (key,value) VALUES (?,?)
            ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
            `heroState:${session.playerId}`, heroStateToStore);
          let storedHero: any = null;
          try { storedHero = JSON.parse(heroStateToStore); } catch (_) {}
          if (storedHero && Number.isInteger(storedHero.hp) && Number.isInteger(storedHero.ht)
              && Number.isInteger(storedHero.pos)) {
            this.sql.exec("UPDATE players SET hp = ?, ht = ?, pos = ? WHERE player_id = ?",
              storedHero.hp, storedHero.ht, storedHero.pos, session.playerId);
          }
        }
        for (const t of tiles) {
          this.sql.exec(`INSERT INTO level_tiles (depth,pos,terrain,passable,solid,pit,los_blocking) VALUES (?,?,?,?,?,?,?)`,
            depth,Number(t.pos),String(Number(t.terrain)),t.passable?1:0,t.solid?1:0,t.pit?1:0,t.losBlocking?1:0);
        }
        for (const t of transitions) {
          const type = String(t.type).endsWith("EXIT") ? "EXIT" : "ENTRANCE";
          this.sql.exec(`INSERT INTO level_transitions (transition_id,depth,pos,type,target_depth) VALUES (?,?,?,?,?)`,
            `spd_${depth}_${Number(t.pos)}_${String(t.type)}`,depth,Number(t.pos),type,Number(t.targetDepth));
        }
        for (const m of mobs) {
          const initialCooldown = Math.max(0, Math.min(100000, Number(m.cooldown) || 0));
          const nativeState = String(m.state || "WANDERING").slice(0, 40);
          this.sql.exec(`INSERT OR REPLACE INTO mobs (mob_id,depth,name,pos,hp,ht,str,dmg_max,next_act_at,state)
            VALUES (?,?,?,?,?,?,8,6,?,?)`,
            Number(m.mobId),depth,String(m.name).slice(0,80),Number(m.pos),Number(m.hp),Math.max(1,Number(m.ht)),
            this.worldTime + initialCooldown, nativeState);
        }
        if (isNativeWorldMutation) {
          const committedMutationLock = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "nativeMutationPending:" + session.playerId).toArray()[0];
          if (isNativeMutationLockForRequest(committedMutationLock?.value, session.playerId,
              verifiedMutationRequestId, verifiedMutationAction)) {
            this.sql.exec("DELETE FROM room_meta WHERE key = ?", "nativeMutationPending:" + session.playerId);
          }
          if ((verifiedMutationAction === "PICKUP" || verifiedMutationAction === "BUY" || verifiedMutationAction === "BUYBACK") && verifiedMutationDetails) this.sql.exec(
            "DELETE FROM claimed_item_instances WHERE depth = ? AND branch = ? AND heap_id = ? AND item_id = ? AND claimed_by = ? AND request_id = ?",
            depth, Number(level.branch),
            String((verifiedMutationAction === "BUYBACK" ? verifiedMutationDetails.shopEntityId : verifiedMutationDetails.heapId) || ""),
            String((verifiedMutationAction === "BUYBACK" ? verifiedMutationDetails.buybackItemId : verifiedMutationDetails.itemId) || ""),
            session.playerId, verifiedMutationRequestId);
          if (verifiedMutationAction === "OPEN_CHEST" && verifiedMutationDetails) this.sql.exec(
            "DELETE FROM claimed_chest_instances WHERE depth = ? AND heap_id = ? AND claimed_by = ? AND request_id = ?",
            depth, String(verifiedMutationDetails.heapId || ""), session.playerId, verifiedMutationRequestId);
          this.currentSequence++;
          const mutationEvent = { action: verifiedMutationAction || "WORLD",
            playerId: session.playerId, depth, from: verifiedMutationFrom,
            targetPos: verifiedMutationTargetPos };
          this.sql.exec("INSERT INTO events (sequence,sender_id,event_type,payload) VALUES (?,?,?,?)",
            this.currentSequence, session.playerId, "NATIVE_WORLD_MUTATION", JSON.stringify(mutationEvent));
        }
        if (isNativeWorldTurn) {
          this.currentSequence++;
          const actorEvent = {
            turnCounter: Number(level.nativeWorldTurnCounter),
            actorKind: String(level.nativeWorldActorKind),
            actorClass: String(level.nativeWorldActorClass),
            actorEntityId: String(level.nativeWorldActorEntityId || ""),
            mobEntityId: String(level.nativeMobEntityId || ""),
            actorClock: Number(level.nativeActorClock),
            depth
          };
          this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            "nativeWorldTurnCounter", String(level.nativeWorldTurnCounter));
          this.sql.exec("INSERT INTO events (sequence,sender_id,event_type,payload) VALUES (?,?,?,?)",
            this.currentSequence, session.playerId, "NATIVE_WORLD_TURN", JSON.stringify(actorEvent));
        }
        const transitionPendingNow = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray()[0];
        if (transitionPendingNow && !isNativeWorldTurn) {
          let pending: any = null;
          try { pending = JSON.parse(String(transitionPendingNow.value)); } catch (_) {}
          if (pending && pending.depth === depth && pending.snapshotReady !== true) {
            pending.snapshotReady = true;
            this.sql.exec("UPDATE room_meta SET value = ? WHERE key = 'transitionPending'", JSON.stringify(pending));
          }
        }

        const ackTurnRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "nativeWorldTurnCounter").toArray()[0];
        const ackTurnCounter = Math.max(0, Number(ackTurnRow?.value) || Number(level.nativeWorldTurnCounter) || 0);
        ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ACK", requestId: msg.requestId,
          sequence: this.currentSequence, payloadJson: JSON.stringify({ accepted: true, source: "SPD_JAVA_GENERATOR",
            depth,width,height,tileCount: tiles.length,transitionCount: transitions.length,mobCount: mobs.length,
            nativeWorldTurnCounter: ackTurnCounter,
            entities: mobs.map((mob: any) => ({ mobId: Number(mob.mobId), entityId: String(mob.entityId) })) }) }));
        if (isNativeWorldTurn || isNativeWorldMutation) {
          // Broadcast the complete server-committed world to peers, not a guessed delta.
          const events = this.sql.exec("SELECT sequence,sender_id,event_type,payload FROM events ORDER BY sequence ASC").toArray();
          const players = this.sql.exec("SELECT player_id,class_name,pos,hp,ht,ready,state FROM players").toArray().map((player: any) => {
            const savedHero = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + String(player.player_id)).toArray()[0];
            return { ...player, hero_state_json: savedHero && typeof savedHero.value === "string" ? String(savedHero.value) : "" };
          });
          const liveMobs = this.sql.exec("SELECT mob_id,name,pos,hp,ht FROM mobs WHERE depth = ?", this.currentDepth).toArray();
          const snapshotPayload = {
            sequence: this.currentSequence, seed: this.matchSeed, depth: this.currentDepth, gameMode: this.gameMode,
            players, mobs: liveMobs, events, worldTime: this.worldTime, level: this.getCurrentLevelSnapshot()
          };
          const message = JSON.stringify({ protocolVersion: "1.0.0", messageType: "SNAPSHOT",
            senderId: session.playerId, sequence: this.currentSequence, payloadJson: JSON.stringify(snapshotPayload) });
          for (const peer of this.state.getWebSockets()) {
            if (peer === ws) continue;
            const peerSession = peer.deserializeAttachment() as SessionData | null;
            if (!peerSession || peerSession.playerId === session.playerId) continue;
            peer.send(message);
          }
        }
        if (transitionPendingNow && !isNativeWorldTurn) this.tryFinalizeLevelTransition();
        return;
  }

  protected async handleLevelReady(ws: WebSocket, msg: NetworkMessage, session: SessionData) {
        const pendingRow = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray()[0];
        if (!pendingRow) return;
        try {
          const pending = JSON.parse(String(pendingRow.value));
          const ready = JSON.parse(msg.payloadJson || "{}");
          const heroStateJson = ready.heroStateJson;
          const hero = typeof heroStateJson === "string" ? JSON.parse(heroStateJson) : null;
          if (!pending || ready.depth !== pending.depth || ready.branch !== 0
              || typeof ready.seed !== "number" || !Number.isFinite(ready.seed)
              || !hero || !Number.isInteger(hero.hp) || hero.hp < 0
              || !Number.isInteger(hero.ht) || hero.ht < 1 || hero.hp > hero.ht
              || !Number.isInteger(hero.pos) || !Number.isInteger(hero.shielding) || hero.shielding < 0
              || !isValidNativeHeroStateJson(heroStateJson, {
                hp: hero.hp, ht: hero.ht, pos: hero.pos, shielding: hero.shielding
              })) {
            ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
              sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "INVALID_LEVEL_READY" }) }));
            return;
          }
          this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            `transitionReady:${session.playerId}`,
            JSON.stringify({ depth: ready.depth, branch: ready.branch, seed: ready.seed, heroStateJson }));
          this.tryFinalizeLevelTransition();
        } catch (_) {
          ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
            sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "INVALID_LEVEL_READY" }) }));
        }
        return;
  }

  protected handleActionInTransaction(ws: WebSocket, msg: NetworkMessage, session: SessionData) {
        if (this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray().length > 0) {
          ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
            sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "TRANSITION_PENDING" }) }));
          return;
        }
        if (this.gameStatus === "ENDED") {
          ws.send(JSON.stringify({
            protocolVersion: "1.0.0",
            messageType: "ERROR",
            requestId: msg.requestId,
            sequence: this.currentSequence,
            payloadJson: JSON.stringify({ error: "MATCH_ALREADY_ENDED" })
          }));
          return;
        }

        // Persistent Deduplication Check
        if (msg.requestId) {
          const dupRow = this.sql.exec(`SELECT player_id, sequence, result_json FROM processed_actions WHERE request_id = ?`, msg.requestId).toArray();
          if (dupRow.length > 0) {
            if (classifyRequestReplay(dupRow[0], session.playerId) === "CONFLICT") {
              ws.send(JSON.stringify({
                protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
                sequence: this.currentSequence, payloadJson: JSON.stringify({ error: "REQUEST_ID_CONFLICT" })
              }));
              return;
            }
            const origSeq = Number(dupRow[0].sequence);
            const origResult = String(dupRow[0].result_json);
            ws.send(JSON.stringify({
              protocolVersion: "1.0.0",
              messageType: "ACTION_ACCEPTED",
              requestId: msg.requestId,
              sequence: origSeq,
              payloadJson: origResult
            }));
            return;
          }
        }

        let eventType = "PLAYER_MOVED";
        let actionResultPayload: any = {};
        let actionValid = false;
        let actionErrorCode = "INVALID_ACTION";
        let actionCost = 1.0;
        let actionOwnerId = session.playerId;
        let pendingCombatForCleanup: any = null;
        let actionStrForLock = "";

        try {
          const payload = typeof msg.payloadJson === "string" ? JSON.parse(msg.payloadJson) : msg.payloadJson;
          let targetPos = -1;

          if (payload.data) {
            if (payload.data.to !== undefined) targetPos = Number(payload.data.to);
            else if (payload.data.targetPos !== undefined) targetPos = Number(payload.data.targetPos);
            else if (payload.data.pos !== undefined) targetPos = Number(payload.data.pos);
          } else {
            if (payload.to !== undefined) targetPos = Number(payload.to);
            else if (payload.targetPos !== undefined) targetPos = Number(payload.targetPos);
            else if (payload.pos !== undefined) targetPos = Number(payload.pos);
          }

          const actionStr = payload.action || payload.data?.action;
          actionStrForLock = String(actionStr || "");
          let authorityPending: any = null;
          const nativeMutationLockKey = "nativeMutationPending:" + session.playerId;
          const nativeMutationLockRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", nativeMutationLockKey).toArray()[0];
          const currentLockStatus = classifyNativeMutationLock(nativeMutationLockRow?.value,
            session.playerId, String(msg.requestId || ""), String(actionStr || ""));
          if (currentLockStatus === "STALE") {
            this.sql.exec("DELETE FROM room_meta WHERE key = ?", nativeMutationLockKey);
            actionErrorCode = "NATIVE_MUTATION_RESYNC_REQUIRED";
          } else if (currentLockStatus === "PENDING") {
            actionErrorCode = "NATIVE_MUTATION_PENDING";
          }

          if (actionErrorCode === "NATIVE_MUTATION_PENDING" || actionErrorCode === "NATIVE_MUTATION_RESYNC_REQUIRED") {
            // Fail closed until the previous stateful mutation receives its authoritative native post-state.
          } else if (actionStr === "SYNC_PLAYER_COMBAT" && isValidNativeCombatRequestId(msg.requestId)) {
            const data = payload.data || {};
            const pendingRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "pendingCombat:" + String(data.combatRequestId || msg.requestId || "")).toArray()[0];
            let pending: any = null;
            try { pending = pendingRow && typeof pendingRow.value === "string" ? JSON.parse(String(pendingRow.value)) : null; } catch (_) {}
            pendingCombatForCleanup = pending;
            if (pending && typeof pending.attackerId === "string") actionOwnerId = pending.attackerId;
            const defenderId = String(pending?.targetId || "");
            const attackerId = String(pending?.attackerId || "");
            const defenderRow = defenderId ? this.sql.exec("SELECT pos,hp,ht,state FROM players WHERE player_id = ?", defenderId).toArray() : [];
            const attackerRow = attackerId ? this.sql.exec("SELECT pos,hp,ht,state FROM players WHERE player_id = ?", attackerId).toArray() : [];
            const trustedRow = defenderId ? this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + defenderId).toArray()[0] : null;
            const trustedState = trustedRow && typeof trustedRow.value === "string" ? String(trustedRow.value) : "";
            const attackerStateRow = attackerId ? this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + attackerId).toArray()[0] : null;
            const trustedAttackerState = attackerStateRow && typeof attackerStateRow.value === "string" ? String(attackerStateRow.value) : "";
            let trusted: any = null;
            try { trusted = JSON.parse(trustedState); } catch (_) {}
            const hpBefore = Number(data.targetHpBefore), htBefore = Number(data.targetHtBefore);
            const hpAfter = Number(data.targetHp), htAfter = Number(data.targetHt), damage = Number(data.damage);
            const posBefore = Number(data.targetPos), posAfter = Number(data.targetPosAfter);
            const shieldBefore = Number(data.targetShieldBefore), shieldAfter = Number(data.targetShieldAfter);
            const widthRow = this.sql.exec("SELECT width,height FROM levels WHERE depth = ?", this.currentDepth).toArray()[0];
            const width = Number(widthRow?.width || 0), levelSize = width * Number(widthRow?.height || 0);
            const attackerPos = Number(attackerRow[0]?.pos), defenderPos = Number(defenderRow[0]?.pos);
            const nativeCost = Number(data.engineActionCost), distance = Number(data.engineDistance), ranged = data.engineRanged === true;
            const targetBuffsValid = hasMatchingNativeHeroBuffSnapshot(data.targetBuffsBefore, trustedState);
            const hpDeltaValid = isValidNativeHpTransition(hpBefore, hpAfter, damage)
              || (hpAfter > hpBefore && hasValidBlessedAnkhConsumption(trustedState, data.targetHeroStateJson));
            const blessedTargetRevival = hasValidBlessedAnkhConsumption(trustedState, data.targetHeroStateJson);
            const mergedState = mergeNativeHeroState(trustedState, String(data.targetHeroStateJson || ""), {
              hp: hpAfter, ht: htAfter, pos: posAfter, shielding: shieldAfter
            }, String(data.targetBuffs || ""), true, true, true, !blessedTargetRevival);
            // The defender-authority client also simulates the attacker's native Hero instance.
            // Persist its post-attack state (cooldowns, procs, inventory and reactive damage) so
            // the attacker cannot keep its separate optimistic RNG result.
            let mergedAttackerState: string | null = null;
            const levelPublisherRow = this.sql.exec(
              "SELECT value FROM room_meta WHERE key = 'levelPublisher'").toArray()[0];
            const secondaryMobAuthority = String(levelPublisherRow?.value || "") === session.playerId;
            const combatLevelRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?",
              `levelSnapshot:${this.currentDepth}`).toArray()[0];
            let combatLevel: any = null;
            try {
              combatLevel = combatLevelRow && typeof combatLevelRow.value === "string"
                ? JSON.parse(String(combatLevelRow.value)) : null;
            } catch (_) { combatLevel = null; }
            // The authority owner is not necessarily the shared-level publisher. Validate the
            // complete secondary result in either case; only the publisher may commit shared mobs.
            const secondaryMobPayload = parseAndValidateNativeSecondaryMobDeltas(
              data.secondaryMobDeltas, combatLevel?.mobs, levelSize, width, true);
            const secondaryDeathPositions = (secondaryMobPayload?.deltas || [])
              .filter((delta: any) => Number(delta.hpAfter) === 0)
              .map((delta: any) => Number(delta.posAfter));
            const secondaryHasDeaths = secondaryDeathPositions.length > 0;
            mergedAttackerState = this.reconcileCombatAttackerState(
              pending, payload.heroStateJson, secondaryHasDeaths && secondaryMobAuthority);
            const rewardIds = secondaryHasDeaths && secondaryMobAuthority
              ? nativeMobKillRewardIds(this.currentDepth, "", 1, secondaryMobPayload?.deltas || [])
              : [];
            const existingRewardIds = rewardIds == null ? [] : rewardIds.filter(rewardId =>
              this.sql.exec("SELECT reward_id FROM native_mob_reward_claims WHERE reward_id = ?", rewardId).toArray().length > 0);
            const rewardsUnclaimed = rewardIds != null
              && areNativeMobRewardClaimsAvailable(rewardIds, existingRewardIds);
            const pvpProjectileTarget = Number(data.projectileMutation?.targetPos);
            const secondaryLootPositions = data.projectileOutcome === "HEAP"
              ? [...secondaryDeathPositions, ...(Number.isInteger(pvpProjectileTarget) ? [pvpProjectileTarget] : [])]
              : secondaryDeathPositions;
            const secondaryLootValid = secondaryMobPayload != null
              && (secondaryDeathPositions.length === 0
                ? secondaryMobPayload.heaps === undefined
                : isValidNativeLootSnapshot(secondaryMobPayload.heaps, combatLevel?.heaps,
                    secondaryLootPositions, levelSize)
                  && (data.projectileMutation == null || sameNativeItemValue(data.heaps, secondaryMobPayload.heaps)));
            const validProjectileResult = isValidNativeProjectileCombatResult(
              combatLevel?.heaps, data, posBefore, secondaryDeathPositions, levelSize);
            // An incomplete secondary side-effect must not cancel an otherwise valid player
            // attack. It is deliberately not committed and instead forces a full publisher snapshot.
            const secondaryMobResyncRequired = secondaryMobPayload == null || !secondaryLootValid
              || secondaryMobPayload.deltas.length > 0;
            const authorityValid = !!pending && pending.targetType === "PLAYER"
              && String(pending.requestId) === String(data.combatRequestId)
              && Number.isFinite(Number(pending.createdAt)) && Date.now() - Number(pending.createdAt) <= 15000
              && String(pending.authorityId) === session.playerId && defenderId === session.playerId
              && String(pending.attackerId) === String(data.attackerId) && attackerId !== defenderId
              && hasMatchingNativeAttackIntent(data, pending)
              && validProjectileResult
              && !(data.projectileMutation != null && secondaryHasDeaths && !secondaryMobAuthority)
              && String(data.targetType) === "PLAYER" && String(data.targetId) === defenderId
              && Number(pending.depth) === this.currentDepth && defenderRow.length > 0 && attackerRow.length > 0
              && String(defenderRow[0].state) === "ALIVE" && String(attackerRow[0].state) === "ALIVE"
              && Number(pending.attackerPos) === attackerPos && Number(data.attackerPos) === attackerPos
              && hasMatchingNativeHeroStateSnapshot(pending.attackerStateBefore, trustedAttackerState)
              && hasMatchingNativeHeroStateSnapshot(data.targetHeroStateBefore, trusted)
              && hpBefore === Number(defenderRow[0].hp) && htBefore === Number(defenderRow[0].ht)
              && posBefore === defenderPos && Number(pending.targetPos) === defenderPos
              && shieldBefore === Number(trusted?.shielding) && targetBuffsValid
              && isValidNativeCombatBuffs(data.targetBuffs)
              && isValidNativeHeroStateJson(String(data.targetHeroStateJson || ""), { hp: hpAfter, ht: htAfter, pos: posAfter, shielding: shieldAfter })
              && mergedState !== null && mergedAttackerState !== null && hpDeltaValid && rewardsUnclaimed
              && Number.isInteger(hpAfter) && hpAfter >= 0 && Number.isInteger(htAfter) && htAfter >= 1 && hpAfter <= htAfter
              && Number.isInteger(posAfter) && posAfter >= 0 && posAfter < levelSize
              && Number.isInteger(shieldAfter) && shieldAfter >= 0 && shieldAfter <= 100000
              && Number.isFinite(nativeCost) && nativeCost > 0 && nativeCost <= 10
              && Number.isFinite(distance) && data.engineResult === true
              && distance === Math.max(Math.abs((attackerPos % width) - (defenderPos % width)),
                Math.abs(Math.floor(attackerPos / width) - Math.floor(defenderPos / width)))
              && (ranged ? this.hasLineOfSight(attackerPos, defenderPos, this.currentDepth) : this.isMeleeAdjacent(attackerPos, defenderPos, this.currentDepth))
              && (posAfter === posBefore || (this.isValidCombatTargetPosition(posAfter, this.currentDepth)
                && Math.max(Math.abs((posAfter % width) - (posBefore % width)),
                  Math.abs(Math.floor(posAfter / width) - Math.floor(posBefore / width))) <= 2));
            if (authorityValid) {
              const newStatus = hpAfter > 0 ? "ALIVE"
                : this.gameMode === "DEATHMATCH" ? "ALIVE"
                  : this.gameMode === "PVP_ARENA" ? "SPECTATOR" : "DEAD";
              this.sql.exec("UPDATE players SET hp = ?, ht = ?, pos = ?, state = ? WHERE player_id = ?",
                hpAfter, htAfter, posAfter, newStatus, defenderId);
              if (hpAfter <= 0) {
                this.sql.exec("UPDATE players SET kills = kills + 1, score = score + 1 WHERE player_id = ?", attackerId);
                this.sql.exec("UPDATE players SET deaths = deaths + 1 WHERE player_id = ?", defenderId);
              }
              this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                "heroState:" + defenderId, mergedState);
              const mergedAttacker = JSON.parse(mergedAttackerState as string);
              const attackerStatus = Number(mergedAttacker.hp) > 0 ? "ALIVE"
                : this.gameMode === "DEATHMATCH" ? "ALIVE"
                  : this.gameMode === "PVP_ARENA" ? "SPECTATOR" : "DEAD";
              this.sql.exec("UPDATE players SET hp = ?, ht = ?, pos = ?, state = ? WHERE player_id = ?",
                Number(mergedAttacker.hp), Number(mergedAttacker.ht), Number(mergedAttacker.pos),
                attackerStatus, attackerId);
              this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                "heroState:" + attackerId, mergedAttackerState as string);
              if (String(attackerRow[0].state) === "ALIVE" && (attackerStatus === "DEAD" || attackerStatus === "SPECTATOR")) {
                this.sql.exec("UPDATE players SET deaths = deaths + 1 WHERE player_id = ?", attackerId);
              }
              // A PvP combat may trigger secondary mob effects (for example LifeLink).
              // Commit those shared-world mutations only if the defender is the designated
              // level publisher; otherwise retain server-owned mob state and force all peers
              // to resynchronize to the publisher's version.
              if (secondaryMobAuthority && secondaryMobPayload != null
                  && secondaryLootValid && secondaryMobPayload.deltas.length > 0) {
                for (const delta of secondaryMobPayload.deltas) {
                  const mobIndex = (combatLevel.mobs as any[]).findIndex(
                    (mob: any) => String(mob?.entityId || "") === delta.entityId);
                  if (mobIndex < 0) throw new Error("Secondary PvP combat mob missing from snapshot");
                  const savedSecondary = combatLevel.mobs[mobIndex];
                  const secondaryMobId = Number(savedSecondary.mobId);
                  savedSecondary.hp = Number(delta.hpAfter);
                  savedSecondary.ht = Number(delta.htAfter);
                  savedSecondary.pos = Number(delta.posAfter);
                  savedSecondary.shielding = Number(delta.shieldAfter);
                  savedSecondary.buffs = JSON.parse(String(delta.buffsAfter));
                  savedSecondary.serializedBundle = String(delta.serializedBundleAfter);
                  this.sql.exec("UPDATE mobs SET hp = ?, ht = ?, pos = ? WHERE mob_id = ? AND depth = ?",
                    Number(delta.hpAfter), Number(delta.htAfter), Number(delta.posAfter), secondaryMobId, this.currentDepth);
                  if (Number(delta.hpAfter) <= 0) {
                    combatLevel.mobs.splice(mobIndex, 1);
                    this.sql.exec("DELETE FROM mobs WHERE mob_id = ? AND depth = ?",
                      secondaryMobId, this.currentDepth);
                  }
                }
                if (secondaryDeathPositions.length > 0) {
                  combatLevel.heaps = secondaryMobPayload.heaps;
                }
                this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                  `levelSnapshot:${this.currentDepth}`, JSON.stringify(combatLevel));
              } else if (!secondaryMobAuthority && secondaryMobPayload != null && secondaryLootValid
                  && data.projectileOutcome === "HEAP" && !secondaryHasDeaths) {
                // Only the exact projectile heap delta is accepted from a non-publisher authority.
                combatLevel.heaps = data.projectileHeaps;
                this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                  `levelSnapshot:${this.currentDepth}`, JSON.stringify(combatLevel));
              }
              for (const rewardId of rewardIds || []) {
                this.sql.exec("INSERT OR IGNORE INTO native_mob_reward_claims (reward_id,player_id,request_id,depth) VALUES (?,?,?,?)",
                  rewardId, attackerId, String(msg.requestId || ""), this.currentDepth);
              }
              this.clearPendingCombat(pending);
              eventType = "PLAYER_ATTACKED";
              actionResultPayload = {
                attackerId, attackerType: "PLAYER", targetId: defenderId, targetType: "PLAYER",
                targetPos: posBefore, targetPosAfter: posAfter, targetHpBefore: hpBefore, targetHtBefore: htBefore,
                targetHp: hpAfter, targetHt: htAfter, targetShieldBefore: shieldBefore, targetShieldAfter: shieldAfter,
                targetBuffsBefore: data.targetBuffsBefore, targetBuffs: data.targetBuffs,
                targetHeroStateJson: mergedState, targetState: newStatus,
                attackerStateJson: mergedAttackerState, attackerState: attackerStatus,
                damage, hit: data.engineHit === true, attackKind: data.attackKind,
                engineDistance: distance, engineActionCost: nativeCost,
                secondaryMobDeltas: secondaryMobPayload,
                secondaryMobResyncRequired: secondaryMobResyncRequired || (data.projectileOutcome === "HEAP" && !secondaryMobAuthority),
                projectileOutcome: data.projectileOutcome,
                projectileResultItemId: data.projectileMutation?.resultItemId,
                engineResolved: true
              };
              actionValid = true; actionCost = nativeCost;
            }
          } else if (actionStr === "SYNC_MOB_STATE" && isValidNativeCombatRequestId(msg.requestId)) {
            const data = payload.data || {};
            if (typeof data.combatRequestId === "string" || typeof data.targetEntityId === "string") {
              const combatRequestKey = String(data.combatRequestId || msg.requestId || "");
              const pendingRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "pendingCombat:" + combatRequestKey).toArray()[0];
              try { authorityPending = pendingRow && typeof pendingRow.value === "string" ? JSON.parse(String(pendingRow.value)) : null; } catch (_) { authorityPending = null; }
              pendingCombatForCleanup = authorityPending;
              if (authorityPending && typeof authorityPending.attackerId === "string") actionOwnerId = authorityPending.attackerId;
              const publisherRow = this.sql.exec("SELECT value FROM room_meta WHERE key = 'levelPublisher'").toArray()[0];
              const levelRow = this.sql.exec("SELECT width,height FROM levels WHERE depth = ?", this.currentDepth).toArray()[0];
              const width = Number(levelRow?.width || 0), height = Number(levelRow?.height || 0), levelSize = width * height;
              const levelSnapshotRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "levelSnapshot:" + this.currentDepth).toArray()[0];
              let levelSnapshot: any = null;
              try { levelSnapshot = levelSnapshotRow && typeof levelSnapshotRow.value === "string" ? JSON.parse(String(levelSnapshotRow.value)) : null; } catch (_) { levelSnapshot = null; }
              const attackerId = String(authorityPending?.attackerId || "");
              const mobId = resolveServerMobIdByEntityId(levelSnapshot, data.targetEntityId);
              const savedMob = mobId == null ? null : (Array.isArray(levelSnapshot?.mobs) ? levelSnapshot.mobs : []).find((mob: any) => Number(mob?.mobId) === mobId);
              const mobRow = mobId == null ? [] : this.sql.exec("SELECT hp,ht,pos FROM mobs WHERE mob_id = ? AND depth = ?", mobId, this.currentDepth).toArray();
              const attackerRow = attackerId ? this.sql.exec("SELECT pos,hp,ht,state FROM players WHERE player_id = ?", attackerId).toArray() : [];
              const attackerPos = Number(attackerRow[0]?.pos), targetPos = Number(mobRow[0]?.pos);
              const targetPosAfter = Number(data.targetPosAfter), targetHp = Number(data.targetHp), targetHt = Number(data.targetHt), damage = Number(data.damage);
              const nativeCost = Number(data.engineActionCost), distance = Number(data.engineDistance), ranged = data.engineRanged === true;
              const secondaryMobPayload = parseAndValidateNativeSecondaryMobDeltas(
                data.secondaryMobDeltas, levelSnapshot?.mobs, levelSize, width, false, String(data.targetEntityId));
              const secondaryDeaths = (secondaryMobPayload?.deltas || []).filter((delta: any) => Number(delta.hpAfter) === 0).map((delta: any) => Number(delta.posAfter));
              const allDeaths = [...(targetHp <= 0 ? [targetPosAfter] : []), ...secondaryDeaths];
              const lootSnapshot = targetHp <= 0 ? data.heaps : secondaryDeaths.length > 0 ? secondaryMobPayload?.heaps : undefined;
              const projectileTargetCell = Number(data.projectileMutation?.targetPos);
              const lootAllowedPositions = data.projectileOutcome === "HEAP"
                ? [...allDeaths, ...(Number.isInteger(projectileTargetCell) ? [projectileTargetCell] : [])]
                : allDeaths;
              const validLoot = secondaryMobPayload != null && (allDeaths.length === 0
                ? data.heaps === undefined && secondaryMobPayload.heaps === undefined
                : isValidNativeLootSnapshot(lootSnapshot, levelSnapshot?.heaps, lootAllowedPositions, levelSize)
                  && (secondaryDeaths.length === 0 || sameNativeItemValue(data.heaps, secondaryMobPayload.heaps)));
              const validProjectileResult = isValidNativeProjectileCombatResult(
                levelSnapshot?.heaps, data, targetPos, allDeaths, levelSize);
              const mergedAttackerState = this.reconcileCombatAttackerState(
                authorityPending, payload.heroStateJson, allDeaths.length > 0);
              const rewardIds = nativeMobKillRewardIds(this.currentDepth, data.targetEntityId,
                targetHp, secondaryMobPayload?.deltas || []);
              const existingRewardIds = rewardIds == null ? [] : rewardIds.filter(rewardId =>
                this.sql.exec("SELECT reward_id FROM native_mob_reward_claims WHERE reward_id = ?", rewardId).toArray().length > 0);
              const rewardsUnclaimed = rewardIds != null
                && areNativeMobRewardClaimsAvailable(rewardIds, existingRewardIds);
              const targetBuffPreStateMatches = !!savedMob && hasMatchingNativeBuffSnapshot(data.targetBuffsBefore, savedMob.buffs);
              const targetShieldPreStateMatches = !!savedMob && hasMatchingNativeMobShieldSnapshot(data.targetShieldBefore, data.targetShieldAfter, savedMob.shielding);
              const targetMobBundleValid = targetHp <= 0 || isValidNativeMobBundle(data.targetMobBundleAfter);
              const authorityValid = !!authorityPending && String(authorityPending.requestId) === String(data.combatRequestId)
                && String(authorityPending.authorityId) === session.playerId && String(publisherRow?.value || "") === session.playerId
                && mergedAttackerState !== null && rewardsUnclaimed
                && authorityPending.targetType === "MOB" && Number(authorityPending.depth) === this.currentDepth
                && attackerId === String(data.attackerId) && String(authorityPending.targetEntityId) === String(data.targetEntityId)
                && Number(authorityPending.attackerPos) === attackerPos && Number(authorityPending.targetPos) === targetPos
                && hasMatchingNativeAttackIntent(data, authorityPending)
                && attackerRow.length > 0 && String(attackerRow[0].state) === "ALIVE"
                && mobRow.length > 0 && Number(mobRow[0].hp) > 0 && !!savedMob
                && Number(data.targetPos) === targetPos && Number(data.targetHpBefore) === Number(mobRow[0].hp)
                && Number(data.targetHtBefore) === Number(mobRow[0].ht) && targetBuffPreStateMatches && targetShieldPreStateMatches
                && hasStrictNativeCombatFields(data) && data.engineResult === true && targetMobBundleValid
                && Number.isFinite(nativeCost) && nativeCost > 0 && nativeCost <= 10 && Number.isFinite(distance)
                && (ranged ? this.hasLineOfSight(attackerPos, targetPos, this.currentDepth) : this.isMeleeAdjacent(attackerPos, targetPos, this.currentDepth))
                && (targetPosAfter === targetPos || (this.isValidCombatTargetPosition(targetPosAfter, this.currentDepth)
                  && this.isCombatDestinationFree(targetPosAfter, this.currentDepth, "MOB", Number(mobId))))
                && isValidNativeMissTransition(data.engineHit, data.targetHpBefore, targetHp, damage, data.targetShieldBefore,
                  data.targetShieldAfter, data.targetBuffsBefore, data.targetBuffs, targetPos, targetPosAfter)
                && validProjectileResult
                && isValidNativeCombatEvent({
                  schemaVersion: data.combatSchemaVersion, depth: data.combatDepth, currentDepth: this.currentDepth,
                  sessionPlayerId: attackerId, attackerId: data.attackerId, attackerPos: data.attackerPos,
                  authoritativeAttackerPos: attackerPos, targetType: "MOB", targetEntityId: data.targetEntityId,
                  expectedTargetEntityId: String(savedMob?.entityId || ""), targetAlive: Number(mobRow[0].hp) > 0,
                  targetPos: data.targetPos, authoritativeTargetPos: targetPos, targetPosAfter, levelSize,
                  targetMoveDistance: Math.max(Math.abs((targetPosAfter % width) - (targetPos % width)), Math.abs(Math.floor(targetPosAfter / width) - Math.floor(targetPos / width))),
                  previousHp: Number(mobRow[0].hp), previousHt: Number(mobRow[0].ht),
                  targetHpBefore: data.targetHpBefore, targetHtBefore: data.targetHtBefore, targetHp, targetHt, damage,
                  hit: data.engineHit, ranged, attackKind: data.attackKind, distance,
                  authoritativeDistance: Math.max(Math.abs((attackerPos % width) - (targetPos % width)), Math.abs(Math.floor(attackerPos / width) - Math.floor(targetPos / width))),
                  actionCost: nativeCost
                }) && validLoot;
              if (authorityValid && Number.isFinite(Number(authorityPending?.createdAt))
                  && Date.now() - Number(authorityPending.createdAt) <= 15000) {
                savedMob.hp = targetHp; savedMob.ht = targetHt; savedMob.pos = targetPosAfter;
                savedMob.shielding = Number(data.targetShieldAfter); savedMob.buffs = JSON.parse(String(data.targetBuffs));
                if (targetHp > 0) savedMob.serializedBundle = String(data.targetMobBundleAfter);
                if (allDeaths.length > 0) levelSnapshot.heaps = lootSnapshot;
                else if (data.projectileOutcome === "HEAP") levelSnapshot.heaps = data.projectileHeaps;
                this.sql.exec("UPDATE mobs SET hp = ?, ht = ?, pos = ? WHERE mob_id = ? AND depth = ?", targetHp, targetHt, targetPosAfter, mobId, this.currentDepth);
                for (const delta of secondaryMobPayload.deltas) {
                  const secondaryId = resolveServerMobIdByEntityId(levelSnapshot, delta.entityId);
                  const secondary = levelSnapshot.mobs.find((mob: any) => Number(mob.mobId) === Number(secondaryId));
                  if (secondaryId == null || !secondary) throw new Error("Validated secondary mob disappeared");
                  secondary.hp = delta.hpAfter; secondary.ht = delta.htAfter; secondary.pos = delta.posAfter;
                  secondary.shielding = delta.shieldAfter; secondary.buffs = JSON.parse(delta.buffsAfter);
                  secondary.serializedBundle = delta.serializedBundleAfter;
                  this.sql.exec("UPDATE mobs SET hp = ?, ht = ?, pos = ? WHERE mob_id = ? AND depth = ?", delta.hpAfter, delta.htAfter, delta.posAfter, secondaryId, this.currentDepth);
                }
                const deadMobEntityIds = [
                  ...(targetHp === 0 ? [String(data.targetEntityId)] : []),
                  ...secondaryMobPayload.deltas.filter((delta: any) => Number(delta.hpAfter) === 0)
                    .map((delta: any) => String(delta.entityId))
                ];
                const deletedMobIds = removeDeadNativeMobsFromSnapshot(levelSnapshot, deadMobEntityIds);
                if (deletedMobIds == null) throw new Error("Validated dead native mob identity disappeared");
                for (const deadMobId of deletedMobIds) {
                  this.sql.exec("DELETE FROM mobs WHERE mob_id = ? AND depth = ?", deadMobId, this.currentDepth);
                }
                this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                  "levelSnapshot:" + this.currentDepth, JSON.stringify(levelSnapshot));
                const attackerAfter = JSON.parse(mergedAttackerState as string);
                const attackerStatus = Number(attackerAfter.hp) > 0 ? "ALIVE"
                  : this.gameMode === "DEATHMATCH" ? "ALIVE"
                    : this.gameMode === "PVP_ARENA" ? "SPECTATOR" : "DEAD";
                this.sql.exec("UPDATE players SET hp = ?, ht = ?, pos = ?, state = ? WHERE player_id = ?",
                  Number(attackerAfter.hp), Number(attackerAfter.ht), Number(attackerAfter.pos), attackerStatus, String(authorityPending.attackerId));
                this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                  "heroState:" + String(authorityPending.attackerId), mergedAttackerState as string);
                // This stable receipt is independent of the request UUID: re-sending a kill under
                // a new request ID cannot award the same native Mob twice.
                for (const rewardId of rewardIds) {
                  this.sql.exec("INSERT OR IGNORE INTO native_mob_reward_claims (reward_id,player_id,request_id,depth) VALUES (?,?,?,?)",
                    rewardId, String(authorityPending.attackerId), String(msg.requestId || ""), this.currentDepth);
                }
                this.clearPendingCombat(authorityPending);
                eventType = "PLAYER_ATTACKED";
                actionResultPayload = {
                  attackerId, attackerType: "PLAYER", targetId: data.targetEntityId, targetType: "MOB",
                  sourceType: "PLAYER", sourceEntityId: attackerId, sourcePos: attackerPos, sourceAttackKind: data.attackKind,
                  attackerPos, targetPos, targetPosAfter, targetHpBefore: Number(data.targetHpBefore), targetHtBefore: Number(data.targetHtBefore),
                  targetShieldBefore: Number(data.targetShieldBefore), targetShieldAfter: Number(data.targetShieldAfter), targetHeroStateJson: null,
                  targetBuffsBefore: data.targetBuffsBefore,
                  targetMobBundleAfter: targetHp > 0 ? String(data.targetMobBundleAfter) : null,
                  hit: data.engineHit === true, damage, targetHp, targetHt,
                  attackKind: data.attackKind, engineDistance: distance, engineActionCost: nativeCost, targetBuffs: data.targetBuffs,
                  attackerStateJson: mergedAttackerState, attackerState: attackerStatus,
                  secondaryMobDeltas: secondaryMobPayload,
                  projectileOutcome: data.projectileOutcome,
                  projectileResultItemId: data.projectileMutation?.resultItemId,
                  engineResolved: true
                };
                actionValid = true; actionCost = nativeCost;
              }
            } else {
            const publisherRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = 'levelPublisher'`).toArray()[0];
            const levelRow = this.sql.exec(`SELECT width, height FROM levels WHERE depth = ?`, this.currentDepth).toArray()[0];
            const levelSnapshotRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`,
              `levelSnapshot:${this.currentDepth}`).toArray()[0];
            let levelSnapshot: any = null;
            try {
              levelSnapshot = levelSnapshotRow && typeof levelSnapshotRow.value === "string"
                ? JSON.parse(String(levelSnapshotRow.value)) : null;
            } catch (_) { levelSnapshot = null; }
            const width = Number(levelRow?.width || 0), height = Number(levelRow?.height || 0);
            const levelSize = width * height;
            const mobId = resolveServerMobIdByEntityId(levelSnapshot, data.entityId);
            const savedMob = mobId == null ? null
              : (Array.isArray(levelSnapshot?.mobs) ? levelSnapshot.mobs : [])
                  .find((mob: any) => Number(mob?.mobId) === mobId);
            const mobRow = mobId == null ? [] : this.sql.exec(
              `SELECT hp, ht, pos FROM mobs WHERE mob_id = ? AND depth = ?`, mobId, this.currentDepth
            ).toArray();
            // Preserve the trusted pre-event bundle before the accepted result mutates savedMob.
            const nativeMobBundleBefore = String(savedMob?.serializedBundle || "");
            const delta = {
              entityId: data.entityId,
              hpBefore: data.hpBefore, htBefore: data.htBefore, posBefore: data.posBefore,
              shieldBefore: data.shieldBefore, buffsBefore: data.buffsBefore,
              hpAfter: data.hpAfter, htAfter: data.htAfter, posAfter: data.posAfter,
              shieldAfter: data.shieldAfter, buffsAfter: data.buffsAfter,
              serializedBundleAfter: data.serializedBundleAfter
            };
            const ownerPayload = parseAndValidateNativeSecondaryMobDeltas({
              complete: true, deltas: [delta], ...(data.heaps === undefined ? {} : { heaps: data.heaps })
            }, levelSnapshot?.mobs, levelSize, width, true);
            const isOwner = isAuthorizedNativeMobOwner(session.playerId, publisherRow?.value);
            const nativeEnvelopeValid = data.combatSchemaVersion === 1
              && Number(data.combatDepth) === this.currentDepth
              && typeof data.sourceClass === "string" && data.sourceClass.length > 0 && data.sourceClass.length <= 256
              && data.engineDamageResult === true && ownerPayload != null
              && isValidNativeMobBundle(data.serializedBundleAfter)
              && !!savedMob && mobRow.length > 0
              && Number(mobRow[0].hp) === Number(data.hpBefore)
              && Number(mobRow[0].ht) === Number(data.htBefore)
              && Number(mobRow[0].pos) === Number(data.posBefore);
            const deadPositions = Number(data.hpAfter) === 0 ? [Number(data.posAfter)] : [];
            const validLoot = deadPositions.length > 0
              ? isValidNativeLootSnapshot(data.heaps, levelSnapshot?.heaps, deadPositions, levelSize)
              : data.heaps === undefined;
            if (isOwner && nativeEnvelopeValid && validLoot) {
              savedMob.hp = Number(data.hpAfter);
              savedMob.ht = Number(data.htAfter);
              savedMob.pos = Number(data.posAfter);
              savedMob.shielding = Number(data.shieldAfter);
              savedMob.buffs = JSON.parse(String(data.buffsAfter));
              if (Number(data.hpAfter) > 0) savedMob.serializedBundle = String(data.serializedBundleAfter);
              if (deadPositions.length > 0) levelSnapshot.heaps = data.heaps;
              if (Number(data.hpAfter) === 0) {
                const deletedMobIds = removeDeadNativeMobsFromSnapshot(levelSnapshot, [String(data.entityId)]);
                if (deletedMobIds == null) throw new Error("Validated dead native mob identity disappeared");
                for (const deadMobId of deletedMobIds) {
                  this.sql.exec(`DELETE FROM mobs WHERE mob_id = ? AND depth = ?`, deadMobId, this.currentDepth);
                }
              } else {
                this.sql.exec(`UPDATE mobs SET hp = ?, ht = ?, pos = ? WHERE mob_id = ? AND depth = ?`,
                  savedMob.hp, savedMob.ht, savedMob.pos, mobId, this.currentDepth);
              }
              this.sql.exec(`INSERT INTO room_meta (key,value) VALUES (?,?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
                `levelSnapshot:${this.currentDepth}`, JSON.stringify(levelSnapshot));
              eventType = "CHAR_DAMAGED";
              actionResultPayload = {
                targetId: data.entityId, targetType: "MOB",
                targetHpBefore: Number(data.hpBefore), targetHtBefore: Number(data.htBefore),
                targetHp: Number(data.hpAfter), targetHt: Number(data.htAfter),
                targetPosBefore: Number(data.posBefore), targetPosAfter: Number(data.posAfter),
                targetShieldBefore: Number(data.shieldBefore), targetShieldAfter: Number(data.shieldAfter),
                targetBuffsBefore: data.buffsBefore, targetBuffs: data.buffsAfter,
                targetMobBundleAfter: Number(data.hpAfter) > 0 ? String(data.serializedBundleAfter) : null,
                nativeActorId: Number(savedMob.mobId),
                nativeMobBundleBefore,
                nativeMobBundleAfterEvidence: String(data.serializedBundleAfter),
                nativeMobRewardClassName: String(savedMob.rewardClassName || ""),
                nativeMobRewardEligible: savedMob.rewardEligible === true,
                nativeMobRewardExp: Number(savedMob.rewardExp),
                nativeMobRewardMaxLevel: Number(savedMob.rewardMaxLevel),
                nativeMobRewardSpawningWeight: Number(savedMob.rewardSpawningWeight),
                nativeMobRewardMonkEnergy: Number(savedMob.rewardMonkEnergy),
                sourceType: "ENVIRONMENT", sourceClass: data.sourceClass,
                engineResolved: true, ...(deadPositions.length > 0 ? { heaps: data.heaps } : {})
              };
              actionValid = true;
              actionCost = 0;
            }
            }
          } else if (actionStr === "SYNC_HERO_STATE" && isValidNativeCombatRequestId(msg.requestId)) {
            const data = payload.data;
            if (data?.sourceType === "BUFF_TICK") {
              const playerRow = this.sql.exec(
                "SELECT pos,hp,ht,state FROM players WHERE player_id = ?", session.playerId
              ).toArray()[0];
              const previousHeroRow = this.sql.exec(
                "SELECT value FROM room_meta WHERE key = ?", "heroState:" + session.playerId
              ).toArray()[0];
              const savedLevelRow = this.sql.exec(
                "SELECT value FROM room_meta WHERE key = ?", "levelSnapshot:" + this.currentDepth
              ).toArray()[0];
              let previousHeroState: any = null, beforeHeroState: any = null;
              let afterHeroState: any = null, levelSnapshot: any = null;
              try {
                previousHeroState = previousHeroRow && typeof previousHeroRow.value === "string"
                  ? JSON.parse(String(previousHeroRow.value)) : null;
                beforeHeroState = typeof data.heroStateBeforeJson === "string"
                  ? JSON.parse(data.heroStateBeforeJson) : null;
                afterHeroState = typeof payload.heroStateJson === "string"
                  ? JSON.parse(payload.heroStateJson) : null;
                levelSnapshot = savedLevelRow && typeof savedLevelRow.value === "string"
                  ? JSON.parse(String(savedLevelRow.value)) : null;
              } catch (_) {
                previousHeroState = null;
                beforeHeroState = null;
                afterHeroState = null;
                levelSnapshot = null;
              }
              const levelPublisherRow = this.sql.exec(
                "SELECT value FROM room_meta WHERE key = 'levelPublisher'").toArray()[0];
              const isLevelPublisher = String(levelPublisherRow?.value || "") === session.playerId;
              const levelSize = Number(levelSnapshot?.width || 0) * Number(levelSnapshot?.height || 0);
              const isPoisonBuffTick = String(data?.buffClass || "")
                === "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Poison";
              const sequenceBefore = Number(data?.sequenceBefore);
              const sequenceBeforeValid = Number.isSafeInteger(sequenceBefore)
                && sequenceBefore >= 0 && sequenceBefore <= this.currentSequence;
              const lastOwnHeroBuffRow = isPoisonBuffTick ? this.sql.exec(
                "SELECT sequence FROM events WHERE sender_id = ? AND event_type = 'HERO_BUFF_TICKED' ORDER BY sequence DESC LIMIT 1",
                session.playerId).toArray()[0] : null;
              const lastOwnHeroBuffSequence = Number(lastOwnHeroBuffRow?.sequence || 0);
              // Require the baseline to include the latest accepted Hero Buff tick from this
              // sender; otherwise an old LifeLink damage event could be replayed with baseline 0.
              const sequenceBaselineFresh = sequenceBeforeValid
                && Number.isSafeInteger(lastOwnHeroBuffSequence)
                && sequenceBefore >= lastOwnHeroBuffSequence;
              const lifeLinkMobActorIds = !isPoisonBuffTick ? []
                : beforeHeroState ? nativeHeroBuffLifeLinkMobActorIds(data.heroStateBeforeJson) : null;
              const lifeLinkMobEntityIds = !isPoisonBuffTick ? []
                : (sequenceBaselineFresh && lifeLinkMobActorIds !== null && levelSnapshot)
                  ? nativeHeroBuffLifeLinkMobEntityIds(data.heroStateBeforeJson, levelSnapshot, []) : null;
              const secondaryMobPayload = !isPoisonBuffTick
                ? parseAndValidateNativeLifeLinkMobDeltas(data.secondaryMobDeltas,
                    levelSnapshot?.mobs, [], levelSize, Number(levelSnapshot?.width || 0))
                : (sequenceBaselineFresh && lifeLinkMobActorIds !== null
                    && lifeLinkMobEntityIds !== null && levelSnapshot)
                  ? parseAndValidateNativeLifeLinkMobDeltas(data.secondaryMobDeltas,
                    levelSnapshot.mobs, lifeLinkMobEntityIds, levelSize,
                    Number(levelSnapshot.width || 0))
                  : null;
              const lifeLinkMobDamageEvents = isPoisonBuffTick && secondaryMobPayload != null
                ? buildNativeLifeLinkMobDamageEvents(secondaryMobPayload, levelSnapshot?.mobs,
                    session.playerId, sequenceBefore)
                : [];
              const lifeLinkMobEvidenceValid = !isPoisonBuffTick || lifeLinkMobDamageEvents !== null;
              const secondaryMobRowsMatch = secondaryMobPayload != null
                && secondaryMobPayload.deltas.every((delta: any) => {
                  const saved = Array.isArray(levelSnapshot?.mobs)
                    ? levelSnapshot.mobs.find((mob: any) => String(mob?.entityId || "") === String(delta.entityId))
                    : null;
                  if (!saved) return false;
                  const row = this.sql.exec(
                    "SELECT hp,ht,pos FROM mobs WHERE mob_id = ? AND depth = ?",
                    Number(saved.mobId), this.currentDepth).toArray()[0];
                  return !!row && Number(row.hp) === Number(delta.hpBefore)
                    && Number(row.ht) === Number(delta.htBefore)
                    && Number(row.pos) === Number(delta.posBefore);
                });
              const secondaryDeathPositions = (secondaryMobPayload?.deltas || [])
                .filter((delta: any) => Number(delta.hpAfter) === 0)
                .map((delta: any) => Number(delta.posAfter));
              // Commit the complete native LifeLink Mob result with this Hero Buff tick; the server
              // validates and persists both sides as one ACTION transaction.
              const secondaryLootValid = secondaryMobPayload != null
                && (secondaryDeathPositions.length === 0
                  ? secondaryMobPayload.heaps === undefined
                  : isValidNativeLootSnapshot(secondaryMobPayload.heaps, levelSnapshot?.heaps,
                      secondaryDeathPositions, levelSize));
              // Non-publishers may report a Poison tick with no shared Mob side effect, but may
              // not author a LifeLink Mob mutation. A changed shared Mob is committed only with
              // its exact complete native bundle and, on death, the matching loot snapshot.
              const secondaryMobAuthority = secondaryMobPayload != null
                // Actor IDs are process-local. A client that is not the level publisher cannot
                // safely map its LifeLink.object to the publisher's Mob IDs, even when they happen
                // to collide numerically; require the publisher for every linked Poison tick.
                && ((lifeLinkMobEntityIds!.length === 0) || isLevelPublisher)
                && (secondaryMobPayload.deltas.length === 0 || isLevelPublisher);
              const secondaryRewardIds = secondaryDeathPositions.length > 0
                ? nativeMobKillRewardIds(this.currentDepth, "", 1, secondaryMobPayload?.deltas || []) : [];
              const existingSecondaryRewardIds = (secondaryRewardIds || []).filter(rewardId =>
                this.sql.exec("SELECT reward_id FROM native_mob_reward_claims WHERE reward_id = ?", rewardId).toArray().length > 0);
              const secondaryRewardsUnclaimed = secondaryRewardIds != null
                && areNativeMobRewardClaimsAvailable(secondaryRewardIds, existingSecondaryRewardIds);
              const validHeroBuffTick = !!playerRow && !!previousHeroState && !!beforeHeroState && !!afterHeroState
                && String(playerRow.state) === "ALIVE"
                && Number(previousHeroState.hp) === Number(playerRow.hp)
                && Number(previousHeroState.ht) === Number(playerRow.ht)
                && Number(previousHeroState.pos) === Number(playerRow.pos)
                && hasCompleteNativeLevelSnapshot(levelSnapshot)
                && Number(levelSnapshot.depth) === this.currentDepth
                && Number(levelSnapshot.branch) === 0 && typeof levelSnapshot.locked === "boolean"
                && isValidNativeHeroStateJson(payload.heroStateJson, {
                  hp: Number(afterHeroState.hp), ht: Number(playerRow.ht),
                  pos: Number(playerRow.pos), shielding: Number(afterHeroState.shielding)
                })
                && secondaryLootValid && secondaryMobAuthority && secondaryRewardsUnclaimed
                && lifeLinkMobEvidenceValid && secondaryMobRowsMatch
                && isValidNativeHeroBuffTick(previousHeroRow.value, data.heroStateBeforeJson,
                  payload.heroStateJson, data, levelSnapshot, lifeLinkMobEntityIds,
                  lifeLinkMobDamageEvents,
                  secondaryMobPayload!.deltas.filter((delta: any) => Number(delta.hpAfter) === 0)
                    .map((delta: any) => Number(delta.actorId)));
              if (!validHeroBuffTick) {
                // Return the first failed authoritative precondition instead of collapsing every
                // rejected native Buff result into INVALID_ACTION. These codes are useful to a
                // client deciding whether it can safely continue or must request a full resync.
                actionErrorCode = !playerRow ? "BUFF_TICK_PLAYER_MISSING"
                  : !previousHeroState || !beforeHeroState || !afterHeroState ? "BUFF_TICK_HERO_STATE_MISSING"
                    : String(playerRow.state) !== "ALIVE" ? "BUFF_TICK_HERO_NOT_ALIVE"
                      : Number(previousHeroState.hp) !== Number(playerRow.hp)
                        || Number(previousHeroState.ht) !== Number(playerRow.ht)
                        || Number(previousHeroState.pos) !== Number(playerRow.pos) ? "BUFF_TICK_HERO_PRE_STATE_MISMATCH"
                        : !sequenceBaselineFresh ? "BUFF_TICK_STALE_SEQUENCE_BASELINE"
                          : lifeLinkMobActorIds === null || lifeLinkMobEntityIds === null ? "BUFF_TICK_LIFELINK_IDENTITY_INVALID"
                            : secondaryMobPayload === null ? "BUFF_TICK_MOB_DELTA_INVALID"
                              : !lifeLinkMobEvidenceValid ? "BUFF_TICK_MOB_EVIDENCE_INVALID"
                                : !secondaryMobRowsMatch ? "BUFF_TICK_MOB_PRE_STATE_MISMATCH"
                                  : !secondaryLootValid ? "BUFF_TICK_LOOT_INVALID"
                                    : !secondaryMobAuthority ? "BUFF_TICK_MOB_AUTHORITY_REQUIRED"
                                      : !secondaryRewardsUnclaimed ? "BUFF_TICK_REWARD_ALREADY_CLAIMED"
                                        : !hasCompleteNativeLevelSnapshot(levelSnapshot) ? "BUFF_TICK_LEVEL_SNAPSHOT_INVALID"
                                          : Number(levelSnapshot.depth) !== this.currentDepth
                                            || Number(levelSnapshot.branch) !== 0 || typeof levelSnapshot.locked !== "boolean"
                                            ? "BUFF_TICK_LEVEL_CONTEXT_INVALID"
                                            : !isValidNativeHeroStateJson(payload.heroStateJson, {
                                                hp: Number(afterHeroState.hp), ht: Number(playerRow.ht),
                                                pos: Number(playerRow.pos), shielding: Number(afterHeroState.shielding)
                                              }) ? "BUFF_TICK_HERO_RESULT_INVALID"
                                              : "BUFF_TICK_NATIVE_TRANSITION_INVALID";
              }
              if (validHeroBuffTick) {
                if (secondaryMobPayload!.deltas.length > 0) {
                  const deadEntityIds: string[] = [];
                  for (const delta of secondaryMobPayload!.deltas) {
                    const saved = levelSnapshot.mobs.find((mob: any) =>
                      String(mob?.entityId || "") === String(delta.entityId));
                    if (!saved) throw new Error("Validated LifeLink Mob disappeared before commit");
                    saved.hp = Number(delta.hpAfter);
                    saved.ht = Number(delta.htAfter);
                    saved.pos = Number(delta.posAfter);
                    saved.shielding = Number(delta.shieldAfter);
                    saved.buffs = JSON.parse(String(delta.buffsAfter));
                    if (Number(delta.hpAfter) === 0) {
                      deadEntityIds.push(String(delta.entityId));
                    } else {
                      saved.serializedBundle = String(delta.serializedBundleAfter);
                      this.sql.exec("UPDATE mobs SET hp = ?, ht = ?, pos = ? WHERE mob_id = ? AND depth = ?",
                        saved.hp, saved.ht, saved.pos, Number(saved.mobId), this.currentDepth);
                    }
                  }
                  if (deadEntityIds.length > 0) {
                    const deletedMobIds = removeDeadNativeMobsFromSnapshot(levelSnapshot, deadEntityIds);
                    if (deletedMobIds == null) throw new Error("Validated LifeLink Mob death identity disappeared");
                    for (const deadMobId of deletedMobIds) {
                      this.sql.exec("DELETE FROM mobs WHERE mob_id = ? AND depth = ?", deadMobId, this.currentDepth);
                    }
                    levelSnapshot.heaps = secondaryMobPayload!.heaps;
                  }
                  this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                    "levelSnapshot:" + this.currentDepth, JSON.stringify(levelSnapshot));
                }
                const storedHeroState = String(payload.heroStateJson);
                this.sql.exec("UPDATE players SET hp = ? WHERE player_id = ?",
                  Number(afterHeroState.hp), session.playerId);
                this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                  "heroState:" + session.playerId, storedHeroState);

                // The complete Poison LifeLink batch is committed with this event.
                // Both Hero and Mob state, heap drops, reward receipts and the sequence share one SQL transaction.
                for (const rewardId of secondaryRewardIds || []) {
                  this.sql.exec("INSERT OR IGNORE INTO native_mob_reward_claims (reward_id,player_id,request_id,depth) VALUES (?,?,?,?)",
                    rewardId, session.playerId, String(msg.requestId || ""), this.currentDepth);
                }
                eventType = "HERO_BUFF_TICKED";
                actionResultPayload = {
                  playerId: session.playerId, sourceType: "BUFF_TICK",
                  buffClass: String(data.buffClass), buffId: Number(data.buffId),
                  targetHp: Number(afterHeroState.hp), targetShielding: Number(afterHeroState.shielding),
                  targetHeroStateJson: storedHeroState,
                  secondaryMobEntityIds: secondaryMobPayload!.deltas.map((delta: any) => delta.entityId),
                  secondaryMobDeltas: secondaryMobPayload,
                  nativeLifeLinkAtomicBatch: isPoisonBuffTick && secondaryMobPayload!.deltas.length > 0
                };
                actionValid = true;
                actionCost = 0;
              }
            } else if (data?.sourceType === "ENVIRONMENT") {
              const playerRow = this.sql.exec(
                `SELECT pos, hp, ht, state FROM players WHERE player_id = ?`, session.playerId
              ).toArray()[0];
              const previousHeroRow = this.sql.exec(
                `SELECT value FROM room_meta WHERE key = ?`, `heroState:${session.playerId}`
              ).toArray()[0];
              let previousHeroState: any = null;
              try {
                previousHeroState = previousHeroRow && typeof previousHeroRow.value === "string"
                  ? JSON.parse(String(previousHeroRow.value)) : null;
              } catch (_) { previousHeroState = null; }
              const levelRow = this.sql.exec(
                `SELECT width, height FROM levels WHERE depth = ?`, this.currentDepth
              ).toArray()[0];
              const levelSize = Number(levelRow?.width || 0) * Number(levelRow?.height || 0);
              const hp = Number(data?.targetHp), ht = Number(data?.targetHt);
              const pos = Number(data?.targetPosAfter), shield = Number(data?.targetShieldAfter);
              let reportedHeroState: any = null;
              try {
                reportedHeroState = typeof payload.heroStateJson === "string"
                  ? JSON.parse(payload.heroStateJson) : null;
              } catch (_) { reportedHeroState = null; }

              // A lethal Poison callback runs LifeLink Mob.damage() before Hero.damage().
              // Hero.damage() publishes the Hero death synchronously, then the Buff publisher
              // intentionally skips its later BUFF_TICK because the Hero is already dead.
              // Validate the complete pre/post Mob batch captured by the same native Poison actor.
              const isPoisonHeroDeath = hp === 0 && data?.targetState === "DEAD"
                && data?.sourceClass === "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Poison";
              let poisonDeathEvidenceValid = !isPoisonHeroDeath;
              let poisonDeathMobPayload: any = null;
              let poisonDeathLevelSnapshot: any = null;
              let poisonDeathMobRowsMatch = true;
              let poisonDeathLootValid = true;
              let poisonDeathRewardContract: {allowExperienceChange:boolean;allowMonkEnergyChange:boolean} | null = null;
              let poisonDeathRewardIds: string[] = [];
              let poisonDeathEntityIds: string[] = [];
              if (isPoisonHeroDeath && data.secondaryMobDeltas !== undefined
                  && typeof data.heroStateBeforeJson === "string") {
                poisonDeathEvidenceValid = false;
                const publisherRow = this.sql.exec(
                  "SELECT value FROM room_meta WHERE key = 'levelPublisher'").toArray()[0];
                const isLevelPublisher = String(publisherRow?.value || "") === session.playerId;
                const latestHeroBuffRow = this.sql.exec(
                  "SELECT sequence FROM events WHERE sender_id = ? AND event_type = 'HERO_BUFF_TICKED' ORDER BY sequence DESC LIMIT 1",
                  session.playerId).toArray()[0];
                const sequenceBefore = Number(data.sequenceBefore);
                const lastBuffSequence = Number(latestHeroBuffRow?.sequence || 0);
                const sequenceFresh = Number.isSafeInteger(sequenceBefore) && sequenceBefore >= 0
                  && sequenceBefore <= this.currentSequence
                  && Number.isSafeInteger(lastBuffSequence) && sequenceBefore >= lastBuffSequence;
                const trustedHeroBefore = previousHeroRow && typeof previousHeroRow.value === "string"
                  && hasMatchingNativeHeroStateSnapshot(data.heroStateBeforeJson, String(previousHeroRow.value));
                const linkedActorIds = trustedHeroBefore
                  ? nativeHeroBuffLifeLinkMobActorIds(data.heroStateBeforeJson) : null;
                const snapshotRow = this.sql.exec(
                  "SELECT value FROM room_meta WHERE key = ?", "levelSnapshot:" + this.currentDepth
                ).toArray()[0];
                try {
                  poisonDeathLevelSnapshot = snapshotRow && typeof snapshotRow.value === "string"
                    ? JSON.parse(String(snapshotRow.value)) : null;
                } catch (_) { poisonDeathLevelSnapshot = null; }
                const linkedEntityIds = sequenceFresh && linkedActorIds !== null && poisonDeathLevelSnapshot
                  ? nativeHeroBuffLifeLinkMobEntityIds(data.heroStateBeforeJson, poisonDeathLevelSnapshot, [])
                  : null;
                poisonDeathMobPayload = isLevelPublisher && sequenceFresh && linkedActorIds !== null
                    && linkedEntityIds !== null && poisonDeathLevelSnapshot
                  ? parseAndValidateNativeLifeLinkMobDeltas(data.secondaryMobDeltas,
                      poisonDeathLevelSnapshot.mobs, linkedEntityIds, levelSize,
                      Number(poisonDeathLevelSnapshot.width || 0))
                  : null;
                const syntheticMobEvents = poisonDeathMobPayload
                  ? buildNativeLifeLinkMobDamageEvents(poisonDeathMobPayload, poisonDeathLevelSnapshot.mobs,
                      session.playerId, sequenceBefore)
                  : null;
                const deadEvents = syntheticMobEvents == null ? []
                  : syntheticMobEvents.filter((event: any) => Number(event?.payload?.targetHp) === 0);
                const deadActorIds = deadEvents.map((event: any) => Number(event.payload.nativeActorId));
                const deadDeltas = (poisonDeathMobPayload?.deltas || [])
                  .filter((delta: any) => Number(delta.hpAfter) === 0)
                  .map((delta: any) => ({ entityId: String(delta.entityId), hpAfter: 0 }));
                poisonDeathEntityIds = deadDeltas.map((delta: any) => delta.entityId);
                const poisonDeathPositions = (poisonDeathMobPayload?.deltas || [])
                  .filter((delta: any) => Number(delta.hpAfter) === 0)
                  .map((delta: any) => Number(delta.posAfter));
                poisonDeathLootValid = poisonDeathMobPayload != null
                  && (poisonDeathPositions.length === 0
                    ? poisonDeathMobPayload.heaps === undefined
                    : isValidNativeLootSnapshot(poisonDeathMobPayload.heaps,
                        poisonDeathLevelSnapshot?.heaps, poisonDeathPositions, levelSize));
                poisonDeathMobRowsMatch = poisonDeathMobPayload != null
                  && poisonDeathMobPayload.deltas.every((delta: any) => {
                    const saved = poisonDeathLevelSnapshot.mobs.find((mob: any) =>
                      String(mob?.entityId || "") === String(delta.entityId));
                    if (!saved) return false;
                    const row = this.sql.exec(
                      "SELECT hp,ht,pos FROM mobs WHERE mob_id = ? AND depth = ?",
                      Number(saved.mobId), this.currentDepth).toArray()[0];
                    return !!row && Number(row.hp) === Number(delta.hpBefore)
                      && Number(row.ht) === Number(delta.htBefore)
                      && Number(row.pos) === Number(delta.posBefore);
                  });
                if (isLevelPublisher && sequenceFresh && trustedHeroBefore
                    && linkedActorIds !== null && linkedEntityIds !== null
                    && poisonDeathMobPayload != null && syntheticMobEvents != null
                    && poisonDeathMobRowsMatch) {
                  poisonDeathRewardContract = validateNativeLifeLinkEnvironmentDeathRewardTransition(
                    previousHeroRow?.value, payload.heroStateJson, syntheticMobEvents,
                    deadActorIds, sequenceBefore, poisonDeathLevelSnapshot);
                  if (poisonDeathRewardContract) poisonDeathEvidenceValid = true;
                }
                if (poisonDeathEvidenceValid && deadDeltas.length > 0) {
                  const rewardIds = nativeMobKillRewardIds(this.currentDepth, "", 1, deadDeltas);
                  const existingRewardIds = (rewardIds || []).filter(rewardId =>
                    this.sql.exec("SELECT reward_id FROM native_mob_reward_claims WHERE reward_id = ?",
                      rewardId).toArray().length > 0);
                  if (!rewardIds || !areNativeMobRewardClaimsAvailable(rewardIds, existingRewardIds)) {
                    poisonDeathEvidenceValid = false;
                  } else {
                    poisonDeathRewardIds = rewardIds;
                  }
                }
              } else if (isPoisonHeroDeath) {
                // Legacy evidence path for a non-publisher peer that cannot author shared Mob state.
                // It accepts only already-committed same-sender Mob damage and never writes Mob rows.
                // Enter the proof path optimistically; every malformed/unrelated event or
                // failed reward contract below explicitly flips this back to false.
                poisonDeathEvidenceValid = true;
                const latestHeroBuffRow = this.sql.exec(
                  "SELECT sequence FROM events WHERE sender_id = ? AND event_type = 'HERO_BUFF_TICKED' ORDER BY sequence DESC LIMIT 1",
                  session.playerId).toArray()[0];
                const sequenceBefore = Number(latestHeroBuffRow?.sequence || 0);
                const linkedActorIds = nativeHeroBuffLifeLinkMobActorIds(previousHeroRow?.value);
                const acceptedLifeLinkEvents = Number.isSafeInteger(sequenceBefore)
                    && sequenceBefore >= 0 && sequenceBefore <= this.currentSequence && linkedActorIds !== null
                  ? this.sql.exec(
                      "SELECT sequence,sender_id,event_type,payload FROM events WHERE sequence > ? AND sender_id = ? AND event_type = 'CHAR_DAMAGED' ORDER BY sequence ASC LIMIT 513",
                      sequenceBefore, session.playerId).toArray()
                  : [];
                if (linkedActorIds === null || acceptedLifeLinkEvents.length > 512) {
                  poisonDeathEvidenceValid = false;
                } else {
                  const linked = new Set<number>(linkedActorIds);
                  const seenActors = new Set<number>();
                  const deadActorIds: number[] = [];
                  const deadDeltas: Array<{entityId:string;hpAfter:number}> = [];
                  for (const event of acceptedLifeLinkEvents) {
                    let evidence: any = null;
                    try {
                      evidence = typeof event.payload === "string" ? JSON.parse(event.payload) : event.payload;
                    } catch (_) { evidence = null; }
                    const actorId = Number(evidence?.nativeActorId);
                    const entityId = String(evidence?.targetId || "");
                    const targetHp = Number(evidence?.targetHp);
                    if (String(event.event_type || "") !== "CHAR_DAMAGED"
                        || String(event.sender_id || "") !== session.playerId
                        || evidence?.sourceType !== "ENVIRONMENT"
                        || evidence?.sourceClass !== "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.LifeLink"
                        || evidence?.targetType !== "MOB"
                        || !Number.isInteger(actorId) || actorId < 1 || !linked.has(actorId)
                        || seenActors.has(actorId) || !/^[A-Za-z0-9._:-]{8,80}$/.test(entityId)
                        || !Number.isInteger(targetHp) || targetHp < 0) {
                      poisonDeathEvidenceValid = false;
                      break;
                    }
                    seenActors.add(actorId);
                    if (targetHp === 0) {
                      deadActorIds.push(actorId);
                      deadDeltas.push({entityId,hpAfter:0});
                      poisonDeathEntityIds.push(entityId);
                    }
                  }
                  const savedLevelRow = this.sql.exec(
                    "SELECT value FROM room_meta WHERE key = ?", "levelSnapshot:" + this.currentDepth
                  ).toArray()[0];
                  let rewardLevelSnapshot: any = null;
                  try {
                    rewardLevelSnapshot = savedLevelRow && typeof savedLevelRow.value === "string"
                      ? JSON.parse(String(savedLevelRow.value)) : null;
                  } catch (_) { rewardLevelSnapshot = null; }
                  if (poisonDeathEvidenceValid) {
                    // Run the same native Hero Buff delta validator even when no linked Mob
                    // died. It keeps LifeLink attached and prevents a lethal Poison callback
                    // from being used to smuggle an unrelated detach or Buff mutation.
                    poisonDeathRewardContract = validateNativeLifeLinkEnvironmentDeathRewardTransition(
                      previousHeroRow?.value, payload.heroStateJson, acceptedLifeLinkEvents,
                      deadActorIds, sequenceBefore, rewardLevelSnapshot);
                    if (!poisonDeathRewardContract) poisonDeathEvidenceValid = false;
                  }
                  if (poisonDeathEvidenceValid && deadDeltas.length > 0) {
                    const rewardIds = nativeMobKillRewardIds(this.currentDepth, "", 1, deadDeltas);
                    const existingRewardIds = (rewardIds || []).filter(rewardId =>
                      this.sql.exec("SELECT reward_id FROM native_mob_reward_claims WHERE reward_id = ?",
                        rewardId).toArray().length > 0);
                    if (!rewardIds || !areNativeMobRewardClaimsAvailable(rewardIds, existingRewardIds)) {
                      poisonDeathEvidenceValid = false;
                    } else {
                      poisonDeathRewardIds = rewardIds;
                    }
                  }
                }
              }
              const mergedJson = mergeNativeHeroState(previousHeroRow?.value, payload.heroStateJson,
                { hp, ht, pos, shielding: shield }, data?.targetBuffs);
              // The outer state owns HP/HT/position; accept no other Hero Bundle mutation here
              // except the independently verified non-level-up EXP delta from linked Mob deaths.
              const mergedExperienceBundle = mergeNativeLifeLinkDeathExperienceBundle(
                previousHeroState?.combatBundle, reportedHeroState?.combatBundle,
                poisonDeathRewardContract?.allowExperienceChange === true);
              let finalMergedJson: string | null = null;
              try {
                if (mergedJson != null && mergedExperienceBundle != null) {
                  const mergedHero = JSON.parse(mergedJson);
                  mergedHero.combatBundle = mergedExperienceBundle;
                  finalMergedJson = JSON.stringify(mergedHero);
                }
              } catch (_) { finalMergedJson = null; }
              const validEnvironmentDamage = !!playerRow && previousHeroState != null
                && isValidNativeEnvironmentDamage(data, {
                  ...playerRow, levelSize, levelWidth: Number(levelRow?.width || 0),
                  heroState: previousHeroState, shielding: previousHeroState.shielding
                })
                && Number(previousHeroState.hp) === Number(playerRow.hp)
                && Number(previousHeroState.ht) === Number(playerRow.ht)
                && Number(previousHeroState.pos) === Number(playerRow.pos)
                && Number(previousHeroState.shielding) === Number(data.targetShieldBefore)
                && isValidNativeHeroStateJson(payload.heroStateJson, { hp, ht, pos, shielding: shield })
                && isValidNativeCombatBuffs(data?.targetBuffs)
                && poisonDeathEvidenceValid && poisonDeathMobRowsMatch && poisonDeathLootValid && finalMergedJson != null
                && (pos === Number(playerRow.pos)
                  || (this.isValidCombatTargetPosition(pos, this.currentDepth)
                    && this.isCombatDestinationFree(pos, this.currentDepth, "PLAYER", session.playerId)));
              if (validEnvironmentDamage) {
                if (poisonDeathMobPayload != null && poisonDeathLevelSnapshot != null
                    && poisonDeathMobPayload.deltas.length > 0) {
                  const deadEntityIds: string[] = [];
                  for (const delta of poisonDeathMobPayload.deltas) {
                    const saved = poisonDeathLevelSnapshot.mobs.find((mob: any) =>
                      String(mob?.entityId || "") === String(delta.entityId));
                    if (!saved) throw new Error("Validated lethal Poison LifeLink Mob disappeared before commit");
                    saved.hp = Number(delta.hpAfter);
                    saved.ht = Number(delta.htAfter);
                    saved.pos = Number(delta.posAfter);
                    saved.shielding = Number(delta.shieldAfter);
                    saved.buffs = JSON.parse(String(delta.buffsAfter));
                    if (Number(delta.hpAfter) === 0) {
                      deadEntityIds.push(String(delta.entityId));
                    } else {
                      saved.serializedBundle = String(delta.serializedBundleAfter);
                      this.sql.exec("UPDATE mobs SET hp = ?, ht = ?, pos = ? WHERE mob_id = ? AND depth = ?",
                        saved.hp, saved.ht, saved.pos, Number(saved.mobId), this.currentDepth);
                    }
                  }
                  if (deadEntityIds.length > 0) {
                    const deletedMobIds = removeDeadNativeMobsFromSnapshot(poisonDeathLevelSnapshot, deadEntityIds);
                    if (deletedMobIds == null) throw new Error("Validated lethal Poison LifeLink death identity disappeared");
                    for (const deadMobId of deletedMobIds) {
                      this.sql.exec("DELETE FROM mobs WHERE mob_id = ? AND depth = ?", deadMobId, this.currentDepth);
                    }
                    poisonDeathLevelSnapshot.heaps = poisonDeathMobPayload.heaps;
                  }
                  this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                    "levelSnapshot:" + this.currentDepth, JSON.stringify(poisonDeathLevelSnapshot));
                }
                const oldState = String(playerRow.state);
                const newState = hp > 0 ? "ALIVE"
                  : this.gameMode === "DEATHMATCH" ? "ALIVE"
                    : this.gameMode === "PVP_ARENA" ? "SPECTATOR" : "DEAD";
                const storedHeroState = String(finalMergedJson);
                this.sql.exec(`UPDATE players SET hp = ?, ht = ?, pos = ?, state = ? WHERE player_id = ?`,
                  hp, ht, pos, newState, session.playerId);
                this.sql.exec(`INSERT INTO room_meta (key,value) VALUES (?,?)
                  ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
                  `heroState:${session.playerId}`, storedHeroState);
                if (oldState === "ALIVE" && newState === "DEAD") {
                  this.sql.exec(`UPDATE players SET deaths = deaths + 1 WHERE player_id = ?`, session.playerId);
                }
                for (const rewardId of poisonDeathRewardIds) {
                  this.sql.exec("INSERT OR IGNORE INTO native_mob_reward_claims (reward_id,player_id,request_id,depth) VALUES (?,?,?,?)",
                    rewardId, session.playerId, String(msg.requestId || ""), this.currentDepth);
                }
                eventType = "PLAYER_DAMAGED";
                actionResultPayload = { playerId: session.playerId, targetId: session.playerId, targetType: "PLAYER",
                  sourceType: "ENVIRONMENT", sourceClass: data.sourceClass,
                  targetHpBefore: Number(data.targetHpBefore), targetHtBefore: Number(data.targetHtBefore),
                  targetHp: hp, targetHt: ht, targetPos: Number(data.targetPosBefore), targetPosAfter: pos,
                  targetShieldBefore: Number(data.targetShieldBefore), targetShieldAfter: shield,
                  targetBuffsBefore: data.targetBuffsBefore, targetBuffs: data.targetBuffs,
                  targetHeroStateJson: storedHeroState, targetState: newState, damage: Number(data.damage),
                  effectiveDamage: Number(data.effectiveDamage), engineResolved: true,
                  nativeLifeLinkDeathEntityIds: poisonDeathEntityIds,
                  ...(poisonDeathMobPayload == null ? {} : {
                    secondaryMobDeltas: poisonDeathMobPayload,
                    nativeLifeLinkAtomicBatch: true
                  }) };
                actionValid = true;
                actionCost = 0;
              }
            } else {
            const hp = data?.targetHp;
            const ht = data?.targetHt;
            const damage = data?.damage;
            const targetPosBefore = data?.targetPosBefore;
            const targetPosAfter = data?.targetPosAfter;
            const targetShieldBefore = data?.targetShieldBefore;
            const targetShieldAfter = data?.targetShieldAfter;
            const damageTargetId = typeof data?.targetPlayerId === "string"
              && data.targetPlayerId.length > 0 && data.targetPlayerId.length <= 80 ? data.targetPlayerId : null;
            const playerRow = damageTargetId == null ? null : this.sql.exec(
              `SELECT pos, hp, ht, state FROM players WHERE player_id = ?`, damageTargetId).toArray()[0];
            const previousHeroRow = damageTargetId == null ? null : this.sql.exec(
              `SELECT value FROM room_meta WHERE key = ?`, `heroState:${damageTargetId}`).toArray()[0];
            let previousHeroState: any = null;
            try {
              previousHeroState = previousHeroRow && typeof previousHeroRow.value === "string"
                ? JSON.parse(String(previousHeroRow.value)) : null;
            } catch (_) { previousHeroState = null; }
            const sourceLevelRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`,
              `levelSnapshot:${this.currentDepth}`).toArray()[0];
            let sourceLevel: any = null;
            try {
              sourceLevel = sourceLevelRow && typeof sourceLevelRow.value === "string"
                ? JSON.parse(String(sourceLevelRow.value)) : null;
            } catch (_) { sourceLevel = null; }
            const sourceMobId = resolveServerMobIdByEntityId(sourceLevel, data?.sourceEntityId);
            const sourceMob = sourceMobId == null ? [] : this.sql.exec(
              `SELECT pos, hp, ht FROM mobs WHERE mob_id = ? AND depth = ?`, sourceMobId, this.currentDepth
            ).toArray();
            const mobPublisherRow = this.sql.exec("SELECT value FROM room_meta WHERE key = 'levelPublisher'").toArray()[0];
            const sourceMobAuthority = isAuthorizedNativeMobOwner(session.playerId, String(mobPublisherRow?.value || ""));
            const authorizedDamageTarget = resolveAuthorizedNativeMobDamageTarget(
              session.playerId, String(mobPublisherRow?.value || ""), data?.targetPlayerId);
            const levelRow = this.sql.exec(`SELECT width, height FROM levels WHERE depth = ?`, this.currentDepth).toArray()[0];
            const width = Number(levelRow?.width || 0), height = Number(levelRow?.height || 0);
            const levelSize = width * height;
            const sourcePos = Number(data?.sourcePos);
            const sourceDistance = playerRow && width > 0
              ? Math.max(Math.abs((sourcePos % width) - (Number(targetPosBefore) % width)),
                  Math.abs(Math.floor(sourcePos / width) - Math.floor(Number(targetPosBefore) / width)))
              : Number.POSITIVE_INFINITY;
            const targetMoveDistance = playerRow && width > 0
              ? Math.max(Math.abs((Number(targetPosAfter) % width) - (Number(targetPosBefore) % width)),
                  Math.abs(Math.floor(Number(targetPosAfter) / width) - Math.floor(Number(targetPosBefore) / width)))
              : Number.POSITIVE_INFINITY;
            const sourceMobHpBefore = Number(data?.sourceMobHpBefore);
            const sourceMobHtBefore = Number(data?.sourceMobHtBefore);
            const sourceMobHpAfter = Number(data?.sourceMobHpAfter);
            const sourceMobHtAfter = Number(data?.sourceMobHtAfter);
            const sourceMobShieldBefore = Number(data?.sourceMobShieldBefore);
            const sourceMobShieldAfter = Number(data?.sourceMobShieldAfter);
            const sourceMobPosBefore = Number(data?.sourceMobPosBefore);
            const sourceMobPosAfter = Number(data?.sourceMobPosAfter);
            const sourceMobMoveDistance = width > 0
              ? Math.max(Math.abs((sourceMobPosAfter % width) - (sourceMobPosBefore % width)),
                  Math.abs(Math.floor(sourceMobPosAfter / width) - Math.floor(sourceMobPosBefore / width)))
              : Number.POSITIVE_INFINITY;
            const sourceMobDestinationValid = Number.isInteger(sourceMobPosAfter) && sourceMobPosAfter >= 0
              && sourceMobPosAfter < levelSize && sourceMobMoveDistance <= 8
              && (sourceMobPosAfter === sourceMobPosBefore || (this.isValidCombatTargetPosition(sourceMobPosAfter, this.currentDepth)
                && this.isCombatDestinationFree(sourceMobPosAfter, this.currentDepth, "MOB", Number(sourceMobId))));
            let sourceMobBuffsBeforeParsed: any = null, sourceMobBuffsAfterParsed: any = null;
            try {
              sourceMobBuffsBeforeParsed = JSON.parse(String(data?.sourceMobBuffsBefore));
              sourceMobBuffsAfterParsed = JSON.parse(String(data?.sourceMobBuffs));
            } catch (_) { sourceMobBuffsBeforeParsed = null; sourceMobBuffsAfterParsed = null; }
            const sourceMobBuffsChanged = comparableBuffs(sourceMobBuffsBeforeParsed) !== comparableBuffs(sourceMobBuffsAfterParsed);
            let targetBuffsBeforeParsed: any = null, targetBuffsAfterParsed: any = null;
            try {
              targetBuffsBeforeParsed = JSON.parse(String(data?.targetBuffsBefore));
              targetBuffsAfterParsed = JSON.parse(String(data?.targetBuffs));
            } catch (_) { targetBuffsBeforeParsed = null; targetBuffsAfterParsed = null; }
            const targetBuffsChanged = comparableBuffs(targetBuffsBeforeParsed) !== comparableBuffs(targetBuffsAfterParsed);
            const targetHeroCombatChanged = Number(hp) !== Number(playerRow?.hp)
              || damage > 0 || targetShieldAfter < targetShieldBefore
              || Number(targetPosAfter) !== Number(targetPosBefore) || targetBuffsChanged;
            const sourceMobReportedChanged = sourceMobHpAfter !== sourceMobHpBefore
              || sourceMobShieldAfter !== sourceMobShieldBefore || sourceMobPosAfter !== sourceMobPosBefore
              || sourceMobBuffsChanged || sourceMobHpAfter <= 0;
            const savedSourceMobBefore = Array.isArray(sourceLevel?.mobs)
              ? sourceLevel.mobs.find((mob: any) => Number(mob?.mobId) === Number(sourceMobId)) : null;
            const sourceMobPreStateMatchesSnapshot = !!savedSourceMobBefore
              && Number(savedSourceMobBefore.hp) === sourceMobHpBefore
              && Number(savedSourceMobBefore.ht) === sourceMobHtBefore
              && hasMatchingNativeMobShieldSnapshot(data?.sourceMobShieldBefore,
                data?.sourceMobShieldAfter, savedSourceMobBefore.shielding)
              && Number(savedSourceMobBefore.pos) === sourceMobPosBefore
              && hasMatchingNativeBuffSnapshot(sourceMobBuffsBeforeParsed, savedSourceMobBefore.buffs);
            const sourceMobLootValid = sourceMobHpAfter > 0
              ? data?.heaps === undefined
              : isValidNativeLootSnapshot(data?.heaps, sourceLevel?.heaps, sourceMobPosAfter, levelSize);
            const sourceMobStateValid = hasStrictNativeSourceMobState(data)
              && isValidNativeCombatBuffs(data?.sourceMobBuffsBefore)
              && sourceMob.length > 0 && sourceMobHpBefore === Number(sourceMob[0].hp)
              && sourceMobHtBefore === Number(sourceMob[0].ht) && sourceMobPosBefore === sourcePos
              && sourceMobPreStateMatchesSnapshot
              && sourceMobHpAfter >= 0 && sourceMobHpAfter <= sourceMobHpBefore
              && sourceMobHtAfter === sourceMobHtBefore
              && isValidNativeHpTransition(sourceMobHpBefore, sourceMobHpAfter, Number(data.sourceMobDamage))
              && sourceMobDestinationValid && sourceMobLootValid
              && isValidNativeCombatBuffs(data.sourceMobBuffs)
              && isValidNativeMobBundle(data.sourceMobBundleAfter);
            const newHeroStateValid = isValidNativeHeroStateJson(payload.heroStateJson, {
              hp: Number(hp), ht: Number(ht), pos: Number(targetPosAfter), shielding: Number(targetShieldAfter)
            });
            const reportedDamagedHeroState = (() => {
              try { return typeof payload.heroStateJson === "string" ? JSON.parse(payload.heroStateJson) : null; }
              catch (_) { return null; }
            })();
            const ankhRescue = previousHeroState != null
              && hasValidBlessedAnkhConsumption(previousHeroRow?.value, payload.heroStateJson)
              && Number(data?.ankhCountBefore) === Number(previousHeroState.ankhCount)
              && Number(data?.ankhCountAfter) === Number(reportedDamagedHeroState?.ankhCount)
              && Number(data?.blessedAnkhCountBefore) === Number(previousHeroState.blessedAnkhCount)
              && Number(data?.blessedAnkhCountAfter) === Number(reportedDamagedHeroState?.blessedAnkhCount)
              && Number(hp) === Math.floor(Number(ht) / 4) && Number(hp) > 0
              && Number(data?.damage) === 0;
            const mergedDamagedHeroStateJson = mergeNativeHeroState(previousHeroRow?.value,
              payload.heroStateJson,
              { hp: Number(hp), ht: Number(ht), pos: Number(targetPosAfter), shielding: Number(targetShieldAfter) },
              data?.targetBuffs, ankhRescue, true, !ankhRescue, !ankhRescue);
            const geometryValid = data?.sourceAttackKind === (sourceDistance <= 1 ? "MELEE" : "RANGED")
              && (sourceDistance <= 1
                ? this.isMeleeAdjacent(sourcePos, Number(targetPosBefore), this.currentDepth)
                : sourceDistance <= 8 && this.hasLineOfSight(sourcePos, Number(targetPosBefore), this.currentDepth));
            const targetPosValid = Number.isInteger(targetPosAfter) && targetPosAfter >= 0 && targetPosAfter < levelSize
              && targetMoveDistance <= 8
              && (targetPosAfter === targetPosBefore || (this.isValidCombatTargetPosition(Number(targetPosAfter), this.currentDepth)
                && this.isCombatDestinationFree(Number(targetPosAfter), this.currentDepth, "PLAYER", damageTargetId)));
            const previousHp = Number(playerRow?.hp);
            const previousHt = Number(playerRow?.ht);
            const noEffectOutcomeValid = isValidNativeMobNoEffectOutcome(data, {
              hp: Number(playerRow?.hp), ht: Number(playerRow?.ht), pos: Number(playerRow?.pos),
              shielding: Number(previousHeroState?.shielding)
            });
            const validDamage = damageTargetId != null && authorizedDamageTarget === damageTargetId
              && !!playerRow && String(playerRow.state) === "ALIVE" && sourceMobAuthority
              && hasStrictNativeDamageFields(data) && data.targetPlayerId === damageTargetId
              && hasMatchingNativeHeroBuffSnapshot(data.targetBuffsBefore, previousHeroState)
              && data.combatDepth === this.currentDepth
              && Number.isInteger(hp) && Number.isInteger(ht) && Number.isInteger(damage)
              && Number.isInteger(targetPosBefore) && targetPosBefore === Number(playerRow.pos)
              && Number.isInteger(targetPosAfter) && Number.isInteger(targetShieldBefore) && Number.isInteger(targetShieldAfter)
              && (previousHeroState == null || !Number.isInteger(previousHeroState?.shielding)
                || targetShieldBefore === previousHeroState.shielding)
              && targetShieldBefore >= 0 && targetShieldBefore <= 100000
              && targetShieldAfter >= 0 && targetShieldAfter <= 100000
              && hp >= 0 && (ankhRescue || hp <= previousHp) && ht === previousHt
              && data.targetHpBefore === previousHp && data.targetHtBefore === previousHt
              && (ankhRescue
                ? hp > 0 && hp === Math.floor(ht / 4) && damage === 0
                : isValidNativeHpTransition(previousHp, hp, damage))
              && (ankhRescue || isValidNativeDamageAccounting(
                previousHp, targetShieldBefore, hp, targetShieldAfter, data.effectiveDamage))
              && (targetHeroCombatChanged || sourceMobReportedChanged || noEffectOutcomeValid)
              && newHeroStateValid && mergedDamagedHeroStateJson != null
              && isValidNativeCombatBuffs(data.targetBuffs)
              && sourceMob.length > 0 && Number(sourceMob[0].hp) > 0
              && Number(sourceMob[0].pos) === sourcePos && sourceMobPreStateMatchesSnapshot
              && geometryValid && targetPosValid
              && sourceMobAuthority && sourceMobStateValid;
            if (validDamage) {
              const oldState = String(playerRow.state);
              const newState = hp === 0
                ? (this.gameMode === "DEATHMATCH" ? "ALIVE" : this.gameMode === "PVP_ARENA" ? "SPECTATOR" : "DEAD")
                : "ALIVE";
              this.sql.exec(`UPDATE players SET hp = ?, ht = ?, pos = ?, state = ? WHERE player_id = ?`,
                hp, ht, targetPosAfter, newState, damageTargetId);
              this.sql.exec(`INSERT INTO room_meta (key,value) VALUES (?,?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
                `heroState:${damageTargetId}`, mergedDamagedHeroStateJson);
              const savedSourceMob = (Array.isArray(sourceLevel?.mobs) ? sourceLevel.mobs : [])
                .find((mob: any) => Number(mob?.mobId) === Number(sourceMobId));
              if (!savedSourceMob) throw new Error("Accepted source mob missing from native snapshot");
              const committedSourceMobHp = sourceMobAuthority ? sourceMobHpAfter : Number(savedSourceMob.hp);
              const committedSourceMobHt = sourceMobAuthority ? sourceMobHtAfter : Number(savedSourceMob.ht);
              const committedSourceMobShield = sourceMobAuthority ? Number(data.sourceMobShieldAfter) : Number(savedSourceMob.shielding);
              const committedSourceMobPos = sourceMobAuthority ? sourceMobPosAfter : Number(savedSourceMob.pos);
              const committedSourceMobBuffs = sourceMobAuthority ? data.sourceMobBuffs : JSON.stringify(savedSourceMob.buffs);
              if (sourceMobAuthority) {
                savedSourceMob.hp = committedSourceMobHp;
                savedSourceMob.ht = committedSourceMobHt;
                savedSourceMob.shielding = committedSourceMobShield;
                savedSourceMob.pos = committedSourceMobPos;
                savedSourceMob.buffs = JSON.parse(String(committedSourceMobBuffs));
                if (committedSourceMobHp > 0) {
                  savedSourceMob.serializedBundle = String(data.sourceMobBundleAfter);
                  this.sql.exec(`UPDATE mobs SET hp = ?, ht = ?, pos = ? WHERE mob_id = ? AND depth = ?`,
                    committedSourceMobHp, committedSourceMobHt, committedSourceMobPos, sourceMobId, this.currentDepth);
                } else {
                  sourceLevel.heaps = data.heaps;
                  const deletedMobIds = removeDeadNativeMobsFromSnapshot(sourceLevel, [String(data.sourceEntityId)]);
                  if (deletedMobIds == null) throw new Error("Validated dead source mob identity disappeared");
                  for (const deadMobId of deletedMobIds) {
                    this.sql.exec(`DELETE FROM mobs WHERE mob_id = ? AND depth = ?`, deadMobId, this.currentDepth);
                  }
                }
                this.sql.exec(`INSERT INTO room_meta (key,value) VALUES (?,?)
                  ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
                  `levelSnapshot:${this.currentDepth}`, JSON.stringify(sourceLevel));
              }
              if (oldState !== "DEAD" && oldState !== "SPECTATOR" && (newState === "DEAD" || newState === "SPECTATOR")) {
                this.sql.exec(`UPDATE players SET deaths = deaths + 1 WHERE player_id = ?`, damageTargetId);
              }
              eventType = "PLAYER_DAMAGED";
              actionResultPayload = {
                attackerId: data.sourceEntityId, attackerType: "MOB", attackerPos: sourcePos,
                sourceType: "MOB", sourceEntityId: data.sourceEntityId, sourcePos,
                sourceAttackKind: data.sourceAttackKind, attackKind: data.sourceAttackKind,
                engineDistance: sourceDistance, engineActionCost: data.sourceActionCost,
                targetId: damageTargetId, targetPlayerId: damageTargetId, targetType: "PLAYER",
                targetHpBefore: previousHp, targetHtBefore: previousHt, targetHp: hp, targetHt: ht,
                targetPos: targetPosBefore, targetPosAfter, targetShieldBefore, targetShieldAfter,
                targetState: newState, hit: data.engineHit === true, engineHit: data.engineHit === true,
                ankhCountBefore: data.ankhCountBefore, ankhCountAfter: data.ankhCountAfter,
                blessedAnkhCountBefore: data.blessedAnkhCountBefore, blessedAnkhCountAfter: data.blessedAnkhCountAfter,
                damage, effectiveDamage: Number(data.effectiveDamage) || damage,
                targetBuffsBefore: data.targetBuffsBefore, targetBuffs: data.targetBuffs,
                targetHeroStateJson: mergedDamagedHeroStateJson,
                sourceMobHpBefore, sourceMobHtBefore, sourceMobShieldBefore: Number(data.sourceMobShieldBefore),
                sourceMobHpAfter: committedSourceMobHp, sourceMobHtAfter: committedSourceMobHt,
                sourceMobShieldAfter: committedSourceMobShield,
                sourceMobPosBefore, sourceMobPosAfter: committedSourceMobPos,
                sourceMobDamage: sourceMobAuthority ? Number(data.sourceMobDamage) : 0,
                sourceMobBuffsBefore: data.sourceMobBuffsBefore, sourceMobBuffs: committedSourceMobBuffs,
                sourceMobBundleAfter: sourceMobAuthority && committedSourceMobHp > 0 ? String(data.sourceMobBundleAfter) : null,
                sourceMobResyncRequired: !sourceMobAuthority && sourceMobReportedChanged,
                ...(sourceMobAuthority && committedSourceMobHp <= 0 ? { heaps: data.heaps } : {}),
                attackerStateJson: null, engineResolved: true
              };
              actionValid = true;
              actionCost = 0;
            }
            }
          } else if (actionStr === "REVIVE" && isValidNativeCombatRequestId(msg.requestId)) {
            const data = payload.data || {};
            const playerRow = this.sql.exec(
              `SELECT pos, hp, ht, state FROM players WHERE player_id = ?`, session.playerId
            ).toArray()[0];
            const previousHeroRow = this.sql.exec(
              `SELECT value FROM room_meta WHERE key = ?`, `heroState:${session.playerId}`
            ).toArray()[0];
            let previousHeroState: any = null, reportedHeroState: any = null;
            try {
              previousHeroState = previousHeroRow && typeof previousHeroRow.value === "string"
                ? JSON.parse(String(previousHeroRow.value)) : null;
              reportedHeroState = typeof payload.heroStateJson === "string"
                ? JSON.parse(payload.heroStateJson) : null;
            } catch (_) { previousHeroState = null; reportedHeroState = null; }
            const hp = Number(data.targetHp), ht = Number(data.targetHt), pos = Number(data.targetPosAfter);
            const hpBefore = Number(data.targetHpBefore), htBefore = Number(data.targetHtBefore);
            const posBefore = Number(data.targetPosBefore);
            const shieldBefore = Number(data.targetShieldBefore), shieldAfter = Number(data.targetShieldAfter);
            const targetBuffs = data.targetBuffs;
            const levelRow = this.sql.exec(`SELECT width, height FROM levels WHERE depth = ?`, this.currentDepth).toArray()[0];
            const levelSize = Number(levelRow?.width || 0) * Number(levelRow?.height || 0);
            const levelSnapshotRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`,
              `levelSnapshot:${this.currentDepth}`).toArray()[0];
            let levelSnapshot: any = null;
            try {
              levelSnapshot = levelSnapshotRow && typeof levelSnapshotRow.value === "string"
                ? JSON.parse(String(levelSnapshotRow.value)) : null;
            } catch (_) { levelSnapshot = null; }

            const commonStateValid = !!playerRow && previousHeroState != null && reportedHeroState != null
              && Number(data.combatDepth) === this.currentDepth
              && Number.isInteger(hp) && hp > 0 && Number.isInteger(ht) && ht > 0
              && Number.isInteger(pos) && pos >= 0 && pos < levelSize
              && Number.isInteger(shieldBefore) && shieldBefore >= 0 && shieldBefore <= 100000
              && Number.isInteger(shieldAfter) && shieldAfter >= 0 && shieldAfter <= 100000
              && Number.isInteger(hpBefore) && Number.isInteger(htBefore) && Number.isInteger(posBefore)
              && htBefore === Number(playerRow.ht) && posBefore === Number(playerRow.pos)
              && Number(previousHeroState.ht) === Number(playerRow.ht)
              && Number(previousHeroState.pos) === Number(playerRow.pos)
              && Number(previousHeroState.shielding) === shieldBefore
              && hasMatchingNativeHeroBuffSnapshot(data.targetBuffsBefore, previousHeroState)
              && isValidNativeCombatBuffs(targetBuffs)
              && isValidNativeHeroStateJson(payload.heroStateJson, { hp, ht, pos, shielding: shieldAfter });

            const blessedRevival = commonStateValid && String(playerRow.state) === "ALIVE"
              && hpBefore === Number(playerRow.hp) && Number(previousHeroState.hp) === Number(playerRow.hp)
              && hp === Math.floor(ht / 4) && pos === Number(playerRow.pos)
              && hasValidBlessedAnkhConsumption(previousHeroRow?.value, payload.heroStateJson)
              && Number(data.ankhCountBefore) === Number(previousHeroState.ankhCount)
              && Number(data.ankhCountAfter) === Number(reportedHeroState?.ankhCount)
              && Number(data.blessedAnkhCountBefore) === Number(previousHeroState.blessedAnkhCount)
              && Number(data.blessedAnkhCountAfter) === Number(reportedHeroState?.blessedAnkhCount);

            const unblessedRevival = data.revivalKind === "UNBLESSED_ANKH"
              && data.levelWasLocked !== true
              && commonStateValid && String(playerRow.state) === "DEAD"
              && Number(playerRow.hp) === 0 && Number(previousHeroState.hp) === 0 && hpBefore === 0
              && hp === ht && Number(data.ankhCountBefore) === Number(previousHeroState.ankhCount)
              && Number(data.ankhCountAfter) === Number(reportedHeroState?.ankhCount)
              && Number(data.blessedAnkhCountBefore) === Number(previousHeroState.blessedAnkhCount)
              && Number(data.blessedAnkhCountAfter) === Number(reportedHeroState?.blessedAnkhCount)
              && hasValidUnblessedAnkhConsumption(previousHeroRow?.value, payload.heroStateJson)
              && this.isValidCombatTargetPosition(pos, this.currentDepth)
              && this.isCombatDestinationFree(pos, this.currentDepth, "PLAYER", session.playerId)
              && levelSnapshot != null && isValidNativeLootSnapshot(
                data.heaps, levelSnapshot.heaps, posBefore, levelSize
              ) && hasOnlyNativeLostBackpackAdded(data.heaps, levelSnapshot.heaps, posBefore);

            const mergedJson = (blessedRevival || unblessedRevival)
              ? mergeNativeHeroState(previousHeroRow?.value, payload.heroStateJson,
                { hp, ht, pos, shielding: shieldAfter }, targetBuffs, blessedRevival, false, false, false)
              : null;
            const validRevival = (blessedRevival || unblessedRevival) && mergedJson != null;
            if (validRevival) {
              const merged: any = JSON.parse(mergedJson as string);
              merged.inventoryBundle = reportedHeroState.inventoryBundle;
              merged.ankhCount = reportedHeroState.ankhCount;
              merged.blessedAnkhCount = reportedHeroState.blessedAnkhCount;
              merged.cooldown = reportedHeroState.cooldown;
              const storedHeroState = JSON.stringify(merged);
              this.sql.exec(`UPDATE players SET hp = ?, ht = ?, pos = ?, state = 'ALIVE' WHERE player_id = ?`,
                hp, ht, pos, session.playerId);
              this.sql.exec(`INSERT INTO room_meta (key,value) VALUES (?,?)
                ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
                `heroState:${session.playerId}`, storedHeroState);
              if (unblessedRevival) {
                levelSnapshot.heaps = data.heaps;
                this.sql.exec(`INSERT INTO room_meta (key,value) VALUES (?,?)
                  ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
                  `levelSnapshot:${this.currentDepth}`, JSON.stringify(levelSnapshot));
              }
              eventType = "PLAYER_REVIVED";
              actionResultPayload = {
                playerId: session.playerId, hp, ht, pos, shielding: shieldAfter,
                targetBuffs, heroStateJson: storedHeroState,
                ankhCount: reportedHeroState.ankhCount,
                blessedAnkhCount: reportedHeroState.blessedAnkhCount,
                revivalKind: unblessedRevival ? "UNBLESSED_ANKH" : "BLESSED_ANKH",
                ...(unblessedRevival ? { heaps: data.heaps } : {})
              };
              actionValid = true;
              actionCost = 0;
            }
          } else if (["UNLOCK", "MINE", "INTERACT", "OPEN_CHEST"].includes(String(actionStr))) {
            const playerRow = this.sql.exec("SELECT pos,state FROM players WHERE player_id = ?", session.playerId).toArray();
            const data = payload.data || {};
            const saved = this.sql.exec("SELECT value FROM room_meta WHERE key = ?",
              "levelSnapshot:" + this.currentDepth).toArray()[0];
            let currentLevel: any = null;
            try { currentLevel = saved ? JSON.parse(String(saved.value)) : null; } catch (_) {}
            const pendingTransition = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray().length > 0;
            const playerPos = Number(playerRow[0]?.pos);
            const requestedCost = data.engineActionCost;
            if (!pendingTransition && playerRow.length > 0 && String(playerRow[0].state) === "ALIVE"
                && currentLevel?.branch === 0
                && isValidNativeWorldActionIntent(actionStr, data, currentLevel, this.currentDepth, playerPos)
                && typeof requestedCost === "number" && Number.isFinite(requestedCost)
                && requestedCost >= 0 && requestedCost <= 10) {
              eventType = "WORLD_ACTION_RESOLVED";
              actionResultPayload = { playerId: session.playerId, actionType: String(actionStr),
                depth: this.currentDepth, from: playerPos, targetPos: Number(data.targetPos),
                targetTerrain: Number(currentLevel.tiles.find((tile: any) => tile.pos === Number(data.targetPos))?.terrain),
                ...(actionStr === "MINE" ? { sourceTerrain: Number(data.sourceTerrain) } : {}) };
              actionValid = true;
              actionCost = requestedCost;
            } else if (String(actionStr) === "MINE" && currentLevel && currentLevel.branch !== 0) {
              actionErrorCode = "UNSUPPORTED_BRANCH_TRANSITION";
            }
          } else if (actionStr === "MOVE" && targetPos >= 0) {
            const playerRow = this.sql.exec(`SELECT pos, state FROM players WHERE player_id = ?`, session.playerId).toArray();
            if (playerRow.length > 0 && String(playerRow[0].state) === "ALIVE") {
              const currentPos = Number(playerRow[0].pos);
              const data = payload.data || {};
              const levelRow = this.sql.exec(`SELECT width, height FROM levels WHERE depth = ?`, this.currentDepth).toArray();
              const mapWidth = Number(levelRow[0]?.width) || 0;
              const mapHeight = Number(levelRow[0]?.height) || 0;
              const levelSnapshotRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`,
                `levelSnapshot:${this.currentDepth}`).toArray()[0];
              let currentLevelSnapshot: any = null;
              try { currentLevelSnapshot = levelSnapshotRow ? JSON.parse(String(levelSnapshotRow.value)) : null; } catch (_) {}
              const tileRows = Array.isArray(currentLevelSnapshot?.tiles) ? currentLevelSnapshot.tiles.map((tile: any) => ({
                pos: Number(tile.pos), terrain: Number(tile.terrain), passable: tile.passable === true,
                solid: tile.solid === true, pit: tile.pit === true, avoid: tile.avoid === true
              })) : [];
              const occupiedPlayers = this.sql.exec(
                `SELECT pos FROM players WHERE player_id <> ? AND state = 'ALIVE'`, session.playerId
              ).toArray().map((row: any) => Number(row.pos));
              const occupiedMobs = this.sql.exec(
                `SELECT pos FROM mobs WHERE depth = ? AND hp > 0`, this.currentDepth
              ).toArray().map((row: any) => Number(row.pos));
              const trustedHeroRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + session.playerId).toArray()[0];
              let trustedHero: any = null;
              try { trustedHero = trustedHeroRow && typeof trustedHeroRow.value === "string"
                ? JSON.parse(String(trustedHeroRow.value)) : null; } catch (_) {}
              let environmentStepConfirmed = false;
              if (currentPos === targetPos && data.from !== currentPos) {
                const lastDamage = this.sql.exec("SELECT payload FROM events WHERE sender_id = ? AND event_type = 'PLAYER_DAMAGED' ORDER BY sequence DESC LIMIT 1",
                  session.playerId).toArray()[0];
                let payloadBeforeMove: any = null;
                try { payloadBeforeMove = lastDamage ? JSON.parse(String(lastDamage.payload)) : null; } catch (_) {}
                environmentStepConfirmed = !!payloadBeforeMove
                  && Number(payloadBeforeMove.targetPos) === Number(data.from)
                  && Number(payloadBeforeMove.targetPosAfter) === Number(data.to);
              }
              const acceptedFrom = data.from === currentPos || environmentStepConfirmed;
              const requestedCost = data.engineActionCost;
              const rootBlocked = !!trustedHero
                && (trustedHero.rooted === true || Number(trustedHero.paralysed || 0) > 0);
              const validStep = currentLevelSnapshot && data.depth === this.currentDepth
                && Number.isInteger(data.from) && Number.isInteger(data.to)
                && isValidNativeMoveIntent(data.from, data.to, mapWidth, mapHeight, tileRows,
                  occupiedPlayers.concat(occupiedMobs));
              if (!this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray().length
                  && playerRow.length > 0 && String(playerRow[0].state) === "ALIVE" && !rootBlocked
                  && acceptedFrom && validStep && typeof requestedCost === "number"
                  && Number.isFinite(requestedCost) && requestedCost >= 0 && requestedCost <= 10) {
                  // This is only an accepted intent. Do not expose/commit the destination until the
                // native mutation snapshot has passed complete terrain, occupancy and Hero validation.
                eventType = "MOVE_INTENT_ACCEPTED";
                actionResultPayload = { playerId: session.playerId, pos: targetPos, from: data.from,
                  to: targetPos, depth: this.currentDepth, environmentStepConfirmed };
                actionValid = true;
                actionCost = requestedCost;
              }
            }
          } else if (actionStr === "LVL_TRANSITION") {
            const playerRow = this.sql.exec(`SELECT pos, state FROM players WHERE player_id = ?`, session.playerId).toArray();
            const pendingRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = 'transitionPending'`).toArray();
            const publisherRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = 'levelPublisher'`).toArray();
            const sourceSnapshotRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`,
              `levelSnapshot:${this.currentDepth}`).toArray()[0];
            let sourceSnapshot: any = null;
            try { sourceSnapshot = sourceSnapshotRow ? JSON.parse(String(sourceSnapshotRow.value)) : null; } catch (_) {}
            const activePublisher = publisherRow.length > 0
              && this.sql.exec(`SELECT player_id FROM players WHERE player_id = ? AND connected = 1`, String(publisherRow[0]?.value)).toArray().length > 0;
            const transitionData = payload.data || {};
            if (canStartNativeFloorTransition(pendingRow.length > 0, playerRow[0]?.state, activePublisher)) {
              const currentPos = Number(playerRow[0].pos);
              const transition = resolveNativeTransitionIntent(sourceSnapshot, this.currentDepth, currentPos, transitionData);
              if (transition) {
                const pending = { ...transition, initiatorId: session.playerId,
                  publisherId: String(publisherRow[0].value), snapshotReady: false, startedAt: Date.now() };
                this.sql.exec(`INSERT INTO room_meta (key,value) VALUES ('transitionPending',?)
                  ON CONFLICT(key) DO UPDATE SET value=excluded.value`, JSON.stringify(pending));
                this.sql.exec(`DELETE FROM room_meta WHERE key LIKE 'transitionReady:%'`);
                this.state.storage.setAlarm(Date.now() + 30000).catch(() => {});
                // Keep the room on its source depth while the transition barrier is pending.
                // The destination becomes authoritative only in tryFinalizeLevelTransition().
                eventType = "LEVEL_TRANSITION";
                actionResultPayload = { ...transition, playerId: session.playerId };
                actionValid = true;
                actionCost = 1.0;
              } else {
                actionErrorCode = classifyNativeTransitionRejection(sourceSnapshot, this.currentDepth, currentPos, transitionData);
              }
            } else {
              actionErrorCode = classifyNativeTransitionRejection(sourceSnapshot, this.currentDepth,
                Number(playerRow[0]?.pos), transitionData);
            }
          } else if (actionStr === "ATTACK" && isValidNativeCombatRequestId(msg.requestId)) {
            let targetId = payload.data?.targetId || payload.targetId;
            const targetType = payload.data?.targetType || payload.targetType || "MOB";
            if (!["MOB", "PLAYER"].includes(String(targetType)) || !isValidNativeAttackIntent(payload.data)) {
              ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR",
                requestId: msg.requestId, sequence: this.currentSequence,
                payloadJson: JSON.stringify({ error: "INVALID_NATIVE_ATTACK_INTENT" }) }));
              return;
            }
            if (payload.data.attackWeaponMode === "SPIRIT_ARROW") {
              const trustedHeroRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?",
                "heroState:" + session.playerId).toArray()[0];
              const levelRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?",
                "levelSnapshot:" + this.currentDepth).toArray()[0];
              const playerRow = this.sql.exec("SELECT pos,hp,ht,state FROM players WHERE player_id = ?",
                session.playerId).toArray()[0];
              let levelSnapshot: any = null;
              try { levelSnapshot = levelRow && typeof levelRow.value === "string"
                ? JSON.parse(String(levelRow.value)) : null; } catch (_) {}
              const attackerStateBefore = payload.data?.attackerStateBefore;
              const preStateMatches = !!trustedHeroRow && typeof trustedHeroRow.value === "string"
                && !!playerRow && String(playerRow.state) === "ALIVE"
                && hasMatchingNativeHeroStateSnapshot(attackerStateBefore, String(trustedHeroRow.value))
                && Number(payload.data?.attackerPos) === Number(playerRow.pos);
              if (targetType !== "MOB" || !preStateMatches || !hasCompleteNativeLevelSnapshot(levelSnapshot)
                  || !isValidNativeSpiritArrowAttackIntent(payload.data, attackerStateBefore, levelSnapshot)) {
                ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR",
                  requestId: msg.requestId, sequence: this.currentSequence,
                  payloadJson: JSON.stringify({ error: "INVALID_NATIVE_SPIRIT_ARROW_INTENT" }) }));
                return;
              }
            }
            if (payload.data.attackWeaponMode === "THROWN" || payload.data.projectileMutation != null) {
              const playerRow = this.sql.exec("SELECT pos,state FROM players WHERE player_id = ?", session.playerId).toArray()[0];
              const trustedHeroRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?",
                "heroState:" + session.playerId).toArray()[0];
              const levelRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?",
                "levelSnapshot:" + this.currentDepth).toArray()[0];
              let levelSnapshot: any = null;
              try { levelSnapshot = levelRow && typeof levelRow.value === "string" ? JSON.parse(String(levelRow.value)) : null; } catch (_) {}
              if (payload.data.attackWeaponMode !== "THROWN" || !payload.data.projectileMutation
                  || !playerRow || !trustedHeroRow || !hasCompleteNativeLevelSnapshot(levelSnapshot)
                  || !isValidNativeProjectileCombatIntent(levelSnapshot, payload.data.projectileMutation,
                    this.currentDepth, session.playerId, playerRow, String(trustedHeroRow.value),
                    payload.data.attackerPos, payload.data.targetPos)) {
                ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR",
                  requestId: msg.requestId, sequence: this.currentSequence,
                  payloadJson: JSON.stringify({ error: "INVALID_NATIVE_PROJECTILE_INTENT" }) }));
                return;
              }
            }
            if (targetType === "MOB") {
              const publisherRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = 'levelPublisher'`).toArray()[0];
              const publisherId = String(publisherRow?.value || "");
              if (!publisherId) {
                ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR",
                  requestId: msg.requestId, sequence: this.currentSequence,
                  payloadJson: JSON.stringify({ error: "NATIVE_COMBAT_AUTHORITY_UNAVAILABLE" }) }));
                return;
              }
              if (!isAuthorizedNativeMobOwner(session.playerId, publisherId)) {
                const attackerStateBefore = payload.data?.attackerStateBefore;
                const targetEntityId = payload.data?.targetEntityId;
                const attackerRow = this.sql.exec(
                  `SELECT pos,hp,ht,state FROM players WHERE player_id = ?`, session.playerId
                ).toArray()[0];
                const trustedHeroRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`,
                  `heroState:${session.playerId}`).toArray()[0];
                let trustedHeroState: any = null;
                try {
                  trustedHeroState = trustedHeroRow && typeof trustedHeroRow.value === "string"
                    ? JSON.parse(String(trustedHeroRow.value)) : null;
                } catch (_) { trustedHeroState = null; }
                let reportedHeroState: any = null;
                try {
                  reportedHeroState = typeof attackerStateBefore === "string" ? JSON.parse(attackerStateBefore) : null;
                } catch (_) { reportedHeroState = null; }
                const preStateMatches = !!attackerRow && String(attackerRow.state) === "ALIVE"
                  && !!reportedHeroState && !!trustedHeroState
                  && Number(reportedHeroState.hp) === Number(attackerRow.hp)
                  && Number(reportedHeroState.ht) === Number(attackerRow.ht)
                  && Number(reportedHeroState.pos) === Number(attackerRow.pos)
                  && Number(reportedHeroState.shielding) === Number(trustedHeroState.shielding)
                  && hasMatchingNativeHeroStateSnapshot(attackerStateBefore, trustedHeroState);
                const levelSnapshotRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`,
                  `levelSnapshot:${this.currentDepth}`).toArray()[0];
                let savedLevel: any = null;
                try { savedLevel = levelSnapshotRow && typeof levelSnapshotRow.value === "string" ? JSON.parse(String(levelSnapshotRow.value)) : null; } catch (_) {}
                const resolvedMobId = resolveServerMobIdByEntityId(savedLevel, targetEntityId);
                const mobRow = resolvedMobId == null ? [] : this.sql.exec(
                  `SELECT hp,ht,pos FROM mobs WHERE mob_id = ? AND depth = ?`, resolvedMobId, this.currentDepth
                ).toArray();
                const targetMob = (Array.isArray(savedLevel?.mobs) ? savedLevel.mobs : [])
                  .find((mob: any) => Number(mob?.mobId) === Number(resolvedMobId));
                if (!preStateMatches || typeof targetEntityId !== "string" || mobRow.length === 0
                    || !targetMob || Number(mobRow[0].hp) <= 0) {
                  ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR",
                    requestId: msg.requestId, sequence: this.currentSequence,
                    payloadJson: JSON.stringify({ error: "NATIVE_COMBAT_PRESTATE_REJECTED" }) }));
                  return;
                }
                const pending = {
                  requestId: msg.requestId, attackerId: session.playerId, authorityId: publisherId,
                  targetType: "MOB", targetEntityId, targetId: resolvedMobId,
                  targetPos: Number(mobRow[0].pos), attackerPos: Number(attackerRow.pos),
                  targetLockKey: "MOB:" + targetEntityId, depth: this.currentDepth,
                  attackWeaponMode: payload.data.attackWeaponMode,
                  attackWeaponBundle: payload.data.attackWeaponBundle,
                  damageMultiplier: payload.data.damageMultiplier,
                  damageBonus: payload.data.damageBonus,
                  accuracyMultiplier: payload.data.accuracyMultiplier,
                  projectileMutation: payload.data.projectileMutation,
                  spiritArrow: payload.data.spiritArrow,
                  attackerStateBefore, attackerStateAfter: payload.heroStateJson
                };
                if (!this.reservePendingCombat(pending)) {
                  ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR",
                    requestId: msg.requestId, sequence: this.currentSequence,
                    payloadJson: JSON.stringify({ error: "NATIVE_COMBAT_ALREADY_PENDING" }) }));
                  return;
                }
                let authorityFound = false;
                for (const authorityWs of this.state.getWebSockets()) {
                  const authoritySession = authorityWs.deserializeAttachment() as SessionData | null;
                  if (!authoritySession || authoritySession.playerId !== publisherId) continue;
                  authorityFound = true;
                  authorityWs.send(JSON.stringify({
                    protocolVersion: "1.0.0", messageType: "COMBAT_REQUEST",
                    senderId: "SERVER", requestId: msg.requestId, sequence: this.currentSequence,
                    payloadJson: JSON.stringify({
                      requestId: msg.requestId, attackerId: session.playerId,
                      targetType: "MOB", targetEntityId,
                      attackerPos: Number(attackerRow.pos), targetPos: Number(mobRow[0].pos),
                      attackerStateBefore,
                      attackWeaponMode: payload.data.attackWeaponMode,
                      attackWeaponBundle: payload.data.attackWeaponBundle,
                      damageMultiplier: payload.data.damageMultiplier,
                      damageBonus: payload.data.damageBonus,
                      accuracyMultiplier: payload.data.accuracyMultiplier,
                      projectileMutation: payload.data.projectileMutation,
                      spiritArrow: payload.data.spiritArrow
                    })
                  }));
                }
                if (!authorityFound) {
                  this.clearPendingCombat(pending);
                  ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR",
                    requestId: msg.requestId, sequence: this.currentSequence,
                    payloadJson: JSON.stringify({ error: "NATIVE_COMBAT_AUTHORITY_UNAVAILABLE" }) }));
                }
                return;
              }
            }
            if (targetType === "PLAYER" && isValidNativeCombatRequestId(msg.requestId)
                && (this.gameMode === "PVP_ARENA" || this.gameMode === "DEATHMATCH")) {
              const defenderId = String(targetId || "");
              const attackerRow = this.sql.exec("SELECT pos,hp,ht,state FROM players WHERE player_id = ?", session.playerId).toArray();
              const defenderRow = this.sql.exec("SELECT pos,hp,ht,state FROM players WHERE player_id = ?", defenderId).toArray();
              const attackerStateRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + session.playerId).toArray()[0];
              const defenderStateRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + defenderId).toArray()[0];
              let trustedAttacker: any = null, trustedDefender: any = null, reportedAttacker: any = null, reportedDefender: any = null;
              try { trustedAttacker = attackerStateRow && typeof attackerStateRow.value === "string" ? JSON.parse(String(attackerStateRow.value)) : null; } catch (_) {}
              try { trustedDefender = defenderStateRow && typeof defenderStateRow.value === "string" ? JSON.parse(String(defenderStateRow.value)) : null; } catch (_) {}
              try { reportedAttacker = JSON.parse(String(payload.data?.attackerStateBefore || "")); } catch (_) {}
              try { reportedDefender = JSON.parse(String(payload.data?.targetHeroStateBefore || "")); } catch (_) {}
              const attackerStateBefore = payload.data?.attackerStateBefore;
              const defenderStateBefore = defenderStateRow && typeof defenderStateRow.value === "string"
                ? String(defenderStateRow.value) : "";
              const attackerPos = Number(attackerRow[0]?.pos), defenderPos = Number(defenderRow[0]?.pos);
              const preStatesMatch = !!defenderId && defenderId !== session.playerId
                && attackerRow.length > 0 && defenderRow.length > 0
                && String(attackerRow[0].state) === "ALIVE" && String(defenderRow[0].state) === "ALIVE"
                && hasMatchingNativeHeroStateSnapshot(attackerStateBefore, trustedAttacker)
                && hasMatchingNativeHeroStateSnapshot(defenderStateBefore, trustedDefender)
                && Number(attackerRow[0].hp) === Number(reportedAttacker?.hp)
                && Number(attackerRow[0].ht) === Number(reportedAttacker?.ht)
                && Number(attackerRow[0].pos) === Number(reportedAttacker?.pos)
                && Number(defenderRow[0].hp) === Number(reportedDefender?.hp)
                && Number(defenderRow[0].ht) === Number(reportedDefender?.ht)
                && Number(defenderRow[0].pos) === Number(reportedDefender?.pos);
              if (!preStatesMatch) {
                ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR",
                  requestId: msg.requestId, sequence: this.currentSequence,
                  payloadJson: JSON.stringify({ error: "NATIVE_PVP_PRESTATE_REJECTED" }) }));
                return;
              }
              const pending = { requestId: msg.requestId, attackerId: session.playerId, authorityId: defenderId,
                targetType: "PLAYER", targetId: defenderId, attackerPos, targetPos: defenderPos,
                targetLockKey: "PLAYER:" + defenderId, depth: this.currentDepth,
                attackWeaponMode: payload.data.attackWeaponMode,
                attackWeaponBundle: payload.data.attackWeaponBundle,
                damageMultiplier: payload.data.damageMultiplier,
                damageBonus: payload.data.damageBonus,
                accuracyMultiplier: payload.data.accuracyMultiplier,
                projectileMutation: payload.data.projectileMutation,
                attackerStateBefore, attackerStateAfter: payload.heroStateJson,
                targetHeroStateBefore: defenderStateBefore };
              if (!this.reservePendingCombat(pending)) {
                ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR",
                  requestId: msg.requestId, sequence: this.currentSequence,
                  payloadJson: JSON.stringify({ error: "NATIVE_COMBAT_ALREADY_PENDING" }) }));
                return;
              }
              let authorityFound = false;
              for (const authorityWs of this.state.getWebSockets()) {
                const authoritySession = authorityWs.deserializeAttachment() as SessionData | null;
                if (!authoritySession || authoritySession.playerId !== defenderId) continue;
                authorityFound = true;
                authorityWs.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "COMBAT_REQUEST",
                  senderId: "SERVER", requestId: msg.requestId, sequence: this.currentSequence,
                  payloadJson: JSON.stringify({ requestId: msg.requestId, attackerId: session.playerId,
                    targetType: "PLAYER", targetPlayerId: defenderId, attackerPos, targetPos: defenderPos,
                    attackerStateBefore, targetHeroStateBefore: defenderStateBefore,
                    attackWeaponMode: payload.data.attackWeaponMode,
                    attackWeaponBundle: payload.data.attackWeaponBundle,
                    damageMultiplier: payload.data.damageMultiplier,
                    damageBonus: payload.data.damageBonus,
                    accuracyMultiplier: payload.data.accuracyMultiplier,
                    projectileMutation: payload.data.projectileMutation }) }));
              }
              if (!authorityFound) {
                this.clearPendingCombat(pending);
                ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR",
                  requestId: msg.requestId, sequence: this.currentSequence,
                  payloadJson: JSON.stringify({ error: "NATIVE_COMBAT_AUTHORITY_UNAVAILABLE" }) }));
              }
              return;
            }
            let targetEntityId: string | null = null;
            if (targetType !== "PLAYER") {
              targetEntityId = typeof payload.data?.targetEntityId === "string" ? payload.data.targetEntityId : null;
              const savedLevelRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`,
                `levelSnapshot:${this.currentDepth}`).toArray()[0];
              let savedLevel: any = null;
              try { savedLevel = savedLevelRow && typeof savedLevelRow.value === "string" ? JSON.parse(String(savedLevelRow.value)) : null; } catch (_) {}
              // Never treat a publisher-local Actor.id() as a network identity.
              targetId = resolveServerMobIdByEntityId(savedLevel, targetEntityId);
            }

            const attackerRow = this.sql.exec(`SELECT pos,hp,ht,state FROM players WHERE player_id = ?`, session.playerId).toArray();
            const attackerStateRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", `heroState:${session.playerId}`).toArray()[0];
            const trustedAttackerStateJson = attackerStateRow && typeof attackerStateRow.value === "string"
              ? String(attackerStateRow.value) : "";
            const attackerStateBeforeJson = typeof payload.data?.attackerStateBefore === "string"
              ? payload.data.attackerStateBefore : "";
            if (attackerRow.length > 0) {
              const attackerPos = Number(attackerRow[0].pos);

              if (targetType === "PLAYER") {
                if (this.gameMode === "PVP_ARENA" || this.gameMode === "DEATHMATCH") {
                  const defenderRow = this.sql.exec(`SELECT pos, hp, ht, state FROM players WHERE player_id = ?`, String(targetId)).toArray();
                  const nativeResult = payload.data?.engineResult === true;
                  if (defenderRow.length > 0 && String(defenderRow[0].state) === "ALIVE" && nativeResult) {
                    const defPos = Number(defenderRow[0].pos);
                    const requestedPos = Number(payload.data?.targetPos ?? -1);
                    const distance = Number(payload.data?.engineDistance);
                    const nativeCost = Number(payload.data?.engineActionCost);
                    const ranged = payload.data?.engineRanged === true;
                    const targetHp = Number(payload.data?.targetHp);
                    const targetHt = Number(payload.data?.targetHt);
                    const reportedDamage = Number(payload.data?.damage);
                    const widthRow = this.sql.exec(`SELECT width FROM levels WHERE depth = ?`, this.currentDepth).toArray();
                    const width = Number(widthRow[0]?.width || 1);
                    const dx = Math.abs((attackerPos % width) - (defPos % width));
                    const dy = Math.abs(Math.floor(attackerPos / width) - Math.floor(defPos / width));
                    const authoritativeDistance = Math.max(dx, dy);
                    const targetPosAfter = Number(payload.data?.targetPosAfter ?? requestedPos);
                    const targetMoveDistance = Math.max(
                      Math.abs((targetPosAfter % width) - (defPos % width)),
                      Math.abs(Math.floor(targetPosAfter / width) - Math.floor(defPos / width))
                    );
                    const levelSize = Number(widthRow[0]?.width || 0) * Number(
                      this.sql.exec(`SELECT height FROM levels WHERE depth = ?`, this.currentDepth).toArray()[0]?.height || 0);
                    const defenderStateRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`,
                      `heroState:${String(targetId)}`).toArray()[0];
                    let defenderHeroState: any = null;
                    try {
                      defenderHeroState = defenderStateRow && typeof defenderStateRow.value === "string"
                        ? JSON.parse(String(defenderStateRow.value)) : null;
                    } catch (_) { defenderHeroState = null; }
                    const targetShieldBefore = payload.data?.targetShieldBefore;
                    const targetShieldAfter = payload.data?.targetShieldAfter;
                    const mergedTargetHeroStateJson = mergeNativeHeroState(defenderStateRow?.value,
                      payload.data?.targetHeroStateJson,
                      { hp: targetHp, ht: targetHt, pos: targetPosAfter, shielding: Number(targetShieldAfter) },
                      payload.data?.targetBuffs);
                    const targetHeroStateValid = mergedTargetHeroStateJson != null
                      && Number.isInteger(defenderHeroState?.hp) && defenderHeroState.hp === Number(defenderRow[0].hp)
                      && Number.isInteger(defenderHeroState?.ht) && defenderHeroState.ht === Number(defenderRow[0].ht)
                      && Number.isInteger(defenderHeroState?.pos) && defenderHeroState.pos === defPos;
                    const nativeCostValid = Number.isFinite(nativeCost) && nativeCost > 0 && nativeCost <= 10;
                    const validNativeTarget = requestedPos === defPos && nativeCostValid
                      && hasStrictNativeCombatFields(payload.data)
                      && hasMatchingNativeHeroBuffSnapshot(payload.data?.targetBuffsBefore, defenderHeroState)
                      && typeof payload.heroStateJson === "string" && payload.heroStateJson.length > 0 && payload.heroStateJson.length <= 200000
                      && isValidNativeCombatBuffs(payload.data?.targetBuffs)
                      && Number.isInteger(targetShieldBefore) && targetShieldBefore >= 0 && targetShieldBefore <= 100000
                      && Number.isInteger(targetShieldAfter) && targetShieldAfter >= 0 && targetShieldAfter <= 100000
                      && (defenderHeroState == null || !Number.isInteger(defenderHeroState?.shielding)
                        || targetShieldBefore === defenderHeroState.shielding)
                      && targetHeroStateValid
                      && isValidNativeMissTransition(payload.data?.engineHit,
                        payload.data?.targetHpBefore, targetHp, reportedDamage,
                        payload.data?.targetShieldBefore, payload.data?.targetShieldAfter,
                        payload.data?.targetBuffsBefore, payload.data?.targetBuffs,
                        defPos, targetPosAfter)
                      && (ranged
                        ? this.hasLineOfSight(attackerPos, defPos, this.currentDepth)
                        : this.isMeleeAdjacent(attackerPos, defPos, this.currentDepth))
                      && (targetPosAfter === defPos || (this.isValidCombatTargetPosition(targetPosAfter, this.currentDepth)
                        && this.isCombatDestinationFree(targetPosAfter, this.currentDepth, "PLAYER", String(targetId))))
                      && isValidNativeCombatEvent({
                        schemaVersion: payload.data?.combatSchemaVersion,
                        depth: payload.data?.combatDepth, currentDepth: this.currentDepth,
                        sessionPlayerId: session.playerId, attackerId: payload.data?.attackerId,
                        attackerPos: payload.data?.attackerPos, authoritativeAttackerPos: attackerPos,
                        targetType: "PLAYER", targetEntityId: payload.data?.targetEntityId ?? null,
                        expectedTargetEntityId: null, targetAlive: String(defenderRow[0].state) === "ALIVE",
                        targetPos: requestedPos, authoritativeTargetPos: defPos,
                        targetPosAfter, levelSize, targetMoveDistance,
                        previousHp: Number(defenderRow[0].hp), previousHt: Number(defenderRow[0].ht),
                        targetHpBefore: payload.data?.targetHpBefore, targetHtBefore: payload.data?.targetHtBefore,
                        targetHp, targetHt, damage: reportedDamage,
                        hit: payload.data?.engineHit, ranged, attackKind: payload.data?.attackKind,
                        distance, authoritativeDistance, actionCost: nativeCost
                      });
                    if (validNativeTarget) {
                      const newHp = targetHp;
                      const newState = newHp === 0
                        ? (this.gameMode === "DEATHMATCH" ? "ALIVE" : "SPECTATOR")
                        : "ALIVE";
                      this.sql.exec(`UPDATE players SET hp = ?, ht = ?, state = ?, pos = ? WHERE player_id = ?`,
                        newHp, targetHt, newState, targetPosAfter, String(targetId));
                      this.sql.exec(`INSERT INTO room_meta (key,value) VALUES (?,?)
                        ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
                        `heroState:${String(targetId)}`, String(mergedTargetHeroStateJson));
                      if (newHp === 0) {
                        this.sql.exec(`UPDATE players SET kills = kills + 1, score = score + 1 WHERE player_id = ?`, session.playerId);
                        this.sql.exec(`UPDATE players SET deaths = deaths + 1 WHERE player_id = ?`, String(targetId));
                      }
                      eventType = "PLAYER_ATTACKED";
                      actionResultPayload = {
                        attackerId: session.playerId, attackerType: "PLAYER", targetId: String(targetId), targetType: "PLAYER",
                        sourceType: "PLAYER", sourceEntityId: session.playerId, sourcePos: attackerPos,
                        sourceAttackKind: payload.data?.attackKind,
                        attackerPos, targetPos: defPos, targetPosAfter,
                        targetHpBefore: Number(payload.data?.targetHpBefore), targetHtBefore: Number(payload.data?.targetHtBefore),
                        targetShieldBefore, targetShieldAfter, targetHeroStateJson: mergedTargetHeroStateJson,
                        targetBuffsBefore: payload.data?.targetBuffsBefore,
                        hit: payload.data?.engineHit === true, damage: reportedDamage,
                        targetHp: newHp, targetHt, targetState: newState,
                        attackKind: payload.data?.attackKind, engineDistance: distance, engineActionCost: nativeCost,
                        targetBuffs: payload.data.targetBuffs, attackerStateJson: payload.heroStateJson,
                        engineResolved: true
                      };
                      actionValid = true;
                      actionCost = nativeCost;
                    }
                  }
                }
              } else {
                const mobRow = this.sql.exec(`SELECT mob_id, hp, ht, pos FROM mobs WHERE mob_id = ? AND depth = ?`, targetId, this.currentDepth).toArray();
                if (mobRow.length > 0) {
                  const mobPos = Number(mobRow[0].pos);
                  const nativeResult = payload.data?.engineResult === true;
                  const requestedPos = Number(payload.data?.targetPos ?? -1);

                  if (nativeResult) {
                    const distance = Number(payload.data?.engineDistance);
                    const nativeCost = Number(payload.data?.engineActionCost);
                    const ranged = payload.data?.engineRanged === true;
                    const targetHp = Number(payload.data?.targetHp);
                    const targetHt = Number(payload.data?.targetHt);
                    const reportedDamage = Number(payload.data?.damage);
                    const widthRow = this.sql.exec(`SELECT width FROM levels WHERE depth = ?`, this.currentDepth).toArray();
                    const width = Number(widthRow[0]?.width || 1);
                    const dx = Math.abs((attackerPos % width) - (mobPos % width));
                    const dy = Math.abs(Math.floor(attackerPos / width) - Math.floor(mobPos / width));
                    const authoritativeDistance = Math.max(dx, dy);
                    const targetPosAfter = Number(payload.data?.targetPosAfter ?? requestedPos);
                    const targetMoveDistance = Math.max(
                      Math.abs((targetPosAfter % width) - (mobPos % width)),
                      Math.abs(Math.floor(targetPosAfter / width) - Math.floor(mobPos / width))
                    );
                    const levelSize = Number(widthRow[0]?.width || 0) * Number(
                      this.sql.exec(`SELECT height FROM levels WHERE depth = ?`, this.currentDepth).toArray()[0]?.height || 0);
                    const nativeCostValid = Number.isFinite(nativeCost) && nativeCost > 0 && nativeCost <= 10;
                    const combatLevelRow = this.sql.exec(`SELECT value FROM room_meta WHERE key = ?`,
                      `levelSnapshot:${this.currentDepth}`).toArray()[0];
                    let combatLevel: any = null;
                    try {
                      combatLevel = combatLevelRow && typeof combatLevelRow.value === "string"
                        ? JSON.parse(String(combatLevelRow.value)) : null;
                    } catch (_) { combatLevel = null; }
                    const savedTargetMob = (combatLevel && Array.isArray(combatLevel.mobs) ? combatLevel.mobs : [])
                      .find((mob: any) => Number(mob?.mobId) === Number(targetId));
                    const expectedEntityId = savedTargetMob?.entityId || "";
                    const targetBuffPreStateMatches = !!savedTargetMob
                      && hasMatchingNativeBuffSnapshot(payload.data?.targetBuffsBefore, savedTargetMob.buffs);
                    const targetShieldPreStateMatches = !!savedTargetMob
                      && hasMatchingNativeMobShieldSnapshot(payload.data?.targetShieldBefore,
                        payload.data?.targetShieldAfter, savedTargetMob.shielding);
                    const targetMobBundleValid = targetHp <= 0 || isValidNativeMobBundle(payload.data?.targetMobBundleAfter);
                    const secondaryMobPayload = parseAndValidateNativeSecondaryMobDeltas(
                      payload.data?.secondaryMobDeltas, combatLevel?.mobs, levelSize, width, false, String(targetEntityId));
                    const secondaryDeathPositions = (secondaryMobPayload?.deltas || [])
                      .filter((delta: any) => Number(delta.hpAfter) === 0)
                      .map((delta: any) => Number(delta.posAfter));
                    const allDeathPositions = [
                      ...(targetHp <= 0 ? [targetPosAfter] : []),
                      ...secondaryDeathPositions
                    ];
                    const mergedAttackerState = attackerRow.length > 0
                      ? mergeNativeCombatAttackerState(trustedAttackerStateJson, attackerStateBeforeJson,
                          payload.heroStateJson, attackerRow[0], allDeathPositions.length > 0)
                      : null;
                    const lootSnapshot = targetHp <= 0 ? payload.data?.heaps
                      : secondaryDeathPositions.length > 0 ? secondaryMobPayload?.heaps : undefined;
                    const projectileTargetCell = Number(payload.data?.projectileMutation?.targetPos);
                    const lootAllowedPositions = payload.data?.projectileOutcome === "HEAP"
                      ? [...allDeathPositions, ...(Number.isInteger(projectileTargetCell) ? [projectileTargetCell] : [])]
                      : allDeathPositions;
                    const validLootSnapshot = secondaryMobPayload != null
                      && (allDeathPositions.length === 0
                        ? payload.data?.heaps === undefined && secondaryMobPayload.heaps === undefined
                        : isValidNativeLootSnapshot(lootSnapshot, combatLevel?.heaps, lootAllowedPositions, levelSize)
                          && (secondaryDeathPositions.length === 0
                            || (payload.data?.projectileMutation == null || sameNativeItemValue(payload.data?.heaps, secondaryMobPayload.heaps))));
                    const validProjectileResult = isValidNativeProjectileCombatResult(
                      combatLevel?.heaps, payload.data, requestedPos, allDeathPositions, levelSize);
                    const validNativeTarget = requestedPos === mobPos && nativeCostValid
                      && hasStrictNativeCombatFields(payload.data)
                      && targetBuffPreStateMatches
                      && targetShieldPreStateMatches
                      && targetMobBundleValid
                      && isValidNativeMissTransition(payload.data?.engineHit,
                        payload.data?.targetHpBefore, targetHp, reportedDamage,
                        payload.data?.targetShieldBefore, payload.data?.targetShieldAfter,
                        payload.data?.targetBuffsBefore, payload.data?.targetBuffs,
                        mobPos, targetPosAfter)
                      && validLootSnapshot
                      && validProjectileResult
                      && mergedAttackerState != null
                      && typeof payload.heroStateJson === "string" && payload.heroStateJson.length > 0 && payload.heroStateJson.length <= 200000
                      && isValidNativeCombatBuffs(payload.data?.targetBuffs)
                      && (ranged
                        ? this.hasLineOfSight(attackerPos, mobPos, this.currentDepth)
                        : this.isMeleeAdjacent(attackerPos, mobPos, this.currentDepth))
                      && (targetPosAfter === mobPos || (this.isValidCombatTargetPosition(targetPosAfter, this.currentDepth)
                        && this.isCombatDestinationFree(targetPosAfter, this.currentDepth, "MOB", Number(targetId))))
                      && isValidNativeCombatEvent({
                        schemaVersion: payload.data?.combatSchemaVersion,
                        depth: payload.data?.combatDepth, currentDepth: this.currentDepth,
                        sessionPlayerId: session.playerId, attackerId: payload.data?.attackerId,
                        attackerPos: payload.data?.attackerPos, authoritativeAttackerPos: attackerPos,
                        targetType: "MOB", targetEntityId, expectedTargetEntityId: String(expectedEntityId),
                        targetAlive: Number(mobRow[0].hp) > 0,
                        targetPos: requestedPos, authoritativeTargetPos: mobPos,
                        targetPosAfter, levelSize, targetMoveDistance,
                        previousHp: Number(mobRow[0].hp), previousHt: Number(mobRow[0].ht),
                        targetHpBefore: payload.data?.targetHpBefore, targetHtBefore: payload.data?.targetHtBefore,
                        targetHp, targetHt, damage: reportedDamage,
                        hit: payload.data?.engineHit, ranged, attackKind: payload.data?.attackKind,
                        distance, authoritativeDistance, actionCost: nativeCost
                      });
                    if (validNativeTarget) {
                      const newHp = targetHp;
                      const rawDmg = reportedDamage;
                      this.sql.exec(`UPDATE mobs SET hp = ?, ht = ?, pos = ? WHERE mob_id = ? AND depth = ?`,
                        newHp, targetHt, targetPosAfter, targetId, this.currentDepth);
                      const savedMob = (Array.isArray(combatLevel?.mobs) ? combatLevel.mobs : [])
                        .find((mob: any) => Number(mob?.mobId) === Number(targetId));
                      if (!savedMob) throw new Error("Accepted combat target missing from native snapshot");
                      savedMob.hp = newHp;
                      savedMob.ht = targetHt;
                      savedMob.pos = targetPosAfter;
                      savedMob.buffs = JSON.parse(String(payload.data.targetBuffs));
                       if (newHp > 0) savedMob.serializedBundle = String(payload.data.targetMobBundleAfter);
                       savedMob.shielding = Number(payload.data.targetShieldAfter);
                      if (allDeathPositions.length > 0) combatLevel.heaps = lootSnapshot;
                      else if (payload.data?.projectileOutcome === "HEAP") combatLevel.heaps = payload.data.projectileHeaps;
                      for (const delta of secondaryMobPayload.deltas) {
                        const secondaryMobId = resolveServerMobIdByEntityId(combatLevel, delta.entityId);
                        if (secondaryMobId == null) throw new Error("Secondary combat mob identity disappeared after validation");
                        const secondaryMob = combatLevel.mobs.find((mob: any) => Number(mob.mobId) === secondaryMobId);
                        if (!secondaryMob) throw new Error("Secondary combat mob missing from authoritative snapshot");
                        secondaryMob.hp = delta.hpAfter;
                        secondaryMob.ht = delta.htAfter;
                        secondaryMob.pos = delta.posAfter;
                        secondaryMob.shielding = delta.shieldAfter;
                        secondaryMob.buffs = JSON.parse(delta.buffsAfter);
                         secondaryMob.serializedBundle = delta.serializedBundleAfter;
                        this.sql.exec(`UPDATE mobs SET hp = ?, ht = ?, pos = ? WHERE mob_id = ? AND depth = ?`,
                          delta.hpAfter, delta.htAfter, delta.posAfter, secondaryMobId, this.currentDepth);
                      }
                      const deadMobEntityIds = [
                        ...(newHp === 0 ? [String(targetEntityId)] : []),
                        ...secondaryMobPayload.deltas.filter((delta: any) => Number(delta.hpAfter) === 0)
                          .map((delta: any) => String(delta.entityId))
                      ];
                      const deletedMobIds = removeDeadNativeMobsFromSnapshot(combatLevel, deadMobEntityIds);
                      if (deletedMobIds == null) throw new Error("Validated dead native mob identity disappeared");
                      for (const deadMobId of deletedMobIds) {
                        this.sql.exec(`DELETE FROM mobs WHERE mob_id = ? AND depth = ?`, deadMobId, this.currentDepth);
                      }
                      this.sql.exec(`INSERT INTO room_meta (key,value) VALUES (?,?)
                        ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
                        `levelSnapshot:${this.currentDepth}`, JSON.stringify(combatLevel));
                      // A direct native attack can also damage/heal the attacker via thorns,
                      // life-link, weapon procs, or consume a thrown weapon. Persist that exact
                      // post-state in the same commit as the target's result; the generic action
                      // state refresh intentionally refuses changed HP and would otherwise drop it.
                      const attackerAfter = JSON.parse(String(mergedAttackerState));
                      const attackerHpAfter = Number(attackerAfter.hp);
                      const attackerHtAfter = Number(attackerAfter.ht);
                      const attackerStateAfter = attackerHpAfter > 0 ? "ALIVE"
                        : this.gameMode === "DEATHMATCH" ? "ALIVE"
                          : this.gameMode === "PVP_ARENA" ? "SPECTATOR" : "DEAD";
                      this.sql.exec(`UPDATE players SET hp = ?, ht = ?, pos = ?, state = ? WHERE player_id = ?`,
                        attackerHpAfter, attackerHtAfter, Number(attackerAfter.pos), attackerStateAfter, session.playerId);
                      this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                        `heroState:${session.playerId}`, String(mergedAttackerState));
                      if (String(attackerRow[0].state) === "ALIVE" && attackerStateAfter !== "ALIVE") {
                        this.sql.exec("UPDATE players SET deaths = deaths + 1 WHERE player_id = ?", session.playerId);
                      }
                      eventType = "PLAYER_ATTACKED";
                      actionResultPayload = {
                        attackerId: session.playerId, attackerType: "PLAYER", targetId: targetEntityId, targetType: "MOB",
                        sourceType: "PLAYER", sourceEntityId: session.playerId, sourcePos: attackerPos,
                        sourceAttackKind: payload.data?.attackKind,
                        attackerPos, targetPos: mobPos, targetPosAfter,
                        targetHpBefore: Number(payload.data?.targetHpBefore), targetHtBefore: Number(payload.data?.targetHtBefore),
                        targetShieldBefore: Number(payload.data?.targetShieldBefore), targetShieldAfter: Number(payload.data?.targetShieldAfter),
                        targetHeroStateJson: null, targetBuffsBefore: payload.data?.targetBuffsBefore,
                        targetMobBundleAfter: newHp > 0 ? String(payload.data?.targetMobBundleAfter) : null,
                        hit: payload.data?.engineHit === true, damage: rawDmg, targetHp: newHp,
                        targetHt, attackKind: payload.data?.attackKind, engineDistance: distance, engineActionCost: nativeCost,
                        targetBuffs: payload.data.targetBuffs, attackerStateJson: String(mergedAttackerState),
                        secondaryMobDeltas: secondaryMobPayload,
                         projectileOutcome: payload.data?.projectileOutcome,
                         projectileResultItemId: payload.data?.projectileMutation?.resultItemId,
                        engineResolved: true
                      };
                      actionValid = true;
                      actionCost = nativeCost;
                    }
                  }
                }
              }
            }
          } else if (actionStr === "WAIT") {
            const playerRow = this.sql.exec(`SELECT state FROM players WHERE player_id = ?`, session.playerId).toArray();
            if (playerRow.length > 0 && String(playerRow[0].state) === "ALIVE") {
              eventType = "PLAYER_WAITED";
              actionResultPayload = { playerId: session.playerId };
              actionValid = true;
              actionCost = 1.0;
            }
          } else if (actionStr === "USE_ABILITY") {
            const data = payload.data || {};
            const requestId = String(msg.requestId || "");
            const savedRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", `levelSnapshot:${this.currentDepth}`).toArray()[0];
            let levelSnapshot: any = null;
            try { levelSnapshot = savedRow && typeof savedRow.value === "string" ? JSON.parse(String(savedRow.value)) : null; } catch (_) {}
            const playerRow = this.sql.exec("SELECT pos,state FROM players WHERE player_id = ?", session.playerId).toArray()[0];
            const heroRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + session.playerId).toArray()[0];
            const pending = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray().length > 0;
            if (!pending && requestId.length > 0 && requestId.length <= 128 && playerRow && heroRow
                && hasCompleteNativeLevelSnapshot(levelSnapshot)
                && hasMatchingNativeHeroStateSnapshot(String(payload.heroStateJson || ""), String(heroRow.value))
                && isValidNativeAbilityIntent(levelSnapshot, data, this.currentDepth, session.playerId, playerRow, heroRow.value)) {
              eventType = "WORLD_ACTION_RESOLVED";
              actionResultPayload = { playerId:session.playerId, actionType:"USE_ABILITY",
                from:Number(playerRow.pos), targetPos:Number(playerRow.pos), depth:this.currentDepth,
                abilityClass:String(data.abilityClass), armorItemId:String(data.armorItemId),
                armorClass:String(data.armorClass), armorChargeBefore:Number(data.armorChargeBefore),
                armorChargeAfter:Number(data.armorChargeAfter), armorChargeUse:Number(data.armorChargeUse),
                engineActionCost:Number(data.engineActionCost) };
              actionValid = true;
              actionCost = Number(data.engineActionCost);
            }
          } else if (actionStr === "ALCHEMY") {
            const data = payload.data || {};
            const requestId = String(msg.requestId || "");
            const savedRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", `levelSnapshot:${this.currentDepth}`).toArray()[0];
            let levelSnapshot: any = null;
            try { levelSnapshot = savedRow && typeof savedRow.value === "string" ? JSON.parse(String(savedRow.value)) : null; } catch (_) {}
            const playerRow = this.sql.exec("SELECT pos,state FROM players WHERE player_id = ?", session.playerId).toArray()[0];
            const heroRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + session.playerId).toArray()[0];
            const pending = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray().length > 0;
            if (!pending && requestId.length > 0 && requestId.length <= 128 && playerRow && heroRow
                && hasCompleteNativeLevelSnapshot(levelSnapshot)
                && hasMatchingNativeHeroStateSnapshot(String(payload.heroStateJson || ""), String(heroRow.value))
                && isValidNativeAlchemyIntent(levelSnapshot, data, this.currentDepth, session.playerId, playerRow, heroRow.value)) {
              eventType = "WORLD_ACTION_RESOLVED";
              actionResultPayload = { playerId:session.playerId, actionType:"ALCHEMY",
                from:Number(playerRow.pos), targetPos:Number(playerRow.pos), depth:this.currentDepth,
                ingredients:data.ingredients, alchemyEnergyBefore:data.alchemyEnergyBefore, alchemyEnergyAfter:data.alchemyEnergyAfter,
                resultItemId:String(data.resultItemId), resultItemClass:String(data.resultItemClass),
                resultQuantity:Number(data.resultQuantity), resultStackable:data.resultStackable,
                resultLocation:String(data.resultLocation), resultHeapId:String(data.resultHeapId || ""),
                resultNativeValue:Number(data.resultNativeValue), resultNativeUnitValue:Number(data.resultNativeUnitValue) };
              actionValid = true;
              actionCost = Number(data.engineActionCost);
            }
          } else if (actionStr === "THROW") {
            const data = payload.data || {};
            const requestId = String(msg.requestId || "");
            const savedRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", `levelSnapshot:${this.currentDepth}`).toArray()[0];
            let levelSnapshot: any = null;
            try { levelSnapshot = savedRow && typeof savedRow.value === "string" ? JSON.parse(String(savedRow.value)) : null; } catch (_) {}
            const playerRow = this.sql.exec("SELECT pos,state FROM players WHERE player_id = ?", session.playerId).toArray()[0];
            const heroRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + session.playerId).toArray()[0];
            const pending = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray().length > 0;
            if (!pending && requestId.length > 0 && requestId.length <= 128 && playerRow && heroRow
                && hasCompleteNativeLevelSnapshot(levelSnapshot)
                && hasMatchingNativeHeroStateSnapshot(String(payload.heroStateJson || ""), String(heroRow.value))
                && isValidNativeThrowIntent(levelSnapshot, data, this.currentDepth, session.playerId, playerRow, heroRow.value)) {
              eventType = "WORLD_ACTION_RESOLVED";
              actionResultPayload = { playerId:session.playerId, actionType:"THROW", from:Number(playerRow.pos),
                targetPos:Number(data.targetPos), depth:this.currentDepth, itemId:String(data.itemId),
                itemClass:String(data.itemClass), heapId:String(data.heapId), resultItemId:String(data.resultItemId),
                expectedQuantity:Number(data.expectedQuantity), sourceQuantityBefore:Number(data.sourceQuantityBefore),
                stackable:data.stackable };
              actionValid = true;
              actionCost = Number(data.engineActionCost);
            }
          } else if (actionStr === "USE_ITEM") {
            const data = payload.data || {};
            const requestId = String(msg.requestId || "");
            const savedRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", `levelSnapshot:${this.currentDepth}`).toArray()[0];
            let levelSnapshot: any = null;
            try { levelSnapshot = savedRow && typeof savedRow.value === "string" ? JSON.parse(String(savedRow.value)) : null; } catch (_) {}
            const playerRow = this.sql.exec("SELECT pos,state FROM players WHERE player_id = ?", session.playerId).toArray()[0];
            const heroRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + session.playerId).toArray()[0];
            const pending = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray().length > 0;
            if (!pending && requestId.length > 0 && requestId.length <= 128 && playerRow && heroRow
                && hasCompleteNativeLevelSnapshot(levelSnapshot)
                && hasMatchingNativeHeroStateSnapshot(String(payload.heroStateJson || ""), String(heroRow.value))
                && isValidNativeUseItemIntent(levelSnapshot, data, this.currentDepth, session.playerId, playerRow, heroRow.value)) {
              eventType = "WORLD_ACTION_RESOLVED";
              actionResultPayload = { playerId:session.playerId, actionType:"USE_ITEM", from:Number(playerRow.pos),
                targetPos:Number(playerRow.pos), depth:this.currentDepth, itemId:String(data.itemId),
                itemClass:String(data.itemClass), itemAction:String(data.itemAction),
                expectedQuantity:Number(data.expectedQuantity), sourceQuantityBefore:Number(data.sourceQuantityBefore),
                stackable:data.stackable };
              actionValid = true;
              actionCost = Number(data.engineActionCost);
            }
          } else if (actionStr === "PICKUP") {
            const data = payload.data || {};
            const itemPos = Number(data.itemPos ?? targetPos);
            const savedRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", `levelSnapshot:${this.currentDepth}`).toArray()[0];
            let levelSnapshot: any = null;
            try { levelSnapshot = savedRow && typeof savedRow.value === "string" ? JSON.parse(String(savedRow.value)) : null; } catch (_) {}
            const playerRow = this.sql.exec("SELECT pos,state FROM players WHERE player_id = ?", session.playerId).toArray()[0];
            const pickupHeroRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + session.playerId).toArray()[0];
            const transitionPending = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray().length > 0;
            const pickupRequestId = String(msg.requestId || "");
            this.sql.exec("DELETE FROM claimed_item_instances WHERE created_at < datetime('now', '-2 minutes')");
            if (!transitionPending && pickupRequestId.length > 0 && pickupRequestId.length <= 128
                && hasCompleteNativeLevelSnapshot(levelSnapshot)
                && isValidNativePickupIntent(levelSnapshot, data, this.currentDepth, session.playerId, playerRow,
                  typeof pickupHeroRow?.value === "string" ? String(pickupHeroRow.value) : undefined)
                && itemPos === Number(targetPos)) {
              const reserved = reserveNativeLootClaim(this.nativeActionTransactionStorage(), this.sql, this.currentDepth,
                Number(data.branch), String(data.heapId), String(data.itemId), session.playerId, pickupRequestId);
              if (!reserved) {
                ws.send(JSON.stringify({ protocolVersion: "1.0.0", messageType: "ERROR", requestId: msg.requestId,
                  sequence: this.currentSequence,
                  payloadJson: JSON.stringify({ error: "ITEM_ALREADY_CLAIMED", itemPos, heapId: data.heapId, itemId: data.itemId }) }));
                return;
              }
              eventType = "ITEM_PICKUP_INTENT_ACCEPTED";
              actionResultPayload = {
                playerId: session.playerId, actionType: "PICKUP", from: itemPos, targetPos: itemPos,
                itemPos, depth: this.currentDepth, branch: Number(data.branch),
                heapId: String(data.heapId), itemId: String(data.itemId),
                itemClass: String(data.itemClass), itemBundle: String(data.itemBundle || ""),
                expectedQuantity: Number(data.expectedQuantity), stackable: data.stackable
              };
              actionValid = true;
              actionCost = Number(data.engineActionCost);
            }
          } else if (actionStr === "DROP") {
            const data = payload.data || {};
            const savedRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", `levelSnapshot:${this.currentDepth}`).toArray()[0];
            let levelSnapshot: any = null;
            try { levelSnapshot = savedRow && typeof savedRow.value === "string" ? JSON.parse(String(savedRow.value)) : null; } catch (_) {}
            const playerRow = this.sql.exec("SELECT pos,state FROM players WHERE player_id = ?", session.playerId).toArray()[0];
            const heroRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + session.playerId).toArray()[0];
            const pending = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray().length > 0;
            if (!pending && hasCompleteNativeLevelSnapshot(levelSnapshot) && playerRow && heroRow
                && hasMatchingNativeHeroStateSnapshot(String(payload.heroStateJson || ""), String(heroRow.value))
                && isValidNativeDropIntent(levelSnapshot, data, this.currentDepth, session.playerId, playerRow, heroRow.value)) {
              eventType = "WORLD_ACTION_RESOLVED";
              actionResultPayload = { playerId:session.playerId, actionType:"DROP", from:Number(playerRow.pos),
                targetPos:Number(playerRow.pos), depth:this.currentDepth, heapId:String(data.heapId), itemId:String(data.itemId),
                resultItemId:String(data.resultItemId), itemClass:String(data.itemClass),
                expectedQuantity:Number(data.expectedQuantity), sourceQuantityBefore:Number(data.sourceQuantityBefore), stackable:data.stackable };
              actionValid = true;
              actionCost = Number(data.engineActionCost);
            }
          } else if (actionStr === "BUY") {
            const data = payload.data || {};
            const requestId = String(msg.requestId || "");
            const savedRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", `levelSnapshot:${this.currentDepth}`).toArray()[0];
            let levelSnapshot: any = null;
            try { levelSnapshot = savedRow && typeof savedRow.value === "string" ? JSON.parse(String(savedRow.value)) : null; } catch (_) {}
            const playerRow = this.sql.exec("SELECT pos,state FROM players WHERE player_id = ?", session.playerId).toArray()[0];
            const heroRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + session.playerId).toArray()[0];
            const pending = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray().length > 0;
            if (!pending && requestId.length > 0 && requestId.length <= 128 && playerRow && heroRow
                && hasCompleteNativeLevelSnapshot(levelSnapshot)
                && hasMatchingNativeHeroStateSnapshot(String(payload.heroStateJson || ""), String(heroRow.value))
                && isValidNativeBuyIntent(levelSnapshot, data, this.currentDepth, session.playerId, playerRow, heroRow.value)) {
              this.sql.exec("DELETE FROM claimed_item_instances WHERE created_at < datetime('now', '-2 minutes')");
              const reserved = reserveNativeLootClaim(this.nativeActionTransactionStorage(), this.sql, this.currentDepth,
                Number(data.branch), String(data.heapId), String(data.itemId), session.playerId, requestId);
              if (!reserved) {
                ws.send(JSON.stringify({ protocolVersion:"1.0.0", messageType:"ERROR", requestId:msg.requestId,
                  sequence:this.currentSequence, payloadJson:JSON.stringify({error:"ITEM_ALREADY_CLAIMED",heapId:data.heapId,itemId:data.itemId}) }));
                return;
              }
              eventType = "WORLD_ACTION_RESOLVED";
              actionResultPayload = { playerId:session.playerId, actionType:"BUY", from:Number(playerRow.pos),
                targetPos:Number(playerRow.pos), depth:this.currentDepth, branch:Number(data.branch),
                heapId:String(data.heapId), itemId:String(data.itemId),
                itemClass:String(data.itemClass), expectedQuantity:Number(data.expectedQuantity), sourceQuantityBefore:Number(data.sourceQuantityBefore),
                stackable:data.stackable, itemLevel:Number(data.itemLevel), cursed:data.cursed, cursedKnown:data.cursedKnown,
                itemBundle:String(data.itemBundle), price:Number(data.price), resultItemId:String(data.resultItemId),
                resultHeapId:String(data.resultHeapId || ""), acquiredByInventory:data.acquiredByInventory };
              actionValid = true;
              actionCost = Number(data.engineActionCost);
            }
          } else if (actionStr === "BUYBACK") {
            const data = payload.data || {};
            const requestId = String(msg.requestId || "");
            const savedRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", `levelSnapshot:${this.currentDepth}`).toArray()[0];
            let levelSnapshot: any = null;
            try { levelSnapshot = savedRow && typeof savedRow.value === "string" ? JSON.parse(String(savedRow.value)) : null; } catch (_) {}
            const playerRow = this.sql.exec("SELECT pos,state FROM players WHERE player_id = ?", session.playerId).toArray()[0];
            const heroRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + session.playerId).toArray()[0];
            const pending = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray().length > 0;
            if (!pending && requestId.length > 0 && requestId.length <= 128 && playerRow && heroRow
                && hasCompleteNativeLevelSnapshot(levelSnapshot)
                && hasMatchingNativeHeroStateSnapshot(String(payload.heroStateJson || ""), String(heroRow.value))
                && isValidNativeBuybackIntent(levelSnapshot, data, this.currentDepth, session.playerId, playerRow, heroRow.value)) {
              this.sql.exec("DELETE FROM claimed_item_instances WHERE created_at < datetime('now', '-2 minutes')");
              const reserved = reserveNativeLootClaim(this.nativeActionTransactionStorage(), this.sql, this.currentDepth, 0,
                String(data.shopEntityId), String(data.buybackItemId), session.playerId, requestId);
              if (!reserved) {
                ws.send(JSON.stringify({ protocolVersion:"1.0.0", messageType:"ERROR", requestId:msg.requestId,
                  sequence:this.currentSequence, payloadJson:JSON.stringify({error:"ITEM_ALREADY_CLAIMED",
                    shopEntityId:data.shopEntityId,buybackItemId:data.buybackItemId}) }));
                return;
              }
              eventType = "WORLD_ACTION_RESOLVED";
              actionResultPayload = {
                playerId:session.playerId, actionType:"BUYBACK", from:Number(playerRow.pos),
                targetPos:Number(playerRow.pos), depth:this.currentDepth, branch:0,
                shopEntityId:String(data.shopEntityId), buybackItemId:String(data.buybackItemId),
                buybackItemClass:String(data.buybackItemClass), buybackQuantity:Number(data.buybackQuantity),
                price:Number(data.price), resultItemId:String(data.resultItemId), itemClass:String(data.itemClass),
                itemLevel:Number(data.itemLevel), cursed:data.cursed, cursedKnown:data.cursedKnown,
                stackable:data.stackable, nativeValue:Number(data.nativeValue),
                nativeUnitValue:Number(data.nativeUnitValue), resultItemBundle:String(data.resultItemBundle)
              };
              actionValid = true;
              actionCost = Number(data.engineActionCost);
            }
          } else if (actionStr === "SELL") {
            const data = payload.data || {};
            const requestId = String(msg.requestId || "");
            const savedRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", `levelSnapshot:${this.currentDepth}`).toArray()[0];
            let levelSnapshot: any = null;
            try { levelSnapshot = savedRow && typeof savedRow.value === "string" ? JSON.parse(String(savedRow.value)) : null; } catch (_) {}
            const playerRow = this.sql.exec("SELECT pos,state FROM players WHERE player_id = ?", session.playerId).toArray()[0];
            const heroRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + session.playerId).toArray()[0];
            const pending = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray().length > 0;
            if (!pending && requestId.length > 0 && requestId.length <= 128 && playerRow && heroRow
                && hasCompleteNativeLevelSnapshot(levelSnapshot)
                && hasMatchingNativeHeroStateSnapshot(String(payload.heroStateJson || ""), String(heroRow.value))
                && isValidNativeSellIntent(levelSnapshot, data, this.currentDepth, session.playerId, playerRow, heroRow.value)) {
              eventType = "WORLD_ACTION_RESOLVED";
              actionResultPayload = {
                playerId: session.playerId, actionType: "SELL", from: Number(playerRow.pos),
                targetPos: Number(playerRow.pos), depth: this.currentDepth, branch: 0,
                shopEntityId: String(data.shopEntityId), sourceItemId: String(data.sourceItemId),
                resultItemId: String(data.resultItemId), itemClass: String(data.itemClass),
                sourceQuantityBefore: Number(data.sourceQuantityBefore), soldQuantity: Number(data.soldQuantity),
                sourceItemLevel: Number(data.sourceItemLevel), sourceCursed: data.sourceCursed,
                sourceCursedKnown: data.sourceCursedKnown,
                sourceNativeValue: Number(data.sourceNativeValue), sourceNativeUnitValue: Number(data.sourceNativeUnitValue),
                price: Number(data.price), stackable: data.stackable, resultItemBundle: String(data.resultItemBundle),
                resultItemLevel: Number(data.resultItemLevel), resultCursed: data.resultCursed,
                resultCursedKnown: data.resultCursedKnown, resultNativeValue: Number(data.resultNativeValue),
                resultNativeUnitValue: Number(data.resultNativeUnitValue)
              };
              actionValid = true;
              actionCost = Number(data.engineActionCost);
            }
          } else if (actionStr === "EQUIP" || actionStr === "UNEQUIP") {
            const data = payload.data || {};
            const playerRow = this.sql.exec("SELECT pos,state FROM players WHERE player_id = ?", session.playerId).toArray()[0];
            const heroRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + session.playerId).toArray()[0];
            const pending = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray().length > 0;
            if (!pending && playerRow && heroRow
                && hasMatchingNativeHeroStateSnapshot(String(payload.heroStateJson || ""), String(heroRow.value))
                && isValidNativeEquipmentIntent(heroRow.value, data, actionStr, this.currentDepth, playerRow)) {
              eventType = "WORLD_ACTION_RESOLVED";
              actionResultPayload = { playerId:session.playerId, actionType:actionStr, from:Number(playerRow.pos),
                targetPos:Number(playerRow.pos), depth:this.currentDepth, itemId:String(data.itemId),
                itemClass:String(data.itemClass), expectedEquipped:data.expectedEquipped };
              actionValid = true;
              actionCost = Number(data.engineActionCost);
            }
          } else if (actionStr === "OPEN_CHEST") {
            const data = payload.data || {};
            const itemPos = Number(data.targetPos ?? targetPos);
            const requestId = String(msg.requestId || "");
            const savedRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", `levelSnapshot:${this.currentDepth}`).toArray()[0];
            let levelSnapshot: any = null;
            try { levelSnapshot = savedRow && typeof savedRow.value === "string" ? JSON.parse(String(savedRow.value)) : null; } catch (_) {}
            const playerRow = this.sql.exec("SELECT pos,state FROM players WHERE player_id = ?", session.playerId).toArray()[0];
            const heroRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + session.playerId).toArray()[0];
            const pending = this.sql.exec("SELECT value FROM room_meta WHERE key = 'transitionPending'").toArray().length > 0;
            const validIntent = !pending && requestId.length > 0 && requestId.length <= 128 && playerRow && heroRow
              && hasCompleteNativeLevelSnapshot(levelSnapshot)
              && hasMatchingNativeHeroStateSnapshot(String(payload.heroStateJson || ""), String(heroRow.value))
              && isValidNativeWorldActionIntent("OPEN_CHEST", data, levelSnapshot, this.currentDepth, Number(playerRow.pos))
              && itemPos === Number(data.targetPos);
            if (validIntent) {
              this.sql.exec("DELETE FROM claimed_chest_instances WHERE created_at < datetime('now', '-2 minutes')");
              this.sql.exec("INSERT OR IGNORE INTO claimed_chest_instances (depth,heap_id,claimed_by,request_id) VALUES (?,?,?,?)",
                this.currentDepth, String(data.heapId), session.playerId, requestId);
              const claim = this.sql.exec(
                "SELECT claimed_by,request_id FROM claimed_chest_instances WHERE depth = ? AND heap_id = ?",
                this.currentDepth, String(data.heapId)).toArray()[0];
              if (!claim || String(claim.claimed_by) !== session.playerId || String(claim.request_id) !== requestId) {
                ws.send(JSON.stringify({ protocolVersion:"1.0.0", messageType:"ERROR", requestId:msg.requestId,
                  sequence:this.currentSequence, payloadJson:JSON.stringify({error:"CHEST_ALREADY_CLAIMED",heapId:data.heapId}) }));
                return;
              }
              const chest = levelSnapshot.heaps.find((heap: any) => Number(heap?.pos) === itemPos);
              eventType = "WORLD_ACTION_RESOLVED";
              actionResultPayload = { playerId:session.playerId, actionType:"OPEN_CHEST",
                from:Number(playerRow.pos), targetPos:itemPos, depth:this.currentDepth,
                heapId:String(data.heapId), heapType:String(chest?.type || "") };
              actionValid = true;
              actionCost = Number(data.engineActionCost);
            }
          }
          if (actionValid && typeof payload.heroStateJson === "string"
              && payload.heroStateJson.length > 0 && payload.heroStateJson.length <= 200000) {
            // Movement/WAIT advances native cooldowns and buffs. Refresh only from a well-formed
            // owner state whose HP/HT/position already match the server's accepted player row;
            // preserve the trusted inventory and combat equipment bundles.
            if (actionStr === "MOVE" || actionStr === "WAIT" || actionStr === "ATTACK") {
              const playerRow = this.sql.exec("SELECT hp,ht,pos FROM players WHERE player_id = ?", session.playerId).toArray()[0];
              const previousRow = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", "heroState:" + session.playerId).toArray()[0];
              let reported: any = null;
              try { reported = JSON.parse(payload.heroStateJson); } catch (_) {}
              const buffs = nativeBuffSnapshotFromHeroState(payload.heroStateJson);
              if (playerRow && reported && buffs != null
                && Number(reported.hp) === Number(playerRow.hp)
                && Number(reported.ht) === Number(playerRow.ht)
                && Number(reported.pos) === Number(playerRow.pos)) {
                if (previousRow && typeof previousRow.value === "string") {
                  const merged = mergeNativeHeroState(String(previousRow.value), payload.heroStateJson, {
                    hp: Number(playerRow.hp), ht: Number(playerRow.ht), pos: Number(playerRow.pos),
                    shielding: Number(reported.shielding)
                  }, buffs, false, false);
                  if (merged != null) this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                    "heroState:" + session.playerId, merged);
                } else if (isValidNativeHeroStateJson(payload.heroStateJson, {
                  hp: Number(playerRow.hp), ht: Number(playerRow.ht), pos: Number(playerRow.pos), shielding: Number(reported.shielding)
                })) {
                  this.sql.exec("INSERT INTO room_meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                    "heroState:" + session.playerId, payload.heroStateJson);
                }
              }
            } else if (actionStr !== "PICKUP") {
              // A pickup is only an intent; its submitted Hero state is not committed before the post-state validates.
              this.sql.exec(`INSERT OR IGNORE INTO room_meta (key,value) VALUES (?,?)`,
                `heroState:${session.playerId}`, payload.heroStateJson);
            }
          }
        } catch (_) {}

        if (actionValid && requiresNativeMutationSnapshot(actionStrForLock)) {
          const requestId = String(msg.requestId || "");
          const lockKey = "nativeMutationPending:" + session.playerId;
          if (!requestId || requestId.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(requestId)) {
            actionValid = false;
            actionErrorCode = "MISSING_NATIVE_MUTATION_REQUEST_ID";
          } else {
            const lockValue = JSON.stringify({
              playerId: session.playerId, requestId, actionType: actionStrForLock,
              depth: this.currentDepth, createdAt: Date.now()
            });
            this.sql.exec("INSERT OR IGNORE INTO room_meta (key,value) VALUES (?,?)", lockKey, lockValue);
            const storedLock = this.sql.exec("SELECT value FROM room_meta WHERE key = ?", lockKey).toArray()[0];
            if (classifyNativeMutationLock(storedLock?.value, session.playerId, requestId, actionStrForLock) !== "OWNED") {
              actionValid = false;
              actionErrorCode = "NATIVE_MUTATION_PENDING";
            }
          }
        }

        if (actionValid) {
          // Increment sequence ONLY after successful validation and commit.
          this.currentSequence++;
          if (eventType === "PLAYER_ATTACKED" || eventType === "PLAYER_DAMAGED") {
            actionResultPayload.combatSchemaVersion = 1;
            actionResultPayload.combatDepth = this.currentDepth;
            actionResultPayload.combatSequence = this.currentSequence;
            actionResultPayload.combatRequestId = String(msg.requestId || "");
            actionResultPayload.matchId = this.state.id.toString();
          }
          this.worldTime += actionCost;
          this.sql.exec(`INSERT INTO room_meta (key, value) VALUES ('worldTime', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, String(this.worldTime));

          const resultJson = JSON.stringify({
            status: "ACCEPTED",
            sequence: this.currentSequence,
            eventType,
            action: actionResultPayload,
            actionCost
          });

          if (msg.requestId) {
            this.sql.exec(
              `INSERT INTO processed_actions (request_id, player_id, sequence, result_json) VALUES (?, ?, ?, ?)`,
              msg.requestId, actionOwnerId, this.currentSequence, resultJson
            );
          }

          this.sql.exec(
            `INSERT INTO events (sequence, sender_id, event_type, payload) VALUES (?, ?, ?, ?)`,
            this.currentSequence, session.playerId, eventType, JSON.stringify(actionResultPayload)
          );

          ws.send(JSON.stringify({
            protocolVersion: "1.0.0",
            messageType: "ACTION_ACCEPTED",
            requestId: msg.requestId,
            sequence: this.currentSequence,
            payloadJson: resultJson
          }));

          this.broadcastWithFOV(session.playerId, eventType, actionResultPayload, ws);
          this.checkMatchEndCondition();
          // Mob turns are resolved exclusively by the original Java SPD Actor scheduler.
          // Running a TypeScript pathfinder here would race the publisher and overwrite native AI.
        } else {
          if (pendingCombatForCleanup && String(pendingCombatForCleanup.authorityId || "") === session.playerId) {
            this.clearPendingCombat(pendingCombatForCleanup);
          }
          const errorMessage = JSON.stringify({
            protocolVersion: "1.0.0",
            messageType: "ERROR",
            requestId: msg.requestId,
            sequence: this.currentSequence,
            payloadJson: JSON.stringify({ error: actionErrorCode })
          });
          ws.send(errorMessage);
          if (pendingCombatForCleanup && actionOwnerId !== session.playerId) {
            for (const peer of this.state.getWebSockets()) {
              const peerSession = peer.deserializeAttachment() as SessionData | null;
              if (peerSession?.playerId === actionOwnerId) this.sendNativeActionPeerMessage(peer, errorMessage);
            }
          }
        }
  }
}
