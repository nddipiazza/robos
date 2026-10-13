---
title: "RobOS Documentation"
package: robos-documentation
category: arch-planning
icon: robos-documentation.svg
summary: "Lists the components in the knowledge graph, shows which have a documentation page, and lets you generate, edit and export those pages."
description: "Reads documentable nodes from .robos/knowledge-graph.jsonld, keeps one Markdown file per node under docs/architecture, records them in .robos/documentation.yaml, and can export a static page."
related:
  - /schemas/documentation/documentation.html
  - /system-documentation/
---

RobOS Documentation tracks documentation coverage for the architecture recorded in the knowledge graph. It does not scan your source code. It works on the nodes in `.robos/knowledge-graph.jsonld`, found in the directory you launch it from or in the repository next to the package.

## Use it

1. Open **RobOS Documentation**. The left list shows each documentable entity. Filter it with **All**, **Documented** or **Needs Docs**, or use **Jump to Entity...**. A coverage percentage is shown above the list.
2. Select an entity. Four tabs show it:
   - **Living Documentation**: the rendered Markdown page. For an entity without one, **Generate Living Documentation** creates it, and **Re-generate Docs** replaces an existing one.
   - **Edit Markdown Artifact**: an editor for the file. **Save Artifact** writes it.
   - **Architecture & Graph**: the entity and its relations in the graph.
   - **KGraph JSON-LD**: the raw node.
3. **Export Website** writes a single static HTML page of the documentation. **Open Test Viewer** exports it, then serves it on `http://localhost:3089/system-documentation/` (the port can be passed as an option).

Generated pages are template-based: they fill in the entity's title, description, type, owner team and repository from the graph and add a placeholder diagram. Review and edit them. No language model is called.

## Where data lives

| Item | Location |
|---|---|
| Documentation file for an entity | `docs/architecture/<slug>.md`, or the `robos:docPath` set on its documentation node |
| Declarative record of documented entities | `.robos/documentation.yaml` |
| Graph | `.robos/knowledge-graph.jsonld` |

The app requires `packages/robos-graph` to be available, since it uses that package's graph store.

## Launch options and CLI

`--entity=<id>`, `--app=<id>` or `--doc=<id>` open a given entity first. To export the site without the window:

```bash
node packages/robos-documentation/cli-export-web.js --output=docs/system-documentation/index.html --permalink=/system-documentation/
```

Options are `--output`, `--permalink` and `--title`; the defaults are the values shown above.
