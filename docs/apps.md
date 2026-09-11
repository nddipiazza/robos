---
title: App Suite
layout: default
nav_order: 10
---

# RobOS App Suite
{: .no_toc }

The complete suite of 51 native developer desktop applications covering the entire software delivery lifecycle with zero framework overhead. Every application is built with vanilla JavaScript, optimized for instant cold-starts, and deeply integrated with the RobOS SDLC Knowledge Graph.
{: .fs-6 .fw-300 }

## Official Application Directory
{: .no_toc }

<div class="robos-app-directory-wrap">
  <div class="robos-app-nav-pills">
    <a href="#core-desktop" class="robos-app-nav-pill">Core Desktop & Command Center <span class="pill-count">16</span></a>
    <a href="#ai-agents" class="robos-app-nav-pill">Autonomous AI & Agent Workflows <span class="pill-count">8</span></a>
    <a href="#arch-planning" class="robos-app-nav-pill">Software Architecture & Planning <span class="pill-count">9</span></a>
    <a href="#code-review" class="robos-app-nav-pill">Code, Repositories & Review <span class="pill-count">3</span></a>
    <a href="#databases-streams" class="robos-app-nav-pill">Databases & Event Streams <span class="pill-count">3</span></a>
    <a href="#apis-testing" class="robos-app-nav-pill">APIs, Contracts & Testing <span class="pill-count">3</span></a>
    <a href="#devops-cloud" class="robos-app-nav-pill">DevOps, Cloud & Distributed Build <span class="pill-count">5</span></a>
    <a href="#security-vault" class="robos-app-nav-pill">Security, Credentials & Pass Vault <span class="pill-count">5</span></a>
  </div>
  <div id="core-desktop" class="robos-cat-group">
    <div class="robos-cat-header">
      <h3 class="robos-cat-title">Core Desktop & Command Center</h3>
      <span class="robos-cat-badge">16 Apps</span>
    </div>
    <div class="robos-apps-grid">
      <div class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/app-launcher.svg' | relative_url }}" width="38" height="38" alt="App Launcher icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">App Launcher</div>
          <span class="robos-app-pkg">robos:app-launcher</span>
          <p class="robos-app-desc">Searchable application grid, category filters, and fast launch dock for all installed RobOS apps.</p>
        </div>
      </div>
      <a href="#dev-central-developer-command-center" class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/dev-central.svg' | relative_url }}" width="38" height="38" alt="Dev Central icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Dev Central</div>
          <span class="robos-app-pkg">robos:dev-central</span>
          <p class="robos-app-desc">Daily developer engineering command center: sprint burndown, PR health, calendar, and AI standup.</p>
          <span class="robos-app-link-badge">Explore Guide ↗</span>
        </div>
      </a>
      <div class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/robos-desktop.svg' | relative_url }}" width="38" height="38" alt="Desktop Shell icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Desktop Shell</div>
          <span class="robos-app-pkg">robos:robos-desktop</span>
          <p class="robos-app-desc">Wayland/X11 desktop taskbar, panel launchers, and system tray status notifications.</p>
        </div>
      </div>
      <div class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/desktop-manager.svg' | relative_url }}" width="38" height="38" alt="Desktop Manager icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Desktop Manager</div>
          <span class="robos-app-pkg">robos:desktop-manager</span>
          <p class="robos-app-desc">Session lifecycle manager, GNOME panel extension bridge, and multi-display workspace organizer.</p>
        </div>
      </div>
      <div class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/desktop-dashboard.svg' | relative_url }}" width="38" height="38" alt="Desktop Dashboard icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Desktop Dashboard</div>
          <span class="robos-app-pkg">robos:desktop-dashboard</span>
          <p class="robos-app-desc">Real-time system diagnostics, CPU/memory stats, active workspaces, and quick launch shortcuts.</p>
        </div>
      </div>
      <div class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/manager-dashboard.svg' | relative_url }}" width="38" height="38" alt="Manager Dashboard icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Manager Dashboard</div>
          <span class="robos-app-pkg">robos:manager-dashboard</span>
          <p class="robos-app-desc">High-level engineering KPIs, sprint velocity, cross-team blockers, and delivery health metrics.</p>
        </div>
      </div>
      <div class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/workspace-manager.svg' | relative_url }}" width="38" height="38" alt="Workspace Manager icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Workspace Manager</div>
          <span class="robos-app-pkg">robos:workspace-manager</span>
          <p class="robos-app-desc">Auto-discover, configure, switch, and provision local repository workspaces in any IDE.</p>
        </div>
      </div>
      <div class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/software-center.svg' | relative_url }}" width="38" height="38" alt="Software Center icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Software Center</div>
          <span class="robos-app-pkg">robos:software-center</span>
          <p class="robos-app-desc">Developer tool store to install and manage IDEs, compilers, language runtimes, and cloud CLI SDKs.</p>
        </div>
      </div>
      <div class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/search-index.svg' | relative_url }}" width="38" height="38" alt="Search Indexer icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Search Indexer</div>
          <span class="robos-app-pkg">robos:search-index</span>
          <p class="robos-app-desc">High-performance filesystem and AST symbol indexer powering fuzzy @-mentions across all apps.</p>
        </div>
      </div>
      <div class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/desktop-customizer.svg' | relative_url }}" width="38" height="38" alt="Desktop Customizer icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Desktop Customizer</div>
          <span class="robos-app-pkg">robos:desktop-customizer</span>
          <p class="robos-app-desc">Configure themes, obsidian/cyan color accents, panel layouts, fonts, and window decorations.</p>
        </div>
      </div>
      <div class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/desktop-widgets.svg' | relative_url }}" width="38" height="38" alt="Desktop Widgets icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Desktop Widgets</div>
          <span class="robos-app-pkg">robos:desktop-widgets</span>
          <p class="robos-app-desc">Floating desktop HUD widgets for active sprint tasks, PR review health, and blocker radar.</p>
        </div>
      </div>
      <div class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/icon-manager.svg' | relative_url }}" width="38" height="38" alt="Icon Manager icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Icon Manager</div>
          <span class="robos-app-pkg">robos:icon-manager</span>
          <p class="robos-app-desc">Vector SVG icon browser, custom asset manager, and desktop launcher icon customizer.</p>
        </div>
      </div>
      <div class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/robos-preferences.svg' | relative_url }}" width="38" height="38" alt="RobOS Preferences icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">RobOS Preferences</div>
          <span class="robos-app-pkg">robos:robos-preferences</span>
          <p class="robos-app-desc">System-wide developer settings, LLM provider endpoints, GPG keyrings, and editor keybindings.</p>
        </div>
      </div>
      <div class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/notifications.svg' | relative_url }}" width="38" height="38" alt="Notifications Center icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Notifications Center</div>
          <span class="robos-app-pkg">robos:notifications</span>
          <p class="robos-app-desc">Central notification history, agent alert center, and system event feed.</p>
        </div>
      </div>
      <div class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/robos-toast.svg' | relative_url }}" width="38" height="38" alt="Toast Daemon icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Toast Daemon</div>
          <span class="robos-app-pkg">robos:robos-toast</span>
          <p class="robos-app-desc">Non-blocking translucent system overlay toast broadcaster for AI agents and build completions.</p>
        </div>
      </div>
      <div class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/robos-logs.svg' | relative_url }}" width="38" height="38" alt="System Logs Viewer icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">System Logs Viewer</div>
          <span class="robos-app-pkg">robos:robos-logs</span>
          <p class="robos-app-desc">Centralized Pino JSON log viewer, error stack-trace inspector, and Electron diagnostic console.</p>
        </div>
      </div>
    </div>
  </div>
  <div id="ai-agents" class="robos-cat-group">
    <div class="robos-cat-header">
      <h3 class="robos-cat-title">Autonomous AI & Agent Workflows</h3>
      <span class="robos-cat-badge">8 Apps</span>
    </div>
    <div class="robos-apps-grid">
      <a href="#agent-chat--vs-code-style-conversational-assistant" class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/agent-chat.svg' | relative_url }}" width="38" height="38" alt="Agent Chat icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Agent Chat</div>
          <span class="robos-app-pkg">robos:agent-chat</span>
          <p class="robos-app-desc">VS Code & Cursor-style conversational AI assistant with multi-model switcher, live tool cards, and quick prompt popup.</p>
          <span class="robos-app-link-badge">Explore Guide ↗</span>
        </div>
      </a>
      <a href="#agents-manager--universal-ai-tool-connections-mcp" class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/agents-manager.svg' | relative_url }}" width="38" height="38" alt="Agents Manager icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Agents Manager</div>
          <span class="robos-app-pkg">robos:agents-manager</span>
          <p class="robos-app-desc">Orchestrate Claude Code, Google Antigravity, Copilot CLI, and Gemini agent sessions.</p>
          <span class="robos-app-link-badge">Explore Guide ↗</span>
        </div>
      </a>
      <div class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/ai-prompt.svg' | relative_url }}" width="38" height="38" alt="AI Prompt Studio icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">AI Prompt Studio</div>
          <span class="robos-app-pkg">robos:ai-prompt</span>
          <p class="robos-app-desc">Context-aware prompt engineering with DSPy automated optimization and Caveman token compression.</p>
        </div>
      </div>
      <a href="#task-planner--project-breakdown" class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/task-planner.svg' | relative_url }}" width="38" height="38" alt="Task Planner icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Task Planner</div>
          <span class="robos-app-pkg">robos:task-planner</span>
          <p class="robos-app-desc">AI-assisted project breakdown with interactive domain-specific web templates for epics and stories.</p>
          <span class="robos-app-link-badge">Explore Guide ↗</span>
        </div>
      </a>
      <div class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/task-implementer.svg' | relative_url }}" width="38" height="38" alt="Task Implementer icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Task Implementer</div>
          <span class="robos-app-pkg">robos:task-implementer</span>
          <p class="robos-app-desc">Autonomous multi-file code generator, diff reviewer, test execution runner, and patch applier.</p>
        </div>
      </div>
      <a href="#agents-manager--universal-ai-tool-connections-mcp" class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/mcp-manager.svg' | relative_url }}" width="38" height="38" alt="MCP Manager icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">MCP Manager</div>
          <span class="robos-app-pkg">robos:mcp-manager</span>
          <p class="robos-app-desc">Model Context Protocol server registry, interactive tool testbench, and OAuth connector.</p>
          <span class="robos-app-link-badge">Explore Guide ↗</span>
        </div>
      </a>
      <div class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/context-manager.svg' | relative_url }}" width="38" height="38" alt="Context Manager icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Context Manager</div>
          <span class="robos-app-pkg">robos:context-manager</span>
          <p class="robos-app-desc">Curate files, web URLs, Git repos, and Jira tickets for high-signal AI agent context.</p>
        </div>
      </div>
      <a href="#skills-manager--cross-agent-ai-skills-library" class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/skills-manager.svg' | relative_url }}" width="38" height="38" alt="Skills Manager icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Skills Manager</div>
          <span class="robos-app-pkg">robos:skills-manager</span>
          <p class="robos-app-desc">Cross-agent AI skills marketplace and catalog supporting Claude, Codex, Antigravity, and Gemini.</p>
          <span class="robos-app-link-badge">Explore Guide ↗</span>
        </div>
      </a>
    </div>
  </div>
  <div id="arch-planning" class="robos-cat-group">
    <div class="robos-cat-header">
      <h3 class="robos-cat-title">Software Architecture & Planning</h3>
      <span class="robos-cat-badge">9 Apps</span>
    </div>
    <div class="robos-apps-grid">
      <a href="#robos-app-wizard-greenfield--brownfield-multi-app-scaffolding" class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/app-wizard.svg' | relative_url }}" width="38" height="38" alt="RobOS App Wizard icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">RobOS App Wizard</div>
          <span class="robos-app-pkg">robos:app-wizard</span>
          <p class="robos-app-desc">Greenfield scaffolding and brownfield codebase ingestion across 9 multi-app archetypes.</p>
          <span class="robos-app-link-badge">Explore Guide ↗</span>
        </div>
      </a>
      <a href="#robos-group-manager-teams-organizations--enterprise-directory-sync" class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/group-manager.svg' | relative_url }}" width="38" height="38" alt="RobOS Group Manager icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">RobOS Group Manager</div>
          <span class="robos-app-pkg">robos:group-manager</span>
          <p class="robos-app-desc">Enterprise directory sync (Okta/SCIM/LDAP), company tenant onboarding, and Team Topologies.</p>
          <span class="robos-app-link-badge">Explore Guide ↗</span>
        </div>
      </a>
      <div class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/people-directory.svg' | relative_url }}" width="38" height="38" alt="People Directory icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">People Directory</div>
          <span class="robos-app-pkg">robos:people-directory</span>
          <p class="robos-app-desc">Visual engineering team tree, squad ownership, and contributor contact directory.</p>
        </div>
      </div>
      <div class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/issue-manager.svg' | relative_url }}" width="38" height="38" alt="Issue Manager icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Issue Manager</div>
          <span class="robos-app-pkg">robos:issue-manager</span>
          <p class="robos-app-desc">GitHub & Gitea Issues client with drag-and-drop Kanban board and AI ticket breakdown.</p>
        </div>
      </div>
      <div class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/task-board.svg' | relative_url }}" width="38" height="38" alt="Task Board icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Task Board</div>
          <span class="robos-app-pkg">robos:task-board</span>
          <p class="robos-app-desc">Interactive sprint Kanban board with swimlanes, custom status columns, and WIP limits.</p>
        </div>
      </div>
      <div class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/task-servers.svg' | relative_url }}" width="38" height="38" alt="Task Servers icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Task Servers</div>
          <span class="robos-app-pkg">robos:task-servers</span>
          <p class="robos-app-desc">Connect and authenticate Jira, GitHub Enterprise, and Linear task management servers.</p>
        </div>
      </div>
      <div class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/workflow-studio.svg' | relative_url }}" width="38" height="38" alt="Workflow Studio icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Workflow Studio</div>
          <span class="robos-app-pkg">robos:workflow-studio</span>
          <p class="robos-app-desc">Visual issue lifecycle designer, status transitions, condition gates, and validation rules.</p>
        </div>
      </div>
      <div class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/automation-studio.svg' | relative_url }}" width="38" height="38" alt="Automation Studio icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Automation Studio</div>
          <span class="robos-app-pkg">robos:automation-studio</span>
          <p class="robos-app-desc">Low-code SDLC event triggers, Git webhook actions, and automated agent runbooks.</p>
        </div>
      </div>
      <a href="#robos-schema-studio--definitive-registry" class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/schema-studio.svg' | relative_url }}" width="38" height="38" alt="Schema Studio icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Schema Studio & Registry</div>
          <span class="robos-app-pkg">robos:schema-studio</span>
          <p class="robos-app-desc">Schema.org ontology explorer, TypeSpec domain modeling, W3C SHACL synthesis, and live JSON-LD validator.</p>
          <span class="robos-app-link-badge">Explore Guide ↗</span>
        </div>
      </a>
    </div>
  </div>
  <div id="code-review" class="robos-cat-group">
    <div class="robos-cat-header">
      <h3 class="robos-cat-title">Code, Repositories & Review</h3>
      <span class="robos-cat-badge">4 Apps</span>
    </div>
    <div class="robos-apps-grid">
      <a href="#git-projects-multi-repo-hub" class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/git-projects.svg' | relative_url }}" width="38" height="38" alt="Git Projects Multi-Repo Hub icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Git Projects Multi-Repo Hub</div>
          <span class="robos-app-pkg">robos:git-projects</span>
          <p class="robos-app-desc">Central repository hub with one-click dev-setup.sh scripts, Monaco editor, and branch management.</p>
          <span class="robos-app-link-badge">Explore Guide ↗</span>
        </div>
      </a>
      <a href="{{ '/pr-review-theater.html' | relative_url }}" class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/pr-review.svg' | relative_url }}" width="38" height="38" alt="Agent Code Review Platform icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Agent Code Review & PR Review Theater</div>
          <span class="robos-app-pkg">robos:pr-review</span>
          <p class="robos-app-desc">Autonomous AI pull request auditor, 6-stage Review Theater, knowledge checks, and IDE bridges.</p>
          <span class="robos-app-link-badge">Explore Guide ↗</span>
        </div>
      </a>
      <a href="{{ '/pr-review-theater.html#standalone-robos-elearning-player-hub' | relative_url }}" class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/robos-elearning.svg' | relative_url }}" width="38" height="38" alt="RobOS eLearning Hub icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">RobOS eLearning Hub</div>
          <span class="robos-app-pkg">robos:robos-elearning</span>
          <p class="robos-app-desc">Interactive developer eLearning player, hands-on lab runner, and Knowledge Graph certificates.</p>
          <span class="robos-app-link-badge">Explore Guide ↗</span>
        </div>
      </a>
      <a href="{{ '/big-wins/video-proof-of-work.html' | relative_url }}" class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/stage-demo.svg' | relative_url }}" width="38" height="38" alt="Stage Demo icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Stage Demo</div>
          <span class="robos-app-pkg">robos:stage-demo</span>
          <p class="robos-app-desc">Record text-narrated video walkthroughs, synthesize WebVTT captions, and archive feature demos.</p>
          <span class="robos-app-link-badge">Explore Guide ↗</span>
        </div>
      </a>
    </div>
  </div>
  <div id="databases-streams" class="robos-cat-group">
    <div class="robos-cat-header">
      <h3 class="robos-cat-title">Databases & Event Streams</h3>
      <span class="robos-cat-badge">3 Apps</span>
    </div>
    <div class="robos-apps-grid">
      <a href="#robos-relational-db-manager-postgresql-mysql-oracle" class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/db-manager.svg' | relative_url }}" width="38" height="38" alt="Relational DB Manager icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Relational DB Manager</div>
          <span class="robos-app-pkg">robos:db-manager</span>
          <p class="robos-app-desc">DBeaver/DataGrip-inspired SQL database explorer, schema navigator, and multi-tab query console.</p>
          <span class="robos-app-link-badge">Explore Guide ↗</span>
        </div>
      </a>
      <a href="#robos-nosql-db-manager-mongodb--redis" class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/nosql-manager.svg' | relative_url }}" width="38" height="38" alt="NoSQL DB Manager icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">NoSQL DB Manager</div>
          <span class="robos-app-pkg">robos:nosql-manager</span>
          <p class="robos-app-desc">MongoDB document inspector & Redis key-value store explorer with live TTL expirations.</p>
          <span class="robos-app-link-badge">Explore Guide ↗</span>
        </div>
      </a>
      <a href="#robos-data-sources-explorer" class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/data-sources.svg' | relative_url }}" width="38" height="38" alt="Data Sources Explorer icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Data Sources Explorer</div>
          <span class="robos-app-pkg">robos:data-sources</span>
          <p class="robos-app-desc">Central catalog for corporate databases, AWS S3 storage buckets, and Kafka event streams.</p>
          <span class="robos-app-link-badge">Explore Guide ↗</span>
        </div>
      </a>
    </div>
  </div>
  <div id="apis-testing" class="robos-cat-group">
    <div class="robos-cat-header">
      <h3 class="robos-cat-title">APIs, Contracts & Testing</h3>
      <span class="robos-cat-badge">3 Apps</span>
    </div>
    <div class="robos-apps-grid">
      <a href="#robos-rest-api-client" class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/rest-client.svg' | relative_url }}" width="38" height="38" alt="REST API Client & Runner icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">REST API Client & Runner</div>
          <span class="robos-app-pkg">robos:rest-client</span>
          <p class="robos-app-desc">Git-backed Bruno-compatible REST client, OpenAPI request synthesis, and sequential runner.</p>
          <span class="robos-app-link-badge">Explore Guide ↗</span>
        </div>
      </a>
      <a href="{{ '/big-wins/api-and-web-clients.html' | relative_url }}" class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/grpc-client.svg' | relative_url }}" width="38" height="38" alt="gRPC Microservice Client icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">gRPC Microservice Client</div>
          <span class="robos-app-pkg">robos:grpc-client</span>
          <p class="robos-app-desc">BloomRPC/Kreya-inspired Protobuf schema loader, unary & streaming gRPC invocation tool.</p>
          <span class="robos-app-link-badge">Explore Guide ↗</span>
        </div>
      </a>
      <a href="{{ '/big-wins/api-and-web-clients.html' | relative_url }}" class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/graphql-client.svg' | relative_url }}" width="38" height="38" alt="GraphQL Client & Explorer icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">GraphQL Client & Explorer</div>
          <span class="robos-app-pkg">robos:graphql-client</span>
          <p class="robos-app-desc">GraphiQL/Altair-inspired GraphQL introspection schema browser, query editor, and runner.</p>
          <span class="robos-app-link-badge">Explore Guide ↗</span>
        </div>
      </a>
    </div>
  </div>
  <div id="devops-cloud" class="robos-cat-group">
    <div class="robos-cat-header">
      <h3 class="robos-cat-title">DevOps, Cloud & Distributed Build</h3>
      <span class="robos-cat-badge">5 Apps</span>
    </div>
    <div class="robos-apps-grid">
      <a href="#robos-remote-execution-studio" class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/remote-execution-studio.svg' | relative_url }}" width="38" height="38" alt="Remote Execution Studio icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Remote Execution Studio</div>
          <span class="robos-app-pkg">robos:remote-execution-studio</span>
          <p class="robos-app-desc">REAPI v2 distributed build control room, Bazel/Buck2 client synthesis, and Buildbarn management.</p>
          <span class="robos-app-link-badge">Explore Guide ↗</span>
        </div>
      </a>
      <a href="#kube-studio--cloud-infrastructure-navigator" class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/kube-studio.svg' | relative_url }}" width="38" height="38" alt="Kube Studio & Cloud Navigator icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Kube Studio & Cloud Navigator</div>
          <span class="robos-app-pkg">robos:kube-studio</span>
          <p class="robos-app-desc">Multi-cluster Kubernetes navigator, Helm release inspector, ArgoCD GitOps, and live pod logs.</p>
          <span class="robos-app-link-badge">Explore Guide ↗</span>
        </div>
      </a>
      <a href="#ci-monitor" class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/ci-monitor.svg' | relative_url }}" width="38" height="38" alt="CI Monitor icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">CI Monitor</div>
          <span class="robos-app-pkg">robos:ci-monitor</span>
          <p class="robos-app-desc">Real-time CI/CD pipeline monitor with AI root-cause failure analysis and one-click reruns.</p>
          <span class="robos-app-link-badge">Explore Guide ↗</span>
        </div>
      </a>
      <a href="#deploy-tracker" class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/deploy-tracker.svg' | relative_url }}" width="38" height="38" alt="Deploy Tracker icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Deploy Tracker</div>
          <span class="robos-app-pkg">robos:deploy-tracker</span>
          <p class="robos-app-desc">Multi-environment deployment dashboard with DORA metrics, canary rollouts, and rollbacks.</p>
          <span class="robos-app-link-badge">Explore Guide ↗</span>
        </div>
      </a>
      <div class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/report-builder.svg' | relative_url }}" width="38" height="38" alt="Report Builder icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Report Builder</div>
          <span class="robos-app-pkg">robos:report-builder</span>
          <p class="robos-app-desc">Automated sprint recap generator, engineering metrics aggregator, and stakeholder reports.</p>
        </div>
      </div>
    </div>
  </div>
  <div id="security-vault" class="robos-cat-group">
    <div class="robos-cat-header">
      <h3 class="robos-cat-title">Security, Credentials & Pass Vault</h3>
      <span class="robos-cat-badge">5 Apps</span>
    </div>
    <div class="robos-apps-grid">
      <a href="{{ '/big-wins/devops-security-pass.html' | relative_url }}" class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/pass-manager.svg' | relative_url }}" width="38" height="38" alt="Pass Manager Vault icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Pass Manager Vault</div>
          <span class="robos-app-pkg">robos:pass-manager</span>
          <p class="robos-app-desc">Native GUI for UNIX standard password store (pass) with GPG encryption and zero plaintext keys.</p>
          <span class="robos-app-link-badge">Explore Guide ↗</span>
        </div>
      </a>
      <a href="{{ '/big-wins/devops-security-pass.html' | relative_url }}" class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/pass-unlock.svg' | relative_url }}" width="38" height="38" alt="Pass Unlock Daemon icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Pass Unlock Daemon</div>
          <span class="robos-app-pkg">robos:pass-unlock</span>
          <p class="robos-app-desc">Secure GPG passphrase caching agent, pinentry bridge, and session credential keyring.</p>
          <span class="robos-app-link-badge">Explore Guide ↗</span>
        </div>
      </a>
      <a href="{{ '/big-wins/devops-security-pass.html' | relative_url }}" class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/security-setup.svg' | relative_url }}" width="38" height="38" alt="Security Setup Wizard icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Security Setup Wizard</div>
          <span class="robos-app-pkg">robos:security-setup</span>
          <p class="robos-app-desc">First-run GPG master keypair generation, SSH keypair initialization, and Git signing setup.</p>
          <span class="robos-app-link-badge">Explore Guide ↗</span>
        </div>
      </a>
      <div class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/git-login-manager.svg' | relative_url }}" width="38" height="38" alt="Git Login Manager icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">Git Login Manager</div>
          <span class="robos-app-pkg">robos:git-login-manager</span>
          <p class="robos-app-desc">GitHub, GitLab, and Gitea OAuth 2.0 authenticator and Personal Access Token (PAT) manager.</p>
        </div>
      </div>
      <div class="robos-app-card">
        <div class="robos-app-icon-wrap">
          <img src="{{ '/assets/images/icons/robos-onboarding.svg' | relative_url }}" width="38" height="38" alt="RobOS Setup Wizard icon" loading="lazy">
        </div>
        <div class="robos-app-body">
          <div class="robos-app-name">RobOS Setup Wizard</div>
          <span class="robos-app-pkg">robos:robos-onboarding</span>
          <p class="robos-app-desc">First-boot developer workstation initialization, dotfiles synchronization, and profile setup.</p>
        </div>
      </div>
    </div>
  </div>
