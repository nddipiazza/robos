---
title: Git Project Organization
layout: default
parent: Organization & Teams (robos.org)
grand_parent: KGraph Schemas
nav_order: 4
permalink: /schemas/organization/git-project-organization.html
---

# Schema: `robos:GitProjectOrganization`
{: .no_toc }

Formal W3C SHACL constraint shape and OSLC JSON-LD specification for `robos:GitProjectOrganization` in the `organization` package store.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Specification Metadata

- **RDF / OWL Class**: `robos:GitProjectOrganization`
- **Aliases / Target Classes**: `robos:GitProjectOrganization`, `robos:GitOrganization`
- **SHACL Shape ID**: `urn:robos:shape:GitProjectOrganizationShape`
- **Governing Package**: [Organization & Teams (robos.org)]({{ '/schemas/organization.html' | relative_url }}) (`organization`)
- **Namespace**: `robos.org`
- **Schema.org Classification**: [https://schema.org/Organization](https://schema.org/Organization)
- **Domain De Facto Standard**: [https://schema.org/Organization](https://schema.org/Organization)
- **Upstream Schema Basis (Refers From)**: [https://schema.org/Organization](https://schema.org/Organization)

---

## Upstream Schema Basis (Refers From) & Global Standards Provenance

This RobOS schema is modeled after and directly aligns with two levels of global standards:
- **Universal Schema.org Class**: [https://schema.org/Organization](https://schema.org/Organization) (100% interoperability with search engines, web indexers, and general AI reasoning)
- **Specialized Domain Standard**: [https://schema.org/Organization](https://schema.org/Organization) (de facto standard for domain-specific ALM, BDD, or infrastructure operations)
- **Canonical Reference**: [https://schema.org/Organization](https://schema.org/Organization)
- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of `robos:GitProjectOrganization`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.

---

## Entity Relationship & Schema Context

<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">
  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">Git Project Organization</span>
    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">robos:GitProjectOrganization</span>
  </div>
  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>urn:robos:shape:GitProjectOrganizationShape</code> within the <strong>Organization & Teams (robos.org)</strong> (<code>robos.org</code>) package store.</p>
  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>dcterms:title</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:url</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:orgName</code></span>
    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>robos:forgeType</code></span>
  </div>
</div>

---

**RobOS classification:** Organization & people. These RobOS-owned codes use Schema.org CategoryCode vocabulary.

## Property Constraints & SHACL Rules

| Property Path | Name | Multiplicity | Data Type | Classification | Constraint Rule / Validation Message |
|---|---|---|---|---|---|
| **`dcterms:title`** | Title / Display Name | `1..*` | `xsd:string` | Services & processing, Applications & entry points, Contracts & data models, Data stores & messaging, Libraries & build systems, Infrastructure & delivery, Organization & people, Projects & work items, Source control & artifacts, Agents & MCP, Documentation & decisions, Learning & assessment, Testing & behavior | Git Project Organization must have a title or display name. |
| **`robos:url`** | Forge / Web URL | `1..*` | `xsd:anyURI` | Organization & people, Projects & work items, Source control & artifacts | Git Project Organization must specify forge URL (e.g. https://github.com/apache). |
| **`robos:orgName`** | Organization Slug | `1..*` | `xsd:string` | Organization & people | Git Project Organization must specify organization handle/slug. |
| **`robos:forgeType`** | Forge Type | `1..*` | `xsd:string` | Organization & people | Git Project Organization must declare forge type (github, gitlab, bitbucket, etc.). |

---

## Canonical OSLC JSON-LD Example

```json
{
  "@id": "urn:robos:git-org:apache",
  "@type": [
    "robos:GitProjectOrganization",
    "robos:GitOrganization",
    "schema:Organization",
    "oslc:Resource"
  ],
  "dcterms:title": "Apache Software Foundation",
  "dcterms:description": "The Apache Software Foundation provides software for the public good, with over 350 open-source projects and initiatives.",
  "robos:orgName": "apache",
  "robos:url": "https://github.com/apache",
  "robos:forgeType": "github",
  "robos:avatarUrl": "https://avatars.githubusercontent.com/u/47359?s=200&v=4",
  "robos:visibility": "public",
  "robos:isEnterprise": false,
  "robos:verified": true,
  "robos:defaultBranch": "main",
  "robos:memberCount": 1100,
  "robos:repoCount": 350,
  "robos:hasRepository": [
    "github.com/apache/kafka",
    "github.com/apache/spark",
    "github.com/apache/lucene",
    "github.com/apache/airflow",
    "github.com/apache/arrow"
  ],
  "robos:documentation": {
    "docsUrl": "https://www.apache.org/dev/",
    "docsPaths": [
      "docs/index.md",
      "README.md",
      "CONTRIBUTING.md",
      "GOVERNANCE.md",
      "SECURITY.md"
    ],
    "architectureGuidelines": "The Apache Way: vendor-neutral open governance, consensus-driven decisions, public mailing list discussions, and reproducible builds.",
    "license": "Apache-2.0"
  },
  "robos:agentRules": [
    {
      "ruleId": "RULE-APACHE-001",
      "title": "ASF License Header & Notice Verification",
      "severity": "mandatory",
      "description": "Every source file must contain the standard Apache 2.0 license header. Agents must NEVER introduce GPL or copyleft dependencies into ASF codebases.",
      "ruleFile": "AGENTS.md",
      "enforcement": "pre-commit"
    },
    {
      "ruleId": "RULE-APACHE-002",
      "title": "Public Discussion & Consensus Tracing",
      "severity": "mandatory",
      "description": "All architectural alterations and pull requests generated by agents must cite a valid dev@ mailing list discussion thread or associated Apache Jira/GitHub issue.",
      "ruleFile": "docs/governance.md",
      "enforcement": "agent-review"
    },
    {
      "ruleId": "RULE-APACHE-003",
      "title": "Cryptographic Commit Signing",
      "severity": "mandatory",
      "description": "All git commits generated by agents must be GPG signed with verified committer keys.",
      "enforcement": "git-commit"
    },
    {
      "ruleId": "RULE-APACHE-004",
      "title": "Backward-Compatible SemVer Contracts",
      "severity": "recommended",
      "description": "Public APIs must not break binary or source compatibility without a documented deprecation cycle across at least one minor release.",
      "enforcement": "pr-audit"
    }
  ],
  "robos:agentRulesDoc": "AGENTS.md",
  "robos:package": "organization",
  "robos:namespace": "robos.org",
  "robos:schemaOrgType": "https://schema.org/Organization",
  "robos:domainStandard": "https://schema.org/Organization"
}
```

---

## Programmatic SHACL Validation

```javascript
const { SHACLValidator } = require('/usr/local/share/robos/robos-graph/lib/shacl-validator');
const { OSLCGraphParser, OSLC_CONTEXT } = require('/usr/local/share/robos/robos-graph/lib/oslc-parser');

const validator = new SHACLValidator();
const result = validator.validateGraph(new OSLCGraphParser({
  "@context": OSLC_CONTEXT,
  "robos:nodes": [
    {
        "@id": "urn:robos:git-org:apache",
        "@type": [
            "robos:GitProjectOrganization",
            "robos:GitOrganization",
            "schema:Organization",
            "oslc:Resource"
        ],
        "dcterms:title": "Apache Software Foundation",
        "dcterms:description": "The Apache Software Foundation provides software for the public good, with over 350 open-source projects and initiatives.",
        "robos:orgName": "apache",
        "robos:url": "https://github.com/apache",
        "robos:forgeType": "github",
        "robos:avatarUrl": "https://avatars.githubusercontent.com/u/47359?s=200&v=4",
        "robos:visibility": "public",
        "robos:isEnterprise": false,
        "robos:verified": true,
        "robos:defaultBranch": "main",
        "robos:memberCount": 1100,
        "robos:repoCount": 350,
        "robos:hasRepository": [
            "github.com/apache/kafka",
            "github.com/apache/spark",
            "github.com/apache/lucene",
            "github.com/apache/airflow",
            "github.com/apache/arrow"
        ],
        "robos:documentation": {
            "docsUrl": "https://www.apache.org/dev/",
            "docsPaths": [
                "docs/index.md",
                "README.md",
                "CONTRIBUTING.md",
                "GOVERNANCE.md",
                "SECURITY.md"
            ],
            "architectureGuidelines": "The Apache Way: vendor-neutral open governance, consensus-driven decisions, public mailing list discussions, and reproducible builds.",
            "license": "Apache-2.0"
        },
        "robos:agentRules": [
            {
                "ruleId": "RULE-APACHE-001",
                "title": "ASF License Header & Notice Verification",
                "severity": "mandatory",
                "description": "Every source file must contain the standard Apache 2.0 license header. Agents must NEVER introduce GPL or copyleft dependencies into ASF codebases.",
                "ruleFile": "AGENTS.md",
                "enforcement": "pre-commit"
            },
            {
                "ruleId": "RULE-APACHE-002",
                "title": "Public Discussion & Consensus Tracing",
                "severity": "mandatory",
                "description": "All architectural alterations and pull requests generated by agents must cite a valid dev@ mailing list discussion thread or associated Apache Jira/GitHub issue.",
                "ruleFile": "docs/governance.md",
                "enforcement": "agent-review"
            },
            {
                "ruleId": "RULE-APACHE-003",
                "title": "Cryptographic Commit Signing",
                "severity": "mandatory",
                "description": "All git commits generated by agents must be GPG signed with verified committer keys.",
                "enforcement": "git-commit"
            },
            {
                "ruleId": "RULE-APACHE-004",
                "title": "Backward-Compatible SemVer Contracts",
                "severity": "recommended",
                "description": "Public APIs must not break binary or source compatibility without a documented deprecation cycle across at least one minor release.",
                "enforcement": "pr-audit"
            }
        ],
        "robos:agentRulesDoc": "AGENTS.md",
        "robos:package": "organization",
        "robos:namespace": "robos.org",
        "robos:schemaOrgType": "https://schema.org/Organization",
        "robos:domainStandard": "https://schema.org/Organization"
    }
  ],
}));

console.log("Conforms:", result.conforms); // Expected: true
```