# Schema-aware inspector coverage

The Knowledge Graph Explorer maps all 98 built-in SHACL shapes and 141 target types/aliases into 25 contextual property groups. Exact type eligibility and recorded domain data are both required. Empty objects and title/provenance-only records stay in the standard inspector.

## Property groups

| Tab | Applicable types | Recorded property groups |
| --- | --- | --- |
| MCP Server | `robos:MCPServer`, `robos:ToolProvider` | `robos:transport`, `robos:toolsProvided`, `robos:resourcesProvided`, `robos:promptsProvided`, `robos:endpoint`, `robos:tools`, `robos:registrationCondition`, `robos:availabilityStatus`, `robos:runtimePrerequisites`, `robos:uses` |
| Tool | `robos:MCPTool` | `robos:toolName`, `robos:mcpServer`, `robos:toolOfServer`, `robos:parameters`, `robos:inputSchema`, `robos:outputSchema`, `robos:annotations`, `robos:registrationCondition`, `robos:availabilityStatus`, `robos:runtimePrerequisites`, `robos:uses`, `robos:toolAnnotations` |
| Resource | `robos:MCPResource` | `robos:uriTemplate`, `robos:mcpServer`, `robos:resourceOfServer`, `robos:uri`, `robos:mimeType`, `robos:annotations`, `robos:registrationCondition`, `robos:availabilityStatus`, `robos:runtimePrerequisites`, `robos:uses` |
| Prompt | `robos:MCPPrompt` | `robos:promptName`, `robos:mcpServer`, `robos:promptOfServer`, `robos:arguments`, `robos:registrationCondition`, `robos:availabilityStatus`, `robos:runtimePrerequisites`, `robos:uses` |
| Services | `robos:Microservice`, `robos:Application`, `robos:DesktopApp`, `robos:ConsoleApp`, `robos:MobileApp`, `robos:FrontEndApp`, `robos:PCGame`, `robos:MobileGame`, `robos:DataPipeline`, `robos:Library` | `robos:service`, `robos:targetService`, `robos:boundServices`, `robos:implementsContract`, `robos:consumesContract`, `robos:usesDatabase`, `robos:usesMessageBroker`, `robos:usesMCPServer`, `robos:provides`, `robos:uses`, `robos:calls`, `robos:readsFrom`, `robos:writesTo`, `robos:publishesTo`, `robos:subscribesTo`, `robos:dependsOn`, `robos:hosts`, `robos:implementedBy`, `robos:stateScope`, `robos:runs` |
| API & Contracts | `robos:Contract`, `robos:ProtobufContract`, `robos:GraphQLContract`, `robos:APIEndpoint`, `robos:GRPCContract`, `robos:GraphQLSchema`, `robos:APIOperation` | `robos:specFile`, `robos:protocol`, `robos:packageName`, `robos:rpcMethods`, `robos:schemaType`, `robos:pathPattern`, `robos:httpMethod`, `robos:contractYaml`, `robos:service`, `robos:parameters`, `robos:inputType`, `robos:outputType` |
| Application | `robos:Microservice`, `robos:Application`, `robos:DesktopApp`, `robos:ConsoleApp`, `robos:MobileApp`, `robos:FrontEndApp`, `robos:PCGame`, `robos:MobileGame`, `robos:DataPipeline`, `robos:Library` | `robos:ownerTeam`, `robos:technology`, `robos:desktopFramework`, `robos:cliCommand`, `robos:platform`, `robos:pipelineEngine`, `robos:frontendFramework`, `robos:gameEngine`, `robos:targetPlatform`, `robos:executableName`, `robos:appVersion`, `robos:appName`, `robos:buildCommand` |
| Routes & Commands | `robos:Application`, `robos:FrontEndApp`, `robos:DesktopApp`, `robos:ConsoleApp`, `robos:MobileApp`, `robos:WebRoute`, `robos:CLICommand`, `robos:CLIFlag` | `robos:routePath`, `robos:cliCommand`, `robos:commandName`, `robos:flagName`, `robos:app`, `robos:command`, `robos:uses`, `robos:renders` |
| Database | `robos:Database`, `robos:NoSQLDatabase`, `robos:DataStore`, `robos:DatabaseSchema`, `robos:DatabaseTable`, `robos:DatabaseColumn`, `robos:DatabaseIndex`, `robos:NoSQLCollection`, `robos:RelationalDatabase`, `robos:CacheStore`, `robos:DocumentStore`, `robos:KeyValueStore` | `robos:engine`, `robos:databaseName`, `robos:host`, `robos:schemaName`, `robos:database`, `robos:tableName`, `robos:columnName`, `robos:dataType`, `robos:table`, `robos:indexName`, `robos:collectionName`, `robos:port`, `robos:tlsEnabled`, `robos:schemas`, `robos:tables`, `robos:collections`, `robos:boundServices` |
| Data Model | `robos:DataModel`, `robos:SchemaModel`, `robos:DomainEntity` | `robos:modelName`, `robos:definedInContract`, `robos:fieldType`, `robos:referencesModel`, `robos:modelKind`, `robos:relatesTo`, `robos:inputType`, `robos:outputType` |
| Messaging | `robos:MessageBroker`, `robos:BrokerDefinition`, `robos:MessageTopic`, `robos:ConsumerGroup`, `robos:DataPipeline`, `robos:EventBus`, `robos:MessageQueue`, `robos:EventTopic` | `robos:technology`, `robos:pipelineEngine`, `robos:brokerType`, `robos:endpoint`, `robos:topicName`, `robos:broker`, `robos:groupId`, `robos:topic`, `robos:topics`, `robos:publishesTo`, `robos:subscribesTo`, `robos:consumesFrom`, `robos:deadLettersTo`, `robos:writesTo`, `robos:writesModel`, `robos:uses` |
| Deployment & Kubernetes | `robos:KubernetesCluster`, `robos:Environment`, `robos:EnvironmentProfile`, `robos:GitOpsDeployment`, `robos:KubernetesNamespace`, `robos:KubernetesDeployment`, `robos:KubernetesService`, `robos:KubernetesIngress`, `robos:K8sCluster`, `robos:DeploymentEnvironment`, `robos:ArgoCDApplication` | `robos:provider`, `robos:apiEndpoint`, `robos:clusterContext`, `robos:environmentType`, `robos:tier`, `robos:gitopsEngine`, `robos:sourceRepo`, `robos:targetCluster`, `robos:targetNamespace`, `robos:namespaceName`, `robos:cluster`, `robos:namespace`, `robos:image`, `robos:serviceName`, `robos:serviceType`, `robos:ingressName`, `robos:host`, `robos:inEnvironment`, `robos:deployedTo`, `robos:replicas`, `robos:ports`, `robos:resources`, `robos:securityContext` |
| CI Pipeline | `robos:CICDPipeline`, `robos:PipelineStage`, `robos:PipelineJob`, `robos:PipelineStep`, `robos:Pipeline` | `robos:platform`, `robos:workflowFile`, `robos:stageName`, `robos:pipeline`, `robos:jobName`, `robos:stage`, `robos:stepName`, `robos:job`, `robos:hasPipeline`, `robos:steps`, `robos:validates`, `robos:hasConfiguration`, `robos:publishes`, `robos:stateScope`, `robos:dependsOn` |
| Source Control | `robos:GitProjectOrganization`, `robos:GitRepository`, `robos:GitBranch`, `robos:PullRequest`, `robos:GitCommit`, `robos:GitTag`, `robos:GitOrganization`, `robos:Repository`, `robos:MergeRequest`, `robos:CommitRef` | `robos:url`, `robos:orgName`, `robos:forgeType`, `robos:defaultBranch`, `robos:branchName`, `robos:prNumber`, `robos:sourceBranch`, `robos:targetBranch`, `robos:status`, `robos:commitSha`, `robos:tagName`, `robos:inOrganization`, `robos:inRepository`, `robos:repository`, `robos:hasRepository`, `robos:author`, `robos:revision`, `robos:currentBranch`, `robos:branchMetadataStatus` |
| Work Items | `robos:Project`, `robos:Epic`, `robos:Feature`, `robos:UserStory`, `robos:Task`, `robos:Subtask`, `robos:Bug`, `robos:Sprint`, `robos:Milestone`, `robos:ProductFeature`, `robos:Story`, `oslc_cm:ChangeRequest`, `robos:WorkItem`, `robos:Defect`, `oslc_cm:Defect` | `robos:status`, `robos:parentTask`, `robos:severity`, `robos:startDate`, `robos:endDate`, `robos:targetDate`, `robos:inProject`, `robos:inEpic`, `robos:inFeature`, `robos:inStory`, `robos:inSprint`, `robos:parentWorkItem`, `robos:hasEpic`, `robos:hasFeature`, `robos:hasTask`, `robos:acceptanceCriteria`, `robos:priority`, `robos:storyPoints`, `robos:assignedDeveloper`, `robos:assignedTeam` |
| Organization | `robos:Team`, `robos:GitProjectOrganization`, `robos:TaskServer`, `robos:Project`, `robos:GitOrganization` | `robos:status`, `robos:url`, `robos:orgName`, `robos:forgeType`, `robos:serverType`, `robos:memberCount`, `robos:assignedTeam`, `robos:ownerTeam`, `robos:hasProject`, `robos:agentRules`, `robos:documentation` |
| Testing | `robos:TestingLibrary`, `robos:TestPlan`, `robos:TestSuite`, `robos:TestExecutionRecord`, `oslc_qm:TestCase`, `robos:TestFramework`, `oslc_qm:TestPlan`, `oslc_qm:TestSuite`, `oslc_qm:TestExecutionRecord` | `robos:testingType`, `robos:language`, `robos:testFramework`, `oslc_qm:executionStatus`, `oslc_qm:reportsOnTestCase`, `robos:testsService`, `robos:verifiedByTest`, `oslc_qm:validatedBy`, `robos:targets`, `robos:stateScope` |
| BDD | `oslc_rm:Requirement`, `robos:Feature`, `robos:GherkinFeature`, `robos:GherkinBackground`, `robos:GherkinRule`, `robos:Scenario`, `robos:ScenarioStep`, `robos:ScenarioOutline`, `robos:ExamplesTable`, `robos:StepDefinition`, `robos:DataTable`, `robos:DocString`, `robos:ProductFeature`, `robos:BDDFeature`, `robos:Background`, `robos:Rule` | `robos:featureFile`, `robos:steps`, `robos:keyword`, `robos:stepText`, `robos:inFeature`, `robos:examplesTable`, `robos:tableHeaders`, `robos:tableRows`, `robos:regexPattern`, `robos:codeFile`, `robos:step`, `robos:content`, `robos:scenarios`, `robos:requirementId`, `robos:narrative`, `robos:tags`, `robos:stepCount`, `robos:testsService`, `robos:targetService` |
| Learning | `robos:ELearning`, `robos:CertificateOfCompletion`, `robos:LearningModule`, `robos:LearningLesson`, `robos:HandsOnLab`, `robos:QuizAssessment`, `robos:CurriculumDefinition` | `robos:topic`, `robos:modules`, `robos:gitopsFile`, `robos:recipientUser`, `robos:forCourse`, `robos:issueDate`, `robos:scorePercentage`, `robos:course`, `robos:module`, `robos:labFile`, `robos:lessons`, `robos:difficulty`, `robos:targetAudience`, `robos:estimatedDuration`, `robos:teachesService`, `robos:teachesContract`, `robos:teachesApplication`, `robos:teaches`, `robos:usesSkill` |
| Content & Structure | `robos:FlowDiagram`, `robos:DocumentationPage`, `robos:InteractiveWalkthrough`, `robos:CodeSnippet`, `robos:DocSection`, `robos:DocArticle`, `robos:CodeSample` | `robos:mermaidText`, `robos:tooltip`, `robos:targetApp`, `robos:language`, `robos:code`, `robos:sectionId`, `robos:docPage`, `robos:diagramType` |
| Agent & Skills | `robos:AgentPersona`, `robos:AgentSkill`, `robos:PromptStrategy`, `robos:AIAgent`, `robos:PromptOptimizer`, `robos:PromptCompiler`, `robos:AIPromptTechnique` | `robos:role`, `robos:systemPrompt`, `robos:strategyType`, `robos:engine`, `robos:skillName`, `robos:agentRules`, `robos:usesSkill`, `robos:developmentGuidance`, `robos:model`, `robos:parameters` |
| Build & Remote Execution | `robos:BuildSystem`, `robos:RemoteExecutionCluster`, `robos:RemoteBuildCluster`, `robos:MonorepoBuild` | `robos:protocol`, `robos:provider`, `robos:executionEndpoint`, `robos:casEndpoint`, `robos:buildTool`, `robos:configFile`, `robos:actionCacheEndpoint`, `robos:assetEndpoint`, `robos:browserEndpoint`, `robos:instanceName`, `robos:defaultExecProperties`, `robos:workerPools`, `robos:hasRemoteExecution` |
| Configuration | `robos:ContextSource`, `robos:EnvironmentProfile`, `robos:SourceArtifact` | `robos:sourceType`, `robos:location`, `robos:configFile`, `robos:hasConfiguration`, `robos:configures`, `robos:forEnvironment`, `robos:configurationKind`, `robos:authenticationBoundary`, `robos:routesTo`, `robos:sendsBuildEventsTo`, `robos:sendsCompletedActionsTo`, `robos:executesOn`, `robos:stateScope` |
| Source Declaration | `robos:SourceArtifact` | `robos:sourceKind`, `robos:imports`, `robos:exports`, `robos:definesModel`, `robos:definedInContract`, `robos:inputType`, `robos:outputType`, `robos:declaredName`, `robos:version`, `robos:targets`, `robos:dependsOn`, `robos:currentBranch`, `robos:branchMetadataStatus` |
| Decisions | `robos:ArchitectureDecisionRecord`, `robos:ADR`, `robos:ADROption` | `robos:status`, `robos:context`, `robos:decision`, `robos:consequences`, `robos:adrNumber`, `robos:adr`, `robos:supersededBy` |

