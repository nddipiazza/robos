class_name QuestLore
## Quest text the player needs to finish the game, read from data/v1/dialogue.json.

const TABLET_ID := "erdricks_tablet"

## Erdrick's message carved on the tablet: where the three relics are and where to take them.
static func tablet_pages() -> Array:
	var f := FileAccess.open("res://data/v1/dialogue.json", FileAccess.READ)
	if f:
		var d: Variant = JSON.parse_string(f.get_as_text())
		if d is Dictionary:
			var pages: Variant = d.get("erdricks-cave-b2", {}).get("npcs", {}).get(TABLET_ID, [])
			if pages is Array and not pages.is_empty():
				return pages.duplicate()
	return ["The words on the tablet\nare too worn to read."]


static func is_tablet(item: Variant) -> bool:
	return item is Dictionary and str(item.get("id", "")) == TABLET_ID
