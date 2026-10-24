/*
 * Pixel Dungeon
 * Copyright (C) 2012-2015 Oleg Dolya
 *
 * Shattered Pixel Dungeon
 * Copyright (C) 2014-2026 Evan Debenham
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>
 */

package com.shatteredpixel.shatteredpixeldungeon.actors.hero.abilities;

import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Talent;
import com.shatteredpixel.shatteredpixeldungeon.items.armor.ClassArmor;
import com.shatteredpixel.shatteredpixeldungeon.mechanics.Ballistica;
import com.shatteredpixel.shatteredpixeldungeon.messages.Messages;
import com.shatteredpixel.shatteredpixeldungeon.scenes.CellSelector;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.ui.HeroIcon;
import com.watabou.utils.Bundlable;
import com.watabou.utils.Bundle;

import java.util.HashMap;
import java.util.Map;

public abstract class ArmorAbility implements Bundlable {

	protected float baseChargeUse = 35;

	public void use( ClassArmor armor, Hero hero ){
        com.shatteredpixel.shatteredpixeldungeon.multiplayer.MultiplayerManager manager =
                com.shatteredpixel.shatteredpixeldungeon.multiplayer.MultiplayerManager.getInstance();
        if (manager.isMultiplayerActive() && hero == Dungeon.hero) {
            if (!isSupportedNativeMultiplayerAbility(armor, hero)) {
                hero.rejectUnsupportedMultiplayerWorldAction();
                return;
            }
            useAndPublishNativeMultiplayerAbility(armor, hero);
            return;
        }
		if (targetingPrompt() == null){
			activate(armor, hero, hero.pos);
		} else {
			GameScene.selectCell(new CellSelector.Listener() {
				@Override
				public void onSelect(Integer cell) {
					activate(armor, hero, cell);
				}

				@Override
				public String prompt() {
					return targetingPrompt();
				}
			});
		}
	}

    /**
     * Only self-buff abilities whose native effects can be validated without replaying the
     * entire world's combat/scheduler are admitted. Targeted or world-mutating abilities remain
     * blocked in multiplayer until they have their own transaction protocol.
     */
    private boolean isSupportedNativeMultiplayerAbility(ClassArmor armor, Hero hero) {
        if (armor == null || hero == null || hero != Dungeon.hero || Dungeon.level == null
                || Dungeon.branch != 0 || Dungeon.level.locked || hero.armorAbility != this
                || !hero.belongings.contains(armor) || !armor.isEquipped(hero)
                || targetingPrompt() != null) return false;

        String abilityClass = getClass().getName();
        boolean supported = abilityClass.equals("com.shatteredpixel.shatteredpixeldungeon.actors.hero.abilities.warrior.Endure")
                || abilityClass.equals("com.shatteredpixel.shatteredpixeldungeon.actors.hero.abilities.huntress.NaturesPower");
        if (!supported) return false;

        // These two abilities would otherwise mutate unrelated timed state as a side effect.
        for (com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Buff buff : hero.buffs()) {
            String className = buff == null ? "" : buff.getClass().getName();
            if (className.endsWith(".Invisibility")) return false;
            if (abilityClass.endsWith(".Endure")
                    && className.equals("com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Combo")) return false;
        }
        return armor.charge >= chargeUse(hero);
    }

    private void useAndPublishNativeMultiplayerAbility(ClassArmor armor, Hero hero) {
        com.shatteredpixel.shatteredpixeldungeon.multiplayer.MultiplayerManager manager =
                com.shatteredpixel.shatteredpixeldungeon.multiplayer.MultiplayerManager.getInstance();
        String heroStateBefore = com.shatteredpixel.shatteredpixeldungeon.multiplayer.SPDLevelSnapshot.currentHeroStateJson(hero);
        if (heroStateBefore == null || heroStateBefore.isEmpty()) {
            manager.requestResync(manager.getLastSequence());
            hero.rejectUnsupportedMultiplayerWorldAction();
            return;
        }

        final int depthBefore = Dungeon.depth;
        final int posBefore = hero.pos;
        final float cooldownBefore = hero.cooldown();
        final float armorChargeBefore = armor.charge;
        final float armorChargeUse = chargeUse(hero);
        final String armorItemId = armor.multiplayerItemId();
        final String abilityClass = getClass().getName();

        activate(armor, hero, hero.pos);

        if (Dungeon.level == null || Dungeon.depth != depthBefore || Dungeon.branch != 0
                || hero.pos != posBefore || armorChargeBefore - armor.charge < 0f
                || Math.abs((armorChargeBefore - armor.charge) - armorChargeUse) > 0.05f) {
            manager.requestResync(manager.getLastSequence());
            return;
        }

        com.badlogic.gdx.utils.Json json = new com.badlogic.gdx.utils.Json();
        Map<String, Object> details = new HashMap<>();
        details.put("abilityClass", abilityClass);
        details.put("armorItemId", armorItemId);
        details.put("armorClass", armor.getClass().getName());
        details.put("armorChargeBefore", armorChargeBefore);
        details.put("armorChargeAfter", armor.charge);
        details.put("armorChargeUse", armorChargeUse);
        hero.queueNativeWorldMutation("USE_ABILITY", posBefore, posBefore, cooldownBefore,
                heroStateBefore, json.toJson(details));
        hero.publishPendingNativeWorldMutation();
    }

	//leave null for no targeting
	public String targetingPrompt(){
		return null;
	}

	public boolean useTargeting(){
		return targetingPrompt() != null;
	}

	public int targetedPos( Char user, int dst ){
		return new Ballistica( user.pos, dst, Ballistica.PROJECTILE ).collisionPos;
	}

	public float chargeUse( Hero hero ){
		float chargeUse = baseChargeUse;
		if (hero.hasTalent(Talent.HEROIC_ENERGY)){
			//reduced charge use by 12%/23%/32%/40%
			switch (hero.pointsInTalent(Talent.HEROIC_ENERGY)){
				case 1: default:
					chargeUse *= 0.88f;
					break;
				case 2:
					chargeUse *= 0.77f;
					break;
				case 3:
					chargeUse *= 0.68f;
					break;
				case 4:
					chargeUse *= 0.6f;
					break;
			}
		}
		return chargeUse;
	}

	protected abstract void activate( ClassArmor armor, Hero hero, Integer target );

	public String name(){
		return Messages.get(this, "name");
	}

	public String shortDesc(){
		return Messages.get(this, "short_desc");
	}

	public String desc(){
		return Messages.get(this, "desc") + "\n\n" + Messages.get(this, "cost", (int)baseChargeUse);
	}

	public int icon(){
		return HeroIcon.NONE;
	}

	public abstract Talent[] talents();

	@Override
	public void storeInBundle(Bundle bundle) {
	}

	@Override
	public void restoreFromBundle(Bundle bundle) {
	}
}
