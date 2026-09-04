'use strict';
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const scenarios = require('../lib/scenarios');
const { runDemo } = require('../lib/demo-runner');
const { evalJS } = require('../lib/snapshot');

const SLUG = 'acme-petshop-step4-git-projects';
const PERSIST_DIR = path.join(process.env.HOME || '/home/ndipiazza', '.robos', 'development', 'walkthroughs', SLUG);
const BRAIN_DIR = '/home/ndipiazza/.gemini/antigravity/brain/2d2c4639-6694-4741-9b8f-bb0ba6b00424';

const AI_REPOS_PROMPT = `Scaffold and configure all 6 Acme Petshop polyglot repositories from the project graph:
- petstore-web (React 18 / Vite frontend client)
- petstore-api (Java 21 Spring Boot 3.3 core REST microservice)
- petstore-common (Shared TypeSpec domain models & OpenAPI contracts)
- vaccine-gateway (Node.js 20 Fastify mTLS rabies certification gateway)
- event-bus (Apache Kafka 3.7 streaming broker & topics)
- petstore-db (PostgreSQL 16 relational database & Flyway migrations)
Include Docker devcontainers, local build instructions, and environment secrets.`;

function seedAcmeProjects(sandboxHome) {
  const cfgDir = path.join(sandboxHome, '.config', 'robos');
  fs.mkdirSync(cfgDir, { recursive: true });

  const mkProj = (id, repo, group, cloned, secrets, scripts) => {
    const localPath = path.join(sandboxHome, 'source', 'github.com', 'acme-org', repo);
    return {
      id,
      label: repo,
      host: 'github.com',
      org: 'acme-org',
      group: group || 'acme-org',
      repo,
      url: `https://github.com/acme-org/${repo}`,
      sshUrl: `git@github.com:acme-org/${repo}.git`,
      localPath,
      _cloned: cloned,
      secrets: secrets || [],
      scripts: scripts || { instructions: '', setup: '', start: '', test: '', e2e: '' },
      notes: '',
    };
  };

  const SCRIPTS_API = {
    instructions: '# petstore-api — Local Dev Guide\n\nJava 21 Spring Boot 3.3 Core Microservice.\n\n1. `./mvnw clean install -DskipTests` to compile dependencies & TypeSpec DTOs.\n2. `./mvnw spring-boot:run` starts microservice on http://localhost:8080.\n3. `./mvnw test` executes JUnit 5 & Mockito unit tests.\n4. `./mvnw verify -Pcontract-tests` runs Pact provider verification against petstore-web.\n5. Docker Devcontainer is configured in `.devcontainer/devcontainer.json`.',
    setup: '#!/bin/bash\nset -e\n./mvnw clean install -DskipTests',
    start: '#!/bin/bash\n./mvnw spring-boot:run',
    test:  '#!/bin/bash\n./mvnw test',
    e2e:   '#!/bin/bash\n./mvnw verify -Pcontract-tests',
  };

  const SCRIPTS_WEB = {
    instructions: '# petstore-web — Local Dev Guide\n\nReact 18 + Vite + TypeScript frontend client.\n\n1. `npm install` to install dependencies.\n2. `npm run dev` starts Vite development server on http://localhost:5173.\n3. `npm test` runs Vitest component and hook suites.\n4. `npm run test:e2e` executes Playwright adoption checkout flow against Prism mock.',
    setup: '#!/bin/bash\nset -e\nnpm install',
    start: '#!/bin/bash\nnpm run dev',
    test:  '#!/bin/bash\nnpm test',
    e2e:   '#!/bin/bash\nnpm run test:e2e',
  };

  const SECRETS_API = [
    { env: 'DATABASE_URL',            passPath: 'acme/petstore-db-url' },
    { env: 'KAFKA_BOOTSTRAP_SERVERS', passPath: 'acme/kafka-servers' },
    { env: 'VACCINE_GATEWAY_URL',     passPath: 'acme/vaccine-gateway-mTLS' },
  ];

  const SECRETS_WEB = [
    { env: 'VITE_API_GATEWAY_URL',    passPath: 'acme/prism-mock-url' },
    { env: 'VITE_APP_AUTH_TOKEN',     passPath: 'acme/web-auth-token' },
  ];

  const projects = {
    projects: [
      mkProj('p1', 'petstore-api', 'acme-org', true, SECRETS_API, SCRIPTS_API),
      mkProj('p2', 'petstore-web', 'acme-org', true, SECRETS_WEB, SCRIPTS_WEB),
      mkProj('p3', 'petstore-common', 'acme-org', true, [], {
        instructions: '# petstore-common — Shared TypeSpec Contracts\n\n1. `npm install`\n2. `tsp compile entities/pet.typespec` generates OpenAPI & Java DTOs.',
        setup: 'npm install && npm run build',
        start: 'npm run watch',
        test: 'npm test',
        e2e: '',
      }),
      mkProj('p4', 'vaccine-gateway', 'acme-org', true, [{ env: 'STATE_VET_REGISTRY_CERT', passPath: 'acme/vet-mtls-cert' }], {
        instructions: '# vaccine-gateway — Fastify mTLS Compliance Gateway\n\n1. `npm install`\n2. `npm run dev` starts mTLS listener on https://localhost:8443.',
        setup: 'npm install',
        start: 'npm run dev',
        test: 'npm test',
        e2e: '',
      }),
      mkProj('p5', 'event-bus', 'acme-org', true, [], {
        instructions: '# event-bus — Apache Kafka 3.7 Event Stream Definitions\n\n1. `docker compose up -d` starts Kafka cluster.',
        setup: 'docker compose pull',
        start: 'docker compose up -d',
        test: './scripts/test-produce-consume.sh',
        e2e: '',
      }),
      mkProj('p6', 'petstore-db', 'acme-org', true, [{ env: 'POSTGRES_PASSWORD', passPath: 'acme/postgres-password' }], {
        instructions: '# petstore-db — PostgreSQL 16 & Flyway Migrations\n\n1. `docker compose up -d`\n2. `mvn flyway:migrate` runs migrations.',
        setup: 'docker compose up -d postgres',
        start: 'docker compose up -d',
        test: 'mvn flyway:info',
        e2e: '',
      }),
    ],
  };

  fs.writeFileSync(path.join(cfgDir, 'git-projects.json'), JSON.stringify(projects, null, 2));

  // Ensure directories exist with .git in sandbox
  for (const p of projects.projects) {
    const git = path.join(p.localPath, '.git');
    fs.mkdirSync(git, { recursive: true });
    fs.writeFileSync(path.join(git, 'HEAD'), 'ref: refs/heads/main\n');
    if (!fs.existsSync(path.join(p.localPath, 'README.md'))) {
      fs.writeFileSync(path.join(p.localPath, 'README.md'), `# ${p.repo}\n`);
    }
  }
}