</div>

---

## Detailed Guides & Architecture Walkthroughs
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## 1. Planning & Visual Architecture

### RobOS App Wizard (Greenfield & Brownfield Multi-App Scaffolding)
Scaffold brand-new applications or import existing repositories across 9 multi-app archetypes:
- **9 Supported Archetypes**: `robos:Microservice`, `robos:FrontEndApp` (`schema:WebApplication`), `robos:DesktopApp`, `robos:PCGame` (`schema:VideoGame`), `robos:MobileGame` (`schema:VideoGame`), `robos:ConsoleApp`, `robos:MobileApp`, `robos:DataPipeline`, and `robos:Library`.
- **Greenfield Scaffolding**: Automatically generates runnable `dev-setup.sh`, Spotify Backstage `catalog-info.yaml`, CI/CD pipelines, Spectral-linted API contracts, and dual-state Knowledge Graph registrations.
- **Brownfield Codebase Ingestion**: Automatically scans existing directories, infers tech stacks (`package.json`, `pom.xml`, `go.mod`, `Cargo.toml`, `pyproject.toml`), and maps components into `.robos/packages.yaml` without manual YAML editing.
- **Dedicated Guides**: [Develop a New App]({{ '/new-app-wizard.html' | relative_url }}) and [Import Existing Apps]({{ '/app-import-wizard.html' | relative_url }}).
![RobOS App Wizard]({{ '/assets/images/screenshots/new-app-archetypes_frame.png' | relative_url }})

