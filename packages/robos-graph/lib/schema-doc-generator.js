'use strict';

const fs = require('fs');
const path = require('path');
const { BUILTIN_SHACL_SHAPES, SHACLValidator } = require('./shacl-validator');
const { DEFAULT_PACKAGES, KGraphPackageManager } = require('./package-manager');
const { OSLC_CONTEXT } = require('./oslc-parser');
const { resolveSchemaElement, CATALOG } = require('./classification');

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
  'robos:appTemplate': {
    name: 'App Template',
    type: 'xsd:string',
    description: "RobOS scaffold template and version the app was generated from (e.g. `robos:template:nextjs-vercel-web@1`).",
  },
  'robos:hostingPlatform': {
    name: 'Hosting Platform',
    type: 'xsd:string',
    description: "Where production runs (`Vercel`, `Netlify`, `Cloudflare Pages`, `Kubernetes`).",
  },
  'robos:productionUrl': {
    name: 'Production URL',
    type: 'xsd:string',
    description: "Canonical public URL of the production site (`https://www...`).",
  },
  'robos:databaseEngine': {
    name: 'Database Engine',
    type: 'xsd:string',
    description: "Primary datastore (e.g. `Neon serverless Postgres (PGlite locally)`).",
  },
  'robos:authStrategy': {
    name: 'Auth Strategy',
    type: 'xsd:string',
    description: "How users sign in (e.g. email + password with server-side sessions, OAuth).",
  },
  'robos:abuseControls': {
    name: 'Abuse Controls',
    type: 'xsd:string',
    description: "Abuse/bot protections in place (rate limits, honeypot, CSRF, CSP, audit log).",
  },
  'robos:captchaProvider': {
    name: 'CAPTCHA Provider',
    type: 'xsd:string',
    description: "CAPTCHA integration and state (e.g. `reCAPTCHA v3 (wired, disabled)`).",
  },
  'robos:crawlerPolicy': {
    name: 'Crawler Policy',
    type: 'xsd:string',
    description: "robots.txt policy for search engines, AI search/agents and link-preview bots, and blocked paths.",
  },
  'robos:sitemapUrl': {
    name: 'Sitemap URL',
    type: 'xsd:string',
    description: "Public XML sitemap URL submitted to search engines.",
  },
  'robos:llmsTxtUrl': {
    name: 'llms.txt URL',
    type: 'xsd:string',
    description: "Plain-text `/llms.txt` summary published for LLM agents.",
  },
  'robos:structuredData': {
    name: 'Structured Data',
    type: 'xsd:string',
    description: "schema.org JSON-LD types the site emits (e.g. `schema:WebApplication`, `schema:MusicEvent`).",
  },
  'robos:e2eEvidence': {
    name: 'E2E Evidence',
    type: 'xsd:string',
    description: "Where Cucumber/Playwright end-to-end evidence videos live (path or published URL).",
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
  'robos:commentId': {
    name: 'Comment Identifier',
    type: 'xsd:string',
    description: 'Unique identifier for the comment or discussion note.',
  },
  'robos:associatedWorkItem': {
    name: 'Associated Work Item',
    type: 'URI (robos:Project | robos:Feature | robos:Task | robos:PullRequest)',
    description: 'Target project, feature, task, or pull request associated with the discussion thread.',
  },
  'robos:threadType': {
    name: 'Discussion Thread Type',
    type: 'xsd:string',
    description: 'Category of discussion (work-item, pr-review, architecture, inline-code).',
  },
  'robos:commentCount': {
    name: 'Comment Count',
    type: 'xsd:integer',
    description: 'Total number of comments within the discussion thread.',
  },
  'robos:lastActivityAt': {
    name: 'Last Activity Timestamp',
    type: 'xsd:dateTime',
    description: 'ISO-8601 timestamp of most recent activity in the thread.',
  },
  'robos:createdAt': {
    name: 'Created At Timestamp',
    type: 'xsd:dateTime',
    description: 'ISO-8601 timestamp when comment was authored.',
  },
  'robos:parentItem': {
    name: 'Parent Item / Thread',
    type: 'URI (robos:DiscussionThread | robos:Task | robos:PullRequest | robos:Comment)',
    description: 'Parent entity hosting this comment.',
  },
  'robos:sourceServer': {
    name: 'Source Server',
    type: 'URI (robos:TaskServer) | xsd:string',
    description: 'Source forge or task server (GitHub, Jira, GitLab).',
  },
  'robos:sourceType': {
    name: 'Source Type',
    type: 'xsd:string',
    description: 'Originating entity type (github-issue, github-pr, jira-comment).',
  },
  'robos:pullRequest': {
    name: 'Pull Request',
    type: 'URI (robos:PullRequest)',
    description: 'Parent pull request hosting the code review comment.',
  },
  'robos:filePath': {
    name: 'File Path',
    type: 'xsd:string',
    description: 'Source file path subject to code review comment.',
  },
  'robos:lineNumber': {
    name: 'Line Number',
    type: 'xsd:integer',
    description: 'Source code line number commented on.',
  },
  'robos:diffHunk': {
    name: 'Diff Hunk Context',
    type: 'xsd:string',
    description: 'Unified diff snippet surrounding the code review comment.',
  },
  'robos:fileUrl': {
    name: 'File URL / Path',
    type: 'xsd:anyURI',
    description: 'URI or relative filesystem path to media attachment, screenshot, or log.',
  },
  'robos:fileSize': {
    name: 'File Size',
    type: 'xsd:integer',
    description: 'Attachment file size in bytes.',
  },
};

