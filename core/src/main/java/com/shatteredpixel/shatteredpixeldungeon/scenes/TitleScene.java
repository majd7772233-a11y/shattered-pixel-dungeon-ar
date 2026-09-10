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

package com.shatteredpixel.shatteredpixeldungeon.scenes;

import com.shatteredpixel.shatteredpixeldungeon.Assets;
import com.shatteredpixel.shatteredpixeldungeon.Badges;
import com.shatteredpixel.shatteredpixeldungeon.Chrome;
import com.shatteredpixel.shatteredpixeldungeon.Dungeon;
import com.shatteredpixel.shatteredpixeldungeon.GamesInProgress;
import com.shatteredpixel.shatteredpixeldungeon.SPDSettings;
import com.shatteredpixel.shatteredpixeldungeon.ShatteredPixelDungeon;
import com.shatteredpixel.shatteredpixeldungeon.effects.BannerSprites;
import com.shatteredpixel.shatteredpixeldungeon.effects.Fireball;
import com.shatteredpixel.shatteredpixeldungeon.messages.Languages;
import com.shatteredpixel.shatteredpixeldungeon.messages.Messages;
import com.shatteredpixel.shatteredpixeldungeon.services.news.News;
import com.shatteredpixel.shatteredpixeldungeon.services.updates.AvailableUpdateData;
import com.shatteredpixel.shatteredpixeldungeon.services.updates.Updates;
import com.shatteredpixel.shatteredpixeldungeon.sprites.CharSprite;
import com.shatteredpixel.shatteredpixeldungeon.ui.ExitButton;
import com.shatteredpixel.shatteredpixeldungeon.ui.IconButton;
import com.shatteredpixel.shatteredpixeldungeon.ui.Icons;
import com.shatteredpixel.shatteredpixeldungeon.ui.StyledButton;
import com.shatteredpixel.shatteredpixeldungeon.ui.TitleBackground;
import com.shatteredpixel.shatteredpixeldungeon.ui.Window;
import com.shatteredpixel.shatteredpixeldungeon.windows.WndOptions;
import com.shatteredpixel.shatteredpixeldungeon.windows.WndSettings;
import com.shatteredpixel.shatteredpixeldungeon.windows.WndVictoryCongrats;
import com.watabou.glwrap.Blending;
import com.watabou.input.PointerEvent;
import com.watabou.noosa.BitmapText;
import com.watabou.noosa.Camera;
import com.watabou.noosa.Game;
import com.watabou.noosa.Image;
import com.watabou.noosa.PointerArea;
import com.watabou.noosa.audio.Music;
import com.watabou.noosa.tweeners.Tweener;
import com.watabou.utils.ColorMath;
import com.watabou.utils.DeviceCompat;
import com.watabou.utils.GameMath;
import com.watabou.utils.RectF;

import java.util.Date;

public class TitleScene extends PixelScene {

	private Image title;
	private Fireball leftFB;
	private Fireball rightFB;
	private Image signs;

	private StyledButton btnPlay;
	private StyledButton btnSupport;
	private StyledButton btnRankings;
	private StyledButton btnJournal;
	private StyledButton btnNews;
	private StyledButton btnChanges;
	private StyledButton btnSettings;
	private StyledButton btnAbout;

	private BitmapText version;
	private IconButton btnFade;
	private ExitButton btnExit;

