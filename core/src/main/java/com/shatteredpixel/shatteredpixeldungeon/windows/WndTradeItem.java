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

package com.shatteredpixel.shatteredpixeldungeon.windows;

import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Buff;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Talent;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.npcs.Shopkeeper;
import com.shatteredpixel.shatteredpixeldungeon.items.EquipableItem;
import com.shatteredpixel.shatteredpixeldungeon.items.Gold;
import com.shatteredpixel.shatteredpixeldungeon.items.Heap;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.shatteredpixel.shatteredpixeldungeon.items.bags.Bag;
import com.shatteredpixel.shatteredpixeldungeon.items.rings.Ring;
import com.shatteredpixel.shatteredpixeldungeon.items.weapon.missiles.darts.TippedDart;
import com.shatteredpixel.shatteredpixeldungeon.items.artifacts.MasterThievesArmband;
import com.shatteredpixel.shatteredpixeldungeon.items.weapon.missiles.MissileWeapon;
import com.shatteredpixel.shatteredpixeldungeon.journal.Catalog;
import com.shatteredpixel.shatteredpixeldungeon.messages.Messages;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.scenes.PixelScene;
import com.shatteredpixel.shatteredpixeldungeon.sprites.CharSprite;
import com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSprite;
import com.shatteredpixel.shatteredpixeldungeon.sprites.ItemSpriteSheet;
import com.shatteredpixel.shatteredpixeldungeon.ui.CurrencyIndicator;
import com.shatteredpixel.shatteredpixeldungeon.ui.RedButton;
import com.shatteredpixel.shatteredpixeldungeon.ui.RenderedTextBlock;

public class WndTradeItem extends WndInfoItem {

	private static final float GAP		= 2;
	private static final int BTN_HEIGHT	= 18;

	private WndBag owner;

	private boolean selling = false;

	//selling
	public WndTradeItem( final Item item, WndBag owner ) {

		super(item);

		selling = true;

		this.owner = owner;

		float pos = height;

		//find the shopkeeper in the current level
		Shopkeeper shop = null;
		for (Char ch : Actor.chars()){
			if (ch instanceof Shopkeeper){
				shop = (Shopkeeper) ch;
				break;
			}
		}
		final Shopkeeper finalShop = shop;

		if (item.quantity() == 1 || (item instanceof MissileWeapon && item.isUpgradable())) {

			if (item instanceof MissileWeapon && ((MissileWeapon) item).extraThrownLeft){
				RenderedTextBlock warn = PixelScene.renderTextBlock(Messages.get(WndUpgrade.class, "thrown_dust"), 6);
				warn.hardlight(CharSprite.WARNING);
				warn.maxWidth(this.width);
				warn.setPos(0, pos + GAP);
				add(warn);
				pos = warn.bottom();
			}

			RedButton btnSell = new RedButton( Messages.get(this, "sell", item.value()) ) {
				@Override
				protected void onClick() {
					sell( item, finalShop);
					hide();
				}
			};
			btnSell.setRect( 0, pos + GAP, width, BTN_HEIGHT );
			btnSell.icon(new ItemSprite(ItemSpriteSheet.GOLD));
			add( btnSell );

			pos = btnSell.bottom();

		} else {

			int priceAll= item.value();
			RedButton btnSell1 = new RedButton( Messages.get(this, "sell_1", priceAll / item.quantity()) ) {
				@Override
				protected void onClick() {
					sellOne( item, finalShop );
					hide();
				}
			};
			btnSell1.setRect( 0, pos + GAP, width, BTN_HEIGHT );
			btnSell1.icon(new ItemSprite(ItemSpriteSheet.GOLD));
			add( btnSell1 );
			RedButton btnSellAll = new RedButton( Messages.get(this, "sell_all", priceAll ) ) {
				@Override
				protected void onClick() {
					sell( item, finalShop );
					hide();
				}
			};
			btnSellAll.setRect( 0, btnSell1.bottom() + 1, width, BTN_HEIGHT );
			btnSellAll.icon(new ItemSprite(ItemSpriteSheet.GOLD));
			add( btnSellAll );

			pos = btnSellAll.bottom();

		}

		resize( width, (int)pos );
	}

