package com.shatteredpixel.shatteredpixeldungeon.windows;

import com.shatteredpixel.shatteredpixeldungeon.messages.Messages;
import com.shatteredpixel.shatteredpixeldungeon.multiplayer.MultiplayerManager;
import com.shatteredpixel.shatteredpixeldungeon.multiplayer.MultiplayerErrorMessages;
import com.shatteredpixel.shatteredpixeldungeon.multiplayer.RoomMemberInfo;
import com.shatteredpixel.shatteredpixeldungeon.multiplayer.RoomLobbyState;
import com.shatteredpixel.shatteredpixeldungeon.scenes.GameScene;
import com.shatteredpixel.shatteredpixeldungeon.scenes.MultiplayerSetupScene;
import com.watabou.noosa.Game;

/** Modal room lobby. The room remains modal until the server authorizes PLAYING. */
public class WndMultiplayerLobby extends WndOptions {

    private static WndMultiplayerLobby current;
    private static boolean leaveRequested;
    private static boolean backRequested;

    private final long stateRevision;

    private WndMultiplayerLobby() {
        super(Messages.get("multiplayer_lobby_title"), buildMessage(), buildOptions());
        stateRevision = manager().getRoomStateRevision();
    }

    private static boolean isOwner(MultiplayerManager manager) {
        return manager.getLocalPlayerId() != null && manager.getLocalPlayerId().equals(manager.getRoomOwnerId());
    }

    private static MultiplayerManager manager() {
        return MultiplayerManager.getInstance();
    }

    private static boolean hasError() {
        return manager().getRoomLifecycleError() != null || manager().getSessionError() != null
                || RoomLobbyState.getError() != null;
    }

    private static String[] buildOptions() {
        MultiplayerManager manager = manager();
        if (manager.getSessionState() == MultiplayerManager.SessionState.FAILED) {
            return new String[]{Messages.get("multiplayer_lobby_leave")};
        }
        if (manager.getSessionState() == MultiplayerManager.SessionState.RECONNECTING) {
            return new String[]{Messages.get("multiplayer_lobby_reconnecting")};
        }
        if (manager.hasPendingRoomOperations()) {
            return new String[]{Messages.get("multiplayer_lobby_connecting")};
        }
        if (!manager.isRoomMember()) {
            return hasError()
                    ? new String[]{Messages.get("multiplayer_lobby_back")}
                    : new String[]{Messages.get("multiplayer_lobby_connecting")};
        }
        String ready = manager.isLocalRoomReady()
                ? Messages.get("multiplayer_lobby_unready")
                : Messages.get("multiplayer_lobby_ready");
        if (isOwner(manager)) {
            return new String[]{ready, Messages.get("multiplayer_lobby_start"),
                    Messages.get("multiplayer_lobby_cancel"), Messages.get("multiplayer_lobby_leave")};
        }
        return new String[]{ready, Messages.get("multiplayer_lobby_leave")};
    }

    private static String buildMessage() {
        MultiplayerManager manager = manager();
        StringBuilder body = new StringBuilder(256);
        body.append(Messages.get("room_name")).append(' ')
                .append(MultiplayerSetupScene.roomName).append('\n');
        if (manager.getSessionState() == MultiplayerManager.SessionState.RECONNECTING) {
            body.append(Messages.get("multiplayer_lobby_reconnecting")).append('\n');
        }
        body.append(Messages.get("multiplayer_lobby_players")).append(' ')
                .append(manager.getRoomMemberCount()).append('/')
                .append(manager.getRoomMaxPlayers());
        RoomMemberInfo[] members = RoomLobbyState.getMembers();
        int readyCount = 0;
        for (RoomMemberInfo member : members) {
            if (member.isConnected() && member.isReady()) readyCount++;
        }
        body.append('\n').append(Messages.get("multiplayer_lobby_ready_count"))
                .append(' ').append(readyCount).append('/').append(members.length);
        if (isOwner(manager)) body.append(" - ").append(Messages.get("multiplayer_lobby_host"));

        for (RoomMemberInfo member : members) {
            body.append('\n');
            if (member.getPlayerId().equals(manager.getLocalPlayerId())) {
                body.append(Messages.get("multiplayer_lobby_you"));
            } else {
                String id = member.getPlayerId();
                body.append(id.length() > 8 ? id.substring(0, 8) : id);
            }
            if (member.getPlayerId().equals(manager.getRoomOwnerId())) {
                body.append(" ( ").append(Messages.get("multiplayer_lobby_host")).append(" )");
            }
            body.append(" - ").append(member.getClassName()).append(" - ");
            if (!member.isConnected()) {
                body.append(Messages.get("multiplayer_lobby_offline"));
            } else if (member.isReady()) {
                body.append(Messages.get("multiplayer_lobby_ready"));
            } else {
                body.append(Messages.get("multiplayer_lobby_not_ready"));
            }
        }

        if (manager.isRoomMember() && !manager.isRoomSnapshotReady()) {
            body.append('\n').append(Messages.get("multiplayer_lobby_waiting_sync"));
        }
        if (manager.isRoomMember() && !manager.areAllRoomMembersReady()) {
            body.append('\n').append(Messages.get("multiplayer_lobby_waiting_players"));
        }
        String error = manager.getRoomLifecycleError() != null ? manager.getRoomLifecycleError()
                : manager.getSessionError() != null ? manager.getSessionError() : RoomLobbyState.getError();
        if (error != null) {
            body.append('\n').append(Messages.get("multiplayer_lobby_error")).append(": ")
                    .append(Messages.get(MultiplayerErrorMessages.messageKey(error)));
        }
        return body.toString();
    }

