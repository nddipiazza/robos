'use strict';

/**
 * RobOS Thunderbird + Google Suite Integration Engine (`robos-lib/thunderbird-google`)
 *
 * Automatically installs Mozilla Thunderbird (if not already present), discovers or
 * initializes the user's Thunderbird profile, and configures:
 *   1. Google Calendar via CalDAV (`https://apidata.googleusercontent.com/caldav/v2/<email>/events`)
 *   2. Google Contacts via CardDAV (`https://www.googleapis.com/carddav/v1/principals/<email>/lists/default/`)
 *   3. Optional Gmail via IMAP (`imap.gmail.com:993`) & SMTP (`smtp.gmail.com:465`) with OAuth2 (`authMethod = 10`)
 *
 * Uses the unified Google account already tracked in `robos-lib/cloud-accounts`
 * (e.g., imported from the user's Google Drive login in RobOS Data Sources).
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const cloudAccounts = require('./cloud-accounts');

const ROBOS_BLOCK_START = '// >>> ROBOS-GOOGLE-INTEGRATION-START';
const ROBOS_BLOCK_END = '// <<< ROBOS-GOOGLE-INTEGRATION-END';

function getHomeDir(options = {}) {
  return options.homeDir || process.env.HOME || os.homedir();
}

/**
 * Computes a deterministic UUID v4-format string from a seed (e.g., `caldav:email`)
 * so re-applying configuration for the same Google account updates the same calendar entry
 * in Thunderbird rather than creating duplicates.
 */
function deterministicUuid(seed) {
  const hash = crypto.createHash('sha256').update(String(seed)).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16),
    '8' + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join('-');
}

function deterministicShortKey(seed) {
  return crypto.createHash('sha1').update(String(seed)).digest('hex').slice(0, 8);
}

/**
 * Detects whether Mozilla Thunderbird is installed on the host / VM and locates
 * any existing Thunderbird profile directories.
 */
function detectThunderbird(options = {}) {
  const home = getHomeDir(options);
  let binaryPath = null;
  let version = null;
  let packageType = null;

  if (options.mockBinaryPath !== undefined) {
    binaryPath = options.mockBinaryPath;
    version = options.mockVersion || (binaryPath ? 'Thunderbird 128.0esr' : null);
    packageType = binaryPath ? 'apt' : null;
  } else {
    const candidates = [
      path.join(home, '.local', 'bin', 'thunderbird'),
      path.join(home, '.local', 'opt', 'thunderbird', 'thunderbird'),
      '/usr/bin/thunderbird',
      '/snap/bin/thunderbird',
      '/usr/local/bin/thunderbird',
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        binaryPath = c;
        break;
      }
    }
    if (!binaryPath) {
      try {
        const out = execFileSync('which', ['thunderbird'], { encoding: 'utf8', timeout: 3000 }).trim();
        if (out) binaryPath = out;
      } catch {}
    }
    if (binaryPath) {
      packageType = binaryPath.includes('/snap/')
        ? 'snap'
        : binaryPath.includes('.local/')
          ? 'mozilla-official'
          : 'apt';
      const appIniCandidates = [
        path.join(home, '.local', 'opt', 'thunderbird', 'application.ini'),
        '/usr/lib/thunderbird/application.ini',
      ];
      for (const iniFile of appIniCandidates) {
        if (fs.existsSync(iniFile)) {
          try {
            const iniText = fs.readFileSync(iniFile, 'utf8');
            const m = iniText.match(/^Version=(.+)$/m);
            if (m) {
              version = `Mozilla Thunderbird ${m[1].trim()}`;
              break;
            }
          } catch {}
        }
      }
      if (!version) {
        try {
          version = execFileSync(binaryPath, ['--version'], {
            encoding: 'utf8',
            timeout: 1500,
            env: { ...process.env, MOZ_DISABLE_CONTENT_SANDBOX: '1' },
          }).trim().split('\n').pop().trim();
        } catch {
          version = 'Mozilla Thunderbird';
        }
      }
    }
  }

  const profileRoots = options.profileRoots || [
    path.join(home, '.thunderbird'),
    path.join(home, 'snap', 'thunderbird', 'common', '.thunderbird'),
  ];

  const discoveredProfiles = [];
  for (const root of profileRoots) {
    const iniPath = path.join(root, 'profiles.ini');
    if (fs.existsSync(iniPath)) {
      const parsed = parseProfilesIni(fs.readFileSync(iniPath, 'utf8'), root);
      for (const p of parsed) {
        discoveredProfiles.push(p);
      }
    }
  }

  const primaryProfile = discoveredProfiles.find(p => p.isDefault) || discoveredProfiles[0] || null;
  let configuredAccounts = [];
  if (primaryProfile && fs.existsSync(path.join(primaryProfile.fullPath, 'user.js'))) {
    try {
      const userJs = fs.readFileSync(path.join(primaryProfile.fullPath, 'user.js'), 'utf8');
      const matches = [...userJs.matchAll(/calendar\.registry\.[^"]+\.username",\s*"([^"]+)"/g)];
      configuredAccounts = [...new Set(matches.map(m => m[1]))];
    } catch {}
  }

  return {
    installed: Boolean(binaryPath),
    binaryPath,
    version,
    packageType,
    profileRoots,
    profiles: discoveredProfiles,
    primaryProfilePath: primaryProfile ? primaryProfile.fullPath : null,
    configuredAccounts,
  };
}

function parseProfilesIni(iniContent, rootDir) {
  const lines = String(iniContent || '').split(/\r?\n/);
  const sections = [];
  let current = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    const secMatch = line.match(/^\[([^\]]+)\]$/);
    if (secMatch) {
      if (current) sections.push(current);
      current = { section: secMatch[1], props: {} };
      continue;
    }
    if (current) {
      const eq = line.indexOf('=');
      if (eq > 0) {
        const k = line.slice(0, eq).trim();
        const v = line.slice(eq + 1).trim();
        current.props[k] = v;
      }
    }
  }
  if (current) sections.push(current);

  const installDefaultPaths = new Set();
  for (const s of sections) {
    if (s.section.startsWith('Install') && s.props.Default) {
      installDefaultPaths.add(s.props.Default);
    }
  }

  const profiles = [];
  for (const s of sections) {
    if (!s.section.startsWith('Profile')) continue;
    const relOrAbs = s.props.Path || '';
    if (!relOrAbs) continue;
    const isRel = s.props.IsRelative !== '0';
    const fullPath = isRel ? path.join(rootDir, relOrAbs) : relOrAbs;
    const isDefault = s.props.Default === '1' || installDefaultPaths.has(relOrAbs);
    profiles.push({
      name: s.props.Name || 'default-release',
      path: relOrAbs,
      fullPath,
      rootDir,
      isDefault,
    });
  }
  return profiles;
}

/**
 * Ensures at least one Thunderbird profile directory exists and is registered in `profiles.ini`.
 * On Ubuntu 22.04+/24.04+/26.04, `apt install thunderbird` may install either the native deb
 * (`~/.thunderbird`) or the Ubuntu Snap wrapper (`~/snap/thunderbird/common/.thunderbird`),
 * so we initialize both standard profile roots when creating fresh profiles.
 */