### RobOS Group Manager (Teams, Organizations & Enterprise Directory Sync)
Manage organizations, squads, enterprise directory sync, and user access control:
- **Enterprise Directory Sync**: Connects to Okta, Microsoft Entra ID (Azure AD), Google Workspace, and OpenLDAP via SCIM 2.0 and LDAP protocols.
- **Greenfield Startup Bootstrap**: Spin up brand-new tenants from scratch with root administrator setup, token vaulting, and automated VCS org provisioning.
- **Team Topologies**: First-class support for stream-aligned, platform, enablement, and complicated-subsystem squads saved to `.robos/teams.yaml`.
- **Active Identity Card**: Displays active signed-in user, roles, permissions, and company tenant status at all times.
- **Dedicated Guides**: [Existing Company Setup]({{ '/existing-company-setup.html' | relative_url }}) and [New Company Setup]({{ '/new-company-setup.html' | relative_url }}).
![RobOS Group Manager]({{ '/assets/images/screenshots/existing-company-directory-sync_frame.png' | relative_url }})

### System Topology & Visual Architecture Studio
A visual whiteboard for mapping your entire engineering architecture:
- **3-Level Visual Zoom**: Zoom from high-level personas (**Level 1: System Context**), down to microservices and databases (**Level 2: Containers**), to internal code modules (**Level 3: Components**).
- **Service Catalog Discovery**: Reads existing Spotify Backstage `catalog-info.yaml` files across Git repositories to automatically populate service ownership and dependencies.
- **Automatic Cloud Manifests**: Adding a new database or service to the canvas automatically creates ready-to-deploy Kubernetes YAML manifests and Helm charts.
![System Topology]({{ '/assets/images/screenshots/topology-db-c4_polyglot_frame.png' | relative_url }})

