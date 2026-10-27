'use strict';

// Intent vocabulary, shared by catalog search. Keep aliases tied to real app
// capabilities; names, IDs, descriptions and categories are indexed as well.
const ALIASES = {
  'audio-player': 'music|songs|playlists|listen|listening|albums|artists|mp3|lyrics|dj|cast music',
  'movie-player': 'movies|films|cinema|videos|watch movies|subtitles|watchlists|cast videos|sftp movies',
  'home-speaker': 'speakers|intercom|broadcast|voice notes|soundboard|google home|music speakers',
  'auto-center': 'car|cars|vehicle|vehicles|garage|mechanic|repairs|obd|automotive|repair shop',
  'point-of-sale': 'pos|cash register|checkout|shop|retail|cafe|bar|cashier|inventory|payments|restaurant',
  household: 'budget|budgeting|money|spending|expenses|finance|bank|accounts|statements|taxes|reconciliation',
  'app-launcher': 'apps|applications|open apps|find apps|launch programs',
  'app-wizard': 'create app|build app|new app|scaffold|import repository|customize apps',
  'software-center': 'install|installer|install apps|software|programs|downloads|updates|uninstall|godot|ffmpeg|winget',
  'package-manager': 'packages|package updates|dependencies|software packages',
  'file-explorer': 'files|folders|documents|browse files|file manager',
  'git-projects': 'repositories|repos|source code|clone|git|version control|coding projects',
  'gitea-browser': 'gitea|repositories|pull requests|self hosted git',
  'git-login-manager': 'git credentials|github login|git accounts|git authentication',
  'workspace-manager': 'workspaces|project folders|open project|ide|development directories',
  'workspace-manager-mcp': 'workspace automation|workspace mcp|project tools server',
  'issue-manager': 'issues|bugs|tickets|backlog|github issues|kanban',
  'task-board': 'tasks|kanban|board|work items|todo|to do',
  'task-planner': 'planning|plan|tasks|roadmap|features|task explorer|project plan',
  'task-implementer': 'implement tasks|coding agent|build feature|agent implementation',
  'task-servers': 'jira|ticket servers|github issues settings|issue trackers',
  'task-manager-mcp': 'task automation|tasks mcp|task tools server',
  'workflow-studio': 'workflows|automation|issue lifecycle|process|pipelines',
  'automation-studio': 'automations|automate|scheduled actions|workflow automation',
  'agent-scheduler': 'schedule|cron|scheduled agents|background jobs',
  'agents-manager': 'agents|ai assistants|models|claude|copilot|codex|gemini|ollama|agent settings',
  'agent-chat': 'chat|talk to agent|ai conversation|coding assistant|ask ai',
  'agent-sidebar': 'agent sidebar|assistant panel|agent activity',
  'agent-autoconfig': 'agent configuration|configure agents|agent setup',
  'desktop-agents': 'agent activity|agent sessions|running agents|agent viewer',
  'ai-prompt': 'prompt|ask ai|ai question|generate text',
  'claude-console': 'claude|anthropic|claude code|agent console',
  'context-manager': 'context|prompt context|knowledge sources|reference files|agent context',
  'skills-manager': 'skills|agent skills|plugins|extensions|agent capabilities',
  'mcp-manager': 'mcp|model context protocol|tool servers|agent integrations',
  'robos-mcp-router': 'mcp routing|tool routing|mcp servers|server connections',
  'robos-mcp-lib': 'mcp framework|server framework|mcp development',
  'robos-agent-session': 'agent history|sessions|conversations|session library',
  'robos-agentd': 'agent daemon|background agents|agent service',
  'robos-profiled': 'agent profiles|profile daemon|agent profile service',
  'dev-tools-mcp': 'developer tools server|development mcp|code tools server',
  'ide-bridge-mcp': 'ide automation|ide mcp|editor bridge server',
  'system-mcp': 'system automation|system mcp|desktop tools server',
  'ci-monitor-mcp': 'ci mcp|build monitoring server|pipeline tools server',
  'ekgraph-mcp': 'knowledge graph mcp|engineering graph server|graph tools server',
  'robos-cli': 'command line|terminal tools|cli|shell tools',
  'pr-review': 'code review|pull requests|pr|diff|review changes|review theater',
  'intellij-idea': 'intellij|idea|jetbrains|java ide|debugger|ide bridge',
  'ci-monitor': 'ci|builds|continuous integration|github actions|build status|test pipelines',
  'deploy-tracker': 'deployments|deploy|releases|rollouts|environments',
  'dev-central': 'daily dashboard|sprint|standup|pr health|developer dashboard|blockers',
  'dev-discussions': 'discussions|team chat|work item conversations|review discussions',
  'manager-dashboard': 'manager overview|team dashboard|team status|delivery overview',
  'desktop-dashboard': 'desktop overview|dashboard|daily overview|widgets',
  'desktop-manager': 'desktop service|window management|desktop session',
  'desktop-widgets': 'widgets|desktop widgets|status widgets',
  'desktop-customizer': 'customize desktop|appearance|theme|wallpaper|desktop layout',
  'icon-manager': 'icons|app icons|customize icons|icon library',
  'robos-preferences': 'settings|preferences|configuration|credentials settings|ai settings',
  'robos-onboarding': 'setup|first run|onboarding|setup wizard|getting started',
  'security-setup': 'security|gpg keys|ssh keys|key setup|encryption setup',
  'pass-manager': 'passwords|password manager|secrets|encrypted credentials|gpg|password store',
  'docu-vault-desktop': 'vault|secure documents|encrypted files|document security',
  'notifications': 'alerts|notifications|messages|notification history',
  'robos-toast': 'toasts|popup notifications|notification service',
  'robos-logs': 'logs|errors|troubleshooting|debug logs|system events',
  'search-index': 'file search|indexing|find files|search engine|file index',
  'data-sources': 'data connections|database explorer|data sources|schema inspector|query data',
  'db-manager': 'database|databases|sql|postgres|postgresql|mysql|sqlite|tables|sql queries|relational database',
  'nosql-manager': 'nosql|mongodb|mongo|redis|documents database|key value|database',
  'rest-client': 'api|http|rest|requests|postman|bruno|api testing|endpoints',
  'graphql-client': 'graphql|queries|mutations|graphiql|graphql api',
  'grpc-client': 'grpc|protobuf|rpc|protocol buffers|grpc api',
  'adapter-studio': 'adapters|api integrations|protocol adapters|connectors',
  'contract-studio': 'contracts|api contracts|contract testing|consumer driven tests',
  'kube-studio': 'kubernetes|k8s|containers|clusters|helm|argocd|cloud|vercel|gitops',
  'cloud-accounts': 'cloud accounts|cloud credentials|aws accounts|azure accounts|google cloud|cloud providers',
  'google-calendar': 'calendar|appointments|meetings|events|schedule events|google calendar',
  'remote-execution-studio': 'remote builds|bazel|buck2|build farm|buildbarn|nativelink|build cache',
  'report-builder': 'reports|reporting|charts|metrics|analytics',
  'robos-dashboards': 'dashboards|custom dashboards|dashboard widgets|dashboard builder|status boards',
  'robos-graph': 'knowledge graph|kgraph|graph|graph explorer|architecture|dependencies|semantic graph',
  'schema-studio': 'schemas|ontology|typespec|shacl|validation|schema registry',
  'kgraph-parse-portal': 'ingestion|parse files|extract data|tika|document parsing|graph import',
  'group-manager': 'groups|teams|organizations|company|directory sync|team topologies',
  'people-directory': 'people|contacts|coworkers|employees|directory|team members',
  'people-manager': 'people management|staff|team members|team planning',
  'topology-manager': 'topology|architecture|system map|services map|infrastructure topology',
  'robos-documentation': 'docs|documentation|manuals|guides|help|architecture docs',
  'robos-elearning': 'learning|learn|courses|training|tutorials|education|certificates',
  'crpg-game-builder-elearning': 'game development course|learn godot|rpg tutorial|game builder academy',
  'crpg-editor': 'rpg editor|game editor|campaign editor|characters|party|level design',
  'robos-tabletop': 'tabletop|games|board games|dungeons|quests|heroquest|campaigns|adventures|rpg',
  'party-game': 'party|party games|games|trivia|icebreaker|guests|friends|family|tv|ai host|survey|house party',
  'game-playthrough': 'game playthrough|dragon warrior|dragon quest|watch gameplay|game checkpoints|replay adventures',
  'robos-tv': 'smart tv|televisions|roku|webos|tizen|tv apps|pair tv|tv remote|moonlight|sunshine',
  'smart-light': 'smart lights|lighting|light bulbs|room lights|hue|color lights',
  'vpn-sandbox': 'vpn sandbox|isolated network|private browsing|network namespace|kill switch|sandbox apps',
  'vpn-servers': 'vpn servers|vpn providers|openvpn|ipvanish|vpn accounts|vpn locations',
  'tabletop-blockmap-creator': 'dungeon maps|blockmap|map calibration|board tiles|dungeon layout',
  'tabletop-quest-editor': 'quest maps|quest editor|monsters|traps|dungeon scenarios',
  'stage-demo': 'demos|walkthroughs|presentations|demo recordings',
  'voice-prompt': 'voice|speak|speech|dictation|microphone|text to speech|tts|stt|whisper',
};
const STOP = new Set(['robos', 'open', 'launch', 'start', 'find', 'show', 'please', 'the', 'my', 'a', 'an', 'to', 'of', 'and', 'for', 'with']);
const normalize = text => String(text || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const words = text => normalize(text).split(/\s+/).filter(Boolean);
const stem = word => word.length > 4 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;

function distance(a, b) {
  const rows = [Array.from({ length: b.length + 1 }, (_, i) => i)];
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(rows[i - 1][j] + 1, row[j - 1] + 1, rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j], rows[i - 2][j - 2] + 1);
    }
    rows.push(row);
  }
  return rows[a.length][b.length];
}
function termScore(term, list, weight) {
  let best = 0;
  for (const word of list) {
    if (word === term || stem(word) === stem(term)) best = Math.max(best, weight);
    else if (word.startsWith(term)) best = Math.max(best, weight * .75);
    else if (term.length >= 4 && Math.abs(word.length - term.length) <= (term.length >= 7 ? 2 : 1) && distance(term, word) <= (term.length >= 7 ? 2 : 1)) best = Math.max(best, weight * .4);
  }
  return best;
}
function createSearchIndex(apps) {
  const phrases = value => Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[;|,]/) : [];
  const index = apps.map((app, position) => {
    const id = app.id || app.appId, label = app.label || app.name || id;
    const aliases = [...(ALIASES[id] || '').split('|'), ...phrases(app.keywords), ...phrases(app.aliases)].map(normalize).filter(Boolean);
    return { id, app, position, label: normalize(label), aliases,
      fields: [[words(label), 140], [words(id), 110], [words(aliases.join(' ')), 100], [words(app.description || app.comment), 45], [words(app.category), 20]] };
  });
  return query => {
    const phrase = normalize(query), terms = words(query).filter(w => !STOP.has(w));
    if (!terms.length) return apps.slice();
    return index.map(entry => {
      const scores = terms.map(term => Math.max(...entry.fields.map(([list, weight]) => termScore(term, list, weight))));
      let score = scores.every(s => s > 0) ? scores.reduce((sum, s) => sum + s, 0) : 0;
      const alias = entry.aliases.indexOf(phrase);
      if (score) score += entry.label === phrase ? 2000 : alias >= 0 ? Math.max(1200, 1600 - alias * 20) : entry.label.startsWith(phrase) ? 1000 : 0;
      return { ...entry, score };
    }).filter(entry => entry.score > 0).sort((a, b) => b.score - a.score || a.position - b.position).map(entry => entry.app);
  };
}
module.exports = { createSearchIndex, ALIASES, normalize };
