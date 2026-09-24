---
title: "9. Party & Formations"
layout: default
parent: Creating Your Own Game
grand_parent: "Tactical cRPG & Infinity AI Engine"
nav_order: 9
permalink: /projects/crpg-realm/create-your-own-game/09-party-dynamics-and-formations.html
description: "How the party leader, the six GameState.FORMATIONS and PartyCompanion follow logic work, and how to add your own formation."
---

# 9. Party Leader and Formations
{: .no_toc }

In this chapter you add a seventh formation to the game. On the way you will learn how the party is split between `HeroPlayer` and `PartyCompanion` nodes, how `GameState` picks a leader, how `move_party_formation()` turns one click into one destination per party member, and how the offsets are rotated to face the direction of travel.
{: .fs-6 .fw-300 }

![The tactical battle with the portrait toolbar on the right; the leader card is outlined in gold]({{ '/assets/images/crpg-realm/tactical_battle_splash.png' | relative_url }}){: .robos-zoomable-img }
*TacticalBattle at the start of a test run. The portrait toolbar (right) marks the leader with a gold border and a 👑 before its hotkey number.*

## Table of contents
{: .no_toc .text-delta }

1. TOC
{:toc}

---

## How it works

### Two node classes, one party list

The party data and the party nodes live in different places:

| What | Where | Notes |
|:--|:--|:--|
| Party data | `GameState.party_members: Array[Dictionary]` | Index 0 is the hero. Each entry has `id`, `name`, `hp`, `max_hp`, `ac`, `weapon`, … |
| Hero node | `scenes/HeroPlayer.tscn` (`class_name HeroPlayer`) | One per location scene, named `HeroPlayer`. Owns the `Camera2D` and handles mouse and keyboard input. |
| Companion nodes | `scenes/PartyCompanion.tscn` (`class_name PartyCompanion`) | A separate, smaller class. Identified by the exports `companion_id` and `companion_name`. |
| Leader | `GameState.party_leader_index: int` | An index into `party_members`. Default 0. |
| Formation | `GameState.current_formation: String` | One of the keys of `GameState.FORMATIONS`. Default `"rank"`. |

Companions are not the same class as the hero. `PartyCompanion.gd` has its own movement, its own melee and ranged attack, and no pathfinder calls. How companions get into a scene differs:

- `scenes/TacticalBattle.tscn` places two instances, `CompanionElora` and `CompanionThrumbar`, directly in the scene file.
- `AncientCatacombs.gd`, `GarrisonKeep.gd`, `Homestead.gd` and `WhisperingForest.gd` instantiate one `PartyCompanion.tscn` in `_ready()` when `GameState.party_members.size() > 1`.

### Mapping data to nodes: `get_scene_party_nodes()`

Every party command starts by turning `party_members` into a list of scene nodes. Index 0 is always the node called `HeroPlayer`. For each later member, the function searches the **direct children** of the current scene for a `CharacterBody2D` whose `companion_id` or `companion_name` matches the member's `id` or `name`:

[scripts/GameState.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/GameState.gd)
```gdscript
func get_scene_party_nodes() -> Array[Node2D]:
	var res: Array[Node2D] = []
	var cur_sc = get_tree().current_scene
	# ...
	# Node 0 corresponds to HeroPlayer
	var hero = cur_sc.get_node_or_null("HeroPlayer")
	# ...
	# Companions matching party_members[1..n]
	for idx in range(1, party_members.size()):
		var m = party_members[idx]
		# ...
		# 1) Search children for PartyCompanion matching companion_id or companion_name
		for child in cur_sc.get_children():
			if child is CharacterBody2D and not res.has(child):
				var c_id = str(child.get("companion_id")).to_lower()
				var c_name = str(child.get("companion_name")).to_lower()
				# ...
```

Two fallbacks follow: a `find_child()` by name, then "any unused `PartyCompanion` child". `get_leader_node()` returns `get_scene_party_nodes()[party_leader_index]`.

### Choosing the leader

`set_party_leader(idx)` is the only function that changes the leader:

[scripts/GameState.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/GameState.gd)
```gdscript
func set_party_leader(idx: int) -> void:
	if idx >= 0 and idx < party_members.size():
		party_leader_index = idx
		var leader_data = party_members[idx]
		party_leader_changed.emit(party_leader_index, leader_data)
		party_changed.emit()
		log_message("system", "%s is now the party leader." % leader_data.get("name", "Companion"))
```

