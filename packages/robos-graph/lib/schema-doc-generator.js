'use strict';

const fs = require('fs');
const path = require('path');
const { BUILTIN_SHACL_SHAPES } = require('./shacl-validator');
const { DEFAULT_PACKAGES, KGraphPackageManager } = require('./package-manager');
const { OSLC_CONTEXT } = require('./oslc-parser');

// Canonical property metadata dictionary
const PROPERTY_METADATA = {
  'dcterms:title': {
    name: 'Title / Display Name',
    type: 'xsd:string',
    description: 'Human-readable title or display name for the resource.',
  },
  'dcterms:description': {
    name: 'Description',
    type: 'xsd:string',
    description: 'Detailed narrative description of the component, architecture, or policy.',
  },
  'robos:repository': {
    name: 'Git Repository',
    type: 'xsd:string',
    description: 'Git repository URL or slug (e.g. `github.com/acme/petstore-api`).',
  },
  'robos:ownerTeam': {
    name: 'Owner Team',
    type: 'URI (robos:Team)',
    description: 'URI reference to the governing development team.',
  },
  'robos:implementsContract': {
    name: 'Implements Contract',
    type: 'URI (robos:Contract)',
    description: 'Interface contract implemented by this service (OpenAPI 3.1, gRPC, Pact).',
  },
  'robos:usesEntity': {
    name: 'Domain Entity',
    type: 'URI (robos:Entity)',
    description: 'Core domain entity managed or queried by this service.',
  },
  'robos:dependsOn': {
    name: 'Service Dependency',
    type: 'URI (robos:Microservice)',
    description: 'Upstream or downstream microservice dependency.',
  },
  'robos:specFile': {
    name: 'Specification File',
    type: 'xsd:string',
    description: 'Path to contract specification file (e.g. `specs/contracts/petstore-v1.yaml`).',
  },
  'robos:protocol': {
    name: 'Protocol / Standard',
    type: 'xsd:string',
    description: 'Standard protocol (e.g. `OpenAPI 3.1`, `REAPI_v2`, `Protobuf gRPC`).',
  },
  'robos:featureFile': {
    name: 'Gherkin Feature File',
    type: 'xsd:string',
    description: 'Relative path to Gherkin BDD `.feature` verification specification.',
  },
  'robos:technology': {
    name: 'Technology Stack',
    type: 'xsd:string',
    description: 'Primary programming language and runtime framework.',
  },
  'robos:desktopFramework': {
    name: 'Desktop Framework',
    type: 'xsd:string',
    description: 'Workstation desktop framework (`Electron`, `Tauri`, `Qt`, `GTK`).',
  },
  'robos:frontendFramework': {
    name: 'Frontend Framework',
    type: 'xsd:string',
    description: 'Single-page or SSR web framework (`React`, `Next.js`, `Vue`, `Svelte`).',
  },
  'robos:cliCommand': {
    name: 'CLI Binary Command',
    type: 'xsd:string',
    description: 'Terminal executable command name (e.g. `robos`, `kubectl`).',
  },
  'robos:platform': {
    name: 'Target Platform',
    type: 'xsd:string',
    description: 'Mobile operating system target (`iOS`, `Android`, or cross-platform).',
  },
  'robos:gameEngine': {
    name: 'Game Engine',
    type: 'xsd:string',
    description: 'Interactive real-time game engine (`Unreal Engine 5`, `Unity 6`, `Godot 4`, `Bevy`).',
  },
  'robos:targetPlatform': {
    name: 'Gaming Target Platform',
    type: 'xsd:string',
    description: 'Supported desktop gaming platforms (`Windows`, `Linux`, `macOS`).',
  },
  'robos:pipelineEngine': {
    name: 'Pipeline Engine',
    type: 'xsd:string',
    description: 'Stream or batch processing engine (`Kafka Streams`, `Spark`, `Celery`, `Flink`).',
  },
  'robos:url': {
    name: 'Forge / Web URL',
    type: 'xsd:anyURI',
    description: 'HTTP/HTTPS URL of the forge or web resource.',
  },
  'robos:orgName': {
    name: 'Organization Slug',
    type: 'xsd:string',
    description: 'Forge organization identifier or handle (e.g. `apache`, `acme`).',
  },
  'robos:forgeType': {
    name: 'Forge Type',
    type: 'xsd:string',
    description: 'Hosting platform (`github`, `gitlab`, `bitbucket`, `gitea`).',
  },
  'robos:executionEndpoint': {
    name: 'Execution Endpoint',
    type: 'xsd:anyURI',
    description: 'gRPC endpoint URI for Remote Execution service (e.g. `grpc://re-execution:8980`).',
  },
  'robos:casEndpoint': {
    name: 'CAS Endpoint',
    type: 'xsd:anyURI',
    description: 'Content Addressable Storage (CAS) gRPC endpoint URI.',
  },
  'robos:actionCacheEndpoint': {
    name: 'Action Cache Endpoint',
    type: 'xsd:anyURI',
    description: 'Action Cache verification gRPC endpoint URI.',
  },
  'robos:provider': {
    name: 'Backend Provider',
    type: 'xsd:string',
    description: 'Underlying execution engine implementation (`buildbarn`, `nativelink`, `buildgrid`).',
  },
  'robos:buildTool': {
    name: 'Build Tool',
    type: 'xsd:string',
    description: 'Monorepo build tool (`bazel`, `buck2`, `pants`, `please`).',
  },
  'robos:configFile': {
    name: 'Config File',
    type: 'xsd:string',
    description: 'Root configuration file (`.bazelrc`, `.buckconfig`).',
  },
  'robos:hasRemoteExecution': {
    name: 'Remote Execution Link',
    type: 'URI (robos:RemoteExecutionCluster)',
    description: 'URI reference linking the build tool to an open-standard REAPI cluster.',
  },
  'robos:topic': {
    name: 'Knowledge Domain Topic',
    type: 'xsd:string',
    description: 'Curriculum domain or architectural specialization topic.',
  },
  'robos:modules': {
    name: 'Learning Modules',
    type: 'Array<robos:LearningModule>',
    description: 'Curated curriculum modules with interactive labs and Gherkin BDD tests.',
  },
  'robos:gitopsFile': {
    name: 'GitOps Declarative File',
    type: 'xsd:string',
    description: 'Path to declarative GitOps definition file (`.robos/elearning.yaml`).',
  },
  'robos:status': {
    name: 'Lifecycle Status',
    type: 'xsd:string',
    description: 'Current lifecycle state (`active`, `proposed`, `deprecated`).',
  },
  'robos:hasRepository': {
    name: 'Organization Repositories',
    type: 'Array<xsd:string>',
    description: 'List of repository URLs or member identifiers belonging to this organization.',
  },
  'robos:agentRules': {
    name: 'Inherited Agent Rules',
    type: 'Array<robos:AgentRule>',
    description: 'Organization-wide coding rules and architectural constraints inherited by AI agents.',
  },
  'robos:mermaidText': {
    name: 'Mermaid Graph Definition',
    type: 'xsd:string',
    description: 'Raw, executable Mermaid graph syntax specifying nodes, transitions, sequence interactions, or states.',
  },
  'robos:imagePath': {
    name: 'AI-Rendered Diagram Image',
    type: 'xsd:string',
    description: 'Relative path to a high-resolution, AI-generated illustration visualizing the diagram (e.g. `assets/images/architecture/...`).',
  },
  'robos:tooltip': {
    name: 'Hover Tooltip Summary',
    type: 'xsd:string',
    description: 'Concise tooltip text displayed on hover in interactive UI cards, IDE diagram viewers, and living doc popovers.',
  },
  'robos:diagramType': {
    name: 'Diagram Type',
    type: 'xsd:string',
    description: 'Diagram classification (`flowchart`, `sequence`, `class`, `state`, `architecture`, `erDiagram`).',
  },
  'robos:aspectRatio': {
    name: 'Image Aspect Ratio',
    type: 'xsd:string',
    description: 'Aspect ratio of the AI-rendered diagram image (`16:9`, `4:3`, `1:1`).',
  },
  'robos:targetComponent': {
    name: 'Target Component',
    type: 'URI (robos:Microservice | robos:FrontEndApp | robos:DesktopApp)',
    description: 'URI reference linking the diagram to the target software architecture component it illustrates.',
  },
  'robos:docPath': {
    name: 'Document File Path',
    type: 'xsd:string',
    description: 'Relative path to the living markdown documentation page within the repository.',
  },
  'robos:slug': {
    name: 'URL / Document Slug',
    type: 'xsd:string',
    description: 'Canonical web and navigation slug for the documentation or walkthrough.',
  },
  'robos:category': {
    name: 'Documentation Category',
    type: 'xsd:string',
    description: 'Functional documentation category (`Architecture`, `Guides`, `Runbooks`, `Onboarding`, `Specifications`).',
  },
  'robos:hasFlowDiagram': {
    name: 'Associated Flow Diagram',
    type: 'URI (robos:FlowDiagram)',
    description: 'URI reference to a first-class visual flow diagram linked to this documentation or decision record.',
  },
  'robos:adrNumber': {
    name: 'ADR Number Identifier',
    type: 'xsd:string',
    description: 'Standard sequential ADR identifier (e.g. `ADR-001`).',
  },
  'robos:context': {
    name: 'Decision Context',
    type: 'xsd:string',
    description: 'Architectural context, problem statement, business drivers, and technical constraints motivating the decision.',
  },
  'robos:decision': {
    name: 'Architectural Decision',
    type: 'xsd:string',
    description: 'The definitive architectural choice made, technology selected, or pattern mandated.',
  },
  'robos:consequences': {
    name: 'Decision Consequences',
    type: 'xsd:string',
    description: 'Anticipated positive outcomes, operational tradeoffs, and secondary impacts of the architectural decision.',
  },
  'robos:walkthroughPath': {
    name: 'Walkthrough Script Path',
    type: 'xsd:string',
    description: 'Relative path to the text-narrated walkthrough script and step-by-step documentation.',
  },
  'robos:videoPath': {
    name: 'Video Recording Path',
    type: 'xsd:string',
    description: 'Relative path to the recorded video walkthrough demonstration file.',
  },
  'robos:targetApp': {
    name: 'Target RobOS Application',
    type: 'xsd:string',
    description: 'Application ID of the RobOS desktop application showcased in the walkthrough.',
  },
  'robos:code': {
    name: 'Source Code Content',
    type: 'xsd:string',
    description: 'Raw, executable source code snippet content.',
  },
  'robos:language': {
    name: 'Programming Language',
    type: 'xsd:string',
    description: 'Code snippet syntax language (`javascript`, `typescript`, `python`, `go`, `rust`, `bash`).',
  },
  'robos:parentTask': {
    name: 'Parent Task',
    type: 'URI (robos:Task)',
    description: 'URI reference linking a subtask or item to its parent task.',
  },
  'robos:severity': {
    name: 'Defect Severity',
    type: 'xsd:string',
    description: 'Severity classification of a bug or defect (blocker, critical, major, minor, trivial).',
  },
  'robos:startDate': {
    name: 'Start Date',
    type: 'xsd:date',
    description: 'Scheduled start date for a sprint or milestone.',
  },
  'robos:endDate': {
    name: 'End Date',
    type: 'xsd:date',
    description: 'Scheduled completion date for a sprint.',
  },
  'robos:targetDate': {
    name: 'Target Date',
    type: 'xsd:date',
    description: 'Target delivery date for a milestone or release.',
  },
  'robos:defaultBranch': {
    name: 'Default Git Branch',
    type: 'xsd:string',
    description: 'Default primary branch name for a repository (e.g. main, master).',
  },
  'robos:branchName': {
    name: 'Git Branch Name',
    type: 'xsd:string',
    description: 'Name of the Git branch (e.g. feat/agent-tiers, fix/schema-validator).',
  },
  'robos:prNumber': {
    name: 'Pull Request Number',
    type: 'xsd:integer',
    description: 'Numerical pull request identifier within the repository forge.',
  },
  'robos:sourceBranch': {
    name: 'Source Branch',
    type: 'xsd:string',
    description: 'Head or source branch containing changes to be merged.',
  },
  'robos:targetBranch': {
    name: 'Target Branch',
    type: 'xsd:string',
    description: 'Base or destination branch into which changes are merged.',
  },
  'robos:commitSha': {
    name: 'Git Commit SHA',
    type: 'xsd:string',
    description: '40-character hexadecimal Git commit hash.',
  },
  'robos:tagName': {
    name: 'Git Release Tag',
    type: 'xsd:string',
    description: 'Semantic version tag label (e.g. v1.0.0, v2.4.1).',
  },
  'robos:pathPattern': {
    name: 'API Path Pattern',
    type: 'xsd:string',
    description: 'URL route template pattern for an endpoint (e.g. /api/v1/orders/{id}).',
  },
  'robos:httpMethod': {
    name: 'HTTP Method',
    type: 'xsd:string',
    description: 'HTTP request method (GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD).',
  },
  'robos:modelName': {
    name: 'Data Model Name',
    type: 'xsd:string',
    description: 'Name of the domain entity or schema model (e.g. OrderDto, CustomerProfile).',
  },
  'robos:schemaName': {
    name: 'Database Schema Name',
    type: 'xsd:string',
    description: 'Logical schema or namespace name within a database (e.g. public, auth, billing).',
  },
  'robos:database': {
    name: 'Parent Database',
    type: 'URI (robos:Database | robos:NoSQLDatabase)',
    description: 'URI reference linking schema, table, or collection to its parent database.',
  },
  'robos:tableName': {
    name: 'Database Table Name',
    type: 'xsd:string',
    description: 'Relational table name (e.g. orders, users, invoices).',
  },
  'robos:columnName': {
    name: 'Column Name',
    type: 'xsd:string',
    description: 'Table column name (e.g. id, email, created_at).',
  },
  'robos:dataType': {
    name: 'Column Data Type',
    type: 'xsd:string',
    description: 'Storage data type for a column (e.g. uuid, varchar, bigint, timestamp).',
  },
  'robos:table': {
    name: 'Parent Table',
    type: 'URI (robos:DatabaseTable)',
    description: 'URI reference linking a column or index to its parent table.',
  },
  'robos:indexName': {
    name: 'Index Name',
    type: 'xsd:string',
    description: 'Database index identifier (e.g. idx_orders_user_id).',
  },
  'robos:collectionName': {
    name: 'NoSQL Collection Name',
    type: 'xsd:string',
    description: 'NoSQL document collection or keyspace name (e.g. sessions, audit_logs).',
  },
  'robos:topicName': {
    name: 'Topic / Queue Name',
    type: 'xsd:string',
    description: 'Message broker topic or queue identifier (e.g. order-events-v1).',
  },
  'robos:broker': {
    name: 'Parent Message Broker',
    type: 'URI (robos:MessageBroker)',
    description: 'URI reference linking topic or queue to its governing message broker.',
  },
  'robos:groupId': {
    name: 'Consumer Group ID',
    type: 'xsd:string',
    description: 'Unique identifier for a stream consumer group.',
  },
  'robos:toolName': {
    name: 'MCP Tool Name',
    type: 'xsd:string',
    description: 'Tool name exposed by a Model Context Protocol server.',
  },
  'robos:mcpServer': {
    name: 'Parent MCP Server',
    type: 'URI (robos:MCPServer)',
    description: 'URI reference linking a tool, resource, or prompt to its MCP server.',
  },
  'robos:uriTemplate': {
    name: 'URI Template',
    type: 'xsd:string',
    description: 'Resource URI template exposed by an MCP server.',
  },
  'robos:promptName': {
    name: 'MCP Prompt Name',
    type: 'xsd:string',
    description: 'Prompt template name exposed by an MCP server.',
  },
  'robos:namespaceName': {
    name: 'Kubernetes Namespace Name',
    type: 'xsd:string',
    description: 'Logical cluster namespace name (e.g. production, staging, kube-system).',
  },
  'robos:cluster': {
    name: 'Target Kubernetes Cluster',
    type: 'URI (robos:KubernetesCluster)',
    description: 'URI reference linking namespace or resource to its host Kubernetes cluster.',
  },
  'robos:namespace': {
    name: 'Namespace Reference',
    type: 'URI (robos:KubernetesNamespace)',
    description: 'URI reference linking workload or service to its target namespace.',
  },
  'robos:image': {
    name: 'Container Image',
    type: 'xsd:string',
    description: 'OCI container image reference (e.g. registry.acme.com/apps/order-api:v1.2.0).',
  },
  'robos:serviceName': {
    name: 'Kubernetes Service Name',
    type: 'xsd:string',
    description: 'Cluster service resource name (e.g. forms-api-svc).',
  },
  'robos:serviceType': {
    name: 'Kubernetes Service Type',
    type: 'xsd:string',
    description: 'Networking service type (ClusterIP, NodePort, LoadBalancer, ExternalName).',
  },
  'robos:ingressName': {
    name: 'Ingress Rule Name',
    type: 'xsd:string',
    description: 'Ingress resource routing name.',
  },
  'robos:host': {
    name: 'Routing Hostname',
    type: 'xsd:string',
    description: 'DNS hostname or service endpoint address.',
  },
  'robos:stageName': {
    name: 'Pipeline Stage Name',
    type: 'xsd:string',
    description: 'CI/CD pipeline stage name (e.g. build, test, deploy).',
  },
  'robos:pipeline': {
    name: 'Parent CI/CD Pipeline',
    type: 'URI (robos:CICDPipeline)',
    description: 'URI reference linking stage to its parent CI/CD pipeline.',
  },
  'robos:jobName': {
    name: 'Pipeline Job Name',
    type: 'xsd:string',
    description: 'Individual job identifier within a pipeline stage.',
  },
  'robos:stage': {
    name: 'Parent Pipeline Stage',
    type: 'URI (robos:PipelineStage)',
    description: 'URI reference linking job to its parent stage.',
  },
  'robos:stepName': {
    name: 'Pipeline Step Name',
    type: 'xsd:string',
    description: 'Granular execution step name within a job.',
  },
  'robos:job': {
    name: 'Parent Pipeline Job',
    type: 'URI (robos:PipelineJob)',
    description: 'URI reference linking step to its parent job.',
  },
  'robos:course': {
    name: 'Parent eLearning Course',
    type: 'URI (robos:ELearning)',
    description: 'URI reference linking module to its parent course.',
  },
  'robos:module': {
    name: 'Parent Learning Module',
    type: 'URI (robos:LearningModule)',
    description: 'URI reference linking lesson, lab, or quiz to its parent module.',
  },
  'robos:labFile': {
    name: 'Hands-on Lab Guide File',
    type: 'xsd:string',
    description: 'Relative path to hands-on lab instructions or tutorial guide.',
  },
  'robos:questions': {
    name: 'Assessment Questions',
    type: 'Array<Object>',
    description: 'List of assessment quiz questions and verification checks.',
  },
  'robos:sectionId': {
    name: 'Doc Section Anchor',
    type: 'xsd:string',
    description: 'Unique heading identifier or HTML anchor within the documentation page.',
  },
  'robos:docPage': {
    name: 'Parent Documentation Page',
    type: 'URI (robos:DocumentationPage)',
    description: 'URI reference linking section to its parent documentation page.',
  },
  'robos:adr': {
    name: 'Parent ADR',
    type: 'URI (robos:ArchitectureDecisionRecord)',
    description: 'URI reference linking considered option to its Architecture Decision Record.',
  },
  'robos:steps': {
    name: 'Scenario Steps',
    type: 'Array<robos:ScenarioStep>',
    description: 'Ordered sequence of BDD test steps executing the scenario.',
  },
  'robos:keyword': {
    name: 'BDD Step Keyword',
    type: 'xsd:string',
    description: 'Gherkin step keyword (Given, When, Then, And, But).',
  },
  'robos:stepText': {
    name: 'BDD Step Expression',
    type: 'xsd:string',
    description: 'Gherkin step narrative text matching cucumber step definition.',
  },
  'robos:routePath': {
    name: 'Web Route Path',
    type: 'xsd:string',
    description: 'Frontend SPA URL route path (e.g. /dashboard, /settings).',
  },
  'robos:app': {
    name: 'Parent Application',
    type: 'URI (robos:FrontEndApp | robos:DesktopApp | robos:ConsoleApp)',
    description: 'URI reference linking route, window, or command to its parent application.',
  },
  'robos:commandName': {
    name: 'CLI Command Name',
    type: 'xsd:string',
    description: 'Console executable subcommand name (e.g. validate, deploy, run).',
  },
  'robos:flagName': {
    name: 'CLI Flag / Option Name',
    type: 'xsd:string',
    description: 'Command line flag name (e.g. --output, --dry-run).',
  },
  'robos:command': {
    name: 'Parent CLI Command',
    type: 'URI (robos:CLICommand)',
    description: 'URI reference linking a flag to its parent command.',
  },
  'robos:refersFrom': {
    name: 'Refers From (Upstream Schema)',
    type: 'URI',
    description: 'Canonical upstream schema URL (e.g. Schema.org, OASIS OSLC, C4 Model, Cucumber) that this RobOS schema adapts or directly derives from.',
  },
  'robos:hasBackground': {
    name: 'Has Background',
    type: 'URI (robos:GherkinBackground)',
    description: 'Prerequisite background context shared across scenarios in a Gherkin feature.',
  },
  'robos:inBackground': {
    name: 'In Background',
    type: 'URI (robos:GherkinBackground)',
    description: 'Reference to parent Gherkin background context.',
  },
  'robos:hasRule': {
    name: 'Has Rule',
    type: 'Array of URIs (robos:GherkinRule)',
    description: 'Business rule grouping related BDD scenarios within a feature.',
  },
  'robos:inRule': {
    name: 'In Rule',
    type: 'URI (robos:GherkinRule)',
    description: 'Reference to parent Gherkin business rule constraint.',
  },
  'robos:hasScenarioOutline': {
    name: 'Has Scenario Outline',
    type: 'Array of URIs (robos:ScenarioOutline)',
    description: 'Parameterized scenario outlines within a Gherkin feature.',
  },
  'robos:examplesTable': {
    name: 'Examples Table',
    type: 'URI (robos:ExamplesTable)',
    description: 'Parameter data matrix bound to a scenario outline.',
  },
  'robos:tableHeaders': {
    name: 'Table Headers',
    type: 'Array of xsd:string',
    description: 'Column header names for an examples or data table.',
  },
  'robos:tableRows': {
    name: 'Table Rows',
    type: 'Array of Arrays',
    description: '2D matrix of row cell values for an examples or data table.',
  },
  'robos:regexPattern': {
    name: 'Regex Pattern',
    type: 'xsd:string',
    description: 'Regular expression matching step text in Gherkin scenarios.',
  },
  'robos:codeFile': {
    name: 'Code File',
    type: 'xsd:string',
    description: 'Path to source code implementing a step definition or test suite.',
  },
  'robos:dataTable': {
    name: 'Data Table',
    type: 'URI (robos:DataTable)',
    description: 'Embedded 2D data table attached to a scenario step.',
  },
  'robos:docString': {
    name: 'Doc String',
    type: 'URI (robos:DocString)',
    description: 'Multi-line text payload or JSON string attached to a scenario step.',
  },
  'robos:testingType': {
    name: 'Testing Paradigm',
    type: 'xsd:string',
    description: 'Testing category (bdd, unit, e2e, contract, performance, mocking, api).',
  },
  'robos:testFramework': {
    name: 'Testing Framework',
    type: 'xsd:string',
    description: 'Test runner or framework identifier (cucumber, jest, vitest, playwright, etc.).',
  },
  'robos:inTestPlan': {
    name: 'In Test Plan',
    type: 'URI (robos:TestPlan)',
    description: 'Parent quality test plan governing this test suite.',
  },
  'robos:inTestSuite': {
    name: 'In Test Suite',
    type: 'URI (robos:TestSuite)',
    description: 'Parent test suite executing this test run.',
  },
  'oslc_qm:executionStatus': {
    name: 'Execution Status',
    type: 'xsd:string',
    description: 'Test execution outcome (PASS, FAIL, BLOCKED, SKIPPED).',
  },
  'oslc_qm:reportsOnTestCase': {
    name: 'Reports On Test Case',
    type: 'URI (robos:Scenario | oslc_qm:TestCase)',
    description: 'Target scenario or test case verified by this execution record.',
  },
  'robos:testsService': {
    name: 'Tests Service',
    type: 'URI (robos:Microservice)',
    description: 'Microservice or backend API verified by this test plan or feature.',
  },
};

