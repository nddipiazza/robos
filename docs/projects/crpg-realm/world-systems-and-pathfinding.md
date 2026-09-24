---
title: World Systems & Pathfinding
layout: default
parent: Tactical cRPG & Infinity AI Engine
grand_parent: RobOS Projects
nav_order: 5
description: How village collision, raycast-plus-A* pathfinding, NPCs and dialogue, doors, ground items and fog of war work in crpg-realm, with real coordinates.
---

# World Systems, Pathfinding & NPC Dialogue
{: .no_toc }

The systems that make a location playable: invisible collision polygons over a painted background, a raycast-plus-A* pathfinder, NPCs that open dialogue trees from `data/v1/dialogue.json`, doors, ground items and fog of war. Oakhaven Village Square is used as the worked example. After reading this you can move a building, add a waypoint or place a new NPC and know what else needs to change.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## Village collision

The village is one 2560x1440 image (`assets/backgrounds/village_open_world_2560.png`) in a `TextureRect` named `Ground`. The buildings you see are painted into that image. What stops the party is a set of `StaticBody2D` nodes on collision layer 1 laid over it in [`scenes/VillageSquare.tscn`](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scenes/VillageSquare.tscn).

![Party routing between houses]({{ '/assets/images/crpg-realm/house_wall_navigation.png' | relative_url }}){: .robos-zoomable-img }
*The party walking between village houses, with the path line drawn by `PathVisualizer`.*

### The eleven house bodies

Each is a `StaticBody2D` (`collision_layer = 1`, `collision_mask = 1`) with one or more `CollisionPolygon2D` children. Bounds are the min/max of the polygon points.

| Node | Polygons | Main footprint bounds (x, y) |
|:---|:---|:---|
| `HouseBlacksmith` | `CollisionPolygon2D` | 580–1110, 200–430 |
| `HouseApothecary` | `CollisionPolygon2D`, `ApothecaryGarden`, `ApothecaryCartBench` | 240–660, 520–770 |
| `HouseSWCottage` | `CollisionPolygon2D`, `SWCartFence` | 0–360, 1000–1340 |
| `HouseTavernInn` | `CollisionPolygon2D`, `TavernBeerTables` | 1280–1730, 160–510 |
| `HouseTownHall` | `CollisionPolygon2D` | 1720–2180, 200–600 |
| `HouseEastThatched` | `CollisionPolygon2D` | 1930–2300, 520–770 |
| `HouseBakeryOven` | `CollisionPolygon2D` | 2160–2540, 590–910 |
| `HouseSouthMerchant` | `CollisionPolygon2D` | 650–1200, 1060–1440 |
| `HouseSouthThatched` | `CollisionPolygon2D` | 1380–1870, 1070–1440 |
| `HouseSouthLower` | `CollisionPolygon2D` | 1850–2250, 910–1320 |
| `HouseEastCorner` | `CollisionPolygon2D` | 2240–2560, 850–1340 |

### `VillageBoundaries`

One more `StaticBody2D` holds the map edges and street furniture:

| Child | Shape | Where |
|:---|:---|:---|
| `WestBorder`, `EastBorder` | 30x1440 rectangles | x = 15 and x = 2545 |
| `NorthWallLeft`, `NorthWallRight` | polygons | north edge; they leave a gap between x = 1130 and x = 1220 for the garrison gate |
| `WestTower` | polygon | (40–240, 220–480) |
| `CentralFountain` | circle r = 95 | (1305, 875) |
| `PlazaWell` | circle r = 38 | (915, 925) |
| `PlazaTree` | circle r = 42 | (1765, 870) |
| `BlacksmithAnvil` | circle r = 25 | (780, 470) |
| `BlacksmithWoodpiles`, `MarketStall1`–`5`, `BenchNorth/East/South/West` | polygons | around the plaza |

### Doors

All doors are `Area2D` nodes with [`DoorPortal.gd`](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/DoorPortal.gd). Only two lead anywhere.

