---
title: "Testing, Quality & BDD (robos.testing)"
layout: default
parent: Schemas
nav_order: 8
has_children: true
permalink: /schemas/testing.html
---

# Testing, Quality & BDD (robos.testing)
{: .no_toc }

Gherkin features, scenarios, step definitions, test plans, suites, execution records, testing libraries and game test scenarios.
{: .fs-6 }

| | |
|---|---|
| Package id | `testing` |
| Namespace | `robos.testing` |
| Package file | `.robos/kgraphs/testing/package.jsonld` |
| Classes documented | 21 |

## Classes

Required properties are the ones with a minimum count of 1 or more. A node that lacks one fails validation.

| Class | Shape | Required properties |
|---|---|---|
| [Scenario (`robos:Scenario`)]({{ '/schemas/testing/scenario.html' | relative_url }}) | `urn:robos:shape:ScenarioShape` | `dcterms:title`, `robos:steps` |
| [Scenario Step (`robos:ScenarioStep`)]({{ '/schemas/testing/scenario-step.html' | relative_url }}) | `urn:robos:shape:ScenarioStepShape` | `robos:keyword`, `robos:stepText` |
| [CRPG Test Scenario (`robos:CRPGTestScenario`)]({{ '/schemas/testing/crpg-test-scenario.html' | relative_url }}) | `urn:robos:shape:CRPGTestScenarioShape` | `dcterms:title`, `robos:seed`, `robos:map`, `robos:party` |
| [CRPG Battle Map (`robos:CRPGBattleMap`)]({{ '/schemas/testing/crpg-battle-map.html' | relative_url }}) | `urn:robos:shape:CRPGBattleMapShape` | `dcterms:title`, `robos:width`, `robos:height` |
| [CRPG Map Object (`robos:CRPGMapObject`)]({{ '/schemas/testing/crpg-map-object.html' | relative_url }}) | `urn:robos:shape:CRPGMapObjectShape` | `robos:objectId`, `robos:objectType`, `robos:shape`, `robos:position` |
| [CRPG Combatant (`robos:CRPGCombatant`)]({{ '/schemas/testing/crpg-combatant.html' | relative_url }}) | `urn:robos:shape:CRPGCombatantShape` | `robos:actorId` |
| [Infinity AI Directive (`robos:InfinityAIDirective`)]({{ '/schemas/testing/infinity-ai-directive.html' | relative_url }}) | `urn:robos:shape:InfinityAIDirectiveShape` | `robos:controller` |
| [CRPG Player Input (`robos:CRPGPlayerInput`)]({{ '/schemas/testing/crpg-player-input.html' | relative_url }}) | `urn:robos:shape:CRPGPlayerInputShape` | `robos:type` |
| [Tabletop Test Scenario (`robos:TabletopTestScenario`)]({{ '/schemas/testing/tabletop-test-scenario.html' | relative_url }}) | `urn:robos:shape:TabletopTestScenarioShape` | `dcterms:title`, `robos:seed`, `robos:party` |
| [Gherkin Feature (`robos:GherkinFeature`)]({{ '/schemas/testing/gherkin-feature.html' | relative_url }}) | `urn:robos:shape:GherkinFeatureShape` | `dcterms:title`, `robos:featureFile` |
| [Gherkin Background (`robos:GherkinBackground`)]({{ '/schemas/testing/gherkin-background.html' | relative_url }}) | `urn:robos:shape:GherkinBackgroundShape` | `dcterms:title`, `robos:steps`, `robos:inFeature` |
| [Gherkin Rule (`robos:GherkinRule`)]({{ '/schemas/testing/gherkin-rule.html' | relative_url }}) | `urn:robos:shape:GherkinRuleShape` | `dcterms:title`, `robos:inFeature` |
| [Scenario Outline (`robos:ScenarioOutline`)]({{ '/schemas/testing/scenario-outline.html' | relative_url }}) | `urn:robos:shape:ScenarioOutlineShape` | `dcterms:title`, `robos:steps`, `robos:examplesTable` |
| [Examples Table (`robos:ExamplesTable`)]({{ '/schemas/testing/examples-table.html' | relative_url }}) | `urn:robos:shape:ExamplesTableShape` | `dcterms:title`, `robos:tableHeaders`, `robos:tableRows` |
| [Step Definition (`robos:StepDefinition`)]({{ '/schemas/testing/step-definition.html' | relative_url }}) | `urn:robos:shape:StepDefinitionShape` | `dcterms:title`, `robos:regexPattern`, `robos:codeFile` |
| [Data Table (`robos:DataTable`)]({{ '/schemas/testing/data-table.html' | relative_url }}) | `urn:robos:shape:DataTableShape` | `robos:tableRows`, `robos:step` |
| [Doc String (`robos:DocString`)]({{ '/schemas/testing/doc-string.html' | relative_url }}) | `urn:robos:shape:DocStringShape` | `robos:content`, `robos:step` |
| [Testing Library (`robos:TestingLibrary`)]({{ '/schemas/testing/testing-library.html' | relative_url }}) | `urn:robos:shape:TestingLibraryShape` | `dcterms:title`, `robos:testingType`, `robos:language` |
| [Test Plan (`robos:TestPlan`)]({{ '/schemas/testing/test-plan.html' | relative_url }}) | `urn:robos:shape:TestPlanShape` | `dcterms:title` |
| [Test Suite (`robos:TestSuite`)]({{ '/schemas/testing/test-suite.html' | relative_url }}) | `urn:robos:shape:TestSuiteShape` | `dcterms:title`, `robos:testFramework` |
| [Test Execution Record (`robos:TestExecutionRecord`)]({{ '/schemas/testing/test-execution-record.html' | relative_url }}) | `urn:robos:shape:TestExecutionRecordShape` | `dcterms:title`, `oslc_qm:executionStatus`, `oslc_qm:reportsOnTestCase` |
