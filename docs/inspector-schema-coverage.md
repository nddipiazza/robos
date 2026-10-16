---
title: Inspector schema coverage
layout: default
parent: Build on RobOS
nav_order: 8
---

# Inspector schema coverage
{: .no_toc }

The Knowledge Graph Explorer adds type-specific tabs to its object inspector, such as **Database** or **MCP Server**. This page explains when a tab appears, which types can get one, and how to find types that have none. It is for people who extend the Explorer or add new node types.
{: .fs-6 }

## When a tab appears

Tabs come from a catalog of property groups in [`packages/robos-graph/lib/inspector-groups.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-graph/lib/inspector-groups.js). A group has an id, a label, the types it applies to, the properties it displays, and the predicates of incoming references that count as children.

For a selected node, a group's tab is shown when both conditions hold:

1. One of the node's `@type` values is listed in the group's `types`, as an exact match.
2. The node has a recorded value for one of the group's properties, or another node points at it with one of the group's incoming predicates.

A title, a source path or other provenance alone never opens a type-specific tab. A node with no recorded domain data keeps the standard tabs: **Overview**, **Query & Paths** and **JSON-LD**, plus **Topology** and **Impact** when the node has relationships in the graph. Related objects are found through forward references and through the group's inverse predicates. The same target is listed once, with the original predicate and direction. A reference to a node that is not in the graph is shown as unavailable. Long lists load 40 cards at a time.

The inspector shows what the graph records. It does not connect to MCP servers, run tools, or infer health, ownership or test results.

## Groups

| Tab | Applies to |
|---|---|
| MCP Server | `robos:MCPServer`, `robos:ToolProvider` |
| Tool | `robos:MCPTool` |
| Resource | `robos:MCPResource` |
| Prompt | `robos:MCPPrompt` |
| Services | `robos:Microservice`, `robos:Application`, `robos:DesktopApp`, `robos:ConsoleApp`, `robos:MobileApp`, `robos:FrontEndApp`, `robos:PCGame`, `robos:MobileGame`, `robos:DataPipeline`, `robos:Library` |
| API & Contracts | `robos:Contract`, `robos:ProtobufContract`, `robos:GraphQLContract`, `robos:APIEndpoint`, `robos:GRPCContract`, `robos:GraphQLSchema`, `robos:APIOperation` |
| Application | `robos:Microservice`, `robos:Application`, `robos:DesktopApp`, `robos:ConsoleApp`, `robos:MobileApp`, `robos:FrontEndApp`, `robos:PCGame`, `robos:MobileGame`, `robos:DataPipeline`, `robos:Library` |
| Routes & Commands | `robos:Application`, `robos:FrontEndApp`, `robos:DesktopApp`, `robos:ConsoleApp`, `robos:MobileApp`, `robos:WebRoute`, `robos:CLICommand`, `robos:CLIFlag` |
| Database | `robos:Database`, `robos:NoSQLDatabase`, `robos:DataStore`, `robos:DatabaseSchema`, `robos:DatabaseTable`, `robos:DatabaseColumn`, `robos:DatabaseIndex`, `robos:NoSQLCollection`, `robos:RelationalDatabase`, `robos:CacheStore`, `robos:DocumentStore`, `robos:KeyValueStore` |
| Data Model | `robos:DataModel`, `robos:SchemaModel`, `robos:DomainEntity` |
| Messaging | `robos:MessageBroker`, `robos:BrokerDefinition`, `robos:MessageTopic`, `robos:ConsumerGroup`, `robos:DataPipeline`, `robos:EventBus`, `robos:MessageQueue`, `robos:EventTopic` |
| Deployment & Kubernetes | `robos:KubernetesCluster`, `robos:Environment`, `robos:EnvironmentProfile`, `robos:GitOpsDeployment`, `robos:KubernetesNamespace`, `robos:KubernetesDeployment`, `robos:KubernetesService`, `robos:KubernetesIngress`, `robos:K8sCluster`, `robos:DeploymentEnvironment`, `robos:ArgoCDApplication` |
| CI Pipeline | `robos:CICDPipeline`, `robos:PipelineStage`, `robos:PipelineJob`, `robos:PipelineStep`, `robos:Pipeline` |
| Source Control | `robos:GitProjectOrganization`, `robos:GitRepository`, `robos:GitBranch`, `robos:PullRequest`, `robos:GitCommit`, `robos:GitTag`, `robos:GitOrganization`, `robos:Repository`, `robos:MergeRequest`, `robos:CommitRef` |
| Work Items | `robos:Project`, `robos:Epic`, `robos:Feature`, `robos:UserStory`, `robos:Task`, `robos:Subtask`, `robos:Bug`, `robos:Sprint`, `robos:Milestone`, `robos:ProductFeature`, `robos:Story`, `oslc_cm:ChangeRequest`, `robos:WorkItem`, `robos:Defect`, `oslc_cm:Defect` |
| Organization | `robos:Team`, `robos:GitProjectOrganization`, `robos:TaskServer`, `robos:Project`, `robos:GitOrganization` |
| Testing | `robos:TestingLibrary`, `robos:TestPlan`, `robos:TestSuite`, `robos:TestExecutionRecord`, `oslc_qm:TestCase`, `robos:TestFramework`, `oslc_qm:TestPlan`, `oslc_qm:TestSuite`, `oslc_qm:TestExecutionRecord` |
| BDD | `oslc_rm:Requirement`, `robos:Feature`, `robos:GherkinFeature`, `robos:GherkinBackground`, `robos:GherkinRule`, `robos:Scenario`, `robos:ScenarioStep`, `robos:ScenarioOutline`, `robos:ExamplesTable`, `robos:StepDefinition`, `robos:DataTable`, `robos:DocString`, `robos:ProductFeature`, `robos:BDDFeature`, `robos:Background`, `robos:Rule` |
| Learning | `robos:ELearning`, `robos:CertificateOfCompletion`, `robos:LearningModule`, `robos:LearningLesson`, `robos:HandsOnLab`, `robos:QuizAssessment`, `robos:CurriculumDefinition` |
| Content & Structure | `robos:FlowDiagram`, `robos:DocumentationPage`, `robos:InteractiveWalkthrough`, `robos:CodeSnippet`, `robos:DocSection`, `robos:DocArticle`, `robos:CodeSample` |
| Agent & Skills | `robos:AgentPersona`, `robos:AgentSkill`, `robos:PromptStrategy`, `robos:AIAgent`, `robos:PromptOptimizer`, `robos:PromptCompiler`, `robos:AIPromptTechnique` |
| Build & Remote Execution | `robos:BuildSystem`, `robos:RemoteExecutionCluster`, `robos:RemoteBuildCluster`, `robos:MonorepoBuild` |
| Configuration | `robos:ContextSource`, `robos:EnvironmentProfile`, `robos:SourceArtifact` |
| Source Declaration | `robos:SourceArtifact` |
| Decisions | `robos:ArchitectureDecisionRecord`, `robos:ADR`, `robos:ADROption` |

The catalog also lists each group's displayed properties. Read the source file for those.

## Find types without a tab

Some types have no group, so selecting one of their nodes shows only the standard tabs. List the types that appear in a shape but in no group:

```bash
node -e "
const { GROUPS } = require('./packages/robos-graph/lib/inspector-groups');
const { BUILTIN_SHACL_SHAPES } = require('./packages/robos-graph/lib/shacl-validator');
for (const s of BUILTIN_SHACL_SHAPES)
  for (const t of new Set([s.targetClass, ...(s.targetClasses || [])]))
    if (!GROUPS.some(g => g.types.includes(t))) console.log(t);
"
```

At the time of writing the list includes `robos:SearchIndex`, `robos:SearchCluster`, `robos:Documentation`, the comment and discussion classes (`robos:Comment`, `robos:DiscussionThread`, `robos:ReviewComment`, `robos:CommentAttachment`), `robos:VoiceCommand`, and the cRPG, game and tabletop classes (`robos:CRPG*`, `robos:Game*`, `robos:Tabletop*`).

## Add or change a group

Edit the `GROUPS` array in `inspector-groups.js`. Use exact compact type names such as `robos:MCPServer`, and only properties and predicates that exist in a shape or in `packages/robos-graph/lib/relationships.js`. Then run the catalog tests from the repository root:

```bash
npm --prefix packages/robos-test run test:inspector
```

`tests/sdlc-graph/inspector-groups.test.js` checks that every target class and alias of every shape appears in some group, and that every domain property of a shape is covered. That check currently fails for the types listed above. `npm --prefix packages/robos-test run test:inspector:e2e` runs the Electron tests for the inspector. They need Electron and a display.

## MCP schema fields

For MCP servers, tools, resources and prompts the graph can record the protocol fields. `robos:inputSchema`, `robos:outputSchema`, `robos:annotations`, `robos:toolAnnotations`, `robos:parameters` and `robos:arguments` are stored as JSON-LD `@json` literals, so nested keys, arrays and booleans survive. A server can reference resources and prompts through `robos:resourcesProvided` and `robos:promptsProvided`. `robos:registrationCondition` and `robos:availabilityStatus` are metadata recorded in the graph, not live checks. The field definitions follow the [MCP schema reference](https://modelcontextprotocol.io/specification/2025-11-25/schema).

See also the [inspector audit](https://github.com/nddipiazza/robos/blob/main/packages/robos-graph/INSPECTOR.md) for the tabs that were removed because they showed demo data.
