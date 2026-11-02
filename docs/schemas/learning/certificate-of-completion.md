---
title: Certificate Of Completion
layout: default
parent: "eLearning Curriculums (robos.learning)"
grand_parent: Schemas
nav_order: 2
permalink: /schemas/learning/certificate-of-completion.html
description: "Validation shape for robos:CertificateOfCompletion nodes in the learning package group."
---

# robos:CertificateOfCompletion
{: .no_toc }

Validation shape for `robos:CertificateOfCompletion` nodes in the `learning` package group.
{: .fs-6 }

## Details

| | |
|---|---|
| Class | `robos:CertificateOfCompletion` |
| Shape id | `urn:robos:shape:CertificateOfCompletionShape` |
| Package | [eLearning Curriculums (robos.learning)]({{ '/schemas/learning.html' | relative_url }}) (`learning`) |
| Classification | Learning & assessment |
| Schema.org type | [`schema:EducationalOccupationalCredential`](https://schema.org/EducationalOccupationalCredential) |

## Properties

Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.

| Property | Count | Type | Rule or description |
|---|---|---|---|
| `dcterms:title` | `1..*` | `xsd:string` | Certificate of Completion must have a title. |
| `robos:recipientUser` | `1..*` | - | Certificate of Completion must specify the recipient user. |
| `robos:forCourse` | `1..*` | - | Certificate of Completion must link to the completed course (robos:forCourse). |
| `robos:issueDate` | `1..*` | - | Certificate of Completion must declare an issuance date. |
| `robos:scorePercentage` | `1..*` | - | Certificate of Completion must record the final score percentage. |

## Example node

The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.

{% raw %}
```json
{
  "@id": "urn:robos:learning:certificate-of-completion-sample",
  "@type": [
    "robos:CertificateOfCompletion",
    "schema:EducationalOccupationalCredential",
    "oslc:Resource"
  ],
  "dcterms:title": "Sample Certificate Of Completion",
  "dcterms:description": "Placeholder node for robos:CertificateOfCompletion.",
  "robos:package": "learning",
  "robos:namespace": "robos.learning",
  "robos:recipientUser": "<recipientUser>",
  "robos:forCourse": "<forCourse>",
  "robos:issueDate": "<issueDate>",
  "robos:scorePercentage": "<scorePercentage>",
  "robos:schemaOrgType": "https://schema.org/EducationalOccupationalCredential",
  "robos:domainStandard": "https://schema.org/EducationalOccupationalCredential",
  "robos:refersFrom": "https://schema.org/EducationalOccupationalCredential"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