## Built-in type audit

Each row is an executable shape. Aliases share its applicable groups. The unit suite checks both target coverage and every domain constraint property.

| Schema type | Aliases | Eligible groups |
| --- | --- | --- |
| `robos:Microservice` | — | Services, Application |
| `robos:Contract` | — | API & Contracts |
| `oslc_rm:Requirement` | — | BDD |
| `robos:Team` | — | Organization |
| `robos:Project` | — | Work Items, Organization |
| `robos:Epic` | — | Work Items |
| `robos:ELearning` | — | Learning |
| `robos:CertificateOfCompletion` | — | Learning |
| `robos:DesktopApp` | — | Services, Application, Routes & Commands |
| `robos:ConsoleApp` | — | Services, Application, Routes & Commands |
| `robos:MobileApp` | — | Services, Application, Routes & Commands |
| `robos:DataPipeline` | — | Services, Application, Messaging |
| `robos:Library` | — | Services, Application |
| `robos:FrontEndApp` | — | Services, Application, Routes & Commands |
| `robos:PCGame` | — | Services, Application |
| `robos:MobileGame` | — | Services, Application |
| `robos:GitProjectOrganization` | `robos:GitOrganization` | Source Control, Organization |
| `robos:RemoteExecutionCluster` | `robos:RemoteBuildCluster` | Build & Remote Execution |
| `robos:BuildSystem` | `robos:MonorepoBuild` | Build & Remote Execution |
| `robos:FlowDiagram` | — | Content & Structure |
| `robos:DocumentationPage` | `robos:DocArticle` | Content & Structure |
| `robos:ArchitectureDecisionRecord` | `robos:ADR` | Decisions |
| `robos:InteractiveWalkthrough` | — | Content & Structure |
| `robos:CodeSnippet` | `robos:CodeSample` | Content & Structure |
| `robos:Database` | `robos:RelationalDatabase` | Database |
| `robos:NoSQLDatabase` | `robos:CacheStore`, `robos:DocumentStore`, `robos:KeyValueStore` | Database |
| `robos:MessageBroker` | `robos:EventBus` | Messaging |
| `robos:MCPServer` | `robos:ToolProvider` | MCP Server |
| `robos:AgentPersona` | `robos:AIAgent` | Agent & Skills |
| `robos:KubernetesCluster` | `robos:K8sCluster` | Deployment & Kubernetes |
| `robos:Environment` | `robos:DeploymentEnvironment` | Deployment & Kubernetes |
| `robos:GitOpsDeployment` | `robos:ArgoCDApplication` | Deployment & Kubernetes |
| `robos:ProtobufContract` | `robos:GRPCContract` | API & Contracts |
| `robos:GraphQLContract` | `robos:GraphQLSchema` | API & Contracts |
| `robos:CICDPipeline` | `robos:Pipeline` | CI Pipeline |
| `robos:TaskServer` | — | Organization |
| `robos:ContextSource` | — | Configuration |
| `robos:PromptStrategy` | `robos:PromptOptimizer`, `robos:PromptCompiler`, `robos:AIPromptTechnique` | Agent & Skills |
| `robos:Feature` | `robos:ProductFeature` | Work Items, BDD |
| `robos:UserStory` | `robos:Story` | Work Items |
| `robos:Task` | `oslc_cm:ChangeRequest`, `robos:WorkItem` | Work Items |
| `robos:Subtask` | — | Work Items |
| `robos:Bug` | `robos:Defect`, `oslc_cm:Defect` | Work Items |
| `robos:Sprint` | — | Work Items |
| `robos:Milestone` | — | Work Items |
| `robos:GitRepository` | `robos:Repository` | Source Control |
| `robos:GitBranch` | — | Source Control |
| `robos:PullRequest` | `robos:MergeRequest` | Source Control |
| `robos:GitCommit` | `robos:CommitRef` | Source Control |
| `robos:GitTag` | — | Source Control |
| `robos:APIEndpoint` | `robos:APIOperation` | API & Contracts |
| `robos:DataModel` | `robos:SchemaModel`, `robos:DomainEntity` | Data Model |
| `robos:DatabaseSchema` | — | Database |
| `robos:DatabaseTable` | — | Database |
| `robos:DatabaseColumn` | — | Database |
| `robos:DatabaseIndex` | — | Database |
| `robos:NoSQLCollection` | — | Database |
| `robos:MessageTopic` | `robos:MessageQueue`, `robos:EventTopic` | Messaging |
| `robos:ConsumerGroup` | — | Messaging |
| `robos:MCPTool` | — | Tool |
| `robos:MCPResource` | — | Resource |
| `robos:MCPPrompt` | — | Prompt |
| `robos:KubernetesNamespace` | — | Deployment & Kubernetes |
| `robos:KubernetesDeployment` | — | Deployment & Kubernetes |
| `robos:KubernetesService` | — | Deployment & Kubernetes |
| `robos:KubernetesIngress` | — | Deployment & Kubernetes |
| `robos:PipelineStage` | — | CI Pipeline |
| `robos:PipelineJob` | — | CI Pipeline |
| `robos:PipelineStep` | — | CI Pipeline |
| `robos:LearningModule` | — | Learning |
| `robos:LearningLesson` | — | Learning |
| `robos:HandsOnLab` | — | Learning |
| `robos:QuizAssessment` | — | Learning |
| `robos:DocSection` | — | Content & Structure |
| `robos:ADROption` | — | Decisions |
| `robos:Scenario` | — | BDD |
| `robos:ScenarioStep` | — | BDD |
| `robos:WebRoute` | — | Routes & Commands |
| `robos:CLICommand` | — | Routes & Commands |
| `robos:CLIFlag` | — | Routes & Commands |
| `robos:GherkinFeature` | `robos:BDDFeature` | BDD |
| `robos:GherkinBackground` | `robos:Background` | BDD |
| `robos:GherkinRule` | `robos:Rule` | BDD |
| `robos:ScenarioOutline` | — | BDD |
| `robos:ExamplesTable` | — | BDD |
| `robos:StepDefinition` | — | BDD |
| `robos:DataTable` | — | BDD |
| `robos:DocString` | — | BDD |
| `robos:TestingLibrary` | `robos:TestFramework` | Testing |
| `robos:TestPlan` | `oslc_qm:TestPlan` | Testing |
| `robos:TestSuite` | `oslc_qm:TestSuite` | Testing |
| `robos:TestExecutionRecord` | `oslc_qm:TestExecutionRecord` | Testing |
| `robos:CurriculumDefinition` | — | Learning |
| `robos:DataStore` | — | Database |
| `robos:BrokerDefinition` | — | Messaging |
| `robos:EnvironmentProfile` | — | Deployment & Kubernetes, Configuration |
| `robos:SourceArtifact` | — | Configuration, Source Declaration |
| `robos:AgentSkill` | — | Agent & Skills |

