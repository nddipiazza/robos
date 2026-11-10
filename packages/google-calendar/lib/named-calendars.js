'use strict';

/**
 * RobOS Google Calendar — Named & Shared Calendars + Live Google CalDAV / REST Event Engine.
 *
 * Capabilities:
 *   1. Discovers all of a user's Google Calendars by name via Google CalDAV v2 PROPFIND
 *      (`https://apidata.googleusercontent.com/caldav/v2/{email}/`, Depth: 1) and/or
 *      Google Calendar REST API v3 (`/calendar/v3/users/me/calendarList`).
 *   2. Manages custom Named Calendar display aliases, colors, default calendar selection,
 *      and shared family member associations in `~/.config/robos/google-calendar-settings.json`.
 *   3. Syncs all Named Google Calendars (`Primary`, `Family`, `Holidays in United States`, etc.)
 *      into Mozilla Thunderbird's `user.js` (`additionalCalendars`).
 *   4. Creates & deletes rich Google Calendar events (Title, Named Calendar, All-Day or Timed,
 *      Timezone, Location, Recurrence RRULE, Family/Guest Attendees, Reminders, Meeting Link,
 *      Description) directly on Google Calendar via CalDAV `PUT` (`.ics`) and local store.
 *   5. Parses natural-language / dictated voice requests into structured calendar event fields,
 *      automatically resolving RobOS Family members from `robos-lib/people-store`.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

function requireRobosLib(modName) {
  const candidates = [
    process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, modName),
    path.resolve(__dirname, '..', '..', 'robos-lib', modName),
    `/usr/local/share/robos/robos-lib/${modName}`,
  ].filter(Boolean);
  for (const p of candidates) {
    try { return require(p); } catch {}
  }
  throw new Error(`RobOS shared module "${modName}" not found.`);
}

const cloudAccounts = requireRobosLib('cloud-accounts');
const thunderbirdGoogle = requireRobosLib('thunderbird-google');
let peopleStore = null;
try {
  peopleStore = requireRobosLib('people-store');
} catch {}

function getHomeDir(options = {}) {
  return options.homeDir || process.env.HOME || os.homedir();
}

function getConfigDir(options = {}) {
  return options.configDir || process.env.ROBOS_CONFIG_DIR || path.join(getHomeDir(options), '.config', 'robos');
}

function getSettingsFilePath(options = {}) {
  return path.join(getConfigDir(options), 'google-calendar-settings.json');
}

function loadCalendarSettings(options = {}) {
  const fp = getSettingsFilePath(options);
  let raw = {};
  try {
    if (fs.existsSync(fp)) {
      raw = JSON.parse(fs.readFileSync(fp, 'utf8')) || {};
    }
  } catch {}
  let changed = false;
  if (!raw.webAuthToken) {
    raw.webAuthToken = crypto.randomBytes(32).toString('hex');
    changed = true;
  }
  if (!raw.calendarOverrides || typeof raw.calendarOverrides !== 'object') {
    raw.calendarOverrides = {};
  }
  if (!Array.isArray(raw.customCalendars)) {
    raw.customCalendars = [];
  }
  if (!raw.accessDoc || typeof raw.accessDoc !== 'object') {
    raw.accessDoc = {};
  }
  if (changed) {
    saveCalendarSettings(raw, options);
  }
  return raw;
}

function saveCalendarSettings(settings, options = {}) {
  const fp = getSettingsFilePath(options);
  try {
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, JSON.stringify(settings, null, 2), 'utf8');
  } catch {}
  return settings;
}

function updateCalendarSettings(patch = {}, options = {}) {
  const current = loadCalendarSettings(options);
  const next = {
    ...current,
    ...patch,
    calendarOverrides: {
      ...(current.calendarOverrides || {}),
      ...(patch.calendarOverrides || {}),
    },
    accessDoc: {
      ...(current.accessDoc || {}),
      ...(patch.accessDoc || {}),
    },
  };
  return saveCalendarSettings(next, options);
}

/**
 * Normalizes 8-char ICAL colors like `#FFAD46FF` to 6-char `#ffad46`.
 */
function normalizeHexColor(input, fallback = '#00bcd4') {
  const s = String(input || '').trim();
  const m6 = s.match(/^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/);
  if (m6) return `#${m6[1].toLowerCase()}`;
  return fallback;
}

/**
 * Returns all family/household members from `~/.config/robos/people/*.json`.
 */
