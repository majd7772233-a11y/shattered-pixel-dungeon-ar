package com.shatteredpixel.shatteredpixeldungeon.messages;

import java.text.Bidi;
import java.util.HashMap;
import java.util.Map;

/**
 * Utility class for Arabic text contextual shaping and BiDi reordering.
 * Shapes isolated Arabic letters to Presentation Forms-B (initial, medial, final, isolated)
 * including compulsory Lam-Alef ligatures, and uses java.text.Bidi to reorder visual runs for LTR rendering engines.
 */
public class ArabicHandler {

	private static final class GlyphForms {
		char isolated;
		char end;      // final form
		char middle;   // medial form
		char beginning;// initial form

		GlyphForms(char isolated, char end, char middle, char beginning) {
			this.isolated = isolated;
			this.end = end;
			this.middle = middle;
			this.beginning = beginning;
		}
	}

	private static final Map<Character, GlyphForms> ARABIC_MAP = new HashMap<>();

	static {
		// Basic Arabic character set to Unicode Arabic Presentation Forms-B (\uFE70 - \uFEFF)
		// Format: isolated, final, medial, initial
		mapChar('\u0621', '\uFE80', '\uFE80', '\uFE80', '\uFE80'); // HAMZA
		mapChar('\u0622', '\uFE81', '\uFE82', '\uFE81', '\uFE82'); // ALEF WITH MADDA ABOVE
		mapChar('\u0623', '\uFE83', '\uFE84', '\uFE83', '\uFE84'); // ALEF WITH HAMZA ABOVE
		mapChar('\u0624', '\uFE85', '\uFE86', '\uFE85', '\uFE86'); // WAW WITH HAMZA ABOVE
		mapChar('\u0625', '\uFE87', '\uFE88', '\uFE87', '\uFE88'); // ALEF WITH HAMZA BELOW
		mapChar('\u0626', '\uFE89', '\uFE8A', '\uFE8C', '\uFE8B'); // YEH WITH HAMZA ABOVE
		mapChar('\u0627', '\uFE8D', '\uFE8E', '\uFE8D', '\uFE8E'); // ALEF
		mapChar('\u0628', '\uFE8F', '\uFE90', '\uFE92', '\uFE91'); // BEH
		mapChar('\u0629', '\uFE93', '\uFE94', '\uFE93', '\uFE94'); // TEH MARBUTA
		mapChar('\u062A', '\uFE95', '\uFE96', '\uFE98', '\uFE97'); // TEH
		mapChar('\u062B', '\uFE99', '\uFE9A', '\uFE9C', '\uFE9B'); // THEH
		mapChar('\u062C', '\uFE9D', '\uFE9E', '\uFEA0', '\uFE9F'); // JEEM
		mapChar('\u062D', '\uFEA1', '\uFEA2', '\uFEA4', '\uFEA3'); // HAH
		mapChar('\u062E', '\uFEA5', '\uFEA6', '\uFEA8', '\uFEA7'); // KHAH
		mapChar('\u062F', '\uFEA9', '\uFEAA', '\uFEA9', '\uFEAA'); // DAL
		mapChar('\u0630', '\uFEAB', '\uFEAC', '\uFEAB', '\uFEAC'); // THAL
		mapChar('\u0631', '\uFEAD', '\uFEAE', '\uFEAD', '\uFEAE'); // REH
		mapChar('\u0632', '\uFEAF', '\uFEB0', '\uFEAF', '\uFEB0'); // ZAIN
		mapChar('\u0633', '\uFEB1', '\uFEB2', '\uFEB4', '\uFEB3'); // SEEN
		mapChar('\u0634', '\uFEB5', '\uFEB6', '\uFEB8', '\uFEB7'); // SHEEN
		mapChar('\u0635', '\uFEB9', '\uFEBA', '\uFEBC', '\uFEBB'); // SAD
		mapChar('\u0636', '\uFEBD', '\uFEBE', '\uFEC0', '\uFEBF'); // DAD
		mapChar('\u0637', '\uFEC1', '\uFEC2', '\uFEC4', '\uFEC3'); // TAH
		mapChar('\u0638', '\uFEC5', '\uFEC6', '\uFEC8', '\uFEC7'); // ZAH
		mapChar('\u0639', '\uFEC9', '\uFECA', '\uFECC', '\uFECB'); // AIN
		mapChar('\u063A', '\uFECD', '\uFECE', '\uFED0', '\uFECF'); // GHAIN
		mapChar('\u0641', '\uFED1', '\uFED2', '\uFED4', '\uFED3'); // FEH
		mapChar('\u0642', '\uFED5', '\uFED6', '\uFED8', '\uFED7'); // QAF
		mapChar('\u0643', '\uFED9', '\uFEDA', '\uFEDC', '\uFEDB'); // KAF
		mapChar('\u0644', '\uFEDD', '\uFEDE', '\uFEE0', '\uFEDF'); // LAM
		mapChar('\u0645', '\uFEE1', '\uFEE2', '\uFEE4', '\uFEE3'); // MEEM
		mapChar('\u0646', '\uFEE5', '\uFEE6', '\uFEE8', '\uFEE7'); // NOON
		mapChar('\u0647', '\uFEE9', '\uFEEA', '\uFEEC', '\uFEEB'); // HEH
		mapChar('\u0648', '\uFEED', '\uFEEE', '\uFEED', '\uFEEE'); // WAW
		mapChar('\u0649', '\uFEEF', '\uFEF0', '\uFEEF', '\uFEF0'); // ALEF MAKSURA
		mapChar('\u064A', '\uFEF1', '\uFEF2', '\uFEF4', '\uFEF3'); // YEH
	}