function ensureThunderbirdProfiles(options = {}) {
  const status = detectThunderbird(options);
  if (status.profiles.length > 0) {
    for (const p of status.profiles) {
      fs.mkdirSync(p.fullPath, { recursive: true });
    }
    return status.profiles;
  }

  const home = getHomeDir(options);
  const roots = options.profileRoots || [
    path.join(home, '.thunderbird'),
    path.join(home, 'snap', 'thunderbird', 'common', '.thunderbird'),
  ];

  const created = [];
  const profileDirName = 'robos001.default-release';
  for (const root of roots) {
    const fullPath = path.join(root, profileDirName);
    fs.mkdirSync(fullPath, { recursive: true });
    const iniPath = path.join(root, 'profiles.ini');
    if (!fs.existsSync(iniPath)) {
      const iniContent = [
        '[General]',
        'StartWithLastProfile=1',
        'Version=2',
        '',
        '[Profile0]',
        'Name=default-release',
        'IsRelative=1',
        `Path=${profileDirName}`,
        'Default=1',
        '',
      ].join('\n');
      fs.writeFileSync(iniPath, iniContent, 'utf8');
    }
    created.push({
      name: 'default-release',
      path: profileDirName,
      fullPath,
      rootDir: root,
      isDefault: true,
    });
  }
  return created;
}

/**
 * Installs Mozilla Thunderbird via passwordless apt-get when available, or downloads and
 * extracts the official Mozilla Thunderbird Linux x86_64 release into `~/.local/opt/thunderbird`
 * and `~/.local/bin/thunderbird` (zero root/sudo required on desktop workstations).
 */
function installThunderbird(options = {}) {
  const onLog = typeof options.onLog === 'function' ? options.onLog : () => {};
  if (options.dryRun) {
    onLog('[dry-run] Would install Mozilla Thunderbird into ~/.local/opt/thunderbird or via apt-get\n');
    return Promise.resolve({ ok: true, dryRun: true });
  }

  return new Promise((resolve) => {
    const cmd = [
      'set -e',
      'if sudo -n true >/dev/null 2>&1; then',
      '  sudo DEBIAN_FRONTEND=noninteractive apt-get update -y && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y thunderbird',
      'else',
      '  echo "Installing official Mozilla Thunderbird Linux x86_64 into ~/.local/opt/thunderbird (no root required)..."',
      '  mkdir -p "$HOME/.local/opt" "$HOME/.local/bin" "$HOME/.local/share/applications"',
      '  curl -fL "https://download.mozilla.org/?product=thunderbird-latest-SSL&os=linux64&lang=en-US" -o /tmp/robos-thunderbird-latest.tar.xz',
      '  tar -xJf /tmp/robos-thunderbird-latest.tar.xz -C "$HOME/.local/opt/"',
      '  rm -f /tmp/robos-thunderbird-latest.tar.xz "$HOME/.local/bin/thunderbird"',
      '  cat > "$HOME/.local/bin/thunderbird" << \'WRAPPER\'',
      '#!/usr/bin/env bash',
      'unset GDK_BACKEND',
      'unset EGL_PLATFORM',
      'export MOZ_DISABLE_CONTENT_SANDBOX=1',
      'exec "$HOME/.local/opt/thunderbird/thunderbird-bin" "$@"',
      'WRAPPER',
      '  chmod +x "$HOME/.local/bin/thunderbird"',
      'fi',
    ].join('\n');
    onLog('$ Installing Mozilla Thunderbird...\n');
    const child = spawn('bash', ['-lc', cmd], {
      env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' },
    });
    let log = '';
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      log += text;
      onLog(text);
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      log += text;
      onLog(text);
    });
    child.on('error', (err) => {
      resolve({ ok: false, error: err.message, log });
    });
    child.on('close', (code) => {
      const after = detectThunderbird(options);
      resolve({
        ok: code === 0 && after.installed,
        exitCode: code,
        installed: after.installed,
        binaryPath: after.binaryPath,
        version: after.version,
        log: log.slice(-4000),
      });
    });
  });
}

/**
 * Builds the Thunderbird `user.js` preference block for a Google Account.
 * Supports:
 *   - Google Calendar (CalDAV)
 *   - Google Contacts (CardDAV)
 *   - Optional Gmail (IMAP + SMTP with OAuth2 `authMethod = 10`)
 */
