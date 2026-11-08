import { parseNativeBundleObject } from "./abilities";
import { parseNativeQuickslotIndex } from "./equipment";
import { nativeVialOfBloodLevel } from "./hero-buffs";
import { isValidStableMultiplayerId, parseNativeInventoryIndex, parseNativeItemEconomyIndex } from "./inventory-claims";
import { itemValueWithout, sameNativeItemValue } from "./inventory-economy";
import { isValidNativeSellBuybackRow } from "./shop";

export function nativeUseItemBuffMap(hero: any): Map<string, any[]> | null {
  if (!hero || !Number.isInteger(hero.buffCount) || hero.buffCount < 0 || hero.buffCount > 256) return null;
  const result = new Map<string, any[]>();
  for (let i = 0; i < hero.buffCount; i++) {
    const serializedBundle = hero["buff_" + i], cooldown = Number(hero["buffCooldown_" + i]);
    if (typeof serializedBundle !== "string" || serializedBundle.length < 2 || serializedBundle.length > 200000
        || !Number.isFinite(cooldown) || cooldown < 0 || cooldown > 100000) return null;
    let root: any;
    try { root = JSON.parse(serializedBundle); } catch (_) { return null; }
    const buff = root && root.buff;
    const className = String(buff && buff.__className || "");
    if (!className || className.length > 256 || !buff || typeof buff !== "object") return null;
    const rows = result.get(className) || [];
    rows.push({serializedBundle, cooldown, data:buff});
    result.set(className, rows);
  }
  for (const rows of result.values()) rows.sort((a: any, b: any) =>
    String(a.serializedBundle).localeCompare(String(b.serializedBundle)) || a.cooldown - b.cooldown);
  return result;
}

export function nativeUseItemCombatBundleMatches(previousHero: any, nextHero: any, itemClass: string): boolean {
  let previous: any, next: any;
  try {
    previous = JSON.parse(String(previousHero?.combatBundle || ""));
    next = JSON.parse(String(nextHero?.combatBundle || ""));
  } catch (_) { return false; }
  if (!previous || typeof previous !== "object" || !next || typeof next !== "object") return false;
  // Actor.storeInBundle includes Hero.time. A native consumable advances this clock inside
  // the original engine, so permit that field only when it advances by the same amount as
  // the separately reported Hero cooldown. This avoids rejecting real drinks/eating while
  // preventing an item transaction from smuggling an unrelated combat-clock mutation.
  const previousHasTime = Object.prototype.hasOwnProperty.call(previous, "time");
  const nextHasTime = Object.prototype.hasOwnProperty.call(next, "time");
  if (previousHasTime !== nextHasTime) return false;
  if (previousHasTime) {
    const beforeTime = Number(previous.time), afterTime = Number(next.time);
    const beforeCooldown = Number(previousHero?.cooldown), afterCooldown = Number(nextHero?.cooldown);
    if (!Number.isFinite(beforeTime) || !Number.isFinite(afterTime)
        || !Number.isFinite(beforeCooldown) || !Number.isFinite(afterCooldown)
        || afterTime < beforeTime - 0.06 || afterCooldown < beforeCooldown - 0.06
        || Math.abs((afterTime - beforeTime) - (afterCooldown - beforeCooldown)) > 0.06) return false;
  }
  const strip = (value: any, keys: string[]) => {
    const copy: any = {...value};
    for (const key of keys) delete copy[key];
    return copy;
  };
  // Hero.storeInBundle writes the backpack and native Buff collection into its root bundle.
  // Both are independently validated below from exact item rows and flattened buff snapshots.
  const inventoryKeys = ["inventory", "items", "buffs", "time"];
  const strengthPotion = itemClass === "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfStrength";
  if (strengthPotion) {
    if (!Number.isInteger(previous.STR) || !Number.isInteger(next.STR) || next.STR !== previous.STR + 1) return false;
    return sameNativeItemValue(strip(previous, [...inventoryKeys, "STR"]), strip(next, [...inventoryKeys, "STR"]));
  }
  return sameNativeItemValue(strip(previous, inventoryKeys), strip(next, inventoryKeys));
}

