---
title: Testing, Quality & BDD (robos.testing)
layout: default
parent: KGraph Schemas
nav_order: 8
has_children: true
permalink: /schemas/testing.html
---

# Testing, Quality & BDD (robos.testing)
{: .no_toc }

First-class Gherkin features, scenarios, step definitions, test execution records, and major testing frameworks.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Package Metadata

- **Package Store ID**: `testing`
- **Ontology Namespace**: `robos.testing`
- **GitOps Package File**: `.robos/kgraphs/testing/package.jsonld`
- **Schemas Defined**: 20

---

## Package Schemas & Constraint Shapes

| Schema Class | Target Shape URI | Required Properties (minCount ≥ 1) | Specification |
|---|---|---|---|
| [**Scenario** (`robos:Scenario`)]({{ '/schemas/testing/scenario.html' | relative_url }}) | `urn:robos:shape:ScenarioShape` | `dcterms:title`, `robos:steps` | [View Schema &rarr;]({{ '/schemas/testing/scenario.html' | relative_url }}) |
| [**Scenario Step** (`robos:ScenarioStep`)]({{ '/schemas/testing/scenario-step.html' | relative_url }}) | `urn:robos:shape:ScenarioStepShape` | `robos:keyword`, `robos:stepText` | [View Schema &rarr;]({{ '/schemas/testing/scenario-step.html' | relative_url }}) |
| [**CRPG Test Scenario** (`robos:CRPGTestScenario`)]({{ '/schemas/testing/crpg-test-scenario.html' | relative_url }}) | `urn:robos:shape:CRPGTestScenarioShape` | `dcterms:title`, `robos:seed`, `robos:map`, `robos:party`, `robos:enemies`, `robos:directives`, `robos:traps`, `robos:maxRounds`, `robos:executionMode`, `robos:reactions`, `robos:dice` | [View Schema &rarr;]({{ '/schemas/testing/crpg-test-scenario.html' | relative_url }}) |
| [**CRPG Battle Map** (`robos:CRPGBattleMap`)]({{ '/schemas/testing/crpg-battle-map.html' | relative_url }}) | `urn:robos:shape:CRPGBattleMapShape` | `dcterms:title`, `robos:width`, `robos:height`, `robos:mapZone`, `robos:terrain`, `robos:mapObjects`, `robos:blockout`, `robos:backgroundImage` | [View Schema &rarr;]({{ '/schemas/testing/crpg-battle-map.html' | relative_url }}) |
| [**CRPG Map Object** (`robos:CRPGMapObject`)]({{ '/schemas/testing/crpg-map-object.html' | relative_url }}) | `urn:robos:shape:CRPGMapObjectShape` | `robos:objectId`, `robos:objectType`, `robos:shape`, `robos:position`, `robos:size`, `robos:radius`, `robos:to`, `robos:thickness`, `robos:points`, `robos:open`, `robos:blocksMovement`, `robos:blocksSight`, `robos:difficultTerrain`, `robos:cover` | [View Schema &rarr;]({{ '/schemas/testing/crpg-map-object.html' | relative_url }}) |
| [**CRPG Combatant** (`robos:CRPGCombatant`)]({{ '/schemas/testing/crpg-combatant.html' | relative_url }}) | `urn:robos:shape:CRPGCombatantShape` | `robos:actorId`, `robos:characterClass`, `robos:monster`, `robos:position` | [View Schema &rarr;]({{ '/schemas/testing/crpg-combatant.html' | relative_url }}) |
| [**Infinity AI Directive** (`robos:InfinityAIDirective`)]({{ '/schemas/testing/infinity-ai-directive.html' | relative_url }}) | `urn:robos:shape:InfinityAIDirectiveShape` | `robos:controller`, `robos:actor`, `robos:side`, `robos:targetPriority`, `robos:focusTarget`, `robos:preferSpells`, `robos:forbidSpells`, `robos:healThreshold`, `robos:movement`, `robos:scriptedInputs` | [View Schema &rarr;]({{ '/schemas/testing/infinity-ai-directive.html' | relative_url }}) |
| [**CRPG Player Input** (`robos:CRPGPlayerInput`)]({{ '/schemas/testing/crpg-player-input.html' | relative_url }}) | `urn:robos:shape:CRPGPlayerInputShape` | `robos:type`, `robos:round`, `robos:target`, `robos:spell`, `robos:item`, `robos:point`, `robos:to` | [View Schema &rarr;]({{ '/schemas/testing/crpg-player-input.html' | relative_url }}) |
| [**Gherkin Feature** (`robos:GherkinFeature`)]({{ '/schemas/testing/gherkin-feature.html' | relative_url }}) | `urn:robos:shape:GherkinFeatureShape` | `dcterms:title`, `robos:featureFile` | [View Schema &rarr;]({{ '/schemas/testing/gherkin-feature.html' | relative_url }}) |
| [**Gherkin Background** (`robos:GherkinBackground`)]({{ '/schemas/testing/gherkin-background.html' | relative_url }}) | `urn:robos:shape:GherkinBackgroundShape` | `dcterms:title`, `robos:steps`, `robos:inFeature` | [View Schema &rarr;]({{ '/schemas/testing/gherkin-background.html' | relative_url }}) |
| [**Gherkin Rule** (`robos:GherkinRule`)]({{ '/schemas/testing/gherkin-rule.html' | relative_url }}) | `urn:robos:shape:GherkinRuleShape` | `dcterms:title`, `robos:inFeature` | [View Schema &rarr;]({{ '/schemas/testing/gherkin-rule.html' | relative_url }}) |
| [**Scenario Outline** (`robos:ScenarioOutline`)]({{ '/schemas/testing/scenario-outline.html' | relative_url }}) | `urn:robos:shape:ScenarioOutlineShape` | `dcterms:title`, `robos:steps`, `robos:examplesTable` | [View Schema &rarr;]({{ '/schemas/testing/scenario-outline.html' | relative_url }}) |
| [**Examples Table** (`robos:ExamplesTable`)]({{ '/schemas/testing/examples-table.html' | relative_url }}) | `urn:robos:shape:ExamplesTableShape` | `dcterms:title`, `robos:tableHeaders`, `robos:tableRows` | [View Schema &rarr;]({{ '/schemas/testing/examples-table.html' | relative_url }}) |
| [**Step Definition** (`robos:StepDefinition`)]({{ '/schemas/testing/step-definition.html' | relative_url }}) | `urn:robos:shape:StepDefinitionShape` | `dcterms:title`, `robos:regexPattern`, `robos:codeFile` | [View Schema &rarr;]({{ '/schemas/testing/step-definition.html' | relative_url }}) |
| [**Data Table** (`robos:DataTable`)]({{ '/schemas/testing/data-table.html' | relative_url }}) | `urn:robos:shape:DataTableShape` | `robos:tableRows`, `robos:step` | [View Schema &rarr;]({{ '/schemas/testing/data-table.html' | relative_url }}) |
| [**Doc String** (`robos:DocString`)]({{ '/schemas/testing/doc-string.html' | relative_url }}) | `urn:robos:shape:DocStringShape` | `robos:content`, `robos:step` | [View Schema &rarr;]({{ '/schemas/testing/doc-string.html' | relative_url }}) |
| [**Testing Library** (`robos:TestingLibrary`)]({{ '/schemas/testing/testing-library.html' | relative_url }}) | `urn:robos:shape:TestingLibraryShape` | `dcterms:title`, `robos:testingType`, `robos:language` | [View Schema &rarr;]({{ '/schemas/testing/testing-library.html' | relative_url }}) |
| [**Test Plan** (`robos:TestPlan`)]({{ '/schemas/testing/test-plan.html' | relative_url }}) | `urn:robos:shape:TestPlanShape` | `dcterms:title` | [View Schema &rarr;]({{ '/schemas/testing/test-plan.html' | relative_url }}) |
| [**Test Suite** (`robos:TestSuite`)]({{ '/schemas/testing/test-suite.html' | relative_url }}) | `urn:robos:shape:TestSuiteShape` | `dcterms:title`, `robos:testFramework` | [View Schema &rarr;]({{ '/schemas/testing/test-suite.html' | relative_url }}) |
| [**Test Execution Record** (`robos:TestExecutionRecord`)]({{ '/schemas/testing/test-execution-record.html' | relative_url }}) | `urn:robos:shape:TestExecutionRecordShape` | `dcterms:title`, `oslc_qm:executionStatus`, `oslc_qm:reportsOnTestCase` | [View Schema &rarr;]({{ '/schemas/testing/test-execution-record.html' | relative_url }}) |

---

## Package Architecture & Linked Data Model

<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
  <img src="{{ '/assets/images/kgraph-schemas-architecture.jpg' | relative_url }}" alt="Testing, Quality & BDD (robos.testing) Ontology Map" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>Testing, Quality & BDD (robos.testing) (robos.testing)</strong>: High-level package ontology within the RobOS Knowledge Graph. <em>(Click image to zoom full screen)</em>
  </div>
</div>