// Classification annotations come from the shared catalog.
PROPERTY_METADATA['robos:classification'] = {
  name: 'SDLC Classification', type: 'URI (schema:CategoryCode)',
  description: 'A reference to a registered code in the RobOS-owned SDLC classification set.',
};
PROPERTY_METADATA['robos:classificationOrigin'] = {
  name: 'Classification Origin', type: 'xsd:string',
  description: 'declared or inferred; persisted inference is checked against current class metadata.',
};
for (const [id, metadata] of Object.entries(PROPERTY_METADATA)) metadata['robos:classification'] = resolveSchemaElement(id);
const classificationLabels = id => resolveSchemaElement(id).map(ref => CATALOG.find(code => code.id === ref['@id']).label).join(', ');

// Package display titles for Just the Docs navigation. A page's `parent:` must equal
// its parent's `title:`, and titles must be unique across the whole docs site. They are kept
// short so the sidebar does not wrap; each page's heading adds the namespace.
const PACKAGE_DISPLAY_TITLES = {
  'core-platform': 'Core Platform',
  'organization': 'Organization & Teams',
  'services': 'Services & Contracts',
  'applications': 'Applications',
  'devops': 'DevOps & Cloud',
  'learning': 'eLearning',
  'documentation': 'Documentation & Diagrams',
  'testing': 'Testing & BDD',
  'game': 'Games: Rules',
  'crpg': 'Games: cRPG',
  'tabletop-game': 'Games: Tabletop',
};

// The game packages are listed together as one family on the hub and cross-linked from
// each other's pages. `infinity-engine` has no shapes of its own, so it has no page group
// here; the hub row for it points at the game documentation instead.
const GAME_PACKAGE_IDS = ['game', 'crpg', 'tabletop-game'];
const NOTES_ONLY_PACKAGES = [
  {
    id: 'infinity-engine',
    namespace: 'robos.infinity',
    displayTitle: 'Games: Infinity Engine',
    description: 'No classes of its own. Architecture notes on GemRB, the open-source Infinity Engine that the cRPG follows: engine subsystems, file-format contracts and decision records, typed with classes documented in other packages.',
    sitePath: '/knowledge-graph.html#game-packages',
  },
];

// Packages that exist in .robos/kgraph.yaml but are not in DEFAULT_PACKAGES. Only the
// game-domain shapes listed in SHAPE_PACKAGE_OVERRIDES are documented under them.
const EXTRA_DOC_PACKAGES = [
  { id: 'game', namespace: 'robos.game' },
  { id: 'crpg', namespace: 'robos.crpg' },
  { id: 'tabletop-game', namespace: 'robos.tabletop' },
];

