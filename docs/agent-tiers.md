---
title: Agent Tiers & Model Dispatch
layout: default
nav_order: 4
permalink: /agent-tiers.html
---

# Agent Tiers, Model Dispatch & Prompt Optimization
{: .no_toc }

How RobOS dynamically routes SDLC tasks across a 3-tier intelligence hierarchy while optimizing prompt bandwidth and accuracy using Caveman Mode compression and Stanford DSPy teleprompter compilation.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## The Problem: The Cost of Homogeneous Model Usage

Traditional AI coding assistants treat all tasks identically: whether an engineer asks to generate a five-word git commit message, fix a missing semicolon, or re-architect a distributed microservice mesh across four polyglot repositories, the assistant invokes the same monolithic model endpoint.

This homogeneous approach creates two severe failure modes:

1. **Economic & Latency Inefficiency**: Invoking a high-latency, \$60/million-token frontier reasoning model for repetitive Tier 1 tasks (such as lint fixes, AST symbol lookup, or commit formatting) wastes computational budget and slows down continuous iteration.
2. **Under-Reasoning on Complex Architecture**: Forcing a cheap, low-parameter model to perform cross-service refactoring or distributed consensus analysis results in silent hallucinations, incomplete implementations, and broken contract dependencies.

**RobOS solves this through an architectural 3-Tier Model Dispatch Matrix coupled with algorithmic token compression (Caveman Mode) and programmatic prompt compilation (Stanford DSPy).**

---

## The 3 Agent Tiers in RobOS

RobOS structures AI agent execution into three specialized intelligence tiers. Each tier balances latency, reasoning capability, token cost, and context size for specific SDLC workflows:

<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
  <img src="{{ '/assets/images/model-cost-matrix.jpg' | relative_url }}" alt="Task Complexity vs Model Cost Optimization Matrix" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>Task-to-Value Dispatch Matrix</strong>: Matching task reasoning complexity against computational cost to optimize engineering velocity and budget. <em>(Click image to zoom full screen)</em>
  </div>
</div>

### Tier Comparison Matrix

| Tier | Primary Capabilities | Typical Models | Optimal SDLC Tasks in RobOS | Cost Profile | Latency |
|:---|:---|:---|:---|:---|:---|
| **Tier 1: Fast Utility & Local** | Ultra-low latency, regex-like speed, offline execution, strict format following | Gemini 2.5 Flash, Claude Haiku 4.5, Local Ollama (`qwen2.5-coder:7b`, `llama3.3:8b`) | Commit messages, AST symbol search, SHACL shape validation, boilerplate test stubs, JSON/YAML reformatting, air-gapped tasks | <$0.10 / M tokens (or $0 on workstation GPU) | 100ms – 500ms |
| **Tier 2: Workhorse Implementation** | Strong coding acumen, multi-file comprehension, tool execution, unit test synthesis | Claude Sonnet 5, GPT-5, Gemini 2.5 Pro | Feature implementation, REST/gRPC API controllers, database migrations, Gherkin BDD scenarios, PR code reviews | $3.00 – $15.00 / M tokens | 1s – 4s |
| **Tier 3: Frontier Deep Reasoning** | Extended thinking tokens, backtracking search, deep architectural synthesis, formal verification | OpenAI o3, o3-mini, Claude Opus 5 (Thinking), DeepSeek R1 | Monorepo architecture design, distributed deadlock debugging, cross-microservice schema migration plans, security threat modeling | $15.00 – $60.00 / M tokens | 5s – 30s |

---

### Tier 1: Fast Utility & Local

Tier 1 models handle high-frequency, deterministic tasks where speed and low cost are paramount. These models act as the nervous system of RobOS, responding instantly to user typing and background filesystem events:

- **RobOS Search Indexer**: When developers type `@` in any `<robos-ai-textarea>`, Tier 1 models filter AST symbol indexes and suggest matching services, contracts, and databases.
- **Continuous SHACL Validation**: Validates modified JSON-LD nodes against W3C SHACL shapes in real time before persisting to `.robos/kgraphs/`.
- **Commit Message & PR Title Synthesis**: Parses git diffs and formats conventional commit strings (`feat:`, `fix:`, `refactor:`) in sub-second time.
- **Sovereign Local Execution**: Runs directly on workstation hardware via Ollama or vLLM, ensuring zero data egress for air-gapped environments.

