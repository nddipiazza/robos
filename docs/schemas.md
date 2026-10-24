---
title: Schemas
layout: default
parent: Build on RobOS
nav_order: 2
has_children: true
permalink: /schemas.html
description: "Reference for the node types (classes) in the RobOS knowledge graph. Use it to see which properties a node needs before you add it, and what the validator rejects."
---

# Schemas
{: .no_toc }

Reference for the node types (classes) in the RobOS knowledge graph. Use it to see which properties a node needs before you add it, and what the validator rejects.
{: .fs-6 }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

## What these pages describe

Each class page documents one shape. A shape is a rule set in `packages/robos-graph/lib/shacl-validator.js` that applies to nodes of one class, such as `robos:Microservice`. For every property it lists the minimum and maximum number of values and the message shown when the rule fails.

The built-in validator checks counts only. It confirms that required properties are present and that single-valued properties have at most one value. It does not check datatypes or value formats, and it is not a complete W3C SHACL implementation.

Classes are grouped by package, the same way the graph is stored on disk (see [Knowledge graph]({{ site.baseurl }}{% link knowledge-graph.md %})). The grouping here is a documentation aid. The `robos:package` property on each node decides where the node is stored, and one class can have nodes in more than one package.

Every shape also records the upstream definition it follows: a Schema.org type and, where one applies, a domain standard such as OSLC, the C4 model or Cucumber.

## Packages

| Package | Namespace | Classes | Covers |
|---|---|---|---|
| [Core Platform (robos.platform)]({{ '/schemas/core-platform.html' | relative_url }}) | `robos.platform` | 23 | Databases, message brokers, search indexes, MCP servers, build systems, context sources, prompt strategies and source declarations. |
| [Organization & Teams (robos.org)]({{ '/schemas/organization.html' | relative_url }}) | `robos.org` | 21 | Teams, projects and work items, Git organizations, repositories, branches, pull requests and commits, agent personas, task servers and review comments. |
| [Services & Contracts (robos.services)]({{ '/schemas/services.html' | relative_url }}) | `robos.services` | 8 | Microservices, API contracts (OpenAPI, Protobuf, GraphQL), endpoints, data models, requirements and features. |
| [Applications (robos.apps)]({{ '/schemas/applications.html' | relative_url }}) | `robos.apps` | 11 | Front-end, desktop, console and mobile applications, games, libraries, web routes, CLI commands and voice commands. |
| [DevOps & Cloud (robos.devops)]({{ '/schemas/devops.html' | relative_url }}) | `robos.devops` | 14 | Kubernetes clusters, environments, GitOps deployments, CI/CD pipelines, remote-execution clusters and data pipelines. |
| [eLearning Curriculums (robos.learning)]({{ '/schemas/learning.html' | relative_url }}) | `robos.learning` | 7 | eLearning courses, modules, lessons, labs, quizzes, completion certificates and agent skills. |
| [Documentation & Diagrams (robos.docs)]({{ '/schemas/documentation.html' | relative_url }}) | `robos.docs` | 8 | Documentation pages, architecture decision records, flow diagrams, walkthroughs and code snippets. |
| [Testing, Quality & BDD (robos.testing)]({{ '/schemas/testing.html' | relative_url }}) | `robos.testing` | 21 | Gherkin features, scenarios, step definitions, test plans, suites, execution records, testing libraries and game test scenarios. |
| [Game Rules (robos.game)]({{ '/schemas/game.html' | relative_url }}) | `robos.game` | 5 | Rules-engine building blocks shared by games: games, classes, items, spells and monsters. |
| [cRPG (robos.crpg)]({{ '/schemas/crpg.html' | relative_url }}) | `robos.crpg` | 6 | Party-based tactical cRPG content: abilities, campaigns, map transitions, game events and story flows. |
| [Tabletop Game (robos.tabletop)]({{ '/schemas/tabletop-game.html' | relative_url }}) | `robos.tabletop` | 12 | Tabletop dungeon-crawler content: heroes, monsters, summons, quest maps, turn steps and AI directives. |

