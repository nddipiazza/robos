#!/usr/bin/env bash
# A live progress bar for robos-image.sh. Press Ctrl-C to stop watching; the build carries on.
#
#   progress.sh          update every few seconds
#   progress.sh --once   print the current state and exit
#
# repo prints no progress into a log, so the download is measured by counting the
# projects on disk, and is approximate. The build's percentage comes from its own output.
TREE="${ROBOS_ANDROID_TREE:-$HOME/android/robos}"
LOG="${ROBOS_BUILD_LOG:-$HOME/android/robos-build.log}"
OUT="$TREE/out/target/product/${ROBOS_DEVICE:-nio}"
INTERVAL=5

# From the manifest, because repo list only names the projects it has reached so far.
total_projects=$(cd "$TREE" 2>/dev/null && repo manifest 2>/dev/null | python3 -c '
import sys
import xml.etree.ElementTree as ET
count = 0
for project in ET.parse(sys.stdin).getroot().iter("project"):
    groups = project.get("groups", "").split(",")
    other_platform = any(g.startswith("platform-") and g != "platform-linux" for g in groups) and "platform-linux" not in groups
    if "notdefault" not in groups and not other_platform:
        count += 1
print(count)')
net_device=$(ip route show default 2>/dev/null | awk '{print $5; exit}')
net_file="/sys/class/net/$net_device/statistics/rx_bytes"
last_bytes=$(cat "$net_file" 2>/dev/null || echo 0)
last_time=$(date +%s)
build_start_time=0
build_start_done=0
build_total=0
REAL_BUILD_STEPS=20000

bar() { # percent
  local width=30 filled=$(($1 * 30 / 100))
  printf '['
  printf '%*s' "$filled" '' | tr ' ' '#'
  printf '%*s' "$((width - filled))" '' | tr ' ' '-'
  printf '] %3d%%' "$1"
}

human_time() { # seconds
  local s=$1
  if [ "$s" -ge 3600 ]; then printf '%dh %02dm' $((s / 3600)) $((s % 3600 / 60)); else printf '%dm' $((s / 60)); fi
}

running() { pgrep -f 'robos-image\.sh (all|sync|build)' >/dev/null; }

show() {
  local now bytes speed line done total percent fetched
  now=$(date +%s)
  bytes=$(cat "$net_file" 2>/dev/null || echo 0)
  speed=$(((bytes - last_bytes) / (now - last_time > 0 ? now - last_time : 1) / 1048576))
  last_bytes=$bytes
  last_time=$now

  # Ninja prints lines such as: [ 12% 1234/98765] compile something
  line=$(tail -c 20000 "$LOG" 2>/dev/null | tr '\r' '\n' | grep -oE '\[ *[0-9]+% [0-9]+/[0-9]+' | tail -1)
  local zip
  zip=$(ls -t "$OUT"/lineage-*.zip 2>/dev/null | head -1)

  if [ -n "$zip" ] && ! running; then
    echo "Finished: $zip"
    return 1
  elif ! running; then
    echo "The build is not running. See the end of $LOG"
    tail -3 "$LOG" | cut -c1-120
    return 1
  elif [ -n "$line" ]; then
    done=$(echo "$line" | sed -E 's/.* ([0-9]+)\/[0-9]+/\1/')
    total=$(echo "$line" | sed -E 's/.*\/([0-9]+)/\1/')
    percent=$((done * 100 / total))
    # Setup stages also print percentages, over a few hundred steps. Only the real compile is large.
    if [ "$total" -lt "$REAL_BUILD_STEPS" ]; then
      printf 'Step 3 of 3: Preparing the build (setup stage %d of %d)' "$done" "$total"
      return 0
    fi
    if [ "$build_start_done" = 0 ] || [ "$total" != "$build_total" ]; then
      build_total=$total
      build_start_time=$now
      build_start_done=$done
    fi
    local eta=""
    local elapsed=$((now - build_start_time)) progressed=$((done - build_start_done))
    if [ "$progressed" -gt 100 ]; then
      eta=", about $(human_time $(((total - done) * elapsed / progressed))) left"
    fi
    printf 'Step 3 of 3: Building  '
    bar "$percent"
    printf '  %d of %d%s' "$done" "$total" "$eta"
  elif [ -f "$TREE/build/envsetup.sh" ] && grep -qE 'breakfast|Building|build number|PLATFORM_VERSION' "$LOG" 2>/dev/null; then
    printf 'Step 3 of 3: Preparing the build (this can take a while before a percentage appears)'
  else
    fetched=$(find "$TREE/.repo/project-objects" -type d -name '*.git' -prune 2>/dev/null | wc -l)
    if [ "${total_projects:-0}" -gt 0 ] && [ "$fetched" -lt "$total_projects" ]; then
      percent=$((fetched * 100 / total_projects))
      printf 'Step 1 of 3: Downloading  '
      bar "$percent"
      printf '  about %d of %d projects' "$fetched" "$total_projects"
    else
      printf 'Step 2 of 3: Unpacking the source'
    fi
    printf ', %d MB/s' "$speed"
  fi
  return 0
}

if [ "${1:-}" = "--once" ]; then
  show
  echo
  exit 0
fi

# Each update replaces the last, cut to the tab's width so it cannot wrap onto a new line.
frame=$(mktemp)
trap 'rm -f "$frame"' EXIT
while :; do
  # Written to a file, not captured, so show keeps its speed and time-left counters.
  show >"$frame"
  status=$?
  text=$(cat "$frame")
  printf '\r\033[K%s' "$(printf '%s' "$text" | head -1 | cut -c"1-$(($(tput cols 2>/dev/null || echo 80) - 1))")"
  if [ "$status" != 0 ]; then
    printf '\n%s\n' "$(printf '%s' "$text" | tail -n +2)"
    break
  fi
  sleep "$INTERVAL"
done