    @Override
    protected boolean enabled(int index) {
        MultiplayerManager manager = manager();
        if (manager.getSessionState() == MultiplayerManager.SessionState.RECONNECTING) return false;
        if (manager.getSessionState() == MultiplayerManager.SessionState.FAILED) return index == 0;
        if (manager.hasPendingRoomOperations()) return false;
        if (!manager.isRoomMember()) return index == 0 && hasError();
        if (RoomLobbyState.getError() != null) {
            return isOwner(manager) ? index == 3 : index == 1;
        }

        boolean synchronizedWorld = manager.isRoomSnapshotReady()
                && (manager.getSessionState() == MultiplayerManager.SessionState.WORLD_SYNCED
                    || manager.getSessionState() == MultiplayerManager.SessionState.READY);
        if (index == 0) return synchronizedWorld;
        if (isOwner(manager)) {
            if (index == 1) {
                return "LOBBY".equals(manager.getRoomStatus())
                        && manager.isLocalRoomReady() && manager.areAllRoomMembersReady()
                        && manager.isRoomSnapshotReady()
                        && manager.getSessionState() == MultiplayerManager.SessionState.READY;
            }
            if (index == 2) return "LOBBY".equals(manager.getRoomStatus());
            return index == 3;
        }
        return index == 1;
    }

    @Override
    protected void onSelect(int index) {
        MultiplayerManager manager = manager();
        if (manager.getSessionState() == MultiplayerManager.SessionState.FAILED) {
            backRequested = true;
            return;
        }
        if (manager.getSessionState() == MultiplayerManager.SessionState.RECONNECTING) return;
        if (!manager.isRoomMember()) {
            if (index == 0 && hasError() && !manager.hasPendingRoomOperations()) backRequested = true;
            return;
        }
        if (manager.hasPendingRoomOperations()) return;
        if (index == 0) {
            manager.setRoomReady(!manager.isLocalRoomReady());
        } else if (isOwner(manager)) {
            if (index == 1) manager.requestRoomMatchStart();
            else if (index == 2) manager.cancelRoomMatchStart();
            else if (index == 3) leaveRequested = manager.leaveRoom();
        } else if (index == 1) {
            leaveRequested = manager.leaveRoom();
        }
    }

    @Override
    public void onBackPressed() {
        // A joined room cannot be dismissed into a locally playable state.
        if (manager().getSessionState() == MultiplayerManager.SessionState.FAILED
                || (!manager().isRoomMember() && !manager().hasPendingRoomOperations() && hasError())) {
            backRequested = true;
            hide();
        }
    }

    @Override
    public void destroy() {
        super.destroy();
        if (current == this) current = null;
    }

    public static void tick() {
        MultiplayerManager manager = manager();
        if (!manager.isRoomLifecycleRequired()) {
            if (current != null) current.hide();
            current = null;
            leaveRequested = false;
            backRequested = false;
            return;
        }

        if (manager.getSessionState() == MultiplayerManager.SessionState.PLAYING) {
            if (current != null) current.hide();
            current = null;
            leaveRequested = false;
            backRequested = false;
            return;
        }

        if ((backRequested && manager.getSessionState() == MultiplayerManager.SessionState.FAILED)
                || ((leaveRequested || backRequested) && !manager.isRoomMember()
                    && !manager.hasPendingRoomOperations())) {
            leaveRequested = false;
            backRequested = false;
            manager.endSession();
            Game.switchScene(MultiplayerSetupScene.class);
            return;
        }
        if (leaveRequested && manager.isRoomMember() && !manager.hasPendingRoomOperations() && hasError()) {
            leaveRequested = false;
        }

        if (current != null && current.stateRevision != RoomLobbyState.getRevision()) {
            current.hide();
        }
        if (current == null && !GameScene.showingWindow()) {
            current = new WndMultiplayerLobby();
            GameScene.show(current);
        }
    }
}