// Package display titles for Just the Docs navigation
const PACKAGE_DISPLAY_TITLES = {
  'core-platform': 'Core Platform (robos.core)',
  'organization': 'Organization & Teams (robos.org)',
  'services': 'Services & Contracts (robos.services)',
  'applications': 'Applications (robos.apps)',
  'devops': 'DevOps & Cloud (robos.devops)',
  'learning': 'eLearning Curriculums (robos.learning)',
  'documentation': 'Documentation & Diagrams (robos.docs)',
  'testing': 'Testing, Quality & BDD (robos.testing)',
};

// Explicit slug and display title overrides for acronyms, multi-capital terms, and compound tech names
const ENTITY_OVERRIDES = {
  'GraphQLContract': { slug: 'graphql-contract', title: 'GraphQL Contract' },
  'NoSQLDatabase': { slug: 'nosql-database', title: 'NoSQL Database' },
  'NoSQLCollection': { slug: 'nosql-collection', title: 'NoSQL Collection' },
  'MCPServer': { slug: 'mcp-server', title: 'MCP Server' },
  'MCPTool': { slug: 'mcp-tool', title: 'MCP Tool' },
  'MCPResource': { slug: 'mcp-resource', title: 'MCP Resource' },
  'MCPPrompt': { slug: 'mcp-prompt', title: 'MCP Prompt' },
  'CICDPipeline': { slug: 'cicd-pipeline', title: 'CI/CD Pipeline' },
  'APIEndpoint': { slug: 'api-endpoint', title: 'API Endpoint' },
  'CLICommand': { slug: 'cli-command', title: 'CLI Command' },
  'CLIFlag': { slug: 'cli-flag', title: 'CLI Flag' },
  'ADROption': { slug: 'adr-option', title: 'ADR Option' },
  'PCGame': { slug: 'pc-game', title: 'PC Game' },
  'GitOpsDeployment': { slug: 'gitops-deployment', title: 'GitOps Deployment' },
  'ELearning': { slug: 'elearning', title: 'eLearning Course' },
  'GherkinFeature': { slug: 'gherkin-feature', title: 'Gherkin Feature' },
  'GherkinBackground': { slug: 'gherkin-background', title: 'Gherkin Background' },
  'GherkinRule': { slug: 'gherkin-rule', title: 'Gherkin Rule' },
  'ScenarioOutline': { slug: 'scenario-outline', title: 'Scenario Outline' },
  'ExamplesTable': { slug: 'examples-table', title: 'Examples Table' },
  'StepDefinition': { slug: 'step-definition', title: 'Step Definition' },
  'DataTable': { slug: 'data-table', title: 'Data Table' },
  'DocString': { slug: 'doc-string', title: 'Doc String' },
  'TestingLibrary': { slug: 'testing-library', title: 'Testing Library' },
  'TestPlan': { slug: 'test-plan', title: 'Test Plan' },
  'TestSuite': { slug: 'test-suite', title: 'Test Suite' },
  'TestExecutionRecord': { slug: 'test-execution-record', title: 'Test Execution Record' },
};