/** Allows only the exact native buff classes that the whitelisted consumable can touch. */
function isValidNativeUseItemBuffMutation(previous: any, next: any, action: string, itemClass: string): boolean {
  const before = nativeUseItemBuffMap(previous), after = nativeUseItemBuffMap(next);
  if (!before || !after) return false;
  const base = "com.shatteredpixel.shatteredpixeldungeon.actors.buffs.";
  let allowed: Set<string>;
  const simpleFoodClasses = new Set([
    "com.shatteredpixel.shatteredpixeldungeon.items.food.Food",
    "com.shatteredpixel.shatteredpixeldungeon.items.food.SmallRation",
    "com.shatteredpixel.shatteredpixeldungeon.items.food.StewedMeat",
    "com.shatteredpixel.shatteredpixeldungeon.items.food.ChargrilledMeat"
  ]);
  const meatPieClass = "com.shatteredpixel.shatteredpixeldungeon.items.food.MeatPie";
  if (action === "EAT" && simpleFoodClasses.has(itemClass)) {
    allowed = new Set([base + "Hunger"]);
  } else if (action === "EAT" && itemClass === meatPieClass) {
    allowed = new Set([base + "Hunger", base + "WellFed"]);
  } else if (action === "DRINK"
      && itemClass === "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHealing") {
    allowed = new Set([base + "Healing", base + "Poison", base + "Cripple", base + "Weakness",
      base + "Vulnerable", base + "Bleeding", base + "Blindness", base + "Drowsy", base + "Slow", base + "Vertigo"]);
  } else if (action === "DRINK"
      && itemClass === "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHaste") {
    allowed = new Set([base + "Haste"]);
  } else if (action === "DRINK"
      && itemClass === "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfInvisibility") {
    allowed = new Set([base + "Invisibility"]);
  } else if (action === "DRINK"
      && itemClass === "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfLevitation") {
    allowed = new Set([base + "Levitation"]);
  } else if (action === "DRINK"
      && itemClass === "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfStrength") {
    allowed = new Set();
  } else if (action === "DRINK"
      && itemClass === "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfPurity") {
    allowed = new Set([base + "BlobImmunity"]);
  } else if (action === "DRINK"
      && itemClass === "com.shatteredpixel.shatteredpixeldungeon.items.potions.exotic.PotionOfStamina") {
    allowed = new Set([base + "Stamina"]);
  } else if (action === "DRINK"
      && itemClass === "com.shatteredpixel.shatteredpixeldungeon.items.potions.exotic.PotionOfShielding") {
    allowed = new Set([base + "Barrier"]);
  } else if (action === "READ"
      && itemClass === "com.shatteredpixel.shatteredpixeldungeon.items.scrolls.ScrollOfRecharging") {
    allowed = new Set([base + "Recharging"]);
  } else return false;

  const allClasses = new Set<string>([...before.keys(), ...after.keys()]);
  for (const name of allClasses) {
    const oldRows = before.get(name) || [], newRows = after.get(name) || [];
    if (allowed.has(name)) continue;
    if (!sameNativeItemValue(oldRows.map((row: any) => ({serializedBundle:row.serializedBundle,cooldown:row.cooldown})),
      newRows.map((row: any) => ({serializedBundle:row.serializedBundle,cooldown:row.cooldown})))) return false;
  }

  const rechargingScrollRead = action === "READ"
    && itemClass === "com.shatteredpixel.shatteredpixeldungeon.items.scrolls.ScrollOfRecharging";
  const timedPotionBuff: Record<string, string> = {
    "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHaste": base + "Haste",
    "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfInvisibility": base + "Invisibility",
    "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfLevitation": base + "Levitation",
    "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfPurity": base + "BlobImmunity",
    "com.shatteredpixel.shatteredpixeldungeon.items.potions.exotic.PotionOfStamina": base + "Stamina"
  };
  const timedBuffName = timedPotionBuff[itemClass] || (rechargingScrollRead ? base + "Recharging" : "");
  if ((action === "DRINK" && !!timedPotionBuff[itemClass]) || rechargingScrollRead) {
    const oldRows = before.get(timedBuffName) || [], newRows = after.get(timedBuffName) || [];
    if (oldRows.length > 1 || newRows.length !== 1) return false;
    const nextRow = newRows[0], nextData = nextRow.data;
    const allowedFields = new Set(["__className", "time", "id", "mnemonic_extended"]);
    if (Object.keys(nextData).some((key: string) => !allowedFields.has(key))
        || !Number.isFinite(Number(nextData.time)) || !Number.isInteger(nextData.id) || Number(nextData.id) < 0
        || (nextData.mnemonic_extended !== undefined && typeof nextData.mnemonic_extended !== "boolean")) return false;
    const nextCooldown = Number(nextRow.cooldown), oldCooldown = Number(oldRows[0]?.cooldown || 0);
    const nativeHeroBundle = parseNativeBundleObject(next.combatBundle);
    const heroTime = Number(nativeHeroBundle?.time), heroCooldown = Number(next.cooldown);
    const actorClock = heroTime - heroCooldown;
    const expectedCooldown = Math.max(0, Number(nextData.time) - actorClock);
    const nativePotionDuration: Record<string, number> = {
      "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHaste": 20,
      "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfInvisibility": 20,
      "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfLevitation": 20,
      "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfPurity": 20,
      "com.shatteredpixel.shatteredpixeldungeon.items.potions.exotic.PotionOfStamina": 100
    };
    const maximumCooldown = rechargingScrollRead ? oldCooldown + 30
      : Math.max(oldCooldown, nativePotionDuration[itemClass] || 20);
    if (!Number.isFinite(nextCooldown) || nextCooldown < 0
        || nextCooldown > maximumCooldown + 0.05
        || !Number.isFinite(heroTime) || !Number.isFinite(heroCooldown) || heroCooldown < 0
        || !Number.isFinite(expectedCooldown) || Math.abs(nextCooldown - expectedCooldown) > 0.06) return false;
    if (rechargingScrollRead && Math.abs(nextCooldown - (oldRows.length === 1 ? oldCooldown + 30 : 30)) > 0.06) return false;
    if (oldRows.length === 1) {
      const oldData = oldRows[0].data;
      if (Number(nextData.id) !== Number(oldData.id)) return false;
      const stripTime = (value: any) => {
        const result: any = {...value};
        delete result.time;
        return result;
      };
      if (!sameNativeItemValue(stripTime(oldData), stripTime(nextData))) return false;
      if (rechargingScrollRead && Math.abs(Number(nextData.time) - Number(oldData.time) - 30) > 0.06) return false;
    } else if (rechargingScrollRead && Math.abs(Number(nextData.time) - actorClock - 30) > 0.06) return false;
  }

  if (action === "EAT") {
    const name = base + "Hunger", oldRows = before.get(name) || [], newRows = after.get(name) || [];
    if (newRows.length > 1 || (oldRows.length === 0 && newRows.length !== 1)) return false;
    if (oldRows.length === 1 && newRows.length === 1) {
      const oldData = oldRows[0].data, newData = newRows[0].data;
      const maxFoodEnergy = itemClass === "com.shatteredpixel.shatteredpixeldungeon.items.food.Food" ? 300
        : itemClass === "com.shatteredpixel.shatteredpixeldungeon.items.food.MeatPie" ? 900 : 150;
      if (!Number.isFinite(Number(oldData.level)) || Number(oldData.level) < 0 || Number(oldData.level) > 450
          || !Number.isFinite(Number(newData.level)) || Number(newData.level) < 0
          || Number(newData.level) > Number(oldData.level)
          || Number(oldData.level) - Number(newData.level) > maxFoodEnergy + 0.01
          || !Number.isFinite(Number(oldData.partialDamage)) || !Number.isFinite(Number(newData.partialDamage))
          || Number(newData.partialDamage) > Number(oldData.partialDamage)
          || Number(newData.partialDamage) !== Number(oldData.partialDamage)) return false;
    } else if (newRows.length === 1) {
      const data = newRows[0].data;
      if (!Number.isFinite(Number(data.level)) || Number(data.level) < 0 || Number(data.level) > 100
          || !Number.isFinite(Number(data.partialDamage)) || Number(data.partialDamage) < 0 || Number(data.partialDamage) > 1) return false;
    }
  }

  if (action === "EAT" && itemClass === "com.shatteredpixel.shatteredpixeldungeon.items.food.MeatPie") {
    const name = base + "WellFed", oldRows = before.get(name) || [], newRows = after.get(name) || [];
    if (oldRows.length > 1 || newRows.length !== 1) return false;
    const oldRow = oldRows[0] || null, newRow = newRows[0], data = newRow.data;
    const allowedFields = new Set(["__className", "time", "id", "left", "mnemonic_extended"]);
    if (Object.keys(data).some((key: string) => !allowedFields.has(key))
        || !Number.isInteger(data.id) || data.id < 0 || !Number.isFinite(Number(data.time))
        || Number(data.time) < 0 || Number(data.time) > 20
        || !Number.isInteger(data.left) || ![150, 450].includes(Number(data.left))
        || (data.mnemonic_extended !== undefined && typeof data.mnemonic_extended !== "boolean")) return false;
    const oldCooldown = Number(oldRow?.cooldown || 0), nextCooldown = Number(newRow.cooldown);
    if (!Number.isFinite(nextCooldown) || nextCooldown < 0 || nextCooldown > Math.max(oldCooldown, 20) + 0.05) return false;
    if (oldRow) {
      if (Number(data.id) !== Number(oldRow.data.id)) return false;
      const withoutLeft = (value: any) => { const copy = {...value}; delete copy.left; return copy; };
      if (!sameNativeItemValue(withoutLeft(oldRow.data), withoutLeft(data))) return false;
    }
  }

  if (itemClass === "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHealing" && action === "DRINK") {
    const removed = [base + "Cripple", base + "Weakness", base + "Vulnerable", base + "Bleeding",
      base + "Blindness", base + "Drowsy", base + "Slow", base + "Vertigo"];
    for (const name of removed) if ((after.get(name) || []).length !== 0) return false;
    const healing = after.get(base + "Healing") || [];
    const oldHealing = before.get(base + "Healing") || [];
    const poison = after.get(base + "Poison") || [];
    if (healing.length !== 1 || oldHealing.length > 1 || poison.length !== 0) return false;
    {
      const current = healing[0].data, old = oldHealing[0]?.data;
      const vialLevel = nativeVialOfBloodLevel(previous);
      const hpTotal = Number(previous.ht);
      const oldLeft = Number(old?.left ?? 0), oldPercent = Number(old?.percent ?? 0), oldFlat = Number(old?.flat ?? 0);
      if (vialLevel === null || !Number.isInteger(hpTotal) || hpTotal < 1 || hpTotal > 100000
          || !Number.isFinite(oldLeft) || oldLeft < 0 || oldLeft > 100000
          || !Number.isFinite(oldPercent) || oldPercent < 0 || oldPercent > 1
          || !Number.isFinite(oldFlat) || oldFlat < 0 || oldFlat > 100000) return false;
      const baseAmount = Math.trunc(Math.fround(Math.fround(0.8 * hpTotal) + 14));
      const unscaledAmount = Math.max(oldLeft,baseAmount);
      const expectedLeft = vialLevel === -1 ? unscaledAmount
        : Math.round(unscaledAmount * (1 + 0.125 * (vialLevel + 1)));
      const expectedPercent = Math.max(oldPercent,0.25), expectedFlat = Math.max(oldFlat,0);
      if (Number(current.left) !== expectedLeft
          || Number(current.percent) !== expectedPercent || Number(current.flat) !== expectedFlat
          || current.healing_limited !== (vialLevel !== -1)) return false;
    }
  }

  if (itemClass === "com.shatteredpixel.shatteredpixeldungeon.items.potions.exotic.PotionOfShielding"
      && action === "DRINK") {
    const name = base + "Barrier", barriers = after.get(name) || [], oldBarriers = before.get(name) || [];
    if (barriers.length !== 1 || oldBarriers.length > 1) return false;

    const oldRow = oldBarriers[0] || null, nextRow = barriers[0];
    const oldData = oldRow?.data || null, nextData = nextRow.data;
    const oldShielding = oldData ? Number(oldData.shielding) : 0;
    const nextShielding = Number(nextData.shielding);
    const hitPoints = Number(previous.ht);
    if (!Number.isInteger(hitPoints) || hitPoints < 1 || hitPoints > 100000
        || !Number.isInteger(oldShielding) || oldShielding < 0 || oldShielding > 100000) return false;

    // Mirror PotionOfShielding.apply() -> Barrier.setShield(), including Java float arithmetic.
    const expected = Math.trunc(Math.fround(Math.fround(Math.fround(0.6) * hitPoints) + 10));
    const expectedShielding = Math.max(oldShielding, expected);
    if (!Number.isInteger(nextShielding) || nextShielding !== expectedShielding
        || Number(next.shielding) !== Number(previous.shielding) + expectedShielding - oldShielding) return false;

    const oldPartial = oldData ? Number(oldData.partial_lost_shield ?? 0) : 0;
    const nextPartial = Number(nextData.partial_lost_shield ?? 0);
    const expectedPartial = oldShielding <= expected ? 0 : oldPartial;
    if (!Number.isFinite(oldPartial) || oldPartial < 0 || oldPartial >= 1
        || !Number.isFinite(nextPartial) || nextPartial !== expectedPartial) return false;

    if (oldData) {
      const stable = (value:any) => {
        const copy = {...value};
        delete copy.shielding;
        delete copy.partial_lost_shield;
        return copy;
      };
      if (Number(nextData.id) !== Number(oldData.id)
          || Number(nextData.time) !== Number(oldData.time)
          || Number(nextRow.cooldown) !== Number(oldRow.cooldown)
          || !sameNativeItemValue(stable(oldData),stable(nextData))) return false;
    } else {
      const fields = Object.keys(nextData).sort();
      if (fields.join(",") !== "__className,id,partial_lost_shield,shielding,time"
          || String(nextData.__className) !== name
          || !Number.isInteger(nextData.id) || Number(nextData.id) < 1
          || !Number.isFinite(Number(nextData.time))
          || !Number.isFinite(Number(nextRow.cooldown)) || Number(nextRow.cooldown) < 0) return false;
      let combat:any;
      try { combat = JSON.parse(String(next.combatBundle || "")); } catch (_) { return false; }
      const actorClock = Number(combat?.time) - Number(next.cooldown);
      if (!Number.isFinite(actorClock)
          || Math.abs(Number(nextData.time)-actorClock)>0.06
          || Math.abs(Number(nextRow.cooldown))>0.06) return false;
    }
  }

  return true;
}