function generateThunderbirdUserJsBlock(account, configOptions = {}) {
  const email = String(account.email || account.user || '').trim();
  if (!email || !email.includes('@')) {
    throw new Error('A valid Google account email address is required to configure Thunderbird.');
  }

  const enableCalendar = configOptions.enableCalendar !== undefined
    ? Boolean(configOptions.enableCalendar)
    : (account.suites?.calendar?.enabled !== false);
  const enableContacts = configOptions.enableContacts !== undefined
    ? Boolean(configOptions.enableContacts)
    : (account.suites?.contacts?.enabled !== false);
  const enableMail = configOptions.enableMail !== undefined
    ? Boolean(configOptions.enableMail)
    : Boolean(account.suites?.mail?.enabled);

  const ACCOUNT_PALETTE = ['#00bcd4', '#10b981', '#a855f7', '#f59e0b', '#ec4899'];
  const defaultColorIdx = Math.abs(
    email
      .toLowerCase()
      .split('')
      .reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  ) % ACCOUNT_PALETTE.length;
  const calendarColor =
    configOptions.calendarColor ||
    account.calendarColor ||
    (account.isDefault ? '#00bcd4' : ACCOUNT_PALETTE[defaultColorIdx === 0 ? 1 : defaultColorIdx]);
  const refreshMinutes = Number(configOptions.refreshMinutes) || 1;
  const displayName = configOptions.displayName || account.label || email;
  const isDefaultCalendar =
    configOptions.isDefaultCalendar !== undefined ? Boolean(configOptions.isDefaultCalendar) : Boolean(account.isDefault);

  const endpoints = cloudAccounts.buildGoogleEndpoints(email);
  const calUuid = deterministicUuid(`robos-google-caldav:${email.toLowerCase()}`);
  const abId = `robos_gcontacts_${deterministicShortKey(email.toLowerCase())}`;
  const keySlug = deterministicShortKey(email.toLowerCase());

  const lines = [
    `${ROBOS_BLOCK_START} (${email})`,
    `// Auto-generated by RobOS Google Calendar & Thunderbird Integration`,
    `// Account: ${email}`,
    `user_pref("mail.provider.enabled", false);`,
    `user_pref("datareporting.policy.dataSubmissionPolicyBypassNotification", true);`,
    `user_pref("mailnews.start_page_override.mstone", "ignore");`,
    `user_pref("calendar.timezone.local", "${Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago'}");`,
    `user_pref("mail.identity.id_${keySlug}.fullName", ${JSON.stringify(displayName)});`,
    `user_pref("mail.identity.id_${keySlug}.useremail", ${JSON.stringify(email)});`,
    `user_pref("mail.identity.id_${keySlug}.valid", true);`,
  ];

  if (enableCalendar) {
    lines.push(
      `// ── Google Calendar (CalDAV) ──`,
      `user_pref("calendar.registry.${calUuid}.name", ${JSON.stringify(`Google Calendar (${email})`)});`,
      `user_pref("calendar.registry.${calUuid}.type", "caldav");`,
      `user_pref("calendar.registry.${calUuid}.uri", ${JSON.stringify(endpoints.caldavUrl)});`,
      `user_pref("calendar.registry.${calUuid}.username", ${JSON.stringify(email)});`,
      `user_pref("calendar.registry.${calUuid}.calendar-main-in-composite", true);`,
      `user_pref("calendar.registry.${calUuid}.calendar-main-default", ${isDefaultCalendar});`,
      `user_pref("calendar.registry.${calUuid}.color", ${JSON.stringify(calendarColor)});`,
      `user_pref("calendar.registry.${calUuid}.refreshInterval", ${refreshMinutes});`,
      `user_pref("calendar.registry.${calUuid}.cache.enabled", true);`,
      `user_pref("calendar.registry.${calUuid}.readOnly", false);`,
      `user_pref("calendar.registry.${calUuid}.imip.identity.key", "id_${keySlug}");`
    );

    // Also include any additional secondary calendars passed in configOptions.additionalCalendars
    if (Array.isArray(configOptions.additionalCalendars)) {
      for (const secCal of configOptions.additionalCalendars) {
        if (!secCal || !secCal.id || secCal.primary) continue;
        const secUuid = deterministicUuid(`robos-google-caldav:${email.toLowerCase()}:${secCal.id}`);
        const secUri = `https://apidata.googleusercontent.com/caldav/v2/${encodeURIComponent(secCal.id)}/events`;
        lines.push(
          `user_pref("calendar.registry.${secUuid}.name", ${JSON.stringify(secCal.summary || secCal.id)});`,
          `user_pref("calendar.registry.${secUuid}.type", "caldav");`,
          `user_pref("calendar.registry.${secUuid}.uri", ${JSON.stringify(secUri)});`,
          `user_pref("calendar.registry.${secUuid}.username", ${JSON.stringify(email)});`,
          `user_pref("calendar.registry.${secUuid}.calendar-main-in-composite", true);`,
          `user_pref("calendar.registry.${secUuid}.color", ${JSON.stringify(secCal.backgroundColor || '#3b82f6')});`,
          `user_pref("calendar.registry.${secUuid}.refreshInterval", ${refreshMinutes});`,
          `user_pref("calendar.registry.${secUuid}.cache.enabled", true);`
        );
      }
    }
  }

  if (enableContacts) {
    lines.push(
      `// ── Google Contacts (CardDAV) ──`,
      `user_pref("ldap_2.servers.${abId}.description", ${JSON.stringify(`Google Contacts (${email})`)});`,
      `user_pref("ldap_2.servers.${abId}.dirType", 102);`,
      `user_pref("ldap_2.servers.${abId}.filename", ${JSON.stringify(`abook-${abId}.sqlite`)});`,
      `user_pref("ldap_2.servers.${abId}.carddav.url", ${JSON.stringify(endpoints.carddavUrl)});`,
      `user_pref("ldap_2.servers.${abId}.carddav.username", ${JSON.stringify(email)});`,
      `user_pref("ldap_2.servers.${abId}.carddav.syncinterval", 30);`
    );
  }

  if (enableMail) {
    const acctKey = `account_${keySlug}`;
    const idKey = `id_${keySlug}`;
    const srvKey = `server_${keySlug}`;
    const smtpKey = `smtp_${keySlug}`;
    lines.push(
      `// ── Gmail (IMAP & SMTP with OAuth2) ──`,
      `user_pref("mail.account.${acctKey}.identities", "${idKey}");`,
      `user_pref("mail.account.${acctKey}.server", "${srvKey}");`,
      `user_pref("mail.identity.${idKey}.fullName", ${JSON.stringify(displayName)});`,
      `user_pref("mail.identity.${idKey}.useremail", ${JSON.stringify(email)});`,
      `user_pref("mail.identity.${idKey}.smtpServer", "${smtpKey}");`,
      `user_pref("mail.identity.${idKey}.valid", true);`,
      `user_pref("mail.server.${srvKey}.hostname", "imap.gmail.com");`,
      `user_pref("mail.server.${srvKey}.port", 993);`,
      `user_pref("mail.server.${srvKey}.type", "imap");`,
      `user_pref("mail.server.${srvKey}.userName", ${JSON.stringify(email)});`,
      `user_pref("mail.server.${srvKey}.socketType", 3);`,
      `user_pref("mail.server.${srvKey}.authMethod", 10);`,
      `user_pref("mail.server.${srvKey}.name", ${JSON.stringify(`Gmail (${email})`)});`,
      `user_pref("mail.server.${srvKey}.login_at_startup", true);`,
      `user_pref("mail.smtpserver.${smtpKey}.hostname", "smtp.gmail.com");`,
      `user_pref("mail.smtpserver.${smtpKey}.port", 465);`,
      `user_pref("mail.smtpserver.${smtpKey}.username", ${JSON.stringify(email)});`,
      `user_pref("mail.smtpserver.${smtpKey}.try_ssl", 3);`,
      `user_pref("mail.smtpserver.${smtpKey}.authMethod", 10);`,
      `user_pref("mail.smtpserver.${smtpKey}.description", "Google Mail SMTP");`,
      `user_pref("mail.accountmanager.defaultaccount", "${acctKey}");`
    );
  }

  lines.push(`${ROBOS_BLOCK_END} (${email})`);
  return {
    email,
    calendarUuid: calUuid,
    addressBookId: abId,
    endpoints,
    enableCalendar,
    enableContacts,
    enableMail,
    userJsBlock: lines.join('\n'),
  };
}

/**
 * Merges the generated RobOS block into an existing `user.js` file idempotently,
 * replacing any prior block for the same Google account while preserving all other user prefs.
 */
function mergeUserJsContent(existingContent, email, newBlock) {
  const startMarker = `${ROBOS_BLOCK_START} (${email})`;
  const endMarker = `${ROBOS_BLOCK_END} (${email})`;
  const raw = String(existingContent || '');
  const sIdx = raw.indexOf(startMarker);
  const eIdx = raw.indexOf(endMarker);

  if (sIdx >= 0 && eIdx > sIdx) {
    const before = raw.slice(0, sIdx).trimEnd();
    const after = raw.slice(eIdx + endMarker.length).trimStart();
    return [before, newBlock, after].filter(Boolean).join('\n\n') + '\n';
  }
  const trimmed = raw.trimEnd();
  return (trimmed ? `${trimmed}\n\n${newBlock}\n` : `${newBlock}\n`);
}

