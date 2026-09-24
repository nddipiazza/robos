---
title: "3. Maps & Geometry"
layout: default
parent: Creating Your Own Game
grand_parent: "Tactical cRPG & Infinity AI Engine"
nav_order: 3
permalink: /projects/crpg-realm/create-your-own-game/03-maps-and-isometric-geometry.html
description: How a crpg-realm map is built - the 2560x1440 plate, foundation colliders, camera limits, and the get_nav_points() waypoints that drive click-to-move.
---

# 3. 2560×1440 Maps & Isometric World Layers
{: .no_toc }

In this chapter you give the Sunken Vault from chapter 2 a map, walls and a waypoint network so that click-to-move routes around obstacles. The most important thing you'll learn is `get_nav_points()`: without it, the hero walks in a straight line and stops at the first wall.
{: .fs-6 .fw-300 }

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## How it works

![VillageSquare during a BDD run, with a cyan route through numbered waypoints]({{ '/assets/images/crpg-realm/village_square_overview.png' | relative_url }}){: .robos-zoomable-img }
*VillageSquare during a test run. The cyan line and "WP" badges are drawn by HeroPlayer's `PathVisualizer` child and show a route built from the scene's nav points.*

### Layers of a map

A location map has four parts, all direct children of the y-sorted scene root:

1. **The plate** — a `TextureRect` named `Ground` at `(0, 0)`, 2560×1440, with `expand_mode = 1` and `mouse_filter = 2` (Ignore). Buildings, trees and walls are painted into this one image.
2. **Colliders** — one or more `StaticBody2D` nodes on collision layer 1. Map edges use `CollisionShape2D` rectangles; buildings use `CollisionPolygon2D` outlines traced over the painted footprint.
3. **Actors and objects** — hero, NPCs, enemies, doors, traps, items. They sort by `y` against each other.
4. **`FogOfWar`** — drawn on top (`z_index = 25`). Its `map_width` / `map_height` exports default to 2560 / 1440.

The viewport is 1920×1080, so the camera shows part of the plate and scrolls.

### Foundation colliders

Because buildings are painted into the plate, the collider decides where the building "is". Trace only the part that touches the ground — the base of the walls — not the roof. The hero can then walk into the area where a roof is painted, which reads as walking behind the building. `VillageSquare.tscn` does this for every house:

[scenes/VillageSquare.tscn](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scenes/VillageSquare.tscn)

```text
[node name="HouseBlacksmith" type="StaticBody2D" parent="."]
collision_layer = 1
collision_mask = 1

[node name="CollisionPolygon2D" type="CollisionPolygon2D" parent="HouseBlacksmith"]
polygon = PackedVector2Array(580, 260, 1090, 200, 1110, 400, 960, 430, 950, 400, 740, 400, 730, 340, 580, 340)
```

Collision layer 1 matters twice: `CharacterBody2D` movement collides with it, and the pathfinder's line-of-sight rays use `collision_mask = 1`.

### Camera limits

The camera is the `Camera2D` inside `HeroPlayer.tscn`. Each location script clamps it to the plate in `_ready()`:

```gdscript
if hero and hero.has_method("set_camera_limits"):
	hero.set_camera_limits(0, 0, 2560, 1440)
```

[scripts/HeroPlayer.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/HeroPlayer.gd)

```gdscript
func set_camera_limits(left: int, top: int, right: int, bottom: int) -> void:
	# ...
	if camera:
		camera.limit_left = left
		camera.limit_top = top
		camera.limit_right = right
		camera.limit_bottom = bottom
		camera.position_smoothing_enabled = false
		camera.offset = camera_current_offset
```

`HeroPlayer.tscn` has smoothing enabled, but both `set_camera_limits()` and `HeroPlayer._ready()` turn it **off**, so the camera follows the hero without lag. `TacticalBattle.gd` uses `set_camera_limits(0, 0, 1920, 1080)` because its arena is screen-sized.

### Click-to-move: `Pathfinder.get_nav_path()`

When you click the ground, `HeroPlayer.move_to_point()` asks the pathfinder for a route and queues each point:

```gdscript
var cur_scene = get_tree().current_scene
var path = Pathfinder.get_nav_path(get_world_2d(), global_position, target_pos, cur_scene, [get_rid()])
```

`Pathfinder.gd` is a static helper, not a node. It works in four steps:

[scripts/Pathfinder.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/Pathfinder.gd)

```gdscript
static func get_nav_path(world_2d: World2D, start_pos: Vector2, target_pos: Vector2, scene: Node = null, exclude: Array[RID] = []) -> PackedVector2Array:
	# 1. Direct clear line check: if no walls block the direct route, move directly!
	if is_line_clear(world_2d, start_pos, target_pos, 10.0, exclude):
		return PackedVector2Array([target_pos])

	# 2. Collect Scene Navigation Waypoints
	var nav_points: Array[Vector2] = []
	if scene and scene.has_method("get_nav_points"):
		nav_points = scene.get_nav_points()

	if nav_points.is_empty():
		return PackedVector2Array([target_pos])

	# 3. Build AStar2D graph connecting navigable points
	# ... start, target and every nav point become AStar2D points;
	# ... two points are connected when is_line_clear() between them.

	# 4. Funnel smoothing: skip intermediate nodes where direct line is clear
	var smoothed = smooth_path(world_2d, raw_path, exclude)
	# ...
```

