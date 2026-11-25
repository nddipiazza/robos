---
name: robos-users
description: Manage RobOS Users (`~/.config/robos/people/`), active user identity, rich user profiles (emails, birthdays, roles, personality, hobbies, music rules, RPG/BG3 characters, Party Game profiles), Knowledge Graph export, RobOS Voice Assistant commands, and RobOS Services sync across machines (`192.168.1.25`).
---

# RobOS Users Skill (`/robos-users`)

Use this skill whenever the user asks to:
- List, search, count, or inspect **RobOS Users** (`~/.config/robos/people/*.json`) and household/family members
- Check or switch the **active RobOS user** (`whoami`, `switch "<user>"` → `~/.config/robos/settings.json` `myProfileUid` + `active-voice-context.json`)
- Answer questions about any RobOS User's **email, phone, birthday, age, job/role, bio, personality traits/quirks/pet peeves, hobbies, music likes/dislikes, favorite books, RPG / Baldur's Gate 3 character, gamer tag, Party Game profile, or group memberships**
- Create, update, or remove a RobOS User (keeping `~/.config/robos/groups/*.json` and `~/.config/robos/search-index/people.txt` synchronized)
- Sync RobOS Users & Groups data to **RobOS Services** locally (`~/.config/robos/services/data/users-groups.json`) or to a remote RobOS Services host such as `192.168.1.25` (`:19400/users-groups` / `:19405`)

---

## CLI Commands (`packages/robos-cli/robos-users`)

```bash
# 1. List all RobOS Users (or filter by group / search query)
./packages/robos-cli/robos-users list
./packages/robos-cli/robos-users list --group Family
./packages/robos-cli/robos-users list --json

# 2. Check or switch the active RobOS User on this machine
./packages/robos-cli/robos-users whoami
./packages/robos-cli/robos-users switch "Diana"
./packages/robos-cli/robos-users switch "Nicholas"

# 3. Show a RobOS User's profile or Party Game onboarding summary
./packages/robos-cli/robos-users show "Diana"
./packages/robos-cli/robos-users show "Bella" --full --json
./packages/robos-cli/robos-users party-profile "Nick"

# 4. Ask targeted fact questions about any RobOS User
#    Supported topics: summary, email, phone, birthday, age, role, gamerTag,
#    rpg, music, music-dislikes, books, hobbies, pet-peeves, personality, games, family, groups
./packages/robos-cli/robos-users ask "Bella" email
./packages/robos-cli/robos-users ask "Diana" rpg
./packages/robos-cli/robos-users ask "Diana" music-dislikes
./packages/robos-cli/robos-users ask "Nick" hobbies
./packages/robos-cli/robos-users birthdays

# 5. Add, update, or remove a RobOS User
./packages/robos-cli/robos-users add "Sam Carter" \
  --email "sam@example.com" \
  --nickname "Sam" \
  --role "Systems Engineer" \
  --groups "Engineering,Game Night" \
  --gamer-tag "MajorSam"

./packages/robos-cli/robos-users update "Leo" --gamer-tag "LeoTheBrave" --hobby "Drums"
./packages/robos-cli/robos-users remove "Sam Carter"

# 6. Export Users & Groups Knowledge Graph + sync to RobOS Services (local or remote SSH host)
./packages/robos-cli/robos-users kgraph
./packages/robos-cli/robos-users sync
./packages/robos-cli/robos-users sync --host 192.168.1.25

# 7. Send or stage email to RobOS User(s) via RobOS Thunderbird Bridge
./packages/robos-cli/robos-users email "Diana" --subject "Dinner" --body "Dinner is at 6 PM."
./packages/robos-cli/robos-users confirm-email
./packages/robos-cli/robos-users email "Leo,Bella" --subject "Weekend Plans" --body "Movie night Friday at 7 PM." --send-now
./packages/robos-cli/robos-users email "Viv" --subject "Charger" --body "Don't forget your charger." --draft

# 8. Execute any natural-language / Voice Assistant phrase directly
./packages/robos-cli/robos-users say "tell me about Diana"
./packages/robos-cli/robos-users say "what is Jennilyn's email"
./packages/robos-cli/robos-users say "send an email to Diana saying I am on my way home"
./packages/robos-cli/robos-users say "confirm email"
./packages/robos-cli/robos-users say "what is Diana's Baldur's Gate 3 character"
./packages/robos-cli/robos-users say "sync robos users and groups to 192.168.1.25"
```

