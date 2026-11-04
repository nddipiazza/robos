# Ember Quest demo

A complete, tiny example of the JRPG pipeline, used by the
[beginner's course](https://rowbose.com/elearning/how-to-recreate-classic-jrpg-using-kgraph-parsing-with-automated-playthrough/).
Ember Quest does not exist. Its fan site, maps and numbers were invented here, so all of it can be
run, recorded and published.

| File | What it does |
| --- | --- |
| `world.js` | The invented maps, tiles and game settings |
| `practice-site.js` | Writes the practice fan site |
| `serve.js` | Serves a folder on this machine only and logs each request |
| `collect.js` | Adds the guide pages to the harvester's manifest |
| `build-game.js` | Cuts collected maps into numbered tiles and writes a playable folder from `parsed.json` |
| `game/` | The game's rules, a robot player, and the script it follows |
| `recorder/record.sh` | Records the course's clips on a private virtual screen |

The test `packages/robos-test/tests/jrpg-parser/practice-site.test.js` runs all of it end to end.

## Rerecording the clips

```bash
packages/robos-jrpg-parser/demo/recorder/record.sh /tmp/ember-recording /tmp/ember-clips
```

This needs `xvfb-run`, `ffmpeg` and the Electron in `packages/robos-test`. Nothing appears on your
desktop. Copy the GIFs and PNGs you want into `site/assets/elearning/jrpg-kgraph/demo/`, and look at
them first: a clean run does not prove a clip reads well.

Only record this practice site. A recording of someone else's website would publish a copy of it.
