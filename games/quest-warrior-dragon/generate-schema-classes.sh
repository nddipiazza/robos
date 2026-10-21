#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCHEMA="$PROJECT_ROOT/schemas/v1/dragon_warrior_v1.schema.json"
OUTPUT_DIR="$PROJECT_ROOT/src/generated/v1"
GENERATOR_VERSION="0.1.0"
GENERATOR_PACKAGE="https://github.com/nddipiazza/json-schema-to-gdscript/releases/download/v${GENERATOR_VERSION}/json-schema-to-gdscript-${GENERATOR_VERSION}.tgz"

if ! command -v npx >/dev/null 2>&1; then
	echo "npx is required; install Node.js 20 or newer." >&2
	exit 1
fi

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

npx --yes --package "$GENERATOR_PACKAGE" json-schema-to-gdscript "$SCHEMA" "$OUTPUT_DIR"

node - "$OUTPUT_DIR" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const outputDirectory = process.argv[2];

for (const filename of fs.readdirSync(outputDirectory)) {
	if (!filename.endsWith(".gd")) {
		continue;
	}
	const filePath = path.join(outputDirectory, filename);
	const source = fs.readFileSync(filePath, "utf8");
	fs.writeFileSync(filePath, `${source.trimEnd()}\n`);
}
NODE

echo "Generated Godot schema classes in $OUTPUT_DIR"