	@Override
	public void create() {

		super.create();

		Music.INSTANCE.playTracks(
				new String[]{Assets.Music.THEME_1, Assets.Music.THEME_2},
				new float[]{1, 1},
				false);

		uiCamera.visible = false;

		int w = Camera.main.width;
		int h = Camera.main.height;

		RectF insets = getCommonInsets();

		TitleBackground BG = new TitleBackground(w, h);
		add(BG);

		w -= insets.left + insets.right;
		h -= insets.top + insets.bottom;

		title = BannerSprites.get(
				landscape()
						? BannerSprites.Type.TITLE_LAND
						: BannerSprites.Type.TITLE_PORT
		);
		add(title);

		float topRegion = Math.max(
				title.height - 6,
				h * 0.45f
		);

		title.x = insets.left
				+ (w - title.width()) / 2f;

		title.y = insets.top
				+ 2
				+ (topRegion - title.height()) / 2f;

		align(title);

		if (landscape()) {

			leftFB = placeTorch(
					title.x + 30,
					title.y + 35
			);

			rightFB = placeTorch(
					title.x + title.width - 30,
					title.y + 35
			);

		} else {

			leftFB = placeTorch(
					title.x + 16,
					title.y + 70
			);

			rightFB = placeTorch(
					title.x + title.width - 16,
					title.y + 70
			);
		}

		signs = new Image(
				BannerSprites.get(
						landscape()
								? BannerSprites.Type.TITLE_GLOW_LAND
								: BannerSprites.Type.TITLE_GLOW_PORT
				)
		){
			private float time = 0;

			@Override
			public void update() {
				super.update();

				am = Math.max(
						0f,
						(float)Math.sin(
								time += Game.elapsed
						)
				);

				am = Math.min(
						am,
						title.am
				);

				if (time >= 1.5f * Math.PI) {
					time = 0;
				}
			}

			@Override
			public void draw() {
				Blending.setLightMode();
				super.draw();
				Blending.setNormalMode();
			}
		};

		signs.x = title.x
				+ (title.width() - signs.width()) / 2f;

		signs.y = title.y;

		add(signs);

		final Chrome.Type GREY_TR =
				Chrome.Type.GREY_BUTTON_TR;

		/*
		 * ================================================================
		 * MAIN BUTTONS
		 * ================================================================
		 *
		 * Layout:
		 *
		 *             [ PLAY / ENTER ]
		 *
		 *       [ RANKINGS ] [ JOURNAL ]
		 *
		 *       [ CHANGES  ] [ SETTINGS]
		 *
		 *             [ ABOUT ]
		 *
		 * Support and News are intentionally not added to this scene.
		 * Their classes and destination scenes remain untouched below.
		 */

		btnPlay = new StyledButton(
				GREY_TR,
				Messages.get(this, "enter")
		){
			@Override
			protected void onClick() {

				if (GamesInProgress.checkAll().size() == 0){

					GamesInProgress.selectedClass = null;
					GamesInProgress.curSlot = 1;

					ShatteredPixelDungeon.switchScene(
							HeroSelectScene.class
					);

				} else {

					ShatteredPixelDungeon.switchNoFade(
							StartScene.class
					);
				}
			}

			@Override
			protected boolean onLongClick() {

				//making it easier to start runs quickly while debugging
				if (DeviceCompat.isDebug()) {

					GamesInProgress.selectedClass = null;
					GamesInProgress.curSlot = 1;

					ShatteredPixelDungeon.switchScene(
							HeroSelectScene.class
					);

					return true;
				}

				return super.onLongClick();
			}
		};

		btnPlay.icon(
				Icons.get(Icons.ENTER)
		);

		add(btnPlay);

		/*
		 * Support is intentionally hidden from the title screen.
		 *
		 * The object itself is still created so that the SupportButton class
		 * and SupporterScene remain available for future use.
		 */
		btnSupport = new SupportButton(
				GREY_TR,
				Messages.get(this, "support")
		);

		btnRankings = new StyledButton(
				GREY_TR,
				Messages.get(this, "rankings")
		){
			@Override
			protected void onClick() {

				ShatteredPixelDungeon.switchNoFade(
						RankingsScene.class
				);
			}
		};

		btnRankings.icon(
				Icons.get(Icons.RANKINGS)
		);

		add(btnRankings);

		Dungeon.daily = Dungeon.dailyReplay = false;

		btnJournal = new StyledButton(
				GREY_TR,
				Messages.get(this, "journal")
		){
			@Override
			protected void onClick() {

				ShatteredPixelDungeon.switchNoFade(
						JournalScene.class
				);
			}
		};

		btnJournal.icon(
				Icons.get(Icons.JOURNAL)
		);

		add(btnJournal);

		/*
		 * News is intentionally hidden from the title screen.
		 *
		 * The NewsButton class and NewsScene remain available.
		 */
		btnNews = new NewsButton(
				GREY_TR,
				Messages.get(this, "news")
		);

		btnNews.icon(
				Icons.get(Icons.NEWS)
		);

		btnChanges = new ChangesButton(
				GREY_TR,
				Messages.get(this, "changes")
		);

		btnChanges.icon(
				Icons.get(Icons.CHANGES)
		);

		add(btnChanges);

		btnSettings = new SettingsButton(
				GREY_TR,
				Messages.get(this, "settings")
		);

		add(btnSettings);

		btnAbout = new StyledButton(
				GREY_TR,
				Messages.get(this, "about")
		){
			@Override
			protected void onClick() {

				ShatteredPixelDungeon.switchScene(
						AboutScene.class
				);
			}
		};

		btnAbout.icon(
				Icons.get(Icons.SHPX)
		);

		add(btnAbout);

		/*
		 * ================================================================
		 * CLEAN BUTTON LAYOUT
		 * ================================================================
		 *
		 * Exactly four rows:
		 *
		 * 1. Full-width ENTER button
		 * 2. Two normal buttons
		 * 3. Two normal buttons
		 * 4. Full-width ABOUT button
		 *
		 * Support and News are NOT part of the layout.
		 */

		final int BTN_HEIGHT = 20;

		float buttonAreaWidth =
				landscape()
						? PixelScene.MIN_WIDTH_L - 6
						: PixelScene.MIN_WIDTH_P - 2;

		float btnAreaLeft =
				insets.left
						+ (w - buttonAreaWidth) / 2f;

		/*
		 * Use four actual rows instead of calculating the gap from the
		 * number of hidden buttons.
		 *
		 * This prevents the old empty space / off-screen button problem.
		 */
		float availableButtonHeight =
				h - topRegion - 6;

		float GAP = Math.max(
				2f,
				Math.min(
						8f,
						(
								availableButtonHeight
										- (4 * BTN_HEIGHT)
						) / 3f
				)
		);

		/*
		 * Top row: ENTER
		 */
		float playY =
				insets.top
						+ topRegion
						+ GAP;

		btnPlay.setRect(
				btnAreaLeft,
				playY,
				buttonAreaWidth,
				BTN_HEIGHT
		);

		align(btnPlay);

		/*
		 * Middle rows use two equal-width buttons.
		 */
		float halfWidth =
				(buttonAreaWidth - 2) / 2f;

		float row2Y =
				btnPlay.bottom() + GAP;

		/*
		 * Rankings / Journal
		 */
		btnRankings.setRect(
				btnAreaLeft,
				row2Y,
				halfWidth,
				BTN_HEIGHT
		);

		align(btnRankings);

		btnJournal.setRect(
				btnRankings.right() + 2,
				row2Y,
				halfWidth,
				BTN_HEIGHT
		);

		align(btnJournal);

		/*
		 * Changes / Settings
		 */
		float row3Y =
				btnRankings.bottom() + GAP;

		btnChanges.setRect(
				btnAreaLeft,
				row3Y,
				halfWidth,
				BTN_HEIGHT
		);

		align(btnChanges);

		btnSettings.setRect(
				btnChanges.right() + 2,
				row3Y,
				halfWidth,
				BTN_HEIGHT
		);

		align(btnSettings);

		/*
		 * Bottom row: ABOUT
		 */
		float aboutY =
				btnChanges.bottom() + GAP;

		/*
		 * Keep the About button inside the available screen area.
		 *
		 * If the calculated position would be too low, move it upward by
		 * the required amount instead of allowing it to leave the screen.
		 */
		float maxAboutY =
				insets.top
						+ h
						- BTN_HEIGHT
						- (DeviceCompat.isDesktop() ? 2 : 4)
						- (DeviceCompat.isDesktop() ? 0 : 2);

		if (aboutY > maxAboutY) {
			aboutY = maxAboutY;
		}

		btnAbout.setRect(
				btnAreaLeft,
				aboutY,
				buttonAreaWidth,
				BTN_HEIGHT
		);

		align(btnAbout);

		/*
		 * Version label.
		 */
		version = new BitmapText(
				"v" + Game.version,
				pixelFont
		);

		version.measure();

		version.hardlight(
				0x888888
		);

		version.x =
				insets.left
						+ w
						- version.width()
						- (DeviceCompat.isDesktop() ? 4 : 8);

		version.y =
				insets.top
						+ h
						- version.height()
						- (DeviceCompat.isDesktop() ? 2 : 4);

		add(version);

		/*
		 * Fade button.
		 */
		btnFade = new IconButton(
				Icons.CHEVRON.get()
		){
			@Override
			protected void onClick() {

				enable(false);

				parent.add(
						new Tweener(
								parent,
								0.5f
						){

							@Override
							protected void updateValues(
									float progress
							){

								if (!btnFade.active){

									uiAlpha =
											1 - progress;

									updateFade();
								}
							}
						}
				);
			}
		};

		btnFade.icon().originToCenter();
		btnFade.icon().angle = 180f;

		btnFade.setRect(
				btnAreaLeft
						+ (buttonAreaWidth - 16) / 2,
				camera.main.height
						- 16
						- insets.bottom,
				16,
				16
		);

		add(btnFade);

		PointerArea fadeResetter =
				new PointerArea(
						0,
						0,
						Camera.main.width,
						Camera.main.height
				){

					@Override
					public boolean onSignal(
							PointerEvent event
					){

						if (
								event != null
										&& event.type
										== PointerEvent.Type.UP
										&& !btnPlay.active
						){

							parent.add(
									new Tweener(
											parent,
											0.5f
									){

										@Override
										protected void updateValues(
												float progress
										){

											uiAlpha =
													progress;

											updateFade();

											if (progress >= 1){

												btnFade.enable(true);
											}
										}
									}
							);
						}

						return false;
					}
				};

		add(fadeResetter);

		if (DeviceCompat.isDesktop()) {

			btnExit = new ExitButton();

			btnExit.setPos(
					w - btnExit.width(),
					0
			);

			add(btnExit);
		}

		Badges.loadGlobal();

		if (
				Badges.isUnlocked(
						Badges.Badge.VICTORY
				)
						&& !SPDSettings.victoryNagged()
		){

			SPDSettings.victoryNagged(true);

			add(
					new WndVictoryCongrats()
			);
		}

		fadeIn();
	}

