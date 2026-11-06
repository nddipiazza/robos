#!/usr/bin/env bash
# Builds the RobOS phone image from LineageOS source.
#
#   robos-image.sh check     report what is missing, without changing anything
#   robos-image.sh parts     build the RobOS apps and boot animation
#   robos-image.sh sync      download LineageOS source (over 100 GB)
#   robos-image.sh start     build in its own background service, and return
#   robos-image.sh build     build in this shell (several hours the first time)
#   robos-image.sh all       parts, sync, then build
#
# Set ROBOS_DEVICE to pick the phone: nio (Moto G100, the default) or capri (Moto G10).
# Set ROBOS_ANDROID_TREE to change where the source goes (default ~/android/robos).
# Set ROBOS_JOBS to change how many compile jobs run at once (default 6).
# Set ROBOS_MEMORY_MAX to change the memory cap for robos-image.sh start (default 44G, or
# 36G with zram swap on).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$HERE/../.." && pwd)"
TREE="${ROBOS_ANDROID_TREE:-$HOME/android/robos}"
BRANCH=lineage-24.0
DEVICE="${ROBOS_DEVICE:-nio}"
case "$DEVICE" in
  nio) SCREEN="1080 2520" ;;
  capri) SCREEN="720 1600" ;;
  *) echo "Unknown device: $DEVICE. Use nio or capri." >&2; exit 2 ;;
esac
VENDOR="$HERE/vendor/robos"

check() {
  local missing=0
  for tool in repo git git-lfs python3 bc bison flex ccache zip curl rsync; do
    command -v "$tool" >/dev/null || { echo "Missing tool: $tool"; missing=1; }
  done
  python3 -c "import PIL" 2>/dev/null || { echo "Missing Python module: Pillow"; missing=1; }
  local free_gb
  mkdir -p "$TREE"
  free_gb=$(df -BG --output=avail "$TREE" | tail -1 | tr -dc 0-9)
  [ "$free_gb" -ge 400 ] || { echo "Only ${free_gb} GB free at $TREE; allow 400 GB."; missing=1; }
  if [ "$missing" = 1 ]; then
    echo "Install the tools with:"
    echo "  sudo apt install repo git git-lfs bc bison flex ccache zip curl rsync build-essential libssl-dev libncurses-dev python3-pil"
    return 1
  fi
  echo "Ready: ${free_gb} GB free at $TREE, $(nproc) cores, $(free -g | awk '/Mem:/{print $2}') GB memory."
}

parts() {
  mkdir -p "$VENDOR/prebuilt" "$VENDOR/bootanimation"
  (cd "$REPO_ROOT/packages/robos-launcher-android" && ./gradlew --console=plain assembleRelease)
  (cd "$REPO_ROOT/packages/smart-home-android" && ./gradlew --console=plain assembleRelease)
  (cd "$REPO_ROOT/packages/robos-preferences-android" && ./gradlew --console=plain assembleRelease)
  cp "$REPO_ROOT/packages/robos-launcher-android/app/build/outputs/apk/release/app-release-unsigned.apk" "$VENDOR/prebuilt/RobOSHome.apk"
  cp "$REPO_ROOT/packages/smart-home-android/app/build/outputs/apk/release/app-release-unsigned.apk" "$VENDOR/prebuilt/RobOSSmartHome.apk"
  cp "$REPO_ROOT/packages/robos-preferences-android/app/build/outputs/apk/release/app-release-unsigned.apk" "$VENDOR/prebuilt/RobOSPreferences.apk"
  # shellcheck disable=SC2086
  python3 "$HERE/tools/make-bootanimation.py" $SCREEN "$REPO_ROOT/robos-transparent-background.png" "$VENDOR/bootanimation/bootanimation.zip"
  ls -la "$VENDOR/prebuilt" "$VENDOR/bootanimation"
}

sync() {
  mkdir -p "$TREE/.repo/local_manifests"
  cd "$TREE"
  repo init -u https://github.com/LineageOS/android.git -b "$BRANCH" --git-lfs --no-clone-bundle
  rm -f .repo/local_manifests/robos.xml
  cp "$HERE/local_manifests/robos-$DEVICE.xml" .repo/local_manifests/robos.xml
  # A download this large usually hits a dropped connection, and repo resumes where it stopped.
  local attempt
  for attempt in 1 2 3 4; do
    repo sync -c --no-tags --force-sync -j"$(nproc)" && return 0
    echo "Sync attempt $attempt failed. Retrying."
    sleep 60
  done
  return 1
}

