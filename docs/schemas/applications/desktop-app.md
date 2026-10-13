---
title: Desktop App
layout: default
parent: Applications
grand_parent: Schemas
nav_order: 1
permalink: /schemas/applications/desktop-app.html
---

# robos:DesktopApp
{: .no_toc }

Validation shape for `robos:DesktopApp` nodes in the `applications` package group.
{: .fs-6 }

## Details

| Detail | Value |
|---|---|
| Class | `robos:DesktopApp` |
| Shape id | `urn:robos:shape:DesktopAppShape` |
| Package | [Applications]({{ '/schemas/applications.html' | relative_url }}) (`applications`) |
| Classification | Applications & entry points |
| Schema.org type | [`schema:SoftwareApplication`](https://schema.org/SoftwareApplication) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Desktop App must have a title. |
| `robos:repository` | `1..*` | `xsd:string` | Desktop App must define a repository. |
| `robos:technology` | `1..*` | `xsd:string` | Desktop App must specify technology stack. |
| `robos:desktopFramework` | `1..*` | `xsd:string` | Desktop App must declare desktop framework (Electron, Tauri, Qt, GTK). |

## Example node

This node comes from `.robos/kgraphs/applications/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:app:voice-prompt",
  "@type": [
    "robos:DesktopApp",
    "schema:SoftwareApplication",
    "oslc_am:Resource",
    "c4:Container"
  ],
  "dcterms:title": "Voice Prompt Agent",
  "dcterms:description": "Offline neural speech-to-text dictation agent with real-time streaming, desktop active window context capture, REST API, and tabbed microphone and RobOS Commands settings with a live microphone test waveform and text-file chat history export.",
  "robos:package": "applications",
  "robos:namespace": "robos.applications",
  "robos:repository": "github.com/nddipiazza/robos",
  "robos:technology": "Electron / Vanilla JS / Whisper ONNX",
  "robos:desktopFramework": "Electron",
  "robos:localPath": "/home/ndipiazza/source/robos/packages/voice-prompt",
  "robos:apiPort": 19188,
  "robos:globalHotkey": "Super+V",
  "robos:ownerTeam": "urn:robos:team:core-platform",
  "robos:hasProject": "urn:robos:project:enterprise-core",
  "robos:hasVoiceCommand": "urn:robos:voice-command:voice-prompt",
  "robos:schemaOrgType": "https://schema.org/SoftwareApplication",
  "robos:domainStandard": "https://schema.org/SoftwareApplication",
  "robos:refersFrom": "https://schema.org/SoftwareApplication"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
