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
	 * Keeps the original logical/shaped text for every RenderedText object.
	 *
	 * This is deliberately separate from RenderedText.text(), because the
	 * latter may contain the visually reordered text used by the renderer.
	 * layout() can therefore safely be called multiple times without
	 * reordering already-reordered text.
	 *
	 * SPACE and NEWLINE entries are null.
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
			return Messages.lang() != null && Messages.lang().isRTL()
					? RIGHT_ALIGN
					: LEFT_ALIGN;
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

		/*
		 * Keep the text in logical order and only perform contextual Arabic
		 * shaping here.
		 *
		 * BiDi visual reordering is intentionally NOT done here. It is done
		 * later per already-wrapped line inside layout().
		 */
		if (text != null
				&& !text.isEmpty()
				&& Messages.lang() != null
				&& (Messages.lang().isRTL() || ArabicHandler.containsArabic(text))) {

			this.text = ArabicHandler.shapeArabic(text);

		} else {

			this.text = text;
		}

		/*
		 * Clear old contents when assigning null/empty text.
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

	// for manual text block splitting, a space between each word is assumed
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

		if (tokens == null) {
			return;
		}

		clear();

		words = new ArrayList<>();
		logicalTexts = new ArrayList<>();

		height = 0;

		boolean highlighting = false;

		for (String str : tokens){

			/*
			 * If highlighting is enabled, '_' or '**' toggles highlighting.
			 * The markers themselves are not rendered.
			 */
			if ((str.equals("_") || str.equals("**")) && highlightingEnabled){

				highlighting = !highlighting;

			} else if (str.equals("\n")){

				words.add(NEWLINE);
				logicalTexts.add(null);

			} else if (str.equals(" ")){

				words.add(SPACE);
				logicalTexts.add(null);

			} else {

				RenderedText word = new RenderedText(str, size);

				if (highlighting) {
					word.hardlight(hightlightColor);
				} else if (color != -1) {
					word.hardlight(color);
				}

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

		for (RenderedText word : words){

			if (word != null) {
				word.scale.set(zoom);
			}
		}

		layout();
	}

	public synchronized void hardlight(int color){

		this.color = color;

		for (RenderedText word : words){

			if (word != null) {
				word.hardlight(color);
			}
		}
	}

	public synchronized void resetColor(){

		this.color = -1;

		for (RenderedText word : words){

			if (word != null) {
				word.resetColor();
			}
		}
	}

	public synchronized void alpha(float value){

		for (RenderedText word : words){

			if (word != null) {
				word.alpha(value);
			}
		}
	}

	public synchronized void setHightlighting(boolean enabled){

		setHightlighting(enabled, Window.TITLE_COLOR);
	}

	public synchronized void setHightlighting(boolean enabled, int color){

		if (enabled != highlightingEnabled || color != hightlightColor){

			hightlightColor = color;
			highlightingEnabled = enabled;

			build();
		}
	}

	public synchronized void invert(){

		if (words != null){

			for (RenderedText word : words){

				if (word != null){

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
	 * Represents one logical item in a wrapped line.
	 *
	 * For a normal RenderedText:
	 *   logical = shaped logical-order text
	 *
	 * For SPACE:
	 *   logical = null
	 *
	 * start/end are character offsets in the complete logical line string.
	 */
	private static class VisualPart {

		final RenderedText word;
		final String logical;

		final int start;
		final int end;

		final boolean space;

		int visualPosition = Integer.MAX_VALUE;

		VisualPart(
				RenderedText word,
				String logical,
				int start,
				int end,
				boolean space
		){

			this.word = word;
			this.logical = logical;

			this.start = start;
			this.end = end;

			this.space = space;
		}
	}

	/*
	 * Performs BiDi layout on ONE already-wrapped line.
	 *
	 * IMPORTANT:
	 *
	 * We do NOT:
	 *
	 *     logical line
	 *          -> visual String
	 *          -> split visual String
	 *          -> put visual pieces back into logical objects
	 *
	 * That was the source of the previous completely reversed Arabic text.
	 *
	 * Instead:
	 *
	 *     logical line
	 *          -> java.text.Bidi
	 *          -> visual order of RenderedText objects
	 *          -> reorder each individual object's text
	 *
	 * This also keeps highlighting and object identity intact.
	 */
	private void layoutRTLLine(
			ArrayList<RenderedText> line,
			ArrayList<RenderedText> items,
			ArrayList<String> itemLogicalTexts,
			float lineY,
			ArrayList<Float> lineWidths
	){

		if (items.isEmpty()){

			lineWidths.add(0f);

			return;
		}

		StringBuilder lineString = new StringBuilder();

		ArrayList<VisualPart> parts = new ArrayList<>();

		int logicalPosition = 0;

		/*
		 * Build the logical line and remember the exact character range
		 * corresponding to every RenderedText token.
		 */
		for (int i = 0; i < items.size(); i++){

			RenderedText item = items.get(i);
			String logical = itemLogicalTexts.get(i);

			if (item == SPACE){

				int start = logicalPosition;

				lineString.append(' ');
				logicalPosition++;

				parts.add(
						new VisualPart(
								SPACE,
								null,
								start,
								logicalPosition,
								true
						)
				);

			} else if (
					item != NEWLINE
							&& item != null
							&& logical != null
			){

				int start = logicalPosition;

				lineString.append(logical);
				logicalPosition += logical.length();

				parts.add(
						new VisualPart(
								item,
								logical,
								start,
								logicalPosition,
								false
						)
				);
			}
		}

		if (lineString.length() == 0){

			lineWidths.add(0f);

			return;
		}

		Bidi bidi;

		try {

			bidi = new Bidi(
					lineString.toString(),
					Bidi.DIRECTION_RIGHT_TO_LEFT
			);

		} catch (Exception e){

			/*
			 * Defensive fallback.
			 *
			 * Better to render logical order than to corrupt the text.
			 */
			float fallbackX = this.x;

			for (VisualPart part : parts){

				if (part.space){

					fallbackX += 1.667f;

					continue;
				}

				part.word.text(part.logical);

				part.word.x = fallbackX;
				part.word.y = lineY;

				PixelScene.align(part.word);

				fallbackX += part.word.width() - 0.667f;
			}

			lineWidths.add(
					Math.max(
							0f,
							fallbackX - this.x
					)
			);

			return;
		}

		/*
		 * The Bidi API available in the project's Java environment does not
		 * provide getVisualMap().
		 *
		 * Therefore we construct the character-level visual mapping using
		 * the supported Bidi.reorderVisually() API.
		 */
		int textLength = lineString.length();

		byte[] charLevels = new byte[textLength];

		/*
		 * Expand the BiDi run levels so every character has its resolved
		 * embedding level.
		 */
		for (int run = 0; run < bidi.getRunCount(); run++){

			int start = bidi.getRunStart(run);
			int end = bidi.getRunLimit(run);

			byte level = (byte)bidi.getRunLevel(run);

			for (int i = start; i < end; i++){

				charLevels[i] = level;
			}
		}

		/*
		 * Start with logical character indices.
		 *
		 * reorderVisually() changes this array into visual order.
		 */
		Integer[] visualCharacters = new Integer[textLength];

		for (int i = 0; i < textLength; i++){

			visualCharacters[i] = i;
		}

		Bidi.reorderVisually(
				charLevels,
				0,
				visualCharacters,
				0,
				textLength
		);

		/*
		 * Convert:
		 *
		 *     visual index -> logical index
		 *
		 * into:
		 *
		 *     logical index -> visual index
		 */
		int[] logicalToVisual = new int[textLength];

		for (int visualIndex = 0;
			 visualIndex < textLength;
			 visualIndex++){

			int logicalIndex = visualCharacters[visualIndex];

			if (
					logicalIndex >= 0
							&& logicalIndex < textLength
			){

				logicalToVisual[logicalIndex] = visualIndex;
			}
		}

		/*
		 * Find the first visual character belonging to every item.
		 */
		for (VisualPart part : parts){

			int visualPosition = Integer.MAX_VALUE;

			int end = Math.min(
					part.end,
					logicalToVisual.length
			);

			for (
					int p = part.start;
					p < end;
					p++
			){

				visualPosition = Math.min(
						visualPosition,
						logicalToVisual[p]
				);
			}

			/*
			 * Defensive fallback for an impossible/empty mapping.
			 */
			if (visualPosition == Integer.MAX_VALUE){

				visualPosition = part.start;
			}

			part.visualPosition = visualPosition;
		}

		/*
		 * Sort the actual RenderedText objects according to their visual
		 * position.
		 */
		Collections.sort(
				parts,
				new Comparator<VisualPart>() {
					@Override
					public int compare(
							VisualPart a,
							VisualPart b
					){

						return Integer.compare(
								a.visualPosition,
								b.visualPosition
						);
					}
				}
		);

		/*
		 * Place every object in visual left-to-right order.
		 */
		float curX = this.x;

		for (VisualPart part : parts){

			if (part.space){

				curX += 1.667f;

				continue;
			}

			/*
			 * Keep the logical/shaped source intact.
			 *
			 * Only this individual token is transformed to visual order.
			 */
			String visualText = part.logical;

			if (
					visualText != null
							&& !visualText.isEmpty()
			){

				visualText =
						ArabicHandler.reorderBidiLine(
								visualText
						);
			}

			part.word.text(visualText);

			part.word.x = curX;
			part.word.y = lineY;

			PixelScene.align(part.word);

			curX += part.word.width() - 0.667f;
		}

		lineWidths.add(
				Math.max(
						0f,
						curX - this.x
				)
		);
	}

	@Override
	protected synchronized void layout(){

		super.layout();

		float x = this.x;
		float y = this.y;

		float height = 0;

		nLines = 1;

		ArrayList<ArrayList<RenderedText>> lines =
				new ArrayList<>();

		ArrayList<RenderedText> curLine =
				new ArrayList<>();

		lines.add(curLine);

		/*
		 * Contains every item in the line, including SPACE.
		 */
		ArrayList<ArrayList<RenderedText>> lineWords =
				new ArrayList<>();

		ArrayList<ArrayList<String>> lineLogicalTexts =
				new ArrayList<>();

		ArrayList<RenderedText> curLineWords =
				new ArrayList<>();

		ArrayList<String> curLineLogicalTexts =
				new ArrayList<>();

		lineWords.add(curLineWords);
		lineLogicalTexts.add(curLineLogicalTexts);

		/*
		 * Width of every physical line before alignment.
		 */
		ArrayList<Float> lineWidths =
				new ArrayList<>();

		width = 0;

		for (int i = 0; i < words.size(); i++){

			RenderedText word = words.get(i);

			if (word == SPACE){

				x += 1.667f;

				curLineWords.add(SPACE);
				curLineLogicalTexts.add(null);

			} else if (word == NEWLINE){

				/*
				 * Explicit line break.
				 */
				lineWidths.add(
						Math.max(
								0f,
								x - this.x
						)
				);

				y += height + 2f;
				x = this.x;

				nLines++;

				curLine =
						new ArrayList<>();

				lines.add(curLine);

				curLineWords =
						new ArrayList<>();

				curLineLogicalTexts =
						new ArrayList<>();

				lineWords.add(curLineWords);
				lineLogicalTexts.add(curLineLogicalTexts);

			} else {

				if (word.height() > height){

					height = word.height();
				}

				float fullWidth = word.width();

				int j = i + 1;

				/*
				 * This causes pieces split only for highlighting to be
				 * treated as one layout word.
				 *
				 * Chinese/Japanese render characters individually.
				 */
				while (
						Messages.lang() != Languages.CHI_SMPL
								&& Messages.lang() != Languages.CHI_TRAD
								&& Messages.lang() != Languages.JAPANESE
								&& j < words.size()
								&& words.get(j) != SPACE
								&& words.get(j) != NEWLINE
				){

					fullWidth +=
							words.get(j).width() - 0.667f;

					j++;
				}

				/*
				 * Wrap to the next line when the whole word will not fit.
				 */
				if (
						(x - this.x)
								+ fullWidth
								- 0.001f
								> maxWidth
								&& !curLine.isEmpty()
				){

					lineWidths.add(
							Math.max(
									0f,
									x - this.x
							)
					);

					y += height + 2f;
					x = this.x;

					nLines++;

					curLine =
							new ArrayList<>();

					lines.add(curLine);

					curLineWords =
							new ArrayList<>();

					curLineLogicalTexts =
							new ArrayList<>();

					lineWords.add(curLineWords);
					lineLogicalTexts.add(curLineLogicalTexts);
				}

				word.x = x;
				word.y = y;

				PixelScene.align(word);

				x += word.width();

				curLine.add(word);

				/*
				 * Store the exact logical text corresponding to this object.
				 */
				curLineWords.add(word);
				curLineLogicalTexts.add(
						logicalTexts.get(i)
				);

				if ((x - this.x) > width){

					width = x - this.x;
				}

				/*
				 * Existing Shattered Pixel Dungeon spacing behavior.
				 */
				x -= 0.667f;
			}
		}

		/*
		 * Store the final line width when it wasn't terminated by an
		 * explicit newline or a wrapping event.
		 */
		if (lineWidths.size() < lines.size()){

			lineWidths.add(
					Math.max(
							0f,
							x - this.x
					)
			);
		}

		this.height =
				(y - this.y)
						+ height;

		/*
		 * RTL detection.
		 */
		boolean isRTL =
				Messages.lang() != null
						&& (
						Messages.lang().isRTL()
								|| (
								text != null
										&& ArabicHandler.containsArabic(text)
						)
				);

		if (isRTL){

			width = 0;

			ArrayList<Float> rtlLineWidths =
					new ArrayList<>();

			/*
			 * Process every physical line independently.
			 *
			 * Crucially, the order of the lines themselves is never reversed.
			 * This preserves normal top-to-bottom multiline layout.
			 */
			for (int l = 0;
				 l < lines.size();
				 l++){

				ArrayList<RenderedText> line =
						lines.get(l);

				ArrayList<RenderedText> items =
						lineWords.get(l);

				ArrayList<String> logical =
						lineLogicalTexts.get(l);

				if (items.isEmpty()){

					rtlLineWidths.add(0f);

					continue;
				}

				layoutRTLLine(
						line,
						items,
						logical,
						line.get(0).y,
						rtlLineWidths
				);
			}

			/*
			 * Use the actual visual widths for alignment.
			 */
			lineWidths = rtlLineWidths;

			for (Float lineWidth : lineWidths){

				if (
						lineWidth != null
								&& lineWidth > width
				){

					width = lineWidth;
				}
			}
		}

		/*
		 * Apply requested alignment only after visual RTL/LTR positioning
		 * has been completed.
		 */
		int effectiveAlign = align();

		if (effectiveAlign != LEFT_ALIGN){

			for (int l = 0;
				 l < lines.size();
				 l++){

				ArrayList<RenderedText> line =
						lines.get(l);

				if (line.isEmpty()){

					continue;
				}

				float lineWidth;

				if (l < lineWidths.size()){

					lineWidth = lineWidths.get(l);

				} else {

					/*
					 * Defensive fallback for unusual empty/newline cases.
					 */
					lineWidth = 0;

					for (RenderedText word : line){

						if (word != null){

							lineWidth =
									Math.max(
											lineWidth,
											word.x
													+ word.width()
													- this.x
									);
						}
					}
				}

				if (effectiveAlign == CENTER_ALIGN){

					float offset =
							(width() - lineWidth)
									/ 2f;

					for (RenderedText word : line){

						word.x += offset;

						PixelScene.align(word);
					}

				} else if (effectiveAlign == RIGHT_ALIGN){

					float offset =
							width() - lineWidth;

					for (RenderedText word : line){

						word.x += offset;

						PixelScene.align(word);
					}
				}
			}
		}
	}
}