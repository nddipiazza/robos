'use strict';

/**
 * Helper to build an epic with child tasks.
 */
function makePlan({ prompt, epicTitle, epicName, epicBody, labels = [], stories = [] }) {
  const tasks = [
    {
      title: epicTitle,
      body: epicBody,
      labels: ['epic', ...labels],
      isEpic: true,
      epicName: epicName || epicTitle,
      parentEpicIdx: null,
      issueType: 'Epic',
    },
    ...stories.map(s => ({
      title: s.title,
      body: s.body,
      labels: [...(s.labels || labels)],
      isEpic: false,
      epicName: '',
      parentEpicIdx: 0,
      issueType: s.issueType || 'Story',
    })),
  ];
  return { prompt, tasks };
}

const DEFAULT_TEMPLATES = [
  // ── Services & APIs ──────────────────────────────────────────────────────────
  {
    id: 'backend-web-service',
    title: 'Plan to Create a Back-End Web Service',
    category: 'Services & APIs',
    icon: '⚙️',
    description: 'Design and scaffold a scalable backend REST/HTTP service with OpenAPI contract, database persistence, and auth.',
    fields: [
      { id: 'serviceName', label: 'Service Name', type: 'text', default: 'catalog-service', required: true, help: 'Identifier for repository and service URN' },
      { id: 'runtime', label: 'Language & Framework', type: 'select', default: 'java-spring', options: [
        { value: 'java-spring', label: 'Java 21 / Spring Boot 3', desc: 'Enterprise microservice with Spring Data & Security' },
        { value: 'node-fastify', label: 'Node.js / Fastify / TypeScript', desc: 'Lightweight high-throughput JSON API' },
        { value: 'go-gin', label: 'Go 1.22 / Gin', desc: 'Compiled high-performance microservice' },
        { value: 'python-fastapi', label: 'Python 3.12 / FastAPI', desc: 'Modern async Python API with Pydantic typing' },
        { value: 'dotnet-core', label: 'C# / ASP.NET Core 8', desc: 'Cross-platform enterprise web API' },
      ]},
      { id: 'database', label: 'Primary Data Store', type: 'select', default: 'postgres', options: [
        { value: 'postgres', label: 'PostgreSQL Relational DB', desc: 'ACID compliant with JSONB & Flyway migrations' },
        { value: 'mysql', label: 'MySQL 8 / MariaDB', desc: 'Standard relational database' },
        { value: 'mongodb', label: 'MongoDB Document Store', desc: 'Flexible schema document store' },
        { value: 'dynamodb', label: 'Amazon DynamoDB', desc: 'Managed NoSQL key-value store' },
        { value: 'none', label: 'Stateless / None', desc: 'In-memory or purely proxying service' },
      ]},
      { id: 'auth', label: 'Authentication & Security', type: 'select', default: 'jwt', options: [
        { value: 'jwt', label: 'OAuth2 / JWT Bearer Tokens', desc: 'Stateless tokens verified via JWKS' },
        { value: 'apikey', label: 'API Key Header', desc: 'Service-to-service shared secret' },
        { value: 'mtls', label: 'mTLS Client Certificates', desc: 'Zero-trust mutual TLS encryption' },
        { value: 'public', label: 'Public / No Auth', desc: 'Unauthenticated endpoints' },
      ]},
      { id: 'features', label: 'Core Capabilities & Endpoints', type: 'textarea', default: 'CRUD endpoints for resource entity, pagination, health check /healthz, and Prometheus metrics.', help: 'Describe business domain logic and entities' },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Scaffold and implement backend web service "${a.serviceName}" using ${a.runtime}, backed by ${a.database}, secured with ${a.auth}. Capabilities: ${a.features}`,
      epicTitle: `Epic: ${a.serviceName} Back-End Service Implementation`,
      epicName: `${a.serviceName}-Core`,
      epicBody: `Implement core architectural foundations for ${a.serviceName} using ${a.runtime}. Integrate ${a.database} storage and ${a.auth} authentication.`,
      labels: ['backend', 'microservice', 'api'],
      stories: [
        { title: `${a.serviceName}: OpenAPI 3.1 Contract & API Models`, body: `Define OpenAPI contract specification, request/response validation schemas, and error shapes for ${a.serviceName}.` },
        { title: `${a.serviceName}: Data Access Layer & Schema Migrations`, body: `Configure ${a.database} connection pooling, entity repositories, and versioned migrations.` },
        { title: `${a.serviceName}: Core Controller Endpoints & Business Logic`, body: `Implement primary domain handlers: ${a.features}` },
        { title: `${a.serviceName}: ${(a.auth || 'jwt').toUpperCase()} Security Filter & RBAC Middleware`, body: `Enforce ${a.auth || 'JWT'} token validation, context extraction, and role-based access checks.` },
        { title: `${a.serviceName}: Observability & Health Probes`, body: `Expose /healthz readiness/liveness endpoints and Prometheus metrics endpoint.` },
      ]
    })
  },
  {
    id: 'grpc-microservice',
    title: 'Plan to Create a gRPC Microservice',
    category: 'Services & APIs',
    icon: '⚡',
    description: 'Scaffold a high-performance RPC service using Protobuf contracts and bidirectional streaming.',
    fields: [
      { id: 'serviceName', label: 'Microservice Name', type: 'text', default: 'order-dispatch-rpc', required: true },
      { id: 'language', label: 'Language', type: 'select', default: 'go', options: [
        { value: 'go', label: 'Go 1.22 (grpc-go)' },
        { value: 'java', label: 'Java 21 (grpc-java)' },
        { value: 'rust', label: 'Rust (Tonic / Tokio)' },
        { value: 'python', label: 'Python (grpcio)' },
      ]},
      { id: 'streaming', label: 'RPC Patterns', type: 'select', default: 'unary-and-server-stream', options: [
        { value: 'unary', label: 'Unary Request/Response Only' },
        { value: 'unary-and-server-stream', label: 'Unary + Server Streaming' },
        { value: 'bidi-stream', label: 'Bidirectional Streaming' },
      ]},
      { id: 'methods', label: 'Service RPC Methods', type: 'textarea', default: 'ProcessOrder(OrderRequest) returns (OrderReply);\nStreamOrderStatus(OrderID) returns (stream StatusUpdate);' },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Build gRPC microservice "${a.serviceName}" in ${a.language} with pattern ${a.streaming}. Methods:\n${a.methods}`,
      epicTitle: `Epic: ${a.serviceName} gRPC Service`,
      epicName: a.serviceName,
      epicBody: `Implement high-performance gRPC service in ${a.language} conforming to Protobuf contract.`,
      labels: ['grpc', 'protobuf', 'backend'],
      stories: [
        { title: `${a.serviceName}: Protobuf Definition & Code Generation`, body: `Create proto3 service schema and automate protoc code generation.` },
        { title: `${a.serviceName}: gRPC Server Handlers Implementation`, body: `Implement RPC endpoints: ${a.methods}` },
        { title: `${a.serviceName}: gRPC Health Checking Protocol & Reflection`, body: `Implement standard grpc.health.v1.Health service and server reflection.` },
        { title: `${a.serviceName}: Unit & Mock Client RPC Verification`, body: `Build automated tests verifying unary and streaming RPC execution.` },
      ]
    })
  },
  {
    id: 'graphql-api-service',
    title: 'Plan to Create a GraphQL API Service',
    category: 'Services & APIs',
    icon: '🔮',
    description: 'Design and deploy a GraphQL schema with queries, mutations, subscriptions, and dataloader batching.',
    fields: [
      { id: 'apiName', label: 'GraphQL API Name', type: 'text', default: 'customer-portal-api', required: true },
      { id: 'serverEngine', label: 'GraphQL Engine', type: 'select', default: 'apollo', options: [
        { value: 'apollo', label: 'Apollo Server (Node.js)' },
        { value: 'yoga', label: 'GraphQL Yoga / Envelop' },
        { value: 'async-graphql', label: 'Async-GraphQL (Rust)' },
        { value: 'spring-graphql', label: 'Spring for GraphQL (Java 21)' },
      ]},
      { id: 'entities', label: 'Schema Types & Resolvers', type: 'textarea', default: 'type Customer { id: ID!, name: String!, orders: [Order!]! }\ntype Order { id: ID!, total: Float!, status: String! }' },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Create GraphQL API "${a.apiName}" using ${a.serverEngine}. Types:\n${a.entities}`,
      epicTitle: `Epic: ${a.apiName} GraphQL Service`,
      epicName: a.apiName,
      epicBody: `Implement GraphQL server with schema definitions, resolver architecture, and query optimization.`,
      labels: ['graphql', 'api', 'backend'],
      stories: [
        { title: `${a.apiName}: Schema SDL & Type Definitions`, body: `Declare GraphQL schema definitions and custom scalar types.` },
        { title: `${a.apiName}: Query & Mutation Resolvers`, body: `Implement resolver logic with DataLoader batching to prevent N+1 queries.` },
        { title: `${a.apiName}: GraphiQL / Apollo Studio Explorer Setup`, body: `Configure interactive developer playground and introspective schema validation.` },
        { title: `${a.apiName}: GraphQL Security & Query Complexity Limiting`, body: `Implement depth limiting, query cost analysis, and rate throttling.` },
      ]
    })
  },
  {
    id: 'event-driven-kafka-service',
    title: 'Plan to Create an Event-Driven Kafka Consumer / Producer',
    category: 'Services & APIs',
    icon: '📨',
    description: 'Build robust asynchronous event streaming with Apache Kafka, consumer groups, and dead-letter queues.',
    fields: [
      { id: 'serviceName', label: 'Service Name', type: 'text', default: 'payment-event-processor', required: true },
      { id: 'topicName', label: 'Kafka Topic(s)', type: 'text', default: 'orders.v1.events, payments.v1.processed' },
      { id: 'schemaFormat', label: 'Message Serialization', type: 'select', default: 'avro', options: [
        { value: 'avro', label: 'Apache Avro with Confluent Schema Registry' },
        { value: 'json-schema', label: 'JSON Schema' },
        { value: 'protobuf', label: 'Protocol Buffers' },
      ]},
      { id: 'semantics', label: 'Delivery Semantics', type: 'select', default: 'at-least-once', options: [
        { value: 'at-least-once', label: 'At-least-once with Idempotent Consumer' },
        { value: 'exactly-once', label: 'Kafka Transactions (Exactly-once)' },
      ]},
    ],
    generatePlan: (a) => makePlan({
      prompt: `Create Kafka event-driven service "${a.serviceName}" on topics "${a.topicName}" using ${a.schemaFormat} and ${a.semantics}.`,
      epicTitle: `Epic: ${a.serviceName} Event Streaming Pipeline`,
      epicName: a.serviceName,
      epicBody: `Design and deliver robust Kafka messaging producer/consumer with idempotency and DLQ.`,
      labels: ['kafka', 'streaming', 'async'],
      stories: [
        { title: `${a.serviceName}: Topic Definitions & Schema Registry Contracts`, body: `Define schema contracts for ${a.topicName} using ${a.schemaFormat}.` },
        { title: `${a.serviceName}: Consumer Group & Idempotency Store`, body: `Implement consumer loop with deduplication cache and checkpoint commits.` },
        { title: `${a.serviceName}: Dead-Letter Queue (DLQ) & Retry Policy`, body: `Build exponential backoff retry topics and terminal DLQ publisher.` },
        { title: `${a.serviceName}: Lag Monitoring & E2E Event Verification`, body: `Add consumer lag metrics and automated test harness emitting synthetic events.` },
      ]
    })
  },
  {
    id: 'realtime-websocket-gateway',
    title: 'Plan to Create a Realtime WebSocket Gateway',
    category: 'Services & APIs',
    icon: '💬',
    description: 'Deploy a high-concurrency WebSocket server for live updates, chat, notifications, and room broadcasting.',
    fields: [
      { id: 'gatewayName', label: 'Gateway Name', type: 'text', default: 'realtime-notification-hub', required: true },
      { id: 'techStack', label: 'Server Engine', type: 'select', default: 'node-ws', options: [
        { value: 'node-ws', label: 'Node.js / uWebSockets.js' },
        { value: 'go-gorilla', label: 'Go / Gorilla WebSocket' },
        { value: 'rust-tokio', label: 'Rust / Tokio Tungstenite' },
      ]},
      { id: 'broadcasting', label: 'Multi-Node Channel Pub/Sub', type: 'select', default: 'redis', options: [
        { value: 'redis', label: 'Redis Pub/Sub' },
        { value: 'nats', label: 'NATS Messaging' },
        { value: 'single-node', label: 'Single Node (Local Memory)' },
      ]},
    ],
    generatePlan: (a) => makePlan({
      prompt: `Build Realtime WebSocket Gateway "${a.gatewayName}" with ${a.techStack} and ${a.broadcasting}.`,
      epicTitle: `Epic: ${a.gatewayName} WebSocket Gateway`,
      epicName: a.gatewayName,
      epicBody: `Implement real-time bidirectional messaging hub with connection heartbeat and clustering.`,
      labels: ['websocket', 'realtime', 'gateway'],
      stories: [
        { title: `${a.gatewayName}: WebSocket Handshake & Auth Validation`, body: `Authenticate connections via ticket or JWT during HTTP upgrade.` },
        { title: `${a.gatewayName}: Room Management & Channel Subscriptions`, body: `Implement client join/leave mechanics and channel routing.` },
        { title: `${a.gatewayName}: Multi-Node Pub/Sub Adapter (${a.broadcasting})`, body: `Synchronize message broadcast across cluster instances via ${a.broadcasting}.` },
        { title: `${a.gatewayName}: Heartbeat, Ping/Pong, & Reconnection Tests`, body: `Build client ping interval and disconnect cleanup routine.` },
      ]
    })
  },
  {
    id: 'webhook-ingestion-service',
    title: 'Plan to Create a Webhook Ingestion & Dispatch Service',
    category: 'Services & APIs',
    icon: '🪝',
    description: 'Receive, verify HMAC signatures, buffer, and process third-party webhooks (Stripe, GitHub, Shopify).',
    fields: [
      { id: 'serviceName', label: 'Service Name', type: 'text', default: 'stripe-webhook-gateway', required: true },
      { id: 'providers', label: 'Webhook Providers', type: 'text', default: 'Stripe, GitHub, Slack' },
      { id: 'storage', label: 'Queue Buffer', type: 'select', default: 'redis-bullmq', options: [
        { value: 'redis-bullmq', label: 'Redis BullMQ Job Queue' },
        { value: 'rabbitmq', label: 'RabbitMQ Message Broker' },
        { value: 'sqs', label: 'AWS SQS / S3 Ingestion' },
      ]},
    ],
    generatePlan: (a) => makePlan({
      prompt: `Implement Webhook Ingestion Service "${a.serviceName}" supporting ${a.providers} buffered via ${a.storage}.`,
      epicTitle: `Epic: ${a.serviceName} Ingestion Gateway`,
      epicName: a.serviceName,
      epicBody: `Reliable webhook receiver with cryptographic signature verification and async worker queue.`,
      labels: ['webhook', 'security', 'backend'],
      stories: [
        { title: `${a.serviceName}: Raw Body Capture & Signature Verification`, body: `Implement cryptographic verification for incoming payloads from ${a.providers}.` },
        { title: `${a.serviceName}: Fast Ingestion & Buffer Queuing (${a.storage})`, body: `Acknowledge HTTP 200 within 100ms and push payload into ${a.storage}.` },
        { title: `${a.serviceName}: Worker Handlers & Idempotency Check`, body: `Deduplicate events by provider event ID and execute business workflows.` },
        { title: `${a.serviceName}: Webhook Audit Log & Replay CLI`, body: `Store raw payloads for audit and build dead-letter replay command.` },
      ]
    })
  },
  {
    id: 'bff-gateway',
    title: 'Plan to Create a Backend-for-Frontend (BFF) Gateway',
    category: 'Services & APIs',
    icon: '🚪',
    description: 'Tailor backend microservice aggregation, token exchange, and response optimization for client apps.',
    fields: [
      { id: 'bffName', label: 'BFF Gateway Name', type: 'text', default: 'mobile-bff-gateway', required: true },
      { id: 'targetClients', label: 'Target Clients', type: 'select', default: 'mobile-web', options: [
        { value: 'mobile-web', label: 'Mobile Apps (iOS/Android) & Web Client' },
        { value: 'partner-portal', label: 'Partner / B2B Third-Party Portal' },
      ]},
    ],
    generatePlan: (a) => makePlan({
      prompt: `Scaffold BFF Gateway "${a.bffName}" for ${a.targetClients}.`,
      epicTitle: `Epic: ${a.bffName} BFF Gateway`,
      epicName: a.bffName,
      epicBody: `Design API aggregation layer tailored for ${a.targetClients}.`,
      labels: ['bff', 'gateway', 'api'],
      stories: [
        { title: `${a.bffName}: Token Exchange & Upstream Credential Delegation`, body: `Exchange incoming client tokens for internal service mesh security tokens.` },
        { title: `${a.bffName}: Parallel Aggregation & Response Slimming`, body: `Fetch from multiple microservices concurrently and strip unneeded payload fields.` },
        { title: `${a.bffName}: Edge Caching & Compression`, body: `Apply Brotli/Gzip compression and HTTP Cache-Control headers.` },
      ]
    })
  },
  {
    id: 'oauth2-auth-service',
    title: 'Plan to Create an OAuth2 / OIDC Identity Provider & Auth Service',
    category: 'Services & APIs',
    icon: '🛡️',
    description: 'Deploy central authentication service issuing JWT tokens, PKCE authorization code flow, and RBAC.',
    fields: [
      { id: 'serviceName', label: 'Auth Service Name', type: 'text', default: 'identity-auth-service', required: true },
      { id: 'flows', label: 'Supported Flows', type: 'select', default: 'pkce-refresh', options: [
        { value: 'pkce-refresh', label: 'Authorization Code + PKCE & Refresh Tokens' },
        { value: 'client-credentials', label: 'Client Credentials (M2M)' },
        { value: 'hybrid', label: 'Full Suite (PKCE, Refresh, M2M, Social Logins)' },
      ]},
    ],
    generatePlan: (a) => makePlan({
      prompt: `Scaffold OAuth2/OIDC Auth Service "${a.serviceName}" supporting ${a.flows}.`,
      epicTitle: `Epic: ${a.serviceName} Identity Provider`,
      epicName: a.serviceName,
      epicBody: `Implement standards-compliant OAuth2 / OpenID Connect authorization server.`,
      labels: ['oauth2', 'auth', 'security'],
      stories: [
        { title: `${a.serviceName}: JWKS Endpoint & Asymmetric Key Rotation`, body: `Expose /.well-known/jwks.json with RS256/ES256 public key distribution.` },
        { title: `${a.serviceName}: Authorize & Token Endpoints (${a.flows})`, body: `Implement /oauth/authorize and /oauth/token validating PKCE code challenges.` },
        { title: `${a.serviceName}: User Credential Store & MFA Support`, body: `Argon2id password hashing, TOTP MFA validation, and lockout rules.` },
        { title: `${a.serviceName}: Role-Based Access Control (RBAC) Claims`, body: `Embed user permissions and roles into JWT token claims.` },
      ]
    })
  },

  // ── Front-End Applications ───────────────────────────────────────────────────
  {
    id: 'frontend-web-app',
    title: 'Plan to Create a Front-End Web Application',
    category: 'Front-End Applications',
    icon: '🌐',
    description: 'Scaffold a modern single-page web app with client routing, design system components, state store, and API integration.',
    fields: [
      { id: 'appName', label: 'Application Name', type: 'text', default: 'customer-portal-web', required: true },
      { id: 'framework', label: 'Frontend Framework', type: 'select', default: 'react-vite', options: [
        { value: 'react-vite', label: 'React 18 + Vite + TypeScript' },
        { value: 'vue-vite', label: 'Vue 3 + Vite + TypeScript' },
        { value: 'svelte-vite', label: 'Svelte 5 + Vite' },
        { value: 'angular', label: 'Angular 17+ Standalone' },
      ]},
      { id: 'cssFramework', label: 'Styling & UI Library', type: 'select', default: 'tailwind', options: [
        { value: 'tailwind', label: 'Tailwind CSS + Radix Primitives / shadcn' },
        { value: 'mui', label: 'Material UI (MUI)' },
        { value: 'vanilla-css', label: 'CSS Modules / Modern Vanilla CSS' },
      ]},
      { id: 'stateStore', label: 'State & API Fetching', type: 'select', default: 'tanstack-query', options: [
        { value: 'tanstack-query', label: 'TanStack Query (React Query) + Zustand' },
        { value: 'redux-toolkit', label: 'Redux Toolkit (RTK)' },
        { value: 'pinia', label: 'Pinia (Vue)' },
        { value: 'fetch-native', label: 'Native Fetch & Context API' },
      ]},
      { id: 'features', label: 'Key Pages & Workflows', type: 'textarea', default: 'Dashboard with analytics charts, user profile management, data grid table with sorting/filtering, and responsive mobile navigation.' },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Scaffold frontend web application "${a.appName}" using ${a.framework}, styled with ${a.cssFramework}, state via ${a.stateStore}. Features: ${a.features}`,
      epicTitle: `Epic: ${a.appName} Front-End Web App`,
      epicName: a.appName,
      epicBody: `Develop responsive front-end application with ${a.framework} and ${a.cssFramework}.`,
      labels: ['frontend', 'web', 'ui'],
      stories: [
        { title: `${a.appName}: Project Scaffolding, Tooling & Build Pipeline`, body: `Configure Vite build, TypeScript strict mode, ESLint, and Prettier.` },
        { title: `${a.appName}: Design System & Theme Layout Shell`, body: `Implement base layout, header, navigation sidebar, and ${a.cssFramework} components.` },
        { title: `${a.appName}: API Client & State Management (${a.stateStore})`, body: `Setup HTTP client with JWT interceptors and cache management via ${a.stateStore}.` },
        { title: `${a.appName}: Primary Views & Workflows`, body: `Implement features: ${a.features}` },
        { title: `${a.appName}: Accessibility (a11y) & Automated Component Tests`, body: `Ensure WCAG 2.1 AA accessibility and Vitest / Testing Library suites.` },
      ]
    })
  },
  {
    id: 'react-frontend-app',
    title: 'Plan to Create a React Front-End App',
    category: 'Front-End Applications',
    icon: '⚛️',
    description: 'Scaffold a production React application with TypeScript, Tailwind CSS, TanStack Query, and Vitest.',
    fields: [
      { id: 'appName', label: 'React App Name', type: 'text', default: 'petstore-adoption-portal', required: true },
      { id: 'router', label: 'Routing Solution', type: 'select', default: 'tanstack-router', options: [
        { value: 'tanstack-router', label: 'TanStack Router (Type-safe routing)' },
        { value: 'react-router', label: 'React Router v6+' },
      ]},
      { id: 'components', label: 'UI Component Set', type: 'select', default: 'shadcn', options: [
        { value: 'shadcn', label: 'shadcn/ui (Radix UI + Tailwind)' },
        { value: 'chakra', label: 'Chakra UI v3' },
        { value: 'mantine', label: 'Mantine UI' },
      ]},
      { id: 'views', label: 'Target Views & Forms', type: 'textarea', default: 'Adoption catalog grid, pet details drawer, multistep adoption application form with react-hook-form and zod validation.' },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Build React application "${a.appName}" with ${a.router}, ${a.components}. Views:\n${a.views}`,
      epicTitle: `Epic: ${a.appName} React Application`,
      epicName: a.appName,
      epicBody: `Scaffold and implement modern React application with type-safe routing and accessible components.`,
      labels: ['react', 'frontend', 'typescript'],
      stories: [
        { title: `${a.appName}: React + Vite Setup with ${a.router}`, body: `Initialize React 18, TypeScript, and configure routes.` },
        { title: `${a.appName}: Component Library & Theme Setup (${a.components})`, body: `Integrate ${a.components}, dark/light theme switching, and core primitives.` },
        { title: `${a.appName}: View Implementation & Form Validation`, body: `Build target views: ${a.views}` },
        { title: `${a.appName}: State Synchronization & Unit Testing`, body: `Add TanStack Query cache invalidation and Vitest component tests.` },
      ]
    })
  },
  {
    id: 'nextjs-fullstack-app',
    title: 'Plan to Create a Next.js Fullstack SSR Web App',
    category: 'Front-End Applications',
    icon: '▲',
    description: 'Scaffold Next.js App Router project with Server Components, Server Actions, SEO metadata, and auth.',
    fields: [
      { id: 'appName', label: 'Next.js App Name', type: 'text', default: 'storefront-nextjs', required: true },
      { id: 'rendering', label: 'Rendering Strategy', type: 'select', default: 'hybrid', options: [
        { value: 'hybrid', label: 'Hybrid SSR + Static Generation (ISR)' },
        { value: 'pure-ssr', label: 'Dynamic Server Rendering (SSR)' },
        { value: 'static-export', label: 'Static Export (SSG / CDN)' },
      ]},
      { id: 'authSolution', label: 'Auth Solution', type: 'select', default: 'nextauth', options: [
        { value: 'nextauth', label: 'Auth.js (NextAuth v5)' },
        { value: 'clerk', label: 'Clerk Authentication' },
        { value: 'custom-jwt', label: 'Custom HTTP-only Cookies JWT' },
      ]},
    ],
    generatePlan: (a) => makePlan({
      prompt: `Scaffold Next.js application "${a.appName}" with ${a.rendering} and ${a.authSolution}.`,
      epicTitle: `Epic: ${a.appName} Next.js Fullstack App`,
      epicName: a.appName,
      epicBody: `Implement Next.js App Router application with server actions and SEO optimization.`,
      labels: ['nextjs', 'react', 'fullstack'],
      stories: [
        { title: `${a.appName}: Next.js App Router & Layout Scaffolding`, body: `Setup App Router directory, root layout, and fonts.` },
        { title: `${a.appName}: Authentication Integration (${a.authSolution})`, body: `Configure ${a.authSolution} with middleware route protection.` },
        { title: `${a.appName}: Server Actions & Mutation Endpoints`, body: `Implement type-safe Server Actions for form submissions and data updates.` },
        { title: `${a.appName}: SEO OpenGraph Metadata & Performance Audit`, body: `Configure dynamic metadata, sitemap.xml, robots.txt, and Lighthouse optimization.` },
      ]
    })
  },
  {
    id: 'vue3-spa',
    title: 'Plan to Create a Vue 3 Single-Page Application',
    category: 'Front-End Applications',
    icon: '💚',
    description: 'Scaffold Vue 3 with Composition API, Pinia state store, Vue Router, and PrimeVue/Tailwind.',
    fields: [
      { id: 'appName', label: 'Vue App Name', type: 'text', default: 'admin-dashboard-vue', required: true },
      { id: 'uiKit', label: 'UI Kit', type: 'select', default: 'primevue', options: [
        { value: 'primevue', label: 'PrimeVue 4 Components' },
        { value: 'tailwind', label: 'Tailwind CSS + Headless UI' },
        { value: 'vuetify', label: 'Vuetify 3 Material Design' },
      ]},
    ],
    generatePlan: (a) => makePlan({
      prompt: `Build Vue 3 SPA "${a.appName}" with ${a.uiKit} and Pinia.`,
      epicTitle: `Epic: ${a.appName} Vue 3 SPA`,
      epicName: a.appName,
      epicBody: `Scaffold Vue 3 application with Pinia and ${a.uiKit}.`,
      labels: ['vue', 'frontend', 'spa'],
      stories: [
        { title: `${a.appName}: Vue 3 + Vite Scaffolding`, body: `Configure Vite with vue-tsc and script setup SFC syntax.` },
        { title: `${a.appName}: Pinia State Store & Vue Router`, body: `Build structured store modules and navigation guards.` },
        { title: `${a.appName}: UI Views with ${a.uiKit}`, body: `Implement core application views using ${a.uiKit}.` },
      ]
    })
  },
  {
    id: 'sveltekit-app',
    title: 'Plan to Create a SvelteKit High-Performance Web App',
    category: 'Front-End Applications',
    icon: '🧡',
    description: 'Scaffold Svelte 5 / SvelteKit app with runes, server load functions, and optimized bundles.',
    fields: [
      { id: 'appName', label: 'SvelteKit App Name', type: 'text', default: 'fast-metrics-svelte', required: true },
      { id: 'adapter', label: 'Deployment Adapter', type: 'select', default: 'adapter-node', options: [
        { value: 'adapter-node', label: 'Node.js Server Adapter' },
        { value: 'adapter-static', label: 'Static SPA Adapter' },
        { value: 'adapter-auto', label: 'Auto (Vercel / Cloudflare)' },
      ]},
    ],
    generatePlan: (a) => makePlan({
      prompt: `Build SvelteKit application "${a.appName}" with Svelte 5 runes and ${a.adapter}.`,
      epicTitle: `Epic: ${a.appName} SvelteKit Web App`,
      epicName: a.appName,
      epicBody: `Scaffold high-speed SvelteKit application using runes and server load functions.`,
      labels: ['svelte', 'sveltekit', 'frontend'],
      stories: [
        { title: `${a.appName}: Svelte 5 + SvelteKit Scaffolding`, body: `Initialize SvelteKit project with TypeScript and ${a.adapter}.` },
        { title: `${a.appName}: Reactive Runes & Data Loading`, body: `Implement +page.server.ts load functions and $state() reactive runes.` },
        { title: `${a.appName}: Transitions & Visual Polish`, body: `Add smooth CSS/JS transitions and responsive layouts.` },
      ]
    })
  },
  {
    id: 'electron-desktop-app',
    title: 'Plan to Create an Electron Desktop Application',
    category: 'Front-End Applications',
    icon: '💻',
    description: 'Scaffold a cross-platform desktop app with Electron, secure IPC contextBridge, system tray, and auto-updater.',
    fields: [
      { id: 'appName', label: 'Desktop App Name', type: 'text', default: 'robos-system-monitor', required: true },
      { id: 'traySupport', label: 'System Tray & Window Modes', type: 'select', default: 'tray-and-window', options: [
        { value: 'tray-and-window', label: 'Main Window + System Tray Minimization' },
        { value: 'window-only', label: 'Standard Desktop Window Only' },
        { value: 'tray-popup', label: 'Tray Popup Menu Bar App' },
      ]},
    ],
    generatePlan: (a) => makePlan({
      prompt: `Build Electron desktop application "${a.appName}" with ${a.traySupport}.`,
      epicTitle: `Epic: ${a.appName} Electron Desktop App`,
      epicName: a.appName,
      epicBody: `Build secure multi-process Electron application with preload isolation and native integration.`,
      labels: ['electron', 'desktop', 'javascript'],
      stories: [
        { title: `${a.appName}: Main & Preload Process Architecture`, body: `Configure BrowserWindow, contextIsolation, and safe IPC bridge.` },
        { title: `${a.appName}: Native System Tray & Window Controls`, body: `Implement system tray icon, context menu, and minimize-to-tray handling.` },
        { title: `${a.appName}: Dark Theme UI & Local Storage Sync`, body: `Build responsive dark-themed renderer UI and persistent configuration storage.` },
        { title: `${a.appName}: Electron-Builder Packaging & Auto-Update`, body: `Configure AppImage/deb/dmg build pipelines.` },
      ]
    })
  },
  {
    id: 'micro-frontend-module',
    title: 'Plan to Create a Micro-Frontend Shell & Remote MFE Module',
    category: 'Front-End Applications',
    icon: '🧩',
    description: 'Architect a Module Federation micro-frontend host shell and independently deployable remote modules.',
    fields: [
      { id: 'mfeName', label: 'Module Name', type: 'text', default: 'billing-remote-mfe', required: true },
      { id: 'federationTool', label: 'Federation Tooling', type: 'select', default: 'vite-federation', options: [
        { value: 'vite-federation', label: '@originjs/vite-plugin-federation' },
        { value: 'webpack-mf', label: 'Webpack 5 Module Federation' },
      ]},
    ],
    generatePlan: (a) => makePlan({
      prompt: `Create Micro-Frontend "${a.mfeName}" using ${a.federationTool}.`,
      epicTitle: `Epic: ${a.mfeName} Micro-Frontend Remote`,
      epicName: a.mfeName,
      epicBody: `Build isolated micro-frontend module communicating with host application shell.`,
      labels: ['micro-frontend', 'architecture', 'frontend'],
      stories: [
        { title: `${a.mfeName}: Module Federation Config & Exposed Components`, body: `Configure exposed remote entries and shared singleton libraries.` },
        { title: `${a.mfeName}: Standalone Dev Harness & Isolated Execution`, body: `Provide mock host context for independent local development.` },
        { title: `${a.mfeName}: Cross-MFE Event Bus & Navigation Sync`, body: `Implement custom event bus for cross-boundary communication.` },
      ]
    })
  },

  // ── Game Development ─────────────────────────────────────────────────────────
  {
    id: 'godot-game',
    title: 'Plan to Create a Godot Game',
    category: 'Game Development',
    icon: '🎮',
    description: 'Design and build a 2D or 3D game using Godot Engine 4.2+, GDScript/C#, scene tree nodes, and physics.',
    fields: [
      { id: 'gameTitle', label: 'Game Title', type: 'text', default: 'dungeon-crawler-godot', required: true },
      { id: 'dimension', label: 'Game Dimension & Style', type: 'select', default: '2d-pixel', options: [
        { value: '2d-pixel', label: '2D Pixel Art / Sprite-based' },
        { value: '2d-vector', label: '2D Vector / Hand-drawn' },
        { value: '3d-lowpoly', label: '3D Low-Poly / Stylized' },
        { value: '3d-realistic', label: '3D Realistic (Vulkan Forward+)' },
      ]},
      { id: 'scriptingLang', label: 'Scripting Language', type: 'select', default: 'gdscript', options: [
        { value: 'gdscript', label: 'GDScript (Recommended for Godot)' },
        { value: 'csharp', label: 'C# (.NET 8)' },
      ]},
      { id: 'mechanics', label: 'Core Gameplay Loop', type: 'textarea', default: 'Top-down player movement, melee and ranged combat, enemy pathfinding with NavigationServer, inventory, and procedural level generation.' },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Plan and scaffold Godot 4.2+ game "${a.gameTitle}" (${a.dimension}) in ${a.scriptingLang}. Mechanics:\n${a.mechanics}`,
      epicTitle: `Epic: ${a.gameTitle} Godot Game Development`,
      epicName: a.gameTitle,
      epicBody: `Develop Godot Engine game incorporating player character, scene architecture, and physics.`,
      labels: ['game', 'godot', 'gamedev'],
      stories: [
        { title: `${a.gameTitle}: Godot 4 Project Scaffolding & Scene Hierarchy`, body: `Configure project settings, input map keybindings, and root scene structure in ${a.scriptingLang}.` },
        { title: `${a.gameTitle}: Player Controller & Movement State Machine`, body: `Implement CharacterBody node with velocity, acceleration, and state machine (idle, run, attack, hurt).` },
        { title: `${a.gameTitle}: Level Design, Tilemap & Physics Collision`, body: `Setup ${(a.dimension || '2d').includes('2d') ? 'TileMapLayer' : 'GridMap'} collisions, lighting, and camera limits.` },
        { title: `${a.gameTitle || 'Game'}: Core Gameplay Mechanics: ${(a.mechanics || 'Core Loop').slice(0, 40)}…`, body: `Implement mechanics: ${a.mechanics || ''}` },
        { title: `${a.gameTitle}: UI HUD, Pause Menu, & Sound AudioBus Setup`, body: `Build Control node HUD (health bar, inventory, score) and audio buses with SFX/BGM.` },
      ]
    })
  },
  {
    id: 'unity-pc-game',
    title: 'Plan to Create a Unity 6 PC/Console Game',
    category: 'Game Development',
    icon: '🕹️',
    description: 'Scaffold a PC game in Unity 6 using Universal Render Pipeline (URP), C#, and new Input System.',
    fields: [
      { id: 'gameTitle', label: 'Game Title', type: 'text', default: 'cyber-assault-unity', required: true },
      { id: 'renderPipeline', label: 'Render Pipeline', type: 'select', default: 'urp', options: [
        { value: 'urp', label: 'Universal Render Pipeline (URP)' },
        { value: 'hdrp', label: 'High Definition Render Pipeline (HDRP)' },
      ]},
      { id: 'genre', label: 'Genre & Target', type: 'text', default: 'Third-person action adventure for Steam PC' },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Scaffold Unity 6 PC game "${a.gameTitle}" using ${a.renderPipeline}. Genre: ${a.genre}`,
      epicTitle: `Epic: ${a.gameTitle} Unity PC Game`,
      epicName: a.gameTitle,
      epicBody: `Develop Unity 6 PC game with C# scripting and ${a.renderPipeline}.`,
      labels: ['unity', 'gamedev', 'pc'],
      stories: [
        { title: `${a.gameTitle}: Unity 6 Project & ${(a.renderPipeline || 'URP').toUpperCase()} Setup`, body: `Configure quality settings, post-processing volume, and asset bundles.` },
        { title: `${a.gameTitle}: Input System (Keyboard + Gamepad Controller)`, body: `Create Input Action Asset supporting keyboard/mouse and Xbox/DualShock controllers.` },
        { title: `${a.gameTitle}: Player Character Rigidbody & Animation Controller`, body: `Implement Animator state machine and kinematic/dynamic physics interactions.` },
        { title: `${a.gameTitle}: Steamworks SDK Integration & Cloud Save`, body: `Initialize Steamworks API for achievements, stats, and cloud save.` },
      ]
    })
  },
  {
    id: 'unity-mobile-game',
    title: 'Plan to Create a Unity 6 Mobile Game',
    category: 'Game Development',
    icon: '📱',
    description: 'Build an optimized mobile game for iOS & Android with touch gestures, low battery footprint, and in-app purchases.',
    fields: [
      { id: 'gameTitle', label: 'Mobile Game Title', type: 'text', default: 'puzzle-quest-mobile', required: true },
      { id: 'monetization', label: 'Monetization & Ads', type: 'select', default: 'iap-and-ads', options: [
        { value: 'iap-and-ads', label: 'Unity IAP + Unity Ads / AdMob Rewarded' },
        { value: 'premium', label: 'Premium Paid Game (No Ads)' },
      ]},
    ],
    generatePlan: (a) => makePlan({
      prompt: `Scaffold Unity 6 Mobile Game "${a.gameTitle}" with ${a.monetization}.`,
      epicTitle: `Epic: ${a.gameTitle} Unity Mobile Game`,
      epicName: a.gameTitle,
      epicBody: `Deliver high-performance mobile game targeting iOS and Android devices.`,
      labels: ['unity', 'mobile', 'gamedev'],
      stories: [
        { title: `${a.gameTitle}: Mobile Resolution Scaling & Asset Bundles`, body: `Configure dynamic resolution, texture compression (ASTC), and memory budgets.` },
        { title: `${a.gameTitle}: Touch Input & Mobile UI Canvas`, body: `Implement multi-touch pinch/swipe gestures and safe area notch anchors.` },
        { title: `${a.gameTitle}: Monetization Integration (${a.monetization})`, body: `Configure store items, restore purchases for Apple/Google, and rewarded video ads.` },
      ]
    })
  },
  {
    id: 'unreal-pc-game',
    title: 'Plan to Create an Unreal Engine 5 PC Action Game',
    category: 'Game Development',
    icon: '⚔️',
    description: 'Scaffold an Unreal Engine 5 game utilizing Nanite, Lumen, Enhanced Input, and C++ gameplay classes.',
    fields: [
      { id: 'gameTitle', label: 'Game Project Name', type: 'text', default: 'space-raiders-ue5', required: true },
      { id: 'architecture', label: 'Code Architecture', type: 'select', default: 'hybrid-cpp-bp', options: [
        { value: 'hybrid-cpp-bp', label: 'C++ Core Classes + Blueprint Extension (Recommended)' },
        { value: 'blueprints-only', label: 'Blueprints Only' },
      ]},
    ],
    generatePlan: (a) => makePlan({
      prompt: `Scaffold Unreal Engine 5 game "${a.gameTitle}" with ${a.architecture}.`,
      epicTitle: `Epic: ${a.gameTitle} Unreal Engine 5 Game`,
      epicName: a.gameTitle,
      epicBody: `Implement UE5 action game with Lumen lighting and Enhanced Input system.`,
      labels: ['ue5', 'unreal', 'gamedev'],
      stories: [
        { title: `${a.gameTitle}: UE5 Project Setup, Nanite & Lumen Configuration`, body: `Initialize UE5 C++ project, configure rendering features and shader caching.` },
        { title: `${a.gameTitle}: Enhanced Input & Character Movement Component`, body: `Implement input mapping contexts and custom Character Movement Component.` },
        { title: `${a.gameTitle}: Gameplay Ability System (GAS) & Combat Logic`, body: `Configure Gameplay Attributes (Health, Mana, Stamina) and ability triggers.` },
      ]
    })
  },
  {
    id: 'bevy-rust-game',
    title: 'Plan to Create a Rust Bevy ECS Game',
    category: 'Game Development',
    icon: '🦀',
    description: 'Build a blazing fast 2D/3D game in Rust using Bevy ECS, WGPU rendering, and data-driven systems.',
    fields: [
      { id: 'gameTitle', label: 'Crate Name', type: 'text', default: 'starship-tactics-bevy', required: true },
      { id: 'dimension', label: 'Dimension', type: 'select', default: '2d', options: [
        { value: '2d', label: '2D Sprite & Physics' },
        { value: '3d', label: '3D Mesh, PBR Materials & Lighting' },
      ]},
    ],
    generatePlan: (a) => makePlan({
      prompt: `Scaffold Bevy Rust ECS game "${a.gameTitle}" in ${a.dimension}.`,
      epicTitle: `Epic: ${a.gameTitle} Bevy Game`,
      epicName: a.gameTitle,
      epicBody: `Develop Rust Bevy 0.13 game utilizing ECS data-driven architecture.`,
      labels: ['rust', 'bevy', 'gamedev'],
      stories: [
        { title: `${a.gameTitle}: Cargo Setup & Bevy App Plugins`, body: `Configure Cargo.toml with fast compiling dynamic linking and Bevy DefaultPlugins.` },
        { title: `${a.gameTitle}: ECS Components, Resources & Systems`, body: `Define Component structs and System functions for game loop.` },
        { title: `${a.gameTitle}: Asset Loader & State Transitions`, body: `Implement game states (Loading, MainMenu, InGame) and texture atlas loading.` },
      ]
    })
  },

  // ── Mobile Applications ──────────────────────────────────────────────────────
  {
    id: 'mobile-app',
    title: 'Plan to Create a Mobile App',
    category: 'Mobile Applications',
    icon: '📱',
    description: 'Design and deliver an iOS and Android mobile app with device permissions, push notifications, and offline sync.',
    fields: [
      { id: 'appName', label: 'App Name', type: 'text', default: 'acme-delivery-driver', required: true },
      { id: 'platform', label: 'Development Platform', type: 'select', default: 'react-native-expo', options: [
        { value: 'react-native-expo', label: 'React Native / Expo' },
        { value: 'flutter', label: 'Flutter / Dart' },
        { value: 'native-swift', label: 'Native iOS (Swift)' },
        { value: 'native-kotlin', label: 'Native Android (Kotlin)' },
      ]},
      { id: 'offline', label: 'Offline Storage & Sync', type: 'select', default: 'sqlite-watermelondb', options: [
        { value: 'sqlite-watermelondb', label: 'SQLite / WatermelonDB / Drift' },
        { value: 'async-storage', label: 'Key-Value / AsyncStorage' },
        { value: 'online-only', label: 'Online Only (No offline cache)' },
      ]},
      { id: 'features', label: 'Mobile Features', type: 'textarea', default: 'Geolocation GPS tracking, push notifications (FCM/APNS), camera photo upload, biometric login.' },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Build Mobile App "${a.appName}" using ${a.platform} with offline sync ${a.offline}. Features: ${a.features}`,
      epicTitle: `Epic: ${a.appName} Mobile Application`,
      epicName: a.appName,
      epicBody: `Develop mobile application on ${a.platform} with offline sync and native hardware capabilities.`,
      labels: ['mobile', 'ios', 'android'],
      stories: [
        { title: `${a.appName}: Project Scaffolding & Native Builds`, body: `Initialize project structure with ${a.platform} and configure iOS Pods / Android Gradle.` },
        { title: `${a.appName}: Local Database & Offline Sync (${a.offline})`, body: `Implement local persistence and offline-first queue synchronizing on reconnect.` },
        { title: `${a.appName}: Native Permissions & Hardware Access`, body: `Implement hardware integration: ${a.features}` },
        { title: `${a.appName}: Push Notifications (APNS & FCM)`, body: `Register device push tokens and handle background notification triggers.` },
      ]
    })
  },
  {
    id: 'react-native-app',
    title: 'Plan to Create a React Native Cross-Platform App',
    category: 'Mobile Applications',
    icon: '📱',
    description: 'Scaffold an Expo / React Native application with TypeScript, React Navigation, and native device modules.',
    fields: [
      { id: 'appName', label: 'App Name', type: 'text', default: 'health-tracker-mobile', required: true },
      { id: 'navigation', label: 'Navigation', type: 'select', default: 'tabs-and-stack', options: [
        { value: 'tabs-and-stack', label: 'Bottom Tabs + Native Stack Navigation' },
        { value: 'drawer', label: 'Drawer Navigation' },
      ]},
    ],
    generatePlan: (a) => makePlan({
      prompt: `Scaffold React Native Expo app "${a.appName}" with ${a.navigation}.`,
      epicTitle: `Epic: ${a.appName} React Native App`,
      epicName: a.appName,
      epicBody: `Build cross-platform React Native app with TypeScript and Expo Router.`,
      labels: ['react-native', 'expo', 'mobile'],
      stories: [
        { title: `${a.appName}: Expo Router & TypeScript Setup`, body: `Initialize Expo project with file-based routing and navigation tabs.` },
        { title: `${a.appName}: UI Screens & Safe Area Layouts`, body: `Implement responsive screens adapting to screen dimensions and notches.` },
        { title: `${a.appName}: Biometric Auth & Secure Store`, body: `Secure credentials with Expo LocalAuthentication and SecureStore.` },
      ]
    })
  },
  {
    id: 'flutter-mobile-app',
    title: 'Plan to Create a Flutter Cross-Platform Mobile App',
    category: 'Mobile Applications',
    icon: '💙',
    description: 'Scaffold a Flutter application with Dart, Riverpod state management, and Material 3 design.',
    fields: [
      { id: 'appName', label: 'Flutter App Name', type: 'text', default: 'fleet-manager-flutter', required: true },
      { id: 'stateManagement', label: 'State Management', type: 'select', default: 'riverpod', options: [
        { value: 'riverpod', label: 'Riverpod 2.x' },
        { value: 'bloc', label: 'BLoC Pattern' },
      ]},
    ],
    generatePlan: (a) => makePlan({
      prompt: `Build Flutter app "${a.appName}" using ${a.stateManagement}.`,
      epicTitle: `Epic: ${a.appName} Flutter App`,
      epicName: a.appName,
      epicBody: `Develop multiplatform Flutter mobile app with ${a.stateManagement}.`,
      labels: ['flutter', 'dart', 'mobile'],
      stories: [
        { title: `${a.appName}: Flutter Scaffolding & Theme System`, body: `Initialize Flutter project with Material 3 light/dark themes.` },
        { title: `${a.appName}: State Management with ${a.stateManagement}`, body: `Implement controllers, providers, and immutability stores.` },
        { title: `${a.appName}: Platform Channels & Native Device APIs`, body: `Integrate native iOS/Android bridge channels.` },
      ]
    })
  },
  {
    id: 'native-ios-swift',
    title: 'Plan to Create a Native iOS Swift App',
    category: 'Mobile Applications',
    icon: '🍎',
    description: 'Build a native iOS app using SwiftUI, Swift Concurrency, SwiftData, and Apple Human Interface Guidelines.',
    fields: [
      { id: 'appName', label: 'iOS App Name', type: 'text', default: 'journal-notes-ios', required: true },
      { id: 'storage', label: 'Storage Engine', type: 'select', default: 'swiftdata', options: [
        { value: 'swiftdata', label: 'SwiftData (@Model)' },
        { value: 'coredata', label: 'Core Data' },
      ]},
    ],
    generatePlan: (a) => makePlan({
      prompt: `Build native iOS SwiftUI app "${a.appName}" with ${a.storage}.`,
      epicTitle: `Epic: ${a.appName} iOS Swift App`,
      epicName: a.appName,
      epicBody: `Implement modern iOS application using SwiftUI and SwiftData.`,
      labels: ['ios', 'swift', 'swiftui'],
      stories: [
        { title: `${a.appName}: Xcode Project Scaffolding & SwiftUI App Lifecycle`, body: `Configure App struct, NavigationSplitView, and asset catalogs.` },
        { title: `${a.appName}: Persistence Layer with ${a.storage}`, body: `Define schema models and container migrations.` },
        { title: `${a.appName}: WidgetKit & Dynamic Island Extensions`, body: `Expose home screen widgets and live activity tracking.` },
      ]
    })
  },
  {
    id: 'native-android-kotlin',
    title: 'Plan to Create a Native Android Kotlin App',
    category: 'Mobile Applications',
    icon: '🤖',
    description: 'Build a native Android app using Jetpack Compose, Kotlin Coroutines, Room DB, and Hilt dependency injection.',
    fields: [
      { id: 'appName', label: 'Android App Name', type: 'text', default: 'warehouse-scanner-android', required: true },
      { id: 'diFramework', label: 'Dependency Injection', type: 'select', default: 'hilt', options: [
        { value: 'hilt', label: 'Dagger Hilt' },
        { value: 'koin', label: 'Koin' },
      ]},
    ],
    generatePlan: (a) => makePlan({
      prompt: `Build native Android Kotlin app "${a.appName}" with Jetpack Compose and ${a.diFramework}.`,
      epicTitle: `Epic: ${a.appName} Android App`,
      epicName: a.appName,
      epicBody: `Implement native Android app with Jetpack Compose and modern architecture.`,
      labels: ['android', 'kotlin', 'compose'],
      stories: [
        { title: `${a.appName}: Gradle Module & Compose Setup`, body: `Configure Kotlin multi-module build and Compose theme.` },
        { title: `${a.appName}: Room Database & Repository Pattern`, body: `Build Room DAOs, entities, and Flow-based queries.` },
        { title: `${a.appName}: Jetpack Compose Screens & Navigation`, body: `Implement composable views and ViewModel state flow.` },
      ]
    })
  },

  // ── Libraries & SDKs ─────────────────────────────────────────────────────────
  {
    id: 'java-library',
    title: 'Plan to Create a Java Library',
    category: 'Libraries & SDKs',
    icon: '☕',
    description: 'Scaffold a reusable Java 21 library with Gradle/Maven, comprehensive Javadoc, JUnit 5 tests, and publishing setup.',
    fields: [
      { id: 'libraryName', label: 'Library / Artifact ID', type: 'text', default: 'acme-commons-crypto', required: true },
      { id: 'groupPackage', label: 'Group & Base Package', type: 'text', default: 'com.acme.commons.crypto' },
      { id: 'buildTool', label: 'Build System', type: 'select', default: 'gradle-kotlin', options: [
        { value: 'gradle-kotlin', label: 'Gradle (Kotlin DSL)' },
        { value: 'maven', label: 'Maven (pom.xml)' },
      ]},
      { id: 'purpose', label: 'Library Scope & Deliverables', type: 'textarea', default: 'Utility library providing AES-256-GCM encryption, HMAC signing, zero-allocation buffer serialization, and Spring Boot auto-configuration module.' },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Design and implement Java library "${a.libraryName}" under package "${a.groupPackage}" using ${a.buildTool}. Scope:\n${a.purpose}`,
      epicTitle: `Epic: ${a.libraryName} Java Library Scaffolding & Publishing`,
      epicName: a.libraryName,
      epicBody: `Develop reusable Java 21 library conforming to enterprise publishing guidelines.`,
      labels: ['java', 'library', 'sdk'],
      stories: [
        { title: `${a.libraryName}: ${(a.buildTool || 'gradle').includes('gradle') ? 'build.gradle.kts' : 'pom.xml'} Configuration & Multi-Release Jar`, body: `Configure compiler flags, modular java-module-info, and dependency scopes.` },
        { title: `${a.libraryName}: Core API Interfaces & Implementation Classes`, body: `Implement classes for: ${a.purpose}` },
        { title: `${a.libraryName}: JUnit 5 & AssertJ Test Suite with Pitest Mutation Testing`, body: `Achieve >90% code coverage and verify edge cases.` },
        { title: `${a.libraryName}: Javadoc Generation & Maven Central / Nexus Publishing`, body: `Configure maven-publish plugin, GPG artifact signing, and CI release workflow.` },
      ]
    })
  },
  {
    id: 'typescript-npm-package',
    title: 'Plan to Create a TypeScript / NPM Library',
    category: 'Libraries & SDKs',
    icon: '📦',
    description: 'Build a dual ESM/CJS TypeScript library with bundle export maps, Vitest, and npm release automation.',
    fields: [
      { id: 'pkgName', label: 'Package Name', type: 'text', default: '@acme/validation-rules', required: true },
      { id: 'bundler', label: 'Bundler', type: 'select', default: 'tsup', options: [
        { value: 'tsup', label: 'tsup (esbuild-powered dual build)' },
        { value: 'unbuild', label: 'unbuild (unjs)' },
        { value: 'tsc', label: 'Pure tsc compiler' },
      ]},
    ],
    generatePlan: (a) => makePlan({
      prompt: `Create TypeScript npm package "${a.pkgName}" using ${a.bundler}.`,
      epicTitle: `Epic: ${a.pkgName} TypeScript Library`,
      epicName: a.pkgName,
      epicBody: `Scaffold and publish robust TypeScript library with dual ESM/CJS bundles.`,
      labels: ['typescript', 'npm', 'library'],
      stories: [
        { title: `${a.pkgName}: package.json Export Maps & TypeScript Config`, body: `Configure exports, types, and dual module resolution.` },
        { title: `${a.pkgName}: Core Module Implementations & Type Declarations`, body: `Build strongly typed functions and .d.ts outputs.` },
        { title: `${a.pkgName}: Vitest Unit Tests & npm Publishing Pipeline`, body: `Setup automated tests and changesets / release action.` },
      ]
    })
  },
  {
    id: 'python-pypi-package',
    title: 'Plan to Create a Python PyPI Package',
    category: 'Libraries & SDKs',
    icon: '🐍',
    description: 'Scaffold a modern Python package with pyproject.toml, Poetry/Hatch, Ruff linter, and pytest.',
    fields: [
      { id: 'pkgName', label: 'Package Name', type: 'text', default: 'acme-data-cleaner', required: true },
      { id: 'packagingTool', label: 'Packaging Tool', type: 'select', default: 'poetry', options: [
        { value: 'poetry', label: 'Poetry' },
        { value: 'hatch', label: 'Hatch' },
        { value: 'flit', label: 'Flit' },
      ]},
    ],
    generatePlan: (a) => makePlan({
      prompt: `Scaffold Python package "${a.pkgName}" using ${a.packagingTool}.`,
      epicTitle: `Epic: ${a.pkgName} Python Package`,
      epicName: a.pkgName,
      epicBody: `Create typed Python package with modern pyproject.toml standards.`,
      labels: ['python', 'pypi', 'library'],
      stories: [
        { title: `${a.pkgName}: pyproject.toml & Build Environment`, body: `Configure ${a.packagingTool} with Python 3.10+ compatibility matrix.` },
        { title: `${a.pkgName}: Core Python Modules with Type Annotations`, body: `Write library logic adhering to PEP 484 type hinting and mypy validation.` },
        { title: `${a.pkgName}: Pytest Suite, Ruff Linting & Trusted Publisher CI`, body: `Automate test runners and PyPI Trusted Publisher workflow.` },
      ]
    })
  },
  {
    id: 'go-module',
    title: 'Plan to Create a Go Module / CLI Library',
    category: 'Libraries & SDKs',
    icon: '🐹',
    description: 'Scaffold a Go module with semver tagging, subpackages, godoc comments, and benchmark tests.',
    fields: [
      { id: 'modulePath', label: 'Module Path', type: 'text', default: 'github.com/acme/retry-go', required: true },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Scaffold Go module "${a.modulePath}".`,
      epicTitle: `Epic: ${a.modulePath} Go Module`,
      epicName: a.modulePath,
      epicBody: `Implement clean Go module with idiomatic error handling and benchmarking.`,
      labels: ['go', 'module', 'library'],
      stories: [
        { title: `${a.modulePath}: go.mod & Package Organization`, body: `Initialize go.mod and internal / public packages.` },
        { title: `${a.modulePath}: Implementation & GoDoc Documentation`, body: `Write idiomatic Go functions with context.Context propagation.` },
        { title: `${a.modulePath}: Unit Tests, Benchmarks & Race Detector`, body: `Run go test -race -bench=. with 100% test coverage.` },
      ]
    })
  },
  {
    id: 'rust-crates-io-library',
    title: 'Plan to Create a Rust Crates.io Library',
    category: 'Libraries & SDKs',
    icon: '🦀',
    description: 'Develop a high-reliability Rust crate with cargo workspace, doc tests, and clippy lints.',
    fields: [
      { id: 'crateName', label: 'Crate Name', type: 'text', default: 'acme-id-gen', required: true },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Scaffold Rust crate "${a.crateName}".`,
      epicTitle: `Epic: ${a.crateName} Rust Crate`,
      epicName: a.crateName,
      epicBody: `Develop zero-cost Rust library with comprehensive doc-tests.`,
      labels: ['rust', 'crate', 'library'],
      stories: [
        { title: `${a.crateName}: Cargo.toml Metadata & Features`, body: `Configure feature flags, categories, and keywords.` },
        { title: `${a.crateName}: Memory-Safe Implementation & Trait Design`, body: `Write robust traits, error types, and safe abstractions.` },
        { title: `${a.crateName}: Cargo Test, Clippy, & Cargo Deny CI`, body: `Run cargo clippy --all-targets -- -D warnings.` },
      ]
    })
  },
  {
    id: 'multi-lang-sdk-generator',
    title: 'Plan to Create a Multi-Language Client SDK from OpenAPI',
    category: 'Libraries & SDKs',
    icon: '🌐',
    description: 'Automate generation and packaging of TypeScript, Python, Java, and Go client SDKs from OpenAPI contracts.',
    fields: [
      { id: 'sdkName', label: 'SDK Umbrella Name', type: 'text', default: 'acme-cloud-sdk', required: true },
      { id: 'contractPath', label: 'OpenAPI Spec Path / URL', type: 'text', default: 'specs/openapi.yaml' },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Build multi-language SDK generator "${a.sdkName}" from spec "${a.contractPath}".`,
      epicTitle: `Epic: ${a.sdkName} Multi-Language SDK Pipeline`,
      epicName: a.sdkName,
      epicBody: `Automate client SDK generation for TypeScript, Python, and Java.`,
      labels: ['sdk', 'openapi', 'codegen'],
      stories: [
        { title: `${a.sdkName}: OpenAPI Spec Validation & Generator Config`, body: `Configure openapi-generator-cli with custom templates and naming rules.` },
        { title: `${a.sdkName}: TypeScript / Node SDK Generation & Packaging`, body: `Generate fetch-based TypeScript client with full type definitions.` },
        { title: `${a.sdkName}: Python SDK Generation & Packaging`, body: `Generate httpx-based Python async/sync client.` },
      ]
    })
  },

  // ── Knowledge Graph & Schemas ────────────────────────────────────────────────
  {
    id: 'kgraph-schema',
    title: 'Plan to Add to the Knowledge Graph Schema',
    category: 'Knowledge Graph & Schemas',
    icon: '⬡',
    description: 'Extend the RobOS Dual-State SDLC Knowledge Graph with new ontological classes, properties, and SHACL validation rules.',
    fields: [
      { id: 'className', label: 'New Schema Class / Type Name', type: 'text', default: 'robos:AIModelRegistry', required: true },
      { id: 'parentClass', label: 'Parent / Super-Class', type: 'select', default: 'oslc-resource', options: [
        { value: 'oslc-resource', label: 'oslc_am:Resource / c4:Container' },
        { value: 'software-app', label: 'schema:SoftwareApplication' },
        { value: 'project-asset', label: 'oslc:Project / dcterms:Collection' },
      ]},
      { id: 'properties', label: 'Properties & Constraints', type: 'textarea', default: 'robos:modelFamily (string, required)\nrobos:contextWindowTokens (integer, required)\nrobos:quantization (string, optional)\nrobos:supportedModalities (array of string)' },
      { id: 'shaclValidation', label: 'SHACL Validation Shape Name', type: 'text', default: 'AIModelRegistryShape' },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Extend RobOS Knowledge Graph schema with class "${a.className}" extending ${a.parentClass}. Properties:\n${a.properties}. Shape: ${a.shaclValidation}`,
      epicTitle: `Epic: Knowledge Graph Schema Extension — ${a.className}`,
      epicName: `KGraph-${a.className.replace(/[^a-zA-Z0-9]/g, '')}`,
      epicBody: `Incorporate ${a.className} into JSON-LD @context, SHACL validation engine, and living doc sync.`,
      labels: ['kgraph', 'schema', 'shacl'],
      stories: [
        { title: `KGraph: Register ${a.className} in OSLC Context & JSON-LD Vocabulary`, body: `Update oslc-parser.js and .robos/knowledge-graph.jsonld with new @type declarations.` },
        { title: `KGraph: Implement ${a.shaclValidation} in SHACL Validator`, body: `Add property constraints, minCount, and datatype checks to shacl-validator.js.` },
        { title: `KGraph: UI Category Badge & Inspector Card Support`, body: `Add node rendering, icon mapping, and inspector card in robos-graph app.js.` },
        { title: `KGraph: Living Documentation Sync (${a.className})`, body: `Update docs/architecture.md and system documentation per Cardinal Rule.` },
      ]
    })
  },
  {
    id: 'create-resource',
    title: 'Plan to Create a Resource',
    category: 'Knowledge Graph & Schemas',
    icon: '📦',
    description: 'Declare and instantiate a concrete SDLC asset/resource node within the RobOS Knowledge Graph.',
    fields: [
      { id: 'resourceUri', label: 'Resource URI', type: 'text', default: 'urn:robos:resource:auth-vault-cluster', required: true },
      { id: 'resourceTitle', label: 'Resource Title', type: 'text', default: 'Production Vault KMS Cluster' },
      { id: 'resourceType', label: 'Resource Type', type: 'select', default: 'c4-infrastructure', options: [
        { value: 'c4-infrastructure', label: 'c4:DeploymentNode (Infrastructure)' },
        { value: 'microservice', label: 'robos:Microservice' },
        { value: 'datasource', label: 'robos:DataSource' },
      ]},
      { id: 'metadata', label: 'Resource Attributes (JSON or Key-Value)', type: 'textarea', default: 'provider: HashiCorp\nenvironment: production\nclusterSize: 3' },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Declare Knowledge Graph resource node "${a.resourceUri || 'urn:robos:resource:custom'}" titled "${a.resourceTitle || a.resourceName || 'Resource'}" of type ${a.resourceType || 'c4-infrastructure'}. Attributes:\n${a.metadata || ''}`,
      epicTitle: `Epic: Knowledge Graph Resource Declaration — ${a.resourceTitle || a.resourceName || a.resourceUri || 'Resource'}`,
      epicName: `Resource-${(a.resourceTitle || a.resourceName || a.resourceUri || 'Resource').slice(0, 20)}`,
      epicBody: `Instantiate and validate resource node in .robos/knowledge-graph.jsonld.`,
      labels: ['kgraph', 'resource', 'sdlc'],
      stories: [
        { title: `Resource: Instantiate Node "${a.resourceUri}" in JSON-LD Store`, body: `Create node structure with dcterms:title, @type, and custom properties.` },
        { title: `Resource: Validate Conformance via SHACL Engine`, body: `Run validateGraph() to ensure all required ontological constraints pass.` },
        { title: `Resource: Bind to Associated Repositories & Teams`, body: `Connect relations (robos:maintainedByTeam, robos:hasRepository).` },
      ]
    })
  },
  {
    id: 'shacl-validation-shape',
    title: 'Plan to Define a SHACL Validation Shape',
    category: 'Knowledge Graph & Schemas',
    icon: '📐',
    description: 'Author custom SHACL shape constraints to guarantee schema conformance across all GitOps assets.',
    fields: [
      { id: 'shapeName', label: 'SHACL Shape Name', type: 'text', default: 'ProductionServiceComplianceShape', required: true },
      { id: 'targetClass', label: 'Target Class', type: 'text', default: 'robos:Microservice' },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Author SHACL shape "${a.shapeName}" targeting "${a.targetClass}".`,
      epicTitle: `Epic: ${a.shapeName} SHACL Shape Implementation`,
      epicName: a.shapeName,
      epicBody: `Implement and test SHACL validation rules in robos-graph.`,
      labels: ['shacl', 'validation', 'kgraph'],
      stories: [
        { title: `${a.shapeName}: Shape Definition & Property Constraints`, body: `Define sh:property constraints (sh:minCount, sh:datatype, sh:pattern).` },
        { title: `${a.shapeName}: Unit Tests with Passing and Violating Graph Nodes`, body: `Create regression tests verifying violation messages and error paths.` },
      ]
    })
  },
  {
    id: 'openapi-contract-spec',
    title: 'Plan to Create an OpenAPI 3.1 Contract Specification',
    category: 'Knowledge Graph & Schemas',
    icon: '📜',
    description: 'Design a single-source-of-truth OpenAPI 3.1 YAML contract with reusable components and security schemes.',
    fields: [
      { id: 'specTitle', label: 'API Title', type: 'text', default: 'Petstore Adoption API', required: true },
      { id: 'version', label: 'Version', type: 'text', default: '1.0.0' },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Author OpenAPI 3.1 contract "${a.specTitle}" v${a.version}.`,
      epicTitle: `Epic: ${a.specTitle} OpenAPI Contract Design`,
      epicName: a.specTitle,
      epicBody: `Design and publish OpenAPI 3.1 specification for services and SDKs.`,
      labels: ['openapi', 'contract', 'api'],
      stories: [
        { title: `${a.specTitle}: Component Schemas & Error Models`, body: `Define reusable schemas in components.schemas with strict jsonSchema types.` },
        { title: `${a.specTitle}: Path Endpoints & Request/Response Operations`, body: `Define CRUD routes, query parameters, and 200/400/401/404/500 responses.` },
        { title: `${a.specTitle}: Spectral Linter & Breaking Change CI Check`, body: `Configure spectral linting and oasdiff breaking change prevention.` },
      ]
    })
  },
  {
    id: 'asyncapi-messaging-contract',
    title: 'Plan to Define an AsyncAPI 3.0 Messaging Contract',
    category: 'Knowledge Graph & Schemas',
    icon: '📬',
    description: 'Specify event channels, payload schemas, and Kafka/RabbitMQ server bindings with AsyncAPI 3.0.',
    fields: [
      { id: 'contractName', label: 'Contract Name', type: 'text', default: 'OrderLifecycleAsyncAPI', required: true },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Author AsyncAPI 3.0 contract "${a.contractName}".`,
      epicTitle: `Epic: ${a.contractName} Event Contract`,
      epicName: a.contractName,
      epicBody: `Declare asynchronous message schemas and channels.`,
      labels: ['asyncapi', 'events', 'kafka'],
      stories: [
        { title: `${a.contractName}: Channels & Operation Bindings`, body: `Define channels and publish/subscribe operations.` },
        { title: `${a.contractName}: Message Schema Definitions`, body: `Define message payload models with headers and correlation IDs.` },
      ]
    })
  },
  {
    id: 'protobuf-service-contract',
    title: 'Plan to Define a Protobuf / gRPC Service Contract',
    category: 'Knowledge Graph & Schemas',
    icon: '📑',
    description: 'Author Proto3 file definitions with package namespaces, rpc definitions, and Buf lint/breaking rules.',
    fields: [
      { id: 'protoPackage', label: 'Protobuf Package', type: 'text', default: 'acme.inventory.v1', required: true },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Author Protobuf contract for package "${a.protoPackage}".`,
      epicTitle: `Epic: ${a.protoPackage} Protobuf Contract`,
      epicName: a.protoPackage,
      epicBody: `Author Proto3 schemas and configure Buf build tooling.`,
      labels: ['protobuf', 'grpc', 'contract'],
      stories: [
        { title: `${a.protoPackage}: Proto3 Messages & Enums`, body: `Define strongly typed message structs and enumeration values.` },
        { title: `${a.protoPackage}: Service RPC Interface Declarations`, body: `Define unary and streaming RPC methods.` },
        { title: `${a.protoPackage}: Buf CLI Setup & Linting`, body: `Configure buf.yaml and buf.gen.yaml for automated code generation.` },
      ]
    })
  },

  // ── Data, Storage & ML ───────────────────────────────────────────────────────
  {
    id: 'relational-db-migrations',
    title: 'Plan to Create a Relational DB Schema & Migration Pipeline',
    category: 'Data & Storage',
    icon: '🗄️',
    description: 'Design normalized SQL relational tables, indexes, foreign keys, and Flyway/Liquibase versioned migrations.',
    fields: [
      { id: 'dbName', label: 'Database Name', type: 'text', default: 'petstore_catalog_db', required: true },
      { id: 'engine', label: 'Database Engine', type: 'select', default: 'postgres-16', options: [
        { value: 'postgres-16', label: 'PostgreSQL 16' },
        { value: 'mysql-8', label: 'MySQL 8' },
      ]},
      { id: 'migrationTool', label: 'Migration Tool', type: 'select', default: 'flyway', options: [
        { value: 'flyway', label: 'Flyway SQL (V1__...sql)' },
        { value: 'liquibase', label: 'Liquibase YAML/XML' },
        { value: 'prisma', label: 'Prisma Migrations' },
      ]},
    ],
    generatePlan: (a) => makePlan({
      prompt: `Create SQL schema and migration pipeline for "${a.dbName}" on ${a.engine} using ${a.migrationTool}.`,
      epicTitle: `Epic: ${a.dbName} Schema & Migration Pipeline`,
      epicName: a.dbName,
      epicBody: `Implement relational database schema with versioned migrations and performance indexing.`,
      labels: ['database', 'sql', 'migrations'],
      stories: [
        { title: `${a.dbName}: Initial V1 Schema Migration Script`, body: `Create DDL for core tables with UUID primary keys and timestamps.` },
        { title: `${a.dbName}: Performance Indexes & Foreign Key Constraints`, body: `Add B-tree/GIN indexes and cascade constraints.` },
        { title: `${a.dbName}: Testcontainers Integration & Migration CI Check`, body: `Spin up ephemeral container in CI to verify forward and backward migrations.` },
      ]
    })
  },
  {
    id: 'nosql-document-store',
    title: 'Plan to Create a NoSQL Document Database Integration',
    category: 'Data & Storage',
    icon: '🍃',
    description: 'Scaffold a MongoDB / DynamoDB document store with schema validation, compound indexes, and change streams.',
    fields: [
      { id: 'collectionName', label: 'Primary Collection / Table', type: 'text', default: 'audit_events', required: true },
      { id: 'engine', label: 'NoSQL Engine', type: 'select', default: 'mongodb', options: [
        { value: 'mongodb', label: 'MongoDB 7' },
        { value: 'dynamodb', label: 'Amazon DynamoDB' },
      ]},
    ],
    generatePlan: (a) => makePlan({
      prompt: `Scaffold NoSQL document integration for collection "${a.collectionName}" on ${a.engine}.`,
      epicTitle: `Epic: ${a.collectionName} Document Database Integration`,
      epicName: a.collectionName,
      epicBody: `Implement NoSQL document storage with indexing and lifecycle management.`,
      labels: ['nosql', 'mongodb', 'database'],
      stories: [
        { title: `${a.collectionName}: Document Schema & JSON Schema Validator`, body: `Define document models with $jsonSchema validation rules.` },
        { title: `${a.collectionName}: Compound & TTL Expiration Indexes`, body: `Build compound search indexes and automated TTL document purging.` },
      ]
    })
  },
  {
    id: 'redis-cache-layer',
    title: 'Plan to Create a Redis In-Memory Cache & Session Store',
    category: 'Data & Storage',
    icon: '⚡',
    description: 'Implement low-latency distributed caching with Redis, cache-aside pattern, TTL expiration, and locks.',
    fields: [
      { id: 'clusterName', label: 'Cache Cluster Name', type: 'text', default: 'app-redis-cache', required: true },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Implement Redis cache layer "${a.clusterName}".`,
      epicTitle: `Epic: ${a.clusterName} Redis Caching Layer`,
      epicName: a.clusterName,
      epicBody: `Implement Redis distributed cache, TTL eviction policies, and Redlock synchronization.`,
      labels: ['redis', 'caching', 'performance'],
      stories: [
        { title: `${a.clusterName}: Cache Client Connection Pool & Serialization`, body: `Configure connection pooling, JSON/Protobuf serialization, and key namespacing.` },
        { title: `${a.clusterName}: Cache-Aside Repository Decorators`, body: `Implement get-or-set memoization with configurable TTL expiration.` },
        { title: `${a.clusterName}: Distributed Locking (Redlock) & Rate Limiter`, body: `Implement distributed atomic locks and token-bucket rate limiting.` },
      ]
    })
  },
  {
    id: 'kafka-event-pipeline',
    title: 'Plan to Create an Apache Kafka Event Pipeline',
    category: 'Data & Storage',
    icon: '📊',
    description: 'Provision Kafka topics, partition keys, schema registry subjects, and consumer group monitoring.',
    fields: [
      { id: 'pipelineName', label: 'Event Pipeline Name', type: 'text', default: 'telemetry-stream-pipeline', required: true },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Build Kafka event pipeline "${a.pipelineName}".`,
      epicTitle: `Epic: ${a.pipelineName} Kafka Event Pipeline`,
      epicName: a.pipelineName,
      epicBody: `Design high-throughput event streaming with partitioned topics and monitoring.`,
      labels: ['kafka', 'streaming', 'data'],
      stories: [
        { title: `${a.pipelineName}: Topic Provisioning & Partition Strategy`, body: `Define topic compaction, partition counts, and retention bytes.` },
        { title: `${a.pipelineName}: Schema Registry Subject Registration`, body: `Register message schemas with backward compatibility checks.` },
      ]
    })
  },
  {
    id: 'vector-db-rag-pipeline',
    title: 'Plan to Create a Vector DB & RAG Knowledge Ingestion Pipeline',
    category: 'Data & Storage',
    icon: '🧠',
    description: 'Build semantic search and Retrieval-Augmented Generation (RAG) with embeddings, chunking, and vector index.',
    fields: [
      { id: 'pipelineName', label: 'RAG Pipeline Name', type: 'text', default: 'codebase-rag-indexer', required: true },
      { id: 'vectorStore', label: 'Vector Store', type: 'select', default: 'pgvector', options: [
        { value: 'pgvector', label: 'PostgreSQL pgvector (HNSW Index)' },
        { value: 'qdrant', label: 'Qdrant Vector Database' },
        { value: 'chroma', label: 'ChromaDB Local' },
      ]},
    ],
    generatePlan: (a) => makePlan({
      prompt: `Build Vector RAG pipeline "${a.pipelineName}" using ${a.vectorStore}.`,
      epicTitle: `Epic: ${a.pipelineName} RAG Ingestion Pipeline`,
      epicName: a.pipelineName,
      epicBody: `Implement document chunking, embedding generation, and vector similarity search.`,
      labels: ['ai', 'rag', 'vector-db'],
      stories: [
        { title: `${a.pipelineName}: Document Chunker & Token Counter`, body: `Implement recursive text splitter preserving code markdown boundaries.` },
        { title: `${a.pipelineName}: Embedding Model Integration & Batch Generator`, body: `Generate vector embeddings using text-embedding-3 or local ONNX model.` },
        { title: `${a.pipelineName}: Vector Store Search & Hybrid Keyword Re-ranking`, body: `Implement cosine similarity search combined with BM25 keyword matching.` },
      ]
    })
  },

  // ── Cloud & Infrastructure ───────────────────────────────────────────────────
  {
    id: 'kubernetes-helm-deployment',
    title: 'Plan to Create a Kubernetes Helm Chart & Deployment',
    category: 'Cloud & Infrastructure',
    icon: '☸️',
    description: 'Author production Kubernetes manifests packaged as a Helm chart with Ingress, HPA, and Secret integration.',
    fields: [
      { id: 'chartName', label: 'Helm Chart Name', type: 'text', default: 'petstore-service-chart', required: true },
      { id: 'ingressType', label: 'Ingress Controller', type: 'select', default: 'nginx-ingress', options: [
        { value: 'nginx-ingress', label: 'Ingress-NGINX with cert-manager' },
        { value: 'traefik', label: 'Traefik IngressRoute' },
        { value: 'istio', label: 'Istio VirtualService & Gateway' },
      ]},
    ],
    generatePlan: (a) => makePlan({
      prompt: `Create Kubernetes Helm chart "${a.chartName}" with ${a.ingressType}.`,
      epicTitle: `Epic: ${a.chartName} Kubernetes Helm Chart`,
      epicName: a.chartName,
      epicBody: `Package application workloads into parameterized Helm charts.`,
      labels: ['kubernetes', 'helm', 'infra'],
      stories: [
        { title: `${a.chartName}: Chart.yaml & values.yaml Schema`, body: `Structure templates, default values, and schema validation.` },
        { title: `${a.chartName}: Deployment, Service, & HorizontalPodAutoscaler (HPA)`, body: `Configure resource limits, probes, and CPU/memory autoscaling.` },
        { title: `${a.chartName}: Ingress & TLS Certificate Resources (${a.ingressType})`, body: `Expose host routing and TLS termination.` },
        { title: `${a.chartName}: Helm Lint & Dry-run Verification CI`, body: `Run helm lint and kubeval manifest validation in pipeline.` },
      ]
    })
  },
  {
    id: 'argocd-gitops-pipeline',
    title: 'Plan to Create an ArgoCD GitOps Continuous Delivery Pipeline',
    category: 'Cloud & Infrastructure',
    icon: '🐙',
    description: 'Configure automated GitOps synchronization for Kubernetes clusters with ArgoCD Applications and sync policies.',
    fields: [
      { id: 'appName', label: 'ArgoCD Application Name', type: 'text', default: 'production-fleet-gitops', required: true },
      { id: 'repoUrl', label: 'GitOps Repository', type: 'text', default: 'https://github.com/acme/gitops-deployments' },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Configure ArgoCD GitOps pipeline "${a.appName}" sourcing "${a.repoUrl}".`,
      epicTitle: `Epic: ${a.appName} ArgoCD GitOps Pipeline`,
      epicName: a.appName,
      epicBody: `Implement declarative GitOps delivery using ArgoCD Application CRDs.`,
      labels: ['argocd', 'gitops', 'kubernetes'],
      stories: [
        { title: `${a.appName}: ArgoCD Application CRD & Health Checks`, body: `Define declarative Application YAML with automated prune and self-heal.` },
        { title: `${a.appName}: Multi-Environment Kustomize Overlays`, body: `Structure dev, staging, and prod parameter overlays.` },
      ]
    })
  },
  {
    id: 'terraform-cloud-infra',
    title: 'Plan to Create a Terraform / OpenTofu Cloud Infrastructure Stack',
    category: 'Cloud & Infrastructure',
    icon: '🏗️',
    description: 'Author modular Infrastructure-as-Code with Terraform/OpenTofu, remote state locking, and cloud resources.',
    fields: [
      { id: 'stackName', label: 'Terraform Stack Name', type: 'text', default: 'aws-production-vpc-stack', required: true },
      { id: 'cloudProvider', label: 'Cloud Provider', type: 'select', default: 'aws', options: [
        { value: 'aws', label: 'Amazon Web Services (AWS)' },
        { value: 'gcp', label: 'Google Cloud Platform (GCP)' },
        { value: 'azure', label: 'Microsoft Azure' },
      ]},
    ],
    generatePlan: (a) => makePlan({
      prompt: `Author Terraform/OpenTofu stack "${a.stackName}" on ${a.cloudProvider}.`,
      epicTitle: `Epic: ${a.stackName} Cloud Infrastructure`,
      epicName: a.stackName,
      epicBody: `Provision cloud infrastructure resources with modular IaC.`,
      labels: ['terraform', 'opentofu', 'cloud'],
      stories: [
        { title: `${a.stackName}: Remote State Backend & Provider Configuration`, body: `Configure S3/GCS bucket state storage with DynamoDB/locking.` },
        { title: `${a.stackName}: Core Network Architecture (VPC, Subnets, NAT Gateways)`, body: `Provision private and public subnets across availability zones.` },
        { title: `${a.stackName}: Managed Database & Container Runtime Cluster`, body: `Provision RDS/CloudSQL and EKS/GKE cluster resources.` },
        { title: `${a.stackName}: TFLint & Checkov Security Policy Scans`, body: `Add automated linting and CIS compliance checks to PR pipeline.` },
      ]
    })
  },
  {
    id: 'docker-container-compose',
    title: 'Plan to Create a Multi-Stage Docker Container & Compose Setup',
    category: 'Cloud & Infrastructure',
    icon: '🐳',
    description: 'Author lean, secure multi-stage Dockerfiles with non-root execution and multi-service docker-compose dev environment.',
    fields: [
      { id: 'containerName', label: 'Container Image Name', type: 'text', default: 'petstore-service', required: true },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Scaffold multi-stage Dockerfile and Compose setup for "${a.containerName}".`,
      epicTitle: `Epic: ${a.containerName} Containerization & Compose`,
      epicName: a.containerName,
      epicBody: `Deliver distroless multi-stage Dockerfile and local compose development stack.`,
      labels: ['docker', 'compose', 'containers'],
      stories: [
        { title: `${a.containerName}: Multi-Stage Dockerfile with Distroless Base`, body: `Optimize layer caching, strip build dependencies, and enforce non-root user.` },
        { title: `${a.containerName}: docker-compose.yml Local Developer Environment`, body: `Wire service with local PostgreSQL, Redis, and health check dependencies.` },
      ]
    })
  },
  {
    id: 'api-gateway-envoy',
    title: 'Plan to Create an Envoy / Cloudflare API Gateway & Ingress',
    category: 'Cloud & Infrastructure',
    icon: '🛡️',
    description: 'Configure edge API gateway routing, TLS termination, CORS headers, and token verification.',
    fields: [
      { id: 'gatewayName', label: 'Gateway Name', type: 'text', default: 'public-api-gateway', required: true },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Configure API Gateway "${a.gatewayName}".`,
      epicTitle: `Epic: ${a.gatewayName} API Gateway`,
      epicName: a.gatewayName,
      epicBody: `Implement edge gateway routing, rate limiting, and TLS termination.`,
      labels: ['gateway', 'envoy', 'edge'],
      stories: [
        { title: `${a.gatewayName}: Route Table & Cluster Definitions`, body: `Configure upstream clusters and URL rewrite rules.` },
        { title: `${a.gatewayName}: Security Filters (CORS, Rate Limiting, WAF)`, body: `Apply IP reputation and burst rate limiting filters.` },
      ]
    })
  },

  // ── DevOps, Observability & RobOS Extensions ─────────────────────────────────
  {
    id: 'github-actions-ci-cd',
    title: 'Plan to Create a GitHub Actions CI/CD Matrix Pipeline',
    category: 'DevOps & Observability',
    icon: '🚀',
    description: 'Author GitHub Actions workflows for matrix testing, container image building, vulnerability scanning, and release tagging.',
    fields: [
      { id: 'pipelineName', label: 'Workflow Name', type: 'text', default: 'ci-cd-build-and-release', required: true },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Implement GitHub Actions CI/CD matrix pipeline "${a.pipelineName}".`,
      epicTitle: `Epic: ${a.pipelineName} GitHub Actions CI/CD`,
      epicName: a.pipelineName,
      epicBody: `Deliver GitHub Actions pipeline with automated testing, security scanning, and container push.`,
      labels: ['github-actions', 'ci-cd', 'devops'],
      stories: [
        { title: `${a.pipelineName}: Pull Request Matrix Test & Lint Workflow`, body: `Run concurrent test matrix across runtime versions with artifact upload.` },
        { title: `${a.pipelineName}: Trivy Container Vulnerability Scan`, body: `Scan container images for CVEs before deployment.` },
        { title: `${a.pipelineName}: Semantic Release Tagging & OCI Registry Push`, body: `Automate semver changelogs and publish multi-arch images to GHCR.` },
      ]
    })
  },
  {
    id: 'opentelemetry-observability',
    title: 'Plan to Create an OpenTelemetry Tracing & Prometheus Metrics Setup',
    category: 'DevOps & Observability',
    icon: '📈',
    description: 'Instrument services with OpenTelemetry distributed tracing, W3C trace context propagation, and Prometheus metrics.',
    fields: [
      { id: 'systemName', label: 'System / Service Identifier', type: 'text', default: 'ecommerce-platform', required: true },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Implement OpenTelemetry and Prometheus observability for "${a.systemName}".`,
      epicTitle: `Epic: ${a.systemName} Distributed Observability`,
      epicName: a.systemName,
      epicBody: `Instrument distributed tracing and metric exporters.`,
      labels: ['opentelemetry', 'prometheus', 'observability'],
      stories: [
        { title: `${a.systemName}: OpenTelemetry SDK Initialization & Trace Propagation`, body: `Configure OTLP gRPC exporter and W3C Baggage propagation.` },
        { title: `${a.systemName}: Prometheus RED Metrics (Rate, Errors, Duration)`, body: `Record request throughput, 5xx errors, and latency histograms.` },
        { title: `${a.systemName}: Grafana Dashboard & Alerting Rules`, body: `Create dashboard JSON definitions and PagerDuty alert triggers.` },
      ]
    })
  },
  {
    id: 'mcp-server',
    title: 'Plan to Create a Model Context Protocol (MCP) Server',
    category: 'RobOS Platform & Agent Extensions',
    icon: '🔌',
    description: 'Develop a custom Model Context Protocol server exposing tools, resources, and prompts for AI coding agents.',
    fields: [
      { id: 'serverName', label: 'MCP Server Name', type: 'text', default: 'database-inspector-mcp', required: true },
      { id: 'transport', label: 'Transport Protocol', type: 'select', default: 'stdio', options: [
        { value: 'stdio', label: 'Standard I/O (stdio) for local agents' },
        { value: 'sse', label: 'Server-Sent Events (SSE) / HTTP for remote agents' },
      ]},
      { id: 'tools', label: 'Exposed Tools', type: 'textarea', default: 'execute_sql(query)\ninspect_schema(table_name)\nexplain_query(query)' },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Build Model Context Protocol server "${a.serverName}" over ${a.transport}. Tools:\n${a.tools}`,
      epicTitle: `Epic: ${a.serverName} MCP Server Development`,
      epicName: a.serverName,
      epicBody: `Implement Model Context Protocol server exposing specialized tools to AI assistants.`,
      labels: ['mcp', 'agent', 'tools'],
      stories: [
        { title: `${a.serverName}: MCP Server Initialization & ${(a.transport || 'stdio').toUpperCase()} Transport`, body: `Initialize SDK server instance and bind transport.` },
        { title: `${a.serverName}: Tool Schema Registration with Zod Validation`, body: `Register tools: ${a.tools}` },
        { title: `${a.serverName}: Tool Handlers & Sandbox Execution`, body: `Implement tool execution logic with timeout safety and error formatting.` },
        { title: `${a.serverName}: Verification with RobOS MCP Manager`, body: `Test tool invocation via RobOS MCP Manager console.` },
      ]
    })
  },
  {
    id: 'robos-electron-app',
    title: 'Plan to Create a RobOS Native Electron Application',
    category: 'RobOS Platform & Agent Extensions',
    icon: '🤖',
    description: 'Scaffold a new native RobOS desktop Electron app with registered .desktop entry, robos-lib snapshot server, and dark theme.',
    fields: [
      { id: 'appId', label: 'App Identifier (slug)', type: 'text', default: 'code-metrics-studio', required: true },
      { id: 'appTitle', label: 'App Display Title', type: 'text', default: 'Code Metrics Studio' },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Scaffold native RobOS Electron application "${a.appId}" titled "${a.appTitle}".`,
      epicTitle: `Epic: ${a.appTitle} RobOS Application Creation`,
      epicName: a.appId,
      epicBody: `Scaffold new RobOS application adhering to the 10-point app registration checklist.`,
      labels: ['robos', 'electron', 'desktop-app'],
      stories: [
        { title: `${a.appId}: Package Scaffolding & main.js / preload.js Setup`, body: `Create packages/${a.appId} with BrowserWindow, contextIsolation, and IPC handlers.` },
        { title: `${a.appId}: Renderer HTML & Dark Theme UI`, body: `Implement index.html and style.css adhering to RobOS design tokens.` },
        { title: `${a.appId}: DOM Snapshot Server & Port Registration`, body: `Register debug port in snapshot-cli.js and start snapshot server.` },
        { title: `${a.appId}: RobOS 10-Point Checklist Registration`, body: `Register app in builtin-apps, taskbar, Knowledge Graph, and AGENTS.md.` },
      ]
    })
  },
  {
    id: 'playwright-e2e-suite',
    title: 'Plan to Create an Automated Playwright End-to-End Test Suite',
    category: 'DevOps & Observability',
    icon: '🧪',
    description: 'Build robust end-to-end browser automation tests with Playwright, Page Object Models, and video/trace reports.',
    fields: [
      { id: 'suiteName', label: 'Test Suite Name', type: 'text', default: 'customer-checkout-e2e', required: true },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Create Playwright E2E test suite "${a.suiteName}".`,
      epicTitle: `Epic: ${a.suiteName} Automated Playwright E2E Suite`,
      epicName: a.suiteName,
      epicBody: `Implement browser automation test suite using Playwright and Page Object pattern.`,
      labels: ['playwright', 'testing', 'e2e'],
      stories: [
        { title: `${a.suiteName}: Playwright Config & Browser Launch Matrix`, body: `Configure Chromium, Firefox, and WebKit runners with video recording.` },
        { title: `${a.suiteName}: Page Object Models & Flow Scenarios`, body: `Create strongly typed page abstractions for primary user journeys.` },
        { title: `${a.suiteName}: CI Test Execution & HTML Reporter Upload`, body: `Run tests on pull requests and upload failure trace artifacts.` },
      ]
    })
  },
  {
    id: 'security-audit-scanner',
    title: 'Plan to Create a Security Audit & Dependency Scanner',
    category: 'DevOps & Observability',
    icon: '🔒',
    description: 'Implement automated SAST, dependency vulnerability scanning, and secret detection across repositories.',
    fields: [
      { id: 'scannerName', label: 'Security Scanner Name', type: 'text', default: 'repo-security-gate', required: true },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Implement Security Audit scanner "${a.scannerName}".`,
      epicTitle: `Epic: ${a.scannerName} Security Scanning Pipeline`,
      epicName: a.scannerName,
      epicBody: `Implement automated security gates for dependencies, secrets, and SAST.`,
      labels: ['security', 'audit', 'compliance'],
      stories: [
        { title: `${a.scannerName}: GitLeaks Secret Detection Pre-commit Hook`, body: `Block API keys, private keys, and tokens from being committed.` },
        { title: `${a.scannerName}: Dependency SCA (Software Composition Analysis)`, body: `Audit npm/mvn/pip dependencies against CVE databases.` },
        { title: `${a.scannerName}: Semgrep SAST Security Rules`, body: `Scan code for SQL injection, XSS, and insecure deserialization patterns.` },
      ]
    })
  },
  {
    id: 'performance-k6-testing',
    title: 'Plan to Create a Performance & Load Testing Suite with k6',
    category: 'DevOps & Observability',
    icon: '⏱️',
    description: 'Author load, stress, and spike test scripts using Grafana k6 with threshold assertions and metrics.',
    fields: [
      { id: 'testPlanName', label: 'Load Test Plan Name', type: 'text', default: 'order-api-load-test', required: true },
      { id: 'targetRps', label: 'Target RPS / Virtual Users', type: 'number', default: 500 },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Build k6 load testing suite "${a.testPlanName}" targeting ${a.targetRps} RPS.`,
      epicTitle: `Epic: ${a.testPlanName} k6 Performance Suite`,
      epicName: a.testPlanName,
      epicBody: `Design and execute load and stress testing scripts with k6.`,
      labels: ['k6', 'performance', 'load-testing'],
      stories: [
        { title: `${a.testPlanName}: k6 Scenario Scripts & Ramp-up Stages`, body: `Write ramp-up and steady-state load scenarios targeting ${a.targetRps} RPS.` },
        { title: `${a.testPlanName}: Performance Threshold Assertions (p95 < 200ms)`, body: `Fail CI if 95th percentile latency or error rate exceeds SLOs.` },
      ]
    })
  },
  {
    id: 'robos-agent-skill',
    title: 'Plan to Create a RobOS AI Agent Skill',
    category: 'RobOS Platform & Agent Extensions',
    icon: '🧠',
    description: 'Design and publish a cross-agent skill in the RobOS plugin marketplace with SKILL.md and automation scripts.',
    fields: [
      { id: 'skillName', label: 'Skill Identifier', type: 'text', default: 'migrate-db-schema', required: true },
      { id: 'skillTitle', label: 'Skill Title', type: 'text', default: 'Migrate Database Schema' },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Scaffold RobOS agent skill "${a.skillName}" titled "${a.skillTitle}".`,
      epicTitle: `Epic: ${a.skillTitle} RobOS Agent Skill`,
      epicName: a.skillName,
      epicBody: `Package automation skill into plugins/robos/skills/${a.skillName}.`,
      labels: ['robos', 'skill', 'ai-agent'],
      stories: [
        { title: `${a.skillName}: SKILL.md Instructions & YAML Frontmatter`, body: `Define instructions, trigger keywords, and execution steps.` },
        { title: `${a.skillName}: Helper Automation Scripts & Tests`, body: `Write reusable bash/node script tooling for agent invocation.` },
      ]
    })
  },
  {
    id: 'custom-task-server-connector',
    title: 'Plan to Create a Custom Task Server Connector',
    category: 'RobOS Platform & Agent Extensions',
    icon: '🔌',
    description: 'Add a new task server provider (e.g. Linear, ClickUp, GitLab Issues) to RobOS Task Servers and Task Planner.',
    fields: [
      { id: 'providerName', label: 'Provider Name', type: 'text', default: 'Linear', required: true },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Implement Task Server connector for ${a.providerName}.`,
      epicTitle: `Epic: ${a.providerName} Task Server Connector`,
      epicName: `${a.providerName}-Connector`,
      epicBody: `Implement credential management, issue sync, and planning integration for ${a.providerName}.`,
      labels: ['robos', 'task-server', 'integration'],
      stories: [
        { title: `${a.providerName}: Connection Form & Secure Pass Secret Storage`, body: `Configure settings fields and API token retrieval via pass manager.` },
        { title: `${a.providerName}: Issue Fetch & Create API Adapters`, body: `Implement sync-task and issue type mapping for ${a.providerName}.` },
      ]
    })
  },
  {
    id: 'etl-data-pipeline',
    title: 'Plan to Create an ETL Data Pipeline',
    category: 'Data & Storage',
    icon: '🔄',
    description: 'Scaffold batch or streaming data extract-transform-load pipeline with data validation and parquet output.',
    fields: [
      { id: 'pipelineName', label: 'Pipeline Name', type: 'text', default: 'sales-metrics-etl', required: true },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Build ETL data pipeline "${a.pipelineName}".`,
      epicTitle: `Epic: ${a.pipelineName} ETL Data Pipeline`,
      epicName: a.pipelineName,
      epicBody: `Extract, transform, and load analytical datasets into partitioned storage.`,
      labels: ['etl', 'data', 'pipeline'],
      stories: [
        { title: `${a.pipelineName}: Source Data Ingestion & Extraction Connectors`, body: `Connect to source databases/APIs with incremental checkpointing.` },
        { title: `${a.pipelineName}: Schema Validation & Transformation Rules`, body: `Apply schema assertions and data cleansing routines.` },
        { title: `${a.pipelineName}: Partitioned Parquet S3 / Lakehouse Sink`, body: `Write optimized columnar parquet files partitioned by date.` },
      ]
    })
  },
  {
    id: 'pwa-offline-first',
    title: 'Plan to Create a PWA Offline-First Mobile Web App',
    category: 'Front-End Applications',
    icon: '📶',
    description: 'Build a Progressive Web App with Service Worker caching, background sync, web manifest, and install prompts.',
    fields: [
      { id: 'pwaName', label: 'PWA App Name', type: 'text', default: 'field-inspection-pwa', required: true },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Build PWA Offline-First Web App "${a.pwaName}".`,
      epicTitle: `Epic: ${a.pwaName} Progressive Web App`,
      epicName: a.pwaName,
      epicBody: `Implement offline-capable PWA with Workbox service workers.`,
      labels: ['pwa', 'offline', 'frontend'],
      stories: [
        { title: `${a.pwaName}: Web App Manifest & Installation Banners`, body: `Configure manifest.json icons, theme color, and standalone display mode.` },
        { title: `${a.pwaName}: Service Worker Workbox Caching Strategy`, body: `Implement Cache-First for static assets and Network-First for dynamic data.` },
        { title: `${a.pwaName}: IndexedDB Storage & Background Sync API`, body: `Store offline modifications in IndexedDB and replay via Background Sync.` },
      ]
    })
  },
  {
    id: 'chrome-extension',
    title: 'Plan to Create a Chrome Extension',
    category: 'Front-End Applications',
    icon: '🧩',
    description: 'Scaffold a Manifest V3 browser extension with popup UI, content scripts, background service worker, and storage.',
    fields: [
      { id: 'extName', label: 'Extension Name', type: 'text', default: 'code-context-clipper', required: true },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Build Chrome Extension "${a.extName}" on Manifest V3.`,
      epicTitle: `Epic: ${a.extName} Chrome Extension`,
      epicName: a.extName,
      epicBody: `Develop Manifest V3 browser extension with popup and background worker.`,
      labels: ['chrome-extension', 'frontend', 'manifest-v3'],
      stories: [
        { title: `${a.extName}: Manifest V3 Configuration & Permissions`, body: `Define manifest.json permissions, host permissions, and icons.` },
        { title: `${a.extName}: Popup UI & Content Script Injection`, body: `Build popup view and content script DOM interaction.` },
        { title: `${a.extName}: Background Service Worker & chrome.storage Sync`, body: `Manage background message passing and options persistence.` },
      ]
    })
  },
  {
    id: 'grpc-web-gateway',
    title: 'Plan to Create a gRPC-Web Gateway',
    category: 'Services & APIs',
    icon: '🌐',
    description: 'Bridge browser web clients to backend gRPC services using gRPC-Web and Envoy translation proxy.',
    fields: [
      { id: 'gatewayName', label: 'Gateway Name', type: 'text', default: 'web-grpc-bridge', required: true },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Build gRPC-Web gateway "${a.gatewayName}".`,
      epicTitle: `Epic: ${a.gatewayName} gRPC-Web Gateway`,
      epicName: a.gatewayName,
      epicBody: `Configure gRPC-Web browser proxy for Protobuf RPC execution in browsers.`,
      labels: ['grpc-web', 'grpc', 'frontend'],
      stories: [
        { title: `${a.gatewayName}: Envoy gRPC-Web Filter Configuration`, body: `Configure envoy.filters.http.grpc_web proxy translation.` },
        { title: `${a.gatewayName}: TypeScript gRPC-Web Client Stubs Generation`, body: `Generate protoc-gen-grpc-web TypeScript client code.` },
      ]
    })
  },
  {
    id: 'cloud-serverless-functions',
    title: 'Plan to Create a Cloudflare Workers / Serverless Edge API',
    category: 'Cloud & Infrastructure',
    icon: '⚡',
    description: 'Deploy serverless edge functions on Cloudflare Workers or AWS Lambda with zero cold-starts and KV storage.',
    fields: [
      { id: 'funcName', label: 'Function Service Name', type: 'text', default: 'edge-auth-proxy', required: true },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Scaffold Cloudflare Workers / Serverless Edge API "${a.funcName}".`,
      epicTitle: `Epic: ${a.funcName} Edge Serverless Service`,
      epicName: a.funcName,
      epicBody: `Implement low-latency serverless edge workers with KV cache.`,
      labels: ['serverless', 'edge', 'cloudflare'],
      stories: [
        { title: `${a.funcName}: Wrangler Config & TypeScript Worker Scaffolding`, body: `Setup wrangler.toml and export default { fetch } handler.` },
        { title: `${a.funcName}: Edge Key-Value (KV) & D1 SQLite Integration`, body: `Store distributed metadata with sub-10ms edge reads.` },
      ]
    })
  },
  {
    id: 'c4-software-architecture-doc',
    title: 'Plan to Document C4 Software Architecture Models',
    category: 'Knowledge Graph & Schemas',
    icon: '🏛️',
    description: 'Model Context, Container, Component, and Code (C4) architectural views linked directly to Knowledge Graph resources.',
    fields: [
      { id: 'systemName', label: 'Software System Name', type: 'text', default: 'Petstore Enterprise Platform', required: true },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Author C4 software architecture model for "${a.systemName}".`,
      epicTitle: `Epic: ${a.systemName} C4 Architecture Documentation`,
      epicName: `C4-${(a.systemName || 'System').slice(0, 15)}`,
      epicBody: `Document Context, Container, and Component views for ${a.systemName}.`,
      labels: ['c4', 'architecture', 'documentation'],
      stories: [
        { title: `${a.systemName}: C4 Level 1 System Context Diagram`, body: `Map external users, billing gateways, and third-party systems.` },
        { title: `${a.systemName}: C4 Level 2 Container Architecture`, body: `Document web apps, microservices, databases, and message brokers.` },
        { title: `${a.systemName}: KGraph & Living Documentation Synchronization`, body: `Synchronize C4 diagrams with .robos/knowledge-graph.jsonld.` },
      ]
    })
  },
  {
    id: 'multi-tenant-saas-core',
    title: 'Plan to Create a Multi-Tenant SaaS Architecture',
    category: 'Services & APIs',
    icon: '🏢',
    description: 'Design tenant isolation (schema-per-tenant or row-level security), subdomain routing, and tenant billing.',
    fields: [
      { id: 'saasName', label: 'SaaS Platform Name', type: 'text', default: 'acme-saas-suite', required: true },
      { id: 'isolationStrategy', label: 'Tenant Isolation', type: 'select', default: 'row-level-security', options: [
        { value: 'row-level-security', label: 'PostgreSQL Row-Level Security (RLS)' },
        { value: 'schema-per-tenant', label: 'Schema-per-tenant' },
        { value: 'database-per-tenant', label: 'Database-per-tenant (Strict Isolation)' },
      ]},
    ],
    generatePlan: (a) => makePlan({
      prompt: `Scaffold Multi-Tenant SaaS platform "${a.saasName}" using ${a.isolationStrategy}.`,
      epicTitle: `Epic: ${a.saasName} Multi-Tenant SaaS Foundations`,
      epicName: a.saasName,
      epicBody: `Implement tenant isolation and resolution middleware for ${a.saasName}.`,
      labels: ['saas', 'multi-tenant', 'architecture'],
      stories: [
        { title: `${a.saasName}: Tenant Resolution Middleware (Subdomain / Header)`, body: `Extract tenant context from request headers or subdomain.` },
        { title: `${a.saasName}: Database Isolation Layer (${a.isolationStrategy})`, body: `Enforce tenant isolation on all database queries automatically.` },
        { title: `${a.saasName}: Tenant Provisioning & Subscription Lifecycle`, body: `Build automated onboarding workflow provisioning tenant resources.` },
      ]
    })
  },
  {
    id: 'graphql-federation-subgraph',
    title: 'Plan to Create an Apollo Federation GraphQL Subgraph',
    category: 'Services & APIs',
    icon: '🕸️',
    description: 'Implement an Apollo Federation v2 subgraph with @key directives, entity resolvers, and schema composition.',
    fields: [
      { id: 'subgraphName', label: 'Subgraph Name', type: 'text', default: 'products-subgraph', required: true },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Create Apollo Federation subgraph "${a.subgraphName}".`,
      epicTitle: `Epic: ${a.subgraphName} Apollo Federation Subgraph`,
      epicName: a.subgraphName,
      epicBody: `Implement federated GraphQL subgraph with entity resolution.`,
      labels: ['graphql', 'federation', 'api'],
      stories: [
        { title: `${a.subgraphName}: Federation v2 Schema & @key Directive`, body: `Declare federated entities and extendable type definitions.` },
        { title: `${a.subgraphName}: __resolveReference Entity Handlers`, body: `Implement entity reference resolution with batched queries.` },
        { title: `${a.subgraphName}: Rover Supergraph Composition & CI Check`, body: `Validate supergraph schema composition in CI.` },
      ]
    })
  },
  {
    id: 'feature-flag-system',
    title: 'Plan to Create a Feature Flag & Experimentation System',
    category: 'Services & APIs',
    icon: '🚩',
    description: 'Deploy targeted feature flags, progressive rollouts, and canary release controls (Unleash / LaunchDarkly).',
    fields: [
      { id: 'systemName', label: 'Flag Service Name', type: 'text', default: 'feature-toggle-hub', required: true },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Scaffold Feature Flag service "${a.systemName}".`,
      epicTitle: `Epic: ${a.systemName} Feature Flagging`,
      epicName: a.systemName,
      epicBody: `Implement real-time feature flag evaluation and user segmentation.`,
      labels: ['feature-flags', 'devops', 'backend'],
      stories: [
        { title: `${a.systemName}: Feature Flag Evaluation Engine & SDK Cache`, body: `Build in-memory evaluation engine with background synchronization.` },
        { title: `${a.systemName}: User Percentage Rollout & Strategy Rules`, body: `Support gradual % rollouts and targeted user ID rules.` },
      ]
    })
  },
  {
    id: 'cpp-cmake-library',
    title: 'Plan to Create a C++ CMake Shared Library',
    category: 'Libraries & SDKs',
    icon: '⚙️',
    description: 'Scaffold modern C++20 shared/static library with CMake, vcpkg dependency management, and Catch2 unit tests.',
    fields: [
      { id: 'libName', label: 'C++ Library Name', type: 'text', default: 'libfastcalc', required: true },
    ],
    generatePlan: (a) => makePlan({
      prompt: `Scaffold modern C++ library "${a.libName}".`,
      epicTitle: `Epic: ${a.libName} C++ Library`,
      epicName: a.libName,
      epicBody: `Develop modern C++20 cross-platform library with CMake.`,
      labels: ['cpp', 'cmake', 'library'],
      stories: [
        { title: `${a.libName}: CMakeLists.txt & vcpkg Manifest Config`, body: `Configure target_include_directories and export symbols.` },
        { title: `${a.libName}: Header-Only / Shared Implementation Classes`, body: `Implement RAII patterns and zero-copy data structures.` },
        { title: `${a.libName}: Catch2 Unit Tests & Clang-Tidy Analysis`, body: `Automate test compilation and static analysis.` },
      ]
    })
  }
];

module.exports = {
  DEFAULT_TEMPLATES,
};