/** The native food callback has bounded Hunger/WellFed-only effects only without these talents. */
function isNativeFoodUseSafe(hero: any): boolean {
  const combat = parseNativeBundleObject(hero && hero.combatBundle);
  if (!combat) return false;
  const sideEffectTalents = new Set([
    "HEARTY_MEAL", "IRON_STOMACH", "EMPOWERING_MEAL", "ENERGIZING_MEAL", "MYSTICAL_MEAL",
    "INVIGORATING_MEAL", "STRENGTHENING_MEAL", "FOCUSED_MEAL", "SATIATED_SPELLS", "ENLIGHTENING_MEAL"
  ]);
  for (let tierNumber = 1; tierNumber <= 4; tierNumber++) {
    const tier = combat["talents_tier_" + tierNumber];
    if (!tier || typeof tier !== "object" || Array.isArray(tier)) return false;
    for (const talent of sideEffectTalents) if (Number(tier[talent] || 0) > 0) return false;
  }
  const replacements = combat.replacements;
  if (!replacements || typeof replacements !== "object" || Array.isArray(replacements)) return false;
  for (const [from, to] of Object.entries(replacements)) {
    if (sideEffectTalents.has(String(from)) || sideEffectTalents.has(String(to))) return false;
  }
  return true;
}

/** The first supported native READ is ScrollOfRecharging, and only when it has no unmodelled side effects. */
function isNativeRechargingScrollReadSafe(hero: any): boolean {
  const combat = parseNativeBundleObject(hero && hero.combatBundle);
  if (!combat) return false;
  const prohibitedTalents = new Set(["INSCRIBED_POWER", "INSCRIBED_STEALTH", "RECALL_INSCRIPTION"]);
  for (let tierNumber = 1; tierNumber <= 4; tierNumber++) {
    const tier = combat["talents_tier_" + tierNumber];
    if (!tier || typeof tier !== "object" || Array.isArray(tier)) return false;
    for (const talent of prohibitedTalents) if (Number(tier[talent] || 0) > 0) return false;
  }
  const replacements = combat.replacements;
  if (!replacements || typeof replacements !== "object" || Array.isArray(replacements)) return false;
  for (const [from, to] of Object.entries(replacements)) {
    if (prohibitedTalents.has(String(from)) || prohibitedTalents.has(String(to))) return false;
  }
  const buffs = nativeUseItemBuffMap(hero);
  if (!buffs) return false;
  const dispelledBuffSuffixes = [
    ".Invisibility", "CloakOfShadows$cloakStealth", "TimekeepersHourglass$timeFreeze",
    "Invisibility$Preparation", "Swiftthistle$TimeBubble", "RoundShield$GuardTracker"
  ];
  for (const className of buffs.keys()) {
    if (dispelledBuffSuffixes.some(suffix => className.endsWith(suffix))) return false;
  }
  return true;
}

