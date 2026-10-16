package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import com.shatteredpixel.shatteredpixeldungeon.levels.Level;
import com.shatteredpixel.shatteredpixeldungeon.levels.Terrain;
import com.shatteredpixel.shatteredpixeldungeon.tiles.CustomTilemap;
import com.watabou.utils.Bundle;
import org.junit.Assert;
import org.junit.Test;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;

public class MultiplayerLevelMetadataTest {

    public static class TestCustomTilemap extends CustomTilemap {
        public TestCustomTilemap() {
        }
    }

    private static class TestLevel extends Level {
        TestLevel() {
            width = 8;
            height = 8;
            length = width * height;
            map = new int[length];
            Arrays.fill(map, Terrain.WALL);
            customTiles = new ArrayList<>();
            customWalls = new ArrayList<>();
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

    @Test
    public void customTileAndWallMetadataSurvivesNativeBundleRoundTrip() throws Exception {
        TestLevel source = new TestLevel();
        TestCustomTilemap tile = new TestCustomTilemap();
        tile.pos(2, 3);
        tile.setRect(2, 3, 2, 1);
        TestCustomTilemap wall = new TestCustomTilemap();
        wall.pos(4, 5);
        source.customTiles.add(tile);
        source.customWalls.add(wall);

        String encoded = source.multiplayerMetadataBundle();
        Bundle decoded = Bundle.read(new ByteArrayInputStream(encoded.getBytes(StandardCharsets.UTF_8)));
        Assert.assertNotNull(decoded);

        TestLevel restored = new TestLevel();
        Assert.assertTrue(restored.canRestoreMultiplayerMetadata(decoded));
        Assert.assertTrue(restored.restoreMultiplayerMetadata(decoded));
        Assert.assertEquals(1, restored.customTiles.size());
        Assert.assertEquals(1, restored.customWalls.size());
        Assert.assertNotSame(tile, restored.customTiles.get(0));
        Assert.assertNotSame(wall, restored.customWalls.get(0));
        Assert.assertEquals(2, restored.customTiles.get(0).tileX);
        Assert.assertEquals(3, restored.customTiles.get(0).tileY);
        Assert.assertEquals(2, restored.customTiles.get(0).tileW);
        Assert.assertEquals(1, restored.customTiles.get(0).tileH);
        Assert.assertEquals(4, restored.customWalls.get(0).tileX);
        Assert.assertEquals(5, restored.customWalls.get(0).tileY);
    }

    @Test
    public void emptyNativeMetadataCollectionsRestoreAsEmptyNotMissing() throws Exception {
        TestLevel source = new TestLevel();
        String encoded = source.multiplayerMetadataBundle();
        Bundle decoded = Bundle.read(new ByteArrayInputStream(encoded.getBytes(StandardCharsets.UTF_8)));

        TestLevel restored = new TestLevel();
        restored.customTiles.add(new TestCustomTilemap());
        restored.customWalls.add(new TestCustomTilemap());

        Assert.assertTrue(restored.canRestoreMultiplayerMetadata(decoded));
        Assert.assertTrue(restored.restoreMultiplayerMetadata(decoded));
        Assert.assertTrue(restored.customTiles.isEmpty());
        Assert.assertTrue(restored.customWalls.isEmpty());
    }
}