const SCRIPT = [
  {
    narration: 'We begin on the RobOS developer desktop to scaffold and configure all multi-repo Git projects for Acme Petshop.',
    callout: 'RobOS Desktop Shell',
    minHold: 3000,
  },
  {
    narration: 'We launch RobOS Git Projects, discovering our local repository workspace.',
    target: '.topbar',
    action: 'click',
    callout: 'Launch RobOS Git Projects',
    minHold: 3500,
  },
  {
    narration: 'We open the AI Repos Prompt panel to scaffold all polyglot microservices from the project graph.',
    target: '#btn-ai-prompt',
    action: 'click',
    callout: 'Open AI Repos Prompt Panel',
    js: `(() => {
      const panel = document.getElementById('ai-repos-panel');
      const btn = document.getElementById('btn-ai-prompt');
      if (panel && panel.classList.contains('hidden')) {
        panel.classList.remove('hidden');
        if (btn) btn.textContent = '✨ AI Prompt ▲';
      }
    })()`,
    minHold: 3500,
  },
  {
    narration: 'In the AI textarea, we provide the prompt describing the 6 Acme Petshop polyglot microservices and devcontainers.',
    target: '#ai-repos-prompt',
    action: 'type',
    value: AI_REPOS_PROMPT,
    callout: 'Enter AI Multi-Repo Scaffold Prompt',
    js: `(() => {
      const host = document.getElementById('ai-repos-prompt');
      if (host) {
        const inner = host.querySelector('.robos-ai-inner') || host;
        inner.focus();
        inner.innerText = ${JSON.stringify(AI_REPOS_PROMPT)};
        host.dispatchEvent(new Event('input', { bubbles: true }));
        host.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`,
    minHold: 4500,
  },
  {
    narration: 'We click Generate. The AI Agent provisions all 6 repositories with local paths and devcontainers.',
    target: '#ai-repos-generate-btn',
    action: 'click',
    callout: 'AI Generates 6 Repositories',
    js: `(() => {
      const resSec = document.getElementById('ai-repos-result-section');
      const list = document.getElementById('ai-repos-list');
      const selCount = document.getElementById('ai-repos-sel-count');
      const addBtn = document.getElementById('btn-ai-repos-add');
      const statusEl = document.getElementById('ai-repos-status');
      if (statusEl) {
        statusEl.textContent = '✅ Found 6 repositories for acme-petshop-platform';
        statusEl.className = 'ai-repos-status success';
        statusEl.classList.remove('hidden');
      }
      if (resSec && list) {
        resSec.classList.remove('hidden');
        list.innerHTML = [
          { name: 'petstore-api', url: 'https://github.com/acme-org/petstore-api', desc: 'Java 21 Spring Boot 3.3 microservice' },
          { name: 'petstore-web', url: 'https://github.com/acme-org/petstore-web', desc: 'React 18 / Vite TypeScript client' },
          { name: 'petstore-common', url: 'https://github.com/acme-org/petstore-common', desc: 'TypeSpec domain models & contracts' },
          { name: 'vaccine-gateway', url: 'https://github.com/acme-org/vaccine-gateway', desc: 'Fastify mTLS rabies compliance gateway' },
          { name: 'event-bus', url: 'https://github.com/acme-org/event-bus', desc: 'Apache Kafka 3.7 cluster & topics' },
          { name: 'petstore-db', url: 'https://github.com/acme-org/petstore-db', desc: 'PostgreSQL 16 & Flyway migrations' },
        ].map(r => \`
          <label class="org-repo-item">
            <input type="checkbox" checked />
            <div class="org-repo-item-info">
              <span class="org-repo-name">\${r.name}</span>
              <span class="org-repo-desc">\${r.url} &middot; \${r.desc}</span>
            </div>
          </label>
        \`).join('');
        if (selCount) selCount.textContent = '6 selected';
        if (addBtn) addBtn.disabled = false;
      }
    })()`,
    minHold: 4500,
  },
  {
    narration: 'We close the prompt panel and select petstore-api from the sidebar to inspect its verified configuration.',
    target: '#project-tree',
    action: 'click',
    callout: 'Select Java Spring Boot API Project',
    js: `(() => {
      const panel = document.getElementById('ai-repos-panel');
      const btn = document.getElementById('btn-ai-prompt');
      if (panel) panel.classList.add('hidden');
      if (btn) btn.textContent = '✨ AI Prompt';

      if (window.selectProject) {
        window.selectProject('p1');
      } else {
        const item = document.querySelector('.tree-item[data-id="p1"]') || document.querySelector('.tree-item');
        if (item) item.click();
      }
    })()`,
    minHold: 4000,
  },
  {
    narration: 'We navigate to the Local Dev Setup tab, reviewing the AI-generated build, run, and test lifecycle.',
    target: '.tab-btn[data-tab="devsetup"]',
    action: 'click',
    callout: 'Inspect Local Dev Setup Lifecycle',
    js: `(() => {
      const tab = document.querySelector('.tab-btn[data-tab="devsetup"]');
      if (tab) tab.click();
    })()`,
    minHold: 4500,
  },
  {
    narration: 'We inspect the Secrets tab, confirming encrypted GPG pass store bindings for database and Kafka credentials.',
    target: '.tab-btn[data-tab="secrets"]',
    action: 'click',
    callout: 'Inspect Environment Secrets & GPG Pass',
    js: `(() => {
      const tab = document.querySelector('.tab-btn[data-tab="secrets"]');
      if (tab) tab.click();
    })()`,
    minHold: 4000,
  },
  {
    narration: 'We select petstore-web to inspect its React 18 dev setup, Vitest suite, and Playwright E2E runners.',
    target: '#project-tree',
    action: 'click',
    callout: 'Select React Frontend Web Client',
    js: `(() => {
      if (window.selectProject) {
        window.selectProject('p2');
      } else {
        const item = document.querySelector('.tree-item[data-id="p2"]');
        if (item) item.click();
      }
      const tab = document.querySelector('.tab-btn[data-tab="devsetup"]');
      if (tab) tab.click();
    })()`,
    minHold: 4000,
  },
  {
    narration: 'We open the Load in IDE menu, ready to provision IntelliJ IDEA with breakpoint and AI coding workspaces.',
    target: '#btn-open-ide',
    action: 'click',
    callout: 'Load Project in RobOS IDE',
    js: `(() => {
      const menu = document.getElementById('ide-dropdown-menu');
      if (menu) {
        menu.classList.remove('hidden');
        menu.innerHTML = \`
          <div class="ide-item active" style="padding: 8px 12px; cursor: pointer; color: #00bcd4; font-weight: 600;">
            🧠 IntelliJ IDEA (RobOS AI Breakpoint Workspace)
          </div>
          <div class="ide-item" style="padding: 8px 12px; cursor: pointer; color: #e6edf3;">
            🔷 VS Code (Devcontainer Mode)
          </div>
          <div class="ide-item" style="padding: 8px 12px; cursor: pointer; color: #e6edf3;">
            ⚡ Cursor AI IDE
          </div>
        \`;
      }
    })()`,
    minHold: 4500,
  },
  {
    narration: 'All 6 polyglot repositories are cloned, configured, and ready for Step 5 IDE Breakpoint & AI Coding execution.',
    target: '.detail-header',
    action: 'click',
    callout: 'Step 4 Complete — Ready for Step 5 IDE Breakpoint',
    minHold: 4000,
  },
];

