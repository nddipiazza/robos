#!/usr/bin/env bash
# ==============================================================================
# RobOS Plugin & Skills Installer
# Installs and synchronizes RobOS skills and marketplace plugins across
# Claude Code, OpenAI Codex, Google Antigravity, GitHub Copilot, and Gemini CLI.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PLUGIN_DIR="${SCRIPT_DIR}/robos"
SKILLS_DIR="${PLUGIN_DIR}/skills"
COMMANDS_DIR="${PLUGIN_DIR}/commands"

TARGET="all"
GLOBAL=false
DRY_RUN=false
SYNC_ONLY=false

usage() {
  cat <<EOF
RobOS Skills & Plugin Installer

Usage:
  $(basename "$0") [options]

Options:
  -t, --target <agent>   Target agent platform to install/sync for:
                         all (default), claude, codex, antigravity, copilot, gemini
  -g, --global           Install globally to user's home directory (~/.claude, ~/.agents, etc.)
  -s, --sync             Synchronize skills and command bridges to local project folders
  -n, --dry-run          Show what actions would be performed without modifying files
  -h, --help             Display this help message

Examples:
  ./plugins/install.sh                   # Install/sync skills for all agent platforms in this repo
  ./plugins/install.sh --target claude   # Install for Claude Code only
  ./plugins/install.sh --global          # Install globally to user profile
  ./plugins/install.sh --sync            # Sync skills after adding/modifying skills
EOF
  exit 0
}

# Parse command-line flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    -t|--target)
      TARGET="${2:-}"
      shift 2
      ;;
    -g|--global)
      GLOBAL=true
      shift
      ;;
    -s|--sync)
      SYNC_ONLY=true
      shift
      ;;
    -n|--dry-run)
      DRY_RUN=true
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      ;;
  esac
done

log() {
  echo -e "\033[1;36m[robos-plugins]\033[0m $*"
}

success() {
  echo -e "\033[1;32m[✓]\033[0m $*"
}

copy_or_dry_run() {
  local src="$1"
  local dest="$2"

  if [ "$DRY_RUN" = true ]; then
    echo "  [DRY-RUN] cp -r \"$src\" \"$dest\""
  else
    mkdir -p "$(dirname "$dest")"
    cp -r "$src" "$dest"
  fi
}

mkdir_or_dry_run() {
  local dir="$1"
  if [ "$DRY_RUN" = true ]; then
    echo "  [DRY-RUN] mkdir -p \"$dir\""
  else
    mkdir -p "$dir"
  fi
}

# ------------------------------------------------------------------------------
# Install / Sync Logic
# ------------------------------------------------------------------------------

