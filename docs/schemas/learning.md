---
title: eLearning
layout: default
parent: Schemas
nav_order: 6
has_children: true
permalink: /schemas/learning.html
---

# eLearning (robos.learning)
{: .no_toc }

eLearning courses, modules, lessons, labs, quizzes, completion certificates and agent skills.
{: .fs-6 }

| Detail | Value |
|---|---|
| Package id | `learning` |
| Namespace | `robos.learning` |
| Package file | `.robos/kgraphs/learning/package.jsonld` |
| Classes documented | 7 |

## Classes

Required properties are the ones with a minimum count of 1 or more. A node that lacks one fails validation.

| Class | Node type | Required properties |
|---|---|---|
| [eLearning Course]({{ '/schemas/learning/elearning.html' | relative_url }}) | `robos:ELearning` | `dcterms:title`, `robos:topic`, `robos:modules`, `robos:gitopsFile` |
| [Certificate Of Completion]({{ '/schemas/learning/certificate-of-completion.html' | relative_url }}) | `robos:CertificateOfCompletion` | `dcterms:title`, `robos:recipientUser`, `robos:forCourse`, `robos:issueDate`, `robos:scorePercentage` |
| [Learning Module]({{ '/schemas/learning/learning-module.html' | relative_url }}) | `robos:LearningModule` | `dcterms:title`, `robos:course` |
| [Learning Lesson]({{ '/schemas/learning/learning-lesson.html' | relative_url }}) | `robos:LearningLesson` | `dcterms:title`, `robos:module` |
| [Hands On Lab]({{ '/schemas/learning/hands-on-lab.html' | relative_url }}) | `robos:HandsOnLab` | `dcterms:title`, `robos:labFile`, `robos:module` |
| [Quiz Assessment]({{ '/schemas/learning/quiz-assessment.html' | relative_url }}) | `robos:QuizAssessment` | `dcterms:title`, `robos:module` |
| [Agent Skill]({{ '/schemas/learning/agent-skill.html' | relative_url }}) | `robos:AgentSkill` | `dcterms:title`, `robos:skillName`, `robos:sourcePath`, `robos:inRepository`, `robos:evidence` |
