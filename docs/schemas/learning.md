---
title: "eLearning Curriculums (robos.learning)"
layout: default
parent: Schemas
nav_order: 6
has_children: true
permalink: /schemas/learning.html
description: "eLearning courses, modules, lessons, labs, quizzes, completion certificates and agent skills."
---

# eLearning Curriculums (robos.learning)
{: .no_toc }

eLearning courses, modules, lessons, labs, quizzes, completion certificates and agent skills.
{: .fs-6 }

| | |
|---|---|
| Package id | `learning` |
| Namespace | `robos.learning` |
| Package file | `.robos/kgraphs/learning/package.jsonld` |
| Classes documented | 7 |

## Classes

Required properties are the ones with a minimum count of 1 or more. A node that lacks one fails validation.

| Class | Shape | Required properties |
|---|---|---|
| [eLearning Course (`robos:ELearning`)]({{ '/schemas/learning/elearning.html' | relative_url }}) | `urn:robos:shape:ELearningShape` | `dcterms:title`, `robos:topic`, `robos:modules`, `robos:gitopsFile` |
| [Certificate Of Completion (`robos:CertificateOfCompletion`)]({{ '/schemas/learning/certificate-of-completion.html' | relative_url }}) | `urn:robos:shape:CertificateOfCompletionShape` | `dcterms:title`, `robos:recipientUser`, `robos:forCourse`, `robos:issueDate`, `robos:scorePercentage` |
| [Learning Module (`robos:LearningModule`)]({{ '/schemas/learning/learning-module.html' | relative_url }}) | `urn:robos:shape:LearningModuleShape` | `dcterms:title`, `robos:course` |
| [Learning Lesson (`robos:LearningLesson`)]({{ '/schemas/learning/learning-lesson.html' | relative_url }}) | `urn:robos:shape:LearningLessonShape` | `dcterms:title`, `robos:module` |
| [Hands On Lab (`robos:HandsOnLab`)]({{ '/schemas/learning/hands-on-lab.html' | relative_url }}) | `urn:robos:shape:HandsOnLabShape` | `dcterms:title`, `robos:labFile`, `robos:module` |
| [Quiz Assessment (`robos:QuizAssessment`)]({{ '/schemas/learning/quiz-assessment.html' | relative_url }}) | `urn:robos:shape:QuizAssessmentShape` | `dcterms:title`, `robos:module` |
| [Agent Skill (`robos:AgentSkill`)]({{ '/schemas/learning/agent-skill.html' | relative_url }}) | `robos:AgentSkillShape` | `dcterms:title`, `robos:skillName`, `robos:sourcePath`, `robos:inRepository`, `robos:evidence` |
