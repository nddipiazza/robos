#!/bin/bash
# RobOS Containerized Headless E2E Test Runner (Option 1)
# Runs RobOS Electron desktop tests inside an isolated Docker + Xvfb container.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGE_NAME="robos-e2e-test:latest"

FORCE_BUILD=0
INTERACTIVE=0
CMD_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build)
      FORCE_BUILD=1
      shift
      ;;
    -i|--interactive)
      INTERACTIVE=1
      shift
      ;;
    *)
      CMD_ARGS+=("$1")
      shift
      ;;
  esac
done

# Check if Docker is available
if ! command -v docker >/dev/null 2>&1; then
  echo "[RobOS E2E Docker] Error: 'docker' CLI not found on host." >&2
  exit 1
fi

# Build Docker image if not present or --build passed
if [[ $FORCE_BUILD -eq 1 ]] || ! docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
  echo "[RobOS E2E Docker] Building Docker image '$IMAGE_NAME'..."
  docker build -t "$IMAGE_NAME" -f "$REPO_ROOT/infra/docker/Dockerfile" "$REPO_ROOT"
fi

DOCKER_FLAGS=("--rm" "-v" "$REPO_ROOT:/workspace" "-w" "/workspace")

if [[ $INTERACTIVE -eq 1 ]]; then
  DOCKER_FLAGS+=("-it")
  echo "[RobOS E2E Docker] Entering interactive container shell..."
  exec docker run "${DOCKER_FLAGS[@]}" "$IMAGE_NAME" /bin/bash
elif [[ ${#CMD_ARGS[@]} -gt 0 ]]; then
  exec docker run "${DOCKER_FLAGS[@]}" "$IMAGE_NAME" "${CMD_ARGS[@]}"
else
  exec docker run "${DOCKER_FLAGS[@]}" "$IMAGE_NAME"
fi
