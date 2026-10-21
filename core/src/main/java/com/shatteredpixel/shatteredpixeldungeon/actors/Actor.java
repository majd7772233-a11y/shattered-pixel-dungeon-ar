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

package com.shatteredpixel.shatteredpixeldungeon.actors;

import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.Statistics;
import com.shatteredpixel.shatteredpixeldungeon.actors.blobs.Blob;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Buff;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob;
import com.shatteredpixel.shatteredpixeldungeon.levels.VaultLevel;
import com.shatteredpixel.shatteredpixeldungeon.multiplayer.MultiplayerManager;
import com.watabou.noosa.Game;
import com.watabou.utils.Bundlable;
import com.watabou.utils.Bundle;
import com.watabou.utils.SparseArray;

import java.util.HashSet;

public abstract class Actor implements Bundlable {
	
	public static final float TICK	= 1f;

	private float time;

	private int id = 0;

	// True only while a multiplayer snapshot restores native object state into this local actor.
	private boolean preserveRuntimeIdentityOnRestore;

	//default priority values for general actor categories
	//note that some specific actors pick more specific values
	//e.g. a buff acting before all normal buffs might have priority BUFF_PRIO + 1
	protected static final int VFX_PRIO    = 100;   //visual effects take priority
	protected static final int HERO_PRIO   = 0;     //positive is before hero, negative after
	protected static final int BLOB_PRIO   = -10;   //blobs act after hero, before mobs
	protected static final int MOB_PRIO    = -20;   //mobs act between buffs and blobs
	protected static final int BUFF_PRIO   = -30;   //buffs act last in a turn
	private static final int   DEFAULT     = -100;  //if no priority is given, act after all else

	//used to determine what order actors act in if their time is equal. Higher values act earlier.
	protected int actPriority = DEFAULT;

	protected abstract boolean act();

	//Always spends exactly the specified amount of time, regardless of time-influencing factors
	protected void spendConstant( float time ){
		this.time += time;
		//if time is very close to a whole number, round to a whole number to fix errors
		float ex = Math.abs(this.time % 1f);
		if (ex < .001f){
			this.time = Math.round(this.time);
		}
	}

	//sends time, but the amount can be influenced
	protected void spend( float time ) {
		spendConstant( time );
	}

	public void spendToWhole(){
		time = (float)Math.ceil(time);
	}
	
	protected void postpone( float time ) {
		if (this.time < now + time) {
			this.time = now + time;
			//if time is very close to a whole number, round to a whole number to fix errors
			float ex = Math.abs(this.time % 1f);
			if (ex < .001f){
				this.time = Math.round(this.time);
			}
		}
	}
	
	public float cooldown() {
		return time - now;
	}

	public void clearTime() {
		spendConstant(-Actor.now());
		if (this instanceof Char){
			for (Buff b : ((Char) this).buffs()){
				b.spendConstant(-Actor.now());
			}
		}
	}

	public void timeToNow() {
		time = now;
	}

	/** Rebase an authoritative remaining turn delay onto this device's local actor clock. */
	public void restoreMultiplayerCooldown(float remaining) {
		time = now + Math.max(0f, remaining);
	}
	
	protected void diactivate() {
		time = Float.MAX_VALUE;
	}
	
	protected void onAdd() {}
	
	protected void onRemove() {}

	private static final String TIME    = "time";
	private static final String ID      = "id";

	@Override
	public void storeInBundle( Bundle bundle ) {
		bundle.put( TIME, time );
		bundle.put( ID, id );
	}

