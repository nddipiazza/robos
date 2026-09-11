/* RobOS-owned SDLC codes expressed with Schema.org classification vocabulary.
 * This file is the same implementation in Node and the Electron/browser UI. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RobosClassification = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const NS = 'https://robos.dev/ns/sdlc#';
  const CODE_SET_ID = NS + 'SDLCClassification';
  const PREFIXES = { robos: NS, schema: 'https://schema.org/', oslc_rm: 'http://open-services.net/ns/rm#', oslc_cm: 'http://open-services.net/ns/cm#', oslc_qm: 'http://open-services.net/ns/qm#', oslc: 'http://open-services.net/ns/core#', c4: 'https://c4model.com/ns#', dcterms: 'http://purl.org/dc/terms/', rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', rdfs: 'http://www.w3.org/2000/01/rdf-schema#', sh: 'http://www.w3.org/ns/shacl#', owl: 'http://www.w3.org/2002/07/owl#' };
  const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  const array = value => value == null ? [] : Array.isArray(value) ? value : [value];
  const compact = value => {
    const id = typeof value === 'string' ? value : value && value['@id'];
    if (typeof id !== 'string') return '';
    for (const [prefix, uri] of Object.entries(PREFIXES)) if (id.startsWith(uri)) return prefix + ':' + id.slice(uri.length);
    return id;
  };
  // Explicit class membership, never local-name or substring guessing.
  const DEFINITIONS = [
    ['services', 'Services & processing', 'Microservice DataPipeline'],
    ['applications', 'Applications & entry points', 'DesktopApp ConsoleApp MobileApp FrontEndApp PCGame MobileGame WebRoute CLICommand CLIFlag'],
    ['contracts', 'Contracts & data models', 'Contract ProtobufContract GraphQLContract APIEndpoint DataModel Entity'],
    ['data', 'Data stores & messaging', 'Database NoSQLDatabase MessageBroker DatabaseSchema DatabaseTable DatabaseColumn DatabaseIndex NoSQLCollection MessageTopic ConsumerGroup DataStore BrokerDefinition'],
    ['libraries', 'Libraries & build systems', 'Library BuildSystem'],
    ['infrastructure', 'Infrastructure & delivery', 'RemoteExecutionCluster KubernetesCluster Environment GitOpsDeployment CICDPipeline KubernetesNamespace KubernetesDeployment KubernetesService KubernetesIngress PipelineStage PipelineJob PipelineStep EnvironmentProfile DevOpsIntegration PassCredential'],
    ['organization', 'Organization & people', 'Team Company GitProjectOrganization'],
    ['work', 'Projects & work items', 'Project Epic Feature UserStory Task Subtask Bug Sprint Milestone TaskServer oslc_rm:Requirement'],
    ['source', 'Source control & artifacts', 'GitRepository GitBranch PullRequest GitCommit GitTag SourceArtifact'],
    ['agents', 'Agents & MCP', 'MCPServer AgentPersona ContextSource PromptStrategy PromptOptimizer MCPTool MCPResource MCPPrompt AgentSkill'],
    ['documentation', 'Documentation & decisions', 'FlowDiagram DocumentationPage ArchitectureDecisionRecord ADR InteractiveWalkthrough CodeSnippet DocSection ADROption'],
    ['learning', 'Learning & assessment', 'ELearning CertificateOfCompletion LearningModule LearningLesson HandsOnLab QuizAssessment CurriculumDefinition'],
    ['testing', 'Testing & behavior', 'Scenario ScenarioStep GherkinFeature GherkinBackground GherkinRule ScenarioOutline ExamplesTable StepDefinition DataTable DocString TestingLibrary TestPlan TestSuite TestExecutionRecord'],
    ['schema', 'Schema & graph metadata', 'SystemGraph KGraphPackage schema:CategoryCode schema:CategoryCodeSet rdfs:Class rdf:Property owl:Class owl:ObjectProperty owl:DatatypeProperty owl:Ontology sh:NodeShape sh:PropertyShape oslc:ServiceProvider'],
  ];
  const CATALOG = DEFINITIONS.map(([code, label], order) => ({ id: NS + 'classification/' + code, code, label, order, '@id': NS + 'classification/' + code, '@type': 'schema:CategoryCode', 'schema:codeValue': code, 'schema:name': label, 'schema:inCodeSet': { '@id': CODE_SET_ID } }));
  const classCodes = Object.create(null);
  for (const [code, , classes] of DEFINITIONS) for (const name of classes.split(' ')) classCodes[name.includes(':') ? name : 'robos:' + name] = [code];
  // Exact upstream aliases are useful for graphs authored directly in standard vocabularies.
  Object.assign(classCodes, { 'schema:SoftwareApplication': ['applications'], 'schema:WebApplication': ['applications'], 'schema:MobileApplication': ['applications'], 'schema:VideoGame': ['applications'], 'schema:SoftwareSourceCode': ['source'], 'schema:Organization': ['organization'], 'schema:Person': ['organization'], 'schema:Course': ['learning'], 'c4:Container': ['services'], 'c4:Component': ['contracts'] });
  // Explicit broad upstream type: CreativeWork includes software and other
  // authored artifacts (https://schema.org/CreativeWork). More specific known
  // types take precedence; this is not a fallback for unknown namespaces.
  const GENERIC_CLASS_CODES = { 'schema:CreativeWork': ['source'] };
  Object.assign(classCodes, GENERIC_CLASS_CODES);
  // Alternate target classes explicitly declared by the built-in SHACL registry.
  Object.assign(classCodes, {
  "robos:GitOrganization": [
    "organization"
  ],
  "robos:RemoteBuildCluster": [
    "infrastructure"
  ],
  "robos:MonorepoBuild": [
    "libraries"
  ],
  "robos:DocArticle": [
    "documentation"
  ],
  "robos:CodeSample": [
    "documentation"
  ],
  "robos:RelationalDatabase": [
    "data"
  ],
  "robos:CacheStore": [
    "data"
  ],
  "robos:DocumentStore": [
    "data"
  ],
  "robos:KeyValueStore": [
    "data"
  ],
  "robos:EventBus": [
    "data"
  ],
  "robos:ToolProvider": [
    "agents"
  ],
  "robos:AIAgent": [
    "agents"
  ],
  "robos:K8sCluster": [
    "infrastructure"
  ],
  "robos:DeploymentEnvironment": [
    "infrastructure"
  ],
  "robos:ArgoCDApplication": [
    "infrastructure"
  ],
  "robos:GRPCContract": [
    "contracts"
  ],
  "robos:GraphQLSchema": [
    "contracts"
  ],
  "robos:Pipeline": [
    "infrastructure"
  ],
  "robos:PromptCompiler": [
    "agents"
  ],
  "robos:AIPromptTechnique": [
    "agents"
  ],
  "robos:ProductFeature": [
    "work"
  ],
  "robos:Story": [
    "work"
  ],
  "oslc_cm:ChangeRequest": [
    "work"
  ],
  "robos:WorkItem": [
    "work"
  ],
  "robos:Defect": [
    "work"
  ],
  "oslc_cm:Defect": [
    "work"
  ],
  "robos:Repository": [
    "source"
  ],
  "robos:MergeRequest": [
    "source"
  ],
  "robos:CommitRef": [
    "source"
  ],
  "robos:APIOperation": [
    "contracts"
  ],
  "robos:SchemaModel": [
    "contracts"
  ],
  "robos:DomainEntity": [
    "contracts"
  ],
  "robos:MessageQueue": [
    "data"
  ],
  "robos:EventTopic": [
    "data"
  ],
  "robos:BDDFeature": [
    "testing"
  ],
  "robos:Background": [
    "testing"
  ],
  "robos:Rule": [
    "testing"
  ],
  "robos:TestFramework": [
    "testing"
  ],
  "oslc_qm:TestPlan": [
    "testing"
  ],
  "oslc_qm:TestSuite": [
    "testing"
  ],
  "oslc_qm:TestExecutionRecord": [
    "testing"
  ]
});
  const PREDICATE_CODES = {
  "robos:uri": ["agents"],
  "robos:toolAnnotations": ["agents"],
  "robos:resourcesProvided": ["agents"],
  "robos:promptsProvided": ["agents"],
  "robos:parameters": ["agents"],
  "robos:outputSchema": ["agents"],
  "robos:mimeType": ["agents"],
  "robos:inputSchema": ["agents"],
  "robos:arguments": ["agents"],
  "robos:annotations": ["agents"],
  "dcterms:description": [
    "documentation"
  ],
  "dcterms:license": [
    "schema"
  ],
  "dcterms:title": [
    "services",
    "work",
    "organization",
    "learning",
    "applications",
    "libraries",
    "infrastructure",
    "documentation",
    "data",
    "agents",
    "contracts",
    "source",
    "testing"
  ],
  "oslc_qm:executionStatus": [
    "testing"
  ],
  "oslc_qm:reportsOnTestCase": [
    "testing"
  ],
  "oslc_qm:usesTestCase": [
    "schema"
  ],
  "oslc_qm:validatedBy": [
    "schema"
  ],
  "owl:equivalentClass": [
    "schema"
  ],
  "rdfs:comment": [
    "schema"
  ],
  "rdfs:domain": [
    "schema"
  ],
  "rdfs:isDefinedBy": [
    "schema"
  ],
  "rdfs:label": [
    "schema"
  ],
  "rdfs:range": [
    "schema"
  ],
  "rdfs:seeAlso": [
    "schema"
  ],
  "rdfs:subClassOf": [
    "schema"
  ],
  "rdfs:subPropertyOf": [
    "schema"
  ],
  "robos:actionCacheEndpoint": [
    "schema"
  ],
  "robos:adr": [
    "documentation"
  ],
  "robos:adrNumber": [
    "schema"
  ],
  "robos:agentRules": [
    "schema"
  ],
  "robos:apiEndpoint": [
    "infrastructure"
  ],
  "robos:app": [
    "applications"
  ],
  "robos:aspectRatio": [
    "schema"
  ],
  "robos:assignedAgent": [
    "schema"
  ],
  "robos:assignedDeveloper": [
    "schema"
  ],
  "robos:assignedTeam": [
    "schema"
  ],
  "robos:authenticationBoundary": [
    "schema"
  ],
  "robos:branchName": [
    "source"
  ],
  "robos:broker": [
    "data"
  ],
  "robos:brokerType": [
    "data"
  ],
  "robos:buildConfig": [
    "schema"
  ],
  "robos:buildDependsOn": [
    "schema"
  ],
  "robos:buildTool": [
    "libraries"
  ],
  "robos:builtBy": [
    "schema"
  ],
  "robos:calls": [
    "schema"
  ],
  "robos:casEndpoint": [
    "infrastructure"
  ],
  "robos:category": [
    "schema"
  ],
  "robos:classification": [
    "schema"
  ],
  "robos:classificationOrigin": [
    "schema"
  ],
  "robos:cliCommand": [
    "applications"
  ],
  "robos:cluster": [
    "infrastructure"
  ],
  "robos:clusterContext": [
    "infrastructure"
  ],
  "robos:code": [
    "documentation"
  ],
  "robos:codeFile": [
    "testing"
  ],
  "robos:collectionName": [
    "data"
  ],
  "robos:columnName": [
    "data"
  ],
  "robos:command": [
    "applications"
  ],
  "robos:commandName": [
    "applications"
  ],
  "robos:commitSha": [
    "source"
  ],
  "robos:composes": [
    "schema"
  ],
  "robos:condition": [
    "schema"
  ],
  "robos:configFile": [
    "libraries"
  ],
  "robos:configures": [
    "schema"
  ],
  "robos:consequences": [
    "schema"
  ],
  "robos:consumesContract": [
    "schema"
  ],
  "robos:consumesFrom": [
    "schema"
  ],
  "robos:content": [
    "testing"
  ],
  "robos:context": [
    "documentation"
  ],
  "robos:course": [
    "learning"
  ],
  "robos:dataTable": [
    "schema"
  ],
  "robos:dataType": [
    "data"
  ],
  "robos:database": [
    "data"
  ],
  "robos:databaseName": [
    "data"
  ],
  "robos:deadLettersTo": [
    "schema"
  ],
  "robos:decision": [
    "documentation"
  ],
  "robos:defaultBranch": [
    "source"
  ],
  "robos:definedInContract": [
    "schema"
  ],
  "robos:definesModel": [
    "schema"
  ],
  "robos:definesTopology": [
    "schema"
  ],
  "robos:dependsOn": [
    "schema"
  ],
  "robos:deployedTo": [
    "schema"
  ],
  "robos:deploys": [
    "schema"
  ],
  "robos:derivedFrom": [
    "schema"
  ],
  "robos:desktopFramework": [
    "applications"
  ],
  "robos:developmentDependsOn": [
    "schema"
  ],
  "robos:developmentGuidance": [
    "schema"
  ],
  "robos:diagramType": [
    "schema"
  ],
  "robos:docPage": [
    "documentation"
  ],
  "robos:docPath": [
    "documentation"
  ],
  "robos:docString": [
    "schema"
  ],
  "robos:domainStandard": [
    "schema"
  ],
  "robos:endDate": [
    "work"
  ],
  "robos:endpoint": [
    "data",
    "agents"
  ],
  "robos:enforcesContract": [
    "schema"
  ],
  "robos:engine": [
    "data",
    "agents"
  ],
  "robos:environmentType": [
    "infrastructure"
  ],
  "robos:evidence": [
    "learning",
    "data",
    "infrastructure",
    "source",
    "agents"
  ],
  "robos:evidenceStatus": [
    "schema"
  ],
  "robos:examplesTable": [
    "testing"
  ],
  "robos:executesOn": [
    "schema"
  ],
  "robos:executionEndpoint": [
    "infrastructure"
  ],
  "robos:exports": [
    "schema"
  ],
  "robos:featureFile": [
    "work",
    "testing"
  ],
  "robos:fieldType": [
    "schema"
  ],
  "robos:flagName": [
    "applications"
  ],
  "robos:flowDiagram": [
    "schema"
  ],
  "robos:forCourse": [
    "learning"
  ],
  "robos:forEnvironment": [
    "schema"
  ],
  "robos:forgeType": [
    "organization"
  ],
  "robos:forwardsTo": [
    "schema"
  ],
  "robos:frontendFramework": [
    "applications"
  ],
  "robos:gameEngine": [
    "applications"
  ],
  "robos:generatedBy": [
    "schema"
  ],
  "robos:gitopsEngine": [
    "infrastructure"
  ],
  "robos:gitopsFile": [
    "learning"
  ],
  "robos:governedBy": [
    "schema"
  ],
  "robos:groupId": [
    "data"
  ],
  "robos:hasADR": [
    "schema"
  ],
  "robos:hasAgentRule": [
    "schema"
  ],
  "robos:hasBackground": [
    "schema"
  ],
  "robos:hasBranch": [
    "schema"
  ],
  "robos:hasBug": [
    "schema"
  ],
  "robos:hasCollection": [
    "schema"
  ],
  "robos:hasColumn": [
    "schema"
  ],
  "robos:hasCommand": [
    "schema"
  ],
  "robos:hasCommit": [
    "schema"
  ],
  "robos:hasConfiguration": [
    "schema"
  ],
  "robos:hasConsumerGroup": [
    "schema"
  ],
  "robos:hasCredential": [
    "schema"
  ],
  "robos:hasDataModel": [
    "schema"
  ],
  "robos:hasDataTable": [
    "schema"
  ],
  "robos:hasDeployment": [
    "schema"
  ],
  "robos:hasDocString": [
    "schema"
  ],
  "robos:hasDocumentation": [
    "schema"
  ],
  "robos:hasDocumentationPage": [
    "schema"
  ],
  "robos:hasELearning": [
    "schema"
  ],
  "robos:hasEndpoint": [
    "schema"
  ],
  "robos:hasEpic": [
    "schema"
  ],
  "robos:hasExamples": [
    "schema"
  ],
  "robos:hasFeature": [
    "schema"
  ],
  "robos:hasFlag": [
    "schema"
  ],
  "robos:hasFlowDiagram": [
    "schema"
  ],
  "robos:hasIndex": [
    "schema"
  ],
  "robos:hasIngress": [
    "schema"
  ],
  "robos:hasJob": [
    "schema"
  ],
  "robos:hasKubeService": [
    "schema"
  ],
  "robos:hasLab": [
    "schema"
  ],
  "robos:hasLesson": [
    "schema"
  ],
  "robos:hasMilestone": [
    "schema"
  ],
  "robos:hasModule": [
    "schema"
  ],
  "robos:hasNamespace": [
    "schema"
  ],
  "robos:hasNodePool": [
    "schema"
  ],
  "robos:hasOption": [
    "schema"
  ],
  "robos:hasOrganization": [
    "schema"
  ],
  "robos:hasPipeline": [
    "schema"
  ],
  "robos:hasProject": [
    "schema"
  ],
  "robos:hasPrompt": [
    "schema"
  ],
  "robos:hasPullRequest": [
    "schema"
  ],
  "robos:hasQueue": [
    "schema"
  ],
  "robos:hasQuiz": [
    "schema"
  ],
  "robos:hasRemoteExecution": [
    "schema"
  ],
  "robos:hasRepository": [
    "schema"
  ],
  "robos:hasResource": [
    "schema"
  ],
  "robos:hasRoute": [
    "schema"
  ],
  "robos:hasRule": [
    "schema"
  ],
  "robos:hasScenario": [
    "schema"
  ],
  "robos:hasScenarioOutline": [
    "schema"
  ],
  "robos:hasSchema": [
    "schema"
  ],
  "robos:hasSection": [
    "schema"
  ],
  "robos:hasSprint": [
    "schema"
  ],
  "robos:hasStage": [
    "schema"
  ],
  "robos:hasStep": [
    "schema"
  ],
  "robos:hasStepDefinition": [
    "schema"
  ],
  "robos:hasStory": [
    "schema"
  ],
  "robos:hasSubtask": [
    "schema"
  ],
  "robos:hasTable": [
    "schema"
  ],
  "robos:hasTag": [
    "schema"
  ],
  "robos:hasTask": [
    "schema"
  ],
  "robos:hasTestPlan": [
    "schema"
  ],
  "robos:hasTestSuite": [
    "schema"
  ],
  "robos:hasTool": [
    "schema"
  ],
  "robos:hasTopic": [
    "schema"
  ],
  "robos:hasWalkthrough": [
    "schema"
  ],
  "robos:hasWorkerPool": [
    "schema"
  ],
  "robos:host": [
    "data",
    "infrastructure"
  ],
  "robos:hosts": [
    "schema"
  ],
  "robos:httpMethod": [
    "contracts"
  ],
  "robos:image": [
    "infrastructure"
  ],
  "robos:imagePath": [
    "documentation"
  ],
  "robos:implementedBy": [
    "schema"
  ],
  "robos:implementsContract": [
    "schema"
  ],
  "robos:imports": [
    "schema"
  ],
  "robos:inBackground": [
    "schema"
  ],
  "robos:inEnvironment": [
    "schema"
  ],
  "robos:inEpic": [
    "schema"
  ],
  "robos:inFeature": [
    "testing"
  ],
  "robos:inOrganization": [
    "schema"
  ],
  "robos:inProject": [
    "schema"
  ],
  "robos:inRepository": [
    "source",
    "agents"
  ],
  "robos:inRule": [
    "schema"
  ],
  "robos:inScenario": [
    "schema"
  ],
  "robos:inScenarioOutline": [
    "schema"
  ],
  "robos:inSprint": [
    "schema"
  ],
  "robos:inStory": [
    "schema"
  ],
  "robos:inTestPlan": [
    "schema"
  ],
  "robos:inTestSuite": [
    "schema"
  ],
  "robos:includes": [
    "schema"
  ],
  "robos:indexName": [
    "data"
  ],
  "robos:ingressName": [
    "infrastructure"
  ],
  "robos:inputType": [
    "schema"
  ],
  "robos:issueDate": [
    "learning"
  ],
  "robos:job": [
    "infrastructure"
  ],
  "robos:jobName": [
    "infrastructure"
  ],
  "robos:keyword": [
    "testing"
  ],
  "robos:labFile": [
    "learning"
  ],
  "robos:language": [
    "documentation",
    "testing"
  ],
  "robos:linkedNodes": [
    "schema"
  ],
  "robos:location": [
    "agents"
  ],
  "robos:managedByTeam": [
    "schema"
  ],
  "robos:mcpServer": [
    "agents"
  ],
  "robos:mermaidText": [
    "documentation"
  ],
  "robos:modelName": [
    "contracts"
  ],
  "robos:module": [
    "learning"
  ],
  "robos:modules": [
    "learning"
  ],
  "robos:namespace": [
    "infrastructure"
  ],
  "robos:namespaceName": [
    "infrastructure"
  ],
  "robos:nodes": [
    "schema"
  ],
  "robos:optionalDependsOn": [
    "schema"
  ],
  "robos:orgName": [
    "organization"
  ],
  "robos:outputType": [
    "schema"
  ],
  "robos:ownerTeam": [
    "services"
  ],
  "robos:package": [
    "schema"
  ],
  "robos:packageName": [
    "contracts"
  ],
  "robos:packages": [
    "schema"
  ],
  "robos:parentTask": [
    "work"
  ],
  "robos:parentWorkItem": [
    "schema"
  ],
  "robos:pathPattern": [
    "contracts"
  ],
  "robos:peerDependsOn": [
    "schema"
  ],
  "robos:pipeline": [
    "infrastructure"
  ],
  "robos:pipelineEngine": [
    "services"
  ],
  "robos:platform": [
    "applications",
    "infrastructure"
  ],
  "robos:prNumber": [
    "source"
  ],
  "robos:predicate": [
    "schema"
  ],
  "robos:produces": [
    "schema"
  ],
  "robos:promptName": [
    "agents"
  ],
  "robos:protocol": [
    "contracts",
    "infrastructure"
  ],
  "robos:protocolReference": [
    "schema"
  ],
  "robos:provenance": [
    "schema"
  ],
  "robos:provider": [
    "infrastructure"
  ],
  "robos:provides": [
    "schema"
  ],
  "robos:publishes": [
    "schema"
  ],
  "robos:publishesTo": [
    "schema"
  ],
  "robos:queries": [
    "schema"
  ],
  "robos:questions": [
    "schema"
  ],
  "robos:reads": [
    "schema"
  ],
  "robos:readsFrom": [
    "schema"
  ],
  "robos:recipientUser": [
    "learning"
  ],
  "robos:references": [
    "schema"
  ],
  "robos:referencesModel": [
    "schema"
  ],
  "robos:refersFrom": [
    "schema"
  ],
  "robos:regexPattern": [
    "testing"
  ],
  "robos:relatedTo": [
    "schema"
  ],
  "robos:relatesTo": [
    "schema"
  ],
  "robos:relationshipEvidence": [
    "schema"
  ],
  "robos:renders": [
    "schema"
  ],
  "robos:repository": [
    "services",
    "applications",
    "libraries",
    "source"
  ],
  "robos:role": [
    "agents"
  ],
  "robos:routePath": [
    "applications"
  ],
  "robos:routesTo": [
    "schema"
  ],
  "robos:rpcMethods": [
    "contracts"
  ],
  "robos:runs": [
    "schema"
  ],
  "robos:schemaName": [
    "data"
  ],
  "robos:schemaOrgType": [
    "schema"
  ],
  "robos:schemaType": [
    "contracts"
  ],
  "robos:scorePercentage": [
    "learning"
  ],
  "robos:sectionId": [
    "documentation"
  ],
  "robos:sendsBuildEventsTo": [
    "schema"
  ],
  "robos:sendsCompletedActionsTo": [
    "schema"
  ],
  "robos:serverType": [
    "work"
  ],
  "robos:service": [
    "schema"
  ],
  "robos:serviceName": [
    "infrastructure"
  ],
  "robos:serviceType": [
    "infrastructure"
  ],
  "robos:severity": [
    "work"
  ],
  "robos:shaclShape": [
    "schema"
  ],
  "robos:skillName": [
    "agents"
  ],
  "robos:slug": [
    "documentation"
  ],
  "robos:sourceArtifact": [
    "schema"
  ],
  "robos:sourceBranch": [
    "source"
  ],
  "robos:sourceHash": [
    "schema"
  ],
  "robos:sourceKind": [
    "source"
  ],
  "robos:sourceLine": [
    "schema"
  ],
  "robos:sourcePath": [
    "learning",
    "source",
    "agents"
  ],
  "robos:sourceRepo": [
    "infrastructure"
  ],
  "robos:sourceRepository": [
    "schema"
  ],
  "robos:sourceRevision": [
    "schema"
  ],
  "robos:sourceSummary": [
    "schema"
  ],
  "robos:sourceType": [
    "agents"
  ],
  "robos:specFile": [
    "contracts"
  ],
  "robos:stage": [
    "infrastructure"
  ],
  "robos:stageName": [
    "infrastructure"
  ],
  "robos:startDate": [
    "work"
  ],
  "robos:status": [
    "work",
    "documentation",
    "source"
  ],
  "robos:step": [
    "testing"
  ],
  "robos:stepDefinition": [
    "schema"
  ],
  "robos:stepName": [
    "infrastructure"
  ],
  "robos:stepText": [
    "testing"
  ],
  "robos:steps": [
    "testing"
  ],
  "robos:strategyType": [
    "agents"
  ],
  "robos:subscribesTo": [
    "schema"
  ],
  "robos:supersededBy": [
    "schema"
  ],
  "robos:systemPrompt": [
    "agents"
  ],
  "robos:table": [
    "data"
  ],
  "robos:tableHeaders": [
    "testing"
  ],
  "robos:tableName": [
    "data"
  ],
  "robos:tableRows": [
    "testing"
  ],
  "robos:tagName": [
    "source"
  ],
  "robos:target": [
    "schema"
  ],
  "robos:targetApp": [
    "documentation"
  ],
  "robos:targetBranch": [
    "source"
  ],
  "robos:targetCluster": [
    "infrastructure"
  ],
  "robos:targetComponent": [
    "schema"
  ],
  "robos:targetDate": [
    "work"
  ],
  "robos:targetNamespace": [
    "infrastructure"
  ],
  "robos:targetNode": [
    "schema"
  ],
  "robos:targetPlatform": [
    "applications"
  ],
  "robos:targets": [
    "schema"
  ],
  "robos:teaches": [
    "schema"
  ],
  "robos:teachesContract": [
    "schema"
  ],
  "robos:teachesService": [
    "schema"
  ],
  "robos:technology": [
    "applications",
    "services",
    "libraries"
  ],
  "robos:technologyReference": [
    "schema"
  ],
  "robos:testFramework": [
    "testing"
  ],
  "robos:testingLibrary": [
    "schema"
  ],
  "robos:testingType": [
    "testing"
  ],
  "robos:testsService": [
    "schema"
  ],
  "robos:tier": [
    "infrastructure"
  ],
  "robos:toolName": [
    "agents"
  ],
  "robos:toolsProvided": [
    "agents"
  ],
  "robos:tooltip": [
    "documentation"
  ],
  "robos:topic": [
    "learning",
    "data"
  ],
  "robos:topicName": [
    "data"
  ],
  "robos:totalClasses": [
    "schema"
  ],
  "robos:tracksEpic": [
    "schema"
  ],
  "robos:transport": [
    "agents"
  ],
  "robos:uriTemplate": [
    "agents"
  ],
  "robos:url": [
    "organization",
    "work",
    "source"
  ],
  "robos:uses": [
    "schema"
  ],
  "robos:usesBuildSystem": [
    "schema"
  ],
  "robos:usesDatabase": [
    "schema"
  ],
  "robos:usesEntity": [
    "schema"
  ],
  "robos:usesMCPServer": [
    "schema"
  ],
  "robos:usesMessageBroker": [
    "schema"
  ],
  "robos:usesModel": [
    "schema"
  ],
  "robos:usesSkill": [
    "schema"
  ],
  "robos:validates": [
    "schema"
  ],
  "robos:videoPath": [
    "schema"
  ],
  "robos:walkthroughPath": [
    "schema"
  ],
  "robos:workflowFile": [
    "infrastructure"
  ],
  "robos:workingTreeStatus": [
    "schema"
  ],
  "robos:writesModel": [
    "schema"
  ],
  "robos:writesTo": [
    "schema"
  ],
  "schema:category": [
    "schema"
  ],
  "schema:codeValue": [
    "schema"
  ],
  "schema:hasCategoryCode": [
    "schema"
  ],
  "schema:inCodeSet": [
    "schema"
  ],
  "schema:name": [
    "schema"
  ]
};
  // Explicit optional inspector fields and inverse relationships. Categories
  // describe predicate semantics; group visibility is handled by the catalog.
  Object.assign(PREDICATE_CODES, {
    "robos:acceptanceCriteria": [
      "work"
    ],
    "robos:appName": [
      "applications"
    ],
    "robos:appVersion": [
      "applications"
    ],
    "robos:assetEndpoint": [
      "infrastructure"
    ],
    "robos:author": [
      "source"
    ],
    "robos:availabilityStatus": [
      "agents"
    ],
    "robos:boundServices": [
      "services",
      "data"
    ],
    "robos:branchMetadataStatus": [
      "source"
    ],
    "robos:browserEndpoint": [
      "infrastructure"
    ],
    "robos:buildCommand": [
      "libraries",
      "infrastructure"
    ],
    "robos:collectionOfDatabase": [
      "data"
    ],
    "robos:collections": [
      "data"
    ],
    "robos:columnOfTable": [
      "data"
    ],
    "robos:configurationKind": [
      "infrastructure"
    ],
    "robos:contractYaml": [
      "contracts"
    ],
    "robos:currentBranch": [
      "source"
    ],
    "robos:declaredName": [
      "source"
    ],
    "robos:defaultExecProperties": [
      "infrastructure"
    ],
    "robos:difficulty": [
      "learning"
    ],
    "robos:documentation": [
      "documentation"
    ],
    "robos:endpointOf": [
      "services",
      "contracts"
    ],
    "robos:estimatedDuration": [
      "learning"
    ],
    "robos:executableName": [
      "applications"
    ],
    "robos:indexOfTable": [
      "data"
    ],
    "robos:inNamespace": [
      "infrastructure"
    ],
    "robos:instanceName": [
      "infrastructure"
    ],
    "robos:lessons": [
      "learning"
    ],
    "robos:memberCount": [
      "organization"
    ],
    "robos:model": [
      "agents"
    ],
    "robos:modelKind": [
      "contracts"
    ],
    "robos:namespaceOfCluster": [
      "infrastructure"
    ],
    "robos:narrative": [
      "work",
      "testing"
    ],
    "robos:port": [
      "data",
      "infrastructure"
    ],
    "robos:ports": [
      "infrastructure"
    ],
    "robos:priority": [
      "work"
    ],
    "robos:promptOfServer": [
      "agents"
    ],
    "robos:registrationCondition": [
      "agents"
    ],
    "robos:replicas": [
      "infrastructure"
    ],
    "robos:requirementId": [
      "work",
      "testing"
    ],
    "robos:resourceOfServer": [
      "agents"
    ],
    "robos:resources": [
      "infrastructure"
    ],
    "robos:revision": [
      "source"
    ],
    "robos:runtimePrerequisites": [
      "agents"
    ],
    "robos:scenarios": [
      "testing"
    ],
    "robos:schemaOf": [
      "data"
    ],
    "robos:schemas": [
      "data"
    ],
    "robos:securityContext": [
      "infrastructure"
    ],
    "robos:stageOfPipeline": [
      "infrastructure"
    ],
    "robos:stateScope": [
      "schema"
    ],
    "robos:stepCount": [
      "testing"
    ],
    "robos:storyPoints": [
      "work"
    ],
    "robos:tableOfSchema": [
      "data"
    ],
    "robos:tables": [
      "data"
    ],
    "robos:tags": [
      "schema"
    ],
    "robos:targetAudience": [
      "learning"
    ],
    "robos:targetService": [
      "services",
      "contracts"
    ],
    "robos:teachesApplication": [
      "learning"
    ],
    "robos:tlsEnabled": [
      "data",
      "infrastructure"
    ],
    "robos:toolOfServer": [
      "agents"
    ],
    "robos:tools": [
      "agents"
    ],
    "robos:topicOfBroker": [
      "data"
    ],
    "robos:topics": [
      "data"
    ],
    "robos:verifiedByTest": [
      "testing"
    ],
    "robos:version": [
      "source",
      "libraries"
    ],
    "robos:workerPools": [
      "infrastructure"
    ]
  });
  const ordered = codes => [...new Set(codes)].sort((a, b) => CATALOG.findIndex(c => c.code === a) - CATALOG.findIndex(c => c.code === b));
  const reference = code => ({ '@id': NS + 'classification/' + code });
  function resolveSchemaElement(id) {
    const key = compact(id);
    const shapeClass = key.startsWith('urn:robos:shape:') ? 'robos:' + key.slice(16).replace(/Shape$/, '') : key.startsWith('robos:') && key.endsWith('Shape') ? key.slice(0, -5) : '';
    const codes = classCodes[key] || (Object.hasOwn(PREDICATE_CODES, key) ? PREDICATE_CODES[key] : null) || classCodes[shapeClass] || (shapeClass === 'robos:Requirement' ? classCodes['oslc_rm:Requirement'] : []);
    return ordered(codes).map(reference);
  }
  function resolveClassification(node = {}) {
    node = node && typeof node === 'object' ? node : {};
    const warnings = [], types = [...new Set(array(node['@type']).map(compact).filter(Boolean))].sort(compare);
    const specificTypes = types.filter(type => classCodes[type] && !Object.hasOwn(GENERIC_CLASS_CODES, type));
    const inferenceTypes = specificTypes.length ? specificTypes : types;
    const inferredCodes = ordered(inferenceTypes.flatMap(type => classCodes[type] || []));
    const unknownTypes = types.filter(type => !classCodes[type]);
    if (unknownTypes.length) warnings.push({ code: 'unknown-type', message: 'No registered classification for: ' + unknownTypes.join(', '), types: unknownTypes });
    // Compact and expanded keys denote the same predicate. Validate every
    // supplied value so one spelling cannot hide an invalid declaration.
    const properties = ['robos:classification', NS + 'classification'].filter(key => Object.hasOwn(node, key));
    const property = properties.length > 0;
    const declaredCodes = [];
    let valid = true;
    for (const key of properties) {
      const values = array(node[key]);
      if (!values.length) { valid = false; warnings.push({ code: 'invalid-classification', message: 'Classification must contain a registered CategoryCode reference.' }); }
      for (const value of values) {
        const id = compact(value);
        const category = CATALOG.find(c => compact(c.id) === id);
        if (!category || (typeof value !== 'string' && (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => k !== '@id')))) {
          valid = false; warnings.push({ code: 'invalid-classification', message: 'Unknown or malformed CategoryCode reference: ' + (id || JSON.stringify(value)) });
        } else declaredCodes.push(category.code);
      }
    }
    const originKeys = ['robos:classificationOrigin', NS + 'classificationOrigin'].filter(key => Object.hasOwn(node, key));
    const origin = originKeys.length ? node[originKeys[0]] : undefined;
    if (originKeys.some(key => node[key] !== origin)) {
      valid = false;
      warnings.push({ code: 'invalid-classification-origin', message: 'Compact and expanded classificationOrigin values must agree.' });
    }
    if (origin !== undefined && (!property || !['declared', 'inferred'].includes(origin))) {
      valid = false;
      warnings.push({ code: 'invalid-classification-origin', message: 'classificationOrigin requires a classification reference and must be declared or inferred.' });
    }
    if (origin === 'inferred' && JSON.stringify(ordered(declaredCodes)) !== JSON.stringify(inferredCodes)) {
      valid = false;
      warnings.push({ code: 'stale-inferred-classification', message: 'Stored inferred classification does not match the registered classes; refresh it explicitly.' });
    }
    // Invalid declarations never silently fall back to inference.
    const codes = valid ? (property ? ordered(declaredCodes) : inferredCodes) : [];
    const status = codes.length ? (property && origin !== 'inferred' ? 'declared' : 'inferred') : 'unclassified';
    if (!codes.length) warnings.push({ code: 'unclassified', message: 'Unclassified: declare a registered robos:classification reference or use a registered class.' });
    return { status, valid, categories: codes.map(code => CATALOG.find(c => c.code === code)), references: codes.map(reference), inferredReferences: inferredCodes.map(reference), primary: codes[0] || 'unclassified', unknownTypes, warnings };
  }
  function buildTree(nodes, options = {}) {
    const { mode = 'classification', search = '', classification = 'all', type = 'all', package: pkg = 'all', collapsed = [] } = options;
    if (!['classification', 'package', 'type', 'flat'].includes(mode)) throw new Error('Unknown tree mode: ' + mode);
    const query = search.trim().toLowerCase(), closed = new Set(collapsed), groups = new Map();
    const entries = nodes.map(node => ({ node, classification: resolveClassification(node) })).filter(entry => {
      const n = entry.node, r = entry.classification;
      return (classification === 'all' || r.primary === classification || r.categories.some(c => c.code === classification)) &&
        (type === 'all' || array(n['@type']).map(compact).includes(type)) &&
        (pkg === 'all' || (n['robos:package'] || 'Unpackaged') === pkg) &&
        (!query || JSON.stringify([n, r.status, r.categories.map(c => c.label), r.warnings.map(w => w.message)]).toLowerCase().includes(query));
    }).sort((a, b) => compare(String(a.node['dcterms:title'] || a.node['@id']), String(b.node['dcterms:title'] || b.node['@id'])) || compare(a.node['@id'], b.node['@id']));
    for (const entry of entries) {
      // One placement per node: all memberships remain available in filters and badges.
      const key = mode === 'classification' ? entry.classification.primary : mode === 'package' ? (entry.node['robos:package'] || 'Unpackaged') : mode === 'type' ? array(entry.node['@type']).map(compact).sort(compare)[0] || 'Untyped' : 'all';
      const id = mode + ':' + key;
      if (!groups.has(id)) groups.set(id, { id, key, label: mode === 'classification' ? CATALOG.find(c => c.code === key)?.label || 'Unclassified' : key, entries: [], collapsed: closed.has(id) && !query });
      groups.get(id).entries.push(entry);
    }
    return { total: nodes.length, count: entries.length, entries, groups: [...groups.values()].sort((a, b) => mode === 'classification' ? (CATALOG.find(c => c.code === a.key)?.order ?? 999) - (CATALOG.find(c => c.code === b.key)?.order ?? 999) : compare(a.key, b.key)).map(g => ({ ...g, count: g.entries.length })) };
  }
  return { CODE_SET_ID, CATALOG, CLASS_CODES: classCodes, PREDICATE_CODES, resolveClassification, resolveSchemaElement, buildTree, compact };
});
