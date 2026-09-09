/*
 * Pixel Dungeon
 * Copyright (C) 2012-2015 Oleg Dolya
 *
 * Shattered Pixel Dungeon
 * Copyright (C) 2014-2026 Evan Debenham
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>
 */

package com.shatteredpixel.shatteredpixeldungeon.ui;

import com.shatteredpixel.shatteredpixeldungeon.messages.ArabicHandler;
import com.shatteredpixel.shatteredpixeldungeon.messages.Languages;
import com.shatteredpixel.shatteredpixeldungeon.messages.Messages;
import com.shatteredpixel.shatteredpixeldungeon.scenes.PixelScene;
import com.watabou.noosa.Game;
import com.watabou.noosa.RenderedText;
import com.watabou.noosa.ui.Component;

import java.text.Bidi;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;

public class RenderedTextBlock extends Component {

	private int maxWidth = Integer.MAX_VALUE;
	public int nLines;

	private static final RenderedText SPACE = new RenderedText();
	private static final RenderedText NEWLINE = new RenderedText();

	protected String rawText;
	protected String text;
	protected String[] tokens = null;
	protected ArrayList<RenderedText> words = new ArrayList<>();
	protected boolean multiline = false;

	/*
	 * This stores the logical/shaped text corresponding to each visible
	 * RenderedText item in 'words'.
	 *
	 * It is intentionally separate from RenderedText.text(), because the
	 * RenderedText instance may contain the visually reordered form after
	 * layout. Keeping the logical form here prevents a later layout() call
	 * from reordering already-reordered text a second time.
	 *
	 * Entries for SPACE and NEWLINE are null.
	 */
	private ArrayList<String> logicalTexts = new ArrayList<>();

	private int size;
	private float zoom;
	private int color = -1;

	private int hightlightColor = Window.TITLE_COLOR;
	private boolean highlightingEnabled = true;

	public static final int LEFT_ALIGN = 1;
	public static final int CENTER_ALIGN = 2;
	public static final int RIGHT_ALIGN = 3;
	private int alignment = -1;

	public int align(){
		if (alignment == -1){
			return Messages.lang() != null && Messages.lang().isRTL() ? RIGHT_ALIGN : LEFT_ALIGN;
		}
		return alignment;
	}

	public RenderedTextBlock(int size){
		this.size = size;
	}

	public RenderedTextBlock(String text, int size){
		this.size = size;
		text(text);
	}

	public void text(String text){
		this.rawText = text;

		if (text != null && !text.isEmpty()
				&& Messages.lang() != null
				&& (Messages.lang().isRTL() || ArabicHandler.containsArabic(text))) {
			this.text = ArabicHandler.shapeArabic(text);
		} else {
			this.text = text;
		}

		/*
		 * Clear the current contents when text is null/empty.
		 * Without this, assigning an empty string could leave stale text
		 * from the previous value on screen.
		 */
		if (this.text == null || this.text.isEmpty()) {
			tokens = null;
			logicalTexts.clear();
			clear();
			words.clear();
			width = 0;
			height = 0;
			nLines = 0;
			return;
		}

		tokens = Game.platform.splitforTextBlock(this.text, multiline);
		build();
	}

	//for manual text block splitting, a space between each word is assumed
	public void tokens(String... words){
		StringBuilder fullText = new StringBuilder();
		for (String word : words) {
			fullText.append(word);
		}
		text(fullText.toString());
	}

	public void text(String text, int maxWidth){
		this.maxWidth = maxWidth;
		multiline = true;
		text(text);
	}

	public String text(){
		return text;
	}

	public void maxWidth(int maxWidth){
		if (this.maxWidth != maxWidth){
			this.maxWidth = maxWidth;
			multiline = true;
			text(rawText != null ? rawText : text);
		}
	}

	public int maxWidth(){
		return maxWidth;
	}

	private synchronized void build(){
		if (tokens == null) return;

		clear();

		words = new ArrayList<>();
		logicalTexts = new ArrayList<>();

		/*
		 * Recalculate height from scratch whenever the contents are rebuilt.
		 */
		height = 0;

		boolean highlighting = false;

		for (String str : tokens){

			//if highlighting is enabled, '_' or '**' is used to toggle highlighting on or off
			//the actual symbols are not rendered
			if ((str.equals("_") || str.equals("**")) && highlightingEnabled){

				highlighting = !highlighting;

			} else if (str.equals("\n")) {

				words.add(NEWLINE);
				logicalTexts.add(null);

			} else if (str.equals(" ")) {

				words.add(SPACE);
				logicalTexts.add(null);

			} else {

				/*
				 * Store the shaped/logical text separately.
				 *
				 * RenderedText.text() may later be changed to the visual
				 * order during RTL layout, so we must never use it as our
				 * source of truth for another layout pass.
				 */
				RenderedText word = new RenderedText(str, size);

				if (highlighting) word.hardlight(hightlightColor);
				else if (color != -1) word.hardlight(color);

				word.scale.set(zoom);

				words.add(word);
				logicalTexts.add(str);

				add(word);

				if (height < word.height()) {
					height = word.height();
				}
			}
		}

		layout();
	}