| Node | `door_id` | `door_name` | Position | Target |
|:---|:---|:---|:---|:---|
| `GarrisonGate` | `door-id-1` | Royal Garrison Gate | (1175, 200) | `GarrisonKeep.tscn`; `is_locked`, `required_key = "garrison-key"`, `opens_quest_stage = 4` |
| `ForestGate` | `door-id-forest` | Whispering Forest Road | (2500, 940) | `WhisperingForest.tscn`, spawn (180, 720) |
| `DoorInn` | `door-id-inn` | Tavern Door | (1370, 540) | none |
| `DoorBlacksmith` | `door-id-blacksmith` | Forge Door | (850, 420) | none |
| `DoorApothecary` | `door-id-apothecary` | Apothecary Door | (630, 720) | none |
| `DoorTownHall` | `door-id-townhall` | Town Hall Door | (1760, 620) | none |
| `DoorCottage` | `door-id-farmhouse` | Farmhouse Door | (320, 1020) | none |
| `DoorElder` | `door-id-elder` | Elder's Cottage Door | (900, 1060) | none |
| `DoorBarracks` | `door-id-barracks` | Barracks Door | (1550, 1080) | none |
| `DoorRanger` | `door-id-ranger` | Ranger's Lodge Door | (1840, 1000) | none |
| `DoorShrine` | `door-id-shrine` | Shrine Door | (1950, 760) | none |
| `DoorMill` | `door-id-mill` | Bakery Door | (2160, 880) | none |

Clicking a door calls `try_enter()`. It unlocks the door if the party has `required_key` (and calls `GameState.advance_quest(opens_quest_stage)`), emits `door_entered`, sets `GameState.spawn_position` from `target_spawn`, and changes scene if `target_scene` is set.

{: .note }
**Not implemented yet:** building interiors. The ten house doors have no `target_scene`; entering one only emits `door_entered`. Door ids are not linked to house bodies in code; the pairing is by name only.

---

## Pathfinding (`Pathfinder.gd`)

[`scripts/Pathfinder.gd`](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/Pathfinder.gd) is a `RefCounted` class with static functions. It does not use `NavigationServer2D` or navigation meshes. It uses physics raycasts on collision mask 1 plus an `AStar2D` graph over waypoints that the scene script supplies.

![Pathfinding illustration]({{ '/assets/images/crpg-realm/pathfinder_obstacle_avoidance.jpg' | relative_url }}){: .robos-zoomable-img }
*AI-generated illustration of the idea: try a straight line, otherwise route via waypoints. Labels in the image are not code names.*

### Line of sight

`is_line_clear()` casts three rays: one along the path and two offset sideways by `check_radius`, so the character's width clears corners.

```gdscript
static func is_line_clear(world_2d: World2D, from_pos: Vector2, to_pos: Vector2, check_radius: float = 12.0, exclude: Array[RID] = []) -> bool:
	# ...
	var q_center = PhysicsRayQueryParameters2D.create(from_pos, to_pos)
	q_center.collision_mask = 1
	q_center.exclude = exclude
	var hit = space.intersect_ray(q_center)
	if not hit.is_empty():
		return false
	# 2. Side offset rays (to ensure character body circle clears corners)
	var dir = (to_pos - from_pos).normalized()
	# ...
	var perp = Vector2(-dir.y, dir.x) * check_radius
	# ... same query from from_pos + perp and from_pos - perp
```

### Route building

`get_nav_path()`:

1. If the straight line is clear (radius 10), return `[target_pos]`.
2. Otherwise call `scene.get_nav_points()`. No method, or an empty list, means a straight line again.
3. Build an `AStar2D`: start (id 90001), target (id 90002), and each waypoint (ids 1..n). Connect start and target to every waypoint they can see; if none, to the closest one. Connect every pair of waypoints with a clear line.
4. `get_point_path()`, then `smooth_path()` drops intermediate points when a later point is directly visible.

```gdscript
	var astar = AStar2D.new()
	var start_id = 90001
	var target_id = 90002

	astar.add_point(start_id, start_pos)
	astar.add_point(target_id, target_pos)

	for i in range(nav_points.size()):
		astar.add_point(i + 1, nav_points[i])
	# ...
	for i in range(nav_points.size()):
		for j in range(i + 1, nav_points.size()):
			var pA = nav_points[i]
			var pB = nav_points[j]
			if is_line_clear(world_2d, pA, pB, 8.0, exclude):
				astar.connect_points(i + 1, j + 1)

	var raw_path = astar.get_point_path(start_id, target_id)
```

The waypoint graph is rebuilt, with O(n²) raycasts, on every move order. That is fine for 42 points; it would get slow with hundreds.

### Who uses it

