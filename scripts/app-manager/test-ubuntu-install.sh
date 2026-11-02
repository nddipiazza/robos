#!/usr/bin/env bash
# Installs the built .deb on a clean Ubuntu container and proves the desktop result
# inside a real, headless GNOME Shell. Nothing touches this machine's own desktop.
#
#   node scripts/app-manager/build.cjs --linux
#   node scripts/app-manager/publish-catalog.cjs --apps pr-review,audio-player,robos-tv,point-of-sale
#   scripts/app-manager/test-ubuntu-install.sh
set -euo pipefail
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
payloads="${ROBOS_SMOKE_PAYLOADS:-$repo/release/app-manager}"
ubuntu="${ROBOS_UBUNTU_VERSION:-26.04}"
image="robos-ubuntu-install-test:$ubuntu"
evidence="$repo/run/app-manager-gnome-smoke"
deb="$(ls "$repo"/release/app-manager/RobOS-v*-Linux-amd64.deb | head -1)"
mkdir -p "$evidence"; chmod 777 "$evidence"

docker build -q -t "$image" --build-arg "ubuntu=$ubuntu" -f - "$repo/scripts/app-manager" <<'DOCKERFILE' >/dev/null
ARG ubuntu=26.04
FROM ubuntu:${ubuntu}
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    gnome-shell gnome-shell-extension-ubuntu-dock ubuntu-settings yaru-theme-gnome-shell yaru-theme-icon \
    gsettings-desktop-schemas gnome-settings-daemon-common dconf-gsettings-backend dconf-cli libglib2.0-bin \
    xwayland mesa-vulkan-drivers libgl1-mesa-dri librsvg2-common dbus dbus-user-session desktop-file-utils \
    apparmor ca-certificates systemd systemd-sysv curl xz-utils
# The test driver needs a newer Node than Ubuntu 24.04 ships. RobOS itself does not use it.
RUN curl -fsSL https://nodejs.org/dist/v22.22.0/node-v22.22.0-linux-x64.tar.xz | tar -xJ -C /usr/local --strip-components=1
DOCKERFILE

# GNOME Shell needs logind, so the container boots systemd as a normal machine does.
container="$(docker run -d --rm --privileged --cgroupns=host --security-opt seccomp=unconfined \
  --tmpfs /run --tmpfs /run/lock -v /sys/fs/cgroup:/sys/fs/cgroup:rw \
  -v "$repo:/repo:ro" -v "$payloads:/payloads:ro" -v "$deb:/mnt/robos.deb:ro" -v "$evidence:/evidence" \
  "$image" /sbin/init)"
trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT
until docker exec "$container" systemctl is-system-running 2>/dev/null | grep -qE 'running|degraded'; do sleep 1; done

docker exec "$container" bash -euo pipefail -c '
rm -rf /evidence/*
export DEBIAN_FRONTEND=noninteractive
echo "== Install the .deb the way a user does"
apt-get install -y /mnt/robos.deb 2>&1 | tail -3
test -x /opt/RobOS/robos-app-manager
test "$(stat -c %a /opt/RobOS/chrome-sandbox)" = 4755
test -f /usr/share/applications/robos-app-manager.desktop
test -f /usr/share/icons/hicolor/256x256/apps/robos-app-manager.png
test "$(readlink -f /usr/bin/robos-app-manager)" = /opt/RobOS/robos-app-manager
test -f /etc/apparmor.d/robos-app-manager
apparmor_parser --skip-kernel-load --skip-cache /etc/apparmor.d/robos-app-manager
desktop-file-validate /usr/share/applications/robos-app-manager.desktop
echo "ok  Package installed: sandbox helper, AppArmor profile, menu entry and icons"

# Uninstall RobOS asks for a password through polkit. Record the request instead.
cat > /usr/local/bin/pkexec <<"PKEXEC"
#!/bin/sh
echo "$*" > /evidence/pkexec.log
PKEXEC
chmod +x /usr/local/bin/pkexec; touch /evidence/pkexec.log; chmod 666 /evidence/pkexec.log
useradd -m -s /bin/bash tester
runtime=/run/user/$(id -u tester); mkdir -p "$runtime"; chown tester "$runtime"; chmod 700 "$runtime"
su tester -c "
  set -euo pipefail
  export HOME=/home/tester XDG_RUNTIME_DIR=$runtime XDG_CURRENT_DESKTOP=ubuntu:GNOME XDG_SESSION_TYPE=wayland GNOME_SHELL_SESSION_MODE=ubuntu
  export ROBOS_SMOKE_PAYLOADS=/payloads ROBOS_SMOKE_OUTPUT=/evidence ROBOS_PKEXEC_LOG=/evidence/pkexec.log
  dbus-run-session -- bash -c \"
    gnome-shell --headless --unsafe-mode --virtual-monitor 1440x900 --wayland --mode=ubuntu > /evidence/shell.log 2>&1 &
    shell=\\\$!
    for i in \\\$(seq 1 40); do gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.freedesktop.DBus.Peer.Ping >/dev/null 2>&1 && break; sleep 1; done
    sleep 5
    export WAYLAND_DISPLAY=wayland-0
    node /repo/scripts/app-manager/smoke-gnome.cjs; code=\\\$?
    kill \\\$shell 2>/dev/null || true
    exit \\\$code
  \"
"
echo "== Remove the package"
apt-get remove -y robos-app-manager 2>&1 | tail -1
test ! -e /opt/RobOS/robos-app-manager
test ! -e /usr/bin/robos-app-manager
test ! -e /usr/share/applications/robos-app-manager.desktop
test ! -e /etc/apparmor.d/robos-app-manager
echo "ok  apt remove left no program files, menu entry or AppArmor profile"
'
echo "Ubuntu $ubuntu install test passed. Evidence: $evidence"
