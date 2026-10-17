package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.badlogic.gdx.ApplicationAdapter;
import com.badlogic.gdx.backends.headless.HeadlessApplication;
import com.badlogic.gdx.backends.headless.HeadlessApplicationConfiguration;
import com.badlogic.gdx.utils.Json;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.blobs.Blob;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.HeroClass;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Rat;
import com.shatteredpixel.shatteredpixeldungeon.items.Heap;
import com.shatteredpixel.shatteredpixeldungeon.levels.Level;
import com.shatteredpixel.shatteredpixeldungeon.levels.Terrain;
import com.shatteredpixel.shatteredpixeldungeon.levels.traps.Trap;
import com.shatteredpixel.shatteredpixeldungeon.plants.Plant;
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
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

public class NativeCombatRuntimeIntegrationTest {

    private static HeadlessApplication application;
    private TestLevel level;
    private Hero hero;

    @BeforeClass
    public static void startHeadlessLibGdx() throws Exception {
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
    public void acceptedCombatEventConvergesAcrossClientsWithDifferentLocalActorIds() throws Exception {
        final String stableMobId = "stable-native-mob-0001";
        MultiplayerManager manager = MultiplayerManager.getInstance();

        manager.startSession("runtime-convergence", "client-a", new TestTransport());
        Rat targetA = addRat(hero.pos + 1, 100);
        int localActorIdA = targetA.id();
        manager.registerServerEntityId(localActorIdA, stableMobId);

        String event = "[{\"sequence\":2,\"depth\":1,\"eventType\":\"PLAYER_ATTACKED\",\"action\":{"
                + "\"attackerId\":\"client-a\",\"targetId\":\"" + stableMobId + "\","
                + "\"targetType\":\"MOB\",\"targetHp\":71,\"targetHt\":100,"
                + "\"targetPosAfter\":" + (hero.pos + 1) + ",\"targetBuffs\":\"[]\","
                + "\"damage\":29,\"hit\":true,\"engineResolved\":true}}]";
        routeEventBatch(event, 2L);
        Assert.assertEquals(71, targetA.HP);
        Assert.assertEquals(100, targetA.HT);

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

        manager.startSession("runtime-convergence", "client-b", new TestTransport());
        manager.registerServerEntityId(localActorIdB, stableMobId);
        routeEventBatch(event, 2L);

        Assert.assertEquals("Client B must resolve by stable server ID, not Actor.id()", 71, targetB.HP);
        Assert.assertEquals(100, targetB.HT);
        Assert.assertEquals(hero.pos + 1, targetB.pos);
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

    private static final class DeterministicRat extends Rat {
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
        @Override public void connect(String endpoint, TransportCallback callback) {
            connected = true;
            if (callback != null) callback.onConnected();
        }
        @Override public void send(NetworkMessage message) { }
        @Override public void disconnect() { connected = false; }
        @Override public boolean isConnected() { return connected; }
        @Override public String getTransportType() { return "TEST"; }
    }

    private static final class TestLevel extends Level {
        private TestLevel() {
            setSize(12, 12);
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