function listFamilyMembers(options = {}) {
  const configDir = getConfigDir(options);
  if (peopleStore && typeof peopleStore.listFamilyPeople === 'function') {
    const list = peopleStore.listFamilyPeople({ configDir, includePhotoDataUrl: false, seedDefaults: false });
    if (list.length > 0) {
      return list.map((p) => ({
        uid: p.uid,
        name: p.displayName || `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.uid,
        firstName: p.firstName || '',
        lastName: p.lastName || '',
        nickname: p.nickname || p.firstName || '',
        email: p.email || '',
        avatar: p.avatar || '👤',
        color: p.color || '#00bcd4',
        role: p.relationshipRole || p.title || '',
        birthday: p.birthday || '',
        age: p.age || null,
        summary: p.robosPersonalitySummary || p.bio || '',
      }));
    }
  }
  // Fallback direct directory read
  const peopleDir = path.join(configDir, 'people');
  if (!fs.existsSync(peopleDir)) return [];
  return fs.readdirSync(peopleDir)
    .filter((f) => f.endsWith('.json') && f !== 'config.json')
    .map((f) => {
      try {
        const p = JSON.parse(fs.readFileSync(path.join(peopleDir, f), 'utf8'));
        return {
          uid: p.uid || path.basename(f, '.json'),
          name: p.displayName || `${p.firstName || ''} ${p.lastName || ''}`.trim() || p.uid,
          firstName: p.firstName || '',
          lastName: p.lastName || '',
          nickname: p.nickname || p.firstName || '',
          email: p.email || '',
          avatar: p.avatar || '👤',
          color: p.color || '#00bcd4',
          role: p.relationshipRole || p.title || '',
          birthday: p.birthday || '',
          age: p.age || null,
          summary: p.robosPersonalitySummary || p.bio || '',
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Retrieves a valid Google CalDAV OAuth2 access token from Thunderbird's NSS store
 * (or `/tmp/robos-tb-oauth-token-cache.json`).
 */
function getCaldavAccessToken(email, options = {}) {
  if (options.caldavAccessToken) return options.caldavAccessToken;
  if (process.env.ROBOS_TEST === '1' || process.env.ROBOS_TEST_MODE === '1') {
    return options.mockCaldavToken || '';
  }

  const tokenCachePath = path.join(os.tmpdir(), 'robos-tb-oauth-token-cache.json');
  const nowSec = Math.floor(Date.now() / 1000);
  const emailKey = String(email || '').trim().toLowerCase();

  try {
    if (fs.existsSync(tokenCachePath)) {
      const cache = JSON.parse(fs.readFileSync(tokenCachePath, 'utf8'));
      const entry = (emailKey && cache[emailKey]) || Object.values(cache)[0];
      if (entry && entry.access_token && Number(entry.expires_at || 0) > nowSec + 60) {
        return entry.access_token;
      }
    }
  } catch {}

  const tbStatus = thunderbirdGoogle.detectThunderbird(options);
  const profilePath = tbStatus?.primaryProfilePath;
  if (!profilePath) return '';
  const loginsPath = path.join(profilePath, 'logins.json');
  const keyDbPath = path.join(profilePath, 'key4.db');
  if (!fs.existsSync(loginsPath) || !fs.existsSync(keyDbPath)) return '';

  const pyScript = `
import ctypes, json, base64, os, sys, time, urllib.request, urllib.parse

prof = sys.argv[1]
token_cache_file = sys.argv[2]
target_email = sys.argv[3].lower()

class SECItem(ctypes.Structure):
    _fields_ = [("type", ctypes.c_uint), ("data", ctypes.c_char_p), ("len", ctypes.c_uint)]

nss = ctypes.CDLL("libnss3.so")
if nss.NSS_Init(prof.encode("utf-8")) != 0:
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
        if "calendar" in realm or "caldav" in realm or "google" in realm.lower():
            u = decrypt(l.get("encryptedUsername", ""))
            rt = decrypt(l.get("encryptedPassword", ""))
            if u and rt:
                refresh_tokens[u.lower()] = rt
finally:
    nss.NSS_Shutdown()

if not refresh_tokens:
    sys.exit(0)

tok_cache = {}
if os.path.exists(token_cache_file):
    try:
        with open(token_cache_file, "r", encoding="utf-8") as f:
            tok_cache = json.load(f)
    except Exception:
        tok_cache = {}

now_ts = int(time.time())
chosen = ""
for u_lower, rt in refresh_tokens.items():
    try:
        data = urllib.parse.urlencode({
            "client_id": "406964657835-aq8lmia8j95dhl1a2bvharmfk3t1hgqj.apps.googleusercontent.com",
            "client_secret": "kSmqreRr0qwBWJgbf5Y-PjSU",
            "refresh_token": rt,
            "grant_type": "refresh_token",
        }).encode("utf-8")
        req = urllib.request.Request("https://www.googleapis.com/oauth2/v3/token", data=data)
        resp = json.loads(urllib.request.urlopen(req, timeout=5).read().decode("utf-8"))
        at = resp.get("access_token")
        if at:
            tok_cache[u_lower] = {
                "access_token": at,
                "expires_at": now_ts + int(resp.get("expires_in", 3500)),
            }
            if not chosen or u_lower == target_email:
                chosen = at
    except Exception:
        pass

try:
    with open(token_cache_file, "w", encoding="utf-8") as f:
        json.dump(tok_cache, f)
except Exception:
    pass

print(chosen)
`;

  try {
    const out = execFileSync('python3', ['-c', pyScript, profilePath, tokenCachePath, emailKey], {
      encoding: 'utf8',
      timeout: 6000,
    }).trim();
    return out || '';
  } catch {
    return '';
  }
}

/**
 * Parses a CalDAV Depth:1 PROPFIND XML response from `/caldav/v2/{email}/` into Named Calendar descriptors.
 */
function parseCaldavCalendarHomeXml(xmlText, ownerEmail = '') {
  const raw = String(xmlText || '');
  const responses = raw.split(/<[A-Za-z0-9_:-]*response\b[^>]*>/i).slice(1);
  const calendars = [];
  const lowerOwner = String(ownerEmail || '').trim().toLowerCase();

  for (const chunk of responses) {
    const body = chunk.split(/<\/[A-Za-z0-9_:-]*response>/i)[0] || '';
    // Must be a <caldav:calendar/> resource (not schedule-inbox/outbox or principal)
    if (!/<[A-Za-z0-9_:-]*calendar\s*\/>/i.test(body)) continue;

    const hrefMatch = body.match(/<[A-Za-z0-9_:-]*href[^>]*>([^<]+)<\/[A-Za-z0-9_:-]*href>/i);
    if (!hrefMatch) continue;
    const href = hrefMatch[1].trim();
    const calIdMatch = href.match(/\/caldav\/v2\/([^/]+)\/events\/?/i);
    if (!calIdMatch) continue;
    const calId = decodeURIComponent(calIdMatch[1]);

    const nameMatch = body.match(/<[A-Za-z0-9_:-]*displayname[^>]*>([^<]*)<\/[A-Za-z0-9_:-]*displayname>/i);
    const descMatch = body.match(/<[A-Za-z0-9_:-]*calendar-description[^>]*>([^<]*)<\/[A-Za-z0-9_:-]*calendar-description>/i);
    const colorMatch = body.match(/<[A-Za-z0-9_:-]*calendar-color[^>]*>([^<]*)<\/[A-Za-z0-9_:-]*calendar-color>/i);
    const isShared = /<[A-Za-z0-9_:-]*shared\s*\/>/i.test(body) || calId.includes('@group.calendar.google.com');
    const isPrimary = calId.toLowerCase() === lowerOwner;
    const isVirtualHoliday = calId.includes('@virtual') || calId.includes('#holiday@');
    const writable = !isVirtualHoliday;

    const rawName = (nameMatch ? nameMatch[1].trim() : '') || calId;
    const friendlyDefaultName = isPrimary && rawName.toLowerCase() === lowerOwner
      ? `Primary (${ownerEmail})`
      : rawName;

    calendars.push({
      id: calId,
      name: friendlyDefaultName,
      originalSummary: rawName,
      description: descMatch ? descMatch[1].trim() : '',
      color: normalizeHexColor(colorMatch ? colorMatch[1] : '', isPrimary ? '#00bcd4' : isShared ? '#f59e0b' : '#10b981'),
      backgroundColor: normalizeHexColor(colorMatch ? colorMatch[1] : '', isPrimary ? '#00bcd4' : isShared ? '#f59e0b' : '#10b981'),
      primary: isPrimary,
      shared: isShared,
      writable,
      accessRole: isPrimary ? 'owner' : writable ? 'writer' : 'reader',
      caldavUrl: `https://apidata.googleusercontent.com/caldav/v2/${encodeURIComponent(calId)}/events/`,
      source: 'google-caldav',
    });
  }

  // Sort: Primary first, then Family / writable shared calendars, then read-only calendars
  calendars.sort((a, b) => {
    const score = (c) => {
      if (c.primary) return 0;
      if (/family/i.test(c.name)) return 1;
      if (c.writable) return 2;
      return 3;
    };
    return score(a) - score(b) || a.name.localeCompare(b.name);
  });

  return calendars;
}

/**
 * Discovers all Named Google Calendars for the selected Google account.
 */
async function discoverNamedCalendars(accountIdOrEmail = null, options = {}) {
  const state = cloudAccounts.listAccounts(options);
  const googleAccounts = (state.accounts || []).filter((a) => a.provider === 'google');
  const account = (accountIdOrEmail && googleAccounts.find((a) => a.id === accountIdOrEmail || a.email === accountIdOrEmail))
    || googleAccounts.find((a) => a.id === state.defaultAccountId)
    || googleAccounts[0]
    || null;

  const email = account?.email || 'you@example.com';
  const settings = loadCalendarSettings(options);
  const familyMembers = listFamilyMembers(options);
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  let discovered = [];

  // 1. Try CalDAV Depth:1 PROPFIND on /caldav/v2/{email}/
  if (!options.skipNetwork && typeof fetchImpl === 'function') {
    const caldavToken = getCaldavAccessToken(email, options);
    if (caldavToken) {
      try {
        const propfindXml = `<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:CS="http://calendarserver.org/ns/" xmlns:IC="http://apple.com/ns/ical/">
  <D:prop>
    <D:displayname/>
    <D:resourcetype/>
    <C:calendar-description/>
    <IC:calendar-color/>
    <CS:getctag/>
  </D:prop>
</D:propfind>`;
        const res = await fetchImpl(`https://apidata.googleusercontent.com/caldav/v2/${encodeURIComponent(email)}/`, {
          method: 'PROPFIND',
          headers: {
            Authorization: `Bearer ${caldavToken}`,
            Depth: '1',
            'Content-Type': 'application/xml; charset=utf-8',
          },
          body: propfindXml,
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok || res.status === 207) {
          const xml = await res.text();
          discovered = parseCaldavCalendarHomeXml(xml, email);
        }
      } catch {}
    }

    // 2. If CalDAV wasn't available, try Google Calendar REST API v3 if bearer token exists
    const restToken = account?.calendarAccessToken || account?.accessToken;
    if (discovered.length === 0 && restToken) {
      try {
        const res = await fetchImpl('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=50', {
          headers: { Authorization: `Bearer ${restToken}` },
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const data = await res.json();
          discovered = (data.items || []).map((c) => {
            const isPrimary = Boolean(c.primary);
            const isShared = !isPrimary;
            const writable = c.accessRole === 'owner' || c.accessRole === 'writer';
            const color = normalizeHexColor(c.backgroundColor, isPrimary ? '#00bcd4' : '#f59e0b');
            return {
              id: c.id,
              name: c.summaryOverride || c.summary || c.id,
              originalSummary: c.summary || c.id,
              description: c.description || '',
              color,
              backgroundColor: color,
              primary: isPrimary,
              shared: isShared,
              writable,
              accessRole: c.accessRole || (isPrimary ? 'owner' : 'reader'),
              caldavUrl: `https://apidata.googleusercontent.com/caldav/v2/${encodeURIComponent(c.id)}/events/`,
              source: 'google-rest-api',
            };
          });
        }
      } catch {}
    }
  }

  // 3. Also check Thunderbird user.js registry for any already-configured secondary calendars
  if (discovered.length === 0) {
    const tbStatus = thunderbirdGoogle.detectThunderbird(options);
    if (tbStatus?.primaryProfilePath) {
      const userJsPath = path.join(tbStatus.primaryProfilePath, 'user.js');
      if (fs.existsSync(userJsPath)) {
        try {
          const content = fs.readFileSync(userJsPath, 'utf8');
          const calMap = {};
          for (const m of content.matchAll(/calendar\.registry\.([0-9a-f-]{36})\.(name|username|color|uri)",\s*"([^"]+)"/g)) {
            const [, uuid, key, val] = m;
            if (!calMap[uuid]) calMap[uuid] = { uuid };
            calMap[uuid][key] = val;
          }
          for (const meta of Object.values(calMap)) {
            if ((meta.username || '').toLowerCase() !== email.toLowerCase()) continue;
            const m = String(meta.uri || '').match(/\/caldav\/v2\/([^/]+)\/events/i);
            const calId = m ? decodeURIComponent(m[1]) : email;
            const isPrimary = calId.toLowerCase() === email.toLowerCase();
            discovered.push({
              id: calId,
              name: meta.name || calId,
              originalSummary: meta.name || calId,
              description: '',
              color: normalizeHexColor(meta.color, '#00bcd4'),
              backgroundColor: normalizeHexColor(meta.color, '#00bcd4'),
              primary: isPrimary,
              shared: !isPrimary,
              writable: !calId.includes('@virtual'),
              accessRole: isPrimary ? 'owner' : 'writer',
              caldavUrl: meta.uri || `https://apidata.googleusercontent.com/caldav/v2/${encodeURIComponent(calId)}/events/`,
              source: 'thunderbird-registry',
            });
          }
        } catch {}
      }
    }
  }

  // 4. Fallback default Primary calendar if still empty
  if (discovered.length === 0) {
    discovered.push({
      id: email,
      name: `Primary (${email})`,
      originalSummary: email,
      description: 'Primary Google Calendar',
      color: '#00bcd4',
      backgroundColor: '#00bcd4',
      primary: true,
      shared: false,
      writable: true,
      accessRole: 'owner',
      caldavUrl: `https://apidata.googleusercontent.com/caldav/v2/${encodeURIComponent(email)}/events/`,
      source: 'default',
    });
  }

  // 5. Merge custom calendars from settings
  for (const custom of settings.customCalendars || []) {
    if (!custom || !custom.id) continue;
    if (!discovered.some((c) => c.id.toLowerCase() === custom.id.toLowerCase())) {
      discovered.push({
        id: custom.id,
        name: custom.name || custom.id,
        originalSummary: custom.name || custom.id,
        description: custom.description || 'Shared Google Calendar',
        color: normalizeHexColor(custom.color, '#f59e0b'),
        backgroundColor: normalizeHexColor(custom.color, '#f59e0b'),
        primary: false,
        shared: true,
        writable: custom.writable !== false,
        accessRole: custom.writable === false ? 'reader' : 'writer',
        caldavUrl: `https://apidata.googleusercontent.com/caldav/v2/${encodeURIComponent(custom.id)}/events/`,
        source: 'custom',
      });
    }
  }

  // 6. Apply user-defined display name / color overrides & attach family members to Family/shared calendars
  const overrides = settings.calendarOverrides || {};
  const enriched = discovered.map((cal) => {
    const ov = overrides[cal.id] || {};
    const displayName = ov.name || cal.name;
    const color = normalizeHexColor(ov.color || cal.color, '#00bcd4');
    const isFamilyCal = /family/i.test(displayName) || /family/i.test(cal.originalSummary) || cal.id.startsWith('family');
    const googleCalendarUrl = `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(cal.id)}`;
    const googleCalendarEmbedUrl = `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(cal.id)}`;
    return {
      ...cal,
      name: displayName,
      summary: displayName,
      color,
      backgroundColor: color,
      isFamilyCalendar: isFamilyCal,
      googleCalendarUrl,
      googleCalendarEmbedUrl,
      sharedWith: isFamilyCal
        ? familyMembers.filter((m) => m.email)
        : Array.isArray(ov.sharedWith)
          ? ov.sharedWith
          : [],
    };
  });

  // Determine default target calendar for creating events (prefer Family calendar if writable, or user setting, or Primary)
  const preferredId = settings.defaultCalendarId;
  const defaultCal = (preferredId && enriched.find((c) => c.id === preferredId && c.writable))
    || enriched.find((c) => c.isFamilyCalendar && c.writable)
    || enriched.find((c) => c.primary)
    || enriched[0];

  return {
    ok: true,
    email,
    accountId: account?.id || '',
    defaultCalendarId: defaultCal?.id || email,
    calendars: enriched,
    familyMembers,
  };
}

/**
 * Saves a custom alias or color override for a Named Google Calendar, or adds a custom shared calendar.
 */
function saveNamedCalendarConfig({ id, name, color, description, isDefault = false }, options = {}) {
  const calId = String(id || '').trim() || `custom-${Date.now()}@group.calendar.google.com`;
  const settings = loadCalendarSettings(options);
  settings.calendarOverrides = settings.calendarOverrides || {};
  settings.calendarOverrides[calId] = {
    ...(settings.calendarOverrides[calId] || {}),
    ...(name ? { name: String(name).trim() } : {}),
    ...(color ? { color: normalizeHexColor(color) } : {}),
    ...(description !== undefined ? { description: String(description).trim() } : {}),
  };
  if (isDefault) {
    settings.defaultCalendarId = calId;
  }
  saveCalendarSettings(settings, options);
  return { ok: true, id: calId, settings };
}

/**
 * Syncs all discovered Named Google Calendars (`Primary`, `Family`, `Holidays in United States`, etc.)
 * into Mozilla Thunderbird's `user.js` (`additionalCalendars`).
 */
async function syncNamedCalendarsToThunderbird(accountIdOrEmail = null, options = {}) {
  const discovered = await discoverNamedCalendars(accountIdOrEmail, options);
  if (!discovered.accountId) {
    return { ok: false, error: 'No Google account configured.' };
  }
  const additionalCalendars = discovered.calendars
    .filter((c) => !c.primary)
    .map((c) => ({
      id: c.id,
      summary: c.name,
      backgroundColor: c.color,
      writable: c.writable,
    }));

  const account = cloudAccounts.getAccountById(discovered.accountId, options);
  const res = thunderbirdGoogle.configureThunderbirdForGoogleAccount(
    discovered.accountId,
    {
      enableCalendar: account?.suites?.calendar?.enabled !== false,
      enableContacts: account?.suites?.contacts?.enabled !== false,
      enableMail: Boolean(account?.suites?.mail?.enabled),
      calendarColor: account?.calendarColor || '#00bcd4',
      refreshMinutes: account?.calendarRefreshMinutes || thunderbirdGoogle.DEFAULT_CALENDAR_REFRESH_MINUTES,
      additionalCalendars,
    },
    options
  );

  return {
    ok: true,
    email: discovered.email,
    calendarsSynced: discovered.calendars.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      primary: c.primary,
      shared: c.shared,
      writable: c.writable,
    })),
    thunderbirdResult: res,
  };
}

/**
 * Resolves attendee strings/objects against RobOS Family & People store.
 */
function resolveAttendees(rawAttendees = [], options = {}) {
  const family = listFamilyMembers(options);
  const list = Array.isArray(rawAttendees)
    ? rawAttendees
    : typeof rawAttendees === 'string'
      ? rawAttendees.split(/[,;]+/).map((s) => s.trim()).filter(Boolean)
      : [];

  const resolved = [];
  const seenEmails = new Set();

  for (const item of list) {
    if (!item) continue;
    if (typeof item === 'object' && item.email) {
      const email = String(item.email).trim().toLowerCase();
      if (!email || seenEmails.has(email)) continue;
      seenEmails.add(email);
      const match = family.find((f) => f.email.toLowerCase() === email);
      resolved.push({
        name: item.name || match?.name || email,
        email,
        uid: item.uid || match?.uid || '',
        avatar: match?.avatar || '👤',
      });
      continue;
    }

    const str = String(item).trim();
    if (!str) continue;

    // Check "Name <email@domain>" format
    const angleMatch = str.match(/^([^<]+)<([^>]+)>$/);
    if (angleMatch) {
      const name = angleMatch[1].trim().replace(/^["']|["']$/g, '');
      const email = angleMatch[2].trim().toLowerCase();
      if (email && !seenEmails.has(email)) {
        seenEmails.add(email);
        const match = family.find((f) => f.email.toLowerCase() === email);
        resolved.push({
          name: name || match?.name || email,
          email,
          uid: match?.uid || '',
          avatar: match?.avatar || '👤',
        });
      }
      continue;
    }

    // Check if it matches a family member by uid, nickname, firstName, or displayName
    const lower = str.toLowerCase();
    const personMatch = family.find(
      (f) =>
        f.uid.toLowerCase() === lower ||
        f.email.toLowerCase() === lower ||
        f.nickname.toLowerCase() === lower ||
        f.firstName.toLowerCase() === lower ||
        f.name.toLowerCase() === lower
    );
    if (personMatch && personMatch.email) {
      const email = personMatch.email.toLowerCase();
      if (!seenEmails.has(email)) {
        seenEmails.add(email);
        resolved.push({
          name: personMatch.name,
          email,
          uid: personMatch.uid,
          avatar: personMatch.avatar || '👤',
        });
      }
      continue;
    }

    // Plain email address
    if (str.includes('@')) {
      const email = str.toLowerCase();
      if (!seenEmails.has(email)) {
        seenEmails.add(email);
        resolved.push({ name: str, email, uid: '', avatar: '✉️' });
      }
    }
  }

  return resolved;
}

function escapeIcsText(val) {
  return String(val || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function formatIcsUtcDateTime(dateObj) {
  const d = dateObj instanceof Date ? dateObj : new Date(dateObj);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function formatIcsDateOnly(dateStrOrObj) {
  if (typeof dateStrOrObj === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStrOrObj.trim())) {
    return dateStrOrObj.trim().replace(/-/g, '');
  }
  const d = dateStrOrObj instanceof Date ? dateStrOrObj : new Date(dateStrOrObj);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function buildRruleLine(recurrence) {
  const r = String(recurrence || '').trim().toUpperCase();
  if (!r || r === 'NONE') return '';
  if (r.startsWith('RRULE:')) return r.slice(6);
  if (r.startsWith('FREQ=')) return r;
  if (r === 'DAILY') return 'FREQ=DAILY';
  if (r === 'WEEKLY') return 'FREQ=WEEKLY';
  if (r === 'WEEKDAYS') return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
  if (r === 'MONTHLY') return 'FREQ=MONTHLY';
  if (r === 'YEARLY' || r === 'ANNUALLY') return 'FREQ=YEARLY';
  return '';
}

/**
 * Builds an RFC 5545 `.ics` VCALENDAR payload for a Google Calendar event.
 */
function buildIcsCalendarEvent(ev) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RobOS//Google Calendar App//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${ev.uid}`,
    `DTSTAMP:${formatIcsUtcDateTime(new Date())}`,
  ];

  if (ev.allDay) {
    const startYmd = formatIcsDateOnly(ev.startDate || ev.start);
    let endYmd = formatIcsDateOnly(ev.endDate || ev.end || ev.startDate || ev.start);
    if (endYmd <= startYmd) {
      // RFC 5545 DTEND for all-day events is exclusive (+1 day)
      const sy = Number(startYmd.slice(0, 4));
      const sm = Number(startYmd.slice(4, 6)) - 1;
      const sd = Number(startYmd.slice(6, 8));
      endYmd = formatIcsDateOnly(new Date(sy, sm, sd + 1));
    }
    lines.push(`DTSTART;VALUE=DATE:${startYmd}`);
    lines.push(`DTEND;VALUE=DATE:${endYmd}`);
  } else {
    lines.push(`DTSTART:${formatIcsUtcDateTime(ev.start)}`);
    lines.push(`DTEND:${formatIcsUtcDateTime(ev.end)}`);
  }

  lines.push(`SUMMARY:${escapeIcsText(ev.summary)}`);

  const descParts = [];
  if (ev.description) descParts.push(ev.description);
  if (ev.meetingUrl) descParts.push(`Meeting Link: ${ev.meetingUrl}`);
  if (descParts.length > 0) {
    lines.push(`DESCRIPTION:${escapeIcsText(descParts.join('\n\n'))}`);
  }
  if (ev.location) {
    lines.push(`LOCATION:${escapeIcsText(ev.location)}`);
  }
  if (ev.meetingUrl) {
    lines.push(`URL:${escapeIcsText(ev.meetingUrl)}`);
  }
  if (ev.rrule) {
    lines.push(`RRULE:${ev.rrule}`);
  }
  if (ev.availability === 'TRANSPARENT' || ev.availability === 'free') {
    lines.push('TRANSP:TRANSPARENT');
  } else {
    lines.push('TRANSP:OPAQUE');
  }
  if (ev.visibility && ev.visibility !== 'default') {
    lines.push(`CLASS:${String(ev.visibility).toUpperCase()}`);
  }
  if (ev.organizerEmail) {
    lines.push(`ORGANIZER;CN="${escapeIcsText(ev.organizerName || ev.organizerEmail)}":mailto:${ev.organizerEmail}`);
  }
  for (const att of ev.attendees || []) {
    if (!att || !att.email) continue;
    lines.push(
      `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN="${escapeIcsText(att.name || att.email)}":mailto:${att.email}`
    );
  }

  const reminders = Array.isArray(ev.reminders)
    ? ev.reminders
    : ev.reminderMinutes != null && Number.isFinite(Number(ev.reminderMinutes)) && Number(ev.reminderMinutes) >= 0
      ? [Number(ev.reminderMinutes)]
      : [30];

  for (const mins of reminders) {
    const m = Number(mins);
    if (!Number.isFinite(m) || m < 0) continue;
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcsText(ev.summary)}`,
      `TRIGGER:-PT${m}M`,
      'END:VALARM'
    );
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

/**
 * Creates a new Google Calendar event on the chosen Named Calendar via live Google CalDAV `PUT`
 * (or Google Calendar REST API v3) and stores it in `~/.config/robos/calendar-events.json`.
 */
async function createNamedCalendarEvent(eventInput = {}, options = {}) {
  const summary = String(eventInput.summary || eventInput.title || '').trim();
  if (!summary) {
    throw new Error('Event title / summary is required.');
  }

  const discovered = await discoverNamedCalendars(eventInput.accountId || null, options);
  const calendars = discovered.calendars || [];

  // Resolve target Named Calendar by ID or Name
  const requestedCal = String(eventInput.calendarId || eventInput.calendarName || '').trim();
  let targetCal = null;
  if (requestedCal) {
    const lowerReq = requestedCal.toLowerCase();
    targetCal =
      calendars.find((c) => c.id.toLowerCase() === lowerReq) ||
      calendars.find((c) => c.name.toLowerCase() === lowerReq || c.originalSummary.toLowerCase() === lowerReq) ||
      calendars.find((c) => c.name.toLowerCase().includes(lowerReq));
  }
  if (!targetCal) {
    targetCal =
      calendars.find((c) => c.id === discovered.defaultCalendarId && c.writable) ||
      calendars.find((c) => c.primary) ||
      calendars[0];
  }

  const allDay = Boolean(eventInput.allDay);
  const now = new Date();
  let startIso;
  let endIso;
  let startDate = String(eventInput.startDate || '').trim();
  let endDate = String(eventInput.endDate || '').trim();

  if (allDay) {
    if (!startDate) {
      startDate = eventInput.start
        ? formatIcsDateOnly(eventInput.start).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')
        : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }
    if (!endDate || endDate < startDate) {
      endDate = startDate;
    }
    startIso = new Date(`${startDate}T00:00:00`).toISOString();
    endIso = new Date(`${endDate}T23:59:59`).toISOString();
  } else {
    if (eventInput.startDate && eventInput.startTime) {
      startIso = new Date(`${eventInput.startDate}T${eventInput.startTime}`).toISOString();
    } else if (eventInput.start) {
      startIso = new Date(eventInput.start).toISOString();
    } else {
      startIso = new Date(now.getTime() + 30 * 60000).toISOString();
    }

    if (eventInput.endDate && eventInput.endTime) {
      endIso = new Date(`${eventInput.endDate}T${eventInput.endTime}`).toISOString();
    } else if (eventInput.end) {
      endIso = new Date(eventInput.end).toISOString();
    } else {
      const durationMin = Number(eventInput.durationMinutes) || 60;
      endIso = new Date(new Date(startIso).getTime() + durationMin * 60000).toISOString();
    }

    if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
      endIso = new Date(new Date(startIso).getTime() + 60 * 60000).toISOString();
    }
  }

  const rawAttendeesInput =
    eventInput.attendees !== undefined
      ? eventInput.attendees
      : targetCal?.isFamilyCalendar
        ? discovered.familyMembers
        : [];
  const attendees = resolveAttendees(rawAttendeesInput, options);
  const rrule = buildRruleLine(eventInput.recurrence || eventInput.rrule);
  const uid = eventInput.uid || `robos-evt-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  let meetingUrl = String(eventInput.meetingUrl || '').trim();
  if (!meetingUrl && eventInput.addVideoCall) {
    const slug = summary.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'family';
    meetingUrl = `https://meet.jit.si/RobOS-${slug}-${crypto.randomBytes(3).toString('hex')}`;
  }

  const organizerPerson = (discovered.familyMembers || []).find(
    (fm) => fm.email && fm.email.toLowerCase() === String(discovered.email || '').toLowerCase()
  );

  const icsPayload = buildIcsCalendarEvent({
    uid,
    summary,
    description: String(eventInput.description || '').trim(),
    location: String(eventInput.location || '').trim(),
    meetingUrl,
    allDay,
    start: startIso,
    end: endIso,
    startDate,
    endDate,
    rrule,
    organizerEmail: discovered.email,
    organizerName: organizerPerson?.name || discovered.email,
    attendees,
    reminderMinutes: eventInput.reminderMinutes ?? 30,
    visibility: eventInput.visibility || 'default',
    availability: eventInput.availability || 'OPAQUE',
  });

  let syncedToGoogle = false;
  let caldavStatus = 0;
  let caldavResourceUrl = '';
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  if (!options.skipNetwork && typeof fetchImpl === 'function' && targetCal?.writable !== false) {
    const caldavToken = getCaldavAccessToken(discovered.email, options);
    if (caldavToken) {
      caldavResourceUrl = `https://apidata.googleusercontent.com/caldav/v2/${encodeURIComponent(targetCal.id)}/events/${encodeURIComponent(uid)}.ics`;
      try {
        const putRes = await fetchImpl(caldavResourceUrl, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${caldavToken}`,
            'Content-Type': 'text/calendar; charset=utf-8',
          },
          body: icsPayload,
          signal: AbortSignal.timeout(10000),
        });
        caldavStatus = putRes.status;
        syncedToGoogle = putRes.ok || putRes.status === 201 || putRes.status === 204;
      } catch {}
    }
  }

  const storedEvent = {
    id: `tb-${uid}`,
    uid,
    summary,
    description: String(eventInput.description || '').trim(),
    start: startIso,
    end: endIso,
    startDate: allDay ? startDate : undefined,
    endDate: allDay ? endDate : undefined,
    allDay,
    recurring: Boolean(rrule),
    recurrence: eventInput.recurrence || (rrule ? 'CUSTOM' : 'NONE'),
    rrule,
    category: eventInput.category || (targetCal?.isFamilyCalendar ? 'family' : 'meeting'),
    source: syncedToGoogle ? 'google-caldav-live' : 'robos-calendar',
    calendarId: targetCal?.id || discovered.email,
    calendarName: targetCal?.name || `Primary (${discovered.email})`,
    color: eventInput.color || targetCal?.color || '#00bcd4',
    accountEmail: discovered.email,
    location: String(eventInput.location || '').trim(),
    meetingUrl,
    attendees: attendees.map((a) => `${a.name} <${a.email}>`),
    attendeeDetails: attendees,
    reminderMinutes: Number(eventInput.reminderMinutes ?? 30),
    visibility: eventInput.visibility || 'default',
    availability: eventInput.availability || 'OPAQUE',
    syncedToGoogle,
    caldavStatus,
    caldavResourceUrl,
    createdAt: new Date().toISOString(),
  };

  const existing = thunderbirdGoogle.loadLocalCalendarEvents(options);
  const filtered = existing.filter((e) => e.id !== storedEvent.id && e.uid !== uid);
  filtered.push(storedEvent);
  filtered.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  thunderbirdGoogle.saveLocalCalendarEvents(filtered, options);

  return {
    ok: true,
    syncedToGoogle,
    caldavStatus,
    calendar: targetCal,
    event: storedEvent,
  };
}

/**
 * Deletes an event from both Google CalDAV and the local RobOS calendar store.
 */
async function deleteNamedCalendarEvent(eventId, options = {}) {
  const localEvents = thunderbirdGoogle.loadLocalCalendarEvents(options);
  const target = localEvents.find((e) => e.id === eventId || e.uid === eventId);
  const rawUid = target?.uid || String(eventId || '').replace(/^tb-/, '');
  const calId = options.calendarId || target?.calendarId;
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  let deletedOnGoogle = false;
  if (!options.skipNetwork && typeof fetchImpl === 'function' && rawUid) {
    const discovered = await discoverNamedCalendars(null, options);
    const caldavToken = getCaldavAccessToken(discovered.email, options);
    if (caldavToken) {
      const candidateCalIds = calId
        ? [calId]
        : discovered.calendars.filter((c) => c.writable).map((c) => c.id);
      for (const cid of candidateCalIds) {
        try {
          const url = `https://apidata.googleusercontent.com/caldav/v2/${encodeURIComponent(cid)}/events/${encodeURIComponent(rawUid)}.ics`;
          const delRes = await fetchImpl(url, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${caldavToken}` },
            signal: AbortSignal.timeout(8000),
          });
          if (delRes.ok || delRes.status === 204 || delRes.status === 200) {
            deletedOnGoogle = true;
            break;
          }
        } catch {}
      }
    }
  }

  thunderbirdGoogle.deleteCalendarEvent(eventId, options);
  if (rawUid && `tb-${rawUid}` !== eventId) {
    thunderbirdGoogle.deleteCalendarEvent(`tb-${rawUid}`, options);
  }

  return { ok: true, deletedId: eventId, deletedOnGoogle };
}

/**
 * Advances a recurring event's initial DTSTART/DTEND to the next upcoming occurrence >= nowMs.
 */
function advanceRecurringStartEnd(startIso, endIso, rruleStr, nowMs = Date.now()) {
  if (!rruleStr) return { start: startIso, end: endIso };
  const sDate = new Date(startIso);
  const eDate = new Date(endIso);
  if (Number.isNaN(sDate.getTime()) || Number.isNaN(eDate.getTime())) {
    return { start: startIso, end: endIso };
  }
  const durationMs = Math.max(3600000, eDate.getTime() - sDate.getTime());
  const freqM = rruleStr.match(/FREQ=([A-Z]+)/i);
  if (!freqM) return { start: startIso, end: endIso };
  const freq = freqM[1].toUpperCase();
  const intM = rruleStr.match(/INTERVAL=(\d+)/i);
  const interval = Math.max(1, Number(intM ? intM[1] : 1) || 1);

  let curStart = new Date(sDate.getTime());
  let guard = 0;
  while (curStart.getTime() + durationMs < nowMs && guard < 2000) {
    guard++;
    if (freq === 'DAILY') {
      curStart.setDate(curStart.getDate() + interval);
    } else if (freq === 'WEEKLY') {
      curStart.setDate(curStart.getDate() + interval * 7);
    } else if (freq === 'MONTHLY') {
      curStart.setMonth(curStart.getMonth() + interval);
    } else if (freq === 'YEARLY') {
      curStart.setFullYear(curStart.getFullYear() + interval);
    } else {
      break;
    }
  }
  const curEnd = new Date(curStart.getTime() + durationMs);
  return { start: curStart.toISOString(), end: curEnd.toISOString() };
}

/**
 * Moves one or more events (matching `eventId` or `query` title substring) from `fromCalendar`
 * to `toCalendar` on Google CalDAV (`PUT` to destination with all recurrence rules & attendees preserved,
 * followed by `DELETE` from source calendar).
 */
async function moveNamedCalendarEvent({ eventId = '', query = '', fromCalendar = 'Primary', toCalendar = 'Family', accountId = null } = {}, options = {}) {
  const discovered = await discoverNamedCalendars(accountId, options);
  const calendars = discovered.calendars || [];
  const resolveCal = (nameOrId, fallbackPrimary = false) => {
    const q = String(nameOrId || '').trim().toLowerCase();
    return (
      calendars.find((c) => c.id.toLowerCase() === q) ||
      calendars.find((c) => c.name.toLowerCase() === q || c.originalSummary?.toLowerCase() === q) ||
      calendars.find((c) => c.name.toLowerCase().includes(q)) ||
      (fallbackPrimary ? calendars.find((c) => c.primary) : calendars.find((c) => c.isFamilyCalendar)) ||
      calendars[0]
    );
  };

  const srcCal = resolveCal(fromCalendar, true);
  const dstCal = resolveCal(toCalendar, false);
  if (!srcCal || !dstCal) {
    throw new Error('Could not resolve source or destination calendar.');
  }
  if (dstCal.writable === false) {
    throw new Error(`Destination calendar "${dstCal.name}" is read-only.`);
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const caldavToken = getCaldavAccessToken(discovered.email, options);
  if (!caldavToken || typeof fetchImpl !== 'function') {
    throw new Error('Active Google CalDAV token is required to move calendar events.');
  }

  const reportXml = `<?xml version="1.0" encoding="utf-8" ?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag/>
    <C:calendar-data/>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT"/>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;

  const res = await fetchImpl(srcCal.caldavUrl, {
    method: 'REPORT',
    headers: {
      Authorization: `Bearer ${caldavToken}`,
      Depth: '1',
      'Content-Type': 'application/xml; charset=utf-8',
    },
    body: reportXml,
    signal: AbortSignal.timeout(12000),
  });
  const xml = await res.text();
  const responses = xml.split(/<(?:\w+:)?response\b[^>]*>/i).slice(1);
  const moved = [];
  const qLower = String(query || '').trim().toLowerCase();
  const idLower = String(eventId || '').replace(/^tb-/, '').trim().toLowerCase();

  for (const block of responses) {
    const calData = (block.match(/<(?:\w+:)?calendar-data[^>]*>([\s\S]*?)<\/(?:\w+:)?calendar-data>/i) || [])[1] || '';
    if (!calData) continue;
    const unfolded = calData.replace(/\r\n /g, '').replace(/\n /g, '');
    const uid = (unfolded.match(/^UID:(.*)$/m) || [])[1]?.trim() || '';
    const summary = (unfolded.match(/^SUMMARY:(.*)$/m) || [])[1]?.trim() || '';
    const matchId = idLower && uid.toLowerCase() === idLower;
    const matchQuery = qLower && summary.toLowerCase().includes(qLower);
    if (!matchId && !matchQuery) continue;

    const newUid = `robos-moved-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}@google.com`;
    // Keep only the master VEVENT (first VEVENT) and rewrite UID + ORGANIZER for destination calendar
    const firstVeventMatch = calData.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/i);
    if (!firstVeventMatch) continue;
    let veventBlock = firstVeventMatch[0]
      .replace(/\r\n /g, '')
      .replace(/\n /g, '')
      .replace(/^UID:.*$/gm, `UID:${newUid}`)
      .replace(/^ORGANIZER[^:]*:.*$/gm, `ORGANIZER;CN=${dstCal.name}:mailto:${dstCal.id}`);

    const newIcs = [
      'BEGIN:VCALENDAR',
      'PRODID:-//RobOS//Google Calendar//EN',
      'VERSION:2.0',
      'CALSCALE:GREGORIAN',
      veventBlock,
      'END:VCALENDAR',
      '',
    ].join('\r\n');

    const putUrl = `${dstCal.caldavUrl}${encodeURIComponent(newUid)}.ics`;
    const putRes = await fetchImpl(putUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${caldavToken}`,
        'Content-Type': 'text/calendar; charset=utf-8',
      },
      body: newIcs,
      signal: AbortSignal.timeout(10000),
    });

    if (putRes.ok || putRes.status === 201 || putRes.status === 204) {
      const delUrl = `${srcCal.caldavUrl}${encodeURIComponent(uid)}.ics`;
      await fetchImpl(delUrl, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${caldavToken}` },
        signal: AbortSignal.timeout(10000),
      });
      moved.push({
        summary,
        oldUid: uid,
        newUid,
        fromCalendar: srcCal.name,
        toCalendar: dstCal.name,
      });
    }
  }

  return {
    ok: true,
    movedCount: moved.length,
    moved,
  };
}

/**
 * Queries live events across all discovered Named Google Calendars via CalDAV REPORT
 * and merges with `~/.config/robos/calendar-events.json`.
 */
async function listEventsAcrossNamedCalendars(accountIdOrEmail = null, options = {}) {
  const discovered = await discoverNamedCalendars(accountIdOrEmail, options);
  const calendars = discovered.calendars || [];
  const localEvents = thunderbirdGoogle.loadLocalCalendarEvents(options);
  const fetchImpl = options.fetchImpl || globalThis.fetch;

  const caldavEvents = [];
  if (!options.skipNetwork && typeof fetchImpl === 'function') {
    const caldavToken = getCaldavAccessToken(discovered.email, options);
    if (caldavToken) {
      const now = new Date();
      const startRange = formatIcsUtcDateTime(new Date(now.getTime() - 2 * 86400 * 1000));
      const endRange = formatIcsUtcDateTime(new Date(now.getTime() + 45 * 86400 * 1000));
      const reportXml = `<?xml version="1.0" encoding="utf-8" ?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag/>
    <C:calendar-data/>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="${startRange}" end="${endRange}"/>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;

      await Promise.all(
        calendars.map(async (cal) => {
          try {
            const res = await fetchImpl(cal.caldavUrl, {
              method: 'REPORT',
              headers: {
                Authorization: `Bearer ${caldavToken}`,
                Depth: '1',
                'Content-Type': 'application/xml; charset=utf-8',
              },
              body: reportXml,
              signal: AbortSignal.timeout(7000),
            });
            if (!res.ok && res.status !== 207) return;
            const xml = await res.text();
            for (const vev of xml.split('BEGIN:VEVENT').slice(1)) {
              const block = vev.split('END:VEVENT')[0].replace(/\r\n /g, '').replace(/\n /g, '');
              const statusM = block.match(/^STATUS:(.*)$/m);
              if (statusM && statusM[1].trim().toUpperCase() === 'CANCELLED') continue;
              const uidM = block.match(/^UID:(.*)$/m);
              const sumM = block.match(/^SUMMARY:(.*)$/m);
              const dtM = block.match(/^DTSTART([^:]*):(.*)$/m);
              const deM = block.match(/^DTEND([^:]*):(.*)$/m);
              const locM = block.match(/^LOCATION:(.*)$/m);
              const descM = block.match(/^DESCRIPTION:(.*)$/m);
              const rrM = block.match(/^RRULE:(.*)$/m);
              if (!dtM) continue;

              const rawStart = dtM[2].trim();
              const isAllDay = /^\d{8}$/.test(rawStart) || /VALUE=DATE/i.test(dtM[1] || '');
              const parseIcsTime = (val) => {
                const s = String(val || '').trim();
                if (/^\d{8}$/.test(s)) {
                  return new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00`).toISOString();
                }
                const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?/);
                if (m) {
                  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] ? 'Z' : ''}`).toISOString();
                }
                return new Date().toISOString();
              };

              const rawStartIso = parseIcsTime(rawStart);
              const rawEndIso = deM ? parseIcsTime(deM[2].trim()) : new Date(new Date(rawStartIso).getTime() + 3600000).toISOString();
              const rruleVal = rrM ? rrM[1].trim() : '';
              const { start: startIso, end: endIso } = advanceRecurringStartEnd(rawStartIso, rawEndIso, rruleVal, now.getTime() - 3600000);
              const uidVal = uidM ? uidM[1].trim() : `caldav-${caldavEvents.length}`;
              const summaryVal = (sumM ? sumM[1].trim() : '(Untitled Event)').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/g, ' ');
              const locVal = (locM ? locM[1].trim() : '').replace(/\\,/g, ',').replace(/\\n/g, ' ');
              const descVal = (descM ? descM[1].trim() : '').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/g, '\n');

              const attendees = [];
              for (const attM of block.matchAll(/^ATTENDEE([^:]*):mailto:([^\r\n]+)$/gim)) {
                const params = attM[1] || '';
                const mail = attM[2].trim();
                const cnM = params.match(/CN="?([^";]+)"?/i);
                attendees.push(cnM ? `${cnM[1]} <${mail}>` : mail);
              }

              caldavEvents.push({
                id: `tb-${uidVal}`,
                uid: uidVal,
                summary: summaryVal,
                description: descVal,
                start: startIso,
                end: endIso,
                allDay: isAllDay,
                recurring: Boolean(rruleVal),
                rrule: rruleVal,
                category: cal.isFamilyCalendar ? 'family' : 'meeting',
                source: 'google-caldav-live',
                calendarId: cal.id,
                calendarName: cal.name,
                color: cal.color,
                accountEmail: discovered.email,
                location: locVal,
                attendees,
              });
            }
          } catch {}
        })
      );
    }
  }

  // Merge and deduplicate
  const seen = new Set();
  const merged = [];
  for (const ev of [...caldavEvents, ...localEvents]) {
    if (!ev || !ev.summary) continue;
    const key = ev.uid
      ? `uid:${ev.uid}`
      : `${ev.summary.toLowerCase()}::${String(ev.start).slice(0, 16)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(ev);
  }
  merged.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  return {
    ok: true,
    email: discovered.email,
    defaultCalendarId: discovered.defaultCalendarId,
    calendars,
    familyMembers: discovered.familyMembers,
    events: merged,
  };
}

/**
 * Parses a natural-language or voice-dictated calendar event description into structured form fields.
 * Example:
 *   "Add Dentist appointment on Friday at 3pm for 1 hour on the Family calendar at Downtown Dental"
 */
function parseNaturalLanguageEvent(inputText, options = {}) {
  let raw = String(inputText || '').trim();
  if (!raw) {
    return { summary: '', attendees: [], allDay: false };
  }

  const now = options.now ? new Date(options.now) : new Date();
  const family = options.familyMembers || listFamilyMembers(options);
  const calendars = options.calendars || [];

  // Strip conversational prefixes ("Ok Nabu", "add event", "schedule", "create a calendar event for", etc.)
  raw = raw.replace(/^(?:(?:hey|ok|okay)\s+nabu[\s,.:;-]*)/i, '').trim();
  raw = raw.replace(/^(?:please\s+)?(?:add|create|schedule|put|book|make|set\s+up)\s+(?:a\s+|an\s+|new\s+)?(?:calendar\s+event|event|appointment|meeting|reminder)?\s*(?:for|to|called|named|titled)?\s*/i, '').trim();

  // 1. Detect target calendar ("on the Family calendar", "to Family calendar", "in Primary calendar")
  let calendarId = '';
  let calendarName = '';
  const calMatch = raw.match(/\b(?:on|to|in)\s+(?:the\s+|my\s+|our\s+)?([a-z][a-z0-9_-]*(?:\s+[a-z][a-z0-9_-]*){0,2})\s+calendar\b/i);
  if (calMatch) {
    const q = calMatch[1].trim().toLowerCase();
    const matchedCal =
      calendars.find((c) => c.name.toLowerCase() === q || c.originalSummary?.toLowerCase() === q) ||
      calendars.find((c) => c.name.toLowerCase().includes(q));
    if (matchedCal) {
      calendarId = matchedCal.id;
      calendarName = matchedCal.name;
    } else if (q.includes('family')) {
      calendarName = 'Family';
    }
    raw = raw.replace(calMatch[0], ' ').replace(/\s+/g, ' ').trim();
  }

  // 2. Detect family members / attendees mentioned
  const matchedAttendees = [];
  const lowerRaw = raw.toLowerCase();
  if (/\b(?:whole\s+family|entire\s+family|everyone|all\s+family)\b/i.test(raw)) {
    for (const fm of family) {
      if (fm.email) matchedAttendees.push(fm);
    }
  } else {
    for (const fm of family) {
      const tokens = [fm.nickname, fm.firstName, fm.name].filter(Boolean);
      for (const tok of tokens) {
        const re = new RegExp(`\\b${tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (re.test(lowerRaw) && fm.email && !matchedAttendees.some((a) => a.email === fm.email)) {
          matchedAttendees.push(fm);
          break;
        }
      }
    }
  }

  // Strip trailing "with <family member>" from summary if it's at the end
  raw = raw.replace(/\s+\bwith\s+(?:the\s+)?(?:whole\s+family|entire\s+family|everyone|[a-z ,&]+)$/i, (full) => {
    const lowerFull = full.toLowerCase();
    if (/family|everyone/.test(lowerFull)) return '';
    if (family.some((fm) => [fm.nickname, fm.firstName, fm.name].filter(Boolean).some((n) => lowerFull.includes(n.toLowerCase())))) {
      return '';
    }
    return full;
  }).trim();

  // 3. Detect recurrence
  let recurrence = 'NONE';
  if (/\b(?:every\s+day|daily)\b/i.test(raw)) {
    recurrence = 'DAILY';
    raw = raw.replace(/\b(?:every\s+day|daily)\b/i, ' ').trim();
  } else if (/\b(?:every\s+weekday|weekdays)\b/i.test(raw)) {
    recurrence = 'WEEKDAYS';
    raw = raw.replace(/\b(?:every\s+weekday|weekdays)\b/i, ' ').trim();
  } else if (/\b(?:every\s+week|weekly)\b/i.test(raw)) {
    recurrence = 'WEEKLY';
    raw = raw.replace(/\b(?:every\s+week|weekly)\b/i, ' ').trim();
  } else if (/\b(?:every\s+month|monthly)\b/i.test(raw)) {
    recurrence = 'MONTHLY';
    raw = raw.replace(/\b(?:every\s+month|monthly)\b/i, ' ').trim();
  } else if (/\b(?:every\s+year|yearly|annually)\b/i.test(raw)) {
    recurrence = 'YEARLY';
    raw = raw.replace(/\b(?:every\s+year|yearly|annually)\b/i, ' ').trim();
  }

  // 4. Detect all-day flag
  let allDay = /\ball[- ]day\b/i.test(raw);
  if (allDay) {
    raw = raw.replace(/\ball[- ]day\b/i, ' ').trim();
  }

  // 5. Detect date ("today", "tomorrow", "on Friday", "October 8", "2026-11-15")
  const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const months = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
    may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
    sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
  };

  const isoDateM = raw.match(/\b(?:on\s+)?(\d{4}-\d{2}-\d{2})\b/i);
  const monthDayM = raw.match(/\b(?:on\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?\b/i);
  const weekdayM = raw.match(/\b(?:on\s+)?(?:(this|next)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);

  if (/\btomorrow\b/i.test(raw)) {
    targetDate.setDate(targetDate.getDate() + 1);
    raw = raw.replace(/\b(?:on\s+)?tomorrow\b/i, ' ').trim();
  } else if (/\btoday\b/i.test(raw)) {
    raw = raw.replace(/\b(?:on\s+)?today\b/i, ' ').trim();
  } else if (isoDateM) {
    const [y, m, d] = isoDateM[1].split('-').map(Number);
    targetDate.setFullYear(y, m - 1, d);
    raw = raw.replace(isoDateM[0], ' ').trim();
  } else if (monthDayM) {
    const mIdx = months[monthDayM[1].toLowerCase()];
    const dayNum = Number(monthDayM[2]);
    const yearNum = monthDayM[3] ? Number(monthDayM[3]) : now.getFullYear();
    targetDate.setFullYear(yearNum, mIdx, dayNum);
    raw = raw.replace(monthDayM[0], ' ').trim();
  } else if (weekdayM) {
    const targetDow = weekdays.indexOf(weekdayM[2].toLowerCase());
    let delta = (targetDow - targetDate.getDay() + 7) % 7;
    if (delta === 0 || (weekdayM[1] && weekdayM[1].toLowerCase() === 'next')) {
      delta = delta === 0 ? 7 : delta;
    }
    targetDate.setDate(targetDate.getDate() + delta);
    raw = raw.replace(weekdayM[0], ' ').trim();
  }

  // 6. Detect time ("at 3pm", "at 2:30 pm", "from 5pm to 7pm") & duration ("for 2 hours", "for 45 minutes")
  let startHour = 17;
  let startMin = 0;
  let durationMinutes = 60;

  const parseHourMin = (hStr, mStr, ampm) => {
    let h = Number(hStr);
    const m = mStr ? Number(mStr) : 0;
    const ap = (ampm || '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    return { h, m };
  };

  const rangeTimeM = raw.match(/\b(?:from|at)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s+(?:to|until|-)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  const singleTimeM = raw.match(/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  const durM = raw.match(/\bfor\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?|hr|minutes?|mins?|min)\b/i);

  if (durM) {
    const val = Number(durM[1]);
    const unit = durM[2].toLowerCase();
    durationMinutes = unit.startsWith('h') ? Math.round(val * 60) : Math.round(val);
    raw = raw.replace(durM[0], ' ').trim();
  }

  if (rangeTimeM) {
    const s = parseHourMin(rangeTimeM[1], rangeTimeM[2], rangeTimeM[3] || rangeTimeM[6]);
    const e = parseHourMin(rangeTimeM[4], rangeTimeM[5], rangeTimeM[6]);
    startHour = s.h;
    startMin = s.m;
    const diff = (e.h * 60 + e.m) - (s.h * 60 + s.m);
    if (diff > 0) durationMinutes = diff;
    raw = raw.replace(rangeTimeM[0], ' ').trim();
  } else if (singleTimeM) {
    const s = parseHourMin(singleTimeM[1], singleTimeM[2], singleTimeM[3] || (Number(singleTimeM[1]) < 8 ? 'pm' : 'am'));
    startHour = s.h;
    startMin = s.m;
    raw = raw.replace(singleTimeM[0], ' ').trim();
  }

  // 7. Detect location ("at Red Lobster", "in Living Room")
  let location = '';
  const locM = raw.match(/\bat\s+([A-Z][A-Za-z0-9 '&.,-]+)$/);
  if (locM) {
    location = locM[1].trim();
    raw = raw.replace(locM[0], '').trim();
  }

  const summary = raw.replace(/\s+/g, ' ').replace(/^[-,.:;]+|[-,.:;]+$/g, '').trim() || 'Family Calendar Event';
  const ymd = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
  const startTime = `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`;
  const endObj = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), startHour, startMin + durationMinutes);
  const endDate = `${endObj.getFullYear()}-${String(endObj.getMonth() + 1).padStart(2, '0')}-${String(endObj.getDate()).padStart(2, '0')}`;
  const endTime = `${String(endObj.getHours()).padStart(2, '0')}:${String(endObj.getMinutes()).padStart(2, '0')}`;

  return {
    summary,
    calendarId,
    calendarName,
    allDay,
    startDate: ymd,
    startTime,
    endDate: allDay ? ymd : endDate,
    endTime,
    durationMinutes,
    recurrence,
    location,
    attendees: matchedAttendees.map((a) => ({ name: a.name, email: a.email, uid: a.uid, avatar: a.avatar })),
  };
}

module.exports = {
  getSettingsFilePath,
  loadCalendarSettings,
  saveCalendarSettings,
  updateCalendarSettings,
  normalizeHexColor,
  listFamilyMembers,
  getCaldavAccessToken,
  parseCaldavCalendarHomeXml,
  discoverNamedCalendars,
  saveNamedCalendarConfig,
  syncNamedCalendarsToThunderbird,
  resolveAttendees,
  buildIcsCalendarEvent,
  createNamedCalendarEvent,
  deleteNamedCalendarEvent,
  moveNamedCalendarEvent,
  advanceRecurringStartEnd,
  listEventsAcrossNamedCalendars,
  parseNaturalLanguageEvent,
};
