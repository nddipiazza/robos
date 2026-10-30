'use strict';

/**
 * What RobOS Config Sync copies, what it never copies, and the share templates.
 *
 * Paths are relative to one of two roots and always use forward slashes:
 *   config/...  → ~/.config/robos/...
 *   robos/...   → ~/.robos/...
 *
 * A file belongs to the first category whose `include` glob matches it. Files that
 * match no category fall into `other`, so a new app's settings are backed up without
 * anyone remembering to list them here. Files that match `EXCLUDE` are never copied.
 */

const CATEGORIES = [
  {
    id: 'preferences',
    label: 'Preferences',
    description: 'RobOS Preferences, the active coding agent, voice prompts and notification preferences.',
    include: [
      'config/settings.json', 'config/preferences.json', 'config/ai-provider.json',
      'config/voice-prompt-prefs.json', 'config/voice-prompts.json', 'config/notification-prefs.json',
      'config/desktop-pinned.json', 'config/widgets.json', 'config/icon-registry.json',
      'config/desktop-customizer/**', 'config/file-explorer-nav.json',
    ],
    shareable: true,
  },
  {
    id: 'profile',
    label: 'Your profile',
    description: 'Your RobOS identity (name, email, role) and onboarding state. Backed up, never shared.',
    include: ['config/identity.json', 'config/onboarding-completed.json', 'config/company.json'],
    shareable: false,
  },
  {
    id: 'cloud-accounts',
    label: 'Cloud accounts & data sources',
    description: 'Which Google Drive, OneDrive, Dropbox, S3, SFTP and database sources you use. Sign-in tokens are removed; each machine signs in once.',
    include: ['config/cloud-accounts.json', 'config/data-sources.json', 'config/cloud-folders.json'],
    shareable: false,
  },
  {
    id: 'movie-library',
    label: 'Movie Player library',
    description: 'Movie folders, playlists, watch history and the library index.',
    include: [
      'config/movie-folders.json', 'config/movie-playlists.json', 'config/movie-track-stats.json',
      'config/movie-library.json', 'config/movie-cache-settings.json', 'config/movie-subtitles/**',
      'config/movie-player/**',
    ],
    shareable: true,
    shareExclude: ['config/movie-track-stats.json'],
  },
  {
    id: 'audio-library',
    label: 'Audio Player library',
    description: 'Music folders, playlists, play counts, lyrics and the library index.',
    include: [
      'config/audio-folders.json', 'config/audio-playlists.json', 'config/audio-track-stats.json',
      'config/audio-library.json', 'config/audio-cache-settings.json', 'config/audio-lyrics/**',
    ],
    shareable: true,
    shareExclude: ['config/audio-track-stats.json'],
  },
  {
    id: 'private-network',
    label: 'Private Network & App Mesh',
    description: 'Your private network name, peers and shared apps. The network join secret is only included in an encrypted share when you tick "Include the network join secret".',
    include: ['config/app-mesh/**'],
    shareable: true,
    // Fields that may travel inside an encrypted share when the publisher opts in.
    sealable: ['networkSecret'],
  },
  {
    id: 'smart-home',
    label: 'Smart home & TVs',
    description: 'Smart lights and scenes, home speakers and schedules, Smart TV Studio and dashboards.',
    include: [
      'config/smart-lights.json', 'config/home-speakers.json', 'config/speaker-schedules.json',
      'config/tv-studio.json', 'config/dashboards.json',
    ],
    shareable: true,
  },
  {
    id: 'developer',
    label: 'Developer tools',
    description: 'Git projects, KGraph repositories, MCP servers, database connections, task servers, CI and REST collections. Passwords and tokens are removed.',
    include: [
      'config/git-projects.json', 'config/git-projects/**', 'config/kgraph-repos.json', 'config/mcp/**',
      'config/mcp-config.json', 'config/agent-mcp-servers.json', 'config/db-manager-connections.json',
      'config/nosql-connections.json', 'config/remote-execution.json', 'config/context-sources.json',
      'config/ci/**', 'config/tasks/**', 'config/workspaces.json', 'config/workspaces/**',
      'config/devtools/**', 'config/ekgraph/**', 'config/search-indexes.json', 'config/event-rules.json',
      'config/scheduled-jobs.json', 'config/task-planner/**', 'config/plans/**',
    ],
    shareable: true,
  },
  {
    id: 'agents',
    label: 'Agents & skills',
    description: 'Agent personas, skills, skill packs and harness routing.',
    include: [
      'config/agent-personas.json', 'config/skills.json', 'config/skill-packs/**',
      'config/harnessrouter/**', 'config/action-plugins/**',
    ],
    shareable: true,
  },
  {
    id: 'team',
    label: 'Team & organization',
    description: 'Groups, people directory settings and team topology.',
    include: ['config/groups/**', 'config/people/**'],
    shareable: true,
  },
  {
    id: 'kgraph',
    label: 'Knowledge Graph workspace',
    description: 'Your KGraph packages (~/.robos/kgraphs), the aggregated graph, eLearning and project packages.',
    include: [
      'robos/kgraphs/**', 'robos/knowledge-graph.jsonld', 'robos/kgraph.yaml', 'robos/packages.yaml',
      'robos/elearning.yaml', 'robos/projects/**', 'robos/config/**',
    ],
    shareable: true,
  },
  {
    id: 'business',
    label: 'Business apps',
    description: 'Point of Sale, Auto Center and Household settings.',
    include: ['config/point-of-sale/**', 'config/auto-center/**', 'config/household/**', 'config/reports/**'],
    shareable: true,
  },
  {
    id: 'games',
    label: 'Games',
    description: 'Tabletop saves and Party Game shows.',
    include: ['config/tabletop-saves/**', 'config/party-game/**'],
    shareable: true,
  },
  {
    id: 'other',
    label: 'Other app settings',
    description: 'Settings from apps not listed above. Backed up so nothing is missed; not offered for sharing.',
    include: ['**'],
    shareable: false,
  },
];

