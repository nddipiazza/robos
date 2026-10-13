---
title: Knowledge graph
layout: default
parent: Build on RobOS
nav_order: 1
---

# Knowledge graph
{: .no_toc }

The knowledge graph is a set of JSON-LD files that describe a software organization: services, applications, contracts, databases, teams, pipelines and the links between them. This page explains what is in it, where the files live, and how the Explorer app, the `kgraph` command and MCP tools read and change it.
{: .fs-6 }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

## What the graph holds

The graph is a list of nodes. Each node has an `@id` (a URN such as `urn:robos:service:billing-api`), one or more `@type` values, a `dcterms:title`, and properties. A property whose value is another node's `@id` is an edge. There is no separate edge list.

```json
{
  "@id": "urn:robos:service:billing-api",
  "@type": ["oslc_am:Resource", "robos:Microservice", "schema:SoftwareApplication"],
  "dcterms:title": "Billing API Service",
  "robos:package": "services",
  "robos:repository": "github.com/acme/billing-api",
  "robos:ownerTeam": "urn:robos:team:order-processing",
  "robos:usesDatabase": "urn:robos:db:acme-orders-postgres",
  "robos:publishesTo": "urn:robos:broker:acme-event-kafka",
  "robos:implementsContract": ["urn:robos:contract:orders-grpc"]
}
```

This is an excerpt of a node from `.robos/kgraphs/services/package.jsonld` in the RobOS repository. The graph checked into that repository is mostly sample data for a fictional company called Acme, plus nodes for a few RobOS components.

Types come from several vocabularies. The JSON-LD context in each file maps these prefixes: `oslc`, `oslc_am`, `oslc_cm`, `oslc_rm`, `oslc_qm` (OSLC), `c4` (C4 model), `schema` (Schema.org), `dcterms`, `pact`, and `robos`, which is `https://robos.dev/ns/sdlc#`. The RobOS-specific classes and their rules are listed on the {% include_relative_placeholder %}

{% comment %}placeholder removed below{% endcomment %}