/** The whitelisted native drink callback has no unmodelled talent proc only without these talents. */
function isNativePotionUseSafe(hero: any, itemClass: string): boolean {
  const combat = parseNativeBundleObject(hero && hero.combatBundle);
  if (!combat) return false;
  const sideEffectTalents = new Set(["LIQUID_WILLPOWER", "LIQUID_NATURE", "LIQUID_AGILITY"]);
  if (itemClass === "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfInvisibility") {
    // Invisibility.attachTo() may add this extra native tracker independently of onPotionUsed().
    sideEffectTalents.add("PROTECTIVE_SHADOWS");
  }
  for (let tierNumber = 1; tierNumber <= 4; tierNumber++) {
    const tier = combat["talents_tier_" + tierNumber];
    if (!tier || typeof tier !== "object" || Array.isArray(tier)) return false;
    for (const talent of sideEffectTalents) {
      const value = tier[talent] === undefined ? 0 : Number(tier[talent]);
      if (!Number.isFinite(value) || value < 0 || value > 2) return false;
      if (value > 0) return false;
    }
  }
  const replacements = combat.replacements;
  if (!replacements || typeof replacements !== "object" || Array.isArray(replacements)) return false;
  for (const [from, to] of Object.entries(replacements)) {
    if (sideEffectTalents.has(String(from)) || sideEffectTalents.has(String(to))) return false;
  }
  return true;
}

/** Validates purchase of one exact native item from an adjacent Shopkeeper buyback list. */
export function isValidNativeBuybackIntent(level: any, dataValue: unknown, depthValue: unknown,
  playerIdValue: unknown, player: any, heroStateValue: unknown): boolean {
  const data:any = dataValue, depth = Number(depthValue), playerId = String(playerIdValue || "");
  if (!level || !data || typeof data !== "object" || !Array.isArray(level.heaps) || !Array.isArray(level.mobs)
      || !Number.isInteger(depth) || level.depth !== depth || level.branch !== 0 || level.locked !== false
      || !player || !playerId || String(player.state) !== "ALIVE" || !Number.isInteger(player.pos)
      || typeof heroStateValue !== "string") return false;
  const pos = Number(player.pos), shopId = String(data.shopEntityId || "");
  const itemId = String(data.buybackItemId || ""), cls = String(data.buybackItemClass || "");
  const resultId = String(data.resultItemId || ""), bundle = String(data.resultItemBundle || "");
  const price = Number(data.price), quantity = Number(data.buybackQuantity);
  if (data.from !== pos || data.to !== pos || data.targetPos !== pos || Number(data.depth) !== depth
      || data.branch !== 0 || !isValidStableMultiplayerId(shopId) || !isValidStableMultiplayerId(itemId)
      || resultId !== itemId || cls.length < 1 || cls.length > 256 || data.itemClass !== cls
      || !Number.isInteger(quantity) || quantity < 1 || quantity > 100000
      || !Number.isInteger(price) || price < 1 || price > 10000000
      || !Number.isFinite(data.engineActionCost) || Math.abs(data.engineActionCost - 1) > 0.06
      || !Number.isInteger(data.itemLevel) || data.itemLevel < -100 || data.itemLevel > 10000
      || typeof data.cursed !== "boolean" || typeof data.cursedKnown !== "boolean"
      || typeof data.stackable !== "boolean" || !Number.isInteger(data.nativeValue) || data.nativeValue !== price
      || !Number.isInteger(data.nativeUnitValue) || data.nativeUnitValue < -1 || data.nativeUnitValue > 10000000
      || (data.nativeUnitValue >= 0 && data.nativeUnitValue * quantity !== price)
      || typeof bundle !== "string" || bundle.length < 1 || bundle.length > 200000 || !bundle.includes(itemId)) return false;
  const shops = level.mobs.filter((mob:any) => String(mob?.entityId || "") === shopId);
  const width = Number(level.width);
  if (!Number.isInteger(width) || width < 1 || shops.length !== 1
      || String(shops[0].name || "") !== "Shopkeeper" || !Array.isArray(shops[0].buybackItems)
      || shops[0].buybackItems.length < 1 || shops[0].buybackItems.length > 3
      || !Number.isInteger(shops[0].shopkeeperTurnsSinceHarmed)
      || shops[0].shopkeeperTurnsSinceHarmed < -1 || shops[0].shopkeeperTurnsSinceHarmed > 100000
      || Math.max(Math.abs((Number(shops[0].pos)%width)-(pos%width)),
        Math.abs(Math.floor(Number(shops[0].pos)/width)-Math.floor(pos/width))) > 1
      || shops[0].buybackItems.some((row:any) => !isValidNativeSellBuybackRow(row))) return false;
  const matches = shops[0].buybackItems.filter((row:any) => String(row.itemId) === itemId);
  if (matches.length !== 1) return false;
  const row = matches[0];
  if (String(row.className) !== cls || row.quantity !== quantity || row.level !== data.itemLevel
      || row.cursed !== data.cursed || row.cursedKnown !== data.cursedKnown || row.stackable !== data.stackable
      || row.shopPrice !== -1 || row.nativeValue !== price || row.nativeUnitValue !== data.nativeUnitValue
      || row.serializedBundle !== bundle) return false;
  let hero:any;
  try { hero = JSON.parse(heroStateValue); } catch (_) { return false; }
  if (Number(hero?.pos) !== pos || !Number.isInteger(hero?.hp) || hero.hp <= 0
      || !Number.isInteger(hero.gold) || hero.gold < price) return false;
  const inventory = parseNativeInventoryIndex(hero), economy = parseNativeItemEconomyIndex(hero);
  if (!inventory || !economy || !parseNativeQuickslotIndex(hero)
      || (cls.startsWith("com.shatteredpixel.shatteredpixeldungeon.items.rings.")
        && (() => {
          const combat = parseNativeBundleObject(hero?.combatBundle);
          if (!combat) return true;
          for (let tier = 1; tier <= 4; tier++) {
            const values = combat["talents_tier_" + tier];
            if (!values || typeof values !== "object" || Array.isArray(values)) return true;
            if (Number(values.THIEFS_INTUITION || 0) >= 2) return true;
          }
          const replacements = combat.replacements;
          return !replacements || typeof replacements !== "object" || Array.isArray(replacements)
            || Object.entries(replacements).some(([from,to]) => String(from) === "THIEFS_INTUITION" || String(to) === "THIEFS_INTUITION");
        })())
      || inventory.some((item:any) => String(item.itemId) === itemId)
      || level.heaps.some((heap:any) => (Array.isArray(heap.items)?heap.items:[])
        .some((item:any) => String(item?.itemId || "") === itemId))
      || level.mobs.some((mob:any) => (Array.isArray(mob.buybackItems)?mob.buybackItems:[])
        .some((item:any) => String(item?.itemId || "") === itemId && String(mob.entityId || "") !== shopId))) return false;
  // The native Item.collect() path merges same-class stackable items; this protocol action is
  // scoped to a separately-identifiable instance so it can be replay-protected exactly once.
  if (data.stackable && inventory.some((item:any) => String(item.className) === cls)) return false;
  return true;
}