	private float uiAlpha;

	public void updateFade() {

		float alpha =
				GameMath.gate(
						0f,
						uiAlpha,
						1f
				);

		title.am = alpha;

		leftFB.am = alpha;
		rightFB.am = alpha;

		// signs.am = alpha; handles this itself

		/*
		 * Only buttons actually displayed by TitleScene participate in
		 * the fade animation.
		 */
		btnPlay.enable(alpha != 0);
		btnRankings.enable(alpha != 0);
		btnJournal.enable(alpha != 0);
		btnChanges.enable(alpha != 0);
		btnSettings.enable(alpha != 0);
		btnAbout.enable(alpha != 0);

		btnPlay.alpha(alpha);
		btnRankings.alpha(alpha);
		btnJournal.alpha(alpha);
		btnChanges.alpha(alpha);
		btnSettings.alpha(alpha);
		btnAbout.alpha(alpha);

		version.alpha(alpha);

		btnFade.icon().alpha(alpha);

		if (btnExit != null){

			btnExit.enable(alpha != 0);
			btnExit.icon().alpha(alpha);
		}
	}

	private Fireball placeTorch(
			float x,
			float y
	){

		Fireball fb = new Fireball();

		fb.x =
				x - fb.width() / 2f;

		fb.y =
				y - fb.height();

		align(fb);

		add(fb);

		return fb;
	}