class SchemaDocGenerator {
  constructor(options = {}) {
    this.rootDir = options.rootDir || process.cwd();
    this.kgraphDir = options.kgraphDir || path.join(this.rootDir, '.robos');
    this.docsDir = options.docsDir || path.join(this.rootDir, 'docs');
    this.outputDir = options.outputDir || path.join(this.docsDir, 'schemas');
    this.packageManager = new KGraphPackageManager({ baseDir: this.kgraphDir });
  }

  getSchemaPackage(targetClass) {
    const fakeNode = { '@type': targetClass };
    return this.packageManager.inferPackageForNode(fakeNode);
  }

  getEntitySlug(targetClass) {
    const name = targetClass.replace(/^.*:/, '');
    if (ENTITY_OVERRIDES[name] && ENTITY_OVERRIDES[name].slug) {
      return ENTITY_OVERRIDES[name].slug;
    }
    return name
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .toLowerCase();
  }

  getEntityTitle(targetClass) {
    const name = targetClass.replace(/^.*:/, '');
    if (ENTITY_OVERRIDES[name] && ENTITY_OVERRIDES[name].title) {
      return ENTITY_OVERRIDES[name].title;
    }
    return name
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  }

  getCanonicalNode(targetClass, pkgId) {
    const pkg = this.packageManager.getPackage(pkgId);
    if (pkg && pkg.nodes) {
      const match = pkg.nodes.find(n => {
        const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type'] || ''];
        return types.some(t => t === targetClass || t.endsWith(`:${targetClass}`));
      });
      if (match) return match;
    }
    return null;
  }