/**
 * Configures Thunderbird profiles for the specified Google Cloud Account and persists
 * the updated integration status back to `robos-lib/cloud-accounts`.
 */
function configureThunderbirdForGoogleAccount(accountIdOrEmail, configOptions = {}, options = {}) {
  const account = cloudAccounts.getAccountById(accountIdOrEmail, options);
  if (!account) {
    throw new Error(`No Google account found for "${accountIdOrEmail}". Sign in via RobOS Cloud Accounts or Data Sources first.`);
  }
  if (account.provider !== 'google') {
    throw new Error(`Account "${account.label}" is not a Google account.`);
  }

  const generated = generateThunderbirdUserJsBlock(account, configOptions);
  const profiles = ensureThunderbirdProfiles(options);
  const writtenFiles = [];

  for (const prof of profiles) {
    const userJsPath = path.join(prof.fullPath, 'user.js');
    const existing = fs.existsSync(userJsPath) ? fs.readFileSync(userJsPath, 'utf8') : '';
    let merged = mergeUserJsContent(existing, generated.email, generated.userJsBlock);

    // Ensure calendar.list.sortOrder includes all configured calendar UUIDs in user.js
    const uuidMatches = [...merged.matchAll(/calendar\.registry\.([0-9a-f-]{36})\.type/g)];
    const allUuids = [...new Set(uuidMatches.map((m) => m[1]))];
    if (allUuids.length > 0) {
      const sortOrderLine = `user_pref("calendar.list.sortOrder", ${JSON.stringify(allUuids.join(' '))});`;
      if (/user_pref\("calendar\.list\.sortOrder",[^)]+\);/.test(merged)) {
        merged = merged.replace(/user_pref\("calendar\.list\.sortOrder",[^)]+\);/g, sortOrderLine);
      } else {
        merged = `${merged.trimEnd()}\n${sortOrderLine}\n`;
      }
    }

    fs.writeFileSync(userJsPath, merged, 'utf8');
    writtenFiles.push(userJsPath);
  }

  // Persist suite toggles and Thunderbird sync metadata on the Cloud Account
  const saved = cloudAccounts.saveAccount({
    ...account,
    calendarColor: configOptions.calendarColor || account.calendarColor || (account.isDefault ? '#00bcd4' : '#10b981'),
    suites: {
      ...(account.suites || {}),
      calendar: { ...(account.suites?.calendar || {}), enabled: generated.enableCalendar },
      contacts: { ...(account.suites?.contacts || {}), enabled: generated.enableContacts },
      mail: { ...(account.suites?.mail || {}), enabled: generated.enableMail },
    },
    thunderbirdConfigured: true,
    thunderbirdLastSyncedAt: new Date().toISOString(),
    thunderbirdProfilePath: profiles[0]?.fullPath || null,
  }, options);

  return {
    ok: true,
    email: generated.email,
    calendarUuid: generated.calendarUuid,
    addressBookId: generated.addressBookId,
    endpoints: generated.endpoints,
    enableCalendar: generated.enableCalendar,
    enableContacts: generated.enableContacts,
    enableMail: generated.enableMail,
    userJsBlock: generated.userJsBlock,
    writtenFiles,
    primaryProfilePath: profiles[0]?.fullPath || null,
    account: saved.account,
  };
}

/**
 * Configures ALL Google accounts in RobOS Cloud Accounts into Mozilla Thunderbird's
 * Calendar (CalDAV) & Contacts (CardDAV) registry with distinct colors and composite view enabled.
 */
function configureAllGoogleAccountsInThunderbird(options = {}) {
  const PALETTE = ['#00bcd4', '#10b981', '#a855f7', '#f59e0b', '#ec4899'];
  const state = cloudAccounts.listAccounts(options);
  const googleAccounts = (state.accounts || []).filter((a) => a.provider === 'google' && a.email);
  const results = [];
  for (let i = 0; i < googleAccounts.length; i++) {
    const acc = googleAccounts[i];
    const color = acc.calendarColor || PALETTE[i % PALETTE.length];
    const res = configureThunderbirdForGoogleAccount(
      acc.id,
      {
        enableCalendar: true,
        enableContacts: acc.suites?.contacts?.enabled !== false,
        enableMail: Boolean(acc.suites?.mail?.enabled),
        calendarColor: color,
        isDefaultCalendar: i === 0 || Boolean(acc.isDefault),
      },
      options
    );
    results.push(res);
  }
  return {
    ok: true,
    count: results.length,
    accountsConfigured: results.map((r) => ({
      email: r.email,
      calendarUuid: r.calendarUuid,
      primaryProfilePath: r.primaryProfilePath,
    })),
    results,
  };
}

/**
 * Fetches upcoming events from the user's Google Calendar REST API when a Calendar-scoped
 * OAuth token is present, or returns the configured CalDAV feed metadata so the UI can show
 * live status.
 */
async function fetchGoogleCalendarOverview(accountIdOrEmail, options = {}) {
  const account = cloudAccounts.getAccountById(accountIdOrEmail, options);
  if (!account) {
    throw new Error('No Google account selected.');
  }

  const bearer = account.calendarAccessToken || account.accessToken;
  const caldavUrl = account.endpoints?.caldavUrl || cloudAccounts.buildGoogleEndpoints(account.email).caldavUrl;

  if (!bearer) {
    return {
      ok: true,
      mode: 'caldav-only',
      email: account.email,
      caldavUrl,
      calendars: [
        { id: account.email, summary: `Primary Calendar (${account.email})`, primary: true, backgroundColor: '#00bcd4' },
      ],
      upcomingEvents: [],
    };
  }

  try {
    const calListRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=20', {
      headers: { Authorization: `Bearer ${bearer}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!calListRes.ok) {
      return {
        ok: true,
        mode: 'caldav-configured',
        email: account.email,
        caldavUrl,
        note: 'OAuth token currently holds Google Drive scope; Thunderbird uses built-in OAuth2 for CalDAV/CardDAV or you can click Authorize Calendar API.',
        calendars: [
          { id: account.email, summary: `Primary Calendar (${account.email})`, primary: true, backgroundColor: '#00bcd4' },
        ],
        upcomingEvents: [],
      };
    }

    const calListData = await calListRes.json();
    const calendars = (calListData.items || []).map(c => ({
      id: c.id,
      summary: c.summary || c.id,
      primary: Boolean(c.primary),
      backgroundColor: c.backgroundColor || '#00bcd4',
      accessRole: c.accessRole,
    }));

    const nowIso = new Date().toISOString();
    const eventsRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(nowIso)}&maxResults=10&singleEvents=true&orderBy=startTime`,
      {
        headers: { Authorization: `Bearer ${bearer}` },
        signal: AbortSignal.timeout(10000),
      }
    );

    let upcomingEvents = [];
    if (eventsRes.ok) {
      const evData = await eventsRes.json();
      upcomingEvents = (evData.items || []).map(ev => ({
        id: ev.id,
        summary: ev.summary || '(No title)',
        start: ev.start?.dateTime || ev.start?.date || '',
        end: ev.end?.dateTime || ev.end?.date || '',
        location: ev.location || '',
        htmlLink: ev.htmlLink || '',
      }));
    }

    return {
      ok: true,
      mode: 'live-api',
      email: account.email,
      caldavUrl,
      calendars,
      upcomingEvents,
    };
  } catch (err) {
    return {
      ok: true,
      mode: 'caldav-configured',
      email: account.email,
      caldavUrl,
      error: err.message,
      calendars: [
        { id: account.email, summary: `Primary Calendar (${account.email})`, primary: true, backgroundColor: '#00bcd4' },
      ],
      upcomingEvents: [],
    };
  }
}

