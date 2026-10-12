#!/usr/bin/env bash
# play.sh — Unified Launcher for RobOS Tabletop RPG: HeroQuest
set -e

if [[ -n "$GODOT_BIN" && -x "$GODOT_BIN" ]]; then
  GODOT="$GODOT_BIN"
elif [[ -x "$HOME/.local/bin/godot" ]]; then
  GODOT="$HOME/.local/bin/godot"
elif [[ -x "$HOME/apps/godot4" ]]; then
  GODOT="$HOME/apps/godot4"
elif command -v godot4 >/dev/null 2>&1; then
  GODOT="$(command -v godot4)"
elif command -v godot >/dev/null 2>&1; then
  GODOT="$(command -v godot)"
else
  echo "Error: Godot 4 binary not found. Please install Godot 4 or set GODOT_BIN." >&2
  exit 1
fi

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🛡️ Launching RobOS Tabletop RPG: HeroQuest..."
echo "  Engine: $GODOT"
echo "  Project: $PROJECT_DIR"
cartridge_arg=""
quest_arg=""
is_headless=0
is_auto=0

engine_args=()
game_args=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --reset|-r|--force-reload|--new-game)
      export TABLETOP_RESET=1
      shift
      ;;
    --demo|-d|--auto-play)
      export TABLETOP_DEMO=1
      export TABLETOP_AUTO_PLAY=1
      is_auto=1
      shift
      ;;
    --player)
      export TABLETOP_ROLE=player
      shift
      ;;
    --dm|--gm)
      export TABLETOP_ROLE=gm
      shift
      ;;
    --hard|--hard-mode)
      export TABLETOP_HARD_MODE=1
      export TABLETOP_DIFFICULTY=hard
      shift
      ;;
    --cartridge=*|--campaign=*)
      cartridge_arg="${1#*=}"
      shift
      ;;
    --cartridge|--campaign|-c)
      cartridge_arg="$2"
      shift 2
      ;;
    --mission=*)
      cartridge_arg="${1#*=}"
      shift
      ;;
    --mission|-m)
      cartridge_arg="$2"
      shift 2
      ;;
    --quest=*|-q=*)
      quest_arg="${1#*=}"
      shift
      ;;
    --quest|-q)
      quest_arg="$2"
      shift 2
      ;;
    --headless|--quit)
      engine_args+=("$1")
      is_headless=1
      shift
      ;;
    --quit-after)
      engine_args+=("$1" "$2")
      shift 2
      ;;
    --quit-after=*)
      engine_args+=("$1")
      shift
      ;;
    4|fortress|fortress-fire-king|heroquest-fortress-fire-king|fire-king)
      cartridge_arg="heroquest-fortress-fire-king"
      quest_arg="4"
      shift
      ;;
    1|the-trial|heroquest-the-trial|trial)
      cartridge_arg="heroquest-the-trial"
      quest_arg="1"
      shift
      ;;
    2|sir-ragnar|rescue-sir-ragnar)
      cartridge_arg="heroquest-the-trial"
      quest_arg="2"
      shift
      ;;
    3|ulag|lair-orc-warlord)
      cartridge_arg="heroquest-the-trial"
      quest_arg="3"
      shift
      ;;
    *)
      game_args+=("$1")
      shift
      ;;
  esac
done

if [[ -n "$quest_arg" ]]; then
  export TABLETOP_QUEST="$quest_arg"
  if [[ "$quest_arg" == "4" || "$quest_arg" == "quest-4" || "$quest_arg" == *"fortress"* ]]; then
    cartridge_arg="heroquest-fortress-fire-king"
  fi
fi

if [[ -n "$cartridge_arg" ]]; then
  if [[ "$cartridge_arg" == "4" || "$cartridge_arg" == "quest-4" || "$cartridge_arg" == *"fortress"* ]]; then
    cartridge_arg="heroquest-fortress-fire-king"
    export TABLETOP_QUEST="4"
  elif [[ "$cartridge_arg" == "1" || "$cartridge_arg" == "quest-1" || "$cartridge_arg" == *"trial"* ]]; then
    cartridge_arg="heroquest-the-trial"
    export TABLETOP_QUEST="1"
  fi
  export TABLETOP_CARTRIDGE="$cartridge_arg"
fi

# Interactive quest selector if launched without cartridge arguments in an interactive terminal
if [[ -z "$TABLETOP_CARTRIDGE" && $is_headless -eq 0 && $is_auto -eq 0 && -t 0 ]]; then
  echo ""
  echo "Select Quest to Launch:"
  echo "  1) Quest 1: The Trial (Classic 28x21 Board)"
  echo "  2) Quest 2: The Rescue of Sir Ragnar (Classic 28x21 Board)"
  echo "  3) Quest 3: Lair of the Orc Warlord (First Light Caverns)"
  echo "  4) Quest 4: The Fortress of the Fire King (First Light Side A - 26x19 Board) [DEFAULT]"
  echo ""
  read -t 4 -p "Enter choice [1-4] (default: 4): " choice || true
  echo ""
  case "$choice" in
    1)
      export TABLETOP_CARTRIDGE="heroquest-the-trial"
      export TABLETOP_QUEST="1"
      ;;
    2)
      export TABLETOP_CARTRIDGE="heroquest-the-trial"
      export TABLETOP_QUEST="2"
      ;;
    3)
      export TABLETOP_CARTRIDGE="heroquest-the-trial"
      export TABLETOP_QUEST="3"
      ;;
    4|"")
      export TABLETOP_CARTRIDGE="heroquest-fortress-fire-king"
      export TABLETOP_QUEST="4"
      ;;
    *)
      export TABLETOP_CARTRIDGE="$choice"
      ;;
  esac
fi

if [[ -z "$TABLETOP_CARTRIDGE" ]]; then
  export TABLETOP_CARTRIDGE="heroquest-the-trial"
fi

echo "  Cartridge: $TABLETOP_CARTRIDGE (Quest: ${TABLETOP_QUEST:-1})"

exec "$GODOT" "${engine_args[@]}" --path "$PROJECT_DIR" "${game_args[@]}"
