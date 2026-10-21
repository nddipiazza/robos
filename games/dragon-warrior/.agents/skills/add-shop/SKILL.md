---
name: add-shop
description: Instructions for defining shop data in data/v1/shops.json, linking shopkeepers in DungeonMap scenes, and configuring inn pricing.
---

# 🛒 Add a Shop or Inn Skill

Use this skill when configuring weapon/armor shops, key shops, tool shops, or inns in town and dungeon maps.

## 📊 Data Source (`data/v1/shops.json`)

Shops are loaded at runtime by `DungeonMap._load_shops_db()`. Each entry defines inventory and location details:

```json
{
  "id": "bre001",
  "location_id": "brecconary",
  "location_name": "Brecconary",
  "type": "weapon_armor_shop",
  "npc_type": "merchant",
  "npc_facing": "down",
  "inventory": [
    { "item_id": "bamboo_pole", "price": 10 },
    { "item_id": "club", "price": 60 }
  ],
  "map_key": "brecconary-1f",
  "npc_tile": [x, y],
  "desk_tile": [x, y]
}
```

Item IDs reference `data/v1/weapons.json`, `data/v1/armor.json`, `data/v1/shields.json`, or `data/v1/items.json`.

---

## 🛠️ Wiring Shops into DungeonMap Scenes

1. Ensure the shop's `id` is present in `data/v1/shops.json` with a matching `map_key`.
2. In `_get_npcs()`, set `shop_id` on the shopkeeper NPC:
   ```gdscript
   { "tile": Vector2i(x, y), "sprite_id": "merchant", "facing": "down", "shop_id": "bre001" }
   ```
3. `_cmd_talk()` automatically opens `_open_shop(shop_id)` when talking to the merchant, invoking the purchase choice panel and updating hero gold / inventory.
4. For an **Inn**, assign an `inn_cost` key (e.g., `"inn_cost": 6`) instead of `shop_id`. `_cmd_talk()` handles HP/MP restoration and gold deduction via `_open_inn(cost)`.
