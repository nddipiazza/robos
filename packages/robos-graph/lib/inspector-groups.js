(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RobosInspectorGroups = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  // Declarative catalog: eligibility requires an exact compact type AND a recorded
  // trigger property or incoming child reference. Consumers normalize IRIs and resolve IDs.
  // Optional triggerProperties narrows visibility only; properties still defines displayed
  // fields. Engines use triggerProperties || properties, OR a qualifying incoming link.
  // Incoming predicates preserve source -> selected-node direction, whether
  // containment or usage. Grouping never reclassifies a link as a dependency.
  // No title/sourcePath/evidence-only domain tabs.
  // Evidence: shacl-validator.js + source-shapes.js (fields and type aliases),
  // graph-store.js (registration fields/getChildNodes), relationships.js, and
  // AGENTS.md Child Schema Elements (legacy inverse names). resourceOfServer and
  // promptOfServer are explicitly requested compatibility aliases; current stores
  // use mcpServer. They do not imply that any such edge exists in an input graph.
  // MCP payload fields follow the 2025-11-25 schema (Tool, Resource, Prompt):
  // https://modelcontextprotocol.io/specification/2025-11-25/schema
  // registrationCondition/availabilityStatus are recorded RobOS metadata, not
  // MCP protocol fields or live availability checks. Description is rendered by
  // the parent view independently and intentionally is not a group trigger.
  // Document paths/slug/body belong to the standard Documentation view; only
  // recorded structure/code/diagram metadata or decision fields create groups.
  const GROUPS = [
    {
      "id": "mcp-server",
      "label": "MCP Server",
      "types": [
        "robos:MCPServer",
        "robos:ToolProvider"
      ],
      "properties": [
        "robos:transport",
        "robos:toolsProvided",
        "robos:resourcesProvided",
        "robos:promptsProvided",
        "robos:endpoint",
        "robos:tools",
        "robos:registrationCondition",
        "robos:availabilityStatus",
        "robos:runtimePrerequisites",
        "robos:uses"
      ],
      "incoming": [
        "robos:mcpServer",
        "robos:toolOfServer",
        "robos:resourceOfServer",
        "robos:promptOfServer"
      ]
    },
    {
      "id": "mcp-tool",
      "label": "Tool",
      "types": [
        "robos:MCPTool"
      ],
      "properties": [
        "robos:toolName",
        "robos:mcpServer",
        "robos:toolOfServer",
        "robos:parameters",
        "robos:inputSchema",
        "robos:outputSchema",
        "robos:annotations",
        "robos:registrationCondition",
        "robos:availabilityStatus",
        "robos:runtimePrerequisites",
        "robos:uses",
        "robos:toolAnnotations"
      ],
      "incoming": []
    },
    {
      "id": "mcp-resource",
      "label": "Resource",
      "types": [
        "robos:MCPResource"
      ],
      "properties": [
        "robos:uriTemplate",
        "robos:mcpServer",
        "robos:resourceOfServer",
        "robos:uri",
        "robos:mimeType",
        "robos:annotations",
        "robos:registrationCondition",
        "robos:availabilityStatus",
        "robos:runtimePrerequisites",
        "robos:uses"
      ],
      "incoming": []
    },
    {
      "id": "mcp-prompt",
      "label": "Prompt",
      "types": [
        "robos:MCPPrompt"
      ],
      "properties": [
        "robos:promptName",
        "robos:mcpServer",
        "robos:promptOfServer",
        "robos:arguments",
        "robos:registrationCondition",
        "robos:availabilityStatus",
        "robos:runtimePrerequisites",
        "robos:uses"
      ],
      "incoming": []
    },
    {
      "id": "services",
      "label": "Services",
      "types": [
        "robos:Microservice",
        "robos:Application",
        "robos:DesktopApp",
        "robos:ConsoleApp",
        "robos:MobileApp",
        "robos:FrontEndApp",
        "robos:PCGame",
        "robos:MobileGame",
        "robos:DataPipeline",
        "robos:Library"
      ],
      "properties": [
        "robos:service",
        "robos:targetService",
        "robos:boundServices",
        "robos:implementsContract",
        "robos:consumesContract",
        "robos:usesDatabase",
        "robos:usesMessageBroker",
        "robos:usesMCPServer",
        "robos:provides",
        "robos:uses",
        "robos:calls",
        "robos:readsFrom",
        "robos:writesTo",
        "robos:publishesTo",
        "robos:subscribesTo",
        "robos:dependsOn",
        "robos:hosts",
        "robos:implementedBy",
        "robos:stateScope",
        "robos:runs"
      ],
      "incoming": [
        "robos:service",
        "robos:endpointOf"
      ]
    },
    {
      "id": "contracts",
      "label": "API & Contracts",
      "types": [
        "robos:Contract",
        "robos:ProtobufContract",
        "robos:GraphQLContract",
        "robos:APIEndpoint",
        "robos:GRPCContract",
        "robos:GraphQLSchema",
        "robos:APIOperation"
      ],
      "properties": [
        "robos:specFile",
        "robos:protocol",
        "robos:packageName",
        "robos:rpcMethods",
        "robos:schemaType",
        "robos:pathPattern",
        "robos:httpMethod",
        "robos:contractYaml",
        "robos:service",
        "robos:parameters",
        "robos:inputType",
        "robos:outputType"
      ],
      "incoming": [
        "robos:definedInContract",
        "robos:service",
        "robos:endpointOf"
      ]
    },
    {
      "id": "application",
      "label": "Application",
      "types": [
        "robos:Microservice",
        "robos:Application",
        "robos:DesktopApp",
        "robos:ConsoleApp",
        "robos:MobileApp",
        "robos:FrontEndApp",
        "robos:PCGame",
        "robos:MobileGame",
        "robos:DataPipeline",
        "robos:Library"
      ],
      "properties": [
        "robos:ownerTeam",
        "robos:technology",
        "robos:desktopFramework",
        "robos:cliCommand",
        "robos:platform",
        "robos:pipelineEngine",
        "robos:frontendFramework",
        "robos:gameEngine",
        "robos:targetPlatform",
        "robos:executableName",
        "robos:appVersion",
        "robos:appName",
        "robos:buildCommand"
      ],
      "incoming": [],
      "triggerProperties": [
        "robos:technology",
        "robos:desktopFramework",
        "robos:cliCommand",
        "robos:platform",
        "robos:pipelineEngine",
        "robos:frontendFramework",
        "robos:gameEngine",
        "robos:targetPlatform",
        "robos:executableName",
        "robos:appVersion",
        "robos:appName",
        "robos:buildCommand"
      ]
    },
    {
      "id": "routes-cli",
      "label": "Routes & Commands",
      "types": [
        "robos:Application",
        "robos:FrontEndApp",
        "robos:DesktopApp",
        "robos:ConsoleApp",
        "robos:MobileApp",
        "robos:WebRoute",
        "robos:CLICommand",
        "robos:CLIFlag"
      ],
      "properties": [
        "robos:routePath",
        "robos:cliCommand",
        "robos:commandName",
        "robos:flagName",
        "robos:app",
        "robos:command",
        "robos:uses",
        "robos:renders"
      ],
      "incoming": [
        "robos:app",
        "robos:command"
      ]
    },
    {
      "id": "database",
      "label": "Database",
      "types": [
        "robos:Database",
        "robos:NoSQLDatabase",
        "robos:DataStore",
        "robos:DatabaseSchema",
        "robos:DatabaseTable",
        "robos:DatabaseColumn",
        "robos:DatabaseIndex",
        "robos:NoSQLCollection",
        "robos:RelationalDatabase",
        "robos:CacheStore",
        "robos:DocumentStore",
        "robos:KeyValueStore"
      ],
      "properties": [
        "robos:engine",
        "robos:databaseName",
        "robos:host",
        "robos:schemaName",
        "robos:database",
        "robos:tableName",
        "robos:columnName",
        "robos:dataType",
        "robos:table",
        "robos:indexName",
        "robos:collectionName",
        "robos:port",
        "robos:tlsEnabled",
        "robos:schemas",
        "robos:tables",
        "robos:collections",
        "robos:boundServices"
      ],
      "incoming": [
        "robos:database",
        "robos:table",
        "robos:schemaOf",
        "robos:tableOfSchema",
        "robos:columnOfTable",
        "robos:indexOfTable",
        "robos:collectionOfDatabase"
      ]
    },
    {
      "id": "data-model",
      "label": "Data Model",
      "types": [
        "robos:DataModel",
        "robos:SchemaModel",
        "robos:DomainEntity"
      ],
      "properties": [
        "robos:modelName",
        "robos:definedInContract",
        "robos:fieldType",
        "robos:referencesModel",
        "robos:modelKind",
        "robos:relatesTo",
        "robos:inputType",
        "robos:outputType"
      ],
      "incoming": []
    },
    {
      "id": "messaging",
      "label": "Messaging",
      "types": [
        "robos:MessageBroker",
        "robos:BrokerDefinition",
        "robos:MessageTopic",
        "robos:ConsumerGroup",
        "robos:DataPipeline",
        "robos:EventBus",
        "robos:MessageQueue",
        "robos:EventTopic"
      ],
      "properties": [
        "robos:technology",
        "robos:pipelineEngine",
        "robos:brokerType",
        "robos:endpoint",
        "robos:topicName",
        "robos:broker",
        "robos:groupId",
        "robos:topic",
        "robos:topics",
        "robos:publishesTo",
        "robos:subscribesTo",
        "robos:consumesFrom",
        "robos:deadLettersTo",
        "robos:writesTo",
        "robos:writesModel",
        "robos:uses"
      ],
      "incoming": [
        "robos:broker",
        "robos:topic",
        "robos:topicOfBroker",
        "robos:subscribesTo"
      ],
      "triggerProperties": [
        "robos:brokerType",
        "robos:endpoint",
        "robos:topicName",
        "robos:broker",
        "robos:groupId",
        "robos:topic",
        "robos:topics",
        "robos:publishesTo",
        "robos:subscribesTo",
        "robos:consumesFrom",
        "robos:deadLettersTo",
        "robos:writesTo",
        "robos:writesModel",
        "robos:uses"
      ]
    },
    {
      "id": "deployment",
      "label": "Deployment & Kubernetes",
      "types": [
        "robos:KubernetesCluster",
        "robos:Environment",
        "robos:EnvironmentProfile",
        "robos:GitOpsDeployment",
        "robos:KubernetesNamespace",
        "robos:KubernetesDeployment",
        "robos:KubernetesService",
        "robos:KubernetesIngress",
        "robos:K8sCluster",
        "robos:DeploymentEnvironment",
        "robos:ArgoCDApplication"
      ],
      "properties": [
        "robos:provider",
        "robos:apiEndpoint",
        "robos:clusterContext",
        "robos:environmentType",
        "robos:tier",
        "robos:gitopsEngine",
        "robos:sourceRepo",
        "robos:targetCluster",
        "robos:targetNamespace",
        "robos:namespaceName",
        "robos:cluster",
        "robos:namespace",
        "robos:image",
        "robos:serviceName",
        "robos:serviceType",
        "robos:ingressName",
        "robos:host",
        "robos:inEnvironment",
        "robos:deployedTo",
        "robos:replicas",
        "robos:ports",
        "robos:resources",
        "robos:securityContext"
      ],
      "incoming": [
        "robos:cluster",
        "robos:namespace",
        "robos:inNamespace",
        "robos:namespaceOfCluster",
        "robos:targetCluster",
        "robos:inEnvironment"
      ],
      "triggerProperties": [
        "robos:provider",
        "robos:apiEndpoint",
        "robos:clusterContext",
        "robos:environmentType",
        "robos:tier",
        "robos:gitopsEngine",
        "robos:sourceRepo",
        "robos:targetCluster",
        "robos:targetNamespace",
        "robos:namespaceName",
        "robos:cluster",
        "robos:image",
        "robos:serviceName",
        "robos:serviceType",
        "robos:ingressName",
        "robos:host",
        "robos:inEnvironment",
        "robos:deployedTo",
        "robos:replicas",
        "robos:ports",
        "robos:resources",
        "robos:securityContext"
      ]
    },
    {
      "id": "pipeline",
      "label": "CI Pipeline",
      "types": [
        "robos:CICDPipeline",
        "robos:PipelineStage",
        "robos:PipelineJob",
        "robos:PipelineStep",
        "robos:Pipeline"
      ],
      "properties": [
        "robos:platform",
        "robos:workflowFile",
        "robos:stageName",
        "robos:pipeline",
        "robos:jobName",
        "robos:stage",
        "robos:stepName",
        "robos:job",
        "robos:hasPipeline",
        "robos:steps",
        "robos:validates",
        "robos:hasConfiguration",
        "robos:publishes",
        "robos:stateScope",
        "robos:dependsOn"
      ],
      "incoming": [
        "robos:pipeline",
        "robos:stage",
        "robos:job",
        "robos:stageOfPipeline"
      ]
    },
    {
      "id": "source-control",
      "label": "Source Control",
      "types": [
        "robos:GitProjectOrganization",
        "robos:GitRepository",
        "robos:GitBranch",
        "robos:PullRequest",
        "robos:GitCommit",
        "robos:GitTag",
        "robos:GitOrganization",
        "robos:Repository",
        "robos:MergeRequest",
        "robos:CommitRef"
      ],
      "properties": [
        "robos:url",
        "robos:orgName",
        "robos:forgeType",
        "robos:defaultBranch",
        "robos:branchName",
        "robos:prNumber",
        "robos:sourceBranch",
        "robos:targetBranch",
        "robos:status",
        "robos:commitSha",
        "robos:tagName",
        "robos:inOrganization",
        "robos:inRepository",
        "robos:repository",
        "robos:hasRepository",
        "robos:author",
        "robos:revision",
        "robos:currentBranch",
        "robos:branchMetadataStatus"
      ],
      "incoming": [
        "robos:inOrganization",
        "robos:inRepository",
        "robos:repository"
      ],
      "triggerProperties": [
        "robos:url",
        "robos:orgName",
        "robos:forgeType",
        "robos:defaultBranch",
        "robos:branchName",
        "robos:prNumber",
        "robos:sourceBranch",
        "robos:targetBranch",
        "robos:status",
        "robos:commitSha",
        "robos:tagName",
        "robos:inOrganization",
        "robos:hasRepository",
        "robos:author",
        "robos:revision",
        "robos:currentBranch",
        "robos:branchMetadataStatus"
      ]
    },
    {
      "id": "work-items",
      "label": "Work Items",
      "types": [
        "robos:Project",
        "robos:Epic",
        "robos:Feature",
        "robos:UserStory",
        "robos:Task",
        "robos:Subtask",
        "robos:Bug",
        "robos:Sprint",
        "robos:Milestone",
        "robos:ProductFeature",
        "robos:Story",
        "oslc_cm:ChangeRequest",
        "robos:WorkItem",
        "robos:Defect",
        "oslc_cm:Defect"
      ],
      "properties": [
        "robos:status",
        "robos:parentTask",
        "robos:severity",
        "robos:startDate",
        "robos:endDate",
        "robos:targetDate",
        "robos:inProject",
        "robos:inEpic",
        "robos:inFeature",
        "robos:inStory",
        "robos:inSprint",
        "robos:parentWorkItem",
        "robos:hasEpic",
        "robos:hasFeature",
        "robos:hasTask",
        "robos:acceptanceCriteria",
        "robos:priority",
        "robos:storyPoints",
        "robos:assignedDeveloper",
        "robos:assignedTeam"
      ],
      "incoming": [
        "robos:inProject",
        "robos:inEpic",
        "robos:inFeature",
        "robos:inStory",
        "robos:inSprint",
        "robos:parentTask",
        "robos:parentWorkItem"
      ]
    },
    {
      "id": "organization",
      "label": "Organization",
      "types": [
        "robos:Team",
        "robos:GitProjectOrganization",
        "robos:TaskServer",
        "robos:Project",
        "robos:GitOrganization"
      ],
      "properties": [
        "robos:status",
        "robos:url",
        "robos:orgName",
        "robos:forgeType",
        "robos:serverType",
        "robos:memberCount",
        "robos:assignedTeam",
        "robos:ownerTeam",
        "robos:hasProject",
        "robos:agentRules",
        "robos:documentation"
      ],
      "incoming": [
        "robos:ownerTeam",
        "robos:assignedTeam",
        "robos:inOrganization"
      ],
      "triggerProperties": [
        "robos:url",
        "robos:orgName",
        "robos:forgeType",
        "robos:serverType",
        "robos:memberCount",
        "robos:hasProject",
        "robos:agentRules",
        "robos:documentation"
      ]
    },
    {
      "id": "testing",
      "label": "Testing",
      "types": [
        "robos:TestingLibrary",
        "robos:TestPlan",
        "robos:TestSuite",
        "robos:TestExecutionRecord",
        "oslc_qm:TestCase",
        "robos:TestFramework",
        "oslc_qm:TestPlan",
        "oslc_qm:TestSuite",
        "oslc_qm:TestExecutionRecord"
      ],
      "properties": [
        "robos:testingType",
        "robos:language",
        "robos:testFramework",
        "oslc_qm:executionStatus",
        "oslc_qm:reportsOnTestCase",
        "robos:testsService",
        "robos:verifiedByTest",
        "oslc_qm:validatedBy",
        "robos:targets",
        "robos:stateScope"
      ],
      "incoming": [
        "oslc_qm:reportsOnTestCase"
      ]
    },
    {
      "id": "bdd",
      "label": "BDD",
      "types": [
        "oslc_rm:Requirement",
        "robos:Feature",
        "robos:GherkinFeature",
        "robos:GherkinBackground",
        "robos:GherkinRule",
        "robos:Scenario",
        "robos:ScenarioStep",
        "robos:ScenarioOutline",
        "robos:ExamplesTable",
        "robos:StepDefinition",
        "robos:DataTable",
        "robos:DocString",
        "robos:ProductFeature",
        "robos:BDDFeature",
        "robos:Background",
        "robos:Rule"
      ],
      "properties": [
        "robos:featureFile",
        "robos:steps",
        "robos:keyword",
        "robos:stepText",
        "robos:inFeature",
        "robos:examplesTable",
        "robos:tableHeaders",
        "robos:tableRows",
        "robos:regexPattern",
        "robos:codeFile",
        "robos:step",
        "robos:content",
        "robos:scenarios",
        "robos:requirementId",
        "robos:narrative",
        "robos:tags",
        "robos:stepCount",
        "robos:testsService",
        "robos:targetService"
      ],
      "incoming": [
        "robos:inFeature",
        "robos:inScenarioOutline",
        "robos:step"
      ]
    },
    {
      "id": "learning",
      "label": "Learning",
      "types": [
        "robos:ELearning",
        "robos:CertificateOfCompletion",
        "robos:LearningModule",
        "robos:LearningLesson",
        "robos:HandsOnLab",
        "robos:QuizAssessment",
        "robos:CurriculumDefinition"
      ],
      "properties": [
        "robos:topic",
        "robos:modules",
        "robos:gitopsFile",
        "robos:recipientUser",
        "robos:forCourse",
        "robos:issueDate",
        "robos:scorePercentage",
        "robos:course",
        "robos:module",
        "robos:labFile",
        "robos:lessons",
        "robos:difficulty",
        "robos:targetAudience",
        "robos:estimatedDuration",
        "robos:teachesService",
        "robos:teachesContract",
        "robos:teachesApplication",
        "robos:teaches",
        "robos:usesSkill"
      ],
      "incoming": [
        "robos:course",
        "robos:module",
        "robos:forCourse"
      ]
    },
    {
      "id": "documentation",
      "label": "Content & Structure",
      "types": [
        "robos:FlowDiagram",
        "robos:DocumentationPage",
        "robos:InteractiveWalkthrough",
        "robos:CodeSnippet",
        "robos:DocSection",
        "robos:DocArticle",
        "robos:CodeSample"
      ],
      "properties": [
        "robos:mermaidText",
        "robos:tooltip",
        "robos:targetApp",
        "robos:language",
        "robos:code",
        "robos:sectionId",
        "robos:docPage",
        "robos:diagramType"
      ],
      "incoming": [
        "robos:docPage"
      ]
    },
    {
      "id": "agent",
      "label": "Agent & Skills",
      "types": [
        "robos:AgentPersona",
        "robos:AgentSkill",
        "robos:PromptStrategy",
        "robos:AIAgent",
        "robos:PromptOptimizer",
        "robos:PromptCompiler",
        "robos:AIPromptTechnique"
      ],
      "properties": [
        "robos:role",
        "robos:systemPrompt",
        "robos:strategyType",
        "robos:engine",
        "robos:skillName",
        "robos:agentRules",
        "robos:usesSkill",
        "robos:developmentGuidance",
        "robos:model",
        "robos:parameters"
      ],
      "incoming": []
    },
    {
      "id": "build",
      "label": "Build & Remote Execution",
      "types": [
        "robos:BuildSystem",
        "robos:RemoteExecutionCluster",
        "robos:RemoteBuildCluster",
        "robos:MonorepoBuild"
      ],
      "properties": [
        "robos:protocol",
        "robos:provider",
        "robos:executionEndpoint",
        "robos:casEndpoint",
        "robos:buildTool",
        "robos:configFile",
        "robos:actionCacheEndpoint",
        "robos:assetEndpoint",
        "robos:browserEndpoint",
        "robos:instanceName",
        "robos:defaultExecProperties",
        "robos:workerPools",
        "robos:hasRemoteExecution"
      ],
      "incoming": [
        "robos:usesBuildSystem",
        "robos:builtBy",
        "robos:executesOn"
      ]
    },
    {
      "id": "configuration",
      "label": "Configuration",
      "types": [
        "robos:ContextSource",
        "robos:EnvironmentProfile",
        "robos:SourceArtifact"
      ],
      "properties": [
        "robos:sourceType",
        "robos:location",
        "robos:configFile",
        "robos:hasConfiguration",
        "robos:configures",
        "robos:forEnvironment",
        "robos:configurationKind",
        "robos:authenticationBoundary",
        "robos:routesTo",
        "robos:sendsBuildEventsTo",
        "robos:sendsCompletedActionsTo",
        "robos:executesOn",
        "robos:stateScope"
      ],
      "incoming": []
    },
    {
      "id": "source",
      "label": "Source Declaration",
      "types": [
        "robos:SourceArtifact"
      ],
      "properties": [
        "robos:sourceKind",
        "robos:imports",
        "robos:exports",
        "robos:definesModel",
        "robos:definedInContract",
        "robos:inputType",
        "robos:outputType",
        "robos:declaredName",
        "robos:version",
        "robos:targets",
        "robos:dependsOn",
        "robos:currentBranch",
        "robos:branchMetadataStatus"
      ],
      "incoming": []
    },
    {
      "id": "decisions",
      "label": "Decisions",
      "types": [
        "robos:ArchitectureDecisionRecord",
        "robos:ADR",
        "robos:ADROption"
      ],
      "properties": [
        "robos:status",
        "robos:context",
        "robos:decision",
        "robos:consequences",
        "robos:adrNumber",
        "robos:adr",
        "robos:supersededBy"
      ],
      "incoming": [
        "robos:adr"
      ]
    }
  ];

  // Every current SHACL target, including aliases, is assigned above. Broad
  // standard types such as oslc:Resource/schema:Thing intentionally stay in
  // Overview: their generic type alone cannot establish a domain-specific group.
  // A title-only Team/Project/TestPlan intentionally has no populated domain tab.
  return { GROUPS };
});
