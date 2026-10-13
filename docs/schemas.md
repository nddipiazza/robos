---
title: Schemas
layout: default
parent: Build on RobOS
nav_order: 2
has_children: true
permalink: /schemas.html
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

## Packages and classes

One row per package, with the classes it documents. Class names drop the `robos:` prefix. Open a class for its property rules, the Schema.org type and standard it follows, and an example node.

<div class="rb-classlist">
  <div class="rb-classlist-label">Standard packages</div>
  <div class="rb-classlist-row">
    <div class="rb-classlist-pkg"><a href="{{ '/schemas/core-platform.html' | relative_url }}">Core Platform</a><code>robos.platform</code><span>23 classes</span></div>
    <div class="rb-classlist-body">
      <p class="rb-classlist-desc">Databases, message brokers, search indexes, MCP servers, build systems, context sources, prompt strategies and source declarations.</p>
      <p class="rb-classlist-chips"><a href="{{ '/schemas/core-platform/broker-definition.html' | relative_url }}" title="robos:BrokerDefinition">BrokerDefinition</a> <a href="{{ '/schemas/core-platform/build-system.html' | relative_url }}" title="robos:BuildSystem">BuildSystem</a> <a href="{{ '/schemas/core-platform/consumer-group.html' | relative_url }}" title="robos:ConsumerGroup">ConsumerGroup</a> <a href="{{ '/schemas/core-platform/context-source.html' | relative_url }}" title="robos:ContextSource">ContextSource</a> <a href="{{ '/schemas/core-platform/curriculum-definition.html' | relative_url }}" title="robos:CurriculumDefinition">CurriculumDefinition</a> <a href="{{ '/schemas/core-platform/database.html' | relative_url }}" title="robos:Database">Database</a> <a href="{{ '/schemas/core-platform/database-column.html' | relative_url }}" title="robos:DatabaseColumn">DatabaseColumn</a> <a href="{{ '/schemas/core-platform/database-index.html' | relative_url }}" title="robos:DatabaseIndex">DatabaseIndex</a> <a href="{{ '/schemas/core-platform/database-schema.html' | relative_url }}" title="robos:DatabaseSchema">DatabaseSchema</a> <a href="{{ '/schemas/core-platform/database-table.html' | relative_url }}" title="robos:DatabaseTable">DatabaseTable</a> <a href="{{ '/schemas/core-platform/data-store.html' | relative_url }}" title="robos:DataStore">DataStore</a> <a href="{{ '/schemas/core-platform/mcp-prompt.html' | relative_url }}" title="robos:MCPPrompt">MCPPrompt</a> <a href="{{ '/schemas/core-platform/mcp-resource.html' | relative_url }}" title="robos:MCPResource">MCPResource</a> <a href="{{ '/schemas/core-platform/mcp-server.html' | relative_url }}" title="robos:MCPServer">MCPServer</a> <a href="{{ '/schemas/core-platform/mcp-tool.html' | relative_url }}" title="robos:MCPTool">MCPTool</a> <a href="{{ '/schemas/core-platform/message-broker.html' | relative_url }}" title="robos:MessageBroker">MessageBroker</a> <a href="{{ '/schemas/core-platform/message-topic.html' | relative_url }}" title="robos:MessageTopic">MessageTopic</a> <a href="{{ '/schemas/core-platform/nosql-collection.html' | relative_url }}" title="robos:NoSQLCollection">NoSQLCollection</a> <a href="{{ '/schemas/core-platform/nosql-database.html' | relative_url }}" title="robos:NoSQLDatabase">NoSQLDatabase</a> <a href="{{ '/schemas/core-platform/prompt-strategy.html' | relative_url }}" title="robos:PromptStrategy">PromptStrategy</a> <a href="{{ '/schemas/core-platform/search-cluster.html' | relative_url }}" title="robos:SearchCluster">SearchCluster</a> <a href="{{ '/schemas/core-platform/search-index.html' | relative_url }}" title="robos:SearchIndex">SearchIndex</a> <a href="{{ '/schemas/core-platform/source-artifact.html' | relative_url }}" title="robos:SourceArtifact">SourceArtifact</a></p>
    </div>
  </div>
  <div class="rb-classlist-row">
    <div class="rb-classlist-pkg"><a href="{{ '/schemas/organization.html' | relative_url }}">Organization &amp; Teams</a><code>robos.org</code><span>21 classes</span></div>
    <div class="rb-classlist-body">
      <p class="rb-classlist-desc">Teams, projects and work items, Git organizations, repositories, branches, pull requests and commits, agent personas, task servers and review comments.</p>
      <p class="rb-classlist-chips"><a href="{{ '/schemas/organization/agent-persona.html' | relative_url }}" title="robos:AgentPersona">AgentPersona</a> <a href="{{ '/schemas/organization/bug.html' | relative_url }}" title="robos:Bug">Bug</a> <a href="{{ '/schemas/organization/comment.html' | relative_url }}" title="robos:Comment">Comment</a> <a href="{{ '/schemas/organization/comment-attachment.html' | relative_url }}" title="robos:CommentAttachment">CommentAttachment</a> <a href="{{ '/schemas/organization/discussion-thread.html' | relative_url }}" title="robos:DiscussionThread">DiscussionThread</a> <a href="{{ '/schemas/organization/epic.html' | relative_url }}" title="robos:Epic">Epic</a> <a href="{{ '/schemas/organization/git-branch.html' | relative_url }}" title="robos:GitBranch">GitBranch</a> <a href="{{ '/schemas/organization/git-commit.html' | relative_url }}" title="robos:GitCommit">GitCommit</a> <a href="{{ '/schemas/organization/git-project-organization.html' | relative_url }}" title="robos:GitProjectOrganization">GitProjectOrganization</a> <a href="{{ '/schemas/organization/git-repository.html' | relative_url }}" title="robos:GitRepository">GitRepository</a> <a href="{{ '/schemas/organization/git-tag.html' | relative_url }}" title="robos:GitTag">GitTag</a> <a href="{{ '/schemas/organization/milestone.html' | relative_url }}" title="robos:Milestone">Milestone</a> <a href="{{ '/schemas/organization/project.html' | relative_url }}" title="robos:Project">Project</a> <a href="{{ '/schemas/organization/pull-request.html' | relative_url }}" title="robos:PullRequest">PullRequest</a> <a href="{{ '/schemas/organization/review-comment.html' | relative_url }}" title="robos:ReviewComment">ReviewComment</a> <a href="{{ '/schemas/organization/sprint.html' | relative_url }}" title="robos:Sprint">Sprint</a> <a href="{{ '/schemas/organization/subtask.html' | relative_url }}" title="robos:Subtask">Subtask</a> <a href="{{ '/schemas/organization/task.html' | relative_url }}" title="robos:Task">Task</a> <a href="{{ '/schemas/organization/task-server.html' | relative_url }}" title="robos:TaskServer">TaskServer</a> <a href="{{ '/schemas/organization/team.html' | relative_url }}" title="robos:Team">Team</a> <a href="{{ '/schemas/organization/user-story.html' | relative_url }}" title="robos:UserStory">UserStory</a></p>
    </div>
  </div>
  <div class="rb-classlist-row">
    <div class="rb-classlist-pkg"><a href="{{ '/schemas/services.html' | relative_url }}">Services &amp; Contracts</a><code>robos.services</code><span>8 classes</span></div>
    <div class="rb-classlist-body">
      <p class="rb-classlist-desc">Microservices, API contracts (OpenAPI, Protobuf, GraphQL), endpoints, data models, requirements and features.</p>
      <p class="rb-classlist-chips"><a href="{{ '/schemas/services/requirement.html' | relative_url }}" title="oslc_rm:Requirement">oslc_rm:Requirement</a> <a href="{{ '/schemas/services/api-endpoint.html' | relative_url }}" title="robos:APIEndpoint">APIEndpoint</a> <a href="{{ '/schemas/services/contract.html' | relative_url }}" title="robos:Contract">Contract</a> <a href="{{ '/schemas/services/data-model.html' | relative_url }}" title="robos:DataModel">DataModel</a> <a href="{{ '/schemas/services/feature.html' | relative_url }}" title="robos:Feature">Feature</a> <a href="{{ '/schemas/services/graphql-contract.html' | relative_url }}" title="robos:GraphQLContract">GraphQLContract</a> <a href="{{ '/schemas/services/microservice.html' | relative_url }}" title="robos:Microservice">Microservice</a> <a href="{{ '/schemas/services/protobuf-contract.html' | relative_url }}" title="robos:ProtobufContract">ProtobufContract</a></p>
    </div>
  </div>
  <div class="rb-classlist-row">
    <div class="rb-classlist-pkg"><a href="{{ '/schemas/applications.html' | relative_url }}">Applications</a><code>robos.apps</code><span>11 classes</span></div>
    <div class="rb-classlist-body">
      <p class="rb-classlist-desc">Front-end, desktop, console and mobile applications, games, libraries, web routes, CLI commands and voice commands.</p>
      <p class="rb-classlist-chips"><a href="{{ '/schemas/applications/cli-command.html' | relative_url }}" title="robos:CLICommand">CLICommand</a> <a href="{{ '/schemas/applications/cli-flag.html' | relative_url }}" title="robos:CLIFlag">CLIFlag</a> <a href="{{ '/schemas/applications/console-app.html' | relative_url }}" title="robos:ConsoleApp">ConsoleApp</a> <a href="{{ '/schemas/applications/desktop-app.html' | relative_url }}" title="robos:DesktopApp">DesktopApp</a> <a href="{{ '/schemas/applications/front-end-app.html' | relative_url }}" title="robos:FrontEndApp">FrontEndApp</a> <a href="{{ '/schemas/applications/library.html' | relative_url }}" title="robos:Library">Library</a> <a href="{{ '/schemas/applications/mobile-app.html' | relative_url }}" title="robos:MobileApp">MobileApp</a> <a href="{{ '/schemas/applications/mobile-game.html' | relative_url }}" title="robos:MobileGame">MobileGame</a> <a href="{{ '/schemas/applications/pc-game.html' | relative_url }}" title="robos:PCGame">PCGame</a> <a href="{{ '/schemas/applications/voice-command.html' | relative_url }}" title="robos:VoiceCommand">VoiceCommand</a> <a href="{{ '/schemas/applications/web-route.html' | relative_url }}" title="robos:WebRoute">WebRoute</a></p>
    </div>
  </div>
  <div class="rb-classlist-row">
    <div class="rb-classlist-pkg"><a href="{{ '/schemas/devops.html' | relative_url }}">DevOps &amp; Cloud</a><code>robos.devops</code><span>14 classes</span></div>
    <div class="rb-classlist-body">
      <p class="rb-classlist-desc">Kubernetes clusters, environments, GitOps deployments, CI/CD pipelines, remote-execution clusters and data pipelines.</p>
      <p class="rb-classlist-chips"><a href="{{ '/schemas/devops/cicd-pipeline.html' | relative_url }}" title="robos:CICDPipeline">CICDPipeline</a> <a href="{{ '/schemas/devops/data-pipeline.html' | relative_url }}" title="robos:DataPipeline">DataPipeline</a> <a href="{{ '/schemas/devops/environment.html' | relative_url }}" title="robos:Environment">Environment</a> <a href="{{ '/schemas/devops/environment-profile.html' | relative_url }}" title="robos:EnvironmentProfile">EnvironmentProfile</a> <a href="{{ '/schemas/devops/gitops-deployment.html' | relative_url }}" title="robos:GitOpsDeployment">GitOpsDeployment</a> <a href="{{ '/schemas/devops/kubernetes-cluster.html' | relative_url }}" title="robos:KubernetesCluster">KubernetesCluster</a> <a href="{{ '/schemas/devops/kubernetes-deployment.html' | relative_url }}" title="robos:KubernetesDeployment">KubernetesDeployment</a> <a href="{{ '/schemas/devops/kubernetes-ingress.html' | relative_url }}" title="robos:KubernetesIngress">KubernetesIngress</a> <a href="{{ '/schemas/devops/kubernetes-namespace.html' | relative_url }}" title="robos:KubernetesNamespace">KubernetesNamespace</a> <a href="{{ '/schemas/devops/kubernetes-service.html' | relative_url }}" title="robos:KubernetesService">KubernetesService</a> <a href="{{ '/schemas/devops/pipeline-job.html' | relative_url }}" title="robos:PipelineJob">PipelineJob</a> <a href="{{ '/schemas/devops/pipeline-stage.html' | relative_url }}" title="robos:PipelineStage">PipelineStage</a> <a href="{{ '/schemas/devops/pipeline-step.html' | relative_url }}" title="robos:PipelineStep">PipelineStep</a> <a href="{{ '/schemas/devops/remote-execution-cluster.html' | relative_url }}" title="robos:RemoteExecutionCluster">RemoteExecutionCluster</a></p>
    </div>
  </div>
  <div class="rb-classlist-row">
    <div class="rb-classlist-pkg"><a href="{{ '/schemas/learning.html' | relative_url }}">eLearning</a><code>robos.learning</code><span>7 classes</span></div>
    <div class="rb-classlist-body">
      <p class="rb-classlist-desc">eLearning courses, modules, lessons, labs, quizzes, completion certificates and agent skills.</p>
      <p class="rb-classlist-chips"><a href="{{ '/schemas/learning/agent-skill.html' | relative_url }}" title="robos:AgentSkill">AgentSkill</a> <a href="{{ '/schemas/learning/certificate-of-completion.html' | relative_url }}" title="robos:CertificateOfCompletion">CertificateOfCompletion</a> <a href="{{ '/schemas/learning/elearning.html' | relative_url }}" title="robos:ELearning">ELearning</a> <a href="{{ '/schemas/learning/hands-on-lab.html' | relative_url }}" title="robos:HandsOnLab">HandsOnLab</a> <a href="{{ '/schemas/learning/learning-lesson.html' | relative_url }}" title="robos:LearningLesson">LearningLesson</a> <a href="{{ '/schemas/learning/learning-module.html' | relative_url }}" title="robos:LearningModule">LearningModule</a> <a href="{{ '/schemas/learning/quiz-assessment.html' | relative_url }}" title="robos:QuizAssessment">QuizAssessment</a></p>
    </div>
  </div>
  <div class="rb-classlist-row">
    <div class="rb-classlist-pkg"><a href="{{ '/schemas/documentation.html' | relative_url }}">Documentation &amp; Diagrams</a><code>robos.docs</code><span>8 classes</span></div>
    <div class="rb-classlist-body">
      <p class="rb-classlist-desc">Documentation pages, architecture decision records, flow diagrams, walkthroughs and code snippets.</p>
      <p class="rb-classlist-chips"><a href="{{ '/schemas/documentation/adr-option.html' | relative_url }}" title="robos:ADROption">ADROption</a> <a href="{{ '/schemas/documentation/architecture-decision-record.html' | relative_url }}" title="robos:ArchitectureDecisionRecord">ArchitectureDecisionRecord</a> <a href="{{ '/schemas/documentation/code-snippet.html' | relative_url }}" title="robos:CodeSnippet">CodeSnippet</a> <a href="{{ '/schemas/documentation/doc-section.html' | relative_url }}" title="robos:DocSection">DocSection</a> <a href="{{ '/schemas/documentation/documentation.html' | relative_url }}" title="robos:Documentation">Documentation</a> <a href="{{ '/schemas/documentation/documentation-page.html' | relative_url }}" title="robos:DocumentationPage">DocumentationPage</a> <a href="{{ '/schemas/documentation/flow-diagram.html' | relative_url }}" title="robos:FlowDiagram">FlowDiagram</a> <a href="{{ '/schemas/documentation/interactive-walkthrough.html' | relative_url }}" title="robos:InteractiveWalkthrough">InteractiveWalkthrough</a></p>
    </div>
  </div>
  <div class="rb-classlist-row">
    <div class="rb-classlist-pkg"><a href="{{ '/schemas/testing.html' | relative_url }}">Testing &amp; BDD</a><code>robos.testing</code><span>21 classes</span></div>
    <div class="rb-classlist-body">
      <p class="rb-classlist-desc">Gherkin features, scenarios, step definitions, test plans, suites, execution records, testing libraries and game test scenarios.</p>
      <p class="rb-classlist-chips"><a href="{{ '/schemas/testing/crpg-battle-map.html' | relative_url }}" title="robos:CRPGBattleMap">CRPGBattleMap</a> <a href="{{ '/schemas/testing/crpg-combatant.html' | relative_url }}" title="robos:CRPGCombatant">CRPGCombatant</a> <a href="{{ '/schemas/testing/crpg-map-object.html' | relative_url }}" title="robos:CRPGMapObject">CRPGMapObject</a> <a href="{{ '/schemas/testing/crpg-player-input.html' | relative_url }}" title="robos:CRPGPlayerInput">CRPGPlayerInput</a> <a href="{{ '/schemas/testing/crpg-test-scenario.html' | relative_url }}" title="robos:CRPGTestScenario">CRPGTestScenario</a> <a href="{{ '/schemas/testing/data-table.html' | relative_url }}" title="robos:DataTable">DataTable</a> <a href="{{ '/schemas/testing/doc-string.html' | relative_url }}" title="robos:DocString">DocString</a> <a href="{{ '/schemas/testing/examples-table.html' | relative_url }}" title="robos:ExamplesTable">ExamplesTable</a> <a href="{{ '/schemas/testing/gherkin-background.html' | relative_url }}" title="robos:GherkinBackground">GherkinBackground</a> <a href="{{ '/schemas/testing/gherkin-feature.html' | relative_url }}" title="robos:GherkinFeature">GherkinFeature</a> <a href="{{ '/schemas/testing/gherkin-rule.html' | relative_url }}" title="robos:GherkinRule">GherkinRule</a> <a href="{{ '/schemas/testing/infinity-ai-directive.html' | relative_url }}" title="robos:InfinityAIDirective">InfinityAIDirective</a> <a href="{{ '/schemas/testing/scenario.html' | relative_url }}" title="robos:Scenario">Scenario</a> <a href="{{ '/schemas/testing/scenario-outline.html' | relative_url }}" title="robos:ScenarioOutline">ScenarioOutline</a> <a href="{{ '/schemas/testing/scenario-step.html' | relative_url }}" title="robos:ScenarioStep">ScenarioStep</a> <a href="{{ '/schemas/testing/step-definition.html' | relative_url }}" title="robos:StepDefinition">StepDefinition</a> <a href="{{ '/schemas/testing/tabletop-test-scenario.html' | relative_url }}" title="robos:TabletopTestScenario">TabletopTestScenario</a> <a href="{{ '/schemas/testing/test-execution-record.html' | relative_url }}" title="robos:TestExecutionRecord">TestExecutionRecord</a> <a href="{{ '/schemas/testing/testing-library.html' | relative_url }}" title="robos:TestingLibrary">TestingLibrary</a> <a href="{{ '/schemas/testing/test-plan.html' | relative_url }}" title="robos:TestPlan">TestPlan</a> <a href="{{ '/schemas/testing/test-suite.html' | relative_url }}" title="robos:TestSuite">TestSuite</a></p>
    </div>
  </div>
  <div class="rb-classlist-label">Games</div>
  <div class="rb-classlist-row">
    <div class="rb-classlist-pkg"><a href="{{ '/schemas/game.html' | relative_url }}">Games: Rules</a><code>robos.game</code><span>5 classes</span></div>
    <div class="rb-classlist-body">
      <p class="rb-classlist-desc">Rules-engine building blocks shared by games: games, classes, items, spells and monsters.</p>
      <p class="rb-classlist-chips"><a href="{{ '/schemas/game/game.html' | relative_url }}" title="robos:Game">Game</a> <a href="{{ '/schemas/game/game-class.html' | relative_url }}" title="robos:GameClass">GameClass</a> <a href="{{ '/schemas/game/game-item.html' | relative_url }}" title="robos:GameItem">GameItem</a> <a href="{{ '/schemas/game/game-monster.html' | relative_url }}" title="robos:GameMonster">GameMonster</a> <a href="{{ '/schemas/game/game-spell.html' | relative_url }}" title="robos:GameSpell">GameSpell</a></p>
    </div>
  </div>
  <div class="rb-classlist-row">
    <div class="rb-classlist-pkg"><a href="{{ '/schemas/crpg.html' | relative_url }}">Games: cRPG</a><code>robos.crpg</code><span>6 classes</span></div>
    <div class="rb-classlist-body">
      <p class="rb-classlist-desc">Party-based tactical cRPG content: abilities, campaigns, map transitions, game events and story flows.</p>
      <p class="rb-classlist-chips"><a href="{{ '/schemas/crpg/crpg-ability.html' | relative_url }}" title="robos:CRPGAbility">CRPGAbility</a> <a href="{{ '/schemas/crpg/crpg-campaign.html' | relative_url }}" title="robos:CRPGCampaign">CRPGCampaign</a> <a href="{{ '/schemas/crpg/crpg-game-event.html' | relative_url }}" title="robos:CRPGGameEvent">CRPGGameEvent</a> <a href="{{ '/schemas/crpg/crpg-map-transition.html' | relative_url }}" title="robos:CRPGMapTransition">CRPGMapTransition</a> <a href="{{ '/schemas/crpg/crpg-story-flow.html' | relative_url }}" title="robos:CRPGStoryFlow">CRPGStoryFlow</a> <a href="{{ '/schemas/crpg/crpg-story-node.html' | relative_url }}" title="robos:CRPGStoryNode">CRPGStoryNode</a></p>
    </div>
  </div>
  <div class="rb-classlist-row">
    <div class="rb-classlist-pkg"><a href="{{ '/schemas/tabletop-game.html' | relative_url }}">Games: Tabletop</a><code>robos.tabletop</code><span>12 classes</span></div>
    <div class="rb-classlist-body">
      <p class="rb-classlist-desc">Tabletop dungeon-crawler content: heroes, monsters, summons, quest maps, turn steps and AI directives.</p>
      <p class="rb-classlist-chips"><a href="{{ '/schemas/tabletop-game/tabletop-ai-command.html' | relative_url }}" title="robos:TabletopAICommand">TabletopAICommand</a> <a href="{{ '/schemas/tabletop-game/tabletop-ai-directive.html' | relative_url }}" title="robos:TabletopAIDirective">TabletopAIDirective</a> <a href="{{ '/schemas/tabletop-game/tabletop-ai-engine.html' | relative_url }}" title="robos:TabletopAIEngine">TabletopAIEngine</a> <a href="{{ '/schemas/tabletop-game/tabletop-combatant.html' | relative_url }}" title="robos:TabletopCombatant">TabletopCombatant</a> <a href="{{ '/schemas/tabletop-game/tabletop-game.html' | relative_url }}" title="robos:TabletopGame">TabletopGame</a> <a href="{{ '/schemas/tabletop-game/tabletop-hero.html' | relative_url }}" title="robos:TabletopHero">TabletopHero</a> <a href="{{ '/schemas/tabletop-game/tabletop-map-configuration.html' | relative_url }}" title="robos:TabletopMapConfiguration">TabletopMapConfiguration</a> <a href="{{ '/schemas/tabletop-game/tabletop-monster.html' | relative_url }}" title="robos:TabletopMonster">TabletopMonster</a> <a href="{{ '/schemas/tabletop-game/tabletop-quest-map.html' | relative_url }}" title="robos:TabletopQuestMap">TabletopQuestMap</a> <a href="{{ '/schemas/tabletop-game/tabletop-summon.html' | relative_url }}" title="robos:TabletopSummon">TabletopSummon</a> <a href="{{ '/schemas/tabletop-game/tabletop-turn-dag.html' | relative_url }}" title="robos:TabletopTurnDAG">TabletopTurnDAG</a> <a href="{{ '/schemas/tabletop-game/tabletop-turn-step.html' | relative_url }}" title="robos:TabletopTurnStep">TabletopTurnStep</a></p>
    </div>
  </div>
  <div class="rb-classlist-row">
    <div class="rb-classlist-pkg"><a href="{{ '/knowledge-graph.html#game-packages' | relative_url }}">Games: Infinity Engine</a><code>robos.infinity</code><span>no classes</span></div>
    <div class="rb-classlist-body">
      <p class="rb-classlist-desc">No classes of its own. Architecture notes on GemRB, the open-source Infinity Engine that the cRPG follows: engine subsystems, file-format contracts and decision records, typed with classes documented in other packages.</p>
    </div>
  </div>