	public synchronized void zoom(float zoom){
		this.zoom = zoom;

		for (RenderedText word : words) {
			if (word != null) {
				word.scale.set(zoom);
			}
		}

		layout();
	}

	public synchronized void hardlight(int color){
		this.color = color;

		for (RenderedText word : words) {
			if (word != null) {
				word.hardlight(color);
			}
		}
	}

	public synchronized void resetColor(){
		this.color = -1;

		for (RenderedText word : words) {
			if (word != null) {
				word.resetColor();
			}
		}
	}

	public synchronized void alpha(float value){
		for (RenderedText word : words) {
			if (word != null) {
				word.alpha(value);
			}
		}
	}

	public synchronized void setHightlighting(boolean enabled){
		setHightlighting(enabled, Window.TITLE_COLOR);
	}

	public synchronized void setHightlighting(boolean enabled, int color){
		if (enabled != highlightingEnabled || color != hightlightColor) {
			hightlightColor = color;
			highlightingEnabled = enabled;
			build();
		}
	}

	public synchronized void invert(){
		if (words != null) {
			for (RenderedText word : words) {
				if (word != null) {
					word.ra = 0.77f;
					word.ga = 0.73f;
					word.ba = 0.62f;

					word.rm = -0.77f;
					word.gm = -0.73f;
					word.bm = -0.62f;
				}
			}
		}
	}

	public synchronized void align(int align){
		alignment = align;
		layout();
	}

	/*
	 * A visual layout item.
	 *
	 * For normal text:
	 *  - word      = the RenderedText object
	 *  - logical   = the logical/shaped text belonging to it
	 *
	 * For spaces:
	 *  - word      = SPACE
	 *  - logical   = null
	 *
	 * start/end refer to the character range inside the logical line string.
	 * visualPosition is the first visual position belonging to that item.
	 */
	private static class VisualPart {

		final RenderedText word;
		final String logical;
		final int start;
		final int end;
		final boolean space;

		int visualPosition = Integer.MAX_VALUE;

		VisualPart(RenderedText word, String logical, int start, int end, boolean space) {
			this.word = word;
			this.logical = logical;
			this.start = start;
			this.end = end;
			this.space = space;
		}
	}