	//buying
	public WndTradeItem( final Heap heap ) {

		super(heap);

		selling = false;
		CurrencyIndicator.showGold = true;

		Item item = heap.peek();

		float pos = height;

		final int price = Shopkeeper.sellPrice( item );

		RedButton btnBuy = new RedButton( Messages.get(this, "buy", price) ) {
			@Override
			protected void onClick() {
				hide();
				buy( heap );
			}
		};
		btnBuy.setRect( 0, pos + GAP, width, BTN_HEIGHT );
		btnBuy.icon(new ItemSprite(ItemSpriteSheet.GOLD));
		btnBuy.enable( price <= Dungeon.gold );
		add( btnBuy );

		pos = btnBuy.bottom();

		final MasterThievesArmband.Thievery thievery = Dungeon.hero.buff(MasterThievesArmband.Thievery.class);
		if (thievery != null && !thievery.isCursed() && thievery.chargesToUse(item) > 0) {
			final float chance = thievery.stealChance(item);
			final int chargesToUse = thievery.chargesToUse(item);
			RedButton btnSteal = new RedButton(Messages.get(this, "steal", Math.min(100, (int) (chance * 100)), chargesToUse), 6) {
				@Override
				protected void onClick() {
					if (chance >= 1){
						thievery.steal(item);
						Hero hero = Dungeon.hero;
						Item item = heap.pickUp();
						hide();

						if (!item.doPickUp(hero)) {
							Dungeon.level.drop(item, heap.pos).sprite.drop();
						}
					} else {
						GameScene.show(new WndOptions(new ItemSprite(ItemSpriteSheet.ARTIFACT_ARMBAND),
								Messages.titleCase(Messages.get(MasterThievesArmband.class, "name")),
								Messages.get(WndTradeItem.class, "steal_warn"),
								Messages.get(WndTradeItem.class, "steal_warn_yes"),
								Messages.get(WndTradeItem.class, "steal_warn_no")){
							@Override
							protected void onSelect(int index) {
								super.onSelect(index);
								if (index == 0){
									if (thievery.steal(item)) {
										Hero hero = Dungeon.hero;
										Item item = heap.pickUp();
										WndTradeItem.this.hide();

										if (!item.doPickUp(hero)) {
											Dungeon.level.drop(item, heap.pos).sprite.drop();
										}
									} else {
										for (Mob mob : Dungeon.level.mobs) {
											if (mob instanceof Shopkeeper) {
												mob.yell(Messages.get(mob, "thief"));
												((Shopkeeper) mob).flee();
												break;
											}
										}
										WndTradeItem.this.hide();
									}
								}
							}
						});
					}
				}
			};
			btnSteal.setRect(0, pos + 1, width, BTN_HEIGHT);
			btnSteal.icon(new ItemSprite(ItemSpriteSheet.ARTIFACT_ARMBAND));
			add(btnSteal);

			pos = btnSteal.bottom();

		}

		resize(width, (int) pos);
	}
	
	@Override
	public void hide() {
		
		super.hide();
		CurrencyIndicator.showGold = false;
		
		if (owner != null) {
			owner.hide();
		}
		if (selling) Shopkeeper.sell();
	}

	private static boolean isMultiplayerSaleActive() {
        Hero hero = Dungeon.hero;
        return hero != null && com.shatteredpixel.shatteredpixeldungeon.multiplayer.MultiplayerManager
                .getInstance().isMultiplayerActive();
    }

    /** Reject custom pickup/collection callbacks not covered by the native BUY transaction. */
    private static boolean isSafeMultiplayerPurchase(Item offered, Hero hero) {
        if (offered == null || hero == null) return false;
        if (offered instanceof Ring && hero.pointsInTalent(Talent.THIEFS_INTUITION) == 2) return false;
        for (Item existing : hero.belongings.backpack.items) {
            if (existing instanceof Bag && ((Bag) existing).canHold(offered)) return false;
        }
        boolean wouldMerge = false;
        if (offered.stackable) {
            for (Item existing : hero.belongings.getAllItems(Item.class)) {
                if (existing != null && existing.stackable && existing.isSimilar(offered)) { wouldMerge = true; break; }
            }
        }
        if (wouldMerge && (offered instanceof TippedDart || TippedDart.lostDarts > 0)) return false;
        try {
            java.lang.reflect.Method collect = offered.getClass().getMethod("collect", Bag.class);
            java.lang.reflect.Method pickupDelay = offered.getClass().getMethod("pickupDelay");
            java.lang.reflect.Method doPickUp = offered.getClass().getMethod("doPickUp", Hero.class, int.class);
            return collect.getDeclaringClass() == Item.class && pickupDelay.getDeclaringClass() == Item.class
                    && doPickUp.getDeclaringClass() == Item.class;
        } catch (ReflectiveOperationException unsupportedPickup) { return false; }
    }

