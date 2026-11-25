---
name: robos-groups
description: Manage RobOS Groups (`~/.config/robos/groups/`), household/family/kids/team memberships, group email rosters, two-way user-group synchronization, RobOS Voice Assistant group commands, and RobOS Services sync across machines (`192.168.1.25`).
---

# RobOS Groups Skill (`/robos-groups`)

Use this skill whenever the user asks to:
- List or inspect **RobOS Groups** (`~/.config/robos/groups/*.json` such as `Family`, `Household`, `Dipiazza Kids`, plus profile-derived groups such as `Game Night`, `Rock Invasion`, `Engineering`, `Book Club`)
- Ask **who is in a group**, get **all email addresses for a group**, or check **which groups a RobOS User belongs to**
- **Create, update, or delete** a RobOS Group (including linked contexts, calendars, and workspaces)
- **Add or remove a RobOS User** in a group with **atomic two-way synchronization** between `~/.config/robos/groups/<gid>.json` (`members`) and `~/.config/robos/people/<uid>.json` (`groups`)
- Sync RobOS Groups & Users to **RobOS Services** locally (`~/.config/robos/services/data/users-groups.json`) or on a remote host such as `192.168.1.25` (`:19400/users-groups` / `:19405`)

---

## CLI Commands (`packages/robos-cli/robos-groups`)

```bash
# 1. List all RobOS Groups (explicit files + user tag groups, or --explicit-only)
./packages/robos-cli/robos-groups list
./packages/robos-cli/robos-groups list --explicit-only
./packages/robos-cli/robos-groups list --json

# 2. Inspect group members or export a group's email roster
./packages/robos-cli/robos-groups show "Family"
./packages/robos-cli/robos-groups members "Dipiazza Kids"
./packages/robos-cli/robos-groups emails "Family"
./packages/robos-cli/robos-groups user-groups "Leo"

# 3. Create, update, or delete a RobOS Group
./packages/robos-cli/robos-groups create "Band Practice" \
  --description "Rock Invasion rehearsal crew" \
  --members "Nick,Diana"

./packages/robos-cli/robos-groups update "Band Practice" \
  --description "Weekly Rock Invasion drum & guitar sessions" \
  --add-context "calendars/family"

./packages/robos-cli/robos-groups delete "Band Practice"

# 4. Add or remove members (updates BOTH ~/.config/robos/groups/<id>.json AND ~/.config/robos/people/<uid>.json)
./packages/robos-cli/robos-groups add-member "Viv" "Game Night"
./packages/robos-cli/robos-groups remove-member "Viv" "Band Practice"

# 5. Sync RobOS Groups & Users to RobOS Services (local or remote SSH host)
./packages/robos-cli/robos-groups sync
./packages/robos-cli/robos-groups sync --host 192.168.1.25

# 6. Execute any natural-language / Voice Assistant phrase directly
./packages/robos-cli/robos-groups say "what robos groups do we have"
./packages/robos-cli/robos-groups say "who is in the Dipiazza Kids group"
./packages/robos-cli/robos-groups say "what are the emails for the Family group"
./packages/robos-cli/robos-groups say "is Jennilyn in the Dipiazza Kids group"
```

---

## RobOS Voice Assistant Commands

Both **RobOS Voice Desktop & Phone Assistant** (`packages/voice-prompt`, `:19188`) and **RobOS Home Speaker / Nabu** (`packages/home-speaker/lib/nabu-command-router.js`) handle these spoken commands natively:

- **List & Count Groups**:
  - *"What RobOS groups do we have?"* / *"List all RobOS groups"* / *"How many RobOS groups are there?"*
- **Inspect Members & Emails**:
  - *"Who is in the Family group?"* / *"Who is in the Household group?"*
  - *"Who is in the Dipiazza Kids group?"* / *"Who is in Game Night?"*
  - *"List members of Rock Invasion"* / *"Describe the Dipiazza Kids group"*
  - *"What are the emails for the Family group?"* / *"Emails for Dipiazza Kids group"*
  - *"What groups is Leo in?"* / *"Which RobOS groups does Diana belong to?"*
  - *"Is Jennilyn in the Dipiazza Kids group?"*
- **Email an Entire RobOS Group (via Thunderbird Bridge)**:
  - *"Email the Family group saying Dinner is at 6 PM"*
  - *"Send an email to the Dipiazza Kids group with subject Saturday Schedule and body Leo's game is at noon"*
  - *"Confirm email"* / *"Send it"* / *"Cancel email"*
- **Create, Edit & Sync Groups by Voice**:
  - *"Create a RobOS group called Band Night with Nick and Diana"*
  - *"Add Viv to the Game Night group"*
  - *"Remove Leo from the Band Night group"*
  - *"Delete RobOS group Band Night"*
  - *"Sync RobOS groups to 192.168.1.25"*
  - *"Open Group Manager"* / *"Open RobOS Groups"*

---

## Key Implementation Files

- `packages/robos-lib/users-groups.js` — two-way group & user store, alias resolver, KGraph sync, and RobOS Services sync engine
- `packages/robos-cli/robos-groups` — standalone CLI entrypoint
- `packages/group-manager/` — desktop Electron app (`RobOS Group Manager`)
- `packages/voice-prompt/lib/skills-executor.js` & `packages/voice-prompt/lib/voice-commands-registry.js` — Voice Assistant intent router & command catalog
