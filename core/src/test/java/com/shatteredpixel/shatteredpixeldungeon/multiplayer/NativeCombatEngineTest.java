package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Talent;
import com.shatteredpixel.shatteredpixeldungeon.levels.Level;
import com.shatteredpixel.shatteredpixeldungeon.levels.Terrain;
import org.junit.Assert;
import org.junit.Test;

import java.util.Arrays;

/** Exercises the original SPD Char.attack and Char.damage pipeline with deterministic combat stats. */
public class NativeCombatEngineTest {

    private static final class TestLevel extends Level {
        TestLevel() {
            setSize(8, 8);
            Arrays.fill(map, Terrain.EMPTY);
            Arrays.fill(passable, true);
            Arrays.fill(solid, false);
            heroFOV = new boolean[length()];
        }

        @Override
        protected boolean build() { return true; }

        @Override
        protected void createMobs() { }

        @Override
        protected void createItems() { }
    }

    private static final class TestChar extends Char {
        @Override
        public int attackSkill(Char target) { return 1000; }

        @Override
        public int defenseSkill(Char enemy) { return 0; }

        @Override
        public int damageRoll() { return 5; }

        @Override
        public int drRoll() { return 0; }
    }

    @Test
    public void nativeCharAttackUsesSPDHitAndDamagePipeline() {
        Level previousLevel = Dungeon.level;
        com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero previousHero = Dungeon.hero;
        try {
            TestLevel level = new TestLevel();
            TestChar attacker = new TestChar();
            attacker.pos = 9;
            attacker.HP = attacker.HT = 20;
            TestChar target = new TestChar();
            target.pos = 10;
            target.HP = target.HT = 100;
            Dungeon.level = level;
            Dungeon.hero = new com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero();
            Talent.initClassTalents(Dungeon.hero);

            int hpBefore = target.HP;
            boolean hit = attacker.attack(target);

            Assert.assertTrue("High-accuracy native SPD attack should hit", hit);
            Assert.assertEquals("Native damage roll minus native DR should be applied once",
                    hpBefore - 5, target.HP);
            Assert.assertTrue(target.isAlive());
        } finally {
            Dungeon.level = previousLevel;
            Dungeon.hero = previousHero;
        }
    }
}
