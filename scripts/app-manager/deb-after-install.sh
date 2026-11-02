#!/bin/bash
# electron-builder expands ${...} when it packages this script.
if type update-alternatives >/dev/null 2>&1; then
    update-alternatives --install '/usr/bin/${executable}' '${executable}' '/opt/${sanitizedProductName}/${executable}' 100 || ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
else
    ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
fi

# Chromium's sandbox needs this helper where user namespaces are unavailable.
chmod 4755 '/opt/${sanitizedProductName}/chrome-sandbox' || true

# Ubuntu restricts unprivileged user namespaces to applications with a profile.
# An older parser rejects the rule, so a failed check leaves AppArmor unchanged.
profile='/etc/apparmor.d/${executable}'
if command -v apparmor_parser >/dev/null 2>&1 && [ -d /etc/apparmor.d ]; then
    candidate="$(mktemp)"
    cat > "$candidate" <<PROFILE
abi <abi/4.0>,
include <tunables/global>

profile ${executable} /opt/${sanitizedProductName}/${executable} flags=(unconfined) {
  userns,
  include if exists <local/${executable}>
}
PROFILE
    if apparmor_parser --skip-kernel-load --skip-cache "$candidate" >/dev/null 2>&1; then
        install -m 644 "$candidate" "$profile"
        apparmor_parser --replace --write-cache --skip-read-cache "$profile" >/dev/null 2>&1 || true
    fi
    rm -f "$candidate"
fi

if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database /usr/share/applications || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -q -t -f /usr/share/icons/hicolor || true
fi