It is called from two places:

- **Portrait click.** `PortraitToolbar.gd` connects each card's `gui_input`. A plain left-click calls `select_party_member(idx)` and then `set_party_leader(idx)`. Shift-click only toggles selection. Right-click opens the `CharacterStatusWindow`.
- **HTTP API.** The `set_party_leader` action (args `leader` or `index`, name or number) and the `select_party_member` action in `GameControlServer.gd`.

The number keys **1**, **2** and **3** in `HeroPlayer._unhandled_key_input()` call `GameState.select_party_member()` only. They change the selection, not the leader.

`PortraitToolbar` listens to `party_leader_changed` and rebuilds its cards. The leader card gets a gold border and its hotkey label becomes `"👑 [%d]"`. The crown is an emoji in a `Label`, not an image asset.

The camera stays a child of `HeroPlayer`. `HeroPlayer._handle_camera_pan()` adds the offset from the hero to `GameState.get_leader_node()` to the camera offset every frame, so the view follows whichever node leads.

### The six formations

`GameState.FORMATIONS` maps a string id to six slot offsets. Slot 0 belongs to the leader. The table below is copied from the constant. The offsets are written for a party walking **up the screen** (toward negative y), so positive y means "behind the leader".

| id | Log title | Slot 0 | Slot 1 | Slot 2 | Slot 3 | Slot 4 | Slot 5 |
|:--|:--|:--|:--|:--|:--|:--|:--|
| `rank` | Rank & File | (0, 0) | (48, 0) | (0, 48) | (48, 48) | (0, 96) | (48, 96) |
| `wedge` | Wedge (V-Formation) | (0, 0) | (-48, 44) | (48, 44) | (-96, 88) | (96, 88) | (0, 75) |
| `line` | Shield Wall (Abreast) | (0, 0) | (48, 0) | (-48, 0) | (96, 0) | (-96, 0) | (144, 0) |
| `column` | Marching Column | (0, 0) | (0, 48) | (0, 96) | (0, 144) | (0, 192) | (0, 240) |
| `square` | Defensive Square | (-35, 0) | (35, 0) | (-35, 70) | (35, 70) | (0, 35) | (0, 100) |
| `scatter` | Skirmish (Scatter) | (0, 0) | (-70, 35) | (65, 50) | (-40, 85) | (80, 100) | (0, 120) |

The log titles come from the `match` in `set_party_formation(formation_id)`, which also emits `party_formation_changed` and logs `Tactical Formation ordered: [<title>]`. The `ActionToolbar` has one button per formation (`BtnFormRank`, `BtnFormWedge`, `BtnFormLine`, `BtnFormColumn`, `BtnFormSquare`, `BtnFormScatter`) and highlights the active one in `_update_formation_buttons()`.

### Rotating the offsets

`get_formation_offsets()` rotates every base offset by the travel angle plus 90°:

[scripts/GameState.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/GameState.gd)
```gdscript
func get_formation_offsets(formation_id: String, count: int, travel_vector: Vector2) -> Array[Vector2]:
	var base_list: Array = FORMATIONS.get(formation_id, FORMATIONS["rank"])
	var delta_theta: float = 0.0
	if travel_vector.length() > 0.001:
		delta_theta = travel_vector.angle() + (PI / 2.0)

	var res: Array[Vector2] = []
	for i in range(count):
		var base_off = base_list[i] if i < base_list.size() else Vector2(0, 48 * i)
		var rot_off = base_off.rotated(delta_theta)
		res.append(rot_off)
	return res
```

Why `+ PI / 2`: the table is authored facing up, `Vector2(0, -1)`, whose angle is `-PI/2`. Adding `PI/2` makes the rotation zero for that direction. For any other heading the whole shape turns with it. Walking right (`Vector2(1, 0)`, rotation 90°), `column` slot 1 `(0, 48)` becomes `(-48, 0)`, so the follower is still behind. An unknown formation id falls back to `"rank"`. A seventh or later member gets `Vector2(0, 48 * i)`.

### One click, one destination per member