install_project_level() {
  log "Installing/syncing RobOS skills for target: \033[1;33m${TARGET}\033[0m (project-level)..."

  # 1. Standard Agent Skills (.agents/skills) -> used by Codex, Antigravity, Claude
  if [[ "$TARGET" == "all" || "$TARGET" == "codex" || "$TARGET" == "antigravity" || "$TARGET" == "claude" ]]; then
    log "Updating .agents/skills/..."
    mkdir_or_dry_run "${REPO_ROOT}/.agents/skills"
    for skill_dir in "${SKILLS_DIR}"/*; do
      if [ -d "$skill_dir" ]; then
        local skill_name
        skill_name="$(basename "$skill_dir")"
        copy_or_dry_run "$skill_dir" "${REPO_ROOT}/.agents/skills/${skill_name}"
      fi
    done
    success "Standard Agent Skills synced to .agents/skills/"
  fi

  # 2. Claude Code (.claude/commands)
  if [[ "$TARGET" == "all" || "$TARGET" == "claude" ]]; then
    log "Updating .claude/commands/..."
    mkdir_or_dry_run "${REPO_ROOT}/.claude/commands"
    for cmd_file in "${COMMANDS_DIR}"/*.md; do
      if [ -f "$cmd_file" ]; then
        copy_or_dry_run "$cmd_file" "${REPO_ROOT}/.claude/commands/$(basename "$cmd_file")"
      fi
    done
    success "Claude commands synced to .claude/commands/"
  fi

  # 3. Google Antigravity (.antigravity/commands)
  if [[ "$TARGET" == "all" || "$TARGET" == "antigravity" ]]; then
    log "Updating .antigravity/commands/..."
    mkdir_or_dry_run "${REPO_ROOT}/.antigravity/commands"
    for cmd_file in "${COMMANDS_DIR}"/*.md; do
      if [ -f "$cmd_file" ]; then
        copy_or_dry_run "$cmd_file" "${REPO_ROOT}/.antigravity/commands/$(basename "$cmd_file")"
      fi
    done
    success "Antigravity commands synced to .antigravity/commands/"
  fi

  # 4. Gemini CLI (.gemini/commands)
  if [[ "$TARGET" == "all" || "$TARGET" == "gemini" ]]; then
    log "Updating .gemini/commands/..."
    mkdir_or_dry_run "${REPO_ROOT}/.gemini/commands"
    for cmd_file in "${COMMANDS_DIR}"/*.md; do
      if [ -f "$cmd_file" ]; then
        copy_or_dry_run "$cmd_file" "${REPO_ROOT}/.gemini/commands/$(basename "$cmd_file")"
      fi
    done
    success "Gemini commands synced to .gemini/commands/"
  fi

  # 5. GitHub Copilot (.github/skills)
  if [[ "$TARGET" == "all" || "$TARGET" == "copilot" ]]; then
    log "Updating .github/skills/..."
    mkdir_or_dry_run "${REPO_ROOT}/.github/skills"
    for skill_dir in "${SKILLS_DIR}"/*; do
      if [ -d "$skill_dir" ]; then
        local skill_name
        skill_name="$(basename "$skill_dir")"
        copy_or_dry_run "$skill_dir" "${REPO_ROOT}/.github/skills/${skill_name}"
      fi
    done
    success "Copilot skills synced to .github/skills/"
  fi
}

install_global_level() {
  local home_dir="${HOME:-}"
  if [ -z "$home_dir" ]; then
    echo "Error: HOME environment variable is not set" >&2
    exit 1
  fi

  log "Installing RobOS skills globally to \033[1;33m${home_dir}\033[0m for target: \033[1;33m${TARGET}\033[0m..."

  # 1. Global .agents/skills
  if [[ "$TARGET" == "all" || "$TARGET" == "codex" || "$TARGET" == "antigravity" || "$TARGET" == "claude" ]]; then
    log "Installing to ~/.agents/skills/..."
    mkdir_or_dry_run "${home_dir}/.agents/skills"
    for skill_dir in "${SKILLS_DIR}"/*; do
      if [ -d "$skill_dir" ]; then
        local skill_name
        skill_name="$(basename "$skill_dir")"
        copy_or_dry_run "$skill_dir" "${home_dir}/.agents/skills/${skill_name}"
      fi
    done
    success "Global Agent Skills installed to ~/.agents/skills/"
  fi

  # 2. Global Claude Code plugins
  if [[ "$TARGET" == "all" || "$TARGET" == "claude" ]]; then
    log "Installing to ~/.claude/plugins/marketplaces/robos/..."
    mkdir_or_dry_run "${home_dir}/.claude/plugins/marketplaces/robos"
    copy_or_dry_run "${SCRIPT_DIR}/marketplace.json" "${home_dir}/.claude/plugins/marketplaces/robos/marketplace.json"
    copy_or_dry_run "${PLUGIN_DIR}" "${home_dir}/.claude/plugins/marketplaces/robos/robos"
    success "Claude plugin installed to ~/.claude/plugins/marketplaces/robos/"
  fi

  # 3. Global Antigravity skills
  if [[ "$TARGET" == "all" || "$TARGET" == "antigravity" ]]; then
    log "Installing to ~/.antigravity/skills/..."
    mkdir_or_dry_run "${home_dir}/.antigravity/skills"
    for skill_dir in "${SKILLS_DIR}"/*; do
      if [ -d "$skill_dir" ]; then
        local skill_name
        skill_name="$(basename "$skill_dir")"
        copy_or_dry_run "$skill_dir" "${home_dir}/.antigravity/skills/${skill_name}"
      fi
    done
    success "Antigravity skills installed to ~/.antigravity/skills/"
  fi
}

# Execute installation
if [ "$GLOBAL" = true ]; then
  install_global_level
else
  install_project_level
fi

log "Done! RobOS Plugin Marketplace and 22 skills are ready."

