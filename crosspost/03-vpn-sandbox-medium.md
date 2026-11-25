# Medium: VPN Sandbox

Title: A per-app VPN on Linux, and how I proved the kill switch actually works

Subtitle: Network namespaces, three layers of iptables, and a test that kills OpenVPN on purpose

Topics: Linux, Cybersecurity, VPN, Privacy, Open Source

---

Most VPN clients are all or nothing. Turn it on and your whole machine goes through the tunnel. Turn it off and nothing does. I wanted something in between: run one app through the VPN, like Firefox or a torrent client or a single curl command, and leave everything else on my normal connection.

I also wanted to know that if the VPN dropped, that one app would just go dark. Not quietly fall back to my real IP, which is what a lot of kill switches end up doing once you actually test them.

## One namespace per app

Linux already has the right tool for this. A network namespace is a separate copy of the network stack, with its own interfaces, routing table and firewall rules. RobOS VPN Sandbox makes one for each app you launch, starts OpenVPN inside it, and runs the app in there as my normal user with its network capabilities stripped, so it can't change any of the rules.

From inside, the app has two ways out: the tunnel, and a virtual ethernet link back to the host that OpenVPN uses to reach the VPN server. The rest of the design is about making sure the app can only use the first one.

[image: vpn-sandbox-killswitch-proven.png]

## Three walls

The kill switch is three sets of iptables rules, and any one of them would be enough by itself.

Inside the namespace, outgoing traffic is dropped by default, for both IPv4 and IPv6. The only exception is the tunnel interface.

On the link back to the host, only root can send anything, and only to the exact VPN server IP and port. Root here is the OpenVPN process. The app runs as uid 1000, so even if it tried to go around the tunnel, that rule wouldn't let it through.

On the host side, the forwarding and NAT rules for that namespace are locked to the same VPN server IP and port. So even a packet that somehow got past the first two would have nowhere to go.

DNS was the sneaky one. Left alone, the namespace would use the host's resolver, which means your lookups leave on your normal connection even when everything else is tunneled. So each namespace gets its own resolv.conf, OpenVPN is told to leave the host's DNS alone, and lookups go through the tunnel like everything else.

[image: vpn-killswitch-architecture.png]

## Actually testing it

This is the part I cared about most. There's an end-to-end test, and a Prove Kill-Switch button in the app that runs the same thing.

It records my real public IP, then checks that the sandboxed app sees the VPN's IP instead. Then it kills the OpenVPN daemon with kill -9 and leaves the namespace and its routes exactly where they were, which is the situation a real crash would leave you in. The app then tries to get out four different ways: HTTPS, plain TCP to 1.1.1.1, UDP to 8.8.8.8 on the DNS port, and UDP straight to the VPN server.

The last step reads the kernel's iptables packet counters. I didn't want to rely on "the request timed out", because a timeout can mean anything. The counters show the kernel saw every one of those packets and dropped it. Zero bytes went out on my real IP.

## The less exciting parts

It ships with all 3,598 IPVanish server configs, cleaned up so they work with OpenVPN 2.6 and 2.7. Some of the old directives in those files make newer OpenVPN refuse to start. Passwords live in pass, GPG encrypted. There's a Test button that does a real handshake and shows you the tunnel IP before you launch anything. IPVanish is the only provider bundled right now.

I've only run it on Ubuntu 26.04 so far.

## Where it lives

It's part of RobOS, an open source app suite I've been building. The security page has the full rule set and the test: https://rowbose.com/security/

Source on GitHub: https://github.com/nddipiazza/robos

If you find a way to make it leak, I'd really like to hear about it.
