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
    1|custom|custom-quest|dungeon)
      cartridge_arg="custom-quest"
      quest_arg="1"
      shift
      ;;
    4|fortress|fortress-fire-king|heroquest-fortress-fire-king|fire-king)
      cartridge_arg="heroquest-fortress-fire-king"
      quest_arg="4"
      shift
      ;;
    5|dialogue|simple-dialogue|simple-dialogue-quest)
      cartridge_arg="simple-dialogue-quest"
      quest_arg="5"
      shift
      ;;
    the-trial|heroquest-the-trial|trial)
      cartridge_arg="heroquest-the-trial"
      quest_arg="1"
      shift
      ;;
    sir-ragnar|rescue-sir-ragnar)
      cartridge_arg="heroquest-the-trial"
      quest_arg="2"
      shift
      ;;
    ulag|lair-orc-warlord)
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
  if [[ "$quest_arg" == "1" || "$quest_arg" == "custom"* ]]; then
    cartridge_arg="custom-quest"
  elif [[ "$quest_arg" == "4" || "$quest_arg" == "quest-4" || "$quest_arg" == *"fortress"* ]]; then
    cartridge_arg="heroquest-fortress-fire-king"
  elif [[ "$quest_arg" == "5" || "$quest_arg" == "simple"* || "$quest_arg" == *"dialogue"* ]]; then
    cartridge_arg="simple-dialogue-quest"
  fi
fi

if [[ -n "$cartridge_arg" ]]; then
  if [[ "$cartridge_arg" == "1" || "$cartridge_arg" == "custom" || "$cartridge_arg" == "custom-quest" ]]; then
    cartridge_arg="custom-quest"
    export TABLETOP_QUEST="1"
  elif [[ "$cartridge_arg" == "4" || "$cartridge_arg" == "quest-4" || "$cartridge_arg" == *"fortress"* ]]; then
    cartridge_arg="heroquest-fortress-fire-king"
    export TABLETOP_QUEST="4"
  elif [[ "$cartridge_arg" == "5" || "$cartridge_arg" == "simple-dialogue-quest" || "$cartridge_arg" == "dialogue" ]]; then
    cartridge_arg="simple-dialogue-quest"
    export TABLETOP_QUEST="5"
  elif [[ "$cartridge_arg" == *"trial"* ]]; then
    cartridge_arg="heroquest-the-trial"
    export TABLETOP_QUEST="1"
  fi
  export TABLETOP_CARTRIDGE="$cartridge_arg"
fi

if [[ -z "$TABLETOP_CARTRIDGE" ]]; then
  export TABLETOP_CARTRIDGE="custom-quest"
  export TABLETOP_QUEST="1"
fi

echo "  Cartridge: $TABLETOP_CARTRIDGE (Quest: ${TABLETOP_QUEST:-1})"

exec "$GODOT" "${engine_args[@]}" --path "$PROJECT_DIR" "${game_args[@]}"
