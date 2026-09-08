# Import Company Knowledge Graph (`/import-company-kgraph`)

Import company, organization, or team repository and service entries from HTTP/HTTPS, local filesystem, AWS S3, or Git URLs, and generate OSLC JSON-LD Knowledge Graph file(s) for RobOS.

## Input

`$ARGUMENTS` — Source URI/path and optional company configuration:
- `--source <path|url|s3-uri>` — Source inventory (HTTP, local directory, file, or S3 URI)
- `--company-name <name>` — Organization display name
- `--company-slug <slug>` — Organization identifier slug
- `--output <file>` — Destination JSON-LD file path
- `--import-to-robos` — Automatically merge generated nodes into local RobOS workspace

## Procedure

Follow the step-by-step instructions in `plugins/robos/skills/import-company-kgraph/SKILL.md` or execute:
```bash
node plugins/robos/skills/import-company-kgraph/scripts/import-company-kgraph.js $ARGUMENTS
```
