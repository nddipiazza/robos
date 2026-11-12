'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Point HOME at a throwaway directory before loading the libraries so nothing can touch
// the real ~/.config/robos or ~/.thunderbird.
const TMP_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-gcal-unit-'));
const ORIGINAL_HOME = process.env.HOME;
process.env.HOME = TMP_HOME;

const ca = require(path.resolve(__dirname, '../../../robos-lib/cloud-accounts'));
const tb = require(path.resolve(__dirname, '../../../robos-lib/thunderbird-google'));

// mockBinaryPath: null skips probing for a real Thunderbird install; platform pins the
// Linux profile layout (~/.thunderbird) that readUserJs() reads on every host OS.
const OPTS = { homeDir: TMP_HOME, mockBinaryPath: null, platform: 'linux' };

function readUserJs() {
  const userJs = path.join(TMP_HOME, '.thunderbird', 'robos001.default-release', 'user.js');
  return fs.readFileSync(userJs, 'utf8');
}

function calUuid(email) {
  return tb.deterministicUuid(`robos-google-caldav:${email.toLowerCase()}`);
}

function refreshIntervalFor(userJs, email) {
  const re = new RegExp(`calendar\\.registry\\.${calUuid(email)}\\.refreshInterval", (\\d+)\\);`);
  const m = userJs.match(re);
  return m ? Number(m[1]) : null;
}

function addGoogleAccount(email) {
  return ca.saveAccount({
    provider: 'google',
    email,
    accessToken: `token-${email}`,
    refreshToken: `refresh-${email}`,
  }, OPTS).account;
}

