---
name: manage-robos-services
description: Inspect RobOS service hosts, discover installed units and app-owned listeners, start/stop/restart services, set startup and read service logs.
---

# Manage RobOS Services

Use the RobOS Services app or `packages/robos-services/cli.cjs` in a checkout. On installed hosts resolve `~/.local/share/robos/robos-services/cli.cjs` or `/usr/local/share/robos/robos-services/cli.cjs`. Configuration is under `~/.config/robos/services`; Linux runs user systemd units and Windows runs per-user scheduled tasks.

- List locally: `node packages/robos-services/cli.cjs list`.
- List a configured remote host: `new Hosts().call(hostId,{command:'list'})`, importing `Hosts` from `packages/robos-services/lib/hosts.cjs`.
- Control a discovered unit: `node packages/robos-services/cli.cjs action UNIT start|stop|restart|enable|disable|logs user|system`. For SSH use `Hosts.call(hostId,{command:'action',unit,scope,action})`.
- Only discovered RobOS units can be controlled. System units need suitable privileges; failed sudo remains an error. Do not take control of unrelated OS services.
- `enable`/`disable` changes startup; `start`/`stop` changes current state. Check both fields after changes. Linux linger determines startup before login.
- App-owned HTTP, socket, Cast, debug and game-control listeners appear in source inventory and runtime records. Embedded listeners are informational; control their owning app instead of killing a process by port. A catalog entry is not evidence that a server is running.
- Refresh source inventory after adding a listener: `node packages/robos-services/tools/inventory.cjs`. Node apps loading `robos-lib/dom-snapshot` register listeners via `robos-lib/service-registry.cjs`. Independent Node servers can call `trackServer(server,{appId,name})` explicitly.

For a broken home feature check its host, gateway and required service status before debugging the client. Logs must not include tokens or private keys. Report unconfigured drivers, missing runtime evidence and client integrations explicitly.
