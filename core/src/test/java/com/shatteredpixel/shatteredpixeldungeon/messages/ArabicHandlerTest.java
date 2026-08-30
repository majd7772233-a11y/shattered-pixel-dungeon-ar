package com.shatteredpixel.shatteredpixeldungeon.messages;

import org.junit.Assert;
import org.junit.Test;

public class ArabicHandlerTest {

	@Test
	public void testIsRTL() {
		Assert.assertTrue(Languages.ARABIC.isRTL());
		Assert.assertFalse(Languages.ENGLISH.isRTL());
	}

	@Test
	public void testContainsArabic() {
		Assert.assertTrue(ArabicHandler.containsArabic("مرحبا"));
		Assert.assertFalse(ArabicHandler.containsArabic("Hello"));
	}

	@Test
	public void testArabicShapingAndBidi() {
		String text = "مرحبا بكم";
		String processed = ArabicHandler.process(text);
		Assert.assertNotNull(processed);
		Assert.assertFalse(processed.isEmpty());
	}

	@Test
	public void testLamAlefLigature() {
		String text = "لا"; // Lam + Alef
		String shaped = ArabicHandler.shapeArabic(text);
		// Should be replaced by single isolated Lam-Alef ligature glyph \uFEFB
		Assert.assertEquals(1, shaped.length());
		Assert.assertEquals('\uFEFB', shaped.charAt(0));
	}
}