### Task Planner & Project Breakdown
Tell the AI what you want to build in plain English, or choose from a library of **interactive task templates** spanning Services & APIs, Front-End Applications, Game Development (Godot, Unity, Unreal), Mobile Apps (React Native, Flutter), Libraries, Knowledge Graph & Schemas, Cloud Infrastructure, and DevOps. Each template provides an interactive web form tailored to the target domain, and developers can author and persist custom task templates in `~/.config/robos/task-planner/custom-templates/`. RobOS breaks goals down into structured Epics and child stories, synchronizing tickets to GitHub Issues, Gitea, or Jira.
![Task Planner]({{ '/assets/images/screenshots/acme-petshop-step1-dag_frame.png' | relative_url }})

### Contract Studio & Live API Mocks
Design and validate how your services talk to each other before writing code. Supports REST APIs (OpenAPI 3.1) and event streams (AsyncAPI) with live mock servers so frontend teams can build user interfaces immediately.
![Contract Studio]({{ '/assets/images/screenshots/acme-petshop-step3-studio_open_frame.png' | relative_url }})

### Git Projects Multi-Repo Hub
Connect all your company's Git repositories in one place. RobOS securely injects environment passwords from your encrypted vault and writes one-click setup scripts (`dev-setup.sh`) to get code building in seconds.
![Git Projects]({{ '/assets/images/screenshots/acme-petshop-step4-projects_open_frame.png' | relative_url }})

