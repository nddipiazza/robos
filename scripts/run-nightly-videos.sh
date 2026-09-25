#!/usr/bin/env bash
# scripts/run-nightly-videos.sh — RobOS Nightly Video Production Orchestrator
#
# Automatically runs an automated simulation or demo in headless Xvfb,
# records the video proof-of-work, and processes both YouTube 16:9 and TikTok 9:16
# broadcast packages with thumbnails, covers, and publishing metadata.
#
# Usage:
#   bash scripts/run-nightly-videos.sh                 # Auto-rotates today's scenario
#   bash scripts/run-nightly-videos.sh --fireball      # Run Fireball goblin decimation
#   bash scripts/run-nightly-videos.sh --golems        # Run Fighter trio vs Stone Golems
#   bash scripts/run-nightly-videos.sh --app-demo      # Run RobOS App Walkthrough demo
#   bash scripts/run-nightly-videos.sh --feature <relpath> # Custom cRPG feature file
#   bash scripts/run-nightly-videos.sh --input <video> # Process existing video directly

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CRPG_DIR="$REPO_ROOT/games/crpg-realm"
TODAY="$(date +%Y-%m-%d)"
DAY_OF_WEEK="$(date +%u)" # 1=Mon, 7=Sun
ARCHIVE_ROOT="$HOME/.robos/videos/nightly/$TODAY"
XVFB_DISPLAY="${CRPG_DISPLAY:-:99}"

SCENARIO_TYPE="auto"
CUSTOM_FEATURE=""
CUSTOM_INPUT=""
TITLE=""
BADGE="Godot 4 cRPG Engine"
SUBTITLE="Autonomous AI Verification"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --fireball)
            SCENARIO_TYPE="fireball"
            shift
            ;;
        --golems)
            SCENARIO_TYPE="golems"
            shift
            ;;
        --invisibility|--stealth)
            SCENARIO_TYPE="invisibility"
            shift
            ;;
        --app-demo|--demo)
            SCENARIO_TYPE="demo"
            shift
            ;;
        --feature)
            SCENARIO_TYPE="custom_feature"
            CUSTOM_FEATURE="$2"
            shift 2
            ;;
        --input)
            SCENARIO_TYPE="custom_input"
            CUSTOM_INPUT="$2"
            shift 2
            ;;
        --title)
            TITLE="$2"
            shift 2
            ;;
        --badge)
            BADGE="$2"
            shift 2
            ;;
        --subtitle)
            SUBTITLE="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1" >&2
            echo "Usage: $0 [--fireball|--golems|--invisibility|--app-demo|--feature <file>|--input <video>]" >&2
            exit 1
            ;;
    esac
done

echo "====================================================="
echo "       RobOS Nightly Video Production Run            "
echo "====================================================="
echo "Date:            $TODAY"
echo "Display:         $XVFB_DISPLAY"
echo "Archive Target:  $ARCHIVE_ROOT"
echo ""

# Ensure user PATH has godot & piper
export PATH="$HOME/.local/bin:$PATH"

# Rotating schedule if auto
if [[ "$SCENARIO_TYPE" == "auto" ]]; then
    case "$DAY_OF_WEEK" in
        1) SCENARIO_TYPE="fireball" ;;
        2) SCENARIO_TYPE="golems" ;;
        3) SCENARIO_TYPE="invisibility" ;;
        4) SCENARIO_TYPE="tactical_pack" ;;
        5) SCENARIO_TYPE="spider_ambush" ;;
        6) SCENARIO_TYPE="citadel_siege" ;;
        7) SCENARIO_TYPE="demo" ;;
    esac
fi

RAW_VIDEO=""
SLUG=""

