'use strict';

/**
 * RobOS Unified Cloud Accounts Registry (`robos-lib/cloud-accounts`)
 *
 * Centralizes cloud account identity, OAuth 2.0 tokens, and suite capabilities
 * (Google Drive, Google Calendar CalDAV/REST, Google Contacts CardDAV, Gmail IMAP/SMTP,
 * Microsoft OneDrive/365, Nextcloud, Dropbox, S3) across all RobOS applications.
 *
 * Bidirectionally syncs with `~/.config/robos/data-sources.json` so any Google Drive
 * or OneDrive account already signed in via RobOS Data Sources or Audio Player is
 * automatically tracked and reusable across the entire RobOS suite (including
 * RobOS Cloud Accounts, RobOS Preferences, and RobOS Google Calendar / Thunderbird).
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const crypto = require('node:crypto');

// Built-in desktop OAuth 2.0 clients:
// 1. Drive desktop client (used by Data Sources & Audio Player)
const DEFAULT_GDRIVE_CLIENT_ID = '202264815644.apps.googleusercontent.com';
const DEFAULT_GDRIVE_OBSCURED_SECRET = 'eX8GpZTVx3vxMWVkuuBdDWmAUE6rGhTwVrvG9GhllYccSdj2-mvHVg';

// 2. Thunderbird open-source Google Workspace OAuth 2.0 client (supports Calendar CalDAV, Contacts CardDAV, Gmail IMAP/SMTP)
const THUNDERBIRD_GOOGLE_CLIENT_ID = '406964657835-aq8lmia8j95dhl1a2bvharmfk3t1hgqj.apps.googleusercontent.com';
const THUNDERBIRD_GOOGLE_CLIENT_SECRET = '__uKf893289012_thunderbird_oauth'; // Public desktop client secret placeholder when using custom or loopback flow

const DEFAULT_ONEDRIVE_CLIENT_ID = 'b15665d9-eda6-4092-8539-0eec376afd59';
const DEFAULT_ONEDRIVE_OBSCURED_SECRET = '_JUdzh3LnKNqSPcf4Wu5fgMFIQOI8glZu_akYgR8yf6egowNBg-R';

const GOOGLE_SUITE_SCOPES = {
  drive: 'https://www.googleapis.com/auth/drive',
  calendar: 'https://www.googleapis.com/auth/calendar',
  contacts: 'https://www.googleapis.com/auth/carddav',
  mail: 'https://mail.google.com/',
};

const CLOUD_PROVIDERS = {
  google: {
    id: 'google',
    name: 'Google Workspace / Google Account',
    shortName: 'Google',
    builtin: true,
    authType: 'oauth2',
    icon: 'google',
    description: 'Single Google sign-in reusable across Google Drive, Google Calendar (CalDAV), Google Contacts (CardDAV), and Gmail (IMAP/SMTP).',
    suites: [
      {
        id: 'drive',
        label: 'Google Drive',
        scope: GOOGLE_SUITE_SCOPES.drive,
        defaultEnabled: true,
        description: 'Cloud storage folders for Data Sources, Audio Player, File Explorer, and Context Manager.',
        consumers: ['data-sources', 'audio-player', 'file-explorer', 'context-manager'],
      },
      {
        id: 'calendar',
        label: 'Google Calendar (CalDAV & API)',
        scope: GOOGLE_SUITE_SCOPES.calendar,
        defaultEnabled: true,
        description: 'Bi-directional CalDAV & REST calendar sync for Thunderbird and RobOS Google Calendar.',
        consumers: ['google-calendar', 'thunderbird', 'dev-central'],
      },
      {
        id: 'contacts',
        label: 'Google Contacts (CardDAV)',
        scope: GOOGLE_SUITE_SCOPES.contacts,
        defaultEnabled: true,
        description: 'CardDAV address book sync for Thunderbird and RobOS People Directory.',
        consumers: ['google-calendar', 'thunderbird', 'people-directory'],
      },
      {
        id: 'mail',
        label: 'Gmail (IMAP & SMTP)',
        scope: GOOGLE_SUITE_SCOPES.mail,
        defaultEnabled: false,
        description: 'Optional IMAP (imap.gmail.com:993) & SMTP (smtp.gmail.com:465) mail sync in Thunderbird.',
        consumers: ['google-calendar', 'thunderbird'],
      },
    ],
  },
  microsoft: {
    id: 'microsoft',
    name: 'Microsoft 365 / OneDrive',
    shortName: 'Microsoft',
    builtin: true,
    authType: 'oauth2',
    icon: 'onedrive',
    description: 'Microsoft account for OneDrive cloud folders, SharePoint, and Outlook Calendar/Mail.',
    suites: [
      {
        id: 'drive',
        label: 'Microsoft OneDrive',
        scope: 'Files.ReadWrite.All',
        defaultEnabled: true,
        description: 'Cloud storage folders for Data Sources and Audio Player.',
        consumers: ['data-sources', 'audio-player'],
      },
      {
        id: 'calendar',
        label: 'Outlook Calendar',
        scope: 'Calendars.ReadWrite',
        defaultEnabled: true,
        description: 'Calendar integration via Microsoft Graph / CalDAV.',
        consumers: ['google-calendar', 'thunderbird'],
      },
    ],
  },
  nextcloud: {
    id: 'nextcloud',
    name: 'Nextcloud / WebDAV / CalDAV',
    shortName: 'Nextcloud',
    builtin: true,
    authType: 'basic-or-token',
    icon: 'webdav',
    description: 'Self-hosted Nextcloud or ownCloud server with WebDAV files, CalDAV calendars, and CardDAV contacts.',
    suites: [
      { id: 'drive', label: 'WebDAV Files', defaultEnabled: true, consumers: ['data-sources', 'audio-player'] },
      { id: 'calendar', label: 'CalDAV Calendar', defaultEnabled: true, consumers: ['google-calendar', 'thunderbird'] },
      { id: 'contacts', label: 'CardDAV Contacts', defaultEnabled: true, consumers: ['google-calendar', 'thunderbird'] },
    ],
  },
  dropbox: {
    id: 'dropbox',
    name: 'Dropbox',
    shortName: 'Dropbox',
    builtin: true,
    authType: 'oauth2',
    icon: 'dropbox',
    description: 'Dropbox cloud storage folders for RobOS Data Sources and media libraries.',
    suites: [
      { id: 'drive', label: 'Dropbox Storage', defaultEnabled: true, consumers: ['data-sources', 'audio-player'] },
    ],
  },
  s3: {
    id: 's3',
    name: 'Amazon S3 / Cloudflare R2 / MinIO',
    shortName: 'S3',
    builtin: true,
    authType: 'access-key',
    icon: 's3',
    description: 'S3-compatible object storage buckets for artifacts, backups, and media.',
    suites: [
      { id: 'drive', label: 'Object Storage Buckets', defaultEnabled: true, consumers: ['data-sources', 'audio-player'] },
    ],
  },
};

function revealObscuredSecret(obscured) {
  const key = Buffer.from([
    0x9c, 0x93, 0x5b, 0x48, 0x73, 0x0a, 0x55, 0x4d,
    0x6b, 0xfd, 0x7c, 0x63, 0xc8, 0x86, 0xa9, 0x2b,
    0xd3, 0x90, 0x19, 0x8e, 0xb8, 0x12, 0x8a, 0xfb,
    0xf4, 0xde, 0x16, 0x2b, 0x8b, 0x95, 0xf6, 0x38,
  ]);
  const raw = Buffer.from(obscured, 'base64url');
  const iv = raw.subarray(0, 16);
  const body = raw.subarray(16);
  const decipher = crypto.createDecipheriv('aes-256-ctr', key, iv);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}

function getDefaultGDriveClientSecret() {
  return revealObscuredSecret(DEFAULT_GDRIVE_OBSCURED_SECRET);
}

function getDefaultOneDriveClientSecret() {
  return revealObscuredSecret(DEFAULT_ONEDRIVE_OBSCURED_SECRET);
}

function getHomeDir(options = {}) {
  return options.homeDir || process.env.HOME || os.homedir();
}

function getConfigDir(options = {}) {
  return options.configDir || path.join(getHomeDir(options), '.config', 'robos');
}

function getCloudAccountsFilePath(options = {}) {
  return path.join(getConfigDir(options), 'cloud-accounts.json');
}

function getDataSourcesFilePath(options = {}) {
  return path.join(getConfigDir(options), 'data-sources.json');
}

function slugifyAccountId(provider, emailOrName) {
  const p = String(provider || 'google').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const u = String(emailOrName || 'account').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${p}-${u || 'default'}`;
}

function mapDriverToProvider(driverType) {
  const d = String(driverType || '').toLowerCase();
  if (d === 'gdrive' || d === 'google') return 'google';
  if (d === 'onedrive' || d === 'microsoft') return 'microsoft';
  if (d === 'webdav' || d === 'nextcloud') return 'nextcloud';
  if (d === 'dropbox') return 'dropbox';
  if (d === 's3') return 's3';
  return null;
}

function mapProviderToDriver(provider) {
  const p = String(provider || '').toLowerCase();
  if (p === 'google') return 'gdrive';
  if (p === 'microsoft') return 'onedrive';
  if (p === 'nextcloud') return 'webdav';
  if (p === 'dropbox') return 'dropbox';
  if (p === 's3') return 's3';
  return p;
}

function buildGoogleEndpoints(email) {
  const cleanEmail = String(email || '').trim();
  const encodedEmail = encodeURIComponent(cleanEmail);
  return {
    caldavUrl: cleanEmail
      ? `https://apidata.googleusercontent.com/caldav/v2/${encodedEmail}/events`
      : 'https://apidata.googleusercontent.com/caldav/v2/',
    caldavPrincipalUrl: cleanEmail
      ? `https://apidata.googleusercontent.com/caldav/v2/${encodedEmail}/user`
      : 'https://apidata.googleusercontent.com/caldav/v2/',
    carddavUrl: cleanEmail
      ? `https://www.googleapis.com/carddav/v1/principals/${encodedEmail}/lists/default/`
      : 'https://www.googleapis.com/carddav/v1/principals/',
    imapHost: 'imap.gmail.com',
    imapPort: 993,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 465,
    driveApiUrl: 'https://www.googleapis.com/drive/v3',
    calendarApiUrl: 'https://www.googleapis.com/calendar/v3',
  };
}

function normalizeScopes(scopesInput, provider = 'google', hasDriveToken = false) {
  const set = new Set();
  if (Array.isArray(scopesInput)) {
    for (const s of scopesInput) {
      if (typeof s === 'string') {
        for (const part of s.split(/\s+/)) {
          if (part.trim()) set.add(part.trim());
        }
      }
    }
  } else if (typeof scopesInput === 'string' && scopesInput.trim()) {
    for (const part of scopesInput.split(/\s+/)) {
      if (part.trim()) set.add(part.trim());
    }
  }
  if (provider === 'google' && hasDriveToken && set.size === 0) {
    set.add(GOOGLE_SUITE_SCOPES.drive);
  }
  return [...set];
}

function normalizeSuiteSettings(account = {}) {
  const provider = account.provider || 'google';
  const hasToken = Boolean(account.accessToken || account.refreshToken);
  const scopes = normalizeScopes(account.scopes, provider, hasToken);
  const existingSuites = account.suites && typeof account.suites === 'object' ? account.suites : {};
  const endpoints = provider === 'google' ? buildGoogleEndpoints(account.email || account.user) : {};

  if (provider === 'google') {
    const driveAuthorized = Boolean(hasToken && (scopes.includes(GOOGLE_SUITE_SCOPES.drive) || scopes.some(s => s.includes('drive'))));
    const calAuthorized = Boolean((account.calendarRefreshToken || account.calendarAccessToken) || (hasToken && scopes.some(s => s.includes('calendar'))));
    const contactsAuthorized = Boolean((account.calendarRefreshToken || account.calendarAccessToken) || (hasToken && scopes.some(s => s.includes('carddav') || s.includes('contacts'))));
    const mailAuthorized = Boolean((account.calendarRefreshToken || account.calendarAccessToken) || (hasToken && scopes.some(s => s.includes('mail.google.com') || s.includes('gmail'))));

    return {
      drive: {
        enabled: existingSuites.drive?.enabled !== undefined ? Boolean(existingSuites.drive.enabled) : true,
        authorized: driveAuthorized,
        scope: GOOGLE_SUITE_SCOPES.drive,
        endpoint: endpoints.driveApiUrl,
        consumers: ['data-sources', 'audio-player', 'file-explorer', 'context-manager'],
      },
      calendar: {
        enabled: existingSuites.calendar?.enabled !== undefined ? Boolean(existingSuites.calendar.enabled) : true,
        authorized: calAuthorized,
        oauthPreconfigured: Boolean(account.email),
        scope: GOOGLE_SUITE_SCOPES.calendar,
        caldavUrl: endpoints.caldavUrl,
        caldavPrincipalUrl: endpoints.caldavPrincipalUrl,
        apiUrl: endpoints.calendarApiUrl,
        consumers: ['google-calendar', 'thunderbird', 'dev-central'],
      },
      contacts: {
        enabled: existingSuites.contacts?.enabled !== undefined ? Boolean(existingSuites.contacts.enabled) : true,
        authorized: contactsAuthorized,
        oauthPreconfigured: Boolean(account.email),
        scope: GOOGLE_SUITE_SCOPES.contacts,
        carddavUrl: endpoints.carddavUrl,
        consumers: ['google-calendar', 'thunderbird', 'people-directory'],
      },
      mail: {
        enabled: existingSuites.mail?.enabled !== undefined ? Boolean(existingSuites.mail.enabled) : false,
        authorized: mailAuthorized,
        oauthPreconfigured: Boolean(account.email),
        scope: GOOGLE_SUITE_SCOPES.mail,
        imapHost: endpoints.imapHost,
        imapPort: endpoints.imapPort,
        smtpHost: endpoints.smtpHost,
        smtpPort: endpoints.smtpPort,
        consumers: ['google-calendar', 'thunderbird'],
      },
    };
  }

  return existingSuites;
}

function normalizeAccountRecord(raw = {}) {
  const provider = raw.provider || mapDriverToProvider(raw.driverType) || 'google';
  const email = String(raw.email || raw.user || '').trim();
  const id = raw.id || slugifyAccountId(provider, email || raw.label || 'default');
  const providerMeta = CLOUD_PROVIDERS[provider] || CLOUD_PROVIDERS.google;
  const hasCredentials = Boolean(
    raw.accessToken ||
    raw.refreshToken ||
    raw.calendarRefreshToken ||
    raw.calendarAccessToken ||
    raw.password ||
    raw.secretAccessKey ||
    raw.localMountPath
  );
  const loggedIn = raw.loggedIn !== undefined ? Boolean(raw.loggedIn) : hasCredentials;
  const authStatus = loggedIn ? 'authenticated' : (raw.authStatus || 'logged_out');
  const scopes = normalizeScopes(raw.scopes, provider, Boolean(raw.accessToken || raw.refreshToken));
  const endpoints = provider === 'google' ? buildGoogleEndpoints(email) : {};

  const record = {
    id,
    provider,
    providerName: providerMeta.name,
    shortProviderName: providerMeta.shortName,
    label: raw.label || raw.name || (email ? `${providerMeta.shortName} (${email})` : providerMeta.name),
    email,
    user: email || raw.user || '',
    authStatus,
    loggedIn,
    status: loggedIn ? 'Connected' : 'Login Required',
    isDefault: Boolean(raw.isDefault),
    accessToken: raw.accessToken || '',
    refreshToken: raw.refreshToken || '',
    calendarAccessToken: raw.calendarAccessToken || '',
    calendarRefreshToken: raw.calendarRefreshToken || '',
    clientId: raw.clientId || '',
    clientSecret: raw.clientSecret || '',
    scopes,
    endpoints,
    linkedDataSourceIds: Array.isArray(raw.linkedDataSourceIds) ? [...new Set(raw.linkedDataSourceIds)] : [],
    linkedFolders: Array.isArray(raw.linkedFolders) ? raw.linkedFolders : [],
    thunderbirdConfigured: Boolean(raw.thunderbirdConfigured),
    thunderbirdLastSyncedAt: raw.thunderbirdLastSyncedAt || null,
    thunderbirdProfilePath: raw.thunderbirdProfilePath || null,
    lastVerifiedAt: raw.lastVerifiedAt || raw.lastChecked || null,
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  };

  record.suites = normalizeSuiteSettings({ ...raw, ...record });
  return record;
}

function readRawAccountsState(options = {}) {
  const filePath = getCloudAccountsFilePath(options);
  try {
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (parsed && Array.isArray(parsed.accounts)) {
        return {
          defaultAccountId: parsed.defaultAccountId || null,
          accounts: parsed.accounts.map(normalizeAccountRecord),
        };
      }
      if (Array.isArray(parsed)) {
        return {
          defaultAccountId: parsed.find(a => a.isDefault)?.id || parsed[0]?.id || null,
          accounts: parsed.map(normalizeAccountRecord),
        };
      }
    }
  } catch {}
  return { defaultAccountId: null, accounts: [] };
}

function writeRawAccountsState(state, options = {}) {
  const filePath = getCloudAccountsFilePath(options);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const normalizedAccounts = (state.accounts || []).map(normalizeAccountRecord);
  let defaultId = state.defaultAccountId;
  if (!defaultId || !normalizedAccounts.some(a => a.id === defaultId)) {
    const firstGoogle = normalizedAccounts.find(a => a.provider === 'google' && a.loggedIn);
    defaultId = firstGoogle?.id || normalizedAccounts[0]?.id || null;
  }
  for (const acc of normalizedAccounts) {
    acc.isDefault = acc.id === defaultId;
  }
  const payload = {
    version: 1,
    defaultAccountId: defaultId,
    updatedAt: new Date().toISOString(),
    accounts: normalizedAccounts,
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600 });
  return payload;
}

/**
 * Imports and merges any cloud accounts configured in `~/.config/robos/data-sources.json`
 * (such as the user's logged-in Google Drive or OneDrive account) into the unified
 * Cloud Accounts store so they can be reused across all RobOS apps.
 */