A left-click that no UI control consumes reaches `HeroPlayer._unhandled_input()`, which calls `GameState.move_party_formation(click_pos, is_shift)`. The HTTP `move_party_formation` action ends up in the same function.

[scripts/GameState.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/GameState.gd)
```gdscript
func move_party_formation(target_pos: Vector2, queue: bool = false) -> Dictionary:
	var nodes = get_scene_party_nodes()
	# ...
	var leader = get_leader_node()
	var leader_pos = leader.global_position if (leader and is_instance_valid(leader)) else Vector2.ZERO
	var travel_vec = (target_pos - leader_pos).normalized()
	if travel_vec.length() < 0.001:
		travel_vec = Vector2(0, -1)

	var offsets = get_formation_offsets(current_formation, max(nodes.size(), party_members.size()), travel_vec)
	var rank_slot = 1
	# ...
	for idx in range(nodes.size()):
		# ...
		var slot = 0
		if idx == party_leader_index:
			slot = 0
		else:
			slot = rank_slot
			rank_slot += 1

		var slot_offset = offsets[slot] if slot < offsets.size() else Vector2.ZERO
		var slot_dest = target_pos + slot_offset

		if queue:
			if node.has_method("queue_move_point"):
				node.queue_move_point(slot_dest)
			# ...
		else:
			if node.has_method("move_to_point"):
				node.move_to_point(slot_dest)
			# ...
```

The leader gets slot 0. The other members get slots 1, 2, … in party order, skipping the leader. The returned dictionary has `formation`, `leader_index`, `target` and a `dispatched` list of `{index, slot, node, target, offset}`, which the BDD steps inspect.

### Following between clicks

When a node is not moving and is not the leader, it walks toward its slot next to the current leader. `PartyCompanion._physics_process()` does this:

[scripts/PartyCompanion.gd](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/scripts/PartyCompanion.gd)
```gdscript
	elif not is_party_leader() and not (get_tree().current_scene is TacticalBattle):
		var leader = GameState.get_leader_node()
		if leader and is_instance_valid(leader) and leader != self:
			var leader_dir = leader.velocity.normalized() if leader.get("velocity") != null and leader.velocity.length() > 5.0 else Vector2(0, -1)
			var offsets = GameState.get_formation_offsets(GameState.current_formation, GameState.party_members.size(), leader_dir)
			var slot = get_formation_rank_slot()
			var slot_off = offsets[slot] if slot < offsets.size() else formation_offset
			var desired_pos = leader.global_position + slot_off
			var dist = global_position.distance_to(desired_pos)
			if dist > 65.0:
				# ... walk straight toward desired_pos
```

`HeroPlayer._physics_process()` has the same branch for the case where a companion leads, but it always uses slot 1 (see Gotchas). Neither class follows inside `TacticalBattle`. There, only explicit orders move the party.

---

## Step by step: add a "diamond" formation

The new formation puts one member on each side of the leader and one behind.

1. **Add the offsets.** In `scripts/GameState.gd`, add a key to `FORMATIONS`. Keep six entries so larger parties still get distinct slots. Write the offsets for a party walking up the screen.

   New code — add this entry inside `const FORMATIONS: Dictionary = { ... }`:
   ```gdscript
   	"diamond": [
   		Vector2(0, 0),
   		Vector2(-56, 40),
   		Vector2(56, 40),
   		Vector2(0, 80),
   		Vector2(0, 130),
   		Vector2(0, 180)
   	],
   ```

2. **Give it a log title.** In `set_party_formation()`, add a case to the `match formation_id:` block:
   ```gdscript
   			"diamond": form_title = "Diamond"
   ```
   Without it the log shows `formation_id.capitalize()`, which is also fine.

3. **Add a toolbar button.** In `scenes/components/ActionToolbar.tscn`, copy the `BtnFormScatter` node block, rename it `BtnFormDiamond` (same `parent="MarginContainer/HBoxContainer/FormationContainer"`), and change `text` and `tooltip_text`.

4. **Wire the button.** In `scripts/ActionToolbar.gd`:
   ```gdscript
   @onready var btn_form_diamond: Button = find_child("BtnFormDiamond", true, false)
   ```
   In `_ready()`, next to the other formation buttons:
   ```gdscript
   	if btn_form_diamond:
   		btn_form_diamond.pressed.connect(func(): GameState.set_party_formation("diamond"))
   ```
   In `_update_formation_buttons()`, add `"diamond": btn_form_diamond` to the `buttons` dictionary so the button highlights.