/** Validates the exact gold debit and exactly one new inventory item with no other Hero edits. */
export function isValidNativeBuybackInventoryMutation(previousValue: unknown, nextValue: unknown,
  detailsValue: unknown, acceptedValue: unknown): boolean {
  let previous:any, next:any;
  try { previous = JSON.parse(String(previousValue || "")); next = JSON.parse(String(nextValue || "")); }
  catch (_) { return false; }
  const details:any = detailsValue, accepted:any = acceptedValue;
  const id = String(details?.buybackItemId || ""), cls = String(details?.buybackItemClass || "");
  const price = Number(details?.price);
  const before = parseNativeInventoryIndex(previous), after = parseNativeInventoryIndex(next);
  const beforeEconomy = parseNativeItemEconomyIndex(previous), afterEconomy = parseNativeItemEconomyIndex(next);
  const beforeSlots = parseNativeQuickslotIndex(previous), afterSlots = parseNativeQuickslotIndex(next);
  if (!details || !accepted || accepted.actionType !== "BUYBACK" || !before || !after
      || !beforeEconomy || !afterEconomy || !beforeSlots || !afterSlots
      || accepted.shopEntityId !== details.shopEntityId || accepted.buybackItemId !== id
      || accepted.buybackItemClass !== cls || accepted.buybackQuantity !== details.buybackQuantity
      || accepted.price !== price || accepted.resultItemId !== id || accepted.itemClass !== cls
      || accepted.itemLevel !== details.itemLevel || accepted.cursed !== details.cursed
      || accepted.cursedKnown !== details.cursedKnown || accepted.stackable !== details.stackable
      || accepted.nativeValue !== details.nativeValue || accepted.nativeUnitValue !== details.nativeUnitValue
      || accepted.resultItemBundle !== details.resultItemBundle
      || previous.inventoryBundle === next.inventoryBundle
      || !Number.isInteger(previous.gold) || !Number.isInteger(next.gold) || next.gold !== previous.gold-price
      || next.gold < 0 || previous.hp !== next.hp || previous.ht !== next.ht || previous.pos !== next.pos
      || previous.shielding !== next.shielding
      || !Number.isFinite(Number(previous.cooldown)) || !Number.isFinite(Number(next.cooldown))
      || Math.abs((Number(next.cooldown) - Number(previous.cooldown)) - 1) > 0.06
      || previous.alchemyEnergy !== next.alchemyEnergy || previous.notesBundle !== next.notesBundle
      || previous.questStateBundle !== next.questStateBundle
      || previous.ironKeyCount !== next.ironKeyCount || previous.crystalKeyCount !== next.crystalKeyCount
      || previous.wornKeyCount !== next.wornKeyCount || previous.goldenKeyCount !== next.goldenKeyCount) return false;
  const stripCombatInventory = (hero:any) => {
    const combat = parseNativeBundleObject(hero?.combatBundle);
    if (!combat) return null;
    delete combat.inventory;
    delete combat.items;
    return combat;
  };
  if (!sameNativeItemValue(stripCombatInventory(previous),stripCombatInventory(next))) return false;
  const oldRows=before.filter((row:any)=>String(row.itemId)===id), newRows=after.filter((row:any)=>String(row.itemId)===id);
  const oldValues=beforeEconomy.filter((row:any)=>String(row.itemId)===id), newValues=afterEconomy.filter((row:any)=>String(row.itemId)===id);
  if (oldRows.length!==0 || oldValues.length!==0 || newRows.length!==1 || newValues.length!==1) return false;
  const item=newRows[0], value=newValues[0];
  if (String(item.className)!==cls || Number(item.quantity)!==Number(details.buybackQuantity)
      || Number(item.level)!==Number(details.itemLevel) || item.cursed!==details.cursed
      || item.cursedKnown!==details.cursedKnown || item.stackable!==details.stackable || item.equipped!==false
      || String(item.serializedBundle)!==String(details.resultItemBundle)
      || String(value.className)!==cls || Number(value.quantity)!==Number(item.quantity)
      || Number(value.nativeValue)!==Number(details.nativeValue)
      || Number(value.nativeUnitValue)!==Number(details.nativeUnitValue) || value.nativeSellable!==true) return false;
  if (!sameNativeItemValue(before.filter((row:any)=>String(row.itemId)!==id),
      after.filter((row:any)=>String(row.itemId)!==id))) return false;
  if (!sameNativeItemValue(beforeEconomy.filter((row:any)=>String(row.itemId)!==id),
      afterEconomy.filter((row:any)=>String(row.itemId)!==id))) return false;
  const oldSlot=beforeSlots.filter((slot:any)=>String(slot.itemId)===id);
  const newSlot=afterSlots.filter((slot:any)=>String(slot.itemId)===id);
  if (oldSlot.length>1 || newSlot.length>1) return false;
  if (oldSlot.length===0) {
    if (newSlot.length!==0) return false;
  } else if (Number(oldSlot[0].quantity)!==0 || newSlot.length!==1
      || Number(newSlot[0].slot)!==Number(oldSlot[0].slot)
      || String(newSlot[0].className)!==cls || Number(newSlot[0].quantity)!==Number(details.buybackQuantity)
      || String(newSlot[0].serializedBundle)!==String(details.resultItemBundle)) return false;
  const slotsWithout = (slots:any[]) => slots.filter((slot:any)=>String(slot.itemId)!==id)
    .slice().sort((a:any,b:any)=>Number(a.slot)-Number(b.slot));
  return sameNativeItemValue(slotsWithout(beforeSlots),slotsWithout(afterSlots));
}

