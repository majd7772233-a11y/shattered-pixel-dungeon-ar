import { isValidNativeHeroStateJson } from "./combat-state";
import { parseNativeQuickslotIndex } from "./equipment";
import { parseNativeInventoryIndex } from "./inventory-claims";
import { itemValueWithout, sameNativeItemValue } from "./inventory-economy";

export const NATIVE_ENDURE_ABILITY = "com.shatteredpixel.shatteredpixeldungeon.actors.hero.abilities.warrior.Endure";
const NATIVE_NATURES_POWER_ABILITY = "com.shatteredpixel.shatteredpixeldungeon.actors.hero.abilities.huntress.NaturesPower";
const NATIVE_CLASS_ARMOR_PREFIX = "com.shatteredpixel.shatteredpixeldungeon.items.armor.";
const NATIVE_ENDURE_TRACKER = NATIVE_ENDURE_ABILITY + "$EndureTracker";
const NATIVE_NATURES_TRACKER = NATIVE_NATURES_POWER_ABILITY + "$naturesPowerTracker";

export function parseNativeBundleObject(value: unknown): any | null {
  if (typeof value !== "string" || value.length < 2 || value.length > 200000) return null;
  try {
    const root = JSON.parse(value);
    return root && typeof root === "object" && !Array.isArray(root) ? root : null;
  } catch (_) { return null; }
}

function nativeHeroicEnergyPoints(hero: any): number | null {
  const combat = parseNativeBundleObject(hero && hero.combatBundle);
  if (!combat || !combat.talents_tier_4 || typeof combat.talents_tier_4 !== "object") return null;
  const points = combat.talents_tier_4.HEROIC_ENERGY === undefined ? 0 : Number(combat.talents_tier_4.HEROIC_ENERGY);
  return Number.isInteger(points) && points >= 0 && points <= 4 ? points : null;
}

function nativeAbilityChargeUse(abilityClass: string, points: number): number {
  const base = abilityClass === NATIVE_ENDURE_ABILITY ? 50
    : abilityClass === NATIVE_NATURES_POWER_ABILITY ? 35 : -1;
  const factor = [1,0.88,0.77,0.68,0.6][points];
  return base > 0 && factor !== undefined ? base * factor : -1;
}

export function nativeItemBundleData(row: any): any | null {
  const root = parseNativeBundleObject(row && row.serializedBundle);
  const item = root && root.item;
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  return {root,item};
}

function nativeClassArmorCharge(row: any): number | null {
  const decoded = nativeItemBundleData(row);
  const simpleClass = String(row && row.className || "").split(".").pop() || "";
  if (!decoded || String(decoded.item.__className || "") !== String(row.className || "")
      || !/^(Warrior|Rogue|Mage|Huntress|Duelist|Cleric)Armor$/.test(simpleClass)) return null;
  const charge = Number(decoded.item.charge);
  return Number.isFinite(charge) && charge >= 0 && charge <= 100 ? charge : null;
}

function nativeSameClassArmorBundleExceptCharge(oldRow: any, nextRow: any): boolean {
  const before = nativeItemBundleData(oldRow), after = nativeItemBundleData(nextRow);
  if (!before || !after || String(before.item.__className || "") !== String(after.item.__className || "")
      || String(before.item.__className || "") !== String(oldRow.className || "")
      || String(after.item.__className || "") !== String(nextRow.className || "")) return false;
  delete before.item.charge;
  delete after.item.charge;
  return sameNativeItemValue(before.root,after.root);
}

function nativeAbilityBuffEntries(hero: any): Array<{className:string,serializedBundle:string,cooldown:number,data:any}> | null {
  if (!hero || !Number.isInteger(hero.buffCount) || hero.buffCount < 0 || hero.buffCount > 256) return null;
  const entries: Array<{className:string,serializedBundle:string,cooldown:number,data:any}> = [];
  for (let i = 0; i < hero.buffCount; i++) {
    const serializedBundle = hero["buff_" + i], cooldown = Number(hero["buffCooldown_" + i]);
    const root = parseNativeBundleObject(serializedBundle), data = root && root.buff;
    const className = data && typeof data === "object" ? String(data.__className || "") : "";
    if (typeof serializedBundle !== "string" || !className || !Number.isFinite(cooldown)
        || cooldown < 0 || cooldown > 100000) return null;
    entries.push({className,serializedBundle,cooldown,data});
  }
  return entries;
}