	/*
	 * Builds the visual order of the already-wrapped logical line.
	 *
	 * IMPORTANT:
	 * We do NOT reorder the complete line into a String and then split that
	 * String again. Doing that was the source of the previous "letters are
	 * completely reversed/unreadable" bug.
	 *
	 * Instead:
	 *   logical shaped text
	 *        -> java.text.Bidi
	 *        -> visual order of RenderedText items
	 *        -> each individual item's own visual text
	 *
	 * This keeps object identity, highlighting, sizing and wrapping intact.
	 */
	private void layoutRTLLine(
			ArrayList<RenderedText> line,
			ArrayList<RenderedText> items,
			ArrayList<String> itemLogicalTexts,
			float lineY,
			ArrayList<Float> lineWidths
	) {

		if (items.isEmpty()) {
			lineWidths.add(0f);
			return;
		}

		/*
		 * Build the logical line exactly as it was originally tokenized.
		 * SPACE is represented by one actual space character.
		 */
		StringBuilder lineString = new StringBuilder();

		ArrayList<VisualPart> parts = new ArrayList<>();

		int logicalPosition = 0;

		for (int i = 0; i < items.size(); i++) {

			RenderedText item = items.get(i);
			String logical = itemLogicalTexts.get(i);

			if (item == SPACE) {

				int start = logicalPosition;
				lineString.append(' ');
				logicalPosition++;

				parts.add(new VisualPart(
						SPACE,
						null,
						start,
						logicalPosition,
						true
				));

			} else if (item != NEWLINE && item != null && logical != null) {

				int start = logicalPosition;

				lineString.append(logical);
				logicalPosition += logical.length();

				parts.add(new VisualPart(
						item,
						logical,
						start,
						logicalPosition,
						false
				));
			}
		}

		if (lineString.length() == 0) {
			lineWidths.add(0f);
			return;
		}

		/*
		 * java.text.Bidi computes the visual mapping without modifying our
		 * source string.
		 */
		Bidi bidi;

		try {
			bidi = new Bidi(
					lineString.toString(),
					Bidi.DIRECTION_RIGHT_TO_LEFT
			);
		} catch (Exception e) {
			/*
			 * This should not normally happen, but falling back to the
			 * logical order is much safer than rendering a corrupted string.
			 */
			float fallbackX = this.x;

			for (VisualPart part : parts) {

				if (part.space) {
					fallbackX += 1.667f;
					continue;
				}

				part.word.text(part.logical);
				part.word.x = fallbackX;
				part.word.y = lineY;

				PixelScene.align(part.word);

				fallbackX += part.word.width() - 0.667f;

				if (!line.contains(part.word)) {
					line.add(part.word);
				}
			}

			lineWidths.add(Math.max(0f, fallbackX - this.x));
			return;
		}

		/*
		 * visualMap[visualIndex] = logicalIndex
		 *
		 * Convert it to:
		 * logicalToVisual[logicalIndex] = visualIndex
		 *
		 * This lets us determine where each RenderedText token belongs in
		 * the visual line without changing its logical source text.
		 */
		int[] visualMap = bidi.getVisualMap();
		int[] logicalToVisual = new int[visualMap.length];

		for (int visualIndex = 0; visualIndex < visualMap.length; visualIndex++) {
			int logicalIndex = visualMap[visualIndex];

			if (logicalIndex >= 0 && logicalIndex < logicalToVisual.length) {
				logicalToVisual[logicalIndex] = visualIndex;
			}
		}

		/*
		 * Determine the first visual position belonging to every token.
		 */
		for (VisualPart part : parts) {

			int visualPosition = Integer.MAX_VALUE;

			for (int p = part.start; p < part.end && p < logicalToVisual.length; p++) {
				visualPosition = Math.min(
						visualPosition,
						logicalToVisual[p]
				);
			}

			part.visualPosition = visualPosition;
		}

		/*
		 * Sort the actual layout objects into visual order.
		 *
		 * Stable ordering is intentional: when two pieces resolve to the same
		 * position, their original order is preserved.
		 */
		Collections.sort(parts, new Comparator<VisualPart>() {
			@Override
			public int compare(VisualPart a, VisualPart b) {
				return Integer.compare(a.visualPosition, b.visualPosition);
			}
		});

		/*
		 * Place the objects from visual-left to visual-right.
		 *
		 * For Arabic text, reorderBidiLine() is applied only to the individual
		 * RenderedText item. The entire line is NEVER converted to a visual
		 * String and tokenized again.
		 */
		float curX = this.x;

		for (VisualPart part : parts) {

			if (part.space) {
				curX += 1.667f;
				continue;
			}

			String visualText = part.logical;

			if (visualText != null && !visualText.isEmpty()) {
				visualText = ArabicHandler.reorderBidiLine(visualText);
			}

			part.word.text(visualText);
			part.word.x = curX;
			part.word.y = lineY;

			PixelScene.align(part.word);

			curX += part.word.width() - 0.667f;

			/*
			 * Keep the normal RenderedText line list synchronized with the
			 * final set of visible items. No duplicate entries are added.
			 */
			if (!line.contains(part.word)) {
				line.add(part.word);
			}
		}

		lineWidths.add(Math.max(0f, curX - this.x));
	}