/** Removes exactly one ID from the exact Shopkeeper buyback array; no other Mob state may change. */
export function isValidNativeBuybackShopkeeperMutation(previousMobs:any[], nextMobs:any[],
  detailsValue:unknown, acceptedValue:unknown):boolean {
  const details:any=detailsValue, accepted:any=acceptedValue;
  if (!Array.isArray(previousMobs) || !Array.isArray(nextMobs) || !details || !accepted
      || accepted.actionType!=="BUYBACK" || accepted.shopEntityId!==details.shopEntityId
      || accepted.buybackItemId!==details.buybackItemId
      || accepted.buybackItemClass!==details.buybackItemClass || accepted.buybackQuantity!==details.buybackQuantity
      || accepted.price!==details.price || accepted.resultItemId!==details.resultItemId
      || accepted.itemClass!==details.itemClass || accepted.itemLevel!==details.itemLevel
      || accepted.cursed!==details.cursed || accepted.cursedKnown!==details.cursedKnown
      || accepted.stackable!==details.stackable || accepted.nativeValue!==details.nativeValue
      || accepted.nativeUnitValue!==details.nativeUnitValue || accepted.resultItemBundle!==details.resultItemBundle) return false;
  const index=(rows:any[])=>{
    const map=new Map<string,any>();
    for (const row of rows) {
      const id=String(row?.entityId||"");
      if(!isValidStableMultiplayerId(id)||map.has(id)) return null;
      map.set(id,row);
    }
    return map;
  };
  const before=index(previousMobs), after=index(nextMobs), shopId=String(details.shopEntityId||"");
  if(!before||!after||before.size!==after.size) return false;
  const oldShop=before.get(shopId), newShop=after.get(shopId);
  if(!oldShop||!newShop||String(oldShop.name||"")!=="Shopkeeper"||String(newShop.name||"")!=="Shopkeeper"
      || oldShop.serializedBundle===newShop.serializedBundle
      || !Array.isArray(oldShop.buybackItems)||!Array.isArray(newShop.buybackItems)
      || oldShop.buybackItems.length<1||oldShop.buybackItems.length>3
      || newShop.buybackItems.length!==oldShop.buybackItems.length-1
      || oldShop.shopkeeperTurnsSinceHarmed!==newShop.shopkeeperTurnsSinceHarmed
      || !Number.isInteger(oldShop.shopkeeperTurnsSinceHarmed)
      || oldShop.shopkeeperTurnsSinceHarmed < -1 || oldShop.shopkeeperTurnsSinceHarmed > 100000) return false;
  for (const row of oldShop.buybackItems) if(!isValidNativeSellBuybackRow(row)) return false;
  const found=oldShop.buybackItems.filter((row:any)=>String(row.itemId)===String(details.buybackItemId));
  if(found.length!==1 || String(found[0].className)!==String(details.buybackItemClass)
      || Number(found[0].quantity)!==Number(details.buybackQuantity)
      || Number(found[0].nativeValue)!==Number(details.price)
      || String(found[0].serializedBundle)!==String(details.resultItemBundle)) return false;
  const expected=oldShop.buybackItems.filter((row:any)=>String(row.itemId)!==String(details.buybackItemId));
  if(!sameNativeItemValue(expected,newShop.buybackItems)) return false;
  for (const [id,oldMob] of before) {
    const current=after.get(id);
    if(!current) return false;
    if(id!==shopId) {
      if(!sameNativeItemValue(itemValueWithout(oldMob,["mobId"]),itemValueWithout(current,["mobId"]))) return false;
    } else if(!sameNativeItemValue(itemValueWithout(oldShop,["mobId","serializedBundle","buybackItems"]),
        itemValueWithout(newShop,["mobId","serializedBundle","buybackItems"]))) return false;
  }
  return true;
}

const NATIVE_SUPPORTED_POTION_STATUS_CLASS: Record<string,string> = {
  "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHealing": "PotionOfHealing",
  "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHaste": "PotionOfHaste",
  "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfInvisibility": "PotionOfInvisibility",
  "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfLevitation": "PotionOfLevitation",
  "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfStrength": "PotionOfStrength",
  // Native ExoticPotion.setKnown() marks the regular base Potion class.
  "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfPurity": "PotionOfPurity",
  "com.shatteredpixel.shatteredpixeldungeon.items.potions.exotic.PotionOfShielding": "PotionOfHealing",
  "com.shatteredpixel.shatteredpixeldungeon.items.potions.exotic.PotionOfStamina": "PotionOfHaste"
};
const NATIVE_SUPPORTED_SCROLL_STATUS_CLASS: Record<string,string> = {
  "com.shatteredpixel.shatteredpixeldungeon.items.scrolls.ScrollOfRecharging": "ScrollOfRecharging"
};

/** ItemStatusHandler stores exact _label strings and _known booleans for every native class. */
export function parseNativeItemStatusBundle(value: unknown): any | null {
  const parsed = parseNativeBundleObject(value);
  if (!parsed || Object.keys(parsed).length < 2 || Object.keys(parsed).length > 256) return null;
  for (const [key, entry] of Object.entries(parsed)) {
    if (key.length < 8 || key.length > 160) return null;
    if (key.endsWith("_label")) {
      if (typeof entry !== "string" || entry.length < 1 || entry.length > 80) return null;
    } else if (key.endsWith("_known")) {
      if (typeof entry !== "boolean") return null;
    } else return null;
  }
  return parsed;
}