function isValidNativeAbilityBuffDelta(previous: any, next: any, abilityClass: string): boolean {
  const before = nativeAbilityBuffEntries(previous), after = nativeAbilityBuffEntries(next);
  if (!before || !after) return false;
  const permitted = abilityClass === NATIVE_ENDURE_ABILITY ? NATIVE_ENDURE_TRACKER
    : abilityClass === NATIVE_NATURES_POWER_ABILITY ? NATIVE_NATURES_TRACKER : "";
  if (!permitted) return false;
  const stable = (rows: typeof before) => rows.filter(row => row.className !== permitted)
    .map(row => ({className:row.className,serializedBundle:row.serializedBundle,cooldown:row.cooldown}))
    .sort((a,b) => (a.className + a.serializedBundle + a.cooldown).localeCompare(b.className + b.serializedBundle + b.cooldown));
  if (!sameNativeItemValue(stable(before),stable(after))) return false;
  if (before.filter(row => row.className === permitted).length > 1) return false;
  const afterAbilityBuffs = after.filter(row => row.className === permitted);
  if (afterAbilityBuffs.length !== 1) return false;
  const tracker = afterAbilityBuffs[0];
  if (abilityClass === NATIVE_ENDURE_ABILITY) {
    return tracker.cooldown <= 12.1 && tracker.data.enduring === true
      && Number(tracker.data.damage_bonus) === 0 && Number(tracker.data.hits_left) === 0;
  }
  return tracker.cooldown <= 8.1
    && (tracker.data.extensionsLeft === undefined || Number(tracker.data.extensionsLeft) === 2);
}

function sameNativeAbilityCombatBundleExceptArmorCharge(previousValue: unknown, nextValue: unknown,
  armorClassValue: unknown, chargeBeforeValue: unknown, chargeAfterValue: unknown): boolean {
  const before = parseNativeBundleObject(previousValue), after = parseNativeBundleObject(nextValue);
  const armorClass = String(armorClassValue || ""), chargeBefore = Number(chargeBeforeValue), chargeAfter = Number(chargeAfterValue);
  if (!before || !after || !before.armor || !after.armor
      || String(before.armor.__className || "") !== armorClass || String(after.armor.__className || "") !== armorClass
      || Math.abs(Number(before.armor.charge) - chargeBefore) > 0.05
      || Math.abs(Number(after.armor.charge) - chargeAfter) > 0.05) return false;
  delete before.armor.charge;
  delete after.armor.charge;
  return sameNativeItemValue(before,after);
}

/** Admits only two non-targeted self-buff armor abilities with exact native source and charge cost. */
export function isValidNativeAbilityIntent(level: any, dataValue: unknown, depthValue: unknown,
  playerIdValue: unknown, player: any, trustedHeroStateValue: unknown): boolean {
  const data: any = dataValue, depth = Number(depthValue), playerId = String(playerIdValue || "");
  if (!level || !data || typeof data !== "object" || !Array.isArray(level.heaps)
      || !Number.isInteger(depth) || level.depth !== depth || level.branch !== 0 || level.locked !== false
      || !player || !playerId || String(player.state) !== "ALIVE" || !Number.isInteger(player.pos)
      || typeof trustedHeroStateValue !== "string") return false;
  const abilityClass = String(data.abilityClass || ""), pos = Number(player.pos);
  if (![NATIVE_ENDURE_ABILITY,NATIVE_NATURES_POWER_ABILITY].includes(abilityClass)
      || data.from !== pos || data.to !== pos || data.targetPos !== pos
      || Number(data.depth) !== depth || data.branch !== 0
      || !Number.isFinite(data.engineActionCost) || data.engineActionCost < 0.5 || data.engineActionCost > 4
      || typeof data.armorItemId !== "string" || data.armorItemId.length < 8 || data.armorItemId.length > 80
      || typeof data.armorClass !== "string" || !data.armorClass.startsWith(NATIVE_CLASS_ARMOR_PREFIX)
      || !Number.isFinite(data.armorChargeBefore) || !Number.isFinite(data.armorChargeAfter)
      || !Number.isFinite(data.armorChargeUse) || data.armorChargeBefore < 0 || data.armorChargeBefore > 100
      || data.armorChargeAfter < 0 || data.armorChargeAfter > 100 || data.armorChargeUse <= 0 || data.armorChargeUse > 100
      || Math.abs((data.armorChargeBefore - data.armorChargeAfter) - data.armorChargeUse) > 0.05) return false;
  const expectedArmor = abilityClass === NATIVE_ENDURE_ABILITY ? "WarriorArmor" : "HuntressArmor";
  const expectedClass = NATIVE_CLASS_ARMOR_PREFIX + expectedArmor;
  const expectedCost = abilityClass === NATIVE_ENDURE_ABILITY ? 3 : 1;
  if (data.armorClass !== expectedClass || Math.abs(Number(data.engineActionCost) - expectedCost) > 0.05) return false;

  let hero: any;
  try { hero = JSON.parse(trustedHeroStateValue); } catch (_) { return false; }
  if (Number(hero.pos) !== pos || !Number.isInteger(hero.hp) || hero.hp <= 0
      || !isValidNativeHeroStateJson(trustedHeroStateValue,{hp:Number(hero.hp),ht:Number(hero.ht),pos,shielding:Number(hero.shielding)})) return false;
  const combat = parseNativeBundleObject(hero.combatBundle);
  if (!combat || String(combat.armorAbility && combat.armorAbility.__className || "") !== abilityClass
      || (abilityClass === NATIVE_ENDURE_ABILITY && String(combat.class || "") !== "WARRIOR")
      || (abilityClass === NATIVE_NATURES_POWER_ABILITY && String(combat.class || "") !== "HUNTRESS")) return false;
  const points = nativeHeroicEnergyPoints(hero);
  if (points == null || Math.abs(nativeAbilityChargeUse(abilityClass,points) - Number(data.armorChargeUse)) > 0.05) return false;
  const buffs = nativeAbilityBuffEntries(hero);
  if (!buffs || buffs.some(row => row.className.endsWith(".Invisibility")
      || (abilityClass === NATIVE_ENDURE_ABILITY
        && row.className === "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Combo"))) return false;
  const inventory = parseNativeInventoryIndex(hero);
  if (!inventory || !parseNativeQuickslotIndex(hero)) return false;
  const source = inventory.filter((item: any) => String(item.itemId) === data.armorItemId);
  if (source.length !== 1 || String(source[0].className) !== data.armorClass
      || source[0].equipped !== true || source[0].quantity !== 1 || source[0].stackable !== false) return false;
  const bundleCharge = nativeClassArmorCharge(source[0]);
  return bundleCharge != null && Math.abs(bundleCharge - Number(data.armorChargeBefore)) <= 0.05
    && data.armorChargeBefore >= data.armorChargeUse;
}