const DOC_PACKAGE_DESCRIPTIONS = {
  'core-platform': 'Databases, message brokers, search indexes, MCP servers, build systems, context sources, prompt strategies and source declarations.',
  'organization': 'Teams, projects and work items, Git organizations, repositories, branches, pull requests and commits, agent personas, task servers and review comments.',
  'services': 'Microservices, API contracts (OpenAPI, Protobuf, GraphQL), endpoints, data models, requirements and features.',
  'applications': 'Front-end, desktop, console and mobile applications, games, libraries, web routes, CLI commands and voice commands.',
  'devops': 'Kubernetes clusters, environments, GitOps deployments, CI/CD pipelines, remote-execution clusters and data pipelines.',
  'learning': 'eLearning courses, modules, lessons, labs, quizzes, completion certificates and agent skills.',
  'documentation': 'Documentation pages, architecture decision records, flow diagrams, walkthroughs and code snippets.',
  'testing': 'Gherkin features, scenarios, step definitions, test plans, suites, execution records, testing libraries and game test scenarios.',
  'game': 'Rules-engine building blocks shared by games: games, classes, items, spells and monsters.',
  'crpg': 'Party-based tactical cRPG content: abilities, campaigns, map transitions, game events and story flows.',
  'tabletop-game': 'Tabletop dungeon-crawler content: heroes, monsters, summons, quest maps, turn steps and AI directives.',
};

// Classes that the type-name heuristics in package-manager.js would place in the wrong
// group. Existing classes keep their original group so their page URLs do not change.
const SHAPE_PACKAGE_OVERRIDES = {};
for (const name of ['CRPGAbility', 'CRPGGameEvent', 'CRPGCampaign', 'CRPGMapTransition', 'CRPGStoryFlow', 'CRPGStoryNode']) {
  SHAPE_PACKAGE_OVERRIDES[`robos:${name}`] = 'crpg';
}
for (const name of ['Game', 'GameClass', 'GameMonster', 'GameItem', 'GameSpell']) {
  SHAPE_PACKAGE_OVERRIDES[`robos:${name}`] = 'game';
}
for (const name of [
  'TabletopGame', 'TabletopHero', 'TabletopMonster', 'TabletopSummon', 'TabletopQuestMap', 'TabletopMapConfiguration',
  'TabletopTurnDAG', 'TabletopTurnStep', 'TabletopAIEngine', 'TabletopAIDirective', 'TabletopCombatant', 'TabletopAICommand',
]) {
  SHAPE_PACKAGE_OVERRIDES[`robos:${name}`] = 'tabletop-game';
}
SHAPE_PACKAGE_OVERRIDES['robos:VoiceCommand'] = 'applications';

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