/**
 * Launches Thunderbird (optionally directly into the Calendar tab via `-calendar`)
 * with the RobOS-configured Google Calendar/Contacts profile (`--profile <primaryProfilePath>`).
 */
function launchThunderbird(launchOptions = {}, options = {}) {
  const status = detectThunderbird(options);
  if (!status.installed || !status.binaryPath) {
    throw new Error('Mozilla Thunderbird is not installed yet. Click "Install & Configure Thunderbird" first.');
  }

  const args = [];
  if (status.primaryProfilePath && fs.existsSync(status.primaryProfilePath)) {
    args.push('--profile', status.primaryProfilePath);
  }
  if (launchOptions.mode === 'calendar') {
    args.push('-calendar');
  } else if (launchOptions.mode === 'addressbook') {
    args.push('-addressbook');
  }

  if (options.dryRun) {
    return { ok: true, binaryPath: status.binaryPath, args, dryRun: true };
  }

  const cleanEnv = { ...process.env, MOZ_DISABLE_CONTENT_SANDBOX: '1' };
  delete cleanEnv.GDK_BACKEND;
  delete cleanEnv.EGL_PLATFORM;

  const child = spawn(status.binaryPath, args, {
    detached: true,
    stdio: 'ignore',
    env: cleanEnv,
  });
  child.unref();
  return { ok: true, binaryPath: status.binaryPath, args, pid: child.pid };
}

// ── RobOS Unified Calendar Events Store & Dev Central Integration ────────────

function getCalendarEventsFilePath(options = {}) {
  const configDir = options.configDir || path.join(getHomeDir(options), '.config', 'robos');
  return path.join(configDir, 'calendar-events.json');
}

function buildSeedCalendarEvents(email = 'nicholas.dipiazza@gmail.com') {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  const atTime = (dayOffset, hour, minute) => new Date(y, m, d + dayOffset, hour, minute, 0).toISOString();

  return [
    {
      id: 'evt-daily-standup',
      summary: 'Daily AI Standup & Blocker Radar Triage',
      description: 'Review Sprint 42 in-flight tasks, CI pipeline health, and PR review requests in Dev Central.',
      start: atTime(0, 9, 30),
      end: atTime(0, 9, 50),
      category: 'standup',
      source: 'google-caldav',
      calendarName: `Google Calendar (${email})`,
      accountEmail: email,
      location: 'Dev Central · Sprint 42 Room',
      meetingUrl: 'https://meet.google.com/robos-standup',
      attendees: [email, 'sarah-lead@acme.io', 'alex-architect@acme.io'],
    },
    {
      id: 'evt-pr-review-theater',
      summary: 'Code Review Theater: TASK-201 Multi-Step Form Validation (#84)',
      description: 'Walkthrough of 1080p proof-of-work video, Pact consumer contracts, and SHACL shape validation.',
      start: atTime(0, 11, 0),
      end: atTime(0, 11, 45),
      category: 'review',
      source: 'google-caldav',
      calendarName: `Google Calendar (${email})`,
      accountEmail: email,
      location: 'RobOS PR Review Theater',
      meetingUrl: 'https://github.com/acme-corp/buildbarn-forms/pull/84',
      attendees: [email, 'sarah-lead@acme.io'],
    },
    {
      id: 'evt-focus-block',
      summary: 'Deep Focus Block: FEAT-201 Implementation & E2E Verification',
      description: 'Protected engineering block with Do-Not-Disturb toast throttling enabled.',
      start: atTime(0, 14, 0),
      end: atTime(0, 16, 0),
      category: 'focus',
      source: 'robos-calendar',
      calendarName: `Google Calendar (${email})`,
      accountEmail: email,
      location: 'Local Workstation / Ephemeral Sandbox',
      meetingUrl: '',
      attendees: [email],
    },
    {
      id: 'evt-kgraph-sync',
      summary: 'Architecture & Dual-State Knowledge Graph Blast-Radius Sync',
      description: 'Compare World 1 (main) vs World 2 (feature branch) semantic diffs before Sprint 42 cut.',
      start: atTime(0, 16, 30),
      end: atTime(0, 17, 0),
      category: 'sprint',
      source: 'google-caldav',
      calendarName: `Google Calendar (${email})`,
      accountEmail: email,
      location: 'KGraph Explorer · Google Meet',
      meetingUrl: 'https://meet.google.com/robos-kgraph',
      attendees: [email, 'dave-k@acme.io', 'priya-n@acme.io'],
    },
    {
      id: 'evt-sprint-demo',
      summary: 'Sprint 42 Demo & Release Sign-Off',
      description: 'Live showcase of Cloud Suite Accounts, Thunderbird CalDAV/CardDAV integration, and Dev Central.',
      start: atTime(1, 10, 30),
      end: atTime(1, 11, 30),
      category: 'sprint',
      source: 'google-caldav',
      calendarName: `Google Calendar (${email})`,
      accountEmail: email,
      location: 'Engineering All-Hands',
      meetingUrl: 'https://meet.google.com/robos-demo',
      attendees: [email, 'sarah-lead@acme.io', 'alex-architect@acme.io'],
    },
  ];
}

function loadLocalCalendarEvents(options = {}) {
  const filePath = getCalendarEventsFilePath(options);
  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  const defaultAcc = cloudAccounts.getAccountById(null, options);
  const email = defaultAcc?.email || 'nicholas.dipiazza@gmail.com';
  const seeded = buildSeedCalendarEvents(email);
  saveLocalCalendarEvents(seeded, options);
  return seeded;
}

function saveLocalCalendarEvents(events, options = {}) {
  const filePath = getCalendarEventsFilePath(options);
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(events, null, 2), 'utf8');
  } catch {}
  return events;
}