  generateAll() {
    fs.mkdirSync(this.outputDir, { recursive: true });

    // Group SHACL shapes by package
    const packageMap = new Map();
    for (const pkg of DEFAULT_PACKAGES) {
      packageMap.set(pkg.id, {
        ...pkg,
        displayTitle: PACKAGE_DISPLAY_TITLES[pkg.id] || pkg.title,
        shapes: [],
      });
    }

    for (const shape of BUILTIN_SHACL_SHAPES) {
      const pkgId = this.getSchemaPackage(shape.targetClass);
      if (packageMap.has(pkgId)) {
        packageMap.get(pkgId).shapes.push(shape);
      } else {
        // Fallback to core-platform
        packageMap.get('core-platform').shapes.push(shape);
      }
    }

    const generatedFiles = [];

    // 1. Generate Tier 1: docs/schemas.md (Hub)
    const hubPath = path.join(this.docsDir, 'schemas.md');
    const hubContent = this.generateHubMarkdown(packageMap);
    fs.writeFileSync(hubPath, hubContent, 'utf8');
    generatedFiles.push(hubPath);

    // 2. Generate Tier 2: docs/schemas/<pkg>.md
    let pkgOrder = 1;
    for (const [pkgId, pkgData] of packageMap.entries()) {
      const pkgSubdir = path.join(this.outputDir, pkgId);
      fs.mkdirSync(pkgSubdir, { recursive: true });

      const pkgFilePath = path.join(this.outputDir, `${pkgId}.md`);
      const pkgContent = this.generatePackageMarkdown(pkgData, pkgOrder++);
      fs.writeFileSync(pkgFilePath, pkgContent, 'utf8');
      generatedFiles.push(pkgFilePath);

      // 3. Generate Tier 3: docs/schemas/<pkg>/<entity-slug>.md
      let shapeOrder = 1;
      for (const shape of pkgData.shapes) {
        const slug = this.getEntitySlug(shape.targetClass);
        const shapeFilePath = path.join(pkgSubdir, `${slug}.md`);
        const shapeContent = this.generateSchemaMarkdown(shape, pkgData, shapeOrder++);
        fs.writeFileSync(shapeFilePath, shapeContent, 'utf8');
        generatedFiles.push(shapeFilePath);
      }

      // Clean stale markdown files in this package subdirectory
      if (fs.existsSync(pkgSubdir)) {
        const existingFiles = fs.readdirSync(pkgSubdir);
        for (const file of existingFiles) {
          if (file.endsWith('.md')) {
            const fullPath = path.join(pkgSubdir, file);
            if (!generatedFiles.includes(fullPath)) {
              fs.unlinkSync(fullPath);
            }
          }
        }
      }
    }

    return {
      ok: true,
      generatedCount: generatedFiles.length,
      packageCount: packageMap.size,
      shapeCount: BUILTIN_SHACL_SHAPES.length,
      generatedFiles,
    };
  }