5. **(Optional) Let the HTTP toolbar click find the button.** The `action_toolbar_click` action in `GameControlServer.gd` hard-codes the six ids. You do not need to edit it: an action named `formation_diamond` is handled by the `act.begins_with("formation_")` branch, which calls `GameState.set_party_formation("diamond")`. Add `"formation_diamond": "BtnFormDiamond"` to its `btn_map` only if you want the QA overlay to move the mouse to the button during tests.

6. **Run the game**, open `TacticalBattle` (or any location with a companion), click the new button and click the floor. The log shows `Tactical Formation ordered: [Diamond]`.

---

## Verify it

The existing coverage is [tests/e2e/features/normal/14_party_independent_dynamics_and_formations.feature](https://github.com/nddipiazza/robos/blob/main/games/crpg-realm/tests/e2e/features/normal/14_party_independent_dynamics_and_formations.feature). It loads `TacticalBattle` with Vance, Elora and Thrumbar, checks the six toolbar buttons, moves the party in `rank`, `wedge`, `line`, `column` and `square`, and promotes Elora and Thrumbar to leader.

```bash
cd games/crpg-realm
python3 run_cucumber_tests.py tests/e2e/features/normal/14_party_independent_dynamics_and_formations.feature
```

To cover the new formation, add a scenario to that file. Every step below already exists in `tests/e2e/features/steps/crpg_steps.py`:

```gherkin
  Scenario: Selecting Diamond formation moves the leader to the click point
    When the player selects formation "formation_diamond" from the action toolbar
    Then the active formation is "diamond"
    When the player commands the party to move to (700, 500)
    Then the leader moves to (700, 500)
    And all party members arrive at their desired rank coordinates
```

`the leader moves to` polls `party_nodes` in `/api/v1/state` until the leader is within 45 px (70 px on the final check). `all party members arrive at their desired rank coordinates` checks that no two party nodes are closer than 15 px.

---

## Gotchas

- **Keys 1–3 do not change the leader.** They only select. Only a portrait left-click or the HTTP actions call `set_party_leader()`.
- **A companion-led party drags the hero to slot 1.** `HeroPlayer._physics_process()` hard-codes `var slot = 1` in its follow branch. `PartyCompanion` uses `get_formation_rank_slot()`. After a click, `move_party_formation()` assigns correct slots to everyone; the mismatch only shows while idle-following.
- **`HeroPlayer.is_party_leader()` means index 0.** It returns `GameState.party_leader_index == 0`. That works because `get_scene_party_nodes()` always puts `HeroPlayer` first. If you reorder `party_members`, both assumptions break.
- **Companions do not pathfind.** `PartyCompanion` preloads `Pathfinder.gd` but never calls it. It walks in a straight line and slides along walls. The hero uses `Pathfinder.get_nav_path()`. In maze-like maps companions lag or get stuck; the stuck timer gives up after 3 s when within 65 px.
- **`square` does not put the leader on the click.** Its slot 0 is `(-35, 0)`, so the leader stops 35 px to the side (rotated). The step `the leader moves to` still passes because of its 45 px tolerance.
- **Nodes must be direct children of the scene root.** Companion lookup scans `get_children()` first. A companion nested under a group node is only found through the `find_child()` fallback by name, and the enemy AI in chapter 10 never sees it.
- **Party count follows data, not nodes.** Adding a `PartyCompanion` node without a matching `party_members` entry gives you a node that nothing commands. Adding a member without a node gives you a portrait card that does nothing on the map.
- **Nothing saves the formation per scene.** `current_formation` and `party_leader_index` live in the `GameState` autoload and survive scene changes. `setup_tactical_party()` resets both to `"rank"` and 0.

---

[← Previous: 8. Cucumber BDD testing]({{ '/projects/crpg-realm/create-your-own-game/08-cucumber-bdd-testing.html' | relative_url }}) · [Next: 10. Aggro, tactics and pack AI →]({{ '/projects/crpg-realm/create-your-own-game/10-aggro-tactics-and-pack-ai.html' | relative_url }})