`is_line_clear()` casts three rays against layer 1: one centre ray and two parallel rays offset sideways (10 px for the direct check, 8 px between waypoints), so the route clears corners. The hero's own body is excluded. If nothing is visible from the start or the target, it connects to the closest nav point instead.

So the scene has one job: return good waypoints. Here are the catacombs':

[scripts/AncientCatacombs.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/AncientCatacombs.gd)

```gdscript
func get_nav_points() -> Array[Vector2]:
	return [
		# West entrance vault
		Vector2(240, 680),
		Vector2(420, 680),
		# Subterranean main corridor (avoids tomb colliders)
		Vector2(650, 720),
		Vector2(950, 720),
		Vector2(1280, 720),
		Vector2(1600, 720),
		# Grand Sarcophagus dais
		Vector2(1280, 540),
		Vector2(1280, 420),
		# East vault & Secret passage approach
		Vector2(1950, 680),
		Vector2(2150, 560),
		Vector2(2350, 420)
	]
```

`Homestead.gd`, `VillageSquare.gd`, `WhisperingForest.gd` and `GarrisonKeep.gd` each have one too. `Homestead.gd` shows the doorway pattern: a point on each side of every interior doorway plus one on the threshold.

---

## Step by step: map the Sunken Vault

1. **Paint the plate.** Export a 2560×1440 PNG to `assets/backgrounds/`, e.g. `sunken_vault_2560.png`. In `SunkenVault.tscn`, set `Ground.texture` to it. Keep `Ground` at `(0, 0)` with `mouse_filter = 2`.
2. **Edge colliders.** Keep the four border shapes you inherited from the catacombs (`WestBorder`, `EastBorder`, `NorthBorder`, `SouthBorder`), and delete `WallLeftVault` / `WallRightVault` if your art has no walls there.
3. **Obstacle colliders.** For each wall, pillar or building on the plate, add a `StaticBody2D` under the root (layer 1, mask 1) with a `CollisionPolygon2D` child. Trace the ground footprint only.
4. **Camera.** Your `SunkenVault.gd` from chapter 2 already calls `hero.set_camera_limits(0, 0, 2560, 1440)`. If your plate has another size, use its size here and set the same size on `FogOfWar.map_width` / `map_height`.
5. **Nav points.** Replace the three placeholder points in `get_nav_points()`:
   - one point in every open area and at every junction;
   - a point on each side of every doorway or gap, plus one in the gap;
   - keep points at least ~20 px from any collider, so the offset rays don't clip it;
   - make sure each point can "see" at least one other point in a straight line.
   To get coordinates, walk the hero there and read `hero.position` from `curl -s http://127.0.0.1:8080/api/v1/state`.
6. **Test by clicking.** Run `./debug.sh --scene res://scenes/SunkenVault.tscn` and click on the far side of each obstacle. The `PathVisualizer` line shows the chosen waypoints. If the hero walks into a wall and stops, there is no clear line between two consecutive points; add one in between.

---

## Verify it

The house-and-wall feature walks the hero around buildings in `VillageSquare` to a door and an item:

```bash
python3 run_cucumber_tests.py tests/e2e/features/normal/10_house_wall_collision_pathfinding.feature
```

Each move uses a route built from `VillageSquare.get_nav_points()`. Watch the scenario video in `tests/e2e/reports/index.html` to see the hero go around the houses rather than into them.

{: .note }
The item and door steps call `pickup()` / `try_enter()` after the walk even if the hero stopped short, so a passing run does not prove the route was good. Check the video, or assert on `hero.position` in `/api/v1/state` in your own step.

To test your own map, copy the feature and change the scene name and ids.

---

## Gotchas

- **No `get_nav_points()` means straight lines.** The pathfinder returns `[target_pos]` and the hero walks until a collider stops it.
- **Declare the return type.** Write `func get_nav_points() -> Array[Vector2]:`. The pathfinder stores the result in an `Array[Vector2]` variable, and an untyped array can fail that assignment.
- **Characters block rays too.** The hero, NPCs, enemies and companions are all on collision layer 1. An NPC standing in a corridor makes `is_line_clear()` fail there, so routes may detour around it. Only the hero itself is excluded.
- **Areas don't block rays.** Doors, traps, chests and ground items are `Area2D`s; the ray queries don't hit them, so they never affect pathing.
- **A nav point inside a collider is unreachable.** Nothing warns you; the A* graph just has an isolated node.
- **Smoothing is off on purpose.** If you re-enable `position_smoothing_enabled` on the camera, `set_camera_limits()` turns it off again on scene load.

---

[← Previous: 2. Scenes and door portals]({{ '/projects/crpg-realm/create-your-own-game/02-scenes-and-portals.html' | relative_url }}) · [Next: 4. Items, loot and inventory →]({{ '/projects/crpg-realm/create-your-own-game/04-items-loot-and-inventory.html' | relative_url }})