    /**
     * Publishes one sale only after native inventory, Gold and Shopkeeper buyback state agree.
     * Equipped gear and upgrade-tracked missiles fail closed because their extra combat state
     * does not yet have a narrowly scoped SELL validator.
     */
    private static void multiplayerSell(Item item, Shopkeeper shop, boolean oneUnit) {
        Hero hero = Dungeon.hero;
        com.shatteredpixel.shatteredpixeldungeon.multiplayer.MultiplayerManager manager =
                com.shatteredpixel.shatteredpixeldungeon.multiplayer.MultiplayerManager.getInstance();
        if (hero == null || item == null || shop == null || Dungeon.level == null
                || Dungeon.branch != 0 || Dungeon.level.locked || !Dungeon.level.mobs.contains(shop)
                || !hero.isAlive() || !hero.belongings.contains(item)
                || !hero.belongings.backpack.items.contains(item) || !Shopkeeper.canSell(item)
                || item.isEquipped(hero) || (item instanceof MissileWeapon && item.isUpgradable())) {
            if (hero != null) hero.rejectUnsupportedMultiplayerWorldAction();
            return;
        }
        String shopEntityId = manager.getServerEntityId(shop.id());
        if (shopEntityId == null || shopEntityId.length() < 8 || shopEntityId.length() > 80) {
            manager.requestResync(manager.getLastSequence());
            return;
        }

        final int sourceQuantityBefore = item.quantity();
        final String sourceItemId = item.multiplayerItemId();
        final String itemClass = item.getClass().getName();
        final int sourceNativeValue = item.value();
        final int sourceNativeUnitValue = com.shatteredpixel.shatteredpixeldungeon.multiplayer.SPDLevelSnapshot
                .nativeUnitValue(item);
        final int sourceItemLevel = item.level();
        final boolean sourceCursed = item.cursed;
        final boolean sourceCursedKnown = item.cursedKnown;
        final boolean stackable = item.stackable;
        final boolean partial = oneUnit && sourceQuantityBefore > 1;
        if (partial && (!stackable || sourceNativeUnitValue < 0
                || (long) sourceNativeUnitValue * sourceQuantityBefore != sourceNativeValue)) {
            hero.rejectUnsupportedMultiplayerWorldAction();
            return;
        }
        final int soldQuantity = partial ? 1 : sourceQuantityBefore;
        final int price = partial ? sourceNativeUnitValue : sourceNativeValue;
        if (price <= 0 || price > 10000000) {
            hero.rejectUnsupportedMultiplayerWorldAction();
            return;
        }
        final int depthBefore = Dungeon.depth;
        final int posBefore = hero.pos;
        final float cooldownBefore = hero.cooldown();
        final String heroStateBefore = com.shatteredpixel.shatteredpixeldungeon.multiplayer.SPDLevelSnapshot
                .currentHeroStateJson(hero);
        if (heroStateBefore == null || heroStateBefore.isEmpty()) {
            manager.requestResync(manager.getLastSequence());
            return;
        }

        Item sold = partial ? item.detach(hero.belongings.backpack) : item.detachAll(hero.belongings.backpack);
        if (sold == null || sold.quantity() != soldQuantity
                || (partial && (sold == item || sourceItemId.equals(sold.multiplayerItemId())
                    || item.quantity() != sourceQuantityBefore - 1 || !hero.belongings.contains(item)))
                || (!partial && hero.belongings.contains(item))
                || Dungeon.level == null || Dungeon.depth != depthBefore || Dungeon.branch != 0
                || hero.pos != posBefore || sold.value() != price) {
            manager.requestResync(manager.getLastSequence());
            return;
        }

        // Mirrors native SPD sale semantics: the operation does not consume a turn.
        hero.spend(-hero.cooldown());
        new Gold(price).doPickUp(hero);
        shop.buybackItems.add(sold);
        while (shop.buybackItems.size() > Shopkeeper.MAX_BUYBACK_HISTORY) shop.buybackItems.remove(0);

        com.badlogic.gdx.utils.Json json = new com.badlogic.gdx.utils.Json();
        java.util.HashMap<String, Object> details = new java.util.HashMap<>();
        details.put("shopEntityId", shopEntityId);
        details.put("sourceItemId", sourceItemId);
        details.put("resultItemId", sold.multiplayerItemId());
        details.put("itemClass", itemClass);
        details.put("sourceQuantityBefore", sourceQuantityBefore);
        details.put("soldQuantity", soldQuantity);
        details.put("sourceNativeValue", sourceNativeValue);
        details.put("sourceNativeUnitValue", sourceNativeUnitValue);
        details.put("sourceItemLevel", sourceItemLevel);
        details.put("sourceCursed", sourceCursed);
        details.put("sourceCursedKnown", sourceCursedKnown);
        details.put("price", price);
        details.put("stackable", stackable);
        details.put("resultItemLevel", sold.level());
        details.put("resultCursed", sold.cursed);
        details.put("resultCursedKnown", sold.cursedKnown);
        details.put("resultNativeValue", sold.value());
        details.put("resultNativeUnitValue",
                com.shatteredpixel.shatteredpixeldungeon.multiplayer.SPDLevelSnapshot.nativeUnitValue(sold));
        details.put("resultItemBundle",
                com.shatteredpixel.shatteredpixeldungeon.multiplayer.SPDLevelSnapshot.currentItemBundle(sold));
        hero.queueNativeWorldMutation("SELL", posBefore, posBefore, cooldownBefore, heroStateBefore, json.toJson(details));
        hero.publishPendingNativeWorldMutation();
    }