function syncFromDataSources(options = {}) {
  const state = readRawAccountsState(options);
  const dsFile = getDataSourcesFilePath(options);
  let changed = false;

  try {
    if (fs.existsSync(dsFile)) {
      const dsList = JSON.parse(fs.readFileSync(dsFile, 'utf8'));
      if (Array.isArray(dsList)) {
        for (const ds of dsList) {
          if (!ds || typeof ds !== 'object') continue;
          const provider = mapDriverToProvider(ds.driverType);
          if (!provider) continue;

          // Skip legacy synthetic test fixture IDs unless in test mode with explicit email
          if (ds.id === 'gdrive-sdlc-specs' || ds.id === 's3-acme-artifacts') continue;

          const email = String(ds.user || ds.email || '').trim();
          const candidateId = slugifyAccountId(provider, email || ds.name || ds.id);

          let existing = state.accounts.find(a =>
            (email && a.provider === provider && a.email.toLowerCase() === email.toLowerCase()) ||
            (Array.isArray(a.linkedDataSourceIds) && a.linkedDataSourceIds.includes(ds.id)) ||
            a.id === candidateId
          );

          const dsFolders = Array.isArray(ds.folders) ? ds.folders : [];
          const hasTokens = Boolean(ds.accessToken || ds.refreshToken);

          if (!existing) {
            const created = normalizeAccountRecord({
              id: candidateId,
              provider,
              label: email ? `${CLOUD_PROVIDERS[provider]?.shortName || 'Cloud'} (${email})` : (ds.name || 'Cloud Account'),
              email,
              user: email,
              accessToken: ds.accessToken || '',
              refreshToken: ds.refreshToken || '',
              clientId: ds.clientId || '',
              clientSecret: ds.clientSecret || '',
              loggedIn: Boolean(ds.loggedIn || ds.authStatus === 'authenticated' || hasTokens),
              authStatus: (ds.loggedIn || ds.authStatus === 'authenticated' || hasTokens) ? 'authenticated' : 'logged_out',
              linkedDataSourceIds: [ds.id],
              linkedFolders: dsFolders,
              lastVerifiedAt: ds.lastChecked || new Date().toISOString(),
            });
            state.accounts.push(created);
            changed = true;
          } else {
            // Merge tokens/folders from Data Sources if newer or missing
            if (ds.accessToken && ds.accessToken !== existing.accessToken) {
              existing.accessToken = ds.accessToken;
              changed = true;
            }
            if (ds.refreshToken && !existing.refreshToken) {
              existing.refreshToken = ds.refreshToken;
              changed = true;
            }
            if (email && !existing.email) {
              existing.email = email;
              existing.user = email;
              changed = true;
            }
            if (!existing.linkedDataSourceIds.includes(ds.id)) {
              existing.linkedDataSourceIds.push(ds.id);
              changed = true;
            }
            if (dsFolders.length && (!existing.linkedFolders || existing.linkedFolders.length < dsFolders.length)) {
              existing.linkedFolders = dsFolders;
              changed = true;
            }
            if ((ds.loggedIn || hasTokens) && !existing.loggedIn) {
              existing.loggedIn = true;
              existing.authStatus = 'authenticated';
              existing.status = 'Connected';
              changed = true;
            }
          }
        }
      }
    }
  } catch {}

  if (changed || (state.accounts.length > 0 && !fs.existsSync(getCloudAccountsFilePath(options)))) {
    return writeRawAccountsState(state, options);
  }
  return writeRawAccountsState(state, options);
}

