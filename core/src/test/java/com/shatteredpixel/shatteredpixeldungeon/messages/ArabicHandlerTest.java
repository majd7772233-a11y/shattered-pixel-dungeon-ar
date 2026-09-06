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

	@Test
	public void testArabicShapingWithDiacritics() {
		// "هذه اللعبة جميلة جدا" with tashkeel: "هَذِهِ الْلُّعْبَةُ جَمِيلَةٌ جِدًّا"
		String textWithDiacritics = "هَذِهِ الْلُّعْبَةُ جَمِيلَةٌ جِدًّا";
		String textWithoutDiacritics = "هذه اللعبة جميلة جدا";

		String shapedWith = ArabicHandler.shapeArabic(textWithDiacritics);
		String shapedWithout = ArabicHandler.shapeArabic(textWithoutDiacritics);

		// Remove diacritics from shapedWith to compare letter forms with shapedWithout
		StringBuilder cleanShapedWith = new StringBuilder();
		for (char c : shapedWith.toCharArray()) {
			if (!((c >= '\u064B' && c <= '\u0652') || c == '\u0670' || (c >= '\u0653' && c <= '\u065F'))) {
				cleanShapedWith.append(c);
			}
		}

		Assert.assertEquals(shapedWithout, cleanShapedWith.toString());
	}

	@Test
	public void testMultilineBidiPreservesLineOrder() {
		String line1 = "السطر الأول";
		String line2 = "السطر الثاني";
		String multilineText = line1 + "\n" + line2;

		String processed = ArabicHandler.process(multilineText);
		String[] processedLines = processed.split("\n", -1);

		Assert.assertEquals(2, processedLines.length);
		Assert.assertEquals(ArabicHandler.process(line1), processedLines[0]);
		Assert.assertEquals(ArabicHandler.process(line2), processedLines[1]);
	}

	@Test
	public void testDiacriticsStayAttachedInLTRMemoryOrder() {
		String phrase = "هَذِهِ الْلُّعْبَةُ جَمِيلَةٌ جِدًّا";
		String processed = ArabicHandler.process(phrase);

		Assert.assertNotNull(processed);
		Assert.assertFalse(processed.isEmpty());

		// In LTR memory order for visual rendering, every diacritic MUST immediately follow its base character
		char[] chars = processed.toCharArray();
		for (int i = 0; i < chars.length; i++) {
			char c = chars[i];
			boolean isDiacritic = (c >= '\u064B' && c <= '\u0652') || c == '\u0670' || (c >= '\u0653' && c <= '\u065F');
			if (isDiacritic) {
				// Diacritic cannot be the very first character in memory
				Assert.assertTrue("Diacritic should not appear at start of string without base character", i > 0);
			}
		}

		// Specifically test "هَذِهِ"
		String singleWord = "هَذِهِ";
		String processedWord = ArabicHandler.process(singleWord);
		// "هَذِهِ" shaped is: [Initial Heh (\uFEEB), Fatha, Final Thal (\uFEAC), Kasra, Isolated Heh (\uFEE9), Kasra]
		// In LTR memory order, reversed clusters should be:
		// Index 0: Isolated Heh (\uFEE9)
		// Index 1: Kasra (\u0650)
		// Index 2: Final Thal (\uFEAC)
		// Index 3: Kasra (\u0650)
		// Index 4: Initial Heh (\uFEEB)
		// Index 5: Fatha (\u064E)
		Assert.assertEquals(6, processedWord.length());
		Assert.assertEquals('\uFEE9', processedWord.charAt(0));
		Assert.assertEquals('\u0650', processedWord.charAt(1));
		Assert.assertEquals('\uFEAC', processedWord.charAt(2));
		Assert.assertEquals('\u0650', processedWord.charAt(3));
		Assert.assertEquals('\uFEEB', processedWord.charAt(4));
		Assert.assertEquals('\u064E', processedWord.charAt(5));
	}

	@Test
	public void testBracketsWithDiacritics() {
		String text = "(هَذِهِ)";
		String processed = ArabicHandler.process(text);
		Assert.assertEquals('(', processed.charAt(0));
		Assert.assertEquals(')', processed.charAt(processed.length() - 1));
	}
}
