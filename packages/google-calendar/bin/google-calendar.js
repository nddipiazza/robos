#!/usr/bin/env node
'use strict';

/**
 * RobOS Google Calendar CLI (`packages/google-calendar/bin/google-calendar.js`)
 *
 * Commands:
 *   calendars                     List all Named & Shared Google Calendars by name
 *   family                        List RobOS Family profiles & email addresses
 *   events [--calendar <name>]    List upcoming events across Named Google Calendars
 *   add "<natural language>"      Create a Google Calendar event via natural language or flags:
 *     [--title "..."] [--calendar "Family"] [--date YYYY-MM-DD] [--start HH:MM] [--end HH:MM]
 *     [--all-day] [--location "..."] [--attendees "Alex,Sam"] [--recurrence WEEKLY]
 *     [--description "..."]
 *   delete <event-id>             Delete an event from Google Calendar & local store
 *   sync-doc [--share-family]     Create/update the 1-button "RobOS Calendar — Add Event Access Form" Google Doc
 *   sync-thunderbird              Sync all Named Google Calendars into Mozilla Thunderbird user.js
 *   serve                         Launch the RobOS Add Calendar Event WebApp (:19226) + HTTPS tunnel
 */

const path = require('node:path');
const {
  discoverNamedCalendars,
  listFamilyMembers,
  listEventsAcrossNamedCalendars,
  createNamedCalendarEvent,
  deleteNamedCalendarEvent,
  moveNamedCalendarEvent,
  parseNaturalLanguageEvent,
  syncNamedCalendarsToThunderbird,
} = require('../lib/named-calendars');
const { syncCalendarAccessDocWithGoogleDrive } = require('../lib/access-doc-sync');

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      positional.push(a);
    }
  }
  return { cmd: positional[0] || 'help', rest: positional.slice(1), flags };
}