### Dev Central (Developer Command Center)
Your daily engineering cockpit and mission control hub for the entire Software Delivery Lifecycle (SDLC). Dev Central aggregates in-flight tasks, sprint commitments, pull request health, reviewer queues, blocker early warnings, and automated daily standup synthesis into a single high-density desktop cockpit:

- **Executive 5-Metric KPI Ribbon**: Real-time visibility into assigned tasks, open pull requests, pending code reviews, active blocker radar alerts, and aggregate CI/CD pipeline health percentage.
- **Context-Aware View Tabs**: Fast switching between unified Mission Control, dedicated Tasks & Sprint, Pull Requests & CI, Blocker Radar, AI Standup, and Live Desktop Activity logs.
- **Lifecycle Status Chips & Fuzzy Command Search (`⌘K`)**: Instant status filtering (`All`, `In Progress`, `Review`, `Todo`) and millisecond-fast fuzzy search across work items, branch names, and microservices.
- **Automated 3-Column AI Standup Generator**: Analyzes recently merged PRs (Yesterday), assigned sprint work (Today), and detected pipeline roadblocks (Blockers) with single-click clipboard export for daily team standup syncs.
- **Blocker Early Warning Radar**: Proactive automated detection of failed CI pipelines, stale code review requests (>24h), and stagnant work items (>3d) before they derail sprint velocity.
- **Interactive Proof-of-Work Review & 1-Click Production Merge**: High-fidelity verification modal with 4 automated quality gates (Pact consumer contracts, W3C SHACL shape conformance, Spectral OpenAPI 3.1 linting, E2E regressions), 1080p recorded video walkthrough with interactive chapter bookmarks, side-by-side diffs, and 1-click merge to `main` promoting feature state to Production Reality.

