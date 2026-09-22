class_name InventoryWindow
extends Panel

signal inventory_closed

@onready var btn_close: Button = find_child("BtnClose", true, false)
@onready var hero_name_label: Label = find_child("HeroNameLabel", true, false)
@onready var hero_stats_label: Label = find_child("HeroStatsLabel", true, false)
@onready var hero_portrait: TextureRect = find_child("HeroPortrait", true, false)
@onready var btn_weapon_slot: Button = find_child("BtnWeaponSlot", true, false)
@onready var btn_armor_slot: Button = find_child("BtnArmorSlot", true, false)
@onready var gold_label: Label = find_child("GoldLabel", true, false)
@onready var item_grid: GridContainer = find_child("ItemGrid", true, false)

@onready var details_panel: Panel = find_child("ItemDetailsPanel", true, false)
@onready var selected_item_title: Label = find_child("SelectedItemTitle", true, false)
@onready var selected_item_desc: Label = find_child("SelectedItemDesc", true, false)
@onready var btn_use_item: Button = find_child("BtnUseItem", true, false)
@onready var btn_equip_item: Button = find_child("BtnEquipItem", true, false)
@onready var btn_drop_item: Button = find_child("BtnDropItem", true, false)

var selected_item_id: String = ""
var selected_item_index: int = -1

func _ready() -> void:
	visible = false
	if btn_close:
		btn_close.pressed.connect(close)
	if btn_use_item:
		btn_use_item.pressed.connect(_on_use_clicked)
	if btn_equip_item:
		btn_equip_item.pressed.connect(_on_equip_clicked)
	if btn_drop_item:
		btn_drop_item.pressed.connect(_on_drop_clicked)
	if btn_weapon_slot:
		btn_weapon_slot.pressed.connect(func(): _on_slot_clicked("weapon"))
	if btn_armor_slot:
		btn_armor_slot.pressed.connect(func(): _on_slot_clicked("armor"))
	
	GameState.inventory_changed.connect(refresh)
	GameState.hero_damaged.connect(func(_cur, _max): refresh())

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_I or event.keycode == KEY_B or event.keycode == KEY_ESCAPE:
			if visible:
				close()
				get_viewport().set_input_as_handled()

func toggle() -> void:
	if visible:
		close()
	else:
		open()

func open() -> void:
	visible = true
	var vp_size = get_viewport_rect().size
	position = (vp_size - size) * 0.5
	refresh()
	if AudioManager:
		AudioManager.play_sfx("wood_open")

func close() -> void:
	visible = false
	inventory_closed.emit()