async function main() {
  const { cmd, rest, flags } = parseArgs(process.argv.slice(2));
  const asJson = Boolean(flags.json);

  if (cmd === 'calendars' || cmd === 'list-calendars') {
    const res = await discoverNamedCalendars();
    if (asJson) return console.log(JSON.stringify(res, null, 2));
    console.log(`Named & Shared Google Calendars (${res.email}):`);
    for (const c of res.calendars) {
      const role = c.primary ? 'Primary' : c.isFamilyCalendar ? 'Family (Shared)' : c.writable ? 'Shared (Writable)' : 'Read-Only';
      console.log(`  • ${c.name} [${role}] — color=${c.color} id=${c.id}`);
    }
    return;
  }

  if (cmd === 'family' || cmd === 'people') {
    const fam = listFamilyMembers();
    if (asJson) return console.log(JSON.stringify(fam, null, 2));
    console.log(`RobOS Family Members (${fam.length}):`);
    for (const f of fam) {
      console.log(`  • ${f.avatar} ${f.name} (${f.nickname}) <${f.email}> — ${f.role}`);
    }
    return;
  }

  if (cmd === 'events' || cmd === 'list') {
    const state = await listEventsAcrossNamedCalendars();
    let events = state.events;
    if (flags.calendar) {
      const q = String(flags.calendar).toLowerCase();
      events = events.filter(
        (e) =>
          String(e.calendarId || '').toLowerCase() === q ||
          String(e.calendarName || '').toLowerCase().includes(q)
      );
    }
    if (asJson) return console.log(JSON.stringify(events, null, 2));
    console.log(`Upcoming Events (${events.length}):`);
    for (const e of events.slice(0, 20)) {
      console.log(`  • [${e.calendarName}] ${e.summary} — ${e.start}${e.location ? ` @ ${e.location}` : ''} (id: ${e.id})`);
    }
    return;
  }

  if (cmd === 'add' || cmd === 'create') {
    const state = await listEventsAcrossNamedCalendars(null, { skipNetwork: true });
    let input = {};
    if (rest.length > 0 && !flags.title && !flags.summary) {
      input = parseNaturalLanguageEvent(rest.join(' '), {
        familyMembers: state.familyMembers,
        calendars: state.calendars,
      });
    }
    const payload = {
      ...input,
      ...(flags.title || flags.summary ? { summary: flags.title || flags.summary } : {}),
      ...(flags.calendar ? { calendarId: flags.calendar, calendarName: flags.calendar } : {}),
      ...(flags.date ? { startDate: flags.date, endDate: flags['end-date'] || flags.date } : {}),
      ...(flags.start ? { startTime: flags.start } : {}),
      ...(flags.end ? { endTime: flags.end } : {}),
      ...(flags['all-day'] ? { allDay: true } : {}),
      ...(flags.location ? { location: flags.location } : {}),
      ...(flags.recurrence ? { recurrence: flags.recurrence } : {}),
      ...(flags.description ? { description: flags.description } : {}),
      ...(flags.attendees ? { attendees: flags.attendees } : {}),
    };
    const created = await createNamedCalendarEvent(payload);
    if (asJson) return console.log(JSON.stringify(created, null, 2));
    console.log(`✓ Created event "${created.event.summary}" on [${created.event.calendarName}] (${created.event.start})`);
    if (created.syncedToGoogle) {
      console.log(`  • Synced live to Google Calendar CalDAV (HTTP ${created.caldavStatus})`);
    }
    return;
  }

  if (cmd === 'delete' || cmd === 'remove') {
    const eventId = rest[0] || flags.id;
    if (!eventId) throw new Error('Provide an event ID to delete.');
    const res = await deleteNamedCalendarEvent(eventId, { calendarId: flags.calendar });
    if (asJson) return console.log(JSON.stringify(res, null, 2));
    console.log(`✓ Deleted event ${eventId} (deletedOnGoogle=${res.deletedOnGoogle})`);
    return;
  }

  if (cmd === 'move') {
    const qOrId = rest.join(' ') || flags.query || flags.id || '';
    if (!qOrId) throw new Error('Provide an event title query or UID to move.');
    const res = await moveNamedCalendarEvent({
      eventId: flags.id || '',
      query: flags.id ? '' : qOrId,
      fromCalendar: flags.from || 'Primary',
      toCalendar: flags.to || 'Family',
    });
    if (asJson) return console.log(JSON.stringify(res, null, 2));
    console.log(`✓ Moved ${res.movedCount} event(s):`);
    for (const m of res.moved) {
      console.log(`  • "${m.summary}" [${m.fromCalendar} → ${m.toCalendar}] (${m.newUid})`);
    }
    return;
  }

  if (cmd === 'sync-doc' || cmd === 'create-doc') {
    const res = await syncCalendarAccessDocWithGoogleDrive({
      shareWithFamily: Boolean(flags['share-family'] || flags.share),
    });
    if (asJson) return console.log(JSON.stringify(res, null, 2));
    console.log(`✓ Synced Google Doc "${res.docTitle}":`);
    console.log(`  • Google Doc URL:        ${res.docUrl}`);
    console.log(`  • 1-Button WebApp Link:  ${res.authedWebAppUrl}`);
    return;
  }

  if (cmd === 'sync-thunderbird' || cmd === 'sync-tb') {
    const res = await syncNamedCalendarsToThunderbird();
    if (asJson) return console.log(JSON.stringify(res, null, 2));
    console.log(`✓ Synced ${res.calendarsSynced.length} Named Google Calendars to Thunderbird:`);
    for (const c of res.calendarsSynced) {
      console.log(`  • ${c.name} (${c.id})`);
    }
    return;
  }

  if (cmd === 'serve') {
    require(path.resolve(__dirname, '..', 'serve.js'));
    return;
  }

  console.log(`Usage:
  node packages/google-calendar/bin/google-calendar.js calendars
  node packages/google-calendar/bin/google-calendar.js family
  node packages/google-calendar/bin/google-calendar.js events [--calendar Family]
  node packages/google-calendar/bin/google-calendar.js add "Dentist appointment on Friday at 3pm on Family calendar"
  node packages/google-calendar/bin/google-calendar.js sync-doc [--share-family]
  node packages/google-calendar/bin/google-calendar.js sync-thunderbird
  node packages/google-calendar/bin/google-calendar.js serve`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