  generateHubMarkdown(packageMap) {
    const lines = [
      '---',
      'title: KGraph Schemas',
      'layout: default',
      'nav_order: 3',
      'has_children: true',
      'permalink: /schemas.html',
      '---',
      '',
      '# RobOS Knowledge Graph Schemas & Ontologies',
      '{: .no_toc }',
      '',
      'Comprehensive, machine-readable ontologies and W3C SHACL constraint specifications governing the RobOS Dual-State SDLC Knowledge Graph across all ' + packageMap.size + ' standard package stores.',
      '{: .fs-6 .fw-300 }',
      '',
      '## Table of contents',
      '{: .no_toc .text-delta }',
      '',
      '1. TOC',
      '{:toc}',
      '',
      '---',
      '',
      '## Architectural Overview',
      '',
      'RobOS structures the entire software development lifecycle as an open, interconnected **Dual-State Knowledge Graph**. Rather than proprietary siloes or monolithic configuration files, RobOS combines three international standards:',
      '',
      '1. **OASIS OSLC Core 3.0 & W3C JSON-LD**: Global semantic web standard for linking requirements, changes, architectures, and tests.',
      '2. **W3C SHACL (Shapes Constraint Language)**: Strictly validates graph nodes against structural schemas before saving or synthesizing code.',
      `3. **Modular Namespaced Packages (\`.robos/kgraphs/\`)**: Eliminates Git merge conflicts and blurs across teams by dividing the universe into ${packageMap.size} domain-isolated package stores.`,
      '',
      '<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">',
      `  <img src="{{ '/assets/images/kgraph-schemas-architecture.jpg' | relative_url }}" alt="RobOS SDLC Knowledge Graph Ontology and Modular Package Stores" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />`,
      '  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">',
      `    <strong>RobOS SDLC Knowledge Graph Ontology</strong>: The ${packageMap.size} modular package stores, linked-data relationships, and OSLC Core 3.0 / W3C SHACL validation layer. <em>(Click image to zoom full screen)</em>`,
      '  </div>',
      '</div>',
      '',
      '---',
      '',
      `## The ${packageMap.size} Standard RobOS Package Stores`,
      '',
      '| Package ID | Namespace | Target Domain | Schemas & Shapes |',
      '|---|---|---|---|',
    ];

    for (const [pkgId, pkg] of packageMap.entries()) {
      const link = `[${pkg.displayTitle}]({{ '/schemas/${pkgId}.html' | relative_url }})`;
      const shapeLinks = pkg.shapes.map(s => `<code>${s.targetClass}</code>`).join(', ') || '<em>Base platform nodes</em>';
      lines.push(`| **\`${pkgId}\`** | \`${pkg.namespace}\` | ${pkg.description} | ${shapeLinks} |`);
    }

    lines.push(
      '',
      '---',
      '',
      '## Universal Schema.org & De Facto Standards Matrix',
      '',
      'Every single entity in the RobOS Knowledge Graph is formally mapped to a canonical **[Schema.org](https://schema.org/)** parent class (ensuring 100% interoperability with search engines, web indexers, and general AI reasoning models) alongside an international **De Facto Domain Standard** (OASIS OSLC 3.0, W3C C4 Model, Cucumber BDD, OpenAPI 3.1, CNCF).',
      '',
      'The formal, machine-readable W3C RDF Schema / OWL ontology bridge is published at [**`ontology.jsonld`**]({{ \x27/schemas/ontology.jsonld\x27 | relative_url }}).',
      '',
      '| RobOS Class | Package | Schema.org Classification | De Facto Domain Standard | Specification |',
      '|---|---|---|---|---|'
    );

    for (const [pkgId, pkg] of packageMap.entries()) {
      for (const shape of pkg.shapes) {
        const slug = this.getEntitySlug(shape.targetClass);
        const specLink = `[Docs & SHACL]({{ \x27/schemas/${pkgId}/${slug}.html\x27 | relative_url }})`;
        const sLink = shape.schemaOrgType ? `[\`${shape.schemaOrgType.replace('https://schema.org/', 'schema:')}\`](${shape.schemaOrgType})` : '-';
        let dDisplay = shape.domainStandard || shape.refersFrom || '-';
        if (dDisplay.includes('open-services.net/ns/')) {
          dDisplay = `[OSLC ${dDisplay.split('#')[0].split('/').pop().toUpperCase()}](${dDisplay})`;
        } else if (dDisplay.includes('cucumber.io')) {
          dDisplay = `[Cucumber BDD](${dDisplay})`;
        } else if (dDisplay.includes('w3id.org/c4')) {
          dDisplay = `[W3C C4 Model](${dDisplay})`;
        } else if (dDisplay.includes('openapis.org')) {
          dDisplay = `[OpenAPI 3.1](${dDisplay})`;
        } else if (dDisplay.includes('kubernetes.io')) {
          dDisplay = `[Kubernetes / CNCF](${dDisplay})`;
        } else if (dDisplay.includes('modelcontextprotocol.io')) {
          dDisplay = `[MCP Spec](${dDisplay})`;
        } else if (dDisplay.includes('kafka.apache.org')) {
          dDisplay = `[Apache Kafka](${dDisplay})`;
        } else if (dDisplay.includes('schema.org')) {
          dDisplay = `[\`${dDisplay.replace('https://schema.org/', 'schema:')}\`](${dDisplay})`;
        } else {
          dDisplay = `[Standard](${dDisplay})`;
        }
        lines.push(`| <code>${shape.targetClass}</code> | [${pkg.displayTitle}]({{ \x27/schemas/${pkgId}.html\x27 | relative_url }}) | ${sLink} | ${dDisplay} | ${specLink} |`);
      }
    }

    lines.push(
      '',
      '---',
      '',
      '## Automated Validation via SHACL',
      '',
      'Every node in the Knowledge Graph is verified using programmatic SHACL validators before it can be merged into `.robos/knowledge-graph.jsonld` or deployed to production:',
      '',
      '```javascript',
      "const { SHACLValidator } = require('/usr/local/share/robos/robos-graph/lib/shacl-validator');",
      "const { SDLCKnowledgeGraphStore } = require('/usr/local/share/robos/robos-graph');",
      '',
      'const store = new SDLCKnowledgeGraphStore();',
      'const validationResult = store.validate();',
      '',
      'if (!validationResult.conforms) {',
      '  console.error("SHACL Violations:", validationResult.violations);',
      '} else {',
      '  console.log("All graph nodes strictly conform to SHACL specifications.");',
      '}',
      '```',
      '',
      '---',
      '',
      '## Regenerating Schema Documentation',
      '',
      'RobOS includes a built-in companion generator that keeps documentation in continuous lockstep with schema code:',
      '',
      '```bash',
      '# Run automated schema doc generator',
      'node scripts/generate-kgraph-schema-docs.js',
      '```'
    );

    return lines.join('\n');
  }