	/**
	 * Restores native fields from an authoritative bundle while retaining this device's Actor ID.
	 * Snapshot entity identity belongs to the server; scheduler IDs remain local. Keeping the
	 * existing registry entry in place also prevents an incoming buff from stealing this ID.
	 */
	public final void restoreFromBundlePreservingRuntimeIdentity(Bundle bundle) {
		if (bundle == null) throw new IllegalArgumentException("Missing native actor bundle");
		synchronized (Actor.class) {
			int localId = id();
			Actor registered = ids.get(localId);
			if (all.contains(this) && registered != this) {
				throw new IllegalStateException("Local Actor registry lost the actor being restored");
			}
			preserveRuntimeIdentityOnRestore = true;
			try {
				restoreFromBundle(bundle);
			} finally {
				preserveRuntimeIdentityOnRestore = false;
				id = localId;
				if (all.contains(this)) {
					Actor mapped = ids.get(localId);
					if (mapped == null) ids.put(localId, this);
					else if (mapped != this) throw new IllegalStateException("Local Actor ID was reassigned during native restore");
					if (this instanceof Char) chars.add((Char)this);
				}
			}
		}
	}

	@Override
	public void restoreFromBundle( Bundle bundle ) {
		time = bundle.getFloat( TIME );
		if (!preserveRuntimeIdentityOnRestore) {
			int incomingID = bundle.getInt( ID );
			if (Actor.findById(incomingID) == null){
				id = incomingID;
			} else {
				id = nextID++;
			}
		}
	}

	public int id() {
		if (id > 0) {
			return id;
		} else {
			return (id = nextID++);
		}
	}

	// **********************
	// *** Static members ***
	// **********************
	
	private static HashSet<Actor> all = new HashSet<>();
	private static HashSet<Char> chars = new HashSet<>();
	private static volatile Actor current;

	private static SparseArray<Actor> ids = new SparseArray<>();
	private static int nextID = 1;

	private static float now = 0;
	
	public static float now(){
		return now;
	}
	
	public static synchronized void clear() {
		
		now = 0;

		all.clear();
		chars.clear();

		ids.clear();
	}

	public static synchronized void fixTime() {
		
		if (all.isEmpty()) return;
		
		float min = Float.MAX_VALUE;
		for (Actor a : all) {
			if (a.time < min) {
				min = a.time;
			}
		}

		//Only pull everything back by whole numbers
		//So that turns always align with a whole number
		min = (int)min;
		for (Actor a : all) {
			a.time -= min;
		}

		if (Dungeon.hero != null && all.contains( Dungeon.hero ) && !(Dungeon.level instanceof VaultLevel)) {
			Statistics.duration += min;
		}
		now -= min;
	}
	
	public static void init() {
		
		add( Dungeon.hero );
		
		for (Mob mob : Dungeon.level.mobs) {
			add( mob );
		}

		//mobs need to remember their targets after every actor is added
		for (Mob mob : Dungeon.level.mobs) {
			mob.restoreEnemy();
		}
		
		for (Blob blob : Dungeon.level.blobs.values()) {
			add( blob );
		}
		
		current = null;
	}

	private static final String NEXTID = "nextid";

	public static void storeNextID( Bundle bundle){
		bundle.put( NEXTID, nextID );
	}

	public static void restoreNextID( Bundle bundle){
		nextID = bundle.getInt( NEXTID );
	}

	public static void resetNextID(){
		nextID = 1;
	}

	/*protected*/public void next() {
		if (current == this) {
			current = null;
		}
	}

	public static boolean processing(){
		return current != null;
	}

	public static int curActorPriority() {
		return current != null ? current.actPriority : HERO_PRIO;
	}
	
	public static boolean keepActorThreadAlive = true;
	
    /**
     * Shared native-world actors execute on the level publisher only. Other clients retain
     * these actors for collision/FOV and snapshot reconciliation, but do not run a second AI.
     */
    public static boolean isMultiplayerSharedActor(Actor actor) {
        if (actor == null) return false;
        if (actor instanceof Mob || actor instanceof Blob) return true;
        if (actor instanceof Buff && ((Buff) actor).target instanceof Mob) return true;
        // Level.MobSpawner is private; identify its native type without duplicating its implementation.
        return "MobSpawner".equals(actor.getClass().getSimpleName());
    }