</div>

## Game packages

Games are modeled in four packages. `game` holds what every game shares: rulesets (D&D 5e SRD, HeroQuest, D20), dice systems, classes, items and spells. `crpg` holds the content of the Realm of Heroes cRPG and `tabletop-game` the HeroQuest-style tabletop game. Their nodes carry the generic `robos:Game*` type next to their own, so a `robos:CRPGItem` is also a `robos:GameItem` and a query for the generic type finds items from both games.

Some game classes are documented with the package they serve instead of under Games: [`PCGame`]({{ '/schemas/applications/pc-game.html' | relative_url }}), [`MobileGame`]({{ '/schemas/applications/mobile-game.html' | relative_url }}) under [Applications]({{ '/schemas/applications.html' | relative_url }}); [`CRPGTestScenario`]({{ '/schemas/testing/crpg-test-scenario.html' | relative_url }}), [`CRPGBattleMap`]({{ '/schemas/testing/crpg-battle-map.html' | relative_url }}), [`CRPGMapObject`]({{ '/schemas/testing/crpg-map-object.html' | relative_url }}), [`CRPGCombatant`]({{ '/schemas/testing/crpg-combatant.html' | relative_url }}), [`InfinityAIDirective`]({{ '/schemas/testing/infinity-ai-directive.html' | relative_url }}), [`CRPGPlayerInput`]({{ '/schemas/testing/crpg-player-input.html' | relative_url }}), [`TabletopTestScenario`]({{ '/schemas/testing/tabletop-test-scenario.html' | relative_url }}) under [Testing & BDD]({{ '/schemas/testing.html' | relative_url }}).

`infinity-engine` describes the engine the cRPG follows. It defines no classes, so it has no page group here. The Realm of Heroes node links to it with `robos:engineArchitecture`, and its own nodes use C4 components plus classes documented under [Services & Contracts]({{ '/schemas/services.html' | relative_url }}) and [Documentation & Diagrams]({{ '/schemas/documentation.html' | relative_url }}). [Knowledge graph]({{ site.baseurl }}{% link knowledge-graph.md %}#game-packages) shows how the four packages connect, and [Game development]({{ site.baseurl }}{% link game-development.md %}) covers the games themselves.

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