function nativeStatusTargetKey(action: string, itemClass: string): string {
  if (action === "DRINK") {
    const name = NATIVE_SUPPORTED_POTION_STATUS_CLASS[itemClass];
    return name ? name + "_known" : "";
  }
  if (action === "READ") {
    const name = NATIVE_SUPPORTED_SCROLL_STATUS_CLASS[itemClass];
    return name ? name + "_known" : "";
  }
  return "";
}

/** A native read/drink may reveal only the exact Potion/Scroll class being consumed. */
export function isValidNativeItemStatusMutation(previous: any, next: any, action: string, itemClass: string): boolean {
  const oldPotions = parseNativeItemStatusBundle(previous?.potionStatusBundle);
  const newPotions = parseNativeItemStatusBundle(next?.potionStatusBundle);
  const oldScrolls = parseNativeItemStatusBundle(previous?.scrollStatusBundle);
  const newScrolls = parseNativeItemStatusBundle(next?.scrollStatusBundle);
  if (!oldPotions || !newPotions || !oldScrolls || !newScrolls) return false;
  const compare = (before: any, after: any, targetKey: string) => {
    const oldKeys = Object.keys(before).sort(), newKeys = Object.keys(after).sort();
    if (!sameNativeItemValue(oldKeys,newKeys) || (targetKey && !Object.prototype.hasOwnProperty.call(before,targetKey))) return false;
    for (const key of oldKeys) {
      if (key === targetKey) {
        // Native identify() only promotes unknown to known, never the reverse.
        if (before[key] !== true && after[key] !== true) return false;
      } else if (before[key] !== after[key]) return false;
    }
    return true;
  };
  const targetKey = nativeStatusTargetKey(action,itemClass);
  if (action === "DRINK") return compare(oldPotions,newPotions,targetKey) && sameNativeItemValue(oldScrolls,newScrolls);
  if (action === "READ") return compare(oldScrolls,newScrolls,targetKey) && sameNativeItemValue(oldPotions,newPotions);
  return sameNativeItemValue(oldPotions,newPotions) && sameNativeItemValue(oldScrolls,newScrolls);
}

/** Returns the exact validated run-knowledge fields to commit for this native read/drink. */
export function mergeNativeItemStatusState(previousValue: unknown, reportedValue: unknown,
  actionValue: unknown, itemClassValue: unknown): {potionStatusBundle:string,scrollStatusBundle:string} | null {
  let previous: any, reported: any;
  try {
    previous = typeof previousValue === "string" ? JSON.parse(previousValue) : previousValue;
    reported = typeof reportedValue === "string" ? JSON.parse(reportedValue) : reportedValue;
  } catch (_) { return null; }
  if (!previous || typeof previous !== "object" || Array.isArray(previous)
      || !reported || typeof reported !== "object" || Array.isArray(reported)) return null;
  const action = String(actionValue || ""), itemClass = String(itemClassValue || "");
  if (typeof reported.potionStatusBundle !== "string" || typeof reported.scrollStatusBundle !== "string"
      || !isValidNativeItemStatusMutation(previous,reported,action,itemClass)) return null;
  return {
    potionStatusBundle: reported.potionStatusBundle,
    scrollStatusBundle: reported.scrollStatusBundle
  };
}

/** A consume intent must identify one item already owned by the authenticated hero. */
export function isValidNativeUseItemIntent(level: any, dataValue: unknown, depthValue: unknown,
  playerIdValue: unknown, player: any, heroStateValue: unknown): boolean {
  const data: any = dataValue, depth = Number(depthValue), playerId = String(playerIdValue || "");
  if (!level || !data || typeof data !== "object" || !Array.isArray(level.heaps)
      || !Number.isInteger(depth) || level.depth !== depth || level.branch !== 0 || level.locked !== false
      || !player || !playerId || String(player.state) !== "ALIVE" || !Number.isInteger(player.pos)
      || typeof heroStateValue !== "string") return false;
  const pos = Number(player.pos), id = String(data.itemId || ""), cls = String(data.itemClass || "");
  const itemAction = String(data.itemAction || "");
  if (data.from !== pos || data.to !== pos || data.targetPos !== pos || Number(data.depth) !== depth
      || data.branch !== 0 || id.length < 8 || id.length > 80 || cls.length < 1 || cls.length > 256
      || !["DRINK", "EAT", "READ"].includes(itemAction) || data.expectedQuantity !== 1
      || !Number.isInteger(data.sourceQuantityBefore) || data.sourceQuantityBefore < 1 || data.sourceQuantityBefore > 100000
      || typeof data.stackable !== "boolean" || !Number.isFinite(data.engineActionCost)
      || data.engineActionCost < 0 || data.engineActionCost > 10) return false;
  const supportedDrink = itemAction === "DRINK" && [
    "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHealing",
    "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHaste",
    "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfInvisibility",
    "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfLevitation",
    "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfStrength",
    "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfPurity",
    "com.shatteredpixel.shatteredpixeldungeon.items.potions.exotic.PotionOfStamina",
    "com.shatteredpixel.shatteredpixeldungeon.items.potions.exotic.PotionOfShielding"
  ].includes(cls);
  const supportedFood = itemAction === "EAT" && [
    "com.shatteredpixel.shatteredpixeldungeon.items.food.Food",
    "com.shatteredpixel.shatteredpixeldungeon.items.food.SmallRation",
    "com.shatteredpixel.shatteredpixeldungeon.items.food.StewedMeat",
    "com.shatteredpixel.shatteredpixeldungeon.items.food.ChargrilledMeat",
    "com.shatteredpixel.shatteredpixeldungeon.items.food.MeatPie"
  ].includes(cls);
  const supportedScroll = itemAction === "READ"
    && cls === "com.shatteredpixel.shatteredpixeldungeon.items.scrolls.ScrollOfRecharging";
  if (!supportedDrink && !supportedFood && !supportedScroll) return false;
  let hero: any;
  try { hero = JSON.parse(heroStateValue); } catch (_) { return false; }
  if (Number(hero?.pos) !== pos || !Number.isInteger(hero?.hp) || hero.hp <= 0
      || !parseNativeItemStatusBundle(hero.potionStatusBundle)
      || !parseNativeItemStatusBundle(hero.scrollStatusBundle)) return false;
  if (supportedScroll && !isNativeRechargingScrollReadSafe(hero)) return false;
  if (supportedFood && !isNativeFoodUseSafe(hero)) return false;
  if (supportedDrink && !isNativePotionUseSafe(hero, cls)) return false;
  if (cls === "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfInvisibility") {
    let combat: any;
    try { combat = JSON.parse(String(hero.combatBundle || "")); } catch (_) { return false; }
    if (String(combat?.subClass || "") === "ASSASSIN") return false;
  }
  if (cls === "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfLevitation") {
    const buffs = nativeUseItemBuffMap(hero);
    if (!buffs || buffs.has("com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Roots")) return false;
  }
  const inventory = parseNativeInventoryIndex(hero);
  if (!inventory || !parseNativeQuickslotIndex(hero)) return false;
  const source = inventory.filter((item: any) => String(item.itemId) === id);
  return source.length === 1 && String(source[0].className) === cls
    && Number(source[0].quantity) === Number(data.sourceQuantityBefore)
    && source[0].stackable === data.stackable;
}