Only `HeroPlayer.move_to_point()` and `HeroPlayer.queue_move_point()` call `Pathfinder.get_nav_path()`. `PartyCompanion.gd` preloads `Pathfinder` but never calls it: companions walk straight at their formation slot and slide along walls using the collision normal. They can get stuck behind buildings; after 3 s stuck within 65 px of the target they count as arrived.

### Waypoints per scene

Every location script defines `get_nav_points() -> Array[Vector2]`:

| Scene script | Points | Groups (from the comments) |
|:---|:---:|:---|
| `VillageSquare.gd` | 42 | 1 South Avenue, 2 South-East Avenue, 3 Central Plaza loop around the fountain, 4 West Thoroughfare & Apothecary, 5 Blacksmith Yard, 6 North Avenue to Garrison Gate, 7 Tavern approach, 8 Town Hall approach, 9 East Thoroughfare & Bakery |
| `Homestead.gd` | 21 | West armory, Great Hall, South Foyer, East study, North gallery (with doorway thresholds) |
| `GarrisonKeep.gd` | 18 | South entrance corridor, central nave, north aisle / throne dais |
| `WhisperingForest.gd` | 17 | West ruins, bridge approach, stone bridge crossing, east bank, crypt approach |
| `AncientCatacombs.gd` | 11 | West vault, main corridor, sarcophagus dais, east vault |

Group 6 of the village runs up the gap in the north wall:

```gdscript
		# 6. North Avenue to Garrison Gate
		Vector2(1100, 500),
		Vector2(1170, 440),
		Vector2(1175, 320),
		Vector2(1175, 240),
```

---

## NPCs and dialogue

### The roster

`data/v1/npcs.json` has 18 records for 17 distinct characters: Blacksmith Brand appears twice, as `blacksmith-brand` and `npc-id-1`, both using `blacksmith-inquiry`. The scene uses `npc-id-1`.

| id | Name | Dialogue tree | Scene | Node | Position |
|:---|:---|:---|:---|:---|:---|
| `elora` | Elora (Partner) | `partner-confrontation` | Homestead | `EloraNPC` | (1180, 560) |
| `npc-id-1` | Blacksmith Brand | `blacksmith-inquiry` | VillageSquare | `BlacksmithBrand` | (820, 470) |
| `blacksmith-brand` | Blacksmith Brand | `blacksmith-inquiry` | — | not placed | — |
| `npc-id-innkeeper` | Barkeep Corwin | `dialogue-innkeeper` | VillageSquare | `NPC_Innkeeper` | (1330, 560) |
| `npc-id-guildmaster` | Guildmaster Aldous | `dialogue-guildmaster` | VillageSquare | `NPC_Guildmaster` | (1720, 660) |
| `npc-id-herbalist` | Maybelle the Apothecary | `dialogue-herbalist` | VillageSquare | `NPC_Herbalist` | (630, 770) |
| `npc-id-guard` | Gate Guard Garrick | `dialogue-guard` | VillageSquare | `NPC_Guard` | (1130, 260) |
| `npc-id-farmer` | Farmer Giles | `dialogue-farmer` | VillageSquare | `NPC_Farmer` | (380, 980) |
| `npc-id-priestess` | Sister Althea | `dialogue-priestess` | VillageSquare | `NPC_Priestess` | (1880, 780) |
| `npc-id-miller` | Miller Hob | `dialogue-miller` | VillageSquare | `NPC_Miller` | (2100, 890) |
| `npc-id-hunter` | Ranger Kaelen | `dialogue-hunter` | VillageSquare | `NPC_Hunter` | (1780, 1020) |
| `npc-id-bard` | Lyra the Minstrel | `dialogue-bard` | VillageSquare | `NPC_Bard` | (1305, 740) |
| `npc-id-merchant` | Trader Borin | `dialogue-merchant` | VillageSquare | `NPC_Merchant` | (1150, 680) |
| `npc-id-elder` | Elder Martha | `dialogue-elder` | VillageSquare | `NPC_Elder` | (880, 1020) |
| `npc-id-peddler` | Goblin Peddler Griknok | `dialogue-peddler` | WhisperingForest | `NPC_Peddler` | (850, 640) |
| `npc-id-fallen` | Fallen Adventurer Rickard | `dialogue-fallen` | WhisperingForest | `NPC_Fallen` | (520, 560) |
| `npc-id-hermit` | Hermit Varis | `dialogue-hermit` | WhisperingForest | `NPC_Hermit` | (1950, 480) |
| `npc-id-crypt-ghost` | Spirit of Sir Justin | `dialogue-crypt-ghost` | AncientCatacombs | `SirJustinGhost` | (1420, 480) |

