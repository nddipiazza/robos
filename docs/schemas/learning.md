---
title: eLearning Curriculums (robos.learning)
layout: default
parent: KGraph Schemas
nav_order: 6
has_children: true
permalink: /schemas/learning.html
---

# eLearning Curriculums (robos.learning)
{: .no_toc }

Interactive developer courses, tutorials, and architectural training modules.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Package Metadata

- **Package Store ID**: `learning`
- **Ontology Namespace**: `robos.learning`
- **GitOps Package File**: `.robos/kgraphs/learning/package.jsonld`
- **Schemas Defined**: 7

---

## Package Schemas & Constraint Shapes

| Schema Class | Target Shape URI | Required Properties (minCount ≥ 1) | Specification |
|---|---|---|---|
| [**eLearning Course** (`robos:ELearning`)]({{ '/schemas/learning/elearning.html' | relative_url }}) | `urn:robos:shape:ELearningShape` | `dcterms:title`, `robos:topic`, `robos:modules`, `robos:gitopsFile` | [View Schema &rarr;]({{ '/schemas/learning/elearning.html' | relative_url }}) |
| [**Certificate Of Completion** (`robos:CertificateOfCompletion`)]({{ '/schemas/learning/certificate-of-completion.html' | relative_url }}) | `urn:robos:shape:CertificateOfCompletionShape` | `dcterms:title`, `robos:recipientUser`, `robos:forCourse`, `robos:issueDate`, `robos:scorePercentage` | [View Schema &rarr;]({{ '/schemas/learning/certificate-of-completion.html' | relative_url }}) |
| [**Learning Module** (`robos:LearningModule`)]({{ '/schemas/learning/learning-module.html' | relative_url }}) | `urn:robos:shape:LearningModuleShape` | `dcterms:title`, `robos:course` | [View Schema &rarr;]({{ '/schemas/learning/learning-module.html' | relative_url }}) |
| [**Learning Lesson** (`robos:LearningLesson`)]({{ '/schemas/learning/learning-lesson.html' | relative_url }}) | `urn:robos:shape:LearningLessonShape` | `dcterms:title`, `robos:module` | [View Schema &rarr;]({{ '/schemas/learning/learning-lesson.html' | relative_url }}) |
| [**Hands On Lab** (`robos:HandsOnLab`)]({{ '/schemas/learning/hands-on-lab.html' | relative_url }}) | `urn:robos:shape:HandsOnLabShape` | `dcterms:title`, `robos:labFile`, `robos:module` | [View Schema &rarr;]({{ '/schemas/learning/hands-on-lab.html' | relative_url }}) |
| [**Quiz Assessment** (`robos:QuizAssessment`)]({{ '/schemas/learning/quiz-assessment.html' | relative_url }}) | `urn:robos:shape:QuizAssessmentShape` | `dcterms:title`, `robos:module` | [View Schema &rarr;]({{ '/schemas/learning/quiz-assessment.html' | relative_url }}) |
| [**Agent Skill** (`robos:AgentSkill`)]({{ '/schemas/learning/agent-skill.html' | relative_url }}) | `robos:AgentSkillShape` | `dcterms:title`, `robos:skillName`, `robos:sourcePath`, `robos:inRepository`, `robos:evidence` | [View Schema &rarr;]({{ '/schemas/learning/agent-skill.html' | relative_url }}) |

---

## Package Architecture & Linked Data Model

<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
  <img src="{{ '/assets/images/kgraph-schemas-architecture.jpg' | relative_url }}" alt="eLearning Curriculums (robos.learning) Ontology Map" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>eLearning Curriculums (robos.learning) (robos.learning)</strong>: High-level package ontology within the RobOS Knowledge Graph. <em>(Click image to zoom full screen)</em>
  </div>
</div>