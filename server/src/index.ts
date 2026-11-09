/**

 * Stable Cloudflare Worker entry and compatibility facade.

 * MatchRoom behavior is implemented in focused room responsibility modules.

 * Keep the original named exports stable for existing tests and consumers.

 */




export type { Env, NetworkMessage, SessionData } from "./protocol/types";
export { assignStableEntityIds, resolveServerMobIdByEntityId } from "./validators/entity-identity";
export { isValidNativeMoveIntent, resolveNativeTransitionIntent, isValidNativeFallLanding, isValidNativeFallDestinationSnapshot, isPendingNativeFloorDestinationSnapshot, canStartNativeFloorTransition, canAbortNativeFloorTransition, canFinalizeNativeFloorTransition, classifyNativeTransitionRejection } from "./validators/floor-transitions";
export { parseNativeQuickslotIndex, nativeEquipmentPayloadMatchesRow, nativeEquipmentRowBundleTransitionMatches, nativeEquipmentQuickslotPositionMatches, isValidNativeEquipmentIntent, isValidNativeEquipmentBelongingsMutation, isValidNativeEquipmentCombatBundleMutation, isValidNativeEquipmentMutation, isValidNativeChestHeapMutation } from "./validators/equipment";
export { isValidNativeBuybackIntent, isValidNativeBuybackInventoryMutation, isValidNativeBuybackShopkeeperMutation, parseNativeItemStatusBundle, isValidNativeItemStatusMutation, mergeNativeItemStatusState, isValidNativeUseItemIntent, isValidNativeUseItemMutation } from "./validators/item-state";
export { isValidNativeAbilityIntent, isValidNativeAbilityMutation } from "./validators/abilities";
export { isValidNativeBuyIntent, isValidNativeBuyInventoryMutation, isValidNativeBuyHeapMutation, isValidNativeSellIntent, isValidNativeSellInventoryMutation, isValidNativeSellShopkeeperMutation } from "./validators/shop";
export { isValidNativeWorldActionIntent, isValidNativeMovementHeapMutation } from "./validators/world-actions";
export type { NativeLootClaimSql, NativeLootClaimTransactionHost, NativeMutationLockStatus } from "./validators/inventory-claims";
export { isValidStableMultiplayerId, isValidNativeFloorItemIdentitySet, nativeLootClaimScopeKey, isNativeLootClaimSchemaCurrent, reserveNativeLootClaim, isNativeLootClaimConflict, requiresNativeMutationSnapshot, isNativeMutationLockForRequest, classifyNativeMutationLock, isValidNativeInventoryBundleIndex, parseNativeItemEconomyIndex, isValidNativeItemEconomyIndexMutation } from "./validators/inventory-claims";
export { isValidNativeMineInventoryMutation, isValidNativeMineHeapMutation } from "./validators/inventory-economy";
export { isValidNativeDropIntent, isValidNativeDropInventoryMutation, isValidNativeDropHeapMutation, isValidNativePickupInventoryMutation, isValidNativePickupIntent, isValidNativePickupHeapMutation, isValidNativeThrowIntent, isValidNativeProjectileCombatIntent, isValidNativeThrowInventoryMutation, isValidNativeThrowHeapMutation, isValidNativeProjectileHeapResult, isValidNativeProjectileCombatResult, isValidNativeAlchemyIntent, isValidNativeAlchemyInventoryMutation, isValidNativeAlchemyHeapMutation } from "./validators/world-items";
export { isValidNativeHeroBuffTick, nativeHeroBuffLifeLinkMobEntityIds, nativeHeroBuffLifeLinkMobActorIds, validateNativeLifeLinkDeathRewardTransition, isValidNativeUnchangedBuffState, isValidNativeMineBuffMutation, isValidNativeInteractInventoryMutation } from "./validators/hero-buffs";
export { isValidNativeMutationActionCost, isValidNativeWorldMutation, hasCompleteNativeLevelSnapshot, isValidNativeMobBuffExpiryTurn } from "./validators/world-state";
export type { NativeSecondaryMobDeltaPayload } from "./validators/combat-state";
export { isValidNativeWorldTurnSnapshot, isValidNativeHpTransition, isValidNativeDamageAccounting, nativeMobKillRewardIds, areNativeMobRewardClaimsAvailable, isValidNativeCombatRequestId, classifyRequestReplay, isValidNativeAttackIntent, hasMatchingNativeAttackIntent, hasStrictNativeCombatFields, hasStrictNativeSourceMobState, isValidNativeEnvironmentDamage, resolveAuthorizedNativeMobDamageTarget, isValidNativeMobNoEffectOutcome, hasStrictNativeDamageFields, isValidNativeHeroStateJson, mergeNativeHeroState, mergeNativeCombatAttackerState, isValidNativeCombatBuffs, isValidNativeMissTransition, hasMatchingNativeMobShieldSnapshot, hasValidBlessedAnkhConsumption, hasValidUnblessedAnkhConsumption, hasMatchingNativeHeroStateSnapshot, nativeBuffSnapshotFromHeroState, hasMatchingNativeHeroBuffSnapshot, hasMatchingNativeBuffSnapshot, hasOnlyNativeLostBackpackAdded, isValidNativeLootSnapshot, hasMatchingNativeHeroEquipmentState, isValidNativeMobBundle, isAuthorizedNativeMobOwner, parseAndValidateNativeSecondaryMobDeltas, parseAndValidateNativeLifeLinkMobDeltas, parseAndValidateNativeLifeLinkMobDamageEvidence, removeDeadNativeMobsFromSnapshot, isValidNativeCombatEvent } from "./validators/combat-state";
export { SeededRNG } from "./util/seeded-rng";

export { MatchRoom } from "./match-room/index";

export { default } from "./worker";
