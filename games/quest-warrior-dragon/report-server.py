#!/usr/bin/env python3
"""Launch the Node.js Cucumber E2E report server."""

from __future__ import annotations

import os
from pathlib import Path
import shutil
import subprocess
import sys


PROJECT_DIR = Path(__file__).resolve().parent
SERVER_SCRIPT = PROJECT_DIR / "tools" / "report-server" / "server.js"
def _find_node() -> str | None:
	configured_node = os.environ.get("DW_NODE_BIN")
	if configured_node:
		return configured_node
	return shutil.which("node") or shutil.which("node.exe")


def main() -> int:
	node_bin = _find_node()
	if node_bin is None:
		print("Node.js binary not found!", file=sys.stderr)
		return 1

	print("Starting Quest: Warrior Dragon Cucumber E2E Report Server...")
	result = subprocess.run(
		[node_bin, str(SERVER_SCRIPT), *sys.argv[1:]],
		cwd=PROJECT_DIR,
		check=False,
	)
	return result.returncode


if __name__ == "__main__":
	raise SystemExit(main())
