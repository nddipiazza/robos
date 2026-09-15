# RobOS Team Chat Servers

Manage team workspaces and their channels in a selected KGraph. The app reads and
writes `robos:TeamChatServer` and `robos:TeamChatChannel` nodes directly through
GraphWorkspace validation and atomic proposal/apply. No separate settings copy
is needed: imported graph entries appear immediately on refresh.

Providers: Slack, Microsoft Teams, Zulip, Mattermost, Rocket.Chat, Discord, Matrix,
and Google Chat. Provider selection describes the connection; Slack authentication can be tested with the referenced pass entry; workspace identity must match. Other provider authentication, channel discovery, chat history ingestion and sending messages are not implemented.
Open takes the user to the saved workspace or channel URL.

Servers have a name, description, provider, workspace URL, optional workspace or
tenant ID, and optional `pass:` credential reference. Channels have a name,
description, channel/stream/room ID, optional URL, and `robos:chatServer` reference.
Entries belong to the organization package and include an update timestamp.
The Slack Test action reads the referenced pass entry into process memory and calls Slack auth.test; it never returns or persists the token. Paste only password-store references.

Removing a server requires removing its channel entries first. Removal affects
only the graph. Concurrent graph changes invalidate an open edit rather than
silently overwriting the graph. Other node properties are retained during edits.

Run with the shared Electron runtime: `electron packages/team-chat-servers`.
Debug port: 19191. Tests: `node --test packages/team-chat-servers/lib/servers.test.cjs`.

The portable application registration is in this package's `.robos` workspace
and can be imported into a company graph. The root demo graph currently contains
unresolved legacy references, so registration is validated independently rather
than weakening graph validation. The desktop launcher and icon registries are
registered normally.

Manual verification: launched with Electron against an isolated graph, created a
Zulip server and engineering channel using the form, edited the description,
reloaded persisted entries and verified search filtering. No live messages sent.

Slack identity verification uses https://docs.slack.dev/reference/methods/auth.test/.
