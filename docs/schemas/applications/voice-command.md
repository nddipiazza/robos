---
title: Voice Command
layout: default
parent: "Applications (robos.apps)"
grand_parent: Schemas
nav_order: 11
permalink: /schemas/applications/voice-command.html
description: "Validation shape for robos:VoiceCommand nodes in the applications package group."
---

# robos:VoiceCommand
{: .no_toc }

Validation shape for `robos:VoiceCommand` nodes in the `applications` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:VoiceCommand` |
| Shape id | `urn:robos:shape:VoiceCommandShape` |
| Package | [Applications (robos.apps)]({{ '/schemas/applications.html' | relative_url }}) (`applications`) |
| Schema.org type | [`schema:ControlAction`](https://schema.org/ControlAction) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Voice command must have a title. |
| `robos:commandMatcher` | `1..*` | - | Voice command must have at least one command matcher phrase. |
| `robos:targetType` | `1..*` | - | Voice command must specify target type (app or skill). |
| `robos:targetId` | `1..*` | - | Voice command must specify a target application or skill ID. |

## Example node

This node comes from `.robos/kgraphs/applications/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:voice-command:voice-prompt",
  "@type": [
    "robos:VoiceCommand",
    "oslc_am:Resource"
  ],
  "dcterms:title": "Open RobOS Voice",
  "dcterms:description": "Launch and focus the RobOS Voice offline dictation assistant HUD",
  "robos:commandMatcher": [
    "open robos voice",
    "open voice",
    "launch robos voice",
    "robos voice"
  ],
  "robos:targetType": "app",
  "robos:targetId": "voice-prompt",
  "robos:action": "open-app",
  "robos:schemaOrgType": "https://schema.org/ControlAction",
  "robos:domainStandard": "https://schema.org/ControlAction",
  "robos:refersFrom": "https://schema.org/ControlAction",
  "robos:package": "applications",
  "robos:namespace": "robos.applications"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