	private static class NewsButton
			extends StyledButton {

		public NewsButton(
				Chrome.Type type,
				String label
		){

			super(type, label);

			if (SPDSettings.news()) {
				News.checkForNews();
			}
		}

		int unreadCount = -1;

		@Override
		public void update() {

			super.update();

			if (
					unreadCount == -1
							&& News.articlesAvailable()
			){

				long lastRead =
						SPDSettings.newsLastRead();

				if (lastRead == 0){

					if (
							News.articles().get(0)
									!= null
					){

						SPDSettings.newsLastRead(
								News.articles()
										.get(0)
										.date
										.getTime()
						);
					}

				} else {

					unreadCount =
							News.unreadArticles(
									new Date(
											SPDSettings.newsLastRead()
									)
							);

					if (unreadCount > 0){

						unreadCount =
								Math.min(
										unreadCount,
										9
								);

						text(
								text()
										+ "("
										+ unreadCount
										+ ")"
						);
					}
				}
			}

			if (unreadCount > 0){

				textColor(
						ColorMath.interpolate(
								0xFFFFFF,
								Window.SHPX_COLOR,
								0.5f
										+ (float)Math.sin(
										Game.timeTotal * 5
								) / 2f
						)
				);
			}
		}

		@Override
		protected void onClick() {

			super.onClick();

			ShatteredPixelDungeon.switchNoFade(
					NewsScene.class
			);
		}
	}

