---
title: Certificate Of Completion
layout: default
parent: "eLearning Curriculums (robos.learning)"
grand_parent: Schemas
nav_order: 2
permalink: /schemas/learning/certificate-of-completion.html
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

This node comes from `.robos/kgraphs/learning/package.jsonld` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.

{% raw %}
```json
{
  "@id": "urn:robos:credential:certificate:course-test-architect-mucvneo3",
  "@type": [
    "robos:CertificateOfCompletion",
    "schema:EducationalOccupationalCredential",
    "oslc:Resource"
  ],
  "dcterms:title": "Certificate of Completion: RobOS Platform Masterclass",
  "dcterms:description": "Official RobOS verified certificate of completion awarded to test-architect for mastering RobOS Platform Masterclass.",
  "robos:recipientUser": "test-architect",
  "robos:forCourse": "urn:robos:elearning:app:course",
  "robos:forApplication": "urn:robos:service:forms-api",
  "robos:issueDate": "2026-09-22T16:17:14.501Z",
  "robos:scorePercentage": 98,
  "robos:verificationHash": "ROBOS-CERT-34FC6D395C5F1599",
  "robos:skillsAcquired": [
    "Forms API Architecture",
    "OpenAPI 3.1 & Pact Contract Verification",
    "Strict Red-Green-Refactor E2E Verification"
  ],
  "robos:status": "issued",
  "robos:package": "learning",
  "robos:namespace": "robos.learning"
}
```
{% endraw %}

## Validate the example

Save the example as `node.json` in the repository root, then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"
```

The command prints `true` when the node meets every rule for its types.
