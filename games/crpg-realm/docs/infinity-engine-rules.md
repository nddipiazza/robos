# Infinity Engine Rules in the RobOS cRPG Realm

This page records the Baldur's Gate / Icewind Dale (Infinity Engine) conventions the
tactical engine follows, so scenarios, spells and AI all agree on the same numbers.

## World scale

| Quantity | Value | Where |
|---|---|---|
| Pixels per foot | **9 px = 1 ft** | `GameState.PX_PER_FOOT` (anchored on the classic 20-ft Fireball = 180 px) |
| Visual range | **340 px (~38 ft)** | `GameState.VISUAL_RANGE_PX`, same as `FogOfWar.vision_radius` |

### Visual range (how far a character can see)

In BG1/BG2 every creature has the same sight radius: **448 IE units**, which is the
edge of the fog-of-war circle around each party member. Spell descriptions call this
"visual range" and treat it as about 30 ft, since a 30-ft-range spell can reach the
edge of it. Walls and closed doors block sight, but other creatures never do.

The Realm maps that circle onto its own sprite scale as the 340 px fog-of-war radius,
which works out to about 1.9× the Fireball radius (BG uses about 1.75×). The engine
follows these rules:

* `GameState.has_line_of_sight(a, b)`: only `StaticBody2D` geometry blocks the ray.
* `GameState.can_see_invisible_at(pos)`: invisibility is pierced only when a party
  member with a true-sight source (Gem of Seeing, True Seeing, See Invisibility) is
  within `VISUAL_RANGE_PX` of the target **and** has line of sight to it.
* `TacticalEnemy.can_be_seen_by_player()` checks the rule above on every frame. An
  invisible foe shimmers into view once the wearer closes the distance, and fades out
  again when the wearer moves away. You can only target it while it is in view.

## Area-of-effect radii (`GameState.SPELL_AOE_FEET`)

| Spell | Radius | Notes |
|---|---|---|
| Fireball | 20 ft / 180 px | 5e SRD sphere |
| Stinking Cloud | 20 ft / 180 px | 5e SRD sphere. In the IE it uses the same 256-unit projectile as Fireball (BG2 text says "30-ft radius", but IE descriptions often give the diameter) |
| Blizzard | 20 ft / 180 px | Ice Storm-sized burst that leaves slick ice |
| Dispel Magic | 20 ft / 180 px | IE area dispel (see below) |
| Sleep | 20 ft / 180 px | 5e SRD sphere |

Ground hazards (the ice patch and stinking cloud) use a circle whose footprint matches
their collision shape exactly. Their floor layer pivots at the hazard's back edge, so
the parent's Y-sort always draws creatures standing on the hazard **on top of** it.
The stinking cloud also adds thin wisps in front of the creatures, so a character in
the cloud looks surrounded by the gas instead of vanishing under it.

## Dispel Magic (area burst)

In BG/IWD you cast Dispel Magic at a point, and it strips magical effects from **every
creature in the burst, allies included**. The engine removes the effects listed in
`CombatManager.DISPELLABLE_EFFECTS`: invisibility, Sanctuary, Shield, Mage Armor,
Bless, Haste, Hold Person/paralysis, magical sleep, and similar. It leaves mundane
conditions (poison, prone) and item-granted powers (Gem of Seeing) alone. The telemetry
reports `affected`, `radius_px`, `radius_ft` and `center`.

## Traps

* Detected traps pulse red. Disarming a trap or springing it makes it **vanish from
  the map**: a short green (disarmed) or orange (sprung) flash, then the glyph fades
  out and its collision is switched off.
* `GameState.neutralized_traps` remembers each neutralized trap per scene, so a trap
  stays gone when the party leaves the area and comes back. Starting a new game
  (`init_hero` → `reset_flags`) clears the list.

## Magic Missile

