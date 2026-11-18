---
name: install-robos-services
description: Install RobOS Services locally on Linux or Windows or on a Linux SSH host, provision SSH key authentication, enable startup and add the GNOME service-control app.
---

# Install RobOS Services

Use `packages/robos-services` for the server and Electron control app in a checkout. On an installed host resolve `~/.local/share/robos/robos-services` or `/usr/local/share/robos/robos-services` instead; a full repository is not required for hosting.

1. Inspect the requested host and SSH username. Reuse an explicitly provided host; do not guess credentials. Keep private keys and access tokens outside the repository and out of logs.
2. Use a dedicated Ed25519 identity (`~/.ssh/robos_services_ed25519`) or the user's chosen key. `new Hosts().key()` creates or reuses it. Authorize only its public key in the target account's `~/.ssh/authorized_keys` through an authenticated first login. Verify the host fingerprint before adding it to known_hosts. Subsequent calls use strict host-key verification and BatchMode.
3. Save the SSH host with `new Hosts().save({id,name,address,user,port,identity})` from `packages/robos-services/lib/hosts.cjs`. Settings live in `~/.config/robos/services/hosts.json`.
4. Run `await new Hosts().install(id)` to upload and install the server on a Linux systemd host. It installs a checksum-verified user Node runtime if needed. For local Linux run `bash packages/robos-services/install-server.sh`; for local Windows install package dependencies then run `node packages/robos-services/cli.cjs install` (per-user Task Scheduler at sign-in).
5. For Linux boot startup run `await new Hosts().call(id,{command:'linger'})` if the authorized account has passwordless sudo, or have the user run `sudo loginctl enable-linger USER` locally. Report privilege failures; do not assume startup before login works.
6. On the requested GNOME desktop run `bash ~/.local/share/robos/robos-services/install-desktop.sh`. This installs an App Grid entry, trusted desktop shortcut and icons. It does not install a full GNOME desktop on a headless server.
7. Verify requested units are enabled and active, test an authenticated gateway request, and test that a data mutation survives a service restart. Do not print the token. Record the host, services, startup mode and remaining prerequisites.

The gateway binds loopback on 19400 and routes `/grocery-lists`, `/home-services`, `/games` and `/elearning`. Remote clients use SSH forwarding and a Bearer token. Physical home-device drivers and game-specific save synchronization need client integrations; the server does not control unconfigured devices.