  generatePackageMarkdown(pkg, navOrder) {
    const lines = [
      '---',
      `title: ${pkg.displayTitle}`,
      'layout: default',
      'parent: KGraph Schemas',
      `nav_order: ${navOrder}`,
      'has_children: true',
      `permalink: /schemas/${pkg.id}.html`,
      '---',
      '',
      `# ${pkg.displayTitle}`,
      '{: .no_toc }',
      '',
      `${pkg.description}`,
      '{: .fs-6 .fw-300 }',
      '',
      '## Table of contents',
      '{: .no_toc .text-delta }',
      '',
      '1. TOC',
      '{:toc}',
      '',
      '---',
      '',
      '## Package Metadata',
      '',
      `- **Package Store ID**: \`${pkg.id}\``,
      `- **Ontology Namespace**: \`${pkg.namespace}\``,
      `- **GitOps Package File**: \`.robos/kgraphs/${pkg.id}/package.jsonld\``,
      `- **Schemas Defined**: ${pkg.shapes.length}`,
      '',
      '---',
      '',
      '## Package Schemas & Constraint Shapes',
      '',
      '| Schema Class | Target Shape URI | Required Properties (minCount ≥ 1) | Specification |',
      '|---|---|---|---|',
    ];

    for (const shape of pkg.shapes) {
      const slug = this.getEntitySlug(shape.targetClass);
      const title = this.getEntityTitle(shape.targetClass);
      const link = `[**${title}** (\`${shape.targetClass}\`)]({{ '/schemas/${pkg.id}/${slug}.html' | relative_url }})`;
      const reqProps = shape.properties.map(p => `\`${p.path}\``).join(', ');
      lines.push(`| ${link} | \`${shape.shapeId}\` | ${reqProps} | [View Schema &rarr;]({{ '/schemas/${pkg.id}/${slug}.html' | relative_url }}) |`);
    }

    lines.push(
      '',
      '---',
      '',
      '## Package Architecture & Linked Data Model',
      '',
      '<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">',
      `  <img src="{{ '/assets/images/kgraph-schemas-architecture.jpg' | relative_url }}" alt="${pkg.displayTitle} Ontology Map" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />`,
      '  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">',
      `    <strong>${pkg.displayTitle} (${pkg.namespace})</strong>: High-level package ontology within the RobOS Knowledge Graph. <em>(Click image to zoom full screen)</em>`,
      '  </div>',
      '</div>'
    );

    return lines.join('\n');
  }