    public static void sell( Item item ) {
		sell(item, null);
	}

	public static void sell( Item item, Shopkeeper shop ) {
        if (isMultiplayerSaleActive()) {
            multiplayerSell(item, shop, false);
            return;
        }

		Hero hero = Dungeon.hero;
		
		if (item.isEquipped( hero ) && !((EquipableItem)item).doUnequip( hero, false )) {
			return;
		}
		item.detachAll( hero.belongings.backpack );

		if (item instanceof MissileWeapon && item.isUpgradable()){
			Buff.affect(hero, MissileWeapon.UpgradedSetTracker.class).levelThresholds.put(((MissileWeapon) item).setID, Integer.MAX_VALUE);
		}

		//selling items in the sell interface doesn't spend time
		hero.spend(-hero.cooldown());

		new Gold( item.value() ).doPickUp( hero );

		if (shop != null){
			shop.buybackItems.add(item);
			while (shop.buybackItems.size() > Shopkeeper.MAX_BUYBACK_HISTORY){
				shop.buybackItems.remove(0);
			}
		}
	}

	public static void sellOne( Item item ) {
		sellOne( item, null );
	}

	public static void sellOne( Item item, Shopkeeper shop ) {
        if (isMultiplayerSaleActive()) {
            multiplayerSell(item, shop, true);
            return;
        }

		if (item.quantity() <= 1) {
			sell( item, shop );
		} else {
			
			Hero hero = Dungeon.hero;
			
			item = item.detach( hero.belongings.backpack );

			//selling items in the sell interface doesn't spend time
			hero.spend(-hero.cooldown());

			new Gold( item.value() ).doPickUp( hero );

			if (shop != null){
				shop.buybackItems.add(item);
				while (shop.buybackItems.size() > Shopkeeper.MAX_BUYBACK_HISTORY){
					shop.buybackItems.remove(0);
				}
			}
		}
	}
	
