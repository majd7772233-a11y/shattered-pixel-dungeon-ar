package com.shatteredpixel.shatteredpixeldungeon.scenes;

import com.shatteredpixel.shatteredpixeldungeon.Chrome;
import com.shatteredpixel.shatteredpixeldungeon.ShatteredPixelDungeon;
import com.shatteredpixel.shatteredpixeldungeon.messages.Messages;
import com.shatteredpixel.shatteredpixeldungeon.ui.Icons;
import com.shatteredpixel.shatteredpixeldungeon.ui.StyledButton;
import com.watabou.noosa.Camera;

public class MultiplayerSetupScene extends PixelScene {

    public static String selectedTransportType = "INTERNET";

    @Override
    public void create() {
        super.create();

        int w = Camera.main.width;
        int h = Camera.main.height;

        StyledButton btnStart = new StyledButton(Chrome.Type.GREY_BUTTON_TR, Messages.get("ui.multiplayer", "start_game")) {
            @Override
            protected void onClick() {
                ShatteredPixelDungeon.switchNoFade(StartScene.class);
            }
        };
        btnStart.icon(Icons.get(Icons.ENTER));
        btnStart.setRect((w - 140) / 2f, h * 0.7f, 140, 24);
        add(btnStart);
    }
}
