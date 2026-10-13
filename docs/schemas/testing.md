---
title: "Testing & BDD"
layout: default
parent: Schemas
nav_order: 8
has_children: true
permalink: /schemas/testing.html
---

# Testing & BDD (robos.testing)
{: .no_toc }

Gherkin features, scenarios, step definitions, test plans, suites, execution records, testing libraries and game test scenarios.
{: .fs-6 }

| Detail | Value |
|---|---|
| Package id | `testing` |
| Namespace | `robos.testing` |
| Package file | `.robos/kgraphs/testing/package.jsonld` |
| Classes documented | 21 |

## Classes

Required properties are the ones with a minimum count of 1 or more. A node that lacks one fails validation.

| Class | Node type | Required properties |
|---|---|---|
| [Scenario]({{ '/schemas/testing/scenario.html' | relative_url }}) | `robos:Scenario` | `dcterms:title`, `robos:steps` |
| [Scenario Step]({{ '/schemas/testing/scenario-step.html' | relative_url }}) | `robos:ScenarioStep` | `robos:keyword`, `robos:stepText` |
| [CRPG Test Scenario]({{ '/schemas/testing/crpg-test-scenario.html' | relative_url }}) | `robos:CRPGTestScenario` | `dcterms:title`, `robos:seed`, `robos:map`, `robos:party` |
| [CRPG Battle Map]({{ '/schemas/testing/crpg-battle-map.html' | relative_url }}) | `robos:CRPGBattleMap` | `dcterms:title`, `robos:width`, `robos:height` |
| [CRPG Map Object]({{ '/schemas/testing/crpg-map-object.html' | relative_url }}) | `robos:CRPGMapObject` | `robos:objectId`, `robos:objectType`, `robos:shape`, `robos:position` |
| [CRPG Combatant]({{ '/schemas/testing/crpg-combatant.html' | relative_url }}) | `robos:CRPGCombatant` | `robos:actorId` |
| [Infinity AI Directive]({{ '/schemas/testing/infinity-ai-directive.html' | relative_url }}) | `robos:InfinityAIDirective` | `robos:controller` |
| [CRPG Player Input]({{ '/schemas/testing/crpg-player-input.html' | relative_url }}) | `robos:CRPGPlayerInput` | `robos:type` |
| [Tabletop Test Scenario]({{ '/schemas/testing/tabletop-test-scenario.html' | relative_url }}) | `robos:TabletopTestScenario` | `dcterms:title`, `robos:seed`, `robos:party` |
| [Gherkin Feature]({{ '/schemas/testing/gherkin-feature.html' | relative_url }}) | `robos:GherkinFeature` | `dcterms:title`, `robos:featureFile` |
| [Gherkin Background]({{ '/schemas/testing/gherkin-background.html' | relative_url }}) | `robos:GherkinBackground` | `dcterms:title`, `robos:steps`, `robos:inFeature` |
| [Gherkin Rule]({{ '/schemas/testing/gherkin-rule.html' | relative_url }}) | `robos:GherkinRule` | `dcterms:title`, `robos:inFeature` |
| [Scenario Outline]({{ '/schemas/testing/scenario-outline.html' | relative_url }}) | `robos:ScenarioOutline` | `dcterms:title`, `robos:steps`, `robos:examplesTable` |
| [Examples Table]({{ '/schemas/testing/examples-table.html' | relative_url }}) | `robos:ExamplesTable` | `dcterms:title`, `robos:tableHeaders`, `robos:tableRows` |
| [Step Definition]({{ '/schemas/testing/step-definition.html' | relative_url }}) | `robos:StepDefinition` | `dcterms:title`, `robos:regexPattern`, `robos:codeFile` |
| [Data Table]({{ '/schemas/testing/data-table.html' | relative_url }}) | `robos:DataTable` | `robos:tableRows`, `robos:step` |
| [Doc String]({{ '/schemas/testing/doc-string.html' | relative_url }}) | `robos:DocString` | `robos:content`, `robos:step` |
| [Testing Library]({{ '/schemas/testing/testing-library.html' | relative_url }}) | `robos:TestingLibrary` | `dcterms:title`, `robos:testingType`, `robos:language` |
| [Test Plan]({{ '/schemas/testing/test-plan.html' | relative_url }}) | `robos:TestPlan` | `dcterms:title` |
| [Test Suite]({{ '/schemas/testing/test-suite.html' | relative_url }}) | `robos:TestSuite` | `dcterms:title`, `robos:testFramework` |
| [Test Execution Record]({{ '/schemas/testing/test-execution-record.html' | relative_url }}) | `robos:TestExecutionRecord` | `dcterms:title`, `oslc_qm:executionStatus`, `oslc_qm:reportsOnTestCase` |