case "$SCENARIO_TYPE" in
    fireball)
        SLUG="fireball-goblin-decimation"
        TITLE="${TITLE:-8d6 Fireball Goblin Horde Decimation}"
        BADGE="Godot 4 cRPG Engine"
        SUBTITLE="Stress-Testing AoE & Saving Throws"
        FEATURE="tests/e2e/features/normal/15_classic_fireball_goblin_crowd_decimation.feature"
        ;;
    golems)
        SLUG="fighter-trio-vs-stone-golems"
        TITLE="${TITLE:-Fighter Trio vs Stone Golems Combat Attrition}"
        BADGE="Infinity Engine RTwP"
        SUBTITLE="Multi-Party Tactical Aggro Stress-Test"
        FEATURE="tests/e2e/features/normal/13_fighter_trio_vs_golems_attrition.feature"
        ;;
    invisibility)
        SLUG="invisibility-and-sanctuary"
        TITLE="${TITLE:-Invisibility & Sanctuary Targeting Immunity}"
        BADGE="cRPG Spell Arsenal"
        SUBTITLE="Verifying D&D 5e Stealth & Aggro Dispel"
        FEATURE="tests/e2e/features/normal/16_infinity_engine_invisibility_and_stealth.feature"
        ;;
    tactical_pack)
        SLUG="multi-party-tactical-combat"
        TITLE="${TITLE:-Multi-Party Multi-Enemy Tactical Combat}"
        BADGE="Godot 4 cRPG Engine"
        SUBTITLE="Autonomous Combat Formations"
        FEATURE="tests/e2e/features/normal/05_multi_party_multi_enemy_tactical_combat.feature"
        ;;
    spider_ambush)
        SLUG="cavern-crawl-spider-ambush"
        TITLE="${TITLE:-Cavern Crawl & Giant Spider Ambush}"
        BADGE="cRPG Dungeon Crawl"
        SUBTITLE="Dynamic Threat Peeling & Web Traps"
        FEATURE="tests/e2e/features/scenarios/01_cavern_crawl_and_spider_ambush.feature"
        ;;
    citadel_siege)
        SLUG="candlekeep-citadel-siege"
        TITLE="${TITLE:-Candlekeep Citadel Siege Defense}"
        BADGE="Epic Campaign Scenario"
        SUBTITLE="Boss AI & Tactical Positioning"
        FEATURE="tests/e2e/features/scenarios/03_candlekeep_citadel_siege.feature"
        ;;
    demo)
        SLUG="robos-sdlc-tour"
        TITLE="${TITLE:-RobOS AI SDLC Platform Walkthrough}"
        BADGE="RobOS Dev Suite"
        SUBTITLE="Autonomous Agent Governance Harness"
        ;;
    custom_feature)
        FEATURE="$CUSTOM_FEATURE"
        SLUG="$(basename "$FEATURE" .feature)"
        TITLE="${TITLE:-$(basename "$FEATURE" .feature | tr '_' ' ' | sed -e 's/\b\(.\)/\u\1/g')}"
        ;;
    custom_input)
        RAW_VIDEO="$CUSTOM_INPUT"
        SLUG="$(basename "$RAW_VIDEO" | cut -f 1 -d '.')"
        TITLE="${TITLE:-$SLUG}"
        ;;
esac

OUT_DIR="$ARCHIVE_ROOT/$SLUG"
mkdir -p "$OUT_DIR"

if [[ -z "$RAW_VIDEO" ]]; then
    if [[ "$SCENARIO_TYPE" == "demo" ]]; then
        echo "[1/3] Running RobOS Electron App Demo in Xvfb ($XVFB_DISPLAY)..."
        DEMO_SCRIPT="$REPO_ROOT/packages/robos-test/demos/video-generator-demo.js"
        if [ ! -f "$DEMO_SCRIPT" ]; then
            DEMO_SCRIPT="$REPO_ROOT/packages/robos-test/demos/ai-prompt-demo.js"
        fi
        xvfb-run -a -s "-screen 0 1920x1080x24" node "$DEMO_SCRIPT" || true
        RAW_VIDEO="$(ls -t "$REPO_ROOT/packages/robos-test/run/demos"/*/*-final.webm 2>/dev/null | head -n 1)"
    else
        echo "[1/3] Executing cRPG Scenario: $FEATURE..."
        cd "$CRPG_DIR"
        mkdir -p tests/e2e/reports/videos
        
        CRPG_MODE=human xvfb-run -a -s "-screen 0 1920x1080x24" python3 -m behave "$FEATURE"
        RAW_VIDEO="$(ls -t "$CRPG_DIR/tests/e2e/reports/videos"/*.mp4 2>/dev/null | head -n 1)"
    fi
fi

if [[ -z "$RAW_VIDEO" || ! -f "$RAW_VIDEO" ]]; then
    echo "Error: Failed to find or record raw video!" >&2
    exit 1
fi

echo "Captured raw video: $RAW_VIDEO ($(du -h "$RAW_VIDEO" | cut -f1))"
echo ""

echo "[2/3] Transforming video into YouTube (16:9) & TikTok (9:16) formats..."
python3 "$REPO_ROOT/scripts/nightly-video-pipeline.py" \
    --input "$RAW_VIDEO" \
    --output-dir "$OUT_DIR" \
    --slug "$SLUG" \
    --title "$TITLE" \
    --badge "$BADGE" \
    --subtitle "$SUBTITLE"

echo ""
echo "[3/3] Updating symlinks and archives..."
LATEST_DIR="$HOME/.robos/videos/nightly/latest"
mkdir -p "$(dirname "$LATEST_DIR")"
rm -f "$LATEST_DIR"
ln -sf "$OUT_DIR" "$LATEST_DIR"

REPO_LATEST="$REPO_ROOT/videos/nightly/latest"
mkdir -p "$(dirname "$REPO_LATEST")"
rm -f "$REPO_LATEST"
ln -sf "$OUT_DIR" "$REPO_LATEST"

echo "====================================================="
echo "✔ Nightly Video Package Ready!"
echo "====================================================="
echo "Deliverables in: $OUT_DIR"
echo "Latest Symlink:  $LATEST_DIR"
echo ""
ls -lh "$OUT_DIR"
echo ""