function addCalendarEvent(eventInput = {}, options = {}) {
  const summary = String(eventInput.summary || eventInput.title || '').trim();
  if (!summary) {
    throw new Error('Event title / summary is required.');
  }
  const defaultAcc = cloudAccounts.getAccountById(eventInput.accountId || null, options);
  const email = eventInput.accountEmail || defaultAcc?.email || 'nicholas.dipiazza@gmail.com';

  const now = new Date();
  const startIso = eventInput.start
    ? new Date(eventInput.start).toISOString()
    : new Date(now.getTime() + 30 * 60000).toISOString();
  const endIso = eventInput.end
    ? new Date(eventInput.end).toISOString()
    : new Date(new Date(startIso).getTime() + 30 * 60000).toISOString();

  const newEvent = {
    id: eventInput.id || `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    summary,
    description: String(eventInput.description || '').trim(),
    start: startIso,
    end: endIso,
    category: eventInput.category || 'meeting',
    source: eventInput.source || 'google-caldav',
    calendarName: eventInput.calendarName || `Google Calendar (${email})`,
    accountEmail: email,
    location: String(eventInput.location || '').trim(),
    meetingUrl: String(eventInput.meetingUrl || '').trim(),
    attendees: Array.isArray(eventInput.attendees) ? eventInput.attendees : [email],
    createdAt: new Date().toISOString(),
  };

  const list = loadLocalCalendarEvents(options);
  list.push(newEvent);
  list.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  saveLocalCalendarEvents(list, options);
  return { ok: true, event: newEvent, events: list };
}

function deleteCalendarEvent(eventId, options = {}) {
  const list = loadLocalCalendarEvents(options);
  const filtered = list.filter(e => e.id !== eventId);
  saveLocalCalendarEvents(filtered, options);
  return { ok: true, deletedId: eventId, events: filtered };
}

/**
 * Reads any cached CalDAV events from Thunderbird's local SQLite cache (`calendar-data/cache.sqlite`)
 * if Thunderbird has already synced the user's Google Calendar(s).
 * Copies `cache.sqlite` + WAL/SHM to a temporary directory before querying so it succeeds even
 * while Thunderbird is actively running and holding a write lock.
 */
let _tbLiveCaldavCache = {
  profilePath: '',
  expiresAt: 0,
  events: null,
};

/**
 * Queries Thunderbird's configured CalDAV endpoints directly using Thunderbird's NSS-stored
 * OAuth2 refresh token (`logins.json` + `key4.db`) so external calendar additions, edits,
 * and deletions that appear in Thunderbird show up dynamically on the RobOS Dashboard within
 * seconds (even while Thunderbird holds `cache.sqlite` in `PRAGMA locking_mode = EXCLUSIVE`).
 */
function readThunderbirdLiveCaldavEvents(profilePath, email = '') {
  if (!profilePath || process.env.ROBOS_TEST === '1' || process.env.ROBOS_TEST_MODE === '1') {
    return [];
  }
  const loginsPath = path.join(profilePath, 'logins.json');
  const keyDbPath = path.join(profilePath, 'key4.db');
  if (!fs.existsSync(loginsPath) || !fs.existsSync(keyDbPath)) {
    return [];
  }

  const nowMs = Date.now();
  if (
    _tbLiveCaldavCache.events &&
    _tbLiveCaldavCache.profilePath === profilePath &&
    nowMs < _tbLiveCaldavCache.expiresAt
  ) {
    return _tbLiveCaldavCache.events;
  }

  // Parse calendar registry from user.js / prefs.js
  const calMap = {};
  for (const prefFile of ['user.js', 'prefs.js']) {
    const pPath = path.join(profilePath, prefFile);
    if (!fs.existsSync(pPath)) continue;
    try {
      const content = fs.readFileSync(pPath, 'utf8');
      for (const m of content.matchAll(
        /calendar\.registry\.([0-9a-f-]{36})\.(name|username|color|uri)",\s*"([^"]+)"/g
      )) {
        const [, uuid, key, val] = m;
        if (!calMap[uuid]) calMap[uuid] = { uuid };
        calMap[uuid][key] = val;
      }
    } catch {}
  }

  const tokenCachePath = path.join(os.tmpdir(), 'robos-tb-oauth-token-cache.json');
  const pyScript = `
import ctypes, json, base64, os, sys, time, urllib.request, urllib.parse, re
from datetime import datetime, timezone, timedelta

prof = sys.argv[1]
token_cache_file = sys.argv[2]
cal_map = json.loads(sys.argv[3])
default_email = sys.argv[4]

class SECItem(ctypes.Structure):
    _fields_ = [("type", ctypes.c_uint), ("data", ctypes.c_char_p), ("len", ctypes.c_uint)]

nss = ctypes.CDLL("libnss3.so")
if nss.NSS_Init(prof.encode("utf-8")) != 0:
    print("[]")
    sys.exit(0)

def decrypt(b64):
    raw = base64.b64decode(b64)
    inp = SECItem(0, ctypes.c_char_p(raw), len(raw))
    out = SECItem(0, None, 0)
    if nss.PK11SDR_Decrypt(ctypes.byref(inp), ctypes.byref(out), None) == 0:
        return ctypes.string_at(out.data, out.len).decode("utf-8")
    return None

refresh_tokens = {}
try:
    with open(os.path.join(prof, "logins.json"), "r", encoding="utf-8") as f:
        j = json.load(f)
    for l in j.get("logins", []):
        realm = l.get("httpRealm", "")
        if "calendar" in realm or "caldav" in realm:
            u = decrypt(l.get("encryptedUsername", ""))
            rt = decrypt(l.get("encryptedPassword", ""))
            if u and rt:
                refresh_tokens[u.lower()] = (u, rt)
finally:
    nss.NSS_Shutdown()

if not refresh_tokens:
    print("[]")
    sys.exit(0)

tok_cache = {}
if os.path.exists(token_cache_file):
    try:
        with open(token_cache_file, "r", encoding="utf-8") as f:
            tok_cache = json.load(f)
    except Exception:
        tok_cache = {}

now_ts = time.time()
access_tokens = {}
cache_dirty = False

for u_lower, (u_orig, rt) in refresh_tokens.items():
    cached = tok_cache.get(u_lower)
    if cached and cached.get("expires_at", 0) > now_ts + 60 and cached.get("access_token"):
        access_tokens[u_lower] = cached["access_token"]
        continue
    try:
        data = urllib.parse.urlencode({
            "client_id": "406964657835-aq8lmia8j95dhl1a2bvharmfk3t1hgqj.apps.googleusercontent.com",
            "client_secret": "kSmqreRr0qwBWJgbf5Y-PjSU",
            "refresh_token": rt,
            "grant_type": "refresh_token",
        }).encode("utf-8")
        req = urllib.request.Request("https://www.googleapis.com/oauth2/v3/token", data=data)
        resp = json.loads(urllib.request.urlopen(req, timeout=4).read().decode("utf-8"))
        at = resp.get("access_token")
        if at:
            access_tokens[u_lower] = at
            tok_cache[u_lower] = {
                "access_token": at,
                "expires_at": now_ts + int(resp.get("expires_in", 3500))
            }
            cache_dirty = True
    except Exception:
        pass

if cache_dirty:
    try:
        with open(token_cache_file, "w", encoding="utf-8") as f:
            json.dump(tok_cache, f)
    except Exception:
        pass

now_utc = datetime.now(timezone.utc)
start_range = (now_utc - timedelta(days=1)).strftime("%Y%m%dT000000Z")
end_range = (now_utc + timedelta(days=21)).strftime("%Y%m%dT235959Z")
local_now = datetime.now()
today_start_local = local_now.replace(hour=0, minute=0, second=0, microsecond=0)

def parse_ical_dt(val):
    s = val.strip()
    if re.match(r"^\\d{8}$", s):
        return datetime.strptime(s, "%Y%m%d"), True
    if s.endswith("Z"):
        dt_utc = datetime.strptime(s[:15], "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc)
        return dt_utc.astimezone().replace(tzinfo=None), False
    return datetime.strptime(s[:15], "%Y%m%dT%H%M%S"), False

def advance_rrule(dt_start, dt_end, rrule_str):
    if not rrule_str or dt_end > today_start_local:
        return dt_start, dt_end
    dur = dt_end - dt_start
    until_m = re.search(r"UNTIL=(\\d{8})", rrule_str)
    if until_m:
        until_dt = datetime.strptime(until_m.group(1), "%Y%m%d") + timedelta(days=1)
        if until_dt <= today_start_local:
            return None, None
    interval = 1
    int_m = re.search(r"INTERVAL=(\\d+)", rrule_str)
    if int_m:
        interval = max(1, int(int_m.group(1)))
    if "FREQ=DAILY" in rrule_str:
        step = timedelta(days=interval)
        while dt_end <= today_start_local:
            dt_start += step
            dt_end = dt_start + dur
        return dt_start, dt_end
    if "FREQ=WEEKLY" in rrule_str:
        step = timedelta(weeks=interval)
        while dt_end <= today_start_local:
            dt_start += step
            dt_end = dt_start + dur
        return dt_start, dt_end
    return None, None

out_events = []
for uuid, meta in cal_map.items():
    uname = (meta.get("username") or default_email or "").strip()
    u_lower = uname.lower()
    at = access_tokens.get(u_lower)
    if not at:
        continue
    caldav_url = meta.get("uri") or f"https://apidata.googleusercontent.com/caldav/v2/{urllib.parse.quote(uname)}/events"
    report_xml = f"""<?xml version="1.0" encoding="utf-8" ?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag/>
    <C:calendar-data/>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="{start_range}" end="{end_range}"/>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>""".encode("utf-8")
    try:
        r2 = urllib.request.Request(caldav_url, data=report_xml, method="REPORT", headers={
            "Authorization": f"Bearer {at}",
            "Depth": "1",
            "Content-Type": "application/xml; charset=utf-8"
        })
        xml_text = urllib.request.urlopen(r2, timeout=4).read().decode("utf-8", "ignore")
        for vev in xml_text.split("BEGIN:VEVENT")[1:]:
            block = vev.split("END:VEVENT")[0].replace("\\r\\n ", "").replace("\\n ", "")
            status_m = re.search(r"^STATUS:(.*)$", block, re.M)
            if status_m and status_m.group(1).strip().upper() == "CANCELLED":
                continue
            uid_m = re.search(r"^UID:(.*)$", block, re.M)
            sum_m = re.search(r"^SUMMARY:(.*)$", block, re.M)
            dt_m = re.search(r"^DTSTART[^:]*:(.*)$", block, re.M)
            de_m = re.search(r"^DTEND[^:]*:(.*)$", block, re.M)
            loc_m = re.search(r"^LOCATION:(.*)$", block, re.M)
            rr_m = re.search(r"^RRULE:(.*)$", block, re.M)
            mod_m = re.search(r"^LAST-MODIFIED:(.*)$", block, re.M)
            if not dt_m:
                continue
            dt_s, is_all_day = parse_ical_dt(dt_m.group(1))
            dt_e, _ = parse_ical_dt(de_m.group(1)) if de_m else (dt_s + timedelta(hours=1), is_all_day)
            rrule_val = rr_m.group(1).strip() if rr_m else ""
            if rrule_val:
                dt_s, dt_e = advance_rrule(dt_s, dt_e, rrule_val)
                if not dt_s:
                    continue
            uid_val = uid_m.group(1).strip() if uid_m else f"caldav-{len(out_events)}"
            summary_val = (sum_m.group(1).strip() if sum_m else "(Untitled Event)").replace("\\\\,", ",").replace("\\\\;", ";")
            loc_val = (loc_m.group(1).strip() if loc_m else "").replace("\\\\,", ",").replace("\\\\n", " ")
            out_events.append({
                "id": f"tb-{uid_val}",
                "calId": uuid,
                "summary": summary_val,
                "start": dt_s.astimezone().isoformat(),
                "end": dt_e.astimezone().isoformat(),
                "startEpochSec": int(dt_s.astimezone().timestamp()),
                "endEpochSec": int(dt_e.astimezone().timestamp()),
                "allDay": is_all_day,
                "recurring": bool(rrule_val),
                "lastModified": mod_m.group(1).strip() if mod_m else "",
                "category": "meeting",
                "source": "thunderbird-caldav-live",
                "calendarName": meta.get("name") or f"Google Calendar ({uname})",
                "accountEmail": uname,
                "color": meta.get("color") or "#00bcd4",
                "location": loc_val
            })
    except Exception:
        pass

out_events.sort(key=lambda x: x["startEpochSec"])
print(json.dumps(out_events))
`;

  try {
    const out = execFileSync(
      'python3',
      ['-c', pyScript, profilePath, tokenCachePath, JSON.stringify(calMap), email || 'nicholas.dipiazza@gmail.com'],
      { encoding: 'utf8', timeout: 5500 }
    ).trim();
    if (out) {
      const parsed = JSON.parse(out);
      if (Array.isArray(parsed) && parsed.length > 0) {
        _tbLiveCaldavCache = {
          profilePath,
          expiresAt: nowMs + 4000,
          events: parsed,
        };
        return parsed;
      }
    }
  } catch {}

  if (_tbLiveCaldavCache.events && _tbLiveCaldavCache.profilePath === profilePath) {
    return _tbLiveCaldavCache.events;
  }
  return [];
}

/**
 * Reads any cached CalDAV events from Thunderbird:
 *   1. Queries Thunderbird's live CalDAV feed using Thunderbird's NSS `logins.json` OAuth2 token
 *      (`readThunderbirdLiveCaldavEvents`) so external calendar updates appear dynamically within seconds.
 *   2. Falls back to / merges with Thunderbird's local SQLite cache (`calendar-data/cache.sqlite`).
 */
function readThunderbirdCachedEvents(profilePath, email = '') {
  if (!profilePath) return [];

  // 1. Live CalDAV sync via Thunderbird's OAuth2 credentials (picks up external changes immediately)
  const liveEvents = readThunderbirdLiveCaldavEvents(profilePath, email);
  if (liveEvents.length > 0) {
    return liveEvents;
  }

  const calDataDir = path.join(profilePath, 'calendar-data');
  const dbPath = path.join(calDataDir, 'cache.sqlite');
  if (!fs.existsSync(dbPath)) return [];

  // Map calendar registry UUID -> { email, name, color } from user.js / prefs.js
  const calMap = {};
  for (const prefFile of ['user.js', 'prefs.js']) {
    const pPath = path.join(profilePath, prefFile);
    if (!fs.existsSync(pPath)) continue;
    try {
      const content = fs.readFileSync(pPath, 'utf8');
      for (const m of content.matchAll(/calendar\.registry\.([0-9a-f-]{36})\.(name|username|color)",\s*"([^"]+)"/g)) {
        const [, uuid, key, val] = m;
        if (!calMap[uuid]) calMap[uuid] = {};
        calMap[uuid][key] = val;
      }
    } catch {}
  }

  const tmpDir = path.join(os.tmpdir(), `robos-tb-cal-${process.pid}-${Date.now()}`);
  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    for (const suffix of ['', '-wal', '-shm']) {
      const src = `${dbPath}${suffix}`;
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(tmpDir, `cache.sqlite${suffix}`));
      }
    }
    const tmpDb = path.join(tmpDir, 'cache.sqlite');
    const nowUs = Date.now() * 1000;
    const windowStartUs = nowUs - 2 * 86400 * 1000000;
    const pyScript = [
      'import sqlite3, json, sys',
      'conn = sqlite3.connect(sys.argv[1])',
      'conn.row_factory = sqlite3.Row',
      'rows = [dict(r) for r in conn.execute("SELECT cal_id, id, title, event_start, event_end, flags FROM cal_events WHERE event_end >= ? ORDER BY event_start ASC LIMIT 50", (int(sys.argv[2]),)).fetchall()]',
      'print(json.dumps(rows))',
    ].join('\n');
    const out = execFileSync('python3', ['-c', pyScript, tmpDb, String(windowStartUs)], {
      encoding: 'utf8',
      timeout: 4000,
    }).trim();
    if (!out) return [];
    const rows = JSON.parse(out);
    if (!Array.isArray(rows)) return [];
    return rows.map((r) => {
      const meta = calMap[r.cal_id] || {};
      const resolvedEmail = meta.username || email || 'nicholas.dipiazza@gmail.com';
      const resolvedName = meta.name || `Google Calendar (${resolvedEmail})`;
      const resolvedColor = meta.color || '#00bcd4';
      const startMs = r.event_start ? Math.floor(Number(r.event_start) / 1000) : Date.now();
      const endMs = r.event_end ? Math.floor(Number(r.event_end) / 1000) : startMs + 3600000;
      return {
        id: `tb-${r.id}`,
        calId: r.cal_id,
        summary: r.title || '(Untitled Event)',
        start: new Date(startMs).toISOString(),
        end: new Date(endMs).toISOString(),
        startEpochSec: Math.floor(startMs / 1000),
        endEpochSec: Math.floor(endMs / 1000),
        category: 'meeting',
        source: 'thunderbird-caldav',
        calendarName: resolvedName,
        accountEmail: resolvedEmail,
        color: resolvedColor,
        location: '',
      };
    });
  } catch {
    return [];
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

/**
 * Returns unified calendar events combining:
 *   1. RobOS & Google Calendar events (`~/.config/robos/calendar-events.json`)
 *   2. Live Google Calendar REST API events (when Calendar scope token is active)
 *   3. Thunderbird CalDAV SQLite cached events (`calendar-data/cache.sqlite`)
 */
async function getUnifiedCalendarEvents(accountIdOrEmail = null, options = {}) {
  const state = cloudAccounts.listAccounts(options);
  const googleAccounts = state.accounts.filter(a => a.provider === 'google');
  const activeAccount = (accountIdOrEmail && state.accounts.find(a => a.id === accountIdOrEmail || a.email === accountIdOrEmail))
    || googleAccounts.find(a => a.id === state.defaultAccountId)
    || googleAccounts[0]
    || null;

  const email = activeAccount?.email || 'nicholas.dipiazza@gmail.com';
  const tbStatus = detectThunderbird(options);
  const localEvents = loadLocalCalendarEvents(options);
  const tbCached = readThunderbirdCachedEvents(tbStatus.primaryProfilePath, email);

  let liveApiEvents = [];
  let syncMode = activeAccount?.thunderbirdConfigured ? 'thunderbird-caldav-synced' : 'caldav-ready';

  if (activeAccount && !options.skipNetwork) {
    try {
      const ov = await fetchGoogleCalendarOverview(activeAccount.id, options);
      if (ov && ov.mode === 'live-api') {
        syncMode = 'google-api-live';
      }
      if (ov && Array.isArray(ov.upcomingEvents) && ov.upcomingEvents.length > 0) {
        liveApiEvents = ov.upcomingEvents.map(ev => ({
          id: `gapi-${ev.id}`,
          summary: ev.summary,
          start: ev.start,
          end: ev.end || ev.start,
          category: /standup|scrum/i.test(ev.summary) ? 'standup' : /review|pr/i.test(ev.summary) ? 'review' : /sprint|demo|planning/i.test(ev.summary) ? 'sprint' : 'meeting',
          source: 'google-api',
          calendarName: `Google Calendar (${email})`,
          accountEmail: email,
          location: ev.location || '',
          meetingUrl: ev.htmlLink || '',
        }));
      }
    } catch {}
  }

  // Merge and deduplicate by summary + start timestamp
  const seen = new Set();
  const merged = [];
  for (const ev of [...liveApiEvents, ...tbCached, ...localEvents]) {
    if (!ev || !ev.summary) continue;
    const key = `${ev.summary.toLowerCase()}::${String(ev.start).slice(0, 16)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({
      ...ev,
      accountEmail: ev.accountEmail || email,
      calendarName: ev.calendarName || `Google Calendar (${email})`,
    });
  }

  merged.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const now = new Date();
  const todayStr = now.toDateString();
  const todayEvents = merged.filter(e => new Date(e.start).toDateString() === todayStr);
  const upcomingEvents = merged.filter(e => new Date(e.end || e.start).getTime() >= now.getTime() - 3600000);

  return {
    ok: true,
    syncMode,
    account: activeAccount,
    accounts: googleAccounts,
    thunderbird: tbStatus,
    caldavUrl: activeAccount?.endpoints?.caldavUrl || cloudAccounts.buildGoogleEndpoints(email).caldavUrl,
    events: merged,
    todayCount: todayEvents.length,
    upcomingCount: upcomingEvents.length,
  };
}

module.exports = {
  ROBOS_BLOCK_START,
  ROBOS_BLOCK_END,
  deterministicUuid,
  detectThunderbird,
  parseProfilesIni,
  ensureThunderbirdProfiles,
  installThunderbird,
  generateThunderbirdUserJsBlock,
  mergeUserJsContent,
  configureThunderbirdForGoogleAccount,
  configureAllGoogleAccountsInThunderbird,
  fetchGoogleCalendarOverview,
  launchThunderbird,
  getCalendarEventsFilePath,
  loadLocalCalendarEvents,
  saveLocalCalendarEvents,
  addCalendarEvent,
  deleteCalendarEvent,
  readThunderbirdLiveCaldavEvents,
  readThunderbirdCachedEvents,
  getUnifiedCalendarEvents,
};