/** Validates the exact QuickSlot mutation performed by native Item.detach(). */
function isValidNativeUseItemQuickslotMutation(sourceId: string, itemClass: string,
  sourceQuantityBefore: number, stackable: boolean, sourceAfter: any | undefined,
  beforeSlots: any[], afterSlots: any[]): boolean {
  const oldSourceSlots = beforeSlots.filter((slot:any)=>String(slot.itemId)===sourceId);
  const newSourceSlots = afterSlots.filter((slot:any)=>String(slot.itemId)===sourceId);
  if (oldSourceSlots.length > 1 || newSourceSlots.length > 1) return false;
  const oldSlot = oldSourceSlots[0];
  const newSlot = newSourceSlots[0];
  if (oldSlot && String(oldSlot.className)!==itemClass) return false;

  if (sourceQuantityBefore > 1) {
    if (oldSlot) {
      if (!sourceAfter || !newSlot || Number(newSlot.slot)!==Number(oldSlot.slot)
          || String(newSlot.className)!==itemClass || Number(newSlot.quantity)!==sourceQuantityBefore-1
          || String(newSlot.serializedBundle)!==String(sourceAfter.serializedBundle)) return false;
    } else if (newSlot) return false;
  } else if (oldSlot) {
    if (newSlot) return false;
    const atOldIndex = afterSlots.filter((slot:any)=>Number(slot.slot)===Number(oldSlot.slot));
    if (atOldIndex.length > 1) return false;
    if (atOldIndex.length === 1) {
      // Stackable items become a fresh-ID virtual item with quantity=0. Item.storeInBundle()
      // records both the new multiplayer_item_id and the exact quickslotpos.
      if (!stackable) return false;
      const placeholder = atOldIndex[0];
      const root = parseNativeBundleObject(placeholder.serializedBundle);
      const nativeItem = root && root.item;
      if (Number(placeholder.quantity)!==0 || String(placeholder.className)!==itemClass
          || String(placeholder.itemId)===sourceId || !nativeItem || typeof nativeItem!=="object"
          || String(nativeItem.__className||"")!==itemClass || Number(nativeItem.quantity)!==0
          || String(nativeItem.multiplayer_item_id||"")!==String(placeholder.itemId)
          || Number(nativeItem.quickslotpos)!==Number(oldSlot.slot)) return false;
    }
  } else if (newSlot) return false;

  const oldIndex = oldSlot ? Number(oldSlot.slot) : -1;
  const normalize = (slots:any[])=>slots.filter((slot:any)=>Number(slot.slot)!==oldIndex)
    .map((slot:any)=>({slot:slot.slot,itemId:slot.itemId,className:slot.className,
      quantity:slot.quantity,serializedBundle:slot.serializedBundle}))
    .sort((a:any,b:any)=>Number(a.slot)-Number(b.slot));
  return sameNativeItemValue(normalize(beforeSlots),normalize(afterSlots));
}

/** A validated consume removes one source unit and cannot rewrite unrelated inventory or quickslots. */
export function isValidNativeUseItemMutation(previousValue: unknown, nextValue: unknown,
  detailsValue: unknown, acceptedValue: unknown): boolean {
  let previous: any, next: any;
  try { previous = JSON.parse(String(previousValue || "")); next = JSON.parse(String(nextValue || "")); } catch (_) { return false; }
  const details: any = detailsValue, accepted: any = acceptedValue;
  const before = parseNativeInventoryIndex(previous), after = parseNativeInventoryIndex(next);
  if (!details || !accepted || accepted.actionType !== "USE_ITEM" || !before || !after
      || accepted.itemId !== details.itemId || accepted.itemClass !== details.itemClass
      || accepted.itemAction !== details.itemAction || accepted.expectedQuantity !== details.expectedQuantity
      || accepted.sourceQuantityBefore !== details.sourceQuantityBefore || accepted.stackable !== details.stackable
      || !["DRINK", "EAT", "READ"].includes(String(details.itemAction)) || details.expectedQuantity !== 1
      || !Number.isInteger(details.sourceQuantityBefore) || details.sourceQuantityBefore < 1
      || previous.gold !== next.gold || previous.inventoryBundle === next.inventoryBundle
      || !nativeUseItemCombatBundleMatches(previous, next, String(details.itemClass || ""))
      || !mergeNativeItemStatusState(previous,next,String(details.itemAction),String(details.itemClass || ""))
      || !isValidNativeUseItemBuffMutation(previous, next, String(details.itemAction), String(details.itemClass || ""))) return false;
  const id = String(details.itemId || ""), cls = String(details.itemClass || "");
  const oldSource = before.filter((item: any) => String(item.itemId) === id);
  const newSource = after.filter((item: any) => String(item.itemId) === id);
  if (oldSource.length !== 1 || String(oldSource[0].className) !== cls
      || oldSource[0].quantity !== Number(details.sourceQuantityBefore) || oldSource[0].stackable !== details.stackable) return false;
  if (oldSource[0].quantity === 1) {
    if (newSource.length !== 0) return false;
  } else {
    if (newSource.length !== 1 || newSource[0].quantity !== oldSource[0].quantity - 1
        || !sameNativeItemValue(itemValueWithout(oldSource[0], ["quantity", "serializedBundle", "cursedKnown"]),
          itemValueWithout(newSource[0], ["quantity", "serializedBundle", "cursedKnown"]))
        || (oldSource[0].cursedKnown && !newSource[0].cursedKnown)) return false;
  }
  if (!sameNativeItemValue(before.filter((item: any) => String(item.itemId) !== id),
      after.filter((item: any) => String(item.itemId) !== id))) return false;
  const beforeSlots = parseNativeQuickslotIndex(previous), afterSlots = parseNativeQuickslotIndex(next);
  if (!beforeSlots || !afterSlots) return false;
  return isValidNativeUseItemQuickslotMutation(id,cls,Number(details.sourceQuantityBefore),
    details.stackable,newSource[0],beforeSlots,afterSlots);
}