| Executive Mission Control Dashboard (`dev-central-overview.png`) | Interactive Proof-of-Work Review & Quality Gates (`dev-central-review-modal.png`) |
|:---:|:---:|
| ![Dev Central Overview]({{ '/assets/images/screenshots/dev-central-overview.png' | relative_url }}) | ![Interactive Proof-of-Work Review Modal]({{ '/assets/images/screenshots/dev-central-review-modal.png' | relative_url }}) |

| My Tasks & Sprint with Lifecycle Filter Chips (`dev-central-tasks-filtered.png`) | Pull Requests & CI Pipeline Health (`dev-central-prs-view.png`) |
|:---:|:---:|
| ![Tasks & Lifecycle Filter Chips]({{ '/assets/images/screenshots/dev-central-tasks-filtered.png' | relative_url }}) | ![Pull Requests & CI View]({{ '/assets/images/screenshots/dev-central-prs-view.png' | relative_url }}) |

| Blocker Early-Warning Radar (`dev-central-blocker-radar.png`) | Real-Time Fuzzy Command Search (`dev-central-search.png`) |
|:---:|:---:|
| ![Blocker Radar]({{ '/assets/images/screenshots/dev-central-blocker-radar.png' | relative_url }}) | ![Fuzzy Command Search]({{ '/assets/images/screenshots/dev-central-search.png' | relative_url }}) |

| Automated 3-Column AI Standup Notes (`dev-central-standup.png`) | 1-Click Sign-Off & Production Reality Merge (`dev-central-merged-reality.png`) |
|:---:|:---:|
| ![AI Standup Summary]({{ '/assets/images/screenshots/dev-central-standup.png' | relative_url }}) | ![Production Reality Merged]({{ '/assets/images/screenshots/dev-central-merged-reality.png' | relative_url }}) |

---

## 2. Databases & API Testing Suite