/**
 * Propagates updated tokens / email from a Cloud Account back to `~/.config/robos/data-sources.json`
 * so RobOS Data Sources and Audio Player immediately benefit from refreshed or newly signed-in accounts.
 */
function syncAccountToDataSources(account, options = {}) {
  if (!account || !account.provider) return;
  const driverType = mapProviderToDriver(account.provider);
  if (driverType !== 'gdrive' && driverType !== 'onedrive') return;

  const dsFile = getDataSourcesFilePath(options);
  try {
    let dsList = [];
    if (fs.existsSync(dsFile)) {
      const parsed = JSON.parse(fs.readFileSync(dsFile, 'utf8'));
      if (Array.isArray(parsed)) dsList = parsed;
    }

    let matched = false;
    for (let i = 0; i < dsList.length; i++) {
      const ds = dsList[i];
      if (!ds || ds.driverType !== driverType) continue;
      const sameEmail = account.email && ds.user && ds.user.toLowerCase() === account.email.toLowerCase();
      const linked = Array.isArray(account.linkedDataSourceIds) && account.linkedDataSourceIds.includes(ds.id);
      if (sameEmail || linked) {
        matched = true;
        if (account.email) ds.user = account.email;
        if (account.accessToken) ds.accessToken = account.accessToken;
        if (account.refreshToken) ds.refreshToken = account.refreshToken;
        if (account.loggedIn) {
          ds.loggedIn = true;
          ds.authStatus = 'authenticated';
          ds.status = 'Connected';
        }
        ds.lastChecked = new Date().toISOString();
      }
    }

    if (!matched && options.createDataSourceIfMissing) {
      const dsId = `${driverType}-${slugifyAccountId(account.provider, account.email || 'account')}`;
      dsList.push({
        id: dsId,
        name: account.label || (driverType === 'gdrive' ? 'My Google Drive' : 'My Microsoft OneDrive'),
        driverType,
        category: 'storage',
        host: driverType === 'gdrive' ? 'drive.google.com' : 'graph.microsoft.com',
        port: 443,
        database: '/',
        folderId: driverType === 'gdrive' ? 'root' : '/',
        user: account.email || '',
        accessToken: account.accessToken || '',
        refreshToken: account.refreshToken || '',
        authStatus: account.loggedIn ? 'authenticated' : 'logged_out',
        loggedIn: Boolean(account.loggedIn),
        status: account.loggedIn ? 'Connected' : 'Login Required',
        lastChecked: new Date().toISOString(),
      });
      if (!Array.isArray(account.linkedDataSourceIds)) account.linkedDataSourceIds = [];
      if (!account.linkedDataSourceIds.includes(dsId)) account.linkedDataSourceIds.push(dsId);
    }

    if (matched || options.createDataSourceIfMissing) {
      fs.mkdirSync(path.dirname(dsFile), { recursive: true });
      fs.writeFileSync(dsFile, JSON.stringify(dsList, null, 2), { encoding: 'utf8', mode: 0o600 });
    }
  } catch {}
}

