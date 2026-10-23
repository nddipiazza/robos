# VPN App Container

RobOS launcher for separate container copies of qBittorrent and Transmission.
It does not intercept an existing host installation or change your host VPN.

## Run

On a Linux RobOS machine with a running Docker Engine, `/dev/net/tun`, IPv4 and
IPv6 netfilter support, and permission to use Docker:

1. Install this package with the normal RobOS package deployment and its desktop entry.
2. Open **VPN App Container** and click **Build app container**.
3. Download your IPVanish OpenVPN profile and CA certificate from the provider.
   Keep referenced CA/tls-auth files beside the `.ovpn` file, then import it.
4. Enter your credentials locally, select qBittorrent, and click **Launch with VPN protection**.
5. After status becomes `running`, open the app. Use `admin` and the generated
   local Web UI password displayed by the launcher.

Credentials are sent over Docker stdin to a root-only tmpfs file. They are not
saved in RobOS settings, container environment variables, argv, logs, or the
application data volume. Each launch rotates the local app password. Downloads
and app preferences remain in the named Docker volume. **Stop container** removes
only the container, retaining that volume. A stopped failed container must be
removed with Stop before another launch. Closing the launcher leaves the isolated
container and its independent supervisor running.

## Enforced boundary

The container has its own bridge network namespace, no host mounts or Docker
socket, a read-only root filesystem, and no automatic restart. A root supervisor
installs IPv4 default DROP policies and denies all IPv6 before starting OpenVPN.
The only direct internet exception belongs to UID 0 and exactly the pinned VPN
endpoint and port. The app runs as UID 10000 with all capability sets removed and
`no_new_privs`; it cannot use that exception, change routes/firewalls, read VPN
credentials, or acquire privileges. DNS is 1.1.1.1 through the tunnel. Docker's
127.0.0.11 resolver is excluded from loopback allowances.

App traffic is allowed on `tun0`. Local loopback and replies to the TCP 8080 Web UI
are also allowed; only 127.0.0.1:18080 (qBittorrent) or :18081 (Transmission) is
published on the host. There is no generic established-output allowance that could
preserve a stale direct connection. No torrent peer ports are published.

The app launches only after a TLS connectivity check bound to `tun0` succeeds.
Tunnel/process checks run every 250 ms (link command timeout 200 ms). Connectivity
checks run every 2 seconds, timeout 2 seconds. On the first detected failure the
supervisor sends SIGKILL to the entire app process group, stops OpenVPN and exits.
It never automatically relaunches. Detection is bounded by these checks and OS
scheduling; it is not literally instantaneous. Kernel firewall enforcement covers
the detection interval. If PID 1 exits, Docker terminates the remaining container
processes. A broken firewall installation aborts without launching the app.

This boundary assumes a trusted host, Docker daemon, kernel, image and VPN
provider. Host administrators can bypass containers. It is not an audited security
guarantee. Host browser traffic and an app launched outside this container do not
inherit protection. The TLS health endpoint is a connectivity check, not independent
proof of an IPVanish exit IP; verify the reported exit address/provider separately.

## Tests and current verification

```
npm test
python3 -m unittest discover -s test -p 'test_*.py'
ROBOS_VPN_PROFILE=/absolute/path/server.ovpn node test/live-qbittorrent.js
```

The live test builds the actual image and starts real qBittorrent with the supplied
VPN account. It verifies Web API authentication, actual process UID/capabilities,
credential isolation, successful tunnel traffic, blocked direct IPv4/Docker DNS,
blocked IPv6, and termination after tunnel deletion. It never overwrites an existing
container or downloads copyrighted material. It writes `test/live-proof.json` and
removes its container on completion; its download volume remains. Run it on the
Docker engine host because its Web API check uses localhost.

**Not yet live verified:** the development host is Windows without Docker, WSL or a
reachable RobOS VM. Node/Python tests exercise controller and supervisor failure
paths, but do not prove real kernel packet isolation. The live test currently
fails its prerequisite check with `spawn docker ENOENT`. A narrated UI scenario is
provided in `packages/robos-test/demos/vpn-app-container-demo.js`; a video must be
recorded on Linux with the normal RobOS E2E harness.

## KGraph registration

`kgraph-registration.json` is a refinement request with a shape-validated app
node. Canonical registration is pending because this checkout's existing package
files and compatibility aggregate disagree. After repairing that existing issue,
generate and inspect a proposal, then apply through the normal reviewed workflow:

```
node packages/robos-graph/bin/kgraph-cli.js propose --graph-root /absolute/robos --mode refine --file packages/vpn-app-container/kgraph-registration.json --output /tmp/vpn-app-proposal.json
node packages/robos-graph/bin/kgraph-cli.js apply --graph-root /absolute/robos --file /tmp/vpn-app-proposal.json
```

The app catalog and docs page describe the new application. No unrelated graph
files are rewritten to bypass the existing consistency check.
