---
title: "People Directory"
package: people-directory
category: arch-planning
icon: people-directory.svg
summary: "Searchable list of people with contact and org fields, stored as JSON files on your machine."
description: "Add, edit and import people (including from LDIF), filter by department, and mark which person is you. An optional AI box can create entries from a text description."
---

People Directory keeps one JSON file per person under `~/.config/robos/people/`. It is a local address book for a team, not a connection to a corporate directory.

## What you can do

- Search the list and filter it with the department drop-down (**All departments**).
- Click the plus button next to the list heading to create a person. The form has Identity (UID, display name, first and last name, username), Contact (email, phone, location), Org (title, department, manager) and a Bio. The UID names the file and cannot be changed after the first save.
- Select a person to see their profile, then **Edit**, **Delete**, or click **Set as My Profile** to mark which person is you. The choice is saved as `myProfileUid` in `~/.config/robos/settings.json`.
- Use **Import LDIF** to paste LDIF text and import its entries.
- Use **Add with AI** to describe one or more people in plain language, pick an agent (the default is the RobOS agent), and click **Generate & Add**. This needs an AI provider available through the shared RobOS AI library ([AI agents and API mode]({{ site.baseurl }}{% link ai-providers.md %})); without it the app reports "AI library not available".

On every save or delete the app rewrites `~/.config/robos/search-index/people.txt`, one `person:<username>:<display name>` line per person, which the [Search Indexer]({{ '/apps/search-index/' | relative_url }}) uses for @-mentions.

## Backend setting

The settings (gear) dialog lets you choose **Filesystem (local JSON)** or **LDAP / Active Directory** and enter an LDAP URL, base DN, bind DN, the `pass` path of the bind password and a user search base. These values are saved to `~/.config/robos/people/config.json`. The main process contains no LDAP client, so choosing LDAP does not load or sync people from a directory yet.

## Run it

Launch **RobOS People Directory** from the app launcher. Only one window runs at a time.