// Front matter values: quote anything that is not plain words and digits (for example a
// title with "&", ":" or parentheses) so the YAML always parses.
const yamlValue = text => (/^[A-Za-z0-9 ]+$/.test(text) ? text : JSON.stringify(text));
// Markdown table cells cannot contain a raw pipe or a line break.
const tableCell = text => String(text == null ? '' : text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const siteLink = (label, sitePath) => `[${label}]({{ '${sitePath}' | relative_url }})`;
const htmlEscape = text => String(text == null ? '' : text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const schemaOrgCurie = url => String(url).replace('https://schema.org/', 'schema:');
// One shape declares an OSLC URL where a Schema.org type is expected; only real
// Schema.org URLs are shown in Schema.org columns.
const isSchemaOrg = url => typeof url === 'string' && url.startsWith('https://schema.org/');

// Short label for a standards URL: OSLC, Cucumber, C4 and similar get a name, anything
// else shows the host so a reader can see where the link goes.
function standardLabel(url) {
  if (url.includes('open-services.net/ns/')) return `OSLC ${url.split('#')[0].split('/').pop().toUpperCase()}`;
  if (url.includes('cucumber.io')) return 'Cucumber';
  if (url.includes('w3id.org/c4') || url.includes('c4model.com')) return 'C4 model';
  if (url.includes('openapis.org')) return 'OpenAPI 3.1';
  if (url.includes('kubernetes.io')) return 'Kubernetes';
  if (url.includes('modelcontextprotocol.io')) return 'MCP specification';
  if (url.includes('kafka.apache.org')) return 'Apache Kafka';
  if (url.includes('schema.org')) return schemaOrgCurie(url);
  try { return new URL(url).hostname; } catch { return url; }
}
const standardLink = url => `[${standardLabel(url)}](${url})`;

class SchemaDocGenerator {
  constructor(options = {}) {
    this.rootDir = options.rootDir || process.cwd();
    this.kgraphDir = options.kgraphDir || path.join(this.rootDir, '.robos');
    this.docsDir = options.docsDir || path.join(this.rootDir, 'docs');
    this.outputDir = options.outputDir || path.join(this.docsDir, 'schemas');
    // Read-only: generating docs must never write into .robos.
    this.packageManager = new KGraphPackageManager({ baseDir: this.kgraphDir, readOnly: true });
    this.validator = new SHACLValidator();
  }

  getSchemaPackage(targetClass) {
    if (SHAPE_PACKAGE_OVERRIDES[targetClass]) return SHAPE_PACKAGE_OVERRIDES[targetClass];
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

  // First node of the class in the given package (kept for callers that want one node).
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

  // Picks a real node of this class from the checked-in graph (.robos/kgraphs) that passes
  // the validator. Prefers the shape's own package, then the node that fills the most of the
  // shape's properties, then the shortest. Returns null when no stored node qualifies.
  findExampleNode(shape, pkgId) {
    const paths = new Set(shape.properties.map(p => p.path));
    const candidates = [];
    for (const { id } of this.packageManager.listPackages()) {
      const pkg = this.packageManager.getPackage(id);
      for (const node of (pkg && pkg.nodes) || []) {
        const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type'] || ''];
        if (!types.includes(shape.targetClass)) continue;
        if (!this.validator.validate([node]).conforms) continue;
        candidates.push({
          node,
          packageId: id,
          filled: Object.keys(node).filter(key => paths.has(key)).length,
          size: JSON.stringify(node).length,
        });
      }
    }
    candidates.sort((a, b) =>
      (b.packageId === pkgId) - (a.packageId === pkgId) || b.filled - a.filled || a.size - b.size);
    return candidates.length ? candidates[0] : null;
  }

  // The example shown on a schema page, with where it came from.
  getExample(shape, pkg) {
    const found = this.findExampleNode(shape, pkg.id);
    if (found) return { node: found.node, origin: 'graph', packageId: found.packageId };
    return { node: this.generateSampleNode(shape, pkg), origin: 'placeholder', packageId: pkg.id };
  }

  getDocPackages() {
    return [
      ...DEFAULT_PACKAGES.map(pkg => ({ ...pkg })),
      ...EXTRA_DOC_PACKAGES.map(pkg => ({ ...pkg })),
    ];
  }

  generateAll() {
    fs.mkdirSync(this.outputDir, { recursive: true });

    // Group SHACL shapes by package
    const packageMap = new Map();
    for (const pkg of this.getDocPackages()) {
      packageMap.set(pkg.id, {
        ...pkg,
        displayTitle: PACKAGE_DISPLAY_TITLES[pkg.id] || pkg.title,
        description: DOC_PACKAGE_DESCRIPTIONS[pkg.id] || pkg.description || '',
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
      'title: Schemas',
      'layout: default',
      'parent: Build on RobOS',
      'nav_order: 2',
      'has_children: true',
      'permalink: /schemas.html',
      '---',
      '',
      '# Schemas',
      '{: .no_toc }',
      '',
      'Reference for the node types (classes) in the RobOS knowledge graph. Use it to see which properties a node needs before you add it, and what the validator rejects.',
      '{: .fs-6 }',
      '',
      '<details open markdown="block">',
      '  <summary>On this page</summary>',
      '  {: .text-delta }',
      '1. TOC',
      '{:toc}',
      '</details>',
      '',
      '## What these pages describe',
      '',
      'Each class page documents one shape. A shape is a rule set in `packages/robos-graph/lib/shacl-validator.js` that applies to nodes of one class, such as `robos:Microservice`. For every property it lists the minimum and maximum number of values and the message shown when the rule fails.',
      '',
      'The built-in validator checks counts only. It confirms that required properties are present and that single-valued properties have at most one value. It does not check datatypes or value formats, and it is not a complete W3C SHACL implementation.',
      '',
      'Classes are grouped by package, the same way the graph is stored on disk (see [Knowledge graph]({{ site.baseurl }}{% link knowledge-graph.md %})). The grouping here is a documentation aid. The `robos:package` property on each node decides where the node is stored, and one class can have nodes in more than one package.',
      '',
      'Every shape also records the upstream definition it follows: a Schema.org type and, where one applies, a domain standard such as OSLC, the C4 model or Cucumber.',
      '',
      '## Packages and classes',
      '',
      'One row per package, with the classes it documents. Class names drop the `robos:` prefix. Open a class for its property rules, the Schema.org type and standard it follows, and an example node.',
      '',
    ];

    const standardIds = [...packageMap.keys()].filter(id => !GAME_PACKAGE_IDS.includes(id));
    lines.push('<div class="rb-classlist">');
    lines.push('  <div class="rb-classlist-label">Standard packages</div>');
    for (const pkgId of standardIds) lines.push(...this.renderPackageRow(pkgId, packageMap.get(pkgId)));
    lines.push('  <div class="rb-classlist-label">Games</div>');
    for (const pkgId of GAME_PACKAGE_IDS) {
      if (packageMap.has(pkgId)) lines.push(...this.renderPackageRow(pkgId, packageMap.get(pkgId)));
    }
    for (const notes of NOTES_ONLY_PACKAGES) lines.push(...this.renderNotesRow(notes));
    lines.push('</div>', '');

    // Game-flavoured classes that are documented with the package they serve (PCGame under
    // Applications, the cRPG and tabletop test scenarios under Testing) rather than under Games.
    const strayGameClasses = [];
    for (const [pkgId, pkg] of packageMap.entries()) {
      if (GAME_PACKAGE_IDS.includes(pkgId)) continue;
      const hits = pkg.shapes.filter(shape => /^robos:(CRPG|Tabletop|InfinityAI|PCGame|MobileGame)/.test(shape.targetClass));
      if (!hits.length) continue;
      const links = hits.map(shape => siteLink(`\`${shape.targetClass.replace(/^robos:/, '')}\``, `/schemas/${pkgId}/${this.getEntitySlug(shape.targetClass)}.html`));
      strayGameClasses.push(`${links.join(', ')} under ${siteLink(pkg.displayTitle, `/schemas/${pkgId}.html`)}`);
    }

    lines.push(
      '## Game packages',
      '',
      'Games are modeled in four packages. `game` holds what every game shares: rulesets (D&D 5e SRD, HeroQuest, D20), dice systems, classes, items and spells. `crpg` holds the content of the Realm of Heroes cRPG and `tabletop-game` the HeroQuest-style tabletop game. Their nodes carry the generic `robos:Game*` type next to their own, so a `robos:CRPGItem` is also a `robos:GameItem` and a query for the generic type finds items from both games.',
      '',
      ...(strayGameClasses.length ? [`Some game classes are documented with the package they serve instead of under Games: ${strayGameClasses.join('; ')}.`, ''] : []),
      `\`infinity-engine\` describes the engine the cRPG follows. It defines no classes, so it has no page group here. The Realm of Heroes node links to it with \`robos:engineArchitecture\`, and its own nodes use C4 components plus classes documented under [Services & Contracts]({{ '/schemas/services.html' | relative_url }}) and [Documentation & Diagrams]({{ '/schemas/documentation.html' | relative_url }}). [Knowledge graph]({{ site.baseurl }}{% link knowledge-graph.md %}#game-packages) shows how the four packages connect, and [Game development]({{ site.baseurl }}{% link game-development.md %}) covers the games themselves.`,
      ''
    );

    lines.push(
      '## Check a node against a shape',
      '',
      'Save one node as `node.json` in the repository root, for example the example from a class page. Then run:',
      '',
      '```bash',
      `node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); const r = new SHACLValidator().validate([require('./node.json')]); console.log(r.conforms, r.results)"`,
      '```',
      '',
      'The command prints `true` and an empty list when the node meets every rule for its types. Otherwise it prints `false` and one entry per failed rule. The `kgraph validate` and `kgraph insert` commands run the same checks.',
      '',
      '## Ontology file',
      '',
      `${siteLink('`ontology.jsonld`', '/schemas/ontology.jsonld')} lists classes with their Schema.org parent class and shape id. The same file is kept at \`.robos/ontology.jsonld\`. \`node scripts/sync-classification-ontology.js\` updates both; it stops with an error for any class that has no classification code. This generator does not touch the ontology, so the file can lag behind the shapes listed here.`,
      '',
      '## Regenerate these pages',
      '',
      'This section and every page under it are generated. Do not edit them by hand. Change the generator, `packages/robos-graph/lib/schema-doc-generator.js`, or the shapes, then run:',
      '',
      '```bash',
      'node scripts/generate-kgraph-schema-docs.js',
      '```',
      ''
    );

    return lines.join('\n');
  }

  // One row of the hub list: package link, namespace and class count on the left, a one-line
  // description and alphabetical class chips on the right. Plain HTML keeps the list compact.
  renderPackageRow(pkgId, pkg) {
    const href = `{{ '/schemas/${pkgId}.html' | relative_url }}`;
    const chips = [...pkg.shapes]
      .sort((a, b) => a.targetClass.localeCompare(b.targetClass, 'en', { sensitivity: 'base' }))
      .map(shape => {
        const label = shape.targetClass.replace(/^robos:/, '');
        const classHref = `{{ '/schemas/${pkgId}/${this.getEntitySlug(shape.targetClass)}.html' | relative_url }}`;
        return `<a href="${classHref}" title="${htmlEscape(shape.targetClass)}">${htmlEscape(label)}</a>`;
      });
    return [
      '  <div class="rb-classlist-row">',
      `    <div class="rb-classlist-pkg"><a href="${href}">${htmlEscape(pkg.displayTitle)}</a><code>${htmlEscape(pkg.namespace)}</code><span>${pkg.shapes.length} classes</span></div>`,
      '    <div class="rb-classlist-body">',
      `      <p class="rb-classlist-desc">${htmlEscape(pkg.description)}</p>`,
      `      <p class="rb-classlist-chips">${chips.join(' ')}</p>`,
      '    </div>',
      '  </div>',
    ];
  }

  // A package with no shapes of its own: same row layout, linking to the page that covers it.
  renderNotesRow(notes) {
    const href = `{{ '${notes.sitePath}' | relative_url }}`;
    return [
      '  <div class="rb-classlist-row">',
      `    <div class="rb-classlist-pkg"><a href="${href}">${htmlEscape(notes.displayTitle)}</a><code>${htmlEscape(notes.namespace)}</code><span>no classes</span></div>`,
      '    <div class="rb-classlist-body">',
      `      <p class="rb-classlist-desc">${htmlEscape(notes.description)}</p>`,
      '    </div>',
      '  </div>',
    ];
  }

  // Cross-links between the game packages so none of them stands alone.
  renderGameFamilyNote(pkg) {
    if (!GAME_PACKAGE_IDS.includes(pkg.id)) return [];
    const siblings = GAME_PACKAGE_IDS.filter(id => id !== pkg.id)
      .map(id => siteLink(PACKAGE_DISPLAY_TITLES[id], `/schemas/${id}.html`));
    return [
      `This package is one of the game packages. See also ${siblings.join(' and ')}, the Infinity Engine notes under ${siteLink('Game packages', '/knowledge-graph.html#game-packages')} and the games themselves in ${siteLink('Game development', '/game-development.html')}.`,
      '',
    ];
  }

  generatePackageMarkdown(pkg, navOrder) {
    const lines = [
      '---',
      `title: ${yamlValue(pkg.displayTitle)}`,
      'layout: default',
      'parent: Schemas',
      `nav_order: ${navOrder}`,
      'has_children: true',
      `permalink: /schemas/${pkg.id}.html`,
      '---',
      '',
      `# ${pkg.displayTitle} (${pkg.namespace})`,
      '{: .no_toc }',
      '',
      `${pkg.description}`,
      '{: .fs-6 }',
      '',
      '| Detail | Value |',
      '|---|---|',
      `| Package id | \`${pkg.id}\` |`,
      `| Namespace | \`${pkg.namespace}\` |`,
      `| Package file | \`.robos/kgraphs/${pkg.id}/package.jsonld\` |`,
      `| Classes documented | ${pkg.shapes.length} |`,
      '',
      ...this.renderGameFamilyNote(pkg),
      '## Classes',
      '',
      'Required properties are the ones with a minimum count of 1 or more. A node that lacks one fails validation.',
      '',
      '| Class | Node type | Required properties |',
      '|---|---|---|',
    ];

    for (const shape of pkg.shapes) {
      const slug = this.getEntitySlug(shape.targetClass);
      const title = this.getEntityTitle(shape.targetClass);
      const link = siteLink(tableCell(title), `/schemas/${pkg.id}/${slug}.html`);
      const required = shape.properties.filter(p => p.minCount >= 1).map(p => `\`${p.path}\``).join(', ') || 'none';
      lines.push(`| ${link} | \`${shape.targetClass}\` | ${required} |`);
    }

    lines.push('');
    return lines.join('\n');
  }

  generateSchemaMarkdown(shape, pkg, navOrder) {
    const slug = this.getEntitySlug(shape.targetClass);
    const title = this.getEntityTitle(shape.targetClass);
    const targetClasses = Array.isArray(shape.targetClasses) ? shape.targetClasses : [shape.targetClass];
    const aliases = targetClasses.filter(tc => tc !== shape.targetClass);
    const example = this.getExample(shape, pkg);

    const detailRows = [
      ['Class', `\`${shape.targetClass}\``],
      aliases.length ? ['Also matches', aliases.map(tc => `\`${tc}\``).join(', ')] : null,
      ['Shape id', `\`${shape.shapeId}\``],
      ['Package', `${siteLink(tableCell(pkg.displayTitle), `/schemas/${pkg.id}.html`)} (\`${pkg.id}\`)`],
      classificationLabels(shape.targetClass) ? ['Classification', classificationLabels(shape.targetClass)] : null,
      isSchemaOrg(shape.schemaOrgType) ? ['Schema.org type', `[\`${schemaOrgCurie(shape.schemaOrgType)}\`](${shape.schemaOrgType})`] : null,
      shape.domainStandard && (shape.domainStandard !== shape.schemaOrgType || !isSchemaOrg(shape.schemaOrgType)) ? ['Domain standard', standardLink(shape.domainStandard)] : null,
      shape.refersFrom && shape.refersFrom !== shape.schemaOrgType && shape.refersFrom !== shape.domainStandard ? ['Upstream reference', standardLink(shape.refersFrom)] : null,
    ].filter(Boolean);

    const lines = [
      '---',
      `title: ${yamlValue(title)}`,
      'layout: default',
      `parent: ${yamlValue(pkg.displayTitle)}`,
      'grand_parent: Schemas',
      `nav_order: ${navOrder}`,
      `permalink: /schemas/${pkg.id}/${slug}.html`,
      '---',
      '',
      `# ${shape.targetClass}`,
      '{: .no_toc }',
      '',
      `Validation shape for \`${shape.targetClass}\` nodes in the \`${pkg.id}\` package group.`,
      '{: .fs-6 }',
      '',
      '## Details',
      '',
      '| Detail | Value |',
      '|---|---|',
      ...detailRows.map(([label, value]) => `| ${label} | ${value} |`),
      '',
      '## Properties',
      '',
      'Count is the minimum and maximum number of values (`*` means no maximum). The validator enforces both. The type column is documentation only; the validator does not check types.',
      '',
      '| Property | Count | Type | Rule or description |',
      '|---|---|---|---|',
    ];

    for (const prop of shape.properties) {
      const meta = PROPERTY_METADATA[prop.path];
      const minCount = prop.minCount !== undefined ? prop.minCount : 0;
      const maxCount = prop.maxCount !== undefined ? prop.maxCount : '*';
      const type = meta ? `\`${tableCell(meta.type)}\`` : '-';
      const note = prop.message || (meta && meta.description) || '';
      lines.push(`| \`${prop.path}\` | \`${minCount}..${maxCount}\` | ${type} | ${tableCell(note)} |`);
    }

    const fileName = `.robos/kgraphs/${example.packageId}/package.jsonld`;
    const exampleIntro = example.origin === 'graph'
      ? `This node comes from \`${fileName}\` in the RobOS repository. That graph holds sample data for a fictional company, so treat the values as illustrations.`
      : 'The checked-in graph has no node of this class that passes the validator, so this is a placeholder built from the shape. It has every required property, with example values. It is not a node from the graph.';

    lines.push(
      '',
      '## Example node',
      '',
      exampleIntro,
      '',
      '{% raw %}',
      '```json',
      JSON.stringify(example.node, null, 2),
      '```',
      '{% endraw %}',
      '',
      '## Validate the example',
      '',
      'Save the example as `node.json` in the repository root, then run:',
      '',
      '```bash',
      `node -e "const { SHACLValidator } = require('./packages/robos-graph/lib/shacl-validator'); console.log(new SHACLValidator().validate([require('./node.json')]).conforms)"`,
      '```',
      '',
      'The command prints `true` when the node meets every rule for its types.',
      ''
    );

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
      'dcterms:description': `Placeholder node for ${shape.targetClass}.`,
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
      else if (prop.path === 'robos:appTemplate') sample[prop.path] = "robos:template:nextjs-vercel-web@1";
      else if (prop.path === 'robos:hostingPlatform') sample[prop.path] = "Vercel";
      else if (prop.path === 'robos:productionUrl') sample[prop.path] = "https://www.example.com";
      else if (prop.path === 'robos:databaseEngine') sample[prop.path] = "Neon serverless Postgres (PGlite locally)";
      else if (prop.path === 'robos:authStrategy') sample[prop.path] = "Email + password, server-side sessions";
      else if (prop.path === 'robos:abuseControls') sample[prop.path] = "rate-limits, honeypot, same-origin-csrf, csp, audit-log";
      else if (prop.path === 'robos:captchaProvider') sample[prop.path] = "reCAPTCHA v3 (wired, disabled)";
      else if (prop.path === 'robos:crawlerPolicy') sample[prop.path] = "Search engines + AI agents allowed on public pages; /api, /dashboard disallowed";
      else if (prop.path === 'robos:sitemapUrl') sample[prop.path] = "https://www.example.com/sitemap.xml";
      else if (prop.path === 'robos:llmsTxtUrl') sample[prop.path] = "https://www.example.com/llms.txt";
      else if (prop.path === 'robos:structuredData') sample[prop.path] = "schema:Organization, schema:WebSite, schema:WebApplication";
      else if (prop.path === 'robos:e2eEvidence') sample[prop.path] = "docs/assets/videos/example/example-e2e-evidence-reel.mp4";
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

    // Every required property gets a value, so the placeholder passes the validator.
    for (const prop of shape.properties) {
      if (prop.minCount >= 1 && sample[prop.path] === undefined) {
        sample[prop.path] = `<${prop.path.replace(/^.*:/, '')}>`;
      }
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

module.exports = {
  SchemaDocGenerator,
  PROPERTY_METADATA,
  PACKAGE_DISPLAY_TITLES,
  ENTITY_OVERRIDES,
  EXTRA_DOC_PACKAGES,
  SHAPE_PACKAGE_OVERRIDES,
  yamlValue,
};
