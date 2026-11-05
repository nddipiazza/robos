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

## For AI agents

People usually run this demo by asking an AI agent such as Claude Code, GitHub Copilot, Codex or Gemini.
If someone asks you to do a step from the course, run the command below from the root of this repository
and tell them in plain English what the program did. `~/ember-quest` is the working folder.

Nothing here goes online: the websites run on this machine only, and the harvester refuses any other host.
Never use these tools on a real website, and do not fetch real game material. A person collects that by hand.

| Step | What it does | Command |
| --- | --- | --- |
| Check | Runs the whole demo in a temporary folder | `node --test packages/robos-test/tests/jrpg-parser/practice-site.test.js` |
| Create the site | Writes the invented fan site's pages and maps | `node packages/robos-jrpg-parser/demo/practice-site.js ~/ember-quest/site` |
| Start the site | Serves it at `http://127.0.0.1:8765`. It keeps running, so run it in the background and leave it up | `node packages/robos-jrpg-parser/demo/serve.js ~/ember-quest/site 8765` |
| Make the list | Reads the atlas page and writes `sources-manifest.json`, downloading nothing | `python3 packages/robos-jrpg-parser/tools/harvest_jrpg_assets.py --out-dir ~/ember-quest/collection --vgmaps-index http://127.0.0.1:8765/atlas/ --base-url http://127.0.0.1:8765/atlas/ --map-prefix EmberQuest- --discover-only` |
| Add guide pages | Adds the seven guide pages to that list | `node packages/robos-jrpg-parser/demo/collect.js ~/ember-quest/collection` |
| Download | Downloads everything on the list | `python3 packages/robos-jrpg-parser/tools/harvest_jrpg_assets.py --out-dir ~/ember-quest/collection --manifest ~/ember-quest/collection/sources-manifest.json` |
| Sort | Says what each file is and which it skips | `node packages/robos-jrpg-parser/bin/jrpg-parser.js scan ~/ember-quest/collection` |
| Parse | Reads the tables and builds the kgraph. `--no-agent` turns off the parser's own AI step | `node packages/robos-jrpg-parser/bin/jrpg-parser.js parse ~/ember-quest/collection --out ~/ember-quest/kgraph --title "Ember Quest" --edition "Retro (1989)" --no-agent` |
| Report gaps | Lists what is covered and what is missing | `node packages/robos-jrpg-parser/bin/jrpg-parser.js coverage --out ~/ember-quest/kgraph` |
| Build the game | Cuts maps into tiles and writes a playable folder | `node packages/robos-jrpg-parser/demo/build-game.js ~/ember-quest/collection ~/ember-quest/kgraph/parsed.json ~/ember-quest/game` |
| Start the game | Serves it at `http://127.0.0.1:8766`. Run it in the background and leave it up | `node packages/robos-jrpg-parser/demo/serve.js ~/ember-quest/game 8766` |
| Publish | Writes a clean copy with no source names, and uploads nothing | `node packages/robos-jrpg-parser/bin/jrpg-parser.js publish --out ~/ember-quest/kgraph --to ~/ember-quest/public --kinds none` |

The person plays the game and clicks **Let the robot play** in their own browser. Ask before deleting
anything, and stop the two websites when they are finished.

## Rerecording the clips

```bash
packages/robos-jrpg-parser/demo/recorder/record.sh /tmp/ember-recording /tmp/ember-clips
```

This needs `xvfb-run`, `ffmpeg` and the Electron in `packages/robos-test`. Nothing appears on your
desktop. Copy the GIFs and PNGs you want into `site/assets/elearning/jrpg-kgraph/demo/`, and look at
them first: a clean run does not prove a clip reads well.

Only record this practice site. A recording of someone else's website would publish a copy of it.