### Tier 2: Workhorse Implementation

Tier 2 represents the daily coding engine for RobOS autonomous agents. When an engineer selects a ticket in **Issue Manager** or runs an E2E test in **Dev Central**, Tier 2 agents execute the implementation loop:

- **Service & Contract Generation**: Scaffolds OpenAPI 3.1 YAML specifications, Protobuf gRPC stubs, and GraphQL schemas from Knowledge Graph requirements.
- **Behavior-Driven Development (BDD)**: Implements step definitions and assertions matching Gherkin scenarios (`Given`, `When`, `Then`).
- **Code Refactoring & Bug Fixing**: Edits source files within in-memory ephemeral sandboxes, running local unit tests to verify zero regressions.
- **Automated Pull Request Reviews**: In the **Agent Code Review Platform**, Tier 2 models analyze semantic diffs, comment on code style, and check test coverage before alerting the Lead Architect.

### Tier 3: Frontier Deep Reasoning

Tier 3 models are reserved for complex, multi-variable engineering challenges that require extensive chain-of-thought exploration and backtracking:

- **System-Wide Architecture Synthesis**: When bootstrapping a new enterprise or company catalog in **Group Manager**, Tier 3 synthesizes C4 Context, Container, and Component topologies.
- **Distributed Concurrency & Race Conditions**: Traces asynchronous event-driven flows across Kafka message brokers, distributed cache invalidations, and database transactions.
- **Blast Radius Analysis**: Evaluates breaking schema changes across dozens of interdependent microservices and downstream client applications.
- **Root Cause Forensic Debugging**: When multi-service integration tests fail in QEMU/KVM containers, Tier 3 analyzes logs, heap dumps, and network traces to isolate intermittent bugs.

---

## Token Optimization: Caveman Mode & DSPy

As multi-agent swarms execute hundreds of continuous sub-tasks throughout the day, prompt token consumption becomes both an economic bottleneck and a latency driver. RobOS incorporates two cutting-edge token optimization techniques into its agent pipeline:

<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
  <img src="{{ '/assets/images/agent-dispatch-pipeline.jpg' | relative_url }}" alt="RobOS Agent Dispatch Pipeline: Model Tiers, Caveman Compression, and DSPy Optimization" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>RobOS Agent Dispatch Pipeline</strong>: Dynamic 3-tier routing, Caveman token compression, and Stanford DSPy optimization. <em>(Click image to zoom full screen)</em>
  </div>
</div>

---

### Caveman Mode: Algorithmic Prompt Compression

**Caveman Mode** is an algorithmic prompt pruning technique designed for high-frequency Tier 1 and Tier 2 tasks. It removes conversational fluff, polite preamble, filler phrases, and grammatical redundancy while strictly preserving operational instructions, code snippets, file paths, and type constraints.

#### Why It Works

Large language models do not require human conversational etiquette to execute technical instructions. Phrases like *"Could you please make sure to ensure that..."* add zero operational value while consuming token quota and attention bandwidth.

