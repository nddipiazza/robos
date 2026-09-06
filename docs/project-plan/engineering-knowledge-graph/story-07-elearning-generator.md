# Story 08-07: RobOS eLearning Generator & GitOps Catalog

**Epic:** [EKGraph](epic.md)  
**Status:** **Done**

## Overview
Adds a new Knowledge Graph entity type `robos:ELearning` validated by SHACL `ELearningShape`. In the Knowledge Graph browser (`robos-graph`), developers and architects can click "Generate eLearning", which opens a `<robos-ai-textarea>` modal prompting for the desired curriculum. The engine first queries the graph for existing eLearning courses on the topic, and if not found, synthesizes a complete interactive course with modules, hands-on lab steps, and quizzes. Courses are committed declaratively to `.robos/elearning.yaml` as GitOps artifacts.

## Acceptance Criteria
- [x] New KGraph object `robos:ELearning` defined with OSLC JSON-LD metadata.
- [x] SHACL constraint shape `ELearningShape` enforces title, topic, modules, and gitopsFile.
- [x] "Generate eLearning" header button and filter pill added in Knowledge Graph browser.
- [x] `<robos-ai-textarea>` modal allows natural language course prompt entry.
- [x] Engine inspects graph for existing courses before synthesizing new courses.
- [x] Course curriculums serialize to GitOps declarative catalog in `.robos/elearning.yaml`.
- [x] Interactive curriculum viewer renders in Visual Inspector with lab steps and quizzes.