## All classes

The Schema.org column is the parent type from the shape. Open a class for its property rules, the standard it follows and an example node.

| Class | Package | Schema.org type |
|---|---|---|
| [`robos:BuildSystem`]({{ '/schemas/core-platform/build-system.html' | relative_url }}) | `core-platform` | [`schema:SoftwareApplication`](https://schema.org/SoftwareApplication) |
| [`robos:Database`]({{ '/schemas/core-platform/database.html' | relative_url }}) | `core-platform` | [`schema:DataStore`](https://schema.org/DataStore) |
| [`robos:NoSQLDatabase`]({{ '/schemas/core-platform/nosql-database.html' | relative_url }}) | `core-platform` | [`schema:DataStore`](https://schema.org/DataStore) |
| [`robos:SearchIndex`]({{ '/schemas/core-platform/search-index.html' | relative_url }}) | `core-platform` | [`schema:DataStore`](https://schema.org/DataStore) |
| [`robos:SearchCluster`]({{ '/schemas/core-platform/search-cluster.html' | relative_url }}) | `core-platform` | [`schema:DataStore`](https://schema.org/DataStore) |
| [`robos:MessageBroker`]({{ '/schemas/core-platform/message-broker.html' | relative_url }}) | `core-platform` | [`schema:BroadcastService`](https://schema.org/BroadcastService) |
| [`robos:MCPServer`]({{ '/schemas/core-platform/mcp-server.html' | relative_url }}) | `core-platform` | [`schema:SoftwareApplication`](https://schema.org/SoftwareApplication) |
| [`robos:ContextSource`]({{ '/schemas/core-platform/context-source.html' | relative_url }}) | `core-platform` | [`schema:DataFeed`](https://schema.org/DataFeed) |
| [`robos:PromptStrategy`]({{ '/schemas/core-platform/prompt-strategy.html' | relative_url }}) | `core-platform` | [`schema:Intangible`](https://schema.org/Intangible) |
| [`robos:DatabaseSchema`]({{ '/schemas/core-platform/database-schema.html' | relative_url }}) | `core-platform` | [`schema:DataStore`](https://schema.org/DataStore) |
| [`robos:DatabaseTable`]({{ '/schemas/core-platform/database-table.html' | relative_url }}) | `core-platform` | [`schema:Table`](https://schema.org/Table) |
| [`robos:DatabaseColumn`]({{ '/schemas/core-platform/database-column.html' | relative_url }}) | `core-platform` | [`schema:Property`](https://schema.org/Property) |
| [`robos:DatabaseIndex`]({{ '/schemas/core-platform/database-index.html' | relative_url }}) | `core-platform` | [`schema:Index`](https://schema.org/Index) |
| [`robos:NoSQLCollection`]({{ '/schemas/core-platform/nosql-collection.html' | relative_url }}) | `core-platform` | [`schema:Collection`](https://schema.org/Collection) |
| [`robos:MessageTopic`]({{ '/schemas/core-platform/message-topic.html' | relative_url }}) | `core-platform` | [`schema:BroadcastChannel`](https://schema.org/BroadcastChannel) |
| [`robos:ConsumerGroup`]({{ '/schemas/core-platform/consumer-group.html' | relative_url }}) | `core-platform` | [`schema:Audience`](https://schema.org/Audience) |
| [`robos:MCPTool`]({{ '/schemas/core-platform/mcp-tool.html' | relative_url }}) | `core-platform` | [`schema:Action`](https://schema.org/Action) |
| [`robos:MCPResource`]({{ '/schemas/core-platform/mcp-resource.html' | relative_url }}) | `core-platform` | [`schema:MediaObject`](https://schema.org/MediaObject) |
| [`robos:MCPPrompt`]({{ '/schemas/core-platform/mcp-prompt.html' | relative_url }}) | `core-platform` | [`schema:Text`](https://schema.org/Text) |
| [`robos:CurriculumDefinition`]({{ '/schemas/core-platform/curriculum-definition.html' | relative_url }}) | `core-platform` | [`schema:Course`](https://schema.org/Course) |
| [`robos:DataStore`]({{ '/schemas/core-platform/data-store.html' | relative_url }}) | `core-platform` | [`schema:SoftwareApplication`](https://schema.org/SoftwareApplication) |
| [`robos:BrokerDefinition`]({{ '/schemas/core-platform/broker-definition.html' | relative_url }}) | `core-platform` | [`schema:Service`](https://schema.org/Service) |
| [`robos:SourceArtifact`]({{ '/schemas/core-platform/source-artifact.html' | relative_url }}) | `core-platform` | [`schema:CreativeWork`](https://schema.org/CreativeWork) |
| [`robos:Team`]({{ '/schemas/organization/team.html' | relative_url }}) | `organization` | [`schema:ProjectTeam`](https://schema.org/ProjectTeam) |
| [`robos:Project`]({{ '/schemas/organization/project.html' | relative_url }}) | `organization` | [`schema:Project`](https://schema.org/Project) |
| [`robos:Epic`]({{ '/schemas/organization/epic.html' | relative_url }}) | `organization` | [`schema:Plan`](https://schema.org/Plan) |
| [`robos:GitProjectOrganization`]({{ '/schemas/organization/git-project-organization.html' | relative_url }}) | `organization` | [`schema:Organization`](https://schema.org/Organization) |
| [`robos:AgentPersona`]({{ '/schemas/organization/agent-persona.html' | relative_url }}) | `organization` | [`schema:Person`](https://schema.org/Person) |
| [`robos:TaskServer`]({{ '/schemas/organization/task-server.html' | relative_url }}) | `organization` | [`schema:SoftwareApplication`](https://schema.org/SoftwareApplication) |
| [`robos:UserStory`]({{ '/schemas/organization/user-story.html' | relative_url }}) | `organization` | [`schema:Action`](https://schema.org/Action) |
| [`robos:Task`]({{ '/schemas/organization/task.html' | relative_url }}) | `organization` | [`schema:Action`](https://schema.org/Action) |
| [`robos:Subtask`]({{ '/schemas/organization/subtask.html' | relative_url }}) | `organization` | [`schema:Action`](https://schema.org/Action) |
| [`robos:Bug`]({{ '/schemas/organization/bug.html' | relative_url }}) | `organization` | [`schema:Action`](https://schema.org/Action) |
| [`robos:Sprint`]({{ '/schemas/organization/sprint.html' | relative_url }}) | `organization` | [`schema:Action`](https://schema.org/Action) |
| [`robos:Milestone`]({{ '/schemas/organization/milestone.html' | relative_url }}) | `organization` | [`schema:Action`](https://schema.org/Action) |
| [`robos:GitRepository`]({{ '/schemas/organization/git-repository.html' | relative_url }}) | `organization` | [`schema:SoftwareSourceCode`](https://schema.org/SoftwareSourceCode) |
| [`robos:GitBranch`]({{ '/schemas/organization/git-branch.html' | relative_url }}) | `organization` | [`schema:SoftwareSourceCode`](https://schema.org/SoftwareSourceCode) |
| [`robos:PullRequest`]({{ '/schemas/organization/pull-request.html' | relative_url }}) | `organization` | [`schema:UpdateAction`](https://schema.org/UpdateAction) |
| [`robos:GitCommit`]({{ '/schemas/organization/git-commit.html' | relative_url }}) | `organization` | [`schema:SoftwareSourceCode`](https://schema.org/SoftwareSourceCode) |
| [`robos:GitTag`]({{ '/schemas/organization/git-tag.html' | relative_url }}) | `organization` | [`schema:SoftwareSourceCode`](https://schema.org/SoftwareSourceCode) |
| [`robos:Comment`]({{ '/schemas/organization/comment.html' | relative_url }}) | `organization` | [`schema:Comment`](https://schema.org/Comment) |
| [`robos:DiscussionThread`]({{ '/schemas/organization/discussion-thread.html' | relative_url }}) | `organization` | [`schema:Conversation`](https://schema.org/Conversation) |
| [`robos:ReviewComment`]({{ '/schemas/organization/review-comment.html' | relative_url }}) | `organization` | [`schema:Comment`](https://schema.org/Comment) |
| [`robos:CommentAttachment`]({{ '/schemas/organization/comment-attachment.html' | relative_url }}) | `organization` | [`schema:MediaObject`](https://schema.org/MediaObject) |
| [`robos:Microservice`]({{ '/schemas/services/microservice.html' | relative_url }}) | `services` | [`schema:SoftwareApplication`](https://schema.org/SoftwareApplication) |
| [`robos:Contract`]({{ '/schemas/services/contract.html' | relative_url }}) | `services` | [`schema:DigitalDocument`](https://schema.org/DigitalDocument) |
| [`oslc_rm:Requirement`]({{ '/schemas/services/requirement.html' | relative_url }}) | `services` | [`schema:DigitalDocument`](https://schema.org/DigitalDocument) |
| [`robos:ProtobufContract`]({{ '/schemas/services/protobuf-contract.html' | relative_url }}) | `services` | [`schema:DigitalDocument`](https://schema.org/DigitalDocument) |
| [`robos:GraphQLContract`]({{ '/schemas/services/graphql-contract.html' | relative_url }}) | `services` | [`schema:DigitalDocument`](https://schema.org/DigitalDocument) |
| [`robos:Feature`]({{ '/schemas/services/feature.html' | relative_url }}) | `services` | [`schema:DigitalDocument`](https://schema.org/DigitalDocument) |
| [`robos:APIEndpoint`]({{ '/schemas/services/api-endpoint.html' | relative_url }}) | `services` | [`schema:EntryPoint`](https://schema.org/EntryPoint) |
| [`robos:DataModel`]({{ '/schemas/services/data-model.html' | relative_url }}) | `services` | [`schema:Class`](https://schema.org/Class) |
| [`robos:DesktopApp`]({{ '/schemas/applications/desktop-app.html' | relative_url }}) | `applications` | [`schema:SoftwareApplication`](https://schema.org/SoftwareApplication) |
| [`robos:ConsoleApp`]({{ '/schemas/applications/console-app.html' | relative_url }}) | `applications` | [`schema:SoftwareApplication`](https://schema.org/SoftwareApplication) |
| [`robos:MobileApp`]({{ '/schemas/applications/mobile-app.html' | relative_url }}) | `applications` | [`schema:MobileApplication`](https://schema.org/MobileApplication) |
| [`robos:Library`]({{ '/schemas/applications/library.html' | relative_url }}) | `applications` | [`schema:SoftwareSourceCode`](https://schema.org/SoftwareSourceCode) |
| [`robos:FrontEndApp`]({{ '/schemas/applications/front-end-app.html' | relative_url }}) | `applications` | [`schema:WebApplication`](https://schema.org/WebApplication) |
| [`robos:PCGame`]({{ '/schemas/applications/pc-game.html' | relative_url }}) | `applications` | [`schema:VideoGame`](https://schema.org/VideoGame) |
| [`robos:MobileGame`]({{ '/schemas/applications/mobile-game.html' | relative_url }}) | `applications` | [`schema:VideoGame`](https://schema.org/VideoGame) |
| [`robos:WebRoute`]({{ '/schemas/applications/web-route.html' | relative_url }}) | `applications` | [`schema:WebPage`](https://schema.org/WebPage) |
| [`robos:CLICommand`]({{ '/schemas/applications/cli-command.html' | relative_url }}) | `applications` | [`schema:SoftwareApplication`](https://schema.org/SoftwareApplication) |
| [`robos:CLIFlag`]({{ '/schemas/applications/cli-flag.html' | relative_url }}) | `applications` | [`schema:PropertyValue`](https://schema.org/PropertyValue) |
| [`robos:VoiceCommand`]({{ '/schemas/applications/voice-command.html' | relative_url }}) | `applications` | [`schema:ControlAction`](https://schema.org/ControlAction) |
| [`robos:DataPipeline`]({{ '/schemas/devops/data-pipeline.html' | relative_url }}) | `devops` | [`schema:DataFeed`](https://schema.org/DataFeed) |
| [`robos:RemoteExecutionCluster`]({{ '/schemas/devops/remote-execution-cluster.html' | relative_url }}) | `devops` | [`schema:ComputerPlatform`](https://schema.org/ComputerPlatform) |
| [`robos:KubernetesCluster`]({{ '/schemas/devops/kubernetes-cluster.html' | relative_url }}) | `devops` | [`schema:ComputerPlatform`](https://schema.org/ComputerPlatform) |
| [`robos:Environment`]({{ '/schemas/devops/environment.html' | relative_url }}) | `devops` | [`schema:DeploymentEnvironment`](https://schema.org/DeploymentEnvironment) |
| [`robos:GitOpsDeployment`]({{ '/schemas/devops/gitops-deployment.html' | relative_url }}) | `devops` | [`schema:SoftwareApplication`](https://schema.org/SoftwareApplication) |
| [`robos:CICDPipeline`]({{ '/schemas/devops/cicd-pipeline.html' | relative_url }}) | `devops` | [`schema:SoftwareApplication`](https://schema.org/SoftwareApplication) |
| [`robos:KubernetesNamespace`]({{ '/schemas/devops/kubernetes-namespace.html' | relative_url }}) | `devops` | [`schema:AdministrativeArea`](https://schema.org/AdministrativeArea) |
| [`robos:KubernetesDeployment`]({{ '/schemas/devops/kubernetes-deployment.html' | relative_url }}) | `devops` | [`schema:SoftwareApplication`](https://schema.org/SoftwareApplication) |
| [`robos:KubernetesService`]({{ '/schemas/devops/kubernetes-service.html' | relative_url }}) | `devops` | [`schema:Service`](https://schema.org/Service) |
| [`robos:KubernetesIngress`]({{ '/schemas/devops/kubernetes-ingress.html' | relative_url }}) | `devops` | [`schema:EntryPoint`](https://schema.org/EntryPoint) |
| [`robos:PipelineStage`]({{ '/schemas/devops/pipeline-stage.html' | relative_url }}) | `devops` | [`schema:Action`](https://schema.org/Action) |
| [`robos:PipelineJob`]({{ '/schemas/devops/pipeline-job.html' | relative_url }}) | `devops` | [`schema:Action`](https://schema.org/Action) |
| [`robos:PipelineStep`]({{ '/schemas/devops/pipeline-step.html' | relative_url }}) | `devops` | [`schema:Action`](https://schema.org/Action) |
| [`robos:EnvironmentProfile`]({{ '/schemas/devops/environment-profile.html' | relative_url }}) | `devops` | [`schema:DefinedTerm`](https://schema.org/DefinedTerm) |
| [`robos:ELearning`]({{ '/schemas/learning/elearning.html' | relative_url }}) | `learning` | [`schema:Course`](https://schema.org/Course) |
| [`robos:CertificateOfCompletion`]({{ '/schemas/learning/certificate-of-completion.html' | relative_url }}) | `learning` | [`schema:EducationalOccupationalCredential`](https://schema.org/EducationalOccupationalCredential) |
| [`robos:LearningModule`]({{ '/schemas/learning/learning-module.html' | relative_url }}) | `learning` | [`schema:CourseInstance`](https://schema.org/CourseInstance) |
| [`robos:LearningLesson`]({{ '/schemas/learning/learning-lesson.html' | relative_url }}) | `learning` | [`schema:LearningResource`](https://schema.org/LearningResource) |
| [`robos:HandsOnLab`]({{ '/schemas/learning/hands-on-lab.html' | relative_url }}) | `learning` | [`schema:ExercisePlan`](https://schema.org/ExercisePlan) |
| [`robos:QuizAssessment`]({{ '/schemas/learning/quiz-assessment.html' | relative_url }}) | `learning` | [`schema:Quiz`](https://schema.org/Quiz) |
| [`robos:AgentSkill`]({{ '/schemas/learning/agent-skill.html' | relative_url }}) | `learning` | [`schema:HowTo`](https://schema.org/HowTo) |
| [`robos:FlowDiagram`]({{ '/schemas/documentation/flow-diagram.html' | relative_url }}) | `documentation` | [`schema:ImageObject`](https://schema.org/ImageObject) |
| [`robos:Documentation`]({{ '/schemas/documentation/documentation.html' | relative_url }}) | `documentation` | [`schema:TechArticle`](https://schema.org/TechArticle) |
| [`robos:DocumentationPage`]({{ '/schemas/documentation/documentation-page.html' | relative_url }}) | `documentation` | [`schema:TechArticle`](https://schema.org/TechArticle) |
| [`robos:ArchitectureDecisionRecord`]({{ '/schemas/documentation/architecture-decision-record.html' | relative_url }}) | `documentation` | [`schema:TechArticle`](https://schema.org/TechArticle) |
| [`robos:InteractiveWalkthrough`]({{ '/schemas/documentation/interactive-walkthrough.html' | relative_url }}) | `documentation` | [`schema:Guide`](https://schema.org/Guide) |
| [`robos:CodeSnippet`]({{ '/schemas/documentation/code-snippet.html' | relative_url }}) | `documentation` | [`schema:SoftwareSourceCode`](https://schema.org/SoftwareSourceCode) |
| [`robos:DocSection`]({{ '/schemas/documentation/doc-section.html' | relative_url }}) | `documentation` | [`schema:Article`](https://schema.org/Article) |
| [`robos:ADROption`]({{ '/schemas/documentation/adr-option.html' | relative_url }}) | `documentation` | [`schema:ChooseAction`](https://schema.org/ChooseAction) |
| [`robos:Scenario`]({{ '/schemas/testing/scenario.html' | relative_url }}) | `testing` | [`schema:CheckAction`](https://schema.org/CheckAction) |
| [`robos:ScenarioStep`]({{ '/schemas/testing/scenario-step.html' | relative_url }}) | `testing` | [`schema:HowToStep`](https://schema.org/HowToStep) |
| [`robos:CRPGTestScenario`]({{ '/schemas/testing/crpg-test-scenario.html' | relative_url }}) | `testing` | [`schema:CheckAction`](https://schema.org/CheckAction) |
| [`robos:CRPGBattleMap`]({{ '/schemas/testing/crpg-battle-map.html' | relative_url }}) | `testing` | [`schema:Place`](https://schema.org/Place) |
| [`robos:CRPGMapObject`]({{ '/schemas/testing/crpg-map-object.html' | relative_url }}) | `testing` | [`schema:Place`](https://schema.org/Place) |
| [`robos:CRPGCombatant`]({{ '/schemas/testing/crpg-combatant.html' | relative_url }}) | `testing` | [`schema:Person`](https://schema.org/Person) |
| [`robos:InfinityAIDirective`]({{ '/schemas/testing/infinity-ai-directive.html' | relative_url }}) | `testing` | [`schema:ControlAction`](https://schema.org/ControlAction) |
| [`robos:CRPGPlayerInput`]({{ '/schemas/testing/crpg-player-input.html' | relative_url }}) | `testing` | [`schema:InteractAction`](https://schema.org/InteractAction) |
| [`robos:TabletopTestScenario`]({{ '/schemas/testing/tabletop-test-scenario.html' | relative_url }}) | `testing` | [`schema:CheckAction`](https://schema.org/CheckAction) |
| [`robos:GherkinFeature`]({{ '/schemas/testing/gherkin-feature.html' | relative_url }}) | `testing` | [`schema:DigitalDocument`](https://schema.org/DigitalDocument) |
| [`robos:GherkinBackground`]({{ '/schemas/testing/gherkin-background.html' | relative_url }}) | `testing` | [`schema:ItemList`](https://schema.org/ItemList) |
| [`robos:GherkinRule`]({{ '/schemas/testing/gherkin-rule.html' | relative_url }}) | `testing` | [`schema:DigitalDocument`](https://schema.org/DigitalDocument) |
| [`robos:ScenarioOutline`]({{ '/schemas/testing/scenario-outline.html' | relative_url }}) | `testing` | [`schema:CheckAction`](https://schema.org/CheckAction) |
| [`robos:ExamplesTable`]({{ '/schemas/testing/examples-table.html' | relative_url }}) | `testing` | [`schema:Table`](https://schema.org/Table) |
| [`robos:StepDefinition`]({{ '/schemas/testing/step-definition.html' | relative_url }}) | `testing` | [`schema:SoftwareSourceCode`](https://schema.org/SoftwareSourceCode) |
| [`robos:DataTable`]({{ '/schemas/testing/data-table.html' | relative_url }}) | `testing` | [`schema:Table`](https://schema.org/Table) |
| [`robos:DocString`]({{ '/schemas/testing/doc-string.html' | relative_url }}) | `testing` | [`schema:Text`](https://schema.org/Text) |
| [`robos:TestingLibrary`]({{ '/schemas/testing/testing-library.html' | relative_url }}) | `testing` | [`schema:SoftwareApplication`](https://schema.org/SoftwareApplication) |
| [`robos:TestPlan`]({{ '/schemas/testing/test-plan.html' | relative_url }}) | `testing` | [`schema:Plan`](https://schema.org/Plan) |
| [`robos:TestSuite`]({{ '/schemas/testing/test-suite.html' | relative_url }}) | `testing` | [`schema:ItemList`](https://schema.org/ItemList) |
| [`robos:TestExecutionRecord`]({{ '/schemas/testing/test-execution-record.html' | relative_url }}) | `testing` | [`schema:AssessAction`](https://schema.org/AssessAction) |
| [`robos:Game`]({{ '/schemas/game/game.html' | relative_url }}) | `game` | [`schema:Game`](https://schema.org/Game) |
| [`robos:GameClass`]({{ '/schemas/game/game-class.html' | relative_url }}) | `game` | [`schema:Role`](https://schema.org/Role) |
| [`robos:GameMonster`]({{ '/schemas/game/game-monster.html' | relative_url }}) | `game` | [`schema:Person`](https://schema.org/Person) |
| [`robos:GameItem`]({{ '/schemas/game/game-item.html' | relative_url }}) | `game` | [`schema:Product`](https://schema.org/Product) |
| [`robos:GameSpell`]({{ '/schemas/game/game-spell.html' | relative_url }}) | `game` | [`schema:Action`](https://schema.org/Action) |
| [`robos:CRPGAbility`]({{ '/schemas/crpg/crpg-ability.html' | relative_url }}) | `crpg` | [`schema:Action`](https://schema.org/Action) |
| [`robos:CRPGStoryFlow`]({{ '/schemas/crpg/crpg-story-flow.html' | relative_url }}) | `crpg` | [`schema:CreativeWork`](https://schema.org/CreativeWork) |
| [`robos:CRPGStoryNode`]({{ '/schemas/crpg/crpg-story-node.html' | relative_url }}) | `crpg` | - |
| [`robos:CRPGGameEvent`]({{ '/schemas/crpg/crpg-game-event.html' | relative_url }}) | `crpg` | [`schema:Event`](https://schema.org/Event) |
| [`robos:CRPGCampaign`]({{ '/schemas/crpg/crpg-campaign.html' | relative_url }}) | `crpg` | [`schema:CreativeWork`](https://schema.org/CreativeWork) |
| [`robos:CRPGMapTransition`]({{ '/schemas/crpg/crpg-map-transition.html' | relative_url }}) | `crpg` | [`schema:Place`](https://schema.org/Place) |
| [`robos:TabletopGame`]({{ '/schemas/tabletop-game/tabletop-game.html' | relative_url }}) | `tabletop-game` | [`schema:Game`](https://schema.org/Game) |
| [`robos:TabletopHero`]({{ '/schemas/tabletop-game/tabletop-hero.html' | relative_url }}) | `tabletop-game` | [`schema:Person`](https://schema.org/Person) |
| [`robos:TabletopMonster`]({{ '/schemas/tabletop-game/tabletop-monster.html' | relative_url }}) | `tabletop-game` | [`schema:Person`](https://schema.org/Person) |
| [`robos:TabletopSummon`]({{ '/schemas/tabletop-game/tabletop-summon.html' | relative_url }}) | `tabletop-game` | [`schema:Person`](https://schema.org/Person) |
| [`robos:TabletopQuestMap`]({{ '/schemas/tabletop-game/tabletop-quest-map.html' | relative_url }}) | `tabletop-game` | [`schema:Place`](https://schema.org/Place) |
| [`robos:TabletopMapConfiguration`]({{ '/schemas/tabletop-game/tabletop-map-configuration.html' | relative_url }}) | `tabletop-game` | [`schema:Place`](https://schema.org/Place) |
| [`robos:TabletopTurnDAG`]({{ '/schemas/tabletop-game/tabletop-turn-dag.html' | relative_url }}) | `tabletop-game` | [`schema:Action`](https://schema.org/Action) |
| [`robos:TabletopTurnStep`]({{ '/schemas/tabletop-game/tabletop-turn-step.html' | relative_url }}) | `tabletop-game` | [`schema:Action`](https://schema.org/Action) |
| [`robos:TabletopAIEngine`]({{ '/schemas/tabletop-game/tabletop-ai-engine.html' | relative_url }}) | `tabletop-game` | [`schema:SoftwareApplication`](https://schema.org/SoftwareApplication) |
| [`robos:TabletopAIDirective`]({{ '/schemas/tabletop-game/tabletop-ai-directive.html' | relative_url }}) | `tabletop-game` | [`schema:ControlAction`](https://schema.org/ControlAction) |
| [`robos:TabletopCombatant`]({{ '/schemas/tabletop-game/tabletop-combatant.html' | relative_url }}) | `tabletop-game` | [`schema:Person`](https://schema.org/Person) |
| [`robos:TabletopAICommand`]({{ '/schemas/tabletop-game/tabletop-ai-command.html' | relative_url }}) | `tabletop-game` | [`schema:InteractAction`](https://schema.org/InteractAction) |

## Check a node against a shape

Save one node as `node.json` in the repository root, for example the example from a class page. Then run:

```bash
node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); const r = new SHACLValidator().validate([require('./node.json')]); console.log(r.conforms, r.results)"
```

The command prints `true` and an empty list when the node meets every rule for its types. Otherwise it prints `false` and one entry per failed rule. The `kgraph validate` and `kgraph insert` commands run the same checks.

## Ontology file

[`ontology.jsonld`]({{ '/schemas/ontology.jsonld' | relative_url }}) lists classes with their Schema.org parent class and shape id. The same file is kept at `.robos/ontology.jsonld`. `node scripts/sync-classification-ontology.js` updates both; it stops with an error for any class that has no classification code. This generator does not touch the ontology, so the file can lag behind the shapes listed here.

## Regenerate these pages

This section and every page under it are generated. Do not edit them by hand. Change the generator, `packages/robos-graph/lib/schema-doc-generator.js`, or the shapes, then run:

```bash
node scripts/generate-kgraph-schema-docs.js
```
