#!/usr/bin/env bash
# Runs the real app on an emulator against tools/fake-lights.js, then saves screenshots
# to evidence/. Needs the Android SDK, with an emulator and an android-35 system image.
set -euo pipefail

cd "$(dirname "$0")/.."
SDK="${ANDROID_HOME:-$HOME/Android/Sdk}"
ADB="$SDK/platform-tools/adb"
AVD=robos-phone

if ! "$SDK/cmdline-tools/latest/bin/avdmanager" list avd -c | grep -qx "$AVD"; then
  echo no | "$SDK/cmdline-tools/latest/bin/avdmanager" create avd -n "$AVD" \
    -k "system-images;android-35;google_apis;x86_64" -d pixel_4
fi

node tools/fake-lights.js &
FAKE=$!
EMU=
cleanup() {
  kill "$FAKE" 2>/dev/null || true
  if [ -n "$EMU" ]; then "$ADB" emu kill 2>/dev/null || true; fi
}
trap cleanup EXIT

if ! "$ADB" devices | grep -q '^emulator-'; then
  "$SDK/emulator/emulator" -avd "$AVD" -no-window -no-audio -no-snapshot-save -gpu swiftshader_indirect >/dev/null 2>&1 &
  EMU=$!
fi
"$ADB" wait-for-device
until [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 2; done

# Match the Moto G10's screen: 720 x 1600 at about 269 dpi.
"$ADB" shell wm size 720x1600
"$ADB" shell wm density 280

./gradlew --console=plain connectedDebugAndroidTest "$@"

mkdir -p evidence
"$ADB" pull /data/local/tmp/robos-shots/. evidence/ >/dev/null
echo "Screenshots are in evidence/"
