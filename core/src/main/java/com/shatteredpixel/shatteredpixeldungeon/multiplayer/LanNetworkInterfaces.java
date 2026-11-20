package com.shatteredpixel.shatteredpixeldungeon.multiplayer;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.SocketException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Enumeration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Enumerates reachable IPv4 broadcast destinations, excluding loopback/virtual-only paths. */
final class LanNetworkInterfaces {

    interface Provider {
        List<BroadcastAddress> getBroadcastAddresses() throws SocketException;
    }

    static final class BroadcastAddress {
        final String interfaceName;
        final Inet4Address localAddress;
        final Inet4Address broadcastAddress;

        private BroadcastAddress(String interfaceName, Inet4Address localAddress, Inet4Address broadcastAddress) {
            this.interfaceName = interfaceName;
            this.localAddress = localAddress;
            this.broadcastAddress = broadcastAddress;
        }

        static BroadcastAddress create(String interfaceName, InetAddress local, InetAddress broadcast) {
            if (interfaceName == null || interfaceName.trim().isEmpty()
                    || !(local instanceof Inet4Address) || !(broadcast instanceof Inet4Address)) return null;
            if (local.isAnyLocalAddress() || local.isLoopbackAddress() || local.isMulticastAddress()
                    || broadcast.isAnyLocalAddress() || broadcast.isLoopbackAddress()
                    || broadcast.isMulticastAddress() || "255.255.255.255".equals(broadcast.getHostAddress())
                    || local.equals(broadcast)) return null;
            return new BroadcastAddress(interfaceName, (Inet4Address) local, (Inet4Address) broadcast);
        }

        @Override
        public String toString() {
            return interfaceName + ":" + localAddress.getHostAddress() + "->" + broadcastAddress.getHostAddress();
        }
    }

    private LanNetworkInterfaces() {
    }

    static List<BroadcastAddress> getBroadcastAddresses() throws SocketException {
        Enumeration<NetworkInterface> enumeration = NetworkInterface.getNetworkInterfaces();
        if (enumeration == null) return Collections.emptyList();

        Map<String, BroadcastAddress> unique = new LinkedHashMap<>();
        while (enumeration.hasMoreElements()) {
            NetworkInterface network = enumeration.nextElement();
            try {
                if (!network.isUp() || network.isLoopback() || network.isVirtual()) continue;
                for (InterfaceAddress address : network.getInterfaceAddresses()) {
                    BroadcastAddress candidate = BroadcastAddress.create(
                            network.getName(), address.getAddress(), address.getBroadcast());
                    if (candidate != null) unique.put(candidate.toString(), candidate);
                }
            } catch (SocketException unavailableInterface) {
                // A network can disappear while interfaces are being enumerated; keep the others.
            }
        }

        List<BroadcastAddress> result = new ArrayList<>(unique.values());
        result.sort(Comparator.comparing((BroadcastAddress value) -> value.interfaceName)
                .thenComparing(value -> value.localAddress.getHostAddress()));
        return Collections.unmodifiableList(result);
    }
}