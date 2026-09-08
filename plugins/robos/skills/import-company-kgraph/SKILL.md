---
name: import-company-kgraph
description: Import company, organization, or team Knowledge Graph entries from any source (HTTP/REST endpoints, local filesystem, AWS S3 buckets, or Git forge URLs) and generate validated OSLC JSON-LD Knowledge Graph file(s) for RobOS.
---

# Import Company Knowledge Graph (`import-company-kgraph`)

Import an entire enterprise, organization, or squad's application catalog and repositories from **any external or local source** — including HTTP/HTTPS REST APIs, local file trees, AWS S3 storage buckets, or Git forge lists — and automatically generate standard, validated Dual-State OSLC JSON-LD Knowledge Graph file(s) ready for direct ingestion into RobOS.

## When to Use

Use this skill whenever:
- A developer, tech lead, or architect asks to import their company's, organization's, or team's repositories, services, and applications into RobOS.
- An organization has an existing inventory stored on **AWS S3** (`s3://bucket/inventory.json`), an internal **HTTP/HTTPS** API (e.g. Spotify Backstage `catalog-entities.json` or custom developer portal), or a **local filesystem** directory / `git-projects.json`.
- A user is navigating the **"use existing git projects"** flow in RobOS (in Git Projects, App Wizard, or RobOS Graph) and needs to extract their company's Git repositories into Knowledge Graph entries.
- You need to generate a standalone `<company>-kgraph.jsonld` file or package files under `.robos/kgraphs/` for immediate import.

---

## Supported Source Ingestion Channels

| Source Type | Syntax / Protocol | Ingestion Method | Example |
|:---|:---|:---|:---|
| **HTTP / HTTPS** | `http://` or `https://` | Fetches JSON/YAML catalogs, Backstage entities, or GitHub Org repo lists via HTTP client | `https://portal.company.com/api/catalog.json` |
| **Local FileSystem** | Local path or glob | Reads `git-projects.json`, repo lists, or recursively scans folders with `.git`/`package.json` | `~/.config/robos/git-projects.json` or `/home/user/workspaces/` |
| **AWS S3** | `s3://<bucket>/<key>` | Pulls JSON/YAML inventory from AWS S3 via AWS CLI or S3 REST endpoint | `s3://internal-acme-devops/catalog/services.json` |
| **Git Forge URLs** | Plaintext / Newlines | Parses list of Git clone URLs (HTTPS or SSH) and auto-infers archetypes and tech stacks | `git@github.com:acme/auth-service.git` |

---

## Execution: Companion Engine CLI

The skill provides an automated, standalone Node.js engine located at `plugins/robos/skills/import-company-kgraph/scripts/import-company-kgraph.js`.

### Natural Language Agent Prompt (Heterogeneous Multi-Resource Ingestion)
```bash
# Ingest Confluence wiki, 2 GitHub orgs, GitHub repo, GitLab repo, and local filesystem link:
node plugins/robos/skills/import-company-kgraph/scripts/import-company-kgraph.js \
  --prompt "Import our Confluence wiki at https://confluence.acme.corp/display/ARCH, GitHub orgs https://github.com/acme-payments, https://github.com/acme-identity, repo https://github.com/acme-retail/checkout-api, GitLab repo https://gitlab.com/acme-devops/gitops-deployments, and local monorepo /tmp/acme-legacy-monorepo" \
  --output ./acme-global-kgraph.jsonld
```

### Basic Ingestion from Inventory File
```bash
# Ingest from an existing git-projects.json file and generate company-kgraph.jsonld
node plugins/robos/skills/import-company-kgraph/scripts/import-company-kgraph.js \
  --source ~/.config/robos/git-projects.json \
  --company-name "Acme Global" \
  --company-slug "acme" \
  --output ./acme-kgraph.jsonld
```

### Ingest from Remote HTTP Endpoint (Backstage or Microservice Catalog)
```bash
node plugins/robos/skills/import-company-kgraph/scripts/import-company-kgraph.js \
  --source https://developer.internal.acme.com/api/catalog-entities.json \
  --company-name "Acme Global" \
  --import-to-robos
```

### Ingest from AWS S3 Bucket
```bash
node plugins/robos/skills/import-company-kgraph/scripts/import-company-kgraph.js \
  --source s3://acme-cloud-governance/sdlc-catalog/enterprise-repos.json \
  --company-name "Acme Global" \
  --company-slug "acme" \
  --import-to-robos
```

### Ingest Local Cloned Workspaces / Directories
```bash
node plugins/robos/skills/import-company-kgraph/scripts/import-company-kgraph.js \
  --source /home/ndipiazza/source/company-repos \
  --company-name "Acme Global" \
  --import-to-robos
```

---

## Agent Procedure

When a user asks:
*"Import my company's repositories from <url | path | s3> into the knowledge graph"* or
*"Generate a kgraph file for our company Git projects"*:

1. **Identify the Source**:
   - Determine whether the source is an HTTP endpoint, S3 URI (`s3://...`), local file path, directory, or a list of repository URLs.
   - Ask clarifying questions only if the source location or company name is ambiguous.

2. **Execute the Ingestion Engine**:
   Run the companion CLI script with the appropriate flags:
   ```bash
   node plugins/robos/skills/import-company-kgraph/scripts/import-company-kgraph.js \
     --source "<source>" \
     --company-name "<CompanyName>" \
     --company-slug "<slug>" \
     [--import-to-robos]
   ```

3. **Verify Generated KGraph File**:
   - Verify that the output JSON-LD file exists and contains valid `@context`, `robos:organization`, `c4:Container`, and `robos:Contract` nodes.
   - Check that archetypes were accurately inferred:
     - Backend services -> `robos:Microservice` with synthesized OpenAPI 3.1 contracts
     - Web frontends -> `robos:FrontEndApp`
     - Desktop workstation apps -> `robos:DesktopApp`
     - CLI tools -> `robos:ConsoleApp`
     - Games -> `robos:PCGame` or `robos:MobileGame`
     - Libraries -> `robos:Library`

4. **Guide the User on Importing into RobOS**:
   - If `--import-to-robos` was used, inform the user that the nodes are now active in their `.robos/` package stores and registered in `~/.config/robos/git-projects.json`.
   - If a standalone file was generated (e.g. `acme-kgraph.jsonld`), explain that they can import it into RobOS using:
     - RobOS Graph Explorer (`packages/robos-graph` -> 📦 Packages & Repos)
     - Or copy it directly into `.robos/kgraphs/<package>/package.jsonld`.

---

## Validation Checklist
- [ ] Source correctly read via HTTP, FileSystem, S3, or Git list.
- [ ] No plaintext passwords or API keys stored in output JSON-LD graphs.
- [ ] Output conforms to RobOS OSLC JSON-LD schema (`@id`, `@type`, `dcterms:title`, `c4:*`, `robos:*`).
- [ ] Ingestion into RobOS workspace completes with zero JSON syntax errors.
