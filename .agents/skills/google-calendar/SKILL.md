---
name: google-calendar
description: Manage RobOS Google Calendar, Named/Shared Family Google Calendars, Mozilla Thunderbird CalDAV sync, the 1-button "RobOS Calendar — Add Event Access Form" Google Doc, and the "RobOS Add Calendar Event" WebApp (:19226) via CLI, natural-language text, or voice commands.
---

# RobOS Google Calendar & Family Calendars Skill (`/google-calendar`)

Use this skill whenever the user asks to:
- View their **Google Calendars by name** (`Primary`, `Family`, `Holidays in United States`, or custom shared calendars)
- Schedule, create, or delete a **Google Calendar event** (on the `Family` calendar or `Primary` calendar) with family attendees
- Create or update the **1-button Calendar Request Google Doc** (`RobOS Calendar — Add Event Access Form`) on Google Drive that links to the **RobOS Add Calendar Event** web app (`:19226`)
- Sync all Named Google Calendars into **Mozilla Thunderbird** (`user.js` CalDAV registry)

## Named Calendar Purposes (KGraph Usage Boundaries)

Each Named Calendar has a clear description and usage boundary in the Knowledge Graph (`~/.config/robos/kgraph/google-calendars.jsonld` and `~/.config/robos/ekgraph/nodes.json`):

| Named Calendar | KGraph Role | What It Is Used For (Description) | Dedicated Invite & Access Google Doc |
|---|---|---|---|
| **Family** (`Family`) | `private-household-family` | **For stuff that our private family needs** (household plans, family trips, dinners, and shared household activities). | `RobOS Calendar — Family (Invite & Access Doc)` (shared with household family members) |
| **Kids Calendar** (`Kids Calendar`) | `extended-divorced-kids-family` | **For stuff that the extended divorced side of the family needs** (kids weekend custody schedule, kids' appointments, school, and co-parenting events). | `RobOS Calendar — Kids Calendar (Invite & Access Doc)` (shared with extended kids calendar members) |
| **My Private Calendar** (`Primary`) | `private-personal-owner` | **My private calendar — for stuff that only I care about** (personal reminders, solo work, and private appointments). | `RobOS Calendar — Primary (Private Calendar Access Doc)` (private to owner only) |

## CLI Commands

```bash
# 1. List all Named & Shared Google Calendars by name
node packages/google-calendar/bin/google-calendar.js calendars

# 2. List RobOS Family profiles & email addresses
node packages/google-calendar/bin/google-calendar.js family

# 3. List upcoming events across all Named Google Calendars (or filter by calendar name)
node packages/google-calendar/bin/google-calendar.js events
node packages/google-calendar/bin/google-calendar.js events --calendar Family

# 4. Create a Google Calendar event via natural language (auto-resolves Family members & Named Calendar)
node packages/google-calendar/bin/google-calendar.js add "Dentist appointment on Friday at 3pm for 1 hour on the Family calendar"

# 5. Create a Google Calendar event with explicit flags
node packages/google-calendar/bin/google-calendar.js add \
  --title "Family Dinner" \
  --calendar "Family" \
  --date "2026-11-14" \
  --start "18:00" \
  --end "19:30" \
  --location "Downtown" \
  --attendees "Alex,Sam"

# 6. Create / update the 1-button "RobOS Calendar — Add Event Access Form" Google Doc on Google Drive
node packages/google-calendar/bin/google-calendar.js sync-doc --share-family

# 7. Sync all Named Google Calendars into Mozilla Thunderbird CalDAV
node packages/google-calendar/bin/google-calendar.js sync-thunderbird

# 8. Launch the RobOS Add Calendar Event WebApp (:19226) + Outbound HTTPS Tunnel
node packages/google-calendar/serve.js
```