### RobOS Relational DB Manager (PostgreSQL, MySQL, Oracle)
A fast database manager (inspired by DBeaver & DataGrip) with live table schema browsing, interactive data grids, multi-tab SQL console queries, and automated database creation (DDL) scripts.
![Relational DB Manager]({{ '/assets/images/screenshots/dev-tools-table_data_grid_frame.png' | relative_url }})

### RobOS NoSQL DB Manager (MongoDB & Redis)
Inspect JSON documents, query collections, and explore Redis key-value stores with live TTL expiration monitoring.
![NoSQL DB Manager]({{ '/assets/images/screenshots/dev-tools-db_manager_overview_frame.png' | relative_url }})

### RobOS REST API Client
A Git-backed API testing client storing plain-text `.bru` request files directly in your Git repository with automated request synthesis from OpenAPI contracts.
![REST API Client]({{ '/assets/images/screenshots/acme-petshop-step11-collections_tree_frame.png' | relative_url }})

### RobOS REST Collection Runner
Run entire suites of API requests in sequence, benchmark endpoint latency, test edge cases, and enforce quality gates for pull requests.
![REST Collection Runner]({{ '/assets/images/screenshots/acme-petshop-step12-runner_view_frame.png' | relative_url }})

### RobOS Data Sources Explorer
Explore all your company's databases, AWS S3 cloud storage buckets, and Kafka streaming topics with live connection testing and schema viewers.
![Data Sources]({{ '/assets/images/screenshots/data-sources-postgres_overview_frame.png' | relative_url }})

