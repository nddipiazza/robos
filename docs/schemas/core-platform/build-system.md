---
title: Build System
layout: default
parent: "Core Platform (robos.platform)"
grand_parent: Schemas
nav_order: 1
permalink: /schemas/core-platform/build-system.html
description: "Validation shape for robos:BuildSystem nodes in the core-platform package group."
---

# robos:BuildSystem
{: .no_toc }

Validation shape for `robos:BuildSystem` nodes in the `core-platform` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:BuildSystem` |
| Also matches | `robos:MonorepoBuild` |
| Shape id | `urn:robos:shape:BuildSystemShape` |
| Package | [Core Platform (robos.platform)]({{ '/schemas/core-platform.html' | relative_url }}) (`core-platform`) |
| Classification | Libraries & build systems |
| Schema.org type | [`schema:SoftwareApplication`](https://schema.org/SoftwareApplication) |
| Domain standard | [bazel.build](https://bazel.build/) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Build System must have a title. |
| `robos:buildTool` | `1..*` | `xsd:string` | Build System must declare build tool (maven, gradle, cargo, go, pnpm, npm, cmake, bazel, buck2, pants). |
| `robos:configFile` | `1..*` | `xsd:string` | Build System must specify configuration file (pom.xml, build.gradle, Cargo.toml, go.mod, package.json, CMakeLists.txt, .bazelrc, .buckconfig). |

## Example node

This node comes from `.robos/kgraphs/core-platform/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:build-system:acme-cloud-go",
  "@type": [
    "robos:BuildSystem",
    "oslc:Resource",
    "schema:SoftwareApplication"
  ],
  "dcterms:title": "Acme Cloud Infrastructure Controllers (Go Modules)",
  "dcterms:description": "Kubernetes operators and sidecar proxies built with Go Modules.",
  "robos:buildTool": "go",
  "robos:configFile": "go.mod",
  "robos:repository": "github.com/acme/k8s-operator",
  "robos:package": "core-platform",
  "robos:namespace": "robos.platform",
  "robos:refersFrom": "https://schema.org/SoftwareApplication",
  "robos:schemaOrgType": "https://schema.org/SoftwareApplication",
  "robos:domainStandard": "https://bazel.build/"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
