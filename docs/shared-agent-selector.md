# Shared RobOS agent selector

`packages/robos-lib/agent-selector.js` defines `<robos-agent-selector>` for Task Planner and Task Runner. It uses `window.robosProviders.list({refresh})`, supplied by the Electron preload, to query `packages/robos-agent-client/providers.js`. Other RobOS apps can expose the same IPC service and load the component.

Call `await element.load({provider, model})`, listen for `change`, and read `element.value` (`provider`, `model`), `element.ready`, and `element.error`. An already-fetched catalog can be passed as `providers` to avoid a duplicate readiness check. Model choices stay separate when switching providers.

The provider service discovers AGY models with `agy models` and reads Codex's model catalog. Model IDs and labels are cached in `~/.config/robos/provider-model-cache.json` for 24 hours, keyed by provider and executable version (path/mtime). Concurrent requests in one process share a lookup. The cache survives app restarts. Failed refreshes retain saved models and back off for five minutes; Refresh explicitly retries. Authentication is checked separately and credentials are never stored in this catalog.

Task Runner only implements a plan approved in Task Planner. Approval records the exact plan hash, source, and timestamp. Editing the plan invalidates approval; previously saved hashes without Task Planner provenance require review again. Both launch preflight and worker startup enforce approval. Planning starts only from Task Planner and remains there for review.

AGY read permissions cover the container's temporary `/home/agent` so searches at that root work. This is the ephemeral home, not a mounted developer home. Implementation writes remain granted to the repository directory; planning does not grant file writes.
