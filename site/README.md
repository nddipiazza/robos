# Front site (rowbose.com)

Jekyll site served at `https://rowbose.com/`. The classic docs live in `../docs`
and are published under `/v1/`. Build both with `scripts/build-docs.sh`.

Release labels and download URLs come from `VERSION`. `node scripts/stage-release-data.cjs`
updates both sites' `_data/release.json` and pins the website's Windows bootstrap to that tag.
The local build and Pages workflow run this automatically. Use `site.data.release` in Liquid
instead of hardcoding versions. Native Windows setup assets are linked directly; Linux distro
downloads lead to the release asset list so pending image builds do not produce broken links.

`.github/workflows/windows-release.yml` builds a clean native suite, bundles portable and
NSIS EXEs with `scripts/windows/build-release.cjs`, tests the packaged apps, and publishes
both EXEs, checksums and source provenance. It runs on version tags; its manual dispatch
can add EXEs to an existing release matching `VERSION`. These EXEs are separate from
the Linux-distro USB flasher built by `release.yml`.

## Engineering blog (`/blog/`)

Each post is its own file, `_blog/<slug>.html`, published at `/blog/<slug>/` with the `blog-post` layout.
`blog/index.html` lists the posts newest first by their `date` front matter (a time of day orders posts
from the same day) and has no post content of its own. Old `/blog/#<slug>` links are forwarded to the
post's page by a script on the index. The `robos-blog` skill describes the front matter.

## Hero video

The hero on the home page is a recording of the real apps. Regenerate it with the steps in
`packages/robos-test/lib/lifecycle/README.md`; `publish-hero.js` writes `assets/hero/*` and
`_data/hero.json` (the step list and start times).

## Build apps guides (`/build-apps/`)

`build-apps/index.html` is the overview of the Task Planner, Task Implementer and Agent Code Review loop;
`solo.html` and `teams.html` are the two step-by-step guides. Their screenshots, `assets/build-apps/shots/*.jpg`,
are clean captures of the real apps driven through the same sample project as the hero recording, so regenerate
them rather than editing them by hand:

```bash
Xvfb :99 -screen 0 1920x1080x24 &
DISPLAY=:99 node packages/robos-test/demos/build-apps-guide-shots.js /tmp/guide --world=/home/dana/src
node packages/robos-test/demos/build-apps-guide-shots.js --publish /tmp/guide   # PNG -> site JPGs (needs Pillow)
```

`--only=agents,servers,gitprojects,planner,devcentral,implementer,review,reviewer` reruns part of the set, and
`--world` picks the folder the sample clone lives in, which shows in Git Projects. When an app's layout changes,
check the guide captions still match. The home-page tile image, `assets/build-apps/planner-tile.jpg`, is a crop of
the hero slide `03-planner-generated.jpg`.

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