	private void buy( Heap heap ) {
		com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero hero = Dungeon.hero;
		if (hero == null || Dungeon.level == null || heap == null || heap.type != Heap.Type.FOR_SALE
				|| heap.size() != 1 || heap.peek() == null) return;
		com.shatteredpixel.shatteredpixeldungeon.multiplayer.MultiplayerManager manager =
				com.shatteredpixel.shatteredpixeldungeon.multiplayer.MultiplayerManager.getInstance();
		boolean trackBuy = hero == Dungeon.hero && manager.isMultiplayerActive();
		if (trackBuy && (Dungeon.branch != 0 || Dungeon.level.locked)) {
			hero.rejectUnsupportedMultiplayerWorldAction();
			return;
		}
		Item offered = heap.peek();
        if (trackBuy && !isSafeMultiplayerPurchase(offered, hero)) {
            hero.rejectUnsupportedMultiplayerWorldAction();
            return;
        }
		int position = heap.pos;
		String heapId = heap.multiplayerHeapId();
		String itemId = offered.multiplayerItemId();
		String itemClass = offered.getClass().getName();
        String itemBundle = trackBuy
                ? com.shatteredpixel.shatteredpixeldungeon.multiplayer.SPDLevelSnapshot.currentItemBundle(offered) : null;
        if (trackBuy && (itemBundle == null || itemBundle.isEmpty() || itemBundle.length() > 200000
                || !itemBundle.contains(itemId))) {
            manager.requestResync(manager.getLastSequence());
            return;
        }
		int itemQuantity = offered.quantity();
		int itemLevel = offered.level();
		boolean itemStackable = offered.stackable;
		boolean cursed = offered.cursed;
		boolean cursedKnown = offered.cursedKnown;
		int price = Shopkeeper.sellPrice(offered);
		if (price < 0 || Dungeon.gold < price) return;
		String heroStateBefore = trackBuy
				? com.shatteredpixel.shatteredpixeldungeon.multiplayer.SPDLevelSnapshot.currentHeroStateJson(hero) : null;
		float cooldownBefore = trackBuy ? hero.cooldown() : 0f;
		Item priorStack = null;
		int priorStackQuantity = 0;
		String priorStackId = "";
		if (itemStackable) {
			for (Item owned : hero.belongings.getAllItems(Item.class)) {
				if (owned != null && owned.stackable && owned.isSimilar(offered)) {
					priorStack = owned;
					priorStackQuantity = owned.quantity();
					priorStackId = owned.multiplayerItemId();
					break;
				}
			}
		}
		Item item = heap.pickUp();
		if (item == null) return;
		Dungeon.gold -= price;
		Catalog.countUses(Gold.class, price);
		boolean collected = item.doPickUp(hero);
		if (!collected) Dungeon.level.drop(item, position).sprite.drop();
		if (trackBuy) {
			boolean acquiredByInventory = false;
			String resultItemId = itemId;
			java.util.ArrayList<Item> ownedAfter = hero.belongings.getAllItems(Item.class);
			if (collected && ownedAfter.contains(item) && item.quantity() > 0) {
				acquiredByInventory = true;
			} else if (collected && priorStack != null && ownedAfter.contains(priorStack)
					&& priorStack.quantity() == priorStackQuantity + itemQuantity) {
				acquiredByInventory = true;
				resultItemId = priorStackId;
			}
			com.shatteredpixel.shatteredpixeldungeon.items.Heap floorHeap = Dungeon.level.heaps.get(position);
			String resultHeapId = "";
			if (!acquiredByInventory) {
				if (floorHeap == null || floorHeap.peek() == null
						|| !itemId.equals(floorHeap.peek().multiplayerItemId())) {
					manager.requestResync(manager.getLastSequence());
					return;
				}
				resultHeapId = floorHeap.multiplayerHeapId();
			}
			com.badlogic.gdx.utils.Json json = new com.badlogic.gdx.utils.Json();
			String details = "{\"heapId\":" + json.toJson(heapId)
					+ ",\"itemId\":" + json.toJson(itemId)
					+ ",\"itemClass\":" + json.toJson(itemClass)
                    + ",\"itemBundle\":" + json.toJson(itemBundle)
					+ ",\"expectedQuantity\":" + itemQuantity
					+ ",\"sourceQuantityBefore\":" + itemQuantity
					+ ",\"stackable\":" + itemStackable
					+ ",\"itemLevel\":" + itemLevel
					+ ",\"cursed\":" + cursed
					+ ",\"cursedKnown\":" + cursedKnown
					+ ",\"price\":" + price
					+ ",\"resultItemId\":" + json.toJson(resultItemId)
					+ ",\"resultHeapId\":" + json.toJson(resultHeapId)
					+ ",\"acquiredByInventory\":" + acquiredByInventory + "}";
			hero.queueNativeWorldMutation("BUY", position, position, cooldownBefore, heroStateBefore, details);
			hero.publishPendingNativeWorldMutation();
		}
	}
}
