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

package com.shatteredpixel.shatteredpixeldungeon.actors.buffs;

import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.items.weapon.SpiritBow;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob;
import com.shatteredpixel.shatteredpixeldungeon.multiplayer.MultiplayerManager;
import com.shatteredpixel.shatteredpixeldungeon.multiplayer.NativeCombatJson;
import com.shatteredpixel.shatteredpixeldungeon.multiplayer.SPDLevelSnapshot;
import java.util.HashMap;
import com.shatteredpixel.shatteredpixeldungeon.messages.Messages;
import com.shatteredpixel.shatteredpixeldungeon.ui.ActionIndicator;
import com.shatteredpixel.shatteredpixeldungeon.ui.BuffIndicator;
import com.shatteredpixel.shatteredpixeldungeon.ui.HeroIcon;
import com.shatteredpixel.shatteredpixeldungeon.ui.QuickSlotButton;
import com.watabou.utils.Bundle;

public class SnipersMark extends FlavourBuff implements ActionIndicator.Action {

	public int object = 0;
	public float percentDmgBonus = 0;
	/** Stable server Mob identity; object remains a process-local SPD Actor ID. */
	public String serverEntityId = "";

	private static final String OBJECT    = "object";
	private static final String BONUS    = "bonus";
	private static final String SERVER_ENTITY_ID = "server_entity_id";

	public static final float DURATION = 4f;

	{
		type = buffType.POSITIVE;
	}

	public void set(int object, float bonus){
		this.object = object;
		this.percentDmgBonus = bonus;
		MultiplayerManager manager = MultiplayerManager.getInstance();
		String stableId = manager.isMultiplayerActive() ? manager.getServerEntityId(object) : null;
		serverEntityId = stableId == null ? "" : stableId;
	}
	
	@Override
	public boolean attachTo(Char target) {
		ActionIndicator.setAction(this);
		return super.attachTo(target);
	}
	
	@Override
	public void detach() {
		super.detach();
		ActionIndicator.clearAction(this);
	}
	
	@Override
	public void storeInBundle( Bundle bundle ) {
		super.storeInBundle( bundle );
		bundle.put( OBJECT, object );
		bundle.put( BONUS, percentDmgBonus );
		bundle.put( SERVER_ENTITY_ID, serverEntityId == null ? "" : serverEntityId );
	}

	@Override
	public void restoreFromBundle( Bundle bundle ) {
		super.restoreFromBundle( bundle );
		object = bundle.getInt( OBJECT );
		percentDmgBonus = bundle.getFloat( BONUS );
		serverEntityId = bundle.contains(SERVER_ENTITY_ID) ? bundle.getString(SERVER_ENTITY_ID) : "";
	}

	@Override
	public int icon() {
		return BuffIndicator.MARK;
	}

	@Override
	public float iconFadePercent() {
		return Math.max(0, (DURATION - visualcooldown()) / DURATION);
	}

	@Override
	public String actionName() {
		SpiritBow bow = Dungeon.hero.belongings.getItem(SpiritBow.class);

		if (bow == null) return null;

		switch (bow.augment){
			case NONE: default:
				return Messages.get(this, "action_name_snapshot");
			case SPEED:
				return Messages.get(this, "action_name_volley");
			case DAMAGE:
				return Messages.get(this, "action_name_sniper");
		}
	}

	@Override
	public int actionIcon() {
		return HeroIcon.SNIPERS_MARK;
	}

	@Override
	public int indicatorColor() {
		return 0x444444;
	}

	@Override
	public void doAction() {
		
		Hero hero = Dungeon.hero;
		if (hero == null) return;
		
		SpiritBow bow = hero.belongings.getItem(SpiritBow.class);
		if (bow == null) return;
		
		SpiritBow.SpiritArrow arrow = bow.knockArrow();
		if (arrow == null) return;
		
		Char ch = (Char) Actor.findById(object);
		if (ch == null) return;
		
		int cell = QuickSlotButton.autoAim(ch, arrow);
		if (cell == -1) return;
		
		MultiplayerManager manager = MultiplayerManager.getInstance();
		if (manager.isMultiplayerActive()) {
			// SPEED schedules a three-hit asynchronous flurry. It remains fail-closed until
			// the protocol can represent all three native outcomes in one authority sequence.
			String augment = String.valueOf(bow.augment);
			if (!(augment.equals("NONE") || augment.equals("DAMAGE")) || !(ch instanceof Mob)) {
				manager.requestResync(manager.getLastSequence());
				return;
			}
			String stableEntityId = manager.getServerEntityId(object);
			String bowItemId = bow.multiplayerItemId();
			if (stableEntityId == null || stableEntityId.length() < 8 || stableEntityId.length() > 80
					|| bowItemId == null || bowItemId.isEmpty()) {
				manager.requestResync(manager.getLastSequence());
				return;
			}
			serverEntityId = stableEntityId;
			String bowBundle = SPDLevelSnapshot.currentItemBundle(bow);
			HashMap<String, Object> details = new HashMap<>();
			details.put("formatVersion", 1);
			details.put("markBuffId", id());
			details.put("markBonus", percentDmgBonus);
			details.put("targetEntityId", stableEntityId);
			details.put("bowItemId", bowItemId);
			String before = SPDLevelSnapshot.currentHeroStateJson(hero);
			if (!hero.beginNativeSpiritArrowAttack(before, NativeCombatJson.strictWriter().toJson(details),
					bowBundle, id())) {
				manager.requestResync(manager.getLastSequence());
				return;
			}
			arrow.bindNativeSpiritArrowCompletion(hero, id(), stableEntityId);
		}
		bow.sniperSpecial = true;
		bow.sniperSpecialBonusDamage = percentDmgBonus;
		try {
			arrow.cast(hero, cell);
			if (!manager.isMultiplayerActive()) detach();
		} catch (RuntimeException error) {
			// Preserve the original SPD failure in diagnostics before fail-closed cancellation/resync.
			com.watabou.noosa.Game.reportException(error);
			bow.sniperSpecial = false;
			if (manager.isMultiplayerActive()) {
				hero.cancelNativeSpiritArrowAttack(id());
				manager.requestResync(manager.getLastSequence());
			} else {
				detach();
			}
		}
		
	}
}