/**
 * Never copied anywhere: caches, logs, sockets, secrets, machine identity and the sync
 * engine's own state. Matching is on the root-relative path.
 */
const EXCLUDE = [
  'config/config-sync/**', 'config/open-requests/**',
  'config/electron/**', 'config/logs/**', 'config/voice-cache/**', 'config/search-index/**',
  'config/tv-packages/**', 'config/tv-studio-packages/**', 'config/agent-sessions/**', 'config/agentd/**',
  'config/profiled/**', 'config/ovpn/**', 'config/vectors/**', 'config/events/**', 'config/event-log/**',
  'config/job-history/**', 'config/desktop-snapshots/**', 'config/exports/**', 'config/stage-demos/**',
  'config/store/**', 'config/system/**', 'config/ide/**', 'config/active-issue/**', 'config/journal/**',
  'config/time-tracking/**', 'config/desktops/**', 'config/workspace-states/**',
  // Machine identity: the mesh private key and live invite belong to this machine only.
  'config/app-mesh/identity.json', 'config/app-mesh/live-invite.json',
  'config/movie-player/active-peer-bridge.json',
  // Caches, audit logs and live state.
  'config/**/*-cache.json', 'config/**/cache/**', 'config/prompt-security-audit.json',
  'config/notifications.json', 'config/voice-bubbles-live.json', 'config/journal-events.json',
  'config/ai-prompt-history.json', 'config/agent-chat-sessions.json', 'config/data-sources-auth-request.json',
  'config/provider-model-cache.json', 'config/dev-central-feature.json',
  'robos/cloud-mounts/**', 'robos/cache/**', 'robos/development/**', 'robos/videos/**',
  'robos/agent-runs/**', 'robos/agent-questions/**',
  '**/*.sock', '**/*.lock', '**/Singleton*', '**/*.tmp', '**/.DS_Store',
];

/** Files larger than this are skipped and reported, never uploaded. */
const MAX_FILE_BYTES = 25 * 1024 * 1024;

/**
 * JSON keys whose values are credentials. They are removed before anything leaves the
 * machine and put back from the local copy when a file is pulled.
 */
const SECRET_KEY_RE = /(^|[_-]|[a-z])(access_?token|refresh_?token|id_?token|token|secret|client_?secret|password|passwd|passphrase|api_?key|private_?key|key_?pem|cookie|session_?key|net_?token|network_?secret|credentials?)$/i;

