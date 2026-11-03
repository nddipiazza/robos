# RobOS JRPG Parser

Turns folders of classic JRPG resources into a kgraph, and generates backgrounds, sprites and menu screens from them with Gemini.

A person collects the resources: walkthroughs, screenshots, maps, sprite sheets. The parser reads local files only and has no crawler or fetch step. When something is missing, it says what to add.

```bash
node bin/jrpg-parser.js scan ~/Downloads/ff1
node bin/jrpg-parser.js parse ~/Downloads/ff1 --out ~/kgraphs/final-fantasy-nes --title "Final Fantasy" --edition "NES (USA)"
node bin/jrpg-parser.js coverage --out ~/kgraphs/final-fantasy-nes
node bin/jrpg-parser.js plan --out ~/kgraphs/final-fantasy-nes
node bin/jrpg-parser.js art --out ~/kgraphs/final-fantasy-nes --limit 3
```

## Steps

| Step | What it does | Needs |
| --- | --- | --- |
| `scan` | Hashes each file and works out its role from its name and title. A page whose title names a remake or mod is skipped, with a note. | Nothing |
| `parse`, charts | Reads monster, boss and spell tables by their headers. | Nothing |
| `parse`, prose | The agent extracts classes, places, story, equipment, shops and rules. A record whose quote is not in the page is dropped. | `agy` (or `--provider`) |
| `parse`, screens | The agent describes the layout of one screenshot per screen type. | `agy` |
| `art` | Generates images, shrinks them to game size and the NES palette, and adds them to the kgraph. | `agy`, `python3` with Pillow |

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

## Correcting a scan

Pass `--manifest <file>` to change a file's role or skip it:

```json
{ "files": { "img_0042.png": { "role": "area-map" }, "notes.html": { "use": false, "note": "Remake prices" } } }
```

## Limits

- The spell chart parser assumes black magic rows above white magic rows, in equal halves, as charts of this era list them.
- Colored asterisks in spell charts, which mark who cannot learn a spell, are not read.

## Tests

```bash
node --test packages/robos-test/tests/jrpg-parser/unit.test.js
```

The agent and `agy` are faked, so the tests run offline.