The spell fires 3 darts at 1st level (5e SRD), each doing 1d4+1 force damage, and they
never miss. Each dart follows its own curved path, homes in on its target and shows its
own damage number on impact. Damage resolves the moment the last dart lands.
`CombatManager.forced_mm_darts` pre-rolls the darts so the numbers on screen match the
damage dealt.

## Engine pitfall: lambdas capture locals by value

GDScript lambdas copy the value of each captured local when they are created. A
callback like `func(): done = true` therefore never changes the caller's `done`, and
every `while not done` wait would run to its full timeout. This bug made every spell
cast stall for 2.5 s before its damage appeared. To share state with a callback, put it
in a `Dictionary` or `Array`: `var done = {"v": false}` … `done["v"] = true`.

## UI font chain

`assets/fonts/ui_font_with_emoji.tres` is the project font. It uses Open Sans, falls
back to Noto Emoji and then DejaVu Sans, so emoji and symbols (🕊 🛡 ❄ ─ ★ …) never
show up as "domino" tofu boxes. After adding new symbols, run
`python3 scripts/check_glyph_coverage.py` to confirm the fonts cover them.

## Proving it on video: state-API evidence, event journal, round clock

A passing scenario isn't enough on its own. Each Then-step in a scenario video has to
show what it checked, using values it read back from the running game.

* **Engine event journal.** `GameState.record_event(type, data)` logs every observable
  result with a `seq` number, a `t_ms` timestamp, the IE `round` and the time into that
  round (`round_t`). Read it with `POST /api/v1/engine/events {"since": seq, "type": ""}`.
  Event types: `damage_applied`, `creature_slain`, `status_applied`/`status_removed`,
  `prone_start`/`prone_end`, `spell_cast_started`, `spell_vfx_landed`, `spell_resolved`
  (with `latency_ms`), `mm_dart_impact`/`mm_dart_absorbed`, `hazard_spawned`,
  `hazard_contact` (with `actor_drawn_above_floor`), `trap_detected`, `trap_disarmed`,
  `trap_triggered`, `trap_vanished`, `trap_restored_neutralized`, `dispel_burst` (with
  `affected` and `outside`), `true_sight_reveal`/`true_sight_lost`, `round_started`.
* **IE round clock.** In the IE, one round is 6 s of unpaused real time
  (`GameState.IE_ROUND_SECONDS`). `ie_round` advances only while the game is unpaused.
  It appears in `/api/v1/state` and on every journal event, so steps can check rules
  round by round. For example, "the knockdown lasted less than one Infinity Engine round"
  compares the round and `round_t` of `prone_start` and `prone_end`. The turn-based golem
  encounter still uses `/api/v1/combat/round_stats` and `/api/v1/combat/turn_events`.
* **Glyph audit.** `GET /api/v1/ui/glyphs` walks every visible Label, Button and
  RichTextLabel. It reports which font in the chain draws each non-ASCII character,
  plus any characters that would show as tofu. After each scenario, the harness puts
  this audit on screen automatically.
* **On-screen proof panel.** Steps call `proof(context, "...")` from
  `tests/e2e/proof_helpers.py` with the values they checked. After each step,
  `environment.after_step` posts the step name and those values to
  `POST /api/v1/qa/proof`. The QA overlay then shows a panel titled "VERIFIED VIA GAME
  STATE API" with the live IE round clock. A failed step shows up there in red, with its
  assertion message.
* **Evidence-backed steps.** These live in `tests/e2e/features/steps/proof_steps.py`:
  dart counts and values, damage timing, exact HP change, hazard footprint versus
  collision versus drawn size, render order, how long a knockdown lasted in rounds,
  dispel burst membership by distance, where a true-sight reveal happened relative to
  visual range and line of sight, and glyph coverage of a label.

Writing these proofs has already caught one real engine bug. Creatures slipped on ice
or choked in the cloud while standing up to 7 px **outside** the radius, because only
the edge of their collision capsule touched the hazard. A creature now counts as inside
a hazard only when its feet (its origin point) are within the radius.