	private static void mapChar(char ch, char isolated, char end, char middle, char beginning) {
		ARABIC_MAP.put(ch, new GlyphForms(isolated, end, middle, beginning));
	}

	private static boolean isNonConnectingRight(char ch) {
		// Letters that only connect to the right (previous letter) and do NOT connect to the left (following letter)
		return ch == '\u0621' || ch == '\u0622' || ch == '\u0623' || ch == '\u0624' || ch == '\u0625' ||
				ch == '\u0627' || ch == '\u062F' || ch == '\u0630' || ch == '\u0631' || ch == '\u0632' ||
				ch == '\u0648' || ch == '\u0649' || ch == '\uFE8D' || ch == '\uFE8E';
	}

	private static boolean isArabicLetter(char ch) {
		return ARABIC_MAP.containsKey(ch);
	}

	public static boolean containsArabic(String text) {
		if (text == null) return false;
		for (int i = 0; i < text.length(); i++) {
			char c = text.charAt(i);
			if ((c >= '\u0600' && c <= '\u06FF') || (c >= '\uFB50' && c <= '\uFDFF') || (c >= '\uFE70' && c <= '\uFEFF')) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Process Arabic text for display: shapes contextual letter forms (including Lam-Alef ligatures)
	 * and applies BiDi visual reordering.
	 */
	public static String process(String input) {
		if (input == null || input.isEmpty() || !containsArabic(input)) {
			return input;
		}

		// First, shape contextual letters and handle ligatures
		String shaped = shapeArabic(input);

		// Second, apply BiDi reordering so LTR text renderer displays RTL correctly
		return reorderBidi(shaped);
	}

	public static String shapeArabic(String text) {
		char[] chars = text.toCharArray();
		int len = chars.length;
		StringBuilder result = new StringBuilder();

		for (int i = 0; i < len; i++) {
			char c = chars[i];
			if (!isArabicLetter(c)) {
				result.append(c);
				continue;
			}

			boolean prevConnects = (i > 0) && isArabicLetter(chars[i - 1]) && !isNonConnectingRight(chars[i - 1]);

			// Lam-Alef compulsory ligature check
			if (c == '\u0644' && (i < len - 1)) {
				char next = chars[i + 1];
				char ligature = 0;
				if (next == '\u0622') { // ALEF WITH MADDA
					ligature = prevConnects ? '\uFEF6' : '\uFEF5';
				} else if (next == '\u0623') { // ALEF WITH HAMZA ABOVE
					ligature = prevConnects ? '\uFEF8' : '\uFEF7';
				} else if (next == '\u0625') { // ALEF WITH HAMZA BELOW
					ligature = prevConnects ? '\uFEFA' : '\uFEF9';
				} else if (next == '\u0627') { // PLAIN ALEF
					ligature = prevConnects ? '\uFEFC' : '\uFEFB';
				}

				if (ligature != 0) {
					result.append(ligature);
					i++; // skip next character (Alef)
					continue;
				}
			}

			boolean nextConnects = (i < len - 1) && isArabicLetter(chars[i + 1]) && !isNonConnectingRight(c);

			GlyphForms forms = ARABIC_MAP.get(c);
			if (forms == null) {
				result.append(c);
				continue;
			}

			if (prevConnects && nextConnects) {
				result.append(forms.middle);
			} else if (prevConnects) {
				result.append(forms.end);
			} else if (nextConnects) {
				result.append(forms.beginning);
			} else {
				result.append(forms.isolated);
			}
		}

		return result.toString();
	}

	public static String reorderBidi(String text) {
		if (text == null || text.length() <= 1) {
			return text;
		}

		try {
			Bidi bidi = new Bidi(text, Bidi.DIRECTION_RIGHT_TO_LEFT);
			if (bidi.isLeftToRight()) {
				return text;
			}

			int count = bidi.getRunCount();
			byte[] levels = new byte[count];
			Integer[] runs = new Integer[count];
			for (int i = 0; i < count; i++) {
				levels[i] = (byte) bidi.getRunLevel(i);
				runs[i] = i;
			}

			Bidi.reorderVisually(levels, 0, runs, 0, count);

			StringBuilder sb = new StringBuilder();
			for (int i = 0; i < count; i++) {
				int runIndex = runs[i];
				int start = bidi.getRunStart(runIndex);
				int end = bidi.getRunLimit(runIndex);
				int level = bidi.getRunLevel(runIndex);

				String sub = text.substring(start, end);
				if ((level & 1) != 0) { // RTL run
					sb.append(reverseString(sub));
				} else { // LTR run
					sb.append(sub);
				}
			}
			return sb.toString();
		} catch (Exception e) {
			return text;
		}
	}

	private static String reverseString(String s) {
		char[] chars = s.toCharArray();
		int len = chars.length;
		char[] rev = new char[len];
		for (int i = 0; i < len; i++) {
			char c = chars[len - 1 - i];
			// Mirror brackets / parentheses in RTL runs
			switch (c) {
				case '(': rev[i] = ')'; break;
				case ')': rev[i] = '('; break;
				case '[': rev[i] = ']'; break;
				case ']': rev[i] = '['; break;
				case '{': rev[i] = '}'; break;
				case '}': rev[i] = '{'; break;
				case '<': rev[i] = '>'; break;
				case '>': rev[i] = '<'; break;
				case '«': rev[i] = '»'; break;
				case '»': rev[i] = '«'; break;
				default:  rev[i] = c;   break;
			}
		}
		return new String(rev);
	}
}