	@Override
	protected synchronized void layout() {

		super.layout();

		float x = this.x;
		float y = this.y;

		float height = 0;

		nLines = 1;

		ArrayList<ArrayList<RenderedText>> lines = new ArrayList<>();
		ArrayList<RenderedText> curLine = new ArrayList<>();
		lines.add(curLine);

		/*
		 * This contains both visible words and SPACE/NEWLINE markers.
		 */
		ArrayList<ArrayList<RenderedText>> lineWords = new ArrayList<>();
		ArrayList<ArrayList<String>> lineLogicalTexts = new ArrayList<>();

		ArrayList<RenderedText> curLineWords = new ArrayList<>();
		ArrayList<String> curLineLogicalTexts = new ArrayList<>();

		lineWords.add(curLineWords);
		lineLogicalTexts.add(curLineLogicalTexts);

		/*
		 * Width of each line before alignment is applied.
		 */
		ArrayList<Float> lineWidths = new ArrayList<>();

		width = 0;

		for (int i = 0; i < words.size(); i++){

			RenderedText word = words.get(i);

			if (word == SPACE) {

				x += 1.667f;

				curLineWords.add(SPACE);
				curLineLogicalTexts.add(null);

			} else if (word == NEWLINE) {

				/*
				 * Explicit newline.
				 */
				lineWidths.add(Math.max(0f, x - this.x));

				y += height + 2f;
				x = this.x;

				nLines++;

				curLine = new ArrayList<>();
				lines.add(curLine);

				curLineWords = new ArrayList<>();
				curLineLogicalTexts = new ArrayList<>();

				lineWords.add(curLineWords);
				lineLogicalTexts.add(curLineLogicalTexts);

			} else {

				if (word.height() > height) {
					height = word.height();
				}

				float fullWidth = word.width();
				int j = i + 1;

				/*
				 * This is so that words split only by highlighting are still
				 * grouped in layout.
				 *
				 * Chinese/Japanese always render every character separately
				 * without spaces however.
				 */
				while (
						Messages.lang() != Languages.CHI_SMPL
								&& Messages.lang() != Languages.CHI_TRAD
								&& Messages.lang() != Languages.JAPANESE
								&& j < words.size()
								&& words.get(j) != SPACE
								&& words.get(j) != NEWLINE
				){
					fullWidth += words.get(j).width() - 0.667f;
					j++;
				}

				if (
						(x - this.x) + fullWidth - 0.001f > maxWidth
								&& !curLine.isEmpty()
				){

					lineWidths.add(Math.max(0f, x - this.x));

					y += height + 2f;
					x = this.x;

					nLines++;

					curLine = new ArrayList<>();
					lines.add(curLine);

					curLineWords = new ArrayList<>();
					curLineLogicalTexts = new ArrayList<>();

					lineWords.add(curLineWords);
					lineLogicalTexts.add(curLineLogicalTexts);
				}

				word.x = x;
				word.y = y;

				PixelScene.align(word);

				x += word.width();

				curLine.add(word);

				/*
				 * logicalTexts is parallel to words, so the shaped/logical
				 * source for this RenderedText is preserved.
				 */
				curLineWords.add(word);
				curLineLogicalTexts.add(logicalTexts.get(i));

				if ((x - this.x) > width) {
					width = (x - this.x);
				}

				/*
				 * Note that spacing currently doesn't factor in halfwidth and
				 * fullwidth characters (e.g. Ideographic full stop).
				 */
				x -= 0.667f;
			}
		}

		/*
		 * Save the final line width when it wasn't terminated by an explicit
		 * newline or a wrapping operation.
		 */
		if (lineWidths.size() < lines.size()) {
			lineWidths.add(Math.max(0f, x - this.x));
		}

		this.height = (y - this.y) + height;

		/*
		 * Arabic/RTL handling:
		 *
		 * We only reorder the contents of each already-wrapped line.
		 * The order of the lines themselves is NEVER reversed.
		 *
		 * This is the important difference from the broken implementation:
		 * there is no:
		 *
		 *   whole line -> visual String -> split -> assign back
		 *
		 * Instead, the RenderedText objects themselves are placed in their
		 * visual order.
		 */
		boolean isRTL =
				Messages.lang() != null
						&& (
						Messages.lang().isRTL()
								|| (text != null && ArabicHandler.containsArabic(text))
				);

		if (isRTL) {

			width = 0;

			ArrayList<Float> rtlLineWidths = new ArrayList<>();

			for (int l = 0; l < lines.size(); l++) {

				ArrayList<RenderedText> line = lines.get(l);
				ArrayList<RenderedText> items = lineWords.get(l);
				ArrayList<String> logical = lineLogicalTexts.get(l);

				if (items.isEmpty()) {
					rtlLineWidths.add(0f);
					continue;
				}

				/*
				 * Rebuild the visual placement for this line only.
				 */
				layoutRTLLine(
						line,
						items,
						logical,
						line.get(0).y,
						rtlLineWidths
				);
			}

			/*
			 * Replace the line widths with the actual visual widths.
			 */
			lineWidths = rtlLineWidths;

			for (Float lineWidth : lineWidths) {
				if (lineWidth != null && lineWidth > width) {
					width = lineWidth;
				}
			}
		}

		/*
		 * Alignment is applied after RTL/LTR placement has been finalized.
		 */
		int effectiveAlign = align();

		if (effectiveAlign != LEFT_ALIGN){

			for (int l = 0; l < lines.size(); l++) {

				ArrayList<RenderedText> line = lines.get(l);

				if (line.isEmpty()) {
					continue;
				}

				float lineWidth;

				if (l < lineWidths.size()) {
					lineWidth = lineWidths.get(l);
				} else {
					/*
					 * Defensive fallback. This should only be reachable for
					 * unusual empty/newline edge cases.
					 */
					lineWidth = 0f;

					for (RenderedText word : line) {
						if (word != null) {
							lineWidth = Math.max(
									lineWidth,
									word.x + word.width() - this.x
							);
						}
					}
				}

				if (effectiveAlign == CENTER_ALIGN){

					float offset = (width() - lineWidth) / 2f;

					for (RenderedText word : line){
						word.x += offset;
						PixelScene.align(word);
					}

				} else if (effectiveAlign == RIGHT_ALIGN) {

					float offset = width() - lineWidth;

					for (RenderedText word : line){
						word.x += offset;
						PixelScene.align(word);
					}
				}
			}
		}
	}
}