  generateSchemaMarkdown(shape, pkg, navOrder) {
    const slug = this.getEntitySlug(shape.targetClass);
    const title = this.getEntityTitle(shape.targetClass);
    const targetClasses = Array.isArray(shape.targetClasses) ? shape.targetClasses : [shape.targetClass];
    const canonicalNode = this.getCanonicalNode(shape.targetClass, pkg.id);

    const lines = [
      '---',
      `title: ${title}`,
      'layout: default',
      `parent: ${pkg.displayTitle}`,
      'grand_parent: KGraph Schemas',
      `nav_order: ${navOrder}`,
      `permalink: /schemas/${pkg.id}/${slug}.html`,
      '---',
      '',
      `# Schema: \`${shape.targetClass}\``,
      '{: .no_toc }',
      '',
      `Formal W3C SHACL constraint shape and OSLC JSON-LD specification for \`${shape.targetClass}\` in the \`${pkg.id}\` package store.`,
      '{: .fs-6 .fw-300 }',
      '',
      '## Table of contents',
      '{: .no_toc .text-delta }',
      '',
      '1. TOC',
      '{:toc}',
      '',
      '---',
      '',
      '## Specification Metadata',
      '',
      `- **RDF / OWL Class**: \`${shape.targetClass}\``,
      `- **Aliases / Target Classes**: ${targetClasses.map(tc => `\`${tc}\``).join(', ')}`,
      `- **SHACL Shape ID**: \`${shape.shapeId}\``,
      `- **Governing Package**: [${pkg.displayTitle}]({{ '/schemas/${pkg.id}.html' | relative_url }}) (\`${pkg.id}\`)`,
      `- **Namespace**: \`${pkg.namespace}\``,
      shape.schemaOrgType ? `- **Schema.org Classification**: [${shape.schemaOrgType}](${shape.schemaOrgType})` : '',
      shape.domainStandard ? `- **Domain De Facto Standard**: [${shape.domainStandard}](${shape.domainStandard})` : '',
      shape.refersFrom ? `- **Upstream Schema Basis (Refers From)**: [${shape.refersFrom}](${shape.refersFrom})` : '',
      '',
      '---',
      '',
      ...(shape.refersFrom || shape.schemaOrgType ? [
        '## Upstream Schema Basis (Refers From) & Global Standards Provenance',
        '',
        `This RobOS schema is modeled after and directly aligns with two levels of global standards:`,
        ...(shape.schemaOrgType ? [`- **Universal Schema.org Class**: [${shape.schemaOrgType}](${shape.schemaOrgType}) (100% interoperability with search engines, web indexers, and general AI reasoning)`] : []),
        ...(shape.domainStandard ? [`- **Specialized Domain Standard**: [${shape.domainStandard}](${shape.domainStandard}) (de facto standard for domain-specific ALM, BDD, or infrastructure operations)`] : []),
        ...(shape.refersFrom ? [`- **Canonical Reference**: [${shape.refersFrom}](${shape.refersFrom})`] : []),
        `- **Agent Guidelines**: When autonomous agents generate, expand, or validate instances of \`${shape.targetClass}\`, they MUST adhere to and base their output on this referred schema object and universal Schema.org parent class, extending it with RobOS SDLC properties.`,
        '',
        '---',
        '',
      ] : []),
      '## Entity Relationship & Schema Context',
      '',
      '<div style="margin: 1.5rem 0; padding: 1.25rem; background: #161b22; border: 1px solid #30363d; border-radius: 8px;">',
      `  <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">`,
      `    <span style="font-size: 1.15rem; font-weight: 700; color: #38bdf8;">${title}</span>`,
      `    <span style="font-family: monospace; background: #121927; color: #00e5ff; border: 1px solid rgba(0, 229, 255, 0.4); padding: 0.2rem 0.6rem; border-radius: 6px; font-size: 0.85rem;">${shape.targetClass}</span>`,
      '  </div>',
      `  <p style="margin-bottom: 0.75rem; font-size: 0.92rem; color: #c9d1d9;">Governed by W3C SHACL shape <code>${shape.shapeId}</code> within the <strong>${pkg.displayTitle}</strong> (<code>${pkg.namespace}</code>) package store.</p>`,
      `  <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">`,
      ...shape.properties.map(p => `    <span style="background: #0d1117; border: 1px solid #21262d; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.8rem; color: #8b949e;"><code>${p.path}</code></span>`),
      '  </div>',
      '</div>',
      '',
      '---',
      '',
      '## Property Constraints & SHACL Rules',
      '',
      '| Property Path | Name | Multiplicity | Data Type | Constraint Rule / Validation Message |',
      '|---|---|---|---|---|',
    ];

    for (const prop of shape.properties) {
      const meta = PROPERTY_METADATA[prop.path] || {
        name: prop.path.replace(/^.*:/, ''),
        type: 'xsd:string',
        description: '',
      };
      const minCount = prop.minCount !== undefined ? prop.minCount : 0;
      const maxCount = prop.maxCount !== undefined ? prop.maxCount : '*';
      const multiplicity = `${minCount}..${maxCount}`;
      const msg = prop.message || `Property ${prop.path} is required`;
      lines.push(`| **\`${prop.path}\`** | ${meta.name} | \`${multiplicity}\` | \`${meta.type}\` | ${msg} |`);
    }

    // Canonical JSON-LD Example
    lines.push(
      '',
      '---',
      '',
      '## Canonical OSLC JSON-LD Example',
      '',
      '```json',
      JSON.stringify(canonicalNode || this.generateSampleNode(shape, pkg), null, 2),
      '```',
      '',
      '---',
      '',
      '## Programmatic SHACL Validation',
      '',
      '```javascript',
      "const { SHACLValidator } = require('/usr/local/share/robos/robos-graph/lib/shacl-validator');",
      "const { OSLCGraphParser, OSLC_CONTEXT } = require('/usr/local/share/robos/robos-graph/lib/oslc-parser');",
      '',
      'const validator = new SHACLValidator();',
      'const result = validator.validateGraph(new OSLCGraphParser({',
      '  "@context": OSLC_CONTEXT,',
      '  "robos:nodes": [',
      JSON.stringify(canonicalNode || this.generateSampleNode(shape, pkg), null, 4).split('\n').map(l => '    ' + l).join('\n'),
      '  ],',
      '}));',
      '',
      'console.log("Conforms:", result.conforms); // Expected: true',
      '```'
    );

    return lines.join('\n');
  }

  generateMermaidForPackage(pkg) {
    const lines = ['graph LR'];
    lines.push(`    subgraph Pkg ["${pkg.displayTitle}"]`);
    for (const shape of pkg.shapes) {
      const name = shape.targetClass.replace(/^.*:/, '');
      lines.push(`        ${name}["${name}<br/><code>${shape.targetClass}</code>"]`);
    }
    lines.push('    end');

    // Add inter-shape edges
    if (pkg.id === 'services') {
      lines.push('    Microservice -->|robos:implementsContract| Contract');
      lines.push('    Requirement -->|robos:validatedBy| Microservice');
    } else if (pkg.id === 'core-platform') {
      lines.push('    BuildSystem -->|robos:hasRemoteExecution| RemoteExecutionCluster["RemoteExecutionCluster<br/>(devops)"]');
      lines.push('    Epic -->|robos:hasTask| Project');
    } else if (pkg.id === 'organization') {
      lines.push('    GitProjectOrganization -->|robos:hasRepository| Repos["Git Repositories"]');
      lines.push('    GitProjectOrganization -->|robos:ownerTeam| Team');
    } else if (pkg.id === 'applications') {
      lines.push('    DesktopApp -->|robos:implementsContract| Contract["Contract (services)"]');
      lines.push('    FrontEndApp -->|robos:implementsContract| Contract');
      lines.push('    ConsoleApp -->|robos:implementsContract| Contract');
    } else if (pkg.id === 'documentation') {
      lines.push('    DocumentationPage -->|robos:hasFlowDiagram| FlowDiagram');
      lines.push('    ArchitectureDecisionRecord -->|robos:hasFlowDiagram| FlowDiagram');
      lines.push('    InteractiveWalkthrough -->|robos:hasFlowDiagram| FlowDiagram');
    }

    return lines.join('\n');
  }

  generateMermaidForSchema(shape, pkg) {
    const name = shape.targetClass.replace(/^.*:/, '');
    const lines = ['graph LR'];
    lines.push(`    ThisNode["${name}<br/><code>${shape.targetClass}</code>"]:::primary`);
    lines.push('    classDef primary fill:#16243b,stroke:#00e5ff,stroke-width:2.5px,color:#ffffff;');

    for (const prop of shape.properties) {
      if (prop.path.startsWith('robos:') && prop.path.match(/(Contract|Team|Project|RemoteExecution|Entity|Repository)/i)) {
        const targetName = prop.path.replace('robos:', '').replace(/^has|^uses|^implements/, '');
        lines.push(`    ThisNode -->|${prop.path}| ${targetName}["${targetName}"]`);
      }
    }

    return lines.join('\n');
  }

  generateSampleNode(shape, pkg) {
    const slug = this.getEntitySlug(shape.targetClass);
    const schemaCurie = shape.schemaOrgType ? `schema:${shape.schemaOrgType.replace('https://schema.org/', '')}` : null;
    const baseTypes = Array.isArray(shape.targetClasses) ? [...shape.targetClasses] : [shape.targetClass];
    const types = [...baseTypes];
    if (schemaCurie && !types.includes(schemaCurie)) {
      types.push(schemaCurie);
    }
    types.push('oslc:Resource');

    const sample = {
      '@id': `urn:robos:${pkg.id}:${slug}-sample`,
      '@type': types,
      'dcterms:title': `Sample ${this.getEntityTitle(shape.targetClass)}`,
      'dcterms:description': `Canonical reference instance for ${shape.targetClass}.`,
      'robos:package': pkg.id,
      'robos:namespace': pkg.namespace,
    };

    for (const prop of shape.properties) {
      if (sample[prop.path] !== undefined) continue;
      if (prop.path === 'robos:repository') sample[prop.path] = 'github.com/acme/sample-repo';
      else if (prop.path === 'robos:ownerTeam') sample[prop.path] = 'urn:robos:team:core-platform';
      else if (prop.path === 'robos:specFile') sample[prop.path] = 'specs/contracts/sample-v1.yaml';
      else if (prop.path === 'robos:protocol') sample[prop.path] = 'OpenAPI 3.1';
      else if (prop.path === 'robos:featureFile') sample[prop.path] = 'tests/bdd/sample.feature';
      else if (prop.path === 'robos:technology') sample[prop.path] = 'Node.js / TypeScript';
      else if (prop.path === 'robos:desktopFramework') sample[prop.path] = 'Electron';
      else if (prop.path === 'robos:frontendFramework') sample[prop.path] = 'React 18';
      else if (prop.path === 'robos:cliCommand') sample[prop.path] = 'robos';
      else if (prop.path === 'robos:platform') sample[prop.path] = 'iOS / Android';
      else if (prop.path === 'robos:gameEngine') sample[prop.path] = 'Unreal Engine 5';
      else if (prop.path === 'robos:targetPlatform') sample[prop.path] = 'Windows / Linux';
      else if (prop.path === 'robos:pipelineEngine') sample[prop.path] = 'Kafka Streams';
      else if (prop.path === 'robos:url') sample[prop.path] = 'https://github.com/acme';
      else if (prop.path === 'robos:orgName') sample[prop.path] = 'acme';
      else if (prop.path === 'robos:forgeType') sample[prop.path] = 'github';
      else if (prop.path === 'robos:executionEndpoint') sample[prop.path] = 'grpc://re-execution.internal:8980';
      else if (prop.path === 'robos:casEndpoint') sample[prop.path] = 'grpc://re-cas.internal:8980';
      else if (prop.path === 'robos:provider') sample[prop.path] = 'buildbarn';
      else if (prop.path === 'robos:buildTool') sample[prop.path] = 'bazel';
      else if (prop.path === 'robos:configFile') sample[prop.path] = '.bazelrc';
      else if (prop.path === 'robos:topic') sample[prop.path] = 'Distributed Architecture';
      else if (prop.path === 'robos:modules') sample[prop.path] = [{ title: 'Module 1: Fundamentals', labFile: 'labs/01.md' }];
      else if (prop.path === 'robos:gitopsFile') sample[prop.path] = '.robos/elearning.yaml';
      else if (prop.path === 'robos:status') sample[prop.path] = 'active';
      else if (prop.path === 'robos:mermaidText') sample[prop.path] = 'sequenceDiagram\n    Client->>API: Request\n    API-->>Client: Response';
      else if (prop.path === 'robos:imagePath') sample[prop.path] = 'assets/images/architecture/sample-flow.jpg';
      else if (prop.path === 'robos:tooltip') sample[prop.path] = 'Hover tooltip summarizing the workflow';
      else if (prop.path === 'robos:slug') sample[prop.path] = slug;
      else if (prop.path === 'robos:docPath') sample[prop.path] = `docs/${slug}.md`;
      else if (prop.path === 'robos:context') sample[prop.path] = 'Architectural drivers and operational context requiring a formal decision.';
      else if (prop.path === 'robos:decision') sample[prop.path] = 'Adopt standardized JSON-LD knowledge graph with SHACL validation.';
      else if (prop.path === 'robos:targetApp') sample[prop.path] = 'remote-execution-studio';
      else if (prop.path === 'robos:language') sample[prop.path] = 'javascript';
      else if (prop.path === 'robos:code') sample[prop.path] = 'const graph = require("robos-graph");';
      else if (prop.path === 'robos:parentTask') sample[prop.path] = 'urn:robos:task:sample-task-1';
      else if (prop.path === 'robos:severity') sample[prop.path] = 'major';
      else if (prop.path === 'robos:startDate') sample[prop.path] = '2026-10-01';
      else if (prop.path === 'robos:endDate') sample[prop.path] = '2026-10-15';
      else if (prop.path === 'robos:targetDate') sample[prop.path] = '2026-11-01';
      else if (prop.path === 'robos:defaultBranch') sample[prop.path] = 'main';
      else if (prop.path === 'robos:branchName') sample[prop.path] = 'feat/new-feature';
      else if (prop.path === 'robos:prNumber') sample[prop.path] = 142;
      else if (prop.path === 'robos:sourceBranch') sample[prop.path] = 'feat/new-feature';
      else if (prop.path === 'robos:targetBranch') sample[prop.path] = 'main';
      else if (prop.path === 'robos:commitSha') sample[prop.path] = '4a8f9c1b2e3d4f5a6b7c8d9e0f1a2b3c4d5e6f7a';
      else if (prop.path === 'robos:tagName') sample[prop.path] = 'v1.0.0';
      else if (prop.path === 'robos:pathPattern') sample[prop.path] = '/api/v1/samples';
      else if (prop.path === 'robos:httpMethod') sample[prop.path] = 'GET';
      else if (prop.path === 'robos:modelName') sample[prop.path] = 'SampleModel';
      else if (prop.path === 'robos:schemaName') sample[prop.path] = 'public';
      else if (prop.path === 'robos:database') sample[prop.path] = 'urn:robos:db:acme-orders-postgres';
      else if (prop.path === 'robos:tableName') sample[prop.path] = 'sample_table';
      else if (prop.path === 'robos:columnName') sample[prop.path] = 'sample_column';
      else if (prop.path === 'robos:dataType') sample[prop.path] = 'varchar(255)';
      else if (prop.path === 'robos:table') sample[prop.path] = 'urn:robos:db-table:sample-table';
      else if (prop.path === 'robos:indexName') sample[prop.path] = 'idx_sample_column';
      else if (prop.path === 'robos:collectionName') sample[prop.path] = 'sample_collection';
      else if (prop.path === 'robos:topicName') sample[prop.path] = 'sample-events-v1';
      else if (prop.path === 'robos:broker') sample[prop.path] = 'urn:robos:broker:acme-kafka';
      else if (prop.path === 'robos:groupId') sample[prop.path] = 'sample-consumer-group';
      else if (prop.path === 'robos:toolName') sample[prop.path] = 'sample_tool';
      else if (prop.path === 'robos:mcpServer') sample[prop.path] = 'urn:robos:mcp:context-engine';
      else if (prop.path === 'robos:uriTemplate') sample[prop.path] = 'sample://resources/{id}';
      else if (prop.path === 'robos:promptName') sample[prop.path] = 'sample_prompt';
      else if (prop.path === 'robos:namespaceName') sample[prop.path] = 'sample-namespace';
      else if (prop.path === 'robos:cluster') sample[prop.path] = 'urn:robos:cluster:prod-us-east-eks';
      else if (prop.path === 'robos:namespace') sample[prop.path] = 'urn:robos:ns:forms-prod';
      else if (prop.path === 'robos:image') sample[prop.path] = 'registry.acme.com/apps/sample:v1.0.0';
      else if (prop.path === 'robos:serviceName') sample[prop.path] = 'sample-service';
      else if (prop.path === 'robos:serviceType') sample[prop.path] = 'ClusterIP';
      else if (prop.path === 'robos:ingressName') sample[prop.path] = 'sample-ingress';
      else if (prop.path === 'robos:host') sample[prop.path] = 'api.acme.internal';
      else if (prop.path === 'robos:stageName') sample[prop.path] = 'build';
      else if (prop.path === 'robos:pipeline') sample[prop.path] = 'urn:robos:pipeline:checkout-service-ci';
      else if (prop.path === 'robos:jobName') sample[prop.path] = 'unit-tests';
      else if (prop.path === 'robos:stage') sample[prop.path] = 'urn:robos:stage:build';
      else if (prop.path === 'robos:stepName') sample[prop.path] = 'run-linter';
      else if (prop.path === 'robos:job') sample[prop.path] = 'urn:robos:job:unit-tests';
      else if (prop.path === 'robos:course') sample[prop.path] = 'urn:robos:elearning:microservices-contracts';
      else if (prop.path === 'robos:module') sample[prop.path] = 'urn:robos:module:sample-module';
      else if (prop.path === 'robos:labFile') sample[prop.path] = 'labs/sample-lab.md';
      else if (prop.path === 'robos:questions') sample[prop.path] = [{ question: 'What is SHACL?', answer: 'Shapes Constraint Language' }];
      else if (prop.path === 'robos:sectionId') sample[prop.path] = 'overview';
      else if (prop.path === 'robos:docPage') sample[prop.path] = 'urn:robos:doc:architecture-overview';
      else if (prop.path === 'robos:adr') sample[prop.path] = 'urn:robos:adr:001-modular-kgraph';
      else if (prop.path === 'robos:steps') sample[prop.path] = [{ keyword: 'Given', stepText: 'a running service' }];
      else if (prop.path === 'robos:keyword') sample[prop.path] = 'Given';
      else if (prop.path === 'robos:stepText') sample[prop.path] = 'the system is initialized';
      else if (prop.path === 'robos:routePath') sample[prop.path] = '/dashboard';
      else if (prop.path === 'robos:app') sample[prop.path] = 'urn:robos:app:dev-central';
      else if (prop.path === 'robos:commandName') sample[prop.path] = 'validate';
      else if (prop.path === 'robos:flagName') sample[prop.path] = '--output';
      else if (prop.path === 'robos:command') sample[prop.path] = 'urn:robos:cli:validate';
      else if (prop.path === 'robos:inFeature') sample[prop.path] = 'urn:robos:gherkin:sample-feature';
      else if (prop.path === 'robos:examplesTable') sample[prop.path] = 'urn:robos:examples:sample-table';
      else if (prop.path === 'robos:tableHeaders') sample[prop.path] = ['col1', 'col2'];
      else if (prop.path === 'robos:tableRows') sample[prop.path] = [['val1', 'val2']];
      else if (prop.path === 'robos:regexPattern') sample[prop.path] = '^user clicks (.*)$';
      else if (prop.path === 'robos:codeFile') sample[prop.path] = 'tests/steps/sample_steps.js';
      else if (prop.path === 'robos:step') sample[prop.path] = 'urn:robos:step:sample-step';
      else if (prop.path === 'robos:content') sample[prop.path] = 'sample docstring content';
      else if (prop.path === 'robos:testingType') sample[prop.path] = 'bdd';
      else if (prop.path === 'robos:testFramework') sample[prop.path] = 'cucumber';
      else if (prop.path === 'oslc_qm:executionStatus') sample[prop.path] = 'PASS';
      else if (prop.path === 'oslc_qm:reportsOnTestCase') sample[prop.path] = 'urn:robos:scenario:sample-scenario';
      else if (prop.path === 'robos:testsService') sample[prop.path] = 'urn:robos:service:billing-api';
    }

    if (shape.schemaOrgType) {
      sample['robos:schemaOrgType'] = shape.schemaOrgType;
    }
    if (shape.domainStandard) {
      sample['robos:domainStandard'] = shape.domainStandard;
    }
    if (shape.refersFrom) {
      sample['robos:refersFrom'] = shape.refersFrom;
    }

    return sample;
  }
}

module.exports = { SchemaDocGenerator, PROPERTY_METADATA, PACKAGE_DISPLAY_TITLES, ENTITY_OVERRIDES };
