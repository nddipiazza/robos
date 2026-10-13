---
title: Source Artifact
layout: default
parent: Core Platform
grand_parent: Schemas
nav_order: 23
permalink: /schemas/core-platform/source-artifact.html
---

# robos:SourceArtifact
{: .no_toc }

Validation shape for `robos:SourceArtifact` nodes in the `core-platform` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:SourceArtifact` |
| Shape id | `robos:SourceArtifactShape` |
| Package | [Core Platform]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`) |
| Classification | Source control & artifacts |
| Schema.org type | [`schema:CreativeWork`](https://schema.org/CreativeWork) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Source artifact needs a title. |
| `robos:sourcePath` | `1..*` | - | Source artifact needs a portable source path. |
| `robos:sourceKind` | `1..*` | - | Source artifact needs a declared kind. |
| `robos:inRepository` | `1..*` | - | Source artifact needs its repository reference. |
| `robos:evidence` | `1..*` | - | Source artifact needs source evidence. |

## Example node

This node comes from `.robos/kgraphs/core-platform/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:source:source-shapes",
  "@type": [
    "robos:SourceArtifact",
    "schema:CreativeWork"
  ],
  "dcterms:title": "Source declaration shapes",
  "robos:package": "core-platform",
  "robos:sourcePath": "packages/robos-graph/lib/source-shapes.js",
  "robos:sourceKind": "implementation",
  "robos:inRepository": {
    "@id": "urn:robos:source:workspace"
  },
  "robos:evidence": [
    {
      "repository": "robos",
      "path": "packages/robos-graph/lib/source-shapes.js",
      "line": 1
    }
  ],
  "robos:namespace": "robos.platform"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