build() {
  [ -f "$VENDOR/prebuilt/RobOSHome.apk" ] || parts
  cd "$TREE"
  # Copied, because Soong does not follow symlinks when it looks for build files.
  rsync -a --delete "$VENDOR/" vendor/robos/
  # The Android build scripts assume a shell without these checks.
  set +eu
  # shellcheck disable=SC1091
  source build/envsetup.sh
  breakfast "$DEVICE" userdebug || { echo "breakfast failed"; return 1; }
  # The device tree comes from LineageOS and a sync resets it, so this is added each build.
  local product="device/motorola/$DEVICE/lineage_$DEVICE.mk"
  grep -q 'vendor/robos/config/robos.mk' "$product" ||
    echo '$(call inherit-product, vendor/robos/config/robos.mk)' >> "$product"
  # A sync resets this too. Without it, analysis does not fit in 64 GB of memory.
  grep -q 'SetMemoryLimit' build/soong/cmd/soong_build/main.go ||
    git -C build/soong apply "$HERE/patches/soong-memory-limit.patch"
  export TARGET_BOOTANIMATION=vendor/robos/bootanimation/bootanimation.zip
  export USE_CCACHE=1
  # Android 17 turns this on by default. It speeds up rebuilds, which this image does not
  # need, and analysis went past 50 GB of memory with it on.
  export SOONG_INCREMENTAL_ANALYSIS=false
  CCACHE_EXEC="$(command -v ccache)"
  export CCACHE_EXEC
  # The build's sandbox can leave an empty file where the cache folder belongs, and then
  # every compile fails with "ccache: error: Not a directory".
  local cache_dir="$HOME/.cache/ccache"
  if [ -f "$cache_dir" ] && [ ! -s "$cache_dir" ]; then rm "$cache_dir"; fi
  mkdir -p "$cache_dir"
  ccache -M 50G >/dev/null
  m -j"${ROBOS_JOBS:-6}" bacon || { echo "The build failed."; return 1; }
  set -eu
  ls -la "$TREE/out/target/product/$DEVICE/"lineage-*.zip
}

# The build can use tens of gigabytes while it analyzes the source. Inside a desktop app's
# group, the system's out-of-memory guard kills the app along with it, so it gets its own
# service, which also keeps running if the terminal or app that started it closes. The cap
# leaves room for everything else: at 50 GB the whole machine ran out, and the kernel killed
# unrelated containers. With no swap allowed, hitting the cap only stops the build.
start() {
  local log="$HOME/android/robos-build.log"
  [ -f "$log" ] && mv "$log" "$log.previous"
  systemctl --user reset-failed robos-image 2>/dev/null || true
  # Compressed swap in RAM lets the build go past physical memory. Its pool also takes RAM,
  # and is not counted against the service, so the cap is lower when it is on.
  local memory_max=44G swap_max=0
  if swapon --show=NAME --noheadings | grep -q zram; then
    memory_max=36G
    swap_max=48G
  fi
  systemd-run --user --unit=robos-image \
    --property=MemoryMax="${ROBOS_MEMORY_MAX:-$memory_max}" --property=MemorySwapMax="$swap_max" --property=Nice=10 \
    --property="StandardOutput=append:$log" --property="StandardError=append:$log" \
    --setenv=ROBOS_DEVICE="$DEVICE" --setenv=ROBOS_ANDROID_TREE="$TREE" --setenv=PATH="$PATH" \
    --working-directory="$REPO_ROOT" \
    systemd-inhibit --what=idle:sleep --who="RobOS image build" --why="Building the RobOS phone image" \
    "$HERE/robos-image.sh" build
  echo "Started. Watch it with infra/android/tools/progress.sh. Stop it with: systemctl --user stop robos-image"
}

case "${1:-}" in
  start) start ;;
  check) check ;;
  parts) parts ;;
  sync) check && sync ;;
  build) build ;;
  all) check && parts && sync && build ;;
  *) sed -n 2,15p "$0"; exit 2 ;;
esac
