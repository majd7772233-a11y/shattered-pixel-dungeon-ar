package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

/** Strict RFC 6455 HTTP/1.1 Upgrade validation. */
final class WebSocketHandshake {
    private static final String ACCEPT_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    private static final int MAX_HEADER_BYTES = 16 * 1024;
    private static final int MAX_HEADER_LINE_BYTES = 8 * 1024;
    private static final int MAX_HEADER_COUNT = 64;

    private WebSocketHandshake() {}

    static String buildRequestTarget(URI uri) {
        String path = uri.getRawPath() != null && !uri.getRawPath().isEmpty()
                ? uri.getRawPath() : "/room/DEFAULT_ROOM/websocket";
        String query = uri.getRawQuery();
        return query == null || query.isEmpty() ? path : path + "?" + query;
    }

    static String buildAuthorizationHeader(String sessionToken) {
        if (sessionToken == null || !sessionToken.matches("[A-Za-z0-9._~-]{16,256}")) return null;
        return "Bearer " + sessionToken;
    }

    static String expectedAccept(String clientKey) throws IOException {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-1")
                    .digest((clientKey + ACCEPT_GUID).getBytes("US-ASCII"));
            return Base64.getEncoder().encodeToString(digest);
        } catch (Exception failure) {
            throw new IOException("Unable to calculate WebSocket accept digest", failure);
        }
    }

    static void validateUpgradeResponse(InputStream input, String clientKey) throws IOException {
        int[] totalBytes = {0};
        String statusLine = readHeaderLine(input, totalBytes);
        if (statusLine == null) {
            throw new IOException("WebSocket upgrade failed: the server closed before sending an HTTP status line");
        }
        if (!statusLine.matches("HTTP/1\\.1 101(?: .*)?")) {
            // Preserve 401/403/409 for MultiplayerManager credential-rejection handling.
            throw new IOException("WebSocket upgrade rejected: " + statusLine);
        }
        Map<String, String> headers = new LinkedHashMap<>();
        int count = 0;
        while (true) {
            String line = readHeaderLine(input, totalBytes);
            if (line == null) throw new IOException("Truncated WebSocket upgrade headers");
            if (line.isEmpty()) break;
            if (++count > MAX_HEADER_COUNT) throw new IOException("Too many WebSocket upgrade headers");
            if (line.charAt(0) == ' ' || line.charAt(0) == '\t') {
                throw new IOException("Folded WebSocket upgrade headers are not supported");
            }
            int colon = line.indexOf(':');
            if (colon <= 0) throw new IOException("Malformed WebSocket upgrade header");
            String name = line.substring(0, colon).trim().toLowerCase(Locale.ROOT);
            String value = line.substring(colon + 1).trim();
            if (!name.matches("[!#$%&'*+.^_|~0-9a-z-]+") || containsControl(value)) {
                throw new IOException("Invalid WebSocket upgrade header");
            }
            if (headers.containsKey(name)) {
                if ("upgrade".equals(name) || "connection".equals(name)) {
                    headers.put(name, headers.get(name) + "," + value);
                } else {
                    throw new IOException("Duplicate WebSocket upgrade header: " + name);
                }
            } else {
                headers.put(name, value);
            }
        }
        if (!containsToken(headers.get("upgrade"), "websocket")) {
            throw new IOException("WebSocket upgrade response omitted Upgrade: websocket");
        }
        if (!containsToken(headers.get("connection"), "upgrade")) {
            throw new IOException("WebSocket upgrade response omitted Connection: Upgrade");
        }
        String actualAccept = headers.get("sec-websocket-accept");
        if (actualAccept == null || !expectedAccept(clientKey).equals(actualAccept)) {
            throw new IOException("WebSocket upgrade response has an invalid Sec-WebSocket-Accept");
        }
        if (headers.containsKey("sec-websocket-protocol") || headers.containsKey("sec-websocket-extensions")) {
            throw new IOException("Server selected an unrequested WebSocket protocol or extension");
        }
    }

    static String buildRequest(String hostHeader, String requestTarget, String clientKey, String authorization) {
        if (hostHeader == null || hostHeader.isEmpty() || containsControl(hostHeader)
                || requestTarget == null || !requestTarget.startsWith("/") || containsControl(requestTarget)
                || clientKey == null || !isValidClientKey(clientKey) || !isValidAuthorization(authorization)) {
            throw new IllegalArgumentException("Invalid WebSocket upgrade request parameters");
        }
        StringBuilder request = new StringBuilder(256);
        request.append("GET ").append(requestTarget).append(" HTTP/1.1\r\n")
                .append("Host: ").append(hostHeader).append("\r\n")
                .append("Upgrade: websocket\r\n")
                .append("Connection: Upgrade\r\n")
                .append("Sec-WebSocket-Key: ").append(clientKey).append("\r\n")
                .append("Sec-WebSocket-Version: 13\r\n");
        if (authorization != null) request.append("Authorization: ").append(authorization).append("\r\n");
        return request.append("\r\n").toString();
    }

    private static boolean isValidAuthorization(String authorization) {
        return authorization == null || authorization.matches("Bearer [A-Za-z0-9._~-]{16,256}");
    }

    private static boolean isValidClientKey(String clientKey) {
        try {
            byte[] decoded = Base64.getDecoder().decode(clientKey);
            return decoded.length == 16 && Base64.getEncoder().encodeToString(decoded).equals(clientKey);
        } catch (IllegalArgumentException invalidKey) {
            return false;
        }
    }

    private static String readHeaderLine(InputStream input, int[] totalBytes) throws IOException {
        ByteArrayOutputStream line = new ByteArrayOutputStream();
        boolean sawCarriageReturn = false;
        while (true) {
            int value = input.read();
            if (value == -1) {
                if (line.size() == 0 && !sawCarriageReturn) return null;
                throw new IOException("Truncated WebSocket upgrade header line");
            }
            if (++totalBytes[0] > MAX_HEADER_BYTES || line.size() >= MAX_HEADER_LINE_BYTES) {
                throw new IOException("WebSocket upgrade headers exceed the configured limit");
            }
            if (sawCarriageReturn) {
                if (value != '\n') throw new IOException("WebSocket upgrade headers must use CRLF");
                return new String(line.toByteArray(), "US-ASCII");
            }
            if (value == '\r') {
                sawCarriageReturn = true;
            } else if (value == '\n' || value < 0x20 && value != '\t' || value > 0x7e) {
                throw new IOException("Invalid character in WebSocket upgrade headers");
            } else {
                line.write(value);
            }
        }
    }

    private static boolean containsToken(String value, String token) {
        if (value == null) return false;
        for (String part : value.split(",")) {
            if (token.equalsIgnoreCase(part.trim())) return true;
        }
        return false;
    }

    private static boolean containsControl(String value) {
        if (value == null) return false;
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (c < 0x20 || c == 0x7f) return true;
        }
        return false;
    }
}