describe('Google Calendar: Thunderbird sync settings stick', () => {
  let alice;
  let bob;
  let carol;

  before(() => {
    alice = addGoogleAccount('alice@example.com');
    bob = addGoogleAccount('bob@example.com');
    carol = addGoogleAccount('carol@example.com');
  });

  after(() => {
    process.env.HOME = ORIGINAL_HOME;
    fs.rmSync(TMP_HOME, { recursive: true, force: true });
  });

  it('defaults the sync interval to the UI default (15 minutes), not 1', () => {
    const block = tb.generateThunderbirdUserJsBlock({ email: 'dave@example.com' }, { enableCalendar: true });
    assert.strictEqual(block.refreshMinutes, 15);
    assert.match(block.userJsBlock, /\.refreshInterval", 15\);/);
    assert.strictEqual(tb.DEFAULT_CALENDAR_REFRESH_MINUTES, 15);
  });

  it('keeps the chosen interval and an unticked Calendar through the all-accounts pass', () => {
    // What gcal:configure-only does: configure the selected account, then every account.
    tb.configureThunderbirdForGoogleAccount(alice.id, {
      enableCalendar: true,
      enableContacts: true,
      enableMail: false,
      calendarColor: '#a855f7',
      refreshMinutes: 30,
    }, OPTS);
    tb.configureThunderbirdForGoogleAccount(bob.id, {
      enableCalendar: false,
      enableContacts: true,
      enableMail: false,
      refreshMinutes: 45,
    }, OPTS);
    const all = tb.configureAllGoogleAccountsInThunderbird(OPTS);
    assert.strictEqual(all.count, 3);

    const userJs = readUserJs();
    assert.strictEqual(refreshIntervalFor(userJs, 'alice@example.com'), 30, 'alice keeps 30 minutes');
    assert.ok(
      userJs.includes(`calendar.registry.${calUuid('alice@example.com')}.color", "#a855f7"`),
      'alice keeps her calendar color'
    );
    assert.ok(
      !userJs.includes(`calendar.registry.${calUuid('bob@example.com')}.`),
      'bob has Calendar unticked, so no calendar registry entry is written for him'
    );
    assert.ok(userJs.includes('Google Contacts (bob@example.com)'), 'bob still gets his contacts');
    assert.strictEqual(refreshIntervalFor(userJs, 'carol@example.com'), 15, 'never-configured carol gets the default');

    const sortOrder = userJs.match(/calendar\.list\.sortOrder", "([^"]*)"/);
    assert.ok(sortOrder, 'sortOrder written');
    assert.ok(!sortOrder[1].includes(calUuid('bob@example.com')), 'sortOrder does not list bob');

    const storedBob = ca.getAccountById(bob.id, OPTS);
    assert.strictEqual(storedBob.suites.calendar.enabled, false);
    assert.strictEqual(storedBob.calendarRefreshMinutes, 45);
    assert.strictEqual(ca.getAccountById(alice.id, OPTS).calendarRefreshMinutes, 30);
  });

  it('configures a single account with refreshMinutes 30 and Calendar off, and both survive the all-accounts pass', () => {
    tb.configureThunderbirdForGoogleAccount(carol.id, {
      enableCalendar: false,
      enableContacts: true,
      enableMail: false,
      refreshMinutes: 30,
    }, OPTS);
    tb.configureAllGoogleAccountsInThunderbird(OPTS);

    let userJs = readUserJs();
    assert.ok(!userJs.includes(`calendar.registry.${calUuid('carol@example.com')}.`), 'no calendar entry for carol');
    assert.strictEqual(ca.getAccountById(carol.id, OPTS).calendarRefreshMinutes, 30);

    // Ticking Calendar again without sending an interval reuses the stored 30 minutes.
    tb.configureThunderbirdForGoogleAccount(carol.id, { enableCalendar: true }, OPTS);
    tb.configureAllGoogleAccountsInThunderbird(OPTS);
    userJs = readUserJs();
    assert.strictEqual(refreshIntervalFor(userJs, 'carol@example.com'), 30);
  });

  it('drops calendar.list.sortOrder when no account has Calendar ticked', () => {
    for (const acc of [alice, bob, carol]) {
      tb.configureThunderbirdForGoogleAccount(acc.id, { enableCalendar: false }, OPTS);
    }
    tb.configureAllGoogleAccountsInThunderbird(OPTS);
    const userJs = readUserJs();
    assert.ok(!/calendar\.registry\./.test(userJs), 'no calendar registry entries remain');
    assert.ok(!userJs.includes('calendar.list.sortOrder'), 'stale sortOrder removed');
  });

  it('never wrote outside the temp HOME', () => {
    assert.ok(fs.existsSync(path.join(TMP_HOME, '.config', 'robos', 'cloud-accounts.json')));
    assert.ok(fs.existsSync(path.join(TMP_HOME, '.thunderbird', 'profiles.ini')));
  });

  it('parses Named & Shared Google Calendars from CalDAV PROPFIND XML and preserves additionalCalendars in Thunderbird', () => {
    const namedCals = require(path.resolve(__dirname, '../../../google-calendar/lib/named-calendars'));
    const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<D:multistatus xmlns:D="DAV:" xmlns:caldav="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:ical="http://apple.com/ns/ical/">
  <D:response>
    <D:href>/caldav/v2/alice%40example.com/events/</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>alice@example.com</D:displayname>
        <ical:calendar-color>#D06B64FF</ical:calendar-color>
        <D:resourcetype><D:collection/><caldav:calendar/></D:resourcetype>
      </D:prop>
    </D:propstat>
  </D:response>
  <D:response>
    <D:href>/caldav/v2/family12345%40group.calendar.google.com/events/</D:href>
    <D:propstat>
      <D:prop>
        <D:displayname>Family</D:displayname>
        <ical:calendar-color>#FFAD46FF</ical:calendar-color>
        <D:resourcetype><D:collection/><caldav:calendar/><cs:shared/></D:resourcetype>
      </D:prop>
    </D:propstat>
  </D:response>
</D:multistatus>`;

    const parsed = namedCals.parseCaldavCalendarHomeXml(sampleXml, 'alice@example.com');
    assert.strictEqual(parsed.length, 2);
    assert.strictEqual(parsed[0].primary, true);
    assert.strictEqual(parsed[1].name, 'Family');
    assert.strictEqual(parsed[1].shared, true);
    assert.strictEqual(parsed[1].writable, true);

    tb.configureThunderbirdForGoogleAccount(alice.id, {
      enableCalendar: true,
      additionalCalendars: [{ id: parsed[1].id, summary: parsed[1].name, backgroundColor: parsed[1].color, writable: true }],
    }, OPTS);
    tb.configureAllGoogleAccountsInThunderbird(OPTS);
    const userJs = readUserJs();
    assert.ok(userJs.includes('"Family"'), 'Named Family calendar written to Thunderbird user.js');
  });

  it('parses natural-language event requests and renders the 1-button Google Doc Access Form', () => {
    const namedCals = require(path.resolve(__dirname, '../../../google-calendar/lib/named-calendars'));
    const accessDoc = require(path.resolve(__dirname, '../../../google-calendar/lib/access-doc-sync'));

    const parsed = namedCals.parseNaturalLanguageEvent(
      'Add Dentist appointment on 2026-11-20 at 3pm for 90 minutes on the Family calendar at Madison Dental',
      {
        calendars: [{ id: 'family123@group.calendar.google.com', name: 'Family', writable: true }],
        familyMembers: [{ uid: 'leo', name: 'Leo', nickname: 'Leo', firstName: 'Leo', email: 'leo@example.com', avatar: '🦞' }],
      }
    );
    assert.strictEqual(parsed.calendarId, 'family123@group.calendar.google.com');
    assert.strictEqual(parsed.startDate, '2026-11-20');
    assert.strictEqual(parsed.startTime, '15:00');
    assert.strictEqual(parsed.endTime, '16:30');
    assert.strictEqual(parsed.location, 'Madison Dental');

    const ics = namedCals.buildIcsCalendarEvent({
      uid: 'test-uid-1',
      summary: 'Family Dinner',
      start: '2026-11-20T23:00:00.000Z',
      end: '2026-11-21T00:30:00.000Z',
      location: 'Red Lobster',
      attendees: [{ name: 'Leo', email: 'leo@example.com' }],
      reminderMinutes: 30,
    });
    assert.ok(ics.includes('SUMMARY:Family Dinner'));
    assert.ok(ics.includes('LOCATION:Red Lobster'));
    assert.ok(ics.includes('mailto:leo@example.com'));

    const html = accessDoc.renderCalendarAccessDocHtml({
      webAppUrl: 'https://demo-cal.trycloudflare.com/?auth=secret123',
      calendars: [{
        id: 'family123@group.calendar.google.com',
        name: 'Family',
        isFamilyCalendar: true,
        writable: true,
        googleCalendarUrl: 'https://calendar.google.com/calendar/u/0/r?cid=family123%40group.calendar.google.com',
        googleCalendarEmbedUrl: 'https://calendar.google.com/calendar/embed?src=family123%40group.calendar.google.com',
      }],
    });
    assert.ok(html.includes('CLICK THIS TO OPEN THE ROBOS ADD CALENDAR EVENT APP'));
    assert.ok(html.includes('https://demo-cal.trycloudflare.com/?auth=secret123'));
    assert.ok(html.includes('DO NOT TRY TO EDIT THIS DOC'));
    assert.ok(html.includes('https://calendar.google.com/calendar/u/0/r?cid=family123%40group.calendar.google.com'));
    assert.ok(html.includes('https://calendar.google.com/calendar/embed?src=family123%40group.calendar.google.com'));
    assert.ok(!html.includes('Upcoming Events (Read-Only Snapshot)'));

    // Multi-day all-day event RFC 5545 exclusive DTEND;VALUE=DATE (+1 day after inclusive endDate)
    const multiDayIcs = namedCals.buildIcsCalendarEvent({
      uid: 'test-multiday-1',
      summary: 'Family Trip',
      allDay: true,
      startDate: '2027-02-01',
      endDate: '2027-02-08',
    });
    assert.ok(multiDayIcs.includes('DTSTART;VALUE=DATE:20270201'));
    assert.ok(multiDayIcs.includes('DTEND;VALUE=DATE:20270209'), 'Inclusive Feb 8 becomes exclusive DTEND 20270209');

    // Pasted multi-line airline itinerary parsing into multi-day trip + flight legs
    const sampleItinerary = [
      'Passenger Info',
      'Name: ALEX TRAVELER',
      'Mon, 01FEB',
      'DEPART',
      'ARRIVE',
      'DELTA 4992*',
      'Delta Main Basic (E)',
      'MADISON',
      '07:00AM',
      'NYC-LAGUARDIA',
      '10:17AM',
      'DELTA 1538',
      'Delta Main Basic (E)',
      'NYC-LAGUARDIA',
      '11:15AM',
      'MIAMI',
      '02:34PM',
      'Mon, 08FEB',
      'DEPART',
      'ARRIVE',
      'DELTA 1468',
      'Delta Main Basic (E)',
      'MIAMI',
      '12:01PM',
      'DETROIT',
      '03:11PM',
      'DELTA 5245*',
      'Delta Main Basic (E)',
      'DETROIT',
      '04:15PM',
      'MADISON',
      '04:37PM',
    ].join('\n');

    const itinParsed = namedCals.parseNaturalLanguageEvent(sampleItinerary, {
      now: '2026-11-10T12:00:00Z',
      calendars: [{ id: 'family123@group.calendar.google.com', name: 'Family', isFamilyCalendar: true, writable: true }],
      familyMembers: [{ uid: 'alex', name: 'Alex Traveler', firstName: 'Alex', nickname: 'Alex', email: 'alex@example.com', avatar: '✈️' }],
    });
    assert.strictEqual(itinParsed.allDay, true);
    assert.strictEqual(itinParsed.startDate, '2027-02-01');
    assert.strictEqual(itinParsed.endDate, '2027-02-08');
    assert.strictEqual(itinParsed.detectedEvents.length, 3);
    assert.strictEqual(itinParsed.detectedEvents[1].startTime, '07:00');
    assert.strictEqual(itinParsed.detectedEvents[1].endTime, '14:34');
    assert.strictEqual(itinParsed.detectedEvents[2].startTime, '12:01');
    assert.strictEqual(itinParsed.detectedEvents[2].endTime, '16:37');

    // Custom shared named calendar ICS includes CATEGORIES and ATTENDEE lines
    const sharedKidsIcs = namedCals.buildIcsCalendarEvent({
      uid: 'test-kids-cal-1',
      summary: 'Kids Therapy Appointment',
      calendarName: 'Kids Calendar',
      start: '2026-11-13T16:00:00.000Z',
      end: '2026-11-13T17:00:00.000Z',
      includeAttendees: true,
      attendees: [
        { name: 'Parent One', email: 'parent1@example.com' },
        { name: 'Parent Two', email: 'parent2@example.com' },
      ],
    });
    assert.ok(sharedKidsIcs.includes('CATEGORIES:Kids Calendar'));
    assert.ok(sharedKidsIcs.includes('mailto:parent1@example.com'));
    assert.ok(sharedKidsIcs.includes('mailto:parent2@example.com'));

    // KGraph JSON-LD generation includes descriptions for each calendar role
    const kgraph = namedCals.buildCalendarKGraph({
      calendars: [
        {
          id: 'primary@example.com',
          name: 'Primary',
          kgraphNode: {
            '@id': 'urn:robos:calendar:primary',
            '@type': ['robos:NamedCalendar', 'schema:Schedule'],
            'dcterms:title': 'Primary',
            'dcterms:description': 'My private calendar — for stuff that only I care about.',
            'robos:calendarRole': 'private-personal-owner',
          },
        },
        {
          id: 'family@group.calendar.google.com',
          name: 'Family',
          kgraphNode: {
            '@id': 'urn:robos:calendar:family',
            '@type': ['robos:NamedCalendar', 'schema:Schedule'],
            'dcterms:title': 'Family',
            'dcterms:description': 'For stuff that our private family needs.',
            'robos:calendarRole': 'private-household-family',
          },
        },
        {
          id: 'kids-calendar',
          name: 'Kids Calendar',
          kgraphNode: {
            '@id': 'urn:robos:calendar:kids',
            '@type': ['robos:NamedCalendar', 'schema:Schedule'],
            'dcterms:title': 'Kids Calendar',
            'dcterms:description': 'For stuff that the extended divorced side of the family needs.',
            'robos:calendarRole': 'extended-divorced-kids-family',
          },
        },
      ],
      familyMembers: [],
    });
    assert.strictEqual(kgraph['@id'], 'urn:robos:package:google-calendar');
    assert.strictEqual(kgraph['@graph'].length, 4);
    assert.ok(kgraph['@graph'].some((n) => n['dcterms:description']?.includes('private family needs')));
    assert.ok(kgraph['@graph'].some((n) => n['dcterms:description']?.includes('extended divorced side')));
    assert.ok(kgraph['@graph'].some((n) => n['dcterms:description']?.includes('only I care about')));

    // Per-calendar Invite & Access Google Doc HTML rendering
    const kidsCalDocTitle = accessDoc.getCalendarInviteDocTitle({
      id: 'kids-calendar',
      name: 'Kids Calendar',
      primary: false,
    });
    assert.strictEqual(kidsCalDocTitle, 'RobOS Calendar — Kids Calendar (Invite & Access Doc)');

    const singleCalHtml = accessDoc.renderSingleCalendarInviteDocHtml(
      {
        id: 'kids-calendar',
        name: 'Kids Calendar',
        description: 'For stuff that the extended divorced side of the family needs.',
        googleCalendarUrl: 'https://calendar.google.com/calendar/u/0/r?cid=kids-calendar',
        googleCalendarEmbedUrl: 'https://calendar.google.com/calendar/embed?src=kids-calendar',
        sharedWith: [
          { name: 'Parent One', role: 'Father', email: 'parent1@example.com', avatar: '👨' },
          { name: 'Parent Two', role: 'Mother', email: 'parent2@example.com', avatar: '👩' },
        ],
      },
      { webAppUrl: 'https://demo-cal.trycloudflare.com/?auth=secret123' }
    );
    assert.ok(singleCalHtml.includes('CLICK THIS TO OPEN &amp; ADD EVENTS TO KIDS CALENDAR'));
    assert.ok(singleCalHtml.includes('calendar=kids-calendar'));
    assert.ok(singleCalHtml.includes('For stuff that the extended divorced side of the family needs.'));
    assert.ok(singleCalHtml.includes('parent1@example.com'));
    assert.ok(singleCalHtml.includes('parent2@example.com'));

    // Scoped calendar state hides people and events that do not belong to the target calendar
    const scopedKidsState = namedCals.scopeCalendarStateForCalendar(
      {
        email: 'parent1@example.com',
        calendars: [
          {
            id: 'family@group.calendar.google.com',
            name: 'Family',
            isFamilyCalendar: true,
            sharedWith: [
              { uid: 'p1', name: 'Parent One', email: 'parent1@example.com' },
              { uid: 'partner', name: 'Private Partner', email: 'partner@example.com' },
            ],
          },
          {
            id: 'kids-calendar',
            name: 'Kids Calendar',
            isCustomSharedCalendar: true,
            sharedWith: [
              { uid: 'p1', name: 'Parent One', email: 'parent1@example.com' },
              { uid: 'p2', name: 'Co-Parent Two', email: 'coparent@example.com' },
              { uid: 'kid1', name: 'Kid One', email: 'kid1@example.com' },
            ],
          },
        ],
        familyMembers: [
          { uid: 'p1', name: 'Parent One', email: 'parent1@example.com' },
          { uid: 'partner', name: 'Private Partner', email: 'partner@example.com' },
          { uid: 'p2', name: 'Co-Parent Two', email: 'coparent@example.com' },
          { uid: 'kid1', name: 'Kid One', email: 'kid1@example.com' },
        ],
        events: [
          {
            id: 'ev-family-1',
            summary: 'Household Trip',
            calendarId: 'family@group.calendar.google.com',
            calendarName: 'Family',
            attendees: ['Private Partner <partner@example.com>'],
          },
          {
            id: 'ev-kids-1',
            summary: 'Kids Weekend',
            calendarId: 'kids-calendar',
            calendarName: 'Kids Calendar',
            attendees: ['Parent One <parent1@example.com>', 'Co-Parent Two <coparent@example.com>'],
          },
        ],
      },
      'kids-calendar'
    );
    assert.strictEqual(scopedKidsState.calendars.length, 1);
    assert.strictEqual(scopedKidsState.calendars[0].id, 'kids-calendar');
    assert.ok(!scopedKidsState.familyMembers.some((m) => m.email === 'partner@example.com'));
    assert.ok(scopedKidsState.familyMembers.some((m) => m.email === 'coparent@example.com'));
    assert.strictEqual(scopedKidsState.events.length, 1);
    assert.strictEqual(scopedKidsState.events[0].summary, 'Kids Weekend');

    // Voice Nabu command parsing for "ok nabu, add an appointment to the kids calendar {date time}"
    const nabuParsed1 = namedCals.parseNaturalLanguageEvent(
      'ok nabu, add an appointment to the kids calendar Friday at 2pm',
      {
        now: '2026-11-12T10:00:00Z',
        calendars: [{ id: 'kids-calendar', name: 'Kids Calendar', isCustomSharedCalendar: true }],
        familyMembers: [],
      }
    );
    assert.strictEqual(nabuParsed1.summary, 'Appointment');
    assert.strictEqual(nabuParsed1.calendarId, 'kids-calendar');
    assert.strictEqual(nabuParsed1.calendarName, 'Kids Calendar');
    assert.strictEqual(nabuParsed1.category, 'appointment');
    assert.strictEqual(nabuParsed1.startDate, '2026-11-13');
    assert.strictEqual(nabuParsed1.startTime, '14:00');

    const nabuParsed2 = namedCals.parseNaturalLanguageEvent(
      'ok nabu, add a new medical appointment to the kids calender November twentieth at two thirty p.m.',
      {
        now: '2026-11-12T10:00:00Z',
        calendars: [{ id: 'kids-calendar', name: 'Kids Calendar', isCustomSharedCalendar: true }],
        familyMembers: [],
      }
    );
    assert.strictEqual(nabuParsed2.summary, 'Medical Appointment');
    assert.strictEqual(nabuParsed2.calendarId, 'kids-calendar');
    assert.strictEqual(nabuParsed2.category, 'appointment');
    assert.strictEqual(nabuParsed2.startDate, '2026-11-20');
    assert.strictEqual(nabuParsed2.startTime, '14:30');
    assert.strictEqual(nabuParsed2.hasExplicitDate, true);
    assert.strictEqual(nabuParsed2.hasExplicitTime, true);
    assert.strictEqual(nabuParsed2.missingDateTimeError, '');

    // Voice Nabu command where user blanks out before speaking date/time must flag missing date/time and error
    const nabuBlanked = namedCals.parseNaturalLanguageEvent(
      'Ok Nabu, add an appointment to the kids calendar.',
      {
        now: '2026-11-12T10:00:00Z',
        calendars: [{ id: 'kids-calendar', name: 'Kids Calendar', isCustomSharedCalendar: true }],
        familyMembers: [],
      }
    );
    assert.strictEqual(nabuBlanked.hasExplicitDate, false);
    assert.strictEqual(nabuBlanked.hasExplicitTime, false);
    assert.strictEqual(nabuBlanked.hasExplicitDateOrTime, false);
    assert.ok(nabuBlanked.missingDateTimeError.includes('no date or time was given'));

    assert.throws(
      () =>
        namedCals.parseNaturalLanguageEvent('Ok Nabu, add an appointment to the kids calendar.', {
          now: '2026-11-12T10:00:00Z',
          requireExplicitDateTime: true,
        }),
      /no date or time was given/i
    );
  });
});
