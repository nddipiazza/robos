#!/bin/bash
# electron-builder expands ${...} when it packages this script.
case "$1" in
  remove|purge)
    if type update-alternatives >/dev/null 2>&1; then
        update-alternatives --remove '${executable}' '/opt/${sanitizedProductName}/${executable}' >/dev/null 2>&1 || true
    fi
    [ -L '/usr/bin/${executable}' ] && [ ! -e '/usr/bin/${executable}' ] && rm -f '/usr/bin/${executable}'
    profile='/etc/apparmor.d/${executable}'
    if [ -f "$profile" ]; then
        command -v apparmor_parser >/dev/null 2>&1 && apparmor_parser --remove "$profile" >/dev/null 2>&1
        rm -f "$profile"
    fi
    ;;
esac
exit 0