---

## RobOS Voice Assistant Commands

Both **RobOS Voice Desktop & Phone Assistant** (`packages/voice-prompt`, `:19188`) and **RobOS Home Speaker / Nabu** (`packages/home-speaker/lib/nabu-command-router.js`) handle these utterances natively in `<5ms`:

- **Discovery & Counts**:
  - *"Who are the RobOS users?"* / *"List all RobOS users"* / *"List family members"* / *"How many RobOS users do we have?"*
- **Active User Identity**:
  - *"Who am I?"* / *"Who is the active RobOS user?"*
  - *"Switch RobOS user to Diana"* / *"Set active user to Nicholas"*
- **Profile & Fact Lookup**:
  - *"Tell me about Diana"* / *"Who is Isabella DiPiazza?"* / *"Describe Viv"*
  - *"What is Bella's email?"* / *"What is Jennilyn's email address?"*
  - *"When is Leo's birthday?"* / *"List family birthdays"* / *"How old is Leo?"*
  - *"What is Diana's job?"* / *"What does Nicholas do?"*
  - *"What is Nick's gamer tag?"* / *"What is Diana's gamer tag?"*
  - *"What is Diana's Baldur's Gate 3 character?"* / *"What RPG class does Nick play?"*
  - *"What music does Diana like?"* / *"What music does Diana hate?"*
  - *"What books does Diana read?"* / *"What are Diana's pet peeves?"* / *"What are Nick's hobbies?"*
- **Send & Draft Email to RobOS Users (via Thunderbird Bridge)**:
  - *"Send an email to Diana saying dinner is ready at 6 PM"* → stages email to `Diana Arrington` and reads back subject & body for safe 1-phrase confirmation
  - *"Email Leo and Bella with subject Weekend Plans and body Movie night is Friday at 7 PM"*
  - *"Email Jennilyn about Friday Pickup: I will pick up Leo and Bella at 5 PM"*
  - *"Send an email to Diana"* → stages recipient, then follow up with *"message I'm heading home now"*
  - *"Confirm email"* / *"Send it"* / *"Cancel email"* / *"Read pending email"*
  - *"Draft an email to Viv saying Don't forget your charger"* → queues directly in Thunderbird Outbox (`sendLater`)
  - *"Send an email to Diana saying Running 5 minutes late and send it now"* → sends immediately in one step
- **Create / Update / Sync by Voice**:
  - *"Add RobOS user Sam Carter with email sam@example.com in group Engineering"*
  - *"Set Leo's gamer tag to LeoTheBrave"* / *"Add hobby Chess to Leo"*
  - *"Remove RobOS user Sam Carter"*
  - *"Sync RobOS users and groups to 192.168.1.25"*
  - *"Open RobOS Users"* / *"Open People Directory"*

---

## Key Implementation Files

- `packages/robos-lib/people-store.js` — underlying `~/.config/robos/people/<uid>.json` + `photos/` store
- `packages/robos-lib/users-groups.js` — unified RobOS Users & Groups CRUD, natural-language Q&A, KGraph exporter, and RobOS Services sync engine
- `packages/robos-cli/robos-users` — standalone CLI entrypoint
- `packages/voice-prompt/lib/skills-executor.js` & `packages/voice-prompt/lib/voice-commands-registry.js` — Voice Assistant intent routing & command catalog
- `packages/people-directory/` & `packages/people-manager/` — desktop Electron apps (`RobOS People & User Profiles`)
