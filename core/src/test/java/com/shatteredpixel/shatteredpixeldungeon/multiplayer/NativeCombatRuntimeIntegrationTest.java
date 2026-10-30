package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.badlogic.gdx.ApplicationAdapter;
import com.badlogic.gdx.backends.headless.HeadlessApplication;
import com.badlogic.gdx.backends.headless.HeadlessApplicationConfiguration;
import com.badlogic.gdx.utils.Json;
import com.badlogic.gdx.utils.JsonReader;
import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.blobs.Blob;
import com.shatteredpixel.shatteredpixeldungeon.actors.blobs.Fire;
import com.shatteredpixel.shatteredpixeldungeon.actors.blobs.ToxicGas;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Buff;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Barrier;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Haste;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.HeroClass;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.RemoteHero;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Talent;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Rat;
import com.shatteredpixel.shatteredpixeldungeon.items.Ankh;
import com.shatteredpixel.shatteredpixeldungeon.items.Heap;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.shatteredpixel.shatteredpixeldungeon.levels.Level;
import com.shatteredpixel.shatteredpixeldungeon.levels.Terrain;
import com.shatteredpixel.shatteredpixeldungeon.levels.traps.Trap;
import com.shatteredpixel.shatteredpixeldungeon.levels.traps.FrostTrap;
import com.shatteredpixel.shatteredpixeldungeon.plants.Plant;
import com.shatteredpixel.shatteredpixeldungeon.plants.Firebloom;
import com.watabou.noosa.Game;
import com.shatteredpixel.shatteredpixeldungeon.sprites.CharSprite;
import com.watabou.utils.Bundle;
import com.watabou.utils.Random;
import com.watabou.utils.SparseArray;
import org.junit.After;
import org.junit.AfterClass;
import org.junit.Assert;
import org.junit.Before;
import org.junit.BeforeClass;
import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

public class NativeCombatRuntimeIntegrationTest {

    private static HeadlessApplication application;
    private TestLevel level;
    private Hero hero;

    @BeforeClass
    public static void startHeadlessLibGdx() throws Exception {
        // Mob death awards may initialize debug-only catalog badges in headless integration tests.
        if (Game.version == null) Game.version = "test";
        CountDownLatch ready = new CountDownLatch(1);
        HeadlessApplicationConfiguration config = new HeadlessApplicationConfiguration();
        application = new HeadlessApplication(new ApplicationAdapter() {
            @Override
            public void create() {
                ready.countDown();
            }
        }, config);
        Assert.assertTrue("libGDX headless backend did not initialize",
                ready.await(10, TimeUnit.SECONDS));
    }

    @AfterClass
    public static void stopHeadlessLibGdx() {
        if (application != null) application.exit();
    }

    @Before
    public void setUpNativeWorld() {
        MultiplayerManager.getInstance().endSession();
        Actor.clear();
        Actor.resetNextID();
        Random.resetGenerators();

        Dungeon.challenges = 0;
        Dungeon.mobsToChampion = 0;
        Dungeon.depth = 1;
        Dungeon.branch = 0;
        Dungeon.seed = 123456L;
        Dungeon.hero = null;
        Dungeon.level = null;

        level = new TestLevel();
        Dungeon.level = level;
        hero = new Hero();
        hero.heroClass = HeroClass.WARRIOR;
        Talent.initClassTalents(hero);
        hero.pos = 5 * level.width() + 5;
        hero.HP = hero.HT = 20;
        hero.damageInterrupt = false;
        Arrays.fill(level.heroFOV, false);
        Dungeon.hero = hero;
        Actor.add(hero);
    }

    @After
    public void clearNativeWorld() {
        MultiplayerManager.getInstance().endSession();
        Actor.clear();
        Dungeon.hero = null;
        Dungeon.level = null;
    }

    @Test
    public void multiplayerFallLandingIsDeterministicAndSkipsNativeHazards() {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        manager.startSession("native-fall-landing", "client-publisher", new TestTransport());

        Dungeon.depth = 2;
        TestLevel destination = new TestLevel();
        int first = destination.fallCell(false);
        Assert.assertTrue(first >= 0);
        Assert.assertTrue(destination.passable[first]);
        Assert.assertFalse(destination.pit[first]);

        destination.traps.put(first, new FrostTrap());
        int afterTrap = destination.fallCell(false);
        Assert.assertTrue(afterTrap >= 0);
        Assert.assertNotEquals("A native fall cannot land on a trap", first, afterTrap);

        destination.traps.remove(first);
        Rat blocker = new Rat();
        blocker.pos = afterTrap;
        destination.mobs.add(blocker);
        int afterMob = destination.fallCell(false);
        Assert.assertTrue(afterMob >= 0);
        Assert.assertNotEquals("A native fall cannot land on a destination Mob", afterTrap, afterMob);
        Assert.assertEquals("Same seed and initiating cell produce the same shared fall landing",
                afterMob, destination.fallCell(false));
    }

    @Test
    public void remoteHeroRestoreDoesNotTouchLocalPotionAndScrollKnowledgeHandlers() {
        // Keep this a headless-safe regression: touching Potion/Scroll classes initializes
        // ItemSpriteSheet textures, but restoring a remote Hero must not touch those static
        // run-global handlers at all.
        Bundle remotePotionStatus = new Bundle();
        remotePotionStatus.put("PotionOfHealing_label", "jade");
        remotePotionStatus.put("PotionOfHealing_known", true);
        Bundle remoteScrollStatus = new Bundle();
        remoteScrollStatus.put("ScrollOfRecharging_label", "MANNAZ");
        remoteScrollStatus.put("ScrollOfRecharging_known", true);

        Bundle remoteState = new Bundle();
        remoteState.put("hp", 18);
        remoteState.put("ht", 20);
        remoteState.put("pos", hero.pos + 1);
        remoteState.put("cooldown", 0f);
        remoteState.put("buffCount", 0);
        remoteState.put("potionStatusBundle", remotePotionStatus.toString());
        remoteState.put("scrollStatusBundle", remoteScrollStatus.toString());

        RemoteHero remoteHero = new RemoteHero();
        WorldSnapshot.restoreRemoteHeroState(remoteHero, remoteState.toString());

        Assert.assertEquals(18, remoteHero.HP);
        Assert.assertEquals(20, remoteHero.HT);
        Assert.assertEquals(hero.pos + 1, remoteHero.pos);
        Assert.assertEquals("The local Hero remains the sole owner of run-global item knowledge",
                hero, Dungeon.hero);
    }

    @Test
    public void sharedNativeActorTurnsRunOnlyOnTheLevelPublisher() throws Exception {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        Mob mob = addRat(hero.pos + 1, 18);
        ToxicGas blob = new ToxicGas();
        Buff mobBuff = new Buff();
        mobBuff.target = mob;

        manager.startSession("native-turn-non-publisher", "client-guest", new TestTransport());
        NetworkMessage guestSession = new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"client-guest\",\"sessionToken\":\"guest-turn-token\","
                        + "\"isLevelPublisher\":false,\"sequence\":1}");
        guestSession.sequence = 1L;
        manager.onMessageReceived(guestSession);
        Assert.assertFalse(manager.isLevelPublisher());
        Assert.assertTrue(Actor.shouldSkipMultiplayerSharedActor(mob));
        Assert.assertTrue(Actor.shouldSkipMultiplayerSharedActor(blob));
        Assert.assertTrue(Actor.shouldSkipMultiplayerSharedActor(mobBuff));
        Assert.assertFalse("A local Hero turn must remain local", Actor.shouldSkipMultiplayerSharedActor(hero));
        Assert.assertTrue(Actor.isMultiplayerSharedActor(mob));
        Assert.assertTrue(Actor.isMultiplayerSharedActor(blob));
        Assert.assertTrue(Actor.isMultiplayerSharedActor(mobBuff));

