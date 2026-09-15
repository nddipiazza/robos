# Team chat links

In a feature or task, open **Ticket details → Team chat links**. Select a KGraph, choose a configured Team Chat Server, and add a title and an HTTPS channel, thread, or message link. Use **Save chat links** to persist the associations. Existing chat URLs in imported descriptions are discovered against that graph’s server catalog and offered for saving. Markdown link titles are retained when available.

You can open, edit, and remove associations. Saving adds an idempotent **Team chat** section to the local work-item description. It does not overwrite the implementation plan, send chat messages, or change the task-server issue remotely. Reload discards unsaved link edits. URLs must use the selected server’s web origin, without embedded credentials; configure the server’s actual web address in Team Chat Servers.

Graph representation:

- Feature/Task `robos:teamChatLinks`: array of `@id` references to `robos:TeamChatLink` nodes.
- TeamChatLink `dcterms:title`: human-readable title.
- TeamChatLink `robos:url`: the exact HTTPS permalink, including channel/thread parameters.
- TeamChatLink `robos:chatServer`: an `@id` reference to the existing `robos:TeamChatServer`.

Graph updates use the proposal/validation/apply API, reuse a work item with the same issue URL, and preserve its type, workflow, and other metadata. Stale graph revisions and duplicate URLs are rejected. Removal detaches the work-item link; historical link nodes and server/channel definitions remain intact. Credentials stay in the Team Chat Server configuration, never in the work-item link.