Caveman Mode applies deterministic token compaction:
1. **Filler & Politeness Elimination**: Prunes conversational boilerplate (`"please ensure"`, `"in order to"`, `"keep in mind that"`, `"thank you in advance"`).
2. **Directive Compacting**: Compresses complex sentence clauses into concise, bulleted imperatives.
3. **Grammatical Pruning (Extreme Mode)**: Removes non-essential articles (`a`, `an`, `the`) and conversational connectives (`furthermore`, `moreover`, `additionally`) outside quoted strings and code blocks.
4. **Code & Path Invariance**: Markdown code blocks (` ``` `), backticked symbols (`` `foo` ``), environment variables, and filesystem paths are quarantined and preserved verbatim.

#### Compression Modes

| Mode | Pruning Strategy | Average Token Savings | Recommended Tier |
|:---|:---|:---|:---|
| **Standard** | Removes polite preambles, filler phrases, redundant punctuation | **30% – 45%** | Tier 2 (Workhorse) |
| **Aggressive** | Standard + removes transitional connectives, conversational passive voice | **45% – 55%** | Tier 1 & Tier 2 |
| **Extreme** | Aggressive + removes articles and compacts syntax to terse telegraphic style | **55% – 65%** | Tier 1 (Utility & Local) |

#### Concrete Example

##### Original Prompt (112 Estimated Tokens):
```text
Hello! Could you please make sure to inspect the authentication service controller located at 
packages/auth-service/controllers/login.js? In order to prevent security vulnerabilities, it is 
important to note that we need to verify that all incoming password fields are properly sanitized 
and hashed with bcrypt before storing them in PostgreSQL. Furthermore, please ensure that if the 
email address is invalid, you return a 400 Bad Request status code. Thank you!
```

##### Caveman Compressed Prompt (48 Estimated Tokens — 57% Reduction):
```text
Inspect `packages/auth-service/controllers/login.js`:
- Verify incoming password sanitized and bcrypt-hashed before PostgreSQL store.
- If email invalid, return HTTP 400 Bad Request.
```

---

### Stanford DSPy: Declarative Teleprompter Optimization

While Caveman Mode algorithmically shrinks prompts, **Stanford DSPy** (Demonstrate-Search-Predict) programmatically compiles them. Instead of brittle manual "prompt engineering" (tweaking text strings by hand), DSPy treats prompts as declarative, tunable programs calibrated against empirical evaluation metrics.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DSPY TELEPROMPTER COMPILATION                          │
└─────────────────────────────────────────────────────────────────────────────┘
  Declarative Signature: { inputs: [task, spec], outputs: [code, conformance] }
                                      │
                                      ▼
                      ┌───────────────────────────────┐
                      │    Few-Shot Exemplar Search   │
                      │   (BootstrapFewShot / MIPRO)  │
                      └───────────────────────────────┘
                                      │
                                      ▼
                      ┌───────────────────────────────┐
                      │    Metric Evaluation Engine   │
                      │  - SHACL Shape Conformance    │
                      │  - Unit Test Pass Rate        │
                      │  - AST Syntax & Type Check    │
                      └───────────────────────────────┘
                                      │
                                      ▼
                      ┌───────────────────────────────┐
                      │   Compiled Optimized Prompt   │
                      │  Stored in SDLC KGraph Node   │
                      └───────────────────────────────┘
```

#### How RobOS Integrates DSPy

In RobOS, DSPy teleprompters run as background optimization jobs registered in the SDLC Knowledge Graph (`robos:PromptOptimizer`):

1. **Declarative Signatures**: Defines task inputs (`inputs: ['task', 'contractYaml']`) and expected outputs (`outputs: ['implementation', 'testAssertions']`).
2. **Teleprompter Optimizers**:
   - **MIPROv2 (Multi-Prompt Instruction Proposal & Optimization)**: Jointly proposes instruction candidates and few-shot exemplars, evaluating scores across a validation mini-batch.
   - **BootstrapFewShot**: Dynamically discovers successful reasoning traces and automatically includes them as few-shot exemplars in subsequent runs.
   - **COPRO (Coordinate Prompt Optimization)**: Iteratively refines instructions using coordinate gradient-free search.
3. **Verifiable Evaluation Metrics**: Prompts are scored against deterministic RobOS validators:
   - `shacl_validation`: 100% conformance to W3C SHACL shapes in `.robos/kgraphs/`.
   - `unit_tests_pass`: Automated execution of Mocha/Jest/Vitest suites in ephemeral sandboxes.
   - `ast_syntax_check`: Zero parser errors in AST tree generation.
4. **Knowledge Graph Persistence**: Once compiled, the optimized prompt template and its calibrated exemplars are stored as a versioned node in `.robos/kgraphs/core-platform/package.jsonld`.

---

## Configuring Agent Tiers in the RobOS Settings Console

All model tier assignments and prompt optimization toggles are managed centrally via the native **RobOS Preferences** desktop console (`packages/robos-preferences`).

### Accessing the Settings Console

You can open the console in two ways:
1. Click **RobOS Preferences** in the **App Launcher** (the searchable application grid in the GNOME panel).
2. Launch directly from any terminal:
   ```bash
   electron packages/robos-preferences
   ```

### The "Agent Tiers & Prompt Optimization" Pane

Navigate to the **Agent Tiers & Prompt Optimization** section in the left sidebar to configure:

<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
  <img src="{{ '/assets/images/screenshots/agent-tiers-preferences-overview.png' | relative_url }}" alt="RobOS Preferences — Agent Tiers and Prompt Optimization Pane" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>RobOS Preferences — Agent Tiers & Prompt Optimization</strong>: Configurable model tiers (Tier 1: Claude Haiku 4.5, Tier 2: Claude Sonnet 5, Tier 3: OpenAI o3), Caveman algorithmic compression, and Stanford DSPy teleprompter. <em>(Click image to zoom full screen)</em>
  </div>
</div>

<div style="margin: 2rem 0; padding: 1.5rem; border: 1px solid #30363d; border-radius: 10px; background: #161b22;">
  <h4 style="margin-top: 0; color: #58a6ff;">⚙️ RobOS Preferences — Agent Tiers Schema</h4>
  <ul>
    <li><strong>Tier 1 Model (Fast Utility & Local)</strong>: Model identifier for utility tasks (default: <code>claude-haiku-4-5</code>, <code>gemini-2.5-flash</code>, or local <code>ollama/qwen2.5-coder:7b</code>).</li>
    <li><strong>Tier 2 Model (Workhorse Implementation)</strong>: Primary coding model (default: <code>claude-sonnet-5</code> or <code>gpt-5</code>).</li>
    <li><strong>Tier 3 Model (Frontier Deep Reasoning)</strong>: High-reasoning model for system architecture (default: <code>o3</code> or <code>claude-opus-5</code>).</li>
    <li><strong>Enable Caveman Prompt Compression</strong>: Toggle algorithmic token pruning (checkbox).</li>
    <li><strong>Caveman Compression Mode</strong>: Select compression aggressiveness (<code>standard</code>, <code>aggressive</code>, <code>extreme</code>).</li>
    <li><strong>Caveman Target Tiers</strong>: Scope compression to specific tiers (<code>tier1</code>, <code>tier1_and_tier2</code>, <code>all_tiers</code>).</li>
    <li><strong>Enable Stanford DSPy Optimization</strong>: Toggle declarative prompt compilation (checkbox).</li>
    <li><strong>DSPy Teleprompter Optimizer</strong>: Select optimization engine (<code>MIPROv2</code>, <code>BootstrapFewShot</code>, <code>COPRO</code>).</li>
    <li><strong>DSPy Optimization Metric</strong>: Select verification target (<code>shacl_validation</code>, <code>unit_tests_pass</code>, <code>ast_syntax_check</code>).</li>
    <li><strong>Auto-compile DSPy Prompts on Save</strong>: Automatically re-run prompt calibration whenever settings are saved.</li>
  </ul>
</div>

<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
  <img src="{{ '/assets/images/screenshots/agent-tiers-preferences-extreme-config.png' | relative_url }}" alt="Configuring Extreme Caveman Mode and DSPy BootstrapFewShot" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>Tuning Token Optimization</strong>: Setting Caveman mode to <code>extreme</code> (55–65% token pruning) and Stanford DSPy teleprompter to <code>BootstrapFewShot</code> with <code>unit_tests_pass</code> verification. <em>(Click image to zoom full screen)</em>
  </div>
</div>

### Dual-State Knowledge Graph Synchronization

When you click **Save Settings** in RobOS Preferences:
1. Preferences are written to `~/.config/robos/settings.json` for fast desktop client access.
2. The `SDLCKnowledgeGraphStore` automatically synchronizes the configuration into the SDLC Knowledge Graph under `.robos/kgraphs/core-platform/package.jsonld`:
   - `urn:robos:agent:strategy:caveman-compression` (`robos:PromptStrategy`)
   - `urn:robos:agent:optimizer:dspy-teleprompter` (`robos:PromptOptimizer`)
3. All AI agent sessions running across **Agents Manager**, **Dev Central**, or CLI bridges (`claude`, `agy`, `copilot`) immediately inherit the updated tier and prompt configurations.

<div style="margin: 2rem 0; border: 1px solid #1e293b; border-radius: 12px; overflow: hidden; background: #0b101b; box-shadow: 0 10px 40px rgba(0,0,0,0.6);">
  <img src="{{ '/assets/images/screenshots/agent-tiers-preferences-saved.png' | relative_url }}" alt="RobOS Preferences Saved and Synchronized" class="robos-zoomable-img" style="display: block; width: 100%; height: auto;" />
  <div style="padding: 0.75rem 1.25rem; font-size: 0.85rem; color: #94a3b8; border-top: 1px solid #1e293b; background: #0d1424; text-align: center;">
    <strong>Persistence & Knowledge Graph Synchronization</strong>: Clicking Save All validates inputs, updates <code>settings.json</code>, and publishes dual-state updates to the SDLC Knowledge Graph. <em>(Click image to zoom full screen)</em>
  </div>
</div>

---

## Air-Gapped & Sovereign Execution

For enterprises subject to strict regulatory compliance (defense, healthcare, finance), RobOS allows all three agent tiers to execute in **100% Air-Gapped Sovereign Mode**:

1. **Local Model Endpoints**: Set Tier 1 and Tier 2 models to point to private Ollama or vLLM endpoints:
   - Tier 1: `ollama/qwen2.5-coder:7b` (sub-second local inference)
   - Tier 2: `ollama/deepseek-coder-v2:16b` (balanced offline coding)
   - Tier 3: Dedicated internal cluster running `deepseek-r1` or `llama3.3:70b`
2. **Zero External Egress**: When Sovereign Mode is active, all prompt compression (Caveman), teleprompter compilation (DSPy), and SHACL validation execute locally in the virtual machine with zero outbound internet traffic.
3. **Audit Trails**: Every prompt transformation and teleprompter metric score is logged to `~/.robos/audit/prompts.log` for compliance verification.

---

## Programmatic Usage in RobOS Applications

Developers and agent scripts can programmatically leverage Caveman compression and DSPy compilation using the shared `robos-graph` library:

### Caveman Compression API

```javascript
const { SDLCKnowledgeGraphStore } = require('/usr/local/share/robos/robos-graph');
const store = new SDLCKnowledgeGraphStore();

const rawPrompt = `
Hello! Could you please ensure that you inspect packages/billing/index.js?
In order to comply with accounting standards, make sure all currency calculations use integer cents.
Thank you very much!
`;

// Apply standard or aggressive Caveman compression
const result = store.applyCavemanCompression(rawPrompt, { mode: 'aggressive' });

console.log(`Original Tokens: ${result.originalTokensEst}`);
console.log(`Compressed Tokens: ${result.compressedTokensEst}`);
console.log(`Savings: ${result.savingsPercent}%`);
console.log(result.compressedText);
// Output:
// Inspect `packages/billing/index.js`:
// Ensure currency calculations use integer cents.
```

### DSPy Teleprompter Compilation API

```javascript
const { SDLCKnowledgeGraphStore } = require('/usr/local/share/robos/robos-graph');
const store = new SDLCKnowledgeGraphStore();

// Define prompt signature and training dataset
const signature = {
  inputs: ['featureRequest', 'schemaContext'],
  outputs: ['openapiYaml', 'shaclCompliance']
};

const dataset = [
  {
    featureRequest: 'Add health check endpoint returning status 200 OK',
    schemaContext: 'REST API v1',
    openapiYaml: '/health: get: responses: 200: description: OK',
    shaclCompliance: true,
    score: 1.0
  }
];

// Compile optimized prompt template using MIPROv2 teleprompter
const compiled = store.compileWithDSPy(signature, dataset, {
  teleprompter: 'MIPROv2',
  metric: 'shacl_validation',
  maxBootstrappedDemos: 3
});

console.log(`Teleprompter: ${compiled.teleprompter}`);
console.log(`Calibrated Demonstrations: ${compiled.calibratedExemplarCount}`);
console.log(compiled.compiledPrompt);
```

---

## Next Steps

- **[Agent-Agnostic Framework]({{ site.baseurl }}{% link big-wins/agent-agnostic-framework.md %})**: Learn how RobOS supports Claude, Antigravity, Copilot, Gemini, and local agents with zero lock-in.
- **[Ephemeral In-Memory Sandboxes]({{ site.baseurl }}{% link big-wins/ephemeral-agent-sandboxes.md %})**: Explore how agents test code safely in isolated RAM environments.
- **[SDLC Knowledge Graph]({{ site.baseurl }}{% link knowledge-graph.md %})**: Understand how system architecture, microservices, and databases are formally modeled.
- **[RobOS Preferences Console]({{ site.baseurl }}{% link apps.md %})**: Explore the desktop settings console and other native RobOS applications.
- **[💡 Explore Ideas & Feature Proposals](https://github.com/nddipiazza/robos/tree/main/docs/ideas)**: View community proposals and submit ideas for future model tier optimizations.