        manager.endSession();
        manager.startSession("native-turn-publisher", "client-publisher", new TestTransport());
        NetworkMessage publisherSession = new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"client-publisher\",\"sessionToken\":\"publisher-turn-token\","
                        + "\"isLevelPublisher\":true,\"sequence\":1}");
        publisherSession.sequence = 1L;
        manager.onMessageReceived(publisherSession);
        Assert.assertTrue(manager.isLevelPublisher());
        Assert.assertFalse("The publisher must execute native Mob.act", Actor.shouldSkipMultiplayerSharedActor(mob));
        Assert.assertFalse("The publisher must execute native Blob.act", Actor.shouldSkipMultiplayerSharedActor(blob));
        Assert.assertFalse("The publisher must execute native Mob buff ticks", Actor.shouldSkipMultiplayerSharedActor(mobBuff));
    }

    @Test
    public void disconnectedRemotePlayerIsRemovedFromNativeActorsAndMobTargets() {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        manager.startSession("native-target-disconnect", "client-publisher", new TestTransport());

        RemotePlayer departing = new RemotePlayer("departing-player", "Departing", "WARRIOR");
        departing.pos = hero.pos + 3;
        departing.hp = departing.ht = 20;
        RemoteHero remoteHero = new RemoteHero();
        remoteHero.pos = departing.pos;
        remoteHero.HP = remoteHero.HT = 20;
        departing.heroInstance = remoteHero;
        manager.addRemotePlayer(departing);
        Actor.add(remoteHero);

        Rat acting = addRat(hero.pos + 1, 18);
        manager.registerServerEntityId(acting.id(), "stable-mob-targeting-player-0001");
        acting.restoreMultiplayerAiState("Hunting", acting.multiplayerBaseSpeed(), acting.defenseSkill,
                Math.max(0f, acting.cooldown()), remoteHero.pos, true, true, "PLAYER", departing.playerId);
        Assert.assertSame(remoteHero, acting.multiplayerEnemy());
        int remoteActorId = remoteHero.id();

        NetworkMessage left = new NetworkMessage(MessageType.PLAYER_LEFT, "{\"playerId\":\"departing-player\"}");
        left.senderId = departing.playerId;
        RemotePlayerActionReceiver.handleNetworkMessage(left);

        Assert.assertNull("Disconnected player must leave the remote-player registry",
                manager.getRemotePlayer(departing.playerId));
        Assert.assertNull("Disconnected Hero must leave the native Actor scheduler",
                Actor.findById(remoteActorId));
        Assert.assertFalse("Disconnected Hero must no longer be eligible for native AI targeting",
                Actor.chars().contains(remoteHero));
        Assert.assertNull("Mob target reference must be cleared immediately", acting.multiplayerEnemy());
        Assert.assertEquals("NONE", acting.multiplayerTargetType());
        Assert.assertEquals("", acting.multiplayerTargetEntityId());
        Assert.assertEquals("Last-known target cell is retained for SPD's native lost-target logic",
                remoteHero.pos, acting.multiplayerTargetCell());
    }

    @Test
    public void nativeMobTurnSnapshotIncludesEffectiveSpeedAndStableEnemyIdentity() throws Exception {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        manager.startSession("native-mob-ai-snapshot", "client-publisher", new TestTransport());
        NetworkMessage session = new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"client-publisher\",\"sessionToken\":\"native-ai-token\","
                        + "\"isLevelPublisher\":true,\"sequence\":1}");
        session.sequence = 1L;
        manager.onMessageReceived(session);
        Assert.assertTrue(manager.isLevelPublisher());

        Rat target = addRat(hero.pos + 1, 20);
        Rat acting = addRat(hero.pos + 2, 20);
        manager.registerServerEntityId(target.id(), "stable-target-mob-0001");
        manager.registerServerEntityId(acting.id(), "stable-acting-mob-0001");
        Buff.affect(acting, com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Cripple.class);
        acting.restoreMultiplayerAiState("Hunting", acting.multiplayerBaseSpeed(), acting.defenseSkill,
                Math.max(0f, acting.cooldown()), target.pos, true, true, "MOB", "stable-target-mob-0001");

        Assert.assertSame(target, acting.multiplayerEnemy());
        Assert.assertEquals("MOB", acting.multiplayerTargetType());
        Assert.assertEquals("stable-target-mob-0001", acting.multiplayerTargetEntityId());
        Assert.assertTrue(acting.multiplayerEffectiveSpeed() > 0f);
        Assert.assertTrue(acting.multiplayerEffectiveSpeed() < acting.multiplayerBaseSpeed());

        String encoded = SPDLevelSnapshot.currentNativeWorldTurnJson(acting, 7L);
        Assert.assertNotNull(encoded);
        JsonValue root = new JsonReader().parse(encoded);
        Assert.assertTrue(root.getBoolean("nativeWorldTick"));
        Assert.assertEquals(7L, root.getLong("nativeWorldTurnCounter"));
        Assert.assertEquals("MOB", root.getString("nativeWorldActorKind"));
        Assert.assertEquals("stable-acting-mob-0001", root.getString("nativeWorldActorEntityId"));
        JsonValue mobRows = root.get("mobs");
        JsonValue nativeRow = null;
        for (JsonValue row = mobRows.child; row != null; row = row.next) {
            if ("stable-acting-mob-0001".equals(row.getString("entityId", ""))) nativeRow = row;
        }
        Assert.assertNotNull(nativeRow);
        Assert.assertTrue(nativeRow.getFloat("effectiveSpeed") > 0f);
        Assert.assertEquals(target.pos, nativeRow.getInt("targetCell"));
        Assert.assertEquals("MOB", nativeRow.getString("targetType"));
        Assert.assertEquals("stable-target-mob-0001", nativeRow.getString("targetEntityId"));
        Assert.assertTrue(nativeRow.getBoolean("enemySeen"));
        Assert.assertTrue(nativeRow.getBoolean("alerted"));
    }

    @Test
    public void nativeMobAiSnapshotPreservesSleepingFleeingAndOutOfSightState() throws Exception {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        manager.startSession("native-ai-state-preservation", "client-publisher", new TestTransport());

        Rat sleeping = addRat(hero.pos + 1, 20);
        Rat fleeing = addRat(hero.pos + 2, 20);
        manager.registerServerEntityId(sleeping.id(), "stable-sleeping-mob-0001");
        manager.registerServerEntityId(fleeing.id(), "stable-fleeing-mob-0001");
        int lastKnownCell = hero.pos + 5;
        sleeping.restoreMultiplayerAiState("Sleeping", sleeping.multiplayerBaseSpeed(),
                sleeping.defenseSkill, 2.0f, -1, false, false, "NONE", "");
        fleeing.restoreMultiplayerAiState("Fleeing", fleeing.multiplayerBaseSpeed(),
                fleeing.defenseSkill, 3.0f, lastKnownCell, false, false, "NONE", "");

        Assert.assertEquals("Sleeping", sleeping.state.getClass().getSimpleName());
        Assert.assertEquals("Fleeing", fleeing.state.getClass().getSimpleName());
        Assert.assertFalse("An out-of-sight mob must not report its target as currently seen",
                fleeing.multiplayerEnemySeen());
        Assert.assertEquals("The native AI keeps its last known cell", lastKnownCell,
                fleeing.multiplayerTargetCell());
        Assert.assertEquals("NONE", fleeing.multiplayerTargetType());

        JsonValue root = new JsonReader().parse(SPDLevelSnapshot.currentNativeWorldTurnJson(sleeping, 9L));
        JsonValue mobRows = root.get("mobs");
        JsonValue sleepingRow = null;
        JsonValue fleeingRow = null;
        for (JsonValue row = mobRows.child; row != null; row = row.next) {
            if ("stable-sleeping-mob-0001".equals(row.getString("entityId", ""))) sleepingRow = row;
            if ("stable-fleeing-mob-0001".equals(row.getString("entityId", ""))) fleeingRow = row;
        }
        Assert.assertNotNull(sleepingRow);
        Assert.assertNotNull(fleeingRow);
        Assert.assertEquals("Sleeping", sleepingRow.getString("state"));
        Assert.assertEquals("Fleeing", fleeingRow.getString("state"));
        JsonValue seenValue = fleeingRow.get("enemySeen");
        Assert.assertTrue(seenValue == null || !seenValue.asBoolean());
        Assert.assertEquals(lastKnownCell, fleeingRow.getInt("targetCell"));
        JsonValue targetTypeValue = fleeingRow.get("targetType");
        Assert.assertTrue(targetTypeValue == null || targetTypeValue.isNull()
                || "NONE".equals(targetTypeValue.asString()));
    }

    @Test
    public void nativeMobTargetRebindWaitsUntilRemoteHeroReplicaExists() {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        manager.startSession("native-player-target-rebind", "client-publisher", new TestTransport());

        TargetingRat mob = (TargetingRat) addMob(new TargetingRat(), hero.pos + 1, 20);
        String entityId = "stable-target-rebind-mob-0001";
        manager.registerServerEntityId(mob.id(), entityId);

        RemotePlayer targetPlayer = new RemotePlayer("remote-target-player", "Remote", "WARRIOR");
        RemoteHero targetHero = new RemoteHero();
        targetHero.pos = hero.pos + 4;
        targetHero.HP = hero.HP;
        targetHero.HT = hero.HT;
        targetPlayer.pos = targetHero.pos;
        targetPlayer.hp = targetHero.HP;
        targetPlayer.ht = targetHero.HT;
        targetPlayer.heroInstance = targetHero;
        manager.addRemotePlayer(targetPlayer);
        Actor.add(targetHero);

        // Capture while the publisher still resolves the target; the wire snapshot must retain
        // the stable player identity even if the receiver constructs its player list later.
        mob.restoreMultiplayerAiState("Hunting", mob.multiplayerBaseSpeed(), mob.defenseSkill,
                1.75f, targetHero.pos, true, true, "PLAYER", targetPlayer.playerId);
        WorldSnapshot snapshot = makeSnapshotWithMob(1L, mob, entityId);
        Assert.assertEquals("PLAYER", snapshot.mobs.get(0).get("targetType"));
        Assert.assertEquals(targetPlayer.playerId, snapshot.mobs.get(0).get("targetEntityId"));

        // Simulate the receiver's earlier Mob pass before it has constructed this player's Hero.
        manager.removeRemotePlayer(targetPlayer.playerId);
        Actor.remove(targetHero);
        WorldSnapshot.restoreNativeMobAiState(snapshot);
        Assert.assertNull("The first pass cannot bind a Player instance that does not yet exist",
                mob.multiplayerEnemy());

        // restoreWorld calls this reconciliation after it has restored all player replicas.
        manager.addRemotePlayer(targetPlayer);
        Actor.add(targetHero);
        WorldSnapshot.restoreNativeMobAiState(snapshot);

        Assert.assertSame("Mob target must resolve after the remote Hero exists in the Actor graph",
                targetHero, mob.multiplayerEnemy());
        Assert.assertEquals("PLAYER", mob.multiplayerTargetType());
        Assert.assertEquals(targetPlayer.playerId, mob.multiplayerTargetEntityId());
        Assert.assertEquals(1.75f, mob.cooldown(), 0.02f);
    }

    @Test
    public void publisherNativeMobAiSelectsVisibleCoopHeroButNonPublisherDoesNot() {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        manager.startSession("native-ai-coop-target-selection", "client-publisher", new TestTransport());
        NetworkMessage publisherSession = new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"client-publisher\",\"sessionToken\":\"ai-owner-token\","
                        + "\"isLevelPublisher\":true,\"sequence\":1}");
        publisherSession.sequence = 1L;
        manager.onMessageReceived(publisherSession);

        hero.pos = 2 * level.width() + 2;
        TargetingRat mob = (TargetingRat) addMob(new TargetingRat(), 16 * level.width() + 16, 20);
        boolean[] fov = new boolean[level.length()];
        Arrays.fill(fov, true);
        mob.setTestFieldOfView(fov);
        RemotePlayer remote = new RemotePlayer("closer-coop-player", "Closer", "WARRIOR");
        RemoteHero remoteHero = new RemoteHero();
        remoteHero.pos = mob.pos + 1;
        remoteHero.HP = remoteHero.HT = 20;
        remote.pos = remoteHero.pos;
        remote.hp = remote.ht = 20;
        remote.heroInstance = remoteHero;
        manager.addRemotePlayer(remote);
        Actor.add(remoteHero);

        Assert.assertSame("Publisher's original SPD AI can select the other living co-op Hero",
                remoteHero, mob.chooseNativeEnemy());
        NetworkMessage guestSession = new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"client-publisher\",\"sessionToken\":\"ai-owner-token\","
                        + "\"isLevelPublisher\":false,\"sequence\":1}");
        guestSession.sequence = 1L;
        manager.onMessageReceived(guestSession);
        Assert.assertTrue(Actor.shouldSkipMultiplayerSharedActor(mob));
        Assert.assertSame("Non-publishers must not select a remote Hero in their independent Mob AI",
                hero, mob.chooseNativeEnemy());
    }

    @Test
    public void nativeMobSpeedAndCooldownRoundTripPreservesHasteModifier() {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        manager.startSession("native-mob-speed-roundtrip", "client-publisher", new TestTransport());
        Rat mob = addRat(hero.pos + 1, 20);
        String entityId = "stable-hasted-mob-0001";
        manager.registerServerEntityId(mob.id(), entityId);
        Buff.affect(mob, Haste.class, Haste.DURATION);
        mob.restoreMultiplayerCooldown(2.75f);
        float expectedSpeed = mob.multiplayerEffectiveSpeed();
        Assert.assertEquals(mob.multiplayerBaseSpeed() * 3f, expectedSpeed, 0.001f);

        WorldSnapshot snapshot = makeSnapshotWithMob(1L, mob, entityId);
        Assert.assertTrue(WorldSnapshot.validateForRestore(snapshot));
        Assert.assertTrue(WorldSnapshot.restoreWorld(snapshot));
        Mob restored = findMobByServerId(manager, entityId);
        Assert.assertNotNull(restored);
        Assert.assertNotNull(restored.buff(Haste.class));
        Assert.assertEquals(expectedSpeed, restored.multiplayerEffectiveSpeed(), 0.02f);
        Assert.assertEquals(2.75f, restored.cooldown(), 0.02f);
    }

    @Test
    public void nativeMobPathingUsesSPDObstacleAndFleeRules() {
        int from = 10 * level.width() + 10;
        int target = from + 2 * level.width() + 2;
        level.setTestTerrain(Terrain.WALL, from + 1, from + level.width());
        PathingRat mob = (PathingRat) addMob(new PathingRat(), from, 20);
        boolean[] fov = new boolean[level.length()];
        Arrays.fill(fov, true);
        mob.setTestFieldOfView(fov);

        Assert.assertTrue(mob.moveToward(target));
        Assert.assertNotEquals(target, mob.pos);
        Assert.assertTrue(level.passable[mob.pos]);
        Assert.assertTrue(level.adjacent(from, mob.pos));
        int oldDistance = level.distance(mob.pos, hero.pos);
        Assert.assertTrue(mob.moveAway(hero.pos));
        Assert.assertTrue(level.distance(mob.pos, hero.pos) > oldDistance);
    }

    @Test
    public void animatedNativeMobAttackPublishesOnlyAfterOriginalAttackCompletes() {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        TestTransport transport = new TestTransport();
        manager.startSession("native-animated-mob-attack", "client-publisher", transport);
        NetworkMessage publisherSession = new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"client-publisher\",\"sessionToken\":\"attack-owner-token\","
                        + "\"isLevelPublisher\":true,\"sequence\":1}");
        publisherSession.sequence = 1L;
        manager.onMessageReceived(publisherSession);
        QueuedAttackRat mob = (QueuedAttackRat) addMob(new QueuedAttackRat(), hero.pos + 1, 20);
        manager.registerServerEntityId(mob.id(), "stable-animated-attacker-0001");
        TestAttackSprite sprite = new TestAttackSprite();
        sprite.ch = mob;
        sprite.visible = true;
        mob.sprite = sprite;

        Assert.assertFalse(mob.beginNativeAttack(hero));
        Assert.assertTrue(mob.multiplayerAttackAwaitingCompletion());
        Assert.assertFalse(Actor.shouldPublishMultiplayerSharedActorResult(mob));
        Assert.assertEquals(0L, transport.sent.stream().filter(m -> m.messageType == MessageType.LEVEL_DATA).count());
        Actor.deferMultiplayerSharedActorResult(mob);

        mob.onAttackComplete();

        Assert.assertFalse(mob.multiplayerAttackAwaitingCompletion());
        Assert.assertTrue(Actor.shouldPublishMultiplayerSharedActorResult(mob));
        Assert.assertEquals(1L, transport.sent.stream().filter(m -> m.messageType == MessageType.LEVEL_DATA).count());
        NetworkMessage turn = transport.sent.stream()
                .filter(m -> m.messageType == MessageType.LEVEL_DATA).findFirst().orElse(null);
        Assert.assertNotNull(turn);
        Assert.assertTrue(new JsonReader().parse(turn.payloadJson).getBoolean("nativeWorldTick"));
    }

    @Test
    public void specialNativeMobCallbackPublishesDeferredEffectOnlyAfterNext() {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        TestTransport transport = new TestTransport();
        manager.startSession("native-special-callback-commit", "client-publisher", transport);
        NetworkMessage publisherSession = new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"client-publisher\",\"sessionToken\":\"special-owner-token\","
                        + "\"isLevelPublisher\":true,\"sequence\":1}");
        publisherSession.sequence = 1L;
        manager.onMessageReceived(publisherSession);

        Rat mob = addRat(hero.pos + 1, 20);
        manager.registerServerEntityId(mob.id(), "stable-special-callback-mob-0001");
        int initialHp = mob.HP;

        // Some SPD special attacks (for example rock projectiles) return false from act()
        // and apply gameplay effects inside a later projectile callback without using doAttack().
        Actor.deferMultiplayerSharedActorResult(mob);
        mob.HP -= 2;
        Assert.assertEquals("A callback-driven Mob turn must not publish before its native callback",
                0L, transport.sent.stream().filter(m -> m.messageType == MessageType.LEVEL_DATA).count());

        // Matches source.next() at the end of the original projectile callback.
        mob.next();

        Assert.assertEquals(1L, transport.sent.stream().filter(m -> m.messageType == MessageType.LEVEL_DATA).count());
        NetworkMessage committed = transport.sent.stream()
                .filter(m -> m.messageType == MessageType.LEVEL_DATA).findFirst().orElse(null);
        Assert.assertNotNull(committed);
        JsonValue root = new JsonReader().parse(committed.payloadJson);
        Assert.assertTrue(root.getBoolean("nativeWorldTick"));
        JsonValue row = null;
        for (JsonValue candidate = root.get("mobs").child; candidate != null; candidate = candidate.next) {
            if ("stable-special-callback-mob-0001".equals(candidate.getString("entityId", ""))) row = candidate;
        }
        Assert.assertNotNull(row);
        Assert.assertEquals(initialHp - 2, row.getInt("hp"));
    }

    @Test
    public void worldSnapshotReconstructsMissingStableMobAndRepeatedRestoreIsIdempotent() throws Exception {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        manager.startSession("snapshot-reconnect", "client-publisher", new TestTransport());
        WorldSnapshot localBaseline = WorldSnapshot.captureLocalRollbackBaseline();
        Assert.assertNotNull("A valid local world must be capturable as first-snapshot rollback; "
                + WorldSnapshot.lastRollbackCaptureDiagnostic(), localBaseline);
        Assert.assertTrue(WorldSnapshot.validateForRestore(localBaseline));
        for (Map<String, Object> localMob : localBaseline.mobs) {
            Assert.assertEquals("Rollback-local mobs must not expose local Actor IDs as server identities",
                    "", localMob.get("entityId"));
        }

        int sharedPosition = hero.pos + 1;
        Rat localWrongMob = addRat(sharedPosition, 5);

        // Represents a native mob in the authoritative snapshot but absent from this client's
        // generated floor. Same class/position as localWrongMob catches unsafe identity fallback.
        Rat authoritativeMob = new Rat();
        authoritativeMob.pos = sharedPosition;
        authoritativeMob.HP = 27;
        authoritativeMob.HT = 30;
        authoritativeMob.defenseSkill = 3;
        WorldSnapshot snapshot = makeSnapshotWithMob(1L, authoritativeMob, "stable-native-mob-0001");
        resizeSnapshotTiles(snapshot, 28, 28);

        Assert.assertTrue("Complete authoritative snapshot must pass structural/native validation",
                WorldSnapshot.validateForRestore(snapshot));
        Assert.assertTrue("Missing native mob must be reconstructed from its serialized bundle",
                WorldSnapshot.restoreWorld(snapshot));

        Mob restored = findMobByServerId(manager, "stable-native-mob-0001");
        Assert.assertNotNull(restored);
        Assert.assertEquals("Authoritative snapshot must resize the locally generated level", 28, level.width());
        Assert.assertEquals(28, level.height());
        Assert.assertNotSame("Stable server identity must not bind to an unrelated same-class local mob",
                localWrongMob, restored);
        Assert.assertEquals(27, restored.HP);
        Assert.assertEquals(30, restored.HT);
        Assert.assertEquals(sharedPosition, restored.pos);
        Assert.assertFalse("The stale local mob must be removed", level.mobs.contains(localWrongMob));
        Assert.assertSame("Restored mob must be registered in the native Actor scheduler",
                restored, Actor.findById(restored.id()));
        Assert.assertEquals(1, level.mobs.size());

        manager.markSnapshotApplied(snapshot.sequence);
        Assert.assertTrue("Reapplying the same snapshot must be idempotent", WorldSnapshot.restoreWorld(snapshot));
        Mob restoredAgain = findMobByServerId(manager, "stable-native-mob-0001");
        Assert.assertSame("Idempotent restoration must reuse the mapped native actor", restored, restoredAgain);
        Assert.assertSame(restored, Actor.findById(restored.id()));
        Assert.assertEquals(1, level.mobs.size());
        Assert.assertEquals(27, restoredAgain.HP);
        Assert.assertEquals(30, restoredAgain.HT);
    }

    @Test
    public void matchedStableMobRestoresSubclassBundleStateWithoutChangingLocalActorId() throws Exception {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        manager.startSession("snapshot-native-subclass-state", "client-publisher", new TestTransport());

        BundledStateRat localMob = (BundledStateRat) addMob(new BundledStateRat(), hero.pos + 1, 9);
        localMob.nativePhase = 3;
        int localActorId = localMob.id();
        String entityId = "stable-native-bundle-state-0001";
        manager.registerServerEntityId(localActorId, entityId);

        BundledStateRat authoritativeMob = new BundledStateRat();
        authoritativeMob.pos = localMob.pos;
        authoritativeMob.HP = 17;
        authoritativeMob.HT = 25;
        authoritativeMob.nativePhase = 91;
        WorldSnapshot snapshot = makeSnapshotWithMob(1L, authoritativeMob, entityId);

        Assert.assertTrue("Complete native bundle must pass snapshot preflight", WorldSnapshot.validateForRestore(snapshot));
        Assert.assertTrue(WorldSnapshot.restoreWorld(snapshot));

        Mob restored = findMobByServerId(manager, entityId);
        Assert.assertSame("A stable mapped entity should keep its local actor instance", localMob, restored);
        Assert.assertEquals("Subclass-specific data from the native Mob bundle must be restored", 91,
                ((BundledStateRat) restored).nativePhase);
        Assert.assertEquals(17, restored.HP);
        Assert.assertEquals(25, restored.HT);
        Assert.assertEquals(localActorId, restored.id());
        Assert.assertSame("Native bundle restore must keep the scheduler registry keyed by the local ID",
                restored, Actor.findById(localActorId));

        ((BundledStateRat) restored).nativePhase = -1;
        Assert.assertTrue("Repeated native restore must reapply the same authoritative subclass state",
                WorldSnapshot.restoreWorld(snapshot));
        Assert.assertSame(localMob, findMobByServerId(manager, entityId));
        Assert.assertEquals(91, ((BundledStateRat) localMob).nativePhase);
        Assert.assertEquals(localActorId, localMob.id());
        Assert.assertSame(localMob, Actor.findById(localActorId));
        Assert.assertEquals(1, level.mobs.size());
    }

    @Test
    public void firstSnapshotFailureAfterResizeRollsBackToLocalNativeWorld() throws Exception {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        manager.startSession("snapshot-first-rollback", "client-publisher", new TestTransport());
        Rat localMob = addRat(hero.pos + 1, 13);
        int oldWidth = level.width();
        int oldHeight = level.height();
        int oldPosition = localMob.pos;
        int oldTerrain = level.map[oldPosition];

        Rat authoritativeMob = new Rat();
        authoritativeMob.pos = hero.pos + 1;
        authoritativeMob.HP = 27;
        authoritativeMob.HT = 30;
        WorldSnapshot incoming = makeSnapshotWithMob(1L, authoritativeMob, "rollback-authoritative-mob-0001");
        resizeSnapshotTiles(incoming, 28, 28);
        Assert.assertTrue("The test must inject failure only after a valid snapshot passes preflight",
                WorldSnapshot.validateForRestore(incoming));

        ((TestLevel) level).failNextFeelingRestore = true;
        try {
            WorldSnapshot.restoreWorld(incoming);
            Assert.fail("Injected native feeling failure should abort and roll back the snapshot");
        } catch (IllegalStateException expected) {
            Assert.assertTrue(expected.getMessage().contains("feeling restore failed"));
        }

        Assert.assertEquals("The original floor width must be restored", oldWidth, level.width());
        Assert.assertEquals(oldHeight, level.height());
        Assert.assertTrue("Original native mob must still exist after rollback", level.mobs.contains(localMob));
        Assert.assertSame(localMob, Actor.findById(localMob.id()));
        Assert.assertEquals(13, localMob.HP);
        Assert.assertEquals(oldPosition, localMob.pos);
        Assert.assertEquals(oldTerrain, level.map[oldPosition]);
        Assert.assertEquals(1, level.mobs.size());
        Assert.assertTrue("The rollback baseline must remain available for the resync path",
                WorldSnapshot.rollbackToLastApplied());
        Assert.assertEquals(oldWidth, level.width());
        Assert.assertEquals(oldHeight, level.height());
        Assert.assertTrue(level.mobs.contains(localMob));
        Assert.assertEquals(1, level.mobs.size());
    }

    @Test
    public void sameSnapshotConvergesAcrossTwoLocallyDifferentGeneratedWorlds() throws Exception {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        manager.startSession("snapshot-two-worlds", "client-publisher", new TestTransport());

        int sharedPosition = hero.pos + 1;
        addRat(sharedPosition, 5);
        addRat(hero.pos + 3, 8);
        Rat authoritativeMob = new Rat();
        authoritativeMob.pos = sharedPosition;
        authoritativeMob.HP = 27;
        authoritativeMob.HT = 30;
        authoritativeMob.defenseSkill = 3;
        WorldSnapshot snapshot = makeSnapshotWithMob(1L, authoritativeMob, "stable-two-world-mob-0001");
        resizeSnapshotTiles(snapshot, 28, 28);

        Assert.assertTrue(WorldSnapshot.validateForRestore(snapshot));
        Assert.assertTrue(WorldSnapshot.restoreWorld(snapshot));
        Mob firstRestored = findMobByServerId(manager, "stable-two-world-mob-0001");
        Assert.assertNotNull(firstRestored);
        Assert.assertEquals(1, level.mobs.size());
        int firstLocalActorId = firstRestored.id();
        String firstSignature = snapshotConvergenceSignature(manager, "stable-two-world-mob-0001");

        // Simulate a reconnect/client with a separately generated level and more local actors.
        clearNativeWorld();
        setUpNativeWorld();
        manager = MultiplayerManager.getInstance();
        manager.startSession("snapshot-two-worlds", "client-publisher", new TestTransport());
        addRat(sharedPosition, 4);
        addRat(hero.pos + 3, 6);
        addRat(hero.pos + 4, 7);

        Assert.assertTrue("The same authoritative snapshot must apply to a different local generation",
                WorldSnapshot.restoreWorld(snapshot));
        Mob secondRestored = findMobByServerId(manager, "stable-two-world-mob-0001");
        Assert.assertNotNull(secondRestored);
        Assert.assertNotSame(firstRestored, secondRestored);
        Assert.assertNotEquals("Local Actor IDs may differ across generated worlds",
                firstLocalActorId, secondRestored.id());
        Assert.assertEquals(1, level.mobs.size());
        Assert.assertEquals(28, level.width());
        Assert.assertEquals(28, level.height());
        Assert.assertEquals("Both independently generated worlds must converge to the same native state",
                firstSignature, snapshotConvergenceSignature(manager, "stable-two-world-mob-0001"));
    }

    @Test
    public void snapshotPreflightRejectsMalformedHeroBuffBeforeChangingLiveWorld() throws Exception {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        manager.startSession("snapshot-preflight", "client-publisher", new TestTransport());
        Rat liveMob = addRat(hero.pos + 1, 11);
        int terrainBefore = level.map[liveMob.pos];
        WorldSnapshot snapshot = makeSnapshotWithMob(1L, null, null);

        Bundle combatBundle = new Bundle();
        hero.storeInBundle(combatBundle);
        Bundle inventoryBundle = new Bundle();
        hero.belongings.storeInBundle(inventoryBundle);
        Bundle invalidHeroState = new Bundle();
        invalidHeroState.put("combatBundle", combatBundle.toString());
        invalidHeroState.put("inventoryBundle", inventoryBundle.toString());
        invalidHeroState.put("hp", hero.HP);
        invalidHeroState.put("ht", hero.HT);
        invalidHeroState.put("pos", hero.pos);
        invalidHeroState.put("shielding", hero.shielding());
        invalidHeroState.put("cooldown", Math.max(0f, hero.cooldown()));
        invalidHeroState.put("buffCount", 1);
        invalidHeroState.put("buff_0", "not-a-native-bundle");
        invalidHeroState.put("buffCooldown_0", 0f);
        snapshot.playerStateJson.put(manager.getLocalPlayerId(), invalidHeroState.toString());

        Assert.assertFalse("Malformed hero buff must fail preflight",
                WorldSnapshot.validateForRestore(snapshot));
        Assert.assertFalse(WorldSnapshot.restoreWorld(snapshot));
        Assert.assertTrue("Failed preflight must leave live actors untouched", level.mobs.contains(liveMob));
        Assert.assertSame(liveMob, Actor.findById(liveMob.id()));
        Assert.assertEquals(terrainBefore, level.map[liveMob.pos]);
        Assert.assertEquals(hero.pos, snapshot.playerPositions.get(manager.getLocalPlayerId()).intValue());
    }

    @Test
    public void worldSnapshotRestoresNativeHeapTrapPlantAndTimedBlobIdempotently() throws Exception {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        manager.startSession("snapshot-native-objects", "client-publisher", new TestTransport());

        int heapPos = hero.pos + 1;
        int trapPos = hero.pos + 2;
        int plantPos = hero.pos + 3;
        int blobPos = hero.pos + 4;
        int stalePos = hero.pos + 5;
        WorldSnapshot snapshot = makeSnapshotWithMob(1L, null, null);

        // Exact native heap order and stack metadata are sent as individual native Item bundles.
        Heap expectedHeap = new Heap();
        expectedHeap.setMultiplayerHeapId("stable-test-heap-0001");
        expectedHeap.pos = heapPos;
        expectedHeap.type = Heap.Type.FOR_SALE;
        expectedHeap.seen = true;
        expectedHeap.haunted = true;
        expectedHeap.hidden = true;
        expectedHeap.autoExplored = true;
        expectedHeap.items.addLast(new Ankh());
        expectedHeap.items.addLast(new Item());
        Map<String, Object> heapRow = new HashMap<>();
        heapRow.put("heapId", expectedHeap.multiplayerHeapId());
        heapRow.put("pos", heapPos);
        heapRow.put("type", expectedHeap.type.name());
        heapRow.put("seen", expectedHeap.seen);
        heapRow.put("haunted", expectedHeap.haunted);
        heapRow.put("hidden", expectedHeap.hidden);
        heapRow.put("autoExplored", expectedHeap.autoExplored);
        ArrayList<Map<String, Object>> itemRows = new ArrayList<>();
        for (com.shatteredpixel.shatteredpixeldungeon.items.Item item : expectedHeap.items) {
            Bundle itemBundle = new Bundle();
            itemBundle.put("item", item);
            Map<String, Object> itemRow = new HashMap<>();
            itemRow.put("itemId", item.multiplayerItemId());
            itemRow.put("className", item.getClass().getName());
            itemRow.put("quantity", item.quantity());
            itemRow.put("level", item.level());
            itemRow.put("cursed", item.cursed);
            itemRow.put("cursedKnown", item.cursedKnown);
            itemRow.put("stackable", item.stackable);
            itemRow.put("serializedBundle", itemBundle.toString());
            itemRows.add(itemRow);
        }
        heapRow.put("items", itemRows);
        snapshot.heaps.clear();
        snapshot.heaps.add(heapRow);

        FrostTrap authoritativeTrap = new FrostTrap();
        authoritativeTrap.pos = trapPos;
        authoritativeTrap.visible = true;
        authoritativeTrap.active = false;
        authoritativeTrap.reclaimed = true;
        authoritativeTrap.color = Trap.VIOLET;
        authoritativeTrap.shape = Trap.DIAMOND;
        Bundle trapBundle = new Bundle();
        trapBundle.put("trap", authoritativeTrap);
        Map<String, Object> trapRow = new HashMap<>();
        trapRow.put("pos", trapPos);
        trapRow.put("serializedBundle", trapBundle.toString());
        trapRow.put("active", authoritativeTrap.active);
        trapRow.put("visible", authoritativeTrap.visible);
        trapRow.put("reclaimed", authoritativeTrap.reclaimed);
        trapRow.put("color", authoritativeTrap.color);
        trapRow.put("shape", authoritativeTrap.shape);
        snapshot.traps.clear();
        snapshot.traps.add(trapRow);

        Firebloom authoritativePlant = new Firebloom();
        authoritativePlant.pos = plantPos;
        Bundle plantBundle = new Bundle();
        plantBundle.put("plant", authoritativePlant);
        Map<String, Object> plantRow = new HashMap<>();
        plantRow.put("pos", plantPos);
        plantRow.put("serializedBundle", plantBundle.toString());
        snapshot.plants.clear();
        snapshot.plants.add(plantRow);

        Fire authoritativeFire = new Fire();
        authoritativeFire.cur = new int[level.length()];
        authoritativeFire.cur[blobPos] = 7;
        authoritativeFire.volume = 7;
        authoritativeFire.restoreMultiplayerCooldown(6.5f);
        Bundle blobBundle = new Bundle();
        blobBundle.put("blob", authoritativeFire);
        int authoritativeBlobActorId = authoritativeFire.id();
        Map<String, Object> blobRow = new HashMap<>();
        blobRow.put("className", Fire.class.getName());
        blobRow.put("serializedBundle", blobBundle.toString());
        blobRow.put("cooldown", 6.5f);
        snapshot.blobs.clear();
        snapshot.blobs.add(blobRow);

        // These local-only objects must be removed because a complete snapshot omits their cells/types.
        Heap staleHeap = new Heap();
        staleHeap.pos = stalePos;
        staleHeap.items.addLast(new Ankh());
        level.heaps.put(stalePos, staleHeap);
        FrostTrap staleTrap = new FrostTrap();
        staleTrap.pos = stalePos;
        level.traps.put(stalePos, staleTrap);
        Firebloom stalePlant = new Firebloom();
        stalePlant.pos = stalePos;
        level.plants.put(stalePos, stalePlant);
        ToxicGas staleGas = new ToxicGas();
        staleGas.cur = new int[level.length()];
        staleGas.cur[stalePos] = 3;
        staleGas.volume = 3;
        level.blobs.put(ToxicGas.class, staleGas);
        Actor.add(staleGas);

        Assert.assertTrue("All native item/trap/plant/blob bundles must be validated before apply: "
                        + WorldSnapshot.lastRollbackCaptureDiagnostic(),
                WorldSnapshot.validateForRestore(snapshot));
        Assert.assertTrue(WorldSnapshot.restoreWorld(snapshot));

        Heap restoredHeap = level.heaps.get(heapPos);
        Assert.assertNotNull(restoredHeap);
        Assert.assertEquals(Heap.Type.FOR_SALE, restoredHeap.type);
        Assert.assertTrue(restoredHeap.seen);
        Assert.assertTrue(restoredHeap.haunted);
        Assert.assertTrue(restoredHeap.hidden);
        Assert.assertTrue(restoredHeap.autoExplored);
        Assert.assertEquals(2, restoredHeap.items.size());
        Assert.assertTrue(restoredHeap.items.getFirst() instanceof Ankh);
        Assert.assertTrue("Native heap item order must survive reconstruction",
                restoredHeap.items.getLast().getClass() == Item.class);

        Trap restoredTrap = level.traps.get(trapPos);
        Assert.assertTrue(restoredTrap instanceof FrostTrap);
        Assert.assertFalse(restoredTrap.active);
        Assert.assertTrue(restoredTrap.visible);
        Assert.assertTrue(restoredTrap.reclaimed);
        Assert.assertEquals(Trap.VIOLET, restoredTrap.color);
        Assert.assertEquals(Trap.DIAMOND, restoredTrap.shape);
        Assert.assertTrue(level.plants.get(plantPos) instanceof Firebloom);
        Assert.assertEquals(plantPos, level.plants.get(plantPos).pos);

        Blob restoredFire = level.blobs.get(Fire.class);
        Assert.assertNotNull(restoredFire);
        Assert.assertEquals(7, restoredFire.volume);
        Assert.assertEquals(7, restoredFire.cur[blobPos]);
        Assert.assertTrue("The restored Blob must have a valid local Actor ID", restoredFire.id() > 0);
        Assert.assertSame(restoredFire, Actor.findById(restoredFire.id()));
        Assert.assertEquals(6.5f, restoredFire.cooldown(), 0.25f);
        Assert.assertNull(level.heaps.get(stalePos));
        Assert.assertNull(level.traps.get(stalePos));
        Assert.assertNull(level.plants.get(stalePos));
        Assert.assertFalse(level.blobs.containsKey(ToxicGas.class));
        Assert.assertNull(Actor.findById(staleGas.id()));

        Assert.assertTrue("A second apply must not duplicate native heaps/traps/plants/blobs",
                WorldSnapshot.restoreWorld(snapshot));
        Assert.assertEquals(1, level.heaps.keyArray().length);
        Assert.assertEquals(1, level.traps.keyArray().length);
        Assert.assertEquals(1, level.plants.keyArray().length);
        Assert.assertEquals(1, level.blobs.size());
        Assert.assertEquals(2, level.heaps.get(heapPos).items.size());
        Assert.assertTrue(level.heaps.get(heapPos).items.getFirst() instanceof Ankh);
        Assert.assertTrue(level.heaps.get(heapPos).items.getLast().getClass() == Item.class);
        Blob restoredFireAgain = level.blobs.get(Fire.class);
        Assert.assertNotNull(restoredFireAgain);
        Assert.assertEquals(7, restoredFireAgain.volume);
        Assert.assertEquals(7, restoredFireAgain.cur[blobPos]);
        Assert.assertEquals(6.5f, restoredFireAgain.cooldown(), 0.25f);
        Assert.assertSame(restoredFireAgain, Actor.findById(restoredFireAgain.id()));
    }

    @Test
    public void nativeHeroTimedBuffRestorePreservesBundleAndDoesNotResurrectExpiredEffects() {
        Haste active = Buff.affect(hero, Haste.class, Haste.DURATION);
        Assert.assertNotNull(active);
        active.restoreMultiplayerCooldown(7.25f);
        String activeHeroState = SPDLevelSnapshot.currentHeroStateJson(hero);
        float expectedCooldown = active.cooldown();

        active.detach();
        Assert.assertNull(hero.buff(Haste.class));
        WorldSnapshot.restoreRemoteHeroState(hero, activeHeroState);
        Haste restored = hero.buff(Haste.class);
        Assert.assertNotNull("The authoritative native timed buff must be restored", restored);
        Assert.assertEquals("The native remaining duration must survive snapshot restoration",
                expectedCooldown, restored.cooldown(), 0.02f);
        int hasteCount = 0;
        for (Buff buff : hero.buffs()) if (buff instanceof Haste) hasteCount++;
        Assert.assertEquals("Only one Haste instance may be attached after restoration", 1, hasteCount);

        restored.detach();
        String expiredHeroState = SPDLevelSnapshot.currentHeroStateJson(hero);
        Assert.assertNull(hero.buff(Haste.class));
        Buff.affect(hero, Haste.class, Haste.DURATION);
        Assert.assertNotNull("The fixture must contain a stale local effect before reconciliation", hero.buff(Haste.class));
        WorldSnapshot.restoreRemoteHeroState(hero, expiredHeroState);
        Assert.assertNull("An effect absent from the trusted snapshot must not be resurrected",
                hero.buff(Haste.class));
        WorldSnapshot.restoreRemoteHeroState(hero, expiredHeroState);
        Assert.assertNull("Repeated restoration of the expired state remains idempotent", hero.buff(Haste.class));
    }

    @Test
    public void originalNativeHeroAttackAppliesRealHitAndDamage() {
        hero.invisible = 1;
        DeterministicRat target = addDeterministicRat(hero.pos + 1, 100);
        target.defenseSkill = 2;

        boolean hit = runNativeAttack(() -> hero.attack(target));

        Assert.assertTrue("The native invisible/surprise hit must hit deterministically", hit);
        Assert.assertTrue("The native attack must lower target HP", target.HP < 100);
        Assert.assertEquals("Ordinary damage must not change max HP", 100, target.HT);
        Assert.assertEquals("Attacking a mob must not damage the attacker", 20, hero.HP);
    }

    @Test
    public void originalNativeHeroAttackPreservesAnActualMiss() {
        hero.invisible = 0;
        EvasiveRat target = addEvasiveRat(hero.pos + 1, 100);

        boolean hit = hero.attack(target);

        Assert.assertFalse("Native infinite evasion must cause a miss", hit);
        Assert.assertEquals("A miss must not lower HP", 100, target.HP);
        Assert.assertEquals("A miss must not change HT", 100, target.HT);
    }

    @Test
    public void originalNativeZeroDamageHitPreservesHpAndMaxHp() {
        hero.invisible = 1;
        ZeroDamageRat target = addZeroDamageRat(hero.pos + 1, 100);

        boolean hit = runNativeAttack(() -> hero.attack(target));

        Assert.assertTrue("The native attack can hit even when native defense reduces damage to zero", hit);
        Assert.assertEquals(100, target.HP);
        Assert.assertEquals(100, target.HT);
    }

    @Test
    public void publisherAttackReplicatesNativeShieldOnlyHit() throws Exception {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        TestTransport transport = new TestTransport();
        manager.startSession("runtime-shield-only", "client-publisher", transport);
        NetworkMessage session = new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"client-publisher\",\"sessionToken\":\"shield-only-token\","
                        + "\"isLevelPublisher\":true,\"sequence\":1,\"seed\":123456,\"depth\":1}");
        session.sequence = 1L;
        manager.onMessageReceived(session);
        Assert.assertTrue(manager.isLevelPublisher());

        hero.invisible = 1;
        DeterministicRat target = addDeterministicRat(hero.pos + 1, 100);
        target.defenseSkill = 0;
        manager.registerServerEntityId(target.id(), "native-shielded-mob-0001");
        Barrier barrier = Buff.affect(target, Barrier.class);
        Assert.assertNotNull("The target must receive its real native shield buff", barrier);
        barrier.setShield(40);
        int hpBefore = target.HP;
        Assert.assertEquals(40, target.shielding());

        boolean hit = runNativeAttack(() -> hero.attack(target));

        Assert.assertTrue("The attack is a native hit even though the shield absorbs all HP damage", hit);
        Assert.assertEquals("Shield-only damage must not be incorrectly subtracted from HP", hpBefore, target.HP);
        Assert.assertEquals(100, target.HT);
        Assert.assertTrue("The native damage pipeline must consume part of the Barrier", target.shielding() < 40);
        NetworkMessage attack = transport.sent.stream()
                .filter(message -> message.messageType == MessageType.ACTION
                        && message.payloadJson != null
                        && message.payloadJson.contains("\"action\":\"ATTACK\""))
                .findFirst().orElse(null);
        Assert.assertNotNull("A shield-only hit must still publish its native combat outcome", attack);
        JsonValue data = new JsonReader().parse(attack.payloadJson).get("data");
        Assert.assertTrue(data.getBoolean("engineHit"));
        Assert.assertEquals(0, data.getInt("damage"));
        Assert.assertEquals(hpBefore, data.getInt("targetHp"));
        Assert.assertEquals(40, data.getInt("targetShieldBefore"));
        Assert.assertEquals(target.shielding(), data.getInt("targetShieldAfter"));
        Assert.assertNotEquals("[]", data.getString("targetBuffs"));
    }

    @Test
    public void originalNativeDefensiveRetaliationUsesTheRealHeroDamagePipeline() {
        hero.invisible = 1;
        RetaliatingRat target = addRetaliatingRat(hero.pos + 1, 100);

        boolean hit = runNativeAttack(() -> hero.attack(target));

        Assert.assertTrue(hit);
        Assert.assertTrue("The primary native hit must damage its target", target.HP < 100);
        Assert.assertTrue("A defensive retaliation must be applied to the actual attacking Hero", hero.HP < 20);
        Assert.assertEquals(20, hero.HT);
    }

    @Test
    public void publisherAttackIncludesNativeRetaliationInAttackerPostState() throws Exception {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        TestTransport transport = new TestTransport();
        manager.startSession("runtime-attacker-retaliation", "client-publisher", transport);
        NetworkMessage session = new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"client-publisher\",\"sessionToken\":\"retaliation-token\","
                        + "\"isLevelPublisher\":true,\"sequence\":1,\"seed\":123456,\"depth\":1}");
        session.sequence = 1L;
        manager.onMessageReceived(session);
        Assert.assertTrue(manager.isLevelPublisher());

        hero.invisible = 1;
        RetaliatingRat target = addRetaliatingRat(hero.pos + 1, 100);
        manager.registerServerEntityId(target.id(), "native-retaliating-mob-0001");
        int hpBefore = hero.HP;

        boolean hit = runNativeAttack(() -> hero.attack(target));

        Assert.assertTrue("The real native attack must trigger the defender's retaliation", hit);
        Assert.assertTrue("Retaliation must run through native Hero.damage", hero.HP < hpBefore);
        NetworkMessage attack = transport.sent.stream()
                .filter(message -> message.messageType == MessageType.ACTION
                        && message.payloadJson != null
                        && message.payloadJson.contains("\"action\":\"ATTACK\""))
                .findFirst().orElse(null);
        Assert.assertNotNull("The native attack result must be sent after all defense procs", attack);
        JsonValue envelope = new JsonReader().parse(attack.payloadJson);
        JsonValue data = envelope.get("data");
        Assert.assertEquals(hpBefore,
                new JsonReader().parse(data.getString("attackerStateBefore")).getInt("hp"));
        JsonValue afterState = new JsonReader().parse(envelope.getString("heroStateJson"));
        Assert.assertEquals("The post-state must include native retaliation damage", hero.HP, afterState.getInt("hp"));
        Assert.assertTrue(afterState.getInt("hp") < hpBefore);
        Assert.assertFalse("Retaliation inside Hero.attack must be part of the attack snapshot, not queued as a future Mob turn",
                target.flushMultiplayerHeroDamageReport(1f));
    }

    @Test
    public void publisherBlessedAnkhRevivalPublishesTheExactNativePostState() throws Exception {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        TestTransport transport = new TestTransport();
        manager.startSession("runtime-blessed-ankh", "client-publisher", transport);
        NetworkMessage session = new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"client-publisher\",\"sessionToken\":\"ankh-token\","
                        + "\"isLevelPublisher\":true,\"sequence\":1,\"seed\":123456,\"depth\":1}");
        session.sequence = 1L;
        manager.onMessageReceived(session);
        Assert.assertTrue(manager.isLevelPublisher());

        hero.HP = 3;
        Ankh ankh = new Ankh();
        ankh.bless();
        hero.belongings.backpack.items.add(ankh);

        hero.damage(100, new Object());

        Assert.assertEquals("A blessed Ankh must preserve the native quarter-health revival", 5, hero.HP);
        Assert.assertFalse("The native revival must consume exactly the blessed Ankh",
                hero.belongings.backpack.items.contains(ankh));
        NetworkMessage revive = transport.sent.stream()
                .filter(message -> message.messageType == MessageType.ACTION
                        && message.payloadJson != null
                        && message.payloadJson.contains("\"action\":\"REVIVE\""))
                .findFirst().orElse(null);
        Assert.assertNotNull("The native blessed-Ankh outcome must be sent to the room authority", revive);
        JsonValue data = new JsonReader().parse(revive.payloadJson).get("data");
        Assert.assertEquals(3, data.getInt("targetHpBefore"));
        Assert.assertEquals(5, data.getInt("targetHp"));
        Assert.assertEquals(1, data.getInt("ankhCountBefore"));
        Assert.assertEquals(0, data.getInt("ankhCountAfter"));
        Assert.assertEquals(1, data.getInt("blessedAnkhCountBefore"));
        Assert.assertEquals(0, data.getInt("blessedAnkhCountAfter"));
    }

    @Test
    public void delegatedNativeMobKillAwardsExperienceToTheRemoteAttacker() throws Exception {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        TestTransport transport = new TestTransport();
        manager.startSession("runtime-delegated-xp", "client-publisher", transport);

        RemoteHero remoteHero = new RemoteHero();
        remoteHero.heroClass = HeroClass.WARRIOR;
        Talent.initClassTalents(remoteHero);
        remoteHero.pos = hero.pos + level.width() + 1;
        remoteHero.HP = remoteHero.HT = 20;
        remoteHero.invisible = 1;
        remoteHero.damageInterrupt = false;
        Actor.add(remoteHero);

        RemotePlayer remoteAttacker = new RemotePlayer("client-attacker", "Attacker", "WARRIOR");
        remoteAttacker.heroInstance = remoteHero;
        remoteAttacker.hp = remoteHero.HP;
        remoteAttacker.ht = remoteHero.HT;
        remoteAttacker.pos = remoteHero.pos;
        manager.addRemotePlayer(remoteAttacker);

        ExperienceRat target = addMob(new ExperienceRat(), remoteHero.pos + 1, 1);
        // Keep the kill log off the headless UI path; this test exercises combat/rewards, not i18n resources.
        level.heroFOV[target.pos] = true;
        target.defenseSkill = 0;
        int publisherExpBefore = hero.exp;
        int attackerExpBefore = remoteHero.exp;

        manager.beginAuthorityCombat("native-delegated-xp-0001");
        boolean hit;
        try {
            hit = runNativeAttack(() -> remoteHero.attack(target));
        } finally {
            manager.endAuthorityCombat();
        }

        Assert.assertTrue("The delegated native attack must hit", hit);
        Assert.assertFalse("The native mob must be killed", target.isAlive());
        Assert.assertTrue("The actual remote attacker must receive native XP", remoteHero.exp > attackerExpBefore);
        Assert.assertEquals("The publisher must not receive another player's kill XP",
                publisherExpBefore, hero.exp);
        Assert.assertNull("The native attacker context must be cleared after the action",
                Hero.getNativeAttackSource());
    }

    @Test
    public void originalNativeMobAttackUsesTheHeroDamagePipeline() {
        hero.invisible = 0;
        Rat attacker = addRat(hero.pos + 1, 8);
        attacker.invisible = 1;

        boolean hit = runNativeAttack(() -> attacker.attack(hero));

        Assert.assertTrue("The native invisible mob attack must hit", hit);
        Assert.assertTrue("Native Mob.attack -> Hero.damage must apply damage", hero.HP < 20);
        Assert.assertEquals(20, hero.HT);
    }


    @Test
    public void nonPublisherDoesNotApplyPeriodicMobDamageOptimistically() throws Exception {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        TestTransport transport = new TestTransport();
        manager.startSession("runtime-non-publisher-periodic", "client-peer", transport);
        NetworkMessage session = new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"client-peer\",\"sessionToken\":\"periodic-peer-token\","
                        + "\"isLevelPublisher\":false,\"sequence\":1,\"seed\":123456,\"depth\":1}");
        session.sequence = 1L;
        manager.onMessageReceived(session);
        Assert.assertFalse(manager.isLevelPublisher());

        Rat target = addRat(hero.pos + 1, 20);
        int hpBefore = target.HP;
        target.damage(4, new PeriodicDamageBuff());

        Assert.assertEquals("Only the publisher may apply shared periodic mob HP changes", hpBefore, target.HP);
        Assert.assertFalse("A non-publisher must not publish an untrusted periodic delta",
                transport.sent.stream().anyMatch(message -> message.messageType == MessageType.ACTION
                        && message.payloadJson != null
                        && message.payloadJson.contains("\"action\":\"SYNC_MOB_STATE\"")));
    }

    @Test
    public void publisherAppliesAndPublishesNativePeriodicMobDamage() throws Exception {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        TestTransport transport = new TestTransport();
        manager.startSession("runtime-publisher-periodic", "client-publisher", transport);
        NetworkMessage session = new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"client-publisher\",\"sessionToken\":\"periodic-publisher-token\","
                        + "\"isLevelPublisher\":true,\"sequence\":1,\"seed\":123456,\"depth\":1}");
        session.sequence = 1L;
        manager.onMessageReceived(session);
        Assert.assertTrue(manager.isLevelPublisher());

        Rat target = addRat(hero.pos + 1, 20);
        manager.registerServerEntityId(target.id(), "periodic-mob-entity-0001");
        int hpBefore = target.HP;
        target.damage(4, new PeriodicDamageBuff());

        Assert.assertTrue("The native publisher must apply the real periodic Mob.damage pipeline", target.HP < hpBefore);
        NetworkMessage report = transport.sent.stream()
                .filter(message -> message.messageType == MessageType.ACTION
                        && message.payloadJson != null
                        && message.payloadJson.contains("\"action\":\"SYNC_MOB_STATE\""))
                .findFirst().orElse(null);
        Assert.assertNotNull("The publisher must persist the native periodic result", report);
        JsonValue data = new JsonReader().parse(report.payloadJson).get("data");
        Assert.assertEquals("periodic-mob-entity-0001", data.getString("entityId"));
        Assert.assertEquals(hpBefore, data.getInt("hpBefore"));
        Assert.assertEquals(target.HP, data.getInt("hpAfter"));
        Assert.assertEquals(20, data.getInt("htAfter"));
        Assert.assertEquals(target.pos, data.getInt("posAfter"));
        Assert.assertTrue(data.getBoolean("engineDamageResult"));
        Assert.assertTrue(data.getString("serializedBundleAfter").length() > 0);
    }

    private static final class PeriodicDamageBuff extends Buff {
    }

    @Test
    public void publisherMobAttackEmitsFullNativeMobToPlayerOutcome() throws Exception {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        TestTransport transport = new TestTransport();
        manager.startSession("runtime-publisher-mob-hit", "client-publisher", transport);
        NetworkMessage session = new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"client-publisher\",\"sessionToken\":\"native-token\","
                        + "\"isLevelPublisher\":true,\"sequence\":1,\"seed\":123456,\"depth\":1}");
        session.sequence = 1L;
        manager.onMessageReceived(session);
        Assert.assertTrue("The SESSION handshake must establish the mob combat publisher", manager.isLevelPublisher());

        Rat attacker = addRat(hero.pos + 1, 8);
        attacker.invisible = 1;
        String stableSourceId = "native-source-mob-0001";
        manager.registerServerEntityId(attacker.id(), stableSourceId);
        int hpBefore = hero.HP;

        boolean hit = runNativeAttack(() -> attacker.attack(hero));
        Assert.assertTrue("The native invisible mob attack must hit", hit);
        Assert.assertTrue("The original SPD Hero.damage pipeline must apply the hit", hero.HP < hpBefore);
        Assert.assertTrue("The mob must flush its queued native outcome after the simulated turn",
                attacker.flushMultiplayerHeroDamageReport(attacker.attackDelay()));

        NetworkMessage report = transport.sent.stream()
                .filter(message -> message.messageType == MessageType.ACTION
                        && message.payloadJson != null
                        && message.payloadJson.contains("\"action\":\"SYNC_HERO_STATE\"")
                        && message.payloadJson.contains("\"sourceType\":\"MOB\""))
                .findFirst().orElse(null);
        Assert.assertNotNull("The publisher must submit a native mob-to-player outcome", report);
        JsonValue envelope = new JsonReader().parse(report.payloadJson);
        JsonValue data = envelope.get("data");
        Assert.assertNotNull(data);
        Assert.assertEquals(stableSourceId, data.getString("sourceEntityId"));
        Assert.assertEquals(hpBefore, data.getInt("targetHpBefore"));
        Assert.assertEquals(hero.HP, data.getInt("targetHp"));
        Assert.assertEquals(20, data.getInt("targetHt"));
        Assert.assertEquals(8, data.getInt("sourceMobHpBefore"));
        Assert.assertEquals(8, data.getInt("sourceMobHpAfter"));
        Assert.assertTrue(data.getBoolean("engineDamageResult"));
        Assert.assertTrue(data.getFloat("sourceActionCost") > 0f);
        Assert.assertTrue(data.getString("sourceMobBundleAfter").length() > 0);
        Assert.assertTrue(data.getString("targetBuffsBefore").length() > 0);
    }

    @Test
    public void targetOwnerExecutesRealNativePvpAttackAndReturnsPendingAuthorityResult() throws Exception {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        TestTransport transport = new TestTransport();
        manager.startSession("runtime-native-pvp", "client-defender", transport);

        hero.alignment = com.shatteredpixel.shatteredpixeldungeon.actors.Char.Alignment.ENEMY;
        com.shatteredpixel.shatteredpixeldungeon.actors.hero.RemoteHero remoteHero =
                new com.shatteredpixel.shatteredpixeldungeon.actors.hero.RemoteHero();
        remoteHero.heroClass = HeroClass.WARRIOR;
        Talent.initClassTalents(remoteHero);
        remoteHero.pos = hero.pos + 1;
        remoteHero.HP = remoteHero.HT = 20;
        remoteHero.invisible = 1;
        remoteHero.damageInterrupt = false;
        Actor.add(remoteHero);

        RemotePlayer remoteAttacker = new RemotePlayer("client-attacker", "Attacker", "WARRIOR");
        remoteAttacker.heroInstance = remoteHero;
        remoteAttacker.hp = remoteHero.HP;
        remoteAttacker.ht = remoteHero.HT;
        remoteAttacker.pos = remoteHero.pos;
        manager.addRemotePlayer(remoteAttacker);

        String requestId = "native-pvp-request-0001";
        int defenderHpBefore = hero.HP;
        manager.beginAuthorityCombat(requestId);
        boolean hit;
        try {
            hit = runNativeAttack(() -> remoteHero.attack(hero));
        } finally {
            manager.endAuthorityCombat();
        }

        Assert.assertTrue("The defender must execute SPD's original native Hero.attack pipeline", hit);
        Assert.assertTrue("The native PvP hit must damage the local defending Hero", hero.HP < defenderHpBefore);
        NetworkMessage report = transport.sent.stream()
                .filter(message -> message.messageType == MessageType.ACTION
                        && requestId.equals(message.requestId)
                        && message.payloadJson != null
                        && message.payloadJson.contains("\"action\":\"SYNC_PLAYER_COMBAT\""))
                .findFirst().orElse(null);
        Assert.assertNotNull("The exact pending authority request must receive a native result", report);

        JsonValue envelope = new JsonReader().parse(report.payloadJson);
        JsonValue data = envelope.get("data");
        Assert.assertNotNull(data);
        Assert.assertEquals(requestId, data.getString("combatRequestId"));
        Assert.assertEquals("PLAYER", data.getString("targetType"));
        Assert.assertEquals("client-defender", data.getString("targetId"));
        Assert.assertEquals(defenderHpBefore, data.getInt("targetHpBefore"));
        Assert.assertEquals(hero.HP, data.getInt("targetHp"));
        Assert.assertTrue(data.getBoolean("engineHit"));
        Assert.assertTrue(data.getFloat("engineActionCost") > 0f);
        Assert.assertTrue(data.getString("targetHeroStateBefore").length() > 0);
        Assert.assertTrue(data.getString("targetHeroStateJson").length() > 0);
        Assert.assertFalse("Authority mode must always be released", manager.isResolvingAuthorityCombat());
    }

    @Test
    public void nativePvpRetaliationConsumesRemoteBlessedAnkhAndReportsRevivedAttacker() throws Exception {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        TestTransport transport = new TestTransport();
        manager.startSession("runtime-native-pvp-ankh", "client-defender", transport);

        Actor.remove(hero);
        FatalRetaliatingHero defender = new FatalRetaliatingHero();
        defender.heroClass = HeroClass.WARRIOR;
        Talent.initClassTalents(defender);
        defender.pos = 5 * level.width() + 5;
        defender.HP = defender.HT = 20;
        defender.damageInterrupt = false;
        defender.alignment = com.shatteredpixel.shatteredpixeldungeon.actors.Char.Alignment.ENEMY;
        defender.fatalRetaliation = true;
        Arrays.fill(level.heroFOV, false);
        hero = defender;
        Dungeon.hero = defender;
        Actor.add(defender);

        com.shatteredpixel.shatteredpixeldungeon.actors.hero.RemoteHero remoteHero =
                new com.shatteredpixel.shatteredpixeldungeon.actors.hero.RemoteHero();
        remoteHero.heroClass = HeroClass.WARRIOR;
        Talent.initClassTalents(remoteHero);
        remoteHero.pos = defender.pos + 1;
        remoteHero.HP = remoteHero.HT = 20;
        remoteHero.invisible = 1;
        remoteHero.damageInterrupt = false;
        com.shatteredpixel.shatteredpixeldungeon.items.Ankh ankh =
                new com.shatteredpixel.shatteredpixeldungeon.items.Ankh();
        ankh.bless();
        remoteHero.belongings.backpack.items.add(ankh);
        Actor.add(remoteHero);

        RemotePlayer remoteAttacker = new RemotePlayer("client-attacker", "Attacker", "WARRIOR");
        remoteAttacker.heroInstance = remoteHero;
        remoteAttacker.hp = remoteHero.HP;
        remoteAttacker.ht = remoteHero.HT;
        remoteAttacker.pos = remoteHero.pos;
        manager.addRemotePlayer(remoteAttacker);

        String requestId = "native-pvp-ankh-request-0001";
        manager.beginAuthorityCombat(requestId);
        boolean hit;
        try {
            hit = runNativeAttack(() -> remoteHero.attack(defender));
        } finally {
            manager.endAuthorityCombat();
        }

        Assert.assertTrue("The native PvP attack must hit before triggering defender retaliation", hit);
        Assert.assertEquals("The original remote Hero death pipeline must restore one quarter HP",
                5, remoteHero.HP);
        Assert.assertEquals("The native blessed Ankh must be consumed exactly once",
                0, remoteHero.belongings.getAllItems(com.shatteredpixel.shatteredpixeldungeon.items.Ankh.class).size());
        Assert.assertNotNull("The native Ankh pipeline must add its invulnerability buff",
                remoteHero.buff(com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Invulnerability.class));

        NetworkMessage report = transport.sent.stream()
                .filter(message -> message.messageType == MessageType.ACTION
                        && requestId.equals(message.requestId)
                        && message.payloadJson != null
                        && message.payloadJson.contains("\"action\":\"SYNC_PLAYER_COMBAT\""))
                .findFirst().orElse(null);
        Assert.assertNotNull("The authority combat result must be emitted after Ankh resolution", report);
        JsonValue envelope = new JsonReader().parse(report.payloadJson);
        String attackerState = envelope.getString("heroStateJson", "");
        Assert.assertFalse("The authority must serialize the post-Ankh attacker state", attackerState.isEmpty());
        JsonValue parsedAttacker = new JsonReader().parse(attackerState);
        Assert.assertEquals(5, parsedAttacker.getInt("hp"));
        Assert.assertEquals(0, parsedAttacker.getInt("ankhCount"));
        Assert.assertFalse("Authority mode must always be released", manager.isResolvingAuthorityCombat());
    }

    @Test
    public void publisherAttackCapturesNativeSecondaryMobDamageProc() throws Exception {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        TestTransport transport = new TestTransport();
        manager.startSession("runtime-native-secondary-proc", "client-publisher", transport);
        NetworkMessage session = new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"client-publisher\",\"sessionToken\":\"secondary-proc-token\","
                        + "\"isLevelPublisher\":true,\"sequence\":1,\"seed\":123456,\"depth\":1}");
        session.sequence = 1L;
        manager.onMessageReceived(session);
        Assert.assertTrue(manager.isLevelPublisher());

        hero.invisible = 1;
        CollateralRat target = addMob(new CollateralRat(), hero.pos + 1, 100);
        target.defenseSkill = 0;
        Rat secondary = addRat(hero.pos + 2, 20);
        target.secondary = secondary;
        manager.registerServerEntityId(target.id(), "native-secondary-proc-target-0001");
        manager.registerServerEntityId(secondary.id(), "native-secondary-proc-mob-0001");

        boolean hit = runNativeAttack(() -> hero.attack(target));

        Assert.assertTrue("The native primary attack must hit", hit);
        Assert.assertEquals("The defender's native proc must damage the adjacent secondary mob", 17, secondary.HP);
        NetworkMessage attack = transport.sent.stream()
                .filter(message -> message.messageType == MessageType.ACTION
                        && message.payloadJson != null
                        && message.payloadJson.contains("\"action\":\"ATTACK\""))
                .findFirst().orElse(null);
        Assert.assertNotNull(attack);
        JsonValue data = new JsonReader().parse(attack.payloadJson).get("data");
        JsonValue secondaryPayload = new JsonReader().parse(data.getString("secondaryMobDeltas"));
        JsonValue completeFlag = secondaryPayload.get("complete");
        Assert.assertNotNull("Native secondary payload must contain the completeness flag: " + secondaryPayload,
                completeFlag);
        Assert.assertTrue("A fully identified native secondary mutation must not be marked incomplete",
                completeFlag.asBoolean());
        JsonValue deltas = secondaryPayload.get("deltas");
        Assert.assertEquals(1, deltas.size);
        Assert.assertEquals("native-secondary-proc-mob-0001", deltas.get(0).getString("entityId"));
        Assert.assertEquals(20, deltas.get(0).getInt("hpBefore"));
        Assert.assertEquals(20, deltas.get(0).getInt("htBefore"));
        Assert.assertEquals(0, deltas.get(0).getInt("shieldBefore"));
        Assert.assertEquals(17, deltas.get(0).getInt("hpAfter"));
        Assert.assertEquals(20, deltas.get(0).getInt("htAfter"));
        Assert.assertEquals(0, deltas.get(0).getInt("shieldAfter"));
        Assert.assertTrue("The secondary delta must preserve the complete native mob bundle",
                deltas.get(0).getString("serializedBundleAfter").length() > 0);
    }

    @Test
    public void nativeSecondaryMobDeltaRetainsStableIdentityAndFullBundle() {
        Rat directTarget = addRat(hero.pos + 1, 100);
        Rat secondary = addRat(hero.pos + 2, 20);
        MultiplayerManager manager = MultiplayerManager.getInstance();
        manager.registerServerEntityId(directTarget.id(), "native-mob-target-0001");
        manager.registerServerEntityId(secondary.id(), "native-mob-secondary-0001");

        java.util.Map<Integer, NativeMobCombatDelta.State> before =
                NativeMobCombatDelta.capture(directTarget);
        secondary.HP -= 3;
        String json = NativeMobCombatDelta.changedSince(before, directTarget);
        NativeMobCombatDelta.Payload payload = new Json().fromJson(NativeMobCombatDelta.Payload.class, json);

        Assert.assertTrue("A single tracked native mutation should remain a complete delta", payload.complete);
        Assert.assertEquals(1, payload.deltas.size());
        NativeMobCombatDelta.Delta delta = payload.deltas.get(0);
        Assert.assertEquals("native-mob-secondary-0001", delta.entityId);
        Assert.assertEquals(20, delta.hpBefore);
        Assert.assertEquals(17, delta.hpAfter);
        Assert.assertEquals(20, delta.htAfter);
        Assert.assertNotNull(delta.serializedBundleAfter);
        Assert.assertFalse(delta.serializedBundleAfter.isEmpty());
    }

    @Test
    public void authoritativeMobDeathRemovesReplicaWithoutCallingDeathOrLootPipeline() throws Exception {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        TestTransport transport = new TestTransport();
        manager.startSession("runtime-death", "client-a", transport);

        DeathCountingRat target = addDeathCountingRat(hero.pos + 1, 100);
        String stableId = "stable-native-death-0001";
        manager.registerServerEntityId(target.id(), stableId);
        int heapsBefore = level.heaps.valueList().size();

        String event = "[{\"sequence\":2,\"depth\":1,\"eventType\":\"PLAYER_ATTACKED\",\"action\":{"
                + "\"attackerId\":\"client-a\",\"targetId\":\"" + stableId + "\","
                + "\"targetType\":\"MOB\",\"targetHp\":0,\"targetHt\":100,"
                + "\"targetPosAfter\":" + target.pos + ",\"targetBuffs\":\"[]\","
                + "\"damage\":100,\"hit\":true,\"engineResolved\":true}}]";
        routeEventBatch(event, 2L);

        Assert.assertFalse("Authoritative death must remove the local mob replica", level.mobs.contains(target));
        Assert.assertEquals("A remote death must not invoke the local native death/reward pipeline", 0, target.deathCalls);
        Assert.assertEquals("Loot is restored from the authority snapshot, not rolled again here", heapsBefore, level.heaps.valueList().size());
        Assert.assertNull("The stale Actor-to-server identity mapping must be removed", manager.getServerEntityId(target.id()));
        Assert.assertTrue("A death tombstone must request a full loot/world resync",
                transport.sent.stream().anyMatch(message -> message.messageType == MessageType.RESYNC));
    }

    @Test
    public void discardedReactiveMobDamageRequestsResyncWithoutApplyingUntrustedScalarState() throws Exception {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        TestTransport transport = new TestTransport();
        manager.startSession("runtime-reactive-resync", "client-victim", transport);

        Rat source = addRat(hero.pos + 1, 8);
        source.HP = 8;
        manager.registerServerEntityId(source.id(), "stable-reactive-source-0001");
        int hpBeforeEvent = source.HP;

        String event = "[{\"sequence\":3,\"depth\":1,\"eventType\":\"PLAYER_DAMAGED\",\"action\":{"
                + "\"targetId\":\"client-victim\",\"targetPlayerId\":\"client-victim\",\"targetType\":\"PLAYER\","
                + "\"targetHp\":18,\"targetHt\":20,\"targetState\":\"ALIVE\","
                + "\"sourceType\":\"MOB\",\"sourceEntityId\":\"stable-reactive-source-0001\","
                + "\"sourceMobHpBefore\":8,\"sourceMobHtBefore\":8,\"sourceMobHpAfter\":2,"
                + "\"sourceMobHtAfter\":8,\"sourceMobShieldBefore\":0,\"sourceMobShieldAfter\":0,"
                + "\"sourceMobPosBefore\":" + source.pos + ",\"sourceMobPosAfter\":" + source.pos + ","
                + "\"sourceMobDamage\":6,\"sourceMobBuffsBefore\":\"[]\",\"sourceMobBuffs\":\"[]\","
                + "\"sourceMobResyncRequired\":true,\"sourceMobBundleAfter\":null}}]";
        routeEventBatch(event, 3L);

        Assert.assertEquals("Untrusted non-publisher source Mob deltas must not be optimistically applied", hpBeforeEvent, source.HP);
        Assert.assertTrue("A discarded reactive state must request publisher snapshot reconciliation",
                transport.sent.stream().anyMatch(message -> message.messageType == MessageType.RESYNC));
    }

    @Test
    public void staleCombatEventCannotRollBackNewerMobState() throws Exception {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        TestTransport transport = new TestTransport();
        manager.startSession("runtime-stale-event", "client-a", transport);

        Rat target = addRat(hero.pos + 1, 100);
        String stableId = "stable-sequence-mob-0001";
        manager.registerServerEntityId(target.id(), stableId);

        String newerEvent = "[{\"sequence\":2,\"depth\":1,\"eventType\":\"PLAYER_ATTACKED\",\"action\":{"
                + "\"attackerId\":\"client-a\",\"targetId\":\"" + stableId + "\","
                + "\"targetType\":\"MOB\",\"targetHp\":60,\"targetHt\":100,"
                + "\"targetPosAfter\":" + target.pos + ",\"damage\":40,\"hit\":true,\"engineResolved\":true}}]";
        routeEventBatch(newerEvent, 2L);
        Assert.assertEquals(60, target.HP);
        Assert.assertEquals(2L, manager.getLastSequence());

        String staleEvent = "[{\"sequence\":1,\"depth\":1,\"eventType\":\"PLAYER_ATTACKED\",\"action\":{"
                + "\"attackerId\":\"client-a\",\"targetId\":\"" + stableId + "\","
                + "\"targetType\":\"MOB\",\"targetHp\":90,\"targetHt\":100,"
                + "\"targetPosAfter\":" + target.pos + ",\"damage\":10,\"hit\":true,\"engineResolved\":true}}]";
        routeEventBatch(staleEvent, 1L);

        Assert.assertEquals("An older combat event must not restore stale HP", 60, target.HP);
        Assert.assertEquals("Sequence tracking must remain monotonic", 2L, manager.getLastSequence());
    }

    @Test
    public void acceptedCombatEventConvergesAcrossClientsWithDifferentLocalActorIds() throws Exception {
        final String stableMobId = "stable-native-mob-0001";
        MultiplayerManager manager = MultiplayerManager.getInstance();

        TestTransport transportA = new TestTransport();
        manager.startSession("runtime-convergence", "client-a", transportA);
        DeterministicRat targetA = addDeterministicRat(hero.pos + 1, 100);
        targetA.defenseSkill = 2;
        hero.invisible = 1;
        int localActorIdA = targetA.id();
        manager.registerServerEntityId(localActorIdA, stableMobId);

        // Generate the event from the actual SPD Java attack pipeline, not a fabricated
        // scalar test value. Then feed that accepted outcome to both client states.
        boolean hit = runNativeAttack(() -> hero.attack(targetA));
        Assert.assertTrue("The deterministic native attack must hit", hit);
        NetworkMessage attackReport = transportA.sent.stream()
                .filter(message -> message.messageType == MessageType.ACTION
                        && message.payloadJson != null && message.payloadJson.contains("\"action\":\"ATTACK\""))
                .findFirst().orElse(null);
        Assert.assertNotNull("Native Hero.attack must emit its multiplayer attack contract", attackReport);
        JsonValue report = new JsonReader().parse(attackReport.payloadJson);
        JsonValue data = report.get("data");
        Assert.assertNotNull(data);
        int resolvedHp = data.getInt("targetHp");
        int resolvedHt = data.getInt("targetHt");
        int resolvedPos = data.getInt("targetPosAfter");
        int resolvedDamage = data.getInt("damage");
        boolean resolvedHit = data.getBoolean("engineHit");
        String resolvedBuffs = data.getString("targetBuffs", "[]");

        String event = "[{\"sequence\":2,\"depth\":1,\"eventType\":\"PLAYER_ATTACKED\",\"action\":{"
                + "\"attackerId\":\"client-a\",\"targetId\":\"" + stableMobId + "\","
                + "\"targetType\":\"MOB\",\"targetHp\":" + resolvedHp
                + ",\"targetHt\":" + resolvedHt + ",\"targetPosAfter\":" + resolvedPos
                + ",\"targetBuffs\":" + new Json().toJson(resolvedBuffs)
                + ",\"damage\":" + resolvedDamage + ",\"hit\":" + resolvedHit
                + ",\"engineResolved\":true}}]";
        routeEventBatch(event, 2L);
        Assert.assertEquals(resolvedHp, targetA.HP);
        Assert.assertEquals(resolvedHt, targetA.HT);

        manager.endSession();
        Actor.clear();
        Actor.resetNextID();
        Random.resetGenerators();
        Dungeon.hero = null;
        Dungeon.level = null;

        level = new TestLevel();
        Dungeon.level = level;
        hero = new Hero();
        hero.heroClass = HeroClass.WARRIOR;
        Talent.initClassTalents(hero);
        hero.pos = 5 * level.width() + 5;
        hero.HP = hero.HT = 20;
        hero.damageInterrupt = false;
        Arrays.fill(level.heroFOV, false);
        Dungeon.hero = hero;
        Actor.add(hero);

        // Insert an unrelated local mob first: this device's Actor.id for the target differs,
        // even though the server entity ID and authoritative cell are identical.
        addRat(hero.pos + 2, 8);
        Rat targetB = addRat(hero.pos + 1, 100);
        int localActorIdB = targetB.id();
        Assert.assertNotEquals("The test must exercise distinct device-local actor IDs", localActorIdA, localActorIdB);

        TestTransport transportB = new TestTransport();
        manager.startSession("runtime-convergence", "client-b", transportB);
        manager.registerServerEntityId(localActorIdB, stableMobId);
        routeEventBatch(event, 2L);

        Assert.assertEquals("Client B must resolve by stable server ID, not Actor.id()", resolvedHp, targetB.HP);
        Assert.assertEquals(resolvedHt, targetB.HT);
        Assert.assertEquals(resolvedPos, targetB.pos);
        Assert.assertEquals(2L, manager.getLastSequence());
    }

    private static void routeEventBatch(String payload, long sequence) throws Exception {
        NetworkMessage message = new NetworkMessage(MessageType.EVENT_BATCH, payload);
        message.sequence = sequence;
        message.senderId = "SERVER";
        java.lang.reflect.Method handler = MessageRouter.class.getDeclaredMethod(
                "handleEventBatchMessage", NetworkMessage.class);
        handler.setAccessible(true);
        handler.invoke(null, message);
    }

    private static boolean runNativeAttack(java.util.function.BooleanSupplier operation) {
        try {
            return operation.getAsBoolean();
        } catch (RuntimeException | Error failure) {
            failure.printStackTrace(System.err);
            throw failure;
        }
    }

    private ZeroDamageRat addZeroDamageRat(int pos, int hp) {
        return addMob(new ZeroDamageRat(), pos, hp);
    }

    private RetaliatingRat addRetaliatingRat(int pos, int hp) {
        return addMob(new RetaliatingRat(), pos, hp);
    }

    private DeathCountingRat addDeathCountingRat(int pos, int hp) {
        return addMob(new DeathCountingRat(), pos, hp);
    }

    private Rat addRat(int pos, int hp) {
        return addMob(new Rat(), pos, hp);
    }

    private DeterministicRat addDeterministicRat(int pos, int hp) {
        return addMob(new DeterministicRat(), pos, hp);
    }

    private EvasiveRat addEvasiveRat(int pos, int hp) {
        return addMob(new EvasiveRat(), pos, hp);
    }

    private <T extends Rat> T addMob(T rat, int pos, int hp) {
        rat.pos = pos;
        rat.HP = rat.HT = hp;
        level.mobs.add(rat);
        Actor.add(rat);
        rat.HP = rat.HT = hp;
        return rat;
    }

    private static final class DeathCountingRat extends Rat {
        int deathCalls;

        @Override
        public void die(Object cause) {
            deathCalls++;
            super.die(cause);
        }
    }

    private static final class CollateralRat extends Rat {
        Rat secondary;

        @Override
        public int defenseSkill(com.shatteredpixel.shatteredpixeldungeon.actors.Char enemy) {
            return 0;
        }

        @Override
        public int drRoll() {
            return 0;
        }

        @Override
        public int defenseProc(com.shatteredpixel.shatteredpixeldungeon.actors.Char enemy, int damage) {
            int nativeDamage = super.defenseProc(enemy, damage);
            if (damage > 0 && secondary != null && secondary.isAlive()) {
                // Exercise a secondary native Char.damage proc during the primary attack,
                // exactly when Hero.attack captures its shared-mob before/after state.
                secondary.damage(3, this);
            }
            return nativeDamage;
        }
    }

    public static final class BundledStateRat extends Rat {
        int nativePhase;

        @Override
        public void storeInBundle(Bundle bundle) {
            super.storeInBundle(bundle);
            bundle.put("multiplayerNativePhase", nativePhase);
        }

        @Override
        public void restoreFromBundle(Bundle bundle) {
            super.restoreFromBundle(bundle);
            if (bundle.contains("multiplayerNativePhase")) {
                nativePhase = bundle.getInt("multiplayerNativePhase");
            }
        }
    }

    private static final class DeterministicRat extends Rat {
        @Override
        public int drRoll() {
            return 0;
        }
    }

    private static final class ExperienceRat extends Rat {
        {
            lootChance = 0f;
        }

        @Override
        public int defenseSkill(com.shatteredpixel.shatteredpixeldungeon.actors.Char enemy) {
            return 0;
        }

        @Override
        public int drRoll() {
            return 0;
        }
    }

    private static final class ZeroDamageRat extends Rat {
        @Override
        public int defenseSkill(com.shatteredpixel.shatteredpixeldungeon.actors.Char enemy) {
            return 0;
        }

        @Override
        public int drRoll() {
            return 0;
        }

        @Override
        public int defenseProc(com.shatteredpixel.shatteredpixeldungeon.actors.Char enemy, int damage) {
            return 0;
        }
    }

    private static final class FatalRetaliatingHero extends Hero {
        boolean fatalRetaliation;

        @Override
        public int defenseSkill(com.shatteredpixel.shatteredpixeldungeon.actors.Char enemy) {
            return 0;
        }

        @Override
        public int drRoll() {
            return 0;
        }

        @Override
        public int defenseProc(com.shatteredpixel.shatteredpixeldungeon.actors.Char enemy, int damage) {
            int result = super.defenseProc(enemy, damage);
            if (fatalRetaliation && damage > 0
                    && enemy instanceof com.shatteredpixel.shatteredpixeldungeon.actors.hero.RemoteHero) {
                enemy.damage(100, this);
            }
            return result;
        }
    }

    private static final class RetaliatingRat extends Rat {
        @Override
        public int defenseSkill(com.shatteredpixel.shatteredpixeldungeon.actors.Char enemy) {
            return 0;
        }

        @Override
        public int drRoll() {
            return 0;
        }

        @Override
        public int defenseProc(com.shatteredpixel.shatteredpixeldungeon.actors.Char enemy, int damage) {
            if (damage > 0 && enemy.isAlive()) enemy.damage(2, this);
            return damage;
        }
    }

    private static final class EvasiveRat extends Rat {
        @Override
        public int defenseSkill(com.shatteredpixel.shatteredpixeldungeon.actors.Char enemy) {
            return com.shatteredpixel.shatteredpixeldungeon.actors.Char.INFINITE_EVASION;
        }

        @Override
        public int drRoll() {
            return 0;
        }
    }

    private static final class TargetingRat extends Rat {
        void setTestFieldOfView(boolean[] fov) { fieldOfView = fov; }
        Char chooseNativeEnemy() { return chooseEnemy(); }
    }

    private static final class PathingRat extends Rat {
        void setTestFieldOfView(boolean[] fov) { fieldOfView = fov; }
        boolean moveToward(int target) { return getCloser(target); }
        boolean moveAway(int target) { return getFurther(target); }
        @Override public void move(int step, boolean travelling) { pos = step; }
    }

    private static final class QueuedAttackRat extends Rat {
        boolean beginNativeAttack(Char target) { enemy = target; return doAttack(target); }

        @Override
        public boolean attack(Char target, float damageMultiplier, float damageBonus, float accuracyMultiplier) {
            // Native completion is exercised without loading graphics assets in the headless JVM test.
            return false;
        }
    }

    private static final class TestAttackSprite extends CharSprite {
        @Override public void attack(int cell) {
            // The test invokes native completion manually; no render-thread animation is needed.
        }
    }

    private static final class TestTransport implements NetworkTransport {
        private boolean connected;
        final java.util.List<NetworkMessage> sent = new ArrayList<>();

        @Override public void connect(String endpoint, TransportCallback callback) {
            connected = true;
            if (callback != null) callback.onConnected();
        }
        @Override public void send(NetworkMessage message) { sent.add(message); }
        @Override public void disconnect() { connected = false; }
        @Override public boolean isConnected() { return connected; }
        @Override public String getTransportType() { return "TEST"; }
    }

    private WorldSnapshot makeSnapshotWithMob(long sequence, Mob authoritativeMob, String entityId) {
        WorldSnapshot snapshot = new WorldSnapshot(sequence, Dungeon.depth, Dungeon.seedCurDepth());
        snapshot.completeWorldSnapshot = true;
        snapshot.branch = Dungeon.branch;
        snapshot.levelWidth = level.width();
        snapshot.levelHeight = level.height();
        snapshot.entrancePos = level.entrance();
        snapshot.exitPos = level.exit();
        snapshot.levelLocked = level.locked;
        snapshot.levelFeeling = level.multiplayerFeelingName();
        snapshot.nativeLevelMetadataBundle = level.multiplayerMetadataBundle();
        snapshot.visitedPositions.clear();
        snapshot.mappedPositions.clear();
        for (int pos = 0; pos < level.length(); pos++) {
            if (level.visited[pos]) snapshot.visitedPositions.add(pos);
            if (level.mapped[pos]) snapshot.mappedPositions.add(pos);
            Map<String, Object> tile = new HashMap<>();
            tile.put("pos", pos);
            tile.put("terrain", level.map[pos]);
            tile.put("passable", level.passable[pos] ? 1 : 0);
            tile.put("solid", level.solid[pos] ? 1 : 0);
            tile.put("pit", level.pit[pos] ? 1 : 0);
            tile.put("losBlocking", level.losBlocking[pos] ? 1 : 0);
            tile.put("flammable", level.flamable[pos] ? 1 : 0);
            tile.put("secret", level.secret[pos] ? 1 : 0);
            tile.put("avoid", level.avoid[pos] ? 1 : 0);
            tile.put("water", level.water[pos] ? 1 : 0);
            tile.put("discoverable", level.discoverable[pos] ? 1 : 0);
            tile.put("openSpace", level.openSpace[pos] ? 1 : 0);
            snapshot.tiles.add(tile);
        }
        String localPlayerId = MultiplayerManager.getInstance().getLocalPlayerId();
        snapshot.playerPositions.put(localPlayerId, hero.pos);
        snapshot.playerHp.put(localPlayerId, hero.HP);
        snapshot.playerHt.put(localPlayerId, hero.HT);
        snapshot.playerClasses.put(localPlayerId, hero.heroClass.name());
        snapshot.playerStateJson.put(localPlayerId, SPDLevelSnapshot.currentHeroStateJson());
        snapshot.mobs.clear();
        if (authoritativeMob != null) snapshot.mobs.add(snapshotMob(authoritativeMob, entityId));
        return snapshot;
    }

    private void resizeSnapshotTiles(WorldSnapshot snapshot, int width, int height) {
        int oldWidth = snapshot.levelWidth;
        int oldHeight = snapshot.levelHeight;
        Assert.assertTrue(width > 0 && width <= oldWidth);
        Assert.assertTrue(height > 0 && height <= oldHeight);
        ArrayList<Map<String, Object>> resized = new ArrayList<>();
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                Map<String, Object> tile = new HashMap<>(snapshot.tiles.get(y * oldWidth + x));
                tile.put("pos", y * width + x);
                if (x == 0 || y == 0 || x == width - 1 || y == height - 1) {
                    tile.put("passable", 0);
                    tile.put("avoid", 0);
                    tile.put("solid", 1);
                    tile.put("losBlocking", 1);
                    tile.put("openSpace", 0);
                }
                resized.add(tile);
            }
        }
        snapshot.levelWidth = width;
        snapshot.levelHeight = height;
        snapshot.tiles = resized;
    }

    private Map<String, Object> snapshotMob(Mob mob, String entityId) {
        Map<String, Object> row = new HashMap<>();
        row.put("mobId", mob.id());
        row.put("entityId", entityId);
        row.put("name", mob.getClass().getSimpleName());
        row.put("pos", mob.pos);
        row.put("hp", mob.HP);
        row.put("ht", mob.HT);
        row.put("shielding", Math.max(0, mob.shielding()));
        row.put("state", mob.state == null ? "" : mob.state.getClass().getSimpleName());
        row.put("serializedBundle", SPDLevelSnapshot.currentMobBundle(mob));
        row.put("defenseSkill", mob.defenseSkill);
        row.put("baseSpeed", mob.multiplayerBaseSpeed());
        row.put("effectiveSpeed", mob.multiplayerEffectiveSpeed());
        row.put("cooldown", Math.max(0f, mob.cooldown()));
        row.put("targetCell", mob.multiplayerTargetCell());
        row.put("targetType", mob.multiplayerTargetType());
        row.put("targetEntityId", mob.multiplayerTargetEntityId());
        row.put("enemySeen", mob.multiplayerEnemySeen());
        row.put("alerted", mob.multiplayerAlerted());
        ArrayList<Map<String, Object>> buffs = new ArrayList<>();
        for (Buff buff : mob.buffs()) {
            Bundle bundle = new Bundle();
            bundle.put("buff", buff);
            Map<String, Object> buffRow = new HashMap<>();
            buffRow.put("serializedBundle", bundle.toString());
            buffRow.put("cooldown", Math.max(0f, buff.cooldown()));
            buffs.add(buffRow);
        }
        row.put("buffs", buffs);
        return row;
    }

    private String snapshotConvergenceSignature(MultiplayerManager manager, String entityId) {
        Mob mob = findMobByServerId(manager, entityId);
        Assert.assertNotNull(mob);
        return level.width() + "x" + level.height()
                + "|terrain=" + Arrays.toString(level.map)
                + "|passable=" + Arrays.toString(level.passable)
                + "|solid=" + Arrays.toString(level.solid)
                + "|visited=" + Arrays.toString(level.visited)
                + "|mapped=" + Arrays.toString(level.mapped)
                + "|hero=" + hero.pos + ":" + hero.HP + ":" + hero.HT
                + "|mob=" + entityId + ":" + mob.pos + ":" + mob.HP + ":" + mob.HT
                + "|objects=" + level.heaps.keyArray().length + ":"
                    + level.traps.keyArray().length + ":" + level.plants.keyArray().length
                    + ":" + level.blobs.size();
    }

    private Mob findMobByServerId(MultiplayerManager manager, String entityId) {
        for (Mob mob : level.mobs) {
            if (entityId.equals(manager.getServerEntityId(mob.id()))) return mob;
        }
        return null;
    }

    private static final class TestLevel extends Level {
        private boolean failNextFeelingRestore;

        private void setTestTerrain(int terrain, int... positions) {
            for (int position : positions) map[position] = terrain;
            buildFlagMaps();
        }

        private TestLevel() {
            // Use the game's standard 32x32 pathfinding dimensions. Native combat publication
            // invokes Level.distance after the real attack; the smaller ad-hoc map left the
            // static PathFinder distance table at a different size under headless libGDX.
            setSize(32, 32);
            transitions = new ArrayList<>();
            mobs = new HashSet<>();
            heaps = new SparseArray<Heap>();
            blobs = new HashMap<Class<? extends Blob>, Blob>();
            plants = new SparseArray<Plant>();
            traps = new SparseArray<Trap>();
            customTiles = new ArrayList<>();
            customWalls = new ArrayList<>();
            Arrays.fill(map, Terrain.EMPTY);
            // Production level generation initializes this exploration flag array before
            // exporting a complete snapshot; the minimal headless fixture must do the same.
            discoverable = new boolean[length];
            buildFlagMaps();
            Arrays.fill(heroFOV, false);
        }

        @Override
        protected boolean build() {
            return true;
        }

        @Override
        public boolean restoreMultiplayerFeeling(String name) {
            if (failNextFeelingRestore) {
                failNextFeelingRestore = false;
                return false;
            }
            return super.restoreMultiplayerFeeling(name);
        }

        @Override
        protected void createMobs() {
        }

        @Override
        protected void createItems() {
        }
    }
}