	private static class ChangesButton
			extends StyledButton {

		public ChangesButton(
				Chrome.Type type,
				String label
		){

			super(type, label);

			if (SPDSettings.updates()) {
				Updates.checkForUpdate();
			}
		}

		boolean updateShown = false;

		@Override
		public void update() {

			super.update();

			if (
					!updateShown
							&& Updates.updateAvailable()
			){

				updateShown = true;

				text(
						Messages.get(
								TitleScene.class,
								"update"
						)
				);
			}

			if (updateShown){

				textColor(
						ColorMath.interpolate(
								0xFFFFFF,
								Window.SHPX_COLOR,
								0.5f
										+ (float)Math.sin(
										Game.timeTotal * 5
								) / 2f
						)
				);
			}
		}

		@Override
		protected void onClick() {

			if (Updates.updateAvailable()){

				AvailableUpdateData update =
						Updates.updateData();

				ShatteredPixelDungeon.scene()
						.addToFront(
								new WndOptions(
										Icons.get(Icons.CHANGES),

										update.versionName == null
												? Messages.get(
												this,
												"title"
										)
												: Messages.get(
												this,
												"versioned_title",
												update.versionName
										),

										update.desc == null
												? Messages.get(
												this,
												"desc"
										)
												: update.desc,

										Messages.get(
												this,
												"update"
										),

										Messages.get(
												this,
												"changes"
										)
								){

									@Override
									protected void onSelect(
											int index
									){

										if (index == 0){

											Updates.launchUpdate(
													Updates.updateData()
											);

										} else if (index == 1){

											ChangesScene.changesSelected = 0;

											ShatteredPixelDungeon.switchNoFade(
													ChangesScene.class
											);
										}
									}
								}
						);

			} else {

				ChangesScene.changesSelected = 0;

				ShatteredPixelDungeon.switchNoFade(
						ChangesScene.class
				);
			}
		}
	}

	private static class SettingsButton
			extends StyledButton {

		public SettingsButton(
				Chrome.Type type,
				String label
		){

			super(type, label);

			if (
					Messages.lang()
							.status()
							== Languages.Status.X_UNFINISH
			){

				icon(
						Icons.get(Icons.LANGS)
				);

				icon.hardlight(
						1.5f,
						0,
						0
				);

			} else {

				icon(
						Icons.get(Icons.PREFS)
				);
			}
		}

		@Override
		public void update() {

			super.update();

			if (
					Messages.lang()
							.status()
							== Languages.Status.X_UNFINISH
			){

				textColor(
						ColorMath.interpolate(
								0xFFFFFF,
								CharSprite.NEGATIVE,
								0.5f
										+ (float)Math.sin(
										Game.timeTotal * 5
								) / 2f
						)
				);
			}
		}

		@Override
		protected void onClick() {

			if (
					Messages.lang()
							.status()
							== Languages.Status.X_UNFINISH
			){

				WndSettings.last_index = 5;
			}

			ShatteredPixelDungeon.scene()
					.add(
							new WndSettings()
					);
		}
	}

	/*
	 * Kept intact for future access.
	 */
	private static class SupportButton
			extends StyledButton {

		public SupportButton(
				Chrome.Type type,
				String label
		){

			super(type, label);

			icon(
					Icons.get(Icons.GOLD)
			);

			textColor(
					Window.TITLE_COLOR
			);
		}

		@Override
		protected void onClick() {

			ShatteredPixelDungeon.switchNoFade(
					SupporterScene.class
			);
		}
	}
}