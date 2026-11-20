package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

/** Strict host/port parser for direct LAN TCP connections. */
final class LanEndpoint {
    final String host;
    final int port;

    private LanEndpoint(String host, int port) {
        this.host = host;
        this.port = port;
    }

    static LanEndpoint parse(String endpoint, int defaultPort) {
        if (endpoint == null) throw new IllegalArgumentException("LAN_ENDPOINT_INVALID");
        String value = endpoint.trim();
        if (value.isEmpty() || defaultPort < 1 || defaultPort > 65535) {
            throw new IllegalArgumentException("LAN_ENDPOINT_INVALID");
        }

        String host;
        int port = defaultPort;
        if (value.startsWith("[")) {
            int end = value.indexOf(']');
            if (end <= 1) throw new IllegalArgumentException("LAN_ENDPOINT_INVALID");
            host = value.substring(1, end);
            String suffix = value.substring(end + 1);
            if (!suffix.isEmpty()) {
                if (!suffix.startsWith(":")) throw new IllegalArgumentException("LAN_ENDPOINT_INVALID");
                port = parsePort(suffix.substring(1));
            }
        } else {
            int firstColon = value.indexOf(':');
            int lastColon = value.lastIndexOf(':');
            if (firstColon >= 0 && firstColon == lastColon) {
                host = value.substring(0, firstColon);
                port = parsePort(value.substring(firstColon + 1));
            } else {
                // An unbracketed IPv6 literal uses the default port. IPv6-with-port must be bracketed.
                host = value;
            }
        }

        if (host.isEmpty() || host.length() > 253 || host.matches(".*\\s+.*")
                || host.indexOf('/') >= 0 || host.indexOf('\\') >= 0) {
            throw new IllegalArgumentException("LAN_ENDPOINT_INVALID");
        }
        return new LanEndpoint(host, port);
    }

    private static int parsePort(String text) {
        if (text == null || text.isEmpty() || !text.matches("[0-9]{1,5}")) {
            throw new IllegalArgumentException("LAN_ENDPOINT_INVALID");
        }
        try {
            int value = Integer.parseInt(text);
            if (value < 1 || value > 65535) throw new IllegalArgumentException("LAN_ENDPOINT_INVALID");
            return value;
        } catch (NumberFormatException invalid) {
            throw new IllegalArgumentException("LAN_ENDPOINT_INVALID", invalid);
        }
    }
}