# Front site (rowbose.com)

Jekyll site served at `https://rowbose.com/`. The classic docs live in `../docs`
and are published under `/v1/`. Build both with `scripts/build-docs.sh`.

## Hero video

The hero on the home page is a recording of the real apps. Regenerate it with the steps in
`packages/robos-test/lib/lifecycle/README.md`; `publish-hero.js` writes `assets/hero/*` and
`_data/hero.json` (the step list and start times).

## The future page and whitepaper (`/future/`)

`future/index.md` is the plain-English page, `future/whitepaper.md` is the whitepaper, and
`future/skill-commons-whitepaper.pdf` is its PDF edition. The page and the PDF are built from the same
`whitepaper.md`, so edit that file and regenerate rather than touching the PDF.

```bash
scripts/build-future-whitepaper.sh   # figures (site/assets/future/*.svg) + the PDF
```

The figures are drawn by `scripts/future/figures.mjs` (a dark palette for the site, a light one,
`*-light.svg`, for print), so each diagram is a small diff when its claim changes. Needs node, pandoc and the
Playwright Chromium. Commit the regenerated SVGs and PDF (`.gitignore` allows this one PDF). When a figure
changes, update its `robos:FlowDiagram` Mermaid text in the `documentation` KGraph package as well.