    public static boolean shouldSkipMultiplayerSharedActor(Actor actor) {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        return manager.isMultiplayerActive() && isMultiplayerSharedActor(actor)
                && !manager.isLevelPublisher();
    }

	public static void process() {
		
		boolean doNext;
		boolean interrupted = false;

		do {
			
			current = null;
			if (!interrupted && !Game.switchingScene()) {
				float earliest = Float.MAX_VALUE;

				synchronized (Actor.class) {
					for (Actor actor : all) {
						if (shouldSkipMultiplayerSharedActor(actor)) continue;

						//some actors will always go before others if time is equal.
						if (actor.time < earliest ||
								actor.time == earliest && (current == null || actor.actPriority > current.actPriority)) {
							earliest = actor.time;
							current = actor;
						}

					}
				}
			}

			if  (current != null) {

				now = current.time;
				Actor acting = current;

				if (acting instanceof Char && ((Char) acting).sprite != null) {
					// If it's character's turn to act, but its sprite
					// is moving, wait till the movement is over
					try {
						synchronized (((Char)acting).sprite) {
							if (((Char)acting).sprite.isMoving) {
								((Char) acting).sprite.wait();
							}
						}
					} catch (InterruptedException e) {
						interrupted = true;
					}
				}
				
				interrupted = interrupted || Thread.interrupted();
				
				if (interrupted){
					doNext = false;
					current = null;
				} else {
					doNext = acting.act();
					if (MultiplayerManager.getInstance().isMultiplayerActive()
							&& MultiplayerManager.getInstance().isLevelPublisher()
							&& isMultiplayerSharedActor(acting)) {
						MultiplayerManager.getInstance().publishNativeWorldActorResult(acting);
					}
					if (doNext && (Dungeon.hero == null || !Dungeon.hero.isAlive())) {
						doNext = false;
						current = null;
					}
				}
			} else {
				doNext = false;
			}

			if (!doNext){
				synchronized (Thread.currentThread()) {
					
					interrupted = interrupted || Thread.interrupted();
					
					if (interrupted){
						current = null;
						interrupted = false;
					}

					//signals to the gamescene that actor processing is finished for now
					Thread.currentThread().notify();
					
					try {
						Thread.currentThread().wait();
					} catch (InterruptedException e) {
						interrupted = true;
					}
				}
			}

		} while (keepActorThreadAlive);
	}
	
	public static void add( Actor actor ) {
		add( actor, now );
	}
	
	public static void addDelayed( Actor actor, float delay ) {
		add( actor, now + Math.max(delay, 0) );
	}
	
	private static synchronized void add( Actor actor, float time ) {
		
		if (all.contains( actor )) {
			return;
		}

		ids.put( actor.id(),  actor );

		all.add( actor );
		actor.time += time;
		actor.onAdd();
		
		if (actor instanceof Char) {
			Char ch = (Char)actor;
			chars.add( ch );
			for (Buff buff : ch.buffs()) {
				add(buff);
			}
		}
	}
	
	public static synchronized void remove( Actor actor ) {
		
		if (actor != null) {
			all.remove( actor );
			chars.remove( actor );
			actor.onRemove();

			if (actor.id > 0) {
				ids.remove( actor.id );
			}
		}
	}

	//'freezes' a character in time for a specified amount of time
	//USE CAREFULLY! Manipulating time like this is useful for some gameplay effects but is tricky
	public static void delayChar( Char ch, float time ){
		ch.spendConstant(time);
		for (Buff b : ch.buffs()){
			b.spendConstant(time);
		}
	}
	
	public static synchronized Char findChar( int pos ) {
		for (Char ch : chars){
			if (ch.pos == pos)
				return ch;
		}
		return null;
	}

	public static synchronized Actor findById( int id ) {
		return ids.get( id );
	}

	public static synchronized HashSet<Actor> all() {
		return new HashSet<>(all);
	}

	public static synchronized HashSet<Char> chars() { return new HashSet<>(chars); }
}
