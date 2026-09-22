class_name ShopWindow
extends Control

signal shop_closed

@onready var title_label: Label = find_child("TitleLabel", true, false)
@onready var gold_label: Label = find_child("GoldLabel", true, false)
@onready var btn_tab_buy: Button = find_child("BtnTabBuy", true, false)
@onready var btn_tab_sell: Button = find_child("BtnTabSell", true, false)
@onready var items_container: VBoxContainer = find_child("ItemsContainer", true, false)
@onready var btn_close: Button = find_child("BtnClose", true, false)

var current_tab: String = "buy" # "buy" or "sell"
var shop_items: Array[String] = [
	"service-sword", "hunting-bow", "quarterstaff", "dagger", "mace",
	"greatsword", "warhammer", "heavy-crossbow",
	"leather-armor", "chain-mail", "plate-armor", "shield",
	"potion-healing", "potion-antidote", "potion-speed", "torch"
]

func _ready() -> void:
	anchors_preset = Control.PRESET_FULL_RECT
	anchor_right = 1.0
	anchor_bottom = 1.0
	offset_right = 0.0
	offset_bottom = 0.0

	if btn_close:
		btn_close.pressed.connect(close)
	if btn_tab_buy:
		btn_tab_buy.pressed.connect(func(): _switch_tab("buy"))
	if btn_tab_sell:
		btn_tab_sell.pressed.connect(func(): _switch_tab("sell"))

	GameState.gold_changed.connect(_on_gold_changed)
	GameState.inventory_changed.connect(_on_inventory_changed)

	_update_gold_display()

func open(merchant_name: String = "Blacksmith Brand's Armory") -> void:
	if title_label:
		title_label.text = merchant_name
	visible = true
	_update_gold_display()
	_switch_tab("buy")

func close() -> void:
	visible = false
	shop_closed.emit()

func _switch_tab(tab: String) -> void:
	current_tab = tab
	if btn_tab_buy:
		btn_tab_buy.button_pressed = (tab == "buy")
	if btn_tab_sell:
		btn_tab_sell.button_pressed = (tab == "sell")
	_refresh_items_list()

func _on_gold_changed(_cur_gold: int) -> void:
	_update_gold_display()
	if visible:
		_refresh_items_list()

func _on_inventory_changed() -> void:
	if visible and current_tab == "sell":
		_refresh_items_list()

func _update_gold_display() -> void:
	if gold_label:
		gold_label.text = "🪙 Gold: %d GP" % GameState.gold

func _refresh_items_list() -> void:
	if not items_container:
		return

	for child in items_container.get_children():
		child.queue_free()

	if current_tab == "buy":
		_populate_buy_list()
	else:
		_populate_sell_list()

func _populate_buy_list() -> void:
	for item_id in shop_items:
		var item = GameState.get_item_data(item_id)
		if not item:
			continue
		var cost = item.cost if item.cost > 0 else 15
		var can_afford = (GameState.gold >= cost)

		var row = _create_item_row(item, cost, "BUY", can_afford, func():
			GameState.buy_item(item_id)
		)
		items_container.add_child(row)

func _populate_sell_list() -> void:
	var inv_items = GameState.inventory.duplicate()
	if inv_items.is_empty():
		var empty_lbl = Label.new()
		empty_lbl.text = "Your inventory is currently empty."
		empty_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		empty_lbl.add_theme_color_override("font_color", Color(0.6, 0.6, 0.6, 1.0))
		items_container.add_child(empty_lbl)
		return

	for item_id in inv_items:
		var item = GameState.get_item_data(item_id)
		if not item:
			continue
		var full_cost = item.cost if item.cost > 0 else 10
		var sell_price = int(floor(float(full_cost) * 0.5))

		var row = _create_item_row(item, sell_price, "SELL", true, func():
			GameState.sell_item(item_id)
		)
		items_container.add_child(row)

func _create_item_row(item: ItemData, price: int, action_text: String, action_enabled: bool, on_action: Callable) -> PanelContainer:
	var row = PanelContainer.new()
	row.name = "ItemRow_" + item.id
	var sb = StyleBoxFlat.new()
	sb.bg_color = Color(0.14, 0.16, 0.20, 0.85)
	sb.corner_radius_top_left = 4
	sb.corner_radius_top_right = 4
	sb.corner_radius_bottom_left = 4
	sb.corner_radius_bottom_right = 4
	row.add_theme_stylebox_override("panel", sb)

	var comp_tooltip = item.description + "
"
	if item.category == "weapon":
		var eq_weap = GameState.get_item_data(GameState.equipped_weapon)
		if eq_weap:
			comp_tooltip += "
[EQUIPMENT COMPARISON]
Equipped: %s (%s %s)
Store Item: %s (%s %s)" % [
				eq_weap.title, eq_weap.damage_dice, eq_weap.damage_type,
				item.title, item.damage_dice, item.damage_type
			]
	elif item.category == "armor":
		var cur_ac = GameState.hero_ac
		var new_ac = item.ac_bonus if item.ac_bonus > 0 else 12
		comp_tooltip += "
[EQUIPMENT COMPARISON]
Current AC: %d
Store Item AC: %d (Delta: %+d AC)" % [
			cur_ac, new_ac, (new_ac - cur_ac)
		]
	row.tooltip_text = comp_tooltip

	var hbox = HBoxContainer.new()
	hbox.add_theme_constant_override("separation", 10)
	row.add_child(hbox)

	# Icon
	var icon_rect = TextureRect.new()
	icon_rect.custom_minimum_size = Vector2(32, 32)
	icon_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	icon_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	var icon_p = item.icon
	if ResourceLoader.exists(icon_p):
		icon_rect.texture = load(icon_p)
	hbox.add_child(icon_rect)

	# Description VBox
	var desc_vbox = VBoxContainer.new()
	desc_vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL

	var title_lbl = Label.new()
	title_lbl.text = item.title
	title_lbl.add_theme_font_size_override("font_size", 13)
	title_lbl.add_theme_color_override("font_color", Color(1.0, 0.95, 0.8, 1.0))
	desc_vbox.add_child(title_lbl)

	var stat_lbl = Label.new()
	var stat_str = item.category.capitalize()
	if item.damage_dice != "":
		stat_str += " | Dmg: " + item.damage_dice + " " + item.damage_type
	if item.ac_bonus > 0:
		stat_str += " | AC: +" + str(item.ac_bonus)
	stat_lbl.text = stat_str
	stat_lbl.add_theme_font_size_override("font_size", 11)
	stat_lbl.add_theme_color_override("font_color", Color(0.65, 0.7, 0.75, 1.0))
	desc_vbox.add_child(stat_lbl)
	hbox.add_child(desc_vbox)

	# Price
	var price_lbl = Label.new()
	price_lbl.custom_minimum_size = Vector2(80, 0)
	price_lbl.text = "🪙 %d GP" % price
	price_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	price_lbl.add_theme_font_size_override("font_size", 12)
	price_lbl.add_theme_color_override("font_color", Color(1.0, 0.85, 0.3, 1.0))
	hbox.add_child(price_lbl)

	# Action Button
	var btn = Button.new()
	btn.name = "BtnAction_" + item.id
	btn.custom_minimum_size = Vector2(75, 30)
	btn.text = action_text
	btn.disabled = not action_enabled
	btn.add_theme_font_size_override("font_size", 11)
	btn.pressed.connect(on_action)
	hbox.add_child(btn)

	return row