Placement: 12 in the village, 3 in the forest, 1 in the catacombs, 1 (Elora) in the Homestead. Captain Malakor is not an NPC record; he is the `MalakorBoss` `Area2D` in `GarrisonKeep.tscn`, driven by `GarrisonKeep.gd`.

![NPC dialogue in the activity log]({{ '/assets/images/crpg-realm/dozens_npc_dialogue.png' | relative_url }}){: .robos-zoomable-img }
*Dialogue shown in the activity log with numbered choices.*

### Two kinds of NPC node

- **`NPCCharacter`** ([`scripts/NPCCharacter.gd`](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/NPCCharacter.gd), instanced from `scenes/components/NPCCharacter.tscn`) — a `CharacterBody2D` used by the 15 `NPC_*`/`SirJustinGhost` nodes. Exports include `npc_id`, `npc_name`, `custom_sprite_path`, `portrait_path`, `waypoints`, `move_speed` (85) and a fallback `dialogue_text`.
- **`ClickableObject`** ([`scripts/ClickableObject.gd`](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/ClickableObject.gd)) — a plain `Area2D` that emits `body_clicked`. Used for Brand and Elora. The scene script owns their dialogue and their walking: `VillageSquare._process()` walks Brand between (820, 470) and (760, 470); `Homestead.gd` walks Elora between (1180, 560) and (1380, 560).

### How `NPCCharacter.interact()` finds a dialogue tree

On click it sets the NPC to conversing, facing the hero, then looks for a tree in this order:

1. `DataStore.dialogue_trees[npc_id]`
2. `DataStore.dialogue_trees["dialogue-" + npc_id without "npc-id-"/"npc-"]` — this is the one that matches for `npc-id-innkeeper` → `dialogue-innkeeper`
3. `DataStore.dialogue_trees[DataStore.npcs[npc_id].dialogue_tree]`
4. a one-node tree built from the exported `dialogue_text` and `dialogue_choices`

It then calls `ActionLog.start_dialogue(tree, tree.rootNode)` and reverts the conversing state on `ActionLog.dialogue_ended`.

A tree in `dialogue.json` is an object with `id`, `title`, `rootNode` and a `nodes` map. Each node has `speaker`, `text` and `choices`, and each choice has `text` and `nextNode`. An empty `choices` array ends the conversation.

### Facing the hero

```gdscript
func set_conversing(conversing: bool, face_target: Vector2 = Vector2.ZERO) -> void:
	is_conversing = conversing
	if conversing and face_target != Vector2.ZERO and sprite:
		sprite.flip_h = (face_target.x > global_position.x)
	if not conversing and idle_textures.size() > 0 and sprite:
		sprite.texture = idle_textures[0]
```

The source sprites face left, so `flip_h = true` turns the NPC to face a hero on its right. `VillageSquare.talk_to_blacksmith()` and `Homestead.talk_to_elora()` do the same for Brand and Elora.

{: .note }
**Not implemented yet:** wandering NPCs and NPC walk cycles. No scene sets `waypoints` on an `NPCCharacter`, so all fifteen stand still. And because every one sets `custom_sprite_path`, `_load_npc_textures()` returns before loading `*_walk_N.png` frames. Only Brand and Elora walk and animate.

---

## Ground items

`GroundItem_Potion` (`item-id-1`, "Lesser Healing Draught", at (1200, 820)), `GroundItem_Scroll` (`item-id-scroll`, "Scroll of Arcane Blast", at (1420, 820)) and `GroundItem_Sword` (`item-id-iron-sword`, "Militia Shortsword", at (1050, 820)) are instances of `scenes/components/GroundItem.tscn`. [`GroundItem.gd`](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/GroundItem.gd) exports `item_id`, `item_name`, `quantity`, `is_picked_up` and `icon_texture`. A left click calls `pickup()`: `GameState.add_item(item_id)`, emit `item_picked_up`, `queue_free()`.

---

## Fog of war

