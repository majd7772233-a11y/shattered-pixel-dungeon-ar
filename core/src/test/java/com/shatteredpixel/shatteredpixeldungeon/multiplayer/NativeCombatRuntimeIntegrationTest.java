package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.badlogic.gdx.ApplicationAdapter;
import com.badlogic.gdx.backends.headless.HeadlessApplication;
import com.badlogic.gdx.backends.headless.HeadlessApplicationConfiguration;
import com.badlogic.gdx.utils.Json;
import com.badlogic.gdx.utils.JsonReader;
import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.blobs.Blob;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Buff;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Barrier;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.HeroClass;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.RemoteHero;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Talent;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Rat;
import com.shatteredpixel.shatteredpixeldungeon.items.Ankh;
import com.shatteredpixel.shatteredpixeldungeon.items.Heap;
import com.shatteredpixel.shatteredpixeldungeon.levels.Level;
import com.shatteredpixel.shatteredpixeldungeon.levels.Terrain;
import com.shatteredpixel.shatteredpixeldungeon.levels.traps.Trap;
import com.shatteredpixel.shatteredpixeldungeon.plants.Plant;
import com.watabou.noosa.Game;
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
    public void worldSnapshotReconstructsMissingStableMobAndRepeatedRestoreIsIdempotent() throws Exception {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        manager.startSession("snapshot-reconnect", "client-publisher", new TestTransport());

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

        Assert.assertTrue("Complete authoritative snapshot must pass structural/native validation",
                WorldSnapshot.validateForRestore(snapshot));
        Assert.assertTrue("Missing native mob must be reconstructed from its serialized bundle",
                WorldSnapshot.restoreWorld(snapshot));

        Mob restored = findMobByServerId(manager, "stable-native-mob-0001");
        Assert.assertNotNull(restored);
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
        row.put("cooldown", Math.max(0f, mob.cooldown()));
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

    private Mob findMobByServerId(MultiplayerManager manager, String entityId) {
        for (Mob mob : level.mobs) {
            if (entityId.equals(manager.getServerEntityId(mob.id()))) return mob;
        }
        return null;
    }

    private static final class TestLevel extends Level {
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
            buildFlagMaps();
            Arrays.fill(heroFOV, false);
        }

        @Override
        protected boolean build() {
            return true;
        }

        @Override
        protected void createMobs() {
        }

        @Override
        protected void createItems() {
        }
    }
}
