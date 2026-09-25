#!/usr/bin/env bash
# scripts/setup-nightly-video-cron.sh — Manage Nightly Video Generation Cron Job
#
# Configures an automated user-level cron schedule to execute
# scripts/run-nightly-videos.sh every night.
#
# Usage:
#   bash scripts/setup-nightly-video-cron.sh             # Install default cron (2:00 AM daily)
#   bash scripts/setup-nightly-video-cron.sh --status    # Check current cron status
#   bash scripts/setup-nightly-video-cron.sh --remove    # Remove nightly cron job
#   bash scripts/setup-nightly-video-cron.sh --time "0 3 * * *" # Custom schedule

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNNER="$REPO_ROOT/scripts/run-nightly-videos.sh"
LOG_DIR="$HOME/.robos/videos/nightly"
LOG_FILE="$LOG_DIR/cron.log"
CRON_TIME="0 2 * * *" # Default 2:00 AM every night
TAG="# ROBOS_NIGHTLY_VIDEOS_JOB"

ACTION="install"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --status|-s)
            ACTION="status"
            shift
            ;;
        --remove|-r)
            ACTION="remove"
            shift
            ;;
        --time|-t)
            CRON_TIME="$2"
            shift 2
            ;;
        --help|-h)
            echo "Usage: $0 [--install|--status|--remove|--time <cron_expression>]"
            exit 0
            ;;
        *)
            ACTION="install"
            shift
            ;;
    esac
done

show_status() {
    echo "=== Nightly Video Cron Status ==="
    local current
    current="$(crontab -l 2>/dev/null || true)"
    if echo "$current" | grep -q "$TAG"; then
        echo "Status: [ACTIVE]"
        echo "Active crontab entry:"
        echo "$current" | grep -A 1 "$TAG"
    else
        echo "Status: [INACTIVE] (No active RobOS nightly video cron job found)"
    fi
    echo ""
    echo "Log file: $LOG_FILE"
    if [ -f "$LOG_FILE" ]; then
        echo "Last log lines:"
        tail -n 10 "$LOG_FILE"
    fi
    echo "=================================="
}

remove_cron() {
    echo "Removing RobOS Nightly Video cron job..."
    local current
    current="$(crontab -l 2>/dev/null || true)"
    if echo "$current" | grep -q "$TAG"; then
        # Remove comment tag and the following line
        local updated
        updated="$(echo "$current" | grep -v "$TAG" | grep -v "$RUNNER" || true)"
        echo "$updated" | crontab -
        echo "✔ Cron job successfully removed."
    else
        echo "No RobOS nightly video cron job was found to remove."
    fi
}

install_cron() {
    echo "Configuring RobOS Nightly Video cron schedule..."
    mkdir -p "$LOG_DIR"
    
    # Verify prerequisites
    echo "Checking system prerequisites..."
    for bin in ffmpeg ffprobe Xvfb python3; do
        if ! command -v "$bin" &>/dev/null; then
            echo "Error: required binary '$bin' is not installed." >&2
            exit 1
        fi
    done
    
    if ! command -v godot &>/dev/null; then
        if [ -f "$HOME/.local/bin/godot" ]; then
            export PATH="$HOME/.local/bin:$PATH"
        elif [ -f "$HOME/apps/godot4" ]; then
            ln -sf "$HOME/apps/godot4" "$HOME/.local/bin/godot"
            ln -sf "$HOME/apps/godot4" "$HOME/.local/bin/godot4"
        fi
    fi
    
    chmod +x "$RUNNER"
    
    # Read existing crontab
    local current
    current="$(crontab -l 2>/dev/null || true)"
    
    # Clean old entry if exists
    local cleaned
    cleaned="$(echo "$current" | grep -v "$TAG" | grep -v "$RUNNER" || true)"
    
    # Construct new cron line with full environment PATH
    local user_path="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin"
    local cron_cmd="PATH=$user_path bash $RUNNER >> $LOG_FILE 2>&1"
    local new_entry="$TAG"$'\n'"$CRON_TIME $cron_cmd"
    
    if [ -n "$cleaned" ]; then
        printf "%s\n%s\n" "$cleaned" "$new_entry" | crontab -
    else
        printf "%s\n" "$new_entry" | crontab -
    fi
    
    echo "✔ Successfully installed Nightly Video cron schedule!"
    echo "  Schedule: $CRON_TIME"
    echo "  Runner:   $RUNNER"
    echo "  Log:      $LOG_FILE"
    echo ""
}

case "$ACTION" in
    status)
        show_status
        ;;
    remove)
        remove_cron
        ;;
    install)
        install_cron
        show_status
        ;;
esac