`FogOfWar` ([`scripts/FogOfWar.gd`](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/FogOfWar.gd), instanced from `scenes/components/FogOfWar.tscn`) is in all five location scenes. It keeps a low-resolution image of the map and draws it scaled up over everything.

![Fog of war around the party]({{ '/assets/images/crpg-realm/fog_of_war_reveal.png' | relative_url }}){: .robos-zoomable-img }
*Explored ground stays dimmed; the area around the hero is clear.*

| Export | Default | Meaning |
|:---|:---|:---|
| `map_width`, `map_height` | 2560, 1440 | map size in pixels |
| `grid_scale` | 8 | one fog cell = 8x8 px, so the grid is 320x180 |
| `vision_radius` | 340.0 | outer edge of sight |
| `inner_vision_radius` | 240.0 | fully clear inside this radius; smoothstep fade to 340 |
| `memory_darkness` | 0.65 | alpha over explored ground not currently in sight |
| `shroud_color` | `Color(0.02, 0.02, 0.04, 1.0)` | fog colour |
| `is_fog_enabled` | true | used only if `GameState.settings` has no `fog_of_war` key |

Each cell stores two values: red = explored (never decreases), green = in sight now. When the hero moves more than 5 px, `update_fog_at_position()` clears last frame's green cells and stamps a precomputed circular brush. The shader [`shaders/fog_of_war.gdshader`](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/shaders/fog_of_war.gdshader) turns that into alpha:

```glsl
uniform vec4 shroud_color : source_color = vec4(0.02, 0.02, 0.04, 1.0);
uniform float memory_darkness : hint_range(0.0, 1.0) = 0.65;
uniform bool enabled = true;
// ...
		float explored = fog_sample.r;
		float in_vision = fog_sample.g;
		float alpha = (1.0 - explored) + (explored * (1.0 - in_vision) * memory_darkness);
		COLOR = vec4(shroud_color.rgb, clamp(alpha, 0.0, 1.0));
```

- **Unexplored:** alpha 1 (black). **Explored, out of sight:** alpha 0.65. **In sight:** alpha 0.
- **Actors.** Nodes passed to `register_actor()` fade to invisible when their cell is not in sight (green ≤ 0.15), and their `OverheadUI`/`SelectionCircle` hide too. `VillageSquare._ready()` registers the hero, the hound, Brand, companions and every `CharacterBody2D` child.
- **Memory.** Explored cells are cached per scene name in `GameState` metadata (`fog_cache`), so returning to a map keeps what you uncovered. `/reset` clears the cache.
- **Toggle.** The Settings modal checkbox `ChkFogOfWar` writes `GameState.settings.fog_of_war`.

{: .note }
**Not implemented yet:** vision from companions or light sources (only the node in `hero_node`, the `HeroPlayer`, reveals fog), line-of-sight blocking by walls (vision is a plain circle through buildings), and a minimap.

---

## Verify it

```bash
python3 run_cucumber_tests.py tests/e2e/features/normal/10_house_wall_collision_pathfinding.feature
python3 run_cucumber_tests.py tests/e2e/features/normal/11_dozens_npc_dialogue_and_trading.feature
python3 run_cucumber_tests.py tests/e2e/features/normal/01_fog_of_war_exploration.feature
```

---

## Gotchas

- **Collision must match the painting.** Move a polygon without repainting, or repaint without moving the polygon, and the party walks through walls or bumps into air.
- **Waypoints must be in open ground.** A waypoint inside a collision polygon cannot see any neighbour and silently drops out of the graph.
- **Keep everything a direct child of the scene root.** `FogOfWar` registration, the HTTP state API and area-of-effect spells scan `get_tree().current_scene.get_children()`.
- **`GameControlServer` click targets clamp to the screen.** `/user_input/click_object` clamps the cursor to (40–1880, 60–1020) screen pixels, so an off-screen object is "clicked" at the screen edge.
- **Pickups ignore distance.** A mouse click on a `GroundItem` picks it up from anywhere on screen. The agent's `pickup_item` walks there first; a human player does not have to.
- **`item-id-iron-sword` is not in `items.json`.** Picking up the sword adds an id that `GameState.get_item_data()` cannot resolve.

[← Previous: Infinity AI Agent & Test Harness]({{ '/projects/crpg-realm/infinity-ai-agent-harness.html' | relative_url }}) · [Next: Engine Specification →]({{ '/projects/crpg-realm/elearning-masterclass.html' | relative_url }})
