# RobOS Tabletop RPG: TabletopWorld
# Dual-Role Cartridge Game Player for HeroQuest: Player Mode & DunMaster Mode
extends Node2D

const GRID_COLS = 26
const GRID_ROWS = 19
const TILE_SIZE = 46.0
const BOARD_OFFSET = Vector2(50.0, 70.0)

var current_role: String = "player" # "player" or "gm" / "gamemaster" / "dm" / "dunmaster"
var current_round: int = 1
var active_hero_idx: int = 0
var active_monster_idx: int = 0
var current_phase: String = "hero_phase" # "hero_phase" or "gm_phase"
var movement_remaining: int = 0
var movement_rolled: bool = false
var has_acted_this_turn: bool = false
var has_moved_this_turn: bool = false
var moved_before_action: bool = false
var movement_closed: bool = false
var movement_start_pos: Vector2i = Vector2i(-1, -1)
var movement_trail: Array[Vector2i] = []
var turn_state: String = "awaiting_roll" # "awaiting_roll", "moving", "action_taken", "turn_complete"
var combat_log: Array[String] = []

func is_gm_role() -> bool:
	return current_role == "gm" or current_role == "gamemaster" or current_role == "dm" or current_role == "dunmaster"

var heroes: Array[Dictionary] = []
var monsters: Array[Dictionary] = []
var doors: Array[Dictionary] = []
var door_closed_tex: Texture2D = null
var door_open_tex: Texture2D = null
var hero_token_textures: Dictionary = {}
var monster_token_textures: Dictionary = {}
var furniture: Array[Dictionary] = []
var wall_blocks: Array[Dictionary] = []
var traps: Array[Dictionary] = []
var rooms: Array[Dictionary] = []
var revealed_rooms: Array[String] = []
var explored_tiles: Dictionary = {}
var discovered_monster_ids: Dictionary = {}
var _tile_to_room: Dictionary = {}
var _tile_to_room_id: Dictionary = {}
var _rooms_by_id: Dictionary = {}
var _blocked_wall_tiles: Dictionary = {}
var _doors_by_edge: Dictionary = {}
var grid_cols: int = GRID_COLS
var grid_rows: int = GRID_ROWS
var starting_stair: Vector2i = Vector2i(1, 1)
var tile_size: float = TILE_SIZE
var board_offset: Vector2 = BOARD_OFFSET

var active_vfx: Array[Dictionary] = []
var floating_texts: Array[Dictionary] = []
var active_dice_animation: Dictionary = {}
var last_spell_result: Dictionary = {}
var last_combat_result: Dictionary = {}

func _update_board_metrics() -> void:
	if board_sprite and board_sprite.texture:
		var tex_size = board_sprite.texture.get_size()
		# Maximize board in the viewport area left of the sidebar (x: 14 to 1400, y: 16 to 1064)
		var avail_w = 1386.0
		var avail_h = 1048.0
		var fit_scale = min(avail_w / max(1.0, tex_size.x), avail_h / max(1.0, tex_size.y))
		board_sprite.scale = Vector2(fit_scale, fit_scale)
		board_sprite.position = Vector2(14.0 + avail_w * 0.5, 16.0 + avail_h * 0.5)

		var scaled_w = tex_size.x * board_sprite.scale.x
		var scaled_h = tex_size.y * board_sprite.scale.y
		board_offset = board_sprite.position - Vector2(scaled_w * 0.5, scaled_h * 0.5)
		tile_size = scaled_w / float(maxi(1, grid_cols))

func queue_redraw_all() -> void:
	_update_board_metrics()
	if has_node("BoardOverlay"):
		$BoardOverlay.queue_redraw()

var auto_play_timer: float = 0.0
var auto_play_step: int = 0

@onready var board_sprite: Sprite2D = $BoardSprite
@onready var title_label: Label = get_node_or_null("UI/SidebarHeader/TitleLabel")
@onready var role_badge: Button = get_node_or_null("UI/SidebarHeader/BtnToggleRole")
@onready var log_label: RichTextLabel = $UI/LogPanel/LogLabel
@onready var hero_card: Label = $UI/StatsPanel/HeroLabel
@onready var hero_cards_grid: GridContainer = get_node_or_null("UI/StatsPanel/HeroCardsGrid")
@onready var enemies_panel: Panel = get_node_or_null("UI/EnemiesPanel")
@onready var enemies_header_label: Label = get_node_or_null("UI/EnemiesPanel/HeaderLabel")
@onready var btn_toggle_defeated: Button = get_node_or_null("UI/EnemiesPanel/BtnToggleDefeated")
@onready var enemies_empty_label: Label = get_node_or_null("UI/EnemiesPanel/EmptyLabel")
@onready var enemies_scroll: ScrollContainer = get_node_or_null("UI/EnemiesPanel/ScrollContainer")
@onready var enemy_cards_grid: GridContainer = get_node_or_null("UI/EnemiesPanel/ScrollContainer/EnemyCardsGrid")
@onready var dice_label: Label = $UI/DicePanel/DiceLabel

var show_defeated_monsters: bool = false

func _find_action_button(btn_name: String) -> Button:
	for p in [
		"UI/ActionsBar/HotbarHBox/ActionsScroll/Actions/" + btn_name,
		"UI/ActionsPanel/ActionsScroll/Actions/" + btn_name,
		"UI/ActionsScroll/Actions/" + btn_name,
		"UI/Actions/" + btn_name
	]:
		var n = get_node_or_null(p)
		if n:
			return n as Button
	return null

@onready var actions_bar: PanelContainer = get_node_or_null("UI/ActionsBar")
@onready var actions_scroll: ScrollContainer = get_node_or_null("UI/ActionsBar/HotbarHBox/ActionsScroll")
@onready var actions_container: HBoxContainer = get_node_or_null("UI/ActionsBar/HotbarHBox/ActionsScroll/Actions")
@onready var btn_scroll_left: Button = get_node_or_null("UI/ActionsBar/HotbarHBox/BtnScrollLeft")
@onready var btn_scroll_right: Button = get_node_or_null("UI/ActionsBar/HotbarHBox/BtnScrollRight")

@onready var btn_roll: Button = _find_action_button("BtnRoll")
@onready var btn_attack: Button = _find_action_button("BtnAttack")
@onready var btn_cast_spell: Button = _find_action_button("BtnCastSpell")
@onready var btn_use_item: Button = _find_action_button("BtnUseItem")
@onready var btn_search: Button = _find_action_button("BtnSearch")
@onready var btn_end_turn: Button = _find_action_button("BtnEndTurn")
@onready var btn_summon: Button = _find_action_button("BtnSummon")
@onready var btn_ai_step: Button = _find_action_button("BtnAIStep")

@onready var ai_confirm_modal: ColorRect = $UI/AIConfirmModal
@onready var ai_modal_card: PanelContainer = $UI/AIConfirmModal/Card
@onready var ai_modal_step_badge: Label = $UI/AIConfirmModal/Card/Margin/VBox/Header/StepBadge
@onready var ai_modal_cmd_banner: PanelContainer = $UI/AIConfirmModal/Card/Margin/VBox/CommandBanner
@onready var ai_modal_cmd_text: Label = $UI/AIConfirmModal/Card/Margin/VBox/CommandBanner/CommandMargin/CommandText
@onready var ai_modal_action_title: Label = $UI/AIConfirmModal/Card/Margin/VBox/ActionTitle
@onready var ai_modal_action_desc: Label = $UI/AIConfirmModal/Card/Margin/VBox/ActionDescription
@onready var ai_modal_details_panel: PanelContainer = $UI/AIConfirmModal/Card/Margin/VBox/DetailsPanel
@onready var ai_modal_details_text: Label = $UI/AIConfirmModal/Card/Margin/VBox/DetailsPanel/DetailsMargin/DetailsText
@onready var btn_ai_confirm: Button = $UI/AIConfirmModal/Card/Margin/VBox/ButtonBox/BtnConfirm
@onready var btn_ai_cancel: Button = $UI/AIConfirmModal/Card/Margin/VBox/ButtonBox/BtnCancel

var turn_overlay_btn: Button = null
var flashy_number_panel: PanelContainer = null
var flashy_number_label: Label = null
var flashy_subtitle_label: Label = null
var flashy_number_time: float = 0.0
var flashy_number_duration: float = 2.4
var flashy_number_val: int = 0
var turn_overlay_mode: String = "none" # "roll_prompt", "turn_complete", "none"

@onready var elf_spell_modal: ColorRect = get_node_or_null("UI/ElfSpellSelectModal")
@onready var elf_spell_card: PanelContainer = get_node_or_null("UI/ElfSpellSelectModal/Card")
@onready var elf_spell_decks_grid: GridContainer = get_node_or_null("UI/ElfSpellSelectModal/Card/Margin/VBox/DecksGrid")
@onready var elf_spell_summary_banner: PanelContainer = get_node_or_null("UI/ElfSpellSelectModal/Card/Margin/VBox/SummaryBanner")
@onready var elf_spell_summary_text: Label = get_node_or_null("UI/ElfSpellSelectModal/Card/Margin/VBox/SummaryBanner/SummaryMargin/SummaryText")
@onready var btn_elf_spell_close: Button = get_node_or_null("UI/ElfSpellSelectModal/Card/Margin/VBox/ButtonBox/BtnClose")
@onready var btn_elf_spell_confirm: Button = get_node_or_null("UI/ElfSpellSelectModal/Card/Margin/VBox/ButtonBox/BtnConfirm")

@onready var spell_cast_modal: ColorRect = get_node_or_null("UI/SpellCastModal")
@onready var spell_cast_title: Label = get_node_or_null("UI/SpellCastModal/Card/Margin/VBox/Header/Title")
@onready var spell_cast_badge: Label = get_node_or_null("UI/SpellCastModal/Card/Margin/VBox/Header/ActionBadge")
@onready var spell_cast_grid: GridContainer = get_node_or_null("UI/SpellCastModal/Card/Margin/VBox/ScrollContainer/SpellsGrid")
@onready var btn_spell_cast_close: Button = get_node_or_null("UI/SpellCastModal/Card/Margin/VBox/ButtonBox/BtnClose")

@onready var item_use_modal: ColorRect = get_node_or_null("UI/ItemUseModal")
@onready var item_use_title: Label = get_node_or_null("UI/ItemUseModal/Card/Margin/VBox/Header/Title")
@onready var item_use_grid: GridContainer = get_node_or_null("UI/ItemUseModal/Card/Margin/VBox/ScrollContainer/ItemsGrid")
@onready var btn_item_use_close: Button = get_node_or_null("UI/ItemUseModal/Card/Margin/VBox/ButtonBox/BtnClose")

@onready var btn_search_traps: Button = _find_action_button("BtnSearchTraps")
@onready var btn_disarm_trap: Button = _find_action_button("BtnDisarmTrap")

@onready var disarm_trap_modal: ColorRect = get_node_or_null("UI/DisarmTrapModal")
@onready var disarm_trap_title: Label = get_node_or_null("UI/DisarmTrapModal/Card/Margin/VBox/Header/Title")
@onready var disarm_trap_badge: Label = get_node_or_null("UI/DisarmTrapModal/Card/Margin/VBox/Header/Badge")
@onready var disarm_trap_grid: GridContainer = get_node_or_null("UI/DisarmTrapModal/Card/Margin/VBox/ScrollContainer/TrapsGrid")
@onready var btn_disarm_trap_close: Button = get_node_or_null("UI/DisarmTrapModal/Card/Margin/VBox/ButtonBox/BtnClose")

const ELEMENTAL_DECKS: Dictionary = {
	"water": ["water_of_healing", "sleep", "veil_of_mist"],
	"earth": ["heal_body", "pass_through_rock", "rock_skin"],
	"fire": ["ball_of_flame", "fire_of_wrath", "courage"],
	"air": ["genie", "swift_wind", "tempest"]
}

const ELEMENTAL_DECK_INFO: Dictionary = {
	"water": {
		"name": "Water Magic",
		"icon": "",
		"role": "Restoration & Stealth",
		"color": Color(0.02, 0.71, 0.83, 1.0),
		"spells": [
			{"name": "Water of Healing", "desc": "Restore up to 4 lost BP"},
			{"name": "Sleep", "desc": "Put monster into magical slumber"},
			{"name": "Veil of Mist", "desc": "Move unseen past monsters"}
		]
	},
	"earth": {
		"name": "Earth Magic",
		"icon": "",
		"role": "Defense & Healing",
		"color": Color(0.13, 0.77, 0.36, 1.0),
		"spells": [
			{"name": "Heal Body", "desc": "Restore up to 4 lost BP"},
			{"name": "Pass Through Rock", "desc": "Move through solid stone walls"},
			{"name": "Rock Skin", "desc": "+1 extra Combat Defend Die"}
		]
	},
	"fire": {
		"name": "Fire Magic",
		"icon": "",
		"role": "Direct Damage & Buffs",
		"color": Color(0.98, 0.45, 0.08, 1.0),
		"spells": [
			{"name": "Ball of Flame", "desc": "Deal 2 BP damage (roll 2 def)"},
			{"name": "Fire of Wrath", "desc": "Deal 1 BP damage (roll 1 def)"},
			{"name": "Courage", "desc": "+2 extra Combat Attack Dice"}
		]
	},
	"air": {
		"name": "Air Magic",
		"icon": "",
		"role": "Speed & Summons",
		"color": Color(0.22, 0.74, 0.97, 1.0),
		"spells": [
			{"name": "Genie", "desc": "Attack with 5 dice or open any door"},
			{"name": "Swift Wind", "desc": "Roll double movement dice (4d6)"},
			{"name": "Tempest", "desc": "Trap a monster in whirlwind"}
		]
	}
}

var current_elf_element: String = "water"

var is_ai_step_pending: bool = false
var pending_ai_command: Dictionary = {}

func _ready() -> void:
	print("[TabletopWorld] Initializing HeroQuest Cartridge Player...")
	_check_cli_role()
	_update_board_metrics()
	_load_active_cartridge()
	CartridgeManager.cartridge_inserted.connect(_on_cartridge_inserted)
	_setup_action_hotbar()
	_setup_enemies_panel()
	_setup_ui_signals()
	_setup_ai_modal_styles()
	_setup_elf_spell_modal()
	_setup_turn_overlay_ui()
	_load_door_textures()
	_load_hero_token_textures()
	_load_monster_token_textures()
	_update_ui()
	_log("=== Welcome to HeroQuest: The Trial ===")
	if is_gm_role():
		_log("[GM] [Game Master / DunMaster Mode Active] You are Zargon, Master of Darkness. Full dungeon visibility granted.")
	else:
		_log("[PLAYER] [Player Mode Active] You lead the four heroes into the catacombs of Verag!")
		_check_start_elf_spell_selection()

var action_icons: Dictionary = {}
var default_guidance_text: String = ""

func _load_action_icons() -> void:
	var icon_map = {
		"move": "res://assets/icons/action_move.png",
		"attack": "res://assets/icons/action_attack.png",
		"door": "res://assets/icons/action_door.png",
		"spell": "res://assets/icons/action_spell.png",
		"item": "res://assets/icons/action_item.png",
		"search": "res://assets/icons/action_search.png",
		"traps": "res://assets/icons/action_traps.png",
		"disarm": "res://assets/icons/action_disarm.png",
		"summon": "res://assets/icons/action_summon.png",
		"ai_step": "res://assets/icons/action_ai_step.png",
		"end_turn": "res://assets/icons/action_end_turn.png",
	}
	for k in icon_map:
		if not action_icons.has(k) or action_icons[k] == null:
			var tex = _load_texture_safe(icon_map[k])
			if tex:
				action_icons[k] = tex

func _setup_action_hotbar() -> void:
	_load_action_icons()
	if actions_bar:
		var bar_sb = StyleBoxFlat.new()
		bar_sb.bg_color = Color("#0b0f16")
		bar_sb.set_border_width_all(1)
		bar_sb.border_color = Color("#1e293b")
		bar_sb.set_corner_radius_all(6)
		bar_sb.content_margin_left = 3
		bar_sb.content_margin_right = 3
		bar_sb.content_margin_top = 3
		bar_sb.content_margin_bottom = 3
		actions_bar.add_theme_stylebox_override("panel", bar_sb)

	if actions_scroll:
		if not actions_scroll.gui_input.is_connected(_on_actions_scroll_gui_input):
			actions_scroll.gui_input.connect(_on_actions_scroll_gui_input)

	if btn_scroll_left:
		_setup_scroll_arrow_style(btn_scroll_left)
		if not btn_scroll_left.pressed.is_connected(_on_scroll_left_pressed):
			btn_scroll_left.pressed.connect(_on_scroll_left_pressed)

	if btn_scroll_right:
		_setup_scroll_arrow_style(btn_scroll_right)
		if not btn_scroll_right.pressed.is_connected(_on_scroll_right_pressed):
			btn_scroll_right.pressed.connect(_on_scroll_right_pressed)

	var btns = [
		btn_roll, btn_attack, btn_cast_spell, btn_use_item, btn_search,
		btn_search_traps, btn_disarm_trap, btn_summon, btn_ai_step, btn_end_turn
	]
	for b in btns:
		if b:
			_setup_action_button_style(b)

func _setup_scroll_arrow_style(btn: Button) -> void:
	btn.add_theme_font_size_override("font_size", 12)
	btn.add_theme_color_override("font_color", Color(0, 0.89, 1.0, 0.9))
	var sb = StyleBoxFlat.new()
	sb.bg_color = Color("#111722")
	sb.set_border_width_all(1)
	sb.border_color = Color("#1f2c3d")
	sb.set_corner_radius_all(4)
	btn.add_theme_stylebox_override("normal", sb)

	var sb_hov = StyleBoxFlat.new()
	sb_hov.bg_color = Color("#182333")
	sb_hov.set_border_width_all(1)
	sb_hov.border_color = Color("#00e5ff")
	sb_hov.set_corner_radius_all(4)
	btn.add_theme_stylebox_override("hover", sb_hov)

func _setup_action_button_style(btn: Button) -> void:
	if not btn:
		return
	btn.custom_minimum_size = Vector2(40, 40)
	btn.expand_icon = true
	btn.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
	btn.vertical_icon_alignment = VERTICAL_ALIGNMENT_CENTER

	# Transparent font color so underlying .text is kept for API/tests but does not overlap icon
	btn.add_theme_color_override("font_color", Color(1, 1, 1, 0))
	btn.add_theme_color_override("font_hover_color", Color(1, 1, 1, 0))
	btn.add_theme_color_override("font_pressed_color", Color(1, 1, 1, 0))
	btn.add_theme_color_override("font_disabled_color", Color(1, 1, 1, 0))
	btn.add_theme_color_override("font_focus_color", Color(1, 1, 1, 0))
	btn.add_theme_font_size_override("font_size", 1)

	var sb_normal = StyleBoxFlat.new()
	sb_normal.bg_color = Color("#131924")
	sb_normal.set_border_width_all(1)
	sb_normal.border_color = Color("#2a374a")
	sb_normal.set_corner_radius_all(6)

	var sb_hover = StyleBoxFlat.new()
	sb_hover.bg_color = Color("#1c2637")
	sb_hover.set_border_width_all(2)
	sb_hover.border_color = Color("#00e5ff")
	sb_hover.set_corner_radius_all(6)
	sb_hover.shadow_color = Color(0, 0.9, 1.0, 0.3)
	sb_hover.shadow_size = 3

	var sb_pressed = StyleBoxFlat.new()
	sb_pressed.bg_color = Color("#0d121b")
	sb_pressed.set_border_width_all(2)
	sb_pressed.border_color = Color("#ffc107")
	sb_pressed.set_corner_radius_all(6)

	var sb_disabled = StyleBoxFlat.new()
	sb_disabled.bg_color = Color("#0e1219")
	sb_disabled.set_border_width_all(1)
	sb_disabled.border_color = Color("#1a2230")
	sb_disabled.set_corner_radius_all(6)

	btn.add_theme_stylebox_override("normal", sb_normal)
	btn.add_theme_stylebox_override("hover", sb_hover)
	btn.add_theme_stylebox_override("pressed", sb_pressed)
	btn.add_theme_stylebox_override("disabled", sb_disabled)
	btn.add_theme_stylebox_override("focus", StyleBoxEmpty.new())

	# Create corner BadgeLabel if missing
	var badge = btn.get_node_or_null("Badge") as Label
	if not badge:
		badge = Label.new()
		badge.name = "Badge"
		badge.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
		badge.offset_left = -18
		badge.offset_top = -16
		badge.offset_right = -1
		badge.offset_bottom = -1
		badge.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		badge.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		badge.add_theme_font_size_override("font_size", 10)
		badge.add_theme_color_override("font_color", Color(1, 1, 1, 1))
		badge.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var b_sb = StyleBoxFlat.new()
		b_sb.bg_color = Color(0.88, 0.15, 0.28, 0.92)
		b_sb.set_corner_radius_all(4)
		badge.add_theme_stylebox_override("panel", b_sb)
		badge.visible = false
		btn.add_child(badge)

func _update_action_tile(btn: Button, icon_key: String, count: int, title: String, desc: String, badge_color: Color = Color(0.88, 0.15, 0.28, 0.92)) -> void:
	if not btn:
		return
	if action_icons.has(icon_key):
		btn.icon = action_icons[icon_key]

	var badge = btn.get_node_or_null("Badge") as Label
	if badge:
		if count > 0:
			badge.text = str(count)
			badge.visible = true
			var b_sb = badge.get_theme_stylebox("panel") as StyleBoxFlat
			if b_sb:
				b_sb.bg_color = badge_color
		else:
			badge.visible = false

	btn.tooltip_text = "%s\n%s" % [title, desc]
	btn.set_meta("action_title", title)
	btn.set_meta("action_desc", desc)

	if not btn.mouse_entered.is_connected(_on_action_button_hovered.bind(btn)):
		btn.mouse_entered.connect(_on_action_button_hovered.bind(btn))
	if not btn.mouse_exited.is_connected(_on_action_button_unhovered.bind(btn)):
		btn.mouse_exited.connect(_on_action_button_unhovered.bind(btn))

func _on_action_button_hovered(btn: Button) -> void:
	if not btn or not dice_label:
		return
	var title = btn.get_meta("action_title", "")
	var desc = btn.get_meta("action_desc", "")
	if title != "":
		dice_label.text = "[ %s ]  %s" % [title, desc]

func _on_action_button_unhovered(btn: Button) -> void:
	if dice_label and default_guidance_text != "":
		dice_label.text = default_guidance_text

func _on_scroll_left_pressed() -> void:
	if actions_scroll:
		actions_scroll.scroll_horizontal = max(0, actions_scroll.scroll_horizontal - 60)
		_update_scroll_buttons_visibility()

func _on_scroll_right_pressed() -> void:
	if actions_scroll:
		actions_scroll.scroll_horizontal += 60
		_update_scroll_buttons_visibility()

func _on_actions_scroll_gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			if actions_scroll:
				actions_scroll.scroll_horizontal += 48
				_update_scroll_buttons_visibility()
				get_viewport().set_input_as_handled()
		elif event.button_index == MOUSE_BUTTON_WHEEL_UP:
			if actions_scroll:
				actions_scroll.scroll_horizontal = max(0, actions_scroll.scroll_horizontal - 48)
				_update_scroll_buttons_visibility()
				get_viewport().set_input_as_handled()

func _update_scroll_buttons_visibility() -> void:
	if not actions_scroll or not actions_container:
		return
	var content_w = actions_container.size.x
	var view_w = actions_scroll.size.x
	var has_overflow = content_w > view_w + 4.0
	if btn_scroll_left:
		btn_scroll_left.visible = has_overflow and actions_scroll.scroll_horizontal > 4
	if btn_scroll_right:
		btn_scroll_right.visible = has_overflow and (actions_scroll.scroll_horizontal < (content_w - view_w - 4.0))

func _setup_enemies_panel() -> void:
	if not btn_toggle_defeated:
		btn_toggle_defeated = get_node_or_null("UI/EnemiesPanel/BtnToggleDefeated")
	if not enemies_scroll:
		enemies_scroll = get_node_or_null("UI/EnemiesPanel/ScrollContainer")
	if not enemy_cards_grid:
		enemy_cards_grid = get_node_or_null("UI/EnemiesPanel/ScrollContainer/EnemyCardsGrid")

	if btn_toggle_defeated:
		if not btn_toggle_defeated.pressed.is_connected(_on_btn_toggle_defeated_pressed):
			btn_toggle_defeated.pressed.connect(_on_btn_toggle_defeated_pressed)
		_setup_toggle_defeated_button_style(btn_toggle_defeated)

	if enemies_scroll:
		enemies_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
		enemies_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
		if not enemies_scroll.gui_input.is_connected(_on_enemies_scroll_gui_input):
			enemies_scroll.gui_input.connect(_on_enemies_scroll_gui_input)
		_setup_enemies_scrollbar_style()

func _setup_toggle_defeated_button_style(btn: Button) -> void:
	btn.focus_mode = Control.FOCUS_NONE
	btn.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	btn.add_theme_font_size_override("font_size", 11)
	_update_toggle_defeated_button_style()

func _update_toggle_defeated_button_style() -> void:
	if not btn_toggle_defeated:
		return
	
	var sb_normal = StyleBoxFlat.new()
	var sb_hover = StyleBoxFlat.new()
	var sb_pressed = StyleBoxFlat.new()
	var sb_disabled = StyleBoxFlat.new()
	
	for sb in [sb_normal, sb_hover, sb_pressed, sb_disabled]:
		sb.set_corner_radius_all(5)
		sb.set_border_width_all(1)
		sb.content_margin_left = 6
		sb.content_margin_right = 6
		sb.content_margin_top = 2
		sb.content_margin_bottom = 2

	if show_defeated_monsters:
		# Active / showing defeated (crimson/amber combat theme)
		sb_normal.bg_color = Color(0.24, 0.08, 0.10, 0.95)
		sb_normal.border_color = Color(0.85, 0.30, 0.30, 0.9)
		sb_hover.bg_color = Color(0.32, 0.10, 0.12, 1.0)
		sb_hover.border_color = Color(1.0, 0.45, 0.45, 1.0)
		sb_pressed.bg_color = Color(0.18, 0.05, 0.07, 1.0)
		sb_pressed.border_color = Color(1.0, 0.6, 0.6, 1.0)
		btn_toggle_defeated.add_theme_color_override("font_color", Color(1.0, 0.85, 0.85))
		btn_toggle_defeated.add_theme_color_override("font_hover_color", Color(1.0, 1.0, 1.0))
		btn_toggle_defeated.tooltip_text = "Fallen monsters are currently visible. Click to hide defeated foes."
	else:
		# Inactive / hidden defeated (subtle slate/cyan theme)
		sb_normal.bg_color = Color(0.09, 0.12, 0.18, 0.9)
		sb_normal.border_color = Color(0.25, 0.35, 0.48, 0.75)
		sb_hover.bg_color = Color(0.13, 0.18, 0.26, 1.0)
		sb_hover.border_color = Color(0.0, 0.74, 0.83, 0.9)
		sb_pressed.bg_color = Color(0.07, 0.10, 0.15, 1.0)
		sb_pressed.border_color = Color(1.0, 0.82, 0.2, 1.0)
		btn_toggle_defeated.add_theme_color_override("font_color", Color(0.75, 0.82, 0.92))
		btn_toggle_defeated.add_theme_color_override("font_hover_color", Color(0.95, 0.98, 1.0))
		btn_toggle_defeated.tooltip_text = "Click to show defeated monsters in the Discovered Foes list."

	sb_disabled.bg_color = Color(0.08, 0.10, 0.14, 0.5)
	sb_disabled.border_color = Color(0.2, 0.25, 0.32, 0.4)

	btn_toggle_defeated.add_theme_stylebox_override("normal", sb_normal)
	btn_toggle_defeated.add_theme_stylebox_override("hover", sb_hover)
	btn_toggle_defeated.add_theme_stylebox_override("pressed", sb_pressed)
	btn_toggle_defeated.add_theme_stylebox_override("disabled", sb_disabled)

func _setup_enemies_scrollbar_style() -> void:
	if not enemies_scroll:
		return
	var vsb = enemies_scroll.get_v_scroll_bar()
	if not vsb:
		return
	vsb.custom_minimum_size.x = 8
	
	var track_sb = StyleBoxFlat.new()
	track_sb.bg_color = Color(0.06, 0.08, 0.12, 0.85)
	track_sb.set_corner_radius_all(4)
	vsb.add_theme_stylebox_override("scroll", track_sb)
	
	var grab_sb = StyleBoxFlat.new()
	grab_sb.bg_color = Color(0.0, 0.74, 0.83, 0.6)
	grab_sb.set_corner_radius_all(4)
	vsb.add_theme_stylebox_override("grabber", grab_sb)
	
	var grab_hl = StyleBoxFlat.new()
	grab_hl.bg_color = Color(0.2, 0.85, 0.95, 0.9)
	grab_hl.set_corner_radius_all(4)
	vsb.add_theme_stylebox_override("grabber_highlight", grab_hl)
	
	var grab_pr = StyleBoxFlat.new()
	grab_pr.bg_color = Color(1.0, 0.82, 0.2, 0.95)
	grab_pr.set_corner_radius_all(4)
	vsb.add_theme_stylebox_override("grabber_pressed", grab_pr)

func _on_enemies_scroll_gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			enemies_scroll.scroll_vertical = max(0, enemies_scroll.scroll_vertical - 48)
			get_viewport().set_input_as_handled()
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			var max_v = int(enemies_scroll.get_v_scroll_bar().max_value)
			enemies_scroll.scroll_vertical = min(max_v, enemies_scroll.scroll_vertical + 48)
			get_viewport().set_input_as_handled()

func toggle_show_defeated_monsters() -> void:
	show_defeated_monsters = !show_defeated_monsters
	_update_character_and_enemy_cards()

func set_show_defeated_monsters(val: bool) -> void:
	if show_defeated_monsters != val:
		show_defeated_monsters = val
		_update_character_and_enemy_cards()

func _on_btn_toggle_defeated_pressed() -> void:
	toggle_show_defeated_monsters()

func _load_door_textures() -> void:
	if not door_closed_tex:
		door_closed_tex = _load_texture_safe("res://assets/doors/door_closed.png")
	if not door_open_tex:
		door_open_tex = _load_texture_safe("res://assets/doors/door_open.png")

func _load_hero_token_textures() -> void:
	var token_map = {
		"barbarian": "res://assets/tokens/token_barbarian.png",
		"dwarf": "res://assets/tokens/token_dwarf.png",
		"elf": "res://assets/tokens/token_elf.png",
		"wizard": "res://assets/tokens/token_wizard.png"
	}
	for k in token_map:
		if not hero_token_textures.has(k) or hero_token_textures[k] == null:
			var tex = _load_texture_safe(token_map[k])
			if tex:
				hero_token_textures[k] = tex

func get_hero_token_path(h: Dictionary) -> String:
	var custom_asset = str(h.get("tokenAsset", h.get("token_asset", "")))
	if custom_asset != "":
		return custom_asset

	var h_id = str(h.get("id", "")).to_lower()
	var h_cls = str(h.get("heroClass", h.get("hero_class", ""))).to_lower()
	var h_name = str(h.get("name", "")).to_lower()
	var char_name = str(h.get("characterName", h.get("character_name", ""))).to_lower()

	var key = "barbarian"
	if "barbarian" in h_id or "barbarian" in h_cls or "barbarian" in h_name or "berserker" in h_cls:
		key = "barbarian"
	elif "dwarf" in h_id or "dwarf" in h_cls or "dwarf" in h_name or "dorgan" in char_name:
		key = "dwarf"
	elif "elf" in h_id or "elf" in h_cls or "elf" in h_name or "ladril" in char_name or "ranger" in h_cls:
		key = "elf"
	elif "wizard" in h_id or "wizard" in h_cls or "wizard" in h_name or "telor" in char_name or "mage" in h_cls:
		key = "wizard"

	return "res://assets/tokens/token_%s.png" % key

func get_hero_token_texture(h: Dictionary) -> Texture2D:
	var custom_asset = str(h.get("tokenAsset", h.get("token_asset", "")))
	if custom_asset != "":
		if not hero_token_textures.has(custom_asset):
			hero_token_textures[custom_asset] = _load_texture_safe(custom_asset)
		if hero_token_textures.get(custom_asset) != null:
			return hero_token_textures[custom_asset]

	var h_id = str(h.get("id", "")).to_lower()
	var h_cls = str(h.get("heroClass", h.get("hero_class", ""))).to_lower()
	var h_name = str(h.get("name", "")).to_lower()
	var char_name = str(h.get("characterName", h.get("character_name", ""))).to_lower()

	var key = "barbarian"
	if "barbarian" in h_id or "barbarian" in h_cls or "barbarian" in h_name or "berserker" in h_cls:
		key = "barbarian"
	elif "dwarf" in h_id or "dwarf" in h_cls or "dwarf" in h_name or "dorgan" in char_name:
		key = "dwarf"
	elif "elf" in h_id or "elf" in h_cls or "elf" in h_name or "ladril" in char_name or "ranger" in h_cls:
		key = "elf"
	elif "wizard" in h_id or "wizard" in h_cls or "wizard" in h_name or "telor" in char_name or "mage" in h_cls:
		key = "wizard"

	if hero_token_textures.has(key) and hero_token_textures[key] != null:
		return hero_token_textures[key]

	var candidates = [
		"res://assets/tokens/token_%s.png" % key,
		"res://../crpg-realm/assets/tokens/token_%s.png" % key
	]
	if key == "elf":
		candidates.append("res://assets/tokens/token_elora_ranger.png")
		candidates.append("res://../crpg-realm/assets/tokens/token_elora_ranger.png")
	elif key == "dwarf":
		candidates.append("res://assets/tokens/token_cleric.png")
		candidates.append("res://../crpg-realm/assets/tokens/token_cleric.png")

	for p in candidates:
		var tex = _load_texture_safe(p)
		if tex:
			hero_token_textures[key] = tex
			return tex

	return null

func _load_monster_token_textures() -> void:
	var token_map = {
		"goblin": "res://assets/tokens/token_goblin.png",
		"orc": "res://assets/tokens/token_orc.png",
		"skeleton": "res://assets/tokens/token_skeleton.png",
		"zombie": "res://assets/tokens/token_zombie.png",
		"mummy": "res://assets/tokens/token_mummy.png",
		"fimir": "res://assets/tokens/token_fimir.png",
		"chaos_warrior": "res://assets/tokens/token_chaos_warrior.png",
		"gargoyle": "res://assets/tokens/token_gargoyle.png",
		"verag": "res://assets/tokens/token_verag.png"
	}
	for k in token_map:
		if not monster_token_textures.has(k) or monster_token_textures[k] == null:
			var tex = _load_texture_safe(token_map[k])
			if tex:
				monster_token_textures[k] = tex

func get_monster_token_key(m: Dictionary) -> String:
	var m_id = str(m.get("id", "")).to_lower()
	var m_slug = str(m.get("slug", "")).to_lower()
	var m_name = str(m.get("name", "")).to_lower()
	var m_type = str(m.get("type", m.get("monster", ""))).to_lower()

	# Check boss / warlord first
	if "verag" in m_id or "verag" in m_slug or "verag" in m_name or "warlord" in m_name or "ulag" in m_id or "ulag" in m_slug:
		return "verag"
	if "chaos" in m_id or "chaos" in m_slug or "chaos" in m_name or "dread" in m_name:
		return "chaos_warrior"
	if "gargoyle" in m_id or "gargoyle" in m_slug or "gargoyle" in m_name:
		return "gargoyle"
	if "mummy" in m_id or "mummy" in m_slug or "mummy" in m_name:
		return "mummy"
	if "fimir" in m_id or "fimir" in m_slug or "fimir" in m_name or "abomination" in m_name:
		return "fimir"
	if "zombie" in m_id or "zombie" in m_slug or "zombie" in m_name:
		return "zombie"
	if "skeleton" in m_id or "skeleton" in m_slug or "skeleton" in m_name or "skel" in m_id or "skel" in m_slug:
		return "skeleton"
	if "goblin" in m_id or "goblin" in m_slug or "goblin" in m_name:
		return "goblin"
	if "orc" in m_id or "orc" in m_slug or "orc" in m_name:
		return "orc"
	return ""

func get_monster_token_path(m: Dictionary) -> String:
	var custom_asset = str(m.get("tokenAsset", m.get("token_asset", "")))
	if custom_asset != "":
		return custom_asset
	var key = get_monster_token_key(m)
	if key != "":
		return "res://assets/tokens/token_%s.png" % key
	return ""

func get_monster_token_texture(m: Dictionary) -> Texture2D:
	var custom_asset = str(m.get("tokenAsset", m.get("token_asset", "")))
	if custom_asset != "":
		if not monster_token_textures.has(custom_asset):
			monster_token_textures[custom_asset] = _load_texture_safe(custom_asset)
		if monster_token_textures.get(custom_asset) != null:
			return monster_token_textures[custom_asset]

	var key = get_monster_token_key(m)
	if key != "":
		if monster_token_textures.has(key) and monster_token_textures[key] != null:
			return monster_token_textures[key]

		var candidates = [
			"res://assets/tokens/token_%s.png" % key,
			"res://../crpg-realm/assets/tokens/token_%s.png" % key
		]
		for p in candidates:
			var tex = _load_texture_safe(p)
			if tex:
				monster_token_textures[key] = tex
				return tex

	return null

func _load_texture_safe(res_path: String) -> Texture2D:
	if ResourceLoader.exists(res_path):
		var res = ResourceLoader.load(res_path)
		if res is Texture2D:
			return res
	var global_path = ProjectSettings.globalize_path(res_path)
	if FileAccess.file_exists(global_path):
		var img = Image.load_from_file(global_path)
		if img and not img.is_empty():
			return ImageTexture.create_from_image(img)
	if FileAccess.file_exists(res_path):
		var img = Image.load_from_file(res_path)
		if img and not img.is_empty():
			return ImageTexture.create_from_image(img)
	return null

func _check_cli_role() -> void:
	var cmd_args = OS.get_cmdline_user_args() + OS.get_cmdline_args()
	var role_env = OS.get_environment("TABLETOP_ROLE").to_lower()
	if role_env != "":
		current_role = role_env

	for i in range(cmd_args.size()):
		var a = cmd_args[i]
		if a == "--role" and i + 1 < cmd_args.size():
			current_role = cmd_args[i + 1].to_lower()
		elif a.begins_with("--role="):
			current_role = a.split("=")[1].to_lower()
		elif a == "--dm" or a == "--dunmaster" or a == "--gm" or a == "--gamemaster":
			current_role = "gm"
		elif a == "--player":
			current_role = "player"

func _setup_ui_signals() -> void:
	if role_badge and not role_badge.pressed.is_connected(toggle_role):
		role_badge.pressed.connect(toggle_role)
	if btn_roll and not btn_roll.pressed.is_connected(roll_movement_dice):
		btn_roll.pressed.connect(roll_movement_dice)
	if btn_attack and not btn_attack.pressed.is_connected(_on_attack_pressed):
		btn_attack.pressed.connect(_on_attack_pressed)
	if btn_cast_spell and not btn_cast_spell.pressed.is_connected(toggle_spell_cast_modal):
		btn_cast_spell.pressed.connect(toggle_spell_cast_modal)
	if btn_use_item and not btn_use_item.pressed.is_connected(toggle_item_use_modal):
		btn_use_item.pressed.connect(toggle_item_use_modal)
	if btn_search and not btn_search.pressed.is_connected(search_room):
		btn_search.pressed.connect(search_room)
	if btn_end_turn and not btn_end_turn.pressed.is_connected(end_turn):
		btn_end_turn.pressed.connect(end_turn)
	if btn_summon and not btn_summon.pressed.is_connected(summon_wandering_monster):
		btn_summon.pressed.connect(summon_wandering_monster)
	if btn_ai_step and not btn_ai_step.pressed.is_connected(propose_ai_step):
		btn_ai_step.pressed.connect(propose_ai_step)
	if btn_ai_confirm and not btn_ai_confirm.pressed.is_connected(confirm_and_execute_ai_step):
		btn_ai_confirm.pressed.connect(confirm_and_execute_ai_step)
	if btn_ai_cancel and not btn_ai_cancel.pressed.is_connected(cancel_ai_step):
		btn_ai_cancel.pressed.connect(cancel_ai_step)
	if btn_spell_cast_close and not btn_spell_cast_close.pressed.is_connected(close_spell_cast_modal):
		btn_spell_cast_close.pressed.connect(close_spell_cast_modal)
	if btn_item_use_close and not btn_item_use_close.pressed.is_connected(close_item_use_modal):
		btn_item_use_close.pressed.connect(close_item_use_modal)
	if btn_search_traps and not btn_search_traps.pressed.is_connected(search_traps):
		btn_search_traps.pressed.connect(search_traps)
	if btn_disarm_trap and not btn_disarm_trap.pressed.is_connected(_on_disarm_trap_button_pressed):
		btn_disarm_trap.pressed.connect(_on_disarm_trap_button_pressed)
	if btn_disarm_trap_close and not btn_disarm_trap_close.pressed.is_connected(close_disarm_modal):
		btn_disarm_trap_close.pressed.connect(close_disarm_modal)

func toggle_role() -> void:
	if current_role == "player":
		current_role = "gm"
		_log("[GM] Switched to Game Master Mode! You command Morcar's minions and see all hidden rooms.")
	else:
		current_role = "player"
		_log("[PLAYER] Switched to Player Mode! You control the hero party.")
		update_party_vision()
	_update_ui()
	queue_redraw_all()

func _on_attack_pressed() -> void:
	if btn_attack and ("Open Door" in btn_attack.text or "Open Secret Door" in btn_attack.text):
		var adj_d = get_adjacent_closed_doors()
		if adj_d.size() > 0:
			var d = adj_d[0]
			var from_pos = Vector2i(d.get("from", [0, 0])[0], d.get("from", [0, 0])[1])
			var to_pos = Vector2i(d.get("to", [0, 0])[0], d.get("to", [0, 0])[1])
			open_door(from_pos, to_pos)
			return

	if is_gm_role() or current_phase == "dm_phase" or current_phase == "gm_phase":
		dm_attack_hero()
	else:
		attack_adjacent_monster()

func _on_cartridge_inserted(_cart: Dictionary) -> void:
	_load_active_cartridge()

func _load_active_cartridge() -> void:
	var cart = CartridgeManager.active_cartridge
	if cart.size() == 0:
		return

	var starting_map_id = cart.get("header", {}).get("startingMap", "heroquest-the-trial")
	var map_data = cart.get("maps", {}).get(starting_map_id, {})
	if map_data.is_empty() and cart.get("maps", {}).size() > 0:
		map_data = cart.get("maps", {}).values()[0]

	grid_cols = map_data.get("width", GRID_COLS)
	grid_rows = map_data.get("height", GRID_ROWS)

	var bg_img = map_data.get("backgroundImage", "")
	if bg_img != "" and ResourceLoader.exists(bg_img):
		board_sprite.texture = load(bg_img)

	var stair = map_data.get("startingStair", [0, 1])
	starting_stair = Vector2i(stair[0], stair[1])

	var cart_heroes = cart.get("heroes", {})
	heroes.clear()
	var h_idx = 0
	for h_id in cart_heroes:
		var h = cart_heroes[h_id].duplicate(true)
		h["current_bp"] = h.get("bodyPoints", 8)
		h["current_mp"] = h.get("mindPoints", 2)
		h["gold"] = 0
		h["characterName"] = h.get("characterName", "")
		h["character_name"] = h.get("characterName", "")
		h["heroClass"] = h.get("heroClass", "")
		h["hero_class"] = h.get("heroClass", "")

		# Standard HeroQuest Loadouts
		match str(h.get("id")):
			"barbarian":
				h["equipped_weapon"] = "broadsword"
				h["equipped_armor"] = []
				h["inventory"] = ["broadsword", "healing_potion"]
				h["spells"] = []
			"dwarf":
				h["equipped_weapon"] = "shortsword"
				h["equipped_armor"] = []
				h["inventory"] = ["shortsword", "healing_potion"]
				h["spells"] = []
			"elf":
				h["equipped_weapon"] = "shortsword"
				h["equipped_armor"] = []
				h["inventory"] = ["shortsword", "healing_potion"]
				h["spells"] = _extract_cartridge_spells(h, "elf", cart)
			"wizard":
				h["equipped_weapon"] = "dagger"
				h["equipped_armor"] = []
				h["inventory"] = ["dagger", "staff", "healing_potion"]
				h["spells"] = _extract_cartridge_spells(h, "wizard", cart)
			_:
				h["equipped_weapon"] = "broadsword"
				h["equipped_armor"] = []
				h["inventory"] = ["broadsword", "healing_potion"]
				h["spells"] = []

		h["courage_active"] = false
		h["rock_skin_active"] = false
		h["pass_through_rock_active"] = false
		h["veil_of_mist_active"] = false
		h["swift_wind_active"] = false

		if h_idx == 0:
			# The active starting hero begins on the board at the spiral staircase
			h["is_on_board"] = true
			h["grid_pos"] = starting_stair
		else:
			# Other heroes remain OFF the board until their first turn arrives
			h["is_on_board"] = false
			h["grid_pos"] = Vector2i(-1, -1)
		heroes.append(h)
		h_idx += 1

	var cart_monsters = cart.get("monsters", {})
	monsters.clear()
	for m_id in cart_monsters:
		var m = cart_monsters[m_id].duplicate(true)
		m["current_bp"] = m.get("bodyPoints", 1)
		var pos = m.get("position", [12, 9])
		m["grid_pos"] = Vector2i(pos[0], pos[1])
		m["is_alive"] = true
		m["is_sleeping"] = false
		m["tempest_stunned"] = false
		monsters.append(m)

	rooms.clear()
	for r in map_data.get("rooms", []):
		rooms.append(r.duplicate(true))

	doors.clear()
	for d in map_data.get("doors", []):
		var door_entry = d.duplicate(true)
		door_entry["is_open"] = bool(d.get("is_open", false) or d.get("state", "closed") == "open")
		door_entry["is_secret"] = bool(d.get("is_secret", false))
		door_entry["is_revealed"] = bool(d.get("is_revealed", not door_entry["is_secret"]))
		doors.append(door_entry)

	furniture.clear()
	for f in map_data.get("furniture", []):
		furniture.append(f.duplicate(true))

	wall_blocks.clear()
	for wb in map_data.get("wallBlocks", []):
		wall_blocks.append(wb.duplicate(true))

	traps.clear()
	for tr in map_data.get("traps", []):
		traps.append(tr.duplicate(true))

	_rebuild_spatial_caches()

	# Fog of War: initially, cast ray vision from hero starting stairwell
	revealed_rooms.clear()
	explored_tiles.clear()
	discovered_monster_ids.clear()
	if is_gm_role():
		for m in monsters:
			discovered_monster_ids[str(m.get("id"))] = true

	current_role = "player"
	active_hero_idx = 0
	current_round = 1
	current_phase = "hero_phase"
	movement_remaining = 0
	movement_rolled = false
	has_acted_this_turn = false
	has_moved_this_turn = false
	moved_before_action = false
	movement_closed = false
	movement_start_pos = Vector2i(-1, -1)
	movement_trail.clear()
	turn_state = "awaiting_roll"

	update_party_vision()
	_update_ui()
	queue_redraw_all()

func _rebuild_spatial_caches() -> void:
	_tile_to_room.clear()
	_tile_to_room_id.clear()
	_rooms_by_id.clear()
	for r in rooms:
		var r_id = str(r.get("id", ""))
		if r_id != "":
			_rooms_by_id[r_id] = r
		var rx = int(r.get("x", 0))
		var ry = int(r.get("y", 0))
		var rw = int(r.get("w", 1))
		var rh = int(r.get("h", 1))
		for x in range(rx, rx + rw):
			for y in range(ry, ry + rh):
				var pos = Vector2i(x, y)
				_tile_to_room[pos] = r
				_tile_to_room_id[pos] = r_id

	_blocked_wall_tiles.clear()
	for wb in wall_blocks:
		var px = int(wb.get("x", wb.get("position", [0, 0])[0]))
		var py = int(wb.get("y", wb.get("position", [0, 0])[1]))
		var w = int(wb.get("width", 1))
		var h = int(wb.get("height", 1))
		var b_type = str(wb.get("type", "1-tile-wall"))
		if b_type == "2-tile-wall-h" or b_type == "double-h":
			w = 2; h = 1
		elif b_type == "2-tile-wall-v" or b_type == "double-v":
			w = 1; h = 2
		for bx in range(px, px + w):
			for by in range(py, py + h):
				_blocked_wall_tiles[Vector2i(bx, by)] = true

	_doors_by_edge.clear()
	for d in doors:
		var f = d.get("from", [0, 0])
		var t = d.get("to", [0, 0])
		_doors_by_edge[Vector4i(f[0], f[1], t[0], t[1])] = d
		_doors_by_edge[Vector4i(t[0], t[1], f[0], f[1])] = d

	show_defeated_monsters = false
	if enemies_scroll:
		enemies_scroll.scroll_vertical = 0

func is_tile_wall_blocked(tile: Vector2i) -> bool:
	return _blocked_wall_tiles.has(tile)

func is_border_tile(tile: Vector2i) -> bool:
	return tile.x <= 0 or tile.x >= grid_cols - 1 or tile.y <= 0 or tile.y >= grid_rows - 1

# --- HeroQuest Miniature Occupancy Rules ---
func _to_grid_pos(val: Variant) -> Vector2i:
	if val is Vector2i:
		return val
	elif val is Vector2:
		return Vector2i(int(val.x), int(val.y))
	elif val is Array and val.size() >= 2:
		return Vector2i(int(val[0]), int(val[1]))
	return Vector2i(-1, -1)

func get_hero_at(tile: Vector2i) -> Dictionary:
	for h in heroes:
		if h.get("is_on_board", false) and int(h.get("current_bp", 0)) > 0 and _to_grid_pos(h.get("grid_pos")) == tile:
			return h
	return {}

func get_monster_at(tile: Vector2i) -> Dictionary:
	for m in monsters:
		if m.get("is_alive", false) and _to_grid_pos(m.get("grid_pos")) == tile:
			return m
	return {}

func is_tile_occupied_by_hero(tile: Vector2i, exclude_hero_idx: int = -1) -> bool:
	for i in range(heroes.size()):
		if i == exclude_hero_idx:
			continue
		var h = heroes[i]
		if h.get("is_on_board", false) and int(h.get("current_bp", 0)) > 0 and _to_grid_pos(h.get("grid_pos")) == tile:
			return true
	return false

func is_tile_occupied_by_monster(tile: Vector2i, exclude_monster_id: String = "") -> bool:
	for m in monsters:
		if exclude_monster_id != "" and (str(m.get("id")) == exclude_monster_id or str(m.get("slug")) == exclude_monster_id):
			continue
		if m.get("is_alive", false) and _to_grid_pos(m.get("grid_pos")) == tile:
			return true
	return false

func is_tile_occupied(tile: Vector2i, exclude_hero_idx: int = -1, exclude_monster_id: String = "") -> bool:
	return is_tile_occupied_by_hero(tile, exclude_hero_idx) or is_tile_occupied_by_monster(tile, exclude_monster_id)

func _get_door_between(a: Vector2i, b: Vector2i) -> Dictionary:
	return _doors_by_edge.get(Vector4i(a.x, a.y, b.x, b.y), {})

func has_wall_between(a: Vector2i, b: Vector2i) -> bool:
	# 1. Out of bounds check
	if a.x < 0 or a.x >= grid_cols or a.y < 0 or a.y >= grid_rows:
		return true
	if b.x < 0 or b.x >= grid_cols or b.y < 0 or b.y >= grid_rows:
		return true

	# 2. Check doors
	var d = _get_door_between(a, b)
	if d.size() > 0:
		# Undiscovered secret door behaves as a solid wall
		if d.get("is_secret", false) and not d.get("is_revealed", false):
			return true
		# If door is open, line of sight passes through
		# If door is closed, line of sight is blocked
		return not d.get("is_open", false)

	# 3. Check room boundaries
	var ra_id = _tile_to_room_id.get(a, "")
	var rb_id = _tile_to_room_id.get(b, "")

	# If crossing between a room and a corridor, or between two different rooms:
	if ra_id != rb_id:
		return true

	return false

func is_tile_solid(tile: Vector2i) -> bool:
	if tile.x < 0 or tile.x >= grid_cols or tile.y < 0 or tile.y >= grid_rows:
		return true
	if _blocked_wall_tiles.has(tile):
		return true
	var rm_id = _tile_to_room_id.get(tile, "")
	if rm_id != "" and not revealed_rooms.has(rm_id):
		return true
	return false

func has_line_of_sight(from_pos: Vector2i, to_pos: Vector2i) -> bool:
	if from_pos == to_pos:
		return true

	# Target or source inside an unrevealed room is always occluded
	if is_tile_solid(to_pos) or is_tile_solid(from_pos):
		return false

	# 1. Fast Cardinal Check (Straight orthogonal corridor sightlines)
	if from_pos.x == to_pos.x:
		var step = 1 if to_pos.y > from_pos.y else -1
		var y = from_pos.y
		while y != to_pos.y:
			var next_y = y + step
			var cur = Vector2i(from_pos.x, y)
			var nxt = Vector2i(from_pos.x, next_y)
			if has_wall_between(cur, nxt):
				return false
			if nxt != to_pos and is_tile_solid(nxt):
				return false
			y = next_y
		return true

	if from_pos.y == to_pos.y:
		var step = 1 if to_pos.x > from_pos.x else -1
		var x = from_pos.x
		while x != to_pos.x:
			var next_x = x + step
			var cur = Vector2i(x, from_pos.y)
			var nxt = Vector2i(next_x, from_pos.y)
			if has_wall_between(cur, nxt):
				return false
			if nxt != to_pos and is_tile_solid(nxt):
				return false
			x = next_x
		return true

	# 2. Angled Beam Check (prevents corner-cutting and leaking into parallel corridors)
	var p0 = Vector2(float(from_pos.x) + 0.5, float(from_pos.y) + 0.5)
	var p1 = Vector2(float(to_pos.x) + 0.5, float(to_pos.y) + 0.5)
	var delta = p1 - p0
	var dist = delta.length()
	var steps = int(dist * 4.0) + 1
	var beam_radius: float = 0.15
	var prev_tile = from_pos

	for i in range(1, steps):
		var t = float(i) / float(steps)
		var c = p0 + delta * t
		var ix = int(floor(c.x))
		var iy = int(floor(c.y))
		var cur_tile = Vector2i(ix, iy)

		if cur_tile != prev_tile:
			if has_wall_between(prev_tile, cur_tile):
				return false
			if cur_tile != to_pos and is_tile_solid(cur_tile):
				return false
			prev_tile = cur_tile

		# Check solid collision within beam thickness only near tile edges
		var fx = c.x - float(ix)
		var fy = c.y - float(iy)
		if fx < beam_radius or fx > (1.0 - beam_radius) or fy < beam_radius or fy > (1.0 - beam_radius):
			for ox in [-beam_radius, beam_radius]:
				for oy in [-beam_radius, beam_radius]:
					var chk_tile = Vector2i(int(floor(c.x + ox)), int(floor(c.y + oy)))
					if chk_tile != from_pos and chk_tile != to_pos and chk_tile != cur_tile:
						if is_tile_solid(chk_tile):
							return false

	return true

func update_party_vision() -> void:
	if is_gm_role():
		return

	var vision_sources: Array[Vector2i] = []
	for h in heroes:
		if h.get("is_on_board", false) and h.get("current_bp", 1) > 0:
			vision_sources.append(h.get("grid_pos", starting_stair))

	if vision_sources.is_empty():
		vision_sources.append(starting_stair)

	explored_tiles[starting_stair] = true

	# Ensure all tiles in revealed rooms are permanently explored
	for r_id in revealed_rooms:
		var rm = _get_room_by_id(r_id)
		if rm.size() > 0:
			var rx = int(rm.get("x", 0))
			var ry = int(rm.get("y", 0))
			var rw = int(rm.get("w", 1))
			var rh = int(rm.get("h", 1))
			for x in range(rx, rx + rw):
				for y in range(ry, ry + rh):
					explored_tiles[Vector2i(x, y)] = true

	# Cast rays from all living heroes to find all visible corridor and revealed room tiles
	for c in range(grid_cols):
		for r in range(grid_rows):
			var tile = Vector2i(c, r)
			if explored_tiles.has(tile) or _blocked_wall_tiles.has(tile):
				continue

			var r_id = _tile_to_room_id.get(tile, "")
			# Unrevealed room tiles can never be seen by rays
			if r_id != "" and not revealed_rooms.has(r_id):
				continue

			for src in vision_sources:
				if has_line_of_sight(src, tile):
					explored_tiles[tile] = true
					break

	# Check for any monsters newly brought into line of sight
	for m in monsters:
		if is_monster_currently_visible(m):
			discovered_monster_ids[str(m.get("id"))] = true

func is_monster_currently_visible(m: Dictionary) -> bool:
	if is_gm_role():
		return true

	var r_id = str(m.get("roomId", ""))
	var pos = m.get("grid_pos", Vector2i(-1, -1))
	var rm = _get_room_at(pos)
	var effective_room = r_id if r_id != "" else str(rm.get("id", ""))
	if effective_room != "":
		return revealed_rooms.has(effective_room)

	# Corridor monster: must have line of sight from at least one living hero on the board
	for h in heroes:
		if h.get("is_on_board", false) and int(h.get("current_bp", 1)) > 0:
			var h_pos = h.get("grid_pos", Vector2i(-1, -1))
			if has_line_of_sight(h_pos, pos):
				return true

	return false

func reveal_room_by_id(r_id: String) -> void:
	if r_id == "" or revealed_rooms.has(r_id):
		return
	revealed_rooms.append(r_id)
	var room_obj = _get_room_by_id(r_id)
	var room_name = room_obj.get("name", r_id)
	_log("[DOOR] Door kicked open! Revealed chamber: %s!" % room_name)

	# Reveal all tiles of this room immediately
	var rx = int(room_obj.get("x", 0))
	var ry = int(room_obj.get("y", 0))
	var rw = int(room_obj.get("w", 1))
	var rh = int(room_obj.get("h", 1))
	for x in range(rx, rx + rw):
		for y in range(ry, ry + rh):
			explored_tiles[Vector2i(x, y)] = true

	# Discover and log any monsters residing in this newly revealed chamber
	var found_m: Array[String] = []
	for m in monsters:
		var pos = m.get("grid_pos", Vector2i(0, 0))
		var rm = _get_room_at(pos)
		var m_room = str(m.get("roomId", ""))
		var eff_room = m_room if m_room != "" else str(rm.get("id", ""))
		if eff_room == r_id:
			discovered_monster_ids[str(m.get("id"))] = true
			if m.get("is_alive", false):
				found_m.append(str(m.get("name", "Monster")))
	if found_m.size() > 0:
		_log("[DANGER] Spotted inside: %s!" % ", ".join(found_m))
	else:
		_log("[CALM] The chamber appears calm... for now.")

func _is_inside_any_room(tile: Vector2i) -> bool:
	return _tile_to_room.has(tile)

func _get_room_at(tile: Vector2i) -> Dictionary:
	return _tile_to_room.get(tile, {})

func _get_room_by_id(r_id: String) -> Dictionary:
	return _rooms_by_id.get(r_id, {})

func _process(delta: float) -> void:
	if CartridgeManager.auto_play_enabled:
		auto_play_timer += delta
		if auto_play_timer >= 1.2:
			auto_play_timer = 0.0
			_execute_auto_play_step()

	var needs_redraw = false
	if active_vfx.size() > 0:
		var remaining_vfx: Array[Dictionary] = []
		for vfx in active_vfx:
			vfx["time"] = float(vfx.get("time", 0.0)) + delta
			if vfx["time"] < float(vfx.get("duration", 0.5)):
				remaining_vfx.append(vfx)
			else:
				var on_comp = str(vfx.get("on_complete", ""))
				if on_comp == "fire_burst":
					spawn_burst_vfx(vfx.get("to", Vector2.ZERO), Color(0.95, 0.4, 0.1), 48.0, 0.4)
				elif on_comp == "genie_burst":
					spawn_burst_vfx(vfx.get("to", Vector2.ZERO), Color(0.1, 0.7, 0.9), 60.0, 0.5)
		active_vfx = remaining_vfx
		needs_redraw = true

	if floating_texts.size() > 0:
		var remaining_texts: Array[Dictionary] = []
		for ft in floating_texts:
			ft["time"] = float(ft.get("time", 0.0)) + delta
			var dur = float(ft.get("duration", 1.0))
			if ft["time"] < dur:
				var vel = ft.get("vel", Vector2(0, -35))
				ft["pos"] = ft.get("pos", Vector2.ZERO) + vel * delta
				ft["alpha"] = clampf(1.0 - (ft["time"] / dur), 0.0, 1.0)
				remaining_texts.append(ft)
		floating_texts = remaining_texts
		needs_redraw = true

	if not active_dice_animation.is_empty():
		var t = float(active_dice_animation.get("time", 0.0)) + delta
		active_dice_animation["time"] = t
		var roll_dur = float(active_dice_animation.get("roll_duration", 0.8))
		var tot_dur = float(active_dice_animation.get("total_duration", 2.2))
		
		if t >= tot_dur:
			active_dice_animation = {}
		else:
			var progress = clampf(t / roll_dur, 0.0, 1.0)
			var is_settled = (progress >= 1.0)
			active_dice_animation["settled"] = is_settled
			
			for die in active_dice_animation.get("dice", []):
				if not is_settled:
					# Rolling & tumbling phase
					var p_ease = ease(progress, -2.0)
					var t_pos = die.get("target_pos", Vector2.ZERO)
					var i_pos = die.get("init_pos", t_pos)
					die["pos"] = i_pos.lerp(t_pos, p_ease)
					var bounces = float(die.get("bounces", 2.5))
					var max_z = float(die.get("z", 40.0))
					var bounce_h = maxf(0.0, sin(progress * PI * bounces) * max_z * (1.0 - progress))
					die["current_z"] = bounce_h
					var spin = float(die.get("spin_speed", 10.0))
					die["angle"] = spin * (1.0 - progress) * (1.0 - progress)
					if fmod(t, 0.06) < delta * 1.5:
						if die.get("type") == "movement_red":
							die["current_face"] = randi_range(1, 6)
						else:
							die["current_face"] = ["skull", "white_shield", "black_shield"][randi() % 3]
				else:
					die["settled"] = true
					die["pos"] = die.get("target_pos", Vector2.ZERO)
					die["current_z"] = 0.0
					die["angle"] = 0.0
					if die.get("type") == "movement_red":
						die["current_face"] = die.get("final_value", 1)
					else:
						die["current_face"] = die.get("final_face", "skull")
		needs_redraw = true

	if flashy_number_panel and flashy_number_panel.visible:
		flashy_number_time += delta
		if flashy_number_time >= flashy_number_duration:
			flashy_number_panel.visible = false
		else:
			var pop_prog = clampf(flashy_number_time / 0.22, 0.0, 1.0)
			var s = lerpf(1.35, 1.0, ease(pop_prog, -2.5))
			flashy_number_panel.scale = Vector2(s, s)
			if flashy_number_time <= 0.9:
				flashy_number_panel.modulate.a = 1.0
			else:
				var fade_prog = (flashy_number_time - 0.9) / (flashy_number_duration - 0.9)
				flashy_number_panel.modulate.a = clampf(1.0 - fade_prog, 0.0, 1.0)

	if needs_redraw:
		queue_redraw_all()

func _setup_ai_modal_styles() -> void:
	if not ai_modal_card:
		return
	var card_sb = StyleBoxFlat.new()
	card_sb.bg_color = Color(0.09, 0.12, 0.17, 0.98)
	card_sb.set_corner_radius_all(12)
	card_sb.border_width_left = 2
	card_sb.border_width_top = 2
	card_sb.border_width_right = 2
	card_sb.border_width_bottom = 2
	card_sb.border_color = Color(0.0, 0.74, 0.83, 0.8)
	card_sb.shadow_color = Color(0, 0, 0, 0.75)
	card_sb.shadow_size = 20
	ai_modal_card.add_theme_stylebox_override("panel", card_sb)

	if ai_modal_cmd_banner:
		var cmd_sb = StyleBoxFlat.new()
		cmd_sb.bg_color = Color(0.05, 0.07, 0.11, 1.0)
		cmd_sb.set_corner_radius_all(6)
		cmd_sb.border_width_left = 4
		cmd_sb.border_color = Color(0.0, 0.74, 0.83, 0.9)
		ai_modal_cmd_banner.add_theme_stylebox_override("panel", cmd_sb)

	if ai_modal_details_panel:
		var det_sb = StyleBoxFlat.new()
		det_sb.bg_color = Color(0.06, 0.08, 0.12, 0.9)
		det_sb.set_corner_radius_all(6)
		det_sb.border_width_left = 1
		det_sb.border_width_top = 1
		det_sb.border_width_right = 1
		det_sb.border_width_bottom = 1
		det_sb.border_color = Color(0.25, 0.3, 0.4, 0.6)
		ai_modal_details_panel.add_theme_stylebox_override("panel", det_sb)

	if btn_ai_confirm:
		var conf_sb = StyleBoxFlat.new()
		conf_sb.bg_color = Color(0.06, 0.45, 0.28, 1.0)
		conf_sb.set_corner_radius_all(6)
		conf_sb.border_width_left = 1
		conf_sb.border_width_top = 1
		conf_sb.border_width_right = 1
		conf_sb.border_width_bottom = 1
		conf_sb.border_color = Color(0.1, 0.7, 0.4, 1.0)
		btn_ai_confirm.add_theme_stylebox_override("normal", conf_sb)

	if btn_ai_cancel:
		var canc_sb = StyleBoxFlat.new()
		canc_sb.bg_color = Color(0.18, 0.22, 0.28, 1.0)
		canc_sb.set_corner_radius_all(6)
		canc_sb.border_width_left = 1
		canc_sb.border_width_top = 1
		canc_sb.border_width_right = 1
		canc_sb.border_width_bottom = 1
		canc_sb.border_color = Color(0.35, 0.4, 0.48, 0.8)
		btn_ai_cancel.add_theme_stylebox_override("normal", canc_sb)

func is_headless_mode() -> bool:
	if DisplayServer.get_name() == "headless":
		return true
	var cmd_args = OS.get_cmdline_user_args() + OS.get_cmdline_args()
	for a in cmd_args:
		if a == "--headless" or a == "--no-spell-select" or a == "--skip-spell-select":
			return true
	return OS.get_environment("TABLETOP_NO_SPELL_SELECT") == "1"

func _check_start_elf_spell_selection() -> void:
	if current_role != "player":
		return
	if is_headless_mode() or CartridgeManager.auto_play_enabled:
		return
	var cart = CartridgeManager.active_cartridge
	var alloc = cart.get("spellAllocation", {})
	if alloc.get("confirmed", false):
		return
	show_elf_spell_selection_modal()

func _setup_elf_spell_modal() -> void:
	if not elf_spell_card:
		return
	var card_sb = StyleBoxFlat.new()
	card_sb.bg_color = Color(0.09, 0.12, 0.17, 0.98)
	card_sb.set_corner_radius_all(12)
	card_sb.border_width_left = 2
	card_sb.border_width_top = 2
	card_sb.border_width_right = 2
	card_sb.border_width_bottom = 2
	card_sb.border_color = Color(0.0, 0.74, 0.83, 0.8)
	card_sb.shadow_color = Color(0, 0, 0, 0.75)
	card_sb.shadow_size = 20
	elf_spell_card.add_theme_stylebox_override("panel", card_sb)

	if elf_spell_summary_banner:
		var sum_sb = StyleBoxFlat.new()
		sum_sb.bg_color = Color(0.05, 0.07, 0.11, 1.0)
		sum_sb.set_corner_radius_all(6)
		sum_sb.border_width_left = 4
		sum_sb.border_color = Color(0.0, 0.74, 0.83, 0.9)
		elf_spell_summary_banner.add_theme_stylebox_override("panel", sum_sb)

	if btn_elf_spell_confirm:
		var conf_sb = StyleBoxFlat.new()
		conf_sb.bg_color = Color(0.06, 0.45, 0.28, 1.0)
		conf_sb.set_corner_radius_all(6)
		conf_sb.border_width_left = 1
		conf_sb.border_width_top = 1
		conf_sb.border_width_right = 1
		conf_sb.border_width_bottom = 1
		conf_sb.border_color = Color(0.1, 0.7, 0.4, 1.0)
		btn_elf_spell_confirm.add_theme_stylebox_override("normal", conf_sb)
		if not btn_elf_spell_confirm.pressed.is_connected(_on_confirm_spell_modal_pressed):
			btn_elf_spell_confirm.pressed.connect(_on_confirm_spell_modal_pressed)

	if btn_elf_spell_close:
		var canc_sb = StyleBoxFlat.new()
		canc_sb.bg_color = Color(0.18, 0.22, 0.28, 1.0)
		canc_sb.set_corner_radius_all(6)
		canc_sb.border_width_left = 1
		canc_sb.border_width_top = 1
		canc_sb.border_width_right = 1
		canc_sb.border_width_bottom = 1
		canc_sb.border_color = Color(0.35, 0.4, 0.48, 0.8)
		btn_elf_spell_close.add_theme_stylebox_override("normal", canc_sb)
		if not btn_elf_spell_close.pressed.is_connected(_on_close_spell_modal_pressed):
			btn_elf_spell_close.pressed.connect(_on_close_spell_modal_pressed)

	_populate_elf_spell_decks()
	_update_elf_spell_modal_ui()

func _populate_elf_spell_decks() -> void:
	if not elf_spell_decks_grid:
		return
	for c in elf_spell_decks_grid.get_children():
		elf_spell_decks_grid.remove_child(c)
		c.queue_free()

	for elem_key in ["water", "earth", "fire", "air"]:
		var info = ELEMENTAL_DECK_INFO.get(elem_key, {})
		var card = PanelContainer.new()
		card.name = "DeckCard_" + elem_key
		card.custom_minimum_size = Vector2(400, 160)
		card.size_flags_horizontal = Control.SIZE_EXPAND_FILL

		var margin = MarginContainer.new()
		margin.add_theme_constant_override("margin_left", 14)
		margin.add_theme_constant_override("margin_right", 14)
		margin.add_theme_constant_override("margin_top", 12)
		margin.add_theme_constant_override("margin_bottom", 12)
		card.add_child(margin)

		var vbox = VBoxContainer.new()
		vbox.add_theme_constant_override("separation", 6)
		margin.add_child(vbox)

		# Header
		var hdr = HBoxContainer.new()
		var icon_str = str(info.get("icon", ""))
		if icon_str != "":
			var icon_lbl = Label.new()
			icon_lbl.text = icon_str
			icon_lbl.add_theme_font_size_override("font_size", 22)
			hdr.add_child(icon_lbl)

		var title_vbox = VBoxContainer.new()
		title_vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var title_lbl = Label.new()
		title_lbl.text = str(info.get("name", elem_key.capitalize()))
		title_lbl.add_theme_font_size_override("font_size", 16)
		title_lbl.add_theme_color_override("font_color", info.get("color", Color.WHITE))
		title_vbox.add_child(title_lbl)

		var role_lbl = Label.new()
		role_lbl.text = str(info.get("role", ""))
		role_lbl.add_theme_font_size_override("font_size", 11)
		role_lbl.add_theme_color_override("font_color", Color(0.7, 0.75, 0.82, 0.8))
		title_vbox.add_child(role_lbl)
		hdr.add_child(title_vbox)

		var btn_select = Button.new()
		btn_select.name = "BtnSelect"
		btn_select.text = "Draft for Elf"
		btn_select.custom_minimum_size = Vector2(110, 32)
		var deck_name = elem_key
		btn_select.pressed.connect(func(): select_elf_element(deck_name))
		hdr.add_child(btn_select)

		vbox.add_child(hdr)

		# Spells list
		var spells = info.get("spells", [])
		for sp in spells:
			var s_lbl = Label.new()
			s_lbl.text = "• %s — %s" % [sp.get("name", ""), sp.get("desc", "")]
			s_lbl.add_theme_font_size_override("font_size", 11)
			s_lbl.add_theme_color_override("font_color", Color(0.82, 0.86, 0.92, 0.9))
			s_lbl.clip_text = true
			vbox.add_child(s_lbl)

		elf_spell_decks_grid.add_child(card)

func _update_elf_spell_modal_ui() -> void:
	if not elf_spell_decks_grid:
		return
	for elem_key in ["water", "earth", "fire", "air"]:
		var card = elf_spell_decks_grid.get_node_or_null("DeckCard_" + elem_key)
		if not card:
			continue
		var is_selected = (elem_key == current_elf_element)
		var csb = StyleBoxFlat.new()
		csb.bg_color = Color(0.07, 0.10, 0.15, 0.95) if not is_selected else Color(0.08, 0.15, 0.22, 1.0)
		csb.set_corner_radius_all(8)
		csb.border_width_left = 2 if is_selected else 1
		csb.border_width_top = 2 if is_selected else 1
		csb.border_width_right = 2 if is_selected else 1
		csb.border_width_bottom = 2 if is_selected else 1
		csb.border_color = Color(0.0, 0.85, 1.0, 1.0) if is_selected else Color(0.2, 0.26, 0.35, 0.6)
		card.add_theme_stylebox_override("panel", csb)

		var btn_select = card.find_child("BtnSelect", true, false)
		if btn_select:
			if is_selected:
				btn_select.text = "✓ Drafted"
				var bsb = StyleBoxFlat.new()
				bsb.bg_color = Color(0.06, 0.45, 0.28, 1.0)
				bsb.set_corner_radius_all(4)
				btn_select.add_theme_stylebox_override("normal", bsb)
			else:
				btn_select.text = "Draft for Elf"
				var bsb = StyleBoxFlat.new()
				bsb.bg_color = Color(0.15, 0.20, 0.28, 0.9)
				bsb.set_corner_radius_all(4)
				btn_select.add_theme_stylebox_override("normal", bsb)

	if elf_spell_summary_text:
		var cur_info = ELEMENTAL_DECK_INFO.get(current_elf_element, {})
		var wiz_names: Array = []
		for k in ["water", "earth", "fire", "air"]:
			if k != current_elf_element:
				var wi = ELEMENTAL_DECK_INFO.get(k, {})
				wiz_names.append(wi.get("name", k).replace(" Magic", ""))
		elf_spell_summary_text.text = "Selected: %s (Elf: 3 Spells) | Wizard takes: %s (9 Spells)" % [
			cur_info.get("name", current_elf_element),
			", ".join(wiz_names)
		]

func show_elf_spell_selection_modal() -> void:
	if elf_spell_modal:
		elf_spell_modal.visible = true
		_update_elf_spell_modal_ui()

func close_elf_spell_selection_modal() -> void:
	if elf_spell_modal:
		elf_spell_modal.visible = false
	_update_ui()

func select_elf_element(elem_key: String) -> Dictionary:
	elem_key = elem_key.to_lower().strip_edges()
	if not ELEMENTAL_DECKS.has(elem_key):
		return { "success": false, "error": "Unknown elemental deck: " + elem_key }
	current_elf_element = elem_key
	var elf_spells: Array = ELEMENTAL_DECKS[elem_key].duplicate()
	var wiz_spells: Array = []
	for k in ["water", "earth", "fire", "air"]:
		if k != elem_key:
			wiz_spells.append_array(ELEMENTAL_DECKS[k])

	for h in heroes:
		if str(h.get("id")) == "elf":
			h["spells"] = elf_spells
		elif str(h.get("id")) == "wizard":
			h["spells"] = wiz_spells

	_update_ui()
	_update_elf_spell_modal_ui()
	return {
		"success": true,
		"elf_element": elem_key,
		"elf_spells": elf_spells,
		"wizard_spells": wiz_spells
	}

func confirm_elf_spell_selection() -> Dictionary:
	var res = select_elf_element(current_elf_element)
	close_elf_spell_selection_modal()
	var info = ELEMENTAL_DECK_INFO.get(current_elf_element, {})
	_log("[SPELLS] Spell Selection Confirmed! Elf memorizes %s. Wizard takes the remaining 3 decks." % [
		info.get("name", current_elf_element)
	])
	return res

func _on_confirm_spell_modal_pressed() -> void:
	confirm_elf_spell_selection()

func _on_close_spell_modal_pressed() -> void:
	close_elf_spell_selection_modal()

func _get_hero_spells_by_id(hero_id: String) -> Array:
	for h in heroes:
		if str(h.get("id")) == hero_id:
			return h.get("spells", []).duplicate()
	return []

func _extract_cartridge_spells(hero_data: Dictionary, hero_type: String, cart: Dictionary) -> Array:
	var raw_spells = hero_data.get("spells", [])
	if raw_spells is Array and raw_spells.size() > 0:
		var result: Array = []
		for s in raw_spells:
			if s is String:
				result.append(s.replace("-", "_").to_lower())
			elif s is Dictionary:
				var slug = str(s.get("slug", s.get("id", "")))
				if slug != "":
					result.append(slug.replace("-", "_").to_lower())
		if result.size() > 0:
			return result

	var alloc = cart.get("spellAllocation", {})
	var elf_elem = str(alloc.get("elfElement", current_elf_element)).to_lower()
	if hero_type == "elf":
		return ELEMENTAL_DECKS.get(elf_elem, ELEMENTAL_DECKS["water"]).duplicate()
	elif hero_type == "wizard":
		var wiz_spells: Array = []
		var wiz_elems = alloc.get("wizardElements", [])
		if wiz_elems is Array and wiz_elems.size() > 0:
			for elem in wiz_elems:
				var el_str = str(elem).to_lower()
				if ELEMENTAL_DECKS.has(el_str):
					wiz_spells.append_array(ELEMENTAL_DECKS[el_str])
		else:
			for elem in ["water", "earth", "fire", "air"]:
				if elem != elf_elem:
					wiz_spells.append_array(ELEMENTAL_DECKS[elem])
		return wiz_spells

	return []

# --- Spell Casting Modal & UI ---
func show_spell_cast_modal() -> void:
	if spell_cast_modal:
		spell_cast_modal.visible = true
		_update_spell_cast_modal_ui()

func close_spell_cast_modal() -> void:
	if spell_cast_modal:
		spell_cast_modal.visible = false
	_update_ui()

func toggle_spell_cast_modal() -> void:
	if spell_cast_modal and spell_cast_modal.visible:
		close_spell_cast_modal()
	else:
		show_spell_cast_modal()

func _update_spell_cast_modal_ui() -> void:
	if not spell_cast_modal or not spell_cast_modal.visible:
		return

	var hero = get_active_hero()
	var h_disp = get_hero_display_title(hero) if not hero.is_empty() else "Hero"
	if spell_cast_title:
		spell_cast_title.text = "🔮 Cast Spell — %s" % h_disp

	if spell_cast_badge:
		if has_acted_this_turn:
			spell_cast_badge.text = "ACTION ALREADY USED"
			spell_cast_badge.add_theme_color_override("font_color", Color(0.85, 0.35, 0.35, 1.0))
		else:
			spell_cast_badge.text = "ACTION READY"
			spell_cast_badge.add_theme_color_override("font_color", Color(0.2, 0.9, 0.4, 1.0))

	if not spell_cast_grid:
		return

	# Clear previous spell cards
	for child in spell_cast_grid.get_children():
		child.queue_free()

	var hero_spells: Array = hero.get("spells", [])
	if hero_spells.is_empty():
		var empty_lbl = Label.new()
		empty_lbl.text = "This hero has no memorized spells."
		empty_lbl.add_theme_font_size_override("font_size", 14)
		empty_lbl.add_theme_color_override("font_color", Color(0.7, 0.75, 0.8, 0.8))
		spell_cast_grid.add_child(empty_lbl)
		return

	var h_pos = hero.get("grid_pos", Vector2i(-1, -1))
	var visible_monsters: Array = []
	for m in monsters:
		if bool(m.get("is_alive", true)) and int(m.get("current_bp", 1)) > 0:
			var mp = m.get("grid_pos", Vector2i(-1, -1))
			if has_line_of_sight(h_pos, mp):
				visible_monsters.append(m)

	for spell_id in hero_spells:
		var s_data = HeroQuestSpells.get_spell(spell_id)
		var s_name = str(s_data.get("name", spell_id))
		var s_deck = str(s_data.get("deck", "magic")).capitalize()
		var s_icon = str(s_data.get("icon", "✨"))
		var s_desc = str(s_data.get("description", ""))
		var s_target = str(s_data.get("target_type", "monster"))

		var card = PanelContainer.new()
		card.custom_minimum_size = Vector2(430, 110)
		card.size_flags_horizontal = Control.SIZE_EXPAND_FILL

		var csb = StyleBoxFlat.new()
		csb.set_corner_radius_all(6)
		csb.bg_color = Color(0.08, 0.11, 0.16, 0.95)

		# elemental border color
		match str(s_data.get("deck", "")).to_lower():
			"fire":
				csb.border_color = Color(0.9, 0.35, 0.1, 0.9)
			"water":
				csb.border_color = Color(0.05, 0.7, 0.85, 0.9)
			"earth":
				csb.border_color = Color(0.55, 0.52, 0.48, 0.9)
			"air":
				csb.border_color = Color(0.3, 0.8, 1.0, 0.9)
			_:
				csb.border_color = Color(0.4, 0.5, 0.7, 0.8)
		csb.border_width_left = 1; csb.border_width_top = 1; csb.border_width_right = 1; csb.border_width_bottom = 1
		card.add_theme_stylebox_override("panel", csb)

		var marg = MarginContainer.new()
		marg.add_theme_constant_override("margin_left", 12)
		marg.add_theme_constant_override("margin_top", 10)
		marg.add_theme_constant_override("margin_right", 12)
		marg.add_theme_constant_override("margin_bottom", 10)
		card.add_child(marg)

		var vbox = VBoxContainer.new()
		vbox.add_theme_constant_override("separation", 6)
		marg.add_child(vbox)

		# Row 1: Icon + Name + Deck badge
		var hrow = HBoxContainer.new()
		var nlbl = Label.new()
		nlbl.text = "%s %s" % [s_icon, s_name]
		nlbl.add_theme_font_size_override("font_size", 14)
		nlbl.add_theme_color_override("font_color", Color(1.0, 0.95, 0.85, 1.0))
		nlbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		hrow.add_child(nlbl)

		var badge = Label.new()
		badge.text = "[%s]" % s_deck.to_upper()
		badge.add_theme_font_size_override("font_size", 11)
		badge.add_theme_color_override("font_color", csb.border_color)
		hrow.add_child(badge)
		vbox.add_child(hrow)

		# Row 2: Description
		var dlbl = Label.new()
		dlbl.text = s_desc
		dlbl.add_theme_font_size_override("font_size", 11)
		dlbl.add_theme_color_override("font_color", Color(0.78, 0.82, 0.9, 0.9))
		dlbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		vbox.add_child(dlbl)

		# Row 3: Target & Cast action buttons
		var btn_row = HBoxContainer.new()
		btn_row.add_theme_constant_override("separation", 6)

		if s_target == "monster":
			if visible_monsters.is_empty():
				var no_target = Button.new()
				no_target.text = "No Foes in Line of Sight"
				no_target.disabled = true
				no_target.size_flags_horizontal = Control.SIZE_EXPAND_FILL
				btn_row.add_child(no_target)
			else:
				for vm in visible_monsters:
					var cbtn = Button.new()
					cbtn.text = "⚡ Cast on %s" % str(vm.get("name", "Monster"))
					cbtn.disabled = has_acted_this_turn
					var mid = str(vm.get("id"))
					var sp_id = spell_id
					cbtn.pressed.connect(func():
						cast_spell(sp_id, mid)
						close_spell_cast_modal()
					)
					cbtn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
					btn_row.add_child(cbtn)
		else:
			# Targets hero
			for th in heroes:
				var cbtn = Button.new()
				var th_bp = int(th.get("current_bp", 8))
				var th_max = int(th.get("bodyPoints", 8))
				var th_id = str(th.get("id"))
				if th_id == str(hero.get("id")):
					cbtn.text = "⚡ Self (%d/%d BP)" % [th_bp, th_max]
				else:
					cbtn.text = "⚡ %s (%d/%d)" % [str(th.get("name")), th_bp, th_max]
				cbtn.disabled = has_acted_this_turn
				var sp_id = spell_id
				cbtn.pressed.connect(func():
					cast_spell(sp_id, th_id)
					close_spell_cast_modal()
				)
				cbtn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
				btn_row.add_child(cbtn)

		vbox.add_child(btn_row)
		spell_cast_grid.add_child(card)

# --- Item Usage Modal & UI ---
func show_item_use_modal() -> void:
	if item_use_modal:
		item_use_modal.visible = true
		_update_item_use_modal_ui()

func close_item_use_modal() -> void:
	if item_use_modal:
		item_use_modal.visible = false
	_update_ui()

func toggle_item_use_modal() -> void:
	if item_use_modal and item_use_modal.visible:
		close_item_use_modal()
	else:
		show_item_use_modal()

func _update_item_use_modal_ui() -> void:
	if not item_use_modal or not item_use_modal.visible:
		return

	var hero = get_active_hero()
	var h_disp = get_hero_display_title(hero) if not hero.is_empty() else "Hero"
	var hid = str(hero.get("id"))
	if item_use_title:
		item_use_title.text = "🎒 Backpack & Inventory — %s" % h_disp

	if not item_use_grid:
		return

	# Clear previous item cards
	for child in item_use_grid.get_children():
		child.queue_free()

	var hero_inv: Array = hero.get("inventory", [])
	if hero_inv.is_empty():
		var empty_lbl = Label.new()
		empty_lbl.text = "Backpack is empty. Search rooms for treasure chests and potions!"
		empty_lbl.add_theme_font_size_override("font_size", 14)
		empty_lbl.add_theme_color_override("font_color", Color(0.7, 0.75, 0.8, 0.8))
		item_use_grid.add_child(empty_lbl)
		return

	for item_id in hero_inv:
		var item_str = str(item_id)
		var item_info = HeroQuestEquipment.get_item(item_str)
		var i_name = str(item_info.get("name", item_str.replace("_", " ").capitalize()))
		var i_icon = str(item_info.get("icon", "📦"))
		var i_desc = str(item_info.get("description", ""))
		var is_cons = HeroQuestEquipment.is_consumable(item_str) or item_str.contains("potion")

		var card = PanelContainer.new()
		card.custom_minimum_size = Vector2(400, 100)
		card.size_flags_horizontal = Control.SIZE_EXPAND_FILL

		var csb = StyleBoxFlat.new()
		csb.set_corner_radius_all(6)
		csb.bg_color = Color(0.08, 0.11, 0.16, 0.95)

		var is_wep = not HeroQuestEquipment.get_weapon(item_str).is_empty()
		var is_arm = not HeroQuestEquipment.get_armor(item_str).is_empty()
		var is_equipped = (hero.get("equipped_weapon") == item_str) or (hero.get("equipped_armor", []).has(item_str))

		if is_cons:
			csb.border_color = Color(0.2, 0.85, 0.45, 0.9) # Emerald
		elif is_equipped:
			csb.border_color = Color(1.0, 0.8, 0.2, 0.9) # Gold equipped
		else:
			csb.border_color = Color(0.35, 0.55, 0.8, 0.8) # Blue
		csb.border_width_left = 1; csb.border_width_top = 1; csb.border_width_right = 1; csb.border_width_bottom = 1
		card.add_theme_stylebox_override("panel", csb)

		var marg = MarginContainer.new()
		marg.add_theme_constant_override("margin_left", 12)
		marg.add_theme_constant_override("margin_top", 10)
		marg.add_theme_constant_override("margin_right", 12)
		marg.add_theme_constant_override("margin_bottom", 10)
		card.add_child(marg)

		var vbox = VBoxContainer.new()
		vbox.add_theme_constant_override("separation", 6)
		marg.add_child(vbox)

		# Row 1: Header (Icon + Name + Category badge)
		var hrow = HBoxContainer.new()
		var nlbl = Label.new()
		nlbl.text = "%s %s" % [i_icon, i_name]
		nlbl.add_theme_font_size_override("font_size", 14)
		nlbl.add_theme_color_override("font_color", Color(1.0, 0.95, 0.85, 1.0))
		nlbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		hrow.add_child(nlbl)

		var badge = Label.new()
		if is_cons:
			badge.text = "[CONSUMABLE]"
			badge.add_theme_color_override("font_color", Color(0.2, 0.85, 0.45, 1.0))
		elif is_equipped:
			badge.text = "[EQUIPPED]"
			badge.add_theme_color_override("font_color", Color(1.0, 0.8, 0.2, 1.0))
		elif is_wep:
			badge.text = "[WEAPON]"
			badge.add_theme_color_override("font_color", Color(0.4, 0.7, 1.0, 1.0))
		elif is_arm:
			badge.text = "[ARMOR]"
			badge.add_theme_color_override("font_color", Color(0.7, 0.7, 0.9, 1.0))
		badge.add_theme_font_size_override("font_size", 11)
		hrow.add_child(badge)
		vbox.add_child(hrow)

		# Row 2: Description
		var dlbl = Label.new()
		dlbl.text = i_desc
		dlbl.add_theme_font_size_override("font_size", 11)
		dlbl.add_theme_color_override("font_color", Color(0.78, 0.82, 0.9, 0.9))
		dlbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		vbox.add_child(dlbl)

		# Row 3: Action Buttons
		var btn_row = HBoxContainer.new()
		btn_row.add_theme_constant_override("separation", 6)

		if is_cons:
			var ubtn = Button.new()
			ubtn.text = "🧪 Drink / Use (%s)" % str(hero.get("name"))
			ubtn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			var cur_item_id = item_str
			ubtn.pressed.connect(func():
				use_item(hid, cur_item_id)
			)
			btn_row.add_child(ubtn)
		elif is_equipped:
			var eq_lbl = Button.new()
			eq_lbl.text = "✓ Currently Equipped"
			eq_lbl.disabled = true
			eq_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			btn_row.add_child(eq_lbl)
			if is_arm:
				var uq_btn = Button.new()
				uq_btn.text = "Unequip"
				var cur_item_id = item_str
				uq_btn.pressed.connect(func():
					unequip_item(hid, cur_item_id)
					_update_item_use_modal_ui()
				)
				btn_row.add_child(uq_btn)
		else:
			var eq_btn = Button.new()
			eq_btn.text = "⚔️ Equip %s" % i_name if is_wep else "🛡️ Equip %s" % i_name
			eq_btn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			var cur_item_id = item_str
			eq_btn.pressed.connect(func():
				use_item(hid, cur_item_id)
			)
			btn_row.add_child(eq_btn)

		vbox.add_child(btn_row)
		item_use_grid.add_child(card)

# --- Trap Disarming & Detection Helpers ---
func can_search_for_traps() -> bool:
	var hero = get_active_hero()
	if hero.is_empty() or has_acted_this_turn:
		return false
	var h_pos: Vector2i = hero.get("grid_pos", Vector2i(-1, -1))
	var rm = _get_room_at(h_pos)
	var r_id = str(rm.get("id", ""))
	if r_id != "":
		if not revealed_rooms.has(r_id):
			return false
		for m in monsters:
			if m.get("is_alive", false) and int(m.get("current_bp", 1)) > 0 and str(m.get("roomId", "")) == r_id:
				return false
		return true
	else:
		for m in monsters:
			if m.get("is_alive", false) and int(m.get("current_bp", 1)) > 0:
				var mp = m.get("grid_pos", Vector2i(-1, -1))
				if has_line_of_sight(h_pos, mp):
					return false
		return true

func can_hero_disarm(hero: Dictionary) -> Dictionary:
	if hero.is_empty():
		return { "can_disarm": false, "reason": "No active hero" }
	var h_id = str(hero.get("id", "")).to_lower()
	if h_id == "dwarf":
		return { "can_disarm": true, "is_dwarf": true }
	var inv = hero.get("inventory", [])
	for it in inv:
		var it_str = str(it).to_lower().strip_edges()
		if it_str == "tool_kit" or it_str == "toolbox" or it_str == "tools":
			return { "can_disarm": true, "is_dwarf": false, "has_tool_kit": true }
	return { "can_disarm": false, "is_dwarf": false, "reason": "Requires Tool Kit or Dwarf to disarm" }

func get_adjacent_detected_traps() -> Array[Dictionary]:
	var hero = get_active_hero()
	if hero.is_empty():
		return []
	var h_pos = hero.get("grid_pos", Vector2i(-1, -1))
	var res: Array[Dictionary] = []
	for tr in traps:
		var is_det = bool(tr.get("detected", false) or tr.get("is_revealed", false))
		var is_dis = bool(tr.get("disarmed", false))
		var is_spr = bool(tr.get("sprung", false) or tr.get("is_sprung", false))
		var is_spn = bool(tr.get("spent", false))
		if is_det and not is_dis and not is_spr and not is_spn:
			var tx = int(tr.get("x", tr.get("position", [0, 0])[0]))
			var ty = int(tr.get("y", tr.get("position", [0, 0])[1]))
			if abs(tx - h_pos.x) + abs(ty - h_pos.y) <= 1:
				res.append(tr)
	return res

# --- Disarm Trap Modal & UI ---
func show_disarm_modal() -> void:
	if disarm_trap_modal:
		disarm_trap_modal.visible = true
		_update_disarm_modal_ui()

func close_disarm_modal() -> void:
	if disarm_trap_modal:
		disarm_trap_modal.visible = false
	_update_ui()

func toggle_disarm_modal() -> void:
	if disarm_trap_modal and disarm_trap_modal.visible:
		close_disarm_modal()
	else:
		show_disarm_modal()

func _on_disarm_trap_button_pressed() -> void:
	var adjacent_traps = get_adjacent_detected_traps()
	if adjacent_traps.size() == 1:
		disarm_trap(str(adjacent_traps[0].get("id", "")))
	else:
		toggle_disarm_modal()

func _update_disarm_modal_ui() -> void:
	if not disarm_trap_modal or not disarm_trap_modal.visible:
		return

	var hero = get_active_hero()
	var h_disp = get_hero_display_title(hero) if not hero.is_empty() else "Hero"
	if disarm_trap_title:
		disarm_trap_title.text = "🔧 Disarm Trap — %s" % h_disp

	var disarm_check = can_hero_disarm(hero)
	var can_dis = disarm_check.get("can_disarm", false)
	var is_dwarf = disarm_check.get("is_dwarf", false)

	if disarm_trap_badge:
		if has_acted_this_turn:
			disarm_trap_badge.text = "ACTION ALREADY USED"
			disarm_trap_badge.add_theme_color_override("font_color", Color(0.85, 0.35, 0.35, 1.0))
		elif is_dwarf:
			disarm_trap_badge.text = "DWARF TRAP MASTERY"
			disarm_trap_badge.add_theme_color_override("font_color", Color(0.2, 0.9, 0.4, 1.0))
		elif can_dis:
			disarm_trap_badge.text = "TOOL KIT READY"
			disarm_trap_badge.add_theme_color_override("font_color", Color(0.3, 0.8, 1.0, 1.0))
		else:
			disarm_trap_badge.text = "REQUIRES TOOL KIT OR DWARF"
			disarm_trap_badge.add_theme_color_override("font_color", Color(0.9, 0.6, 0.2, 1.0))

	if not disarm_trap_grid:
		return

	for child in disarm_trap_grid.get_children():
		child.queue_free()

	var adjacent_traps = get_adjacent_detected_traps()
	if adjacent_traps.is_empty():
		var empty_lbl = Label.new()
		empty_lbl.text = "No detected adjacent traps to disarm. Search the room or corridor first!"
		empty_lbl.add_theme_font_size_override("font_size", 13)
		empty_lbl.add_theme_color_override("font_color", Color(0.7, 0.75, 0.8, 0.8))
		disarm_trap_grid.add_child(empty_lbl)
		return

	for tr in adjacent_traps:
		var tr_id = str(tr.get("id", "trap"))
		var t_type = str(tr.get("type", tr.get("trapType", "pit"))).to_lower()
		var tx = int(tr.get("x", tr.get("position", [0, 0])[0]))
		var ty = int(tr.get("y", tr.get("position", [0, 0])[1]))

		var t_name = "Pit Trap"
		var t_icon = "🕳️"
		var t_desc = "Covered hole in the floor. Disarming bridges the gap safely with iron crossbars."
		var border_color = Color(0.8, 0.3, 0.2, 0.9)

		if "spear" in t_type:
			t_name = "Spear Trap"
			t_icon = "🔺"
			t_desc = "Concealed spears. Disarming jams the mechanical pressure trigger."
			border_color = Color(0.9, 0.4, 0.2, 0.9)
		elif "falling" in t_type or "boulder" in t_type or "rock" in t_type:
			t_name = "Falling Block Trap"
			t_icon = "🪨"
			t_desc = "Overhead masonry counterweight. Disarming disables the ceiling drop trigger."
			border_color = Color(0.9, 0.6, 0.1, 0.9)
		elif "chest" in t_type or "furniture" in t_type:
			t_name = "Poison Needle Chest Trap"
			t_icon = "☠️"
			t_desc = "Spring-loaded needle mechanism on treasure chest. Disarming clears the lock."
			border_color = Color(0.7, 0.3, 0.9, 0.9)

		var card = PanelContainer.new()
		card.custom_minimum_size = Vector2(430, 110)
		card.size_flags_horizontal = Control.SIZE_EXPAND_FILL

		var csb = StyleBoxFlat.new()
		csb.set_corner_radius_all(6)
		csb.bg_color = Color(0.08, 0.11, 0.16, 0.95)
		csb.border_color = border_color
		csb.set_border_width_all(1)
		card.add_theme_stylebox_override("panel", csb)

		var marg = MarginContainer.new()
		marg.add_theme_constant_override("margin_left", 12)
		marg.add_theme_constant_override("margin_top", 10)
		marg.add_theme_constant_override("margin_right", 12)
		marg.add_theme_constant_override("margin_bottom", 10)
		card.add_child(marg)

		var vbox = VBoxContainer.new()
		vbox.add_theme_constant_override("separation", 6)
		marg.add_child(vbox)

		# Row 1: Header
		var hrow = HBoxContainer.new()
		var nlbl = Label.new()
		nlbl.text = "%s %s at (%d, %d)" % [t_icon, t_name, tx, ty]
		nlbl.add_theme_font_size_override("font_size", 14)
		nlbl.add_theme_color_override("font_color", Color(1.0, 0.95, 0.85, 1.0))
		nlbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		hrow.add_child(nlbl)

		var badge = Label.new()
		badge.text = "[DETECTED]"
		badge.add_theme_color_override("font_color", Color(1.0, 0.75, 0.2, 1.0))
		badge.add_theme_font_size_override("font_size", 11)
		hrow.add_child(badge)
		vbox.add_child(hrow)

		# Row 2: Description
		var dlbl = Label.new()
		dlbl.text = t_desc
		dlbl.add_theme_font_size_override("font_size", 11)
		dlbl.add_theme_color_override("font_color", Color(0.78, 0.82, 0.9, 0.9))
		dlbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		vbox.add_child(dlbl)

		# Row 3: Disarm Button
		var btn_row = HBoxContainer.new()
		var dbtn = Button.new()
		dbtn.text = "🔧 Disarm %s (%s)" % [t_name, str(hero.get("name"))]
		dbtn.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		dbtn.disabled = has_acted_this_turn or not can_dis
		var cur_tr_id = tr_id
		dbtn.pressed.connect(func():
			close_disarm_modal()
			disarm_trap(cur_tr_id)
		)
		btn_row.add_child(dbtn)
		vbox.add_child(btn_row)

		disarm_trap_grid.add_child(card)

func get_next_ai_step_command() -> Dictionary:
	var next_step = auto_play_step + 1
	var hero = get_active_hero()
	var h_name = str(hero.get("name", "Hero"))
	var h_id = str(hero.get("id", "barbarian"))

	match next_step:
		1:
			return {
				"step": 1,
				"max_steps": 10,
				"action": "roll_movement",
				"command": "roll_movement_dice",
				"hero": h_name,
				"title": "%s Rolls 2d6 Movement Dice" % h_name,
				"action_name": "Roll Movement",
				"description": "%s rolls two red acrylic dice to determine available movement squares for this turn." % h_name,
				"parameters": {
					"action": "roll_movement_dice",
					"dice": "2d6",
					"hero": h_id
				},
				"rationale": "At the start of the turn, the active hero must roll movement dice before traversing dungeon corridors."
			}
		2:
			var target = Vector2i(4, 1) if starting_stair == Vector2i(0, 1) else Vector2i(2, 0)
			return {
				"step": 2,
				"max_steps": 10,
				"action": "move",
				"command": "move_hero",
				"hero": h_name,
				"title": "Advance Along Corridor to (%d, %d)" % [target.x, target.y],
				"action_name": "Move Hero",
				"description": "%s advances through the corridor toward the heavy wooden crypt door at (%d, %d)." % [h_name, target.x, target.y],
				"parameters": {
					"action": "move_hero",
					"destination": [target.x, target.y],
					"hero": h_id
				},
				"rationale": "Moving adjacent to the crypt door allows the hero to inspect and kick it open."
			}
		3:
			var door_from = Vector2i(4, 1) if starting_stair == Vector2i(0, 1) else Vector2i(2, 0)
			var door_to = Vector2i(4, 2) if starting_stair == Vector2i(0, 1) else Vector2i(2, 1)
			return {
				"step": 3,
				"max_steps": 10,
				"action": "open_door",
				"command": "open_door",
				"hero": h_name,
				"title": "Kick Open Crypt Door (%d, %d) -> (%d, %d)" % [door_from.x, door_from.y, door_to.x, door_to.y],
				"action_name": "Open Door",
				"description": "%s kicks open the reinforced dungeon door, lifting the Fog of War and revealing the Northwest Crypt." % h_name,
				"parameters": {
					"action": "open_door",
					"from": [door_from.x, door_from.y],
					"to": [door_to.x, door_to.y]
				},
				"rationale": "Opening doors reveals interior rooms and exposes lurking enemy monsters."
			}
		4:
			var room_target = Vector2i(4, 3) if starting_stair == Vector2i(0, 1) else Vector2i(2, 2)
			return {
				"step": 4,
				"max_steps": 10,
				"action": "move",
				"command": "move_hero",
				"hero": h_name,
				"title": "Enter Northwest Crypt at (%d, %d)" % [room_target.x, room_target.y],
				"action_name": "Move Into Room",
				"description": "%s strides through the doorway into the crypt chamber to engage the spotted skeletons." % h_name,
				"parameters": {
					"action": "move_hero",
					"destination": [room_target.x, room_target.y],
					"hero": h_id
				},
				"rationale": "Positioning adjacent to enemy skeletons enables melee weapon strikes."
			}
		5:
			return {
				"step": 5,
				"max_steps": 10,
				"action": "attack",
				"command": "attack_adjacent_monster",
				"hero": h_name,
				"title": "Attack Crypt Skeleton with Broadsword",
				"action_name": "Melee Attack",
				"description": "%s swings Broadsword at adjacent Crypt Skeleton rolling combat dice (Skulls vs Black Shields)." % h_name,
				"parameters": {
					"action": "attack_adjacent_monster",
					"weapon": "broadsword",
					"target": "mon-skel-1"
				},
				"rationale": "Melee strike deals combat wounds and neutralizes dungeon threats."
			}
		6:
			return {
				"step": 6,
				"max_steps": 10,
				"action": "end_turn",
				"command": "end_turn",
				"hero": h_name,
				"title": "Conclude Barbarian Turn & Handover to Dwarf",
				"action_name": "End Turn",
				"description": "%s concludes their turn. Active turn control advances to Dwarf at the dungeon stair." % h_name,
				"parameters": {
					"action": "end_turn",
					"current_hero": h_id,
					"next_hero": "dwarf"
				},
				"rationale": "Finishing turn allows next party member to enter and act."
			}
		7:
			var dwarf_pos = Vector2i(3, 3) if starting_stair == Vector2i(0, 1) else Vector2i(3, 1)
			return {
				"step": 7,
				"max_steps": 10,
				"action": "roll_and_move",
				"command": "roll_and_move",
				"hero": "Dwarf",
				"title": "Advance Dwarf into Crypt at (%d, %d)" % [dwarf_pos.x, dwarf_pos.y],
				"action_name": "Roll & Move",
				"description": "Dwarf rolls movement dice and advances into the crypt to support Barbarian.",
				"parameters": {
					"action": "roll_movement_and_move",
					"destination": [dwarf_pos.x, dwarf_pos.y],
					"hero": "dwarf"
				},
				"rationale": "Dwarf brings backup into the crypt chamber to assist in clearing threats."
			}
		8:
			return {
				"step": 8,
				"max_steps": 10,
				"action": "search",
				"command": "search_room",
				"hero": "Dwarf",
				"title": "Search Crypt for Treasure & Hidden Traps",
				"action_name": "Search Room",
				"description": "Dwarf searches the crypt chamber for gold coins, hidden loot chests, and traps.",
				"parameters": {
					"action": "search_room",
					"hero": "dwarf"
				},
				"rationale": "Searching explored chambers yields gold and rewards the party."
			}
		9:
			return {
				"step": 9,
				"max_steps": 10,
				"action": "monster_turn",
				"command": "ai_monster_turn",
				"hero": "Game Master (Zargon)",
				"title": "Conclude Hero Phase & Begin Zargon AI Phase",
				"action_name": "Game Master Turn",
				"description": "All heroes finish their turns. Zargon AI activates surviving dungeon monsters for tactical counterattacks.",
				"parameters": {
					"action": "ai_monster_turn",
					"phase": "gm_phase"
				},
				"rationale": "Monsters take their turn after heroes conclude their actions."
			}
		10:
			return {
				"step": 10,
				"max_steps": 10,
				"action": "conclude_auto_play",
				"command": "conclude_auto_play",
				"hero": "System",
				"title": "Conclude Auto-Play & Begin Round 2",
				"action_name": "Finish Auto-Play",
				"description": "Completes the 10-step autonomous gameplay demonstration and transitions to active free-play mode.",
				"parameters": {
					"action": "conclude_auto_play"
				},
				"rationale": "Full turn cycle and tactical mechanics verified."
			}
		_:
			var cmd_name = "end_turn"
			var act_title = "End Turn"
			var act_desc = "%s ends their turn." % h_name
			if turn_state == "awaiting_roll":
				cmd_name = "roll_movement_dice"
				act_title = "Roll Movement Dice"
				act_desc = "%s rolls 2d6 movement dice." % h_name
			elif get_adjacent_monsters().size() > 0 and not has_acted_this_turn:
				cmd_name = "attack_adjacent_monster"
				act_title = "Attack Adjacent Monster"
				act_desc = "%s attacks adjacent monster." % h_name
			elif get_adjacent_closed_doors().size() > 0:
				cmd_name = "open_door"
				act_title = "Open Adjacent Door"
				act_desc = "%s opens adjacent door." % h_name
			elif can_search_room():
				cmd_name = "search_room"
				act_title = "Search Room"
				act_desc = "%s searches room for treasure." % h_name

			return {
				"step": next_step,
				"max_steps": next_step,
				"action": cmd_name,
				"command": cmd_name,
				"hero": h_name,
				"title": act_title,
				"action_name": act_title,
				"description": act_desc,
				"parameters": { "action": cmd_name, "hero": h_id },
				"rationale": "Dynamic AI behavior based on tactical situation."
			}

func propose_ai_step() -> Dictionary:
	var cmd_info = get_next_ai_step_command()
	pending_ai_command = cmd_info
	is_ai_step_pending = true

	if ai_modal_step_badge:
		ai_modal_step_badge.text = "STEP %d OF %d" % [int(cmd_info.get("step", 1)), int(cmd_info.get("max_steps", 10))]
	if ai_modal_cmd_text:
		ai_modal_cmd_text.text = "Command: %s" % str(cmd_info.get("command", ""))
	if ai_modal_action_title:
		ai_modal_action_title.text = str(cmd_info.get("title", ""))
	if ai_modal_action_desc:
		ai_modal_action_desc.text = str(cmd_info.get("description", ""))
	if ai_modal_details_text:
		var params_str = ""
		var p_dict: Dictionary = cmd_info.get("parameters", {})
		for k in p_dict.keys():
			params_str += "• %s: %s\n" % [str(k), str(p_dict[k])]
		ai_modal_details_text.text = "• Hero: %s\n• Action: %s\n%s• Rationale: %s" % [
			str(cmd_info.get("hero", "")),
			str(cmd_info.get("action_name", "")),
			params_str,
			str(cmd_info.get("rationale", ""))
		]

	if ai_confirm_modal:
		ai_confirm_modal.visible = true

	_log("[AI PROPOSAL] Step %d: %s (Command: %s). Awaiting user confirmation..." % [
		int(cmd_info.get("step", 1)),
		str(cmd_info.get("title", "")),
		str(cmd_info.get("command", ""))
	])
	return { "success": true, "pending": true, "proposal": cmd_info }

func confirm_and_execute_ai_step() -> Dictionary:
	if not is_ai_step_pending and pending_ai_command.is_empty():
		propose_ai_step()

	var executed_cmd = pending_ai_command.duplicate(true)
	is_ai_step_pending = false
	if ai_confirm_modal:
		ai_confirm_modal.visible = false

	_log("[AI CONFIRMED] Executing Step %d: %s" % [
		int(executed_cmd.get("step", auto_play_step + 1)),
		str(executed_cmd.get("title", ""))
	])
	_execute_auto_play_step()
	pending_ai_command = {}
	return { "success": true, "executed": true, "step": auto_play_step, "command": executed_cmd }

func cancel_ai_step() -> Dictionary:
	var cancelled_step = int(pending_ai_command.get("step", auto_play_step + 1))
	is_ai_step_pending = false
	pending_ai_command = {}
	if ai_confirm_modal:
		ai_confirm_modal.visible = false
	_log("[AI CANCELLED] Proposal for Step %d cancelled by user." % cancelled_step)
	return { "success": true, "cancelled": true, "step": cancelled_step }

func _execute_auto_play_step() -> void:
	auto_play_step += 1
	var hero = get_active_hero()
	if hero.size() == 0:
		return

	match auto_play_step:
		1:
			_log("[AUTO-PLAY] Step 1: %s rolls 2d6 movement dice..." % str(hero.get("name")))
			roll_movement_dice()
		2:
			var target = Vector2i(4, 1) if starting_stair == Vector2i(0, 1) else Vector2i(2, 0)
			_log("[AUTO-PLAY] Step 2: %s advances down the corridor toward heavy dungeon door at (%d, %d)." % [hero.get("name"), target.x, target.y])
			move_hero(target)
		3:
			var door_from = Vector2i(4, 1) if starting_stair == Vector2i(0, 1) else Vector2i(2, 0)
			var door_to = Vector2i(4, 2) if starting_stair == Vector2i(0, 1) else Vector2i(2, 1)
			_log("[AUTO-PLAY] Step 3: %s kicks open the ancient wooden door! Fog of War lifts!" % str(hero.get("name")))
			open_door(door_from, door_to)
		4:
			var room_target = Vector2i(4, 3) if starting_stair == Vector2i(0, 1) else Vector2i(2, 2)
			_log("[AUTO-PLAY] Step 4: %s strides boldly into the revealed chamber!" % str(hero.get("name")))
			move_hero(room_target)
		5:
			_log("[AUTO-PLAY] Step 5: %s swings Broadsword at enemy monster!" % str(hero.get("name")))
			attack_adjacent_monster()
		6:
			_log("[AUTO-PLAY] Step 6: Barbarian ends turn. Next hero: Dwarf.")
			end_turn()
		7:
			_log("[AUTO-PLAY] Step 7: Dwarf rolls movement and enters the chamber.")
			roll_movement_dice()
			var dwarf_pos = Vector2i(3, 3) if starting_stair == Vector2i(0, 1) else Vector2i(3, 1)
			move_hero(dwarf_pos)
		8:
			_log("[AUTO-PLAY] Step 8: Dwarf searches room for treasure and hidden traps!")
			search_room()
		9:
			_log("[AUTO-PLAY] Step 9: Hero phase concludes! Game Master / Zargon AI Phase begins!")
			end_turn()
			current_phase = "gm_phase"
			ai_monster_turn()
		10:
			_log("[AUTO-PLAY] Step 10: Round 2 begins! E2E Gameplay & Turn Cycle verified.")
			CartridgeManager.auto_play_enabled = false

func get_active_hero() -> Dictionary:
	if heroes.size() == 0:
		return {}
	return heroes[active_hero_idx % heroes.size()]

func get_active_monster() -> Dictionary:
	var live_monsters = monsters.filter(func(m): return m.get("is_alive", false))
	if live_monsters.size() == 0:
		return {}
	return live_monsters[active_monster_idx % live_monsters.size()]

func get_adjacent_monsters() -> Array[Dictionary]:
	var hero = get_active_hero()
	if hero.is_empty():
		return []
	var h_pos: Vector2i = hero.get("grid_pos", Vector2i(-1, -1))
	var res: Array[Dictionary] = []
	for m in monsters:
		if m.get("is_alive", false):
			var m_pos: Vector2i = m.get("grid_pos", Vector2i(-1, -1))
			if absi(m_pos.x - h_pos.x) + absi(m_pos.y - h_pos.y) == 1:
				res.append(m)
	return res

func get_adjacent_closed_doors() -> Array[Dictionary]:
	var hero = get_active_hero()
	if hero.is_empty():
		return []
	var h_pos: Vector2i = hero.get("grid_pos", Vector2i(-1, -1))
	var res: Array[Dictionary] = []
	for d in doors:
		if not d.get("is_open", false):
			if d.get("is_secret", false) and not d.get("is_revealed", false):
				continue
			var from_pos = Vector2i(d.get("from", [0, 0])[0], d.get("from", [0, 0])[1])
			var to_pos = Vector2i(d.get("to", [0, 0])[0], d.get("to", [0, 0])[1])
			if (h_pos == from_pos and absi(h_pos.x - to_pos.x) + absi(h_pos.y - to_pos.y) == 1) or \
			   (h_pos == to_pos and absi(h_pos.x - from_pos.x) + absi(h_pos.y - from_pos.y) == 1):
				res.append(d)
	return res

func can_search_room() -> bool:
	var hero = get_active_hero()
	if hero.is_empty() or has_acted_this_turn:
		return false
	var h_pos: Vector2i = hero.get("grid_pos", Vector2i(-1, -1))
	var rm = _get_room_at(h_pos)
	var r_id = str(rm.get("id", ""))
	if r_id == "" or not revealed_rooms.has(r_id):
		return false
	for m in monsters:
		if m.get("is_alive", false) and m.get("roomId", "") == r_id:
			return false
	return true

func _unhandled_input(event: InputEvent) -> void:
	if is_ai_step_pending:
		if event is InputEventKey and event.pressed:
			if event.keycode == KEY_ESCAPE:
				cancel_ai_step()
				get_viewport().set_input_as_handled()
				return
			elif event.keycode == KEY_ENTER or event.keycode == KEY_KP_ENTER:
				confirm_and_execute_ai_step()
				get_viewport().set_input_as_handled()
				return
		return

	if not active_dice_animation.is_empty():
		if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
			if active_dice_animation.get("settled", false):
				var mouse_pos = get_global_mouse_position()
				var anim_center = active_dice_animation.get("center", board_offset + Vector2(grid_cols * tile_size * 0.5, grid_rows * tile_size * 0.45))
				var tray_w = float(active_dice_animation.get("tray_width", 380.0))
				var tray_h = float(active_dice_animation.get("tray_height", 180.0))
				var tray_rect = Rect2(anim_center.x - tray_w * 0.5, anim_center.y - tray_h * 0.5, tray_w, tray_h)
				dismiss_active_dice_roll()
				if tray_rect.has_point(mouse_pos):
					get_viewport().set_input_as_handled()
					return
		elif event is InputEventKey and event.pressed:
			if event.keycode == KEY_ESCAPE or event.keycode == KEY_SPACE or event.keycode == KEY_ENTER or event.keycode == KEY_KP_ENTER:
				if active_dice_animation.get("settled", false):
					dismiss_active_dice_roll()
					get_viewport().set_input_as_handled()
					return

	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		var mouse_pos = get_global_mouse_position()
		var local_pos = mouse_pos - board_offset
		var tx = int(floor(local_pos.x / tile_size))
		var ty = int(floor(local_pos.y / tile_size))
		if tx >= 0 and tx < grid_cols and ty >= 0 and ty < grid_rows:
			_handle_tile_click(Vector2i(tx, ty))

func _handle_tile_click(tile: Vector2i) -> void:
	if current_phase != "hero_phase" or current_role != "player":
		return
	var hero = get_active_hero()
	if hero.is_empty():
		return
	var h_pos: Vector2i = hero.get("grid_pos", Vector2i(-1, -1))

	# If clicked on adjacent closed door, open it!
	for d in doors:
		if not d.get("is_open", false):
			if d.get("is_secret", false) and not d.get("is_revealed", false):
				continue
			var from_pos = Vector2i(d.get("from", [0, 0])[0], d.get("from", [0, 0])[1])
			var to_pos = Vector2i(d.get("to", [0, 0])[0], d.get("to", [0, 0])[1])
			if (tile == from_pos or tile == to_pos) and (h_pos == from_pos or h_pos == to_pos):
				open_door(from_pos, to_pos)
				return

	# If clicked on adjacent monster, attack!
	for m in monsters:
		if m.get("is_alive", false) and m.get("grid_pos") == tile:
			if absi(tile.x - h_pos.x) + absi(tile.y - h_pos.y) == 1:
				if not has_acted_this_turn:
					attack_adjacent_monster(str(m.get("id", "")))
				return

	# If haven't rolled movement yet, roll dice first!
	if not movement_rolled:
		if movement_closed or (moved_before_action and has_acted_this_turn):
			return
		roll_movement_dice()

	# If hero has movement, move to tile
	if movement_remaining > 0:
		move_hero(tile)

func dismiss_active_dice_roll() -> void:
	if not active_dice_animation.is_empty():
		active_dice_animation = {}
		queue_redraw_all()

func roll_movement_dice() -> Dictionary:
	if movement_closed or (moved_before_action and has_acted_this_turn):
		_log("[RULE] HeroQuest Rule: Movement phase has concluded for this turn!")
		return {}

	var hero = get_active_hero()
	var armors: Array = hero.get("equipped_armor", [])
	var has_plate = armors.has("plate_mail")
	var is_swift = hero.get("swift_wind_active", false)
	var roll = {}
	var dice_vals: Array = []

	if has_plate:
		var d1 = randi_range(1, 6)
		roll = { "total": d1, "d1": d1, "d2": 0, "plate_mail": true }
		dice_vals = [d1]
		_log("[MOVE] %s wears Plate Mail: movement restricted to 1d6: [%d] = %d squares!" % [
			hero.get("name", "Hero"), d1, d1
		])
	elif is_swift:
		var r1 = TabletopDice.roll_movement()
		var r2 = TabletopDice.roll_movement()
		var total = r1.total + r2.total
		roll = { "total": total, "d1": r1.total, "d2": r2.total, "swift_wind": true }
		dice_vals = [r1.d1, r1.d2, r2.d1, r2.d2]
		hero["swift_wind_active"] = false
		_log("[MOVE] Swift Wind carries %s forward at double speed: 4d6 = %d squares!" % [
			hero.get("name", "Hero"), total
		])
	else:
		roll = TabletopDice.roll_movement()
		dice_vals = [roll.d1, roll.d2]
		_log("[MOVE] %s rolled 2d6 movement: [%d, %d] = %d squares!" % [
			hero.get("name", "Hero"), roll.d1, roll.d2, roll.total
		])

	movement_remaining = roll.total
	movement_rolled = true
	turn_state = "moving"
	movement_start_pos = hero.get("grid_pos", Vector2i(-1, -1))
	movement_trail = [movement_start_pos]
	show_flashy_roll_number(int(roll.get("total", 0)))
	trigger_movement_dice_roll(roll, str(hero.get("name", "Hero")), dice_vals)
	_update_ui()
	queue_redraw_all()
	return roll

func find_path(start: Vector2i, goal: Vector2i, moving_hero_idx: int = -1) -> Array[Vector2i]:
	if start == goal:
		return [start]
	# Rule 1: No sharing squares! Characters cannot finish their turn on a square occupied by another model.
	if is_tile_occupied(goal, moving_hero_idx):
		return []

	var pass_rock = false
	var veil_mist = false
	if moving_hero_idx >= 0 and moving_hero_idx < heroes.size():
		pass_rock = heroes[moving_hero_idx].get("pass_through_rock_active", false)
		veil_mist = heroes[moving_hero_idx].get("veil_of_mist_active", false)

	var queue: Array[Vector2i] = [start]
	var came_from: Dictionary = { start: start }
	var dirs = [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]

	while queue.size() > 0:
		var cur = queue.pop_front()
		if cur == goal:
			var path: Array[Vector2i] = []
			var trace = goal
			while trace != start:
				path.append(trace)
				trace = came_from[trace]
			path.append(start)
			path.reverse()
			return path

		for d in dirs:
			var nxt = cur + d
			if nxt.x < 0 or nxt.x >= grid_cols or nxt.y < 0 or nxt.y >= grid_rows:
				continue
			if came_from.has(nxt):
				continue
			if not pass_rock:
				if has_wall_between(cur, nxt) or is_tile_wall_blocked(nxt):
					continue
				var rm = _get_room_at(nxt)
				var rm_id = str(rm.get("id", ""))
				if rm_id != "" and not revealed_rooms.has(rm_id):
					continue
			# Rule 2: Heroes generally cannot move through squares occupied by monsters unless Veil of Mist is active
			if not veil_mist and is_tile_occupied_by_monster(nxt):
				continue
			# Rule 3: Heroes CAN pass through friendly heroes, but cannot end on them
			came_from[nxt] = cur
			queue.append(nxt)

	return []

func move_hero(target_pos: Vector2i) -> bool:
	var hero = get_active_hero()
	if hero.size() == 0:
		return false

	var curr = hero.get("grid_pos", Vector2i(1, 1))
	if curr == target_pos:
		return true

	if movement_trail.is_empty():
		movement_start_pos = curr
		movement_trail = [curr]

	# HeroQuest Turn Structure: Movement and Action No-Splitting Rule
	# You cannot split movement before and after an attack/action.
	# If the hero moved before taking an action, any action taken closes movement permanently.
	if movement_closed or (moved_before_action and has_acted_this_turn):
		_log("[RULE] HeroQuest Rule: Movement cannot be split before and after an action! Turn is complete.")
		return false

	# Standard HeroQuest Rule: No Sharing Squares
	if is_tile_occupied(target_pos, active_hero_idx):
		if is_tile_occupied_by_hero(target_pos, active_hero_idx):
			var occ_hero = get_hero_at(target_pos)
			_log("[WARNING] Square (%d, %d) is occupied by %s! HeroQuest rules strictly forbid sharing a space." % [
				target_pos.x, target_pos.y, occ_hero.get("name", "another hero")
			])
		else:
			var occ_monster = get_monster_at(target_pos)
			_log("[WARNING] Square (%d, %d) is occupied by %s! Cannot end movement on monster squares." % [
				target_pos.x, target_pos.y, occ_monster.get("name", "monster")
			])
		return false

	var path = find_path(curr, target_pos, active_hero_idx)
	if path.is_empty():
		_log("[WARNING] Path to (%d, %d) is blocked!" % [target_pos.x, target_pos.y])
		return false

	var cost = path.size() - 1
	if movement_remaining <= 0:
		_log("[WARNING] No movement remaining this turn!")
		return false
	if cost > movement_remaining:
		_log("[WARNING] Target out of movement range (need %d, have %d)" % [cost, movement_remaining])
		return false

	var final_pos = target_pos
	var actual_cost = cost
	var sprung_trap: Dictionary = {}

	# Check each step along the path for traps
	for step_idx in range(1, path.size()):
		var step_tile = path[step_idx]
		for tr in traps:
			var tx = int(tr.get("x", tr.get("position", [0, 0])[0]))
			var ty = int(tr.get("y", tr.get("position", [0, 0])[1]))
			if Vector2i(tx, ty) == step_tile and not tr.get("disarmed", false) and not tr.get("spent", false):
				sprung_trap = tr
				final_pos = step_tile
				actual_cost = step_idx
				break
		if not sprung_trap.is_empty():
			break

	hero["grid_pos"] = final_pos

	for step_idx in range(1, actual_cost + 1):
		var step_pos = path[step_idx]
		if movement_trail.size() > 1 and movement_trail[movement_trail.size() - 2] == step_pos:
			movement_trail.pop_back()
		else:
			movement_trail.append(step_pos)

	if not sprung_trap.is_empty():
		sprung_trap["detected"] = true
		sprung_trap["sprung"] = true
		movement_remaining = 0 # Stepping into a trap ends remaining movement
		var t_type = str(sprung_trap.get("type", sprung_trap.get("trapType", "pit"))).to_lower()

		if "spear" in t_type:
			# Spear Trap: Rolls 1 combat die. Skull = 1 damage, Shield = 0 damage (dodged).
			# Trap is spent and square becomes safe!
			sprung_trap["spent"] = true
			var roll_skull = (randi() % 2 == 0)
			var base_dmg = int(sprung_trap.get("damageDice", 1))
			var dmg = base_dmg if roll_skull else 0
			if dmg > 0:
				hero["current_bp"] = maxi(0, hero.get("current_bp", 1) - dmg)
				_log("[TRAP] 🔺 Spear trap springs at (%d, %d)! %s suffers %d damage (Remaining BP: %d). The spears are now spent and the tile is safe." % [
					final_pos.x, final_pos.y, hero.get("name"), dmg, hero.get("current_bp")
				])
				spawn_floating_text(final_pos, "-%d HP SPEAR TRAP" % dmg, Color(1.0, 0.25, 0.2), 1.6)
			else:
				_log("[TRAP] 🔺 Spear trap springs at (%d, %d)! %s swiftly dodges the spears (0 damage)! The spears are now spent and the tile is safe." % [
					final_pos.x, final_pos.y, hero.get("name")
				])
				spawn_floating_text(final_pos, "0 DMG DODGED!", Color(0.2, 0.9, 0.4), 1.6)

		elif "falling" in t_type or "boulder" in t_type or "rock" in t_type:
			# Falling Block Trap: drops rubble / solid masonry block on the tile!
			var num_dice = int(sprung_trap.get("damageDice", 3))
			var skulls = 0
			for _d in range(num_dice):
				if randi() % 2 == 0:
					skulls += 1
			var dmg = maxi(1, skulls)
			hero["current_bp"] = maxi(0, hero.get("current_bp", 1) - dmg)

			# Hero pushed back to safe entry tile along path before falling block!
			var trap_tile = final_pos
			var safe_pos = path[maxi(0, actual_cost - 1)]
			hero["grid_pos"] = safe_pos
			final_pos = safe_pos

			# Permanently place a wall block at the trap tile!
			wall_blocks.append({
				"x": trap_tile.x,
				"y": trap_tile.y,
				"type": "falling-block",
				"width": 1,
				"height": 1
			})
			_blocked_wall_tiles[trap_tile] = true
			sprung_trap["blocked"] = true
			_log("[TRAP] 🪨 FALLING BLOCK TRAP! Rubble crashes down at (%d, %d)! %s suffers %d damage (Remaining BP: %d). The path is permanently blocked by fallen rock!" % [
				trap_tile.x, trap_tile.y, hero.get("name"), dmg, hero.get("current_bp")
			])
			spawn_floating_text(trap_tile, "FALLEN BLOCK!", Color(0.9, 0.6, 0.1), 1.8)
			if dmg > 0:
				spawn_floating_text(safe_pos, "-%d HP" % dmg, Color(1.0, 0.2, 0.2), 1.6)

		else:
			# Pit Trap: 1 BP damage with NO defense roll, movement ends, cannot be disarmed once sprung
			var dmg = int(sprung_trap.get("damageDice", 1))
			hero["current_bp"] = maxi(0, hero.get("current_bp", 1) - dmg)
			_log("[TRAP] 🕳️ Pit trap sprung at (%d, %d)! %s plunges into the pit and suffers %d damage (Remaining BP: %d). Movement halts!" % [
				final_pos.x, final_pos.y, hero.get("name"), dmg, hero.get("current_bp")
			])
			spawn_floating_text(final_pos, "-%d HP PIT TRAP" % dmg, Color(1.0, 0.2, 0.2), 1.5)
	else:
		movement_remaining = maxi(0, movement_remaining - actual_cost)

	has_moved_this_turn = true
	if not has_acted_this_turn:
		moved_before_action = true

	if movement_remaining == 0:
		if has_acted_this_turn:
			turn_state = "turn_complete"
			movement_closed = true
		else:
			turn_state = "moving"

	if hero.get("pass_through_rock_active", false):
		hero["pass_through_rock_active"] = false
		_log("[SPELL] Pass Through Rock fades away as %s materializes in solid space." % hero.get("name"))
	if hero.get("veil_of_mist_active", false):
		hero["veil_of_mist_active"] = false
		_log("[SPELL] The Veil of Mist dissipates from around %s." % hero.get("name"))

	update_party_vision()
	_log("[MOVE] %s moved to (%d, %d). Remaining movement: %d" % [
		hero.get("name"), final_pos.x, final_pos.y, movement_remaining
	])
	_update_ui()
	queue_redraw_all()
	return true

func open_door(from_pos: Vector2i, to_pos: Vector2i) -> bool:
	var d = _get_door_between(from_pos, to_pos)
	if d.is_empty():
		return false
	if d.get("is_secret", false) and not d.get("is_revealed", false):
		_log("[WARNING] Cannot open an undiscovered wall segment.")
		return false

	d["is_open"] = true

	var f = d.get("from", [0, 0])
	var t = d.get("to", [0, 0])

	var rooms_to_reveal: Array[String] = []
	var explicit_room = str(d.get("room", ""))
	if explicit_room != "":
		rooms_to_reveal.append(explicit_room)

	var r1 = _get_room_at(Vector2i(f[0], f[1]))
	var r2 = _get_room_at(Vector2i(t[0], t[1]))
	if r1.size() > 0:
		var r1_id = str(r1.get("id", ""))
		if not rooms_to_reveal.has(r1_id):
			rooms_to_reveal.append(r1_id)
	if r2.size() > 0:
		var r2_id = str(r2.get("id", ""))
		if not rooms_to_reveal.has(r2_id):
			rooms_to_reveal.append(r2_id)

	for r_id in rooms_to_reveal:
		reveal_room_by_id(r_id)

	var hero = get_active_hero()
	var hero_name = get_hero_character_name(hero) if not hero.is_empty() else "Hero"
	if d.get("is_secret", false):
		_log("[SECRET DOOR] %s swings open the concealed revolving stone secret door!" % hero_name)
		spawn_floating_text(Vector2i(t[0], t[1]), "🚪 SECRET DOOR OPENED", Color(1.0, 0.85, 0.2), 1.8)
	else:
		_log("[DOOR] %s opens the door." % hero_name)

	update_party_vision()
	_update_ui()
	queue_redraw_all()
	return true

# --- Hero Identification Helpers (Name + Class) ---
func get_hero_character_name(h: Dictionary) -> String:
	if h.has("characterName") and str(h.get("characterName")).strip_edges() != "":
		return str(h.get("characterName")).strip_edges()
	if h.has("character_name") and str(h.get("character_name")).strip_edges() != "":
		return str(h.get("character_name")).strip_edges()

	var h_id = str(h.get("id", "")).to_lower()
	var raw_name = str(h.get("name", "")).strip_edges()
	var h_class = get_hero_class_name(h)

	if raw_name != "" and raw_name.to_lower() != h_id and raw_name.to_lower() != h_class.to_lower():
		return raw_name

	match h_id:
		"barbarian": return "Rogar"
		"dwarf": return "Dorgan"
		"elf": return "Ladril"
		"wizard": return "Telor"
		_: return raw_name if raw_name != "" else "Hero"

func get_hero_class_name(h: Dictionary) -> String:
	if h.has("heroClass") and str(h.get("heroClass")).strip_edges() != "":
		return str(h.get("heroClass")).strip_edges()
	if h.has("hero_class") and str(h.get("hero_class")).strip_edges() != "":
		return str(h.get("hero_class")).strip_edges()
	if h.has("class") and str(h.get("class")).strip_edges() != "":
		return str(h.get("class")).strip_edges()
	var h_id = str(h.get("id", "")).to_lower()
	match h_id:
		"barbarian": return "Barbarian"
		"dwarf": return "Dwarf"
		"elf": return "Elf"
		"wizard": return "Wizard"
		_: return "Hero"

func get_hero_display_title(h: Dictionary) -> String:
	var h_name = get_hero_character_name(h)
	var h_class = get_hero_class_name(h)
	if h_name.to_lower() == h_class.to_lower():
		return h_class
	if h_name.to_lower().contains(h_class.to_lower()):
		return h_name
	return "%s (%s)" % [h_name, h_class]

# --- HeroQuest Combat & Equipment Calculations ---
func get_hero_attack_dice(h: Dictionary) -> int:
	var w_id = str(h.get("equipped_weapon", ""))
	var w = HeroQuestEquipment.get_weapon(w_id)
	var base_atk = int(w.get("attack_dice", h.get("attackDice", 1)))
	if h.get("courage_active", false):
		base_atk += 2
	return base_atk

func get_hero_defend_dice(h: Dictionary) -> int:
	var armors: Array = h.get("equipped_armor", [])
	var base_def = 2
	if armors.has("plate_mail"):
		base_def = 4
	elif armors.has("chain_mail"):
		base_def = 3
	else:
		base_def = int(h.get("defendDice", 2))

	if armors.has("helmet"):
		base_def += 1
	if armors.has("shield"):
		base_def += 1
	if h.get("rock_skin_active", false):
		base_def += 1

	return base_def

func equip_item(hero_id: String, item_id: String) -> Dictionary:
	var hero: Dictionary = {}
	for h in heroes:
		if h.get("id") == hero_id:
			hero = h
			break
	if hero.is_empty():
		return { "success": false, "error": "Hero not found: " + hero_id }

	var can_res = HeroQuestEquipment.can_hero_equip(hero_id, item_id)
	if not can_res.get("can_equip", false):
		_log("[ERROR] %s" % can_res.get("reason", "Cannot equip"))
		return { "success": false, "error": can_res.get("reason") }

	var w = HeroQuestEquipment.get_weapon(item_id)
	if not w.is_empty():
		var armors: Array = hero.get("equipped_armor", [])
		if w.get("two_handed", false) and armors.has("shield"):
			_log("[ERROR] Cannot equip two-handed weapon %s while wielding a Shield!" % w.get("name"))
			return { "success": false, "error": "Cannot equip two-handed weapon while wielding a Shield" }
		hero["equipped_weapon"] = item_id
		var inv: Array = hero.get("inventory", [])
		if not inv.has(item_id):
			inv.append(item_id)
			hero["inventory"] = inv
		_log("[EQUIP] %s equipped %s (Attack Dice: %d)!" % [hero.get("name"), w.get("name"), get_hero_attack_dice(hero)])
		_update_ui()
		queue_redraw_all()
		return { "success": true, "equipped": item_id, "attackDice": get_hero_attack_dice(hero) }

	var a = HeroQuestEquipment.get_armor(item_id)
	if not a.is_empty():
		var slot = str(a.get("slot", "body"))
		var armors: Array = hero.get("equipped_armor", [])
		if a.get("incompatible_with_two_handed", false):
			var cur_w = HeroQuestEquipment.get_weapon(hero.get("equipped_weapon", ""))
			if cur_w.get("two_handed", false):
				_log("[ERROR] Cannot equip Shield while wielding two-handed %s!" % cur_w.get("name"))
				return { "success": false, "error": "Cannot equip Shield while wielding a two-handed weapon" }
		if slot == "body":
			armors.erase("chain_mail")
			armors.erase("plate_mail")
		if not armors.has(item_id):
			armors.append(item_id)
		hero["equipped_armor"] = armors
		var inv: Array = hero.get("inventory", [])
		if not inv.has(item_id):
			inv.append(item_id)
			hero["inventory"] = inv
		_log("[EQUIP] %s equipped %s (Defend Dice: %d)!" % [hero.get("name"), a.get("name"), get_hero_defend_dice(hero)])
		_update_ui()
		queue_redraw_all()
		return { "success": true, "equipped": item_id, "defendDice": get_hero_defend_dice(hero) }

	return { "success": false, "error": "Unknown item: " + item_id }

func unequip_item(hero_id: String, item_id: String) -> Dictionary:
	var hero: Dictionary = {}
	for h in heroes:
		if h.get("id") == hero_id:
			hero = h
			break
	if hero.is_empty():
		return { "success": false, "error": "Hero not found: " + hero_id }

	if hero.get("equipped_weapon") == item_id:
		hero["equipped_weapon"] = "dagger" if hero.get("id") == "wizard" else "broadsword"
		_log("[EQUIP] %s unequipped weapon %s." % [hero.get("name"), item_id])
		_update_ui()
		queue_redraw_all()
		return { "success": true, "unequipped": item_id }

	var armors: Array = hero.get("equipped_armor", [])
	if armors.has(item_id):
		armors.erase(item_id)
		hero["equipped_armor"] = armors
		_log("[EQUIP] %s unequipped armor %s." % [hero.get("name"), item_id])
		_update_ui()
		queue_redraw_all()
		return { "success": true, "unequipped": item_id }

	return { "success": false, "error": "Item not equipped" }

func use_item(hero_id: String = "", item_id: String = "", target_id: String = "") -> Dictionary:
	var hero: Dictionary = {}
	if hero_id != "":
		for h in heroes:
			if str(h.get("id")) == hero_id:
				hero = h
				break
	if hero.is_empty():
		hero = get_active_hero()
	if hero.is_empty():
		return { "success": false, "error": "No active hero to use item" }

	var hid = str(hero.get("id"))
	var h_name = str(hero.get("name", "Hero"))
	var inv: Array = hero.get("inventory", []).duplicate()
	var item_key = item_id.to_lower().strip_edges()

	# Check if item exists in hero's inventory
	var found_idx = -1
	for i in range(inv.size()):
		if str(inv[i]).to_lower().strip_edges() == item_key:
			found_idx = i
			break

	if found_idx == -1:
		# If not in inventory, check if it's currently equipped weapon or armor
		if hero.get("equipped_weapon", "") == item_id or hero.get("equipped_armor", []).has(item_id):
			return unequip_item(hid, item_id)
		return { "success": false, "error": "Item '%s' not in %s's inventory" % [item_id, h_name] }

	var hero_pos = hero.get("grid_pos", Vector2i(-1, -1))
	var hero_screen = board_offset + Vector2((hero_pos.x + 0.5) * tile_size, (hero_pos.y + 0.5) * tile_size)

	# 1. Consumable items
	if item_key == "healing_potion" or item_key == "potion_of_healing":
		var target_h = hero
		if target_id != "":
			for h in heroes:
				if str(h.get("id")) == target_id:
					target_h = h
					break
		var cur_bp = int(target_h.get("current_bp", 1))
		var max_bp = int(target_h.get("bodyPoints", 8))
		var heal_amount = 4
		var new_bp = mini(max_bp, cur_bp + heal_amount)
		var healed = new_bp - cur_bp
		target_h["current_bp"] = new_bp

		inv.remove_at(found_idx)
		hero["inventory"] = inv

		var th_pos = target_h.get("grid_pos", hero_pos)
		var th_screen = board_offset + Vector2((th_pos.x + 0.5) * tile_size, (th_pos.y + 0.5) * tile_size)
		spawn_burst_vfx(th_screen, Color(0.2, 0.9, 0.4), 45.0, 0.45)
		spawn_floating_text(th_pos, "+%d BP" % healed, Color(0.2, 0.9, 0.3))
		_log("[ITEM] %s drinks %s! Restores %d Body Points (%d/%d BP)." % [
			target_h.get("name"), "Potion of Healing", healed, new_bp, max_bp
		])

		_update_ui()
		if item_use_modal and item_use_modal.visible:
			_update_item_use_modal_ui()
		queue_redraw_all()
		return {
			"success": true,
			"item": item_id,
			"action": "heal",
			"healed": healed,
			"current_bp": new_bp,
			"max_bp": max_bp,
			"target": str(target_h.get("id"))
		}

	elif item_key == "potion_of_strength":
		hero["courage_active"] = true
		inv.remove_at(found_idx)
		hero["inventory"] = inv
		spawn_burst_vfx(hero_screen, Color(0.9, 0.3, 0.2), 40.0, 0.4)
		spawn_floating_text(hero_pos, "+2 ATK DICE", Color(1.0, 0.4, 0.3))
		_log("[ITEM] %s quaffs Potion of Strength! Attack dice increased by +2." % h_name)
		_update_ui()
		if item_use_modal and item_use_modal.visible:
			_update_item_use_modal_ui()
		queue_redraw_all()
		return { "success": true, "item": item_id, "action": "strength_bonus" }

	elif item_key == "potion_of_speed":
		hero["swift_wind_active"] = true
		inv.remove_at(found_idx)
		hero["inventory"] = inv
		spawn_cyclone_vfx(hero_screen, Color(0.3, 0.8, 1.0), 0.5)
		spawn_floating_text(hero_pos, "2X SPEED", Color(0.3, 0.9, 1.0))
		_log("[ITEM] %s quaffs Potion of Speed! Movement dice doubled to 4d6 on next turn." % h_name)
		_update_ui()
		if item_use_modal and item_use_modal.visible:
			_update_item_use_modal_ui()
		queue_redraw_all()
		return { "success": true, "item": item_id, "action": "speed_bonus" }

	# 2. Weapons
	var w = HeroQuestEquipment.get_weapon(item_id)
	if not w.is_empty():
		if hero.get("equipped_weapon") == item_id:
			_log("[ITEM] %s already has %s equipped." % [h_name, w.get("name")])
			return { "success": true, "equipped": item_id, "already_equipped": true }
		var eq_res = equip_item(hid, item_id)
		if item_use_modal and item_use_modal.visible:
			_update_item_use_modal_ui()
		return eq_res

	# 3. Armor
	var a = HeroQuestEquipment.get_armor(item_id)
	if not a.is_empty():
		var armors: Array = hero.get("equipped_armor", [])
		if armors.has(item_id):
			var uq_res = unequip_item(hid, item_id)
			if item_use_modal and item_use_modal.visible:
				_update_item_use_modal_ui()
			return uq_res
		var eq_res = equip_item(hid, item_id)
		if item_use_modal and item_use_modal.visible:
			_update_item_use_modal_ui()
		return eq_res

	return { "success": false, "error": "Unknown item effect: " + item_id }

func _conclude_action_turn_state() -> void:
	has_acted_this_turn = true
	if moved_before_action:
		# Authentic HeroQuest Turn Structure:
		# If the hero moved before taking an action, taking the action immediately
		# concludes their movement phase. Any remaining movement roll is forfeited.
		# Movement cannot be split before and after an attack/action.
		movement_remaining = 0
		movement_closed = true
		turn_state = "turn_complete"
		_log("[RULE] HeroQuest Rules: Action taken after moving. Movement phase permanently concluded.")
	elif movement_rolled and movement_remaining == 0:
		turn_state = "turn_complete"
		movement_closed = true
	else:
		# Action taken first: hero can still roll and/or complete movement phase
		turn_state = "action_taken"

# --- Hero & Monster Combat Resolution ---
func attack_adjacent_monster(monster_id: String = "", weapon_id: String = "") -> Dictionary:
	var hero = get_active_hero()
	if hero.is_empty():
		return { "success": false, "error": "No active hero" }

	if has_acted_this_turn:
		_log("[ERROR] %s has already taken an action this turn!" % hero.get("name", "Hero"))
		return { "success": false, "error": "Already acted this turn" }

	if weapon_id != "":
		hero["equipped_weapon"] = weapon_id

	var cur_w_id = str(hero.get("equipped_weapon", "broadsword"))
	var w_def = HeroQuestEquipment.get_weapon(cur_w_id)
	var hero_pos = hero.get("grid_pos", Vector2i(-1, -1))

	var target_m: Dictionary = {}
	for m in monsters:
		if m.get("is_alive", false):
			var mid = str(m.get("id", ""))
			var mslug = str(m.get("slug", ""))
			if monster_id != "" and (mid == monster_id or mslug == monster_id or mid.ends_with(monster_id) or monster_id.ends_with(mid)):
				target_m = m
				break
			elif monster_id == "":
				var m_pos = m.get("grid_pos", Vector2i(-1, -1))
				var dx = absi(hero_pos.x - m_pos.x)
				var dy = absi(hero_pos.y - m_pos.y)
				if w_def.get("ranged", false):
					if not (dx <= 1 and dy <= 1) and has_line_of_sight(hero_pos, m_pos):
						target_m = m
						break
				elif w_def.get("diagonal", false):
					if dx <= 1 and dy <= 1 and (dx + dy > 0):
						target_m = m
						break
				else:
					if dx + dy == 1:
						target_m = m
						break

	if target_m.is_empty():
		_log("No monster in reach of %s!" % w_def.get("name", "weapon"))
		return { "success": false, "error": "No monster in weapon range" }

	var m_pos = target_m.get("grid_pos", Vector2i(-1, -1))
	var dx = absi(hero_pos.x - m_pos.x)
	var dy = absi(hero_pos.y - m_pos.y)

	# Validate weapon rules strictly
	if w_def.get("ranged", false):
		if cur_w_id == "crossbow":
			if dx <= 1 and dy <= 1:
				_log("[ATTACK] Crossbow cannot target adjacent monsters!")
				return { "success": false, "error": "Crossbow cannot target adjacent monsters" }
			if not has_line_of_sight(hero_pos, m_pos):
				_log("[ATTACK] No clear line of sight to target for Crossbow!")
				return { "success": false, "error": "No line of sight to target" }
			spawn_projectile_vfx(hero_pos, m_pos, Color(0.8, 0.7, 0.5), 0.3)
		elif cur_w_id == "dagger":
			if dx > 1 or dy > 1:
				if not has_line_of_sight(hero_pos, m_pos):
					_log("[ATTACK] No line of sight to throw Dagger!")
					return { "success": false, "error": "No line of sight to target" }
				spawn_projectile_vfx(hero_pos, m_pos, Color(0.85, 0.85, 0.95), 0.25)
				_log("[ATTACK] %s throws a dagger at %s!" % [hero.get("name"), target_m.get("name")])
	elif w_def.get("diagonal", false):
		if not (dx <= 1 and dy <= 1 and (dx + dy > 0)):
			_log("[ATTACK] Target is out of reach of %s!" % w_def.get("name"))
			return { "success": false, "error": "Target out of reach" }
		var center_screen = board_offset + Vector2((m_pos.x + 0.5) * tile_size, (m_pos.y + 0.5) * tile_size)
		spawn_slash_vfx(center_screen, 0.785)
	else:
		if dx + dy != 1:
			_log("[ATTACK] %s cannot attack diagonally or at range!" % w_def.get("name", "Broadsword"))
			return { "success": false, "error": "Weapon requires orthogonal adjacency" }
		var center_screen = board_offset + Vector2((m_pos.x + 0.5) * tile_size, (m_pos.y + 0.5) * tile_size)
		spawn_slash_vfx(center_screen, 0.0)

	var atk_dice = get_hero_attack_dice(hero)
	var def_dice = int(target_m.get("defendDice", 2))
	if target_m.get("is_sleeping", false):
		def_dice = 0

	var res = TabletopDice.resolve_combat(atk_dice, def_dice, false)
	var will_defeat = (res.wounds >= int(target_m.get("current_bp", 1)))
	trigger_combat_dice_roll(res, get_hero_display_title(hero), str(target_m.get("name", "Monster")), false, will_defeat)
	_log("[ATTACK] %s attacks %s with %s (%d dice)! Rolled %d Skulls. %s defended with %d Black Shields." % [
		hero.get("name"), target_m.get("name"), w_def.get("name", "weapon"), atk_dice, res.total_skulls, target_m.get("name"), res.effective_shields
	])

	var hp_subtracted = 0
	var prev_bp = int(target_m.get("current_bp", 1))
	if res.wounds > 0:
		target_m["current_bp"] = maxi(0, prev_bp - res.wounds)
		hp_subtracted = prev_bp - int(target_m.get("current_bp", 0))
		_log("[HIT] Wounds inflicted: %d! %s HP: %d" % [res.wounds, target_m.get("name"), target_m.get("current_bp")])
		spawn_floating_text(m_pos, "-%d HP" % res.wounds, Color(0.95, 0.2, 0.2))
		if target_m.get("current_bp") <= 0:
			target_m["is_alive"] = false
			_log("[DEFEATED] %s is DEFEATED!" % target_m.get("name"))
			spawn_floating_text(m_pos, "DEFEATED!", Color(1.0, 0.1, 0.1), 1.5)
	elif hp_subtracted == 0 and res.wounds == 0:
		_log("[BLOCKED] Attack was completely blocked by %s!" % target_m.get("name"))
		spawn_floating_text(m_pos, "BLOCKED!", Color(0.7, 0.8, 1.0))

	if cur_w_id == "dagger" and (dx > 1 or dy > 1):
		hero["equipped_weapon"] = "fists"

	_conclude_action_turn_state()

	last_combat_result = res
	_update_ui()
	queue_redraw_all()
	return { "success": true, "result": res, "target": target_m.get("id"), "remaining_bp": target_m.get("current_bp") }

# DunMaster Action: Monster attacks Hero!
func dm_attack_hero(hero_id: String = "", attacker_monster: Variant = null) -> Dictionary:
	var monster: Dictionary = {}
	if attacker_monster is Dictionary and not attacker_monster.is_empty():
		monster = attacker_monster
	elif attacker_monster is String and attacker_monster != "":
		for m in monsters:
			var mid = str(m.get("id", ""))
			var mslug = str(m.get("slug", ""))
			if mid == attacker_monster or mslug == attacker_monster or mid.ends_with(attacker_monster) or attacker_monster.ends_with(mid):
				monster = m
				break
	if monster.is_empty():
		monster = get_active_monster()

	if monster.size() == 0:
		_log("No living monster to attack with!")
		return {}

	# Align active_monster_idx with the attacking monster
	for idx in range(monsters.size()):
		if str(monsters[idx].get("id")) == str(monster.get("id")):
			active_monster_idx = idx
			break

	var target_h: Dictionary = {}
	for h in heroes:
		if int(h.get("current_bp", 1)) > 0:
			if hero_id != "" and str(h.get("id")) == hero_id:
				target_h = h
				break
			elif hero_id == "":
				target_h = h
				break

	if target_h.size() == 0:
		_log("No living hero to attack!")
		return {}

	var atk_dice = int(monster.get("attackDice", 2))
	var def_dice = get_hero_defend_dice(target_h)
	var h_pos = _to_grid_pos(target_h.get("grid_pos", Vector2i(-1, -1)))

	var res = TabletopDice.resolve_combat(atk_dice, def_dice, true)
	var will_defeat = (res.wounds >= int(target_h.get("current_bp", 8)))
	trigger_combat_dice_roll(res, str(monster.get("name", "Monster")), get_hero_display_title(target_h), true, will_defeat)
	_log("[GM] %s attacks %s! Rolled %d Skulls. %s rolled %d White Shields (Defend Dice: %d)." % [
		monster.get("name"), target_h.get("name"), res.total_skulls, target_h.get("name"), res.effective_shields, def_dice
	])

	var h_hp_subtracted = 0
	var prev_h_bp = int(target_h.get("current_bp", 8))
	if res.wounds > 0:
		target_h["current_bp"] = maxi(0, prev_h_bp - res.wounds)
		h_hp_subtracted = prev_h_bp - int(target_h.get("current_bp", 0))
		_log("[HIT] %s takes %d wound(s)! Remaining HP: %d" % [target_h.get("name"), res.wounds, target_h.get("current_bp")])
		spawn_floating_text(h_pos, "-%d HP" % res.wounds, Color(0.95, 0.2, 0.2))
		if target_h.get("rock_skin_active", false):
			target_h["rock_skin_active"] = false
			_log("[SPELL] The wound shatters %s's Rock Skin spell!" % target_h.get("name"))
			spawn_floating_text(h_pos, "SHATTERED!", Color(0.8, 0.8, 0.8))
	elif h_hp_subtracted == 0 and res.wounds == 0:
		_log("[BLOCKED] %s successfully blocked the monster attack!" % target_h.get("name"))
		spawn_floating_text(h_pos, "BLOCKED!", Color(0.3, 0.8, 1.0))

	res["attacker"] = monster.get("id")
	res["attacker_name"] = monster.get("name")
	res["target"] = target_h.get("id")
	res["target_name"] = target_h.get("name")

	last_combat_result = res
	_update_ui()
	queue_redraw_all()
	return res

# --- HeroQuest Standard Spells System ---
func cast_spell(spell_id: String, target_id: String = "", target_pos: Vector2i = Vector2i(-1, -1)) -> Dictionary:
	var hero = get_active_hero()
	if hero.is_empty():
		return { "success": false, "error": "No active hero to cast spell" }

	if has_acted_this_turn:
		_log("[ACTION] %s has already taken an action this turn!" % hero.get("name", "Hero"))
		return { "success": false, "error": "Already acted this turn" }

	var spell = HeroQuestSpells.get_spell(spell_id)
	if spell.is_empty():
		return { "success": false, "error": "Unknown spell: " + spell_id }

	var hero_pos = hero.get("grid_pos", Vector2i(-1, -1))
	var hero_screen = board_offset + Vector2((hero_pos.x + 0.5) * tile_size, (hero_pos.y + 0.5) * tile_size)
	var spell_name = str(spell.get("name", spell_id))
	var s_id = str(spell.get("id"))

	_log("[SPELL] %s invokes the ancient incantation: [b]%s[/b]!" % [hero.get("name"), spell_name])
	var res: Dictionary = { "success": true, "spell": s_id, "name": spell_name }

	match s_id:
		"ball_of_flame":
			var target_m = _find_spell_target_monster(target_id, hero_pos)
			if target_m.is_empty():
				return { "success": false, "error": "No target monster in line of sight for Ball of Flame" }
			var m_pos = target_m.get("grid_pos", Vector2i(-1, -1))
			spawn_projectile_vfx(hero_pos, m_pos, Color(1.0, 0.45, 0.1), 0.35, "fire_burst")
			var def = TabletopDice.roll_combat_dice(2)
			var shields = def.black_shields
			var wounds = maxi(0, 2 - shields)
			var c_res = {
				"attack": { "dice_count": 2, "faces": ["skull", "skull"], "skulls": 2 },
				"defense": def,
				"total_skulls": 2,
				"effective_shields": shields,
				"wounds": wounds
			}
			var will_defeat = (wounds >= int(target_m.get("current_bp", 1)))
			trigger_combat_dice_roll(c_res, "Ball of Flame", str(target_m.get("name", "Monster")), false, will_defeat)
			target_m["current_bp"] = maxi(0, target_m.get("current_bp", 1) - wounds)
			_log("[SPELL] Ball of Flame engulfs %s! Rolled %d Black Shields. Wounds: %d (Remaining BP: %d)" % [
				target_m.get("name"), shields, wounds, target_m.get("current_bp")
			])
			if wounds > 0:
				spawn_floating_text(m_pos, "-%d HP" % wounds, Color(1.0, 0.3, 0.1))
			else:
				spawn_floating_text(m_pos, "BLOCKED!", Color(0.6, 0.8, 1.0))
			if target_m.get("current_bp") <= 0:
				target_m["is_alive"] = false
				_log("[DEFEATED] %s is incinerated by the Ball of Flame!" % target_m.get("name"))
				spawn_floating_text(m_pos, "INCINERATED!", Color(1.0, 0.2, 0.1), 1.5)
			res["target"] = target_m.get("id")
			res["wounds"] = wounds
			res["defended"] = shields
			res["killed"] = not target_m.get("is_alive", true)

		"fire_of_wrath":
			var target_m = _find_spell_target_monster(target_id, hero_pos)
			if target_m.is_empty():
				return { "success": false, "error": "No target monster in line of sight for Fire of Wrath" }
			var m_pos = target_m.get("grid_pos", Vector2i(-1, -1))
			var m_screen = board_offset + Vector2((m_pos.x + 0.5) * tile_size, (m_pos.y + 0.5) * tile_size)
			spawn_beam_vfx(hero_screen, m_screen, Color(1.0, 0.4, 0.1), 0.3)
			spawn_burst_vfx(m_screen, Color(1.0, 0.5, 0.1), 35.0, 0.3)
			var def = TabletopDice.roll_combat_dice(1)
			var shields = def.black_shields
			var wounds = maxi(0, 1 - shields)
			var c_res = {
				"attack": { "dice_count": 1, "faces": ["skull"], "skulls": 1 },
				"defense": def,
				"total_skulls": 1,
				"effective_shields": shields,
				"wounds": wounds
			}
			var will_defeat_fow = (wounds >= int(target_m.get("current_bp", 1)))
			trigger_combat_dice_roll(c_res, "Fire of Wrath", str(target_m.get("name", "Monster")), false, will_defeat_fow)
			target_m["current_bp"] = maxi(0, target_m.get("current_bp", 1) - wounds)
			_log("[SPELL] Fire of Wrath strikes %s! Shield roll: %d. Wounds: %d (BP: %d)" % [
				target_m.get("name"), shields, wounds, target_m.get("current_bp")
			])
			if wounds > 0:
				spawn_floating_text(m_pos, "-%d HP" % wounds, Color(1.0, 0.4, 0.1))
			else:
				spawn_floating_text(m_pos, "BLOCKED!", Color(0.6, 0.8, 1.0))
			if target_m.get("current_bp") <= 0:
				target_m["is_alive"] = false
				_log("[DEFEATED] %s was consumed by Fire of Wrath!" % target_m.get("name"))
			res["target"] = target_m.get("id")
			res["wounds"] = wounds
			res["defended"] = shields
			res["killed"] = not target_m.get("is_alive", true)

		"courage":
			var target_h = _find_spell_target_hero(target_id)
			target_h["courage_active"] = true
			var th_pos = target_h.get("grid_pos", hero_pos)
			var th_screen = board_offset + Vector2((th_pos.x + 0.5) * tile_size, (th_pos.y + 0.5) * tile_size)
			spawn_burst_vfx(th_screen, Color(0.9, 0.2, 0.2), 40.0, 0.4)
			spawn_floating_text(th_pos, "+2 ATK DICE", Color(1.0, 0.3, 0.3))
			_log("[SPELL] %s is filled with Courage! +2 extra combat dice on attacks." % target_h.get("name"))
			res["target"] = target_h.get("id")
			res["courage_active"] = true

		"rock_skin":
			var target_h = _find_spell_target_hero(target_id)
			target_h["rock_skin_active"] = true
			var th_pos = target_h.get("grid_pos", hero_pos)
			var th_screen = board_offset + Vector2((th_pos.x + 0.5) * tile_size, (th_pos.y + 0.5) * tile_size)
			spawn_burst_vfx(th_screen, Color(0.5, 0.5, 0.55), 38.0, 0.4)
			spawn_floating_text(th_pos, "+1 DEF DIE", Color(0.7, 0.7, 0.8))
			_log("[SPELL] %s's skin hardens like granite! +1 extra defend die until wounded." % target_h.get("name"))
			res["target"] = target_h.get("id")
			res["rock_skin_active"] = true

		"heal_body":
			var target_h = _find_spell_target_hero(target_id)
			var max_bp = int(target_h.get("bodyPoints", 8))
			var cur_bp = int(target_h.get("current_bp", 8))
			var healed = mini(4, max_bp - cur_bp)
			target_h["current_bp"] = cur_bp + healed
			var th_pos = target_h.get("grid_pos", hero_pos)
			var th_screen = board_offset + Vector2((th_pos.x + 0.5) * tile_size, (th_pos.y + 0.5) * tile_size)
			spawn_heal_vfx(th_screen, Color(0.2, 0.9, 0.4), 0.6)
			spawn_floating_text(th_pos, "+%d HP" % healed, Color(0.3, 1.0, 0.4))
			_log("[HEAL] Heal Body restores %d Body Points to %s (Current: %d/%d)." % [
				healed, target_h.get("name"), target_h.get("current_bp"), max_bp
			])
			res["target"] = target_h.get("id")
			res["healed"] = healed
			res["current_bp"] = target_h.get("current_bp")

		"pass_through_rock":
			var target_h = _find_spell_target_hero(target_id)
			target_h["pass_through_rock_active"] = true
			var th_pos = target_h.get("grid_pos", hero_pos)
			var th_screen = board_offset + Vector2((th_pos.x + 0.5) * tile_size, (th_pos.y + 0.5) * tile_size)
			spawn_burst_vfx(th_screen, Color(0.7, 0.7, 0.9), 35.0, 0.4)
			spawn_floating_text(th_pos, "PHASE SHIFT", Color(0.8, 0.8, 1.0))
			_log("[SPELL] %s turns ethereal! Can phase through solid rock walls on next movement." % target_h.get("name"))
			res["target"] = target_h.get("id")
			res["pass_through_rock_active"] = true

		"water_of_healing":
			var target_h = _find_spell_target_hero(target_id)
			var max_bp = int(target_h.get("bodyPoints", 8))
			var cur_bp = int(target_h.get("current_bp", 8))
			var healed = mini(4, max_bp - cur_bp)
			target_h["current_bp"] = cur_bp + healed
			var th_pos = target_h.get("grid_pos", hero_pos)
			var th_screen = board_offset + Vector2((th_pos.x + 0.5) * tile_size, (th_pos.y + 0.5) * tile_size)
			spawn_heal_vfx(th_screen, Color(0.1, 0.75, 0.95), 0.6)
			spawn_floating_text(th_pos, "+%d HP" % healed, Color(0.2, 0.8, 1.0))
			_log("[HEAL] Pure waters of healing bathe %s! Restored %d Body Points (Current: %d/%d)." % [
				target_h.get("name"), healed, target_h.get("current_bp"), max_bp
			])
			res["target"] = target_h.get("id")
			res["healed"] = healed
			res["current_bp"] = target_h.get("current_bp")

		"sleep":
			var target_m = _find_spell_target_monster(target_id, hero_pos)
			if target_m.is_empty():
				return { "success": false, "error": "No target monster in line of sight for Sleep" }
			target_m["is_sleeping"] = true
			var m_pos = target_m.get("grid_pos", Vector2i(-1, -1))
			var m_screen = board_offset + Vector2((m_pos.x + 0.5) * tile_size, (m_pos.y + 0.5) * tile_size)
			spawn_burst_vfx(m_screen, Color(0.4, 0.4, 0.9), 35.0, 0.5)
			spawn_floating_text(m_pos, "SLEEP", Color(0.5, 0.5, 1.0))
			_log("[SLEEP] %s falls into deep enchanted sleep! Cannot move, attack, or defend." % target_m.get("name"))
			res["target"] = target_m.get("id")
			res["is_sleeping"] = true

		"veil_of_mist":
			var target_h = _find_spell_target_hero(target_id)
			target_h["veil_of_mist_active"] = true
			var th_pos = target_h.get("grid_pos", hero_pos)
			var th_screen = board_offset + Vector2((th_pos.x + 0.5) * tile_size, (th_pos.y + 0.5) * tile_size)
			spawn_burst_vfx(th_screen, Color(0.65, 0.7, 0.8), 35.0, 0.4)
			spawn_floating_text(th_pos, "MIST SHROUD", Color(0.7, 0.8, 0.9))
			_log("[SPELL] %s is enveloped in mist! Can move through monsters unseen." % target_h.get("name"))
			res["target"] = target_h.get("id")
			res["veil_of_mist_active"] = true

		"genie":
			if target_id.begins_with("door") or (target_pos.x >= 0 and is_door_at(target_pos)):
				for d in doors:
					if not d.get("is_open", false):
						d["is_open"] = true
						var tr = d.get("toRoom", "")
						if tr != "":
							reveal_room_by_id(tr)
						_log("[GENIE] Genie gestures and magically forces open the door!")
						spawn_burst_vfx(hero_screen, Color(0.2, 0.8, 1.0), 55.0, 0.5)
						res["door_opened"] = true
						break
			else:
				var target_m = _find_spell_target_monster(target_id, hero_pos)
				if target_m.is_empty():
					return { "success": false, "error": "No target monster in line of sight for Genie" }
				var m_pos = target_m.get("grid_pos", Vector2i(-1, -1))
				spawn_projectile_vfx(hero_pos, m_pos, Color(0.1, 0.8, 1.0), 0.35, "genie_burst")
				var combat_res = TabletopDice.resolve_combat(5, target_m.get("defendDice", 2), false)
				var will_defeat = (combat_res.wounds >= int(target_m.get("current_bp", 1)))
				trigger_combat_dice_roll(combat_res, "Genie", str(target_m.get("name", "Monster")), false, will_defeat)
				target_m["current_bp"] = maxi(0, target_m.get("current_bp", 1) - combat_res.wounds)
				_log("[GENIE] Genie manifests and attacks %s with 5 dice! Skulls: %d, Defended: %d, Wounds: %d (BP: %d)" % [
					target_m.get("name"), combat_res.total_skulls, combat_res.effective_shields, combat_res.wounds, target_m.get("current_bp")
				])
				if combat_res.wounds > 0:
					spawn_floating_text(m_pos, "-%d HP" % combat_res.wounds, Color(0.2, 0.8, 1.0))
				else:
					spawn_floating_text(m_pos, "BLOCKED!", Color(0.6, 0.8, 1.0))
				if target_m.get("current_bp") <= 0:
					target_m["is_alive"] = false
					_log("[DEFEATED] %s is crushed by the Genie's wrath!" % target_m.get("name"))
					spawn_floating_text(m_pos, "OBLITERATED!", Color(0.3, 0.9, 1.0), 1.5)
				res["target"] = target_m.get("id")
				res["wounds"] = combat_res.wounds
				res["killed"] = not target_m.get("is_alive", true)

		"swift_wind":
			var target_h = _find_spell_target_hero(target_id)
			target_h["swift_wind_active"] = true
			var th_pos = target_h.get("grid_pos", hero_pos)
			var th_screen = board_offset + Vector2((th_pos.x + 0.5) * tile_size, (th_pos.y + 0.5) * tile_size)
			spawn_cyclone_vfx(th_screen, Color(0.3, 0.8, 1.0), 0.5)
			spawn_floating_text(th_pos, "2X SPEED (4d6)", Color(0.3, 0.9, 1.0))
			_log("[SPELL] Swift Wind envelopes %s! Movement dice doubled to 4d6 on next turn." % target_h.get("name"))
			res["target"] = target_h.get("id")
			res["swift_wind_active"] = true

		"tempest":
			var target_m = _find_spell_target_monster(target_id, hero_pos)
			if target_m.is_empty():
				return { "success": false, "error": "No target monster in line of sight for Tempest" }
			target_m["tempest_stunned"] = true
			var m_pos = target_m.get("grid_pos", Vector2i(-1, -1))
			var m_screen = board_offset + Vector2((m_pos.x + 0.5) * tile_size, (m_pos.y + 0.5) * tile_size)
			spawn_cyclone_vfx(m_screen, Color(0.1, 0.7, 0.9), 0.6)
			spawn_floating_text(m_pos, "STUNNED", Color(0.2, 0.8, 1.0))
			_log("[SPELL] Tempest whirlwind traps %s! It will miss its next turn." % target_m.get("name"))
			res["target"] = target_m.get("id")
			res["tempest_stunned"] = true

		"command":
			var target_h = _find_spell_target_hero(target_id)
			var th_pos = target_h.get("grid_pos", hero_pos)
			var th_screen = board_offset + Vector2((th_pos.x + 0.5) * tile_size, (th_pos.y + 0.5) * tile_size)
			spawn_burst_vfx(th_screen, Color(0.6, 0.1, 0.8), 40.0, 0.5)
			spawn_floating_text(th_pos, "CONTROLLED!", Color(0.7, 0.2, 0.9))
			_log("[DREAD] Dread Sorcery: %s is commanded by Zargon to strike an ally!" % target_h.get("name"))
			res["target"] = target_h.get("id")
			res["commanded"] = true

		"summon_undead":
			var spawn_pos = target_pos if target_pos.x >= 0 else Vector2i(hero_pos.x + 1, hero_pos.y)
			summon_wandering_monster(spawn_pos)
			var s_screen = board_offset + Vector2((spawn_pos.x + 0.5) * tile_size, (spawn_pos.y + 0.5) * tile_size)
			spawn_burst_vfx(s_screen, Color(0.4, 0.1, 0.6), 45.0, 0.5)
			res["summoned_pos"] = [spawn_pos.x, spawn_pos.y]

	_conclude_action_turn_state()

	last_spell_result = res
	_update_ui()
	queue_redraw_all()
	return res

func _find_spell_target_monster(target_id: String, from_pos: Vector2i) -> Dictionary:
	for m in monsters:
		if m.get("is_alive", false):
			var mid = str(m.get("id", ""))
			var mslug = str(m.get("slug", ""))
			if target_id != "" and (mid == target_id or mslug == target_id or mid.ends_with(target_id) or target_id.ends_with(mid)):
				return m
			elif target_id == "":
				var mp = m.get("grid_pos", Vector2i(-1, -1))
				if has_line_of_sight(from_pos, mp):
					return m
	return {}

func _find_spell_target_hero(target_id: String) -> Dictionary:
	if target_id != "":
		for h in heroes:
			if h.get("id") == target_id:
				return h
	return get_active_hero()

func is_door_at(tile: Vector2i) -> bool:
	for d in doors:
		if d.get("is_secret", false) and not d.get("is_revealed", false):
			continue
		var f = d.get("from", [-1, -1])
		var t = d.get("to", [-1, -1])
		if (tile.x == f[0] and tile.y == f[1]) or (tile.x == t[0] and tile.y == t[1]):
			return true
	return false

# --- Visual Effects & Animation Helpers ---
func spawn_projectile_vfx(from_tile: Vector2i, to_tile: Vector2i, color: Color, duration: float = 0.35, on_complete: String = "") -> void:
	var from_screen = board_offset + Vector2((from_tile.x + 0.5) * tile_size, (from_tile.y + 0.5) * tile_size)
	var to_screen = board_offset + Vector2((to_tile.x + 0.5) * tile_size, (to_tile.y + 0.5) * tile_size)
	active_vfx.append({
		"type": "projectile",
		"from": from_screen,
		"to": to_screen,
		"color": color,
		"time": 0.0,
		"duration": duration,
		"on_complete": on_complete
	})
	queue_redraw_all()

func spawn_burst_vfx(center_screen: Vector2, color: Color, max_radius: float = 45.0, duration: float = 0.4) -> void:
	active_vfx.append({
		"type": "burst",
		"center": center_screen,
		"color": color,
		"max_radius": max_radius,
		"time": 0.0,
		"duration": duration
	})
	queue_redraw_all()

func spawn_heal_vfx(center_screen: Vector2, color: Color = Color(0.2, 0.9, 0.4), duration: float = 0.6) -> void:
	active_vfx.append({
		"type": "heal",
		"center": center_screen,
		"color": color,
		"time": 0.0,
		"duration": duration
	})
	queue_redraw_all()

func spawn_cyclone_vfx(center_screen: Vector2, color: Color = Color(0.1, 0.7, 0.9), duration: float = 0.6) -> void:
	active_vfx.append({
		"type": "cyclone",
		"center": center_screen,
		"color": color,
		"time": 0.0,
		"duration": duration
	})
	queue_redraw_all()

func spawn_beam_vfx(from_screen: Vector2, to_screen: Vector2, color: Color = Color(1.0, 0.5, 0.1), duration: float = 0.3) -> void:
	active_vfx.append({
		"type": "beam",
		"from": from_screen,
		"to": to_screen,
		"color": color,
		"time": 0.0,
		"duration": duration
	})
	queue_redraw_all()

func spawn_slash_vfx(center_screen: Vector2, rotation: float = 0.0, duration: float = 0.25) -> void:
	active_vfx.append({
		"type": "slash",
		"center": center_screen,
		"rotation": rotation,
		"color": Color.WHITE,
		"time": 0.0,
		"duration": duration
	})
	queue_redraw_all()

func spawn_floating_text(tile: Vector2i, text: String, color: Color = Color.WHITE, duration: float = 1.0) -> void:
	var screen_pos = board_offset + Vector2((tile.x + 0.5) * tile_size, (tile.y + 0.2) * tile_size)
	floating_texts.append({
		"text": text,
		"pos": screen_pos,
		"vel": Vector2(0, -40),
		"color": color,
		"alpha": 1.0,
		"time": 0.0,
		"duration": duration
	})
	queue_redraw_all()

# Game Master Action: Summon Wandering Monster Ambush
func summon_wandering_monster(spawn_pos: Vector2i = Vector2i(3, 0), bp: int = 1, m_name: String = "Wandering Orc") -> Dictionary:
	if is_tile_occupied(spawn_pos):
		for d in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1), Vector2i(1, 1), Vector2i(-1, 1)]:
			var cand = spawn_pos + d
			if not is_tile_occupied(cand) and not is_tile_wall_blocked(cand):
				spawn_pos = cand
				break

	var new_m = {
		"id": "wandering-orc-" + str(monsters.size() + 1),
		"name": m_name,
		"bodyPoints": bp,
		"current_bp": bp,
		"attackDice": 3,
		"defendDice": 2,
		"movementSquares": 8,
		"tokenColor": "#047857",
		"icon": "🧌",
		"grid_pos": spawn_pos,
		"is_alive": true
	}
	monsters.append(new_m)
	_update_ui()
	queue_redraw_all()
	var ret_m = new_m.duplicate(true)
	ret_m["grid_pos"] = [spawn_pos.x, spawn_pos.y]
	return { "success": true, "monster": ret_m }

func search_room() -> Dictionary:
	var hero = get_active_hero()
	if hero.is_empty():
		return { "success": false, "error": "No active hero" }
	if has_acted_this_turn:
		_log("[ACTION] %s has already taken an action this turn!" % hero.get("name", "Hero"))
		return { "success": false, "error": "Already acted this turn" }

	var h_pos = hero.get("grid_pos", Vector2i(-1, -1))
	var h_room = _get_room_at(h_pos)
	var r_id = str(h_room.get("id", "")) if not h_room.is_empty() else ""

	# Check for chest/furniture traps in this room
	var trapped_chest: Dictionary = {}
	for tr in traps:
		var t_type = str(tr.get("type", tr.get("trapType", ""))).to_lower()
		if "chest" in t_type or "furniture" in t_type:
			var tx = int(tr.get("x", tr.get("position", [0, 0])[0]))
			var ty = int(tr.get("y", tr.get("position", [0, 0])[1]))
			var t_room = str(_get_room_at(Vector2i(tx, ty)).get("id", ""))
			var matches_room = (r_id != "" and t_room == r_id) or (abs(tx - h_pos.x) + abs(ty - h_pos.y) <= 4)
			if matches_room and not tr.get("disarmed", false) and not tr.get("sprung", false):
				trapped_chest = tr
				break

	if not trapped_chest.is_empty():
		if not trapped_chest.get("detected", false):
			# Chest trap springs! Poison needle / gas deals damage!
			trapped_chest["sprung"] = true
			trapped_chest["detected"] = true
			var dmg = int(trapped_chest.get("damageDice", 2))
			hero["current_bp"] = maxi(0, hero.get("current_bp", 1) - dmg)
			_log("[TRAP] ☠️ CHEST TRAP SPRUNG! A poison needle fires from the locked chest! %s suffers %d damage (Remaining BP: %d)!" % [
				hero.get("name"), dmg, hero.get("current_bp")
			])
			spawn_floating_text(h_pos, "-%d HP POISON NEEDLE" % dmg, Color(0.85, 0.25, 0.85), 1.8)
			_conclude_action_turn_state()
			_update_ui()
			queue_redraw_all()
			return { "success": true, "trapTriggered": true, "damage": dmg, "goldFound": 0 }
		else:
			_log("[WARNING] The chest in this room has a detected trap! Disarm it before searching for treasure.")
			return { "success": false, "error": "Trapped chest detected. Disarm it first!" }

	var found_gold = 50
	hero["gold"] = hero.get("gold", 0) + found_gold
	_log("[TREASURE] %s searches room for treasure: Discovered a chest with %d Gold Coins! Total Gold: %d" % [
		hero.get("name"), found_gold, hero.get("gold")
	])
	_conclude_action_turn_state()
	_update_ui()
	queue_redraw_all()
	return { "success": true, "goldFound": found_gold }

func search_traps() -> Dictionary:
	var hero = get_active_hero()
	if hero.is_empty():
		return { "success": false, "error": "No active hero" }
	if has_acted_this_turn:
		_log("[ACTION] %s has already taken an action this turn!" % hero.get("name", "Hero"))
		return { "success": false, "error": "Already acted this turn" }

	var h_pos = hero.get("grid_pos", Vector2i(-1, -1))
	var h_room = _get_room_at(h_pos)
	var found_traps: Array[String] = []
	var found_secret_doors: Array[String] = []

	if not h_room.is_empty():
		var r_id = str(h_room.get("id", ""))
		for tr in traps:
			var tx = int(tr.get("x", tr.get("position", [0, 0])[0]))
			var ty = int(tr.get("y", tr.get("position", [0, 0])[1]))
			if _get_room_at(Vector2i(tx, ty)).get("id", "") == r_id:
				tr["detected"] = true
				found_traps.append(str(tr.get("id", "trap")))
				spawn_floating_text(Vector2i(tx, ty), "⚠️ TRAP DETECTED", Color(1.0, 0.8, 0.2), 1.6)

		for d in doors:
			if d.get("is_secret", false) and not d.get("is_revealed", false):
				var f = d.get("from", [0, 0])
				var t = d.get("to", [0, 0])
				var f_pos = Vector2i(f[0], f[1])
				var t_pos = Vector2i(t[0], t[1])
				var d_room = str(d.get("room", ""))
				var r1_id = str(_get_room_at(f_pos).get("id", ""))
				var r2_id = str(_get_room_at(t_pos).get("id", ""))
				if d_room == r_id or r1_id == r_id or r2_id == r_id:
					d["is_revealed"] = true
					var s_id = str(d.get("id", "secret_door"))
					found_secret_doors.append(s_id)
					var reveal_pos = f_pos if r1_id == r_id else t_pos
					spawn_floating_text(reveal_pos, "🚪 SECRET DOOR DISCOVERED", Color(0.9, 0.7, 1.0), 1.8)
	else:
		for tr in traps:
			var tx = int(tr.get("x", tr.get("position", [0, 0])[0]))
			var ty = int(tr.get("y", tr.get("position", [0, 0])[1]))
			var t_pos = Vector2i(tx, ty)
			if abs(t_pos.x - h_pos.x) + abs(t_pos.y - h_pos.y) <= 4:
				tr["detected"] = true
				found_traps.append(str(tr.get("id", "trap")))
				spawn_floating_text(t_pos, "⚠️ TRAP DETECTED", Color(1.0, 0.8, 0.2), 1.6)

		for d in doors:
			if d.get("is_secret", false) and not d.get("is_revealed", false):
				var f = d.get("from", [0, 0])
				var t = d.get("to", [0, 0])
				var f_pos = Vector2i(f[0], f[1])
				var t_pos = Vector2i(t[0], t[1])
				var corridor_pos: Vector2i = Vector2i(-1, -1)
				var min_dist = 999
				if _get_room_at(f_pos).is_empty():
					var df = abs(f_pos.x - h_pos.x) + abs(f_pos.y - h_pos.y)
					if df <= 4 and has_line_of_sight(h_pos, f_pos):
						corridor_pos = f_pos
						min_dist = df
				if _get_room_at(t_pos).is_empty():
					var dt = abs(t_pos.x - h_pos.x) + abs(t_pos.y - h_pos.y)
					if dt <= 4 and has_line_of_sight(h_pos, t_pos) and dt < min_dist:
						corridor_pos = t_pos
						min_dist = dt
				if corridor_pos != Vector2i(-1, -1):
					d["is_revealed"] = true
					var s_id = str(d.get("id", "secret_door"))
					found_secret_doors.append(s_id)
					spawn_floating_text(corridor_pos, "🚪 SECRET DOOR DISCOVERED", Color(0.9, 0.7, 1.0), 1.8)

	_conclude_action_turn_state()

	_log("[SEARCH] %s searches carefully for traps and secret doors: Found %d hidden trap(s) and %d secret door(s)!" % [
		hero.get("name"), found_traps.size(), found_secret_doors.size()
	])
	_update_ui()
	queue_redraw_all()
	return {
		"success": true,
		"foundTraps": found_traps,
		"trapsCount": found_traps.size(),
		"foundSecretDoors": found_secret_doors,
		"secretDoorsCount": found_secret_doors.size()
	}

func disarm_trap(trap_id: String) -> Dictionary:
	var hero = get_active_hero()
	if hero.is_empty():
		return { "success": false, "error": "No active hero" }
	if has_acted_this_turn:
		_log("[ACTION] %s has already taken an action this turn!" % hero.get("name", "Hero"))
		return { "success": false, "error": "Already acted this turn" }

	var h_pos = hero.get("grid_pos", Vector2i(-1, -1))
	var target_trap: Dictionary = {}
	if trap_id != "":
		for tr in traps:
			if str(tr.get("id")) == trap_id:
				target_trap = tr
				break
	if target_trap.is_empty():
		for tr in traps:
			var tx = int(tr.get("x", tr.get("position", [0, 0])[0]))
			var ty = int(tr.get("y", tr.get("position", [0, 0])[1]))
			if abs(tx - h_pos.x) + abs(ty - h_pos.y) <= 1:
				if not tr.get("disarmed", false) and not tr.get("sprung", false):
					target_trap = tr
					break
	if target_trap.is_empty():
		return { "success": false, "error": "No trap found with id: " + trap_id }

	if target_trap.get("sprung", false) or target_trap.get("is_sprung", false):
		_log("[DISARM] The %s is already sprung and cannot be disarmed!" % str(target_trap.get("type", "trap")))
		return { "success": false, "error": "Trap is already sprung and cannot be disarmed" }

	var disarm_check = can_hero_disarm(hero)
	if not disarm_check.get("can_disarm", false):
		_log("[DISARM] %s cannot disarm traps without a Tool Kit! (Only the Dwarf has innate disarm mastery)." % hero.get("name"))
		return { "success": false, "error": "Requires Tool Kit or Dwarf to disarm" }

	target_trap["detected"] = true
	target_trap["disarmed"] = true
	_conclude_action_turn_state()

	var tx = int(target_trap.get("x", target_trap.get("position", [0, 0])[0]))
	var ty = int(target_trap.get("y", target_trap.get("position", [0, 0])[1]))
	spawn_floating_text(Vector2i(tx, ty), "TRAP DISARMED!", Color(0.2, 0.9, 0.5), 1.6)

	_log("[DISARM] 🔧 %s disarms the %s at (%d, %d) safely!" % [
		hero.get("name"), target_trap.get("type", target_trap.get("trapType", "trap")), tx, ty
	])
	_update_ui()
	queue_redraw_all()
	return { "success": true, "trapId": target_trap.get("id"), "disarmed": true }

func _check_hero_enter_board(idx: int) -> void:
	if idx < 0 or idx >= heroes.size():
		return
	var h = heroes[idx]
	if not h.get("is_on_board", false):
		h["is_on_board"] = true
		var spawn_tile = starting_stair
		if is_tile_occupied(spawn_tile):
			# If the stairway tile is currently occupied, enter on adjacent unoccupied corridor tile
			for offset in [Vector2i(1, 0), Vector2i(0, 1), Vector2i(0, 2), Vector2i(2, 0), Vector2i(1, 1)]:
				var cand = starting_stair + offset
				if not is_tile_occupied(cand) and not is_tile_wall_blocked(cand) and _get_room_at(cand).is_empty():
					spawn_tile = cand
					break
		h["grid_pos"] = spawn_tile
		_log("[ENTER] %s descends the spiral stairway and enters the dungeon at (%d, %d)!" % [
			h.get("name"), spawn_tile.x, spawn_tile.y
		])

func end_turn() -> void:
	if current_phase == "hero_phase":
		active_hero_idx = (active_hero_idx + 1) % maxi(1, heroes.size())
		if active_hero_idx == 0:
			current_phase = "gm_phase"
			_log("=== Zargon / Game Master Phase Begins ===")
			if current_role == "player" and not is_headless_mode():
				call_deferred("ai_monster_turn")
		else:
			_log("--- Next Hero: %s ---" % get_active_hero().get("name", "Hero"))
			_check_hero_enter_board(active_hero_idx)
	else:
		current_phase = "hero_phase"
		current_round += 1
		_log("--- Round %d begins (Heroes Turn) ---" % current_round)
		_log("Active hero: %s" % get_active_hero().get("name", "Hero"))
		_check_hero_enter_board(active_hero_idx)

	movement_remaining = 0
	movement_rolled = false
	has_acted_this_turn = false
	has_moved_this_turn = false
	moved_before_action = false
	movement_closed = false
	movement_start_pos = Vector2i(-1, -1)
	movement_trail.clear()
	turn_state = "awaiting_roll"
	update_party_vision()
	_update_ui()
	queue_redraw_all()

func ai_monster_turn() -> Dictionary:
	_log("[GM] Minions of Zargon stir in the darkness...")
	var live_monsters = monsters.filter(func(m): return m.get("is_alive", false))
	
	# Only monsters that are revealed or in active rooms will act
	var active_monsters = live_monsters.filter(func(m):
		var r_id = str(m.get("roomId", ""))
		return r_id == "" or revealed_rooms.has(r_id)
	)

	if active_monsters.is_empty():
		_log("[GM] No active monsters in sight. The dungeon echoes with distant whispers.")
		end_turn()
		return { "success": true, "acted": 0 }

	var acts = 0
	for m in active_monsters:
		# Check if monster is incapacitated
		if m.get("is_sleeping", false):
			_log("[SLEEP] %s is sound asleep and cannot move or attack." % m.get("name"))
			continue
		if m.get("tempest_stunned", false):
			m["tempest_stunned"] = false # Recovers at end of missed turn
			_log("[TEMPEST] %s is caught in the howling winds and misses its turn!" % m.get("name"))
			continue

		var m_pos: Vector2i = _to_grid_pos(m.get("grid_pos", Vector2i(0, 0)))
		var nearest_hero: Dictionary = {}
		var min_dist: int = 9999
		for h in heroes:
			# ONLY consider living heroes currently on the board
			if h.get("is_on_board", false) and int(h.get("current_bp", 0)) > 0:
				var h_pos: Vector2i = _to_grid_pos(h.get("grid_pos", Vector2i(-1, -1)))
				if h_pos.x < 0 or h_pos.y < 0:
					continue
				var dist = absi(h_pos.x - m_pos.x) + absi(h_pos.y - m_pos.y)
				if dist < min_dist:
					min_dist = dist
					nearest_hero = h

		if nearest_hero.is_empty():
			continue

		var h_pos: Vector2i = _to_grid_pos(nearest_hero.get("grid_pos", Vector2i(0, 0)))
		var mid = str(m.get("id", ""))

		if min_dist == 1:
			_log("[MONSTER] %s roars and attacks %s!" % [m.get("name"), nearest_hero.get("name")])
			dm_attack_hero(str(nearest_hero.get("id", "")), m)
			acts += 1
		elif min_dist > 1:
			# Monster advances towards hero up to movementSquares, stopping upon becoming adjacent
			var max_moves = int(m.get("movementSquares", 4))
			var curr_pos = m_pos
			var steps_taken = 0

			while steps_taken < max_moves:
				var curr_dist = absi(h_pos.x - curr_pos.x) + absi(h_pos.y - curr_pos.y)
				if curr_dist <= 1:
					# Stop immediately upon reaching adjacent tile; monsters NEVER enter a hero's square!
					break

				var dx = h_pos.x - curr_pos.x
				var dy = h_pos.y - curr_pos.y
				var step_options: Array[Vector2i] = []
				if absi(dx) >= absi(dy):
					if dx != 0:
						step_options.append(Vector2i(clampi(dx, -1, 1), 0))
					if dy != 0:
						step_options.append(Vector2i(0, clampi(dy, -1, 1)))
				else:
					if dy != 0:
						step_options.append(Vector2i(0, clampi(dy, -1, 1)))
					if dx != 0:
						step_options.append(Vector2i(clampi(dx, -1, 1), 0))

				var moved_this_step = false
				for step_dir in step_options:
					var cand_pos = curr_pos + step_dir
					# Strictly forbid entering any hero's tile
					if cand_pos == h_pos or is_tile_occupied_by_hero(cand_pos):
						continue
					# Cannot enter tile occupied by another monster
					if is_tile_occupied_by_monster(cand_pos, mid):
						continue
					# Cannot pass through walls, closed doors, or blockages
					if has_wall_between(curr_pos, cand_pos) or is_tile_wall_blocked(cand_pos):
						continue

					curr_pos = cand_pos
					moved_this_step = true
					break

				if not moved_this_step:
					break
				steps_taken += 1

			if curr_pos != m_pos:
				m["grid_pos"] = curr_pos
				_log("[MOVE] %s moves towards %s to (%d, %d)." % [m.get("name"), nearest_hero.get("name"), curr_pos.x, curr_pos.y])
				acts += 1

			# If monster arrived adjacent to hero, execute melee attack!
			var final_dist = absi(h_pos.x - curr_pos.x) + absi(h_pos.y - curr_pos.y)
			if final_dist == 1:
				_log("[MONSTER] %s engages and attacks %s!" % [m.get("name"), nearest_hero.get("name")])
				dm_attack_hero(str(nearest_hero.get("id", "")), m)
				acts += 1

	end_turn()
	return { "success": true, "acted": acts }

func _update_ui() -> void:
	var role_name = "Player Mode (Playing Heroes)" if current_role == "player" else "Game Master Mode (Zargon GM)"
	if title_label:
		title_label.text = "HEROQUEST"
	if role_badge:
		role_badge.text = "Role: " + ("Player" if current_role == "player" else "GM")

	var hero = get_active_hero()
	var h_name = str(hero.get("name", "Hero"))

	if is_gm_role():
		# Game Master / Zargon controls
		if btn_summon:
			btn_summon.visible = true
			btn_summon.disabled = false
			btn_summon.text = "Summon"
			_update_action_tile(btn_summon, "summon", 0, "👹 Summon Monster (GM)", "Spawn a wandering monster minion of Zargon in the dungeon.")
		if btn_roll:
			btn_roll.visible = true
			btn_roll.disabled = false
			btn_roll.text = "Roll Monster"
			_update_action_tile(btn_roll, "move", 0, "🎲 Roll Monster Movement", "Roll movement dice for active Zargon monster.")
		if btn_attack:
			btn_attack.visible = true
			btn_attack.disabled = false
			btn_attack.text = "Monster Attack"
			_update_action_tile(btn_attack, "attack", 0, "⚔️ Monster Attack", "Order monster minion to strike adjacent hero.")
		if btn_cast_spell:
			btn_cast_spell.visible = false
		if btn_use_item:
			btn_use_item.visible = false
		if btn_search:
			btn_search.visible = false
		if btn_search_traps:
			btn_search_traps.visible = false
		if btn_disarm_trap:
			btn_disarm_trap.visible = false
		if btn_end_turn:
			btn_end_turn.visible = true
			btn_end_turn.disabled = false
			btn_end_turn.text = "End GM Turn"
			_update_action_tile(btn_end_turn, "end_turn", 0, "⏭️ End GM Turn", "Conclude Zargon's turn and pass initiative to Heroes.")
		if dice_label:
			dice_label.text = "Zargon Game Master Mode: Full Dungeon Control"
	elif current_phase == "gm_phase":
		# Watching Game Master / AI turn
		if btn_summon:
			btn_summon.visible = false
		if btn_roll:
			btn_roll.visible = false
		if btn_attack:
			btn_attack.visible = false
		if btn_cast_spell:
			btn_cast_spell.visible = false
		if btn_use_item:
			btn_use_item.visible = false
		if btn_search:
			btn_search.visible = false
		if btn_search_traps:
			btn_search_traps.visible = false
		if btn_disarm_trap:
			btn_disarm_trap.visible = false
		if btn_end_turn:
			btn_end_turn.visible = false
		if dice_label:
			dice_label.text = "Minions of Zargon stir in the darkness..."
	else:
		# Hero Phase (Player)
		if btn_summon:
			btn_summon.visible = false

		# Spell Casting Action Button
		if btn_cast_spell:
			var h_spells: Array = hero.get("spells", [])
			if h_spells.size() > 0:
				btn_cast_spell.visible = true
				btn_cast_spell.disabled = has_acted_this_turn or movement_closed or (moved_before_action and has_acted_this_turn)
				btn_cast_spell.text = "🔮 Spell (%d)" % h_spells.size()
				_update_action_tile(btn_cast_spell, "spell", h_spells.size(), "🔮 Cast Spell (%d Memorized)" % h_spells.size(), "Open spellbook to select and cast arcane or elemental spells.", Color(0.55, 0.25, 0.95, 0.92))
			else:
				btn_cast_spell.visible = false

		# Item Usage Action Button
		if btn_use_item:
			var h_inv: Array = hero.get("inventory", [])
			if h_inv.size() > 0:
				btn_use_item.visible = true
				btn_use_item.disabled = false
				btn_use_item.text = "🎒 Item (%d)" % h_inv.size()
				_update_action_tile(btn_use_item, "item", h_inv.size(), "🎒 Use Item (%d in Pack)" % h_inv.size(), "Open backpack to use potions, tool kits, and equipment.", Color(0.95, 0.60, 0.10, 0.92))
			else:
				btn_use_item.visible = false

		# Trap Action Buttons
		var can_search_t = can_search_for_traps()
		if btn_search_traps:
			btn_search_traps.visible = true
			btn_search_traps.disabled = has_acted_this_turn or not can_search_t
			btn_search_traps.text = "⚠️ Traps"
			_update_action_tile(btn_search_traps, "traps", 0, "⚠️ Search for Traps & Secret Doors", "Inspect room or corridor for hidden hazards and secret passages.")

		var adj_traps = get_adjacent_detected_traps()
		var disarm_check = can_hero_disarm(hero)
		var can_dis = (adj_traps.size() > 0) and not has_acted_this_turn and disarm_check.get("can_disarm", false)
		if btn_disarm_trap:
			btn_disarm_trap.visible = true
			btn_disarm_trap.disabled = not can_dis
			btn_disarm_trap.text = "🔧 Disarm (%d)" % adj_traps.size() if adj_traps.size() > 0 else "🔧 Disarm"
			_update_action_tile(btn_disarm_trap, "disarm", adj_traps.size(), "🔧 Disarm Trap (%d Adjacent)" % adj_traps.size(), "Attempt to safely disarm adjacent trap with Tool Kit.", Color(0.15, 0.75, 0.70, 0.92))

		var adj_monsters = get_adjacent_monsters()
		var adj_doors = get_adjacent_closed_doors()
		var in_room_clean = can_search_room()

		if movement_closed or (moved_before_action and has_acted_this_turn):
			if dice_label:
				dice_label.text = "Turn complete! Click End Turn to proceed."
			if btn_roll:
				btn_roll.visible = true
				btn_roll.disabled = true
				btn_roll.text = "Move: 0"
				_update_action_tile(btn_roll, "move", 0, "🎲 Movement Complete (0)", "Movement has concluded for this turn.")
			if btn_attack:
				btn_attack.visible = false
			if btn_search:
				btn_search.visible = false
			if btn_search_traps:
				btn_search_traps.disabled = true
			if btn_disarm_trap:
				btn_disarm_trap.disabled = true
			if btn_end_turn:
				btn_end_turn.visible = true
				btn_end_turn.disabled = false
				btn_end_turn.text = "End Turn"
				_update_action_tile(btn_end_turn, "end_turn", 0, "⏭️ End Turn", "Conclude active hero's turn and pass initiative to next hero or GM.")
		elif not movement_rolled:
			# Awaiting Roll state
			if dice_label:
				if has_acted_this_turn:
					dice_label.text = "Action taken! %s may now ROLL DICE to move or click End Turn." % h_name
				else:
					dice_label.text = "%s's Turn: ROLL DICE to determine movement!" % h_name
			if btn_roll:
				btn_roll.visible = true
				btn_roll.disabled = false
				btn_roll.text = "Roll Movement (2d6)"
				_update_action_tile(btn_roll, "move", 0, "🎲 Roll Movement (2d6)", "Roll 2 red dice to determine movement squares for this turn.")
			if btn_attack:
				if adj_monsters.size() > 0 and not has_acted_this_turn:
					btn_attack.visible = true
					btn_attack.disabled = false
					var m_tgt_name = adj_monsters[0].get("name", "Monster")
					btn_attack.text = "Attack %s" % m_tgt_name
					_update_action_tile(btn_attack, "attack", 0, "⚔️ Attack %s" % m_tgt_name, "Strike adjacent foe with equipped weapon (Roll %d attack dice)." % hero.get("attackDice", 3))
				elif adj_doors.size() > 0:
					btn_attack.visible = true
					btn_attack.disabled = false
					var is_secret_adj = false
					for ad in adj_doors:
						if ad.get("is_secret", false):
							is_secret_adj = true
							break
					btn_attack.text = "Open Secret Door" if is_secret_adj else "Open Door"
					if is_secret_adj:
						_update_action_tile(btn_attack, "door", 0, "🚪 Open Secret Door", "Unseal the discovered secret stone door to reveal hidden chamber.")
					else:
						_update_action_tile(btn_attack, "door", 0, "🚪 Open Door", "Kick open adjacent dungeon door to reveal room and foes.")
				else:
					btn_attack.visible = false
			if btn_search:
				btn_search.visible = false
			if btn_end_turn:
				btn_end_turn.visible = true
				btn_end_turn.disabled = false
				var skip_lbl = "Skip Turn" if (not has_acted_this_turn and not has_moved_this_turn) else "End Turn"
				btn_end_turn.text = skip_lbl
				_update_action_tile(btn_end_turn, "end_turn", 0, "⏭️ " + skip_lbl, "Conclude current hero's turn and pass initiative.")
		else:
			# Movement rolled
			if movement_remaining > 0:
				if has_acted_this_turn:
					if dice_label:
						dice_label.text = "Action used! Spend remaining %d movement or click End Turn." % movement_remaining
				else:
					if dice_label:
						dice_label.text = "%s: Move %d squares on board, or execute action." % [h_name, movement_remaining]
				if btn_roll:
					btn_roll.visible = true
					btn_roll.disabled = true
					btn_roll.text = "Move: %d left" % movement_remaining
					_update_action_tile(btn_roll, "move", movement_remaining, "🎲 Movement (%d Remaining)" % movement_remaining, "Click adjacent highlighted grid tiles to move %s." % h_name, Color(0.0, 0.75, 0.95, 0.92))
			else:
				if has_acted_this_turn:
					if dice_label:
						dice_label.text = "Turn complete! Click End Turn to proceed."
				else:
					if dice_label:
						dice_label.text = "Out of movement! You may still take an action or End Turn."
				if btn_roll:
					btn_roll.visible = true
					btn_roll.disabled = true
					btn_roll.text = "Move: 0"
					_update_action_tile(btn_roll, "move", 0, "🎲 Movement Exhausted (0)", "All rolled movement points have been spent.")

			# Contextual attack / door button
			if btn_attack:
				if adj_monsters.size() > 0 and not has_acted_this_turn:
					btn_attack.visible = true
					btn_attack.disabled = false
					var m_tgt_name = adj_monsters[0].get("name", "Monster")
					btn_attack.text = "Attack %s" % m_tgt_name
					_update_action_tile(btn_attack, "attack", 0, "⚔️ Attack %s" % m_tgt_name, "Strike adjacent foe with equipped weapon (Roll %d attack dice)." % hero.get("attackDice", 3))
				elif adj_doors.size() > 0:
					btn_attack.visible = true
					btn_attack.disabled = false
					var is_secret_adj = false
					for ad in adj_doors:
						if ad.get("is_secret", false):
							is_secret_adj = true
							break
					btn_attack.text = "Open Secret Door" if is_secret_adj else "Open Door"
					if is_secret_adj:
						_update_action_tile(btn_attack, "door", 0, "🚪 Open Secret Door", "Unseal the discovered secret stone door to reveal hidden chamber.")
					else:
						_update_action_tile(btn_attack, "door", 0, "🚪 Open Door", "Kick open adjacent dungeon door to reveal room and foes.")
				else:
					btn_attack.visible = false

			# Contextual search button
			if btn_search:
				if in_room_clean and not has_acted_this_turn:
					btn_search.visible = true
					btn_search.disabled = false
					btn_search.text = "Search Room"
					_update_action_tile(btn_search, "search", 0, "🔍 Search Room for Treasure", "Search this chamber for hidden chests, gems, or gold.")
				else:
					btn_search.visible = false

			if btn_end_turn:
				btn_end_turn.visible = true
				btn_end_turn.disabled = false
				btn_end_turn.text = "End Turn"
				_update_action_tile(btn_end_turn, "end_turn", 0, "⏭️ End Turn", "Conclude current hero's turn and pass initiative.")

		# AI Step button
		if btn_ai_step:
			_update_action_tile(btn_ai_step, "ai_step", 0, "🤖 AI Step (Autonomous Agent)", "Execute next step planned by autonomous AI agent.")

		default_guidance_text = dice_label.text if dice_label else ""
		_update_scroll_buttons_visibility()

	# Character card
	# Character card legacy label update for backwards compatibility
	if hero.size() > 0 and hero_card:
		var turn_badge = "★ YOUR TURN ★\n" if current_phase == "hero_phase" and current_role == "player" else ""
		var h_disp = get_hero_display_title(hero)
		hero_card.text = "%s%s\nBP: %d/%d | MP: %d/%d\nAtk Dice: %d | Def Dice: %d\nGold: %d gp" % [
			turn_badge,
			h_disp,
			hero.get("current_bp", 8), hero.get("bodyPoints", 8),
			hero.get("current_mp", 2), hero.get("mindPoints", 2),
			hero.get("attackDice", 3), hero.get("defendDice", 2),
			hero.get("gold", 0)
		]

	# Render Rich Hero Party Cards & Discovered Enemy Cards
	_update_character_and_enemy_cards()

	_update_log_display()

	_update_turn_overlay()

func _setup_turn_overlay_ui() -> void:
	var ui = get_node_or_null("UI")
	if not ui:
		return

	if turn_overlay_btn and is_instance_valid(turn_overlay_btn):
		turn_overlay_btn.queue_free()
	if flashy_number_panel and is_instance_valid(flashy_number_panel):
		flashy_number_panel.queue_free()

	# 1. Turn Overlay Button ("Rogar (Barbarian)'s turn... Click to roll!" or "turn complete, next turn Dorgan")
	turn_overlay_btn = Button.new()
	turn_overlay_btn.name = "TurnOverlayBtn"
	turn_overlay_btn.custom_minimum_size = Vector2(580, 56)
	turn_overlay_btn.position = Vector2(417, 100) # Centered at X=707 over the board (417 = 707 - 290)
	turn_overlay_btn.size = Vector2(580, 56)
	turn_overlay_btn.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	turn_overlay_btn.visible = false
	turn_overlay_btn.add_theme_font_size_override("font_size", 18)
	turn_overlay_btn.add_theme_color_override("font_color", Color(1.0, 0.94, 0.65, 1.0))
	turn_overlay_btn.add_theme_color_override("font_hover_color", Color(1.0, 1.0, 0.85, 1.0))
	turn_overlay_btn.add_theme_color_override("font_pressed_color", Color(0.95, 0.85, 0.4, 1.0))

	var sb_normal = StyleBoxFlat.new()
	sb_normal.bg_color = Color(0.06, 0.08, 0.14, 0.94)
	sb_normal.border_color = Color(1.0, 0.82, 0.20, 0.95)
	sb_normal.set_border_width_all(2)
	sb_normal.set_corner_radius_all(12)
	sb_normal.shadow_color = Color(0, 0, 0, 0.65)
	sb_normal.shadow_size = 14
	sb_normal.shadow_offset = Vector2(0, 4)
	turn_overlay_btn.add_theme_stylebox_override("normal", sb_normal)

	var sb_hover = StyleBoxFlat.new()
	sb_hover.bg_color = Color(0.10, 0.13, 0.22, 0.98)
	sb_hover.border_color = Color(1.0, 0.95, 0.45, 1.0)
	sb_hover.set_border_width_all(2)
	sb_hover.set_corner_radius_all(12)
	sb_hover.shadow_color = Color(1.0, 0.85, 0.2, 0.35)
	sb_hover.shadow_size = 20
	sb_hover.shadow_offset = Vector2(0, 4)
	turn_overlay_btn.add_theme_stylebox_override("hover", sb_hover)

	var sb_pressed = StyleBoxFlat.new()
	sb_pressed.bg_color = Color(0.04, 0.06, 0.10, 1.0)
	sb_pressed.border_color = Color(0.85, 0.70, 0.15, 1.0)
	sb_pressed.set_border_width_all(2)
	sb_pressed.set_corner_radius_all(12)
	turn_overlay_btn.add_theme_stylebox_override("pressed", sb_pressed)

	turn_overlay_btn.pressed.connect(_on_turn_overlay_pressed)
	ui.add_child(turn_overlay_btn)

	# 2. Flashy Big Number Panel (Top of Screen)
	flashy_number_panel = PanelContainer.new()
	flashy_number_panel.name = "FlashyNumberPanel"
	flashy_number_panel.custom_minimum_size = Vector2(320, 100)
	flashy_number_panel.position = Vector2(547, 36) # Centered at X=707 over the board, top of screen (547 = 707 - 160)
	flashy_number_panel.size = Vector2(320, 100)
	flashy_number_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	flashy_number_panel.visible = false

	var sb_flashy = StyleBoxFlat.new()
	sb_flashy.bg_color = Color(0.08, 0.04, 0.04, 0.96)
	sb_flashy.border_color = Color(1.0, 0.84, 0.25, 1.0)
	sb_flashy.set_border_width_all(2)
	sb_flashy.set_corner_radius_all(16)
	sb_flashy.shadow_color = Color(1.0, 0.8, 0.15, 0.45)
	sb_flashy.shadow_size = 24
	flashy_number_panel.add_theme_stylebox_override("panel", sb_flashy)

	var vbox = VBoxContainer.new()
	vbox.alignment = BoxContainer.ALIGNMENT_CENTER
	vbox.mouse_filter = Control.MOUSE_FILTER_IGNORE
	flashy_number_panel.add_child(vbox)

	flashy_subtitle_label = Label.new()
	flashy_subtitle_label.text = "🎲 MOVEMENT ROLL"
	flashy_subtitle_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	flashy_subtitle_label.add_theme_font_size_override("font_size", 13)
	flashy_subtitle_label.add_theme_color_override("font_color", Color(1.0, 0.82, 0.3, 0.95))
	flashy_subtitle_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vbox.add_child(flashy_subtitle_label)

	flashy_number_label = Label.new()
	flashy_number_label.text = "0"
	flashy_number_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	flashy_number_label.add_theme_font_size_override("font_size", 68)
	flashy_number_label.add_theme_color_override("font_color", Color(1.0, 0.95, 0.45, 1.0))
	flashy_number_label.add_theme_color_override("font_shadow_color", Color(0.2, 0.05, 0.0, 0.95))
	flashy_number_label.add_theme_constant_override("shadow_offset_x", 2)
	flashy_number_label.add_theme_constant_override("shadow_offset_y", 3)
	flashy_number_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vbox.add_child(flashy_number_label)

	ui.add_child(flashy_number_panel)

func show_flashy_roll_number(total: int) -> void:
	flashy_number_val = total
	if flashy_number_label:
		flashy_number_label.text = str(total)
	if flashy_subtitle_label:
		flashy_subtitle_label.text = "🎲 ROLLED %d SQUARES" % total
	flashy_number_time = 0.0
	if flashy_number_panel:
		flashy_number_panel.visible = true
		flashy_number_panel.modulate.a = 1.0
		flashy_number_panel.pivot_offset = flashy_number_panel.size * 0.5
		flashy_number_panel.scale = Vector2(1.35, 1.35)

func get_next_turn_name() -> String:
	if heroes.is_empty():
		return "Zargon"
	if active_hero_idx >= heroes.size() - 1:
		return "Zargon"
	var next_idx = active_hero_idx + 1
	var next_h = heroes[next_idx]
	return get_hero_character_name(next_h)

func _update_turn_overlay() -> void:
	if not turn_overlay_btn:
		return

	if current_phase != "hero_phase":
		turn_overlay_btn.visible = false
		turn_overlay_mode = "none"
		return

	if is_ai_step_pending:
		turn_overlay_btn.visible = false
		return
	if elf_spell_modal and elf_spell_modal.visible:
		turn_overlay_btn.visible = false
		return

	var hero = get_active_hero()
	if hero.is_empty():
		turn_overlay_btn.visible = false
		turn_overlay_mode = "none"
		return

	var h_name = get_hero_character_name(hero)
	var h_class = get_hero_class_name(hero)

	# Keep centered at X=707
	turn_overlay_btn.position.x = 707.0 - turn_overlay_btn.size.x * 0.5
	if flashy_number_panel:
		flashy_number_panel.position.x = 707.0 - flashy_number_panel.size.x * 0.5

	# Case 1: Time to roll dice
	var can_roll = (not movement_rolled) and (not movement_closed) and not (moved_before_action and has_acted_this_turn)
	if turn_state == "awaiting_roll" or (can_roll and not has_acted_this_turn):
		turn_overlay_mode = "roll_prompt"
		turn_overlay_btn.visible = true
		turn_overlay_btn.text = "%s (%s)'s turn... Click to roll!" % [h_name, h_class]
		return

	# Case 2: Turn complete (no more turn remaining)
	var is_turn_done = (turn_state == "turn_complete") or (movement_closed and has_acted_this_turn) or (movement_rolled and movement_remaining <= 0 and has_acted_this_turn)
	if is_turn_done:
		turn_overlay_mode = "turn_complete"
		turn_overlay_btn.visible = true
		if flashy_number_panel:
			flashy_number_panel.visible = false
		var next_name = get_next_turn_name()
		turn_overlay_btn.text = "turn complete, next turn %s" % next_name
		return

	# Otherwise, hero is currently moving or has action available
	turn_overlay_btn.visible = false
	turn_overlay_mode = "none"

func _on_turn_overlay_pressed() -> void:
	if turn_overlay_mode == "roll_prompt":
		roll_movement_dice()
	elif turn_overlay_mode == "turn_complete":
		end_turn()

func _update_character_and_enemy_cards() -> void:
	if not hero_cards_grid:
		hero_cards_grid = get_node_or_null("UI/StatsPanel/HeroCardsGrid")
	if not enemies_header_label:
		enemies_header_label = get_node_or_null("UI/EnemiesPanel/HeaderLabel")
	if not enemies_empty_label:
		enemies_empty_label = get_node_or_null("UI/EnemiesPanel/EmptyLabel")
	if not enemy_cards_grid:
		enemy_cards_grid = get_node_or_null("UI/EnemiesPanel/ScrollContainer/EnemyCardsGrid")

	# Render Hero Party Cards (all 4 heroes in party)
	if hero_cards_grid:
		for c in hero_cards_grid.get_children():
			hero_cards_grid.remove_child(c)
			c.queue_free()
		for i in range(heroes.size()):
			var h = heroes[i]
			var is_act = (i == active_hero_idx and current_phase == "hero_phase" and current_role == "player")
			var card = _create_hero_card(h, is_act)
			hero_cards_grid.add_child(card)

	var vis_count = 0
	var dead_count = 0
	var discovered_list: Array[Dictionary] = []

	for m in monsters:
		var mid = str(m.get("id"))
		var vis = is_monster_currently_visible(m)
		if vis:
			discovered_monster_ids[mid] = true

		if discovered_monster_ids.has(mid):
			var cur_bp = int(m.get("current_bp", 1))
			var alive = bool(m.get("is_alive", true)) and cur_bp > 0
			if not alive:
				dead_count += 1
			elif vis:
				vis_count += 1
			discovered_list.append({ "monster": m, "is_visible": vis, "is_alive": alive })

	if enemies_header_label:
		if discovered_list.is_empty():
			enemies_header_label.text = "DISCOVERED FOES (0 Sighted)"
		else:
			enemies_header_label.text = "DISCOVERED FOES (%d Sighted | %d Defeated)" % [vis_count, dead_count]

	if not btn_toggle_defeated:
		btn_toggle_defeated = get_node_or_null("UI/EnemiesPanel/BtnToggleDefeated")
	if btn_toggle_defeated:
		if dead_count == 0:
			btn_toggle_defeated.text = "💀 Defeated (0)"
			btn_toggle_defeated.disabled = true
			btn_toggle_defeated.modulate = Color(0.7, 0.7, 0.7, 0.6)
		else:
			btn_toggle_defeated.disabled = false
			btn_toggle_defeated.modulate = Color(1.0, 1.0, 1.0, 1.0)
			if show_defeated_monsters:
				btn_toggle_defeated.text = "💀 Hide Defeated (%d)" % dead_count
			else:
				btn_toggle_defeated.text = "💀 Show Defeated (%d)" % dead_count
		_update_toggle_defeated_button_style()

	var displayed_count = 0
	if enemy_cards_grid:
		for c in enemy_cards_grid.get_children():
			enemy_cards_grid.remove_child(c)
			c.queue_free()
		for item in discovered_list:
			if item.get("is_alive", true) or show_defeated_monsters:
				var card = _create_enemy_card(item.monster, item.is_visible)
				enemy_cards_grid.add_child(card)
				displayed_count += 1

	if enemies_empty_label:
		if discovered_list.is_empty():
			enemies_empty_label.text = "No enemies sighted yet.\nOpen doors and explore the dungeon to reveal foes."
			enemies_empty_label.visible = true
		elif displayed_count == 0 and dead_count > 0:
			enemies_empty_label.text = "All sighted foes have been defeated! ⚔️\nClick 'Show Defeated' above to view fallen enemies."
			enemies_empty_label.visible = true
		else:
			enemies_empty_label.visible = false

func _create_hero_card(h: Dictionary, is_active: bool) -> PanelContainer:
	var card = PanelContainer.new()
	card.custom_minimum_size = Vector2(228, 116)
	card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	card.size_flags_vertical = Control.SIZE_SHRINK_CENTER

	var cur_bp = int(h.get("current_bp", 8))
	var max_bp = int(h.get("bodyPoints", 8))
	var cur_mp = int(h.get("current_mp", 2))
	var max_mp = int(h.get("mindPoints", 2))
	var is_dead = cur_bp <= 0
	var is_on_board = bool(h.get("is_on_board", false))

	var sb = StyleBoxFlat.new()
	sb.corner_radius_top_left = 6
	sb.corner_radius_top_right = 6
	sb.corner_radius_bottom_left = 6
	sb.corner_radius_bottom_right = 6

	if is_dead:
		sb.bg_color = Color(0.24, 0.05, 0.05, 0.95)
		sb.border_color = Color(0.9, 0.15, 0.15, 1.0)
		sb.border_width_left = 2; sb.border_width_top = 2; sb.border_width_right = 2; sb.border_width_bottom = 2
		sb.shadow_color = Color(0.9, 0.1, 0.1, 0.4)
		sb.shadow_size = 4
	elif is_active:
		sb.bg_color = Color(0.14, 0.18, 0.26, 0.96)
		sb.border_color = Color(1.0, 0.82, 0.2, 1.0) # Golden active turn glow
		sb.border_width_left = 2; sb.border_width_top = 2; sb.border_width_right = 2; sb.border_width_bottom = 2
		sb.shadow_color = Color(1.0, 0.8, 0.2, 0.45)
		sb.shadow_size = 4
	elif not is_on_board:
		sb.bg_color = Color(0.09, 0.11, 0.16, 0.75)
		sb.border_color = Color(0.25, 0.30, 0.38, 0.5)
		sb.border_width_left = 1; sb.border_width_top = 1; sb.border_width_right = 1; sb.border_width_bottom = 1
	else:
		sb.bg_color = Color(0.11, 0.14, 0.20, 0.92)
		sb.border_color = Color(0.28, 0.38, 0.50, 0.85)
		sb.border_width_left = 1; sb.border_width_top = 1; sb.border_width_right = 1; sb.border_width_bottom = 1

	card.add_theme_stylebox_override("panel", sb)

	var margin = MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 6)
	margin.add_theme_constant_override("margin_right", 6)
	margin.add_theme_constant_override("margin_top", 5)
	margin.add_theme_constant_override("margin_bottom", 5)
	card.add_child(margin)

	var main_hbox = HBoxContainer.new()
	main_hbox.add_theme_constant_override("separation", 7)
	margin.add_child(main_hbox)

	var token_tex = get_hero_token_texture(h)
	if token_tex:
		var token_rect = TextureRect.new()
		token_rect.texture = token_tex
		token_rect.custom_minimum_size = Vector2(38, 38)
		token_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		token_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		token_rect.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		main_hbox.add_child(token_rect)

	var vbox = VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 2)
	vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	main_hbox.add_child(vbox)

	# Row 1: Header (Name + Class & Status Badge)
	var hdr_row = HBoxContainer.new()
	var name_lbl = Label.new()
	name_lbl.text = get_hero_display_title(h)
	name_lbl.tooltip_text = "Name: %s | Class: %s" % [get_hero_character_name(h), get_hero_class_name(h)]
	name_lbl.add_theme_font_size_override("font_size", 12)
	name_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_lbl.clip_text = true
	if is_dead:
		name_lbl.add_theme_color_override("font_color", Color(1.0, 0.3, 0.3, 1.0))
	elif is_active:
		name_lbl.add_theme_color_override("font_color", Color(1.0, 0.9, 0.3, 1.0))
	else:
		name_lbl.add_theme_color_override("font_color", Color(0.9, 0.95, 1.0, 1.0))
	hdr_row.add_child(name_lbl)

	var status_tag = Label.new()
	status_tag.add_theme_font_size_override("font_size", 10)
	if is_dead:
		status_tag.text = "[DEAD]"
		status_tag.add_theme_color_override("font_color", Color(1.0, 0.2, 0.2, 1.0))
	elif is_active:
		status_tag.text = "★ ACTIVE"
		status_tag.add_theme_color_override("font_color", Color(1.0, 0.85, 0.2, 1.0))
	elif not is_on_board:
		status_tag.text = "[Off Board]"
		status_tag.add_theme_color_override("font_color", Color(0.55, 0.60, 0.70, 0.8))
	else:
		status_tag.text = "[On Board]"
		status_tag.add_theme_color_override("font_color", Color(0.3, 0.85, 0.45, 0.9))
	hdr_row.add_child(status_tag)
	vbox.add_child(hdr_row)

	# Row 2: BP Bar & Text
	var bp_row = HBoxContainer.new()
	bp_row.add_theme_constant_override("separation", 6)
	var bp_lbl = Label.new()
	bp_lbl.text = "BP %d/%d" % [cur_bp, max_bp]
	bp_lbl.add_theme_font_size_override("font_size", 10)
	bp_lbl.custom_minimum_size = Vector2(55, 0)
	bp_row.add_child(bp_lbl)

	var bp_bar = ProgressBar.new()
	bp_bar.custom_minimum_size = Vector2(0, 7)
	bp_bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bp_bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	bp_bar.show_percentage = false
	bp_bar.max_value = max_bp
	bp_bar.value = max(0, cur_bp)
	var bp_pct = float(cur_bp) / max(1.0, float(max_bp))
	var bp_col = Color(0.2, 0.85, 0.35, 1.0)
	if is_dead:
		bp_col = Color(0.85, 0.15, 0.15, 1.0)
	elif bp_pct <= 0.25:
		bp_col = Color(0.95, 0.25, 0.25, 1.0)
	elif bp_pct <= 0.5:
		bp_col = Color(1.0, 0.75, 0.2, 1.0)
	var bp_fill = StyleBoxFlat.new()
	bp_fill.bg_color = bp_col
	bp_fill.corner_radius_top_left = 2; bp_fill.corner_radius_top_right = 2
	bp_fill.corner_radius_bottom_left = 2; bp_fill.corner_radius_bottom_right = 2
	bp_bar.add_theme_stylebox_override("fill", bp_fill)
	var bp_bg = StyleBoxFlat.new()
	bp_bg.bg_color = Color(0.08, 0.10, 0.14, 0.9)
	bp_bar.add_theme_stylebox_override("background", bp_bg)
	bp_row.add_child(bp_bar)
	vbox.add_child(bp_row)

	# Row 3: MP Bar & Text
	var mp_row = HBoxContainer.new()
	mp_row.add_theme_constant_override("separation", 6)
	var mp_lbl = Label.new()
	mp_lbl.text = "MP %d/%d" % [cur_mp, max_mp]
	mp_lbl.add_theme_font_size_override("font_size", 10)
	mp_lbl.custom_minimum_size = Vector2(55, 0)
	mp_row.add_child(mp_lbl)

	var mp_bar = ProgressBar.new()
	mp_bar.custom_minimum_size = Vector2(0, 7)
	mp_bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mp_bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	mp_bar.show_percentage = false
	mp_bar.max_value = max_mp
	mp_bar.value = max(0, cur_mp)
	var mp_fill = StyleBoxFlat.new()
	mp_fill.bg_color = Color(0.2, 0.7, 0.95, 1.0)
	mp_fill.corner_radius_top_left = 2; mp_fill.corner_radius_top_right = 2
	mp_fill.corner_radius_bottom_left = 2; mp_fill.corner_radius_bottom_right = 2
	mp_bar.add_theme_stylebox_override("fill", mp_fill)
	var mp_bg = StyleBoxFlat.new()
	mp_bg.bg_color = Color(0.08, 0.10, 0.14, 0.9)
	mp_bar.add_theme_stylebox_override("background", mp_bg)
	mp_row.add_child(mp_bar)
	vbox.add_child(mp_row)

	# Row 4: Combat stats & equipment
	var atk_d = get_hero_attack_dice(h)
	var def_d = get_hero_defend_dice(h)
	var wep = str(h.get("equipped_weapon", "unarmed")).capitalize()
	var arm = h.get("equipped_armor", [])
	var stat_row = HBoxContainer.new()
	var dice_stat = Label.new()
	dice_stat.text = "ATK %dd   DEF %dd" % [atk_d, def_d]
	dice_stat.add_theme_font_size_override("font_size", 10)
	dice_stat.add_theme_color_override("font_color", Color(0.85, 0.88, 0.95, 0.95))
	stat_row.add_child(dice_stat)

	var eq_str = wep
	if arm.size() > 0:
		eq_str += " | " + arm[0].capitalize()
	var eq_lbl = Label.new()
	eq_lbl.text = eq_str
	eq_lbl.clip_text = true
	eq_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	eq_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	eq_lbl.add_theme_font_size_override("font_size", 10)
	eq_lbl.add_theme_color_override("font_color", Color(0.7, 0.78, 0.88, 0.85))
	stat_row.add_child(eq_lbl)
	vbox.add_child(stat_row)

	# Row 5: Status Effects / Buffs pills
	var eff_list: Array[String] = []
	if h.get("rock_skin_active", false):
		eff_list.append("Rock Skin")
	if h.get("courage_active", false):
		eff_list.append("Courage")
	if h.get("swift_wind_active", false):
		eff_list.append("Swift Wind")
	if h.get("pass_through_rock_active", false):
		eff_list.append("Pass Rock")
	if h.get("veil_of_mist_active", false):
		eff_list.append("Veil Mist")
	if h.get("is_sleeping", false):
		eff_list.append("Sleep")

	if eff_list.size() > 0:
		var eff_row = HBoxContainer.new()
		eff_row.add_theme_constant_override("separation", 4)
		for eff in eff_list:
			var pill = PanelContainer.new()
			var psb = StyleBoxFlat.new()
			psb.bg_color = Color(0.18, 0.28, 0.42, 0.9)
			psb.border_color = Color(0.35, 0.65, 0.95, 0.9)
			psb.border_width_left = 1; psb.border_width_top = 1; psb.border_width_right = 1; psb.border_width_bottom = 1
			psb.corner_radius_top_left = 3; psb.corner_radius_top_right = 3
			psb.corner_radius_bottom_left = 3; psb.corner_radius_bottom_right = 3
			pill.add_theme_stylebox_override("panel", psb)
			var plbl = Label.new()
			plbl.text = eff
			plbl.add_theme_font_size_override("font_size", 9)
			plbl.add_theme_color_override("font_color", Color(0.85, 0.95, 1.0, 1.0))
			var pmarg = MarginContainer.new()
			pmarg.add_theme_constant_override("margin_left", 4)
			pmarg.add_theme_constant_override("margin_right", 4)
			pmarg.add_theme_constant_override("margin_top", 1)
			pmarg.add_theme_constant_override("margin_bottom", 1)
			pmarg.add_child(plbl)
			pill.add_child(pmarg)
			eff_row.add_child(pill)
		vbox.add_child(eff_row)

	var hero_spells: Array = h.get("spells", [])
	if hero_spells.size() > 0:
		var spells_row = HBoxContainer.new()
		spells_row.add_theme_constant_override("separation", 4)
		var sp_lbl = Label.new()
		var sp_preview: Array = []
		for s in hero_spells.slice(0, 3):
			sp_preview.append(str(s).replace("_", " ").capitalize())
		sp_lbl.text = "Spells (%d): %s" % [hero_spells.size(), ", ".join(sp_preview)]
		if hero_spells.size() > 3:
			sp_lbl.text += " +%d" % (hero_spells.size() - 3)
		sp_lbl.add_theme_font_size_override("font_size", 9)
		sp_lbl.add_theme_color_override("font_color", Color(0.75, 0.70, 0.95, 0.95))
		sp_lbl.clip_text = true
		sp_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		spells_row.add_child(sp_lbl)

		if is_active:
			var btn_cast = Button.new()
			btn_cast.text = "Cast"
			btn_cast.add_theme_font_size_override("font_size", 9)
			btn_cast.custom_minimum_size = Vector2(36, 16)
			btn_cast.disabled = has_acted_this_turn
			btn_cast.pressed.connect(toggle_spell_cast_modal)
			spells_row.add_child(btn_cast)
		vbox.add_child(spells_row)

	var hero_inv: Array = h.get("inventory", [])
	if hero_inv.size() > 0:
		var inv_row = HBoxContainer.new()
		inv_row.add_theme_constant_override("separation", 4)
		var inv_lbl = Label.new()
		var inv_preview: Array = []
		for item in hero_inv.slice(0, 3):
			var item_str = str(item)
			var item_meta = HeroQuestEquipment.get_item(item_str)
			var iname = str(item_meta.get("name", item_str.replace("_", " ").capitalize()))
			var icon = str(item_meta.get("icon", "📦"))
			inv_preview.append("%s %s" % [icon, iname])
		inv_lbl.text = "Items (%d): %s" % [hero_inv.size(), ", ".join(inv_preview)]
		if hero_inv.size() > 3:
			inv_lbl.text += " +%d" % (hero_inv.size() - 3)
		inv_lbl.add_theme_font_size_override("font_size", 9)
		inv_lbl.add_theme_color_override("font_color", Color(0.65, 0.88, 0.82, 0.95))
		inv_lbl.clip_text = true
		inv_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		inv_row.add_child(inv_lbl)

		if is_active:
			var btn_inv = Button.new()
			btn_inv.text = "Items"
			btn_inv.add_theme_font_size_override("font_size", 9)
			btn_inv.custom_minimum_size = Vector2(38, 16)
			btn_inv.pressed.connect(toggle_item_use_modal)
			inv_row.add_child(btn_inv)
		vbox.add_child(inv_row)

	# Row 7: Trap Disarming Capability
	var disarm_check = can_hero_disarm(h)
	if disarm_check.get("can_disarm", false):
		var trap_row = HBoxContainer.new()
		trap_row.add_theme_constant_override("separation", 4)
		var trap_lbl = Label.new()
		if disarm_check.get("is_dwarf", false):
			trap_lbl.text = "Trap Mastery: Innate"
			trap_lbl.add_theme_color_override("font_color", Color(1.0, 0.85, 0.4, 0.95))
		else:
			trap_lbl.text = "Trap Disarm: Tool Kit"
			trap_lbl.add_theme_color_override("font_color", Color(0.4, 0.9, 0.7, 0.95))
		trap_lbl.add_theme_font_size_override("font_size", 9)
		trap_lbl.clip_text = true
		trap_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		trap_row.add_child(trap_lbl)

		if is_active:
			var btn_disarm = Button.new()
			btn_disarm.text = "Disarm"
			btn_disarm.add_theme_font_size_override("font_size", 9)
			btn_disarm.custom_minimum_size = Vector2(42, 16)
			var adj_traps = get_adjacent_detected_traps()
			btn_disarm.disabled = has_acted_this_turn or adj_traps.is_empty()
			btn_disarm.pressed.connect(_on_disarm_trap_button_pressed)
			trap_row.add_child(btn_disarm)
		vbox.add_child(trap_row)

	return card

func _create_enemy_card(m: Dictionary, is_visible: bool) -> PanelContainer:
	var card = PanelContainer.new()
	card.custom_minimum_size = Vector2(224, 105)
	card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	card.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	card.mouse_filter = Control.MOUSE_FILTER_PASS

	var cur_bp = int(m.get("current_bp", 1))
	var max_bp = int(m.get("bodyPoints", 1))
	var is_alive = bool(m.get("is_alive", true)) and cur_bp > 0
	var is_sleeping = bool(m.get("is_sleeping", false))
	var is_stunned = bool(m.get("tempest_stunned", false))

	var sb = StyleBoxFlat.new()
	sb.corner_radius_top_left = 6
	sb.corner_radius_top_right = 6
	sb.corner_radius_bottom_left = 6
	sb.corner_radius_bottom_right = 6

	if not is_alive:
		# Defeated monster styling
		sb.bg_color = Color(0.20, 0.08, 0.08, 0.85)
		sb.border_color = Color(0.70, 0.20, 0.20, 0.75)
		sb.border_width_left = 1; sb.border_width_top = 1; sb.border_width_right = 1; sb.border_width_bottom = 1
		card.modulate = Color(0.85, 0.85, 0.85, 0.75)
	elif is_visible:
		# Currently visible enemy
		sb.bg_color = Color(0.12, 0.18, 0.16, 0.95)
		sb.border_color = Color(0.20, 0.85, 0.50, 1.0) # Emerald sightline glow
		sb.border_width_left = 2; sb.border_width_top = 2; sb.border_width_right = 2; sb.border_width_bottom = 2
		sb.shadow_color = Color(0.1, 0.8, 0.4, 0.3)
		sb.shadow_size = 3
		card.modulate = Color(1.0, 1.0, 1.0, 1.0)
	else:
		# No longer visible enemy
		sb.bg_color = Color(0.10, 0.12, 0.16, 0.75)
		sb.border_color = Color(0.35, 0.42, 0.52, 0.6)
		sb.border_width_left = 1; sb.border_width_top = 1; sb.border_width_right = 1; sb.border_width_bottom = 1
		card.modulate = Color(0.75, 0.75, 0.80, 0.65) # Dimmed opacity for out-of-sight

	card.add_theme_stylebox_override("panel", sb)

	var margin = MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 8)
	margin.add_theme_constant_override("margin_right", 8)
	margin.add_theme_constant_override("margin_top", 5)
	margin.add_theme_constant_override("margin_bottom", 5)
	margin.mouse_filter = Control.MOUSE_FILTER_PASS
	card.add_child(margin)

	var main_hbox = HBoxContainer.new()
	main_hbox.add_theme_constant_override("separation", 7)
	main_hbox.mouse_filter = Control.MOUSE_FILTER_PASS
	margin.add_child(main_hbox)

	var token_tex = get_monster_token_texture(m)
	if token_tex:
		var token_rect = TextureRect.new()
		token_rect.texture = token_tex
		token_rect.custom_minimum_size = Vector2(38, 38)
		token_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		token_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		token_rect.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		token_rect.mouse_filter = Control.MOUSE_FILTER_PASS
		main_hbox.add_child(token_rect)

	var vbox = VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 2)
	vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	vbox.mouse_filter = Control.MOUSE_FILTER_PASS
	main_hbox.add_child(vbox)

	# Row 1: Header (Name & Visibility Badge)
	var hdr_row = HBoxContainer.new()
	var name_lbl = Label.new()
	var m_name = str(m.get("name", "Monster"))
	name_lbl.text = m_name
	name_lbl.add_theme_font_size_override("font_size", 12)
	name_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_lbl.clip_text = true

	var vis_badge = Label.new()
	vis_badge.add_theme_font_size_override("font_size", 10)

	if not is_alive:
		name_lbl.add_theme_color_override("font_color", Color(0.85, 0.4, 0.4, 0.9))
		vis_badge.text = "[DEFEATED]"
		vis_badge.add_theme_color_override("font_color", Color(1.0, 0.3, 0.3, 1.0))
	elif is_visible:
		name_lbl.add_theme_color_override("font_color", Color(0.9, 1.0, 0.95, 1.0))
		vis_badge.text = "[VISIBLE]"
		vis_badge.add_theme_color_override("font_color", Color(0.3, 0.95, 0.6, 1.0))
	else:
		name_lbl.add_theme_color_override("font_color", Color(0.75, 0.78, 0.85, 0.8))
		vis_badge.text = "[OUT OF SIGHT]"
		vis_badge.add_theme_color_override("font_color", Color(0.65, 0.70, 0.80, 0.8))

	hdr_row.add_child(name_lbl)
	hdr_row.add_child(vis_badge)
	vbox.add_child(hdr_row)

	# Row 2: BP Bar & Text
	var bp_row = HBoxContainer.new()
	bp_row.add_theme_constant_override("separation", 6)
	var bp_lbl = Label.new()
	bp_lbl.text = "BP %d/%d" % [cur_bp, max_bp]
	bp_lbl.add_theme_font_size_override("font_size", 10)
	bp_lbl.custom_minimum_size = Vector2(55, 0)
	bp_row.add_child(bp_lbl)

	var bp_bar = ProgressBar.new()
	bp_bar.custom_minimum_size = Vector2(0, 7)
	bp_bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bp_bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	bp_bar.show_percentage = false
	bp_bar.max_value = max_bp
	bp_bar.value = max(0, cur_bp)
	var bp_fill = StyleBoxFlat.new()
	if not is_alive:
		bp_fill.bg_color = Color(0.6, 0.15, 0.15, 0.8)
	elif is_visible:
		bp_fill.bg_color = Color(0.85, 0.25, 0.25, 1.0)
	else:
		bp_fill.bg_color = Color(0.65, 0.4, 0.4, 0.7)
	bp_fill.corner_radius_top_left = 2; bp_fill.corner_radius_top_right = 2
	bp_fill.corner_radius_bottom_left = 2; bp_fill.corner_radius_bottom_right = 2
	bp_bar.add_theme_stylebox_override("fill", bp_fill)
	var bp_bg = StyleBoxFlat.new()
	bp_bg.bg_color = Color(0.08, 0.10, 0.14, 0.9)
	bp_bar.add_theme_stylebox_override("background", bp_bg)
	bp_row.add_child(bp_bar)
	vbox.add_child(bp_row)

	# Row 3: Stats row
	var atk_d = int(m.get("attackDice", 2))
	var def_d = int(m.get("defendDice", 2))
	var mv_sq = int(m.get("moveSquares", 6))
	var stat_row = HBoxContainer.new()
	var stat_lbl = Label.new()
	stat_lbl.text = "ATK %dd   DEF %dd   MOV %d" % [atk_d, def_d, mv_sq]
	stat_lbl.add_theme_font_size_override("font_size", 10)
	stat_lbl.add_theme_color_override("font_color", Color(0.8, 0.85, 0.92, 0.9))
	stat_row.add_child(stat_lbl)
	vbox.add_child(stat_row)

	# Row 4: Conditions (Sleep, Stun, etc.)
	var eff_list: Array[String] = []
	if is_sleeping:
		eff_list.append("Sleeping")
	if is_stunned:
		eff_list.append("Stunned")

	if eff_list.size() > 0:
		var eff_row = HBoxContainer.new()
		eff_row.add_theme_constant_override("separation", 4)
		for eff in eff_list:
			var pill = PanelContainer.new()
			var psb = StyleBoxFlat.new()
			psb.bg_color = Color(0.35, 0.20, 0.10, 0.9) if "Sleep" in eff else Color(0.15, 0.25, 0.4, 0.9)
			psb.border_color = Color(0.9, 0.65, 0.2, 0.9) if "Sleep" in eff else Color(0.3, 0.7, 1.0, 0.9)
			psb.border_width_left = 1; psb.border_width_top = 1; psb.border_width_right = 1; psb.border_width_bottom = 1
			psb.corner_radius_top_left = 3; psb.corner_radius_top_right = 3
			psb.corner_radius_bottom_left = 3; psb.corner_radius_bottom_right = 3
			pill.add_theme_stylebox_override("panel", psb)
			var plbl = Label.new()
			plbl.text = eff
			plbl.add_theme_font_size_override("font_size", 9)
			plbl.add_theme_color_override("font_color", Color(1.0, 0.95, 0.8, 1.0))
			var pmarg = MarginContainer.new()
			pmarg.add_theme_constant_override("margin_left", 4)
			pmarg.add_theme_constant_override("margin_right", 4)
			pmarg.add_theme_constant_override("margin_top", 1)
			pmarg.add_theme_constant_override("margin_bottom", 1)
			pmarg.add_child(plbl)
			pill.add_child(pmarg)
			eff_row.add_child(pill)
		vbox.add_child(eff_row)

	return card

func _sanitize_ui_text(text: String) -> String:
	var s = text
	# Replace emojis with clean thematic bracket tags or text
	s = s.replace("🛡️", "[SHIELD]").replace("🛡", "[SHIELD]")
	s = s.replace("⚔️", "[ATTACK]").replace("⚔", "[ATTACK]")
	s = s.replace("💥", "[HIT]")
	s = s.replace("💀", "[DEFEATED]")
	s = s.replace("👑", "[GM]")
	s = s.replace("🎲", "[DICE]")
	s = s.replace("🔮", "[SPELL]")
	s = s.replace("🔥", "[SPELL]")
	s = s.replace("⚡", "[SPELL]")
	s = s.replace("🦁", "[SPELL]")
	s = s.replace("🪨", "[SPELL]")
	s = s.replace("💚", "[HEAL]")
	s = s.replace("👻", "[SPELL]")
	s = s.replace("💧", "[HEAL]")
	s = s.replace("💤", "[SLEEP]")
	s = s.replace("🌫️", "[SPELL]").replace("🌫", "[SPELL]")
	s = s.replace("🧞", "[GENIE]")
	s = s.replace("💨", "[SPELL]")
	s = s.replace("🌪️", "[SPELL]").replace("🌪", "[SPELL]")
	s = s.replace("👁️", "[DREAD]").replace("👁", "[DREAD]")
	s = s.replace("💰", "[TREASURE]")
	s = s.replace("🔍", "[SEARCH]")
	s = s.replace("🛠️", "[DISARM]").replace("🛠", "[DISARM]")
	s = s.replace("🌟", "[ENTER]")
	s = s.replace("👹", "[MONSTER]")
	s = s.replace("👣", "[MOVE]")
	s = s.replace("🚪", "[DOOR]")
	s = s.replace("⏹️", "[END]").replace("⏹", "[END]")
	s = s.replace("⚠️", "[!]").replace("⚠", "[!]")
	s = s.replace("❌", "[X]")
	s = s.replace("🗡️", "[ATTACK]").replace("🗡", "[ATTACK]")
	s = s.replace("👉", "->")
	s = s.replace("🤖", "[AI]")
	s = s.replace("✨", "[*]")
	s = s.replace("🧌", "[MONSTER]")

	# Strip any variation selectors (0xFE00..0xFE0F) or high emoji characters
	var out = ""
	for i in range(s.length()):
		var code = s.unicode_at(i)
		if code >= 0xFE00 and code <= 0xFE0F:
			continue
		if code >= 0x1F000 and code <= 0x1FAFF:
			continue
		if code >= 0x2600 and code <= 0x27BF and code != 0x2605: # Preserve star ★ (0x2605)
			continue
		out += s[i]
	return out

func _update_log_display() -> void:
	if log_label:
		var log_text = ""
		for i in range(maxi(0, combat_log.size() - 8), combat_log.size()):
			log_text += _sanitize_ui_text(combat_log[i]) + "\n"
		log_label.text = log_text

func _log(msg: String) -> void:
	var clean_msg = _sanitize_ui_text(msg)
	print("[Tabletop] ", clean_msg)
	combat_log.append(clean_msg)
	_update_log_display()

func get_telemetry_state() -> Dictionary:
	var exp_tiles: Array = []
	for t in explored_tiles.keys():
		exp_tiles.append([t.x, t.y])

	var h_act = get_active_hero()
	var h_pos = h_act.get("grid_pos", Vector2i(-1, -1))
	var active_center = board_offset + Vector2(h_pos.x * tile_size + tile_size * 0.5, h_pos.y * tile_size + tile_size * 0.5)

	var heroes_copy: Array = []
	var char_cards: Array = []
	for i in range(heroes.size()):
		var h = heroes[i]
		var hc = h.duplicate(true)
		var gp = h.get("grid_pos", Vector2i(-1, -1))
		hc["grid_pos"] = [gp.x, gp.y]
		var atk_dice = get_hero_attack_dice(h)
		var def_dice = get_hero_defend_dice(h)
		hc["attackDice"] = atk_dice
		hc["defendDice"] = def_dice
		heroes_copy.append(hc)

		var cur_bp = int(h.get("current_bp", 8))
		var max_bp = int(h.get("bodyPoints", 8))
		var cur_mp = int(h.get("current_mp", 2))
		var max_mp = int(h.get("mindPoints", 2))
		var is_act = (i == active_hero_idx and current_phase == "hero_phase" and current_role == "player")
		var effs: Array[String] = []
		if h.get("rock_skin_active", false): effs.append("rock_skin")
		if h.get("courage_active", false): effs.append("courage")
		if h.get("swift_wind_active", false): effs.append("swift_wind")
		if h.get("pass_through_rock_active", false): effs.append("pass_through_rock")
		if h.get("veil_of_mist_active", false): effs.append("veil_of_mist")
		if h.get("is_sleeping", false): effs.append("sleep")

		char_cards.append({
			"id": str(h.get("id")),
			"name": str(h.get("name")),
			"characterName": get_hero_character_name(h),
			"heroClass": get_hero_class_name(h),
			"displayName": get_hero_display_title(h),
			"title": str(h.get("title", "")),
			"current_bp": cur_bp,
			"max_bp": max_bp,
			"current_mp": cur_mp,
			"max_mp": max_mp,
			"attackDice": atk_dice,
			"defendDice": def_dice,
			"gold": int(h.get("gold", 0)),
			"isActive": is_act,
			"isOnBoard": bool(h.get("is_on_board", false)),
			"isAlive": cur_bp > 0,
			"weapon": str(h.get("equipped_weapon", "unarmed")),
			"armor": h.get("equipped_armor", []),
			"statusEffects": effs,
			"tokenAsset": get_hero_token_path(h),
			"hasTokenTexture": (get_hero_token_texture(h) != null)
		})

	var monsters_copy: Array = []
	var enemy_cards: Array = []
	var vis_count = 0
	var dead_count = 0
	for m in monsters:
		var mc = m.duplicate(true)
		var mp = m.get("grid_pos", Vector2i(-1, -1))
		mc["grid_pos"] = [mp.x, mp.y]
		monsters_copy.append(mc)

		var mid = str(m.get("id"))
		if discovered_monster_ids.has(mid):
			var vis = is_monster_currently_visible(m)
			var cur_bp = int(m.get("current_bp", 1))
			var max_bp = int(m.get("bodyPoints", 1))
			var alive = bool(m.get("is_alive", true)) and cur_bp > 0
			var effs: Array[String] = []
			if m.get("is_sleeping", false): effs.append("sleep")
			if m.get("tempest_stunned", false): effs.append("tempest_stunned")

			var badge = "visible"
			if not alive:
				badge = "defeated"
				dead_count += 1
			elif vis:
				badge = "visible"
				vis_count += 1
			else:
				badge = "not_visible"

			enemy_cards.append({
				"id": mid,
				"name": str(m.get("name")),
				"type": str(m.get("type", "monster")),
				"current_bp": cur_bp,
				"max_bp": max_bp,
				"attackDice": int(m.get("attackDice", 2)),
				"defendDice": int(m.get("defendDice", 2)),
				"moveSquares": int(m.get("moveSquares", 6)),
				"isVisible": vis,
				"isAlive": alive,
				"displayedInUi": (alive or show_defeated_monsters),
				"statusBadge": badge,
				"statusEffects": effs,
				"grid_pos": [mp.x, mp.y],
				"roomId": str(m.get("roomId", "")),
				"tokenAsset": get_monster_token_path(m),
				"hasTokenTexture": (get_monster_token_texture(m) != null)
			})

	var displayed_enemy_cards: Array = []
	for ec in enemy_cards:
		if ec.get("displayedInUi", false):
			displayed_enemy_cards.append(ec)

	var traps_copy: Array = []
	for tr in traps:
		var tc = tr.duplicate(true)
		var tx = int(tr.get("x", tr.get("position", [0, 0])[0]))
		var ty = int(tr.get("y", tr.get("position", [0, 0])[1]))
		tc["x"] = tx
		tc["y"] = ty
		tc["grid_pos"] = [tx, ty]
		tc["type"] = str(tr.get("type", tr.get("trapType", "pit")))
		tc["detected"] = bool(tr.get("detected", false) or tr.get("is_revealed", false))
		tc["disarmed"] = bool(tr.get("disarmed", false))
		tc["sprung"] = bool(tr.get("sprung", false) or tr.get("is_sprung", false))
		tc["spent"] = bool(tr.get("spent", false))
		tc["blocked"] = bool(tr.get("blocked", false))
		traps_copy.append(tc)

	var furniture_copy: Array = []
	for f in furniture:
		furniture_copy.append(f.duplicate(true))

	var wall_blocks_copy: Array = []
	for wb in wall_blocks:
		wall_blocks_copy.append(wb.duplicate(true))

	var scene_tokens: Dictionary = {}
	for h in heroes:
		if h.get("is_on_board", false) and int(h.get("current_bp", 0)) > 0:
			var gp = h.get("grid_pos", Vector2i(-1, -1))
			var pixel_pos = board_offset + Vector2((gp.x + 0.5) * tile_size, (gp.y + 0.5) * tile_size)
			scene_tokens[str(h.get("id"))] = {
				"type": "hero",
				"grid_pos": [gp.x, gp.y],
				"pixelPos": [pixel_pos.x, pixel_pos.y],
				"visible": true,
				"tokenAsset": get_hero_token_path(h),
				"hasTokenTexture": (get_hero_token_texture(h) != null)
			}
	for m in monsters:
		var mid = str(m.get("id"))
		var gp = m.get("grid_pos", Vector2i(-1, -1))
		var pixel_pos = board_offset + Vector2((gp.x + 0.5) * tile_size, (gp.y + 0.5) * tile_size)
		var is_vis = is_monster_currently_visible(m)
		var is_alv = bool(m.get("is_alive", true)) and int(m.get("current_bp", 1)) > 0
		scene_tokens[mid] = {
			"type": "monster",
			"grid_pos": [gp.x, gp.y],
			"pixelPos": [pixel_pos.x, pixel_pos.y],
			"visible": is_vis and is_alv,
			"alive": is_alv,
			"tokenAsset": get_monster_token_path(m),
			"hasTokenTexture": (get_monster_token_texture(m) != null)
		}

	var doors_copy: Array = []
	var scene_doors: Array = []
	for d in doors:
		var is_sec = bool(d.get("is_secret", false))
		var is_rev = bool(d.get("is_revealed", not is_sec))
		var is_op = bool(d.get("is_open", false))
		var dc = d.duplicate(true)
		dc["is_open"] = is_op
		dc["is_secret"] = is_sec
		dc["is_revealed"] = is_rev
		doors_copy.append(dc)

		var f = d.get("from", [0, 0])
		var t = d.get("to", [0, 0])
		var mid_x = (float(f[0]) + float(t[0])) * 0.5 + 0.5
		var mid_y = (float(f[1]) + float(t[1])) * 0.5 + 0.5
		var pixel_pos = board_offset + Vector2(mid_x * tile_size, mid_y * tile_size)
		scene_doors.append({
			"id": str(d.get("id", "")),
			"isOpen": is_op,
			"isSecret": is_sec,
			"isRevealed": is_rev,
			"from": f,
			"to": t,
			"pixelPos": [pixel_pos.x, pixel_pos.y]
		})

	var scene_ui: Dictionary = {
		"title": title_label.text if title_label else "",
		"diceLabel": dice_label.text if dice_label else "",
		"buttons": {
			"roll": { "visible": btn_roll.visible, "disabled": btn_roll.disabled, "tooltip": btn_roll.tooltip_text, "icon": "action_move" } if btn_roll else {},
			"attack": { "visible": btn_attack.visible, "disabled": btn_attack.disabled, "text": btn_attack.text, "tooltip": btn_attack.tooltip_text, "icon": ("action_door" if ("Door" in btn_attack.text) else "action_attack") } if btn_attack else {},
			"cast_spell": { "visible": btn_cast_spell.visible, "disabled": btn_cast_spell.disabled, "tooltip": btn_cast_spell.tooltip_text, "icon": "action_spell" } if btn_cast_spell else {},
			"use_item": { "visible": btn_use_item.visible, "disabled": btn_use_item.disabled, "tooltip": btn_use_item.tooltip_text, "icon": "action_item" } if btn_use_item else {},
			"search": { "visible": btn_search.visible, "disabled": btn_search.disabled, "tooltip": btn_search.tooltip_text, "icon": "action_search" } if btn_search else {},
			"search_traps": { "visible": btn_search_traps.visible, "disabled": btn_search_traps.disabled, "tooltip": btn_search_traps.tooltip_text, "icon": "action_traps" } if btn_search_traps else {},
			"disarm_trap": { "visible": btn_disarm_trap.visible, "disabled": btn_disarm_trap.disabled, "tooltip": btn_disarm_trap.tooltip_text, "icon": "action_disarm" } if btn_disarm_trap else {},
			"end_turn": { "visible": btn_end_turn.visible, "disabled": btn_end_turn.disabled, "tooltip": btn_end_turn.tooltip_text, "icon": "action_end_turn" } if btn_end_turn else {},
			"ai_step": { "visible": btn_ai_step.visible, "disabled": btn_ai_step.disabled, "tooltip": btn_ai_step.tooltip_text, "icon": "action_ai_step" } if btn_ai_step else {},
			"summon": { "visible": btn_summon.visible, "disabled": btn_summon.disabled, "tooltip": btn_summon.tooltip_text, "icon": "action_summon" } if btn_summon else {}
		},
		"hotbar": {
			"actionsCount": actions_container.get_child_count() if actions_container else 10,
			"scrollHorizontal": actions_scroll.scroll_horizontal if actions_scroll else 0,
			"overflow": (btn_scroll_right.visible or btn_scroll_left.visible) if (btn_scroll_right and btn_scroll_left) else false
		},
		"modal": {
			"aiConfirmModalVisible": ai_confirm_modal.visible if ai_confirm_modal else false,
			"elfSpellSelectModalVisible": elf_spell_modal.visible if elf_spell_modal else false,
			"spellCastModalVisible": spell_cast_modal.visible if spell_cast_modal else false,
			"itemUseModalVisible": item_use_modal.visible if item_use_modal else false,
			"disarmTrapModalVisible": disarm_trap_modal.visible if disarm_trap_modal else false,
			"stepBadge": ai_modal_step_badge.text if (ai_confirm_modal and ai_confirm_modal.visible and ai_modal_step_badge) else "",
			"commandText": ai_modal_cmd_text.text if (ai_confirm_modal and ai_confirm_modal.visible and ai_modal_cmd_text) else "",
			"actionTitle": ai_modal_action_title.text if (ai_confirm_modal and ai_confirm_modal.visible and ai_modal_action_title) else ""
		},
		"turnOverlay": {
			"visible": turn_overlay_btn.visible if turn_overlay_btn else false,
			"mode": turn_overlay_mode,
			"text": turn_overlay_btn.text if turn_overlay_btn else ""
		},
		"enemiesPanel": {
			"showDefeated": show_defeated_monsters,
			"displayedCount": enemy_cards_grid.get_child_count() if enemy_cards_grid else 0,
			"defeatedCount": dead_count,
			"visibleCount": vis_count,
			"totalDiscovered": discovered_monster_ids.size(),
			"canScroll": (enemies_scroll.get_v_scroll_bar().max_value > enemies_scroll.size.y) if enemies_scroll else false,
			"scrollVertical": enemies_scroll.scroll_vertical if enemies_scroll else 0,
			"toggleButtonText": btn_toggle_defeated.text if btn_toggle_defeated else "",
			"toggleButtonDisabled": btn_toggle_defeated.disabled if btn_toggle_defeated else false
		}
	}

	return {
		"role": current_role,
		"round": current_round,
		"phase": current_phase,
		"activeHero": h_act.get("id", ""),
		"activeHeroIndex": active_hero_idx,
		"activeHeroPos": [h_pos.x, h_pos.y],
		"activeHeroTokenPos": [active_center.x, active_center.y],
		"boardOffset": [board_offset.x, board_offset.y],
		"tileSize": tile_size,
		"movementRemaining": movement_remaining,
		"movementRolled": movement_rolled,
		"hasActed": has_acted_this_turn,
		"hasMoved": has_moved_this_turn,
		"movedBeforeAction": moved_before_action,
		"movementClosed": movement_closed,
		"movementStartPos": [movement_start_pos.x, movement_start_pos.y],
		"movementTrail": movement_trail.map(func(v): return [v.x, v.y]),
		"turnState": turn_state,
		"elfElement": current_elf_element,
		"elfSpellModalVisible": elf_spell_modal.visible if elf_spell_modal else false,
		"spellPanelOpen": spell_cast_modal.visible if spell_cast_modal else false,
		"itemPanelOpen": item_use_modal.visible if item_use_modal else false,
		"disarmModalOpen": disarm_trap_modal.visible if disarm_trap_modal else false,
		"activeHeroSpells": h_act.get("spells", []),
		"activeHeroInventory": h_act.get("inventory", []),
		"spellAllocation": {
			"elfElement": current_elf_element,
			"elfSpells": _get_hero_spells_by_id("elf"),
			"wizardSpells": _get_hero_spells_by_id("wizard"),
			"modalVisible": elf_spell_modal.visible if elf_spell_modal else false
		},
		"heroes": heroes_copy,
		"monsters": monsters_copy,
		"doors": doors_copy,
		"traps": traps_copy,
		"furniture": furniture_copy,
		"wallBlocks": wall_blocks_copy,
		"rooms": rooms,
		"revealedRooms": revealed_rooms,
		"exploredCount": explored_tiles.size(),
		"exploredTiles": exp_tiles,
		"scene": {
			"tokens": scene_tokens,
			"doors": scene_doors,
			"ui": scene_ui
		},
		"activeVfx": active_vfx,
		"floatingTexts": floating_texts,
		"lastSpellResult": last_spell_result,
		"lastCombatResult": last_combat_result,
		"characterCards": char_cards,
		"enemyCards": enemy_cards,
		"displayedEnemyCards": displayed_enemy_cards,
		"showDefeated": show_defeated_monsters,
		"discoveredEnemiesCount": discovered_monster_ids.size(),
		"visibleEnemiesCount": vis_count,
		"defeatedEnemiesCount": dead_count,
		"displayedEnemiesCount": displayed_enemy_cards.size(),
		"activeDiceRoll": {
			"type": active_dice_animation.get("type", ""),
			"title": active_dice_animation.get("title", ""),
			"settled": active_dice_animation.get("settled", false),
			"diceCount": active_dice_animation.get("dice", []).size(),
			"summary": active_dice_animation.get("summary", ""),
			"isDefeated": active_dice_animation.get("is_defeated", false),
			"skulls": active_dice_animation.get("skulls", 0),
			"shields": active_dice_animation.get("shields", 0),
			"wounds": active_dice_animation.get("wounds", 0),
			"attackerName": active_dice_animation.get("attacker_name", ""),
			"defenderName": active_dice_animation.get("defender_name", "")
		} if not active_dice_animation.is_empty() else {},
		"combatLog": combat_log.slice(-10),
		"aiStepPending": is_ai_step_pending,
		"pendingAiCommand": pending_ai_command,
		"nextAiStep": get_next_ai_step_command(),
		"cartridge": CartridgeManager.active_cartridge.get("cartridgeId", ""),
		"turnOverlay": {
			"visible": turn_overlay_btn.visible if turn_overlay_btn else false,
			"mode": turn_overlay_mode,
			"text": turn_overlay_btn.text if turn_overlay_btn else "",
			"activeHero": get_hero_character_name(get_active_hero()),
			"activeClass": get_hero_class_name(get_active_hero()),
			"nextTurnName": get_next_turn_name(),
			"flashyNumber": {
				"visible": flashy_number_panel.visible if flashy_number_panel else false,
				"value": flashy_number_val,
				"alpha": flashy_number_panel.modulate.a if flashy_number_panel else 0.0
			}
		}
	}

func execute_action(action_data: Dictionary) -> Dictionary:
	var action_val = action_data.get("action", "")
	var action_type = ""
	if action_val is Dictionary:
		action_type = str(action_val.get("action", ""))
		for k in action_val:
			if not action_data.has(k):
				action_data[k] = action_val[k]
	else:
		action_type = str(action_val)
	match action_type:
		"dismiss_dice_roll":
			dismiss_active_dice_roll()
			return { "success": true }
		"hover_action_button":
			var btn_key = str(action_data.get("button", "roll"))
			var target_btn: Button = null
			match btn_key:
				"roll": target_btn = btn_roll
				"attack": target_btn = btn_attack
				"cast_spell": target_btn = btn_cast_spell
				"use_item": target_btn = btn_use_item
				"search": target_btn = btn_search
				"search_traps": target_btn = btn_search_traps
				"disarm_trap": target_btn = btn_disarm_trap
				"summon": target_btn = btn_summon
				"ai_step": target_btn = btn_ai_step
				"end_turn": target_btn = btn_end_turn
				_:
					target_btn = _find_action_button(btn_key)
			if target_btn:
				_on_action_button_hovered(target_btn)
				return {
					"success": true,
					"hoveredTitle": target_btn.get_meta("action_title", ""),
					"hoveredDesc": target_btn.get_meta("action_desc", ""),
					"tooltipText": target_btn.tooltip_text,
					"diceLabel": dice_label.text if dice_label else ""
				}
			return { "success": false, "error": "Button not found: " + btn_key }
		"unhover_action_button":
			var btn_key = str(action_data.get("button", "roll"))
			var target_btn: Button = null
			match btn_key:
				"roll": target_btn = btn_roll
				"attack": target_btn = btn_attack
				"cast_spell": target_btn = btn_cast_spell
				"use_item": target_btn = btn_use_item
				"search": target_btn = btn_search
				"search_traps": target_btn = btn_search_traps
				"disarm_trap": target_btn = btn_disarm_trap
				"summon": target_btn = btn_summon
				"ai_step": target_btn = btn_ai_step
				"end_turn": target_btn = btn_end_turn
				_:
					target_btn = _find_action_button(btn_key)
			if target_btn:
				_on_action_button_unhovered(target_btn)
				return { "success": true, "diceLabel": dice_label.text if dice_label else "" }
			return { "success": false }
		"scroll_hotbar":
			var delta = int(action_data.get("delta", 60))
			if actions_scroll:
				actions_scroll.scroll_horizontal = max(0, actions_scroll.scroll_horizontal + delta)
				_update_scroll_buttons_visibility()
				return {
					"success": true,
					"scrollHorizontal": actions_scroll.scroll_horizontal,
					"overflow": (btn_scroll_left.visible or btn_scroll_right.visible) if (btn_scroll_left and btn_scroll_right) else false
				}
			return { "success": false }
		"add_dynamic_action":
			var act_id = str(action_data.get("id", "custom_action"))
			var act_title = str(action_data.get("title", "Custom Action"))
			var act_desc = str(action_data.get("desc", "Dynamic action button"))
			var act_icon = str(action_data.get("icon", "item"))
			var act_count = int(action_data.get("count", 0))
			if actions_container:
				var new_btn = Button.new()
				new_btn.name = "BtnDynamic_" + act_id
				new_btn.text = act_title
				actions_container.add_child(new_btn)
				_setup_action_button_style(new_btn)
				_update_action_tile(new_btn, act_icon, act_count, act_title, act_desc)
				_update_scroll_buttons_visibility()
				return {
					"success": true,
					"actionId": act_id,
					"totalButtons": actions_container.get_child_count(),
					"overflow": (btn_scroll_right.visible or btn_scroll_left.visible) if (btn_scroll_right and btn_scroll_left) else false
				}
			return { "success": false }
		"take_screenshot":
			var out_p = str(action_data.get("path", "/tmp/tabletop_hotbar.png"))
			var v_img = get_viewport().get_texture().get_image()
			if v_img:
				v_img.save_png(out_p)
				return { "success": true, "path": out_p }
			return { "success": false }
		"toggle_defeated":
			toggle_show_defeated_monsters()
			return {
				"success": true,
				"showDefeated": show_defeated_monsters,
				"displayedCount": enemy_cards_grid.get_child_count() if enemy_cards_grid else 0,
				"buttonText": btn_toggle_defeated.text if btn_toggle_defeated else ""
			}
		"set_show_defeated":
			var show_val = bool(action_data.get("show", action_data.get("value", false)))
			set_show_defeated_monsters(show_val)
			return {
				"success": true,
				"showDefeated": show_defeated_monsters,
				"displayedCount": enemy_cards_grid.get_child_count() if enemy_cards_grid else 0,
				"buttonText": btn_toggle_defeated.text if btn_toggle_defeated else ""
			}
		"scroll_enemies":
			var delta = int(action_data.get("delta", 60))
			var new_scroll = 0
			if enemies_scroll:
				enemies_scroll.scroll_vertical = max(0, enemies_scroll.scroll_vertical + delta)
				new_scroll = enemies_scroll.scroll_vertical
			return {
				"success": true,
				"scrollVertical": new_scroll,
				"canScroll": (enemies_scroll.get_v_scroll_bar().max_value > enemies_scroll.size.y) if enemies_scroll else false
			}
		"add_dynamic_monsters":
			var count = int(action_data.get("count", 10))
			var is_all_dead = bool(action_data.get("allDead", false))
			var is_half_dead = bool(action_data.get("halfDead", false))
			for i in range(count):
				var idx = monsters.size() + 1
				var dead = is_all_dead or (is_half_dead and (i % 2 == 1))
				var m_id = "test-mon-%d" % idx
				var m_data = {
					"id": m_id,
					"name": "Dungeon Fiend #%d" % idx,
					"type": "orc" if (i % 2 == 0) else "skeleton",
					"bodyPoints": 2,
					"current_bp": 0 if dead else 2,
					"is_alive": not dead,
					"attackDice": 3,
					"defendDice": 2,
					"moveSquares": 8,
					"grid_pos": Vector2i(1, 1),
					"roomId": "test_room"
				}
				monsters.append(m_data)
				discovered_monster_ids[m_id] = true
			_update_character_and_enemy_cards()
			return {
				"success": true,
				"totalMonsters": monsters.size(),
				"displayedCount": enemy_cards_grid.get_child_count() if enemy_cards_grid else 0
			}
		"set_state":
			if action_data.has("role"):
				current_role = str(action_data.get("role"))
			if action_data.has("round"):
				current_round = int(action_data.get("round"))
			if action_data.has("phase"):
				current_phase = str(action_data.get("phase"))
			if action_data.has("activeHeroIndex"):
				active_hero_idx = int(action_data.get("activeHeroIndex"))
			if action_data.has("activeHero"):
				var req_h = str(action_data.get("activeHero"))
				for i in range(heroes.size()):
					if str(heroes[i].get("id")) == req_h:
						active_hero_idx = i
						break
			if action_data.has("movementRemaining"):
				movement_remaining = int(action_data.get("movementRemaining"))
				if movement_remaining > 0 and not action_data.has("movementClosed"):
					movement_closed = false
			if action_data.has("movementRolled"):
				movement_rolled = bool(action_data.get("movementRolled"))
			if action_data.has("hasActed"):
				has_acted_this_turn = bool(action_data.get("hasActed"))
			if action_data.has("hasMoved"):
				has_moved_this_turn = bool(action_data.get("hasMoved"))
			if action_data.has("movedBeforeAction"):
				moved_before_action = bool(action_data.get("movedBeforeAction"))
			elif action_data.has("hasMoved") and action_data.has("hasActed"):
				moved_before_action = bool(action_data.get("hasMoved"))
			if action_data.has("movementClosed"):
				movement_closed = bool(action_data.get("movementClosed"))
			if action_data.has("movementTrail") and action_data.movementTrail is Array:
				movement_trail.clear()
				for pt in action_data.movementTrail:
					if pt is Array and pt.size() >= 2:
						movement_trail.append(Vector2i(int(pt[0]), int(pt[1])))
			elif action_data.has("hasMoved") and not bool(action_data.get("hasMoved")):
				movement_trail.clear()
				movement_start_pos = Vector2i(-1, -1)
			if action_data.has("turnState"):
				turn_state = str(action_data.get("turnState"))
			if action_data.has("heroes") and action_data.heroes is Array:
				for h_patch in action_data.heroes:
					var h_id = str(h_patch.get("id", ""))
					for h in heroes:
						if str(h.get("id")) == h_id:
							for k in h_patch:
								if k == "grid_pos" and h_patch[k] is Array:
									h["grid_pos"] = Vector2i(int(h_patch[k][0]), int(h_patch[k][1]))
								elif k == "current_bp":
									h["current_bp"] = int(h_patch[k])
								elif k == "current_mp":
									h["current_mp"] = int(h_patch[k])
								elif k == "gold":
									h["gold"] = int(h_patch[k])
								elif k == "characterName" or k == "character_name":
									h["characterName"] = str(h_patch[k])
									h["character_name"] = str(h_patch[k])
								elif k == "heroClass" or k == "hero_class" or k == "class":
									h["heroClass"] = str(h_patch[k])
									h["hero_class"] = str(h_patch[k])
								else:
									h[k] = h_patch[k]
							break
			if action_data.has("monsters") and action_data.monsters is Array:
				for m_patch in action_data.monsters:
					var m_id = str(m_patch.get("id", ""))
					var found_m: Dictionary = {}
					for m in monsters:
						var mid = str(m.get("id", ""))
						var mslug = str(m.get("slug", ""))
						if mid == m_id or mslug == m_id or mid.ends_with(m_id) or m_id.ends_with(mid):
							found_m = m
							break
					if not found_m.is_empty():
						for k in m_patch:
							if (k == "grid_pos" or k == "position") and m_patch[k] is Array:
								found_m["grid_pos"] = Vector2i(int(m_patch[k][0]), int(m_patch[k][1]))
							elif k == "current_bp":
								found_m["current_bp"] = int(m_patch[k])
								if int(m_patch[k]) <= 0:
									found_m["is_alive"] = false
							else:
								found_m[k] = m_patch[k]
					else:
						var new_m = m_patch.duplicate(true)
						if new_m.has("grid_pos") and new_m["grid_pos"] is Array:
							new_m["grid_pos"] = Vector2i(int(new_m["grid_pos"][0]), int(new_m["grid_pos"][1]))
						if not new_m.has("is_alive"):
							new_m["is_alive"] = true
						if not new_m.has("attackDice"):
							new_m["attackDice"] = 2
						if not new_m.has("defendDice"):
							new_m["defendDice"] = 2
						monsters.append(new_m)

			if action_data.has("doors") and action_data.doors is Array:
				for d_patch in action_data.doors:
					var d_id = str(d_patch.get("id", ""))
					var df = d_patch.get("from", [])
					var dt = d_patch.get("to", [])
					var matched = false
					for d in doors:
						var did = str(d.get("id", ""))
						var is_match = (did == d_id)
						if not is_match and df.size() >= 2 and dt.size() >= 2:
							var cur_f = d.get("from", [])
							var cur_t = d.get("to", [])
							if (cur_f == df and cur_t == dt) or (cur_f == dt and cur_t == df):
								is_match = true
						if is_match:
							for k in d_patch:
								d[k] = d_patch[k]
							matched = true
							break
					if not matched and d_patch.has("from") and d_patch.has("to"):
						var new_d = d_patch.duplicate(true)
						if not new_d.has("is_open"):
							new_d["is_open"] = false
						if not new_d.has("is_secret"):
							new_d["is_secret"] = false
						if not new_d.has("is_revealed"):
							new_d["is_revealed"] = not new_d["is_secret"]
						doors.append(new_d)

			if action_data.has("traps") and action_data.traps is Array:
				for t_patch in action_data.traps:
					var t_id = str(t_patch.get("id", ""))
					var found_tr = false
					for t in traps:
						if str(t.get("id")) == t_id:
							for k in t_patch:
								t[k] = t_patch[k]
							found_tr = true
							break
					if not found_tr:
						traps.append(t_patch.duplicate(true))

			if action_data.has("wallBlocks") and action_data.wallBlocks is Array:
				for wb in action_data.wallBlocks:
					wall_blocks.append(wb.duplicate(true))

			if action_data.has("revealedRooms") and action_data.revealedRooms is Array:
				revealed_rooms.clear()
				for r in action_data.revealedRooms:
					revealed_rooms.append(str(r))
			if action_data.has("discoveredMonsterIds") and action_data.discoveredMonsterIds is Array:
				discovered_monster_ids.clear()
				for mid in action_data.discoveredMonsterIds:
					discovered_monster_ids[str(mid)] = true
			if action_data.has("resetExplored") and bool(action_data.resetExplored):
				explored_tiles.clear()
			_rebuild_spatial_caches()
			update_party_vision()
			_update_ui()
			queue_redraw_all()
			return { "success": true }
		"reset_game":
			_load_active_cartridge()
			return { "success": true }
		"search_traps":
			var res = search_traps()
			return res
		"disarm_trap":
			var t_id = str(action_data.get("trapId", action_data.get("id", "")))
			var res = disarm_trap(t_id)
			return res
		"toggle_role":
			toggle_role()
			return { "success": true, "role": current_role }
		"roll_movement", "roll_dice":
			var r = roll_movement_dice()
			if r.is_empty():
				return { "success": false, "error": "Movement phase closed or already concluded" }
			return { "success": true, "roll": r }
		"move":
			var tx = int(action_data.get("x", 0))
			var ty = int(action_data.get("y", 0))
			if action_data.has("target") and action_data.target is Array and action_data.target.size() >= 2:
				tx = int(action_data.target[0])
				ty = int(action_data.target[1])
			var ok = move_hero(Vector2i(tx, ty))
			return { "success": ok }
		"open_door":
			var fx = int(action_data.get("from_x", action_data.get("from", [0, 0])[0] if action_data.get("from") is Array and action_data.from.size() > 0 else 0))
			var fy = int(action_data.get("from_y", action_data.get("from", [0, 0])[1] if action_data.get("from") is Array and action_data.from.size() > 1 else 0))
			var tx = int(action_data.get("to_x", action_data.get("to", [0, 0])[0] if action_data.get("to") is Array and action_data.to.size() > 0 else 0))
			var ty = int(action_data.get("to_y", action_data.get("to", [0, 0])[1] if action_data.get("to") is Array and action_data.to.size() > 1 else 0))
			var ok = open_door(Vector2i(fx, fy), Vector2i(tx, ty))
			return { "success": ok }
		"attack":
			var mid = str(action_data.get("monsterId", action_data.get("target", "")))
			var weapon = str(action_data.get("weapon", action_data.get("weaponId", "")))
			var res = attack_adjacent_monster(mid, weapon)
			return res
		"open_spell_selection", "open_elf_spell_selection":
			show_elf_spell_selection_modal()
			return { "success": true, "modal_visible": true, "elf_element": current_elf_element }
		"close_spell_selection", "close_elf_spell_selection":
			close_elf_spell_selection_modal()
			return { "success": true, "modal_visible": false }
		"select_elf_element":
			var elem = str(action_data.get("element", action_data.get("deck", "water")))
			var confirm_flag = bool(action_data.get("confirm", true))
			var res = select_elf_element(elem)
			if confirm_flag:
				close_elf_spell_selection_modal()
			return res
		"cast_spell":
			var spell_id = str(action_data.get("spell", action_data.get("spellId", "")))
			var target_id = str(action_data.get("target", action_data.get("targetId", "")))
			var tx = int(action_data.get("tile_x", -1))
			var ty = int(action_data.get("tile_y", -1))
			var res = cast_spell(spell_id, target_id, Vector2i(tx, ty))
			return res
		"open_spell_panel", "open_spell_modal":
			show_spell_cast_modal()
			return { "success": true, "spell_panel_open": true }
		"close_spell_panel", "close_spell_modal":
			close_spell_cast_modal()
			return { "success": true, "spell_panel_open": false }
		"use_item":
			var h_id = str(action_data.get("heroId", action_data.get("hero", get_active_hero().get("id", ""))))
			var item_id = str(action_data.get("itemId", action_data.get("item", "")))
			var target_id = str(action_data.get("targetId", action_data.get("target", "")))
			var res = use_item(h_id, item_id, target_id)
			return res
		"open_item_panel", "open_item_modal":
			show_item_use_modal()
			return { "success": true, "item_panel_open": true }
		"close_item_panel", "close_item_modal":
			close_item_use_modal()
			return { "success": true, "item_panel_open": false }
		"open_disarm_modal", "open_disarm_panel":
			show_disarm_modal()
			return { "success": true, "modal_visible": true, "disarm_modal_open": true }
		"close_disarm_modal", "close_disarm_panel":
			close_disarm_modal()
			return { "success": true, "modal_visible": false, "disarm_modal_open": false }
		"equip", "equip_item":
			var h_id = str(action_data.get("heroId", action_data.get("hero", get_active_hero().get("id", ""))))
			var item_id = str(action_data.get("itemId", action_data.get("item", "")))
			var res = equip_item(h_id, item_id)
			return res
		"unequip", "unequip_item":
			var h_id = str(action_data.get("heroId", action_data.get("hero", get_active_hero().get("id", ""))))
			var item_id = str(action_data.get("itemId", action_data.get("item", "")))
			var res = unequip_item(h_id, item_id)
			return res
		"dm_attack":
			var hid = str(action_data.get("heroId", action_data.get("target", "")))
			var mid = str(action_data.get("monsterId", action_data.get("attacker", action_data.get("monster", ""))))
			var res = dm_attack_hero(hid, mid)
			return { "success": true, "result": res }
		"summon_monster":
			var sx = int(action_data.get("x", 3))
			var sy = int(action_data.get("y", 0))
			var bp = int(action_data.get("bp", 1))
			var m_name = str(action_data.get("name", "Wandering Orc"))
			var res = summon_wandering_monster(Vector2i(sx, sy), bp, m_name)
			return res
		"set_monster_pos":
			var m_id = str(action_data.get("monsterId", ""))
			var px = int(action_data.get("x", 0))
			var py = int(action_data.get("y", 0))
			for m in monsters:
				if str(m.get("id")) == m_id:
					m["grid_pos"] = Vector2i(px, py)
					m["roomId"] = ""
					break
			update_party_vision()
			_update_ui()
			queue_redraw_all()
			return { "success": true }
		"discover_monster":
			var m_id = str(action_data.get("monsterId", ""))
			discovered_monster_ids[m_id] = true
			_update_ui()
			return { "success": true }
		"set_hero_bp":
			var h_id = str(action_data.get("heroId", "barbarian"))
			var bp_val = int(action_data.get("bp", 1))
			for h in heroes:
				if str(h.get("id")) == h_id:
					h["current_bp"] = bp_val
					break
			_update_ui()
			return { "success": true }
		"set_monster_bp":
			var m_id = str(action_data.get("monsterId", ""))
			var bp_val = int(action_data.get("bp", 1))
			for m in monsters:
				if str(m.get("id")) == m_id:
					m["current_bp"] = bp_val
					if bp_val <= 0:
						m["is_alive"] = false
					break
			_update_ui()
			return { "success": true }
		"search":
			var res = search_room()
			return res
		"end_turn":
			end_turn()
			return { "success": true }
		"click_turn_overlay":
			if turn_overlay_btn and turn_overlay_btn.visible:
				if turn_overlay_mode == "roll_prompt":
					var roll_res = roll_movement_dice()
					return { "success": true, "mode": "roll_prompt", "roll": roll_res }
				elif turn_overlay_mode == "turn_complete":
					end_turn()
					return { "success": true, "mode": "turn_complete", "activeHero": get_active_hero().get("id", "") }
			return { "success": false, "error": "Turn overlay not visible or active" }
		"ai_step":
			var auto_confirm = bool(action_data.get("confirm", false))
			if auto_confirm:
				return confirm_and_execute_ai_step()
			else:
				return propose_ai_step()
		"ai_step_propose":
			return propose_ai_step()
		"ai_step_confirm":
			return confirm_and_execute_ai_step()
		"ai_step_cancel":
			return cancel_ai_step()
		"monster_turn", "ai_monster_turn":
			var res = ai_monster_turn()
			return res
		"test_dice_roll":
			var d_type = str(action_data.get("type", "movement"))
			if d_type == "movement":
				var d1 = int(action_data.get("d1", randi_range(1, 6)))
				var d2 = int(action_data.get("d2", randi_range(1, 6)))
				var r_dat = { "total": d1 + d2, "d1": d1, "d2": d2 }
				trigger_movement_dice_roll(r_dat, str(action_data.get("hero", "Barbarian")), [d1, d2])
				return { "success": true, "type": "movement", "roll": r_dat }
			else:
				var atk_cnt = int(action_data.get("attackDice", 3))
				var def_cnt = int(action_data.get("defendDice", 2))
				var is_hero_def = bool(action_data.get("isHeroDefending", false))
				var is_def = bool(action_data.get("isDefeated", action_data.get("defeated", false)))
				var c_res = TabletopDice.resolve_combat(atk_cnt, def_cnt, is_hero_def)
				if not action_data.has("isDefeated") and not action_data.has("defeated") and action_data.has("current_bp"):
					is_def = (c_res.wounds >= int(action_data.get("current_bp", 999)))
				trigger_combat_dice_roll(c_res, str(action_data.get("attacker", "Barbarian")), str(action_data.get("defender", "Crypt Skeleton")), is_hero_def, is_def)
				return { "success": true, "type": "combat", "result": c_res, "isDefeated": is_def }
	return { "success": false, "error": "Unknown action: " + action_type }

func _draw() -> void:
	_draw_board(self)

func _draw_board(canvas: CanvasItem) -> void:
	_update_board_metrics()
	# Draw grid overlay
	for c in range(grid_cols + 1):
		var p1 = board_offset + Vector2(c * tile_size, 0)
		var p2 = board_offset + Vector2(c * tile_size, grid_rows * tile_size)
		canvas.draw_line(p1, p2, Color(0.2, 0.4, 0.6, 0.25), 1.0)

	for r in range(grid_rows + 1):
		var p1 = board_offset + Vector2(0, r * tile_size)
		var p2 = board_offset + Vector2(grid_cols * tile_size, r * tile_size)
		canvas.draw_line(p1, p2, Color(0.2, 0.4, 0.6, 0.25), 1.0)

	# Dynamic Fog of War: Unrevealed rooms and unexplored corridor tiles
	if current_role == "player":
		# 1. Atmospheric translucent fog over unrevealed rooms (room's real image visible underneath, no objects, no "shrouded" text)
		for rm in rooms:
			var r_id = str(rm.get("id", ""))
			if not revealed_rooms.has(r_id):
				var rx = int(rm.get("x", 0))
				var ry = int(rm.get("y", 0))
				var rw = int(rm.get("w", 1))
				var rh = int(rm.get("h", 1))
				var r_rect = Rect2(board_offset + Vector2(rx * tile_size, ry * tile_size), Vector2(rw * tile_size, rh * tile_size))
				# Atmospheric translucent fog layer over the authentic room floor art
				canvas.draw_rect(r_rect, Color(0.04, 0.06, 0.10, 0.58))
				canvas.draw_rect(r_rect, Color(0.12, 0.18, 0.28, 0.35), false, 1.5)

		# 2. Unexplored corridor tiles shroud (always show border tiles!)
		for c in range(grid_cols):
			for r in range(grid_rows):
				var t = Vector2i(c, r)
				# Always show the perimeter border tiles of the board
				if is_border_tile(t):
					continue
				if not _is_inside_any_room(t):
					if not explored_tiles.has(t):
						var c_rect = Rect2(board_offset + Vector2(c * tile_size, r * tile_size), Vector2(tile_size, tile_size))
						canvas.draw_rect(c_rect, Color(0.04, 0.05, 0.08, 0.94))

	elif is_gm_role():
		# Game Master Mode: Show secret GM highlights on rooms hidden from players
		for rm in rooms:
			var r_id = str(rm.get("id", ""))
			if not revealed_rooms.has(r_id):
				var rx = int(rm.get("x", 0))
				var ry = int(rm.get("y", 0))
				var rw = int(rm.get("w", 1))
				var rh = int(rm.get("h", 1))
				var r_rect = Rect2(board_offset + Vector2(rx * tile_size, ry * tile_size), Vector2(rw * tile_size, rh * tile_size))
				canvas.draw_rect(r_rect, Color(0.35, 0.1, 0.5, 0.22))
				canvas.draw_rect(r_rect, Color(0.7, 0.25, 0.9, 0.8), false, 1.5)
				canvas.draw_string(ThemeDB.fallback_font, r_rect.position + Vector2(8, 18), "Hidden from Players", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(0.85, 0.6, 1.0, 0.8))

	# Draw Wall Blocks (1-tile and 2-tile walls)
	for wb in wall_blocks:
		var px = wb.get("x", wb.get("position", [0, 0])[0])
		var py = wb.get("y", wb.get("position", [0, 0])[1])
		var pos = Vector2i(px, py)
		if is_gm_role() or explored_tiles.has(pos):
			var w = int(wb.get("width", 1))
			var h = int(wb.get("height", 1))
			var b_type = str(wb.get("type", "1-tile-wall"))
			if b_type == "2-tile-wall-h" or b_type == "double-h":
				w = 2; h = 1
			elif b_type == "2-tile-wall-v" or b_type == "double-v":
				w = 1; h = 2
			var block_rect = Rect2(board_offset + Vector2(px * tile_size + 2, py * tile_size + 2), Vector2(w * tile_size - 4, h * tile_size - 4))
			# Base stone
			canvas.draw_rect(block_rect, Color(0.18, 0.20, 0.24, 0.95))
			# Bevel border
			canvas.draw_rect(block_rect, Color(0.45, 0.50, 0.58, 1.0), false, 2.0)
			# Inner masonry lines (clean geometric X crossbar)
			canvas.draw_line(block_rect.position + Vector2(4, 4), block_rect.end - Vector2(4, 4), Color(0.35, 0.40, 0.48, 0.6), 1.5)
			canvas.draw_line(Vector2(block_rect.end.x - 4, block_rect.position.y + 4), Vector2(block_rect.position.x + 4, block_rect.end.y - 4), Color(0.35, 0.40, 0.48, 0.6), 1.5)

	# Draw Traps (visible in GM mode or if detected/revealed/sprung/disarmed/spent/blocked)
	for tr in traps:
		var is_gm = is_gm_role()
		var is_det = bool(tr.get("detected", false) or tr.get("is_revealed", false))
		var is_dis = bool(tr.get("disarmed", false))
		var is_spr = bool(tr.get("sprung", false) or tr.get("is_sprung", false))
		var is_spn = bool(tr.get("spent", false))
		var is_blk = bool(tr.get("blocked", false))

		if is_gm or is_det or is_dis or is_spr or is_spn or is_blk:
			var px = tr.get("x", tr.get("position", [0, 0])[0])
			var py = tr.get("y", tr.get("position", [0, 0])[1])
			var w = int(tr.get("width", 1))
			var h = int(tr.get("height", 1))
			var t_type = str(tr.get("type", tr.get("trapType", "pit"))).to_lower()
			var trap_rect = Rect2(board_offset + Vector2(px * tile_size + 3, py * tile_size + 3), Vector2(w * tile_size - 6, h * tile_size - 6))

			if is_dis:
				# Disarmed trap: safe bridged floor / green border
				canvas.draw_rect(trap_rect, Color(0.12, 0.28, 0.16, 0.75))
				canvas.draw_rect(trap_rect, Color(0.25, 0.85, 0.45, 0.9), false, 1.5)
				# Crossbar planks
				canvas.draw_line(trap_rect.position + Vector2(2, 6), Vector2(trap_rect.end.x - 2, trap_rect.position.y + 6), Color(0.35, 0.75, 0.45, 0.5), 1.0)
				canvas.draw_line(Vector2(trap_rect.position.x + 2, trap_rect.end.y - 6), trap_rect.end - Vector2(2, 6), Color(0.35, 0.75, 0.45, 0.5), 1.0)
				canvas.draw_string(ThemeDB.fallback_font, trap_rect.get_center() + Vector2(-12, 4), "SAFE", HORIZONTAL_ALIGNMENT_CENTER, -1, 9, Color(0.4, 1.0, 0.6, 0.95))
			elif "spear" in t_type:
				if is_spn or is_spr:
					# Spent spear trap: grey safe plate
					canvas.draw_rect(trap_rect, Color(0.22, 0.24, 0.28, 0.75))
					canvas.draw_rect(trap_rect, Color(0.55, 0.60, 0.68, 0.75), false, 1.5)
					canvas.draw_string(ThemeDB.fallback_font, trap_rect.get_center() + Vector2(-15, 4), "SPENT", HORIZONTAL_ALIGNMENT_CENTER, -1, 9, Color(0.7, 0.75, 0.82, 0.9))
				elif is_det:
					# Detected spear trap: amber hazard with spikes glyph
					canvas.draw_rect(trap_rect, Color(0.65, 0.35, 0.08, 0.7))
					canvas.draw_rect(trap_rect, Color(1.0, 0.55, 0.15, 0.95), false, 1.5)
					var c = trap_rect.get_center()
					canvas.draw_line(c + Vector2(-6, 6), c + Vector2(-6, -4), Color(1.0, 0.8, 0.2, 0.9), 1.5)
					canvas.draw_line(c + Vector2(0, 6), c + Vector2(0, -6), Color(1.0, 0.8, 0.2, 0.9), 1.5)
					canvas.draw_line(c + Vector2(6, 6), c + Vector2(6, -4), Color(1.0, 0.8, 0.2, 0.9), 1.5)
					canvas.draw_string(ThemeDB.fallback_font, trap_rect.get_center() + Vector2(-16, 12), "SPEAR", HORIZONTAL_ALIGNMENT_CENTER, -1, 8, Color(1.0, 0.85, 0.5, 0.95))
				elif is_gm:
					canvas.draw_rect(trap_rect, Color(0.5, 0.1, 0.4, 0.4))
					canvas.draw_rect(trap_rect, Color(0.85, 0.3, 0.85, 0.85), false, 1.5)
					canvas.draw_string(ThemeDB.fallback_font, trap_rect.get_center() + Vector2(-22, 4), "GM: SPEAR", HORIZONTAL_ALIGNMENT_CENTER, -1, 8, Color(0.9, 0.6, 1.0, 0.9))
			elif "falling" in t_type or "boulder" in t_type or "rock" in t_type:
				if is_blk or is_spr:
					# Sprung falling block: rubble stone
					canvas.draw_rect(trap_rect, Color(0.18, 0.20, 0.24, 0.95))
					canvas.draw_rect(trap_rect, Color(0.55, 0.60, 0.68, 1.0), false, 2.0)
					canvas.draw_string(ThemeDB.fallback_font, trap_rect.get_center() + Vector2(-16, 4), "BLOCK", HORIZONTAL_ALIGNMENT_CENTER, -1, 9, Color(0.85, 0.88, 0.95, 0.9))
				elif is_det:
					canvas.draw_circle(trap_rect.get_center(), tile_size * 0.40 * min(w, h), Color(0.45, 0.28, 0.15, 0.85))
					canvas.draw_arc(trap_rect.get_center(), tile_size * 0.40 * min(w, h), 0, TAU, 32, Color(0.95, 0.55, 0.2, 0.95), 2.0)
					canvas.draw_string(ThemeDB.fallback_font, trap_rect.get_center() + Vector2(-16, 4), "BLOCK", HORIZONTAL_ALIGNMENT_CENTER, -1, 9, Color(1.0, 0.85, 0.6, 0.95))
				elif is_gm:
					canvas.draw_rect(trap_rect, Color(0.5, 0.1, 0.4, 0.4))
					canvas.draw_rect(trap_rect, Color(0.85, 0.3, 0.85, 0.85), false, 1.5)
					canvas.draw_string(ThemeDB.fallback_font, trap_rect.get_center() + Vector2(-22, 4), "GM: BLOCK", HORIZONTAL_ALIGNMENT_CENTER, -1, 8, Color(0.9, 0.6, 1.0, 0.9))
			else:
				# Pit Trap
				if is_spr:
					# Sprung Pit Trap: Black abyss hole with red inner outline
					canvas.draw_rect(trap_rect, Color(0.02, 0.02, 0.03, 0.98))
					canvas.draw_rect(trap_rect, Color(0.85, 0.15, 0.15, 0.95), false, 2.0)
					canvas.draw_line(trap_rect.position + Vector2(4, 4), trap_rect.end - Vector2(4, 4), Color(0.2, 0.05, 0.05, 0.8), 1.0)
					canvas.draw_string(ThemeDB.fallback_font, trap_rect.get_center() + Vector2(-10, 4), "PIT", HORIZONTAL_ALIGNMENT_CENTER, -1, 9, Color(1.0, 0.3, 0.3, 0.95))
				elif is_det:
					# Detected Pit Trap: Hazard warning
					canvas.draw_rect(trap_rect, Color(0.65, 0.12, 0.12, 0.7))
					canvas.draw_rect(trap_rect, Color(1.0, 0.3, 0.2, 0.95), false, 1.5)
					canvas.draw_string(ThemeDB.fallback_font, trap_rect.get_center() + Vector2(-10, 4), "PIT", HORIZONTAL_ALIGNMENT_CENTER, -1, 9, Color(1.0, 0.85, 0.8, 0.95))
				elif is_gm:
					canvas.draw_rect(trap_rect, Color(0.5, 0.1, 0.4, 0.4))
					canvas.draw_rect(trap_rect, Color(0.85, 0.3, 0.85, 0.85), false, 1.5)
					canvas.draw_string(ThemeDB.fallback_font, trap_rect.get_center() + Vector2(-18, 4), "GM: PIT", HORIZONTAL_ALIGNMENT_CENTER, -1, 8, Color(0.9, 0.6, 1.0, 0.9))

	# Draw Furniture
	for f in furniture:
		var r_id = f.get("roomId", "")
		var px = f.get("x", f.get("position", [0, 0])[0])
		var py = f.get("y", f.get("position", [0, 0])[1])
		var f_pos = Vector2i(px, py)
		var rm = _get_room_at(f_pos)
		var effective_room = r_id if r_id != "" else str(rm.get("id", ""))
		var is_visible = false
		if is_gm_role():
			is_visible = true
		elif effective_room != "":
			is_visible = revealed_rooms.has(effective_room)
		else:
			is_visible = explored_tiles.has(f_pos)
		if is_visible:
			var f_type = str(f.get("type", "chest"))
			var w = int(f.get("width", 1))
			var h = int(f.get("height", 1))
			if f_type == "altar" and w == 1 and h == 1:
				w = 3; h = 2
			elif f_type == "bookcase" and w == 1 and h == 1:
				w = 3; h = 1
			elif (f_type == "bookshelf" or f_type == "cupboard") and w == 1 and h == 1:
				w = 2; h = 1
			elif f_type == "table" and w == 1 and h == 1:
				w = 3; h = 2
			elif f_type == "tomb" and w == 1 and h == 1:
				w = 2; h = 3

			var f_rect = Rect2(board_offset + Vector2(px * tile_size + 2, py * tile_size + 2), Vector2(w * tile_size - 4, h * tile_size - 4))
			var label_text = ""

			if f_type == "altar":
				canvas.draw_rect(f_rect, Color(0.14, 0.10, 0.20, 0.95))
				canvas.draw_rect(f_rect, Color(0.68, 0.35, 0.95, 0.9), false, 2.0)
				canvas.draw_arc(f_rect.get_center(), min(w, h) * tile_size * 0.28, 0, TAU, 24, Color(0.85, 0.45, 1.0, 0.6), 1.5)
				label_text = "ALTAR"
			elif f_type == "bookcase":
				canvas.draw_rect(f_rect, Color(0.24, 0.12, 0.08, 0.95))
				canvas.draw_rect(f_rect, Color(0.62, 0.36, 0.20, 1.0), false, 2.0)
				label_text = "BOOKS"
			elif f_type == "bookshelf" or f_type == "cupboard":
				canvas.draw_rect(f_rect, Color(0.32, 0.20, 0.10, 0.95))
				canvas.draw_rect(f_rect, Color(0.72, 0.48, 0.24, 1.0), false, 2.0)
				label_text = "SHELF"
			elif f_type == "boulder":
				canvas.draw_circle(f_rect.get_center(), tile_size * 0.42 * min(w, h), Color(0.32, 0.35, 0.38, 0.95))
				canvas.draw_arc(f_rect.get_center(), tile_size * 0.42 * min(w, h), 0, TAU, 32, Color(0.65, 0.70, 0.75), 2.0)
				label_text = ""
			elif f_type == "tomb":
				canvas.draw_rect(f_rect, Color(0.25, 0.28, 0.32, 0.95))
				canvas.draw_rect(f_rect, Color(0.55, 0.60, 0.68, 1.0), false, 2.0)
				label_text = "TOMB"
			elif f_type == "table":
				canvas.draw_rect(f_rect, Color(0.35, 0.22, 0.12, 0.95))
				canvas.draw_rect(f_rect, Color(0.58, 0.38, 0.22, 1.0), false, 1.5)
				label_text = "TABLE"
			elif f_type == "chest":
				canvas.draw_rect(f_rect, Color(0.45, 0.32, 0.08, 0.95))
				canvas.draw_rect(f_rect, Color(0.9, 0.75, 0.2, 1.0), false, 1.5)
				label_text = "CHEST"
				# Check if this chest is trapped
				var is_trapped = bool(f.get("trapped", false))
				var is_dis = bool(f.get("disarmed", false))
				var is_det = bool(f.get("detected", false))
				for tr in traps:
					var tx = int(tr.get("x", tr.get("position", [0, 0])[0]))
					var ty = int(tr.get("y", tr.get("position", [0, 0])[1]))
					if tx == px and ty == py:
						var tt = str(tr.get("type", tr.get("trapType", ""))).to_lower()
						if "chest" in tt or "furniture" in tt:
							is_trapped = true
							if tr.get("disarmed", false): is_dis = true
							if tr.get("detected", false): is_det = true
				if is_trapped:
					if is_dis:
						var b_rect = Rect2(f_rect.end.x - 22, f_rect.position.y + 2, 20, 9)
						canvas.draw_rect(b_rect, Color(0.12, 0.55, 0.22, 0.95))
						canvas.draw_string(ThemeDB.fallback_font, b_rect.position + Vector2(2, 7), "SAFE", HORIZONTAL_ALIGNMENT_LEFT, -1, 7, Color(0.8, 1.0, 0.8))
					elif is_det:
						var b_rect = Rect2(f_rect.end.x - 22, f_rect.position.y + 2, 20, 9)
						canvas.draw_rect(b_rect, Color(0.85, 0.2, 0.15, 0.95))
						canvas.draw_string(ThemeDB.fallback_font, b_rect.position + Vector2(2, 7), "TRAP", HORIZONTAL_ALIGNMENT_LEFT, -1, 7, Color(1.0, 0.95, 0.9))
					elif is_gm_role():
						var b_rect = Rect2(f_rect.end.x - 26, f_rect.position.y + 2, 24, 9)
						canvas.draw_rect(b_rect, Color(0.55, 0.15, 0.6, 0.95))
						canvas.draw_string(ThemeDB.fallback_font, b_rect.position + Vector2(2, 7), "GM:T", HORIZONTAL_ALIGNMENT_LEFT, -1, 7, Color(1.0, 0.85, 1.0))
			elif f_type == "weapons-rack" or f_type == "rack":
				canvas.draw_rect(f_rect, Color(0.25, 0.25, 0.28, 0.95))
				canvas.draw_rect(f_rect, Color(0.6, 0.6, 0.7, 1.0), false, 1.5)
				label_text = "ARMS"
			else:
				canvas.draw_rect(f_rect, Color(0.4, 0.28, 0.16, 0.85))
				canvas.draw_rect(f_rect, Color(0.6, 0.45, 0.25, 1.0), false, 1.5)
				label_text = f_type.to_upper().substr(0, 5)

			if label_text != "":
				var lbl_w = ThemeDB.fallback_font.get_string_size(label_text, HORIZONTAL_ALIGNMENT_CENTER, -1, 10).x
				canvas.draw_string(ThemeDB.fallback_font, Vector2(f_rect.get_center().x - lbl_w * 0.5, f_rect.get_center().y + 3), label_text, HORIZONTAL_ALIGNMENT_CENTER, -1, 10, Color(0.9, 0.9, 0.9, 0.85))

	# Draw Doors
	for d in doors:
		var f = d.get("from", [0, 0])
		var t = d.get("to", [0, 0])
		var f_pos = Vector2i(f[0], f[1])
		var t_pos = Vector2i(t[0], t[1])
		var is_secret = bool(d.get("is_secret", false))
		var is_revealed = bool(d.get("is_revealed", not is_secret))
		var is_open = bool(d.get("is_open", false))

		# Visibility rules:
		# Undiscovered secret doors are invisible to players
		if is_secret and not is_revealed and not is_gm_role():
			continue

		if is_gm_role() or explored_tiles.has(f_pos) or explored_tiles.has(t_pos):
			var p1 = board_offset + Vector2(f[0] * tile_size + tile_size * 0.5, f[1] * tile_size + tile_size * 0.5)
			var p2 = board_offset + Vector2(t[0] * tile_size + tile_size * 0.5, t[1] * tile_size + tile_size * 0.5)
			var mid = (p1 + p2) * 0.5
			var d_size = tile_size * 0.85
			var is_vert = (f[1] == t[1])
			var rot = PI * 0.5 if is_vert else 0.0

			if is_secret and not is_revealed:
				# GM view of hidden secret door
				var gm_rect = Rect2(mid.x - 6, mid.y - d_size * 0.45, 12, d_size * 0.9) if is_vert else Rect2(mid.x - d_size * 0.45, mid.y - 6, d_size * 0.9, 12)
				canvas.draw_rect(gm_rect, Color(0.35, 0.10, 0.45, 0.85))
				canvas.draw_rect(gm_rect, Color(0.85, 0.35, 1.0, 0.95), false, 1.5)
				var gm_txt = "GM: SECRET"
				var gm_w = ThemeDB.fallback_font.get_string_size(gm_txt, HORIZONTAL_ALIGNMENT_CENTER, -1, 7).x
				canvas.draw_string(ThemeDB.fallback_font, Vector2(mid.x - gm_w * 0.5, mid.y + 3), gm_txt, HORIZONTAL_ALIGNMENT_CENTER, -1, 7, Color(1.0, 0.8, 1.0))
			elif is_secret and is_revealed:
				# Discovered secret door (revolving stone slab)
				if is_open:
					# Discovered and Open: clear passageway through stone arch
					var arch_rect = Rect2(mid.x - 5, mid.y - d_size * 0.45, 10, d_size * 0.9) if is_vert else Rect2(mid.x - d_size * 0.45, mid.y - 5, d_size * 0.9, 10)
					canvas.draw_rect(arch_rect, Color(0.12, 0.22, 0.28, 0.85))
					canvas.draw_rect(arch_rect, Color(0.25, 0.85, 0.75, 0.95), false, 1.5)
					var op_txt = "OPEN"
					var op_w = ThemeDB.fallback_font.get_string_size(op_txt, HORIZONTAL_ALIGNMENT_CENTER, -1, 7).x
					canvas.draw_string(ThemeDB.fallback_font, Vector2(mid.x - op_w * 0.5, mid.y + 3), op_txt, HORIZONTAL_ALIGNMENT_CENTER, -1, 7, Color(0.8, 1.0, 0.95))
				else:
					# Discovered and Closed: revolving stone slab with golden runic border & SECRET label
					var slab_rect = Rect2(mid.x - 7, mid.y - d_size * 0.45, 14, d_size * 0.9) if is_vert else Rect2(mid.x - d_size * 0.45, mid.y - 7, d_size * 0.9, 14)
					canvas.draw_rect(slab_rect, Color(0.22, 0.20, 0.24, 0.95))
					canvas.draw_rect(slab_rect, Color(0.95, 0.75, 0.20, 1.0), false, 2.0)
					if is_vert:
						canvas.draw_line(Vector2(mid.x, slab_rect.position.y + 2), Vector2(mid.x, slab_rect.end.y - 2), Color(0.65, 0.55, 0.25, 0.7), 1.0)
					else:
						canvas.draw_line(Vector2(slab_rect.position.x + 2, mid.y), Vector2(slab_rect.end.x - 2, mid.y), Color(0.65, 0.55, 0.25, 0.7), 1.0)
					var sec_txt = "SECRET"
					var sec_w = ThemeDB.fallback_font.get_string_size(sec_txt, HORIZONTAL_ALIGNMENT_CENTER, -1, 7).x
					canvas.draw_string(ThemeDB.fallback_font, Vector2(mid.x - sec_w * 0.5, mid.y + 3), sec_txt, HORIZONTAL_ALIGNMENT_CENTER, -1, 7, Color(1.0, 0.9, 0.4))
			else:
				var tex: Texture2D = door_open_tex if is_open else door_closed_tex
				if tex:
					var orig_w = float(tex.get_width())
					var orig_h = float(tex.get_height())
					var scale_v = Vector2(d_size / orig_w, d_size / orig_h)
					canvas.draw_set_transform(mid, rot, scale_v)
					canvas.draw_texture(tex, -Vector2(orig_w, orig_h) * 0.5)
					canvas.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
				else:
					# Clean vector fallback if texture unavailable
					var col = Color(0.2, 0.8, 0.2, 0.9) if is_open else Color(0.65, 0.42, 0.18, 0.95)
					if is_vert:
						canvas.draw_rect(Rect2(mid.x - 5, mid.y - d_size * 0.45, 10, d_size * 0.9), col)
						canvas.draw_rect(Rect2(mid.x - 5, mid.y - d_size * 0.45, 10, d_size * 0.9), Color(0.2, 0.15, 0.1), false, 1.5)
					else:
						canvas.draw_rect(Rect2(mid.x - d_size * 0.45, mid.y - 5, d_size * 0.9, 10), col)
						canvas.draw_rect(Rect2(mid.x - d_size * 0.45, mid.y - 5, d_size * 0.9, 10), Color(0.2, 0.15, 0.1), false, 1.5)

			# If active hero is adjacent to a closed door, render interactive golden highlight
			if not is_open and current_role == "player" and is_revealed:
				var adj_doors = get_adjacent_closed_doors()
				for ad in adj_doors:
					var ad_f = ad.get("from", [-1, -1])
					var ad_t = ad.get("to", [-1, -1])
					if (ad_f == f and ad_t == t) or (ad_f == t and ad_t == f):
						canvas.draw_arc(mid, d_size * 0.52, 0, TAU, 24, Color(1.0, 0.85, 0.2, 0.9), 2.0)
						break

	# Draw Monsters
	for m in monsters:
		if m.get("is_alive", false):
			var is_visible = is_monster_currently_visible(m)
			if is_visible:
				var pos = m.get("grid_pos", Vector2i(0, 0))
				var screen_pos = board_offset + Vector2(pos.x * tile_size + tile_size * 0.5, pos.y * tile_size + tile_size * 0.5)
				var token_radius = tile_size * 0.4
				var token_tex = get_monster_token_texture(m)

				if token_tex:
					# Draw subtle drop shadow under circular token
					canvas.draw_circle(screen_pos + Vector2(1.5, 2.0), token_radius, Color(0.0, 0.0, 0.0, 0.52))
					var dest_rect = Rect2(screen_pos.x - token_radius, screen_pos.y - token_radius, token_radius * 2.0, token_radius * 2.0)
					canvas.draw_texture_rect(token_tex, dest_rect, false)
					var rim_col = Color.from_string(m.get("tokenColor", "#b91c1c"), Color(0.8, 0.2, 0.2, 0.85))
					canvas.draw_arc(screen_pos, token_radius, 0, TAU, 32, Color(rim_col.r, rim_col.g, rim_col.b, 0.85), 1.5)
				else:
					var col = Color.from_string(m.get("tokenColor", "#15803d"), Color.GREEN)
					canvas.draw_circle(screen_pos, token_radius, col)
					canvas.draw_arc(screen_pos, token_radius, 0, TAU, 24, Color(0.1, 0.3, 0.1, 0.9), 1.5)
					var m_name = str(m.get("name", "Monster")).to_lower()
					var m_code = "M"
					if "skeleton" in m_name:
						m_code = "SK"
					elif "orc" in m_name:
						m_code = "OR"
					elif "goblin" in m_name:
						m_code = "GB"
					elif "zombie" in m_name:
						m_code = "ZM"
					elif "verag" in m_name:
						m_code = "VG"
					elif "fimir" in m_name:
						m_code = "FM"
					elif "mummy" in m_name:
						m_code = "MU"
					elif "gargoyle" in m_name:
						m_code = "GG"
					else:
						m_code = m_name.substr(0, 2).to_upper()
					var cd_w = ThemeDB.fallback_font.get_string_size(m_code, HORIZONTAL_ALIGNMENT_CENTER, -1, 12).x
					canvas.draw_string(ThemeDB.fallback_font, Vector2(screen_pos.x - cd_w * 0.5, screen_pos.y + 4), m_code, HORIZONTAL_ALIGNMENT_CENTER, -1, 12, Color.WHITE)

				if m.get("is_sleeping", false):
					var z_txt = "Zzz"
					var zw = ThemeDB.fallback_font.get_string_size(z_txt, HORIZONTAL_ALIGNMENT_CENTER, -1, 11).x
					canvas.draw_string(ThemeDB.fallback_font, Vector2(screen_pos.x - zw * 0.5, screen_pos.y - tile_size * 0.45), z_txt, HORIZONTAL_ALIGNMENT_CENTER, -1, 11, Color(0.6, 0.7, 1.0))
				if m.get("tempest_stunned", false):
					canvas.draw_arc(screen_pos, tile_size * 0.46, 0, TAU, 16, Color(0.2, 0.8, 1.0, 0.85), 2.0)

	# Draw Starting Staircase Tile (Entrance / Exit)
	var stair_rect = Rect2(board_offset + Vector2(starting_stair.x * tile_size + 2, starting_stair.y * tile_size + 2), Vector2(tile_size - 4, tile_size - 4))
	canvas.draw_rect(stair_rect, Color(0.18, 0.22, 0.28, 0.95))
	canvas.draw_rect(stair_rect, Color(0.45, 0.60, 0.75, 1.0), false, 1.5)
	canvas.draw_arc(stair_rect.get_center(), tile_size * 0.36, 0, TAU, 24, Color(0.35, 0.45, 0.58, 0.8), 1.5)
	canvas.draw_arc(stair_rect.get_center(), tile_size * 0.20, 0, TAU, 16, Color(0.55, 0.68, 0.82, 0.9), 1.5)
	var st_w = ThemeDB.fallback_font.get_string_size("STAIR", HORIZONTAL_ALIGNMENT_CENTER, -1, 8).x
	canvas.draw_string(ThemeDB.fallback_font, Vector2(stair_rect.get_center().x - st_w * 0.5, stair_rect.get_center().y + 3), "STAIR", HORIZONTAL_ALIGNMENT_CENTER, -1, 8, Color(0.85, 0.9, 1.0, 0.85))

	# Draw Hero Movement Trail (Green line from where hero came from with moves remaining in middle)
	if movement_trail.size() >= 2 and (has_moved_this_turn or movement_remaining > 0):
		var pts: Array[Vector2] = []
		for tile_coord in movement_trail:
			pts.append(board_offset + Vector2(tile_coord.x * tile_size + tile_size * 0.5, tile_coord.y * tile_size + tile_size * 0.5))

		# 1. Start origin footprint ring (where the hero came from)
		canvas.draw_circle(pts[0], 5.0, Color(0.2, 0.92, 0.38, 0.9))
		canvas.draw_arc(pts[0], tile_size * 0.24, 0, TAU, 16, Color(0.2, 0.92, 0.38, 0.65), 1.5)

		# 2. Draw glowing green line segments along the traveled path
		for i in range(pts.size() - 1):
			var p_from = pts[i]
			var p_to = pts[i + 1]
			# Outer glow
			canvas.draw_line(p_from, p_to, Color(0.06, 0.55, 0.22, 0.4), 6.0, true)
			# Sharp emerald green core
			canvas.draw_line(p_from, p_to, Color(0.2, 0.95, 0.4, 0.95), 3.0, true)
			# Waypoint node
			if i > 0:
				canvas.draw_circle(p_from, 3.0, Color(0.7, 1.0, 0.8, 0.9))

		# 3. Compute middle point along the traveled path
		var total_len: float = 0.0
		var seg_lens: Array[float] = []
		for i in range(pts.size() - 1):
			var seg_len = pts[i].distance_to(pts[i + 1])
			seg_lens.append(seg_len)
			total_len += seg_len

		var mid_pt = (pts[0] + pts[pts.size() - 1]) * 0.5
		if total_len > 0.0:
			var half_target = total_len * 0.5
			var accumulated = 0.0
			for i in range(seg_lens.size()):
				if accumulated + seg_lens[i] >= half_target:
					var remain = half_target - accumulated
					var fraction = remain / maxf(0.001, seg_lens[i])
					mid_pt = pts[i].lerp(pts[i + 1], fraction)
					break
				accumulated += seg_lens[i]

		# 4. Draw moves remaining badge in the middle of the line
		var badge_txt = ""
		if total_len >= 75.0:
			badge_txt = ("%d MOVES LEFT" % movement_remaining) if movement_remaining != 1 else "1 MOVE LEFT"
		else:
			badge_txt = "%d LEFT" % movement_remaining

		var font = ThemeDB.fallback_font
		var txt_size = font.get_string_size(badge_txt, HORIZONTAL_ALIGNMENT_CENTER, -1, 10)
		var badge_w = txt_size.x + 14.0
		var badge_h = 19.0
		var badge_rect = Rect2(mid_pt.x - badge_w * 0.5, mid_pt.y - badge_h * 0.5, badge_w, badge_h)

		# Drop shadow
		canvas.draw_rect(Rect2(badge_rect.position + Vector2(1, 1), badge_rect.size), Color(0.0, 0.0, 0.0, 0.6), true)
		# Background pill
		canvas.draw_rect(badge_rect, Color(0.04, 0.10, 0.16, 0.95), true)
		# Green border
		canvas.draw_rect(badge_rect, Color(0.2, 0.92, 0.38, 1.0), false, 1.5)
		# Text label
		canvas.draw_string(font, Vector2(mid_pt.x - txt_size.x * 0.5, mid_pt.y + 4), badge_txt, HORIZONTAL_ALIGNMENT_CENTER, -1, 10, Color.WHITE)

	# Draw Heroes (only heroes currently on the board are drawn)
	var heroes_by_tile: Dictionary = {}
	for idx in range(heroes.size()):
		var h = heroes[idx]
		if not h.get("is_on_board", false):
			continue
		var pos = h.get("grid_pos", Vector2i(0, 0))
		if not heroes_by_tile.has(pos):
			heroes_by_tile[pos] = []
		heroes_by_tile[pos].append(idx)

	# 4 standard quadrant offsets when multiple heroes share a tile
	var quad_offsets = [
		Vector2(-tile_size * 0.18, -tile_size * 0.18),
		Vector2(tile_size * 0.18, -tile_size * 0.18),
		Vector2(-tile_size * 0.18, tile_size * 0.18),
		Vector2(tile_size * 0.18, tile_size * 0.18)
	]

	# Draw non-active heroes first, and active hero LAST so active hero is always on top!
	var draw_indices: Array[int] = []
	for idx in range(heroes.size()):
		if not heroes[idx].get("is_on_board", false):
			continue
		if idx != active_hero_idx:
			draw_indices.append(idx)
	if active_hero_idx >= 0 and active_hero_idx < heroes.size() and heroes[active_hero_idx].get("is_on_board", false):
		draw_indices.append(active_hero_idx)

	for idx in draw_indices:
		var h = heroes[idx]
		if not h.get("is_on_board", false):
			continue
		var pos = h.get("grid_pos", Vector2i(0, 0))
		var is_active = (idx == active_hero_idx and current_phase == "hero_phase")
		var tile_heroes = heroes_by_tile.get(pos, [idx])
		var tile_center = board_offset + Vector2(pos.x * tile_size + tile_size * 0.5, pos.y * tile_size + tile_size * 0.5)

		var screen_pos = tile_center
		var token_radius = tile_size * 0.42
		var font_size = 14

		if is_active:
			# Active hero is always front, center, and full size! Never displaced!
			screen_pos = tile_center
			token_radius = tile_size * 0.42
			font_size = 14
		elif tile_heroes.size() > 1:
			var slot = tile_heroes.find(idx)
			if slot >= 0 and slot < quad_offsets.size():
				screen_pos = tile_center + quad_offsets[slot]
				token_radius = tile_size * 0.22
				font_size = 10

		var col = Color.from_string(h.get("tokenColor", "#b91c1c"), Color.RED)
		var token_tex = get_hero_token_texture(h)

		if token_tex:
			# Draw subtle drop shadow under circular token
			canvas.draw_circle(screen_pos + Vector2(1.5, 2.0), token_radius, Color(0.0, 0.0, 0.0, 0.52))
			var dest_rect = Rect2(screen_pos.x - token_radius, screen_pos.y - token_radius, token_radius * 2.0, token_radius * 2.0)
			canvas.draw_texture_rect(token_tex, dest_rect, false)
		else:
			# Draw token base circle (fallback)
			canvas.draw_circle(screen_pos, token_radius, col)
			canvas.draw_arc(screen_pos, token_radius, 0, TAU, 32, Color(0.95, 0.95, 0.95, 0.9), 1.5)

			# Token Initial (B, D, E, W)
			var h_name = str(h.get("name", "Hero")).to_lower()
			var h_initial = "H"
			if "barbarian" in h_name:
				h_initial = "B"
			elif "dwarf" in h_name:
				h_initial = "D"
			elif "elf" in h_name:
				h_initial = "E"
			elif "wizard" in h_name:
				h_initial = "W"
			else:
				h_initial = h_name.substr(0, 1).to_upper()

			var init_w = ThemeDB.fallback_font.get_string_size(h_initial, HORIZONTAL_ALIGNMENT_CENTER, -1, font_size).x
			canvas.draw_string(ThemeDB.fallback_font, Vector2(screen_pos.x - init_w * 0.5, screen_pos.y + font_size * 0.38), h_initial, HORIZONTAL_ALIGNMENT_CENTER, -1, font_size, Color.WHITE)

		# Draw Hero Active Status Auras
		if h.get("rock_skin_active", false):
			for s in range(6):
				var a1 = (float(s) / 6.0) * TAU
				var a2 = (float(s + 1) / 6.0) * TAU
				var p1 = screen_pos + Vector2(cos(a1), sin(a1)) * (token_radius + 4.0)
				var p2 = screen_pos + Vector2(cos(a2), sin(a2)) * (token_radius + 4.0)
				canvas.draw_line(p1, p2, Color(0.7, 0.75, 0.85, 0.9), 2.5)
		if h.get("courage_active", false):
			canvas.draw_arc(screen_pos, token_radius + 5.0, 0, TAU, 24, Color(1.0, 0.25, 0.1, 0.8), 2.0)
			for s in range(6):
				var fa = (float(s) / 6.0) * TAU
				var fp = screen_pos + Vector2(cos(fa), sin(fa)) * (token_radius + 8.0)
				canvas.draw_line(screen_pos + Vector2(cos(fa), sin(fa)) * (token_radius + 4.0), fp, Color(1.0, 0.8, 0.2, 0.9), 2.0)
		if h.get("veil_of_mist_active", false):
			canvas.draw_arc(screen_pos, token_radius + 5.0, 0, TAU, 32, Color(0.8, 0.85, 0.95, 0.6), 3.0)

		# Active Hero prominent highlight and pulsing turn badge
		if is_active:
			# High-contrast golden outer glow
			canvas.draw_arc(screen_pos, token_radius + 4.0, 0, TAU, 32, Color(1.0, 0.85, 0.1, 1.0), 3.0)
			canvas.draw_arc(screen_pos, token_radius + 7.0, 0, TAU, 32, Color(1.0, 0.95, 0.4, 0.6), 1.5)

			# Floating Turn Marker badge above or below the tile
			var active_name = str(h.get("name", "Hero")).to_upper()
			var badge_text = "▼ ACTIVE: " + active_name
			var badge_w = ThemeDB.fallback_font.get_string_size(badge_text, HORIZONTAL_ALIGNMENT_CENTER, -1, 11).x

			var badge_y = tile_center.y - tile_size * 0.5 - 18
			if badge_y < 55:
				badge_y = tile_center.y + tile_size * 0.5 + 4

			var badge_x = maxf(10.0, tile_center.x - badge_w * 0.5 - 6)
			var badge_rect = Rect2(Vector2(badge_x, badge_y), Vector2(badge_w + 12, 16))
			canvas.draw_rect(badge_rect, Color(0.1, 0.12, 0.16, 0.95))
			canvas.draw_rect(badge_rect, Color(1.0, 0.85, 0.1, 1.0), false, 1.5)
			canvas.draw_string(ThemeDB.fallback_font, Vector2(badge_rect.position.x + 6, badge_rect.position.y + 12), badge_text, HORIZONTAL_ALIGNMENT_CENTER, -1, 11, Color(1.0, 0.9, 0.2, 1.0))

	# Draw active dynamic VFX and floating text banners
	_draw_vfx_effects(canvas)
	_draw_floating_texts(canvas)
	_draw_active_dice_roll(canvas)

func _draw_vfx_effects(canvas: CanvasItem) -> void:
	for vfx in active_vfx:
		var vfx_type = str(vfx.get("type", ""))
		var t = clampf(float(vfx.get("time", 0.0)) / maxf(0.001, float(vfx.get("duration", 0.5))), 0.0, 1.0)
		var col = vfx.get("color", Color.ORANGE)

		match vfx_type:
			"projectile":
				var from_pos = vfx.get("from", Vector2.ZERO)
				var to_pos = vfx.get("to", Vector2.ZERO)
				var cur_pos = from_pos.lerp(to_pos, t)
				canvas.draw_circle(cur_pos, 16.0 * (1.0 - t * 0.2), Color(col.r, col.g, col.b, 0.35))
				canvas.draw_circle(cur_pos, 8.0, col)
				canvas.draw_circle(cur_pos, 4.0, Color.WHITE)
				var dir = (from_pos - to_pos).normalized()
				var trail_len = 35.0 * (1.0 - t)
				canvas.draw_line(cur_pos, cur_pos + dir * trail_len, Color(col.r, col.g, col.b, 0.6), 4.0)

			"burst", "explosion":
				var center = vfx.get("center", Vector2.ZERO)
				var max_r = float(vfx.get("max_radius", 45.0))
				var cur_r = max_r * t
				var alpha = 1.0 - t
				canvas.draw_arc(center, cur_r, 0, TAU, 32, Color(col.r, col.g, col.b, alpha * 0.9), 3.0)
				if t < 0.6:
					canvas.draw_circle(center, cur_r * 0.7, Color(col.r, col.g, col.b, (1.0 - t / 0.6) * 0.5))
				for i in range(8):
					var angle = (float(i) / 8.0) * TAU + t * 2.0
					var spike_dir = Vector2(cos(angle), sin(angle))
					var spike_end = center + spike_dir * (cur_r * 1.25)
					canvas.draw_line(center + spike_dir * (cur_r * 0.5), spike_end, Color(1.0, 0.9, 0.4, alpha), 2.5)

			"heal":
				var center = vfx.get("center", Vector2.ZERO)
				var alpha = 1.0 - t
				var h = 60.0 * t
				var rect = Rect2(center.x - 20.0, center.y - h, 40.0, h)
				canvas.draw_rect(rect, Color(col.r, col.g, col.b, alpha * 0.35))
				var cross_col = Color(1.0, 1.0, 1.0, alpha)
				canvas.draw_line(Vector2(center.x, center.y - 30.0), Vector2(center.x, center.y - 10.0), cross_col, 4.0)
				canvas.draw_line(Vector2(center.x - 10.0, center.y - 20.0), Vector2(center.x + 10.0, center.y - 20.0), cross_col, 4.0)

			"cyclone", "whirlwind":
				var center = vfx.get("center", Vector2.ZERO)
				var alpha = 1.0 - t
				var spin = t * TAU * 4.0
				for r_step in [12.0, 22.0, 32.0]:
					var start_a = spin + r_step
					canvas.draw_arc(center, r_step, start_a, start_a + PI * 1.2, 16, Color(col.r, col.g, col.b, alpha * 0.8), 2.5)

			"beam":
				var from_pos = vfx.get("from", Vector2.ZERO)
				var to_pos = vfx.get("to", Vector2.ZERO)
				var alpha = 1.0 - t
				canvas.draw_line(from_pos, to_pos, Color(col.r, col.g, col.b, alpha * 0.4), 8.0)
				canvas.draw_line(from_pos, to_pos, Color.WHITE, 2.5)

			"slash":
				var center = vfx.get("center", Vector2.ZERO)
				var alpha = 1.0 - t
				var rot = float(vfx.get("rotation", 0.0))
				var p1 = center + Vector2(cos(rot - 0.8), sin(rot - 0.8)) * 26.0
				var p2 = center + Vector2(cos(rot + 0.8), sin(rot + 0.8)) * 26.0
				canvas.draw_line(p1, p2, Color(1.0, 1.0, 1.0, alpha), 3.5)

func _draw_floating_texts(canvas: CanvasItem) -> void:
	for ft in floating_texts:
		var font = ThemeDB.fallback_font
		var f_size = 18
		var col = Color(ft.color.r, ft.color.g, ft.color.b, ft.alpha)
		var txt = str(ft.get("text", ""))
		var tw = font.get_string_size(txt, HORIZONTAL_ALIGNMENT_CENTER, -1, f_size).x
		canvas.draw_string(font, Vector2(ft.pos.x - tw * 0.5, ft.pos.y), txt, HORIZONTAL_ALIGNMENT_CENTER, -1, f_size, col)

func trigger_movement_dice_roll(roll_data: Dictionary, hero_name: String, dice_values: Array) -> void:
	_update_board_metrics()
	var center = board_offset + Vector2(grid_cols * tile_size * 0.5, grid_rows * tile_size * 0.45)
	var num_dice = dice_values.size()
	var dice_arr: Array = []
	var spacing = 76.0
	var start_x = center.x - (float(maxi(1, num_dice) - 1) * spacing * 0.5)

	for i in range(num_dice):
		var target_pos = Vector2(start_x + i * spacing, center.y + 10.0)
		var init_pos = Vector2(target_pos.x + randf_range(-4.0, 4.0), target_pos.y - 140.0 - randf_range(20.0, 60.0))
		var val = int(dice_values[i])
		dice_arr.append({
			"type": "movement_red",
			"lane_index": i,
			"init_pos": init_pos,
			"target_pos": target_pos,
			"pos": init_pos,
			"final_value": val,
			"current_face": randi_range(1, 6),
			"angle": randf_range(-0.5, 0.5),
			"spin_speed": randf_range(6.0, 14.0) * (1.0 if randf() > 0.5 else -1.0),
			"bounces": 2.2 + randf() * 0.4,
			"z": 20.0 + randf() * 5.0,
			"current_z": 0.0,
			"settled": false
		})

	active_dice_animation = {
		"type": "movement",
		"title": "%s - Movement Roll (%dd6)" % [hero_name, num_dice],
		"summary": "Rolled %d square%s!" % [int(roll_data.get("total", 0)), "s" if int(roll_data.get("total", 0)) != 1 else ""],
		"dice": dice_arr,
		"time": 0.0,
		"roll_duration": 0.75,
		"total_duration": 4.5,
		"settled": false,
		"center": center,
		"tray_width": maxf(320.0, num_dice * spacing + 120.0),
		"tray_height": 180.0
	}
	queue_redraw_all()

func trigger_combat_dice_roll(combat_res: Dictionary, attacker_name: String, defender_name: String, is_hero_defending: bool, is_defeated: bool = false, _extra_opts: Dictionary = {}) -> void:
	_update_board_metrics()
	var center = board_offset + Vector2(grid_cols * tile_size * 0.5, grid_rows * tile_size * 0.45)
	var atk_res = combat_res.get("attack", {})
	var def_res = combat_res.get("defense", {})
	var atk_faces = atk_res.get("faces", [])
	var def_faces = def_res.get("faces", [])
	var wounds = int(combat_res.get("wounds", 0))
	var skulls = int(combat_res.get("total_skulls", 0))
	var shields = int(combat_res.get("effective_shields", 0))

	var dice_arr: Array = []
	var spacing = 78.0 # Generous 26px gap between 52px dice prevents touching or overlap
	var n_atk = atk_faces.size()
	var n_def = def_faces.size()
	var max_dice_row = maxi(n_atk, n_def)

	var tray_width = maxf(420.0, max_dice_row * spacing + 80.0)
	var tray_height = 270.0 if n_def > 0 else 190.0
	var top_y = center.y - tray_height * 0.5

	# Top row: Attacker dice (drops straight down in dedicated column lanes)
	var start_x_atk = center.x - (float(maxi(1, n_atk) - 1) * spacing * 0.5)
	for i in range(n_atk):
		var face = str(atk_faces[i])
		var target_pos = Vector2(start_x_atk + i * spacing, top_y + 70.0 if n_def > 0 else center.y - 10.0)
		var init_pos = Vector2(target_pos.x + randf_range(-4.0, 4.0), target_pos.y - 120.0 - randf_range(10.0, 30.0))
		dice_arr.append({
			"type": "combat_white",
			"group": "attack",
			"lane_index": i,
			"init_pos": init_pos,
			"target_pos": target_pos,
			"pos": init_pos,
			"final_face": face,
			"current_face": ["skull", "white_shield", "black_shield"][randi() % 3],
			"angle": randf_range(-0.5, 0.5),
			"spin_speed": randf_range(6.0, 12.0) * (1.0 if randf() > 0.5 else -1.0),
			"bounces": 2.0 + randf() * 0.4,
			"z": 18.0 + randf() * 5.0, # Controlled bounce prevents rising into adjacent row
			"current_z": 0.0,
			"settled": false,
			"is_hit": face == "skull",
			"is_block": false
		})

	# Bottom row: Defender dice (drops straight up/down in dedicated column lanes)
	var start_x_def = center.x - (float(maxi(1, n_def) - 1) * spacing * 0.5)
	for i in range(n_def):
		var face = str(def_faces[i])
		var target_pos = Vector2(start_x_def + i * spacing, top_y + 172.0)
		var init_pos = Vector2(target_pos.x + randf_range(-4.0, 4.0), target_pos.y + 120.0 + randf_range(10.0, 30.0))
		var is_block = (face == "white_shield" if is_hero_defending else face == "black_shield")
		dice_arr.append({
			"type": "combat_white",
			"group": "defense",
			"lane_index": i,
			"init_pos": init_pos,
			"target_pos": target_pos,
			"pos": init_pos,
			"final_face": face,
			"current_face": ["skull", "white_shield", "black_shield"][randi() % 3],
			"angle": randf_range(-0.5, 0.5),
			"spin_speed": randf_range(6.0, 12.0) * (1.0 if randf() > 0.5 else -1.0),
			"bounces": 2.0 + randf() * 0.4,
			"z": 18.0 + randf() * 5.0,
			"current_z": 0.0,
			"settled": false,
			"is_hit": false,
			"is_block": is_block
		})

	var def_shield_name = "White Shield" if is_hero_defending else "Black Shield"
	var summary_txt = ""
	if is_defeated:
		summary_txt = "%s DEFEATED! %d Skull%s vs %d %s%s -> %d WOUND%s!" % [
			defender_name,
			skulls, "s" if skulls != 1 else "",
			shields, def_shield_name, "s" if shields != 1 else "",
			wounds, "S" if wounds != 1 else ""
		]
	elif wounds > 0:
		summary_txt = "%d Skull%s vs %d %s%s -> %d WOUND%s!" % [
			skulls, "s" if skulls != 1 else "",
			shields, def_shield_name, "s" if shields != 1 else "",
			wounds, "S" if wounds != 1 else ""
		]
	else:
		summary_txt = "%d Skull%s vs %d %s%s -> BLOCKED!" % [
			skulls, "s" if skulls != 1 else "",
			shields, def_shield_name, "s" if shields != 1 else ""
		]

	active_dice_animation = {
		"type": "combat",
		"title": "%s attacks %s!" % [attacker_name, defender_name],
		"summary": summary_txt,
		"dice": dice_arr,
		"time": 0.0,
		"roll_duration": 0.8,
		"total_duration": 6.5,
		"settled": false,
		"center": center,
		"tray_width": tray_width,
		"tray_height": tray_height,
		"wounds": wounds,
		"skulls": skulls,
		"shields": shields,
		"is_hero_defending": is_hero_defending,
		"attacker_name": attacker_name,
		"defender_name": defender_name,
		"is_defeated": is_defeated
	}
	queue_redraw_all()

func _draw_active_dice_roll(canvas: CanvasItem) -> void:
	if active_dice_animation.is_empty():
		return

	var anim = active_dice_animation
	var center = anim.get("center", board_offset + Vector2(grid_cols * tile_size * 0.5, grid_rows * tile_size * 0.45))
	var tray_w = float(anim.get("tray_width", 380.0))
	var tray_h = float(anim.get("tray_height", 180.0))
	var tray_rect = Rect2(center.x - tray_w * 0.5, center.y - tray_h * 0.5, tray_w, tray_h)
	var settled = bool(anim.get("settled", false))
	var font = ThemeDB.fallback_font
	var anim_type = str(anim.get("type", "movement"))

	# 1. Outer Tray Shadow
	canvas.draw_rect(Rect2(tray_rect.position + Vector2(5.0, 7.0), tray_rect.size), Color(0.0, 0.0, 0.0, 0.65))

	# 2. Rich Walnut Wood Tray Rim
	canvas.draw_rect(tray_rect, Color(0.14, 0.08, 0.04, 0.96))
	canvas.draw_rect(tray_rect, Color(0.32, 0.18, 0.10, 1.0), false, 2.5)

	# 3. Inner Tabletop Velvet/Felt Inlay
	var felt_rect = Rect2(tray_rect.position + Vector2(8.0, 8.0), tray_rect.size - Vector2(16.0, 16.0))
	var felt_color = Color(0.05, 0.14, 0.08, 0.97) if anim_type == "movement" else Color(0.06, 0.08, 0.14, 0.98)
	canvas.draw_rect(felt_rect, felt_color)

	# Gold/Brass Inlay Filigree Trim
	canvas.draw_rect(felt_rect, Color(0.85, 0.72, 0.25, 0.75), false, 1.8)

	if anim_type == "movement":
		# Movement Header Banner
		var title = str(anim.get("title", ""))
		var title_w = font.get_string_size(title, HORIZONTAL_ALIGNMENT_CENTER, -1, 14).x
		canvas.draw_string(font, Vector2(center.x - title_w * 0.5, tray_rect.position.y + 24.0), title, HORIZONTAL_ALIGNMENT_CENTER, -1, 14, Color(1.0, 0.90, 0.45, 1.0))
	else:
		# COMBAT TRAY: Attacker on TOP with skulls that matter, Defender on BOTTOM with shields that matter
		var attacker_name = str(anim.get("attacker_name", "Attacker"))
		var defender_name = str(anim.get("defender_name", "Defender"))
		var skulls = int(anim.get("skulls", 0))
		var shields = int(anim.get("shields", 0))
		var is_hero_defending = bool(anim.get("is_hero_defending", false))
		var def_shield_name = "WHITE SHIELDS" if is_hero_defending else "BLACK SHIELDS"
		var single_shield_name = "WHITE SHIELD" if is_hero_defending else "BLACK SHIELD"

		var n_atk = 0
		var n_def = 0
		for d in anim.get("dice", []):
			if d.get("group") == "attack":
				n_atk += 1
			elif d.get("group") == "defense":
				n_def += 1

		# TOP HEADER: Attacker section with skulls that matter
		var atk_header = ""
		if settled:
			var skull_word = "SKULL" if skulls == 1 else "SKULLS"
			atk_header = "ATTACK: %s — %d %s (%d Dice)" % [attacker_name, skulls, skull_word, n_atk]
		else:
			atk_header = "ATTACK: %s — ATTACK ROLL (%d Dice)" % [attacker_name, n_atk]

		var atk_h_rect = Rect2(felt_rect.position.x + 12.0, felt_rect.position.y + 6.0, felt_rect.size.x - 24.0, 24.0)
		canvas.draw_rect(atk_h_rect, Color(0.20, 0.08, 0.08, 0.85))
		canvas.draw_rect(atk_h_rect, Color(0.85, 0.45, 0.20, 0.80), false, 1.2)
		var atk_w = font.get_string_size(atk_header, HORIZONTAL_ALIGNMENT_CENTER, -1, 13).x
		canvas.draw_string(font, Vector2(center.x - atk_w * 0.5, atk_h_rect.position.y + 17.0), atk_header, HORIZONTAL_ALIGNMENT_CENTER, -1, 13, Color(1.0, 0.92, 0.65, 1.0))

		# BOTTOM HEADER: Defender section with shields that matter
		if n_def > 0:
			var def_header = ""
			if settled:
				var shield_word = single_shield_name if shields == 1 else def_shield_name
				def_header = "DEFENSE: %s — %d %s (%d Dice)" % [defender_name, shields, shield_word, n_def]
			else:
				def_header = "DEFENSE: %s — DEFEND ROLL (%d Dice)" % [defender_name, n_def]

			var def_h_rect = Rect2(felt_rect.position.x + 12.0, felt_rect.position.y + 104.0, felt_rect.size.x - 24.0, 24.0)
			canvas.draw_rect(def_h_rect, Color(0.08, 0.14, 0.22, 0.85))
			canvas.draw_rect(def_h_rect, Color(0.30, 0.70, 0.95, 0.80), false, 1.2)
			var def_w = font.get_string_size(def_header, HORIZONTAL_ALIGNMENT_CENTER, -1, 13).x
			canvas.draw_string(font, Vector2(center.x - def_w * 0.5, def_h_rect.position.y + 17.0), def_header, HORIZONTAL_ALIGNMENT_CENTER, -1, 13, Color(0.70, 0.90, 1.0, 1.0))

	# 6. Draw Dice (with distinct focus on the dice that matter)
	for die in anim.get("dice", []):
		var d_type = str(die.get("type", "movement_red"))
		var d_pos = die.get("pos", center)
		var angle = float(die.get("angle", 0.0))
		var z = float(die.get("current_z", 0.0))
		var d_settled = bool(die.get("settled", false))
		var group = str(die.get("group", ""))

		if d_type == "movement_red":
			var pips = int(die.get("current_face", 1))
			_draw_red_movement_die(canvas, d_pos, 54.0, pips, angle, z, 1.0, d_settled)
		else:
			var face = str(die.get("current_face", "skull"))
			var is_hit = bool(die.get("is_hit", false))
			var is_block = bool(die.get("is_block", false))
			# Focus: when settled, non-matching dice are dimmed to 0.58 so the dice that matter pop!
			var die_alpha = 1.0
			if settled:
				if group == "attack" and not is_hit:
					die_alpha = 0.58
				elif group == "defense" and not is_block:
					die_alpha = 0.58
			_draw_white_combat_die(canvas, d_pos, 52.0, face, angle, z, die_alpha, d_settled, is_hit, is_block)

	# 7. Settled Outcome Summary Badge or Defeated Banner at Bottom of Tray
	if settled:
		var is_def = bool(anim.get("is_defeated", false))
		var wounds = int(anim.get("wounds", 0))
		var defender_name = str(anim.get("defender_name", "Target"))

		if is_def:
			# Bold Defeated Creature Banner: "{Creature} DEFEATED! ({N} Wounds)"
			var def_banner_text = "%s DEFEATED! (%d Wound%s)" % [
				defender_name.to_upper(), wounds, "s" if wounds != 1 else ""
			]
			var sum_w = font.get_string_size(def_banner_text, HORIZONTAL_ALIGNMENT_CENTER, -1, 14).x
			var badge_rect = Rect2(center.x - sum_w * 0.5 - 18.0, tray_rect.end.y - 34.0, sum_w + 36.0, 26.0)
			# Crimson background
			canvas.draw_rect(badge_rect, Color(0.35, 0.04, 0.04, 0.98))
			# Radiant Gold & Ruby Border
			canvas.draw_rect(badge_rect, Color(1.0, 0.85, 0.25, 1.0), false, 2.0)
			canvas.draw_rect(Rect2(badge_rect.position + Vector2(2, 2), badge_rect.size - Vector2(4, 4)), Color(0.85, 0.15, 0.15, 0.8), false, 1.0)
			canvas.draw_string(font, Vector2(center.x - sum_w * 0.5, tray_rect.end.y - 16.0), def_banner_text, HORIZONTAL_ALIGNMENT_CENTER, -1, 14, Color(1.0, 0.96, 0.65, 1.0))
		else:
			var summary = str(anim.get("summary", ""))
			var sum_w = font.get_string_size(summary, HORIZONTAL_ALIGNMENT_CENTER, -1, 13).x
			var badge_rect = Rect2(center.x - sum_w * 0.5 - 12.0, tray_rect.end.y - 28.0, sum_w + 24.0, 20.0)
			canvas.draw_rect(badge_rect, Color(0.08, 0.10, 0.14, 0.95))
			var outline_col = Color(1.0, 0.85, 0.25, 0.9) if ("WOUND" in summary or "square" in summary) else Color(0.4, 0.8, 1.0, 0.9)
			canvas.draw_rect(badge_rect, outline_col, false, 1.5)
			canvas.draw_string(font, Vector2(center.x - sum_w * 0.5, tray_rect.end.y - 13.0), summary, HORIZONTAL_ALIGNMENT_CENTER, -1, 13, outline_col)

		# Close / Dismiss button [✕] in top right corner of tray
		var close_btn_rect = Rect2(tray_rect.end.x - 28.0, tray_rect.position.y + 6.0, 22.0, 22.0)
		canvas.draw_rect(close_btn_rect, Color(0.25, 0.08, 0.08, 0.90))
		canvas.draw_rect(close_btn_rect, Color(0.85, 0.35, 0.35, 0.85), false, 1.2)
		var x_w = font.get_string_size("✕", HORIZONTAL_ALIGNMENT_CENTER, -1, 12).x
		canvas.draw_string(font, Vector2(close_btn_rect.get_center().x - x_w * 0.5, close_btn_rect.get_center().y + 4.5), "✕", HORIZONTAL_ALIGNMENT_CENTER, -1, 12, Color(1.0, 0.85, 0.85, 0.95))

		# Subtle dismiss hint under outcome banner
		var hint_txt = "(Click anywhere or press Space to continue)"
		var hint_w = font.get_string_size(hint_txt, HORIZONTAL_ALIGNMENT_CENTER, -1, 9).x
		canvas.draw_string(font, Vector2(center.x - hint_w * 0.5, tray_rect.end.y - 3.0), hint_txt, HORIZONTAL_ALIGNMENT_CENTER, -1, 9, Color(0.70, 0.75, 0.85, 0.70))

func _draw_red_movement_die(canvas: CanvasItem, center: Vector2, size: float, pips: int, angle: float, z: float, alpha: float, settled: bool) -> void:
	var hs = size * 0.5
	var die_ground = center
	var die_screen_pos = center - Vector2(0.0, z)

	# 1. Ground Drop Shadow (projected below tumbling die)
	var shadow_size = size * (1.0 - clampf(z / 150.0, 0.0, 0.3))
	var shadow_rect = Rect2(die_ground.x - shadow_size * 0.5 + 4.0, die_ground.y - shadow_size * 0.5 + 6.0 + z * 0.25, shadow_size, shadow_size)
	canvas.draw_rect(shadow_rect, Color(0.0, 0.0, 0.0, 0.45 * alpha))

	# 2. Rotated 3D Die Cube Face
	canvas.draw_set_transform(die_screen_pos, angle, Vector2.ONE)

	# Main Red Body Face
	var base_red = Color(0.85, 0.12, 0.12, alpha)
	canvas.draw_rect(Rect2(-hs, -hs, size, size), base_red)

	# 3D Bevel Highlights (Top & Left)
	var top_bevel = PackedVector2Array([Vector2(-hs, -hs), Vector2(hs, -hs), Vector2(hs - 3.5, -hs + 3.5), Vector2(-hs + 3.5, -hs + 3.5)])
	canvas.draw_colored_polygon(top_bevel, Color(1.0, 0.38, 0.38, alpha * 0.8))
	var left_bevel = PackedVector2Array([Vector2(-hs, -hs), Vector2(-hs + 3.5, -hs + 3.5), Vector2(-hs + 3.5, hs - 3.5), Vector2(-hs, hs)])
	canvas.draw_colored_polygon(left_bevel, Color(0.95, 0.28, 0.28, alpha * 0.6))

	# 3D Bevel Shading (Bottom & Right)
	var bot_bevel = PackedVector2Array([Vector2(-hs, hs), Vector2(-hs + 3.5, hs - 3.5), Vector2(hs - 3.5, hs - 3.5), Vector2(hs, hs)])
	canvas.draw_colored_polygon(bot_bevel, Color(0.45, 0.05, 0.05, alpha * 0.85))
	var right_bevel = PackedVector2Array([Vector2(hs, -hs), Vector2(hs, hs), Vector2(hs - 3.5, hs - 3.5), Vector2(hs - 3.5, -hs + 3.5)])
	canvas.draw_colored_polygon(right_bevel, Color(0.55, 0.06, 0.06, alpha * 0.75))

	# Outer Dark Crimson Border
	canvas.draw_rect(Rect2(-hs, -hs, size, size), Color(0.40, 0.04, 0.04, alpha), false, 2.0)

	if settled:
		# Settled Golden Specular Shimmer
		canvas.draw_rect(Rect2(-hs - 1.0, -hs - 1.0, size + 2.0, size + 2.0), Color(1.0, 0.88, 0.25, 0.4), false, 1.5)

	# 3. White Pips (1 to 6)
	var pr = size * 0.082
	var d = size * 0.27
	var pip_positions: Array[Vector2] = []

	match pips:
		1:
			pip_positions = [Vector2.ZERO]
		2:
			pip_positions = [Vector2(-d, -d), Vector2(d, d)]
		3:
			pip_positions = [Vector2(-d, -d), Vector2.ZERO, Vector2(d, d)]
		4:
			pip_positions = [Vector2(-d, -d), Vector2(d, -d), Vector2(-d, d), Vector2(d, d)]
		5:
			pip_positions = [Vector2(-d, -d), Vector2(d, -d), Vector2.ZERO, Vector2(-d, d), Vector2(d, d)]
		6:
			pip_positions = [Vector2(-d, -d), Vector2(d, -d), Vector2(-d, 0.0), Vector2(d, 0.0), Vector2(-d, d), Vector2(d, d)]
		_:
			pip_positions = [Vector2.ZERO]

	for p in pip_positions:
		# Recessed Dark Pip Socket
		canvas.draw_circle(p + Vector2(0.5, 0.8), pr + 0.8, Color(0.35, 0.03, 0.03, alpha * 0.85))
		# Authentic White Pip
		canvas.draw_circle(p, pr, Color(0.98, 0.98, 0.98, alpha))
		# Tiny Specular Shine Dot
		canvas.draw_circle(p - Vector2(1.0, 1.0), pr * 0.35, Color(1.0, 1.0, 1.0, alpha * 0.9))

	# Reset Canvas Transform
	canvas.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

func _draw_white_combat_die(canvas: CanvasItem, center: Vector2, size: float, face_type: String, angle: float, z: float, alpha: float, settled: bool, is_hit: bool, is_block: bool) -> void:
	var hs = size * 0.5
	var die_ground = center
	var die_screen_pos = center - Vector2(0.0, z)

	# 1. Ground Drop Shadow
	var shadow_size = size * (1.0 - clampf(z / 150.0, 0.0, 0.3))
	var shadow_rect = Rect2(die_ground.x - shadow_size * 0.5 + 4.0, die_ground.y - shadow_size * 0.5 + 6.0 + z * 0.25, shadow_size, shadow_size)
	canvas.draw_rect(shadow_rect, Color(0.0, 0.0, 0.0, 0.40 * alpha))

	# 2. Rotated 3D Bone White Die
	canvas.draw_set_transform(die_screen_pos, angle, Vector2.ONE)

	# Bone White / Ivory Face
	var base_ivory = Color(0.96, 0.96, 0.94, alpha)
	canvas.draw_rect(Rect2(-hs, -hs, size, size), base_ivory)

	# 3D Bevel Highlights (Top & Left)
	var top_bevel = PackedVector2Array([Vector2(-hs, -hs), Vector2(hs, -hs), Vector2(hs - 3.5, -hs + 3.5), Vector2(-hs + 3.5, -hs + 3.5)])
	canvas.draw_colored_polygon(top_bevel, Color(1.0, 1.0, 1.0, alpha * 0.9))
	var left_bevel = PackedVector2Array([Vector2(-hs, -hs), Vector2(-hs + 3.5, -hs + 3.5), Vector2(-hs + 3.5, hs - 3.5), Vector2(-hs, hs)])
	canvas.draw_colored_polygon(left_bevel, Color(0.92, 0.92, 0.90, alpha * 0.6))

	# 3D Bevel Shading (Bottom & Right)
	var bot_bevel = PackedVector2Array([Vector2(-hs, hs), Vector2(-hs + 3.5, hs - 3.5), Vector2(hs - 3.5, hs - 3.5), Vector2(hs, hs)])
	canvas.draw_colored_polygon(bot_bevel, Color(0.72, 0.72, 0.70, alpha * 0.8))
	var right_bevel = PackedVector2Array([Vector2(hs, -hs), Vector2(hs, hs), Vector2(hs - 3.5, hs - 3.5), Vector2(hs - 3.5, -hs + 3.5)])
	canvas.draw_colored_polygon(right_bevel, Color(0.78, 0.78, 0.76, alpha * 0.7))

	# Charcoal Border
	canvas.draw_rect(Rect2(-hs, -hs, size, size), Color(0.18, 0.18, 0.20, alpha), false, 2.2)

	# Settled Combat Sparks & Halos
	if settled:
		if is_hit:
			# Fiery Hit Glow
			canvas.draw_rect(Rect2(-hs - 2.0, -hs - 2.0, size + 4.0, size + 4.0), Color(1.0, 0.30, 0.10, 0.85), false, 2.2)
		elif is_block:
			# Radiant Defensive Deflection Glow
			var block_col = Color(0.20, 0.80, 1.0, 0.85) if face_type == "white_shield" else Color(0.85, 0.15, 0.40, 0.85)
			canvas.draw_rect(Rect2(-hs - 2.0, -hs - 2.0, size + 4.0, size + 4.0), block_col, false, 2.2)

	# 3. Authentic HeroQuest Combat Face (Skull, White Shield, Black Shield)
	var black_icon_col = Color(0.12, 0.12, 0.14, alpha)

	match face_type:
		"skull":
			# Skull Cranium
			canvas.draw_circle(Vector2(0.0, -size * 0.08), size * 0.24, black_icon_col)
			# Jaw Block
			var jaw_rect = Rect2(-size * 0.13, size * 0.04, size * 0.26, size * 0.18)
			canvas.draw_rect(jaw_rect, black_icon_col)

			# Cutouts: Eye Sockets (Bone Ivory)
			canvas.draw_circle(Vector2(-size * 0.09, -size * 0.07), size * 0.065, base_ivory)
			canvas.draw_circle(Vector2(size * 0.09, -size * 0.07), size * 0.065, base_ivory)

			# Cutout: Nasal Slit
			canvas.draw_line(Vector2(0.0, 0.0), Vector2(0.0, size * 0.06), base_ivory, 2.2)

			# Cutout: Tooth Slits in Jaw
			canvas.draw_line(Vector2(-size * 0.045, size * 0.08), Vector2(-size * 0.045, size * 0.18), base_ivory, 1.8)
			canvas.draw_line(Vector2(size * 0.045, size * 0.08), Vector2(size * 0.045, size * 0.18), base_ivory, 1.8)

			if settled and is_hit:
				# Red hit spark in pupils
				canvas.draw_circle(Vector2(-size * 0.09, -size * 0.07), size * 0.03, Color(1.0, 0.15, 0.1, alpha))
				canvas.draw_circle(Vector2(size * 0.09, -size * 0.07), size * 0.03, Color(1.0, 0.15, 0.1, alpha))

		"white_shield":
			# Knight Heater Shield with Cross (Hero Defense)
			var sw = size * 0.26
			var ty = -size * 0.26
			var my = size * 0.04
			var by = size * 0.30
			var shield_pts = PackedVector2Array([
				Vector2(-sw, ty),
				Vector2(sw, ty),
				Vector2(sw, my),
				Vector2(0.0, by),
				Vector2(-sw, my)
			])
			# White field inside shield
			canvas.draw_colored_polygon(shield_pts, Color(0.98, 0.98, 0.96, alpha))
			# Bold Black Shield Outline
			var shield_outline = PackedVector2Array([
				Vector2(-sw, ty), Vector2(sw, ty), Vector2(sw, my),
				Vector2(0.0, by), Vector2(-sw, my), Vector2(-sw, ty)
			])
			canvas.draw_polyline(shield_outline, black_icon_col, 2.8)

			# Black Knight's Cross
			canvas.draw_line(Vector2(0.0, ty + 2.0), Vector2(0.0, by - 4.0), black_icon_col, 3.8)
			var cross_y = ty + (my - ty) * 0.45
			canvas.draw_line(Vector2(-sw + 3.0, cross_y), Vector2(sw - 3.0, cross_y), black_icon_col, 3.8)

			if settled and is_block:
				# Radiant cyan cross center gleam
				canvas.draw_line(Vector2(0.0, ty + 4.0), Vector2(0.0, by - 6.0), Color(0.3, 0.85, 1.0, alpha), 1.5)
				canvas.draw_line(Vector2(-sw + 5.0, cross_y), Vector2(sw - 5.0, cross_y), Color(0.3, 0.85, 1.0, alpha), 1.5)

		"black_shield":
			# Solid Black Obsidian Heater Shield with Demonic Horns (Monster Defense)
			var sw = size * 0.26
			var ty = -size * 0.26
			var my = size * 0.04
			var by = size * 0.30
			var shield_pts = PackedVector2Array([
				Vector2(-sw, ty),
				Vector2(sw, ty),
				Vector2(sw, my),
				Vector2(0.0, by),
				Vector2(-sw, my)
			])
			# Solid Black Shield Fill
			canvas.draw_colored_polygon(shield_pts, black_icon_col)
			var shield_outline = PackedVector2Array([
				Vector2(-sw, ty), Vector2(sw, ty), Vector2(sw, my),
				Vector2(0.0, by), Vector2(-sw, my), Vector2(-sw, ty)
			])
			canvas.draw_polyline(shield_outline, Color(0.05, 0.05, 0.06, alpha), 2.8)

			# Demonic Horns / Spikes (Ivory White on Black Shield)
			canvas.draw_line(Vector2(-size * 0.16, ty + 4.0), Vector2(-size * 0.05, my), base_ivory, 2.4)
			canvas.draw_line(Vector2(size * 0.16, ty + 4.0), Vector2(size * 0.05, my), base_ivory, 2.4)
			canvas.draw_line(Vector2(-size * 0.05, my), Vector2(0.0, my + size * 0.12), base_ivory, 2.4)
			canvas.draw_line(Vector2(size * 0.05, my), Vector2(0.0, my + size * 0.12), base_ivory, 2.4)

			if settled and is_block:
				# Crimson evil flare
				canvas.draw_polyline(shield_outline, Color(0.9, 0.15, 0.35, alpha * 0.8), 2.2)

	# Reset Canvas Transform
	canvas.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

