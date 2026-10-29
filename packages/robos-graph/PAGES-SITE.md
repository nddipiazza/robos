# GitHub Pages KGraph viewers

KGraph Explorer can turn any kgraph folder (a folder with `.robos/kgraph.yaml`) into a static site for GitHub Pages. Open **🌍 Pages Site** in the Explorer header, or use the CLI:

```bash
node packages/robos-graph/bin/kgraph-cli.js site build --graph <kgraph folder> --workflow
node packages/robos-graph/bin/kgraph-cli.js site renderers --graph <kgraph folder>
node packages/robos-graph/bin/kgraph-cli.js site agent-renderers --graph <kgraph folder>
node packages/robos-graph/bin/kgraph-cli.js site serve --graph <kgraph folder>
```

The site goes to `<kgraph folder>/docs` by default: `index.html`, the viewer, `data/graph.json` and the renderers. `--workflow` adds `.github/workflows/kgraph-pages.yml`, which deploys `docs/` on every push to `main` once the repository's Pages source is set to GitHub Actions. Serving `docs/` from the `main` branch works too.

## Renderers

Every node is drawn by a renderer, chosen in this order:

1. a renderer that names the node (`nodes: ['urn:…']`), or the node's `site:renderer` property
2. a renderer for one of the node's own types
3. a renderer for the nearest parent type, following `rdfs:subClassOf` in `.robos/ontology.jsonld`
4. the generic renderer, which shows every property and what links to the node

Renderers are plain scripts in the kgraph folder's `site/renderers/`:

```js
KGraphSite.registerRenderer({
  id: 'jrpg-enemy',
  types: ['jrpg:Enemy'],                 // jrpg:Boss, a subclass, gets it too
  render(node, c) { return `<h1>${c.h(c.title(node))}</h1>${c.stats(node['jrpg:stats'])}`; },
  card(node, c) { /* optional list card */ },
  collection(nodes, c, type) { /* optional type index page */ },
});
```

`c` carries the helpers (`h`, `link`, `value`, `propsTable`, `stats`, `table`, `images`, `figure`, `refs`, `card`, `parent()` to wrap the overridden renderer, and more; the full list is in `lib/pages-site/index.js` as `RENDERER_CONTRACT`). Each page ends with a note naming its renderer and why it was chosen, and `renderers/resolution.json` lists the choice for every type.

## Robos agent

**Ask the robos agent for missing renderers** sends the active coding agent the renderer contract, a few example nodes and the renderer it would otherwise get, once for each type that falls through to the generic renderer. An answer is saved to `site/renderers/agent-<type>.js` only if it compiles, declares the type, and does not use `fetch`, storage, `eval`, sockets or script tags. Rebuild the site to use it.

Tests: `node --test packages/robos-test/tests/sdlc-graph/pages-site.test.js`, and the browser and Explorer checks in `packages/robos-test/tests/jrpg-parse-portal/portal.e2e.js`.
