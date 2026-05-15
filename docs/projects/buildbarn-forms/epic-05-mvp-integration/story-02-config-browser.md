---
nav_exclude: true
---

# Story 05-02: Config Set Browser (List View)

**Epic:** [MVP Integration](epic.md)
**Status:** Not started
**Points:** 5

## Description

Build the config set list view that shows all Buildbarn configs available for the current project. Users can see config names, their last modification time, and navigate to edit a specific config. This is the landing page for the Buildbarn config editor section of the MVP dashboard.

## Acceptance Criteria

- [ ] Page renders a list of config sets for the current project (calls `ListConfigSets` gRPC)
- [ ] Each list item shows: config name, last modified date, commit message
- [ ] "New Config" button opens the config editor in creation mode
- [ ] Clicking a config name navigates to the config editor for that config
- [ ] "Delete" button per item (with confirmation dialog) calls `DeleteConfigSet` gRPC
- [ ] Empty state: friendly message + "Create your first config" button when no configs exist
- [ ] Loading state: spinner while fetching
- [ ] Error state: error message with retry button if gRPC call fails
- [ ] Uses existing MVP routing conventions (React Router or equivalent)

## gRPC Call

```javascript
// Using generated gRPC-Web client
const req = new ListConfigSetsRequest();
req.setProjectId(currentProjectId);

configServiceClient.listConfigSets(req, metadata, (err, response) => {
  if (err) { handleError(err); return; }
  setConfigs(response.getConfigSetsList().map(cs => ({
    name: cs.getName(),
    lastModified: cs.getLastModifiedAt(),
    commitMessage: cs.getLastCommitMessage(),
  })));
});
```

## Files

- `MVP/src/components/BBConfigEditor/ConfigSetBrowser.js` (new)
- `MVP/src/components/BBConfigEditor/ConfigSetBrowser.css` (new)
