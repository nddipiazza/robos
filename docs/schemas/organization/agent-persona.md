---
title: Agent Persona
layout: default
parent: "Organization & Teams (robos.org)"
grand_parent: Schemas
nav_order: 5
permalink: /schemas/organization/agent-persona.html
description: "Validation shape for robos:AgentPersona nodes in the organization package group."
---

# robos:AgentPersona
{: .no_toc }

Validation shape for `robos:AgentPersona` nodes in the `organization` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:AgentPersona` |
| Also matches | `robos:AIAgent` |
| Shape id | `urn:robos:shape:AgentPersonaShape` |
| Package | [Organization & Teams (robos.org)]({{ '/schemas/organization.html' | relative_url }}) (`organization`) |
| Classification | Agents & MCP |
| Schema.org type | [`schema:Person`](https://schema.org/Person) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Agent Persona must have a title or name. |
| `robos:role` | `1..*` | - | Agent Persona must specify an autonomous role. |
| `robos:systemPrompt` | `1..*` | - | Agent Persona must provide a system prompt or core directive. |

## Example node

This node comes from `.robos/kgraphs/organization/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:agent:sre-incident-triage",
  "@type": [
    "oslc:Person",
    "robos:AgentPersona",
    "robos:AIAgent",
    "schema:Person"
  ],
  "dcterms:title": "RobOS SRE Incident & Deployment Triager",
  "dcterms:description": "Intelligent agent correlating Kubernetes deployment health with recent Git commits and alerts.",
  "robos:role": "SRE Incident & Health Triager",
  "robos:systemPrompt": "Analyze cluster events, pod crashloops, and ArgoCD sync failures to triage deployment incidents.",
  "robos:modelPreference": "pro",
  "robos:assignedTeam": "urn:robos:team:cloud-platform",
  "robos:package": "organization",
  "robos:namespace": "robos.org",
  "robos:schemaOrgType": "https://schema.org/Person",
  "robos:domainStandard": "https://schema.org/Person"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