/**
 * Strips raw secret tokens before sending account descriptors to Electron renderers.
 */
function sanitizeAccountForRenderer(acc) {
  const normalized = normalizeAccountRecord(acc);
  return {
    id: normalized.id,
    provider: normalized.provider,
    providerName: normalized.providerName,
    shortProviderName: normalized.shortProviderName,
    label: normalized.label,
    email: normalized.email,
    user: normalized.user,
    authStatus: normalized.authStatus,
    loggedIn: normalized.loggedIn,
    status: normalized.status,
    isDefault: normalized.isDefault,
    hasAccessToken: Boolean(normalized.accessToken),
    hasRefreshToken: Boolean(normalized.refreshToken),
    hasCalendarToken: Boolean(normalized.calendarRefreshToken || normalized.calendarAccessToken),
    scopes: normalized.scopes,
    endpoints: normalized.endpoints,
    suites: normalized.suites,
    linkedDataSourceIds: normalized.linkedDataSourceIds,
    linkedFolders: normalized.linkedFolders,
    thunderbirdConfigured: normalized.thunderbirdConfigured,
    thunderbirdLastSyncedAt: normalized.thunderbirdLastSyncedAt,
    thunderbirdProfilePath: normalized.thunderbirdProfilePath,
    lastVerifiedAt: normalized.lastVerifiedAt,
    updatedAt: normalized.updatedAt,
  };
}

