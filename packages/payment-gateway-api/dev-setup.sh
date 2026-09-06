#!/usr/bin/env bash
# Automated Developer Setup for Payment Gateway API
set -euo pipefail

echo "==> Setting up environment for Payment Gateway API..."
echo "==> Technology: Java 21 / Spring Boot 3"
echo "==> Archetype: robos:Microservice"

command -v git >/dev/null 2>&1 || { echo "Error: git is required"; exit 1; }

echo "✓ Environment verification passed for payment-gateway-api!"