/** Commits only one class-armor charge decrement and its explicitly permitted native tracker buff. */
export function isValidNativeAbilityMutation(previousValue: unknown, nextValue: unknown,
  detailsValue: unknown, acceptedValue: unknown): boolean {
  let previous: any, next: any;
  try { previous = JSON.parse(String(previousValue || "")); next = JSON.parse(String(nextValue || "")); } catch (_) { return false; }
  const details: any = detailsValue, accepted: any = acceptedValue;
  const abilityClass = String(details && details.abilityClass || "");
  const expectedCost = abilityClass === NATIVE_ENDURE_ABILITY ? 3 : 1;
  if (!details || !accepted || accepted.actionType !== "USE_ABILITY"
      || ![NATIVE_ENDURE_ABILITY,NATIVE_NATURES_POWER_ABILITY].includes(abilityClass)
      || accepted.abilityClass !== details.abilityClass || accepted.armorItemId !== details.armorItemId
      || accepted.armorClass !== details.armorClass || accepted.armorChargeBefore !== details.armorChargeBefore
      || accepted.armorChargeAfter !== details.armorChargeAfter || accepted.armorChargeUse !== details.armorChargeUse
      || !Number.isFinite(accepted.engineActionCost) || Math.abs(Number(accepted.engineActionCost)-expectedCost)>0.05
      || !Number.isFinite(previous.cooldown) || !Number.isFinite(next.cooldown)
      || Math.abs((Number(next.cooldown)-Number(previous.cooldown))-Number(accepted.engineActionCost))>0.05
      || previous.hp !== next.hp || previous.ht !== next.ht || previous.pos !== next.pos
      || previous.shielding !== next.shielding || previous.gold !== next.gold
      || previous.alchemyEnergy !== next.alchemyEnergy || previous.inventoryBundle === next.inventoryBundle
      || !sameNativeItemValue(previous.quickslotsJson,next.quickslotsJson)
      || !sameNativeAbilityCombatBundleExceptArmorCharge(previous.combatBundle,next.combatBundle,
        details.armorClass,details.armorChargeBefore,details.armorChargeAfter)
      || !isValidNativeAbilityBuffDelta(previous,next,abilityClass)) return false;
  const before = parseNativeInventoryIndex(previous), after = parseNativeInventoryIndex(next);
  if (!before || !after || before.length !== after.length) return false;
  const beforeById = new Map<string,any>(), afterById = new Map<string,any>();
  for (const row of before) { const id=String(row.itemId); if (beforeById.has(id)) return false; beforeById.set(id,row); }
  for (const row of after) { const id=String(row.itemId); if (afterById.has(id)) return false; afterById.set(id,row); }
  if (beforeById.size !== afterById.size) return false;
  let changedArmorRows=0;
  for (const [id,oldRow] of beforeById) {
    const nextRow=afterById.get(id);
    if (!nextRow || !sameNativeItemValue(itemValueWithout(oldRow,["serializedBundle"]),
        itemValueWithout(nextRow,["serializedBundle"]))) return false;
    if (id === String(details.armorItemId)) {
      changedArmorRows++;
      if (String(oldRow.className)!==String(details.armorClass) || oldRow.equipped!==true || nextRow.equipped!==true
          || !nativeSameClassArmorBundleExceptCharge(oldRow,nextRow)) return false;
      const oldCharge=nativeClassArmorCharge(oldRow), newCharge=nativeClassArmorCharge(nextRow);
      if (oldCharge==null || newCharge==null || Math.abs(oldCharge-Number(details.armorChargeBefore))>0.05
          || Math.abs(newCharge-Number(details.armorChargeAfter))>0.05
          || Math.abs((oldCharge-newCharge)-Number(details.armorChargeUse))>0.05) return false;
    } else if (!sameNativeItemValue(oldRow,nextRow)) return false;
  }
  return changedArmorRows===1;
}

/** Parses the original native Item wrapper used by SPDLevelSnapshot.currentItemBundle(). */