### RobOS Remote Execution Studio
Eliminate the friction, operational overhead, and vendor lock-in of distributed build and caching infrastructure. Remote Execution Studio is a native developer OS control room built entirely on the open-source **Remote Execution API standard (REAPI v2)** (`build.bazel.remote.execution.v2`):
- **Zero-Friction Client Synthesis**: Push-button generation of production-ready `.bazelrc` and `.buckconfig` files targeting active cluster endpoints with remote caching, byte stream upload, and fine-grained concurrency control.
- **Live REAPI Endpoint Health Probes**: Real-time gRPC connectivity and latency checks against remote execution workers, Content Addressable Storage (CAS), and Action Cache (AC).
- **Modular Buildbarn & NativeLink Configuration**: Deep operational management of modular Go/Rust microservices (`bb-storage`, `bb-scheduler`, `bb-worker`, `bb-runner`, `bb-browser`) with zero vendor lock-in.
- **Knowledge Graph & SHACL Conformance**: First-class `robos:RemoteExecutionCluster` OSLC JSON-LD topology nodes with automated structural constraint validation.
- 👉 Read the complete guide: **[Remote Execution Studio & REAPI v2 Architecture]({{ site.baseurl }}{% link big-wins/remote-execution-studio.md %})** and **[E2E Walkthrough]({{ site.baseurl }}{% link walkthroughs.md %}#remote-execution-studio-distributed-reapi-v2-build-clusters--client-synthesis)**.

| REAPI Cluster Overview & Worker Pools | Live Endpoint Connectivity & Latency Probe |
|:---:|:---:|
| ![Cluster Overview]({{ '/assets/images/screenshots/re-studio-overview_frame.png' | relative_url }}) | ![Endpoint Health Probe]({{ '/assets/images/screenshots/re-studio-probe_frame.png' | relative_url }}) |

| Bazel Client Config Generator (`.bazelrc`) | Buck2 Client Config Generator (`.buckconfig`) |
|:---:|:---:|
| ![Bazel Config Generator]({{ '/assets/images/screenshots/re-studio-bazel_frame.png' | relative_url }}) | ![Buck2 Config Generator]({{ '/assets/images/screenshots/re-studio-buck2_frame.png' | relative_url }}) |

| Modular Buildbarn Microservice Specs (`bb-storage.json`) | Knowledge Graph & SHACL Validation Badge |
|:---:|:---:|
| ![Buildbarn Provider Config]({{ '/assets/images/screenshots/re-studio-buildbarn_frame.png' | relative_url }}) | ![Knowledge Graph SHACL Conformance]({{ '/assets/images/screenshots/re-studio-kgraph_frame.png' | relative_url }}) |

---

## 3. Code Review, Testing & Cloud Infrastructure

### RobOS Agent-Generated Code Review Platform & PR Review Theater
Autonomous AI-driven code review, audit hub, and 6-stage Review Theater for pull requests. Analyzes pull requests created by AI agents or human developers, provides side-by-side color-coded diffs, runs automatic security audits, tests OpenAPI contract compatibility, generates on-demand masterclasses with verified Knowledge Graph completion certificates, proves runtime correctness with 1080p narrated video proof-of-work, and connects directly with your preferred IDE via native plugins:
- **6-Stage PR Review Theater**: Interactive masterclasses, Reviewer Knowledge Check quiz, living architecture deltas, in-app file diff viewer, IDE branch bridge, and video proof-of-work with atomic merge gates. Read the full guide in [PR Review Theater & Verification]({{ site.baseurl }}{% link pr-review-theater.md %}).
- **IntelliJ IDEA Pull Request Review Plugin**: Communicates over RobOS port `63343` IPC bridge and native JetBrains CLI integration to jump straight to modified files, set live breakpoints at change sites, and launch JetBrains' native Pull Request review tool window.
- **VS Code Pull Request Review Plugin**: Deeply integrates with the industry-standard `GitHub Pull Requests and Issues` extension (`vscode://github.vscode-pull-request-github/open-pr`) to review diffs, leave inline line comments, and approve PRs right inside Visual Studio Code.
![PR Review Theater]({{ '/assets/images/screenshots/pr-review-theater-02-pr-detail.png' | relative_url }})

### RobOS eLearning Hub & Certification Player
Standalone interactive developer training player and hands-on lab environment for the enterprise SDLC Knowledge Graph (`packages/robos-elearning`). Explore application courses, run local code labs in ephemeral sandboxes, and inspect cryptographically verified completion certificates. Read more in [PR Review Theater & eLearning Hub]({{ site.baseurl }}{% link pr-review-theater.md %}#standalone-robos-elearning-player-hub).
![RobOS eLearning Hub]({{ '/assets/images/screenshots/robos-elearning-hub-player.png' | relative_url }})

### Kube Studio & Cloud Infrastructure Navigator
A visual control room for Kubernetes clusters (local Kind clusters, AWS EKS, Google Cloud GKE, Azure AKS). View running containers, inspect Helm releases, check ArgoCD GitOps status, and stream live server logs.
![Kube Studio]({{ '/assets/images/screenshots/topology-db-datasource_synthesized_frame.png' | relative_url }})

### Deploy Tracker
Track your deployments across Development, Staging, and Production environments in real time with canary rollouts, team health metrics (DORA metrics), and one-click rollbacks.
![Deploy Tracker]({{ '/assets/images/screenshots/acme-petshop-step7-kpis_frame.png' | relative_url }})

### CI Monitor
Real-time continuous integration pipeline monitoring with automated AI root-cause explanations and one-click failure reruns.
![CI Monitor]({{ '/assets/images/screenshots/acme-petshop-step6-ci_checks_frame.png' | relative_url }})

---

## 4. AI Assistants & System Tools

### Agent Chat & VS Code-Style Conversational Assistant
A native conversational interface inspired by VS Code Copilot Chat and Cursor, engineered specifically for autonomous SDLC workflows:
- **Multi-Model & Mode Switching**: Seamlessly switch between Claude 3.7 Sonnet, OpenAI o3-mini, Gemini 2.5 Flash, Antigravity Harness, and local Ollama, with dedicated interaction modes (`Agent`, `Chat`, `Edit`, `Review`).
- **Live Tool Execution Traces**: View real-time MCP tool invocations and results across RobOS apps (System Topology Studio, Relational DB Manager, REST API Client, Kube Studio, PR Review Theater).
- **Code Block Actions**: Syntax-highlighted code snippets with one-click `Copy` and `Insert` directly into your workspace files.
- **Global AI Prompt Pop-up Integration**: Click `Pop Out Prompt` or press `Ctrl+Space` to summon the lightweight floating RobOS Agent Prompt directly over any running application to issue quick commands that drive background tools.

![Agent Chat]({{ '/assets/images/screenshots/agent-chat.png' | relative_url }})

### Agents Manager & Universal AI Tool Connections (MCP)
Manage multiple AI coding agents (Claude Code, Google Antigravity, GitHub Copilot, Gemini) with secure Model Context Protocol (MCP) tool authentication and OAuth login popups.
![Agents Manager]({{ '/assets/images/screenshots/agent-mcp-antigravity_servers_frame.png' | relative_url }})

### Knowledge Graph Explorer
Explore the full connected map of your software ecosystem with visual comparisons between live production (`main`) and proposed feature branches.
![Knowledge Graph]({{ '/assets/images/screenshots/robos-graph-frame_01.png' | relative_url }})

### RobOS Schema Studio & Definitive Registry
The semantic command center and ontology explorer bridging Schema.org, OASIS OSLC, and W3C standards with native developer tooling:
- **Canonical Schema.org Explorer**: Real-time browsing and fuzzy search across **1,003 classes** and **1,676 properties** directly indexed from `schemaorg-current-https.jsonld`.
- **Inheritance & Lineage Traversal**: Visual taxonomy inheritance trees (`Thing` → `CreativeWork` → `SoftwareApplication`) with full direct and inherited property tables, domain definitions, and expected range types.
- **Definitive Standards Integration**: First-class grounding in **OASIS OSLC 3.0** (Change, Requirements, Architecture, and Quality Management), **W3C Linked Open Vocabularies (LOV)**, **W3C C4 Model**, and **Cucumber Gherkin BDD**.
- **Dual-State Knowledge Graph Synthesis**: Push-button generation of dual-typed JSON-LD instances (`["robos:Microservice", "schema:SoftwareApplication"]`), W3C SHACL constraint shapes (`sh:NodeShape`), and TypeSpec 0.61 domain models with polyglot bindings (TypeScript Zod, Java 21 Record, Python Pydantic v2, Go struct).
- **Interactive JSON-LD Conformance Linter**: Built-in validation workbench verifying payloads against Schema.org types and RobOS SHACL shapes with immediate diagnostic feedback.
- **AI Agent Skill & MCP Server Integration**: Equips autonomous agents (Claude Code, Google Antigravity, Copilot CLI, Gemini) with the `schema-lookup` skill and `robos_schema_lookup`, `robos_schema_validate`, and `robos_schema_synthesize` MCP tools.
![Schema Studio]({{ '/assets/images/screenshots/schema-studio-frame_01.png' | relative_url }})

### Skills Manager & Cross-Agent AI Skills Library
Access 74+ parameterized system, Git, and Docker diagnostic commands alongside standardized cross-agent AI skills for Claude Code, OpenAI Codex, Google Antigravity, GitHub Copilot, and Gemini CLI. Read the full [RobOS Skills Guide]({{ site.baseurl }}{% link robos-skills.md %}) and [Skills Manager Desktop App Guide]({{ site.baseurl }}{% link skills/skills-manager.md %}).
![Skills Manager]({{ '/assets/images/screenshots/skills-manager-overview.png' | relative_url }})

---

## Next Steps

- **[RobOS Main Wins]({{ site.baseurl }}{% link big-wins.md %})**: Discover core architectural innovations and strategic advantages.
- **[App Development Flow]({{ site.baseurl }}{% link app-development-flow.md %})**: Follow the step-by-step developer tutorial.
- **[💡 Explore the Ideas Store on GitHub](https://github.com/nddipiazza/robos/tree/main/docs/ideas)**: View raw idea dumps, community feature proposals, and structured architecture specs.


