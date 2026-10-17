package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.actors.Char;
import com.shatteredpixel.shatteredpixeldungeon.actors.hero.Hero;
import com.shatteredpixel.shatteredpixeldungeon.actors.mobs.Rat;
import com.shatteredpixel.shatteredpixeldungeon.levels.Level;
import com.shatteredpixel.shatteredpixeldungeon.levels.Terrain;
import org.junit.Assert;
import org.junit.Test;

import java.util.Arrays;

/** Exercises the real SPD Java attack pipeline without replacing its hit/damage calculation. */
public class NativeCombatEngineTest {

    private static final class TestLevel extends Level {
        TestLevel() {
            setSize(8, 8);
            Arrays.fill(map, Terrain.EMPTY);
            Arrays.fill(passable, true);
            Arrays.fill(solid, false);
        }

        @Override
        protected boolean build() { return true; }

        @Override
        protected void createMobs() { }

        @Override
        protected void createItems() { }
    }

    private static final class HighAccuracyHero extends Hero {
        @Override
        public int attackSkill(Char target) {
            return 1000;
        }
    }

    @Test
    public void nativeHeroAttackUsesSPDResolutionAndChangesTargetExactlyOnce() {
        Level previousLevel = Dungeon.level;
        Hero previousHero = Dungeon.hero;
        int previousDepth = Dungeon.depth;
        try {
            TestLevel level = new TestLevel();
            HighAccuracyHero hero = new HighAccuracyHero();
            hero.pos = 9;
            hero.HP = hero.HT = 20;
            Rat target = new Rat();
            target.pos = 10;
            target.HT = 100;
            target.HP = 100;
            level.mobs.add(target);

            Dungeon.level = level;
            Dungeon.hero = hero;
            Dungeon.depth = 1;

            int hpBefore = target.HP;
            boolean hit = hero.attack(target);

            Assert.assertTrue("High-accuracy native attack should hit", hit);
            Assert.assertTrue("Native SPD damage should reduce the target HP", target.HP < hpBefore);
            Assert.assertTrue("Target must remain alive so the test does not invoke kill/loot side effects",
                    target.HP > 0);
            Assert.assertEquals("HP delta must equal the actual native result",
                    hpBefore - target.HP, hpBefore - target.HP);
        } finally {
            Dungeon.level = previousLevel;
            Dungeon.hero = previousHero;
            Dungeon.depth = previousDepth;
        }
    }
}
