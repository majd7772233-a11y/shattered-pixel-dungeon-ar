package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.badlogic.gdx.ApplicationAdapter;
import com.badlogic.gdx.backends.headless.HeadlessApplication;
import com.badlogic.gdx.backends.headless.HeadlessApplicationConfiguration;
import com.badlogic.gdx.utils.Json;
import com.badlogic.gdx.utils.JsonReader;
import com.badlogic.gdx.utils.JsonValue;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.Statistics;
import com.shatteredpixel.shatteredpixeldungeon.items.rings.Ring;
import com.shatteredpixel.shatteredpixeldungeon.levels.rooms.secret.SecretRoom;
import com.shatteredpixel.shatteredpixeldungeon.levels.rooms.special.SpecialRoom;
import com.shatteredpixel.shatteredpixeldungeon.actors.Actor;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.blobs.Blob;
import com.shatteredpixel.shatteredpixeldungeon.actors.blobs.Fire;
import com.shatteredpixel.shatteredpixeldungeon.actors.blobs.ToxicGas;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Buff;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Amok;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.SnipersMark;
import com.shatteredpixel.shatteredpixeldungeon.ui.ActionIndicator;
import com.shatteredpixel.shatteredpixeldungeon.ui.TargetHealthIndicator;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Barrier;
import com.shatteredpixel.shatteredpixeldungeon.items.weapon.enchantments.Blocking;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Healing;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Haste;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Foresight;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Invulnerability;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.FrostImbue;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Weakness;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.LifeLink;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.MonkEnergy;
import com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Poison;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.HeroClass;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.RemoteHero;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Talent;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Mob;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Rat;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.npcs.Ghost;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.npcs.Imp;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.npcs.Wandmaker;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.npcs.Blacksmith;
import com.shatteredpixel.shatteredpixeldungeon.journal.Notes;
import com.shatteredpixel.shatteredpixeldungeon.items.Ankh;
import com.shatteredpixel.shatteredpixeldungeon.items.Heap;
import com.shatteredpixel.shatteredpixeldungeon.items.Item;
import com.shatteredpixel.shatteredpixeldungeon.items.LostBackpack;
import com.shatteredpixel.shatteredpixeldungeon.items.Dewdrop;
import com.shatteredpixel.shatteredpixeldungeon.items.keys.IronKey;
import com.shatteredpixel.shatteredpixeldungeon.items.quest.CorpseDust;
import com.shatteredpixel.shatteredpixeldungeon.items.bags.Bag;
import com.shatteredpixel.shatteredpixeldungeon.items.weapon.melee.Dagger;
import com.shatteredpixel.shatteredpixeldungeon.items.weapon.SpiritBow;
import com.shatteredpixel.shatteredpixeldungeon.items.weapon.Weapon;
import com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHealing;
import com.shatteredpixel.shatteredpixeldungeon.items.scrolls.ScrollOfIdentify;
import com.shatteredpixel.shatteredpixeldungeon.journal.Catalog;
import com.shatteredpixel.shatteredpixeldungeon.levels.Level;
import com.shatteredpixel.shatteredpixeldungeon.levels.Terrain;
import com.shatteredpixel.shatteredpixeldungeon.levels.traps.Trap;
import com.shatteredpixel.shatteredpixeldungeon.levels.traps.FrostTrap;
import com.shatteredpixel.shatteredpixeldungeon.plants.Plant;
import com.shatteredpixel.shatteredpixeldungeon.plants.Firebloom;
import com.watabou.noosa.Game;
import com.watabou.noosa.Group;
import com.watabou.noosa.Gizmo;
import com.watabou.noosa.Visual;
import com.watabou.noosa.tweeners.Tweener;
import com.watabou.utils.Callback;
import com.watabou.utils.PointF;
import com.shatteredpixel.shatteredpixeldungeon.sprites.CharSprite;
import com.shatteredpixel.shatteredpixeldungeon.sprites.MissileSprite;
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
        // ItemSprite/MissileSprite constructors resolve the normal items atlas. The headless
        // runtime has no bundled asset files or GL context, so seed the same cache key with a
        // 1x1 in-memory Pixmap. This keeps the original Item.cast -> MissileSprite path intact.
        seedHeadlessTexture(com.shatteredpixel.shatteredpixeldungeon.Assets.Sprites.ITEMS, 1, 1);
        // The first real ranged hit initializes FloatingText, which resolves its icon atlas
        // through TextureFilm before the hit can complete.
        seedHeadlessTexture(com.shatteredpixel.shatteredpixeldungeon.Assets.Effects.TEXT_ICONS, 7, 8);
    }

    private static void seedHeadlessTexture(Object key, int width, int height) {
        if (!com.watabou.gltextures.TextureCache.contains(key)) {
            com.watabou.gltextures.TextureCache.create(key, width, height);
        }
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
        Statistics.reset();
        Notes.reset();
        Ghost.Quest.reset();
        Wandmaker.Quest.reset();
        Blacksmith.Quest.reset();
        Imp.Quest.reset();
        Dungeon.hero = null;
        Dungeon.level = null;

        level = new TestLevel();
        Dungeon.level = level;
        // GameScene creates this singleton during its UI setup; native Item.cast() expects it.
        new TargetHealthIndicator();
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
        TargetHealthIndicator.instance = null;
        Dungeon.hero = null;
        Dungeon.level = null;
    }

    @Test
    public void nativeHeroBuffTickCaptureRemainsAvailableOnASealedBossLevel() {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        manager.startSession("native-sealed-hero-buff-tick", "client-publisher", new TestTransport());
        level.locked = true;

        Haste haste = Buff.affect(hero, Haste.class, Haste.DURATION);
        Assert.assertNotNull(haste);
        NativeHeroBuffTickPublisher.TickCapture capture = NativeHeroBuffTickPublisher.capture(haste);
        Assert.assertNotNull("A sealed level must not suppress native timed Hero Buff publication", capture);

        // The captured state has not changed. Publishing this no-op capture clears its guard
        // without emitting a network action, while still exercising the native capture gate.
        NativeHeroBuffTickPublisher.publish(capture);
        level.locked = false;
    }

    @Test
    public void nativePoisonDamageConsumesConcurrentBarrierWithoutChangingHeroHp() {
        TestTransport transport = new TestTransport();
        MultiplayerManager manager = MultiplayerManager.getInstance();
        manager.startSession("native-poison-barrier-absorption", "client-publisher", transport);
        NetworkMessage session = new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"client-publisher\",\"sessionToken\":\"poison-barrier-token\","
                        + "\"isLevelPublisher\":true,\"sequence\":1}");
        session.sequence = 1L;
        manager.onMessageReceived(session);

        hero.HP = 10;
        Barrier barrier = Buff.affect(hero, Barrier.class);
        barrier.setShield(2);
        Poison poison = Buff.affect(hero, Poison.class);
        poison.set(3f);

        NativeHeroBuffTickPublisher.TickCapture capture = NativeHeroBuffTickPublisher.capture(poison);
        Assert.assertNotNull("The native Poison tick must be captured while Barrier is active", capture);
        Assert.assertTrue("The native Poison damage pipeline consumes the available Barrier", poison.act());
        NativeHeroBuffTickPublisher.publish(capture);

        Assert.assertEquals("Barrier absorbs the full two-point Poison hit before Hero HP changes", 10, hero.HP);
        Assert.assertEquals("A fully consumed Barrier detaches at zero", 0, hero.shielding());
        Assert.assertNull("The native damage callback removes the depleted Barrier", hero.buff(Barrier.class));
        Assert.assertFalse("A complete shielded result must not request a fallback snapshot",
                transport.sent.stream().anyMatch(message -> message.messageType == MessageType.RESYNC));

        ArrayList<NetworkMessage> actions = new ArrayList<>();
        for (NetworkMessage message : transport.sent) {
            if (message.messageType == MessageType.ACTION) actions.add(message);
        }
        Assert.assertEquals(1, actions.size());
        JsonValue action = new JsonReader().parse(actions.get(0).payloadJson);
        JsonValue data = action == null ? null : action.get("data");
        Assert.assertNotNull(data);
        Assert.assertEquals("com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Poison",
                data.getString("buffClass", ""));
        JsonValue heroStateValue = action.get("heroStateJson");
        Assert.assertNotNull(heroStateValue);
        JsonValue heroState = new JsonReader().parse(heroStateValue.asString());
        Assert.assertEquals(10, heroState.getInt("hp", -1));
        Assert.assertEquals(0, heroState.getInt("shielding", -1));
        Assert.assertEquals(1, heroState.getInt("buffCount", -1));
    }

    @Test
    public void nativePoisonConsumesPriorityOrderedBlockingAndBarrierShields() {
        TestTransport transport = new TestTransport();
        MultiplayerManager manager = MultiplayerManager.getInstance();
        manager.startSession("native-poison-priority-shields", "client-publisher", transport);
        NetworkMessage session = new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"client-publisher\",\"sessionToken\":\"poison-priority-shields-token\","
                        + "\"isLevelPublisher\":true,\"sequence\":1}");
        session.sequence = 1L;
        manager.onMessageReceived(session);

        hero.HP = 10;
        Blocking.BlockBuff blocking = Buff.affect(hero, Blocking.BlockBuff.class);
        blocking.setShield(2);
        Barrier barrier = Buff.affect(hero, Barrier.class);
        barrier.setShield(2);
        Poison poison = Buff.affect(hero, Poison.class);
        poison.set(6f); // Native Poison damage is (int)(6 / 3) + 1 = 3.

        NativeHeroBuffTickPublisher.TickCapture capture = NativeHeroBuffTickPublisher.capture(poison);
        Assert.assertNotNull(capture);
        Assert.assertTrue(poison.act());
        NativeHeroBuffTickPublisher.publish(capture);

        Assert.assertEquals(10, hero.HP);
        Assert.assertNull("The higher-priority Blocking shield is consumed first and detaches", hero.buff(Blocking.BlockBuff.class));
        Assert.assertNotNull("The lower-priority Barrier remains after absorbing the final point", hero.buff(Barrier.class));
        Assert.assertEquals(1, hero.buff(Barrier.class).shielding());
        Assert.assertEquals(1, hero.shielding());
        Assert.assertFalse("The complete native multi-shield result must not force resync",
                transport.sent.stream().anyMatch(message -> message.messageType == MessageType.RESYNC));

        ArrayList<NetworkMessage> actions = new ArrayList<>();
        for (NetworkMessage message : transport.sent) {
            if (message.messageType == MessageType.ACTION) actions.add(message);
        }
        Assert.assertEquals(1, actions.size());
        JsonValue action = new JsonReader().parse(actions.get(0).payloadJson);
        JsonValue heroStateValue = action == null ? null : action.get("heroStateJson");
        Assert.assertNotNull(heroStateValue);
        JsonValue heroState = new JsonReader().parse(heroStateValue.asString());
        Assert.assertEquals(10, heroState.getInt("hp", -1));
        Assert.assertEquals(1, heroState.getInt("shielding", -1));
        Assert.assertEquals(2, heroState.getInt("buffCount", -1));
    }

    @Test
    public void nativePoisonConsumesPriorityTwoAndOneShieldsBeforeBarrier() {
        TestTransport transport = new TestTransport();
        MultiplayerManager manager = MultiplayerManager.getInstance();
        manager.startSession("native-poison-all-shield-priorities", "client-publisher", transport);
        NetworkMessage session = new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"client-publisher\",\"sessionToken\":\"poison-all-shield-priorities-token\","
                        + "\"isLevelPublisher\":true,\"sequence\":1}");
        session.sequence = 1L;
        manager.onMessageReceived(session);

        hero.HP = 15; // Stay above the WarriorShield auto-activation threshold in the JVM fixture.
        com.shatteredpixel.shatteredpixeldungeon.items.BrokenSeal.WarriorShield warrior =
                Buff.affect(hero, com.shatteredpixel.shatteredpixeldungeon.items.BrokenSeal.WarriorShield.class);
        warrior.setShield(1);
        Blocking.BlockBuff blocking = Buff.affect(hero, Blocking.BlockBuff.class);
        blocking.setShield(1);
        com.shatteredpixel.shatteredpixeldungeon.actors.hero.abilities.cleric.AscendedForm.AscendBuff ascend =
                Buff.affect(hero, com.shatteredpixel.shatteredpixeldungeon.actors.hero.abilities.cleric.AscendedForm.AscendBuff.class);
        ascend.setShield(1);
        com.shatteredpixel.shatteredpixeldungeon.actors.hero.spells.DivineIntervention.DivineShield divine =
                Buff.affect(hero, com.shatteredpixel.shatteredpixeldungeon.actors.hero.spells.DivineIntervention.DivineShield.class);
        divine.setShield(1);
        Barrier barrier = Buff.affect(hero, Barrier.class);
        barrier.setShield(2);
        Poison poison = Buff.affect(hero, Poison.class);
        poison.set(9f); // Native Poison damage is (int)(9 / 3) + 1 = 4.

        NativeHeroBuffTickPublisher.TickCapture capture = NativeHeroBuffTickPublisher.capture(poison);
        Assert.assertNotNull(capture);
        Assert.assertTrue(poison.act());
        NativeHeroBuffTickPublisher.publish(capture);

        Assert.assertEquals("All higher-priority shields absorb the four-point hit before Barrier", 15, hero.HP);
        Assert.assertEquals("The lower-priority Barrier remains untouched", 2, barrier.shielding());
        Assert.assertEquals(2, hero.shielding());
        Assert.assertEquals("WarriorShield and AscendBuff remain attached after reaching zero", 0, warrior.shielding());
        Assert.assertEquals(0, ascend.shielding());
        Assert.assertNull("Blocking.BlockBuff detaches at zero", hero.buff(Blocking.BlockBuff.class));
        Assert.assertNull("DivineShield detaches at zero", hero.buff(
                com.shatteredpixel.shatteredpixeldungeon.actors.hero.spells.DivineIntervention.DivineShield.class));
        Assert.assertFalse("A complete priority-ordered native result must not request resync",
                transport.sent.stream().anyMatch(message -> message.messageType == MessageType.RESYNC));
        Assert.assertTrue("A valid multi-priority result must be published as one native Poison action",
                transport.sent.stream().anyMatch(message -> message.messageType == MessageType.ACTION));
    }

    @Test
    public void nativePoisonHeroBuffTickPublishesLifeLinkedMobDamage() {
        TestTransport transport = new TestTransport();
        MultiplayerManager manager = MultiplayerManager.getInstance();
        manager.startSession("native-poison-life-link", "client-publisher", transport);
        NetworkMessage session = new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"client-publisher\",\"sessionToken\":\"poison-life-link-token\","
                        + "\"isLevelPublisher\":true,\"sequence\":1}");
        session.sequence = 1L;
        manager.onMessageReceived(session);

        Rat linked = addRat(hero.pos + 1, 20);
        manager.registerServerEntityId(linked.id(), "linked-native-mob-0001");
        LifeLink link = Buff.prolong(hero, LifeLink.class, 10f);
        link.object = linked.id();
        Poison poison = Buff.affect(hero, Poison.class);
        poison.set(3f);

        NativeHeroBuffTickPublisher.TickCapture capture = NativeHeroBuffTickPublisher.capture(poison);
        Assert.assertNotNull("A Poison tick with LifeLink must capture its native secondary targets", capture);
        Assert.assertTrue("The original SPD Poison actor resolves the split damage", poison.act());
        NativeHeroBuffTickPublisher.publish(capture);

        Assert.assertEquals("Native LifeLink splits two points of Poison damage across both targets",
                19, hero.HP);
        Assert.assertEquals(19, linked.HP);
        Assert.assertFalse("A complete native result must not request a fallback snapshot",
                transport.sent.stream().anyMatch(message -> message.messageType == MessageType.RESYNC));

        java.util.List<NetworkMessage> actions = new ArrayList<>();
        for (NetworkMessage message : transport.sent) {
            if (message.messageType == MessageType.ACTION) actions.add(message);
        }
        Assert.assertEquals("Poison and all of its native LifeLink Mob deltas share one ACTION", 1, actions.size());
        NetworkMessage action = actions.get(0);
        Assert.assertNotNull("The completed native Poison tick is published after the Mob result", action);
        JsonValue payload = new JsonReader().parse(action.payloadJson);
        JsonValue data = payload == null ? null : payload.get("data");
        Assert.assertNotNull(data);
        Assert.assertEquals("BUFF_TICK", data.getString("sourceType", ""));
        Assert.assertEquals("The Hero summary captures the sequence baseline before Poison.act()",
                1L, data.getLong("sequenceBefore", -1L));
        JsonValue secondary = new JsonReader().parse(data.getString("secondaryMobDeltas", ""));
        JsonValue deltas = secondary == null ? null : secondary.get("deltas");
        Assert.assertNotNull(deltas);
        Assert.assertEquals(1, deltas.size);
        Assert.assertEquals("linked-native-mob-0001", deltas.get(0).getString("entityId", ""));
        Assert.assertEquals(linked.id(), deltas.get(0).getInt("actorId", -1));
        Assert.assertTrue(deltas.get(0).getString("serializedBundleBefore", "").length() > 0);
        Assert.assertEquals(20, deltas.get(0).getInt("hpBefore", -1));
        Assert.assertEquals(19, deltas.get(0).getInt("hpAfter", -1));
    }

    @Test
    public void nativePoisonLifeLinkMobDeathPrecedesTheSameTickHeroDeathEvent() {
        TestTransport transport = new TestTransport();
        MultiplayerManager manager = MultiplayerManager.getInstance();
        manager.startSession("native-poison-life-link-hero-death", "client-publisher", transport);
        NetworkMessage session = new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"client-publisher\",\"sessionToken\":\"poison-life-link-hero-death-token\","
                        + "\"isLevelPublisher\":true,\"sequence\":1}");
        session.sequence = 1L;
        manager.onMessageReceived(session);

        Rat linked = addRat(hero.pos + 1, 1);
        linked.EXP = 2;
        hero.subClass = com.shatteredpixel.shatteredpixeldungeon.actors.hero.HeroSubClass.MONK;
        hero.HP = 1;
        int heroExpBefore = hero.exp;
        manager.registerServerEntityId(linked.id(), "linked-dead-native-mob-hero-0001");
        level.heroFOV[linked.pos] = true;

        LifeLink link = Buff.append(hero, LifeLink.class, 10f);
        link.object = linked.id();
        Poison poison = Buff.affect(hero, Poison.class);
        poison.set(3f);
        NativeHeroBuffTickPublisher.TickCapture capture = NativeHeroBuffTickPublisher.capture(poison);
        Assert.assertNotNull(capture);

        Assert.assertTrue("The native Poison actor completes its lethal callback", poison.act());
        NativeHeroBuffTickPublisher.publish(capture);

        Assert.assertFalse("The linked Mob dies before the Hero's own share of Poison", level.mobs.contains(linked));
        Assert.assertFalse("The same Poison callback kills the one-HP Hero", hero.isAlive());
        Assert.assertEquals("Mob.destroy() awards XP before Hero.damage() marks the Hero dead",
                heroExpBefore + 2, hero.exp);
        MonkEnergy energy = hero.buff(MonkEnergy.class);
        Assert.assertNotNull("The native Monk reward is present in the final death snapshot", energy);
        Assert.assertEquals(1f, energy.energy, 0.001f);

        java.util.List<NetworkMessage> actions = new ArrayList<>();
        for (NetworkMessage message : transport.sent) {
            if (message.messageType == MessageType.ACTION) actions.add(message);
        }
        Assert.assertEquals("Lethal Poison and its linked Mob death are one atomic ACTION with no late Buff tick",
                1, actions.size());

        JsonValue heroAction = new JsonReader().parse(actions.get(0).payloadJson);
        JsonValue heroData = heroAction == null ? null : heroAction.get("data");
        Assert.assertNotNull(heroData);
        JsonValue secondary = new JsonReader().parse(heroData.getString("secondaryMobDeltas", ""));
        Assert.assertNotNull("The lethal Hero result carries the linked Mob batch", secondary);
        Assert.assertEquals(1, secondary.get("deltas").size);
        Assert.assertEquals("linked-dead-native-mob-hero-0001",
                secondary.get("deltas").get(0).getString("entityId", ""));
        Assert.assertEquals(0, secondary.get("deltas").get(0).getInt("hpAfter", -1));
        Assert.assertNotNull(heroData);
        Assert.assertEquals("ENVIRONMENT", heroData.getString("sourceType", ""));
        Assert.assertEquals("com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Poison",
                heroData.getString("sourceClass", ""));
        Assert.assertEquals("DEAD", heroData.getString("targetState", ""));
        Assert.assertEquals(0, heroData.getInt("targetHp", -1));
        JsonValue heroState = new JsonReader().parse(heroAction.getString("heroStateJson", ""));
        Assert.assertNotNull("The lethal Poison event carries a complete Hero state", heroState);
        JsonValue nativeHeroBundle = new JsonReader().parse(heroState.getString("combatBundle", ""));
        Assert.assertNotNull("The native combat Bundle is preserved in the death result", nativeHeroBundle);
        Assert.assertEquals("The final native Hero Bundle carries the already-earned EXP",
                heroExpBefore + 2, nativeHeroBundle.getInt("exp", -1));
        Assert.assertTrue("The final Hero state carries the MonkEnergy Buff",
                heroAction.getString("heroStateJson", "").contains("MonkEnergy"));
        Assert.assertFalse("No post-death BUFF_TICK may be emitted",
                actions.stream().anyMatch(message -> {
                    JsonValue value = new JsonReader().parse(message.payloadJson);
                    JsonValue data = value == null ? null : value.get("data");
                    return data != null && "BUFF_TICK".equals(data.getString("sourceType", ""));
                }));
    }

    @Test
    public void nativePoisonHeroBuffTickPublishesMultipleLinkedMobDeathsInOneTick() {
        TestTransport transport = new TestTransport();
        MultiplayerManager manager = MultiplayerManager.getInstance();
        manager.startSession("native-poison-multiple-life-link-deaths", "client-publisher", transport);
        NetworkMessage session = new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"client-publisher\",\"sessionToken\":\"poison-multiple-life-link-token\","
                        + "\"isLevelPublisher\":true,\"sequence\":1}");
        session.sequence = 1L;
        manager.onMessageReceived(session);

        Rat first = addRat(hero.pos + 1, 1);
        first.EXP = 2;
        Rat second = addRat(hero.pos + 2, 1);
        second.EXP = 3;
        hero.subClass = com.shatteredpixel.shatteredpixeldungeon.actors.hero.HeroSubClass.MONK;
        int heroExpBefore = hero.exp;
        manager.registerServerEntityId(first.id(), "linked-dead-native-mob-0002");
        manager.registerServerEntityId(second.id(), "linked-dead-native-mob-0003");
        level.heroFOV[first.pos] = true;
        level.heroFOV[second.pos] = true;

        LifeLink firstLink = Buff.append(hero, LifeLink.class, 10f);
        firstLink.object = first.id();
        LifeLink secondLink = Buff.append(hero, LifeLink.class, 10f);
        secondLink.object = second.id();
        Poison poison = Buff.affect(hero, Poison.class);
        poison.set(3f);

        NativeHeroBuffTickPublisher.TickCapture capture = NativeHeroBuffTickPublisher.capture(poison);
        Assert.assertNotNull(capture);
        Assert.assertTrue("One native Poison tick resolves both LifeLink targets", poison.act());
        NativeHeroBuffTickPublisher.publish(capture);

        Assert.assertFalse(level.mobs.contains(first));
        Assert.assertFalse(level.mobs.contains(second));
        Assert.assertEquals("Both native Mob.destroy() callbacks award EXP once",
                heroExpBefore + 5, hero.exp);
        MonkEnergy energy = hero.buff(MonkEnergy.class);
        Assert.assertNotNull(energy);
        Assert.assertEquals("Both eligible Rat deaths grant one native Monk energy each",
                2f, energy.energy, 0.001f);
        Assert.assertFalse("The complete multi-target result must not request fallback resync",
                transport.sent.stream().anyMatch(message -> message.messageType == MessageType.RESYNC));

        java.util.List<NetworkMessage> actions = new ArrayList<>();
        for (NetworkMessage message : transport.sent) {
            if (message.messageType == MessageType.ACTION) actions.add(message);
        }
        Assert.assertEquals("Both linked Mob deaths and the Hero tick are sent in one ACTION", 1, actions.size());
        JsonValue heroAction = new JsonReader().parse(actions.get(0).payloadJson);
        JsonValue heroData = heroAction == null ? null : heroAction.get("data");
        Assert.assertNotNull(heroData);
        Assert.assertEquals("BUFF_TICK", heroData.getString("sourceType", ""));
        JsonValue secondary = new JsonReader().parse(heroData.getString("secondaryMobDeltas", ""));
        JsonValue deltas = secondary == null ? null : secondary.get("deltas");
        Assert.assertNotNull(deltas);
        Assert.assertEquals("The later Hero tick correlates both deaths without replaying either",
                2, deltas.size);
        java.util.Set<String> deltaTargets = new java.util.HashSet<>();
        for (JsonValue delta = deltas.child; delta != null; delta = delta.next) {
            Assert.assertEquals(1, delta.getInt("hpBefore", -1));
            Assert.assertEquals(0, delta.getInt("hpAfter", -1));
            Assert.assertTrue(delta.getString("serializedBundleBefore", "").length() > 0);
            Assert.assertEquals(delta.getString("serializedBundleBefore", ""),
                    delta.getString("serializedBundleAfter", ""));
            deltaTargets.add(delta.getString("entityId", ""));
        }
        Assert.assertEquals(new java.util.HashSet<>(Arrays.asList(
                "linked-dead-native-mob-0002", "linked-dead-native-mob-0003")), deltaTargets);
        Assert.assertTrue("The multi-death batch carries a JSON array of final heaps",
                secondary.get("heaps") != null && secondary.get("heaps").isArray());
    }

    @Test
    public void nativePoisonHeroBuffTickPublishesLinkedMobDeathAndDetachesLink() {
        TestTransport transport = new TestTransport();
        MultiplayerManager manager = MultiplayerManager.getInstance();
        manager.startSession("native-poison-life-link-death", "client-publisher", transport);
        NetworkMessage session = new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"client-publisher\",\"sessionToken\":\"poison-life-link-death-token\","
                        + "\"isLevelPublisher\":true,\"sequence\":1}");
        session.sequence = 1L;
        manager.onMessageReceived(session);

        Rat linked = addRat(hero.pos + 1, 1);
        linked.EXP = 2;
        hero.subClass = com.shatteredpixel.shatteredpixeldungeon.actors.hero.HeroSubClass.MONK;
        int heroExpBefore = hero.exp;
        manager.registerServerEntityId(linked.id(), "linked-dead-native-mob-0001");

        JsonValue snapshotBeforeDeath = new JsonReader().parse(SPDLevelSnapshot.currentLevelJson());
        JsonValue snapshotMobs = snapshotBeforeDeath == null ? null : snapshotBeforeDeath.get("mobs");
        Assert.assertNotNull(snapshotMobs);
        JsonValue rewardMob = null;
        for (JsonValue candidate = snapshotMobs.child; candidate != null; candidate = candidate.next) {
            if (candidate.getInt("mobId", -1) == linked.id()) rewardMob = candidate;
        }
        Assert.assertNotNull("The full level snapshot captures trusted native reward metadata", rewardMob);
        Assert.assertEquals(linked.getClass().getName(), rewardMob.getString("rewardClassName", ""));
        Assert.assertTrue(rewardMob.getBoolean("rewardEligible", false));
        Assert.assertEquals(2, rewardMob.getInt("rewardExp", -1));
        Assert.assertEquals(linked.maxLvl, rewardMob.getInt("rewardMaxLevel", -1));
        Assert.assertEquals(1f, rewardMob.getFloat("rewardSpawningWeight", -1f), 0.001f);
        Assert.assertEquals(1f, rewardMob.getFloat("rewardMonkEnergy", -1f), 0.001f);
        // Mob.die() logs a localized message for deaths outside the Hero FOV. Keep the
        // linked target visible so this headless test exercises the callback without loading
        // locale resources that are not part of the unit-test runtime.
        level.heroFOV[linked.pos] = true;
        LifeLink link = Buff.prolong(hero, LifeLink.class, 10f);
        link.object = linked.id();
        Poison poison = Buff.affect(hero, Poison.class);
        poison.set(3f);

        NativeHeroBuffTickPublisher.TickCapture capture = NativeHeroBuffTickPublisher.capture(poison);
        Assert.assertNotNull(capture);
        Assert.assertTrue("The native Poison actor completes after its LifeLink target dies", poison.act());
        NativeHeroBuffTickPublisher.publish(capture);

        Assert.assertFalse("The native death callback removes the linked Mob from the level",
                level.mobs.contains(linked));
        Assert.assertNull("Char.damage() detaches the Hero's LifeLink when the linked target dies",
                hero.buff(LifeLink.class));
        Assert.assertEquals("Mob.destroy() grants the native EXP reward exactly once",
                heroExpBefore + 2, hero.exp);
        MonkEnergy monkEnergy = hero.buff(MonkEnergy.class);
        Assert.assertNotNull("A Monk receives the native energy Buff on an eligible Mob kill", monkEnergy);
        Assert.assertEquals("A normal Rat grants one base Monk energy",
                1f, monkEnergy.energy, 0.001f);

        java.util.List<NetworkMessage> actions = new ArrayList<>();
        for (NetworkMessage message : transport.sent) {
            if (message.messageType == MessageType.ACTION) actions.add(message);
        }
        Assert.assertEquals("The linked Mob death is included in the Hero Buff transaction", 1, actions.size());
        JsonValue buffAction = new JsonReader().parse(actions.get(0).payloadJson);
        JsonValue buffData = buffAction == null ? null : buffAction.get("data");
        Assert.assertNotNull(buffData);
        JsonValue secondary = new JsonReader().parse(buffData.getString("secondaryMobDeltas", ""));
        JsonValue deltas = secondary == null ? null : secondary.get("deltas");
        Assert.assertNotNull(deltas);
        Assert.assertEquals(1, deltas.size);
        Assert.assertEquals(linked.id(), deltas.get(0).getInt("actorId", -1));
        Assert.assertEquals("linked-dead-native-mob-0001", deltas.get(0).getString("entityId", ""));
        Assert.assertEquals(1, deltas.get(0).getInt("hpBefore", -1));
        Assert.assertEquals(0, deltas.get(0).getInt("hpAfter", -1));
        Assert.assertTrue(deltas.get(0).getString("serializedBundleBefore", "").length() > 0);
        Assert.assertEquals(deltas.get(0).getString("serializedBundleBefore", ""),
                deltas.get(0).getString("serializedBundleAfter", ""));
    }

    @Test
    public void nativeHeroBuffTickPublisherCapturesAuditedFlavourExpiryActors() {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        manager.startSession("native-audited-flavour-expiry", "client-publisher", new TestTransport());

        // Test the publisher's source allowlist without invoking attachTo(): Foresight performs
        // a scene-backed Hero.search(), while these attach-side effects are not expiry behavior.
        Buff[] effects = new Buff[] {
                new Foresight(),
                new Invulnerability(),
                new FrostImbue(),
                new Amok()
        };
        for (Buff effect : effects) {
            Assert.assertNotNull(effect);
            effect.target = hero;
            NativeHeroBuffTickPublisher.TickCapture capture = NativeHeroBuffTickPublisher.capture(effect);
            Assert.assertNotNull("Only source-audited native flavour expiry actors may be published",
                    capture);
            // This isolated fixture is not attached to the Hero, so publish is a no-op and
            // reliably releases the publisher's single-event capture guard.
            NativeHeroBuffTickPublisher.publish(capture);
        }
    }

    @Test
    public void nativeHeroAmokExpiryPublishesHeroBuffRemovalWithoutMobAggroMutation() {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        TestTransport transport = new TestTransport();
        manager.startSession("native-hero-amok-expiry", "client-publisher", transport);

        Assert.assertNotEquals("The Hero must not take Amok's enemy-to-enemy Mob aggro reset path",
                Char.Alignment.ENEMY, hero.alignment);
        Rat mob = addRat(hero.pos + 1, 20);
        int mobHpBefore = mob.HP;
        Object mobStateBefore = mob.state;
        Amok amok = Buff.affect(hero, Amok.class);
        Assert.assertNotNull(amok);

        NativeHeroBuffTickPublisher.TickCapture capture = NativeHeroBuffTickPublisher.capture(amok);
        Assert.assertNotNull("Hero-targeted Amok expiry must be captured", capture);
        Assert.assertTrue("The original native Buff.act() must detach Amok", amok.act());
        NativeHeroBuffTickPublisher.publish(capture);

        Assert.assertNull("The native actor must remove only the Hero's Amok row", hero.buff(Amok.class));
        Assert.assertEquals("Hero-targeted Amok expiry must not damage the Mob", mobHpBefore, mob.HP);
        Assert.assertSame("Hero-targeted Amok expiry must not change Mob AI state", mobStateBefore, mob.state);
        NetworkMessage action = transport.sent.stream()
                .filter(message -> message.messageType == MessageType.ACTION
                        && message.payloadJson != null
                        && message.payloadJson.contains("\"action\":\"SYNC_HERO_STATE\""))
                .findFirst().orElse(null);
        Assert.assertNotNull("The Amok expiry must be sent as a native Hero Buff tick", action);
        JsonValue data = new JsonReader().parse(action.payloadJson).get("data");
        Assert.assertEquals("BUFF_TICK", data.getString("sourceType", ""));
        Assert.assertEquals(Amok.class.getName(), data.getString("buffClass", ""));
        JsonValue before = new JsonReader().parse(data.getString("heroStateBeforeJson", ""));
        JsonValue after = new JsonReader().parse(new JsonReader().parse(action.payloadJson)
                .getString("heroStateJson", ""));
        Assert.assertTrue(before.getInt("buffCount") > after.getInt("buffCount"));
        JsonValue secondary = new JsonReader().parse(data.getString("secondaryMobDeltas", ""));
        Assert.assertNotNull(secondary);
        Assert.assertEquals("Hero Amok expiry carries no shared Mob mutations", 0,
                secondary.get("deltas").size);
    }

    @Test
    public void nativeSnipersMarkSpiritArrowCompletesFromTheRealMissileCallbackExactlyOnce() {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        TestTransport transport = new TestTransport();
        manager.startSession("native-snipers-mark-spirit-arrow", "client-publisher", transport);
        NetworkMessage session = new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"client-publisher\",\"sessionToken\":\"spirit-arrow-native-token\","
                        + "\"isLevelPublisher\":true,\"sequence\":1,\"depth\":1}");
        session.sequence = 1L;
        manager.onMessageReceived(session);

        Arrays.fill(level.heroFOV, true);
        Rat mob = addRat(hero.pos + 1, 20);
        attachHeadlessTargetSprite(mob);
        Assert.assertNotNull("The headless Item.cast target must have a CharSprite", mob.sprite);
        Assert.assertNotNull("The headless scene must own the target health indicator singleton",
                TargetHealthIndicator.instance);
        String targetEntityId = "stable-spirit-arrow-target-001";
        manager.registerServerEntityId(mob.id(), targetEntityId);
        SilentSpiritBow bow = new SilentSpiritBow();
        bow.setMultiplayerItemId("stable-spirit-arrow-bow-001");
        bow.augment = Weapon.Augment.DAMAGE;
        hero.belongings.weapon = bow;
        SnipersMark mark = Buff.prolong(hero, SnipersMark.class, SnipersMark.DURATION);
        mark.set(mob.id(), 0.5f);
        assertNativeSpiritArrowCaptureCanStart(hero, mark, bow, "stable-spirit-arrow-target-001");

        TestAttackSprite heroSprite = new TestAttackSprite();
        heroSprite.ch = hero;
        heroSprite.visible = true;
        CapturingMissileGroup group = new CapturingMissileGroup();
        group.add(heroSprite);
        hero.sprite = heroSprite;
        heroSprite.parent = group;

        String heroStateBefore = SPDLevelSnapshot.currentHeroStateJson(hero);
        String bowBundle = SPDLevelSnapshot.currentItemBundle(bow);
        Assert.assertTrue("The multiplayer session should be active before using the mark", manager.isMultiplayerActive());
        Assert.assertSame("The native equipped bow must be discoverable by Belongings", bow,
                hero.belongings.getItem(SpiritBow.class));
        Assert.assertSame("The mark must still resolve its native target actor", mob, Actor.findById(mark.object));
        Assert.assertEquals("The target must be mapped to its stable server identity", targetEntityId,
                manager.getServerEntityId(mark.object));
        Assert.assertEquals("SnipersMark must persist the same stable target identity", targetEntityId,
                mark.serverEntityId);
        Assert.assertNotEquals("The marked target must be natively aimable",
                -1, com.shatteredpixel.shatteredpixeldungeon.ui.QuickSlotButton.autoAim(mob, bow.knockArrow()));
        try {
            mark.doAction();
            Assert.assertTrue("SnipersMark must retain the pending report until the missile completes; resync="
                            + transport.sent.stream().anyMatch(m -> m.messageType == MessageType.RESYNC)
                            + ", bowSniper=" + bow.sniperSpecial
                            + ", castStarted=" + bow.castStarted
                            + ", castFailure=" + describeFailure(bow.castFailure)
                            + ", missileCreated=" + (group.missile != null),
                    hero.hasPendingNativeSpiritArrowAttack());
            Assert.assertNotNull("The real SpiritBow.cast path must create a MissileSprite", group.missile);
            Assert.assertFalse("No ATTACK is published while the arrow is in flight",
                    transport.sent.stream().anyMatch(m -> m.messageType == MessageType.ACTION
                            && m.payloadJson != null && m.payloadJson.contains("\"action\":\"ATTACK\"")));

            // This is the completion callback installed by SpiritArrow.cast and invoked by
            // MissileSprite.onComplete after the visual flight. A duplicate completion must be inert.
            group.missile.onComplete(null);
            group.missile.onComplete(null);
            Assert.assertFalse("The asynchronous native report must be closed by the missile callback",
                    hero.hasPendingNativeSpiritArrowAttack());
            Assert.assertNull("The mark is consumed only after native attack resolution",
                    hero.buff(SnipersMark.class));
            Assert.assertFalse("The bow's temporary sniper state must be cleared", bow.sniperSpecial);

            java.util.List<NetworkMessage> attacks = transport.sent.stream()
                    .filter(message -> message.messageType == MessageType.ACTION
                            && message.payloadJson != null
                            && message.payloadJson.contains("\"action\":\"ATTACK\""))
                    .collect(java.util.stream.Collectors.toList());
            Assert.assertEquals("A single missile completion may publish only one native result", 1, attacks.size());
            NetworkMessage action = attacks.get(0);
            JsonValue data = new JsonReader().parse(action.payloadJson).get("data");
            Assert.assertEquals("SPIRIT_ARROW", data.getString("attackWeaponMode", ""));
            Assert.assertEquals(bowBundle, data.getString("attackWeaponBundle", ""));
            JsonValue arrow = data.get("spiritArrow");
            Assert.assertNotNull(arrow);
            Assert.assertEquals(1, arrow.getInt("formatVersion", 0));
            Assert.assertEquals(mark.id(), arrow.getInt("markBuffId", -1));
            Assert.assertEquals(0.5f, arrow.getFloat("markBonus", -1f), 0.0001f);
            Assert.assertEquals(targetEntityId, arrow.getString("targetEntityId", ""));
            Assert.assertEquals(bow.multiplayerItemId(), arrow.getString("bowItemId", ""));
            Assert.assertEquals(heroStateBefore, data.getString("attackerStateBefore", ""));
            Assert.assertEquals(targetEntityId, data.getString("targetEntityId", ""));
            Assert.assertTrue("SpiritArrow remains a native ranged outcome", data.getBoolean("engineRanged", false));
        } finally {
            if (hero.hasPendingNativeSpiritArrowAttack()) hero.cancelNativeSpiritArrowAttack(mark.id());
            mark.detach();
            hero.sprite = null;
            group.destroy();
        }
    }

    @Test
    public void nativeSnipersMarkSpiritArrowTargetDisappearingBeforeMissileCompletionCancelsAndResyncs() {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        TestTransport transport = new TestTransport();
        manager.startSession("native-spirit-arrow-cancel-target-loss", "client-publisher", transport);
        NetworkMessage session = new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"client-publisher\",\"sessionToken\":\"spirit-arrow-cancel-token\","
                        + "\"isLevelPublisher\":true,\"sequence\":1,\"depth\":1}");
        session.sequence = 1L;
        manager.onMessageReceived(session);

        Arrays.fill(level.heroFOV, true);
        Rat mob = addRat(hero.pos + 1, 20);
        attachHeadlessTargetSprite(mob);
        Assert.assertNotNull(mob.sprite);
        Assert.assertNotNull(TargetHealthIndicator.instance);
        manager.registerServerEntityId(mob.id(), "stable-spirit-arrow-cancel-001");
        SilentSpiritBow bow = new SilentSpiritBow();
        bow.setMultiplayerItemId("stable-spirit-arrow-cancel-bow-001");
        bow.augment = Weapon.Augment.DAMAGE;
        hero.belongings.weapon = bow;
        SnipersMark mark = Buff.prolong(hero, SnipersMark.class, SnipersMark.DURATION);
        mark.set(mob.id(), 0.5f);
        assertNativeSpiritArrowCaptureCanStart(hero, mark, bow, "stable-spirit-arrow-cancel-001");

        TestAttackSprite heroSprite = new TestAttackSprite();
        heroSprite.ch = hero;
        heroSprite.visible = true;
        CapturingMissileGroup group = new CapturingMissileGroup();
        group.add(heroSprite);
        hero.sprite = heroSprite;
        heroSprite.parent = group;

        Assert.assertTrue(manager.isMultiplayerActive());
        Assert.assertSame(bow, hero.belongings.getItem(SpiritBow.class));
        Assert.assertSame(mob, Actor.findById(mark.object));
        Assert.assertEquals("stable-spirit-arrow-cancel-001", manager.getServerEntityId(mark.object));
        Assert.assertEquals("stable-spirit-arrow-cancel-001", mark.serverEntityId);
        Assert.assertNotEquals(-1, com.shatteredpixel.shatteredpixeldungeon.ui.QuickSlotButton.autoAim(mob, bow.knockArrow()));
        try {
            mark.doAction();
            Assert.assertTrue("Pending SpiritArrow missing; resync="
                    + transport.sent.stream().anyMatch(m -> m.messageType == MessageType.RESYNC)
                    + ", castStarted=" + bow.castStarted
                    + ", castFailure=" + describeFailure(bow.castFailure)
                    + ", missileCreated=" + (group.missile != null), hero.hasPendingNativeSpiritArrowAttack());
            mob.pos += 2;
            group.missile.onComplete(null);

            Assert.assertFalse("A disappeared marked target cancels the pending native result",
                    hero.hasPendingNativeSpiritArrowAttack());
            Assert.assertSame("An unaccepted mark remains available for the restored authoritative state",
                    mark, hero.buff(SnipersMark.class));
            Assert.assertTrue("The client requests a fresh authoritative snapshot",
                    transport.sent.stream().anyMatch(m -> m.messageType == MessageType.RESYNC));
            Assert.assertFalse("A target mismatch must never publish a local attack",
                    transport.sent.stream().anyMatch(m -> m.messageType == MessageType.ACTION
                            && m.payloadJson != null && m.payloadJson.contains("\"action\":\"ATTACK\"")));
        } finally {
            if (hero.hasPendingNativeSpiritArrowAttack()) hero.cancelNativeSpiritArrowAttack(mark.id());
            mark.detach();
            hero.sprite = null;
            group.destroy();
        }
    }

    @Test
    public void nativeHeroSnipersMarkExpiryPublishesHeroBuffRemovalAndClearsActionIndicator() {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        TestTransport transport = new TestTransport();
        manager.startSession("native-hero-snipers-mark-expiry", "client-publisher", transport);

        Rat mob = addRat(hero.pos + 1, 20);
        int mobHpBefore = mob.HP;
        Object mobStateBefore = mob.state;
        SnipersMark mark = Buff.prolong(hero, SnipersMark.class, SnipersMark.DURATION);
        mark.set(mob.id(), 0.35f);

        try {
            Assert.assertSame("SnipersMark must expose its local action while active",
                    mark, ActionIndicator.action);
            NativeHeroBuffTickPublisher.TickCapture capture = NativeHeroBuffTickPublisher.capture(mark);
            Assert.assertNotNull("Hero-targeted SnipersMark expiry must be captured", capture);
            Assert.assertTrue("The original native FlavourBuff.act() must detach the mark", mark.act());
            NativeHeroBuffTickPublisher.publish(capture);

            Assert.assertNull("The native actor must remove only the Hero's SnipersMark row",
                    hero.buff(SnipersMark.class));
            Assert.assertNull("SnipersMark.detach() must clear its local ActionIndicator",
                    ActionIndicator.action);
            Assert.assertEquals("Hero SnipersMark expiry must not damage a shared Mob", mobHpBefore, mob.HP);
            Assert.assertSame("Hero SnipersMark expiry must not mutate Mob AI state", mobStateBefore, mob.state);

            NetworkMessage action = transport.sent.stream()
                    .filter(message -> message.messageType == MessageType.ACTION
                            && message.payloadJson != null
                            && message.payloadJson.contains("\"action\":\"SYNC_HERO_STATE\""))
                    .findFirst().orElse(null);
            Assert.assertNotNull("The mark expiry must be sent as a native Hero Buff tick", action);
            JsonValue data = new JsonReader().parse(action.payloadJson).get("data");
            Assert.assertEquals("BUFF_TICK", data.getString("sourceType", ""));
            Assert.assertEquals(SnipersMark.class.getName(), data.getString("buffClass", ""));
            JsonValue before = new JsonReader().parse(data.getString("heroStateBeforeJson", ""));
            boolean foundMark = false;
            for (int i = 0; i < before.getInt("buffCount", 0); i++) {
                JsonValue envelope = new JsonReader().parse(before.getString("buff_" + i, ""));
                JsonValue buff = envelope == null ? null : envelope.get("buff");
                if (buff != null && SnipersMark.class.getName().equals(buff.getString("__className", ""))) {
                    Assert.assertEquals("The expiry preserves the marked native Actor ID",
                            mob.id(), buff.getInt("object", -1));
                    Assert.assertEquals("The expiry preserves the native damage bonus",
                            0.35f, buff.getFloat("bonus", -1f), 0.0001f);
                    foundMark = true;
                }
            }
            Assert.assertTrue("The pre-state must contain the exact native SnipersMark data", foundMark);
            JsonValue after = new JsonReader().parse(new JsonReader().parse(action.payloadJson)
                    .getString("heroStateJson", ""));
            Assert.assertTrue(before.getInt("buffCount") > after.getInt("buffCount"));
        } finally {
            // A failed assertion must not leak the process-wide UI action into the next JVM test.
            ActionIndicator.clearAction(mark);
        }
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
    public void noHealingChallengeRejectsHealingAndShieldingPotionsBeforeTheirPoisonFallback() {
        String healing = "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHealing";
        String shielding = "com.shatteredpixel.shatteredpixeldungeon.items.potions.exotic.PotionOfShielding";
        Assert.assertTrue(NativeItemUse.supportsNativePotionUseState(healing, hero.subClass,
                false, false, false, false, false));
        Assert.assertTrue(NativeItemUse.supportsNativePotionUseState(shielding, hero.subClass,
                false, false, false, false, false));
        Assert.assertFalse(NativeItemUse.supportsNativePotionUseState(healing, hero.subClass,
                false, false, false, false, false, true));
        Assert.assertFalse(NativeItemUse.supportsNativePotionUseState(shielding, hero.subClass,
                false, false, false, false, false, true));
        Assert.assertTrue(NativeItemUse.supportsNativePotionUseState(
                "com.shatteredpixel.shatteredpixeldungeon.items.potions.PotionOfHaste", hero.subClass,
                false, false, false, false, false, true));
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
    public void nativeLevelSnapshotIncludesRemoteHeroAndRemoteBuffActorIds() {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        manager.startSession("remote-hero-actor-ids", "client-publisher", new TestTransport());

        RemoteHero remoteHero = new RemoteHero();
        remoteHero.pos = hero.pos + 1;
        Actor.add(remoteHero);
        Haste remoteHaste = Buff.affect(remoteHero, Haste.class, Haste.DURATION);
        Assert.assertNotNull(remoteHaste);
        RemotePlayer remote = new RemotePlayer("remote-actor-player", "Remote", "WARRIOR");
        remote.heroInstance = remoteHero;
        manager.addRemotePlayer(remote);

        JsonValue snapshot = new JsonReader().parse(SPDLevelSnapshot.currentLevelJson());
        JsonValue ids = snapshot == null ? null : snapshot.get("nativeRemoteHeroActorIds");
        Assert.assertNotNull("The native level snapshot must expose RemoteHero scheduler IDs", ids);
        Assert.assertTrue(ids.isArray());
        boolean foundHero = false, foundBuff = false;
        for (JsonValue value = ids.child; value != null; value = value.next) {
            if (value.asInt() == remoteHero.id()) foundHero = true;
            if (value.asInt() == remoteHaste.id()) foundBuff = true;
        }
        Assert.assertTrue("The connected RemoteHero Actor ID must be included", foundHero);
        Assert.assertTrue("Buffs attached to the RemoteHero must be included too", foundBuff);
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
        RemoteHero remoteHero = new RemoteHero();
        Buff remoteHeroBuff = new Buff();
        remoteHeroBuff.target = remoteHero;
        Assert.assertTrue("Remote Hero Buffs must not be simulated locally",
                Actor.shouldSkipMultiplayerSharedActor(remoteHeroBuff));
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
    public void disconnectedRemotePlayerIsRemovedFromNativeActorsAndMobTargets() throws Exception {
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

        Buff firstBuff = new Buff();
        Buff secondBuff = new Buff();
        Assert.assertTrue(firstBuff.attachTo(remoteHero));
        Assert.assertTrue(secondBuff.attachTo(remoteHero));
        int firstBuffActorId = firstBuff.id();
        int secondBuffActorId = secondBuff.id();

        TestAttackSprite remoteSprite = new TestAttackSprite();
        Group spriteParent = new Group();
        spriteParent.add(remoteSprite);
        remoteHero.sprite = remoteSprite;

        Assert.assertSame(remoteHero, manager.getHeroForPlayerId(departing.playerId));
        Assert.assertEquals(departing.playerId, manager.getPlayerIdForHero(remoteHero));

        Rat acting = addRat(hero.pos + 1, 18);
        manager.registerServerEntityId(acting.id(), "stable-mob-targeting-player-0001");
        acting.restoreMultiplayerAiState("Hunting", acting.multiplayerBaseSpeed(), acting.defenseSkill,
                Math.max(0f, acting.cooldown()), remoteHero.pos, true, true, "PLAYER", departing.playerId);
        Assert.assertSame(remoteHero, acting.multiplayerEnemy());
        int remoteActorId = remoteHero.id();

        // Exercise the original default/legacy receiver before moving PLAYER_LEFT into MessageRouter.
        NetworkMessage left = new NetworkMessage(MessageType.PLAYER_LEFT, "{\"playerId\":\"departing-player\"}");
        left.senderId = departing.playerId;
        MessageRouter.routeMessage(left);
        CountDownLatch routed = new CountDownLatch(1);
        Game.runOnRenderThread(routed::countDown);
        Assert.assertTrue("The default MessageRouter path must finish PLAYER_LEFT cleanup on the render thread",
                routed.await(10, TimeUnit.SECONDS));

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

        Assert.assertTrue("Every attached remote Hero Buff must be detached", remoteHero.buffs().isEmpty());
        Assert.assertNull("The first detached Buff must leave the Actor scheduler", Actor.findById(firstBuffActorId));
        Assert.assertNull("The second detached Buff must leave the Actor scheduler", Actor.findById(secondBuffActorId));
        Assert.assertNull("Remote Hero sprite must be removed from its parent group", remoteSprite.parent);
        Assert.assertNull("Remote Hero sprite reference must be cleared", remoteHero.sprite);
        Assert.assertNull("Player-to-Hero lookup must no longer resolve the departed player",
                manager.getHeroForPlayerId(departing.playerId));
        Assert.assertNull("Hero-to-player lookup must no longer resolve the departed Hero",
                manager.getPlayerIdForHero(remoteHero));
    }

    @Test
    public void playerLeftMalformedPayloadFallsBackToServerSenderId() throws Exception {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        manager.startSession("malformed-player-left-fallback", "local-player", new TestTransport());

        RemotePlayer departing = new RemotePlayer("departing-malformed", "Departing", "WARRIOR");
        manager.addRemotePlayer(departing);

        NetworkMessage left = new NetworkMessage(MessageType.PLAYER_LEFT, "{");
        left.senderId = departing.playerId;
        MessageRouter.routeMessage(left);

        CountDownLatch routed = new CountDownLatch(1);
        Game.runOnRenderThread(routed::countDown);
        Assert.assertTrue("Malformed leave payload must still be handled on the render thread",
                routed.await(10, TimeUnit.SECONDS));
        Assert.assertNull("Malformed payload must fall back to the trusted server sender ID",
                manager.getRemotePlayer(departing.playerId));
    }

    @Test
    public void playerLeftForLocalPlayerIsIgnored() throws Exception {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        manager.startSession("local-player-left-is-ignored", "local-player", new TestTransport());

        NetworkMessage left = new NetworkMessage(MessageType.PLAYER_LEFT, "{\"playerId\":\"local-player\"}");
        left.senderId = "SERVER";
        MessageRouter.routeMessage(left);

        CountDownLatch routed = new CountDownLatch(1);
        Game.runOnRenderThread(routed::countDown);
        Assert.assertTrue(routed.await(10, TimeUnit.SECONDS));
        Assert.assertSame("A local PLAYER_LEFT message must not remove the local Hero",
                hero, manager.getHeroForPlayerId("local-player"));
        Assert.assertSame(hero, Actor.findById(hero.id()));
    }

    @Test
    public void defaultRouterRetainsLegacyRemoteHeroStateUpdates() throws Exception {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        manager.startSession("legacy-remote-route", "local-player", new TestTransport());

        RemotePlayer remote = new RemotePlayer("legacy-remote-player", "Legacy", "WARRIOR");
        remote.pos = hero.pos + 3;
        remote.hp = remote.ht = 20;
        RemoteHero remoteHero = new RemoteHero();
        remoteHero.pos = remote.pos;
        remoteHero.HP = remoteHero.HT = 20;
        remote.heroInstance = remoteHero;
        manager.addRemotePlayer(remote);
        Actor.add(remoteHero);

        // Preserve the legacy receiver's actual JSON key-scanning contract: the nested "to"
        // closes before the sibling hp field, so both values are independently parseable.
        NetworkMessage update = new NetworkMessage(MessageType.PLAYER_JOINED,
                "{\"event\":\"PLAYER_MOVED\",\"position\":{\"to\":17},\"hp\":6}");
        update.senderId = "legacy-remote-player";
        MessageRouter.routeMessage(update);

        CountDownLatch routed = new CountDownLatch(1);
        Game.runOnRenderThread(routed::countDown);
        Assert.assertTrue("Default route must deliver legacy player updates on the render thread",
                routed.await(10, TimeUnit.SECONDS));

        Assert.assertSame("The existing remote player remains registered", remote,
                manager.getRemotePlayer("legacy-remote-player"));
        Assert.assertEquals(17, remote.pos);
        Assert.assertEquals(17, remoteHero.pos);
        Assert.assertEquals(6, remote.hp);
        Assert.assertEquals(6, remoteHero.HP);
        Assert.assertSame("RemoteHero remains registered in the native Actor scheduler",
                remoteHero, Actor.findById(remoteHero.id()));
    }

    @Test
    public void eventBatchUsesOneTypedStatePathAndLegacyReceiverRefusesSecondApplication() throws Exception {
        TestTransport transport = new TestTransport();
        MultiplayerManager manager = MultiplayerManager.getInstance();
        manager.startSession("typed-event-single-path", "local-player", transport);

        Rat mob = addRat(hero.pos + 2, 18);
        int originalPosition = mob.pos;
        int acceptedPosition = originalPosition + 1;
        String payload = "[{\"sequence\":1,\"eventType\":\"MOB_MOVED\","
                + "\"action\":{\"mobId\":" + mob.id()
                + ",\"toPos\":" + acceptedPosition + "}}]";
        NetworkMessage batch = new NetworkMessage(MessageType.EVENT_BATCH, payload);
        batch.senderId = "SERVER";
        batch.sequence = 1L;

        MessageRouter.routeMessage(batch);
        CountDownLatch firstApply = new CountDownLatch(1);
        Game.runOnRenderThread(firstApply::countDown);
        Assert.assertTrue("Typed EVENT_BATCH routing must finish on the render thread",
                firstApply.await(10, TimeUnit.SECONDS));
        Assert.assertEquals("The typed router applies the accepted Mob position once",
                acceptedPosition, mob.pos);
        Assert.assertEquals(1L, manager.getLastSequence());
        Assert.assertFalse("The valid typed event does not need fallback or resync",
                transport.sent.stream().anyMatch(message -> message.messageType == MessageType.RESYNC));

        MessageRouter.routeMessage(batch);
        CountDownLatch duplicateProcessed = new CountDownLatch(1);
        Game.runOnRenderThread(duplicateProcessed::countDown);
        Assert.assertTrue(duplicateProcessed.await(10, TimeUnit.SECONDS));
        Assert.assertEquals("A duplicate sequence cannot apply the native state update twice",
                acceptedPosition, mob.pos);
        Assert.assertEquals(1L, manager.getLastSequence());

        int resyncsBeforeLegacyGuard = (int) transport.sent.stream()
                .filter(message -> message.messageType == MessageType.RESYNC).count();
        RemotePlayerActionReceiver.handleNetworkMessage(batch);
        Assert.assertEquals("Legacy receiver must not run a second Mob state update", acceptedPosition, mob.pos);
        Assert.assertEquals(1L, manager.getLastSequence());
        int resyncsAfterLegacyGuard = (int) transport.sent.stream()
                .filter(message -> message.messageType == MessageType.RESYNC).count();
        Assert.assertEquals("Legacy EVENT_BATCH guard requests recovery instead of replaying the event",
                resyncsBeforeLegacyGuard + 1, resyncsAfterLegacyGuard);
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

        Heap remainsHeap = new Heap();
        remainsHeap.setMultiplayerHeapId("stable-remains-heap-0001");
        remainsHeap.pos = heapPos + 1;
        remainsHeap.type = Heap.Type.REMAINS;
        Dewdrop dew = new Dewdrop();
        remainsHeap.items.addLast(dew);
        remainsHeap.items.addLast(new IronKey(Dungeon.depth));
        remainsHeap.items.addLast(new CorpseDust());
        Map<String, Object> remainsRow = new HashMap<>();
        remainsRow.put("heapId", remainsHeap.multiplayerHeapId());
        remainsRow.put("pos", remainsHeap.pos);
        remainsRow.put("type", remainsHeap.type.name());
        remainsRow.put("seen", false);
        remainsRow.put("haunted", false);
        remainsRow.put("hidden", false);
        remainsRow.put("autoExplored", false);
        ArrayList<Map<String, Object>> remainsItems = new ArrayList<>();
        for (Item item : remainsHeap.items) {
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
            remainsItems.add(itemRow);
        }
        remainsRow.put("items", remainsItems);
        snapshot.heaps.add(remainsRow);

        Heap skeletonHeap = new Heap();
        skeletonHeap.setMultiplayerHeapId("stable-skeleton-heap-0001");
        skeletonHeap.pos = heapPos + 2;
        skeletonHeap.type = Heap.Type.SKELETON;
        Item skeletonItem = new Item();
        skeletonHeap.items.addLast(skeletonItem);
        Map<String, Object> skeletonRow = new HashMap<>();
        skeletonRow.put("heapId", skeletonHeap.multiplayerHeapId());
        skeletonRow.put("pos", skeletonHeap.pos);
        skeletonRow.put("type", skeletonHeap.type.name());
        skeletonRow.put("seen", true);
        skeletonRow.put("haunted", false);
        skeletonRow.put("hidden", false);
        skeletonRow.put("autoExplored", false);
        Bundle skeletonItemBundle = new Bundle();
        skeletonItemBundle.put("item", skeletonItem);
        Map<String, Object> skeletonItemRow = new HashMap<>();
        skeletonItemRow.put("itemId", skeletonItem.multiplayerItemId());
        skeletonItemRow.put("className", skeletonItem.getClass().getName());
        skeletonItemRow.put("quantity", skeletonItem.quantity());
        skeletonItemRow.put("level", skeletonItem.level());
        skeletonItemRow.put("cursed", skeletonItem.cursed);
        skeletonItemRow.put("cursedKnown", skeletonItem.cursedKnown);
        skeletonItemRow.put("stackable", skeletonItem.stackable);
        skeletonItemRow.put("serializedBundle", skeletonItemBundle.toString());
        skeletonRow.put("items", java.util.Collections.singletonList(skeletonItemRow));
        snapshot.heaps.add(skeletonRow);

        Heap lostBackpackHeap = new Heap();
        lostBackpackHeap.setMultiplayerHeapId("phase8-lost-backpack-heap-0001");
        lostBackpackHeap.pos = heapPos + 3;
        lostBackpackHeap.type = Heap.Type.HEAP;
        LostBackpack lostBackpack = new LostBackpack();
        lostBackpack.setMultiplayerItemId("phase8-lost-backpack-item-0001");
        lostBackpackHeap.items.addLast(lostBackpack);
        Bundle lostBackpackBundle = new Bundle();
        lostBackpackBundle.put("item", lostBackpack);
        Map<String, Object> lostBackpackItemRow = new HashMap<>();
        lostBackpackItemRow.put("itemId", lostBackpack.multiplayerItemId());
        lostBackpackItemRow.put("className", lostBackpack.getClass().getName());
        lostBackpackItemRow.put("quantity", lostBackpack.quantity());
        lostBackpackItemRow.put("level", lostBackpack.level());
        lostBackpackItemRow.put("cursed", lostBackpack.cursed);
        lostBackpackItemRow.put("cursedKnown", lostBackpack.cursedKnown);
        lostBackpackItemRow.put("stackable", lostBackpack.stackable);
        lostBackpackItemRow.put("serializedBundle", lostBackpackBundle.toString());
        Map<String, Object> lostBackpackRow = new HashMap<>();
        lostBackpackRow.put("heapId", lostBackpackHeap.multiplayerHeapId());
        lostBackpackRow.put("pos", lostBackpackHeap.pos);
        lostBackpackRow.put("type", lostBackpackHeap.type.name());
        lostBackpackRow.put("seen", true);
        lostBackpackRow.put("haunted", false);
        lostBackpackRow.put("hidden", false);
        lostBackpackRow.put("autoExplored", false);
        lostBackpackRow.put("items", java.util.Collections.singletonList(lostBackpackItemRow));
        snapshot.heaps.add(lostBackpackRow);

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

        Heap restoredRemains = level.heaps.get(heapPos + 1);
        Assert.assertNotNull("Remains heap must survive a full snapshot", restoredRemains);
        Assert.assertEquals(Heap.Type.REMAINS, restoredRemains.type);
        Assert.assertEquals(3, restoredRemains.items.size());
        Assert.assertTrue(restoredRemains.items.get(0) instanceof Dewdrop);
        Assert.assertEquals(1, restoredRemains.items.get(0).quantity());
        Assert.assertTrue(restoredRemains.items.get(1) instanceof IronKey);
        Assert.assertTrue(restoredRemains.items.get(2) instanceof CorpseDust);
        Heap restoredSkeleton = level.heaps.get(heapPos + 2);
        Assert.assertNotNull("Skeleton/bones heap must survive a full snapshot", restoredSkeleton);
        Assert.assertEquals(Heap.Type.SKELETON, restoredSkeleton.type);
        Assert.assertEquals(1, restoredSkeleton.items.size());
        Heap restoredLostBackpackHeap = level.heaps.get(heapPos + 3);
        Assert.assertNotNull("The post-Ankh LostBackpack heap must survive resynchronization",
                restoredLostBackpackHeap);
        Assert.assertEquals(Heap.Type.HEAP, restoredLostBackpackHeap.type);
        Assert.assertEquals(1, restoredLostBackpackHeap.items.size());
        Assert.assertTrue(restoredLostBackpackHeap.items.getFirst() instanceof LostBackpack);
        Assert.assertEquals("phase8-lost-backpack-item-0001",
                restoredLostBackpackHeap.items.getFirst().multiplayerItemId());

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
        Assert.assertEquals(4, level.heaps.keyArray().length);
        Assert.assertEquals(1, level.traps.keyArray().length);
        Assert.assertEquals(1, level.plants.keyArray().length);
        Assert.assertEquals(1, level.blobs.size());
        Assert.assertEquals(2, level.heaps.get(heapPos).items.size());
        Assert.assertEquals(1, level.heaps.get(heapPos + 3).items.size());
        Assert.assertTrue(level.heaps.get(heapPos + 3).items.getFirst() instanceof LostBackpack);
        Assert.assertEquals("phase8-lost-backpack-item-0001",
                level.heaps.get(heapPos + 3).items.getFirst().multiplayerItemId());
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
    public void nativeMobTimedBuffRestorePreservesConcurrentCooldownsAndDoesNotResurrectExpiredEffects() throws Exception {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        manager.startSession("native-mob-timed-buff-restore", "client-publisher", new TestTransport());
        Rat mob = addRat(hero.pos + 1, 17);
        String entityId = "native-mob-timed-buff-0001";
        manager.registerServerEntityId(mob.id(), entityId);

        Haste activeHaste = Buff.affect(mob, Haste.class, Haste.DURATION);
        Weakness activeWeakness = Buff.affect(mob, Weakness.class, Weakness.DURATION);
        Assert.assertNotNull(activeHaste);
        Assert.assertNotNull(activeWeakness);
        activeHaste.restoreMultiplayerCooldown(3.75f);
        activeWeakness.restoreMultiplayerCooldown(5.25f);
        float expectedHasteCooldown = activeHaste.cooldown();
        float expectedWeaknessCooldown = activeWeakness.cooldown();
        WorldSnapshot activeSnapshot = makeSnapshotWithMob(1L, mob, entityId);

        activeHaste.detach();
        activeWeakness.detach();
        Assert.assertNull(mob.buff(Haste.class));
        Assert.assertNull(mob.buff(Weakness.class));
        Assert.assertTrue("The authoritative Mob snapshot must restore every concurrent native timed effect",
                WorldSnapshot.restoreWorld(activeSnapshot));
        Mob restoredMob = findMobByServerId(manager, entityId);
        Assert.assertNotNull(restoredMob);
        Haste restoredHaste = restoredMob.buff(Haste.class);
        Weakness restoredWeakness = restoredMob.buff(Weakness.class);
        Assert.assertNotNull("The Mob's Haste effect must survive reconstruction", restoredHaste);
        Assert.assertNotNull("The Mob's concurrent Weakness effect must survive reconstruction", restoredWeakness);
        Assert.assertEquals(expectedHasteCooldown, restoredHaste.cooldown(), 0.02f);
        Assert.assertEquals(expectedWeaknessCooldown, restoredWeakness.cooldown(), 0.02f);
        int hasteCount = 0, weaknessCount = 0;
        for (Buff buff : restoredMob.buffs()) {
            if (buff instanceof Haste) hasteCount++;
            if (buff instanceof Weakness) weaknessCount++;
        }
        Assert.assertEquals("Haste must not be duplicated by full snapshot restoration", 1, hasteCount);
        Assert.assertEquals("Weakness must not be duplicated by full snapshot restoration", 1, weaknessCount);

        Assert.assertTrue("Reapplying the same concurrent snapshot must remain idempotent",
                WorldSnapshot.restoreWorld(activeSnapshot));
        restoredHaste = restoredMob.buff(Haste.class);
        restoredWeakness = restoredMob.buff(Weakness.class);
        Assert.assertNotNull(restoredHaste);
        Assert.assertNotNull(restoredWeakness);
        Assert.assertEquals(expectedHasteCooldown, restoredHaste.cooldown(), 0.02f);
        Assert.assertEquals(expectedWeaknessCooldown, restoredWeakness.cooldown(), 0.02f);
        hasteCount = 0;
        weaknessCount = 0;
        for (Buff buff : restoredMob.buffs()) {
            if (buff instanceof Haste) hasteCount++;
            if (buff instanceof Weakness) weaknessCount++;
        }
        Assert.assertEquals(1, hasteCount);
        Assert.assertEquals(1, weaknessCount);

        restoredHaste.detach();
        restoredWeakness.detach();
        Assert.assertNull(restoredMob.buff(Haste.class));
        Assert.assertNull(restoredMob.buff(Weakness.class));
        WorldSnapshot expiredSnapshot = makeSnapshotWithMob(2L, restoredMob, entityId);
        Buff.affect(restoredMob, Haste.class, Haste.DURATION);
        Buff.affect(restoredMob, Weakness.class, Weakness.DURATION);
        Assert.assertNotNull(restoredMob.buff(Haste.class));
        Assert.assertNotNull(restoredMob.buff(Weakness.class));
        Assert.assertTrue("A snapshot with both effects expired must remove stale local replicas",
                WorldSnapshot.restoreWorld(expiredSnapshot));
        Assert.assertNull("Expired Haste must not be resurrected", restoredMob.buff(Haste.class));
        Assert.assertNull("Expired Weakness must not be resurrected", restoredMob.buff(Weakness.class));
        Assert.assertTrue(WorldSnapshot.restoreWorld(expiredSnapshot));
        Assert.assertNull("Repeated restore must keep expired Haste absent", restoredMob.buff(Haste.class));
        Assert.assertNull("Repeated restore must keep expired Weakness absent", restoredMob.buff(Weakness.class));
    }

    @Test
    public void localHeroSnapshotRestoresRunProgressDroppedItemsAndInventoryIdempotently() {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        manager.startSession("phase8-run-progress-reconnect", "phase8-run-progress-player", new TestTransport());
        // Reset process-global slots because headless JVM tests share one native QuickSlot.
        Dungeon.quickslot.reset();

        Notes.reset();
        Assert.assertTrue(Notes.add(Notes.Landmark.GHOST, Dungeon.depth));
        Bundle ghostQuestNode = new Bundle();
        ghostQuestNode.put("spawned", true);
        ghostQuestNode.put("type", 1);
        ghostQuestNode.put("given", true);
        ghostQuestNode.put("depth", Dungeon.depth);
        ghostQuestNode.put("processed", true);
        Bundle ghostQuestState = new Bundle();
        ghostQuestState.put("sadGhost", ghostQuestNode);
        Ghost.Quest.restoreFromBundle(ghostQuestState);
        Imp.Quest.reset();

        // These static native SPD systems affect future run rewards and item generation.
        Ring.initGems();
        SpecialRoom.initForRun();
        SecretRoom.initForRun();
        Dungeon.chapters = new HashSet<>();
        Dungeon.chapters.add(2);
        Dungeon.generatedLevels.clear();
        Dungeon.generatedLevels.add(1);
        Dungeon.droppedItems = new SparseArray<>();

        Statistics.goldCollected = 37;
        Statistics.enemiesSlain = 9;
        Statistics.ankhsUsed = 2;
        Dungeon.LimitedDrops.UPGRADE_SCROLLS.count = 2;
        Bundle catalogState = new Bundle();
        catalogState.put("catalog_classes", new Class[]{PotionOfHealing.class});
        catalogState.put("catalog_seen", new boolean[]{true});
        catalogState.put("catalog_uses", new int[]{2});
        Catalog.restoreMultiplayer(catalogState);

        Item carriedStack = new Item();
        carriedStack.stackable = true;
        carriedStack.quantity(4);
        carriedStack.setMultiplayerItemId("phase8-carried-stack-0001");
        hero.belongings.backpack.items.add(carriedStack);
        Dungeon.quickslot.setSlot(0, carriedStack);

        Dagger equippedWeapon = new Dagger();
        equippedWeapon.setMultiplayerItemId("phase8-equipped-dagger-0001");
        equippedWeapon.level(2);
        equippedWeapon.levelKnown = true;
        equippedWeapon.cursed = true;
        equippedWeapon.cursedKnown = true;
        hero.belongings.weapon = equippedWeapon;

        Bag nestedBag = new Bag();
        nestedBag.setMultiplayerItemId("phase8-nested-bag-0001");
        Item nestedBagItem = new Item();
        nestedBagItem.setMultiplayerItemId("phase8-nested-item-0001");
        nestedBag.items.add(nestedBagItem);
        hero.belongings.backpack.items.add(nestedBag);
        Dungeon.quickslot.setSlot(1, nestedBagItem);

        // Zero-quantity quickslot placeholders are part of the run state too; they must not
        // become phantom owned items or disappear after reconnect.
        Item emptyPlaceholder = new Item();
        emptyPlaceholder.quantity(0);
        emptyPlaceholder.setMultiplayerItemId("phase8-quickslot-placeholder-0001");
        Dungeon.quickslot.setSlot(2, emptyPlaceholder);

        CorpseDust questItem = new CorpseDust();
        questItem.setMultiplayerItemId("phase8-corpse-dust-0001");
        hero.belongings.backpack.items.add(questItem);

        Item pendingDrop = new Item();
        pendingDrop.setMultiplayerItemId("phase8-pending-drop-0001");
        ArrayList<Item> pendingDrops = new ArrayList<>();
        pendingDrops.add(pendingDrop);
        Dungeon.droppedItems.put(3, pendingDrops);

        WorldSnapshot authoritativeSnapshot = makeSnapshotWithMob(1L, null, null);
        String encodedHero = authoritativeSnapshot.playerStateJson.get(manager.getLocalPlayerId());
        JsonValue encodedRoot = new JsonReader().parse(encodedHero);
        JsonValue runProgress = encodedRoot.get("runProgressBundle");
        Assert.assertNotNull("The local Hero snapshot must include native run progress", runProgress);
        Assert.assertTrue(MultiplayerRunProgress.isValid(runProgress.asString()));
        Assert.assertTrue("The native journal must be part of the saved Hero state",
                encodedRoot.getString("notesBundle").length() > 0);
        Assert.assertTrue("The native NPC quest flags must be part of the saved Hero state",
                encodedRoot.getString("questStateBundle").length() > 0);
        Assert.assertTrue("Run progress is bounded before transport",
                runProgress.asString().length() <= MultiplayerRunProgress.MAX_ENCODED_LENGTH);
        Bundle staleImpNode = new Bundle();
        staleImpNode.put("spawned", true);
        staleImpNode.put("alternative", true);
        staleImpNode.put("given", true);
        staleImpNode.put("completed", true);
        Bundle staleImpState = new Bundle();
        staleImpState.put("demon", staleImpNode);
        Imp.Quest.restoreFromBundle(staleImpState);
        Assert.assertTrue(Imp.Quest.isCompleted());

        String quickslotsJson = encodedRoot.getString("quickslotsJson");
        System.out.println("PHASE8_QUICKSLOTS_JSON=" + quickslotsJson);
        JsonValue quickslotArray = new JsonReader().parse(quickslotsJson);
        Assert.assertEquals("The snapshot contains all three native quickslot references", 3, quickslotArray.size);
        Assert.assertNotNull(quickslotArray.get(0).get("serializedBundle"));
        Assert.assertNotNull(quickslotArray.get(1).get("serializedBundle"));
        Assert.assertEquals(0, quickslotArray.get(2).getInt("quantity"));

        // Simulate reconnect after live static data and local native objects have been lost.
        Statistics.goldCollected = 0;
        Statistics.enemiesSlain = 0;
        Statistics.ankhsUsed = 0;
        Dungeon.LimitedDrops.UPGRADE_SCROLLS.count = 0;
        Bundle staleCatalogState = new Bundle();
        staleCatalogState.put("catalog_classes", new Class[]{PotionOfHealing.class, ScrollOfIdentify.class});
        staleCatalogState.put("catalog_seen", new boolean[]{true, true});
        staleCatalogState.put("catalog_uses", new int[]{2, 1});
        Catalog.restoreMultiplayer(staleCatalogState);
        Dungeon.chapters.clear();
        Dungeon.generatedLevels.clear();
        Dungeon.droppedItems = new SparseArray<>();
        Notes.reset();
        Ghost.Quest.reset();
        hero.belongings.backpack.items.clear();
        hero.belongings.weapon = null;
        Dungeon.quickslot.reset();

        Assert.assertTrue("The authoritative full-world snapshot must restore",
                WorldSnapshot.restoreWorld(authoritativeSnapshot));
        Assert.assertTrue("Reapplying the same full-world snapshot must remain idempotent",
                WorldSnapshot.restoreWorld(authoritativeSnapshot));

        Assert.assertEquals("Statistics are restored exactly, not incremented twice", 37, Statistics.goldCollected);
        Assert.assertEquals(9, Statistics.enemiesSlain);
        Assert.assertEquals(2, Statistics.ankhsUsed);
        Assert.assertEquals(2, Dungeon.LimitedDrops.UPGRADE_SCROLLS.count);
        Assert.assertTrue(Catalog.isSeen(PotionOfHealing.class));
        Assert.assertEquals(2, Catalog.useCount(PotionOfHealing.class));
        Assert.assertFalse("A stale prior-run item must not remain identified",
                Catalog.isSeen(ScrollOfIdentify.class));
        Assert.assertEquals(0, Catalog.useCount(ScrollOfIdentify.class));
        Assert.assertTrue(Dungeon.chapters.contains(2));
        Assert.assertTrue(Dungeon.generatedLevels.contains(1));
        Assert.assertEquals(1, Dungeon.droppedItems.get(3).size());
        Assert.assertEquals("phase8-pending-drop-0001",
                Dungeon.droppedItems.get(3).get(0).multiplayerItemId());
        Assert.assertTrue("The journal must be restored from the authoritative snapshot",
                Notes.contains(Notes.Landmark.GHOST, Dungeon.depth));
        Assert.assertTrue("NPC quest completion flags must survive reconnect and repeated resync",
                Ghost.Quest.processed());
        Assert.assertFalse("A quest absent from the saved run must not remain completed after restore",
                Imp.Quest.isCompleted());
        Assert.assertNull("A stale unearned Imp reward must not survive resynchronization", Imp.Quest.reward);

        int carriedCount = 0;
        Item restoredStack = null;
        for (Item item : hero.belongings.getAllItems(Item.class)) {
            if ("phase8-carried-stack-0001".equals(item.multiplayerItemId())) {
                carriedCount++;
                restoredStack = item;
            }
        }
        Assert.assertEquals("Repeated restoration must not duplicate a carried item", 1, carriedCount);
        Assert.assertNotNull(restoredStack);
        Assert.assertEquals(4, restoredStack.quantity());
        Assert.assertSame("Quickslots must point at the restored owned instance",
                restoredStack, Dungeon.quickslot.getItem(0));
        Assert.assertNotNull("The native equipped weapon must be restored", hero.belongings.weapon);
        Assert.assertEquals("phase8-equipped-dagger-0001", hero.belongings.weapon.multiplayerItemId());
        Assert.assertEquals(2, hero.belongings.weapon.level());
        Assert.assertTrue(hero.belongings.weapon.cursed);
        Assert.assertTrue(hero.belongings.weapon.cursedKnown);

        Bag restoredNestedBag = null;
        CorpseDust restoredQuestItem = null;
        for (Item item : hero.belongings.backpack.items) {
            if (item instanceof Bag && !(item instanceof com.shatteredpixel.shatteredpixeldungeon.actors.hero.Belongings.Backpack)) {
                restoredNestedBag = (Bag)item;
            }
            if (item instanceof CorpseDust) restoredQuestItem = (CorpseDust)item;
        }
        Assert.assertNotNull("Nested inventory containers must be restored", restoredNestedBag);
        Assert.assertEquals("phase8-nested-bag-0001", restoredNestedBag.multiplayerItemId());
        StringBuilder nestedItemsDiagnostic = new StringBuilder();
        for (Item item : restoredNestedBag.items) {
            if (nestedItemsDiagnostic.length() > 0) nestedItemsDiagnostic.append(" | ");
            nestedItemsDiagnostic.append(item.getClass().getName()).append("#")
                    .append(item.multiplayerItemId()).append(" x").append(item.quantity());
        }
        System.out.println("PHASE8_NESTED_BAG_ITEMS=" + nestedItemsDiagnostic);
        Assert.assertEquals("Nested bag contents must match its exact native bundle: " + nestedItemsDiagnostic,
                1, restoredNestedBag.items.size());
        Item restoredNestedItem = restoredNestedBag.items.get(0);
        Assert.assertEquals("phase8-nested-item-0001", restoredNestedItem.multiplayerItemId());
        Assert.assertSame("Quickslots must rebind to the nested restored item",
                restoredNestedItem, Dungeon.quickslot.getItem(1));
        Item restoredPlaceholder = Dungeon.quickslot.getItem(2);
        Assert.assertNotNull("Empty quickslot placeholders must survive reconnect", restoredPlaceholder);
        Assert.assertEquals("phase8-quickslot-placeholder-0001", restoredPlaceholder.multiplayerItemId());
        Assert.assertEquals(0, restoredPlaceholder.quantity());
        Assert.assertNotNull("Quest items must remain in the player's inventory", restoredQuestItem);
        Assert.assertEquals("phase8-corpse-dust-0001", restoredQuestItem.multiplayerItemId());
    }

    @Test
    public void runProgressBundleRejectsMalformedOrUnboundedNativeDataBeforeRestore() {
        Assert.assertFalse(MultiplayerRunProgress.isValid(""));
        Assert.assertFalse(MultiplayerRunProgress.isValid("not-a-native-bundle"));
        Assert.assertFalse(MultiplayerRunProgress.isValid(
                "x".repeat(MultiplayerRunProgress.MAX_ENCODED_LENGTH + 1)));

        MultiplayerManager manager = MultiplayerManager.getInstance();
        manager.startSession("phase8-invalid-run-state", "phase8-invalid-run-state-player", new TestTransport());
        Rat liveMob = addRat(hero.pos + 1, 7);
        WorldSnapshot snapshot = makeSnapshotWithMob(2L, null, null);

        Bundle combat = new Bundle();
        hero.storeInBundle(combat);
        Bundle inventory = new Bundle();
        hero.belongings.storeInBundle(inventory);
        Bundle invalidHeroState = new Bundle();
        invalidHeroState.put("combatBundle", combat.toString());
        invalidHeroState.put("inventoryBundle", inventory.toString());
        invalidHeroState.put("hp", hero.HP);
        invalidHeroState.put("ht", hero.HT);
        invalidHeroState.put("pos", hero.pos);
        invalidHeroState.put("shielding", hero.shielding());
        invalidHeroState.put("cooldown", Math.max(0f, hero.cooldown()));
        invalidHeroState.put("buffCount", 0);
        invalidHeroState.put("runProgressBundle", "not-a-native-bundle");
        snapshot.playerStateJson.put(manager.getLocalPlayerId(), invalidHeroState.toString());

        Assert.assertFalse("An invalid run-progress bundle must fail snapshot preflight",
                WorldSnapshot.validateForRestore(snapshot));
        Assert.assertFalse("A malformed run must not partially mutate the live world",
                WorldSnapshot.restoreWorld(snapshot));
        Bundle invalidJournalState = new Bundle();
        invalidJournalState.put("combatBundle", combat.toString());
        invalidJournalState.put("inventoryBundle", inventory.toString());
        invalidJournalState.put("hp", hero.HP);
        invalidJournalState.put("ht", hero.HT);
        invalidJournalState.put("pos", hero.pos);
        invalidJournalState.put("shielding", hero.shielding());
        invalidJournalState.put("cooldown", Math.max(0f, hero.cooldown()));
        invalidJournalState.put("buffCount", 0);
        invalidJournalState.put("runProgressBundle", MultiplayerRunProgress.store());
        invalidJournalState.put("notesBundle", "not-a-native-bundle");
        snapshot.playerStateJson.put(manager.getLocalPlayerId(), invalidJournalState.toString());
        Assert.assertFalse("Malformed native journal data must fail preflight",
                WorldSnapshot.validateForRestore(snapshot));
        Assert.assertFalse("Malformed journal data must not be partially applied",
                WorldSnapshot.restoreWorld(snapshot));
        Assert.assertTrue("The live Mob must remain after preflight rejection", level.mobs.contains(liveMob));
        Assert.assertSame(liveMob, Actor.findById(liveMob.id()));
        Assert.assertEquals(20, hero.HP);
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
        NetworkMessage authorityReport = transport.sent.stream()
                .filter(message -> message.messageType == MessageType.ACTION
                        && message.payloadJson != null
                        && message.payloadJson.contains("SYNC_MOB_STATE"))
                .findFirst().orElse(null);
        Assert.assertNotNull("RemoteHero must serialize the native publisher combat result", authorityReport);
        JsonValue authorityData = new JsonReader().parse(authorityReport.payloadJson).get("data");
        Assert.assertNotNull("The native combat result must include attackerPos", authorityData.get("attackerPos"));
        Assert.assertEquals("attackerPos must come from the actual RemoteHero native pre-state",
                remoteHero.pos, authorityData.getInt("attackerPos"));
        Assert.assertEquals("The serialized attacker identity must be the delegated remote player",
                "client-attacker", authorityData.getString("attackerId"));
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
    public void nonPublisherPoisonLifeLinkTickRejectsAndResyncsWithoutApplyingMobDamage() {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        TestTransport transport = new TestTransport();
        manager.startSession("runtime-non-publisher-poison-lifelink", "client-peer", transport);
        NetworkMessage session = new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"client-peer\",\"sessionToken\":\"poison-life-link-peer-token\","
                        + "\"isLevelPublisher\":false,\"sequence\":1,\"seed\":123456,\"depth\":1}");
        session.sequence = 1L;
        manager.onMessageReceived(session);
        Assert.assertFalse(manager.isLevelPublisher());

        Rat linked = addRat(hero.pos + 1, 20);
        manager.registerServerEntityId(linked.id(), "nonpublisher-poison-linked-mob-0001");
        LifeLink link = Buff.prolong(hero, LifeLink.class, 10f);
        link.object = linked.id();
        Poison poison = Buff.affect(hero, Poison.class);
        poison.set(9f);
        int heroHpBefore = hero.HP;
        int mobHpBefore = linked.HP;

        NativeHeroBuffTickPublisher.TickCapture capture = NativeHeroBuffTickPublisher.capture(poison);
        Assert.assertNotNull(capture);
        Assert.assertTrue(poison.act());
        NativeHeroBuffTickPublisher.publish(capture);

        Assert.assertEquals("A non-publisher must not apply the shared Mob's LifeLink damage locally",
                mobHpBefore, linked.HP);
        Assert.assertEquals("The local native prediction splits Poison damage before the server rejects it",
                heroHpBefore - 2, hero.HP);
        NetworkMessage tick = transport.sent.stream()
                .filter(message -> message.messageType == MessageType.ACTION
                        && message.payloadJson != null
                        && message.payloadJson.contains("\"action\":\"SYNC_HERO_STATE\""))
                .findFirst().orElse(null);
        Assert.assertNotNull("The unsupported non-publisher tick must reach the server for fail-closed validation", tick);
        JsonValue data = new JsonReader().parse(tick.payloadJson).get("data");
        Assert.assertEquals("BUFF_TICK", data.getString("sourceType", ""));
        Assert.assertEquals("com.shatteredpixel.shatteredpixeldungeon.actors.buffs.Poison",
                data.getString("buffClass", ""));
        JsonValue secondary = new JsonReader().parse(data.getString("secondaryMobDeltas", ""));
        Assert.assertNotNull(secondary);
        Assert.assertTrue(secondary.getBoolean("complete", false));
        Assert.assertEquals("The non-publisher cannot report a Mob HP mutation", 0,
                secondary.get("deltas").size);

        NetworkMessage rejected = new NetworkMessage();
        rejected.messageType = MessageType.ERROR;
        rejected.requestId = tick.requestId;
        rejected.sequence = 1L;
        rejected.payloadJson = "{\"error\":\"BUFF_TICK_MOB_AUTHORITY_REQUIRED\"}";
        manager.onMessageReceived(rejected);
        Assert.assertTrue("Rejecting the Hero Buff tick must request a full authoritative snapshot",
                transport.sent.stream().anyMatch(message -> message.messageType == MessageType.RESYNC));
    }

    @Test
    public void rejectedNonPublisherPoisonLifeLinkTickRestoresHeroBuffsAndMobFromFullSnapshot() throws Exception {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        TestTransport transport = new TestTransport();
        manager.startSession("runtime-non-publisher-poison-snapshot", "client-peer", transport);
        NetworkMessage session = new NetworkMessage(MessageType.SESSION,
                "{\"playerId\":\"client-peer\",\"sessionToken\":\"poison-snapshot-token\","
                        + "\"isLevelPublisher\":false,\"sequence\":1,\"seed\":123456,\"depth\":1}");
        session.sequence = 1L;
        manager.onMessageReceived(session);
        Assert.assertFalse(manager.isLevelPublisher());

        Rat linked = addRat(hero.pos + 1, 20);
        String linkedEntityId = "nonpublisher-poison-snapshot-mob-0001";
        manager.registerServerEntityId(linked.id(), linkedEntityId);
        LifeLink lifeLink = Buff.prolong(hero, LifeLink.class, 10f);
        lifeLink.object = linked.id();
        Poison poison = Buff.affect(hero, Poison.class);
        poison.set(9f);

        int authoritativeHeroHp = hero.HP;
        int authoritativeMobHp = linked.HP;
        String authoritativeHeroStateJson = SPDLevelSnapshot.currentHeroStateJson();
        JsonValue expectedPoison = findBuffState(authoritativeHeroStateJson, Poison.class.getName());
        JsonValue expectedLifeLink = findBuffState(authoritativeHeroStateJson, LifeLink.class.getName());
        Assert.assertNotNull(expectedPoison);
        Assert.assertNotNull(expectedLifeLink);
        float expectedPoisonLeft = expectedPoison.getFloat("left", -1f);
        float expectedPoisonActorTime = expectedPoison.getFloat("time", -1f);
        float expectedLifeLinkActorTime = expectedLifeLink.getFloat("time", -1f);

        NativeHeroBuffTickPublisher.TickCapture capture = NativeHeroBuffTickPublisher.capture(poison);
        Assert.assertNotNull(capture);
        Assert.assertTrue(poison.act());
        NativeHeroBuffTickPublisher.publish(capture);

        Assert.assertEquals("The optimistic non-publisher tick must not mutate the shared Mob",
                authoritativeMobHp, linked.HP);
        Assert.assertEquals("The rejected local prediction is visible until an authoritative snapshot arrives",
                authoritativeHeroHp - 2, hero.HP);

        NetworkMessage tick = transport.sent.stream()
                .filter(message -> message.messageType == MessageType.ACTION
                        && message.payloadJson != null
                        && message.payloadJson.contains("\"action\":\"SYNC_HERO_STATE\""))
                .findFirst().orElse(null);
        Assert.assertNotNull(tick);
        NetworkMessage rejected = new NetworkMessage();
        rejected.messageType = MessageType.ERROR;
        rejected.requestId = tick.requestId;
        rejected.sequence = 1L;
        rejected.payloadJson = "{\"error\":\"BUFF_TICK_MOB_AUTHORITY_REQUIRED\"}";
        manager.onMessageReceived(rejected);

        Assert.assertTrue("A rejected Hero tick must request a full authoritative snapshot",
                transport.sent.stream().anyMatch(message -> message.messageType == MessageType.RESYNC));

        // Build the same full SNAPSHOT envelope the MatchRoom RESYNC path returns. The saved
        // player Hero state is the pre-tick authority; the level carries all native world rows.
        String levelJson = SPDLevelSnapshot.currentLevelJson();
        Assert.assertNotNull(levelJson);
        JsonValue levelData = new JsonReader().parse(levelJson);
        Assert.assertNotNull(levelData);
        JsonValue mobRows = levelData.get("mobs");
        Assert.assertNotNull(mobRows);
        String playersJson = "[{\"player_id\":\"client-peer\",\"class_name\":\"WARRIOR\","
                + "\"pos\":" + hero.pos + ",\"hp\":" + authoritativeHeroHp
                + ",\"ht\":" + hero.HT + ",\"state\":\"ALIVE\",\"hero_state_json\":"
                + new Json().toJson(authoritativeHeroStateJson) + "}]";
        String snapshotPayload = "{\"sequence\":1,\"seed\":123456,\"depth\":1,"
                + "\"gameMode\":\"COOP_DUNGEON\",\"players\":" + playersJson
                + ",\"mobs\":" + mobRows.toJson(com.badlogic.gdx.utils.JsonWriter.OutputType.json)
                + ",\"events\":[],\"worldTime\":0,\"level\":" + levelJson + "}";

        JsonValue encodedSnapshot = new JsonReader().parse(snapshotPayload);
        JsonValue encodedLevel = encodedSnapshot == null ? null : encodedSnapshot.get("level");
        Assert.assertNotNull("The full RESYNC envelope must include the native level object", encodedLevel);
        Assert.assertEquals("Full native level schema must be version 1", 1, encodedLevel.getInt("schemaVersion", -1));
        Assert.assertEquals("Default branch zero must be explicitly serialized", 0, encodedLevel.getInt("branch", -1));
        Assert.assertNotNull("The default-valued lock flag must be explicitly serialized", encodedLevel.get("locked"));
        Assert.assertFalse(encodedLevel.getBoolean("locked", true));
        Assert.assertEquals("The first tile at position zero must not be omitted by prototype serialization",
                0, encodedLevel.get("tiles").get(0).getInt("pos", -1));
        for (String collection : new String[]{
                "tiles", "transitions", "heaps", "traps", "blobs", "plants", "mobs",
                "visitedPositions", "mappedPositions"
        }) {
            Assert.assertTrue("The full native level must include array " + collection,
                    encodedLevel.get(collection) != null && encodedLevel.get(collection).isArray());
        }
        Assert.assertTrue("The full native level must include restorable metadata",
                encodedLevel.getString("nativeLevelMetadataBundle", "").length() > 0);
        Assert.assertNotNull("The test must retain its live Dungeon level during snapshot application", Dungeon.level);
        JsonValue encodedLevelMobs = encodedLevel.get("mobs");
        for (JsonValue rootMob = encodedSnapshot.get("mobs").child; rootMob != null; rootMob = rootMob.next) {
            int rootMobId = rootMob.getInt("mobId", rootMob.getInt("mob_id", -1));
            boolean matchingNativeMob = false;
            for (JsonValue levelMob = encodedLevelMobs.child; levelMob != null; levelMob = levelMob.next) {
                if (levelMob.getInt("mobId", levelMob.getInt("mob_id", -1)) == rootMobId) {
                    matchingNativeMob = true;
                    break;
                }
            }
            Assert.assertTrue("Every live Mob row in the snapshot envelope must match a native Mob bundle: " + rootMobId,
                    matchingNativeMob);
        }
        JsonValue encodedPlayers = encodedSnapshot == null ? null : encodedSnapshot.get("players");
        Assert.assertNotNull("The RESYNC payload must include the player rows", encodedPlayers);
        Assert.assertTrue(encodedPlayers.isArray());
        Assert.assertEquals("client-peer", encodedPlayers.get(0).getString("player_id", ""));
        Assert.assertEquals("The root player row must carry the authoritative pre-tick HP",
                authoritativeHeroHp, encodedPlayers.get(0).getInt("hp", -1));
        Assert.assertEquals("The root player row must carry the exact pre-tick native Hero bundle",
                authoritativeHeroStateJson, encodedPlayers.get(0).getString("hero_state_json", ""));
        Assert.assertEquals("The manager must resolve the local player row by the session identity",
                "client-peer", manager.getLocalPlayerId());

        NetworkMessage snapshot = new NetworkMessage();
        snapshot.messageType = MessageType.SNAPSHOT;
        snapshot.senderId = "SERVER";
        snapshot.sequence = 1L;
        snapshot.payloadJson = snapshotPayload;
        manager.onMessageReceived(snapshot);

        // Snapshot parsing is transport-thread safe, but native state replacement is queued
        // onto the render thread. A second queued task acts as a FIFO completion barrier.
        CountDownLatch snapshotApplied = new CountDownLatch(1);
        Game.runOnRenderThread(snapshotApplied::countDown);
        Assert.assertTrue("The authoritative SNAPSHOT must finish applying on the render thread",
                snapshotApplied.await(5, TimeUnit.SECONDS));

        String restoreDiagnostic = WorldSnapshot.lastRestoreDiagnostic();
        Assert.assertTrue("The full authoritative snapshot must apply successfully: " + restoreDiagnostic,
                restoreDiagnostic.startsWith("applied sequence 1 "));
        Assert.assertTrue("The server snapshot must include the local player's pre-tick HP: " + restoreDiagnostic,
                restoreDiagnostic.contains("snapshotHp=" + authoritativeHeroHp));
        Assert.assertTrue("The restored local Hero must match the snapshot inside the apply callback: "
                        + restoreDiagnostic,
                restoreDiagnostic.contains("heroHp=" + authoritativeHeroHp));
        Assert.assertTrue("The authoritative Hero Bundle must be associated with the local player: "
                        + restoreDiagnostic,
                restoreDiagnostic.contains("hasHeroBundle=true"));
        Assert.assertEquals("The rejected Hero HP delta must be rolled back by the server snapshot",
                authoritativeHeroHp, hero.HP);
        Assert.assertEquals("The native Mob must remain at its authoritative pre-tick HP",
                authoritativeMobHp, linked.HP);
        Assert.assertSame("Stable entity reconciliation must keep the same native Mob actor",
                linked, findMobByServerId(manager, linkedEntityId));

        Poison restoredPoison = hero.buff(Poison.class);
        LifeLink restoredLifeLink = hero.buff(LifeLink.class);
        Assert.assertNotNull("The native Poison Buff must be restored from the authoritative Hero bundle", restoredPoison);
        Assert.assertNotNull("The native LifeLink Buff must be restored from the authoritative Hero bundle", restoredLifeLink);
        Assert.assertEquals("LifeLink must still reference the same local Mob Actor after full restoration",
                linked.id(), restoredLifeLink.object);

        String restoredHeroStateJson = SPDLevelSnapshot.currentHeroStateJson();
        JsonValue restoredPoisonState = findBuffState(restoredHeroStateJson, Poison.class.getName());
        JsonValue restoredLifeLinkState = findBuffState(restoredHeroStateJson, LifeLink.class.getName());
        Assert.assertNotNull(restoredPoisonState);
        Assert.assertNotNull(restoredLifeLinkState);
        Assert.assertEquals("Poison's remaining duration must not restart or consume a second tick",
                expectedPoisonLeft, restoredPoisonState.getFloat("left", -1f), 0.001f);
        Assert.assertEquals("Poison's native actor clock must be restored exactly",
                expectedPoisonActorTime, restoredPoisonState.getFloat("time", -1f), 0.001f);
        Assert.assertEquals("LifeLink's native expiry clock must be restored exactly",
                expectedLifeLinkActorTime, restoredLifeLinkState.getFloat("time", -1f), 0.001f);
        Assert.assertEquals("A successfully restored snapshot advances the accepted sequence",
                1L, manager.getLastSequence());
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


    @Test
    public void acceptedSpiritArrowEventReconcilesByStableMobIdentityOnDifferentClients() throws Exception {
        final String stableMobId = "stable-spirit-arrow-reconcile-0001";
        final String bowItemId = "stable-spirit-arrow-bow-0001";
        final String requestId = "spirit-arrow-reconcile-request-0001";
        MultiplayerManager manager = MultiplayerManager.getInstance();

        TestTransport transportA = new TestTransport();
        manager.startSession("spirit-arrow-event-reconcile", "client-a", transportA);
        Rat targetA = addRat(hero.pos + 1, 20);
        int actorIdA = targetA.id();
        manager.registerServerEntityId(actorIdA, stableMobId);

        String targetMobBundleAfter = "{\"mob\":{\"__className\":"
                + "\"com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Rat\","
                + "\"id\":7,\"time\":10,\"HP\":15,\"HT\":20,\"pos\":"
                + (hero.pos + 1) + ",\"max_lvl\":29,\"buffs\":[]}}";
        String event = "[{\"sequence\":1,\"depth\":1,\"eventType\":\"PLAYER_ATTACKED\",\"action\":{"
                + "\"combatRequestId\":\"" + requestId + "\","
                + "\"attackerId\":\"client-publisher\","
                + "\"targetId\":\"" + stableMobId + "\",\"targetType\":\"MOB\","
                + "\"targetHpBefore\":20,\"targetHp\":15,\"targetHt\":20,"
                + "\"targetPos\":" + targetA.pos + ",\"targetPosAfter\":" + targetA.pos + ","
                + "\"targetMobBundleAfter\":" + new Json().toJson(targetMobBundleAfter) + ","
                + "\"damage\":5,\"hit\":true,\"engineResolved\":true,"
                + "\"attackKind\":\"RANGED\",\"attackWeaponMode\":\"SPIRIT_ARROW\","
                + "\"targetBuffs\":\"[]\","
                + "\"spiritArrow\":{\"formatVersion\":1,\"markBuffId\":77,"
                + "\"markBonus\":0.5,\"targetEntityId\":\"" + stableMobId + "\","
                + "\"bowItemId\":\"" + bowItemId + "\"}}}]";

        routeEventBatch(event, 1L);

        Assert.assertEquals("Client A resolves the accepted SpiritArrow Mob by stable identity",
                15, targetA.HP);
        Assert.assertEquals(1L, manager.getLastSequence());
        Assert.assertTrue("Mob combat scalar reconciliation must request the authoritative full snapshot",
                transportA.sent.stream().anyMatch(message -> message.messageType == MessageType.RESYNC));

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

        // Device B creates an unrelated local Mob first. Its marked Mob Actor ID must differ.
        addRat(hero.pos + 2, 8);
        Rat targetB = addRat(hero.pos + 1, 20);
        int actorIdB = targetB.id();
        Assert.assertNotEquals("SpiritArrow target Actor IDs are process-local", actorIdA, actorIdB);

        TestTransport transportB = new TestTransport();
        manager.startSession("spirit-arrow-event-reconcile", "client-b", transportB);
        manager.registerServerEntityId(actorIdB, stableMobId);
        routeEventBatch(event, 1L);

        Assert.assertEquals("Client B applies the same accepted outcome through stable Mob identity",
                15, targetB.HP);
        Assert.assertEquals(targetA.pos, targetB.pos);
        Assert.assertEquals(1L, manager.getLastSequence());
        Assert.assertTrue("Client B also requests a full authoritative snapshot after scalar Mob combat",
                transportB.sent.stream().anyMatch(message -> message.messageType == MessageType.RESYNC));
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

    private void attachHeadlessTargetSprite(Mob target) {
        // Item.cast() feeds enemy.sprite into the real MissileSprite.reset(Visual, Visual, ...)
        // overload. Give the headless Mob a lightweight native CharSprite so the test exercises
        // the original asynchronous cast path rather than failing on a missing render object.
        TestAttackSprite targetSprite = new TestAttackSprite();
        targetSprite.ch = target;
        target.sprite = targetSprite;
    }

    private static String describeFailure(RuntimeException failure) {
        return failure == null ? "none" : failure.getClass().getName() + ": " + failure.getMessage();
    }

    private void assertNativeSpiritArrowCaptureCanStart(
            Hero hero, SnipersMark mark, SpiritBow bow, String targetEntityId) {
        MultiplayerManager manager = MultiplayerManager.getInstance();
        String heroBefore = SPDLevelSnapshot.currentHeroStateJson(hero);
        String bowBundle = SPDLevelSnapshot.currentItemBundle(bow);
        java.util.Map<String, Object> details = new java.util.HashMap<>();
        details.put("formatVersion", 1);
        details.put("markBuffId", mark.id());
        details.put("markBonus", 0.5f);
        details.put("targetEntityId", targetEntityId);
        details.put("bowItemId", bow.multiplayerItemId());
        String detailsJson = NativeCombatJson.strictWriter().toJson(details);

        Assert.assertTrue("SpiritArrow preflight requires an active multiplayer session", manager.isMultiplayerActive());
        Assert.assertFalse("SpiritArrow preflight must not inherit an earlier report deferral",
                hero.hasDeferredNativeCombatReport());
        Assert.assertFalse("SpiritArrow preflight must not overlap a generic projectile mutation",
                hero.hasPendingNativeProjectileMutation());
        Assert.assertFalse("SpiritArrow preflight must not overlap a pending SpiritArrow",
                hero.hasPendingNativeSpiritArrowAttack());
        Assert.assertFalse("SpiritArrow preflight Hero state must be present", heroBefore.isEmpty());
        Assert.assertFalse("SpiritArrow preflight bow bundle must be present", bowBundle.isEmpty());
        Assert.assertTrue("beginNativeSpiritArrowAttack must accept the exact SnipersMark payload: "
                        + "heroBytes=" + heroBefore.length()
                        + ", detailsBytes=" + detailsJson.length()
                        + ", bowBundleBytes=" + bowBundle.length()
                        + ", markBuffId=" + mark.id()
                        + ", bowItemId=" + bow.multiplayerItemId(),
                hero.beginNativeSpiritArrowAttack(heroBefore, detailsJson, bowBundle, mark.id()));
        Assert.assertTrue(hero.hasDeferredNativeCombatReport());
        Assert.assertTrue(hero.hasPendingNativeSpiritArrowAttack());
        hero.cancelNativeSpiritArrowAttack(mark.id());
        Assert.assertFalse(hero.hasDeferredNativeCombatReport());
        Assert.assertFalse(hero.hasPendingNativeSpiritArrowAttack());
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
        @Override public void zap(int cell) {
            // The headless test drives the captured MissileSprite completion callback directly.
        }
        @Override public void idle() {
            // Do not require animation assets in the headless integration environment.
        }
    }

    private static final class SilentSpiritBow extends SpiritBow {
        boolean castStarted;
        RuntimeException castFailure;

        @Override public SpiritArrow knockArrow() {
            return new SpiritArrow() {
                @Override public void throwSound() {
                    // Audio is intentionally absent from the headless runtime test.
                }

                @Override public void cast(Hero user, int dst) {
                    castStarted = true;
                    try {
                        super.cast(user, dst);
                    } catch (RuntimeException failure) {
                        castFailure = failure;
                        throw failure;
                    }
                }
            };
        }
    }

    private static final class CapturingMissileGroup extends Group {
        TestMissileSprite missile;

        @Override
        public synchronized Gizmo recycle(Class<? extends Gizmo> type) {
            if (type == MissileSprite.class) {
                missile = new TestMissileSprite();
                return add(missile);
            }
            return super.recycle(type);
        }
    }

    private static final class TestMissileSprite extends MissileSprite {
        private Callback completion;

        @Override
        public void reset(PointF from, PointF to, Item item, Callback listener) {
            // Keep the callback registered by the real SpiritArrow.cast path without touching GL assets.
            completion = listener;
        }

        @Override
        public void onComplete(Tweener tweener) {
            kill();
            if (completion != null) completion.call();
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

    private static JsonValue findBuffState(String encodedHeroState, String className) {
        if (encodedHeroState == null || encodedHeroState.isEmpty()) return null;
        JsonValue heroState = new JsonReader().parse(encodedHeroState);
        int buffCount = Math.max(0, Math.min(256, heroState.getInt("buffCount", 0)));
        for (int i = 0; i < buffCount; i++) {
            String encodedBuff = heroState.getString("buff_" + i, "");
            if (encodedBuff.isEmpty()) continue;
            JsonValue envelope = new JsonReader().parse(encodedBuff);
            JsonValue buff = envelope == null ? null : envelope.get("buff");
            if (buff != null && className.equals(buff.getString("__className", ""))) return buff;
        }
        return null;
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