func refresh() -> void:
	if not visible:
		return
	
	# Update Hero Info
	if hero_name_label:
		hero_name_label.text = "%s (%s)" % [GameState.hero_name, GameState.hero_class.capitalize()]
	if hero_stats_label:
		hero_stats_label.text = "Level %d  |  HP: %d/%d  |  AC: %d" % [
			GameState.hero_level, GameState.hero_hp, GameState.hero_max_hp, GameState.hero_ac
		]
	if gold_label:
		gold_label.text = "💰 Gold: %d GP" % GameState.gold
	if hero_portrait:
		var p_path = "res://assets/portraits/portrait_%s.png" % GameState.hero_class.to_lower()
		if ResourceLoader.exists(p_path):
			hero_portrait.texture = load(p_path)

	# Update Equipped Weapon
	var weap_data = GameState.get_item_data(GameState.equipped_weapon)
	if btn_weapon_slot:
		if weap_data:
			btn_weapon_slot.text = "%s (%s)" % [weap_data.title, weap_data.damage_dice]
			if ResourceLoader.exists("res://" + weap_data.icon_path):
				btn_weapon_slot.icon = load("res://" + weap_data.icon_path)
		else:
			btn_weapon_slot.text = "(Unarmed)"
			btn_weapon_slot.icon = null

	# Update Equipped Armor
	var arm_data = GameState.get_item_data(GameState.equipped_armor)
	if btn_armor_slot:
		if arm_data:
			btn_armor_slot.text = "%s (AC: %d)" % [arm_data.title, arm_data.ac_bonus]
			if ResourceLoader.exists("res://" + arm_data.icon_path):
				btn_armor_slot.icon = load("res://" + arm_data.icon_path)
		else:
			btn_armor_slot.text = "(No Armor)"
			btn_armor_slot.icon = null

	# Update Backpack Item Grid (16 slots)
	if item_grid:
		var children = item_grid.get_children()
		for i in range(16):
			var slot_btn: Button
			if i < children.size():
				slot_btn = children[i] as Button
			else:
				slot_btn = Button.new()
				slot_btn.custom_minimum_size = Vector2(85, 46)
				slot_btn.expand_icon = true
				var idx = i
				slot_btn.pressed.connect(func(): select_slot(idx))
				item_grid.add_child(slot_btn)

			if i < GameState.inventory.size():
				var item_id = GameState.inventory[i]
				var item_def = GameState.get_item_data(item_id)
				if item_def:
					slot_btn.text = item_def.title
					slot_btn.tooltip_text = "%s (%s)" % [item_def.title, item_def.category]
					if ResourceLoader.exists("res://" + item_def.icon_path):
						slot_btn.icon = load("res://" + item_def.icon_path)
					else:
						slot_btn.icon = null
				else:
					slot_btn.text = item_id
					slot_btn.icon = null
				slot_btn.disabled = false
			else:
				slot_btn.text = "(Empty)"
				slot_btn.icon = null
				slot_btn.tooltip_text = "Empty Slot"
				slot_btn.disabled = true

	# Refresh selected item view
	if selected_item_id != "" and GameState.inventory.has(selected_item_id):
		show_item_details(selected_item_id)
	elif GameState.inventory.size() > 0:
		select_slot(0)
	else:
		_clear_details()

func select_slot(index: int) -> void:
	if index >= 0 and index < GameState.inventory.size():
		selected_item_index = index
		selected_item_id = GameState.inventory[index]
		show_item_details(selected_item_id)
	else:
		_clear_details()

func show_item_details(item_id: String) -> void:
	var item = GameState.get_item_data(item_id)
	if not item:
		_clear_details()
		return

	if selected_item_title:
		selected_item_title.text = item.title
	if selected_item_desc:
		var desc = "Category: %s  |  Value: %d GP\n" % [item.category.capitalize(), item.cost]
		if item.damage_dice != "":
			desc += "Damage: %s slashing/piercing\n" % item.damage_dice
		if item.ac_bonus > 0:
			desc += "Armor Class Bonus: +%d AC\n" % item.ac_bonus
		if item.category == "consumable":
			desc += "Restores 2d4 + 2 Hit Points on consumption.\n"
		selected_item_desc.text = desc

	if btn_use_item:
		btn_use_item.visible = (item.category == "consumable")
	if btn_equip_item:
		btn_equip_item.visible = (item.category == "weapon" or item.category == "armor")
	if btn_drop_item:
		btn_drop_item.visible = true

func _clear_details() -> void:
	selected_item_id = ""
	selected_item_index = -1
	if selected_item_title: selected_item_title.text = "Select an Item"
	if selected_item_desc: selected_item_desc.text = "Click any item in your backpack to view details and actions."
	if btn_use_item: btn_use_item.visible = false
	if btn_equip_item: btn_equip_item.visible = false
	if btn_drop_item: btn_drop_item.visible = false

func _on_use_clicked() -> void:
	if selected_item_id != "":
		GameState.use_item(selected_item_id)
		refresh()

func _on_equip_clicked() -> void:
	if selected_item_id != "":
		GameState.equip_item(selected_item_id)
		refresh()

func _on_drop_clicked() -> void:
	if selected_item_id != "":
		GameState.remove_item(selected_item_id)
		_clear_details()
		refresh()

func _on_slot_clicked(slot: String) -> void:
	GameState.unequip_item(slot)
	refresh()