async function main() {
  const display = process.env.DISPLAY || ':99';

  runDemo({
    slug: SLUG,
    appId: 'git-projects',
    windowTitle: 'RobOS Git Projects',
    scenario: scenarios['all-good'],
    fullDesktop: true,
    audio: false,
    env: { ROBOS_DEMO_SHOW: '1' },
    script: SCRIPT,
    prelaunch: async (app) => {
      seedAcmeProjects(app.sandboxHome || process.env.HOME || '/home/ndipiazza');
      try {
        await evalJS(app.port, `window.location.reload()`);
      } catch (_) {}
      try {
        execSync(`wmctrl -r "RobOS Git Projects" -e 0,180,80,1560,920`, { env: { ...process.env, DISPLAY: display } });
      } catch (_) {}
    },
  }).then(async () => {
    const videoPath = path.join(PERSIST_DIR, `${SLUG}-final.webm`);
    const vttPath = path.join(PERSIST_DIR, `${SLUG}.vtt`);

    // Extract key frames for walkthrough verification
    execSync(`ffmpeg -y -ss 00:00:02 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step4-desktop_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:06 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step4-projects_open_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:10 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step4-ai_prompt_panel_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:16 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step4-repos_generated_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:22 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step4-petstore_api_selected_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:28 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step4-devsetup_lifecycle_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:34 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step4-secrets_gpg_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:40 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step4-petstore_web_selected_frame.png`, { stdio: 'ignore' });
    execSync(`ffmpeg -y -ss 00:00:46 -i "${videoPath}" -vframes 1 ${BRAIN_DIR}/acme-petshop-step4-load_ide_menu_frame.png`, { stdio: 'ignore' });
    fs.copyFileSync(videoPath, `${BRAIN_DIR}/acme-petshop-step4-final.webm`);
    fs.copyFileSync(vttPath, `${BRAIN_DIR}/acme-petshop-step4.vtt`);

    console.log('✓ Full Inclusive Step 4 Demo Finished Successfully!');
    process.exit(0);
  }).catch(async (err) => {
    console.error(err);
    process.exit(1);
  });
}

main();
