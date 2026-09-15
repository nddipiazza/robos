# Populate RobOS apps: saved stage status

Each configuration stage displays a count and a saved-state indicator:

- **Already in apps**: all graph entries have matching local app entries.
- **Partly populated**: some graph entries are present locally.
- **Defined in graph**: graph entries exist but have not been matched locally.
- **Not defined**: this graph contains no entries for the stage.

Open **View existing entries** within a stage to inspect names, definitions or
endpoints and see which entries are already present. Users and Groups show saved
graph identities and local directory matches before another discovery run.

Indicators reflect current persisted presence, not successful authentication,
content equality, or selections for the current import. Existing people are not
automatically selected and existing group memberships are not rewritten by simply
opening the dialog. Indicators are refreshed on opening and after a successful
import. Other graphs' unrelated entries are excluded from the counts.
