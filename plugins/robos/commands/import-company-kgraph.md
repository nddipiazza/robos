# Import Company Knowledge Graph (`/import-company-kgraph`)

Extract tracked local sources into a reviewable SDLC graph proposal. Follow [the skill](../skills/import-company-kgraph/SKILL.md), using `$ARGUMENTS` as structured arguments rather than executing untrusted shell text.

## Production inputs

- `--manifest sources.json`: namespace, title, stable source IDs, optional expected URLs and relative prefix exclusions. `sources.yaml` must contain JSON-subset YAML, parsed as JSON.
- `--paths local.json`: separate source-ID-to-absolute-checkout map; keep machine paths out of shared graph metadata.
- `--graph-root <workspace>`: explicit canonical workspace, resolving to its `.robos` directory.
- `--output proposal.json`: save a review envelope and `proposal.json.sources.json` coverage/inventory sidecar.
- `--dry-run`: print coverage and proposal diagnostics without saving.

```bash
node plugins/robos/skills/import-company-kgraph/scripts/import-company-kgraph.js \
  --manifest sources.json --paths local.json \
  --graph-root /work/graph --output proposal.json
```

Review changes, evidence, validation, conflicts, retained stale nodes, and unsupported inventory before applying:

```bash
kgraph apply --graph-root /work/graph --file proposal.json
kgraph inspect --graph-root /work/graph --require-evidence
```

For iterative refinements, get `kgraph context --graph-root /work/graph --limit 40 --output context.json`, identify unknowns as questions, and prepare structured `add`, `update`, or `remove` edits. Check the context revision against current inspect output, then create a fresh draft:

```bash
kgraph propose --graph-root /work/graph --mode refine --file edits.json \
  --require-evidence --output refinement.json
```

Review and separately apply `refinement.json`. Preserve IDs, provenance, and evidence; never edit a hashed proposal or invent facts to pass validation. Unsupported files default to inventory-only; `includeUnsupported: true` adds artifacts, not full semantic models.

Legacy `--source`, standalone `--prompt`, and `--resources` require explicit `--demo` and are not production architecture evidence. In manifest mode, `--prompt` is only a proposal note. Remote URLs do not trigger cloning or discovery.
