# RobOS JRPG Parser

Turns folders of classic JRPG resources into a kgraph, and generates backgrounds, sprites and menu screens from them with Gemini.

A person collects the resources: walkthroughs, reference guides, screenshots, maps, sprite sheets. Pass any mix of folders and single files. The parser reads local files only and has no crawler or fetch step. When something is missing, it says what to add.

```bash
node bin/jrpg-parser.js scan ~/Downloads/my-game
node bin/jrpg-parser.js parse ~/Downloads/my-game --out ~/kgraphs/my-game --title "My Game" --edition "NES (USA)"
node bin/jrpg-parser.js coverage --out ~/kgraphs/my-game
node bin/jrpg-parser.js plan --out ~/kgraphs/my-game
node bin/jrpg-parser.js art --out ~/kgraphs/my-game --limit 3
```

## Steps

| Step | What it does | Needs |
| --- | --- | --- |
| `scan` | Hashes each file and works out its role from its name and title. A page whose title names a remake or mod is skipped, with a note. | Nothing |
| `parse`, charts | Reads monster, boss, spell, weapon, armor and music tables by their headers, in HTML or Markdown, and Markdown shop lists. Reports shop prices that disagree with the equipment tables. | Nothing |
| `parse`, prose | The agent extracts classes, places, story, equipment, shops and rules, including formulas. Numbers from tables win over prose. A record whose quote is not in the page is dropped. | `agy` (or `--provider`) |
| `parse`, screens | The agent describes the layout of one screenshot per screen type. | `agy` |
| `art` | Generates images, fits them to the game (maps keep their full size, sprites and backdrops go on the NES palette) and adds them to the kgraph. An image invented from text is replaced once you collect a reference for it. | `agy`, `python3` with Pillow |

## Output

```
.robos/kgraph.yaml                    package catalog; KGraph Explorer opens this folder
.robos/ontology.jsonld                JRPG types and their parents
.robos/kgraphs/<package>/package.jsonld
parsed.json                           the records, read by art and reruns
coverage.json                         what is covered and what to collect next
assets/generated/                     images and their manifest
```

Nodes carry the workspace's JRPG types (`robos:GameMonster`, `robos:GameSpell`, `robos:GameItem`, `robos:GameClass`, `schema:Place`) along with `jrpg:` types, so the workspace's SHACL shapes apply. Source files are referenced by name and SHA-256, and are never copied.

## When sources disagree

A page whose title names the edition, such as "NES" in a guide's title, supplies the equipment records. Other pages add where to find each item, and their differing numbers go in `conflicts` in `parsed.json`. Gear that only those other pages list is left out, because a page covering several editions lists remake-only items.

## Correcting a scan

Pass `--manifest <file>` to change a file's role or skip it:

```json
{ "files": { "img_0042.png": { "role": "area-map" }, "notes.html": { "use": false, "note": "Remake prices" } } }
```

## Limits

- The spell chart parser assumes black magic rows above white magic rows, in equal halves, as charts of this era list them.
- Colored asterisks in spell charts, which mark who cannot learn a spell, are not read.

## Keeping downloads private

Files you collect, and anything copied from them, are never published. The working folder holds both: source file names and hashes, quotes used as evidence, descriptions taken from guides, and agent replies. It writes a `.gitignore` that ignores everything in it, so git will not pick it up.

`jrpg-parser publish --out <working folder> --to <new folder>` makes the copy to share, with parsed facts and generated images only. It searches the result for source file names, hashes, paths and quotes, and writes nothing if it finds any. Pushing that folder anywhere is a separate step you take yourself. Generated images can still closely resemble the game's own art, so choose with `--kinds` which ones to include.

## Tests

```bash
node --test packages/robos-test/tests/jrpg-parser/unit.test.js
```

The agent and `agy` are faked, so the tests run offline.
