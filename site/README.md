# Front site (rowbose.com)

Jekyll site served at `https://rowbose.com/`. The classic docs live in `../docs`
and are published under `/v1/`. Build both with `scripts/build-docs.sh`.

## Hero video

The hero on the home page is a recording of the real apps. Regenerate it with the steps in
`packages/robos-test/lib/lifecycle/README.md`; `publish-hero.js` writes `assets/hero/*` and
`_data/hero.json` (the step list and start times).
