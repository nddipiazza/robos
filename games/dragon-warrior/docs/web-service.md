# 🌐 Contract-Based Web Service — Game Control & Telemetry API

The Dragon Warrior Godot game includes an embedded, contract-based HTTP REST web service (`GameControlServer.gd` autoload) that allows external callers (automation scripts, web applications, BDD test runners, AI agents) to control the running game and inspect full real-time telemetry.

---

## 📋 API Contract Specifications

The API is fully specified using OpenAPI 3.0:
- **JSON Specification:** [`docs/api_contract.json`](api_contract.json)
- **YAML Specification:** [`docs/api_contract.yaml`](api_contract.yaml)
- **Live Contract Endpoint:** `GET http://localhost:8080/contract` (or `/api/v1/contract`)

---

## ⚡ Server Configuration & Execution

- **Default Port:** `8080`
- **Port Customization:**
  - Command-line argument: `--web-service-port=8088` or `--port=8088`
  - Environment variable: `DW_WEB_SERVICE_PORT=8088`
  - Automatic Port Fallback: If port 8080 is in use, the server automatically attempts to bind to adjacent ports (`8080..8089`).

---

## 🛣️ API Endpoints

### 1. Health Check
`GET /health` or `GET /api/v1/health`
**Response:**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "game_running": true,
  "fps": 60.0
}
```

### 2. Get Real-Time Game & Scene State
`GET /state` or `GET /api/v1/state`
Returns complete snapshot of scene, hero, dialog box, command window, battle, and encounter RNG state.

**Example Response:**
```json
{
  "scene_shown": {
    "path": "res://scenes/WorldMap.tscn",
    "name": "WorldMap"
  },
  "hero_position": {
    "x": 45,
    "y": 45,
    "facing": "down",
    "location_id": "overworld",
    "floor_id": "main"
  },
  "game_state": {
    "hero_name": "ERDRICK",
    "level": 1,
    "hp": 15,
    "hp_max": 15,
    "mp": 0,
    "mp_max": 0,
    "gold": 120,
    "inventory": ["torch"],
    "equipment": {
      "weapon": "bamboo_pole",
      "armor": "clothes"
    },
    "spells": [],
    "opened_chests": {},
    "unlocked_doors": {},
    "bridge_built": false
  },
  "dialog_box": {
    "is_showing": false,
    "text": "",
    "speaker": "",
    "current_page": 0,
    "total_pages": 0
  },
  "command_window": {
    "is_showing": false,
    "selected_index": 0,
    "menu_items": ["TALK", "DOOR", "STATUS", "TAKE", "STAIRS", "SPELL", "SEARCH", "ITEM"]
  },
  "battle": {
    "is_battle": false,
    "phase": "INACTIVE",
    "battle_scene_info": {}
  },
  "encounter_rng": {
    "zone_id": 0,
    "rate_key": "grass",
    "denominator": 24,
    "step_count": 5,
    "last_roll": -1
  }
}
```

### 3. Get Display Screen Contents
`GET /screen` or `GET /api/v1/screen`
Returns grid snapshot of all currently displayed tiles on screen, including hero location, walkability, NPCs, chests, shop desks, doors, and stairs transitions.

**Example Response:**
```json
{
  "viewport": {
    "width": 512,
    "height": 480,
    "tile_size": 32
  },
  "camera": {
    "x": 1456.0,
    "y": 1456.0
  },
  "bounds": {
    "min_col": 37,
    "min_row": 37,
    "max_col": 53,
    "max_row": 52,
    "cols": 17,
    "rows": 16
  },
  "hero": {
    "col": 45,
    "row": 45,
    "facing": "down"
  },
  "tiles": [
    {
      "col": 45,
      "row": 45,
      "tile_id": 3,
      "walkable": true,
      "is_hero": true,
      "npc": null,
      "chest": null,
      "shop_desk": null,
      "door": null,
      "stairs": null
    },
    {
      "col": 18,
      "row": 8,
      "tile_id": 1,
      "walkable": false,
      "is_hero": false,
      "npc": {
        "speaker": "Shopkeeper",
        "sprite_id": "sage_alt",
        "facing": "down",
        "shop_id": "bre001",
        "inn_cost": 0,
        "pages": ["Welcome! Enter the shop..."]
      },
      "chest": null,
      "shop_desk": null,
      "door": null,
      "stairs": null
    }
  ]
}
```

### 4. Send Input / Keyboard Event
`POST /input` or `POST /api/v1/input`

**Single Input Payload:**
```json
{
  "action": "move_down",
  "pressed": true
}
```
*Supported Actions:* `move_up`, `move_down`, `move_left`, `move_right`, `ui_accept`, `ui_cancel`, `cmd_menu`.
*Supported Keys:* `z`, `x`, `b`, `up`, `down`, `left`, `right`, `enter`, `space`.

**Batch Actions Payload:**
```json
{
  "actions": [
    { "action": "move_right" },
    { "action": "move_right" },
    { "action": "ui_accept" }
  ]
}
```

### 4. Execute High-Level Command
`POST /command` or `POST /api/v1/command`

**Load Scene:**
```json
{
  "command": "load_scene",
  "args": { "path": "res://scenes/ThroneRoom.tscn" }
}
```

**Trigger Battle Encounter:**
```json
{
  "command": "trigger_encounter",
  "args": { "monster": "slime" }
}
```

**Teleport Hero:**
```json
{
  "command": "teleport",
  "args": { "x": 5, "y": 5 }
}
```

**Open Command Menu / Select Menu Action:**
```json
{
  "command": "select_command",
  "args": { "cmd": "SEARCH" }
}
```

---

## 🧪 Integration Testing & Verification

Run the included python test suite to test all endpoints against a live Godot process:
```bash
python3 tools/test_web_service.py
```