/** Keys that look secret by name but are not (for example a pass path or a token count). */
const SECRET_KEY_ALLOW = new Set([
  'passPath', 'pass_path', 'credentialRef', 'hasCredential', 'tokenCount', 'maxTokens', 'max_tokens',
  'hasAccessToken', 'hasRefreshToken', 'hasCalendarToken', 'tokenType', 'secretRef', 'keyId',
]);

/**
 * Per-file keys (at any depth) that describe this machine's runtime state rather than
 * configuration: login status, last-checked times, live casts and tunnels. They are left
 * out of what is stored remotely and always kept from the local copy, so two machines
 * do not conflict just because each one refreshed a token or cast to a TV.
 */
const LOCAL_KEYS = {
  'config/cloud-accounts.json': ['updatedAt', 'createdAt', 'lastVerifiedAt', 'loggedIn', 'authStatus', 'status', 'isDefault', 'defaultAccountId', 'dataSourceCredentials', 'thunderbirdConfigured', 'thunderbirdLastSyncedAt', 'thunderbirdProfilePath'],
  'config/data-sources.json': ['lastChecked', 'authStatus', 'loggedIn', 'status', 'localMountPath'],
  'config/cloud-folders.json': ['syncedAt', 'localPath'],
  'config/movie-folders.json': ['lastSynced'],
  'config/audio-folders.json': ['lastSynced'],
  'config/tv-studio.json': ['lastRemoteKey', 'webosSessionRemainingHours', 'webosLastRenewedAt', 'activeTileId', 'activeDashboardCast', 'appCasts', 'activeCinemaCast', 'moviePlayerServer', 'moviePlayerLibrarySnapshot', 'activeCinemaLibrary', 'tabloCinemaItemsSnapshot'],
  'config/dashboards.json': ['lastCastTvId', 'lastCastAt'],
  'config/app-mesh/mesh-state.json': ['listenHost', 'listenPort', 'tunnels'],
  'config/home-speakers.json': ['updatedAt'],
  'config/hardware-keys.json': ['touchHistory', 'lastSeenAt'],
};

/** Keys that identify an item in a list, in priority order, used to merge shared lists. */
const ID_KEYS = ['id', '@id', 'uid', 'slug', 'key', 'name'];

const SHARE_TEMPLATES = [
  {
    id: 'family',
    label: 'Family & friends',
    description: 'Join your private network, stream your movies over it, and get the same playlists, lights, speakers and TV setup.',
    categories: ['private-network', 'movie-library', 'audio-library', 'smart-home'],
    sealNetworkSecret: true,
  },
  {
    id: 'onboarding',
    label: 'New teammate onboarding',
    description: 'Everything a new hire needs on day one: repositories, KGraph, MCP servers, database and task servers, agent personas and team.',
    categories: ['developer', 'kgraph', 'agents', 'team', 'preferences'],
  },
  {
    id: 'coworker',
    label: 'Coworker handoff',
    description: 'Hand a coworker the exact project setup you are using right now. Pick only what they need.',
    categories: ['developer', 'kgraph'],
  },
  {
    id: 'custom',
    label: 'Custom',
    description: 'Choose the categories yourself.',
    categories: [],
  },
];

/** Friendly app names for the "sign in again" checklist. */
const FILE_LABELS = {
  'config/cloud-accounts.json': 'Cloud Accounts',
  'config/data-sources.json': 'Data Sources',
  'config/db-manager-connections.json': 'Relational DB Manager',
  'config/nosql-connections.json': 'NoSQL DB Manager',
  'config/mcp/servers.json': 'MCP Manager',
  'config/git-projects.json': 'Git Projects',
  'config/kgraph-repos.json': 'KGraph repositories',
  'config/app-mesh/mesh-state.json': 'Private Networks',
  'config/smart-lights.json': 'Smart Light',
  'config/tv-studio.json': 'Smart TV Studio',
  'config/settings.json': 'RobOS Preferences',
  'config/movie-folders.json': 'Movie Player',
  'config/audio-folders.json': 'Audio Player',
};

module.exports = {
  CATEGORIES, EXCLUDE, MAX_FILE_BYTES, SECRET_KEY_RE, SECRET_KEY_ALLOW, LOCAL_KEYS, ID_KEYS, SHARE_TEMPLATES, FILE_LABELS,
};
