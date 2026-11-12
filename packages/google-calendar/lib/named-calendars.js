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
  if (!raw.calendarDocs || typeof raw.calendarDocs !== 'object') {
    raw.calendarDocs = {};
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
    calendarDocs: {
      ...(current.calendarDocs || {}),
      ...(patch.calendarDocs || {}),
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
        groups: Array.isArray(p.groups) ? p.groups : [],
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
          groups: Array.isArray(p.groups) ? p.groups : [],
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
        if "calendar" in realm.lower() or "caldav" in realm.lower():
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
              caldavUrl: `${String(meta.uri || `https://apidata.googleusercontent.com/caldav/v2/${encodeURIComponent(calId)}/events`).replace(/\/+$/, '')}/`,
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

  // 5. Merge custom calendars from settings (or attach to newly created @group.calendar.google.com match)
  for (const custom of settings.customCalendars || []) {
    if (!custom || !custom.id) continue;
    const matchedDiscovered = discovered.find(
      (c) =>
        c.id.toLowerCase() === custom.id.toLowerCase() ||
        (custom.name && c.name.toLowerCase() === custom.name.toLowerCase()) ||
        (/kids/i.test(custom.name || '') && /kids/i.test(c.name || '') && c.id.includes('@group.calendar.google.com'))
    );
    if (matchedDiscovered) {
      matchedDiscovered.isCustomSharedCalendar = true;
      matchedDiscovered.customSharedWith = custom.sharedWith || [];
      if (custom.description) matchedDiscovered.description = custom.description;
      if (custom.color) matchedDiscovered.color = normalizeHexColor(custom.color, matchedDiscovered.color);
    } else {
      const backingId = custom.caldavBackingId || email;
      const isNativeGroupCal = custom.id.includes('@group.calendar.google.com');
      discovered.push({
        id: custom.id,
        caldavBackingId: backingId,
        name: custom.name || custom.id,
        originalSummary: custom.name || custom.id,
        description: custom.description || 'Shared Google Calendar',
        color: normalizeHexColor(custom.color, '#a855f7'),
        backgroundColor: normalizeHexColor(custom.color, '#a855f7'),
        primary: false,
        shared: true,
        isCustomSharedCalendar: true,
        needsGoogleCalendarContainer: !isNativeGroupCal,
        googleCreateCalendarUrl: 'https://calendar.google.com/calendar/u/0/r/settings/createcalendar',
        writable: custom.writable !== false,
        accessRole: custom.writable === false ? 'reader' : 'writer',
        caldavUrl: `https://apidata.googleusercontent.com/caldav/v2/${encodeURIComponent(backingId)}/events/`,
        customSharedWith: custom.sharedWith || [],
        source: 'custom',
      });
    }
  }

  // Helper to resolve a list of uids/emails/objects into full family member objects
  const resolveMemberList = (list) => {
    if (!Array.isArray(list) || list.length === 0) return [];
    const out = [];
    for (const item of list) {
      const q = typeof item === 'string' ? item.trim().toLowerCase() : String(item?.email || item?.uid || item?.name || '').trim().toLowerCase();
      if (!q) continue;
      const found = familyMembers.find(
        (fm) =>
          String(fm.uid || '').toLowerCase() === q ||
          String(fm.email || '').toLowerCase() === q ||
          String(fm.name || '').toLowerCase() === q ||
          String(fm.firstName || '').toLowerCase() === q ||
          String(fm.nickname || '').toLowerCase() === q
      );
      if (found && !out.some((x) => x.email === found.email)) {
        out.push(found);
      } else if (typeof item === 'object' && item?.email && !out.some((x) => x.email === item.email)) {
        out.push(item);
      }
    }
    return out;
  };

  // Household members for the main Google Family group calendar (members in 'Household' group, or all if no groups set)
  const householdMembers = familyMembers.filter(
    (m) => m.email && (!Array.isArray(m.groups) || m.groups.length === 0 || m.groups.some((g) => /^household$/i.test(g)))
  );

  // Infer a clear usage description for each Named Calendar when none is explicitly set
  const inferCalendarDescription = (cal, displayName, isFamilyCal) => {
    if (isFamilyCal) {
      return 'For stuff that our private family needs (household plans, family trips, dinners, and shared household activities).';
    }
    if (cal.isCustomSharedCalendar || /kids/i.test(displayName)) {
      return 'For stuff that the extended divorced side of the family needs (kids weekend custody schedule, kids appointments, school, and co-parenting events).';
    }
    if (cal.primary) {
      return 'My private calendar — for stuff that only I care about (personal reminders, solo work, and private appointments).';
    }
    if (cal.writable === false || /holiday/i.test(displayName)) {
      return 'Read-only public holidays and observances feed.';
    }
    return cal.description || 'Shared Named Google Calendar.';
  };

  // 6. Apply user-defined display name / color / description overrides & attach family members + KGraph node to each calendar
  const overrides = settings.calendarOverrides || {};
  const enriched = discovered.map((cal) => {
    const ov = overrides[cal.id] || {};
    const displayName = ov.name || cal.name;
    const color = normalizeHexColor(ov.color || cal.color, '#00bcd4');
    const isFamilyCal =
      !cal.isCustomSharedCalendar &&
      (/family/i.test(displayName) || /family/i.test(cal.originalSummary) || cal.id.startsWith('family'));
    const cidForLinks = cal.caldavBackingId || cal.id;
    const googleCalendarUrl = `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(cidForLinks)}`;
    const googleCalendarEmbedUrl = `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(cidForLinks)}`;
    const customMembers = resolveMemberList(ov.sharedWith || cal.customSharedWith);
    const sharedWith =
      customMembers.length > 0
        ? customMembers
        : isFamilyCal
          ? (householdMembers.length > 0 ? householdMembers : familyMembers.filter((m) => m.email))
          : [];
    const description =
      (ov.description && String(ov.description).trim()) ||
      (cal.isCustomSharedCalendar && cal.description && String(cal.description).trim()) ||
      inferCalendarDescription(cal, displayName, isFamilyCal);
    const slug = String(cal.id || displayName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const calendarRole = isFamilyCal
      ? 'private-household-family'
      : cal.isCustomSharedCalendar || /kids/i.test(displayName)
        ? 'extended-divorced-kids-family'
        : cal.primary
          ? 'private-personal-owner'
          : cal.writable === false
            ? 'public-readonly-feed'
            : 'shared-calendar';

    const calendarDocsMap = settings.calendarDocs || {};
    const calInviteDoc =
      calendarDocsMap[cal.id] ||
      Object.values(calendarDocsMap).find(
        (d) => d && d.calendarName && String(d.calendarName).toLowerCase() === displayName.toLowerCase()
      ) ||
      null;

    const kgraphNode = {
      '@id': `urn:robos:calendar:${slug}`,
      '@type': ['robos:NamedCalendar', 'schema:Schedule', 'oslc:Resource'],
      'dcterms:title': displayName,
      'dcterms:description': description,
      'robos:usagePurpose': description,
      'robos:calendarId': cal.id,
      'robos:calendarRole': calendarRole,
      'robos:color': color,
      'robos:writable': cal.writable !== false,
      'robos:googleCalendarUrl': googleCalendarUrl,
      ...(calInviteDoc?.docUrl ? { 'robos:inviteDocUrl': calInviteDoc.docUrl } : {}),
      'robos:sharedWith': sharedWith.map((m) => ({
        '@id': `urn:robos:person:${m.uid || m.email}`,
        'dcterms:title': m.name,
        'schema:email': m.email,
      })),
    };

    return {
      ...cal,
      name: displayName,
      summary: displayName,
      description,
      usagePurpose: description,
      calendarRole,
      color,
      backgroundColor: color,
      isFamilyCalendar: isFamilyCal,
      googleCalendarUrl,
      googleCalendarEmbedUrl,
      inviteDocId: calInviteDoc?.docId || '',
      inviteDocTitle: calInviteDoc?.docTitle || '',
      inviteDocUrl: calInviteDoc?.docUrl || '',
      sharedWith,
      kgraphNode,
    };
  });

  // Determine default target calendar for creating events (prefer Family calendar if writable, or user setting, or Primary)
  const preferredId = settings.defaultCalendarId;
  const defaultCal = (preferredId && enriched.find((c) => c.id === preferredId && c.writable))
    || enriched.find((c) => c.isFamilyCalendar && c.writable)
    || enriched.find((c) => c.primary)
    || enriched[0];

  const result = {
    ok: true,
    email,
    accountId: account?.id || '',
    defaultCalendarId: defaultCal?.id || email,
    calendars: enriched,
    familyMembers,
  };

  try {
    syncCalendarKGraphToStore(result, options);
  } catch {}

  return result;
}

/**
 * Builds and persists the JSON-LD Knowledge Graph for RobOS Google Calendar & its Named Calendars
 * into `~/.config/robos/kgraph/google-calendars.jsonld` and updates `~/.config/robos/ekgraph/nodes.json`.
 */
function buildCalendarKGraph(discovered = {}) {
  const calendars = Array.isArray(discovered.calendars) ? discovered.calendars : [];
  const familyMembers = Array.isArray(discovered.familyMembers) ? discovered.familyMembers : [];

  const appNode = {
    '@id': 'urn:robos:desktop-app:google-calendar',
    '@type': ['oslc_am:Resource', 'robos:DesktopApp', 'schema:SoftwareApplication'],
    'dcterms:title': 'RobOS Google Calendar',
    'dcterms:description':
      'Google Calendar & Mozilla Thunderbird CalDAV suite with Named & Shared Calendars: (1) Family Calendar for stuff that our private household family needs, (2) Kids Calendar for stuff that the extended divorced side of the family needs, and (3) Private/Primary Calendar for stuff that only the owner cares about.',
    'robos:managesCalendars': calendars.map((c) => ({ '@id': c.kgraphNode?.['@id'] || `urn:robos:calendar:${c.id}` })),
  };

  const calNodes = calendars.map((c) => c.kgraphNode).filter(Boolean);
  const personNodes = familyMembers
    .filter((m) => m && (m.uid || m.email))
    .map((m) => ({
      '@id': `urn:robos:person:${m.uid || m.email}`,
      '@type': ['oslc:Person', 'schema:Person'],
      'dcterms:title': m.name,
      'dcterms:description': m.role || m.summary || '',
      'schema:email': m.email || '',
      'robos:groups': Array.isArray(m.groups) ? m.groups : [],
    }));

  return {
    '@context': {
      dcterms: 'http://purl.org/dc/terms/',
      oslc: 'http://open-services.net/ns/core#',
      oslc_am: 'http://open-services.net/ns/am#',
      robos: 'https://robos.dev/ns/sdlc#',
      schema: 'https://schema.org/',
    },
    '@id': 'urn:robos:package:google-calendar',
    '@type': ['oslc:ServiceProvider', 'robos:Package'],
    'dcterms:title': 'RobOS Google Calendar & Named Calendars KGraph',
    'dcterms:description':
      'Knowledge Graph describing RobOS Google Calendar and the purpose of each Named Calendar: Family (stuff our private household family needs), Kids Calendar (stuff the extended divorced side of the family needs), and Private Calendar (stuff only the owner cares about).',
    '@graph': [appNode, ...calNodes, ...personNodes],
  };
}

function syncCalendarKGraphToStore(discovered = {}, options = {}) {
  const configDir = getConfigDir(options);
  const kgraphDir = path.join(configDir, 'kgraph');
  fs.mkdirSync(kgraphDir, { recursive: true });
  const kgraphPayload = buildCalendarKGraph(discovered);
  const kgraphFile = path.join(kgraphDir, 'google-calendars.jsonld');
  fs.writeFileSync(kgraphFile, JSON.stringify(kgraphPayload, null, 2), 'utf8');

  // Also synchronize calendar nodes with descriptions into ~/.config/robos/ekgraph/nodes.json if present
  const ekgraphDir = path.join(configDir, 'ekgraph');
  const ekNodesPath = path.join(ekgraphDir, 'nodes.json');
  try {
    fs.mkdirSync(ekgraphDir, { recursive: true });
    let nodes = [];
    if (fs.existsSync(ekNodesPath)) {
      nodes = JSON.parse(fs.readFileSync(ekNodesPath, 'utf8'));
      if (!Array.isArray(nodes)) nodes = [];
    }
    const nowIso = new Date().toISOString();
    const calEntries = [
      {
        path: 'apps/google-calendar',
        title: 'RobOS Google Calendar',
        type: 'application',
        description:
          'Google Calendar & Mozilla Thunderbird CalDAV suite managing Named Calendars: Family (stuff our private family needs), Dipiazza Kids Calendar (stuff the extended divorced side of the family needs), and Private Calendar (stuff only I care about).',
        content:
          'Google Calendar & Mozilla Thunderbird CalDAV suite managing Named Calendars: Family (stuff our private family needs), Dipiazza Kids Calendar (stuff the extended divorced side of the family needs), and Private Calendar (stuff only I care about).',
        tags: ['calendar', 'google-calendar', 'thunderbird', 'caldav', 'household'],
        links: (discovered.calendars || []).map((c) => `calendars/${c.id}`),
        updatedAt: nowIso,
      },
      ...(discovered.calendars || []).map((c) => ({
        path: `calendars/${c.id}`,
        title: c.name,
        type: 'calendar',
        role: c.calendarRole || 'calendar',
        description: c.description || '',
        content: c.description || '',
        sharedWith: (c.sharedWith || []).map((m) => `${m.name} <${m.email}>`),
        tags: ['calendar', c.calendarRole || 'named-calendar'].filter(Boolean),
        links: ['apps/google-calendar', ...(c.sharedWith || []).map((m) => `people/${m.uid || m.email}`)],
        updatedAt: nowIso,
      })),
    ];

    const filtered = nodes.filter(
      (n) => n && n.path !== 'apps/google-calendar' && !String(n.path || '').startsWith('calendars/')
    );
    filtered.push(...calEntries);
    fs.writeFileSync(ekNodesPath, JSON.stringify(filtered, null, 2), 'utf8');
  } catch {}

  return { ok: true, kgraphFile, kgraph: kgraphPayload };
}

/**
 * Saves a custom alias or color override for a Named Google Calendar, or creates/updates a custom shared Named Calendar.
 */
function saveNamedCalendarConfig({ id, name, color, description, sharedWith, caldavBackingId, isDefault = false }, options = {}) {
  const slugId = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const calId = String(id || '').trim() || slugId || `custom-${Date.now()}@group.calendar.google.com`;
  const settings = loadCalendarSettings(options);
  settings.calendarOverrides = settings.calendarOverrides || {};
  settings.calendarOverrides[calId] = {
    ...(settings.calendarOverrides[calId] || {}),
    ...(name ? { name: String(name).trim() } : {}),
    ...(color ? { color: normalizeHexColor(color) } : {}),
    ...(description !== undefined ? { description: String(description).trim() } : {}),
    ...(Array.isArray(sharedWith) ? { sharedWith } : {}),
  };

  if (name && (!id || !id.includes('@') || caldavBackingId || Array.isArray(sharedWith))) {
    settings.customCalendars = Array.isArray(settings.customCalendars) ? settings.customCalendars : [];
    const existingIdx = settings.customCalendars.findIndex((c) => c && c.id === calId);
    const customEntry = {
      ...(existingIdx >= 0 ? settings.customCalendars[existingIdx] : {}),
      id: calId,
      name: String(name).trim(),
      color: normalizeHexColor(color || settings.customCalendars[existingIdx]?.color, '#a855f7'),
      description: description !== undefined ? String(description).trim() : (settings.customCalendars[existingIdx]?.description || 'Shared Named Google Calendar'),
      writable: true,
      ...(caldavBackingId ? { caldavBackingId } : {}),
      ...(Array.isArray(sharedWith) ? { sharedWith } : {}),
    };
    if (existingIdx >= 0) {
      settings.customCalendars[existingIdx] = customEntry;
    } else {
      settings.customCalendars.push(customEntry);
    }
  }

  if (isDefault) {
    settings.defaultCalendarId = calId;
  }
  saveCalendarSettings(settings, options);

  // If this calendar is a real Google CalDAV calendar (@gmail.com or @group.calendar.google.com),
  // asynchronously sync its description/name/color to Google Calendar via CalDAV PROPPATCH.
  if (calId.includes('@') && !options.skipNetwork && process.env.ROBOS_TEST !== '1') {
    syncCalendarMetadataToCaldav(calId, { name, description, color }, options).catch(() => {});
  }

  return { ok: true, id: calId, settings };
}

/**
 * Updates a Google Calendar's `<C:calendar-description>` (and `<D:displayname>` / `<A:calendar-color>`)
 * directly on Google's servers via CalDAV `PROPPATCH`.
 */
async function syncCalendarMetadataToCaldav(calId, { name, description, color } = {}, options = {}) {
  if (!calId || !calId.includes('@')) return { ok: false, reason: 'not-google-caldav-id' };
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') return { ok: false, reason: 'no-fetch' };

  const accounts = cloudAccounts.listCloudAccounts(options) || [];
  const googleAcct = accounts.find((a) => a.provider === 'google' && a.email) || accounts[0];
  const email = googleAcct?.email || '';
  const tok = getCaldavAccessToken(email, options);
  if (!tok) return { ok: false, reason: 'no-caldav-token' };

  const escXml = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const propLines = [];
  if (description !== undefined && String(description).trim()) {
    propLines.push(`<C:calendar-description>${escXml(String(description).trim())}</C:calendar-description>`);
  }
  if (name !== undefined && String(name).trim() && !calId.endsWith('@gmail.com')) {
    propLines.push(`<D:displayname>${escXml(String(name).trim())}</D:displayname>`);
  }
  if (color !== undefined && /^#[0-9a-fA-F]{6}$/.test(String(color).trim())) {
    propLines.push(`<A:calendar-color>${String(color).trim().toUpperCase()}FF</A:calendar-color>`);
  }
  if (propLines.length === 0) return { ok: false, reason: 'nothing-to-patch' };

  const xmlBody = `<?xml version="1.0" encoding="utf-8" ?>
<D:propertyupdate xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:A="http://apple.com/ns/ical/">
  <D:set>
    <D:prop>
      ${propLines.join('\n      ')}
    </D:prop>
  </D:set>
</D:propertyupdate>`;

  const url = `https://apidata.googleusercontent.com/caldav/v2/${encodeURIComponent(calId)}/events/`;
  const res = await fetchImpl(url, {
    method: 'PROPPATCH',
    headers: {
      Authorization: `Bearer ${tok}`,
      'Content-Type': 'application/xml; charset=utf-8',
    },
    body: xmlBody,
    signal: AbortSignal.timeout(8000),
  });
  return { ok: res.ok || res.status === 207, status: res.status };
}

/**
 * Checks if any custom calendar in `settings.customCalendars` (that lacked a native `@group.calendar.google.com`
 * container) has now been created in Google Calendar web settings (`PROPFIND` returns a matching `@group.calendar.google.com`).
 * When found, automatically links the real `@group.calendar.google.com` ID, patches its description/color via `PROPPATCH`,
 * and moves all events tagged for that custom calendar into the new `@group.calendar.google.com` calendar.
 */
async function promoteCustomCalendarsToGoogleContainers(options = {}) {
  const settings = loadCalendarSettings(options);
  const pendingCustoms = (settings.customCalendars || []).filter(
    (c) => c && c.id && !c.id.includes('@group.calendar.google.com')
  );
  if (pendingCustoms.length === 0) return { ok: true, promoted: [] };

  const discovered = await discoverNamedCalendars(null, options);
  const promoted = [];
  for (const custom of pendingCustoms) {
    const match = (discovered.calendars || []).find(
      (c) =>
        c.id.includes('@group.calendar.google.com') &&
        !c.isFamilyCalendar &&
        (c.name.toLowerCase() === String(custom.name || '').toLowerCase() ||
          c.originalSummary?.toLowerCase() === String(custom.name || '').toLowerCase() ||
          (/kids/i.test(custom.name || '') && /kids/i.test(c.name || '')))
    );
    if (!match) continue;

    const oldId = custom.id;
    const newGroupId = match.id;
    custom.id = newGroupId;
    custom.caldavBackingId = newGroupId;
    settings.calendarOverrides = settings.calendarOverrides || {};
    settings.calendarOverrides[newGroupId] = {
      ...(settings.calendarOverrides[oldId] || {}),
      name: custom.name || match.name,
      color: custom.color || match.color,
      description: custom.description || match.description,
      sharedWith: custom.sharedWith || [],
    };
    delete settings.calendarOverrides[oldId];
    if (settings.calendarDocs && settings.calendarDocs[oldId]) {
      settings.calendarDocs[newGroupId] = {
        ...settings.calendarDocs[oldId],
        calendarId: newGroupId,
      };
      delete settings.calendarDocs[oldId];
    }
    saveCalendarSettings(settings, options);

    await syncCalendarMetadataToCaldav(
      newGroupId,
      { name: custom.name, description: custom.description, color: custom.color },
      options
    ).catch(() => {});

    // Move any events tagged for this custom calendar from the old backing calendar to the new @group.calendar.google.com
    for (const q of ['kid weekend', 'Leo Therapy']) {
      await moveNamedCalendarEvent(
        { query: q, fromCalendar: discovered.email, toCalendar: newGroupId },
        options
      ).catch(() => {});
    }

    promoted.push({ oldId, newGroupId, name: custom.name });
  }
  return { ok: true, promoted };
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

function escapeIcsParamValue(val) {
  return String(val || '')
    .replace(/"/g, "'")
    .replace(/[\r\n]+/g, ' ')
    .trim();
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
    let inclusiveEndYmd = formatIcsDateOnly(ev.endDate || ev.end || ev.startDate || ev.start);
    if (inclusiveEndYmd < startYmd) {
      inclusiveEndYmd = startYmd;
    }
    let endYmd = inclusiveEndYmd;
    if (!ev.endDateIsExclusive) {
      // RFC 5545 DTEND for all-day events is exclusive (+1 day after the human inclusive endDate)
      const ey = Number(inclusiveEndYmd.slice(0, 4));
      const em = Number(inclusiveEndYmd.slice(4, 6)) - 1;
      const ed = Number(inclusiveEndYmd.slice(6, 8));
      endYmd = formatIcsDateOnly(new Date(ey, em, ed + 1));
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
  const catName = ev.calendarCategoryName || ev.calendarName || '';
  if (catName) {
    lines.push(`CATEGORIES:${escapeIcsText(catName)}`);
  }
  if (ev.organizerEmail) {
    lines.push(`ORGANIZER;CN="${escapeIcsParamValue(ev.organizerName || ev.organizerEmail)}":mailto:${ev.organizerEmail}`);
  }
  for (const att of ev.attendees || []) {
    if (!att || !att.email) continue;
    lines.push(
      `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN="${escapeIcsParamValue(att.name || att.email)}":mailto:${att.email}`
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
      : Array.isArray(targetCal?.sharedWith) && targetCal.sharedWith.length > 0
        ? targetCal.sharedWith
        : targetCal?.isFamilyCalendar
          ? discovered.familyMembers
          : [];
  const attendees = resolveAttendees(rawAttendeesInput, options);
  const rrule = buildRruleLine(eventInput.recurrence || eventInput.rrule);
  const uid = eventInput.uid || `robos-evt-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  if (eventInput.replaceEventId) {
    try {
      await deleteNamedCalendarEvent(eventInput.replaceEventId, {
        ...options,
        calendarId: eventInput.replaceCalendarId || targetCal?.id,
      });
    } catch {}
  }

  let meetingUrl = String(eventInput.meetingUrl || '').trim();
  if (!meetingUrl && eventInput.addVideoCall) {
    const slug = summary.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'family';
    meetingUrl = `https://meet.jit.si/RobOS-${slug}-${crypto.randomBytes(3).toString('hex')}`;
  }

  const organizerPerson = (discovered.familyMembers || []).find(
    (fm) => fm.email && fm.email.toLowerCase() === String(discovered.email || '').toLowerCase()
  );

  // On a shared Family calendar, family members already share the calendar with write access.
  // Emitting ORGANIZER + ATTENDEE lines in CalDAV locks the event as read-only ("guestsCanModify: false")
  // for other family members in Google Calendar. Only emit ATTENDEE lines for external (non-family) guests
  // or on non-Family calendars (such as Dipiazza Kids Calendar where members receive events via ATTENDEE).
  const familyEmailSet = new Set(
    (discovered.familyMembers || []).map((fm) => String(fm.email || '').toLowerCase()).filter(Boolean)
  );
  const icsAttendees =
    targetCal?.isFamilyCalendar && !eventInput.forceAttendeeInvites
      ? attendees.filter((a) => !familyEmailSet.has(String(a.email || '').toLowerCase()))
      : attendees;

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
    calendarCategoryName: targetCal?.isCustomSharedCalendar ? targetCal.name : '',
    organizerEmail: targetCal?.isFamilyCalendar && icsAttendees.length === 0 ? '' : discovered.email,
    organizerName: organizerPerson?.name || discovered.email,
    attendees: icsAttendees,
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
      const caldavTargetId = targetCal.caldavBackingId || targetCal.id;
      caldavResourceUrl = `https://apidata.googleusercontent.com/caldav/v2/${encodeURIComponent(caldavTargetId)}/events/${encodeURIComponent(uid)}.ics`;
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
      const matchedCal = calId && discovered.calendars.find((c) => c.id === calId);
      const resolvedCalId = matchedCal ? (matchedCal.caldavBackingId || matchedCal.id) : calId;
      const candidateCalIds = resolvedCalId
        ? Array.from(new Set([resolvedCalId, discovered.email]))
        : Array.from(new Set(discovered.calendars.filter((c) => c.writable).map((c) => c.caldavBackingId || c.id)));
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
    // Keep only the master VEVENT (first VEVENT) and rewrite UID + ORGANIZER + CATEGORIES/ATTENDEES for destination calendar
    const firstVeventMatch = calData.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/i);
    if (!firstVeventMatch) continue;
    const dstOrganizerEmail = dstCal.caldavBackingId || dstCal.id;
    let veventBlock = firstVeventMatch[0]
      .replace(/\r\n /g, '')
      .replace(/\n /g, '')
      .replace(/^UID:.*$/gm, `UID:${newUid}`)
      .replace(/^CATEGORIES:.*[\r\n]*/gm, '')
      .replace(/^ORGANIZER[^:]*:.*$/gm, `ORGANIZER;CN="${escapeIcsParamValue(dstCal.name)}":mailto:${dstOrganizerEmail}`);

    if (dstCal.isCustomSharedCalendar && Array.isArray(dstCal.sharedWith) && dstCal.sharedWith.length > 0) {
      // Replace ATTENDEE lines with the exact members of the custom shared calendar
      veventBlock = veventBlock.replace(/^ATTENDEE[^:]*:.*[\r\n]*/gm, '');
      const attendeeLines = dstCal.sharedWith
        .filter((m) => m && m.email)
        .map(
          (m) =>
            `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=TRUE;CN="${escapeIcsParamValue(
              m.name || m.email
            )}":mailto:${m.email}`
        );
      veventBlock = veventBlock.replace(
        /END:VEVENT/i,
        `CATEGORIES:${escapeIcsText(dstCal.name)}\r\n${attendeeLines.join('\r\n')}\r\nEND:VEVENT`
      );
    }

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
      if (srcCal.caldavUrl !== dstCal.caldavUrl || uid !== newUid) {
        const delUrl = `${srcCal.caldavUrl}${encodeURIComponent(uid)}.ics`;
        await fetchImpl(delUrl, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${caldavToken}` },
          signal: AbortSignal.timeout(10000),
        });
      }
      // Update local store with new UID and destination calendarId
      const existingLocal = thunderbirdGoogle.loadLocalCalendarEvents(options).filter(
        (e) => e.uid !== uid && e.id !== `tb-${uid}`
      );
      const dtM = veventBlock.match(/^DTSTART([^:]*):(.*)$/m);
      const deM = veventBlock.match(/^DTEND([^:]*):(.*)$/m);
      const rrM = veventBlock.match(/^RRULE:(.*)$/m);
      const rawStart = dtM ? dtM[2].trim() : '';
      const rawEnd = deM ? deM[2].trim() : '';
      const isAllDay = /^\d{8}$/.test(rawStart) || /VALUE=DATE/i.test(dtM?.[1] || '');
      let startDateStr;
      let endDateStr;
      if (isAllDay && /^\d{8}$/.test(rawStart)) {
        startDateStr = `${rawStart.slice(0, 4)}-${rawStart.slice(4, 6)}-${rawStart.slice(6, 8)}`;
        if (/^\d{8}$/.test(rawEnd)) {
          const incObj = new Date(Number(rawEnd.slice(0, 4)), Number(rawEnd.slice(4, 6)) - 1, Number(rawEnd.slice(6, 8)) - 1);
          endDateStr = `${incObj.getFullYear()}-${String(incObj.getMonth() + 1).padStart(2, '0')}-${String(incObj.getDate()).padStart(2, '0')}`;
        } else {
          endDateStr = startDateStr;
        }
      }
      const rruleVal = rrM ? rrM[1].trim() : '';
      const rawStartIso = startDateStr ? new Date(`${startDateStr}T00:00:00`).toISOString() : new Date().toISOString();
      const rawEndIso = endDateStr ? new Date(`${endDateStr}T23:59:59`).toISOString() : new Date().toISOString();
      const { start: advStart, end: advEnd } = advanceRecurringStartEnd(rawStartIso, rawEndIso, rruleVal);
      existingLocal.push({
        id: `tb-${newUid}`,
        uid: newUid,
        summary,
        start: advStart,
        end: advEnd,
        startDate: startDateStr,
        endDate: endDateStr,
        allDay: isAllDay,
        recurring: Boolean(rruleVal),
        rrule: rruleVal,
        calendarId: dstCal.id,
        calendarName: dstCal.name,
        color: dstCal.color,
        accountEmail: discovered.email,
        attendees: (dstCal.sharedWith || []).map((m) => `${m.name} <${m.email}>`),
        source: 'google-caldav-live',
      });
      thunderbirdGoogle.saveLocalCalendarEvents(existingLocal, options);

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
      const endRange = formatIcsUtcDateTime(new Date(now.getTime() + 400 * 86400 * 1000));
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

      const queriedCaldavUrls = new Set();
      const baseCalendarsToQuery = calendars.filter((cal) => {
        if (!cal.caldavUrl || queriedCaldavUrls.has(cal.caldavUrl)) return false;
        queriedCaldavUrls.add(cal.caldavUrl);
        return true;
      });

      await Promise.all(
        baseCalendarsToQuery.map(async (cal) => {
          try {
            const res = await fetchImpl(cal.caldavUrl, {
              method: 'REPORT',
              headers: {
                Authorization: `Bearer ${caldavToken}`,
                Depth: '1',
                'Content-Type': 'application/xml; charset=utf-8',
              },
              body: reportXml,
              signal: AbortSignal.timeout(15000),
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
              const catM = block.match(/^CATEGORIES:(.*)$/m);
              if (!dtM) continue;

              const rawStart = dtM[2].trim();
              const rawEnd = deM ? deM[2].trim() : '';
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

              let startDateStr;
              let endDateStr;
              let rawStartIso = parseIcsTime(rawStart);
              let rawEndIso = rawEnd ? parseIcsTime(rawEnd) : new Date(new Date(rawStartIso).getTime() + 3600000).toISOString();

              if (isAllDay && /^\d{8}$/.test(rawStart)) {
                startDateStr = `${rawStart.slice(0, 4)}-${rawStart.slice(4, 6)}-${rawStart.slice(6, 8)}`;
                if (/^\d{8}$/.test(rawEnd)) {
                  // RFC 5545 DTEND;VALUE=DATE is exclusive; subtract 1 day for human inclusive endDate
                  const ey = Number(rawEnd.slice(0, 4));
                  const em = Number(rawEnd.slice(4, 6)) - 1;
                  const ed = Number(rawEnd.slice(6, 8));
                  const incObj = new Date(ey, em, ed - 1);
                  const incYmd = `${incObj.getFullYear()}-${String(incObj.getMonth() + 1).padStart(2, '0')}-${String(incObj.getDate()).padStart(2, '0')}`;
                  endDateStr = incYmd < startDateStr ? startDateStr : incYmd;
                } else {
                  endDateStr = startDateStr;
                }
                rawStartIso = new Date(`${startDateStr}T00:00:00`).toISOString();
                rawEndIso = new Date(`${endDateStr}T23:59:59`).toISOString();
              }

              const rruleVal = rrM ? rrM[1].trim() : '';
              const { start: startIso, end: endIso } = advanceRecurringStartEnd(rawStartIso, rawEndIso, rruleVal, now.getTime() - 3600000);
              if (isAllDay && rruleVal) {
                const advS = new Date(startIso);
                const advE = new Date(endIso);
                if (!Number.isNaN(advS.getTime()) && !Number.isNaN(advE.getTime())) {
                  startDateStr = `${advS.getFullYear()}-${String(advS.getMonth() + 1).padStart(2, '0')}-${String(advS.getDate()).padStart(2, '0')}`;
                  endDateStr = `${advE.getFullYear()}-${String(advE.getMonth() + 1).padStart(2, '0')}-${String(advE.getDate()).padStart(2, '0')}`;
                }
              }
              const uidVal = uidM ? uidM[1].trim() : `caldav-${caldavEvents.length}`;
              const summaryVal = (sumM ? sumM[1].trim() : '(Untitled Event)').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/g, ' ');
              const locVal = (locM ? locM[1].trim() : '').replace(/\\,/g, ',').replace(/\\n/g, ' ');
              const descVal = (descM ? descM[1].trim() : '').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/g, '\n');
              const catVal = (catM ? catM[1].trim() : '').replace(/\\,/g, ',');

              const attendees = [];
              for (const attM of block.matchAll(/^ATTENDEE([^:]*):mailto:([^\r\n]+)$/gim)) {
                const params = attM[1] || '';
                const mail = attM[2].trim();
                const cnM = params.match(/CN="?([^";]+)"?/i);
                attendees.push(cnM ? `${cnM[1]} <${mail}>` : mail);
              }

              const localOverride = localEvents.find((le) => le.uid === uidVal);
              const familyCal = calendars.find((c) => c.isFamilyCalendar);
              const familyEmails = new Set(
                (familyCal?.sharedWith || []).map((m) => String(m.email || '').toLowerCase()).filter(Boolean)
              );
              const attendeeEmailList = attendees
                .map((a) => {
                  const m = String(a).match(/<([^>]+)>/);
                  return (m ? m[1] : String(a)).trim().toLowerCase();
                })
                .filter(Boolean);
              const matchedByExclusiveAttendee =
                cal.primary &&
                attendeeEmailList.length > 0 &&
                calendars.find(
                  (c) =>
                    c.isCustomSharedCalendar &&
                    Array.isArray(c.sharedWith) &&
                    c.sharedWith.some((m) => {
                      const em = String(m.email || '').toLowerCase();
                      return em && !familyEmails.has(em) && attendeeEmailList.includes(em);
                    })
                );
              const matchedCustomCal =
                (catVal && calendars.find((c) => c.name.toLowerCase() === catVal.toLowerCase())) ||
                (localOverride?.calendarId &&
                  localOverride.calendarId !== cal.id &&
                  calendars.find((c) => c.id === localOverride.calendarId)) ||
                matchedByExclusiveAttendee;
              const effectiveCal = matchedCustomCal || cal;

              caldavEvents.push({
                id: `tb-${uidVal}`,
                uid: uidVal,
                summary: summaryVal,
                description: descVal,
                start: startIso,
                end: endIso,
                startDate: startDateStr,
                endDate: endDateStr,
                allDay: isAllDay,
                recurring: Boolean(rruleVal),
                rrule: rruleVal,
                category: effectiveCal.isFamilyCalendar ? 'family' : 'meeting',
                source: 'google-caldav-live',
                calendarId: effectiveCal.id,
                calendarName: effectiveCal.name,
                color: effectiveCal.color,
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
 * Strictly scopes a full calendar state object to a single Named Calendar so that
 * anyone opening that calendar's Invite Google Doc / WebApp link ONLY sees:
 *   1. That specific calendar (`targetCal`)
 *   2. The members who belong to that calendar (`targetCal.sharedWith`) — never unrelated
 *      people from other calendars who are not in their calendar invites
 *   3. Events belonging to that calendar
 */
function scopeCalendarStateForCalendar(state = {}, calendarIdOrName = '') {
  const q = String(calendarIdOrName || '').trim().toLowerCase();
  if (!q) return state;
  const calendars = Array.isArray(state.calendars) ? state.calendars : [];
  const targetCal =
    calendars.find((c) => String(c.id || '').toLowerCase() === q) ||
    calendars.find((c) => String(c.name || '').toLowerCase() === q) ||
    calendars.find((c) => String(c.name || '').toLowerCase().includes(q));
  if (!targetCal) return state;

  const allowedMemberEmails = new Set(
    (targetCal.sharedWith || []).map((m) => String(m.email || '').toLowerCase()).filter(Boolean)
  );
  if (state.email && targetCal.primary) {
    allowedMemberEmails.add(String(state.email).toLowerCase());
  }

  const allFamilyEmails = new Set(
    (state.familyMembers || []).map((m) => String(m.email || '').toLowerCase()).filter(Boolean)
  );

  // Only expose people who belong to this specific calendar
  const scopedMembers =
    allowedMemberEmails.size > 0
      ? (state.familyMembers || []).filter((fm) => allowedMemberEmails.has(String(fm.email || '').toLowerCase()))
      : [];

  // Only expose events on this calendar (and never expose an event that has a member from another calendar not in this calendar)
  const scopedEvents = (state.events || []).filter((ev) => {
    const sameCal =
      String(ev.calendarId || '').toLowerCase() === String(targetCal.id || '').toLowerCase() ||
      String(ev.calendarName || '').toLowerCase() === String(targetCal.name || '').toLowerCase();
    if (!sameCal) return false;
    if (allowedMemberEmails.size > 0 && Array.isArray(ev.attendees)) {
      for (const att of ev.attendees) {
        const m = String(att).match(/<([^>]+)>/);
        const em = (m ? m[1] : String(att)).trim().toLowerCase();
        // If attendee is a known RobOS person who is NOT in this calendar's allowed members, exclude/hide
        if (allFamilyEmails.has(em) && !allowedMemberEmails.has(em)) {
          return false;
        }
      }
    }
    return true;
  });

  return {
    ...state,
    scopedCalendarId: targetCal.id,
    scopedCalendarName: targetCal.name,
    defaultCalendarId: targetCal.id,
    calendars: [targetCal],
    familyMembers: scopedMembers,
    events: scopedEvents,
  };
}

/**
 * Resolves a month/day (with optional year) into `YYYY-MM-DD`, rolling into next year if the date
 * in the current year is already more than 7 days in the past.
 */
function resolveSmartYmd(monthIdx, dayNum, explicitYear, now = new Date()) {
  let year = explicitYear ? Number(explicitYear) : now.getFullYear();
  if (year < 100) year += 2000;
  const candidate = new Date(year, monthIdx, dayNum);
  if (!explicitYear && candidate.getTime() < now.getTime() - 7 * 86400 * 1000) {
    year += 1;
  }
  const d = new Date(year, monthIdx, dayNum);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toTitleCaseCity(str) {
  return String(str || '')
    .trim()
    .split(/([\s-]+ )/)
    .map((part) =>
      part.replace(/\b([A-Za-z])([A-Za-z]{2,})\b/g, (_, a, b) => a.toUpperCase() + b.toLowerCase())
    )
    .join('');
}

function parseClockTo24h(timeStr) {
  const m = String(timeStr || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?$/);
  if (!m) return null;
  let hh = Number(m[1]);
  const mm = Number(m[2]);
  const ap = (m[3] || '').toUpperCase();
  if (ap === 'PM' && hh < 12) hh += 12;
  if (ap === 'AM' && hh === 12) hh = 0;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Parses pasted multi-line flight itineraries (Delta, United, American, Southwest, etc.),
 * hotel check-in/check-out confirmations, `.ics` snippets, or email/calendar invitations
 * into a primary event + an array of `detectedEvents` (e.g. Multi-Day Trip + Outbound & Return Flights).
 */
function parseItineraryOrInviteText(rawText, options = {}) {
  const text = String(rawText || '').replace(/\r\n/g, '\n').trim();
  if (!text) return null;

  const now = options.now ? new Date(options.now) : new Date();
  const family = options.familyMembers || listFamilyMembers(options);
  const calendars = options.calendars || [];
  const familyCal = calendars.find((c) => c.isFamilyCalendar) || calendars.find((c) => /family/i.test(c.name || ''));

  const months = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
    may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
    sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
  };

  // Match any family members mentioned in the text (e.g. "Name: DIANA ARRINGTON")
  const matchedAttendees = [];
  const lowerText = text.toLowerCase();
  for (const fm of family) {
    const tokens = [fm.name, fm.firstName, fm.nickname].filter(Boolean);
    for (const tok of tokens) {
      if (tok.length < 3) continue;
      const re = new RegExp(`\\b${tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (re.test(lowerText) && fm.email && !matchedAttendees.some((a) => a.email === fm.email)) {
        matchedAttendees.push({ name: fm.name, email: fm.email, uid: fm.uid, avatar: fm.avatar });
        break;
      }
    }
  }

  // Extract passenger name if present
  const passengerM = text.match(/(?:Passenger\s+Info[\s\n]+)?Name:\s*([A-Z][A-Za-z ,.'-]+)$/im);
  const passengerName = passengerM
    ? passengerM[1]
        .trim()
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : matchedAttendees[0]?.name || '';

  // 1. Check for airline flight itinerary (e.g. Delta, United, American, Southwest, Alaska, JetBlue)
  const rawLines = text
    .split('\n')
    .map((l) => l.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim())
    .filter(Boolean);

  const dateHeaderRe = /^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:day|nesday|rsday|urday)?,?\s*)?(?:(\d{1,2})\s*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*(?:\s*(\d{2,4}))?|(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?|(\d{4})-(\d{2})-(\d{2}))$/i;
  const flightHeaderRe = /^(DELTA|UNITED|AMERICAN|SOUTHWEST|ALASKA|JETBLUE|SPIRIT|FRONTIER|LUFTHANSA|AIR\s+CANADA|BRITISH\s+AIRWAYS|DL|UA|AA|WN|AS|B6|NK|F9)\s*(\d{1,4})\*?$/i;
  const timeLineRe = /^(\d{1,2}:\d{2}\s*(?:AM|PM))$/i;
  const skipLineRe = /^(?:DEPART|ARRIVE|FLIGHT|SEAT|Seat assigned.*|.*Main Basic.*|.*Main Cabin.*|.*Comfort\+.*|.*First Class.*|.*Economy.*|.*Business.*|Visit .*)$/i;

  let currentYmd = '';
  const flightSegments = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const dm = line.match(dateHeaderRe);
    if (dm) {
      if (dm[1] && dm[2]) {
        currentYmd = resolveSmartYmd(months[dm[2].slice(0, 3).toLowerCase()], Number(dm[1]), dm[3], now);
      } else if (dm[4] && dm[5]) {
        currentYmd = resolveSmartYmd(months[dm[4].slice(0, 3).toLowerCase()], Number(dm[5]), dm[6], now);
      } else if (dm[7]) {
        currentYmd = `${dm[7]}-${dm[8]}-${dm[9]}`;
      }
      continue;
    }

    const fm = line.match(flightHeaderRe);
    if (fm && currentYmd) {
      const carrier = fm[1].toUpperCase();
      const flightNum = fm[2];
      const flightCode = `${carrier} ${flightNum}`;

      // Look ahead up to 8 lines for: DepartCity, DepartTime, ArriveCity, ArriveTime
      const lookahead = [];
      let j = i + 1;
      while (j < rawLines.length && lookahead.length < 4 && j <= i + 8) {
        const cand = rawLines[j];
        if (dateHeaderRe.test(cand) || flightHeaderRe.test(cand)) break;
        if (!skipLineRe.test(cand)) {
          lookahead.push(cand);
        }
        j++;
      }

      if (lookahead.length >= 4 && timeLineRe.test(lookahead[1]) && timeLineRe.test(lookahead[3])) {
        flightSegments.push({
          date: currentYmd,
          flight: flightCode,
          departCity: lookahead[0],
          departTimeRaw: lookahead[1].toUpperCase(),
          departTime24: parseClockTo24h(lookahead[1]) || '08:00',
          arriveCity: lookahead[2],
          arriveTimeRaw: lookahead[3].toUpperCase(),
          arriveTime24: parseClockTo24h(lookahead[3]) || '11:00',
        });
        i = j - 1;
      }
    }
  }

  if (flightSegments.length > 0) {
    // Group segments by date
    const byDate = new Map();
    for (const seg of flightSegments) {
      if (!byDate.has(seg.date)) byDate.set(seg.date, []);
      byDate.get(seg.date).push(seg);
    }

    const travelDates = Array.from(byDate.keys()).sort();
    const firstDate = travelDates[0];
    const lastDate = travelDates[travelDates.length - 1];
    const firstDaySegs = byDate.get(firstDate);
    const destCityRaw = firstDaySegs[firstDaySegs.length - 1].arriveCity;
    const destCityClean = toTitleCaseCity(destCityRaw);

    const itineraryLines = [];
    if (passengerName) itineraryLines.push(`Passenger: ${passengerName}`);
    for (const d of travelDates) {
      const segs = byDate.get(d);
      const dLabel = new Date(`${d}T12:00:00`).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      itineraryLines.push(`\n📅 ${dLabel}:`);
      for (const s of segs) {
        itineraryLines.push(`• ${s.flight}: Depart ${s.departCity} ${s.departTimeRaw} → Arrive ${s.arriveCity} ${s.arriveTimeRaw}`);
      }
    }
    const fullDescription = itineraryLines.join('\n').trim();
    const defaultCalId = familyCal?.id || calendars[0]?.id || '';
    const defaultCalName = familyCal?.name || calendars[0]?.name || 'Family';

    const detectedEvents = [];

    // If multi-day trip (or round-trip), build the overarching Multi-Day All-Day Event first
    if (travelDates.length >= 2 && lastDate > firstDate) {
      detectedEvents.push({
        summary: `🌴 Trip to ${destCityClean}${passengerName ? ` (${passengerName})` : ''}`,
        calendarId: defaultCalId,
        calendarName: defaultCalName,
        category: 'family',
        allDay: true,
        startDate: firstDate,
        startTime: '09:00',
        endDate: lastDate,
        endTime: '17:00',
        durationMinutes: 60,
        recurrence: 'NONE',
        location: destCityClean,
        description: fullDescription,
        attendees: matchedAttendees,
      });
    }

    // Also build timed Flight Events for each travel day
    for (let idx = 0; idx < travelDates.length; idx++) {
      const d = travelDates[idx];
      const segs = byDate.get(d);
      const firstSeg = segs[0];
      const lastSeg = segs[segs.length - 1];
      const flightCodes = segs.map((s) => s.flight).join(' / ');
      const routeChain = [firstSeg.departCity, ...segs.map((s) => s.arriveCity)].join(' → ');
      const dayDest = toTitleCaseCity(lastSeg.arriveCity);
      const labelPrefix = travelDates.length > 1 ? (idx === 0 ? '✈️ Outbound Flight' : idx === travelDates.length - 1 ? '✈️ Return Flight' : '✈️ Flight') : '✈️ Flight';
      const legLines = [
        ...(passengerName ? [`Passenger: ${passengerName}`] : []),
        ...segs.map((s) => `• ${s.flight}: Depart ${s.departCity} ${s.departTimeRaw} → Arrive ${s.arriveCity} ${s.arriveTimeRaw}`),
      ];

      detectedEvents.push({
        summary: `${labelPrefix} to ${dayDest} (${flightCodes})`,
        calendarId: defaultCalId,
        calendarName: defaultCalName,
        category: 'family',
        allDay: false,
        startDate: d,
        startTime: firstSeg.departTime24,
        endDate: d,
        endTime: lastSeg.arriveTime24,
        durationMinutes: 180,
        recurrence: 'NONE',
        location: routeChain,
        description: legLines.join('\n'),
        attendees: matchedAttendees,
      });
    }

    const primary = { ...detectedEvents[0], detectedEvents };
    return primary;
  }

  // 2. Check for raw .ics VEVENT snippet
  if (/BEGIN:VEVENT/i.test(text)) {
    const unfolded = text.replace(/\r\n /g, '').replace(/\n /g, '');
    const sumM = unfolded.match(/^SUMMARY:(.*)$/im);
    const dtM = unfolded.match(/^DTSTART([^:]*):(.*)$/im);
    const deM = unfolded.match(/^DTEND([^:]*):(.*)$/im);
    const locM = unfolded.match(/^LOCATION:(.*)$/im);
    const descM = unfolded.match(/^DESCRIPTION:(.*)$/im);
    if (sumM && dtM) {
      const rawStart = dtM[2].trim();
      const rawEnd = deM ? deM[2].trim() : rawStart;
      const isAllDay = /^\d{8}$/.test(rawStart) || /VALUE=DATE/i.test(dtM[1] || '');
      const sYmd = `${rawStart.slice(0, 4)}-${rawStart.slice(4, 6)}-${rawStart.slice(6, 8)}`;
      let eYmd = `${rawEnd.slice(0, 4)}-${rawEnd.slice(4, 6)}-${rawEnd.slice(6, 8)}`;
      if (isAllDay && /^\d{8}$/.test(rawEnd)) {
        const inc = new Date(Number(rawEnd.slice(0, 4)), Number(rawEnd.slice(4, 6)) - 1, Number(rawEnd.slice(6, 8)) - 1);
        const incStr = `${inc.getFullYear()}-${String(inc.getMonth() + 1).padStart(2, '0')}-${String(inc.getDate()).padStart(2, '0')}`;
        eYmd = incStr < sYmd ? sYmd : incStr;
      }
      const ev = {
        summary: sumM[1].trim().replace(/\\,/g, ','),
        calendarId: familyCal?.id || '',
        calendarName: familyCal?.name || '',
        allDay: isAllDay,
        startDate: sYmd,
        startTime: '09:00',
        endDate: eYmd,
        endTime: '17:00',
        durationMinutes: 60,
        recurrence: 'NONE',
        location: locM ? locM[1].trim().replace(/\\,/g, ',') : '',
        description: descM ? descM[1].trim().replace(/\\n/g, '\n').replace(/\\,/g, ',') : '',
        attendees: matchedAttendees,
      };
      return { ...ev, detectedEvents: [ev] };
    }
  }

  // 3. Check for Structured Invite / Hotel Confirmation ("Subject:/Event:", "Check-in:/Check-out:", "When:", "Where:")
  const subjM = text.match(/^(?:Subject|Event|Title|Topic|Reservation|Hotel):\s*(.+)$/im);
  const checkInM = text.match(/Check[- ]?in:\s*(?:[A-Za-z]+,?\s*)?([A-Za-z]+\s+\d{1,2}(?:,?\s*\d{4})?|\d{4}-\d{2}-\d{2})/i);
  const checkOutM = text.match(/Check[- ]?out:\s*(?:[A-Za-z]+,?\s*)?([A-Za-z]+\s+\d{1,2}(?:,?\s*\d{4})?|\d{4}-\d{2}-\d{2})/i);
  if (checkInM && checkOutM) {
    const pStart = parseNaturalLanguageEvent(checkInM[1], options);
    const pEnd = parseNaturalLanguageEvent(checkOutM[1], options);
    const locM = text.match(/^(?:Where|Location|Address|Property):\s*(.+)$/im);
    const ev = {
      summary: subjM ? subjM[1].trim() : '🏨 Hotel / Lodging Reservation',
      calendarId: familyCal?.id || '',
      calendarName: familyCal?.name || '',
      allDay: true,
      startDate: pStart.startDate,
      startTime: '15:00',
      endDate: pEnd.startDate >= pStart.startDate ? pEnd.startDate : pStart.startDate,
      endTime: '11:00',
      durationMinutes: 60,
      recurrence: 'NONE',
      location: locM ? locM[1].trim() : '',
      description: text,
      attendees: matchedAttendees,
    };
    return { ...ev, detectedEvents: [ev] };
  }

  return null;
}

/**
 * Parses a natural-language, voice-dictated, or pasted itinerary/invite calendar event description
 * into structured form fields.
 * Example:
 *   "Add Dentist appointment on Friday at 3pm for 1 hour on the Family calendar at Downtown Dental"
 *   "Vacation to Florida Keys Feb 1 to Feb 8 on the Family calendar"
 */
function parseNaturalLanguageEvent(inputText, options = {}) {
  let raw = String(inputText || '').trim();
  if (!raw) {
    return { summary: '', attendees: [], allDay: false };
  }

  // First check if this is a pasted flight itinerary, hotel reservation, or .ics block
  if (!options._skipItineraryCheck && (raw.includes('\n') || /\b(?:DELTA|UNITED|AMERICAN|SOUTHWEST|BEGIN:VEVENT|Check-in:)\b/i.test(raw))) {
    const itin = parseItineraryOrInviteText(raw, { ...options, _skipItineraryCheck: true });
    if (itin) return itin;
  }

  const now = options.now ? new Date(options.now) : new Date();
  const family = options.familyMembers || listFamilyMembers(options);
  const calendars = options.calendars || [];

  // Strip conversational prefixes ("Ok Nabu", "add event", "schedule", "create a calendar event for", etc.)
  raw = raw.replace(/^(?:(?:hey|ok|okay)\s+nabu[\s,.:;-]*)/i, '').trim();
  raw = raw.replace(/^(?:please\s+)?(?:add|create|schedule|put|book|make|set\s+up)\s+(?:a\s+|an\s+|new\s+)?(?:calendar\s+event|event|appointment|meeting|reminder)?\s*(?:for|to|called|named|titled)?\s*/i, '').trim();

  // 1. Detect target calendar ("on the Family calendar", "to Dipiazza Kids calendar", "in my private calendar")
  let calendarId = '';
  let calendarName = '';
  const calMatch = raw.match(/\b(?:on|to|in)\s+(?:the\s+|my\s+|our\s+)?([a-z][a-z0-9_-]*(?:\s+[a-z][a-z0-9_-]*){0,2})\s+calendar\b/i);
  if (calMatch) {
    const q = calMatch[1].trim().toLowerCase();
    const matchedCal =
      calendars.find((c) => c.name.toLowerCase() === q || c.originalSummary?.toLowerCase() === q) ||
      (/\b(?:private|personal|primary)\b/.test(q) && calendars.find((c) => c.primary)) ||
      (/\bkids?\b/.test(q) && calendars.find((c) => /kids/i.test(c.name) || c.isCustomSharedCalendar)) ||
      (/\bfamily\b/.test(q) && calendars.find((c) => c.isFamilyCalendar)) ||
      calendars.find((c) => c.name.toLowerCase().includes(q));
    if (matchedCal) {
      calendarId = matchedCal.id;
      calendarName = matchedCal.name;
    } else if (q.includes('kids')) {
      calendarName = 'Dipiazza Kids Calendar';
    } else if (q.includes('family')) {
      calendarName = 'Family';
    }
    raw = raw.replace(calMatch[0], ' ').replace(/\s+/g, ' ').trim();
  } else if (/\b(?:kids\s+weekend|custody|co-?parent|jennilyn)\b/i.test(raw)) {
    const kidsCal = calendars.find((c) => /kids/i.test(c.name) || c.isCustomSharedCalendar);
    if (kidsCal) {
      calendarId = kidsCal.id;
      calendarName = kidsCal.name;
    }
  } else if (/\b(?:my\s+private|only\s+i\s+care\s+about)\b/i.test(raw)) {
    const privCal = calendars.find((c) => c.primary);
    if (privCal) {
      calendarId = privCal.id;
      calendarName = privCal.name;
    }
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

  // 5. Detect single date OR multi-day date range ("Feb 1 to Feb 8", "Feb 1 - 8", "2027-02-01 to 2027-02-08")
  const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let explicitEndYmd = '';
  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const months = {
    jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
    may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
    sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
  };

  const monthNamesPat = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
  const isoRangeM = raw.match(/\b(?:from\s+|on\s+)?(\d{4}-\d{2}-\d{2})\s*(?:to|through|thru|until|-|–)\s*(\d{4}-\d{2}-\d{2})\b/i);
  const monthDayRangeM = raw.match(
    new RegExp(
      `\\b(?:from\\s+|on\\s+)?(${monthNamesPat})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\s*(?:to|through|thru|until|-|–)\\s*(?:(${monthNamesPat})\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b`,
      'i'
    )
  );
  const isoDateM = raw.match(/\b(?:on\s+)?(\d{4}-\d{2}-\d{2})\b/i);
  const monthDayM = raw.match(new RegExp(`\\b(?:on\\s+)?(${monthNamesPat})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b`, 'i'));
  const weekdayM = raw.match(/\b(?:on\s+)?(?:(this|next)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i);

  if (isoRangeM) {
    const [sy, sm, sd] = isoRangeM[1].split('-').map(Number);
    targetDate.setFullYear(sy, sm - 1, sd);
    explicitEndYmd = isoRangeM[2];
    allDay = true;
    raw = raw.replace(isoRangeM[0], ' ').trim();
  } else if (monthDayRangeM) {
    const mIdx1 = months[monthDayRangeM[1].slice(0, 3).toLowerCase()];
    const day1 = Number(monthDayRangeM[2]);
    const mIdx2 = monthDayRangeM[4] ? months[monthDayRangeM[4].slice(0, 3).toLowerCase()] : mIdx1;
    const day2 = Number(monthDayRangeM[5]);
    const explicitYr = monthDayRangeM[3] || monthDayRangeM[6] || null;
    const startResolved = resolveSmartYmd(mIdx1, day1, explicitYr, now);
    const [sy, sm, sd] = startResolved.split('-').map(Number);
    targetDate.setFullYear(sy, sm - 1, sd);
    const endYr = monthDayRangeM[6] ? Number(monthDayRangeM[6]) : mIdx2 < mIdx1 ? sy + 1 : sy;
    const endObjRange = new Date(endYr, mIdx2, day2);
    explicitEndYmd = `${endObjRange.getFullYear()}-${String(endObjRange.getMonth() + 1).padStart(2, '0')}-${String(endObjRange.getDate()).padStart(2, '0')}`;
    allDay = true;
    raw = raw.replace(monthDayRangeM[0], ' ').trim();
  } else if (/\btomorrow\b/i.test(raw)) {
    targetDate.setDate(targetDate.getDate() + 1);
    raw = raw.replace(/\b(?:on\s+)?tomorrow\b/i, ' ').trim();
  } else if (/\btoday\b/i.test(raw)) {
    raw = raw.replace(/\b(?:on\s+)?today\b/i, ' ').trim();
  } else if (isoDateM) {
    const [y, m, d] = isoDateM[1].split('-').map(Number);
    targetDate.setFullYear(y, m - 1, d);
    raw = raw.replace(isoDateM[0], ' ').trim();
  } else if (monthDayM) {
    const mIdx = months[monthDayM[1].slice(0, 3).toLowerCase()];
    const dayNum = Number(monthDayM[2]);
    const startResolved = resolveSmartYmd(mIdx, dayNum, monthDayM[3], now);
    const [sy, sm, sd] = startResolved.split('-').map(Number);
    targetDate.setFullYear(sy, sm - 1, sd);
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
  const durM = raw.match(/\bfor\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?|hr|minutes?|mins?|min|days?)\b/i);

  if (durM) {
    const val = Number(durM[1]);
    const unit = durM[2].toLowerCase();
    if (unit.startsWith('d') && val >= 1) {
      allDay = true;
      const dEnd = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate() + Math.max(0, Math.round(val) - 1));
      explicitEndYmd = `${dEnd.getFullYear()}-${String(dEnd.getMonth() + 1).padStart(2, '0')}-${String(dEnd.getDate()).padStart(2, '0')}`;
    } else {
      durationMinutes = unit.startsWith('h') ? Math.round(val * 60) : Math.round(val);
    }
    raw = raw.replace(durM[0], ' ').trim();
  }

  if (rangeTimeM) {
    const s = parseHourMin(rangeTimeM[1], rangeTimeM[2], rangeTimeM[3] || rangeTimeM[6]);
    const e = parseHourMin(rangeTimeM[4], rangeTimeM[5], rangeTimeM[6]);
    startHour = s.h;
    startMin = s.m;
    const diff = (e.h * 60 + e.m) - (s.h * 60 + s.m);
    if (diff > 0) durationMinutes = diff;
    allDay = false;
    raw = raw.replace(rangeTimeM[0], ' ').trim();
  } else if (singleTimeM) {
    const s = parseHourMin(singleTimeM[1], singleTimeM[2], singleTimeM[3] || (Number(singleTimeM[1]) < 8 ? 'pm' : 'am'));
    startHour = s.h;
    startMin = s.m;
    allDay = false;
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
  const computedEndDate = `${endObj.getFullYear()}-${String(endObj.getMonth() + 1).padStart(2, '0')}-${String(endObj.getDate()).padStart(2, '0')}`;
  const finalEndDate = explicitEndYmd || (allDay ? ymd : computedEndDate);
  const endTime = `${String(endObj.getHours()).padStart(2, '0')}:${String(endObj.getMinutes()).padStart(2, '0')}`;

  return {
    summary,
    calendarId,
    calendarName,
    allDay,
    startDate: ymd,
    startTime,
    endDate: finalEndDate,
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
  buildCalendarKGraph,
  syncCalendarKGraphToStore,
  saveNamedCalendarConfig,
  syncCalendarMetadataToCaldav,
  promoteCustomCalendarsToGoogleContainers,
  syncNamedCalendarsToThunderbird,
  resolveAttendees,
  buildIcsCalendarEvent,
  createNamedCalendarEvent,
  deleteNamedCalendarEvent,
  moveNamedCalendarEvent,
  advanceRecurringStartEnd,
  listEventsAcrossNamedCalendars,
  scopeCalendarStateForCalendar,
  parseItineraryOrInviteText,
  parseNaturalLanguageEvent,
};
