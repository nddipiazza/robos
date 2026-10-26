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
      packageType = binaryPath.includes('/snap/') || fs.existsSync('/snap/thunderbird') ? 'snap' : 'apt';
      try {
        version = execFileSync(binaryPath, ['--version'], { encoding: 'utf8', timeout: 4000 }).trim();
      } catch {
        version = 'Mozilla Thunderbird';
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
 * Installs Mozilla Thunderbird via apt-get (or snap fallback), streaming progress logs.
 */
function installThunderbird(options = {}) {
  const onLog = typeof options.onLog === 'function' ? options.onLog : () => {};
  if (options.dryRun) {
    onLog('[dry-run] Would run: sudo apt-get update && sudo apt-get install -y thunderbird\n');
    return Promise.resolve({ ok: true, dryRun: true });
  }

  return new Promise((resolve) => {
    const cmd = 'sudo DEBIAN_FRONTEND=noninteractive apt-get update -y && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y thunderbird || sudo snap install thunderbird';
    onLog(`$ ${cmd}\n`);
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
        ok: code === 0 || after.installed,
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

  const calendarColor = configOptions.calendarColor || '#00bcd4';
  const refreshMinutes = Number(configOptions.refreshMinutes) || 15;
  const displayName = configOptions.displayName || account.label || email;

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
  ];

  if (enableCalendar) {
    lines.push(
      `// ── Google Calendar (CalDAV) ──`,
      `user_pref("calendar.registry.${calUuid}.name", ${JSON.stringify(`Google Calendar (${email})`)});`,
      `user_pref("calendar.registry.${calUuid}.type", "caldav");`,
      `user_pref("calendar.registry.${calUuid}.uri", ${JSON.stringify(endpoints.caldavUrl)});`,
      `user_pref("calendar.registry.${calUuid}.username", ${JSON.stringify(email)});`,
      `user_pref("calendar.registry.${calUuid}.calendar-main-in-composite", true);`,
      `user_pref("calendar.registry.${calUuid}.calendar-main-default", true);`,
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
    const merged = mergeUserJsContent(existing, generated.email, generated.userJsBlock);
    fs.writeFileSync(userJsPath, merged, 'utf8');
    writtenFiles.push(userJsPath);
  }

  // Persist suite toggles and Thunderbird sync metadata on the Cloud Account
  const saved = cloudAccounts.saveAccount({
    ...account,
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
 * Launches Thunderbird (optionally directly into the Calendar tab via `-calendar`).
 */
function launchThunderbird(launchOptions = {}, options = {}) {
  const status = detectThunderbird(options);
  if (!status.installed || !status.binaryPath) {
    throw new Error('Mozilla Thunderbird is not installed yet. Click "Install & Configure Thunderbird" first.');
  }

  const args = [];
  if (launchOptions.mode === 'calendar') {
    args.push('-calendar');
  } else if (launchOptions.mode === 'addressbook') {
    args.push('-addressbook');
  }

  if (options.dryRun) {
    return { ok: true, binaryPath: status.binaryPath, args, dryRun: true };
  }

  const child = spawn(status.binaryPath, args, {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env },
  });
  child.unref();
  return { ok: true, binaryPath: status.binaryPath, args, pid: child.pid };
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
  fetchGoogleCalendarOverview,
  launchThunderbird,
};
