#!/bin/bash
set -e

BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"
export PATH="$BIN_DIR:$PATH"

echo "==> Setting up local Kubernetes tools (kubectl, kind, helm)..."

# 1. Install kubectl if not present
if ! command -v kubectl &> /dev/null; then
  echo "Installing kubectl v1.31.0..."
  curl -fsSL -o "$BIN_DIR/kubectl" "https://dl.k8s.io/release/v1.31.0/bin/linux/amd64/kubectl"
  chmod +x "$BIN_DIR/kubectl"
fi

# 2. Install kind if not present
if ! command -v kind &> /dev/null; then
  echo "Installing kind v0.24.0..."
  curl -fsSL -o "$BIN_DIR/kind" "https://kind.sigs.k8s.io/dl/v0.24.0/kind-linux-amd64"
  chmod +x "$BIN_DIR/kind"
fi

# 3. Install helm if not present
if ! command -v helm &> /dev/null; then
  echo "Installing helm v3.16.0..."
  curl -fsSL https://get.helm.sh/helm-v3.16.0-linux-amd64.tar.gz | tar -xz -C /tmp
  mv /tmp/linux-amd64/helm "$BIN_DIR/helm"
  chmod +x "$BIN_DIR/helm"
  rm -rf /tmp/linux-amd64
fi

echo "Toolchain versions:"
kubectl version --client || true
kind version || true
helm version || true

# 4. Provision local kind cluster if not already running
CLUSTER_NAME="robos-local"
if kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
  echo "Kind cluster '${CLUSTER_NAME}' is already running."
else
  echo "Creating Kind cluster '${CLUSTER_NAME}' in Docker..."
  kind create cluster --name "${CLUSTER_NAME}" --wait 60s
fi

kubectl cluster-info --context "kind-${CLUSTER_NAME}"
echo "✓ Local Kubernetes cluster 'kind-${CLUSTER_NAME}' is ready and active!"