## Context and evidence

Child objects are resolved through both forward references and exact inverse predicates. MCP inventories group tools, resources, and prompts by their actual child types; a shared `mcpServer` predicate never turns a resource into a tool. A target linked in both directions appears once, preserving the original predicates and directions. Unknown references are labeled unavailable. No live service health, test outcome, input schema, or tool execution is inferred.

Documentation paths and content use the existing Documentation tab. Content & Structure covers recorded code, diagrams, walkthrough records and section structure; Decisions covers ADR context/options/outcomes. Neither creates demo content or a fabricated video.

## MCP schema additions

Optional `inputSchema`, `outputSchema`, `annotations`, `toolAnnotations`, and `parameters` describe tools; `arguments` describes prompts; `uri`/`mimeType` describe resources. Servers can reference `resourcesProvided` and `promptsProvided`, and may expose resources/prompts without tools. Structured fields are JSON-LD `@json` literals to preserve nested keys, arrays, and booleans. Inventory references are non-dependency relationships. The existing legacy tool-name list remains literal-compatible.

Protocol field definitions follow the [MCP schema reference](https://modelcontextprotocol.io/specification/2025-11-25/schema). Availability and registration conditions are recorded graph metadata, not claims about a live server.

## Verification

- `npm --prefix packages/robos-test run test:inspector`: type/property audit, sparse-data eligibility, inverse references, schema validation and JSON-LD context coverage.
- `npm --prefix packages/robos-test run test:inspector:e2e`: real Electron navigation, rendered declarations, evidence links, safe text, paging, contextual fallback and resizable sidebar.
- `npm --prefix packages/robos-test run test:kgraph-workspace:e2e`: workspace import/review, companion apps, classification, topology and inspector regressions.

The executable catalog is [inspector-groups.js](../packages/robos-graph/lib/inspector-groups.js); see the [inspector guide](../packages/robos-graph/INSPECTOR.md) for usage.