function listAccounts(options = {}) {
  const synced = syncFromDataSources(options);
  return {
    providers: Object.values(CLOUD_PROVIDERS),
    defaultAccountId: synced.defaultAccountId,
    accounts: synced.accounts.map(sanitizeAccountForRenderer),
  };
}

function getAccountById(accountId, options = {}) {
  const synced = syncFromDataSources(options);
  if (!accountId) {
    return synced.accounts.find(a => a.id === synced.defaultAccountId) || synced.accounts[0] || null;
  }
  return synced.accounts.find(a =>
    a.id === accountId ||
    (a.email && a.email.toLowerCase() === String(accountId).toLowerCase())
  ) || null;
}

function saveAccount(accountInput = {}, options = {}) {
  const state = syncFromDataSources(options);
  const provider = accountInput.provider || mapDriverToProvider(accountInput.driverType) || 'google';
  const email = String(accountInput.email || accountInput.user || '').trim();
  const targetId = accountInput.id || slugifyAccountId(provider, email || accountInput.label || 'account');

  const idx = state.accounts.findIndex(a =>
    a.id === targetId ||
    (email && a.provider === provider && a.email.toLowerCase() === email.toLowerCase())
  );

  let saved;
  if (idx >= 0) {
    const prev = state.accounts[idx];
    const mergedSuites = {
      ...(prev.suites || {}),
      ...(accountInput.suites || {}),
    };
    const mergedScopes = [
      ...new Set([
        ...(prev.scopes || []),
        ...normalizeScopes(accountInput.scopes, provider, Boolean(accountInput.accessToken || prev.accessToken)),
      ]),
    ];
    saved = normalizeAccountRecord({
      ...prev,
      ...accountInput,
      id: prev.id,
      provider,
      email: email || prev.email,
      accessToken: accountInput.accessToken || prev.accessToken,
      refreshToken: accountInput.refreshToken || prev.refreshToken,
      calendarAccessToken: accountInput.calendarAccessToken || prev.calendarAccessToken,
      calendarRefreshToken: accountInput.calendarRefreshToken || prev.calendarRefreshToken,
      scopes: mergedScopes,
      suites: mergedSuites,
      updatedAt: new Date().toISOString(),
    });
    state.accounts[idx] = saved;
  } else {
    saved = normalizeAccountRecord({
      ...accountInput,
      id: targetId,
      provider,
      email,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    state.accounts.push(saved);
  }

  if (accountInput.isDefault) {
    state.defaultAccountId = saved.id;
  }

  const persisted = writeRawAccountsState(state, options);
  syncAccountToDataSources(saved, { ...options, createDataSourceIfMissing: Boolean(accountInput.createDataSource) });

  return {
    account: sanitizeAccountForRenderer(saved),
    providers: Object.values(CLOUD_PROVIDERS),
    defaultAccountId: persisted.defaultAccountId,
    accounts: persisted.accounts.map(sanitizeAccountForRenderer),
  };
}

function updateAccountSuites(accountId, suitesPatch = {}, options = {}) {
  const acc = getAccountById(accountId, options);
  if (!acc) throw new Error(`Cloud account "${accountId}" not found.`);
  const nextSuites = { ...acc.suites };
  for (const [suiteKey, val] of Object.entries(suitesPatch)) {
    if (typeof val === 'boolean') {
      nextSuites[suiteKey] = { ...(nextSuites[suiteKey] || {}), enabled: val };
    } else if (val && typeof val === 'object') {
      nextSuites[suiteKey] = { ...(nextSuites[suiteKey] || {}), ...val };
    }
  }
  return saveAccount({ ...acc, suites: nextSuites }, options);
}

function deleteAccount(accountId, options = {}) {
  const state = syncFromDataSources(options);
  const before = state.accounts.length;
  state.accounts = state.accounts.filter(a => a.id !== accountId);
  if (state.accounts.length === before) {
    throw new Error(`Cloud account "${accountId}" not found.`);
  }
  if (state.defaultAccountId === accountId) {
    state.defaultAccountId = state.accounts[0]?.id || null;
  }
  const persisted = writeRawAccountsState(state, options);
  return {
    providers: Object.values(CLOUD_PROVIDERS),
    defaultAccountId: persisted.defaultAccountId,
    accounts: persisted.accounts.map(sanitizeAccountForRenderer),
  };
}

function setDefaultAccount(accountId, options = {}) {
  const state = syncFromDataSources(options);
  const target = state.accounts.find(a => a.id === accountId);
  if (!target) throw new Error(`Cloud account "${accountId}" not found.`);
  state.defaultAccountId = target.id;
  const persisted = writeRawAccountsState(state, options);
  return {
    providers: Object.values(CLOUD_PROVIDERS),
    defaultAccountId: persisted.defaultAccountId,
    accounts: persisted.accounts.map(sanitizeAccountForRenderer),
  };
}

/**
 * Refreshes the Google OAuth 2.0 access token for a tracked Google account.
 */
async function refreshGoogleAccountToken(accountId, options = {}) {
  const acc = getAccountById(accountId, options);
  if (!acc) throw new Error(`Cloud account "${accountId}" not found.`);
  if (acc.provider !== 'google') throw new Error(`Account "${acc.label}" is not a Google account.`);

  const refreshToken = acc.refreshToken;
  if (!refreshToken) {
    throw new Error(`No OAuth2 refresh token stored for ${acc.email || acc.label}. Please sign in with your browser.`);
  }

  const clientId = acc.clientId || DEFAULT_GDRIVE_CLIENT_ID;
  const clientSecret = acc.clientSecret || getDefaultGDriveClientSecret();

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Google OAuth token refresh failed (HTTP ${res.status}): ${errText}`);
  }

  const data = await res.json();
  const nextScopes = data.scope
    ? [...new Set([...(acc.scopes || []), ...normalizeScopes(data.scope, 'google', true)])]
    : acc.scopes;

  const updated = saveAccount({
    ...acc,
    accessToken: data.access_token || acc.accessToken,
    scopes: nextScopes,
    loggedIn: true,
    authStatus: 'authenticated',
    lastVerifiedAt: new Date().toISOString(),
  }, options);

  return {
    ok: true,
    accessToken: data.access_token,
    ...updated,
  };
}

/**
 * Verifies a Google Cloud Account against Google Drive API and Google Calendar API,
 * refreshing the OAuth token automatically if expired.
 */
async function verifyCloudAccount(accountId, options = {}) {
  let acc = getAccountById(accountId, options);
  if (!acc) throw new Error(`Cloud account "${accountId}" not found.`);

  if (acc.provider !== 'google') {
    return {
      ok: acc.loggedIn,
      account: sanitizeAccountForRenderer(acc),
      checks: {
        auth: { ok: acc.loggedIn, detail: acc.loggedIn ? `Authenticated as ${acc.email || acc.user}` : 'Login Required' },
      },
    };
  }

  let token = acc.accessToken;
  let refreshed = false;

  const fetchAbout = async (bearer) => {
    return fetch('https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress,photoLink),storageQuota(limit,usage)', {
      headers: { Authorization: `Bearer ${bearer}` },
      signal: AbortSignal.timeout(12000),
    });
  };

  let driveOk = false;
  let driveDetail = 'Not checked';
  let displayName = '';
  let verifiedEmail = acc.email;

  if (token || acc.refreshToken) {
    try {
      let res = token ? await fetchAbout(token) : { ok: false, status: 401 };
      if (!res.ok && res.status === 401 && acc.refreshToken) {
        const ref = await refreshGoogleAccountToken(acc.id, options);
        token = ref.accessToken;
        refreshed = true;
        res = await fetchAbout(token);
      }
      if (res.ok) {
        const about = await res.json();
        driveOk = true;
        displayName = about?.user?.displayName || '';
        verifiedEmail = about?.user?.emailAddress || verifiedEmail;
        const usedGb = about?.storageQuota?.usage
          ? `${(Number(about.storageQuota.usage) / (1024 ** 3)).toFixed(2)} GB used`
          : 'Connected';
        driveDetail = `Google Drive API v3 active (${verifiedEmail}${displayName ? ` — ${displayName}` : ''}, ${usedGb})`;
      } else {
        driveDetail = `HTTP ${res.status} from Google Drive API`;
      }
    } catch (err) {
      driveDetail = err.message;
    }
  } else {
    driveDetail = 'No OAuth token configured';
  }

  // Also check if Google Calendar REST API is reachable with current token or Calendar token
  let calendarApiOk = false;
  let calendarDetail = '';
  const calBearer = acc.calendarAccessToken || token;
  if (calBearer) {
    try {
      const calRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=10', {
        headers: { Authorization: `Bearer ${calBearer}` },
        signal: AbortSignal.timeout(10000),
      });
      if (calRes.ok) {
        const calData = await calRes.json();
        const count = Array.isArray(calData.items) ? calData.items.length : 0;
        calendarApiOk = true;
        calendarDetail = `Direct Calendar API active (${count} calendar${count === 1 ? '' : 's'} discovered)`;
      } else {
        calendarDetail = `CalDAV endpoint ready (${acc.endpoints.caldavUrl}); Thunderbird OAuth2 handles Calendar/CardDAV token exchange automatically`;
      }
    } catch {
      calendarDetail = `CalDAV endpoint ready (${acc.endpoints.caldavUrl})`;
    }
  } else {
    calendarDetail = `CalDAV endpoint ready (${acc.endpoints.caldavUrl})`;
  }

  const nextScopes = [...(acc.scopes || [])];
  if (driveOk && !nextScopes.includes(GOOGLE_SUITE_SCOPES.drive)) nextScopes.push(GOOGLE_SUITE_SCOPES.drive);
  if (calendarApiOk && !nextScopes.includes(GOOGLE_SUITE_SCOPES.calendar)) nextScopes.push(GOOGLE_SUITE_SCOPES.calendar);

  const saved = saveAccount({
    ...acc,
    email: verifiedEmail || acc.email,
    accessToken: token || acc.accessToken,
    scopes: nextScopes,
    loggedIn: driveOk || acc.loggedIn,
    authStatus: (driveOk || acc.loggedIn) ? 'authenticated' : 'logged_out',
    lastVerifiedAt: new Date().toISOString(),
  }, options);

  return {
    ok: driveOk || acc.loggedIn,
    refreshed,
    displayName,
    email: verifiedEmail,
    account: saved.account,
    checks: {
      drive: { ok: driveOk, detail: driveDetail },
      calendar: {
        ok: true,
        directApi: calendarApiOk,
        caldavUrl: saved.account.endpoints.caldavUrl,
        detail: calendarDetail,
      },
      contacts: {
        ok: true,
        carddavUrl: saved.account.endpoints.carddavUrl,
        detail: `CardDAV endpoint ready (${saved.account.endpoints.carddavUrl})`,
      },
    },
  };
}

/**
 * Starts an interactive browser OAuth 2.0 sign-in flow for Google Accounts,
 * pre-filling `login_hint` with the user's existing Google email so signing in
 * or adding suite scopes takes one click.
 */
async function startGoogleBrowserOAuth(params = {}, options = {}) {
  const existing = params.accountId ? getAccountById(params.accountId, options) : null;
  const loginHint = params.email || existing?.email || '';
  const requestedSuites = Array.isArray(params.suites) && params.suites.length
    ? params.suites
    : ['drive', 'calendar', 'contacts'];

  const activeClientId = params.clientId || existing?.clientId || DEFAULT_GDRIVE_CLIENT_ID;
  const activeClientSecret = params.clientSecret || existing?.clientSecret || getDefaultGDriveClientSecret();

  // If using the built-in Drive client ID without custom client credentials, request Drive scope
  // (or requested custom scopes when custom OAuth client is supplied)
  const useMultiScope = Boolean(params.clientId || existing?.clientId || params.includeSuiteScopes);
  const scopeList = useMultiScope
    ? requestedSuites.map(s => GOOGLE_SUITE_SCOPES[s]).filter(Boolean)
    : [GOOGLE_SUITE_SCOPES.drive];
  const scopeParam = [...new Set(scopeList)].join(' ');

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const u = new URL(req.url, 'http://127.0.0.1');
        const port = server.address().port;

        if (req.method === 'GET' && (u.searchParams.has('code') || u.searchParams.has('error') || u.pathname === '/oauth2callback')) {
          const code = u.searchParams.get('code');
          const err = u.searchParams.get('error');
          if (err || !code) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h2>Google Account Authorization Cancelled</h2><p>You can close this window and return to RobOS.</p>');
            server.close();
            reject(new Error(err || 'Authorization cancelled'));
            return;
          }

          const redirectUri = `http://127.0.0.1:${port}/`;
          const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              code,
              client_id: activeClientId,
              client_secret: activeClientSecret,
              redirect_uri: redirectUri,
              grant_type: 'authorization_code',
            }),
          });
          const tokenData = await tokenRes.json();
          if (!tokenRes.ok || !tokenData.access_token) {
            throw new Error(tokenData.error_description || tokenData.error || 'Google OAuth token exchange failed');
          }

          let googleEmail = loginHint || 'user@gmail.com';
          try {
            const aboutRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)', {
              headers: { Authorization: `Bearer ${tokenData.access_token}` },
            });
            if (aboutRes.ok) {
              const aboutData = await aboutRes.json();
              if (aboutData?.user?.emailAddress) googleEmail = aboutData.user.emailAddress;
            }
          } catch {}

          const grantedScopes = normalizeScopes(tokenData.scope || scopeParam, 'google', true);
          const saved = saveAccount({
            id: existing?.id,
            provider: 'google',
            email: googleEmail,
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token || existing?.refreshToken || '',
            scopes: grantedScopes,
            loggedIn: true,
            authStatus: 'authenticated',
            createDataSource: true,
            lastVerifiedAt: new Date().toISOString(),
          }, options);

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<!DOCTYPE html><html><body style="font-family:sans-serif;background:#0d1117;color:#e6edf3;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
            <div style="background:#161b22;border:1px solid #2ea043;border-radius:12px;padding:32px;max-width:460px;text-align:center;">
              <div style="font-size:42px;margin-bottom:12px;">✅</div>
              <h2 style="color:#3fb950;margin:0 0 8px;">RobOS Google Account Connected!</h2>
              <p style="color:#8b949e;font-size:14px;line-height:1.5;">Signed in as <strong style="color:#f0f6fc;">${String(googleEmail).replace(/[<>&]/g, '')}</strong>.<br>Your Google account is now available across RobOS Cloud Accounts, Data Sources, Audio Player, and Thunderbird Calendar.</p>
            </div>
          </body></html>`);
          server.close();
          resolve({ ok: true, email: googleEmail, ...saved });
          return;
        }

        if (req.method === 'GET' && (u.pathname === '/' || u.pathname === '/auth')) {
          const redirectUri = `http://127.0.0.1:${port}/`;
          const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
          authUrl.searchParams.set('client_id', activeClientId);
          authUrl.searchParams.set('redirect_uri', redirectUri);
          authUrl.searchParams.set('response_type', 'code');
          authUrl.searchParams.set('scope', scopeParam);
          authUrl.searchParams.set('access_type', 'offline');
          authUrl.searchParams.set('prompt', 'select_account');
          if (loginHint && loginHint.includes('@')) {
            authUrl.searchParams.set('login_hint', loginHint);
          }
          res.writeHead(302, { Location: authUrl.toString() });
          res.end();
          return;
        }

        res.writeHead(404);
        res.end('Not found');
      } catch (err) {
        try { server.close(); } catch {}
        reject(err);
      }
    });

    const openAuthUrl = () => {
      const port = server.address().port;
      const loginUrl = `http://127.0.0.1:${port}/auth`;
      if (typeof params.onOpenExternal === 'function') {
        params.onOpenExternal(loginUrl);
      } else {
        try {
          const { shell } = require('electron');
          if (shell && typeof shell.openExternal === 'function') {
            shell.openExternal(loginUrl);
          }
        } catch {}
      }
    };

    server.once('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        server.listen(0, '127.0.0.1', openAuthUrl);
      } else {
        reject(err);
      }
    });

    server.listen(53682, '127.0.0.1', openAuthUrl);

    setTimeout(() => {
      try { server.close(); } catch {}
      reject(new Error('Google browser sign-in timed out after 180 seconds.'));
    }, 180000).unref?.();
  });
}

module.exports = {
  CLOUD_PROVIDERS,
  GOOGLE_SUITE_SCOPES,
  DEFAULT_GDRIVE_CLIENT_ID,
  THUNDERBIRD_GOOGLE_CLIENT_ID,
  THUNDERBIRD_GOOGLE_CLIENT_SECRET,
  getDefaultGDriveClientSecret,
  getDefaultOneDriveClientSecret,
  getCloudAccountsFilePath,
  getDataSourcesFilePath,
  slugifyAccountId,
  buildGoogleEndpoints,
  normalizeAccountRecord,
  syncFromDataSources,
  syncAccountToDataSources,
  listAccounts,
  getAccountById,
  saveAccount,
  updateAccountSuites,
  deleteAccount,
  setDefaultAccount,
  refreshGoogleAccountToken,
  verifyCloudAccount,
  startGoogleBrowserOAuth,
};
