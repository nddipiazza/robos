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
var furniture_textures: Dictionary = {}
var tile_textures: Dictionary = {}
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
var _furniture_by_tile: Dictionary = {}
var grid_cols: int = GRID_COLS
var grid_rows: int = GRID_ROWS
var starting_stair: Vector2i = Vector2i(1, 1)
var tile_size: float = TILE_SIZE
var board_offset: Vector2 = BOARD_OFFSET
var hovered_tile: Vector2i = Vector2i(-1, -1)

var active_vfx: Array[Dictionary] = []
var floating_texts: Array[Dictionary] = []
var active_dice_animation: Dictionary = {}
var active_trap_overlay: Dictionary = {}
var active_treasure_overlay: Dictionary = {}
var story_triggers: Array[Dictionary] = []
var active_story_trigger_overlay: Dictionary = {}
var flashing_item: Dictionary = {}
var pending_flash_item: Dictionary = {}
var searched_rooms: Dictionary = {}
var room_special_treasure_collected: Dictionary = {}
var treasure_deck: Array[Dictionary] = []
var treasure_discard: Array[Dictionary] = []
var last_treasure_card: Dictionary = {}
var last_spell_result: Dictionary = {}
var last_combat_result: Dictionary = {}

var active_enemy_turn_monster_id: String = ""
var is_enemy_turn_waiting: bool = false
var enemy_turn_wait_timer: float = 0.0
var enemy_turn_wait_duration: float = 1.5
var pending_enemy_turn_monsters: Array[Dictionary] = []
var enemy_turn_stage: String = "idle" # "idle", "rolling", "moving", "pause_after_move", "acting", "waiting_for_action"
var enemy_turn_timer: float = 0.0
var enemy_step_timer: float = 0.0
var enemy_step_duration: float = 0.32
var enemy_turn_path: Array[Vector2i] = []
var enemy_turn_step_index: int = 0
var enemy_movement_remaining: int = 0
var enemy_movement_rolled_total: int = 0
var enemy_target_hero: Dictionary = {}
var damage_events: Array[Dictionary] = []
var last_damage_event: Dictionary = {}

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
@onready var log_panel: Panel = get_node_or_null("UI/LogPanel")

var show_defeated_monsters: bool = false
var last_player_attack_hit: Dictionary = {}
var turn_player_losses: Dictionary = {}
var turn_losses_active: bool = false
var log_display_mode: String = "damage_report"

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
@onready var btn_map_end_turn: Button = get_node_or_null("UI/BtnMapEndTurn")
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

@onready var hero_detail_modal: ColorRect = get_node_or_null("UI/HeroDetailModal")
@onready var hero_detail_card: PanelContainer = get_node_or_null("UI/HeroDetailModal/Card")
@onready var hero_detail_title: Label = get_node_or_null("UI/HeroDetailModal/Card/Margin/VBox/Header/Title")
@onready var hero_detail_status_badge: Label = get_node_or_null("UI/HeroDetailModal/Card/Margin/VBox/Header/StatusBadge")
@onready var hero_detail_btn_close_header: Button = get_node_or_null("UI/HeroDetailModal/Card/Margin/VBox/Header/BtnCloseHeader")
@onready var hero_detail_portrait: TextureRect = get_node_or_null("UI/HeroDetailModal/Card/Margin/VBox/ContentHBox/LeftCol/PortraitFrame/PortraitTexture")
@onready var hero_detail_name: Label = get_node_or_null("UI/HeroDetailModal/Card/Margin/VBox/ContentHBox/LeftCol/HeroName")
@onready var hero_detail_class: Label = get_node_or_null("UI/HeroDetailModal/Card/Margin/VBox/ContentHBox/LeftCol/HeroClass")
@onready var hero_detail_lore: RichTextLabel = get_node_or_null("UI/HeroDetailModal/Card/Margin/VBox/ContentHBox/LeftCol/LoreLabel")
@onready var hero_detail_stats_box: HBoxContainer = get_node_or_null("UI/HeroDetailModal/Card/Margin/VBox/ContentHBox/RightCol/ScrollContainer/DetailsVBox/StatsBox")
@onready var hero_detail_equipment_section: VBoxContainer = get_node_or_null("UI/HeroDetailModal/Card/Margin/VBox/ContentHBox/RightCol/ScrollContainer/DetailsVBox/EquipmentSection")
@onready var hero_detail_spells_section: VBoxContainer = get_node_or_null("UI/HeroDetailModal/Card/Margin/VBox/ContentHBox/RightCol/ScrollContainer/DetailsVBox/SpellsSection")
@onready var hero_detail_abilities_section: VBoxContainer = get_node_or_null("UI/HeroDetailModal/Card/Margin/VBox/ContentHBox/RightCol/ScrollContainer/DetailsVBox/AbilitiesSection")
@onready var hero_detail_btn_close: Button = get_node_or_null("UI/HeroDetailModal/Card/Margin/VBox/ButtonBox/BtnClose")

@onready var monster_detail_modal: ColorRect = get_node_or_null("UI/MonsterDetailModal")
@onready var monster_detail_card: PanelContainer = get_node_or_null("UI/MonsterDetailModal/Card")
@onready var monster_detail_title: Label = get_node_or_null("UI/MonsterDetailModal/Card/Margin/VBox/Header/Title")
@onready var monster_detail_status_badge: Label = get_node_or_null("UI/MonsterDetailModal/Card/Margin/VBox/Header/StatusBadge")
@onready var monster_detail_btn_close_header: Button = get_node_or_null("UI/MonsterDetailModal/Card/Margin/VBox/Header/BtnCloseHeader")
@onready var monster_detail_portrait: TextureRect = get_node_or_null("UI/MonsterDetailModal/Card/Margin/VBox/ContentHBox/LeftCol/PortraitFrame/PortraitTexture")
@onready var monster_detail_name: Label = get_node_or_null("UI/MonsterDetailModal/Card/Margin/VBox/ContentHBox/LeftCol/MonsterName")
@onready var monster_detail_type: Label = get_node_or_null("UI/MonsterDetailModal/Card/Margin/VBox/ContentHBox/LeftCol/MonsterType")
@onready var monster_detail_lore: RichTextLabel = get_node_or_null("UI/MonsterDetailModal/Card/Margin/VBox/ContentHBox/LeftCol/LoreLabel")
@onready var monster_detail_stats_box: HBoxContainer = get_node_or_null("UI/MonsterDetailModal/Card/Margin/VBox/ContentHBox/RightCol/ScrollContainer/DetailsVBox/StatsBox")
@onready var monster_detail_tactical_section: VBoxContainer = get_node_or_null("UI/MonsterDetailModal/Card/Margin/VBox/ContentHBox/RightCol/ScrollContainer/DetailsVBox/TacticalSection")
@onready var monster_detail_abilities_section: VBoxContainer = get_node_or_null("UI/MonsterDetailModal/Card/Margin/VBox/ContentHBox/RightCol/ScrollContainer/DetailsVBox/AbilitiesSection")
@onready var monster_detail_spells_section: VBoxContainer = get_node_or_null("UI/MonsterDetailModal/Card/Margin/VBox/ContentHBox/RightCol/ScrollContainer/DetailsVBox/SpellsSection")
@onready var monster_detail_btn_close: Button = get_node_or_null("UI/MonsterDetailModal/Card/Margin/VBox/ButtonBox/BtnClose")

var active_detail_hero_id: String = ""
var active_detail_monster_id: String = ""
var _hero_card_bg_cache: Dictionary = {}
var _monster_card_bg_cache: Dictionary = {}
var _ai_icon_cache: Dictionary = {}
var _ai_icon_paths: Dictionary = {}

@onready var btn_armory: Button = _find_action_button("BtnArmory")

@onready var armory_modal: ColorRect = get_node_or_null("UI/ArmoryModal")
@onready var armory_card: PanelContainer = get_node_or_null("UI/ArmoryModal/Card")
@onready var armory_party_gold_badge: Label = get_node_or_null("UI/ArmoryModal/Card/Margin/VBox/Header/PartyGoldBadge")
@onready var armory_btn_close_header: Button = get_node_or_null("UI/ArmoryModal/Card/Margin/VBox/Header/BtnCloseHeader")
@onready var armory_hero_tabs: HBoxContainer = get_node_or_null("UI/ArmoryModal/Card/Margin/VBox/HeroTabs")
@onready var armory_hero_info_banner: PanelContainer = get_node_or_null("UI/ArmoryModal/Card/Margin/VBox/HeroInfoBanner")
@onready var armory_hero_info_text: Label = get_node_or_null("UI/ArmoryModal/Card/Margin/VBox/HeroInfoBanner/HeroInfoMargin/HeroInfoText")
@onready var armory_items_grid: GridContainer = get_node_or_null("UI/ArmoryModal/Card/Margin/VBox/ScrollContainer/ItemsGrid")
@onready var btn_armory_close: Button = get_node_or_null("UI/ArmoryModal/Card/Margin/VBox/ButtonBox/BtnClose")

var armory_open: bool = false
var selected_armory_hero_id: String = "barbarian"

@onready var treasure_modal: ColorRect = get_node_or_null("UI/TreasureModal")
@onready var treasure_modal_card: PanelContainer = get_node_or_null("UI/TreasureModal/Card")
@onready var treasure_deck_badge: Label = get_node_or_null("UI/TreasureModal/Card/Margin/VBox/Header/DeckRatioBadge")
@onready var treasure_btn_close_header: Button = get_node_or_null("UI/TreasureModal/Card/Margin/VBox/Header/BtnCloseHeader")
@onready var treasure_deck_texture: TextureRect = get_node_or_null("UI/TreasureModal/Card/Margin/VBox/StageHBox/DeckColumn/DeckFrame/DeckTexture")
@onready var treasure_deck_stats: Label = get_node_or_null("UI/TreasureModal/Card/Margin/VBox/StageHBox/DeckColumn/DeckStats")
@onready var treasure_card_stage: Control = get_node_or_null("UI/TreasureModal/Card/Margin/VBox/StageHBox/CardStageControl")
@onready var treasure_drawn_card: PanelContainer = get_node_or_null("UI/TreasureModal/Card/Margin/VBox/StageHBox/CardStageControl/DrawnCard")
@onready var treasure_card_type_badge: Label = get_node_or_null("UI/TreasureModal/Card/Margin/VBox/StageHBox/CardStageControl/DrawnCard/CardMargin/CardVBox/CardHeader/CardTypeBadge")
@onready var treasure_card_source: Label = get_node_or_null("UI/TreasureModal/Card/Margin/VBox/StageHBox/CardStageControl/DrawnCard/CardMargin/CardVBox/CardHeader/CardSource")
@onready var treasure_card_title: Label = get_node_or_null("UI/TreasureModal/Card/Margin/VBox/StageHBox/CardStageControl/DrawnCard/CardMargin/CardVBox/CardTitle")
@onready var treasure_card_illustration: TextureRect = get_node_or_null("UI/TreasureModal/Card/Margin/VBox/StageHBox/CardStageControl/DrawnCard/CardMargin/CardVBox/IllustrationFrame/CardIllustration")
@onready var treasure_card_desc: RichTextLabel = get_node_or_null("UI/TreasureModal/Card/Margin/VBox/StageHBox/CardStageControl/DrawnCard/CardMargin/CardVBox/CardDescription")
@onready var treasure_card_flavor: Label = get_node_or_null("UI/TreasureModal/Card/Margin/VBox/StageHBox/CardStageControl/DrawnCard/CardMargin/CardVBox/CardFlavor")
@onready var treasure_outcome_text: Label = get_node_or_null("UI/TreasureModal/Card/Margin/VBox/StageHBox/CardStageControl/DrawnCard/CardMargin/CardVBox/OutcomeBanner/OutcomeMargin/OutcomeText")
@onready var treasure_btn_resolve: Button = get_node_or_null("UI/TreasureModal/Card/Margin/VBox/ButtonBox/BtnResolve")
var _treasure_deck_texture_res: Texture2D = null

var active_targeting: Dictionary = {}
var targeting_cursor: Control = null

@onready var unavailable_notice_panel: PanelContainer = get_node_or_null("UI/UnavailableNotice")
@onready var unavailable_notice_label: Label = get_node_or_null("UI/UnavailableNotice/Margin/HBox/NoticeLabel")
@onready var unavailable_notice_icon: Label = get_node_or_null("UI/UnavailableNotice/Margin/HBox/Icon")

var unavailable_notice_text: String = ""
var unavailable_notice_timer: float = 0.0
var unavailable_notice_duration: float = 2.5

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

func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST:
		auto_save_game()

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
	_setup_armory_modal()
	_setup_turn_overlay_ui()
	_setup_log_panel()
	_setup_hero_detail_modal()
	_setup_monster_detail_modal()
	_setup_treasure_modal()
	_setup_unavailable_notice_style()
	_setup_targeting_system()
	_load_door_textures()
	_load_hero_token_textures()
	_load_monster_token_textures()
	_load_furniture_textures()
	_load_tile_textures()
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
		"armory": "res://assets/icons/action_armory.png",
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
		btn_search_traps, btn_disarm_trap, btn_armory, btn_summon, btn_ai_step, btn_end_turn
	]
	for b in btns:
		if b:
			_setup_action_button_style(b)

	if btn_map_end_turn:
		_setup_map_end_turn_button_style()
		if not btn_map_end_turn.pressed.is_connected(end_turn):
			btn_map_end_turn.pressed.connect(end_turn)

func _setup_map_end_turn_button_style() -> void:
	if not btn_map_end_turn:
		return
	btn_map_end_turn.custom_minimum_size = Vector2(136, 36)
	btn_map_end_turn.add_theme_font_size_override("font_size", 13)
	btn_map_end_turn.add_theme_color_override("font_color", Color(1.0, 0.9, 0.5, 1.0))
	btn_map_end_turn.add_theme_color_override("font_hover_color", Color(1.0, 1.0, 0.8, 1.0))
	btn_map_end_turn.add_theme_color_override("font_disabled_color", Color(0.5, 0.5, 0.6, 0.5))

	var sb_normal = StyleBoxFlat.new()
	sb_normal.bg_color = Color(0.09, 0.12, 0.18, 0.92)
	sb_normal.border_width_left = 1
	sb_normal.border_width_top = 1
	sb_normal.border_width_right = 1
	sb_normal.border_width_bottom = 2
	sb_normal.border_color = Color(0.92, 0.75, 0.22, 0.85)
	sb_normal.set_corner_radius_all(6)
	sb_normal.shadow_color = Color(0, 0, 0, 0.5)
	sb_normal.shadow_size = 4
	btn_map_end_turn.add_theme_stylebox_override("normal", sb_normal)

	var sb_hover = StyleBoxFlat.new()
	sb_hover.bg_color = Color(0.14, 0.19, 0.28, 0.96)
	sb_hover.border_width_left = 2
	sb_hover.border_width_top = 2
	sb_hover.border_width_right = 2
	sb_hover.border_width_bottom = 2
	sb_hover.border_color = Color(1.0, 0.85, 0.3, 1.0)
	sb_hover.set_corner_radius_all(6)
	sb_hover.shadow_color = Color(0.92, 0.75, 0.22, 0.4)
	sb_hover.shadow_size = 6
	btn_map_end_turn.add_theme_stylebox_override("hover", sb_hover)

	var sb_pressed = StyleBoxFlat.new()
	sb_pressed.bg_color = Color(0.06, 0.08, 0.12, 1.0)
	sb_pressed.set_border_width_all(2)
	sb_pressed.border_color = Color(1.0, 0.6, 0.1, 1.0)
	sb_pressed.set_corner_radius_all(6)
	btn_map_end_turn.add_theme_stylebox_override("pressed", sb_pressed)

	var sb_disabled = StyleBoxFlat.new()
	sb_disabled.bg_color = Color(0.07, 0.08, 0.11, 0.7)
	sb_disabled.set_border_width_all(1)
	sb_disabled.border_color = Color(0.3, 0.35, 0.4, 0.4)
	sb_disabled.set_corner_radius_all(6)
	btn_map_end_turn.add_theme_stylebox_override("disabled", sb_disabled)

func _sync_map_end_turn_button() -> void:
	if not btn_map_end_turn:
		return
	if btn_end_turn:
		btn_map_end_turn.visible = btn_end_turn.visible
		btn_map_end_turn.disabled = btn_end_turn.disabled
		var t = btn_end_turn.text
		if not t.begins_with("⏭️") and not t.begins_with("⌛"):
			btn_map_end_turn.text = "⏭️ " + t
		else:
			btn_map_end_turn.text = t
		btn_map_end_turn.tooltip_text = btn_end_turn.tooltip_text
	else:
		btn_map_end_turn.visible = (current_phase == "hero_phase" or current_role == "gm")
		btn_map_end_turn.disabled = false
		btn_map_end_turn.text = "⏭️ End Turn"

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

	# Transparent font color if icon is present; if icon is missing, show fallback text so button is never an empty box
	if btn.icon != null:
		btn.add_theme_color_override("font_color", Color(1, 1, 1, 0))
		btn.add_theme_color_override("font_hover_color", Color(1, 1, 1, 0))
		btn.add_theme_color_override("font_pressed_color", Color(1, 1, 1, 0))
		btn.add_theme_color_override("font_disabled_color", Color(1, 1, 1, 0))
		btn.add_theme_color_override("font_focus_color", Color(1, 1, 1, 0))
		btn.add_theme_font_size_override("font_size", 1)
	else:
		btn.add_theme_color_override("font_color", Color(0.9, 0.85, 0.7, 1.0))
		btn.add_theme_color_override("font_hover_color", Color(1.0, 0.95, 0.8, 1.0))
		btn.add_theme_color_override("font_pressed_color", Color(0.8, 0.75, 0.6, 1.0))
		btn.add_theme_color_override("font_disabled_color", Color(0.5, 0.5, 0.55, 0.8))
		btn.add_theme_font_size_override("font_size", 9)

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

	var shield = btn.get_node_or_null("DisabledClickShield") as Control
	if not shield:
		shield = Control.new()
		shield.name = "DisabledClickShield"
		shield.set_anchors_preset(Control.PRESET_FULL_RECT)
		shield.mouse_filter = Control.MOUSE_FILTER_IGNORE
		shield.gui_input.connect(func(ev: InputEvent):
			_on_disabled_action_button_clicked(ev, btn)
		)
		btn.add_child(shield)

func _update_action_tile(btn: Button, icon_key: String, count: int, title: String, desc: String, badge_color: Color = Color(0.88, 0.15, 0.28, 0.92)) -> void:
	if not btn:
		return
	if action_icons.has(icon_key) and action_icons[icon_key] != null:
		btn.icon = action_icons[icon_key]
	elif ResourceLoader.exists("res://assets/icons/action_%s.png" % icon_key):
		btn.icon = load("res://assets/icons/action_%s.png" % icon_key)

	if btn.icon != null:
		btn.add_theme_color_override("font_color", Color(1, 1, 1, 0))
		btn.add_theme_color_override("font_hover_color", Color(1, 1, 1, 0))
		btn.add_theme_color_override("font_pressed_color", Color(1, 1, 1, 0))
		btn.add_theme_color_override("font_disabled_color", Color(1, 1, 1, 0))
		btn.add_theme_color_override("font_focus_color", Color(1, 1, 1, 0))
		btn.add_theme_font_size_override("font_size", 1)
	else:
		btn.add_theme_color_override("font_color", Color(0.9, 0.85, 0.7, 1.0))
		btn.add_theme_color_override("font_hover_color", Color(1.0, 0.95, 0.8, 1.0))
		btn.add_theme_color_override("font_pressed_color", Color(0.8, 0.75, 0.6, 1.0))
		btn.add_theme_color_override("font_disabled_color", Color(0.5, 0.5, 0.55, 0.8))
		btn.add_theme_font_size_override("font_size", 9)

	var badge = btn.get_node_or_null("Badge") as Label
	if badge:
		if count > 0:
			badge.text = str(count)
			badge.visible = true
			var b_sb = badge.get_theme_stylebox("panel") as StyleBoxFlat
			if b_sb:
				b_sb.bg_color = badge_color
		elif btn == btn_armory:
			# Imperial Armory gold box: when 0 gold, display "0" in a muted bronze/gold badge so it never appears empty
			badge.text = "0"
			badge.visible = true
			var b_sb = badge.get_theme_stylebox("panel") as StyleBoxFlat
			if b_sb:
				b_sb.bg_color = Color(0.38, 0.30, 0.16, 0.85)
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

func _setup_unavailable_notice_style() -> void:
	if not unavailable_notice_panel:
		unavailable_notice_panel = get_node_or_null("UI/UnavailableNotice")
	if not unavailable_notice_label:
		unavailable_notice_label = get_node_or_null("UI/UnavailableNotice/Margin/HBox/NoticeLabel")
	if not unavailable_notice_icon:
		unavailable_notice_icon = get_node_or_null("UI/UnavailableNotice/Margin/HBox/Icon")

	if unavailable_notice_panel:
		unavailable_notice_panel.visible = false
		unavailable_notice_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var sb = StyleBoxFlat.new()
		sb.bg_color = Color(0.12, 0.08, 0.02, 0.95)
		sb.border_color = Color(1.0, 0.75, 0.2, 0.95)
		sb.set_border_width_all(2)
		sb.set_corner_radius_all(8)
		sb.shadow_color = Color(1.0, 0.65, 0.1, 0.4)
		sb.shadow_size = 6
		unavailable_notice_panel.add_theme_stylebox_override("panel", sb)

	if unavailable_notice_label:
		unavailable_notice_label.add_theme_font_size_override("font_size", 14)
		unavailable_notice_label.add_theme_color_override("font_color", Color(1.0, 0.92, 0.45, 1.0))

	if unavailable_notice_icon:
		unavailable_notice_icon.text = "⚠️"
		unavailable_notice_icon.add_theme_font_size_override("font_size", 16)

func show_unavailable_notice(notice_text: String, tile: Vector2i = Vector2i(-1, -1), custom_pos: Vector2 = Vector2.ZERO) -> void:
	unavailable_notice_text = notice_text
	unavailable_notice_timer = unavailable_notice_duration

	if unavailable_notice_panel:
		unavailable_notice_panel.visible = true
		unavailable_notice_panel.modulate.a = 1.0
	if unavailable_notice_label:
		unavailable_notice_label.text = notice_text

	var f_pos = Vector2.ZERO
	if custom_pos != Vector2.ZERO:
		f_pos = custom_pos
	elif tile != Vector2i(-1, -1):
		f_pos = board_offset + Vector2((tile.x + 0.5) * tile_size, (tile.y + 0.5) * tile_size)
	else:
		var hero = get_active_hero()
		if not hero.is_empty():
			var h_pos: Vector2i = hero.get("grid_pos", Vector2i(1, 1))
			f_pos = board_offset + Vector2((h_pos.x + 0.5) * tile_size, (h_pos.y + 0.5) * tile_size)
		else:
			f_pos = Vector2(700, 300)

	var ft = {
		"text": notice_text,
		"pos": f_pos - Vector2(0, 15),
		"vel": Vector2(0, -12),
		"time": 0.0,
		"duration": 2.5,
		"hold_duration": 2.0,
		"alpha": 1.0,
		"color": Color(1.0, 0.8, 0.2),
		"is_unavailable": true
	}
	floating_texts.append(ft)
	_log("[NOTICE] ⚠️ %s" % notice_text)
	queue_redraw_all()

func _get_button_unavailable_reason(btn: Button) -> String:
	if not btn:
		return ""
	var hero = get_active_hero()
	if btn == btn_roll:
		if movement_closed or (moved_before_action and has_acted_this_turn):
			return "Not enough movement"
		if movement_rolled and movement_remaining <= 0:
			return "Not enough movement"
		if movement_rolled and movement_remaining > 0:
			return "Movement already rolled"
		return "Movement unavailable"
	elif btn == btn_attack:
		if has_acted_this_turn:
			return "Not enough actions"
		return "No targets in range"
	elif btn == btn_cast_spell:
		if has_acted_this_turn or movement_closed or (moved_before_action and has_acted_this_turn):
			return "Not enough actions"
		if hero.get("spells", []).size() == 0:
			return "No spells available"
		if _get_available_spells(hero).size() == 0:
			return "All spells exhausted this quest"
		return "Not enough actions"
	elif btn == btn_use_item:
		if hero.get("inventory", []).size() == 0:
			return "No items in inventory"
		return "No items available"
	elif btn == btn_search:
		if has_acted_this_turn:
			return "Not enough actions"
		return _get_search_unavailable_reason()
	elif btn == btn_search_traps:
		if has_acted_this_turn:
			return "Not enough actions"
		if not can_search_for_traps():
			return "Monsters present in room"
		return "Cannot search for traps"
	elif btn == btn_disarm_trap:
		if has_acted_this_turn:
			return "Not enough actions"
		var adj_traps = get_adjacent_detected_traps()
		if adj_traps.is_empty():
			return "No adjacent detected trap"
		var disarm_check = can_hero_disarm(hero)
		if not disarm_check.get("can_disarm", false):
			return "Tool Kit required to disarm"
		return "Cannot disarm trap"
	elif btn == btn_armory:
		if get_total_party_gold() <= 0:
			return "Party has no gold"
		return "Armory unavailable"
	elif btn == btn_end_turn or btn == btn_map_end_turn:
		return "Cannot end turn"
	return "Action unavailable"

func _get_search_unavailable_reason() -> String:
	var hero = get_active_hero()
	if hero.is_empty():
		return "No active hero"
	var h_pos = hero.get("grid_pos", Vector2i(-1, -1))
	var h_room = _get_room_at(h_pos)
	var r_id = str(h_room.get("id", "")) if not h_room.is_empty() else ""
	if r_id == "":
		return "Cannot search in corridor"
	for m in monsters:
		if bool(m.get("is_alive", true)) and int(m.get("current_bp", 1)) > 0:
			var m_pos = _to_grid_pos(m.get("grid_pos", Vector2i(-1, -1)))
			var m_room = str(_get_room_at(m_pos).get("id", ""))
			var m_room_id = str(m.get("roomId", ""))
			if (m_room != "" and m_room == r_id) or (m_room_id != "" and m_room_id == r_id):
				return "Monsters present in room"
	var hero_id = str(hero.get("id", ""))
	var room_searches: Array = searched_rooms.get(r_id, [])
	if hero_id in room_searches or room_searches.size() >= 4:
		return "Room already searched"
	return "Cannot search room"

func _sync_disabled_click_shields() -> void:
	var btns = [btn_roll, btn_attack, btn_cast_spell, btn_use_item, btn_search, btn_end_turn, btn_summon, btn_ai_step, btn_search_traps, btn_disarm_trap, btn_armory, btn_map_end_turn]
	for btn in btns:
		if not btn:
			continue
		var shield = btn.get_node_or_null("DisabledClickShield") as Control
		if shield:
			shield.mouse_filter = Control.MOUSE_FILTER_STOP if btn.disabled else Control.MOUSE_FILTER_IGNORE

func _on_disabled_action_button_clicked(event: InputEvent, btn: Button) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		var reason = _get_button_unavailable_reason(btn)
		if reason != "":
			show_unavailable_notice(reason, Vector2i(-1, -1), btn.global_position + btn.size * 0.5)

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

func _load_furniture_textures() -> void:
	var furn_map = {
		"altar": "res://assets/furniture/altar.png",
		"table": "res://assets/furniture/table.png",
		"bookcase": "res://assets/furniture/bookcase.png",
		"bookshelf": "res://assets/furniture/bookshelf.png",
		"tomb": "res://assets/furniture/tomb.png",
		"chest": "res://assets/furniture/chest.png",
		"cupboard": "res://assets/furniture/cupboard.png",
		"weapons-rack": "res://assets/furniture/weapons_rack.png",
		"rack": "res://assets/furniture/weapons_rack.png",
		"fireplace": "res://assets/furniture/fireplace.png",
		"throne": "res://assets/furniture/throne.png",
		"torture-rack": "res://assets/furniture/torture_rack.png",
		"alchemists-bench": "res://assets/furniture/alchemists_bench.png"
	}
	for k in furn_map:
		if not furniture_textures.has(k) or furniture_textures[k] == null:
			var tex = _load_texture_safe(furn_map[k])
			if tex:
				furniture_textures[k] = tex

func _load_tile_textures() -> void:
	var tile_map = {
		"wall_block": "res://assets/tiles/wall_block.png",
		"stairs": "res://assets/tiles/stairs.png",
		"stair": "res://assets/tiles/stairs.png",
		"starting_stairs": "res://assets/tiles/stairs.png",
		"pit": "res://assets/tiles/trap_pit.png",
		"trap_pit": "res://assets/tiles/trap_pit.png",
		"spear": "res://assets/tiles/trap_spear.png",
		"trap_spear": "res://assets/tiles/trap_spear.png",
		"falling-block": "res://assets/tiles/trap_falling_block.png",
		"falling_block": "res://assets/tiles/trap_falling_block.png",
		"trap_falling_block": "res://assets/tiles/trap_falling_block.png",
		"boulder": "res://assets/tiles/boulder.png"
	}
	for k in tile_map:
		if not tile_textures.has(k) or tile_textures[k] == null:
			var tex = _load_texture_safe(tile_map[k])
			if tex:
				tile_textures[k] = tex

func get_furniture_texture(f_type: String) -> Texture2D:
	var clean = f_type.to_lower().strip_edges()
	if clean.begins_with("furn-") or clean.begins_with("furniture-"):
		clean = clean.split("-")[1]
	if furniture_textures.has(clean) and furniture_textures[clean] != null:
		return furniture_textures[clean]
	for k in furniture_textures:
		if k in clean or clean in k:
			return furniture_textures[k]
	var tile_fallback = get_tile_texture(clean)
	if tile_fallback:
		return tile_fallback
	return null

func get_tile_texture(t_type: String) -> Texture2D:
	var clean = t_type.to_lower().strip_edges()
	if tile_textures.has(clean) and tile_textures[clean] != null:
		return tile_textures[clean]
	if "spear" in clean:
		return tile_textures.get("spear")
	if "pit" in clean:
		return tile_textures.get("pit")
	if "falling" in clean:
		return tile_textures.get("falling-block")
	if "boulder" in clean or "rock" in clean:
		return tile_textures.get("boulder")
	if "stair" in clean:
		return tile_textures.get("stairs")
	if "wall" in clean:
		return tile_textures.get("wall_block")
	for k in tile_textures:
		if k in clean or clean in k:
			return tile_textures[k]
	return null

func _load_texture_safe(res_path: String) -> Texture2D:
	if ResourceLoader.exists(res_path):
		var res = ResourceLoader.load(res_path)
		if res is Texture2D:
			return res
	var global_path = ProjectSettings.globalize_path(res_path)
	var paths_to_try = [global_path, res_path]
	for p in paths_to_try:
		if FileAccess.file_exists(p):
			var img = Image.new()
			var err = img.load(p)
			if err == OK and not img.is_empty():
				var tex = ImageTexture.create_from_image(img)
				tex.take_over_path(res_path)
				return tex
			var f = FileAccess.open(p, FileAccess.READ)
			if f:
				var buf = f.get_buffer(f.get_length())
				f.close()
				if buf.size() > 8:
					if buf[0] == 0x89 and buf[1] == 0x50: # PNG magic
						if img.load_png_from_buffer(buf) == OK:
							var tex = ImageTexture.create_from_image(img)
							tex.take_over_path(res_path)
							return tex
					elif buf[0] == 0xFF and buf[1] == 0xD8: # JPEG magic
						if img.load_jpg_from_buffer(buf) == OK:
							var tex = ImageTexture.create_from_image(img)
							tex.take_over_path(res_path)
							return tex
	return null

func get_hero_card_bg_texture(hero_id: String) -> Texture2D:
	var clean_id = hero_id.to_lower().strip_edges()
	if "barbarian" in clean_id:
		clean_id = "barbarian"
	elif "dwarf" in clean_id:
		clean_id = "dwarf"
	elif "elf" in clean_id:
		clean_id = "elf"
	elif "wizard" in clean_id:
		clean_id = "wizard"

	if _hero_card_bg_cache.has(clean_id) and _hero_card_bg_cache[clean_id] != null:
		return _hero_card_bg_cache[clean_id]
	var path = "res://assets/hero_cards/card_bg_%s.png" % clean_id
	var tex = _load_texture_safe(path)
	if tex:
		_hero_card_bg_cache[clean_id] = tex
		return tex
	return null

func get_monster_card_bg_texture(m_or_id) -> Texture2D:
	var clean_key = ""
	if m_or_id is Dictionary:
		clean_key = get_monster_token_key(m_or_id)
	elif m_or_id is String:
		var dummy = {"id": m_or_id, "slug": m_or_id, "name": m_or_id}
		clean_key = get_monster_token_key(dummy)
		if clean_key == "":
			clean_key = m_or_id.to_lower().strip_edges()

	if clean_key.is_empty():
		clean_key = "orc"

	if _monster_card_bg_cache.has(clean_key) and _monster_card_bg_cache[clean_key] != null:
		return _monster_card_bg_cache[clean_key]

	var path = "res://assets/monster_cards/card_bg_%s.png" % clean_key
	var tex = _load_texture_safe(path)
	if tex:
		_monster_card_bg_cache[clean_key] = tex
		return tex
	return null

func get_monster_lore(m: Dictionary) -> Dictionary:
	var key = get_monster_token_key(m)
	var m_name = str(m.get("name", "Monster"))
	var is_boss = bool(m.get("isBoss", false)) or key == "verag"

	match key:
		"goblin":
			return {
				"title": "Goblin Skirmisher",
				"subtitle": "Subterranean Scavenger & Scimitar Ambusher",
				"archetype": "Fast Hit-and-Run Skirmisher",
				"flavor": "[i]\"Small, wiry, and malevolent, Goblins infest the dank corridors of Morcar's subterranean dominions. While lacking the sheer physical mass of their Orcish overseers, Goblins compensate with cruel cunning, swift footwork, and jagged scimitars dipped in subterranean filth. They lurk in dark alcoves and behind moldering masonry, preferring to swarm isolated heroes or strike from behind before scurrying back into the shadows. Their shrill cackles echo through the catacombs as a chilling harbinger of sudden ambush.\"[/i]",
				"tactics": "Boasting a blazing 10-square movement speed, Goblins outpace every hero. They exploit corridor corners and doorways to deliver rapid scimitar strikes before retreating behind beefier frontline monsters.",
				"abilities": [
					{"name": "Scimitar Slash", "desc": "Swift jagged blade attack rolling 2 Combat Dice."},
					{"name": "Dungeon Skulker", "desc": "Exceptional 10-square movement allows rapid repositioning and flanking maneuvers."},
					{"name": "Craven Swarm", "desc": "Deadly when attacking alongside Orcish allies; easily scattered when cornered alone."}
				]
			}
		"orc":
			return {
				"title": "Orc Legionnaire",
				"subtitle": "Brutal Front-Line Soldier of the Dread Vanguard",
				"archetype": "Heavy Melee Brawler",
				"flavor": "[i]\"Bred for slaughter and conquest, Orcs form the savage backbone of Morcar's vanguard. Towering over men with sinewy green-black hides, protruding tusks, and bloodshot eyes burning with hatred for civilized kingdoms, they wield heavy cleaving notched broadswords and iron-studded shields. Orcs revel in the din of melee combat, driving their blades forward with crushing force. Disciplined under dread warlords yet prone to bloodthirsty berserker fury, an Orc guard will hold choke points and dungeon gates to the bitter end.\"[/i]",
				"tactics": "Aggressive room anchor and brawler. Rolls 3 Combat Dice in attack and moves 8 squares, relentlessly pressing melee combat against unarmored heroes.",
				"abilities": [
					{"name": "Cleaving Broadsword", "desc": "Heavy downward strike delivering 3 Combat Dice of slashing damage."},
					{"name": "Brutal Resilience", "desc": "Defends with 2 Combat Dice, absorbing glancing hero strikes with spiked iron vambraces."},
					{"name": "Vanguard Rush", "desc": "Swift 8-square movement allowing quick rushes into line-of-sight."}
				]
			}
		"skeleton":
			return {
				"title": "Crypt Skeleton",
				"subtitle": "Necromantic Thrall & Tireless Bone Guardian",
				"archetype": "Relentless Undead Guardian",
				"flavor": "[i]\"Animated by the fell necromancy of Morcar, Skeletons are the restless remains of ancient dungeon defenders and fallen warriors bound into eternal servitude. Clattering through dusty crypts and cobwebbed sepulchers with hollow eye sockets burning with cold spectral balefire, they feel neither fear, pain, fatigue, nor mercy. Their rusted iron blades and cracked wooden shields strike with mechanical precision. Skeletons cannot be influenced by mortal terror or mental charms, marching endlessly until their bones are pulverized into dust.\"[/i]",
				"tactics": "Tireless crypt guardian. Immune to mind-affecting magic, sleep, and psychological fear; defends tombs with stubborn precision.",
				"abilities": [
					{"name": "Rusted Broadsword", "desc": "Methodical necromantic strike rolling 2 Combat Dice."},
					{"name": "Mindless Undead", "desc": "Possesses 0 Mind Points; immune to Sleep, Fear, and psychic enchantments."},
					{"name": "Bone Phalanx", "desc": "Defends with 2 Combat Dice; piercing weapons glance off hollow ribcages."}
				]
			}
		"zombie":
			return {
				"title": "Cellar Zombie",
				"subtitle": "Shambling Dread Corpse & Meat Shield",
				"archetype": "Resilient Damage Sponge",
				"flavor": "[i]\"Slow, rotting, and horribly inexorable, Zombies are corpses reanimated by Morcar's dark dread magic before their earthly flesh could decay. Shambling forward through stagnant dungeon mire with outstretched rotting claws, they emit a sickening stench of putrefaction and grave-dust. Though ponderous and slow to react, their desiccated muscles and numbness to physical trauma make them surprisingly difficult to strike down. A single zombie can absorb punishing blows while anchoring heroes in narrow passages, allowing faster horrors to encircle them.\"[/i]",
				"tactics": "Heavy roadblock. Rolls 3 Defend Dice, allowing it to tie up heroes in doorways and protect vulnerable casters despite slow 4-square movement.",
				"abilities": [
					{"name": "Putrid Grasp", "desc": "Rotting claw strike delivering 2 Combat Dice with crushing force."},
					{"name": "Desiccated Flesh", "desc": "Rolls 3 Defend Dice; decaying sinew dampens weapon impacts."},
					{"name": "Undead Terror", "desc": "0 Mind Points; immune to Sleep, morale breaks, and mental sorcery."}
				]
			}
		"mummy":
			return {
				"title": "Ancient Mummy",
				"subtitle": "Embalmed Dread Guardian & Tomb Pharaoh",
				"archetype": "Elite Undead Tank",
				"flavor": "[i]\"Preserved for millennia in foul alchemical natron and inscribed funerary bandages, Mummies are dread guardians consecrated to protect Morcar's deepest subterranean vaults and forgotten tomb sanctums. Ancient dark curses pulse within their desiccated hearts, granting them unnatural supernatural endurance and terrifying physical strength. Wrapped in brittle funerary linen marked with glyphs of Doom, a Mummy strides forward relentlessly, crushing armor and bone with petrified fists that carry the ancient rot of forgotten pharaohs.\"[/i]",
				"tactics": "Devastating elite juggernaut. 3 Attack Dice, 4 Defend Dice, and 2 Body Points make the Mummy an immense physical threat that demands ranged spells or focused party attacks.",
				"abilities": [
					{"name": "Tomb Smite", "desc": "Devastating slam from embalmed stone-hard fists rolling 3 Combat Dice."},
					{"name": "Alchemical Wrappings", "desc": "Resin-hardened funerary linen deflects steel, granting 4 Defend Dice."},
					{"name": "Dread Vitality", "desc": "Boasts 2 Body Points; survives mortal killing blows."},
					{"name": "Curse of the Crypt", "desc": "Immune to Sleep and psychic spells; strikes fear into living hearts."}
				]
			}
		"fimir":
			return {
				"title": "Fimir Bog-Beast",
				"subtitle": "Cyclopean Amphibian Brute & Dark Sorcerer",
				"archetype": "Amphibious Shock-Trooper",
				"flavor": "[i]\"Lurking in the stagnant, mist-shrouded subterranean waterways and flooded dungeons of the Old World, the Fimir are monstrous, cyclopean amphibian brutes. Possessing a single, baleful yellow eye that pierces magical darkness, impenetrable leathery scales, and a muscular mace-tipped tail capable of shattering stone, the Fimir are savage yet intelligent shock troops of Chaos. They wield massive bone-hewn battleaxes and harbor ancient knowledge of swamp witchcraft, making them both physically lethal and cunningly elusive foes.\"[/i]",
				"tactics": "Formidable dual threat. 3 Attack Dice, 3 Defend Dice, 2 Body Points, and 3 Mind Points allow it to shrug off magical disruption while crushing heroes with heavy axe swings.",
				"abilities": [
					{"name": "Bone Battleaxe", "desc": "Massive two-handed cleave rolling 3 Combat Dice."},
					{"name": "Mace Tail Swipe", "desc": "Barbed tail sweeps away flankers, contributing to 3 Defend Dice."},
					{"name": "Cyclopean Gaze", "desc": "3 Mind Points resist arcane sleep and mental charms."},
					{"name": "Swamp Predator", "desc": "Navigates murky dungeon water and obstacles without penalty."}
				]
			}
		"chaos_warrior":
			return {
				"title": "Chaos Warrior",
				"subtitle": "Black-Iron Champion of Dread & Chaos Runemaster",
				"archetype": "Apex Dread Champion",
				"flavor": "[i]\"Clad head-to-toe in unholy obsidian plate armor fused directly to flesh and bone, Chaos Warriors are mortal champions who have traded their souls to Morcar and the Dark Gods in exchange for terrifying martial perfection. Their dark dread armor deflects tempered steel with ease, while ornate horned greathelms hide faces twisted by centuries of unholy slaughter. Wielding runic dread halberds and bastard swords crackling with corrupted sorcery, they march into battle with disciplined, implacable fury. A lone Chaos Warrior can rout an entire squad of lesser heroes.\"[/i]",
				"tactics": "Apex melee powerhouse. 4 Attack Dice, 4 Defend Dice, and 3 Body Points. Demands tactical kiting, heavy spells, and coordinated focus fire.",
				"abilities": [
					{"name": "Runic Halberd", "desc": "Dark-infused polearm strike dealing 4 Combat Dice of lethal damage."},
					{"name": "Obsidian Dreadplate", "desc": "Unholy Chaos-forged plate mail rolling 4 Defend Dice."},
					{"name": "Ironclad Resolve", "desc": "3 Body Points and 3 Mind Points ensure supreme combat endurance."},
					{"name": "Aura of Dread", "desc": "Intimidating presence unnerves heroes in adjacent tiles."}
				]
			}
		"gargoyle":
			return {
				"title": "Stone Gargoyle",
				"subtitle": "Petrified Demon Prince & Guardian of the Catacombs",
				"archetype": "Boss-Tier Dungeon Predator",
				"flavor": "[i]\"Carved from enchanted living granite and infused with demonic blood by ancient sorcerers, the Gargoyle is the supreme guardian of Morcar's deepest strongholds. By day or in dormancy, it perches motionless upon dungeon plinths and vaulted archways, masquerading as ornate architecture. When trespassers enter its sanctum, its stony skin flexes, leathery wings snap outward with a roar of cracking bedrock, and its eyes ignite with hellfire. Striking with razor-sharp granite claws and sweeping barbed wings, the Gargoyle is the pinnacle of dungeon terror.\"[/i]",
				"tactics": "Highest defense in the game. 4 Attack Dice, 5 Defend Dice, 3 Body Points, and 4 Mind Points. Can absorb relentless punishment while threatening instant hero incapacitation.",
				"abilities": [
					{"name": "Granite Talons", "desc": "Razor stone claws tearing armor and flesh for 4 Combat Dice."},
					{"name": "Living Stone Hide", "desc": "Nearly impenetrable granite exterior rolling 5 Defend Dice."},
					{"name": "Demonic Wings", "desc": "Enormous bat wings grant superior battlefield repositioning."},
					{"name": "Arch-Demonic Will", "desc": "4 Mind Points; effortlessly resists elemental spells and enchantments."}
				]
			}
		"verag", _:
			return {
				"title": "Verag the Orc Warlord" if is_boss else m_name,
				"subtitle": "Chieftain of the Black Fang & Warlord of Morcar's Vanguard",
				"archetype": "Quest 1 Final Boss & Spellcaster",
				"flavor": "[i]\"Supreme chieftain of the subterranean hordes occupying the catacombs of the Trial, Verag is a legendary Orc Warlord of towering stature and vicious tactical intellect. Covered in ritual scars, draped in the skulls of fallen imperial champions, and wielding the Dread Greatsword 'Soulcleaver' crackling with dark lightning, Verag has slaughtered dozens of foolish adventuring parties sent by the Emperor. In combat, he bellows thunderous battle cries that bolster nearby minions while channeling destructive Dread Spells to incinerate his foes.\"[/i]",
				"tactics": "Quest 1 Final Boss. 4 Attack Dice, 4 Defend Dice, 4 Body Points, 8 Movement Squares, and wields devastating Dread Spells (Lightning Bolt and Fear).",
				"abilities": [
					{"name": "Soulcleaver Strike", "desc": "Enormous dread greatsword sweep rolling 4 Combat Dice."},
					{"name": "Warlord Dreadplate", "desc": "Heavy spiked armor and seasoned battle instincts rolling 4 Defend Dice."},
					{"name": "Dread Spellcasting", "desc": "Harnesses dark sorcery to cast Lightning Bolt and Fear."},
					{"name": "Warlord's Rally", "desc": "Commands the catacomb hordes with 4 Body Points and 8 movement squares."}
				]
			}

func get_ai_icon_texture(category: String, id_name: String) -> Texture2D:
	var raw_id = id_name.to_lower().strip_edges()
	if raw_id.contains(":"):
		raw_id = raw_id.split(":")[-1]
	if raw_id.begins_with("weapon_") or raw_id.begins_with("armor_") or raw_id.begins_with("item_") or raw_id.begins_with("spell_"):
		raw_id = raw_id.substr(raw_id.find("_") + 1)
	if "(" in raw_id:
		raw_id = raw_id.split("(")[0].strip_edges()
	var clean_id = raw_id.replace(" ", "_").replace("-", "_")

	var key = "%s:%s" % [category.to_lower(), clean_id]
	if _ai_icon_cache.has(key) and _ai_icon_cache[key] != null:
		return _ai_icon_cache[key]

	# Auto-detect category if clean_id represents a known weapon, armor, spell, potion, or tool
	var cat = category.to_lower().strip_edges()
	if cat in ["", "item", "items", "gear", "inventory", "equipment", "potions", "potion", "consumable", "ability"]:
		if "broadsword" in clean_id or "shortsword" in clean_id or "battle_axe" in clean_id or "crossbow" in clean_id or "dagger" in clean_id or "staff" in clean_id or clean_id in ["sword", "axe", "bow", "blade"]:
			cat = "weapon"
		elif "shield" in clean_id or "helmet" in clean_id or "helm" in clean_id or "chain_mail" in clean_id or "chainmail" in clean_id or "plate_mail" in clean_id or "platemail" in clean_id:
			cat = "armor"
		elif "flame" in clean_id or "fire" in clean_id or "courage" in clean_id or "rock_skin" in clean_id or "heal_body" in clean_id or "pass_through_rock" in clean_id or "water_of_healing" in clean_id or "sleep" in clean_id or "veil_of_mist" in clean_id or "genie" in clean_id or "swift_wind" in clean_id or "tempest" in clean_id:
			cat = "spell"

	var file_name = ""
	match cat:
		"weapon":
			if "shortsword" in clean_id or "short_sword" in clean_id:
				file_name = "weapon_shortsword.png"
			elif "broadsword" in clean_id or "greatsword" in clean_id or "longsword" in clean_id or "blade" in clean_id or "sword" in clean_id:
				file_name = "weapon_broadsword.png"
			elif "battle_axe" in clean_id or "greataxe" in clean_id or "axe" in clean_id:
				file_name = "weapon_battle_axe.png"
			elif "crossbow" in clean_id or "bow" in clean_id:
				file_name = "weapon_crossbow.png"
			elif "dagger" in clean_id or "knife" in clean_id:
				file_name = "weapon_dagger.png"
			elif "staff" in clean_id or "quarterstaff" in clean_id or "wand" in clean_id:
				file_name = "weapon_staff.png"
			else:
				file_name = "weapon_broadsword.png"
		"armor":
			if "shield" in clean_id:
				file_name = "armor_shield.png"
			elif "helmet" in clean_id or "helm" in clean_id:
				file_name = "armor_helmet.png"
			elif "chain_mail" in clean_id or "chainmail" in clean_id or "ring_mail" in clean_id or "chain_shirt" in clean_id:
				file_name = "armor_chain_mail.png"
			elif "plate_mail" in clean_id or "platemail" in clean_id or "plate_armor" in clean_id or "breastplate" in clean_id:
				file_name = "armor_plate_mail.png"
			else:
				file_name = "armor_shield.png"
		"spell":
			if "ball_of_flame" in clean_id or "fireball" in clean_id:
				file_name = "spell_ball_of_flame.png"
			elif "fire_of_wrath" in clean_id or "flame_wrath" in clean_id or "burning_hands" in clean_id:
				file_name = "spell_fire_of_wrath.png"
			elif "courage" in clean_id:
				file_name = "spell_courage.png"
			elif "rock_skin" in clean_id or "stoneskin" in clean_id:
				file_name = "spell_rock_skin.png"
			elif "heal_body" in clean_id or "cure_wounds" in clean_id or "healing_word" in clean_id:
				file_name = "spell_heal_body.png"
			elif "pass_through_rock" in clean_id or "pass_rock" in clean_id:
				file_name = "spell_pass_through_rock.png"
			elif "water_of_healing" in clean_id:
				file_name = "spell_water_of_healing.png"
			elif "sleep" in clean_id:
				file_name = "spell_sleep.png"
			elif "veil_of_mist" in clean_id or "invisibility" in clean_id:
				file_name = "spell_veil_of_mist.png"
			elif "genie" in clean_id:
				file_name = "spell_genie.png"
			elif "swift_wind" in clean_id or "haste" in clean_id:
				file_name = "spell_swift_wind.png"
			elif "tempest" in clean_id or "lightning" in clean_id or "thunderwave" in clean_id or "blizzard" in clean_id:
				file_name = "spell_tempest.png"
			else:
				file_name = "spell_ball_of_flame.png"
		"item", "consumable", "tool", "ability", "gear", "potion", "potions":
			if "strength" in clean_id:
				file_name = "item_potion_of_strength.png"
			elif "speed" in clean_id:
				file_name = "item_potion_of_speed.png"
			elif "tool" in clean_id or "lockpick" in clean_id or "disarm" in clean_id or "trap" in clean_id or "rope" in clean_id:
				file_name = "item_tool_kit.png"
			elif "holy_water" in clean_id:
				file_name = "spell_water_of_healing.png"
			elif "torch" in clean_id:
				file_name = "spell_fire_of_wrath.png"
			elif "potion" in clean_id or "healing" in clean_id or "cure" in clean_id:
				file_name = "item_healing_potion.png"
			elif "shortsword" in clean_id or "short_sword" in clean_id:
				file_name = "weapon_shortsword.png"
			elif "broadsword" in clean_id or "greatsword" in clean_id or "longsword" in clean_id or "blade" in clean_id or "sword" in clean_id:
				file_name = "weapon_broadsword.png"
			elif "battle_axe" in clean_id or "axe" in clean_id:
				file_name = "weapon_battle_axe.png"
			elif "crossbow" in clean_id or "bow" in clean_id:
				file_name = "weapon_crossbow.png"
			elif "dagger" in clean_id or "knife" in clean_id:
				file_name = "weapon_dagger.png"
			elif "staff" in clean_id or "wand" in clean_id:
				file_name = "weapon_staff.png"
			elif "shield" in clean_id:
				file_name = "armor_shield.png"
			elif "helmet" in clean_id or "helm" in clean_id:
				file_name = "armor_helmet.png"
			elif "chain" in clean_id:
				file_name = "armor_chain_mail.png"
			elif "plate" in clean_id:
				file_name = "armor_plate_mail.png"
			else:
				file_name = "item_healing_potion.png"
		_:
			if "shortsword" in clean_id or "short_sword" in clean_id:
				file_name = "weapon_shortsword.png"
			elif "broadsword" in clean_id or "greatsword" in clean_id or "longsword" in clean_id or "blade" in clean_id or "sword" in clean_id:
				file_name = "weapon_broadsword.png"
			elif "battle_axe" in clean_id or "axe" in clean_id:
				file_name = "weapon_battle_axe.png"
			elif "crossbow" in clean_id or "bow" in clean_id:
				file_name = "weapon_crossbow.png"
			elif "dagger" in clean_id or "knife" in clean_id:
				file_name = "weapon_dagger.png"
			elif "staff" in clean_id or "wand" in clean_id:
				file_name = "weapon_staff.png"
			else:
				file_name = "weapon_broadsword.png"

	var path = "res://assets/icons/ai/" + file_name
	var tex = _load_texture_safe(path)
	if tex:
		_ai_icon_cache[key] = tex
		_ai_icon_cache["%s:%s" % [cat, clean_id]] = tex
		_ai_icon_paths[key] = path
		_ai_icon_paths["%s:%s" % [cat, clean_id]] = path
		return tex
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
	var header_hbox = get_node_or_null("UI/SidebarHeader")
	if header_hbox and not header_hbox.has_node("BtnResetQuest"):
		var r_btn = Button.new()
		r_btn.name = "BtnResetQuest"
		r_btn.text = "↺ Reset"
		r_btn.tooltip_text = "Force reload current quest from cartridge (clears saved game)"
		r_btn.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		var r_sb = StyleBoxFlat.new()
		r_sb.bg_color = Color(0.18, 0.08, 0.1, 0.85)
		r_sb.border_color = Color(0.85, 0.35, 0.35, 0.7)
		r_sb.set_border_width_all(1)
		r_sb.set_corner_radius_all(4)
		r_sb.content_margin_left = 6
		r_sb.content_margin_right = 6
		r_sb.content_margin_top = 2
		r_sb.content_margin_bottom = 2
		r_btn.add_theme_stylebox_override("normal", r_sb)
		r_btn.add_theme_color_override("font_color", Color(0.95, 0.65, 0.65, 0.95))
		r_btn.add_theme_font_size_override("font_size", 11)
		r_btn.pressed.connect(func():
			_log("[RESET] Player requested manual quest reset.")
			delete_save_game()
			_load_active_cartridge(true)
		)
		header_hbox.add_child(r_btn)

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
	if btn_map_end_turn and not btn_map_end_turn.pressed.is_connected(end_turn):
		btn_map_end_turn.pressed.connect(end_turn)
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
	if hero_detail_btn_close and not hero_detail_btn_close.pressed.is_connected(close_hero_detail_modal):
		hero_detail_btn_close.pressed.connect(close_hero_detail_modal)
	if hero_detail_btn_close_header and not hero_detail_btn_close_header.pressed.is_connected(close_hero_detail_modal):
		hero_detail_btn_close_header.pressed.connect(close_hero_detail_modal)
	if monster_detail_btn_close and not monster_detail_btn_close.pressed.is_connected(close_monster_detail_modal):
		monster_detail_btn_close.pressed.connect(close_monster_detail_modal)
	if monster_detail_btn_close_header and not monster_detail_btn_close_header.pressed.is_connected(close_monster_detail_modal):
		monster_detail_btn_close_header.pressed.connect(close_monster_detail_modal)
	if btn_armory and not btn_armory.pressed.is_connected(toggle_armory):
		btn_armory.pressed.connect(toggle_armory)
	if btn_armory_close and not btn_armory_close.pressed.is_connected(close_armory):
		btn_armory_close.pressed.connect(close_armory)
	if armory_btn_close_header and not armory_btn_close_header.pressed.is_connected(close_armory):
		armory_btn_close_header.pressed.connect(close_armory)

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


# ==============================================================================
# ROBOS TABLETOP RPG: AUTOSAVE & QUEST RESUME / RESET ENGINE
# ==============================================================================

var _cli_reset_consumed: bool = false
var _is_restoring_state: bool = false

func is_reset_requested() -> bool:
	if _cli_reset_consumed:
		return false
	if OS.get_environment("TABLETOP_RESET") == "1":
		return true
	var cmd_args = OS.get_cmdline_user_args() + OS.get_cmdline_args()
	for a in cmd_args:
		if a == "--reset" or a == "-r" or a == "--force-reload" or a == "--new-game":
			return true
	return false

func get_save_file_path() -> String:
	var env_path = OS.get_environment("TABLETOP_SAVE_PATH")
	if env_path != "":
		return env_path
	var slug = CartridgeManager.current_cartridge_slug
	if slug == "":
		var cart = CartridgeManager.active_cartridge
		slug = str(cart.get("cartridgeId", cart.get("header", {}).get("startingMap", "heroquest-the-trial")))
	if slug == "":
		slug = "heroquest-the-trial"
	return "user://tabletop_autosave_%s.json" % slug.replace("/", "_").replace("\\", "_")

func has_saved_game() -> bool:
	var path = get_save_file_path()
	if not FileAccess.file_exists(path):
		return false
	var f = FileAccess.open(path, FileAccess.READ)
	if not f:
		return false
	var content = f.get_as_text()
	f.close()
	if content.strip_edges() == "":
		return false
	var parsed = JSON.parse_string(content)
	return (parsed is Dictionary and parsed.has("heroes") and parsed.get("heroes", []).size() > 0)

func delete_save_game() -> bool:
	var path = get_save_file_path()
	if FileAccess.file_exists(path):
		var err = DirAccess.remove_absolute(path)
		if err == OK:
			print("[TabletopAutosave] Deleted save file: ", path)
			return true
		else:
			print("[TabletopAutosave] Warning: failed to delete save file: ", path, " (Error code: ", err, ")")
			return false
	return true

func serialize_game_state() -> Dictionary:
	var heroes_save: Array = []
	for h in heroes:
		var hc = h.duplicate(true)
		var gp = h.get("grid_pos", Vector2i(-1, -1))
		if gp is Vector2i:
			hc["grid_pos"] = [gp.x, gp.y]
		elif gp is Array:
			hc["grid_pos"] = gp
		heroes_save.append(hc)

	var monsters_save: Array = []
	for m in monsters:
		var mc = m.duplicate(true)
		var mp = m.get("grid_pos", Vector2i(-1, -1))
		if mp is Vector2i:
			mc["grid_pos"] = [mp.x, mp.y]
		elif mp is Array:
			mc["grid_pos"] = mp
		monsters_save.append(mc)

	var doors_save: Array = []
	for d in doors:
		doors_save.append(d.duplicate(true))

	var traps_save: Array = []
	for tr in traps:
		traps_save.append(tr.duplicate(true))

	var furniture_save: Array = []
	for f in furniture:
		furniture_save.append(f.duplicate(true))

	var story_triggers_save: Array = []
	for st in story_triggers:
		story_triggers_save.append(st.duplicate(true))

	var explored_arr: Array = []
	for t in explored_tiles.keys():
		if t is Vector2i:
			explored_arr.append([t.x, t.y])
		elif t is Array:
			explored_arr.append(t)

	var cart = CartridgeManager.active_cartridge
	var cart_slug = CartridgeManager.current_cartridge_slug
	var starting_map_id = cart.get("header", {}).get("startingMap", "heroquest-the-trial")

	var msp = movement_start_pos
	var msp_arr = [msp.x, msp.y] if msp is Vector2i else [-1, -1]

	var trail_arr: Array = []
	for v in movement_trail:
		trail_arr.append([v.x, v.y])

	var s_alloc = cart.get("spellAllocation", {})

	return {
		"version": 1,
		"timestamp": Time.get_unix_time_from_system(),
		"cartridge_slug": cart_slug,
		"map_id": starting_map_id,
		"current_role": current_role,
		"active_hero_idx": active_hero_idx,
		"current_round": current_round,
		"current_phase": current_phase,
		"movement_remaining": movement_remaining,
		"movement_rolled": movement_rolled,
		"has_acted_this_turn": has_acted_this_turn,
		"has_moved_this_turn": has_moved_this_turn,
		"moved_before_action": moved_before_action,
		"movement_closed": movement_closed,
		"movement_start_pos": msp_arr,
		"movement_trail": trail_arr,
		"turn_state": turn_state,
		"heroes": heroes_save,
		"monsters": monsters_save,
		"doors": doors_save,
		"traps": traps_save,
		"furniture": furniture_save,
		"story_triggers": story_triggers_save,
		"explored_tiles": explored_arr,
		"revealed_rooms": revealed_rooms.duplicate(true),
		"discovered_monster_ids": discovered_monster_ids.duplicate(true),
		"searched_rooms": searched_rooms.duplicate(true),
		"room_special_treasure_collected": room_special_treasure_collected.duplicate(true),
		"treasure_deck": treasure_deck.duplicate(true),
		"treasure_discard": treasure_discard.duplicate(true),
		"spell_allocation": s_alloc.duplicate(true),
		"current_elf_element": current_elf_element
	}

func auto_save_game() -> void:
	if _is_restoring_state:
		return
	if heroes.is_empty():
		return
	var data = serialize_game_state()
	var json_str = JSON.stringify(data, "\t")
	var path = get_save_file_path()
	var f = FileAccess.open(path, FileAccess.WRITE)
	if f:
		f.store_string(json_str)
		f.close()
	else:
		print("[TabletopAutosave] Error opening save file for writing: ", path)

func restore_saved_game(save_dict: Dictionary = {}) -> bool:
	var data = save_dict
	if data.is_empty():
		var path = get_save_file_path()
		if not FileAccess.file_exists(path):
			return false
		var f = FileAccess.open(path, FileAccess.READ)
		if not f:
			return false
		var txt = f.get_as_text()
		f.close()
		var parsed = JSON.parse_string(txt)
		if not (parsed is Dictionary):
			return false
		data = parsed

	if not data.has("heroes") or data.get("heroes", []).is_empty():
		return false

	_is_restoring_state = true
	print("[TabletopAutosave] Restoring game state from save (Round: ", data.get("current_round", 1), ")...")

	# Restore Heroes
	var saved_heroes = data.get("heroes", [])
	if saved_heroes.size() > 0:
		heroes.clear()
		for sh in saved_heroes:
			var h = sh.duplicate(true)
			var gp = sh.get("grid_pos", [0, 0])
			if gp is Array and gp.size() >= 2:
				h["grid_pos"] = Vector2i(int(gp[0]), int(gp[1]))
			elif gp is Vector2i:
				h["grid_pos"] = gp
			else:
				h["grid_pos"] = starting_stair
			heroes.append(h)

	# Restore Monsters
	var saved_monsters = data.get("monsters", [])
	if saved_monsters.size() > 0:
		monsters.clear()
		for sm in saved_monsters:
			var m = sm.duplicate(true)
			var gp = sm.get("grid_pos", [0, 0])
			if gp is Array and gp.size() >= 2:
				m["grid_pos"] = Vector2i(int(gp[0]), int(gp[1]))
			elif gp is Vector2i:
				m["grid_pos"] = gp
			monsters.append(m)

	# Restore Doors
	if data.has("doors"):
		doors.clear()
		for d in data.get("doors", []):
			doors.append(d.duplicate(true))

	# Restore Traps
	if data.has("traps"):
		traps.clear()
		for tr in data.get("traps", []):
			traps.append(tr.duplicate(true))

	# Restore Furniture
	if data.has("furniture"):
		furniture.clear()
		for f in data.get("furniture", []):
			furniture.append(f.duplicate(true))

	# Restore Story Triggers
	if data.has("story_triggers"):
		story_triggers.clear()
		for st in data.get("story_triggers", []):
			story_triggers.append(st.duplicate(true))

	# Rebuild caches with restored entities
	_rebuild_spatial_caches()

	# Restore Explored Tiles & Vision
	if data.has("explored_tiles"):
		explored_tiles.clear()
		for pt in data.get("explored_tiles", []):
			if pt is Array and pt.size() >= 2:
				explored_tiles[Vector2i(int(pt[0]), int(pt[1]))] = true
			elif pt is Vector2i:
				explored_tiles[pt] = true

	if data.has("revealed_rooms"):
		revealed_rooms.clear()
		for r in data.get("revealed_rooms", []):
			revealed_rooms.append(str(r))

	if data.has("discovered_monster_ids"):
		discovered_monster_ids.clear()
		var dmi = data.get("discovered_monster_ids", {})
		if dmi is Dictionary:
			for k in dmi.keys():
				discovered_monster_ids[str(k)] = true
		elif dmi is Array:
			for k in dmi:
				discovered_monster_ids[str(k)] = true

	# Restore Turn State
	current_role = str(data.get("current_role", current_role))
	active_hero_idx = int(data.get("active_hero_idx", active_hero_idx))
	current_round = int(data.get("current_round", current_round))
	current_phase = str(data.get("current_phase", current_phase))
	movement_remaining = int(data.get("movement_remaining", movement_remaining))
	movement_rolled = bool(data.get("movement_rolled", movement_rolled))
	has_acted_this_turn = bool(data.get("has_acted_this_turn", has_acted_this_turn))
	has_moved_this_turn = bool(data.get("has_moved_this_turn", has_moved_this_turn))
	moved_before_action = bool(data.get("moved_before_action", moved_before_action))
	movement_closed = bool(data.get("movement_closed", movement_closed))
	turn_state = str(data.get("turn_state", turn_state))

	var msp = data.get("movement_start_pos", [-1, -1])
	if msp is Array and msp.size() >= 2:
		movement_start_pos = Vector2i(int(msp[0]), int(msp[1]))

	movement_trail.clear()
	for pt in data.get("movement_trail", []):
		if pt is Array and pt.size() >= 2:
			movement_trail.append(Vector2i(int(pt[0]), int(pt[1])))

	# Restore Searched Rooms & Treasure Deck
	if data.has("searched_rooms"):
		searched_rooms = data.get("searched_rooms", {}).duplicate(true)
	if data.has("room_special_treasure_collected"):
		room_special_treasure_collected = data.get("room_special_treasure_collected", {}).duplicate(true)
	if data.has("treasure_deck"):
		treasure_deck.clear()
		for td in data.get("treasure_deck", []):
			if td is Dictionary:
				treasure_deck.append(td.duplicate(true))
	if data.has("treasure_discard"):
		treasure_discard.clear()
		for td in data.get("treasure_discard", []):
			if td is Dictionary:
				treasure_discard.append(td.duplicate(true))

	# Restore Spell Allocation
	if data.has("spell_allocation"):
		var s_alloc = data.get("spell_allocation", {})
		if not CartridgeManager.active_cartridge.is_empty():
			CartridgeManager.active_cartridge["spellAllocation"] = s_alloc.duplicate(true)
		if data.has("current_elf_element"):
			current_elf_element = str(data.get("current_elf_element", ""))
		elif s_alloc.has("elfElement"):
			current_elf_element = str(s_alloc.get("elfElement", ""))

	_is_restoring_state = false

	update_party_vision()
	_update_ui()
	queue_redraw_all()

	var h_act = get_active_hero()
	var h_name = str(h_act.get("name", "Hero"))
	_log("[AUTOSAVE] Restored saved quest state (Round %d, Hero: %s)" % [current_round, h_name])
	return true

func _on_cartridge_inserted(_cart: Dictionary) -> void:
	_load_active_cartridge()

func _load_active_cartridge(force_fresh: bool = false) -> void:
	var cart = CartridgeManager.active_cartridge
	if cart.size() == 0:
		return

	var should_reset = force_fresh or is_reset_requested()
	if should_reset:
		_cli_reset_consumed = true
		delete_save_game()
		_log("[RESET] Force reloading current quest from cartridge...")

	var starting_map_id = cart.get("header", {}).get("startingMap", "heroquest-the-trial")
	var map_data = cart.get("maps", {}).get(starting_map_id, {})
	if map_data.is_empty() and cart.get("maps", {}).size() > 0:
		map_data = cart.get("maps", {}).values()[0]

	grid_cols = map_data.get("width", GRID_COLS)
	grid_rows = map_data.get("height", GRID_ROWS)
	hovered_tile = Vector2i(-1, -1)

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

		h["used_spells"] = []
		h["courage_active"] = false
		h["rock_skin_active"] = false
		h["pass_through_rock_active"] = false
		h["veil_of_mist_active"] = false
		h["swift_wind_active"] = false

		# All heroes start on the board at the spiral staircase and coexist there
		# until their first turn is not skipped.
		h["is_on_board"] = true
		h["grid_pos"] = starting_stair
		h["has_departed_start"] = false
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

	story_triggers.clear()
	active_story_trigger_overlay.clear()
	for st in map_data.get("storyTriggers", []):
		story_triggers.append(st.duplicate(true))

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
	active_trap_overlay = {}
	active_treasure_overlay = {}
	flashing_item.clear()
	pending_flash_item.clear()
	searched_rooms.clear()
	room_special_treasure_collected.clear()
	last_treasure_card = {}
	_initialize_treasure_deck()
	active_dice_animation = {}
	floating_texts.clear()
	turn_player_losses.clear()
	last_player_attack_hit.clear()
	turn_losses_active = false
	log_display_mode = "damage_report"
	active_enemy_turn_monster_id = ""
	is_enemy_turn_waiting = false
	enemy_turn_wait_timer = 0.0
	enemy_turn_stage = "idle"
	enemy_turn_timer = 0.0
	enemy_step_timer = 0.0
	enemy_turn_path.clear()
	enemy_turn_step_index = 0
	enemy_movement_remaining = 0
	enemy_movement_rolled_total = 0
	pending_enemy_turn_monsters.clear()

	# If a saved game exists and not resetting, restore it over the baseline map state
	if not should_reset and has_saved_game():
		if restore_saved_game():
			return

	update_party_vision()
	_update_ui()
	queue_redraw_all()
	_check_start_elf_spell_selection()
	auto_save_game()

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

	_furniture_by_tile.clear()
	for furn in furniture:
		var fx = int(furn.get("x", furn.get("position", [0, 0])[0]))
		var fy = int(furn.get("y", furn.get("position", [0, 0])[1]))
		var fw = int(furn.get("width", furn.get("w", 1)))
		var fh = int(furn.get("height", furn.get("h", 1)))
		var f_type = str(furn.get("type", "chest"))
		if f_type == "altar" and fw == 1 and fh == 1:
			fw = 3; fh = 2
		elif f_type == "bookcase" and fw == 1 and fh == 1:
			fw = 3; fh = 1
		elif (f_type == "bookshelf" or f_type == "cupboard") and fw == 1 and fh == 1:
			fw = 2; fh = 1
		elif f_type == "table" and fw == 1 and fh == 1:
			fw = 3; fh = 2
		elif f_type == "tomb" and fw == 1 and fh == 1:
			fw = 2; fh = 3
		for bx in range(fx, fx + fw):
			for by in range(fy, fy + fh):
				_furniture_by_tile[Vector2i(bx, by)] = furn

	show_defeated_monsters = false
	if enemies_scroll:
		enemies_scroll.scroll_vertical = 0

func get_furniture_at(tile: Vector2i) -> Dictionary:
	return _furniture_by_tile.get(tile, {})

func is_tile_occupied_by_furniture(tile: Vector2i) -> bool:
	return _furniture_by_tile.has(tile)

func is_tile_wall_blocked(tile: Vector2i) -> bool:
	return _blocked_wall_tiles.has(tile)

func is_border_tile(tile: Vector2i) -> bool:
	return tile.x <= 0 or tile.x >= grid_cols - 1 or tile.y <= 0 or tile.y >= grid_rows - 1

func is_edge_tile(tile: Vector2i) -> bool:
	return is_border_tile(tile)

func is_tile_walkable(tile: Vector2i) -> bool:
	if tile.x < 0 or tile.x >= grid_cols or tile.y < 0 or tile.y >= grid_rows:
		return false
	if is_border_tile(tile):
		return false
	if tile == starting_stair:
		return false
	if is_tile_wall_blocked(tile):
		return false
	if is_tile_occupied_by_furniture(tile):
		return false
	return true

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
			# Heroes coexisting at the starting staircase do not block each other
			if tile == starting_stair and not h.get("has_departed_start", false):
				continue
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
	return is_tile_occupied_by_hero(tile, exclude_hero_idx) or is_tile_occupied_by_monster(tile, exclude_monster_id) or is_tile_occupied_by_furniture(tile)

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

	# Out of bounds check
	if from_pos.x < 0 or from_pos.x >= grid_cols or from_pos.y < 0 or from_pos.y >= grid_rows:
		return false
	if to_pos.x < 0 or to_pos.x >= grid_cols or to_pos.y < 0 or to_pos.y >= grid_rows:
		return false

	# Target or source inside an unrevealed room is always occluded
	var from_rm = _tile_to_room_id.get(from_pos, "")
	if from_rm != "" and not revealed_rooms.has(from_rm):
		return false
	var to_rm = _tile_to_room_id.get(to_pos, "")
	if to_rm != "" and not revealed_rooms.has(to_rm):
		return false

	# Source cannot see out from inside a solid wall block
	if _blocked_wall_tiles.has(from_pos):
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
			if explored_tiles.has(tile):
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

func is_tile_revealed(tile: Vector2i) -> bool:
	if is_gm_role():
		return true
	var rm = _get_room_at(tile)
	var rm_id = str(rm.get("id", ""))
	if rm_id != "":
		return revealed_rooms.has(rm_id)
	return explored_tiles.has(tile)

func get_reachable_walk_tiles() -> Array[Vector2i]:
	var result: Array[Vector2i] = []
	if not movement_rolled or movement_remaining <= 0 or movement_closed:
		return result
	if current_phase != "hero_phase":
		return result
	var hero = get_active_hero()
	if hero.is_empty():
		return result
	var start_pos: Vector2i = hero.get("grid_pos", Vector2i(-1, -1))
	if start_pos == Vector2i(-1, -1):
		return result

	var pass_rock = hero.get("pass_through_rock_active", false)
	var veil_mist = hero.get("veil_of_mist_active", false)

	# Breadth-first search queue: items with pos and dist
	var queue: Array[Dictionary] = [{ "pos": start_pos, "dist": 0 }]
	var min_cost: Dictionary = { start_pos: 0 }
	var dirs = [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]

	while queue.size() > 0:
		var item = queue.pop_front()
		var cur: Vector2i = item["pos"]
		var dist: int = item["dist"]

		if dist >= movement_remaining:
			continue

		for d in dirs:
			var nxt = cur + d
			if nxt.x < 0 or nxt.x >= grid_cols or nxt.y < 0 or nxt.y >= grid_rows:
				continue
			# Rule: Edge / border tiles are strictly non-walkable
			if is_border_tile(nxt):
				continue
			# Rule: Starting stair tile cannot be stepped back onto
			if nxt == starting_stair:
				continue

			# Must be within the revealed map
			if not is_tile_revealed(nxt):
				continue

			# Obstacle checks for traversal into nxt
			if not pass_rock:
				if has_wall_between(cur, nxt) or is_tile_wall_blocked(nxt):
					continue
				if is_tile_occupied_by_furniture(nxt):
					continue
				var rm = _get_room_at(nxt)
				var rm_id = str(rm.get("id", ""))
				if rm_id != "" and not revealed_rooms.has(rm_id):
					continue

			if not veil_mist and is_tile_occupied_by_monster(nxt):
				continue

			var next_dist = dist + 1
			if min_cost.has(nxt) and min_cost[nxt] <= next_dist:
				continue

			min_cost[nxt] = next_dist
			queue.append({ "pos": nxt, "dist": next_dist })

	# Filter destination tiles that the hero can end their movement on:
	# Cannot end on the start pos
	# Cannot end on starting stair
	# Cannot end on edge / border tiles
	# Cannot end on another hero (Rule: HeroQuest strictly forbids sharing squares)
	# Cannot end on monster
	# Cannot end on furniture
	# Cannot end on wall block
	for tile in min_cost.keys():
		if tile == start_pos or tile == starting_stair or is_border_tile(tile):
			continue
		if is_tile_occupied_by_hero(tile, active_hero_idx):
			continue
		if is_tile_occupied_by_monster(tile):
			continue
		if is_tile_occupied_by_furniture(tile):
			continue
		if is_tile_wall_blocked(tile):
			continue
		result.append(tile)

	return result

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
				var fade_start = float(ft.get("hold_duration", dur * 0.65))
				if ft["time"] <= fade_start:
					ft["alpha"] = 1.0
				else:
					ft["alpha"] = clampf((dur - ft["time"]) / maxf(0.001, dur - fade_start), 0.0, 1.0)
				remaining_texts.append(ft)
		floating_texts = remaining_texts
		needs_redraw = true

	if damage_events.size() > 0:
		var remaining_evts: Array[Dictionary] = []
		for evt in damage_events:
			evt["time"] = float(evt.get("time", 0.0)) + delta
			if evt["time"] < float(evt.get("duration", 3.5)):
				remaining_evts.append(evt)
		damage_events = remaining_evts
		needs_redraw = true

	if is_enemy_turn_waiting:
		_process_enemy_turn(delta)
		needs_redraw = true

	if not active_trap_overlay.is_empty():
		needs_redraw = true

	if not active_treasure_overlay.is_empty():
		needs_redraw = true

	if not flashing_item.is_empty() and bool(flashing_item.get("active", false)):
		var f_timer = float(flashing_item.get("timer", 0.0)) - delta
		flashing_item["timer"] = f_timer
		if f_timer <= 0.0:
			flashing_item = {}
			_update_ui()
			needs_redraw = true
		else:
			needs_redraw = true

	if not active_dice_animation.is_empty():
		var t = float(active_dice_animation.get("time", 0.0)) + delta
		active_dice_animation["time"] = t
		var roll_dur = float(active_dice_animation.get("roll_duration", 0.8))
		var tot_dur = float(active_dice_animation.get("total_duration", 2.2))
		
		if t >= tot_dur:
			if not active_dice_animation.get("effects_applied", false) and active_dice_animation.has("pending_trap_resolution"):
				active_dice_animation["effects_applied"] = true
				_apply_pending_trap_resolution(active_dice_animation.get("pending_trap_resolution", {}))
			active_dice_animation = {}
		else:
			var progress = clampf(t / roll_dur, 0.0, 1.0)
			var is_settled = (progress >= 1.0)
			active_dice_animation["settled"] = is_settled
			
			if is_settled and not active_dice_animation.get("effects_applied", false) and active_dice_animation.has("pending_trap_resolution"):
				active_dice_animation["effects_applied"] = true
				_apply_pending_trap_resolution(active_dice_animation.get("pending_trap_resolution", {}))
			
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

	if unavailable_notice_timer > 0.0:
		unavailable_notice_timer = maxf(0.0, unavailable_notice_timer - delta)
		if unavailable_notice_panel:
			if unavailable_notice_timer <= 0.0:
				unavailable_notice_panel.visible = false
			else:
				unavailable_notice_panel.visible = true
				if unavailable_notice_timer > 0.5:
					unavailable_notice_panel.modulate.a = 1.0
				else:
					unavailable_notice_panel.modulate.a = clampf(unavailable_notice_timer / 0.5, 0.0, 1.0)

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
				btn_select.text = "Drafted"
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
	if btn_elf_spell_confirm:
		if has_party_gold_for_armory():
			btn_elf_spell_confirm.text = "Confirm Spells & Visit Armory"
		else:
			btn_elf_spell_confirm.text = "Enter the Dungeon"

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
			h["used_spells"] = []
		elif str(h.get("id")) == "wizard":
			h["spells"] = wiz_spells
			h["used_spells"] = []

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
	if has_party_gold_for_armory():
		open_armory()
		res["armory_opened"] = true
	auto_save_game()
	return res

func _on_confirm_spell_modal_pressed() -> void:
	confirm_elf_spell_selection()

func _on_close_spell_modal_pressed() -> void:
	close_elf_spell_selection_modal()
	if has_party_gold_for_armory():
		open_armory()

# ==============================================================================
# HEROQUEST ARMORY & EQUIPMENT SHOP
# ==============================================================================

const ARMORY_CATALOG: Array = [
	{
		"id": "dagger",
		"name": "Dagger",
		"type": "weapon",
		"category": "Weapon",
		"cost": 25,
		"icon": "weapon_dagger",
		"attackDice": 1,
		"effect": "1 Combat Die (Melee or Thrown)",
		"description": "Swift hunting knife. Rolls 1 combat die. Can be used in melee or thrown in line of sight.",
		"allowedHeroes": ["barbarian", "dwarf", "elf", "wizard"]
	},
	{
		"id": "dungeon_torch",
		"name": "Dungeon Torch",
		"type": "gear",
		"category": "Gear",
		"cost": 15,
		"icon": "gear_torch",
		"effect": "Detect hidden traps in room",
		"description": "Illuminates dark recesses. Detects hidden dungeon traps.",
		"allowedHeroes": ["barbarian", "dwarf", "elf", "wizard"]
	},
	{
		"id": "heavy_rope",
		"name": "Heavy Rope",
		"type": "gear",
		"category": "Gear",
		"cost": 25,
		"icon": "gear_rope",
		"effect": "Climb pits & gaps",
		"description": "Stout coiled rope (30 ft) to escape pit traps or scale chasms.",
		"allowedHeroes": ["barbarian", "dwarf", "elf", "wizard"]
	},
	{
		"id": "shield",
		"name": "Shield",
		"type": "armor",
		"category": "Armor",
		"cost": 100,
		"icon": "armor_shield",
		"defendBonus": 1,
		"effect": "+1 Defend Die",
		"description": "Sturdy steel or iron shield. Adds 1 extra combat die in defense. Wizard cannot use.",
		"allowedHeroes": ["barbarian", "dwarf", "elf"]
	},
	{
		"id": "staff",
		"name": "Staff",
		"type": "weapon",
		"category": "Weapon",
		"cost": 100,
		"icon": "weapon_staff",
		"attackDice": 1,
		"diagonal": true,
		"twoHanded": true,
		"effect": "1 Combat Die (Diagonal Melee)",
		"description": "Carved hardwood staff. Rolls 1 combat die and strikes diagonally. Wizard can use.",
		"allowedHeroes": ["barbarian", "dwarf", "elf", "wizard"]
	},
	{
		"id": "potion_of_healing",
		"name": "Potion of Healing",
		"type": "potion",
		"category": "Potion",
		"cost": 100,
		"icon": "item_healing_potion",
		"effect": "Restores up to 4 BP",
		"description": "Magical elixir that restores up to 4 lost Body Points.",
		"allowedHeroes": ["barbarian", "dwarf", "elf", "wizard"]
	},
	{
		"id": "tool_kit",
		"name": "Tool Kit",
		"type": "tool",
		"category": "Tool",
		"cost": 100,
		"icon": "item_tool_kit",
		"effect": "Disarm Traps without Skull",
		"description": "Enables non-Dwarf heroes to disarm discovered traps safely without setting them off.",
		"allowedHeroes": ["barbarian", "dwarf", "elf", "wizard"]
	},
	{
		"id": "helmet",
		"name": "Helmet",
		"type": "armor",
		"category": "Armor",
		"cost": 120,
		"icon": "armor_helmet",
		"defendBonus": 1,
		"effect": "+1 Defend Die",
		"description": "Forged iron helm protecting the head. Adds 1 combat die in defense. Wizard cannot use.",
		"allowedHeroes": ["barbarian", "dwarf", "elf"]
	},
	{
		"id": "shortsword",
		"name": "Shortsword",
		"type": "weapon",
		"category": "Weapon",
		"cost": 150,
		"icon": "weapon_shortsword",
		"attackDice": 2,
		"diagonal": true,
		"effect": "2 Combat Dice (Diagonal Melee)",
		"description": "Swift thrusting short blade. Rolls 2 combat dice and can strike diagonally. Wizard cannot use.",
		"allowedHeroes": ["barbarian", "dwarf", "elf"]
	},
	{
		"id": "broadsword",
		"name": "Broadsword",
		"type": "weapon",
		"category": "Weapon",
		"cost": 250,
		"icon": "weapon_broadsword",
		"attackDice": 3,
		"effect": "3 Combat Dice (Adjacent Melee)",
		"description": "Standard heavy steel blade. Rolls 3 combat dice in adjacent melee combat. Wizard cannot use.",
		"allowedHeroes": ["barbarian", "dwarf", "elf"]
	},
	{
		"id": "crossbow",
		"name": "Crossbow",
		"type": "weapon",
		"category": "Weapon",
		"cost": 350,
		"icon": "weapon_crossbow",
		"attackDice": 3,
		"ranged": true,
		"twoHanded": true,
		"effect": "3 Combat Dice (Ranged LOS)",
		"description": "Deadly missile weapon. Rolls 3 combat dice at any target in line of sight. Cannot shoot adjacent. Wizard cannot use.",
		"allowedHeroes": ["barbarian", "dwarf", "elf"]
	},
	{
		"id": "battle_axe",
		"name": "Battle Axe",
		"type": "weapon",
		"category": "Weapon",
		"cost": 450,
		"icon": "weapon_battle_axe",
		"attackDice": 4,
		"twoHanded": true,
		"effect": "4 Combat Dice (Two-Handed)",
		"description": "Massive two-handed greataxe. Rolls 4 combat dice. Requires two hands (cannot use shield). Wizard cannot use.",
		"allowedHeroes": ["barbarian", "dwarf", "elf"]
	},
	{
		"id": "chain_mail",
		"name": "Chain Mail",
		"type": "armor",
		"category": "Armor",
		"cost": 500,
		"icon": "armor_chain_mail",
		"baseDefendDice": 3,
		"effect": "Sets Base Defense to 3 Dice",
		"description": "Interlocking metal rings. Increases base defense to 3 combat dice. Wizard cannot use.",
		"allowedHeroes": ["barbarian", "dwarf", "elf"]
	},
	{
		"id": "plate_mail",
		"name": "Plate Mail",
		"type": "armor",
		"category": "Armor",
		"cost": 850,
		"icon": "armor_plate_mail",
		"baseDefendDice": 4,
		"movementDice": 1,
		"effect": "Sets Base Defense to 4 Dice (1d6 Movement)",
		"description": "Heavy fitted steel plate armor. Grants 4 combat dice in defense, but slows movement to 1 die. Wizard cannot use.",
		"allowedHeroes": ["barbarian", "dwarf", "elf"]
	}
]

func get_total_party_gold() -> int:
	var tot = 0
	for h in heroes:
		tot += int(h.get("gold", 0))
	return tot

func has_party_gold_for_armory() -> bool:
	return get_total_party_gold() > 0

func _setup_armory_modal() -> void:
	if not armory_card:
		return
	var card_sb = StyleBoxFlat.new()
	card_sb.bg_color = Color(0.08, 0.11, 0.16, 0.98)
	card_sb.set_corner_radius_all(12)
	card_sb.border_width_left = 2
	card_sb.border_width_top = 2
	card_sb.border_width_right = 2
	card_sb.border_width_bottom = 2
	card_sb.border_color = Color(0.92, 0.75, 0.22, 0.9)
	card_sb.shadow_color = Color(0, 0, 0, 0.8)
	card_sb.shadow_size = 24
	armory_card.add_theme_stylebox_override("panel", card_sb)

	if armory_hero_info_banner:
		var inf_sb = StyleBoxFlat.new()
		inf_sb.bg_color = Color(0.05, 0.08, 0.12, 1.0)
		inf_sb.set_corner_radius_all(6)
		inf_sb.border_width_left = 4
		inf_sb.border_color = Color(0.92, 0.75, 0.22, 0.9)
		armory_hero_info_banner.add_theme_stylebox_override("panel", inf_sb)

	if btn_armory_close:
		var btn_sb = StyleBoxFlat.new()
		btn_sb.bg_color = Color(0.08, 0.45, 0.25, 1.0)
		btn_sb.set_corner_radius_all(6)
		btn_sb.border_width_left = 1
		btn_sb.border_width_top = 1
		btn_sb.border_width_right = 1
		btn_sb.border_width_bottom = 1
		btn_sb.border_color = Color(0.2, 0.75, 0.45, 1.0)
		btn_armory_close.add_theme_stylebox_override("normal", btn_sb)
		if not btn_armory_close.pressed.is_connected(close_armory):
			btn_armory_close.pressed.connect(close_armory)

	if armory_btn_close_header:
		if not armory_btn_close_header.pressed.is_connected(close_armory):
			armory_btn_close_header.pressed.connect(close_armory)

func show_armory_modal(hero_id: String = "") -> Dictionary:
	return open_armory(hero_id)

func open_armory(hero_id: String = "") -> Dictionary:
	armory_open = true
	if hero_id != "":
		for h in heroes:
			if str(h.get("id")) == hero_id:
				selected_armory_hero_id = hero_id
				break
	elif selected_armory_hero_id == "":
		var act = get_active_hero()
		selected_armory_hero_id = str(act.get("id", "barbarian"))

	if armory_modal:
		armory_modal.visible = true
		_update_armory_ui()

	_log("[ARMORY] The Imperial Armory is open! Party Treasury: %d Gold Coins. Select gear for your heroes." % get_total_party_gold())
	_update_ui()
	queue_redraw_all()
	return {
		"success": true,
		"armory_open": true,
		"selected_hero": selected_armory_hero_id,
		"party_gold": get_total_party_gold()
	}

func close_armory() -> Dictionary:
	armory_open = false
	if armory_modal:
		armory_modal.visible = false
	_log("[ARMORY] Closed Armory. The party ventures forth into the dungeon!")
	_update_ui()
	queue_redraw_all()
	return {
		"success": true,
		"armory_open": false
	}

func toggle_armory() -> Dictionary:
	if armory_open:
		return close_armory()
	return open_armory()

func select_armory_hero(hero_id: String) -> Dictionary:
	var found = false
	for h in heroes:
		if str(h.get("id")) == hero_id:
			selected_armory_hero_id = hero_id
			found = true
			break
	if not found:
		return { "success": false, "error": "Hero not found: " + hero_id }
	_update_armory_ui()
	return { "success": true, "selected_hero": selected_armory_hero_id }

func _update_armory_ui() -> void:
	if not armory_modal or not armory_modal.visible:
		return

	var tot_gold = get_total_party_gold()
	if armory_party_gold_badge:
		armory_party_gold_badge.text = "PARTY TREASURY: %d GP" % tot_gold

	var sel_hero: Dictionary = {}
	for h in heroes:
		if str(h.get("id")) == selected_armory_hero_id:
			sel_hero = h
			break
	if sel_hero.is_empty() and heroes.size() > 0:
		sel_hero = heroes[0]
		selected_armory_hero_id = str(sel_hero.get("id", "barbarian"))

	# Populate Hero Tabs
	if armory_hero_tabs:
		for c in armory_hero_tabs.get_children():
			armory_hero_tabs.remove_child(c)
			c.queue_free()

		for h in heroes:
			var hid = str(h.get("id", ""))
			var hname = get_hero_character_name(h)
			if hname.is_empty():
				hname = get_hero_display_title(h)
			var hgold = int(h.get("gold", 0))
			var is_sel = (hid == selected_armory_hero_id)

			var btn_tab = Button.new()
			btn_tab.custom_minimum_size = Vector2(160, 36)
			var icon_marker = "[B]"
			if hid == "dwarf": icon_marker = "[D]"
			elif hid == "elf": icon_marker = "[E]"
			elif hid == "wizard": icon_marker = "[W]"

			var tab_sb = StyleBoxFlat.new()
			tab_sb.set_corner_radius_all(6)
			if is_sel:
				tab_sb.bg_color = Color(0.18, 0.25, 0.36, 1.0)
				tab_sb.border_color = Color(1.0, 0.85, 0.2, 1.0)
				tab_sb.set_border_width_all(2)
				btn_tab.text = "%s %s (%d GP)" % [icon_marker, hname, hgold]
			else:
				tab_sb.bg_color = Color(0.1, 0.13, 0.18, 0.9)
				tab_sb.border_color = Color(0.25, 0.32, 0.42, 0.6)
				tab_sb.set_border_width_all(1)
				btn_tab.text = "%s %s (%d GP)" % [icon_marker, hname, hgold]

			btn_tab.add_theme_stylebox_override("normal", tab_sb)
			btn_tab.pressed.connect(func(): select_armory_hero(hid))
			armory_hero_tabs.add_child(btn_tab)

	# Update Selected Hero Banner
	if armory_hero_info_text and not sel_hero.is_empty():
		var hname = get_hero_character_name(sel_hero)
		if hname.is_empty():
			hname = get_hero_display_title(sel_hero)
		var hclass = get_hero_class_name(sel_hero)
		var hgold = int(sel_hero.get("gold", 0))
		var atk_dice = get_hero_attack_dice(sel_hero)
		var def_dice = get_hero_defend_dice(sel_hero)
		var inv_count = sel_hero.get("inventory", []).size()
		armory_hero_info_text.text = "%s (%s) | Treasury: %d GP | ATK: %dd | DEF: %dd | Pack: %d items" % [
			hname, hclass, hgold, atk_dice, def_dice, inv_count
		]

	# Populate Items Grid
	if armory_items_grid:
		for c in armory_items_grid.get_children():
			armory_items_grid.remove_child(c)
			c.queue_free()

		for it in ARMORY_CATALOG:
			var card = _create_armory_item_card(it, sel_hero)
			armory_items_grid.add_child(card)

func _create_armory_item_card(item: Dictionary, hero: Dictionary) -> Control:
	var p = PanelContainer.new()
	p.custom_minimum_size = Vector2(280, 110)
	var card_sb = StyleBoxFlat.new()
	card_sb.bg_color = Color(0.10, 0.13, 0.18, 0.95)
	card_sb.set_corner_radius_all(6)
	card_sb.border_width_left = 1
	card_sb.border_width_top = 1
	card_sb.border_width_right = 1
	card_sb.border_width_bottom = 1
	card_sb.border_color = Color(0.25, 0.35, 0.45, 0.7)
	p.add_theme_stylebox_override("panel", card_sb)

	var margin = MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 10)
	margin.add_theme_constant_override("margin_top", 8)
	margin.add_theme_constant_override("margin_right", 10)
	margin.add_theme_constant_override("margin_bottom", 8)
	p.add_child(margin)

	var vbox = VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 4)
	margin.add_child(vbox)

	# Header: Icon + Name + Cost
	var top_box = HBoxContainer.new()
	top_box.add_theme_constant_override("separation", 6)
	vbox.add_child(top_box)

	var it_type = str(item.get("type", "item"))
	var it_id = str(item.get("id", ""))
	var icon_tex = get_ai_icon_texture(it_type, it_id)
	if icon_tex:
		var icon_rect = TextureRect.new()
		icon_rect.texture = icon_tex
		icon_rect.custom_minimum_size = Vector2(20, 20)
		icon_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		top_box.add_child(icon_rect)

	var lbl_name = Label.new()
	lbl_name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	lbl_name.add_theme_font_size_override("font_size", 13)
	lbl_name.text = str(item.get("name", "Item"))
	top_box.add_child(lbl_name)

	var cost = int(item.get("cost", 0))
	var lbl_cost = Label.new()
	lbl_cost.add_theme_font_size_override("font_size", 12)
	lbl_cost.add_theme_color_override("font_color", Color(1.0, 0.85, 0.2, 1.0))
	lbl_cost.text = "%d GP" % cost
	top_box.add_child(lbl_cost)

	# Effect / Category
	var lbl_effect = Label.new()
	lbl_effect.add_theme_font_size_override("font_size", 11)
	lbl_effect.add_theme_color_override("font_color", Color(0.2, 0.85, 0.95, 1.0))
	lbl_effect.text = "%s • %s" % [item.get("category", "Gear"), item.get("effect", "")]
	vbox.add_child(lbl_effect)

	# Description
	var lbl_desc = Label.new()
	lbl_desc.add_theme_font_size_override("font_size", 10)
	lbl_desc.add_theme_color_override("font_color", Color(0.7, 0.75, 0.82, 0.8))
	lbl_desc.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	lbl_desc.text = item.get("description", "")
	vbox.add_child(lbl_desc)

	# Buy Button & Restrictions
	var btn_buy = Button.new()
	btn_buy.custom_minimum_size = Vector2(0, 26)
	btn_buy.add_theme_font_size_override("font_size", 11)

	var hid = str(hero.get("id", ""))
	var allowed: Array = item.get("allowedHeroes", [])
	var is_allowed = allowed.is_empty() or allowed.has(hid)
	var hero_gold = int(hero.get("gold", 0))
	var can_afford = (hero_gold >= cost)

	var b_sb = StyleBoxFlat.new()
	b_sb.set_corner_radius_all(4)

	if not is_allowed:
		btn_buy.disabled = true
		btn_buy.text = "Class Restricted"
		b_sb.bg_color = Color(0.25, 0.12, 0.12, 0.8)
		b_sb.border_color = Color(0.6, 0.2, 0.2, 0.6)
		b_sb.set_border_width_all(1)
	elif not can_afford:
		btn_buy.disabled = true
		btn_buy.text = "Need %d GP" % (cost - hero_gold)
		b_sb.bg_color = Color(0.18, 0.20, 0.25, 0.6)
		b_sb.border_color = Color(0.3, 0.35, 0.42, 0.5)
		b_sb.set_border_width_all(1)
	else:
		btn_buy.disabled = false
		btn_buy.text = "Buy for %d GP" % cost
		b_sb.bg_color = Color(0.10, 0.45, 0.25, 1.0)
		b_sb.border_color = Color(0.2, 0.8, 0.45, 0.9)
		b_sb.set_border_width_all(1)
		btn_buy.pressed.connect(func(): buy_armory_item(hid, it_id))

	btn_buy.add_theme_stylebox_override("normal", b_sb)
	btn_buy.add_theme_stylebox_override("disabled", b_sb)
	vbox.add_child(btn_buy)

	return p

func _get_armory_item_cards_telemetry() -> Array:
	if not armory_items_grid or not armory_modal or not armory_modal.visible:
		return []
	var res: Array = []
	for card in armory_items_grid.get_children():
		var texts: Array = []
		for lbl in card.find_children("*", "Label", true, false):
			texts.append((lbl as Label).text)
		res.append(texts)
	return res

func buy_armory_item(hero_id: String, item_id: String) -> Dictionary:
	var hero: Dictionary = {}
	for h in heroes:
		if str(h.get("id")) == hero_id:
			hero = h
			break
	if hero.is_empty():
		return { "success": false, "error": "Hero not found: " + hero_id }

	var item_data: Dictionary = {}
	for it in ARMORY_CATALOG:
		if str(it.get("id")).to_lower() == item_id.to_lower():
			item_data = it
			break
	if item_data.is_empty():
		return { "success": false, "error": "Item not found in Armory: " + item_id }

	var cost = int(item_data.get("cost", 0))
	var h_gold = int(hero.get("gold", 0))
	if h_gold < cost:
		return {
			"success": false,
			"error": "Insufficient gold: %s has %d GP but %s costs %d GP" % [
				hero.get("name"), h_gold, item_data.get("name"), cost
			]
		}

	var allowed: Array = item_data.get("allowedHeroes", [])
	if allowed.size() > 0 and not allowed.has(hero_id):
		return {
			"success": false,
			"error": "%s cannot equip %s due to class restrictions!" % [
				hero.get("name"), item_data.get("name")
			]
		}

	# Deduct gold
	hero["gold"] = h_gold - cost

	# Add to inventory
	if not (hero.get("inventory", []) is Array):
		hero["inventory"] = []
	hero["inventory"].append(item_data.get("name", item_id))

	# Auto-equip weapons / armors
	var i_type = str(item_data.get("type", "")).to_lower()
	var it_id = str(item_data.get("id", "")).to_lower()
	if i_type == "weapon":
		hero["equipped_weapon"] = it_id
		hero["weapon"] = it_id
	elif i_type == "armor":
		var armors: Array = hero.get("equipped_armor", [])
		if not (armors is Array):
			armors = []
		if not armors.has(it_id):
			armors.append(it_id)
		hero["equipped_armor"] = armors

	var h_pos = hero.get("grid_pos", Vector2i(1, 1))
	spawn_floating_text(h_pos, "+%s (-%d GP)" % [item_data.get("name").to_upper(), cost], Color(1.0, 0.85, 0.2), 2.2)
	_log("[ARMORY] %s purchased %s for %d Gold! (Remaining: %d Gold)" % [
		hero.get("name"), item_data.get("name"), cost, hero.get("gold")
	])

	_update_ui()
	_update_armory_ui()
	queue_redraw_all()

	return {
		"success": true,
		"heroId": hero_id,
		"itemId": it_id,
		"itemName": item_data.get("name"),
		"cost": cost,
		"remainingGold": hero.get("gold"),
		"inventory": hero.get("inventory"),
		"attackDice": get_hero_attack_dice(hero),
		"defendDice": get_hero_defend_dice(hero)
	}

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

		var is_spent = is_spell_used(hero, spell_id)
		var badge = Label.new()
		if is_spent:
			badge.text = "[EXHAUSTED]"
			badge.add_theme_font_size_override("font_size", 11)
			badge.add_theme_color_override("font_color", Color(0.95, 0.35, 0.35, 1.0))
			csb.bg_color = Color(0.06, 0.07, 0.09, 0.90)
			csb.border_color = Color(0.4, 0.22, 0.28, 0.5)
			card.modulate = Color(0.6, 0.6, 0.65, 0.75)
		else:
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

		if is_spent:
			var no_target = Button.new()
			no_target.text = "Exhausted (Used This Quest)"
			no_target.disabled = true
			no_target.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			btn_row.add_child(no_target)
		elif s_target == "monster":
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
		if bool(m.get("is_alive", true)) and int(m.get("current_bp", 1)) > 0:
			var m_pos = _to_grid_pos(m.get("grid_pos", Vector2i(-1, -1)))
			var m_room = str(_get_room_at(m_pos).get("id", ""))
			var m_room_id = str(m.get("roomId", ""))
			if (m_room != "" and m_room == r_id) or (m_room_id != "" and m_room_id == r_id):
				return false
	var hero_id = str(hero.get("id", ""))
	var room_searches: Array = searched_rooms.get(r_id, [])
	if hero_id in room_searches:
		return false
	if room_searches.size() >= 4:
		return false
	return true

func _input(event: InputEvent) -> void:
	if is_targeting_active():
		if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_RIGHT and event.pressed:
			cancel_targeting()
			get_viewport().set_input_as_handled()
			return
		elif event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
			cancel_targeting()
			get_viewport().set_input_as_handled()
			return
		elif event is InputEventMouseMotion:
			_update_targeting_hover_info(event.position)
			if targeting_cursor:
				targeting_cursor.queue_redraw()
			queue_redraw_all()

	if armory_modal and armory_modal.visible:
		if (event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE):
			close_armory()
			get_viewport().set_input_as_handled()
			return
	if hero_detail_modal and hero_detail_modal.visible:
		if (event is InputEventKey and event.pressed and (event.keycode == KEY_ESCAPE or event.keycode == KEY_SPACE or event.keycode == KEY_ENTER)):
			close_hero_detail_modal()
			get_viewport().set_input_as_handled()
			return
	if monster_detail_modal and monster_detail_modal.visible:
		if (event is InputEventKey and event.pressed and (event.keycode == KEY_ESCAPE or event.keycode == KEY_SPACE or event.keycode == KEY_ENTER)):
			close_monster_detail_modal()
			get_viewport().set_input_as_handled()
			return
	if not active_story_trigger_overlay.is_empty():
		if (event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed) or \
		   (event is InputEventKey and event.pressed and (event.keycode == KEY_SPACE or event.keycode == KEY_ENTER or event.keycode == KEY_KP_ENTER or event.keycode == KEY_ESCAPE)):
			resolve_story_trigger_overlay_click()
			get_viewport().set_input_as_handled()
			return
	if not active_treasure_overlay.is_empty():
		if (event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed) or \
		   (event is InputEventKey and event.pressed and (event.keycode == KEY_SPACE or event.keycode == KEY_ENTER or event.keycode == KEY_KP_ENTER)):
			resolve_treasure_overlay_click()
			get_viewport().set_input_as_handled()
			return
	if not active_trap_overlay.is_empty():
		if (event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed) or \
		   (event is InputEventKey and event.pressed and (event.keycode == KEY_SPACE or event.keycode == KEY_ENTER or event.keycode == KEY_KP_ENTER)):
			resolve_trap_overlay_click()
			get_viewport().set_input_as_handled()
			return
	if is_enemy_turn_waiting:
		if (event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed) or \
		   (event is InputEventKey and event.pressed and (event.keycode == KEY_SPACE or event.keycode == KEY_ENTER or event.keycode == KEY_ESCAPE)):
			skip_enemy_turn_timeout()
			get_viewport().set_input_as_handled()
			return

func _unhandled_input(event: InputEvent) -> void:
	if is_targeting_active():
		if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_RIGHT and event.pressed:
			cancel_targeting()
			get_viewport().set_input_as_handled()
			return
		elif event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
			cancel_targeting()
			get_viewport().set_input_as_handled()
			return

	if not active_story_trigger_overlay.is_empty():
		if (event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed) or \
		   (event is InputEventKey and event.pressed and (event.keycode == KEY_SPACE or event.keycode == KEY_ENTER or event.keycode == KEY_KP_ENTER or event.keycode == KEY_ESCAPE)):
			resolve_story_trigger_overlay_click()
			get_viewport().set_input_as_handled()
			return
	if armory_modal and armory_modal.visible:
		if (event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE):
			close_armory()
			get_viewport().set_input_as_handled()
			return
	if hero_detail_modal and hero_detail_modal.visible:
		if (event is InputEventKey and event.pressed and (event.keycode == KEY_ESCAPE or event.keycode == KEY_SPACE or event.keycode == KEY_ENTER)):
			close_hero_detail_modal()
			get_viewport().set_input_as_handled()
			return
	if monster_detail_modal and monster_detail_modal.visible:
		if (event is InputEventKey and event.pressed and (event.keycode == KEY_ESCAPE or event.keycode == KEY_SPACE or event.keycode == KEY_ENTER)):
			close_monster_detail_modal()
			get_viewport().set_input_as_handled()
			return
	if not active_treasure_overlay.is_empty():
		if (event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed) or \
		   (event is InputEventKey and event.pressed and (event.keycode == KEY_SPACE or event.keycode == KEY_ENTER or event.keycode == KEY_KP_ENTER)):
			resolve_treasure_overlay_click()
			get_viewport().set_input_as_handled()
			return
	if not active_trap_overlay.is_empty():
		if (event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed) or \
		   (event is InputEventKey and event.pressed and (event.keycode == KEY_SPACE or event.keycode == KEY_ENTER or event.keycode == KEY_KP_ENTER)):
			resolve_trap_overlay_click()
			get_viewport().set_input_as_handled()
			return
	if is_enemy_turn_waiting:
		if (event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed) or \
		   (event is InputEventKey and event.pressed and (event.keycode == KEY_SPACE or event.keycode == KEY_ENTER or event.keycode == KEY_ESCAPE)):
			skip_enemy_turn_timeout()
			get_viewport().set_input_as_handled()
			return
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

	if event is InputEventKey and event.pressed and not event.echo and event.keycode == KEY_L:
		toggle_log_display_mode()
		get_viewport().set_input_as_handled()
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

	if event is InputEventMouseMotion:
		var mouse_pos = get_global_mouse_position()
		var local_pos = mouse_pos - board_offset
		var tx = int(floor(local_pos.x / tile_size))
		var ty = int(floor(local_pos.y / tile_size))
		var new_hover = Vector2i(tx, ty) if (tx >= 0 and tx < grid_cols and ty >= 0 and ty < grid_rows) else Vector2i(-1, -1)
		if new_hover != hovered_tile:
			hovered_tile = new_hover
			queue_redraw_all()

	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		var mouse_pos = get_global_mouse_position()
		var local_pos = mouse_pos - board_offset
		var tx = int(floor(local_pos.x / tile_size))
		var ty = int(floor(local_pos.y / tile_size))
		if tx >= 0 and tx < grid_cols and ty >= 0 and ty < grid_rows:
			_handle_tile_click(Vector2i(tx, ty))

func _handle_tile_click(tile: Vector2i) -> void:
	if not active_trap_overlay.is_empty():
		resolve_trap_overlay_click()
		return
	if is_targeting_active():
		resolve_targeting_click(tile)
		return
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
				else:
					show_unavailable_notice("Not enough actions", tile)
				return

	# If clicked on furniture, provide immediate feedback
	if is_tile_occupied_by_furniture(tile):
		var furn = get_furniture_at(tile)
		_log("[MOVE] Square (%d, %d) is blocked by %s! Characters cannot inhabit or move onto furniture." % [
			tile.x, tile.y, furn.get("name", "furniture")
		])
		spawn_floating_text(tile, "FURNITURE BLOCKED!", Color(0.95, 0.6, 0.2), 1.2)
		show_unavailable_notice("Blocked by furniture", tile)
		return

	# If clicked on a wall block tile, provide immediate feedback
	if is_tile_wall_blocked(tile):
		_log("[MOVE] Square (%d, %d) is blocked by solid stone masonry!" % [tile.x, tile.y])
		spawn_floating_text(tile, "WALL BLOCKED!", Color(0.95, 0.4, 0.3), 1.2)
		show_unavailable_notice("Blocked by wall", tile)
		return

	# If clicked on starting stair tile, provide immediate feedback: cannot step back onto start tile
	if tile == starting_stair:
		_log("[MOVE] Square (%d, %d) is the starting staircase! HeroQuest rules strictly forbid stepping back onto the starting tile." % [tile.x, tile.y])
		spawn_floating_text(tile, "START TILE NOT WALKABLE!", Color(0.95, 0.4, 0.3), 1.2)
		show_unavailable_notice("Cannot return to start tile", tile)
		return

	# If clicked on edge tile, provide immediate feedback: edge tiles are not walkable
	if is_border_tile(tile):
		_log("[MOVE] Square (%d, %d) is on the board edge! Edge tiles are not walkable." % [tile.x, tile.y])
		spawn_floating_text(tile, "EDGE TILE NOT WALKABLE!", Color(0.95, 0.4, 0.3), 1.2)
		show_unavailable_notice("Edge tiles not walkable", tile)
		return

	# If haven't rolled movement yet, roll dice first!
	if not movement_rolled:
		if movement_closed or (moved_before_action and has_acted_this_turn):
			show_unavailable_notice("Not enough movement", tile)
			return
		roll_movement_dice()

	# If hero has movement, move to tile
	if movement_remaining > 0:
		move_hero(tile, true)
	else:
		show_unavailable_notice("Not enough movement", tile)

func dismiss_active_dice_roll() -> void:
	if not active_dice_animation.is_empty():
		if not active_dice_animation.get("effects_applied", false) and active_dice_animation.has("pending_trap_resolution"):
			active_dice_animation["effects_applied"] = true
			_apply_pending_trap_resolution(active_dice_animation.get("pending_trap_resolution", {}))
		active_dice_animation = {}
		queue_redraw_all()

func roll_movement_dice() -> Dictionary:
	if movement_closed or (moved_before_action and has_acted_this_turn):
		_log("[RULE] HeroQuest Rule: Movement phase has concluded for this turn!")
		show_unavailable_notice("Not enough movement")
		return {}

	if movement_rolled:
		show_unavailable_notice("Movement already rolled")
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
	auto_save_game()
	return roll

func find_path(start: Vector2i, goal: Vector2i, moving_hero_idx: int = -1) -> Array[Vector2i]:
	if start == goal:
		return [start]
	# Rule: Cannot target starting_stair (starting tile cannot be stepped back onto)
	if goal == starting_stair:
		return []
	# Rule: Edge / border tiles of the map are strictly non-walkable
	if is_border_tile(goal):
		return []
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
			# Rule: Edge / border tiles of the map are strictly non-walkable
			if is_border_tile(nxt):
				continue
			# Rule: Starting stair tile cannot be stepped back onto
			if nxt == starting_stair:
				continue
			if came_from.has(nxt):
				continue
			if not pass_rock:
				if has_wall_between(cur, nxt) or is_tile_wall_blocked(nxt):
					continue
				if is_tile_occupied_by_furniture(nxt):
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

func move_hero(target_pos: Vector2i, is_interactive: bool = false) -> bool:
	var hero = get_active_hero()
	if hero.size() == 0:
		return false

	var curr = hero.get("grid_pos", Vector2i(1, 1))
	if curr == target_pos:
		return true

	# Rule: Cannot step back onto the starting tile
	if target_pos == starting_stair:
		_log("[WARNING] Cannot step back upon the starting stairway! The starting tile is not walkable.")
		show_unavailable_notice("Cannot return to start tile", target_pos)
		return false

	# Rule: Edge / border tiles are strictly non-walkable
	if is_border_tile(target_pos):
		_log("[WARNING] Square (%d, %d) is on the board edge! Edge tiles are not walkable." % [target_pos.x, target_pos.y])
		show_unavailable_notice("Edge tiles not walkable", target_pos)
		return false

	if movement_trail.is_empty():
		movement_start_pos = curr
		movement_trail = [curr]

	# HeroQuest Turn Structure: Movement and Action No-Splitting Rule
	# You cannot split movement before and after an attack/action.
	# If the hero moved before taking an action, any action taken closes movement permanently.
	if movement_closed or (moved_before_action and has_acted_this_turn):
		_log("[RULE] HeroQuest Rule: Movement cannot be split before and after an action! Turn is complete.")
		show_unavailable_notice("Not enough movement", target_pos)
		return false

	# Standard HeroQuest Rule: No Sharing Squares
	if is_tile_occupied(target_pos, active_hero_idx):
		if is_tile_occupied_by_furniture(target_pos):
			var occ_furn = get_furniture_at(target_pos)
			_log("[WARNING] Square (%d, %d) is blocked by %s! HeroQuest rules strictly forbid heroes from inhabiting furniture spaces." % [
				target_pos.x, target_pos.y, occ_furn.get("name", "furniture")
			])
			spawn_floating_text(target_pos, "BLOCKED BY FURNITURE", Color(0.95, 0.6, 0.2), 1.2)
			show_unavailable_notice("Blocked by furniture", target_pos)
			return false
		elif is_tile_occupied_by_hero(target_pos, active_hero_idx):
			var occ_hero = get_hero_at(target_pos)
			_log("[WARNING] Square (%d, %d) is occupied by %s! HeroQuest rules strictly forbid sharing a space." % [
				target_pos.x, target_pos.y, occ_hero.get("name", "another hero")
			])
			show_unavailable_notice("Tile occupied by hero", target_pos)
			return false
		else:
			var occ_monster = get_monster_at(target_pos)
			_log("[WARNING] Square (%d, %d) is occupied by %s! Cannot end movement on monster squares." % [
				target_pos.x, target_pos.y, occ_monster.get("name", "monster")
			])
			show_unavailable_notice("Tile occupied by monster", target_pos)
			return false

	var path = find_path(curr, target_pos, active_hero_idx)
	if path.is_empty():
		_log("[WARNING] Path to (%d, %d) is blocked!" % [target_pos.x, target_pos.y])
		show_unavailable_notice("Tile unreachable", target_pos)
		return false

	var cost = path.size() - 1
	if movement_remaining <= 0:
		_log("[WARNING] No movement remaining this turn!")
		show_unavailable_notice("Not enough movement", target_pos)
		return false
	if cost > movement_remaining:
		_log("[WARNING] Target out of movement range (need %d, have %d)" % [cost, movement_remaining])
		show_unavailable_notice("Not enough movement", target_pos)
		return false

	var final_pos = target_pos
	var actual_cost = cost
	var sprung_trap: Dictionary = {}
	var hit_story_trigger: Dictionary = {}

	# Check each step along the path for traps and ground story triggers
	for step_idx in range(1, path.size()):
		var step_tile = path[step_idx]
		var prev_tile = path[step_idx - 1]

		# 1. Traps along path take priority
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

		# 2. Ground story triggers along path (landing on square OR walking through square)
		var st = _find_ground_story_trigger(step_tile, prev_tile)
		if not st.is_empty():
			hit_story_trigger = st
			final_pos = step_tile
			actual_cost = step_idx
			break

	hero["grid_pos"] = final_pos
	hero["has_departed_start"] = true

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
		_check_and_trigger_out_of_movement_item_flash()

		if is_interactive:
			_setup_trap_sprung_overlay(sprung_trap, hero, final_pos, path, actual_cost, false)
			has_moved_this_turn = true
			if not has_acted_this_turn:
				moved_before_action = true
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
			_update_ui()
			queue_redraw_all()
			return true

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
		_check_and_trigger_out_of_movement_item_flash()

	if hero.get("pass_through_rock_active", false):
		hero["pass_through_rock_active"] = false
		_log("[SPELL] Pass Through Rock fades away as %s materializes in solid space." % hero.get("name"))
	if hero.get("veil_of_mist_active", false):
		hero["veil_of_mist_active"] = false
		_log("[SPELL] The Veil of Mist dissipates from around %s." % hero.get("name"))

	update_party_vision()

	# Trigger ground story event if hit along the path or upon landing
	if not hit_story_trigger.is_empty():
		hit_story_trigger["triggered"] = true
		_setup_story_trigger_overlay(hit_story_trigger, hero)

	_log("[MOVE] %s moved to (%d, %d). Remaining movement: %d" % [
		hero.get("name"), final_pos.x, final_pos.y, movement_remaining
	])
	_update_ui()
	queue_redraw_all()
	auto_save_game()
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
		var los_tr = _find_untriggered_story_trigger("line_of_sight", r_id)
		if not los_tr.is_empty():
			los_tr["triggered"] = true
			_setup_story_trigger_overlay(los_tr, get_active_hero())

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
	auto_save_game()
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
			auto_save_game()
			return uq_res
		var eq_res = equip_item(hid, item_id)
		if item_use_modal and item_use_modal.visible:
			_update_item_use_modal_ui()
		auto_save_game()
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
		_check_and_trigger_out_of_movement_item_flash()
	elif movement_rolled and movement_remaining == 0:
		turn_state = "turn_complete"
		movement_closed = true
		_check_and_trigger_out_of_movement_item_flash()
	else:
		# Action taken first: hero can still roll and/or complete movement phase
		turn_state = "action_taken"
	auto_save_game()

# --- Hero & Monster Combat Resolution ---
func attack_adjacent_monster(monster_id: String = "", weapon_id: String = "") -> Dictionary:
	var hero = get_active_hero()
	if hero.is_empty():
		return { "success": false, "error": "No active hero" }

	if has_acted_this_turn:
		_log("[ERROR] %s has already taken an action this turn!" % hero.get("name", "Hero"))
		show_unavailable_notice("Not enough actions", hero.get("grid_pos", Vector2i(-1, -1)))
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
		show_unavailable_notice("No targets in range", hero.get("grid_pos", Vector2i(-1, -1)))
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
		var is_m_def = int(target_m.get("current_bp", 0)) <= 0
		if is_m_def:
			target_m["is_alive"] = false
			_log("[DEFEATED] %s is DEFEATED!" % target_m.get("name"))
		record_damage_event(
			str(target_m.get("name", "Monster")),
			str(target_m.get("id", "monster")),
			res.wounds,
			int(target_m.get("current_bp", 0)),
			int(target_m.get("bodyPoints", 1)),
			m_pos,
			false,
			is_m_def
		)
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
		record_damage_event(
			str(target_h.get("name", "Hero")),
			str(target_h.get("id", "hero")),
			res.wounds,
			int(target_h.get("current_bp", 0)),
			int(target_h.get("bodyPoints", 8)),
			h_pos,
			true,
			int(target_h.get("current_bp", 0)) <= 0
		)
		var rock_skin_shattered = false
		if target_h.get("rock_skin_active", false):
			target_h["rock_skin_active"] = false
			rock_skin_shattered = true
			_log("[SPELL] The wound shatters %s's Rock Skin spell!" % target_h.get("name"))
			spawn_floating_text(h_pos, "SHATTERED!", Color(0.8, 0.8, 0.8))
		record_player_attack_hit(target_h, monster, res, prev_h_bp, rock_skin_shattered)
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
	auto_save_game()
	return res

# --- HeroQuest Standard Spells System & Quest Exhaustion ---
func is_spell_used(hero: Dictionary, spell_id: String) -> bool:
	if hero.is_empty():
		return false
	var s_clean = spell_id.strip_edges().to_lower().replace("-", "_")
	var used: Array = hero.get("used_spells", [])
	for u in used:
		if str(u).strip_edges().to_lower().replace("-", "_") == s_clean:
			return true
	return false

func mark_spell_used(hero: Dictionary, spell_id: String) -> void:
	if hero.is_empty():
		return
	var s_clean = spell_id.strip_edges().to_lower().replace("-", "_")
	if not hero.has("used_spells") or not (hero["used_spells"] is Array):
		hero["used_spells"] = []
	if not is_spell_used(hero, s_clean):
		hero["used_spells"].append(s_clean)

func _get_available_spells(hero: Dictionary) -> Array:
	if hero.is_empty():
		return []
	var sp: Array = hero.get("spells", [])
	var avail: Array = []
	for s in sp:
		var sid = str(s).strip_edges().to_lower().replace("-", "_")
		if not is_spell_used(hero, sid):
			avail.append(s)
	return avail

func reset_hero_spells(hero: Dictionary) -> void:
	if not hero.is_empty():
		hero["used_spells"] = []

func reset_all_heroes_spells_for_quest() -> void:
	for h in heroes:
		h["used_spells"] = []
	_update_ui()
	queue_redraw_all()

func cast_spell(spell_id: String, target_id: String = "", target_pos: Vector2i = Vector2i(-1, -1), caster_id: String = "") -> Dictionary:
	var hero: Dictionary = {}
	if caster_id != "":
		for h in heroes:
			if str(h.get("id")) == caster_id:
				hero = h
				break
	if hero.is_empty():
		hero = get_active_hero()
	if hero.is_empty():
		return { "success": false, "error": "No active hero to cast spell" }

	if has_acted_this_turn:
		_log("[ACTION] %s has already taken an action this turn!" % hero.get("name", "Hero"))
		show_unavailable_notice("Not enough actions", hero.get("grid_pos", Vector2i(-1, -1)))
		return { "success": false, "error": "Already acted this turn" }

	var spell = HeroQuestSpells.get_spell(spell_id)
	if spell.is_empty():
		return { "success": false, "error": "Unknown spell: " + spell_id }

	var hero_pos = hero.get("grid_pos", Vector2i(-1, -1))
	var hero_screen = board_offset + Vector2((hero_pos.x + 0.5) * tile_size, (hero_pos.y + 0.5) * tile_size)
	var spell_name = str(spell.get("name", spell_id))
	var s_id = str(spell.get("id"))

	if is_spell_used(hero, s_id):
		_log("[SPELL EXHAUSTED] %s has already cast %s this quest! Spells cannot be recast until the quest concludes." % [hero.get("name"), spell_name])
		show_unavailable_notice("Spell exhausted this quest", hero.get("grid_pos", Vector2i(-1, -1)))
		return { "success": false, "error": "Spell '%s' already used this quest" % spell_name }

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
				var is_m_def = int(target_m.get("current_bp", 0)) <= 0
				record_damage_event(
					str(target_m.get("name", "Monster")),
					str(target_m.get("id", "monster")),
					wounds,
					int(target_m.get("current_bp", 0)),
					int(target_m.get("bodyPoints", 1)),
					m_pos,
					false,
					is_m_def
				)
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
				var is_m_def = int(target_m.get("current_bp", 0)) <= 0
				record_damage_event(
					str(target_m.get("name", "Monster")),
					str(target_m.get("id", "monster")),
					wounds,
					int(target_m.get("current_bp", 0)),
					int(target_m.get("bodyPoints", 1)),
					m_pos,
					false,
					is_m_def
				)
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
					var is_m_def = int(target_m.get("current_bp", 0)) <= 0
					record_damage_event(
						str(target_m.get("name", "Monster")),
						str(target_m.get("id", "monster")),
						combat_res.wounds,
						int(target_m.get("current_bp", 0)),
						int(target_m.get("bodyPoints", 1)),
						m_pos,
						false,
						is_m_def
					)
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

	mark_spell_used(hero, s_id)
	_log("[SPELL EXHAUSTED] %s's incantation of %s is spent until the end of the quest." % [hero.get("name"), spell_name])
	res["used_spells"] = hero.get("used_spells", []).duplicate()
	res["available_spells"] = _get_available_spells(hero)

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

# --- Baldur's Gate 1 Style Action Targeting System ---

func close_all_dialogs() -> void:
	close_hero_detail_modal()
	close_monster_detail_modal()
	close_spell_cast_modal()
	close_item_use_modal()
	close_disarm_modal()
	close_armory()
	close_treasure_modal()
	close_elf_spell_selection_modal()
	if ai_confirm_modal and ai_confirm_modal.visible:
		ai_confirm_modal.visible = false
	if not active_story_trigger_overlay.is_empty():
		active_story_trigger_overlay.clear()
	_update_ui()
	queue_redraw_all()

func is_targeting_active() -> bool:
	return bool(active_targeting.get("active", false))

func get_active_targeting() -> Dictionary:
	return active_targeting

func cancel_targeting() -> void:
	if is_targeting_active():
		var act_name = str(active_targeting.get("name", "Action"))
		_log("[TARGETING] Cancelled %s targeting mode." % act_name)
	active_targeting.clear()
	if targeting_cursor:
		targeting_cursor.queue_redraw()
	queue_redraw_all()
	_update_ui()

func toggle_targeting(action_type: String, action_id: String, hero_id: String = "") -> void:
	if is_targeting_active() and str(active_targeting.get("type")) == action_type and str(active_targeting.get("id")) == action_id:
		cancel_targeting()
		return
	if action_type == "spell":
		var h: Dictionary = {}
		if hero_id != "":
			for hero_entry in heroes:
				if str(hero_entry.get("id")) == hero_id:
					h = hero_entry
					break
		if h.is_empty():
			h = get_active_hero()
		if is_spell_used(h, action_id):
			show_unavailable_notice("Spell exhausted this quest", h.get("grid_pos", Vector2i(-1, -1)))
			return
	start_targeting(action_type, action_id, hero_id)

func start_targeting(action_type: String, action_id: String, hero_id: String = "") -> Dictionary:
	# 1. Close any open dialog boxes immediately (just like BG1)
	close_all_dialogs()

	# 2. Determine casting / using hero
	var hero: Dictionary = {}
	if hero_id != "":
		for h in heroes:
			if str(h.get("id")) == hero_id:
				hero = h
				break
	if hero.is_empty():
		hero = get_active_hero()
	if hero.is_empty():
		return { "success": false, "error": "No active hero for targeting" }

	var hid = str(hero.get("id"))
	var hname = str(hero.get("name", "Hero"))

	# 3. Check action economy for spell/attack
	if action_type in ["spell", "attack"] and has_acted_this_turn:
		show_unavailable_notice("Not enough actions", hero.get("grid_pos", Vector2i(-1, -1)))
		return { "success": false, "error": "Already acted this turn" }

	if action_type == "spell" and is_spell_used(hero, action_id):
		show_unavailable_notice("Spell exhausted this quest", hero.get("grid_pos", Vector2i(-1, -1)))
		return { "success": false, "error": "Spell '%s' already used this quest" % action_id }

	# 4. Resolve metadata (name, deck, target_type, icons)
	var t_name = action_id
	var t_deck = ""
	var t_desc = ""
	var t_type = "monster"
	var t_icon: Texture2D = null
	var t_char = "⚡"

	match action_type:
		"spell":
			var s_meta = HeroQuestSpells.get_spell(action_id)
			t_name = str(s_meta.get("name", action_id.capitalize()))
			t_deck = str(s_meta.get("deck", "magic")).to_lower()
			t_desc = str(s_meta.get("description", ""))
			t_type = str(s_meta.get("target_type", "monster"))
			t_icon = get_ai_icon_texture("spell", action_id)
			t_char = str(s_meta.get("icon", "🔮"))
		"item":
			var it_clean = action_id.to_lower().strip_edges()
			var it_meta = HeroQuestEquipment.get_item(it_clean)
			t_name = str(it_meta.get("name", it_clean.replace("_", " ").capitalize()))
			t_desc = str(it_meta.get("description", ""))
			if it_clean.contains("potion"):
				t_type = "hero"
				t_char = "🧪"
			elif it_clean == "holy_water":
				t_type = "monster"
				t_char = "💧"
			elif not HeroQuestEquipment.get_weapon(it_clean).is_empty():
				t_type = "monster"
				t_char = "⚔️"
			else:
				t_type = "hero"
				t_char = "📦"
			t_icon = get_ai_icon_texture("item", it_clean)
		"attack":
			var w_clean = action_id.to_lower().strip_edges()
			var w_meta = HeroQuestEquipment.get_weapon(w_clean)
			var w_name = str(w_meta.get("name", w_clean.replace("_", " ").capitalize()))
			t_name = "Attack (%s)" % w_name
			t_desc = str(w_meta.get("description", ""))
			t_type = "monster"
			t_icon = get_ai_icon_texture("weapon", w_clean)
			t_char = "⚔️"
		_:
			t_name = action_id.capitalize()
			t_type = "monster"

	active_targeting = {
		"active": true,
		"type": action_type,
		"id": action_id,
		"name": t_name,
		"hero_id": hid,
		"hero_name": hname,
		"deck": t_deck,
		"description": t_desc,
		"target_type": t_type,
		"icon": t_icon,
		"token": get_hero_token_texture(hero),
		"icon_char": t_char,
		"hovered_target": {}
	}

	_log("[TARGETING] Targeting activated for [b]%s[/b] by %s. Click a %s on the board or portrait! (R-Click/ESC to cancel)" % [
		t_name, hname, t_type.to_upper()
	])

	if targeting_cursor:
		targeting_cursor.queue_redraw()
	queue_redraw_all()
	_update_ui()
	return { "success": true, "targeting": active_targeting }

func resolve_targeting_click(tile: Vector2i) -> Dictionary:
	if not is_targeting_active():
		return { "success": false, "error": "Targeting is not active" }

	var t_type = str(active_targeting.get("target_type", "monster"))

	var target_entity: Dictionary = {}

	if t_type == "monster":
		for m in monsters:
			if bool(m.get("is_alive", false)) and m.get("grid_pos") == tile:
				target_entity = m
				break
	elif t_type == "hero":
		for h in heroes:
			if bool(h.get("is_on_board", false)) and int(h.get("current_bp", 1)) > 0 and h.get("grid_pos") == tile:
				target_entity = h
				break

	if target_entity.is_empty():
		show_unavailable_notice("Invalid Target", tile)
		return { "success": false, "error": "No valid %s target at tile (%d, %d)" % [t_type, tile.x, tile.y] }

	var target_id = str(target_entity.get("id"))
	return resolve_targeting_entity(t_type, target_id)

func resolve_targeting_entity(entity_type: String, entity_id: String) -> Dictionary:
	if not is_targeting_active():
		return { "success": false, "error": "Targeting is not active" }

	var expected_type = str(active_targeting.get("target_type", "monster"))
	if entity_type != expected_type and expected_type != "any":
		show_unavailable_notice("Requires %s" % expected_type.capitalize(), Vector2i(-1, -1))
		return { "success": false, "error": "Entity %s is %s, but %s requires %s" % [entity_id, entity_type, active_targeting.get("name"), expected_type] }

	var a_type = str(active_targeting.get("type", "spell"))
	var a_id = str(active_targeting.get("id", ""))
	var hid = str(active_targeting.get("hero_id", ""))

	var result: Dictionary = {}
	match a_type:
		"spell":
			result = cast_spell(a_id, entity_id)
		"item":
			result = use_item(hid, a_id, entity_id)
		"attack":
			result = attack_adjacent_monster(entity_id, a_id)
		_:
			result = { "success": false, "error": "Unknown targeting action type: " + a_type }

	if result.get("success", false):
		cancel_targeting()
	return result

func _update_targeting_hover_info(screen_pos: Vector2) -> void:
	if not is_targeting_active():
		return

	var local_pos = screen_pos - board_offset
	var tx = int(floor(local_pos.x / tile_size))
	var ty = int(floor(local_pos.y / tile_size))
	if tx < 0 or tx >= grid_cols or ty < 0 or ty >= grid_rows:
		active_targeting["hovered_target"] = {}
		return

	var tile = Vector2i(tx, ty)
	var t_type = str(active_targeting.get("target_type", "monster"))

	if t_type == "monster":
		for m in monsters:
			if bool(m.get("is_alive", false)) and m.get("grid_pos") == tile and is_monster_currently_visible(m):
				active_targeting["hovered_target"] = {
					"type": "monster",
					"id": str(m.get("id")),
					"name": str(m.get("name")),
					"bp": int(m.get("current_bp", 1)),
					"max_bp": int(m.get("bodyPoints", 1)),
					"valid": true,
					"tile": [tile.x, tile.y]
				}
				return
	elif t_type == "hero":
		for h in heroes:
			if bool(h.get("is_on_board", false)) and int(h.get("current_bp", 1)) > 0 and h.get("grid_pos") == tile:
				active_targeting["hovered_target"] = {
					"type": "hero",
					"id": str(h.get("id")),
					"name": str(h.get("name")),
					"bp": int(h.get("current_bp", 1)),
					"max_bp": int(h.get("bodyPoints", 1)),
					"valid": true,
					"tile": [tile.x, tile.y]
				}
				return

	active_targeting["hovered_target"] = {}

func _setup_targeting_system() -> void:
	if not targeting_cursor:
		targeting_cursor = Control.new()
		targeting_cursor.name = "TargetingCursorOverlay"
		targeting_cursor.set_anchors_preset(Control.PRESET_FULL_RECT)
		targeting_cursor.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var ui_node = get_node_or_null("UI")
		if ui_node:
			ui_node.add_child(targeting_cursor)
		else:
			add_child(targeting_cursor)
		targeting_cursor.draw.connect(_on_targeting_cursor_draw)

func _on_targeting_cursor_draw() -> void:
	if not is_targeting_active():
		return

	var mouse_pos = targeting_cursor.get_local_mouse_position()
	if targeting_cursor.has_meta("test_mouse_pos"):
		mouse_pos = targeting_cursor.get_meta("test_mouse_pos")

	# 1. BG1 Style Targeting Pointer / Reticle
	var reticle_col = Color(1.0, 0.85, 0.25, 0.95)
	var deck = str(active_targeting.get("deck", "")).to_lower()
	match deck:
		"fire": reticle_col = Color(1.0, 0.45, 0.15, 0.98)
		"water": reticle_col = Color(0.15, 0.80, 1.0, 0.98)
		"earth": reticle_col = Color(0.55, 0.85, 0.45, 0.98)
		"air": reticle_col = Color(0.60, 0.90, 1.0, 0.98)
		_:
			if active_targeting.get("target_type") == "hero":
				reticle_col = Color(0.25, 0.95, 0.50, 0.98)
			else:
				reticle_col = Color(1.0, 0.82, 0.20, 0.98)

	# Concentric targeting rings
	targeting_cursor.draw_arc(mouse_pos, 13.0, 0, TAU, 32, reticle_col, 2.0)
	targeting_cursor.draw_arc(mouse_pos, 7.0, 0, TAU, 24, Color(reticle_col.r, reticle_col.g, reticle_col.b, 0.6), 1.0)
	targeting_cursor.draw_circle(mouse_pos, 2.5, Color.WHITE)

	# Crosshair spikes
	targeting_cursor.draw_line(mouse_pos + Vector2(0, -5), mouse_pos + Vector2(0, -18), reticle_col, 1.5)
	targeting_cursor.draw_line(mouse_pos + Vector2(0, 5), mouse_pos + Vector2(0, 18), reticle_col, 1.5)
	targeting_cursor.draw_line(mouse_pos + Vector2(-5, 0), mouse_pos + Vector2(-18, 0), reticle_col, 1.5)
	targeting_cursor.draw_line(mouse_pos + Vector2(5, 0), mouse_pos + Vector2(18, 0), reticle_col, 1.5)

	# 2. Token / Icon Badge floating at mouse_pos + Vector2(18, 16)
	var badge_pos = mouse_pos + Vector2(18, 16)
	var badge_size = Vector2(36, 36)

	# Drop shadow and background
	targeting_cursor.draw_rect(Rect2(badge_pos + Vector2(2, 2), badge_size), Color(0.0, 0.0, 0.0, 0.65), true)
	targeting_cursor.draw_rect(Rect2(badge_pos, badge_size), Color(0.08, 0.11, 0.16, 0.96), true)
	targeting_cursor.draw_rect(Rect2(badge_pos, badge_size), reticle_col, false, 2.0)

	# Draw token/spell/item icon inside badge
	var itex: Texture2D = active_targeting.get("icon", null)
	if itex == null:
		itex = active_targeting.get("token", null)

	if itex:
		var inner_rect = Rect2(badge_pos.x + 3, badge_pos.y + 3, 30, 30)
		targeting_cursor.draw_texture_rect(itex, inner_rect, false)
	else:
		var char_glyph = str(active_targeting.get("icon_char", "⚡"))
		var font = ThemeDB.fallback_font
		var gw = font.get_string_size(char_glyph, HORIZONTAL_ALIGNMENT_CENTER, -1, 16).x
		targeting_cursor.draw_string(font, Vector2(badge_pos.x + 18 - gw * 0.5, badge_pos.y + 24), char_glyph, HORIZONTAL_ALIGNMENT_CENTER, -1, 16, Color.WHITE)

	# 3. Floating Targeting Text Banner
	var act_name = str(active_targeting.get("name", "Action")).to_upper()
	var line1 = "[TARGET: %s]" % act_name
	var line2 = "[L-CLICK: SELECT  |  R-CLICK: CANCEL]"
	var font = ThemeDB.fallback_font
	var fsize1 = 11
	var fsize2 = 9

	var hovered_info = active_targeting.get("hovered_target", {})
	var line3 = ""
	var line3_col = Color.WHITE
	if not hovered_info.is_empty():
		var h_name = str(hovered_info.get("name", "Target"))
		var h_bp = int(hovered_info.get("bp", 0))
		var h_max = int(hovered_info.get("max_bp", 0))
		line3 = "► LOCKED ON: %s (%d/%d BP)" % [h_name, h_bp, h_max]
		line3_col = Color(0.3, 1.0, 0.45) if hovered_info.get("valid", true) else Color(1.0, 0.4, 0.4)

	var s1 = font.get_string_size(line1, HORIZONTAL_ALIGNMENT_LEFT, -1, fsize1)
	var s2 = font.get_string_size(line2, HORIZONTAL_ALIGNMENT_LEFT, -1, fsize2)
	var s3 = font.get_string_size(line3, HORIZONTAL_ALIGNMENT_LEFT, -1, 10) if line3 != "" else Vector2.ZERO

	var max_w = maxf(s1.x, maxf(s2.x, s3.x)) + 14.0
	var total_h = (46.0 if line3 != "" else 34.0)
	var pill_pos = badge_pos + Vector2(badge_size.x + 6, 0)

	var vp_size = targeting_cursor.get_viewport_rect().size
	if pill_pos.x + max_w > vp_size.x - 10:
		pill_pos.x = badge_pos.x - max_w - 6

	var pill_rect = Rect2(pill_pos, Vector2(max_w, total_h))
	targeting_cursor.draw_rect(Rect2(pill_rect.position + Vector2(2, 2), pill_rect.size), Color(0.0, 0.0, 0.0, 0.65), true)
	targeting_cursor.draw_rect(pill_rect, Color(0.06, 0.08, 0.13, 0.95), true)
	targeting_cursor.draw_rect(pill_rect, Color(reticle_col.r, reticle_col.g, reticle_col.b, 0.85), false, 1.5)

	targeting_cursor.draw_string(font, Vector2(pill_pos.x + 7, pill_pos.y + 14), line1, HORIZONTAL_ALIGNMENT_LEFT, -1, fsize1, reticle_col)
	targeting_cursor.draw_string(font, Vector2(pill_pos.x + 7, pill_pos.y + 28), line2, HORIZONTAL_ALIGNMENT_LEFT, -1, fsize2, Color(0.8, 0.85, 0.92, 0.9))
	if line3 != "":
		targeting_cursor.draw_string(font, Vector2(pill_pos.x + 7, pill_pos.y + 42), line3, HORIZONTAL_ALIGNMENT_LEFT, -1, 10, line3_col)

func _draw_targeting_board_highlights(canvas: CanvasItem) -> void:
	if not is_targeting_active():
		return

	var t_type = str(active_targeting.get("target_type", "monster"))
	var pulse = (sin(Time.get_ticks_msec() * 0.006) + 1.0) * 0.5

	if t_type == "monster":
		for m in monsters:
			if bool(m.get("is_alive", false)) and is_monster_currently_visible(m):
				var m_pos: Vector2i = m.get("grid_pos", Vector2i(-1, -1))
				if m_pos.x < 0 or m_pos.y < 0:
					continue
				var center = board_offset + Vector2((m_pos.x + 0.5) * tile_size, (m_pos.y + 0.5) * tile_size)
				var is_hovered = (hovered_tile == m_pos)
				var ring_col = Color(1.0, 0.25, 0.2, 0.70 + pulse * 0.25) if not is_hovered else Color(1.0, 0.85, 0.2, 0.95)
				var r_size = tile_size * (0.46 if not is_hovered else 0.49)
				canvas.draw_arc(center, r_size, 0, TAU, 32, ring_col, 2.5 if is_hovered else 1.8)
				canvas.draw_arc(center, r_size + 4.0, 0, TAU, 24, Color(ring_col.r, ring_col.g, ring_col.b, 0.4), 1.0)
				_draw_target_brackets(canvas, center, r_size, ring_col)

	elif t_type == "hero":
		for h in heroes:
			if bool(h.get("is_on_board", false)) and int(h.get("current_bp", 1)) > 0:
				var h_pos: Vector2i = h.get("grid_pos", Vector2i(-1, -1))
				if h_pos.x < 0 or h_pos.y < 0:
					continue
				var center = board_offset + Vector2((h_pos.x + 0.5) * tile_size, (h_pos.y + 0.5) * tile_size)
				var is_hovered = (hovered_tile == h_pos)
				var ring_col = Color(0.2, 0.95, 0.45, 0.70 + pulse * 0.25) if not is_hovered else Color(1.0, 0.85, 0.2, 0.95)
				var r_size = tile_size * (0.46 if not is_hovered else 0.49)
				canvas.draw_arc(center, r_size, 0, TAU, 32, ring_col, 2.5 if is_hovered else 1.8)
				canvas.draw_arc(center, r_size + 4.0, 0, TAU, 24, Color(ring_col.r, ring_col.g, ring_col.b, 0.4), 1.0)
				_draw_target_brackets(canvas, center, r_size, ring_col)

func _draw_target_brackets(canvas: CanvasItem, center: Vector2, radius: float, col: Color) -> void:
	var b_len = 6.0
	var offset = radius * 0.9
	canvas.draw_line(center + Vector2(-offset, -offset), center + Vector2(-offset + b_len, -offset), col, 2.0)
	canvas.draw_line(center + Vector2(-offset, -offset), center + Vector2(-offset, -offset + b_len), col, 2.0)
	canvas.draw_line(center + Vector2(offset, -offset), center + Vector2(offset - b_len, -offset), col, 2.0)
	canvas.draw_line(center + Vector2(offset, -offset), center + Vector2(offset - b_len, -offset + b_len), col, 2.0)
	canvas.draw_line(center + Vector2(-offset, offset), center + Vector2(-offset + b_len, offset), col, 2.0)
	canvas.draw_line(center + Vector2(-offset, offset), center + Vector2(-offset, offset - b_len), col, 2.0)
	canvas.draw_line(center + Vector2(offset, offset), center + Vector2(offset - b_len, offset), col, 2.0)
	canvas.draw_line(center + Vector2(offset, offset), center + Vector2(offset, offset - b_len), col, 2.0)

func _get_valid_targeting_ids() -> Array:
	var out: Array = []
	if not is_targeting_active():
		return out
	var t_type = str(active_targeting.get("target_type", "monster"))
	if t_type == "monster":
		for m in monsters:
			if bool(m.get("is_alive", false)) and int(m.get("current_bp", 1)) > 0:
				out.append(str(m.get("id")))
	elif t_type == "hero":
		for h in heroes:
			if int(h.get("current_bp", 1)) > 0 and bool(h.get("is_on_board", false)):
				out.append(str(h.get("id")))
	return out

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

func spawn_floating_text(tile: Vector2i, text: String, color: Color = Color.WHITE, duration: float = 1.0, extra_data: Dictionary = {}) -> void:
	var screen_pos = board_offset + Vector2((tile.x + 0.5) * tile_size, (tile.y + 0.2) * tile_size)
	var vel_y = -20.0 if extra_data.get("is_damage", false) else -40.0
	var item = {
		"text": text,
		"pos": screen_pos,
		"vel": Vector2(0, vel_y),
		"color": color,
		"alpha": 1.0,
		"time": 0.0,
		"duration": duration
	}
	for k in extra_data:
		item[k] = extra_data[k]
	floating_texts.append(item)
	queue_redraw_all()

func record_damage_event(target_name: String, target_id: String, wounds: int, cur_bp: int, max_bp: int, tile: Vector2i, is_hero: bool = false, is_defeat: bool = false) -> Dictionary:
	var evt = {
		"target_name": target_name,
		"target_id": target_id,
		"wounds": wounds,
		"current_bp": cur_bp,
		"max_bp": max_bp,
		"tile": tile,
		"is_hero": is_hero,
		"is_defeat": is_defeat or cur_bp <= 0,
		"time": 0.0,
		"duration": 3.5
	}
	damage_events.append(evt)
	last_damage_event = evt

	if dice_label:
		if is_defeat or cur_bp <= 0:
			dice_label.text = "💥 [DEFEATED] %s takes %d wound(s) and is DEFEATED!" % [target_name, wounds]
		else:
			dice_label.text = "💥 [DAMAGE] %s takes %d wound(s)! Remaining HP: %d/%d" % [target_name, wounds, cur_bp, max_bp]

	spawn_floating_text(
		tile,
		"-%d HP" % wounds,
		Color(0.95, 0.25, 0.25),
		3.5,
		{
			"is_damage": true,
			"target_name": target_name,
			"target_id": target_id,
			"wounds": wounds,
			"current_bp": cur_bp,
			"max_bp": max_bp,
			"is_defeat": is_defeat or cur_bp <= 0,
			"is_hero": is_hero
		}
	)
	return evt

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

func _initialize_treasure_deck() -> void:
	treasure_deck.clear()
	treasure_discard.clear()
	var raw_cards: Array[Dictionary] = [
		{ "id": "gold-25-a", "type": "gold", "title": "Gold! (25 Gold Coins)", "gold": 25, "icon": "💰", "description": "You search old urns and find a hidden purse containing 25 Gold Coins.", "flavor": "Every coin helps outfit the party for survival." },
		{ "id": "gold-25-b", "type": "gold", "title": "Gold! (25 Gold Coins)", "gold": 25, "icon": "💰", "description": "Tucked behind a loose wall brick, you find 25 Gold Coins.", "flavor": "A modest hoard left by previous explorers." },
		{ "id": "gold-50-a", "type": "gold", "title": "Gold! (50 Gold Coins)", "gold": 50, "icon": "💰", "description": "Hidden beneath stone flagstones, you uncover 50 Gold Coins.", "flavor": "A glittering reward tucked away from prying eyes." },
		{ "id": "gold-50-b", "type": "gold", "title": "Gold! (50 Gold Coins)", "gold": 50, "icon": "💰", "description": "A copper strongbox yields 50 gleaming Gold Coins!", "flavor": "The lock crumbled centuries ago." },
		{ "id": "gold-100", "type": "gold", "title": "Gold! (100 Gold Coins)", "gold": 100, "icon": "💰", "description": "A concealed iron strongbox contains 100 gleaming Gold Coins!", "flavor": "A hefty hoard forgotten by the dungeon's masters." },
		{ "id": "gem-50", "type": "gem", "title": "Gems! (50 Gold Coins)", "gold": 50, "icon": "💎", "description": "You pry loose precious rubies and amethysts worth 50 Gold Coins.", "flavor": "Their brilliant facets catch the flickering torchlight." },
		{ "id": "jewels-100", "type": "gem", "title": "Jewels! (100 Gold Coins)", "gold": 100, "icon": "💎", "description": "An ornate jeweled pendant and sapphire ring worth 100 Gold Coins!", "flavor": "Ancient heirloom jewelry crafted before the darkness fell." },
		{ "id": "potion-healing-a", "type": "potion", "title": "Potion of Healing", "item": "healing_potion", "gold": 0, "icon": "🧪", "description": "A vial of shimmering golden liquid that restores up to 4 Body Points.", "flavor": "Brewed by the Emperor's court alchemists to mend mortal wounds." },
		{ "id": "potion-healing-b", "type": "potion", "title": "Potion of Healing", "item": "healing_potion", "gold": 0, "icon": "🧪", "description": "A restorative elixir sealed in crystal. Restores up to 4 Body Points.", "flavor": "The sweet scent of mountain herbs fills the air." },
		{ "id": "potion-strength", "type": "potion", "title": "Potion of Strength", "item": "potion_strength", "gold": 0, "icon": "🍷", "description": "A ruby draught granting +2 Attack Dice on your next attack.", "flavor": "Raw magical adrenaline surges through your limbs." },
		{ "id": "potion-defense", "type": "potion", "title": "Potion of Defense", "item": "potion_defense", "gold": 0, "icon": "🛡️", "description": "A liquid iron elixir granting +2 Defend Dice on your next defense.", "flavor": "Your armor and flesh resonate with impenetrable warding." },
		{ "id": "holy-water", "type": "potion", "title": "Holy Water", "item": "holy_water", "gold": 0, "icon": "✨", "description": "A consecrated vial of holy water. Purges evil or restores 2 BP.", "flavor": "Blessed by the High Clerics of Lileath." },
		{ "id": "hazard-pit", "type": "hazard", "title": "Hazard! (Pit Trap)", "damage": 1, "icon": "🕳️", "gold": 0, "description": "The stone floor collapses beneath you into a spike pit! You lose 1 Body Point.", "flavor": "Loose rubble clatters into the darkness as you hit the bottom." },
		{ "id": "hazard-poison", "type": "hazard", "title": "Hazard! (Poison Dart)", "damage": 2, "icon": "☠️", "gold": 0, "description": "A hidden spring-loaded needle fires from the wall! You suffer 2 Body Points of damage.", "flavor": "Venom burns through your veins before you can pull the needle out." },
		{ "id": "wandering-monster-a", "type": "wandering_monster", "title": "Wandering Monster!", "icon": "👹", "gold": 0, "description": "A wandering monster ambushes you while your guard is down!", "flavor": "A guttural roar echoes as an enemy emerges from the gloom!" },
		{ "id": "wandering-monster-b", "type": "wandering_monster", "title": "Wandering Monster!", "icon": "👹", "gold": 0, "description": "A wandering monster stalks into the chamber and strikes!", "flavor": "Cold steel glints in the darkness!" }
	]
	for c in raw_cards:
		treasure_deck.append(c.duplicate(true))
	treasure_deck.shuffle()

func _draw_treasure_card() -> Dictionary:
	if treasure_deck.is_empty():
		return {}

	var card: Dictionary = treasure_deck.pop_front()
	var c_type = str(card.get("type", "")).to_lower()
	if c_type == "wandering_monster" or c_type == "hazard":
		treasure_deck.append(card.duplicate(true))
		treasure_deck.shuffle()
	else:
		treasure_discard.append(card.duplicate(true))

	return card

func get_treasure_deck_stats() -> Dictionary:
	var total = treasure_deck.size()
	var hazards = 0
	var goods = 0
	for c in treasure_deck:
		var ct = str(c.get("type", "")).to_lower()
		if ct == "hazard" or ct == "wandering_monster":
			hazards += 1
		else:
			goods += 1
	var ratio: float = (float(hazards) / float(total)) if total > 0 else 0.0
	return {
		"total": total,
		"goods": goods,
		"hazards": hazards,
		"hazardRatio": ratio,
		"discardCount": treasure_discard.size()
	}

func _spawn_wandering_monster(hero: Dictionary, room_id: String) -> Dictionary:
	var h_pos: Vector2i = hero.get("grid_pos", Vector2i(-1, -1))
	var cart = CartridgeManager.active_cartridge
	var starting_map_id = cart.get("header", {}).get("startingMap", "heroquest-the-trial")
	var map_data = cart.get("maps", {}).get(starting_map_id, {})
	var wm_type = str(map_data.get("wanderingMonster", cart.get("wanderingMonster", "orc"))).to_lower()

	var candidates: Array[Vector2i] = [
		Vector2i(h_pos.x + 1, h_pos.y),
		Vector2i(h_pos.x - 1, h_pos.y),
		Vector2i(h_pos.x, h_pos.y + 1),
		Vector2i(h_pos.x, h_pos.y - 1),
		Vector2i(h_pos.x + 1, h_pos.y + 1),
		Vector2i(h_pos.x - 1, h_pos.y - 1),
		Vector2i(h_pos.x + 1, h_pos.y - 1),
		Vector2i(h_pos.x - 1, h_pos.y + 1)
	]

	var spawn_pos: Vector2i = Vector2i(-1, -1)
	for pt in candidates:
		if pt.x < 0 or pt.x >= grid_cols or pt.y < 0 or pt.y >= grid_rows:
			continue
		var pt_room = str(_get_room_at(pt).get("id", ""))
		if room_id != "" and pt_room != room_id:
			continue
		var blocked = false
		for wb in wall_blocks:
			var wbx = int(wb.get("x", 0))
			var wby = int(wb.get("y", 0))
			if wbx == pt.x and wby == pt.y:
				blocked = true
				break
		if blocked:
			continue
		for h in heroes:
			if h.get("is_on_board", false) and int(h.get("current_bp", 0)) > 0:
				var hp: Vector2i = h.get("grid_pos", Vector2i(-1, -1))
				if hp == pt:
					blocked = true
					break
		if blocked:
			continue
		for m in monsters:
			if bool(m.get("is_alive", true)) and int(m.get("current_bp", 1)) > 0:
				var mp: Vector2i = _to_grid_pos(m.get("grid_pos", Vector2i(-1, -1)))
				if mp == pt:
					blocked = true
					break
		if blocked:
			continue

		spawn_pos = pt
		break

	if spawn_pos == Vector2i(-1, -1):
		spawn_pos = Vector2i(maxi(0, h_pos.x - 1), h_pos.y)

	var wm_id = "wm_%s_%d" % [wm_type, monsters.size() + 1]
	var wm_name = "Wandering %s" % wm_type.capitalize()
	var bp = 1 if wm_type == "goblin" else 2
	var atk = 2 if wm_type == "goblin" else 3
	var def_d = 1 if wm_type == "goblin" else 2

	var wm: Dictionary = {
		"id": wm_id,
		"slug": "%s-wm" % wm_type,
		"name": wm_name,
		"monsterType": wm_type,
		"type": wm_type,
		"bodyPoints": bp,
		"current_bp": bp,
		"attackDice": atk,
		"defendDice": def_d,
		"movementSquares": 6,
		"position": [spawn_pos.x, spawn_pos.y],
		"grid_pos": spawn_pos,
		"is_alive": true,
		"is_sleeping": false,
		"tempest_stunned": false,
		"roomId": room_id
	}

	monsters.append(wm)
	discovered_monster_ids[wm_id] = true
	var ret_wm = wm.duplicate(true)
	ret_wm["grid_pos"] = [spawn_pos.x, spawn_pos.y]
	return ret_wm

func is_hero_out_of_movement() -> bool:
	if movement_closed:
		return true
	if turn_state == "turn_complete":
		return true
	if moved_before_action and has_acted_this_turn:
		return true
	if movement_rolled and movement_remaining <= 0:
		return true
	return false

func trigger_flash_new_item(reward_data: Dictionary) -> void:
	if reward_data.is_empty():
		return

	var r_name = str(reward_data.get("name", "Treasure"))
	var r_type = str(reward_data.get("type", "item"))
	var r_amount = int(reward_data.get("amount", 1))
	var r_icon = str(reward_data.get("icon", "✨"))
	var hero_id = str(reward_data.get("hero_id", ""))
	var hero_name = str(reward_data.get("hero_name", "Hero"))

	var msg = ""
	if r_type == "gold":
		msg = "💰 TREASURE COLLECTED: +%d Gold Coins added to Purse! 💰" % r_amount
	else:
		msg = "✨ NEW ITEM ACQUIRED: %s added to Backpack! ✨" % r_name

	flashing_item = {
		"active": true,
		"name": r_name,
		"type": r_type,
		"amount": r_amount,
		"icon": r_icon,
		"hero_id": hero_id,
		"hero_name": hero_name,
		"timer": 3.0,
		"message": msg
	}

	# Spawn floating sparkle text above hero on the board
	var h_pos = Vector2i(-1, -1)
	for h in heroes:
		if str(h.get("id")) == hero_id:
			h_pos = _to_grid_pos(h.get("grid_pos", Vector2i(-1, -1)))
			break
	if h_pos.x >= 0 and h_pos.y >= 0:
		if r_type == "gold":
			spawn_floating_text(h_pos, "💰 +%d GOLD 💰" % r_amount, Color(1.0, 0.88, 0.2), 2.2)
		else:
			spawn_floating_text(h_pos, "✨ +%s ✨" % r_name, Color(0.3, 1.0, 0.6), 2.2)

	_log("[TREASURE] %s (Hero is out of movement)" % msg)
	_update_ui()
	queue_redraw_all()

func _check_and_trigger_out_of_movement_item_flash() -> void:
	if pending_flash_item.is_empty():
		return
	if is_hero_out_of_movement():
		var p = pending_flash_item.duplicate(true)
		pending_flash_item = {}
		trigger_flash_new_item(p)

func _setup_treasure_card_overlay(card: Dictionary, hero: Dictionary, is_quest_note: bool) -> void:
	var item_str = str(card.get("item", ""))
	var gold_val = int(card.get("gold", card.get("amount", 0)))
	active_treasure_overlay = {
		"card": card,
		"hero": hero,
		"hero_id": str(hero.get("id", "")),
		"hero_name": str(hero.get("characterName", hero.get("name", "Hero"))),
		"title": str(card.get("title", "Treasure Found!")),
		"icon": str(card.get("icon", "💎")),
		"description": str(card.get("description", "")),
		"flavor": str(card.get("flavor", "")),
		"card_type": str(card.get("type", "gold")),
		"is_quest_note": is_quest_note,
		"gold_found": gold_val,
		"item_found": item_str,
		"waitingForClick": true
	}
	open_treasure_modal(card, hero, is_quest_note)

func resolve_treasure_overlay_click() -> Dictionary:
	close_treasure_modal()
	if active_treasure_overlay.is_empty():
		return { "success": false, "error": "No active treasure overlay" }

	var overlay = active_treasure_overlay.duplicate(true)
	active_treasure_overlay = {}

	# Extract reward data
	var reward: Dictionary = {}
	var gold_found = int(overlay.get("gold_found", 0))
	var item_found = str(overlay.get("item_found", ""))
	var hero_id = str(overlay.get("hero_id", ""))
	var hero_name = str(overlay.get("hero_name", "Hero"))
	var title = str(overlay.get("title", ""))

	if gold_found > 0:
		reward = {
			"type": "gold",
			"name": title if title != "" else ("%d Gold Coins" % gold_found),
			"amount": gold_found,
			"icon": "💰",
			"hero_id": hero_id,
			"hero_name": hero_name
		}
	elif item_found != "":
		reward = {
			"type": "item",
			"name": title if title != "" else item_found.capitalize(),
			"item_id": item_found,
			"amount": 1,
			"icon": str(overlay.get("icon", "🧪")),
			"hero_id": hero_id,
			"hero_name": hero_name
		}

	if not reward.is_empty():
		if is_hero_out_of_movement():
			trigger_flash_new_item(reward)
		else:
			pending_flash_item = reward
			_log("[TREASURE] %s acquired! (Will flash when out of movement)" % str(reward.get("name", "")))

	_update_ui()
	queue_redraw_all()
	return { "success": true, "card": overlay.get("card", {}) }

func _find_untriggered_story_trigger(condition: String, room_id: String, tile: Vector2i = Vector2i(-1, -1)) -> Dictionary:
	for st in story_triggers:
		if st.get("triggered", false) and st.get("onceOnly", true):
			continue
		var cond = str(st.get("condition", ""))
		if cond != condition:
			continue
		var st_room = str(st.get("room", ""))
		var st_tile = st.get("tile", [])
		var has_tile = (st_tile is Array and st_tile.size() >= 2)
		var matches_room = (st_room != "" and st_room == room_id)
		var matches_tile = (has_tile and Vector2i(int(st_tile[0]), int(st_tile[1])) == tile)

		if has_tile and matches_tile:
			return st
		elif not has_tile and matches_room:
			return st
		elif matches_room and (tile == Vector2i(-1, -1) or not has_tile):
			return st
	return {}

func _find_ground_story_trigger(step_tile: Vector2i, prev_tile: Vector2i = Vector2i(-1, -1)) -> Dictionary:
	var cur_room = _get_room_at(step_tile)
	var cur_room_id = str(cur_room.get("id", "")) if not cur_room.is_empty() else ""
	var prev_room_id = ""
	if prev_tile != Vector2i(-1, -1):
		var prev_room = _get_room_at(prev_tile)
		prev_room_id = str(prev_room.get("id", "")) if not prev_room.is_empty() else ""

	for st in story_triggers:
		if st.get("triggered", false) and st.get("onceOnly", true):
			continue
		var cond = str(st.get("condition", ""))
		# Ground triggers exclude purely interactive/action-based triggers:
		if cond in ["search_treasure", "search_traps", "line_of_sight", "dialogue", "combat", "interact"]:
			continue

		var st_room = str(st.get("room", ""))
		var st_tile = st.get("tile", [])
		var has_tile = (st_tile is Array and st_tile.size() >= 2)

		if has_tile:
			var target_tile = Vector2i(int(st_tile[0]), int(st_tile[1]))
			if target_tile == step_tile:
				if st_room == "" or cur_room_id == st_room:
					return st
		else:
			# Room-level trigger without a specific tile: fires upon crossing the room threshold from outside
			if st_room != "" and cur_room_id == st_room:
				if prev_room_id != st_room:
					return st
	return {}

func _setup_story_trigger_overlay(trigger: Dictionary, hero: Dictionary) -> void:
	active_story_trigger_overlay = {
		"trigger": trigger,
		"hero": hero,
		"hero_id": str(hero.get("id", "")),
		"hero_name": str(hero.get("characterName", hero.get("name", "Hero"))),
		"marker": str(trigger.get("marker", "A")),
		"title": str(trigger.get("title", "Story Event")),
		"banner": str(trigger.get("banner", "QUEST NOTE [%s]" % str(trigger.get("marker", "A")))),
		"narrative": str(trigger.get("narrative", "")),
		"consequence": str(trigger.get("consequence", "")),
		"gold": int(trigger.get("gold", 0)),
		"item": trigger.get("item", null),
		"spawnMonsters": trigger.get("spawnMonsters", []),
		"waitingForClick": true,
		"onTopOfDice": true
	}
	_log("[STORY TRIGGER %s] 📜 Zargon reads Quest Note: '%s'!" % [
		active_story_trigger_overlay.marker,
		active_story_trigger_overlay.title
	])
	queue_redraw_all()

func resolve_story_trigger_overlay_click() -> Dictionary:
	if active_story_trigger_overlay.is_empty():
		return { "success": false, "error": "No active story trigger overlay" }

	var overlay = active_story_trigger_overlay.duplicate(true)
	active_story_trigger_overlay = {}

	var trigger = overlay.get("trigger", {})
	var hero_id = str(overlay.get("hero_id", ""))
	var hero: Dictionary = {}
	for h in heroes:
		if str(h.get("id")) == hero_id:
			hero = h
			break
	if hero.is_empty():
		hero = get_active_hero()

	var marker = str(trigger.get("marker", "A"))
	var title = str(trigger.get("title", "Story Event"))
	var narrative = str(trigger.get("narrative", ""))

	# 1. Award Gold
	var gold_val = int(trigger.get("gold", 0))
	if gold_val > 0 and not hero.is_empty():
		hero["gold"] = int(hero.get("gold", 0)) + gold_val
		_log("[STORY TRIGGER %s] 💰 %s receives %d Gold Coins! (Total: %d)" % [marker, hero.get("name"), gold_val, hero.get("gold")])
		spawn_floating_text(hero.get("grid_pos", Vector2i(1, 1)), "+%d GOLD" % gold_val, Color(1.0, 0.85, 0.2), 2.0)

	# 2. Award Quest Item
	var item_data = trigger.get("item", null)
	if item_data != null and not hero.is_empty():
		if not (hero.get("inventory", []) is Array):
			hero["inventory"] = []
		var item_name = ""
		if item_data is Dictionary:
			hero["inventory"].append(item_data)
			item_name = str(item_data.get("name", "Quest Item"))
		else:
			hero["inventory"].append(str(item_data))
			item_name = str(item_data)
		_log("[STORY TRIGGER %s] 📜 %s obtained quest item: '%s'!" % [marker, hero.get("name"), item_name])
		spawn_floating_text(hero.get("grid_pos", Vector2i(1, 1)), "FOUND: %s" % item_name.to_upper(), Color(0.3, 0.85, 1.0), 2.2)

	# 3. Spawn Ambush Monsters
	var spawns = trigger.get("spawnMonsters", [])
	if spawns is Array and spawns.size() > 0:
		for m in spawns:
			var m_copy = m.duplicate(true)
			if not m_copy.has("grid_pos") and m_copy.has("position"):
				m_copy["grid_pos"] = Vector2i(m_copy["position"][0], m_copy["position"][1])
			elif m_copy.has("grid_pos") and m_copy["grid_pos"] is Array:
				m_copy["grid_pos"] = Vector2i(m_copy["grid_pos"][0], m_copy["grid_pos"][1])
			if not m_copy.has("is_alive"):
				m_copy["is_alive"] = true
			var mid = str(m_copy.get("id", "ambush-%d" % randi()))
			discovered_monster_ids[mid] = true
			monsters.append(m_copy)
			var m_pos: Vector2i = m_copy.get("grid_pos", Vector2i(1, 1))
			spawn_burst_vfx(board_offset + Vector2((m_pos.x + 0.5) * tile_size, (m_pos.y + 0.5) * tile_size), Color(0.9, 0.2, 0.2), 55.0, 0.5)
			spawn_floating_text(m_pos, "AMBUSH!", Color(1.0, 0.15, 0.15), 2.2)
			_log("[AMBUSH %s] ⚔️ A %s bursts into battle at (%d, %d)!" % [marker, m_copy.get("name", "Monster"), m_pos.x, m_pos.y])

	_update_ui()
	queue_redraw_all()
	return {
		"success": true,
		"trigger": trigger,
		"goldAwarded": gold_val,
		"itemAwarded": item_data != null,
		"monstersSpawned": spawns.size()
	}

func search_room(is_interactive: bool = false) -> Dictionary:
	var hero = get_active_hero()
	if hero.is_empty():
		return { "success": false, "error": "No active hero" }
	var h_pos = hero.get("grid_pos", Vector2i(-1, -1))
	if has_acted_this_turn:
		_log("[ACTION] %s has already taken an action this turn!" % hero.get("name", "Hero"))
		show_unavailable_notice("Not enough actions", h_pos)
		return { "success": false, "error": "Already acted this turn" }

	var h_room = _get_room_at(h_pos)
	var r_id = str(h_room.get("id", "")) if not h_room.is_empty() else ""

	# 1. Reject if standing in a corridor
	if r_id == "":
		_log("[TREASURE] ❌ Cannot search for treasure in corridors! You must be inside a room.")
		spawn_floating_text(h_pos, "NO SEARCH IN CORRIDOR", Color(1.0, 0.4, 0.4), 1.5)
		show_unavailable_notice("Cannot search in corridor", h_pos)
		return { "success": false, "error": "Cannot search for treasure in corridors! You must be inside a room." }

	# 2. Reject if room is inhabited by living monsters
	for m in monsters:
		if bool(m.get("is_alive", true)) and int(m.get("current_bp", 1)) > 0:
			var m_pos = _to_grid_pos(m.get("grid_pos", Vector2i(-1, -1)))
			var m_room = str(_get_room_at(m_pos).get("id", ""))
			var m_room_id = str(m.get("roomId", ""))
			if (m_room != "" and m_room == r_id) or (m_room_id != "" and m_room_id == r_id):
				var m_name = str(m.get("name", "Monster"))
				_log("[TREASURE] ❌ Cannot search for treasure while monsters are present! (%s is in the room)" % m_name)
				spawn_floating_text(h_pos, "MONSTERS IN ROOM!", Color(1.0, 0.4, 0.4), 1.5)
				show_unavailable_notice("Monsters present in room", h_pos)
				return { "success": false, "error": "Cannot search room while monsters are present!" }

	# 3. Reject if hero already searched this room or room searches exhausted
	var hero_id = str(hero.get("id", ""))
	var room_searches: Array = searched_rooms.get(r_id, [])
	if hero_id in room_searches:
		_log("[TREASURE] ❌ %s has already searched this room for treasure!" % hero.get("name", "Hero"))
		spawn_floating_text(h_pos, "ALREADY SEARCHED!", Color(1.0, 0.6, 0.3), 1.5)
		show_unavailable_notice("Room already searched", h_pos)
		return { "success": false, "error": "%s has already searched this room for treasure!" % hero.get("name", "Hero") }

	if room_searches.size() >= 4:
		_log("[TREASURE] ❌ This room has been thoroughly searched and holds no more treasure!")
		spawn_floating_text(h_pos, "ROOM EXHAUSTED", Color(1.0, 0.6, 0.3), 1.5)
		show_unavailable_notice("Room already searched", h_pos)
		return { "success": false, "error": "This room has been thoroughly searched and holds no more treasure!" }

	# 4. Check for chest/furniture traps in this room (preserves Scenario 51 behavior)
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
			trapped_chest["sprung"] = true
			trapped_chest["detected"] = true
			if is_interactive:
				_setup_trap_sprung_overlay(trapped_chest, hero, h_pos, [], 0, true)
				_conclude_action_turn_state()
				_update_ui()
				queue_redraw_all()
				return { "success": true, "trapTriggered": true, "waitingForClick": true, "goldFound": 0 }

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

	# Record that active hero searched this room
	if not searched_rooms.has(r_id):
		searched_rooms[r_id] = []
	searched_rooms[r_id].append(hero_id)

	# 4. Check Story Triggers (Quest Book Notes) for this room / tile
	var story_tr = _find_untriggered_story_trigger("search_treasure", r_id, h_pos)
	if not story_tr.is_empty():
		story_tr["triggered"] = true
		_conclude_action_turn_state()
		_setup_story_trigger_overlay(story_tr, hero)
		_update_ui()
		queue_redraw_all()
		return {
			"success": true,
			"storyTrigger": true,
			"trigger": story_tr,
			"waitingForClick": true
		}

	# 5. Check Quest Notes (Special Room Treasure) on First Search
	var spec_tr: Dictionary = {}
	if not room_special_treasure_collected.get(r_id, false):
		if h_room.has("specialTreasure") and h_room["specialTreasure"] is Dictionary:
			spec_tr = h_room["specialTreasure"]
		elif h_room.has("questTreasure") and h_room["questTreasure"] is Dictionary:
			spec_tr = h_room["questTreasure"]
		else:
			var cart = CartridgeManager.active_cartridge
			var qn = cart.get("questNotes", {})
			if qn.has(r_id) and qn[r_id] is Dictionary:
				spec_tr = qn[r_id]

	if not spec_tr.is_empty():
		room_special_treasure_collected[r_id] = true
		last_treasure_card = spec_tr
		var found_gold = int(spec_tr.get("gold", spec_tr.get("amount", 0)))
		hero["gold"] = hero.get("gold", 0) + found_gold
		var item_reward = str(spec_tr.get("item", ""))
		if item_reward != "":
			if not (hero.get("inventory", []) is Array):
				hero["inventory"] = []
			hero["inventory"].append(item_reward)

		var tr_title = str(spec_tr.get("title", "Quest Note Treasure"))
		_log("[QUEST TREASURE] 📜 %s searches %s: Discovered Quest Note treasure: %s! (+%d Gold Coins, Total: %d)" % [
			hero.get("name"), h_room.get("name", r_id), tr_title, found_gold, hero.get("gold")
		])
		spawn_floating_text(h_pos, "+%d GOLD QUEST TREASURE" % found_gold if found_gold > 0 else "QUEST TREASURE!", Color(1.0, 0.85, 0.2), 2.0)

		if is_interactive:
			_setup_treasure_card_overlay(spec_tr, hero, true)
			_conclude_action_turn_state()
			_update_ui()
			queue_redraw_all()
			return { "success": true, "questTreasure": true, "goldFound": found_gold, "card": spec_tr, "waitingForClick": true }

		_conclude_action_turn_state()
		var non_int_q_reward: Dictionary = {}
		if found_gold > 0:
			non_int_q_reward = {
				"type": "gold",
				"name": tr_title if tr_title != "" else ("%d Gold Coins" % found_gold),
				"amount": found_gold,
				"icon": "💰",
				"hero_id": hero_id,
				"hero_name": hero.get("name", "Hero")
			}
		elif item_reward != "":
			non_int_q_reward = {
				"type": "item",
				"name": tr_title if tr_title != "" else item_reward.capitalize(),
				"item_id": item_reward,
				"amount": 1,
				"icon": "💎",
				"hero_id": hero_id,
				"hero_name": hero.get("name", "Hero")
			}
		if not non_int_q_reward.is_empty():
			if is_hero_out_of_movement():
				trigger_flash_new_item(non_int_q_reward)
			else:
				pending_flash_item = non_int_q_reward
		_update_ui()
		queue_redraw_all()
		return { "success": true, "questTreasure": true, "goldFound": found_gold, "card": spec_tr }

	# 6. Subsequent searches or rooms without quest notes draw from Treasure Deck
	var card = _draw_treasure_card()
	last_treasure_card = card
	var card_type = str(card.get("type", "gold"))
	var found_gold = 0
	var spawned_wm: Dictionary = {}

	match card_type:
		"gold", "gem":
			found_gold = int(card.get("gold", 0))
			hero["gold"] = hero.get("gold", 0) + found_gold
			_log("[TREASURE] 💰 %s searches room: Drew %s! Found %d Gold Coins! Total Gold: %d" % [
				hero.get("name"), card.get("title"), found_gold, hero.get("gold")
			])
			spawn_floating_text(h_pos, "+%d GOLD" % found_gold, Color(1.0, 0.85, 0.2), 1.8)
		"potion":
			var item_id = str(card.get("item", "healing_potion"))
			if not (hero.get("inventory", []) is Array):
				hero["inventory"] = []
			hero["inventory"].append(item_id)
			_log("[TREASURE] 🧪 %s searches room: Drew %s! Added to backpack." % [
				hero.get("name"), card.get("title")
			])
			spawn_floating_text(h_pos, "+%s" % card.get("title"), Color(0.3, 0.9, 0.5), 1.8)
		"hazard":
			var dmg = int(card.get("damage", 1))
			hero["current_bp"] = maxi(0, hero.get("current_bp", 1) - dmg)
			_log("[HAZARD] ☠️ %s searches room: Drew %s! Suffers %d damage (Remaining BP: %d)!" % [
				hero.get("name"), card.get("title"), dmg, hero.get("current_bp")
			])
			spawn_floating_text(h_pos, "-%d HP HAZARD" % dmg, Color(0.9, 0.25, 0.25), 1.8)
		"wandering_monster":
			spawned_wm = _spawn_wandering_monster(hero, r_id)
			var wm_pos = _to_grid_pos(spawned_wm.get("grid_pos", Vector2i(-1, -1)))
			_log("[WANDERING MONSTER] ⚠️ AMBUSH! %s draws a Wandering Monster card! A %s appears at (%d, %d)!" % [
				hero.get("name"), spawned_wm.get("name"), wm_pos.x, wm_pos.y
			])
			spawn_floating_text(wm_pos, "⚠️ WANDERING %s!" % str(spawned_wm.get("name")).to_upper(), Color(1.0, 0.25, 0.2), 2.0)

	if is_interactive:
		_setup_treasure_card_overlay(card, hero, false)
		_conclude_action_turn_state()
		_update_ui()
		queue_redraw_all()
		return {
			"success": true,
			"questTreasure": false,
			"goldFound": found_gold,
			"card": card,
			"wanderingMonster": (spawned_wm if not spawned_wm.is_empty() else null),
			"waitingForClick": true
		}

	_conclude_action_turn_state()
	var non_int_reward: Dictionary = {}
	if found_gold > 0:
		non_int_reward = {
			"type": "gold",
			"name": card.get("title", "%d Gold Coins" % found_gold),
			"amount": found_gold,
			"icon": "💰",
			"hero_id": hero_id,
			"hero_name": hero.get("name", "Hero")
		}
	elif card_type == "potion" or card.has("item"):
		var item_id_str = str(card.get("item", "healing_potion"))
		non_int_reward = {
			"type": "item",
			"name": card.get("title", item_id_str.capitalize()),
			"item_id": item_id_str,
			"amount": 1,
			"icon": str(card.get("icon", "🧪")),
			"hero_id": hero_id,
			"hero_name": hero.get("name", "Hero")
		}
	if not non_int_reward.is_empty():
		if is_hero_out_of_movement():
			trigger_flash_new_item(non_int_reward)
		else:
			pending_flash_item = non_int_reward
	_update_ui()
	queue_redraw_all()
	return {
		"success": true,
		"questTreasure": false,
		"goldFound": found_gold,
		"card": card,
		"wanderingMonster": (spawned_wm if not spawned_wm.is_empty() else null)
	}

func search_traps() -> Dictionary:
	var hero = get_active_hero()
	if hero.is_empty():
		return { "success": false, "error": "No active hero" }
	var h_pos = hero.get("grid_pos", Vector2i(-1, -1))
	if has_acted_this_turn:
		_log("[ACTION] %s has already taken an action this turn!" % hero.get("name", "Hero"))
		show_unavailable_notice("Not enough actions", h_pos)
		return { "success": false, "error": "Already acted this turn" }

	var h_room = _get_room_at(h_pos)
	var found_traps: Array[String] = []
	var found_secret_doors: Array[String] = []

	if not h_room.is_empty():
		var r_id = str(h_room.get("id", ""))
		for tr in traps:
			var is_known = bool(tr.get("detected", false) or tr.get("is_revealed", false) or tr.get("sprung", false) or tr.get("is_sprung", false) or tr.get("disarmed", false) or tr.get("spent", false) or tr.get("blocked", false))
			if is_known:
				continue
			var tx = int(tr.get("x", tr.get("position", [0, 0])[0]))
			var ty = int(tr.get("y", tr.get("position", [0, 0])[1]))
			if _get_room_at(Vector2i(tx, ty)).get("id", "") == r_id:
				tr["detected"] = true
				found_traps.append(str(tr.get("id", "trap")))
				spawn_floating_text(Vector2i(tx, ty), "⚠️ TRAP DISCOVERED", Color(1.0, 0.8, 0.2), 1.6)

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
			var is_known = bool(tr.get("detected", false) or tr.get("is_revealed", false) or tr.get("sprung", false) or tr.get("is_sprung", false) or tr.get("disarmed", false) or tr.get("spent", false) or tr.get("blocked", false))
			if is_known:
				continue
			var tx = int(tr.get("x", tr.get("position", [0, 0])[0]))
			var ty = int(tr.get("y", tr.get("position", [0, 0])[1]))
			var t_pos = Vector2i(tx, ty)
			if abs(t_pos.x - h_pos.x) + abs(t_pos.y - h_pos.y) <= 4:
				tr["detected"] = true
				found_traps.append(str(tr.get("id", "trap")))
				spawn_floating_text(t_pos, "⚠️ TRAP DISCOVERED", Color(1.0, 0.8, 0.2), 1.6)

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

	if found_traps.size() > 0 or found_secret_doors.size() > 0:
		_log("[SEARCH] %s searches carefully for traps and secret doors: Found %d hidden trap(s) and %d secret door(s)!" % [
			hero.get("name"), found_traps.size(), found_secret_doors.size()
		])
	else:
		_log("[SEARCH] %s searches carefully for traps and secret doors: No new traps or secret doors found." % [
			hero.get("name")
		])
		spawn_floating_text(h_pos, "NO NEW TRAPS", Color(0.7, 0.7, 0.7), 1.4)

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
	var h_pos = hero.get("grid_pos", Vector2i(-1, -1))
	if has_acted_this_turn:
		_log("[ACTION] %s has already taken an action this turn!" % hero.get("name", "Hero"))
		show_unavailable_notice("Not enough actions", h_pos)
		return { "success": false, "error": "Already acted this turn" }

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
		show_unavailable_notice("No adjacent detected trap", h_pos)
		return { "success": false, "error": "No trap found with id: " + trap_id }

	if target_trap.get("sprung", false) or target_trap.get("is_sprung", false):
		_log("[DISARM] The %s is already sprung and cannot be disarmed!" % str(target_trap.get("type", "trap")))
		return { "success": false, "error": "Trap is already sprung and cannot be disarmed" }

	var disarm_check = can_hero_disarm(hero)
	if not disarm_check.get("can_disarm", false):
		_log("[DISARM] %s cannot disarm traps without a Tool Kit! (Only the Dwarf has innate disarm mastery)." % hero.get("name"))
		show_unavailable_notice("Tool Kit required to disarm", h_pos)
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
		h["grid_pos"] = starting_stair
		h["has_departed_start"] = false
		_log("[ENTER] %s descends the spiral stairway and joins the party at (%d, %d)!" % [
			h.get("name"), starting_stair.x, starting_stair.y
		])

func end_turn() -> void:
	if not pending_flash_item.is_empty():
		var p = pending_flash_item.duplicate(true)
		pending_flash_item = {}
		trigger_flash_new_item(p)
	if current_phase == "hero_phase":
		var cur_hero = get_active_hero()
		if cur_hero.size() > 0:
			if has_moved_this_turn or has_acted_this_turn:
				cur_hero["has_departed_start"] = true
		active_hero_idx = (active_hero_idx + 1) % maxi(1, heroes.size())
		if active_hero_idx == 0:
			current_phase = "gm_phase"
			turn_player_losses.clear()
			turn_losses_active = false
			_log("=== Zargon / Game Master Phase Begins ===")
			if current_role == "player" and not is_headless_mode():
				call_deferred("start_ai_monster_turn_sequence")
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
	auto_save_game()

func _calculate_monster_movement_path(m: Dictionary, target_hero: Dictionary, max_moves: int) -> Array[Vector2i]:
	var path: Array[Vector2i] = []
	var m_pos = _to_grid_pos(m.get("grid_pos", Vector2i(-1, -1)))
	path.append(m_pos)
	if target_hero.is_empty() or max_moves <= 0:
		return path

	var h_pos = _to_grid_pos(target_hero.get("grid_pos", Vector2i(-1, -1)))
	var mid = str(m.get("id", ""))
	var curr_pos = m_pos
	var steps_taken = 0

	while steps_taken < max_moves:
		var curr_dist = absi(h_pos.x - curr_pos.x) + absi(h_pos.y - curr_pos.y)
		if curr_dist <= 1:
			# Reached adjacent tile to hero; stop immediately! Monsters never enter hero squares
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
			# Strictly forbid entering edge tiles or starting stair
			if is_border_tile(cand_pos) or cand_pos == starting_stair:
				continue
			# Strictly forbid entering any hero's tile
			if cand_pos == h_pos or is_tile_occupied_by_hero(cand_pos):
				continue
			# Cannot enter tile occupied by another monster
			if is_tile_occupied_by_monster(cand_pos, mid):
				continue
			# Cannot enter tile occupied by furniture
			if is_tile_occupied_by_furniture(cand_pos):
				continue
			# Cannot pass through walls, closed doors, or blockages
			if has_wall_between(curr_pos, cand_pos) or is_tile_wall_blocked(cand_pos):
				continue

			curr_pos = cand_pos
			path.append(curr_pos)
			moved_this_step = true
			break

		if not moved_this_step:
			break
		steps_taken += 1

	return path

func _execute_single_monster_action(m: Dictionary) -> int:
	if not m.get("is_alive", false):
		return 0
	if m.get("is_sleeping", false):
		_log("[SLEEP] %s is sound asleep and cannot move or attack." % m.get("name"))
		return 0
	if m.get("tempest_stunned", false):
		m["tempest_stunned"] = false # Recovers at end of missed turn
		_log("[TEMPEST] %s is caught in the howling winds and misses its turn!" % m.get("name"))
		return 0

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
		return 0

	var h_pos: Vector2i = _to_grid_pos(nearest_hero.get("grid_pos", Vector2i(0, 0)))
	var acts = 0

	var roll = TabletopDice.roll_movement()
	var max_moves = maxi(int(m.get("movementSquares", 4)), roll.total)
	var path = _calculate_monster_movement_path(m, nearest_hero, max_moves)

	if path.size() > 1:
		var final_pos = path[path.size() - 1]
		m["grid_pos"] = final_pos
		_log("[MOVE] %s rolls %d movement and moves towards %s to (%d, %d)." % [
			m.get("name"), roll.total, nearest_hero.get("name"), final_pos.x, final_pos.y
		])
		acts += 1

	var curr_pos = _to_grid_pos(m.get("grid_pos", Vector2i(-1, -1)))
	var final_dist = absi(h_pos.x - curr_pos.x) + absi(h_pos.y - curr_pos.y)
	if final_dist == 1:
		_log("[MONSTER] %s engages and attacks %s!" % [m.get("name"), nearest_hero.get("name")])
		dm_attack_hero(str(nearest_hero.get("id", "")), m)
		acts += 1

	return acts

func _process_enemy_turn(delta: float) -> void:
	if not is_enemy_turn_waiting or active_enemy_turn_monster_id == "":
		return

	enemy_turn_wait_timer -= delta

	var acting_m: Dictionary = {}
	for m in monsters:
		if str(m.get("id", "")) == active_enemy_turn_monster_id:
			acting_m = m
			break

	if acting_m.is_empty() or not acting_m.get("is_alive", false):
		_finish_current_enemy_turn()
		return

	match enemy_turn_stage:
		"rolling":
			enemy_turn_timer -= delta
			if enemy_turn_timer <= 0.0 or (active_dice_animation.get("settled", false) and enemy_turn_timer <= 0.25):
				# Dismiss movement dice roll tray
				if active_dice_animation.get("type", "") == "movement":
					active_dice_animation = {}
				if enemy_turn_path.size() > 1:
					enemy_turn_stage = "moving"
					enemy_turn_step_index = 0
					enemy_step_timer = enemy_step_duration
					_log("[MOVE] %s begins moving towards %s..." % [acting_m.get("name"), enemy_target_hero.get("name")])
				else:
					enemy_turn_stage = "pause_after_move"
					enemy_turn_timer = 0.8
				queue_redraw_all()

		"moving":
			enemy_step_timer -= delta
			if enemy_step_timer <= 0.0:
				enemy_turn_step_index += 1
				if enemy_turn_step_index < enemy_turn_path.size():
					var next_pos = enemy_turn_path[enemy_turn_step_index]
					acting_m["grid_pos"] = next_pos
					movement_trail.append(next_pos)
					enemy_movement_remaining = maxi(0, enemy_movement_remaining - 1)
					enemy_step_timer = enemy_step_duration
					_log("[MOVE] %s steps to (%d, %d)." % [acting_m.get("name"), next_pos.x, next_pos.y])
					_update_ui()
					queue_redraw_all()

				if enemy_turn_step_index >= enemy_turn_path.size() - 1:
					# Step-by-step movement finished! Enter post-move pause
					enemy_turn_stage = "pause_after_move"
					enemy_turn_timer = 0.9 # "with a nice pause so the user can see the enemy moved... pause... then the enemy action."
					if dice_label:
						dice_label.text = "⚔️ %s moved to (%d, %d)..." % [acting_m.get("name"), acting_m["grid_pos"].x, acting_m["grid_pos"].y]
					queue_redraw_all()

		"pause_after_move":
			enemy_turn_timer -= delta
			if enemy_turn_timer <= 0.0:
				# Pause finished! Proceed to enemy action
				enemy_turn_stage = "acting"

		"acting":
			# Execute enemy action (melee attack if adjacent to hero)
			var m_pos = _to_grid_pos(acting_m.get("grid_pos", Vector2i(-1, -1)))
			var h_pos = _to_grid_pos(enemy_target_hero.get("grid_pos", Vector2i(-1, -1)))
			var dist = absi(h_pos.x - m_pos.x) + absi(h_pos.y - m_pos.y)

			if dist == 1 and int(enemy_target_hero.get("current_bp", 0)) > 0:
				_log("[MONSTER] %s engages and attacks %s!" % [acting_m.get("name"), enemy_target_hero.get("name")])
				dm_attack_hero(str(enemy_target_hero.get("id", "")), acting_m)
				enemy_turn_stage = "waiting_for_action"
				enemy_turn_timer = 2.4 # allow combat dice tray and damage plaque to display
			else:
				# No melee attack possible
				_finish_current_enemy_turn()

		"waiting_for_action":
			enemy_turn_timer -= delta
			if enemy_turn_timer <= 0.0 or active_dice_animation.is_empty():
				_finish_current_enemy_turn()

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
	var last_acted_id = ""
	for m in active_monsters:
		var a = _execute_single_monster_action(m)
		acts += a
		if a > 0 or last_acted_id == "":
			last_acted_id = str(m.get("id", ""))
	if last_acted_id != "":
		active_enemy_turn_monster_id = last_acted_id
		is_enemy_turn_waiting = false
		enemy_turn_wait_timer = 0.0
		_update_ui()
		queue_redraw_all()

	end_turn()
	return { "success": true, "acted": acts, "highlighted_monster_id": last_acted_id }

func start_ai_monster_turn_sequence() -> Dictionary:
	_log("[GM] Minions of Zargon stir in the darkness...")
	var live_monsters = monsters.filter(func(m): return m.get("is_alive", false))
	var active_monsters = live_monsters.filter(func(m):
		var r_id = str(m.get("roomId", ""))
		return r_id == "" or revealed_rooms.has(r_id)
	)

	if active_monsters.is_empty():
		_log("[GM] No active monsters in sight. The dungeon echoes with distant whispers.")
		end_turn()
		return { "success": true, "acted": 0 }

	pending_enemy_turn_monsters.clear()
	for m in active_monsters:
		pending_enemy_turn_monsters.append(m)

	_begin_next_enemy_turn_in_sequence()
	return {
		"success": true,
		"pending_count": pending_enemy_turn_monsters.size(),
		"active_monster_id": active_enemy_turn_monster_id,
		"is_waiting": is_enemy_turn_waiting,
		"wait_duration": enemy_turn_wait_duration
	}

func _begin_next_enemy_turn_in_sequence() -> void:
	if pending_enemy_turn_monsters.is_empty():
		active_enemy_turn_monster_id = ""
		is_enemy_turn_waiting = false
		enemy_turn_wait_timer = 0.0
		enemy_turn_stage = "idle"
		movement_trail.clear()
		end_turn()
		return

	var current_m = pending_enemy_turn_monsters.pop_front()
	active_enemy_turn_monster_id = str(current_m.get("id", ""))

	if not current_m.get("is_alive", false):
		_begin_next_enemy_turn_in_sequence()
		return
	if current_m.get("is_sleeping", false):
		_log("[SLEEP] %s is sound asleep and cannot move or attack." % current_m.get("name"))
		_begin_next_enemy_turn_in_sequence()
		return
	if current_m.get("tempest_stunned", false):
		current_m["tempest_stunned"] = false # Recovers at end of missed turn
		_log("[TEMPEST] %s is caught in the howling winds and misses its turn!" % current_m.get("name"))
		_begin_next_enemy_turn_in_sequence()
		return

	# Find nearest living hero on board
	var m_pos = _to_grid_pos(current_m.get("grid_pos", Vector2i(0, 0)))
	var nearest_hero: Dictionary = {}
	var min_dist: int = 9999
	for h in heroes:
		if h.get("is_on_board", false) and int(h.get("current_bp", 0)) > 0:
			var h_pos = _to_grid_pos(h.get("grid_pos", Vector2i(-1, -1)))
			if h_pos.x < 0 or h_pos.y < 0:
				continue
			var dist = absi(h_pos.x - m_pos.x) + absi(h_pos.y - m_pos.y)
			if dist < min_dist:
				min_dist = dist
				nearest_hero = h

	if nearest_hero.is_empty():
		_begin_next_enemy_turn_in_sequence()
		return

	enemy_target_hero = nearest_hero

	# 1. Roll 2d6 movement dice for enemy character!
	var roll = TabletopDice.roll_movement()
	var dice_vals = [roll.d1, roll.d2]
	enemy_movement_rolled_total = roll.total
	var max_moves = maxi(int(current_m.get("movementSquares", 4)), roll.total)
	enemy_movement_remaining = max_moves

	_log("[ENEMY TURN] %s prepares to act! (Rolling 2d6 movement: [%d, %d] = %d squares)" % [
		current_m.get("name"), roll.d1, roll.d2, roll.total
	])
	if dice_label:
		dice_label.text = "⚔️ [ENEMY TURN] %s: Rolled %d squares!" % [current_m.get("name"), roll.total]

	trigger_movement_dice_roll(roll, str(current_m.get("name", "Enemy")), dice_vals)
	show_flashy_roll_number(roll.total)
	if not active_dice_animation.is_empty():
		active_dice_animation["total_duration"] = 1.0

	# 2. Compute movement path
	enemy_turn_path = _calculate_monster_movement_path(current_m, nearest_hero, max_moves)
	enemy_turn_step_index = 0

	# 3. Initialize movement trail at origin tile
	movement_trail = [m_pos]

	# 4. Set state
	is_enemy_turn_waiting = true
	enemy_turn_wait_timer = enemy_turn_wait_duration
	enemy_turn_stage = "rolling"
	enemy_turn_timer = 1.0

	_update_ui()
	queue_redraw_all()

func skip_enemy_turn_timeout() -> Dictionary:
	if not is_enemy_turn_waiting:
		return { "success": false, "message": "No enemy turn timeout active" }

	var m_id = active_enemy_turn_monster_id
	_log("[SKIP] Enemy turn sequence skipped by user for monster: %s" % m_id)

	var acting_m: Dictionary = {}
	for m in monsters:
		if str(m.get("id", "")) == m_id:
			acting_m = m
			break

	if not acting_m.is_empty() and acting_m.get("is_alive", false):
		# If monster has not yet completed its move, snap to final destination on path
		if enemy_turn_path.size() > 1:
			var final_pos = enemy_turn_path[enemy_turn_path.size() - 1]
			acting_m["grid_pos"] = final_pos
			movement_trail = enemy_turn_path.duplicate()
			_log("[MOVE] %s immediately moves to (%d, %d)." % [acting_m.get("name"), final_pos.x, final_pos.y])

		# Dismiss any active movement dice animation
		if active_dice_animation.get("type", "") == "movement":
			active_dice_animation = {}

		# If adjacent to target hero, perform melee attack immediately
		if not enemy_target_hero.is_empty():
			var m_pos = _to_grid_pos(acting_m.get("grid_pos", Vector2i(-1, -1)))
			var h_pos = _to_grid_pos(enemy_target_hero.get("grid_pos", Vector2i(-1, -1)))
			var dist = absi(h_pos.x - m_pos.x) + absi(h_pos.y - m_pos.y)
			if dist == 1 and int(enemy_target_hero.get("current_bp", 0)) > 0:
				_log("[MONSTER] %s engages and attacks %s!" % [acting_m.get("name"), enemy_target_hero.get("name")])
				dm_attack_hero(str(enemy_target_hero.get("id", "")), acting_m)

	_finish_current_enemy_turn()
	return { "success": true, "skipped_monster_id": m_id }

func _finish_current_enemy_turn() -> void:
	if not is_enemy_turn_waiting:
		return

	is_enemy_turn_waiting = false
	enemy_turn_wait_timer = 0.0
	enemy_turn_stage = "idle"
	movement_trail.clear()
	enemy_turn_path.clear()
	enemy_turn_step_index = 0
	enemy_movement_remaining = 0

	_update_ui()
	queue_redraw_all()

	if pending_enemy_turn_monsters.size() > 0:
		_begin_next_enemy_turn_in_sequence()
	else:
		active_enemy_turn_monster_id = ""
		end_turn()

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
		if btn_armory:
			btn_armory.visible = false
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
		if btn_armory:
			btn_armory.visible = false
		if btn_end_turn:
			btn_end_turn.visible = false
		if dice_label:
			dice_label.text = "Minions of Zargon stir in the darkness..."
	else:
		# Hero Phase (Player)
		if btn_summon:
			btn_summon.visible = false

		# Armory Equipment Action Button
		if btn_armory:
			var party_g = get_total_party_gold()
			btn_armory.visible = true
			btn_armory.disabled = (party_g <= 0)
			btn_armory.text = "Armory (%d)" % party_g
			_update_action_tile(btn_armory, "armory", party_g, "Imperial Armory (%d GP)" % party_g, "Visit the Imperial Armory to buy weapons, armor, and gear.", Color(0.92, 0.75, 0.22, 0.95))

		# Spell Casting Action Button
		if btn_cast_spell:
			var h_spells: Array = hero.get("spells", [])
			var avail_spells: Array = _get_available_spells(hero)
			if h_spells.size() > 0:
				btn_cast_spell.visible = true
				var all_spent = (avail_spells.size() == 0)
				btn_cast_spell.disabled = has_acted_this_turn or movement_closed or (moved_before_action and has_acted_this_turn) or all_spent
				btn_cast_spell.text = "🔮 Spell (%d/%d)" % [avail_spells.size(), h_spells.size()]
				var tip_desc = "Open spellbook to select and cast arcane or elemental spells."
				if all_spent:
					tip_desc = "All memorized spells have been cast and are exhausted until the quest concludes."
				_update_action_tile(btn_cast_spell, "spell", avail_spells.size(), "🔮 Cast Spell (%d/%d Available)" % [avail_spells.size(), h_spells.size()], tip_desc, Color(0.55, 0.25, 0.95, 0.92))
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
	_sync_map_end_turn_button()
	_sync_disabled_click_shields()

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
	flashy_subtitle_label.text = "MOVEMENT ROLL"
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
		flashy_subtitle_label.text = "ROLLED %d SQUARES" % total
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
			btn_toggle_defeated.text = "Defeated (0)"
			btn_toggle_defeated.disabled = true
			btn_toggle_defeated.modulate = Color(0.7, 0.7, 0.7, 0.6)
		else:
			btn_toggle_defeated.disabled = false
			btn_toggle_defeated.modulate = Color(1.0, 1.0, 1.0, 1.0)
			if show_defeated_monsters:
				btn_toggle_defeated.text = "Hide Defeated (%d)" % dead_count
			else:
				btn_toggle_defeated.text = "Show Defeated (%d)" % dead_count
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
			enemies_empty_label.text = "All sighted foes have been defeated!\nClick 'Show Defeated' above to view fallen enemies."
			enemies_empty_label.visible = true
		else:
			enemies_empty_label.visible = false

func _create_hero_card(h: Dictionary, is_active: bool) -> PanelContainer:
	var card = PanelContainer.new()
	card.custom_minimum_size = Vector2(228, 122)
	card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	card.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	card.mouse_filter = Control.MOUSE_FILTER_STOP
	card.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND

	var is_item_flashing = not flashing_item.is_empty() and bool(flashing_item.get("active", false)) and str(h.get("id")) == str(flashing_item.get("hero_id"))

	var cur_bp = int(h.get("current_bp", 8))
	var max_bp = int(h.get("bodyPoints", 8))
	var cur_mp = int(h.get("current_mp", 2))
	var max_mp = int(h.get("mindPoints", 2))
	var is_dead = cur_bp <= 0
	var is_on_board = bool(h.get("is_on_board", false))
	var h_id = str(h.get("id", "")).to_lower()

	var sb = StyleBoxFlat.new()
	sb.corner_radius_top_left = 6
	sb.corner_radius_top_right = 6
	sb.corner_radius_bottom_left = 6
	sb.corner_radius_bottom_right = 6

	if is_item_flashing:
		var pulse = 0.80 + 0.20 * sin(Time.get_ticks_msec() * 0.015)
		sb.bg_color = Color(0.18, 0.16, 0.10, 0.98)
		sb.border_color = Color(1.0, 0.85, 0.2, pulse)
		sb.border_width_left = 3; sb.border_width_top = 3; sb.border_width_right = 3; sb.border_width_bottom = 3
		sb.shadow_color = Color(1.0, 0.85, 0.2, 0.65 * pulse)
		sb.shadow_size = 8
	elif is_dead:
		sb.bg_color = Color(0.24, 0.05, 0.05, 0.95)
		sb.border_color = Color(0.9, 0.15, 0.15, 1.0)
		sb.border_width_left = 2; sb.border_width_top = 2; sb.border_width_right = 2; sb.border_width_bottom = 2
		sb.shadow_color = Color(0.9, 0.1, 0.1, 0.4)
		sb.shadow_size = 4
	elif is_active:
		sb.bg_color = Color(0.14, 0.18, 0.26, 0.96)
		sb.border_color = Color(1.0, 0.82, 0.2, 1.0)
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

	# AI Generated Image Background Underlay
	var bg_tex = get_hero_card_bg_texture(h_id)
	if bg_tex:
		var bg_rect = TextureRect.new()
		bg_rect.texture = bg_tex
		bg_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		bg_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
		bg_rect.anchor_right = 1.0
		bg_rect.anchor_bottom = 1.0
		bg_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
		if is_dead:
			bg_rect.modulate = Color(0.65, 0.2, 0.2, 0.25)
		elif is_active:
			bg_rect.modulate = Color(1.0, 0.95, 0.85, 0.45)
		else:
			bg_rect.modulate = Color(0.85, 0.90, 1.0, 0.30)
		card.add_child(bg_rect)

	# Click card to open full character sheet dialog
	card.tooltip_text = "Click to inspect %s's full character sheet" % get_hero_display_title(h)
	card.gui_input.connect(func(event: InputEvent):
		if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
			if is_targeting_active():
				resolve_targeting_entity("hero", h_id)
			else:
				open_hero_detail_modal(h)
	)

	var margin = MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 6)
	margin.add_theme_constant_override("margin_right", 6)
	margin.add_theme_constant_override("margin_top", 4)
	margin.add_theme_constant_override("margin_bottom", 4)
	card.add_child(margin)

	var main_hbox = HBoxContainer.new()
	main_hbox.add_theme_constant_override("separation", 6)
	margin.add_child(main_hbox)

	# Hero Portrait Button (Clicking inspects character sheet, replacing legacy INFO button)
	var portrait_btn = Button.new()
	portrait_btn.name = "HeroPortraitButton"
	portrait_btn.custom_minimum_size = Vector2(38, 38)
	portrait_btn.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	portrait_btn.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	portrait_btn.tooltip_text = "Click portrait to inspect %s's full Character Sheet" % get_hero_display_title(h)

	var token_tex = get_hero_token_texture(h)
	if token_tex:
		portrait_btn.icon = token_tex
		portrait_btn.expand_icon = true
		portrait_btn.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
	else:
		portrait_btn.text = h_id.substr(0, 3).to_upper()

	var port_sb = StyleBoxFlat.new()
	port_sb.set_corner_radius_all(6)
	if is_active:
		port_sb.bg_color = Color(0.2, 0.18, 0.08, 0.8)
		port_sb.border_color = Color(1.0, 0.85, 0.25, 0.95)
		port_sb.set_border_width_all(2)
	elif is_dead:
		port_sb.bg_color = Color(0.2, 0.05, 0.05, 0.8)
		port_sb.border_color = Color(0.8, 0.2, 0.2, 0.7)
		port_sb.set_border_width_all(1)
	else:
		port_sb.bg_color = Color(0.08, 0.12, 0.18, 0.8)
		port_sb.border_color = Color(0.35, 0.50, 0.65, 0.75)
		port_sb.set_border_width_all(1)
	portrait_btn.add_theme_stylebox_override("normal", port_sb)
	portrait_btn.add_theme_stylebox_override("hover", port_sb)
	portrait_btn.add_theme_stylebox_override("pressed", port_sb)

	portrait_btn.pressed.connect(func():
		if is_targeting_active():
			resolve_targeting_entity("hero", h_id)
		else:
			open_hero_detail_modal(h)
	)
	main_hbox.add_child(portrait_btn)

	var vbox = VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 2)
	vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	main_hbox.add_child(vbox)

	# Row 1: Header (Name + Class & Status Badge)
	var hdr_row = HBoxContainer.new()
	var name_lbl = Label.new()
	name_lbl.text = get_hero_display_title(h)
	name_lbl.tooltip_text = "Name: %s | Class: %s\nClick anywhere to view full character sheet." % [get_hero_character_name(h), get_hero_class_name(h)]
	name_lbl.add_theme_font_size_override("font_size", 11)
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
	status_tag.add_theme_font_size_override("font_size", 9)
	if is_dead:
		status_tag.text = "[DEAD]"
		status_tag.add_theme_color_override("font_color", Color(1.0, 0.2, 0.2, 1.0))
	elif is_active:
		status_tag.text = "[ACTIVE]"
		status_tag.add_theme_color_override("font_color", Color(1.0, 0.85, 0.2, 1.0))
	elif not is_on_board:
		status_tag.text = "[Off Board]"
		status_tag.add_theme_color_override("font_color", Color(0.55, 0.60, 0.70, 0.8))
	else:
		status_tag.text = "[On Board]"
		status_tag.add_theme_color_override("font_color", Color(0.3, 0.85, 0.45, 0.9))
	hdr_row.add_child(status_tag)
	vbox.add_child(hdr_row)

	# Row 2: Vitals (BP + MP)
	var vitals_row = HBoxContainer.new()
	vitals_row.add_theme_constant_override("separation", 6)

	var bp_box = HBoxContainer.new()
	bp_box.add_theme_constant_override("separation", 3)
	bp_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var bp_lbl = Label.new()
	bp_lbl.text = "BP %d/%d" % [cur_bp, max_bp]
	bp_lbl.add_theme_font_size_override("font_size", 9)
	bp_box.add_child(bp_lbl)

	var bp_bar = ProgressBar.new()
	bp_bar.custom_minimum_size = Vector2(0, 6)
	bp_bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bp_bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	bp_bar.show_percentage = false
	bp_bar.max_value = max_bp
	bp_bar.value = max(0, cur_bp)
	var bp_pct = float(cur_bp) / max(1.0, float(max_bp))
	var bp_col = Color(0.2, 0.85, 0.35, 1.0)
	if is_dead: bp_col = Color(0.85, 0.15, 0.15, 1.0)
	elif bp_pct <= 0.25: bp_col = Color(0.95, 0.25, 0.25, 1.0)
	elif bp_pct <= 0.5: bp_col = Color(1.0, 0.75, 0.2, 1.0)
	var bp_fill = StyleBoxFlat.new()
	bp_fill.bg_color = bp_col
	bp_fill.set_corner_radius_all(2)
	bp_bar.add_theme_stylebox_override("fill", bp_fill)
	var bp_bg = StyleBoxFlat.new()
	bp_bg.bg_color = Color(0.08, 0.10, 0.14, 0.9)
	bp_bar.add_theme_stylebox_override("background", bp_bg)
	bp_box.add_child(bp_bar)
	vitals_row.add_child(bp_box)

	var mp_box = HBoxContainer.new()
	mp_box.add_theme_constant_override("separation", 3)
	mp_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var mp_lbl = Label.new()
	mp_lbl.text = "MP %d/%d" % [cur_mp, max_mp]
	mp_lbl.add_theme_font_size_override("font_size", 9)
	mp_box.add_child(mp_lbl)

	var mp_bar = ProgressBar.new()
	mp_bar.custom_minimum_size = Vector2(0, 6)
	mp_bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mp_bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	mp_bar.show_percentage = false
	mp_bar.max_value = max_mp
	mp_bar.value = max(0, cur_mp)
	var mp_fill = StyleBoxFlat.new()
	mp_fill.bg_color = Color(0.2, 0.7, 0.95, 1.0)
	mp_fill.set_corner_radius_all(2)
	mp_bar.add_theme_stylebox_override("fill", mp_fill)
	var mp_bg = StyleBoxFlat.new()
	mp_bg.bg_color = Color(0.08, 0.10, 0.14, 0.9)
	mp_bar.add_theme_stylebox_override("background", mp_bg)
	mp_box.add_child(mp_bar)
	vitals_row.add_child(mp_box)
	vbox.add_child(vitals_row)

	# Row 3: Combat Stats, Status Buffs & Gold Line
	var atk_d = get_hero_attack_dice(h)
	var def_d = get_hero_defend_dice(h)
	var stat_row = HBoxContainer.new()
	stat_row.add_theme_constant_override("separation", 5)

	var dice_stat = Label.new()
	dice_stat.text = "ATK %dd  DEF %dd" % [atk_d, def_d]
	dice_stat.add_theme_font_size_override("font_size", 9)
	dice_stat.add_theme_color_override("font_color", Color(0.85, 0.88, 0.95, 0.95))
	stat_row.add_child(dice_stat)

	# Active Buff Badges (Pills)
	var buff_badges: Array[Dictionary] = []
	if h.get("rock_skin_active", false):
		buff_badges.append({ "code": "RS", "desc": "Rock Skin (Active Earth Spell Buff)\nEffect: Grants +1 Defend Die. Lasts until hero suffers damage.", "color": Color(0.65, 0.60, 0.55) })
	if h.get("courage_active", false):
		buff_badges.append({ "code": "CR", "desc": "Courage (Active Fire Spell Buff)\nEffect: Grants +2 Attack Dice on melee attacks while monsters are visible.", "color": Color(0.95, 0.35, 0.25) })
	if h.get("swift_wind_active", false):
		buff_badges.append({ "code": "SW", "desc": "Swift Wind (Active Air Spell Buff)\nEffect: Doubles movement roll for this turn.", "color": Color(0.35, 0.85, 0.95) })
	if h.get("pass_through_rock_active", false):
		buff_badges.append({ "code": "PR", "desc": "Pass Through Rock (Active Earth Spell Buff)\nEffect: Allows hero to traverse solid rock walls for 1 turn.", "color": Color(0.75, 0.70, 0.65) })
	if h.get("veil_of_mist_active", false):
		buff_badges.append({ "code": "VM", "desc": "Veil of Mist (Active Water Spell Buff)\nEffect: Allows hero to move unseen through enemy squares.", "color": Color(0.40, 0.70, 0.85) })
	if h.get("is_sleeping", false):
		buff_badges.append({ "code": "ZZ", "desc": "Sleep (Status Condition)\nEffect: Hero is asleep and cannot move or take actions.", "color": Color(0.60, 0.50, 0.80) })

	for bb in buff_badges:
		var pill = PanelContainer.new()
		var psb = StyleBoxFlat.new()
		psb.bg_color = bb.color * Color(1, 1, 1, 0.30)
		psb.border_color = bb.color
		psb.set_border_width_all(1)
		psb.set_corner_radius_all(3)
		pill.add_theme_stylebox_override("panel", psb)
		var bb_lbl = Label.new()
		bb_lbl.text = bb.code
		bb_lbl.add_theme_font_size_override("font_size", 8)
		bb_lbl.add_theme_color_override("font_color", Color(1.0, 1.0, 1.0, 1.0))
		bb_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		bb_lbl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		var pmarg = MarginContainer.new()
		pmarg.add_theme_constant_override("margin_left", 3)
		pmarg.add_theme_constant_override("margin_right", 3)
		pmarg.add_theme_constant_override("margin_top", 1)
		pmarg.add_theme_constant_override("margin_bottom", 1)
		pmarg.add_child(bb_lbl)
		pill.add_child(pmarg)
		pill.tooltip_text = bb.desc
		pill.mouse_filter = Control.MOUSE_FILTER_PASS
		stat_row.add_child(pill)

	var cur_gold = int(h.get("gold", 0))
	var gold_box = PanelContainer.new()
	gold_box.name = "GoldBox"
	var gb_sb = StyleBoxFlat.new()
	gb_sb.bg_color = Color(0.14, 0.11, 0.05, 0.88) if cur_gold == 0 else Color(0.18, 0.14, 0.05, 0.95)
	gb_sb.border_color = Color(0.40, 0.34, 0.18, 0.65) if cur_gold == 0 else Color(0.95, 0.80, 0.25, 0.85)
	gb_sb.set_border_width_all(1)
	gb_sb.set_corner_radius_all(3)
	gold_box.add_theme_stylebox_override("panel", gb_sb)

	var gb_marg = MarginContainer.new()
	gb_marg.add_theme_constant_override("margin_left", 4)
	gb_marg.add_theme_constant_override("margin_right", 4)
	gb_marg.add_theme_constant_override("margin_top", 1)
	gb_marg.add_theme_constant_override("margin_bottom", 1)

	var gold_lbl = Label.new()
	gold_lbl.name = "GoldLabel"
	if is_item_flashing and str(flashing_item.get("type")) == "gold":
		gold_lbl.text = "+%d GP! (%d)" % [int(flashing_item.get("amount", 0)), cur_gold]
		gold_lbl.add_theme_color_override("font_color", Color(1.0, 0.95, 0.25, 1.0))
	else:
		gold_lbl.text = "%d GP" % cur_gold
		gold_lbl.add_theme_color_override("font_color", Color(0.85, 0.78, 0.62, 0.95) if cur_gold == 0 else Color(1.0, 0.85, 0.35, 1.0))
	gold_lbl.add_theme_font_size_override("font_size", 9)
	gold_lbl.clip_text = false
	gold_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	gold_lbl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER

	gb_marg.add_child(gold_lbl)
	gold_box.add_child(gb_marg)
	gold_box.tooltip_text = "Gold Stash: %d Gold Coins" % cur_gold
	gold_box.size_flags_horizontal = Control.SIZE_SHRINK_END
	gold_box.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	stat_row.add_child(gold_box)
	vbox.add_child(stat_row)

	# Row 4: AI Art Equipment, Weapon, Armor, and Spell Icons (Up to 3 rows of 7 icons with {+NUM} overflow)
	var icon_grid = GridContainer.new()
	icon_grid.name = "HeroIconGrid"
	icon_grid.columns = 7
	icon_grid.add_theme_constant_override("h_separation", 2)
	icon_grid.add_theme_constant_override("v_separation", 2)

	var icon_items: Array[Dictionary] = []

	# 1. Equipped Weapon(s)
	var eq_wep = str(h.get("equipped_weapon", h.get("weapon", ""))).strip_edges().to_lower()
	if eq_wep != "" and eq_wep != "unarmed" and eq_wep != "fists":
		var w_meta = HeroQuestEquipment.get_weapon(eq_wep)
		var w_name = str(w_meta.get("name", eq_wep.replace("_", " ").capitalize()))
		var w_dice = int(w_meta.get("attack_dice", 2))
		var w_cost = int(w_meta.get("cost", 150))
		var w_desc = str(w_meta.get("description", ""))
		icon_items.append({
			"type": "weapon",
			"category": "weapon",
			"id": eq_wep,
			"name": w_name,
			"icon": get_ai_icon_texture("weapon", eq_wep),
			"tooltip": "[EQUIPPED WEAPON]\n%s\nAttack: %d Combat Dice\nCost: %d GP\n%s" % [w_name, w_dice, w_cost, w_desc]
		})

	# 2. Equipped Armor
	var eq_armor = h.get("equipped_armor", [])
	for a_id in eq_armor:
		var a_str = str(a_id).strip_edges().to_lower()
		var a_meta = HeroQuestEquipment.get_armor(a_str)
		var a_name = str(a_meta.get("name", a_str.replace("_", " ").capitalize()))
		var a_bonus = a_meta.get("defend_bonus", a_meta.get("base_defend_dice", 1))
		var a_slot = str(a_meta.get("slot", "body")).capitalize()
		var a_desc = str(a_meta.get("description", ""))
		icon_items.append({
			"type": "armor",
			"category": "armor",
			"id": a_str,
			"name": a_name,
			"icon": get_ai_icon_texture("armor", a_str),
			"tooltip": "[EQUIPPED ARMOR]\n%s (Slot: %s)\nDefense: %s\n%s" % [a_name, a_slot, str(a_bonus), a_desc]
		})

	# 3. Memorized Spells
	var hero_spells: Array = h.get("spells", [])
	for s_id in hero_spells:
		var s_str = str(s_id).strip_edges().to_lower()
		var s_meta = HeroQuestSpells.get_spell(s_str)
		var s_name = str(s_meta.get("name", s_str.replace("_", " ").capitalize()))
		var s_deck = str(s_meta.get("deck", "magic")).capitalize()
		var s_desc = str(s_meta.get("description", ""))
		var is_spent = is_spell_used(h, s_str)
		var sp_tooltip = ""
		if is_spent:
			sp_tooltip = "[SPENT SPELL — EXHAUSTED]\n%s (%s Magic)\n%s\nThis spell has already been cast and is exhausted until the end of the quest." % [s_name, s_deck, s_desc]
		else:
			sp_tooltip = "[SPELL]\n%s (%s Magic)\n%s\nClick to select target and cast spell." % [s_name, s_deck, s_desc]
		icon_items.append({
			"type": "spell",
			"category": "spell",
			"id": s_str,
			"name": s_name,
			"icon": get_ai_icon_texture("spell", s_str),
			"tooltip": sp_tooltip,
			"is_spent": is_spent
		})

	# 4. Inventory Items / Potions / Tools / Backup Weapons
	var hero_inv: Array = h.get("inventory", [])
	for it in hero_inv:
		var it_str = ""
		if it is Dictionary:
			it_str = str(it.get("id", it.get("item", it.get("name", "")))).strip_edges().to_lower()
		else:
			it_str = str(it).strip_edges().to_lower()
		if it_str == eq_wep or eq_armor.has(it_str):
			continue
		var it_meta = HeroQuestEquipment.get_item(it_str)
		var iname = str(it_meta.get("name", it_str.replace("_", " ").capitalize()))
		var ival = int(it_meta.get("cost", it_meta.get("value", 50)))
		var idesc = str(it_meta.get("description", it_meta.get("effect", "")))
		var it_cat = "item"
		if HeroQuestEquipment.get_weapon(it_str).size() > 0 or "broadsword" in it_str or "shortsword" in it_str or "axe" in it_str or "bow" in it_str or "dagger" in it_str or "staff" in it_str:
			it_cat = "weapon"
		elif HeroQuestEquipment.get_armor(it_str).size() > 0 or "shield" in it_str or "helm" in it_str or "mail" in it_str:
			it_cat = "armor"
		elif HeroQuestSpells.get_spell(it_str).size() > 0:
			it_cat = "spell"

		var is_this_flashing = is_item_flashing and str(flashing_item.get("type")) == "item" and (str(flashing_item.get("name")) == iname or it_str == str(flashing_item.get("item_id", "")))
		var tip = ""
		if is_this_flashing:
			tip = "[NEW ITEM ACQUIRED!]\n%s\nValue: %d GP\n%s\nClick to use item." % [iname, ival, idesc]
		elif it_cat == "weapon":
			tip = "[INVENTORY WEAPON]\n%s\nAttack: %d Combat Dice\nCost: %d GP\n%s" % [iname, int(it_meta.get("attack_dice", 2)), ival, idesc]
		elif it_cat == "armor":
			tip = "[INVENTORY ARMOR]\n%s\nCost: %d GP\n%s" % [iname, ival, idesc]
		else:
			tip = "[INVENTORY ITEM]\n%s\nValue: %d GP\n%s\nClick to use item." % [iname, ival, idesc]
		icon_items.append({
			"type": it_cat,
			"category": it_cat,
			"id": it_str,
			"name": iname,
			"icon": get_ai_icon_texture(it_cat, it_str),
			"tooltip": tip,
			"flashing": is_this_flashing
		})

	# 5. Innate Abilities (e.g. Dwarf Trap Mastery)
	var disarm_check = can_hero_disarm(h)
	if disarm_check.get("is_dwarf", false):
		icon_items.append({
			"type": "ability",
			"category": "item",
			"id": "tool_kit",
			"name": "Trap Mastery",
			"icon": get_ai_icon_texture("item", "tool_kit"),
			"tooltip": "[INNATE ABILITY]\nTrap Mastery (Innate Dwarf Ability)\nClass: Dwarf\nEffect: Automatically disarms adjacent detected traps without requiring a Tool Kit."
		})

	# 6. Adjacent Detected Trap Disarm Button
	if is_active and disarm_check.get("can_disarm", false):
		var adj_traps = get_adjacent_detected_traps()
		if not adj_traps.is_empty():
			icon_items.append({
				"type": "disarm_action",
				"category": "item",
				"id": "tool_kit",
				"name": "Disarm Trap",
				"icon": get_ai_icon_texture("item", "tool_kit"),
				"tooltip": "Disarm adjacent detected trap"
			})

	# Up to 3 rows of 7 icons (21 slots max) then {+NUM} overflow
	var total_icons = icon_items.size()
	var max_visible_slots = 21
	var num_to_render = total_icons
	var overflow_count = 0

	if total_icons > max_visible_slots:
		num_to_render = max_visible_slots - 1
		overflow_count = total_icons - num_to_render

	for idx in range(num_to_render):
		var itm = icon_items[idx]
		var itype = itm.get("type", "item")
		var is_spent = bool(itm.get("is_spent", false))
		var ibtn = Button.new()
		ibtn.custom_minimum_size = Vector2(20, 20)
		var itex: Texture2D = itm.get("icon")
		if itex:
			ibtn.icon = itex
			ibtn.expand_icon = true
			ibtn.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
		else:
			ibtn.text = str(itm.get("name", "")).substr(0, 3).to_upper()
			ibtn.add_theme_font_size_override("font_size", 7)
		ibtn.tooltip_text = itm.get("tooltip", "")

		var b_sb = StyleBoxFlat.new()
		b_sb.set_corner_radius_all(3)
		if is_spent:
			b_sb.bg_color = Color(0.06, 0.07, 0.09, 0.85)
			b_sb.border_color = Color(0.35, 0.22, 0.25, 0.5)
			b_sb.set_border_width_all(1)
		else:
			b_sb.bg_color = Color(0.10, 0.13, 0.18, 0.85)
			b_sb.border_color = Color(0.3, 0.45, 0.6, 0.6)
			b_sb.set_border_width_all(1)

		var is_btn_targeted = (is_targeting_active() and str(active_targeting.get("id")) == str(itm.get("id")) and str(active_targeting.get("hero_id")) == str(h.get("id")))
		if is_btn_targeted:
			b_sb.bg_color = Color(0.28, 0.22, 0.08, 0.95)
			b_sb.border_color = Color(1.0, 0.85, 0.25, 1.0)
			b_sb.set_border_width_all(2)

		ibtn.add_theme_stylebox_override("normal", b_sb)

		if is_spent:
			ibtn.modulate = Color(0.38, 0.38, 0.42, 0.60)
		elif bool(itm.get("flashing", false)):
			ibtn.modulate = Color(1.0, 0.95, 0.25, 1.0)

		# Button interactions
		if itype == "spell":
			if is_active:
				if is_spent:
					ibtn.disabled = true
					var s_shield = Control.new()
					s_shield.name = "DisabledClickShield"
					s_shield.set_anchors_preset(Control.PRESET_FULL_RECT)
					s_shield.mouse_filter = Control.MOUSE_FILTER_STOP
					s_shield.gui_input.connect(func(ev: InputEvent):
						if ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT:
							show_unavailable_notice("Spell exhausted this quest", Vector2i(-1, -1), ibtn.global_position + ibtn.size * 0.5)
					)
					ibtn.add_child(s_shield)
				else:
					ibtn.disabled = has_acted_this_turn
					var sp_id = str(itm.get("id"))
					var hid = str(h.get("id"))
					ibtn.pressed.connect(func(): toggle_targeting("spell", sp_id, hid))
					if ibtn.disabled:
						var s_shield = Control.new()
						s_shield.name = "DisabledClickShield"
						s_shield.set_anchors_preset(Control.PRESET_FULL_RECT)
						s_shield.mouse_filter = Control.MOUSE_FILTER_STOP
						s_shield.gui_input.connect(func(ev: InputEvent):
							if ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT:
								show_unavailable_notice("Not enough actions", Vector2i(-1, -1), ibtn.global_position + ibtn.size * 0.5)
						)
						ibtn.add_child(s_shield)
			else:
				ibtn.pressed.connect(func(): open_hero_detail_modal(h))
		elif itype == "item":
			if is_active:
				var item_id_str = str(itm.get("id"))
				var hid = str(h.get("id"))
				ibtn.pressed.connect(func(): toggle_targeting("item", item_id_str, hid))
			else:
				ibtn.pressed.connect(func(): open_hero_detail_modal(h))
		elif itype == "weapon":
			if is_active:
				ibtn.disabled = has_acted_this_turn
				var wep_id_str = str(itm.get("id"))
				var hid = str(h.get("id"))
				ibtn.pressed.connect(func(): toggle_targeting("attack", wep_id_str, hid))
				if ibtn.disabled:
					var w_shield = Control.new()
					w_shield.name = "DisabledClickShield"
					w_shield.set_anchors_preset(Control.PRESET_FULL_RECT)
					w_shield.mouse_filter = Control.MOUSE_FILTER_STOP
					w_shield.gui_input.connect(func(ev: InputEvent):
						if ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT:
							show_unavailable_notice("Not enough actions", Vector2i(-1, -1), ibtn.global_position + ibtn.size * 0.5)
					)
					ibtn.add_child(w_shield)
			else:
				ibtn.pressed.connect(func(): open_hero_detail_modal(h))
		elif itype == "disarm_action":
			ibtn.disabled = has_acted_this_turn
			ibtn.pressed.connect(_on_disarm_trap_button_pressed)
			if ibtn.disabled:
				var d_shield = Control.new()
				d_shield.name = "DisabledClickShield"
				d_shield.set_anchors_preset(Control.PRESET_FULL_RECT)
				d_shield.mouse_filter = Control.MOUSE_FILTER_STOP
				d_shield.gui_input.connect(func(ev: InputEvent):
					if ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT:
						show_unavailable_notice("Not enough actions", Vector2i(-1, -1), ibtn.global_position + ibtn.size * 0.5)
				)
				ibtn.add_child(d_shield)
		else:
			# Armor, Innate Ability
			ibtn.pressed.connect(func(): open_hero_detail_modal(h))

		icon_grid.add_child(ibtn)

	# Overflow Slot (+NUM) if total icons exceeded 21 slots
	if overflow_count > 0:
		var over_btn = Button.new()
		over_btn.name = "OverflowBadge"
		over_btn.custom_minimum_size = Vector2(20, 20)
		over_btn.text = "+%d" % overflow_count
		over_btn.add_theme_font_size_override("font_size", 8)
		over_btn.tooltip_text = "+%d more items & spells\nClick to inspect full Character Sheet" % overflow_count
		var o_sb = StyleBoxFlat.new()
		o_sb.set_corner_radius_all(3)
		o_sb.bg_color = Color(0.22, 0.18, 0.08, 0.95)
		o_sb.border_color = Color(1.0, 0.85, 0.3, 0.85)
		o_sb.set_border_width_all(1)
		over_btn.add_theme_stylebox_override("normal", o_sb)
		over_btn.add_theme_color_override("font_color", Color(1.0, 0.9, 0.35, 1.0))
		over_btn.pressed.connect(func(): open_hero_detail_modal(h))
		icon_grid.add_child(over_btn)

	vbox.add_child(icon_grid)


	return card

func _setup_hero_detail_modal() -> void:
	if not hero_detail_modal:
		hero_detail_modal = get_node_or_null("UI/HeroDetailModal")
	if not hero_detail_modal:
		return
	if not hero_detail_card:
		hero_detail_card = get_node_or_null("UI/HeroDetailModal/Card")
	if hero_detail_card:
		var card_sb = StyleBoxFlat.new()
		card_sb.bg_color = Color(0.07, 0.09, 0.14, 0.98)
		card_sb.set_corner_radius_all(10)
		card_sb.border_width_left = 2
		card_sb.border_width_top = 2
		card_sb.border_width_right = 2
		card_sb.border_width_bottom = 2
		card_sb.border_color = Color(1.0, 0.82, 0.2, 0.9)
		card_sb.shadow_color = Color(0, 0, 0, 0.85)
		card_sb.shadow_size = 24
		hero_detail_card.add_theme_stylebox_override("panel", card_sb)

	if not hero_detail_btn_close:
		hero_detail_btn_close = get_node_or_null("UI/HeroDetailModal/Card/Margin/VBox/ButtonBox/BtnClose")
	if hero_detail_btn_close and not hero_detail_btn_close.pressed.is_connected(close_hero_detail_modal):
		hero_detail_btn_close.pressed.connect(close_hero_detail_modal)

	if not hero_detail_btn_close_header:
		hero_detail_btn_close_header = get_node_or_null("UI/HeroDetailModal/Card/Margin/VBox/Header/BtnCloseHeader")
	if hero_detail_btn_close_header and not hero_detail_btn_close_header.pressed.is_connected(close_hero_detail_modal):
		hero_detail_btn_close_header.pressed.connect(close_hero_detail_modal)

	if hero_detail_modal and not hero_detail_modal.gui_input.is_connected(_on_hero_detail_backdrop_gui_input):
		hero_detail_modal.gui_input.connect(_on_hero_detail_backdrop_gui_input)

func _on_hero_detail_backdrop_gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		close_hero_detail_modal()

func open_hero_detail_modal(h: Dictionary) -> void:
	if h.is_empty():
		return
	active_detail_hero_id = str(h.get("id", ""))
	_setup_hero_detail_modal()
	_populate_hero_detail_modal(h)
	if hero_detail_modal:
		hero_detail_modal.visible = true
	_update_ui()

func close_hero_detail_modal() -> void:
	if hero_detail_modal:
		hero_detail_modal.visible = false
	active_detail_hero_id = ""
	_update_ui()

func _populate_hero_detail_modal(h: Dictionary) -> void:
	var h_id = str(h.get("id", "")).to_lower()
	var char_name = get_hero_character_name(h)
	var hero_class_str = get_hero_class_name(h)
	var disp_title = get_hero_display_title(h)

	var cur_bp = int(h.get("current_bp", 8))
	var max_bp = int(h.get("bodyPoints", 8))
	var cur_mp = int(h.get("current_mp", 2))
	var max_mp = int(h.get("mindPoints", 2))
	var is_dead = cur_bp <= 0
	var is_act = (get_active_hero().get("id") == h.get("id"))
	var is_on_board = bool(h.get("is_on_board", false))

	if hero_detail_title:
		hero_detail_title.text = "Character Sheet — %s" % disp_title

	if hero_detail_status_badge:
		if is_dead:
			hero_detail_status_badge.text = "[DEFEATED]"
			hero_detail_status_badge.add_theme_color_override("font_color", Color(1.0, 0.25, 0.25, 1.0))
		elif is_act:
			hero_detail_status_badge.text = "[ACTIVE TURN]"
			hero_detail_status_badge.add_theme_color_override("font_color", Color(1.0, 0.85, 0.2, 1.0))
		elif is_on_board:
			hero_detail_status_badge.text = "[READY ON BOARD]"
			hero_detail_status_badge.add_theme_color_override("font_color", Color(0.3, 0.85, 0.45, 1.0))
		else:
			hero_detail_status_badge.text = "[IN RESERVE]"
			hero_detail_status_badge.add_theme_color_override("font_color", Color(0.6, 0.65, 0.75, 1.0))

	# Left Column: Portrait & Lore
	if hero_detail_portrait:
		var bg_tex = get_hero_card_bg_texture(h_id)
		if bg_tex:
			hero_detail_portrait.texture = bg_tex
		else:
			hero_detail_portrait.texture = get_hero_token_texture(h)

	if hero_detail_name:
		hero_detail_name.text = char_name

	if hero_detail_class:
		hero_detail_class.text = "Hero Class: %s" % hero_class_str

	if hero_detail_lore:
		var lore_text = ""
		match h_id:
			"barbarian":
				lore_text = "[i]\"You are Rogar the Barbarian, greatest warrior in the kingdom! Fearless in the face of Morcar's hordes, you rely on your mighty broadsword and raw physical power to vanquish evil.\"[/i]\n\n[color=#ffd700]Specialty:[/color] Unmatched melee damage and highest vitality in the party."
			"dwarf":
				lore_text = "[i]\"You are Dorgan the Dwarf, stalwart tunnel-fighter and master of subterranean crafts! You possess innate mastery over mechanical hazards, detecting and disarming deadly dungeon traps with ease.\"[/i]\n\n[color=#ffd700]Specialty:[/color] Innate trap disarm mastery without needing a Tool Kit; heavy armor proficiency."
			"elf":
				lore_text = "[i]\"You are Ladril the Elf, graceful warrior-mage of the elder glades! Equally formidable with the steel blade and ancient elemental sorcery, you strike with unmatched swiftness.\"[/i]\n\n[color=#ffd700]Specialty:[/color] Hybrid martial warrior and elemental spellcaster."
			"wizard":
				lore_text = "[i]\"You are Telor the Wizard, grand scholar of the High Arcane! Though physically frail, your mastery over Fire, Earth, and Air magic wields cosmic forces to banish the forces of Dread.\"[/i]\n\n[color=#ffd700]Specialty:[/color] Supreme arcane mastery; commands three distinct elemental spell decks."
			_:
				lore_text = "[i]\"A fearless adventurer brave enough to plunge into Morcar's subterranean labyrinth.\"[/i]"
		hero_detail_lore.text = lore_text

	# Right Column: DetailsVBox
	# 1. Stats Box
	if hero_detail_stats_box:
		for child in hero_detail_stats_box.get_children():
			child.queue_free()

		var atk_dice = get_hero_attack_dice(h)
		var def_dice = get_hero_defend_dice(h)
		var wep_str = str(h.get("equipped_weapon", "unarmed")).capitalize()
		var arm_arr = h.get("equipped_armor", [])
		var arm_str = arm_arr[0].capitalize() if arm_arr.size() > 0 else "None"
		var cur_gold = int(h.get("gold", 0))

		var stats_panel = PanelContainer.new()
		stats_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var sp_sb = StyleBoxFlat.new()
		sp_sb.bg_color = Color(0.10, 0.13, 0.19, 0.9)
		sp_sb.set_corner_radius_all(6)
		sp_sb.border_width_left = 1; sp_sb.border_width_top = 1; sp_sb.border_width_right = 1; sp_sb.border_width_bottom = 1
		sp_sb.border_color = Color(0.25, 0.35, 0.5, 0.7)
		stats_panel.add_theme_stylebox_override("panel", sp_sb)

		var sp_marg = MarginContainer.new()
		sp_marg.add_theme_constant_override("margin_left", 12)
		sp_marg.add_theme_constant_override("margin_right", 12)
		sp_marg.add_theme_constant_override("margin_top", 10)
		sp_marg.add_theme_constant_override("margin_bottom", 10)
		stats_panel.add_child(sp_marg)

		var stats_grid = GridContainer.new()
		stats_grid.columns = 2
		stats_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		stats_grid.add_theme_constant_override("h_separation", 18)
		stats_grid.add_theme_constant_override("v_separation", 8)
		sp_marg.add_child(stats_grid)

		var bp_vbox = VBoxContainer.new()
		var bp_title = Label.new()
		bp_title.text = "Body Points (BP): %d / %d" % [cur_bp, max_bp]
		bp_title.add_theme_font_size_override("font_size", 12)
		bp_vbox.add_child(bp_title)
		var bp_bar = ProgressBar.new()
		bp_bar.custom_minimum_size = Vector2(0, 8)
		bp_bar.max_value = max_bp
		bp_bar.value = max(0, cur_bp)
		bp_bar.show_percentage = false
		var bp_fill = StyleBoxFlat.new()
		bp_fill.bg_color = Color(0.2, 0.85, 0.35, 1.0) if cur_bp > 2 else Color(0.9, 0.2, 0.2, 1.0)
		bp_fill.set_corner_radius_all(3)
		bp_bar.add_theme_stylebox_override("fill", bp_fill)
		bp_vbox.add_child(bp_bar)
		stats_grid.add_child(bp_vbox)

		var mp_vbox = VBoxContainer.new()
		var mp_title = Label.new()
		mp_title.text = "Mind Points (MP): %d / %d" % [cur_mp, max_mp]
		mp_title.add_theme_font_size_override("font_size", 12)
		mp_vbox.add_child(mp_title)
		var mp_bar = ProgressBar.new()
		mp_bar.custom_minimum_size = Vector2(0, 8)
		mp_bar.max_value = max_mp
		mp_bar.value = max(0, cur_mp)
		mp_bar.show_percentage = false
		var mp_fill = StyleBoxFlat.new()
		mp_fill.bg_color = Color(0.2, 0.7, 0.95, 1.0)
		mp_fill.set_corner_radius_all(3)
		mp_bar.add_theme_stylebox_override("fill", mp_fill)
		mp_vbox.add_child(mp_bar)
		stats_grid.add_child(mp_vbox)

		var atk_lbl = Label.new()
		atk_lbl.text = "Attack: %d Combat Dice (%s)" % [atk_dice, wep_str]
		atk_lbl.add_theme_font_size_override("font_size", 12)
		stats_grid.add_child(atk_lbl)

		var def_lbl = Label.new()
		def_lbl.text = "Defend: %d Combat Dice (%s)" % [def_dice, arm_str]
		def_lbl.add_theme_font_size_override("font_size", 12)
		stats_grid.add_child(def_lbl)

		var gold_lbl = Label.new()
		gold_lbl.text = "Gold Purse: %d Gold Coins" % cur_gold
		gold_lbl.add_theme_font_size_override("font_size", 12)
		gold_lbl.add_theme_color_override("font_color", Color(1.0, 0.85, 0.3, 1.0))
		stats_grid.add_child(gold_lbl)

		var move_lbl = Label.new()
		var is_swift = h.get("swift_wind_active", false)
		move_lbl.text = "Movement: %s" % ("2d6 x2 (Swift Wind Active!)" if is_swift else "2 Red Dice (2d6)")
		move_lbl.add_theme_font_size_override("font_size", 12)
		stats_grid.add_child(move_lbl)

		hero_detail_stats_box.add_child(stats_panel)

	# 2. Equipment & Inventory Section
	if hero_detail_equipment_section:
		for child in hero_detail_equipment_section.get_children():
			child.queue_free()

		var hero_inv = h.get("inventory", [])
		var inv_hdr = Label.new()
		inv_hdr.text = "EQUIPMENT & BACKPACK INVENTORY (%d)" % hero_inv.size()
		inv_hdr.add_theme_font_size_override("font_size", 13)
		inv_hdr.add_theme_color_override("font_color", Color(0.7, 0.9, 0.85, 1.0))
		hero_detail_equipment_section.add_child(inv_hdr)

		if hero_inv.is_empty():
			var empty_inv = Label.new()
			empty_inv.text = "Backpack is empty."
			empty_inv.add_theme_font_size_override("font_size", 11)
			empty_inv.add_theme_color_override("font_color", Color(0.6, 0.65, 0.7, 0.8))
			hero_detail_equipment_section.add_child(empty_inv)
		else:
			var inv_grid = GridContainer.new()
			inv_grid.columns = 2
			inv_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			inv_grid.add_theme_constant_override("h_separation", 8)
			inv_grid.add_theme_constant_override("v_separation", 6)
			hero_detail_equipment_section.add_child(inv_grid)

			for it in hero_inv:
				var item_str = ""
				if it is Dictionary:
					item_str = str(it.get("id", it.get("item", it.get("name", "")))).strip_edges().to_lower()
				else:
					item_str = str(it).strip_edges().to_lower()
				var it_meta = HeroQuestEquipment.get_item(item_str)
				var iname = str(it_meta.get("name", item_str.replace("_", " ").capitalize()))
				var itype = str(it_meta.get("type", "Item")).capitalize()
				var ival = int(it_meta.get("cost", it_meta.get("value", 50)))
				var idesc = str(it_meta.get("description", it_meta.get("effect", "")))
				var it_cat = "item"
				if HeroQuestEquipment.get_weapon(item_str).size() > 0 or "broadsword" in item_str or "shortsword" in item_str or "axe" in item_str or "bow" in item_str or "dagger" in item_str or "staff" in item_str:
					it_cat = "weapon"
					itype = "Weapon"
				elif HeroQuestEquipment.get_armor(item_str).size() > 0 or "shield" in item_str or "helm" in item_str or "mail" in item_str:
					it_cat = "armor"
					itype = "Armor"
				elif HeroQuestSpells.get_spell(item_str).size() > 0:
					it_cat = "spell"
					itype = "Spell"

				var it_panel = PanelContainer.new()
				it_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
				var ipsb = StyleBoxFlat.new()
				ipsb.bg_color = Color(0.12, 0.16, 0.22, 0.9)
				ipsb.set_corner_radius_all(5)
				ipsb.border_width_left = 1; ipsb.border_width_top = 1; ipsb.border_width_right = 1; ipsb.border_width_bottom = 1
				ipsb.border_color = Color(0.3, 0.45, 0.6, 0.6)
				it_panel.add_theme_stylebox_override("panel", ipsb)

				var imarg = MarginContainer.new()
				imarg.add_theme_constant_override("margin_left", 8)
				imarg.add_theme_constant_override("margin_right", 8)
				imarg.add_theme_constant_override("margin_top", 6)
				imarg.add_theme_constant_override("margin_bottom", 6)
				it_panel.add_child(imarg)

				var ivbox = VBoxContainer.new()
				var it_top = HBoxContainer.new()
				it_top.add_theme_constant_override("separation", 6)
				var it_icon_tex = get_ai_icon_texture(it_cat, item_str)
				if it_icon_tex:
					var it_ico = TextureRect.new()
					it_ico.texture = it_icon_tex
					it_ico.custom_minimum_size = Vector2(20, 20)
					it_ico.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
					it_ico.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
					it_top.add_child(it_ico)

				var it_name_lbl = Label.new()
				it_name_lbl.text = iname
				it_name_lbl.add_theme_font_size_override("font_size", 11)
				it_name_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
				it_top.add_child(it_name_lbl)

				var it_val_lbl = Label.new()
				it_val_lbl.text = "%d gp" % ival
				it_val_lbl.add_theme_font_size_override("font_size", 10)
				it_val_lbl.add_theme_color_override("font_color", Color(1.0, 0.85, 0.3, 0.9))
				it_top.add_child(it_val_lbl)
				ivbox.add_child(it_top)

				var it_desc_lbl = Label.new()
				it_desc_lbl.text = idesc
				it_desc_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
				it_desc_lbl.add_theme_font_size_override("font_size", 10)
				it_desc_lbl.add_theme_color_override("font_color", Color(0.75, 0.8, 0.88, 0.85))
				ivbox.add_child(it_desc_lbl)

				imarg.add_child(ivbox)
				if is_act and (it_cat in ["item", "weapon"]):
					it_panel.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
					it_panel.tooltip_text = "Click to select target for %s (closes sheet)" % iname
					var cur_item_id = item_str
					var cur_act_type = "attack" if it_cat == "weapon" else "item"
					var cur_h_id = h_id
					it_panel.gui_input.connect(func(ev: InputEvent):
						if ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT:
							start_targeting(cur_act_type, cur_item_id, cur_h_id)
					)
				inv_grid.add_child(it_panel)

	# 3. Spells Section
	if hero_detail_spells_section:
		for child in hero_detail_spells_section.get_children():
			child.queue_free()

		var hero_spells = h.get("spells", [])
		if hero_spells.size() > 0:
			var sp_hdr = Label.new()
			sp_hdr.text = "MEMORIZED SPELLS (%d)" % hero_spells.size()
			sp_hdr.add_theme_font_size_override("font_size", 13)
			sp_hdr.add_theme_color_override("font_color", Color(0.85, 0.75, 1.0, 1.0))
			hero_detail_spells_section.add_child(sp_hdr)

			var sp_grid = GridContainer.new()
			sp_grid.columns = 2
			sp_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			sp_grid.add_theme_constant_override("h_separation", 8)
			sp_grid.add_theme_constant_override("v_separation", 6)
			hero_detail_spells_section.add_child(sp_grid)

			for s_id in hero_spells:
				var s_data = HeroQuestSpells.get_spell(str(s_id))
				var s_name = str(s_data.get("name", s_id))
				var s_deck = str(s_data.get("deck", "Magic")).capitalize()
				var s_desc = str(s_data.get("description", ""))

				var is_spent = is_spell_used(h, str(s_id))
				var sp_panel = PanelContainer.new()
				sp_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
				var spsb = StyleBoxFlat.new()
				if is_spent:
					spsb.bg_color = Color(0.08, 0.08, 0.12, 0.85)
					spsb.border_color = Color(0.4, 0.22, 0.28, 0.5)
				else:
					spsb.bg_color = Color(0.14, 0.12, 0.22, 0.9)
					spsb.border_color = Color(0.6, 0.45, 0.85, 0.7)
				spsb.set_corner_radius_all(5)
				spsb.border_width_left = 1; spsb.border_width_top = 1; spsb.border_width_right = 1; spsb.border_width_bottom = 1
				sp_panel.add_theme_stylebox_override("panel", spsb)

				var smarg = MarginContainer.new()
				smarg.add_theme_constant_override("margin_left", 8)
				smarg.add_theme_constant_override("margin_right", 8)
				smarg.add_theme_constant_override("margin_top", 6)
				smarg.add_theme_constant_override("margin_bottom", 6)
				sp_panel.add_child(smarg)

				var svbox = VBoxContainer.new()
				var sp_top = HBoxContainer.new()
				sp_top.add_theme_constant_override("separation", 6)
				var sp_icon_tex = get_ai_icon_texture("spell", str(s_id))
				if sp_icon_tex:
					var sp_ico = TextureRect.new()
					sp_ico.texture = sp_icon_tex
					sp_ico.custom_minimum_size = Vector2(20, 20)
					sp_ico.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
					sp_ico.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
					sp_top.add_child(sp_ico)

				var sp_name_lbl = Label.new()
				sp_name_lbl.text = s_name
				sp_name_lbl.add_theme_font_size_override("font_size", 11)
				sp_name_lbl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
				sp_top.add_child(sp_name_lbl)

				var sp_deck_lbl = Label.new()
				if is_spent:
					sp_deck_lbl.text = "[EXHAUSTED]"
					sp_deck_lbl.add_theme_color_override("font_color", Color(0.9, 0.35, 0.35, 0.9))
				else:
					sp_deck_lbl.text = "%s Magic" % s_deck
					sp_deck_lbl.add_theme_color_override("font_color", Color(0.85, 0.7, 1.0, 0.9))
				sp_deck_lbl.add_theme_font_size_override("font_size", 10)
				sp_top.add_child(sp_deck_lbl)
				svbox.add_child(sp_top)

				var sp_desc_lbl = Label.new()
				sp_desc_lbl.text = s_desc
				sp_desc_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
				sp_desc_lbl.add_theme_font_size_override("font_size", 10)
				if is_spent:
					sp_desc_lbl.add_theme_color_override("font_color", Color(0.55, 0.55, 0.6, 0.7))
				else:
					sp_desc_lbl.add_theme_color_override("font_color", Color(0.8, 0.82, 0.9, 0.85))
				svbox.add_child(sp_desc_lbl)

				if is_spent:
					sp_panel.tooltip_text = "%s (Exhausted — already cast this quest)" % s_name
					sp_panel.modulate = Color(0.55, 0.55, 0.6, 0.75)
				elif is_act:
					sp_panel.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
					sp_panel.tooltip_text = "Click to select target for %s (closes sheet)" % s_name
					var cur_sp_id = str(s_id)
					var cur_h_id = h_id
					sp_panel.gui_input.connect(func(ev: InputEvent):
						if ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT:
							start_targeting("spell", cur_sp_id, cur_h_id)
					)

				sp_grid.add_child(sp_panel)

	# 4. Abilities & Status Effects Section
	if hero_detail_abilities_section:
		for child in hero_detail_abilities_section.get_children():
			child.queue_free()

		var ab_hdr = Label.new()
		ab_hdr.text = "TRAITS & ACTIVE STATUS EFFECTS"
		ab_hdr.add_theme_font_size_override("font_size", 13)
		ab_hdr.add_theme_color_override("font_color", Color(1.0, 0.85, 0.4, 1.0))
		hero_detail_abilities_section.add_child(ab_hdr)

		var ab_vbox = VBoxContainer.new()
		ab_vbox.add_theme_constant_override("separation", 6)
		hero_detail_abilities_section.add_child(ab_vbox)

		# Dwarf Innate Trap Mastery
		if h_id == "dwarf":
			var d_panel = PanelContainer.new()
			var d_sb = StyleBoxFlat.new()
			d_sb.bg_color = Color(0.18, 0.15, 0.08, 0.9)
			d_sb.set_corner_radius_all(5)
			d_sb.border_width_left = 1; d_sb.border_width_top = 1; d_sb.border_width_right = 1; d_sb.border_width_bottom = 1
			d_sb.border_color = Color(0.85, 0.65, 0.2, 0.8)
			d_panel.add_theme_stylebox_override("panel", d_sb)
			var dm = MarginContainer.new()
			dm.add_theme_constant_override("margin_left", 8); dm.add_theme_constant_override("margin_right", 8); dm.add_theme_constant_override("margin_top", 6); dm.add_theme_constant_override("margin_bottom", 6)
			d_panel.add_child(dm)
			var d_lbl = Label.new()
			d_lbl.text = "Trap Mastery (Innate Dwarf Ability)\nDorgan has spent centuries studying the subterranean machinations of stone and steel. He automatically detects and disarms adjacent traps without requiring tools or dice checks."
			d_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			d_lbl.add_theme_font_size_override("font_size", 10)
			dm.add_child(d_lbl)
			ab_vbox.add_child(d_panel)

		# Active Buffs
		var buffs: Array[Dictionary] = []
		if h.get("rock_skin_active", false):
			buffs.append({ "name": "[Rock Skin]", "desc": "Earth spell buff: Skin hardened like granite. +1 extra Defend Die until hero suffers damage." })
		if h.get("courage_active", false):
			buffs.append({ "name": "[Courage]", "desc": "Fire spell buff: Inspires heroic ferocity. +2 extra Attack Dice on attacks while monsters visible." })
		if h.get("swift_wind_active", false):
			buffs.append({ "name": "[Swift Wind]", "desc": "Air spell buff: Feet as swift as a gale. Movement dice roll is doubled this turn." })
		if h.get("pass_through_rock_active", false):
			buffs.append({ "name": "[Pass Through Rock]", "desc": "Earth spell buff: Phase through solid stone walls for 1 turn." })
		if h.get("veil_of_mist_active", false):
			buffs.append({ "name": "[Veil of Mist]", "desc": "Water spell buff: Enveloped in ethereal fog; can move through enemy spaces." })
		if h.get("is_sleeping", false):
			buffs.append({ "name": "[Sleep]", "desc": "Enchanted slumber: Cannot move or take actions until awakened." })

		if buffs.is_empty() and h_id != "dwarf":
			var no_buffs = Label.new()
			no_buffs.text = "No active magical buffs or conditions."
			no_buffs.add_theme_font_size_override("font_size", 10)
			no_buffs.add_theme_color_override("font_color", Color(0.65, 0.7, 0.75, 0.8))
			ab_vbox.add_child(no_buffs)
		else:
			for b in buffs:
				var b_panel = PanelContainer.new()
				var b_sb = StyleBoxFlat.new()
				b_sb.bg_color = Color(0.12, 0.16, 0.22, 0.85)
				b_sb.set_corner_radius_all(5)
				b_sb.border_width_left = 1; b_sb.border_width_top = 1; b_sb.border_width_right = 1; b_sb.border_width_bottom = 1
				b_sb.border_color = Color(0.3, 0.6, 0.9, 0.7)
				b_panel.add_theme_stylebox_override("panel", b_sb)
				var bm = MarginContainer.new()
				bm.add_theme_constant_override("margin_left", 8); bm.add_theme_constant_override("margin_right", 8); bm.add_theme_constant_override("margin_top", 4); bm.add_theme_constant_override("margin_bottom", 4)
				b_panel.add_child(bm)
				var b_lbl = Label.new()
				b_lbl.text = "%s: %s" % [b.name, b.desc]
				b_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
				b_lbl.add_theme_font_size_override("font_size", 10)
				bm.add_child(b_lbl)
				ab_vbox.add_child(b_panel)

func _setup_treasure_modal() -> void:
	if not treasure_modal:
		treasure_modal = get_node_or_null("UI/TreasureModal")
	if not treasure_modal:
		return

	if not treasure_modal_card:
		treasure_modal_card = get_node_or_null("UI/TreasureModal/Card")
	if treasure_modal_card:
		var card_sb = StyleBoxFlat.new()
		card_sb.bg_color = Color(0.06, 0.08, 0.12, 0.98)
		card_sb.set_corner_radius_all(10)
		card_sb.set_border_width_all(2)
		card_sb.border_color = Color(0.9, 0.75, 0.3, 0.9)
		card_sb.shadow_color = Color(0, 0, 0, 0.9)
		card_sb.shadow_size = 24
		treasure_modal_card.add_theme_stylebox_override("panel", card_sb)

	if not treasure_drawn_card:
		treasure_drawn_card = get_node_or_null("UI/TreasureModal/Card/Margin/VBox/StageHBox/CardStageControl/DrawnCard")
	if treasure_drawn_card:
		var drawn_sb = StyleBoxFlat.new()
		drawn_sb.bg_color = Color(0.93, 0.87, 0.75, 1.0)
		drawn_sb.set_corner_radius_all(8)
		drawn_sb.set_border_width_all(3)
		drawn_sb.border_color = Color(0.32, 0.20, 0.12, 1.0)
		drawn_sb.shadow_color = Color(0, 0, 0, 0.65)
		drawn_sb.shadow_size = 16
		drawn_sb.shadow_offset = Vector2(4, 6)
		treasure_drawn_card.add_theme_stylebox_override("panel", drawn_sb)

	if not treasure_deck_texture:
		treasure_deck_texture = get_node_or_null("UI/TreasureModal/Card/Margin/VBox/StageHBox/DeckColumn/DeckFrame/DeckTexture")
	if _treasure_deck_texture_res == null:
		if ResourceLoader.exists("res://assets/cards/treasure_card_deck.png"):
			_treasure_deck_texture_res = load("res://assets/cards/treasure_card_deck.png")
	if treasure_deck_texture and _treasure_deck_texture_res:
		treasure_deck_texture.texture = _treasure_deck_texture_res

	if not treasure_btn_resolve:
		treasure_btn_resolve = get_node_or_null("UI/TreasureModal/Card/Margin/VBox/ButtonBox/BtnResolve")
	if treasure_btn_resolve and not treasure_btn_resolve.pressed.is_connected(resolve_treasure_overlay_click):
		treasure_btn_resolve.pressed.connect(resolve_treasure_overlay_click)

	if not treasure_btn_close_header:
		treasure_btn_close_header = get_node_or_null("UI/TreasureModal/Card/Margin/VBox/Header/BtnCloseHeader")
	if treasure_btn_close_header and not treasure_btn_close_header.pressed.is_connected(resolve_treasure_overlay_click):
		treasure_btn_close_header.pressed.connect(resolve_treasure_overlay_click)

	if treasure_modal and not treasure_modal.gui_input.is_connected(_on_treasure_modal_backdrop_gui_input):
		treasure_modal.gui_input.connect(_on_treasure_modal_backdrop_gui_input)

func _on_treasure_modal_backdrop_gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		resolve_treasure_overlay_click()

func open_treasure_modal(card: Dictionary, hero: Dictionary, is_quest_note: bool) -> void:
	_setup_treasure_modal()
	_populate_treasure_modal(card, hero, is_quest_note)
	if treasure_modal:
		treasure_modal.visible = true

	# Animate card swipe-in from deck stack to center stage
	if treasure_drawn_card:
		treasure_drawn_card.position = Vector2(-260.0, 0.0)
		treasure_drawn_card.modulate.a = 0.0
		treasure_drawn_card.rotation = -0.06
		var tween = create_tween()
		tween.set_parallel(true)
		tween.tween_property(treasure_drawn_card, "position", Vector2(0.0, 0.0), 0.42).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		tween.tween_property(treasure_drawn_card, "modulate:a", 1.0, 0.32)
		tween.tween_property(treasure_drawn_card, "rotation", 0.0, 0.42).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)

func close_treasure_modal() -> void:
	if treasure_modal:
		treasure_modal.visible = false

func _populate_treasure_modal(card: Dictionary, hero: Dictionary, is_quest_note: bool) -> void:
	var stats = get_treasure_deck_stats()
	var pct_str = "%d%%" % int(round(stats.hazardRatio * 100.0))

	if not treasure_deck_badge:
		treasure_deck_badge = get_node_or_null("UI/TreasureModal/Card/Margin/VBox/Header/DeckRatioBadge")
	if treasure_deck_badge:
		treasure_deck_badge.text = "[DECK: %d CARDS | %s HAZARD]" % [stats.total, pct_str]

	if not treasure_deck_stats:
		treasure_deck_stats = get_node_or_null("UI/TreasureModal/Card/Margin/VBox/StageHBox/DeckColumn/DeckStats")
	if treasure_deck_stats:
		treasure_deck_stats.text = "Treasures Remaining: %d\nHazards & Wandering Foes: %d\nPermanently Discarded: %d" % [stats.goods, stats.hazards, stats.discardCount]

	if not treasure_drawn_card:
		treasure_drawn_card = get_node_or_null("UI/TreasureModal/Card/Margin/VBox/StageHBox/CardStageControl/DrawnCard")
	if not treasure_drawn_card:
		return

	if not treasure_card_title:
		treasure_card_title = get_node_or_null("UI/TreasureModal/Card/Margin/VBox/StageHBox/CardStageControl/DrawnCard/CardMargin/CardVBox/CardTitle")
	if not treasure_card_type_badge:
		treasure_card_type_badge = get_node_or_null("UI/TreasureModal/Card/Margin/VBox/StageHBox/CardStageControl/DrawnCard/CardMargin/CardVBox/CardHeader/CardTypeBadge")
	if not treasure_card_illustration:
		treasure_card_illustration = get_node_or_null("UI/TreasureModal/Card/Margin/VBox/StageHBox/CardStageControl/DrawnCard/CardMargin/CardVBox/IllustrationFrame/CardIllustration")
	if not treasure_card_desc:
		treasure_card_desc = get_node_or_null("UI/TreasureModal/Card/Margin/VBox/StageHBox/CardStageControl/DrawnCard/CardMargin/CardVBox/CardDescription")
	if not treasure_card_flavor:
		treasure_card_flavor = get_node_or_null("UI/TreasureModal/Card/Margin/VBox/StageHBox/CardStageControl/DrawnCard/CardMargin/CardVBox/CardFlavor")
	if not treasure_outcome_text:
		treasure_outcome_text = get_node_or_null("UI/TreasureModal/Card/Margin/VBox/StageHBox/CardStageControl/DrawnCard/CardMargin/CardVBox/OutcomeBanner/OutcomeMargin/OutcomeText")
	if not treasure_btn_resolve:
		treasure_btn_resolve = get_node_or_null("UI/TreasureModal/Card/Margin/VBox/ButtonBox/BtnResolve")

	var raw_title = str(card.get("title", "Treasure"))
	var c_type = str(card.get("type", "gold")).to_lower()

	if treasure_card_title:
		treasure_card_title.text = raw_title
		treasure_card_title.add_theme_color_override("font_color", Color(0.18, 0.10, 0.05, 1.0))

	if treasure_card_type_badge:
		if is_quest_note:
			treasure_card_type_badge.text = "[SPECIAL QUEST TREASURE]"
			treasure_card_type_badge.add_theme_color_override("font_color", Color(0.85, 0.55, 0.05, 1.0))
		elif c_type == "hazard":
			treasure_card_type_badge.text = "[HAZARD]"
			treasure_card_type_badge.add_theme_color_override("font_color", Color(0.85, 0.2, 0.2, 1.0))
		elif c_type == "wandering_monster":
			treasure_card_type_badge.text = "[WANDERING MONSTER]"
			treasure_card_type_badge.add_theme_color_override("font_color", Color(0.9, 0.4, 0.1, 1.0))
		else:
			treasure_card_type_badge.text = "[TREASURE]"
			treasure_card_type_badge.add_theme_color_override("font_color", Color(0.15, 0.65, 0.35, 1.0))

	if treasure_card_illustration:
		var tex: Texture2D = null
		if c_type == "wandering_monster":
			var cart = CartridgeManager.active_cartridge
			var starting_map_id = cart.get("header", {}).get("startingMap", "heroquest-the-trial")
			var map_data = cart.get("maps", {}).get(starting_map_id, {})
			var wm_name = str(map_data.get("wanderingMonster", cart.get("wanderingMonster", "orc"))).to_lower()
			tex = get_monster_token_texture({"monsterType": wm_name, "type": wm_name})
		elif c_type == "potion" or card.has("item"):
			var item_name = str(card.get("item", "healing_potion"))
			tex = get_ai_icon_texture("potions", item_name)
			if not tex:
				tex = get_ai_icon_texture("items", item_name)
		elif ResourceLoader.exists("res://assets/cards/treasure_card_template.png"):
			tex = load("res://assets/cards/treasure_card_template.png")
		treasure_card_illustration.texture = tex
		treasure_card_illustration.visible = (tex != null)

	if treasure_card_desc:
		var desc_text = str(card.get("description", ""))
		treasure_card_desc.text = "[color=#2a180e]%s[/color]" % desc_text

	if treasure_card_flavor:
		var flv = str(card.get("flavor", ""))
		treasure_card_flavor.text = "— %s —" % flv if flv != "" else ""
		treasure_card_flavor.add_theme_color_override("font_color", Color(0.42, 0.28, 0.16, 0.95))

	if treasure_outcome_text:
		var h_name = str(hero.get("name", "Hero"))
		if is_quest_note:
			treasure_outcome_text.text = "Rule: Room-specific Special Treasure claimed by %s! (Marked as claimed for this Quest)." % h_name
			treasure_outcome_text.add_theme_color_override("font_color", Color(0.9, 0.7, 0.2, 1.0))
		elif c_type == "hazard":
			var dmg = int(card.get("damage", 1))
			treasure_outcome_text.text = "Rule: %s suffers %d BP damage! Card resolved, returned to deck, and shuffled." % [h_name, dmg]
			treasure_outcome_text.add_theme_color_override("font_color", Color(1.0, 0.35, 0.35, 1.0))
		elif c_type == "wandering_monster":
			treasure_outcome_text.text = "Rule: Wandering monster ambushes adjacent to %s! Card resolved, returned to deck, and shuffled." % h_name
			treasure_outcome_text.add_theme_color_override("font_color", Color(1.0, 0.5, 0.2, 1.0))
		else:
			treasure_outcome_text.text = "Rule: Awarded to %s. Card is permanently discarded from the deck for the quest." % h_name
			treasure_outcome_text.add_theme_color_override("font_color", Color(0.3, 0.9, 0.5, 1.0))

	if treasure_btn_resolve:
		if c_type == "hazard":
			treasure_btn_resolve.text = "Endure Hazard (Space / Enter)"
		elif c_type == "wandering_monster":
			treasure_btn_resolve.text = "Engage Ambush (Space / Enter)"
		else:
			treasure_btn_resolve.text = "Claim Treasure (Space / Enter)"

func _setup_monster_detail_modal() -> void:
	if not monster_detail_modal:
		monster_detail_modal = get_node_or_null("UI/MonsterDetailModal")
	if not monster_detail_modal:
		return
	if not monster_detail_card:
		monster_detail_card = get_node_or_null("UI/MonsterDetailModal/Card")
	if monster_detail_card:
		var card_sb = StyleBoxFlat.new()
		card_sb.bg_color = Color(0.08, 0.06, 0.08, 0.98) # Dark obsidian dungeon stone
		card_sb.set_corner_radius_all(10)
		card_sb.border_width_left = 2
		card_sb.border_width_top = 2
		card_sb.border_width_right = 2
		card_sb.border_width_bottom = 2
		card_sb.border_color = Color(0.9, 0.25, 0.2, 0.9) # Crimson dread rune glow
		card_sb.shadow_color = Color(0, 0, 0, 0.9)
		card_sb.shadow_size = 24
		monster_detail_card.add_theme_stylebox_override("panel", card_sb)

	if not monster_detail_btn_close:
		monster_detail_btn_close = get_node_or_null("UI/MonsterDetailModal/Card/Margin/VBox/ButtonBox/BtnClose")
	if monster_detail_btn_close and not monster_detail_btn_close.pressed.is_connected(close_monster_detail_modal):
		monster_detail_btn_close.pressed.connect(close_monster_detail_modal)

	if not monster_detail_btn_close_header:
		monster_detail_btn_close_header = get_node_or_null("UI/MonsterDetailModal/Card/Margin/VBox/Header/BtnCloseHeader")
	if monster_detail_btn_close_header and not monster_detail_btn_close_header.pressed.is_connected(close_monster_detail_modal):
		monster_detail_btn_close_header.pressed.connect(close_monster_detail_modal)

	if monster_detail_modal and not monster_detail_modal.gui_input.is_connected(_on_monster_detail_backdrop_gui_input):
		monster_detail_modal.gui_input.connect(_on_monster_detail_backdrop_gui_input)

func _on_monster_detail_backdrop_gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
		close_monster_detail_modal()

func open_monster_detail_modal(m: Dictionary) -> void:
	if m.is_empty():
		return
	active_detail_monster_id = str(m.get("id", ""))
	_setup_monster_detail_modal()
	_populate_monster_detail_modal(m)
	if monster_detail_modal:
		monster_detail_modal.visible = true
	_update_ui()

func close_monster_detail_modal() -> void:
	if monster_detail_modal:
		monster_detail_modal.visible = false
	active_detail_monster_id = ""
	_update_ui()

func _populate_monster_detail_modal(m: Dictionary) -> void:
	var lore = get_monster_lore(m)
	var m_name = str(m.get("name", lore.get("title", "Monster")))
	var cur_bp = int(m.get("current_bp", m.get("bodyPoints", 1)))
	var max_bp = int(m.get("bodyPoints", 1))
	var is_alive = bool(m.get("is_alive", true)) and cur_bp > 0
	var is_turn_active = is_enemy_turn_waiting and str(m.get("id")) == active_enemy_turn_monster_id
	var is_vis = is_monster_currently_visible(m)
	var is_boss = bool(m.get("isBoss", false)) or get_monster_token_key(m) == "verag"

	if monster_detail_title:
		monster_detail_title.text = "Monster Bestiary — %s" % lore.get("title", m_name)

	if monster_detail_status_badge:
		if not is_alive:
			monster_detail_status_badge.text = "[DEFEATED]"
			monster_detail_status_badge.add_theme_color_override("font_color", Color(1.0, 0.3, 0.3, 1.0))
		elif is_turn_active:
			monster_detail_status_badge.text = "[ACTIVE TURN]"
			monster_detail_status_badge.add_theme_color_override("font_color", Color(1.0, 0.85, 0.2, 1.0))
		elif is_vis:
			monster_detail_status_badge.text = "[BOSS FOE]" if is_boss else "[VISIBLE FOE]"
			monster_detail_status_badge.add_theme_color_override("font_color", Color(1.0, 0.75, 0.2, 1.0) if is_boss else Color(0.3, 0.95, 0.6, 1.0))
		else:
			monster_detail_status_badge.text = "[OUT OF SIGHT]"
			monster_detail_status_badge.add_theme_color_override("font_color", Color(0.65, 0.70, 0.80, 0.8))

	# Left Column: High-Res Portrait & Lore
	if monster_detail_portrait:
		var bg_tex = get_monster_card_bg_texture(m)
		if bg_tex:
			monster_detail_portrait.texture = bg_tex
		else:
			monster_detail_portrait.texture = get_monster_token_texture(m)

	if monster_detail_name:
		monster_detail_name.text = m_name

	if monster_detail_type:
		monster_detail_type.text = "Classification: %s (%s)" % [lore.get("subtitle", "Dread Minion"), lore.get("archetype", "Monster")]

	if monster_detail_lore:
		monster_detail_lore.text = lore.get("flavor", "")

	# Right Column: DetailsVBox
	# 1. Stats Box
	if monster_detail_stats_box:
		for child in monster_detail_stats_box.get_children():
			child.queue_free()

		var atk_dice = int(m.get("attackDice", 2))
		var def_dice = int(m.get("defendDice", 2))
		var move_sq = int(m.get("moveSquares", m.get("movementSquares", 6)))
		var mind_pts = int(m.get("mindPoints", 0))

		var stats_panel = PanelContainer.new()
		stats_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var sp_sb = StyleBoxFlat.new()
		sp_sb.bg_color = Color(0.12, 0.09, 0.11, 0.95)
		sp_sb.set_corner_radius_all(6)
		sp_sb.border_width_left = 1; sp_sb.border_width_top = 1; sp_sb.border_width_right = 1; sp_sb.border_width_bottom = 1
		sp_sb.border_color = Color(0.65, 0.25, 0.25, 0.8)
		stats_panel.add_theme_stylebox_override("panel", sp_sb)

		var sp_marg = MarginContainer.new()
		sp_marg.add_theme_constant_override("margin_left", 12)
		sp_marg.add_theme_constant_override("margin_right", 12)
		sp_marg.add_theme_constant_override("margin_top", 10)
		sp_marg.add_theme_constant_override("margin_bottom", 10)
		stats_panel.add_child(sp_marg)

		var stats_grid = GridContainer.new()
		stats_grid.columns = 2
		stats_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		stats_grid.add_theme_constant_override("h_separation", 18)
		stats_grid.add_theme_constant_override("v_separation", 8)
		sp_marg.add_child(stats_grid)

		# BP Box with bar
		var bp_vbox = VBoxContainer.new()
		var bp_title = Label.new()
		bp_title.text = "Body Points (BP): %d / %d" % [cur_bp, max_bp]
		bp_title.add_theme_font_size_override("font_size", 12)
		bp_vbox.add_child(bp_title)
		var bp_bar = ProgressBar.new()
		bp_bar.custom_minimum_size = Vector2(0, 10)
		bp_bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		bp_bar.show_percentage = false
		bp_bar.max_value = max_bp
		bp_bar.value = max(0, cur_bp)
		var bp_fill = StyleBoxFlat.new()
		bp_fill.bg_color = Color(0.85, 0.2, 0.2, 1.0) if is_alive else Color(0.5, 0.15, 0.15, 0.7)
		bp_fill.set_corner_radius_all(3)
		bp_bar.add_theme_stylebox_override("fill", bp_fill)
		var bp_bg = StyleBoxFlat.new()
		bp_bg.bg_color = Color(0.08, 0.08, 0.1, 0.9)
		bp_bar.add_theme_stylebox_override("background", bp_bg)
		bp_vbox.add_child(bp_bar)
		stats_grid.add_child(bp_vbox)

		# MP Box
		var mp_vbox = VBoxContainer.new()
		var mp_title = Label.new()
		mp_title.text = "Mind Points (MP): %d" % mind_pts
		mp_title.add_theme_font_size_override("font_size", 12)
		mp_vbox.add_child(mp_title)
		var mp_desc = Label.new()
		mp_desc.text = "Resists magic & mental charms" if mind_pts > 0 else "Mindless thrall (Sleep/Fear immune)"
		mp_desc.add_theme_font_size_override("font_size", 10)
		mp_desc.add_theme_color_override("font_color", Color(0.7, 0.75, 0.85, 0.8))
		mp_vbox.add_child(mp_desc)
		stats_grid.add_child(mp_vbox)

		# Attack Dice
		var atk_lbl = Label.new()
		atk_lbl.text = "Attack Strength: %d Combat Dice" % atk_dice
		atk_lbl.add_theme_font_size_override("font_size", 11)
		atk_lbl.add_theme_color_override("font_color", Color(1.0, 0.5, 0.4, 1.0))
		stats_grid.add_child(atk_lbl)

		# Defend Dice
		var def_lbl = Label.new()
		def_lbl.text = "Defense Armor: %d Combat Dice" % def_dice
		def_lbl.add_theme_font_size_override("font_size", 11)
		def_lbl.add_theme_color_override("font_color", Color(0.4, 0.8, 1.0, 1.0))
		stats_grid.add_child(def_lbl)

		# Movement
		var mv_lbl = Label.new()
		mv_lbl.text = "Movement Speed: %d Squares" % move_sq
		mv_lbl.add_theme_font_size_override("font_size", 11)
		mv_lbl.add_theme_color_override("font_color", Color(0.9, 0.85, 0.5, 1.0))
		stats_grid.add_child(mv_lbl)

		# Boss / Threat level
		var th_lbl = Label.new()
		th_lbl.text = "Threat Rating: %s" % ("Catacomb Warlord Boss" if is_boss else ("Apex Dungeon Champion" if (atk_dice >= 4 or def_dice >= 4) else "Standard Dungeon Monster"))
		th_lbl.add_theme_font_size_override("font_size", 11)
		th_lbl.add_theme_color_override("font_color", Color(1.0, 0.75, 0.2, 1.0) if is_boss else Color(0.8, 0.8, 0.85, 0.9))
		stats_grid.add_child(th_lbl)

		monster_detail_stats_box.add_child(stats_panel)

	# 2. Tactical Section
	if monster_detail_tactical_section:
		for child in monster_detail_tactical_section.get_children():
			child.queue_free()

		var sec_lbl = Label.new()
		sec_lbl.text = "TACTICAL DIRECTIVES & BEHAVIOR"
		sec_lbl.add_theme_font_size_override("font_size", 11)
		sec_lbl.add_theme_color_override("font_color", Color(1.0, 0.82, 0.2, 0.9))
		monster_detail_tactical_section.add_child(sec_lbl)

		var t_panel = PanelContainer.new()
		var t_sb = StyleBoxFlat.new()
		t_sb.bg_color = Color(0.10, 0.08, 0.10, 0.85)
		t_sb.set_corner_radius_all(5)
		t_sb.border_width_left = 1; t_sb.border_width_top = 1; t_sb.border_width_right = 1; t_sb.border_width_bottom = 1
		t_sb.border_color = Color(0.5, 0.3, 0.4, 0.6)
		t_panel.add_theme_stylebox_override("panel", t_sb)
		var tm = MarginContainer.new()
		tm.add_theme_constant_override("margin_left", 8); tm.add_theme_constant_override("margin_right", 8); tm.add_theme_constant_override("margin_top", 6); tm.add_theme_constant_override("margin_bottom", 6)
		t_panel.add_child(tm)

		var t_text = Label.new()
		t_text.text = str(lore.get("tactics", "Lurks in dungeon halls serving Morcar."))
		t_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		t_text.add_theme_font_size_override("font_size", 10)
		t_text.add_theme_color_override("font_color", Color(0.85, 0.88, 0.92, 0.95))
		tm.add_child(t_text)
		monster_detail_tactical_section.add_child(t_panel)

	# 3. Abilities Section
	if monster_detail_abilities_section:
		for child in monster_detail_abilities_section.get_children():
			child.queue_free()

		var ab_title = Label.new()
		ab_title.text = "COMBAT TRAITS & INNATE ABILITIES"
		ab_title.add_theme_font_size_override("font_size", 11)
		ab_title.add_theme_color_override("font_color", Color(1.0, 0.82, 0.2, 0.9))
		monster_detail_abilities_section.add_child(ab_title)

		var abilities_list = lore.get("abilities", [])
		for ab in abilities_list:
			var ab_panel = PanelContainer.new()
			var ab_sb = StyleBoxFlat.new()
			ab_sb.bg_color = Color(0.11, 0.08, 0.10, 0.85)
			ab_sb.set_corner_radius_all(5)
			ab_sb.border_width_left = 1; ab_sb.border_width_top = 1; ab_sb.border_width_right = 1; ab_sb.border_width_bottom = 1
			ab_sb.border_color = Color(0.7, 0.3, 0.25, 0.7)
			ab_panel.add_theme_stylebox_override("panel", ab_sb)
			var am = MarginContainer.new()
			am.add_theme_constant_override("margin_left", 8); am.add_theme_constant_override("margin_right", 8); am.add_theme_constant_override("margin_top", 4); am.add_theme_constant_override("margin_bottom", 4)
			ab_panel.add_child(am)
			var ab_lbl = Label.new()
			ab_lbl.text = "[%s]: %s" % [ab.get("name", "Ability"), ab.get("desc", "")]
			ab_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			ab_lbl.add_theme_font_size_override("font_size", 10)
			am.add_child(ab_lbl)
			monster_detail_abilities_section.add_child(ab_panel)

	# 4. Spells Section (if spellcaster)
	if monster_detail_spells_section:
		for child in monster_detail_spells_section.get_children():
			child.queue_free()

		var spells_list = m.get("spells", [])
		if bool(m.get("isSpellcaster", false)) or spells_list.size() > 0:
			var sp_title = Label.new()
			sp_title.text = "FELL DREAD SORCERY"
			sp_title.add_theme_font_size_override("font_size", 11)
			sp_title.add_theme_color_override("font_color", Color(0.9, 0.3, 0.85, 1.0))
			monster_detail_spells_section.add_child(sp_title)

			for sp in spells_list:
				var sp_panel = PanelContainer.new()
				var sp_sb = StyleBoxFlat.new()
				sp_sb.bg_color = Color(0.18, 0.08, 0.18, 0.85)
				sp_sb.set_corner_radius_all(5)
				sp_sb.border_width_left = 1; sp_sb.border_width_top = 1; sp_sb.border_width_right = 1; sp_sb.border_width_bottom = 1
				sp_sb.border_color = Color(0.8, 0.2, 0.8, 0.7)
				sp_panel.add_theme_stylebox_override("panel", sp_sb)
				var sm = MarginContainer.new()
				sm.add_theme_constant_override("margin_left", 8); sm.add_theme_constant_override("margin_right", 8); sm.add_theme_constant_override("margin_top", 4); sm.add_theme_constant_override("margin_bottom", 4)
				sp_panel.add_child(sm)
				var sp_lbl = Label.new()
				var sp_desc = "Commands fell dread magic to strike heroes across rooms."
				if "lightning" in str(sp).to_lower():
					sp_desc = "Crackling dark lightning bolts inflicting heavy magical damage."
				elif "fear" in str(sp).to_lower():
					sp_desc = "Overwhelming terror reducing hero attack capability."
				sp_lbl.text = "[Dread Spell: %s]: %s" % [str(sp).capitalize(), sp_desc]
				sp_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
				sp_lbl.add_theme_font_size_override("font_size", 10)
				sm.add_child(sp_lbl)
				monster_detail_spells_section.add_child(sp_panel)

func _create_enemy_card(m: Dictionary, is_visible: bool) -> PanelContainer:
	var card = PanelContainer.new()
	card.custom_minimum_size = Vector2(236, 118)
	card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	card.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	card.mouse_filter = Control.MOUSE_FILTER_PASS

	var cur_bp = int(m.get("current_bp", m.get("bodyPoints", 1)))
	var max_bp = int(m.get("bodyPoints", 1))
	var is_alive = bool(m.get("is_alive", true)) and cur_bp > 0
	var is_sleeping = bool(m.get("is_sleeping", false))
	var is_stunned = bool(m.get("tempest_stunned", false))
	var m_name = str(m.get("name", "Monster"))
	var is_boss = bool(m.get("isBoss", false)) or get_monster_token_key(m) == "verag"
	var lore = get_monster_lore(m)

	var sb = StyleBoxFlat.new()
	sb.corner_radius_top_left = 6
	sb.corner_radius_top_right = 6
	sb.corner_radius_bottom_left = 6
	sb.corner_radius_bottom_right = 6

	var is_turn_active = is_enemy_turn_waiting and str(m.get("id")) == active_enemy_turn_monster_id

	if is_turn_active:
		# Monster currently taking its 1.5s active turn
		sb.bg_color = Color(0.28, 0.10, 0.08, 0.98)
		sb.border_color = Color(1.0, 0.78, 0.20, 1.0) # Glowing radiant gold
		sb.border_width_left = 3; sb.border_width_top = 3; sb.border_width_right = 3; sb.border_width_bottom = 3
		sb.shadow_color = Color(1.0, 0.5, 0.1, 0.6)
		sb.shadow_size = 6
		card.modulate = Color(1.0, 1.0, 1.0, 1.0)
	elif not is_alive:
		# Defeated monster styling
		sb.bg_color = Color(0.20, 0.08, 0.08, 0.85)
		sb.border_color = Color(0.70, 0.20, 0.20, 0.75)
		sb.border_width_left = 1; sb.border_width_top = 1; sb.border_width_right = 1; sb.border_width_bottom = 1
		card.modulate = Color(0.85, 0.85, 0.85, 0.75)
	elif is_visible:
		# Currently visible enemy
		sb.bg_color = Color(0.12, 0.18, 0.16, 0.95)
		sb.border_color = Color(1.0, 0.75, 0.2, 1.0) if is_boss else Color(0.20, 0.85, 0.50, 1.0) # Emerald sightline glow / Boss Gold
		sb.border_width_left = 2; sb.border_width_top = 2; sb.border_width_right = 2; sb.border_width_bottom = 2
		sb.shadow_color = Color(0.9, 0.5, 0.1, 0.4) if is_boss else Color(0.1, 0.8, 0.4, 0.3)
		sb.shadow_size = 4 if is_boss else 3
		card.modulate = Color(1.0, 1.0, 1.0, 1.0)
	else:
		# No longer visible enemy
		sb.bg_color = Color(0.10, 0.12, 0.16, 0.75)
		sb.border_color = Color(0.35, 0.42, 0.52, 0.6)
		sb.border_width_left = 1; sb.border_width_top = 1; sb.border_width_right = 1; sb.border_width_bottom = 1
		card.modulate = Color(0.75, 0.75, 0.80, 0.65) # Dimmed opacity for out-of-sight

	card.add_theme_stylebox_override("panel", sb)

	# AI Generated Image Background Underlay
	var bg_tex = get_monster_card_bg_texture(m)
	if bg_tex:
		var bg_rect = TextureRect.new()
		bg_rect.name = "MonsterCardBg"
		bg_rect.texture = bg_tex
		bg_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		bg_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
		bg_rect.anchor_right = 1.0
		bg_rect.anchor_bottom = 1.0
		bg_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
		if not is_alive:
			bg_rect.modulate = Color(0.65, 0.2, 0.2, 0.22)
		elif is_visible:
			bg_rect.modulate = Color(1.0, 0.95, 0.85, 0.40)
		else:
			bg_rect.modulate = Color(0.60, 0.65, 0.75, 0.20)
		card.add_child(bg_rect)

	# Click card to open full monster detail dialog
	card.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	card.tooltip_text = "Click to inspect %s's Bestiary Codex" % m_name
	card.gui_input.connect(func(event: InputEvent):
		if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
			if is_targeting_active():
				resolve_targeting_entity("monster", str(m.get("id")))
			else:
				open_monster_detail_modal(m)
	)

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

	# Clickable Monster Portrait Button
	var portrait_btn = Button.new()
	portrait_btn.name = "MonsterPortraitButton"
	portrait_btn.custom_minimum_size = Vector2(42, 42)
	portrait_btn.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	portrait_btn.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	portrait_btn.tooltip_text = "Click portrait to inspect %s's Bestiary Codex" % m_name

	var p_sb = StyleBoxFlat.new()
	p_sb.bg_color = Color(0.12, 0.08, 0.08, 0.85) if not is_alive else (Color(0.18, 0.24, 0.22, 0.9) if is_visible else Color(0.12, 0.14, 0.18, 0.85))
	p_sb.set_corner_radius_all(6)
	p_sb.border_width_left = 1; p_sb.border_width_top = 1; p_sb.border_width_right = 1; p_sb.border_width_bottom = 1
	p_sb.border_color = Color(0.85, 0.3, 0.3, 0.8) if not is_alive else (Color(1.0, 0.75, 0.2, 0.9) if is_boss else Color(0.3, 0.9, 0.5, 0.8))
	portrait_btn.add_theme_stylebox_override("normal", p_sb)
	portrait_btn.add_theme_stylebox_override("hover", p_sb)
	portrait_btn.add_theme_stylebox_override("pressed", p_sb)

	var token_tex = get_monster_token_texture(m)
	if token_tex:
		var token_rect = TextureRect.new()
		token_rect.name = "MonsterPortraitTexture"
		token_rect.texture = token_tex
		token_rect.custom_minimum_size = Vector2(38, 38)
		token_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		token_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		token_rect.anchor_right = 1.0
		token_rect.anchor_bottom = 1.0
		token_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
		portrait_btn.add_child(token_rect)

	portrait_btn.pressed.connect(func():
		if is_targeting_active():
			resolve_targeting_entity("monster", str(m.get("id")))
		else:
			open_monster_detail_modal(m)
	)
	main_hbox.add_child(portrait_btn)

	var vbox = VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 2)
	vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	vbox.mouse_filter = Control.MOUSE_FILTER_PASS
	main_hbox.add_child(vbox)

	# Row 1: Header (Name & Badges)
	var hdr_row = HBoxContainer.new()
	var name_lbl = Label.new()
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
		name_lbl.add_theme_color_override("font_color", Color(1.0, 0.88, 0.4, 1.0) if is_boss else Color(0.9, 1.0, 0.95, 1.0))
		vis_badge.text = "[BOSS]" if is_boss else "[VISIBLE]"
		vis_badge.add_theme_color_override("font_color", Color(1.0, 0.75, 0.2, 1.0) if is_boss else Color(0.3, 0.95, 0.6, 1.0))
	else:
		name_lbl.add_theme_color_override("font_color", Color(0.75, 0.78, 0.85, 0.8))
		vis_badge.text = "[OUT OF SIGHT]"
		vis_badge.add_theme_color_override("font_color", Color(0.65, 0.70, 0.80, 0.8))

	if is_turn_active:
		var turn_badge = Label.new()
		turn_badge.text = "[ACTIVE]"
		turn_badge.add_theme_font_size_override("font_size", 9)
		turn_badge.add_theme_color_override("font_color", Color(1.0, 0.85, 0.2))
		hdr_row.add_child(turn_badge)
	hdr_row.add_child(name_lbl)
	hdr_row.add_child(vis_badge)
	vbox.add_child(hdr_row)

	# Row 2: Archetype / Subtitle (Fantasy RPG flavor)
	var sub_lbl = Label.new()
	sub_lbl.text = str(lore.get("archetype", "Dread Monster"))
	sub_lbl.add_theme_font_size_override("font_size", 9)
	sub_lbl.add_theme_color_override("font_color", Color(0.9, 0.7, 0.4, 0.85) if is_boss else Color(0.7, 0.75, 0.82, 0.75))
	vbox.add_child(sub_lbl)

	# Row 3: BP Bar & Text
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

	# Row 4: Stats row (ATK, DEF, MOV, MP)
	var atk_d = int(m.get("attackDice", 2))
	var def_d = int(m.get("defendDice", 2))
	var mv_sq = int(m.get("moveSquares", m.get("movementSquares", 6)))
	var mind_p = int(m.get("mindPoints", 0))
	var stat_row = HBoxContainer.new()
	var stat_lbl = Label.new()
	stat_lbl.text = "ATK %dd   DEF %dd   MOV %d   MP %d" % [atk_d, def_d, mv_sq, mind_p]
	stat_lbl.add_theme_font_size_override("font_size", 10)
	stat_lbl.add_theme_color_override("font_color", Color(0.8, 0.85, 0.92, 0.9))
	stat_row.add_child(stat_lbl)
	vbox.add_child(stat_row)

	# Row 5: Conditions (Sleep, Stun, etc.)
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

func _setup_log_panel() -> void:
	if log_panel:
		var sb = StyleBoxFlat.new()
		sb.bg_color = Color("#0b0f16")
		sb.set_border_width_all(1)
		sb.border_color = Color("#223344")
		sb.set_corner_radius_all(6)
		sb.content_margin_left = 8
		sb.content_margin_right = 8
		sb.content_margin_top = 8
		sb.content_margin_bottom = 8
		log_panel.add_theme_stylebox_override("panel", sb)
		if not log_panel.gui_input.is_connected(_on_log_panel_gui_input):
			log_panel.gui_input.connect(_on_log_panel_gui_input)

	if log_label:
		log_label.bbcode_enabled = true
		log_label.scroll_active = true
		if not log_label.gui_input.is_connected(_on_log_panel_gui_input):
			log_label.gui_input.connect(_on_log_panel_gui_input)

func _on_log_panel_gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		if turn_losses_active:
			toggle_log_display_mode()

func toggle_log_display_mode() -> String:
	if log_display_mode == "damage_report":
		log_display_mode = "combat_log"
	else:
		log_display_mode = "damage_report"
	_update_log_display()
	return log_display_mode

func _repeat_char(ch: String, count: int) -> String:
	var res = ""
	for i in range(maxi(0, count)):
		res += ch
	return res

func _generate_ascii_health_bar(cur: int, max_val: int, length: int = 8) -> String:
	if max_val <= 0:
		return "[░░░░░░░░]"
	var fill_ratio = clampf(float(cur) / float(max_val), 0.0, 1.0)
	var filled_count = int(round(fill_ratio * length))
	var empty_count = maxi(0, length - filled_count)
	var bar_color = "#44ff44"
	if fill_ratio <= 0.25:
		bar_color = "#ff3333"
	elif fill_ratio <= 0.5:
		bar_color = "#ffaa00"
	var filled_str = _repeat_char("█", filled_count)
	var empty_str = _repeat_char("░", empty_count)
	return "[color=%s][%s%s][/color]" % [bar_color, filled_str, empty_str]

func _format_log_line_bbcode(msg: String) -> String:
	var clean = _sanitize_ui_text(msg)
	if clean.begins_with("[HIT]"):
		return "[color=#ff4444][b][HIT][/b][/color]" + clean.substr(5)
	elif clean.begins_with("[BLOCKED]"):
		return "[color=#33ccff][b][BLOCKED][/b][/color]" + clean.substr(9)
	elif clean.begins_with("[SPELL]"):
		return "[color=#bb88ff][b][SPELL][/b][/color]" + clean.substr(7)
	elif clean.begins_with("[TRAP]"):
		return "[color=#ffaa33][b][TRAP][/b][/color]" + clean.substr(6)
	elif clean.begins_with("[TREASURE]"):
		return "[color=#ffd700][b][TREASURE][/b][/color]" + clean.substr(10)
	elif clean.begins_with("[MOVE]"):
		return "[color=#66bb6a][b][MOVE][/b][/color]" + clean.substr(6)
	elif clean.begins_with("[DOOR]"):
		return "[color=#d4a373][b][DOOR][/b][/color]" + clean.substr(6)
	elif clean.begins_with("[GM]"):
		return "[color=#ff77aa][b][GM][/b][/color]" + clean.substr(4)
	elif clean.begins_with("[PLAYER]"):
		return "[color=#55ddff][b][PLAYER][/b][/color]" + clean.substr(8)
	return clean

func _build_turn_damage_report_bbcode() -> String:
	if not turn_losses_active or last_player_attack_hit.is_empty():
		return ""

	var out = ""
	var round_num = last_player_attack_hit.get("round", current_round)
	out += "[b][color=#ff4444]► ATTACK DAMAGE REPORT (ROUND %d) ◄[/color][/b]\n" % round_num

	# 1. Latest Attack Hit That Just Happened
	var hit = last_player_attack_hit
	var att_name = str(hit.get("attacker_name", "Monster"))
	var tgt_name = str(hit.get("target_name", "Hero"))
	var char_name = str(hit.get("character_name", tgt_name))
	var hero_cls = str(hit.get("hero_class", ""))
	var wounds = int(hit.get("wounds_inflicted", 0))
	var skulls = int(hit.get("skulls_rolled", 0))
	var shields = int(hit.get("shields_rolled", 0))
	var prev_bp = int(hit.get("prev_bp", 0))
	var cur_bp = int(hit.get("current_bp", 0))
	var max_bp = int(hit.get("max_bp", 8))
	var is_def = bool(hit.get("is_defeated", false))
	var rock_shattered = bool(hit.get("rock_skin_shattered", false))

	out += "[color=#ff6666][b]LATEST ATTACK HIT:[/b][/color] [b]%s[/b] struck [b][color=#ffffff]%s[/color][/b]!\n" % [att_name, tgt_name]
	out += "  [color=#aaaaaa]Dice Roll:[/color] %d Skulls vs %d White Shields\n" % [skulls, shields]
	out += "  [color=#ff4444]Damage Lost:[/color] [b][color=#ff3333]-%d WOUNDS[/color][/b] (BP: %d -> [b]%d/%d[/b])\n" % [wounds, prev_bp, cur_bp, max_bp]

	if rock_shattered:
		out += "  [color=#ffd700][b][BUFF LOST] Rock Skin was shattered by the blow![/b][/color]\n"
	if is_def:
		out += "  [color=#ff2222][b][DEFEATED] %s has fallen in combat![/b][/color]\n"

	out += "[color=#445566]────────────────────────────────────────────────[/color]\n"

	# 2. Cumulative Character(s) Lost What From The Turn
	out += "[b][color=#ffcc00]CHARACTER LOSSES THIS TURN:[/color][/b]\n"
	var total_wounds = 0
	var char_count = 0
	for hid in turn_player_losses.keys():
		var loss = turn_player_losses[hid]
		var c_name = str(loss.get("hero_name", hid))
		var c_class = str(loss.get("hero_class", ""))
		var w_lost = int(loss.get("wounds_lost", 0))
		var c_cur = int(loss.get("current_bp", 0))
		var c_max = int(loss.get("max_bp", 8))
		var c_shattered = bool(loss.get("rock_skin_shattered", false))
		var c_def = bool(loss.get("is_defeated", false))
		var c_hits = int(loss.get("hit_count", 1))
		total_wounds += w_lost
		char_count += 1

		var bar = _generate_ascii_health_bar(c_cur, c_max, 8)
		var status_str = "[color=#ff2222][DEFEATED][/color]" if c_def else "[color=#44ff44][ALIVE][/color]"
		var hit_info = " (Hit %dx)" % c_hits if c_hits > 1 else ""
		out += "• [b]%s[/b] (%s): [color=#ff4444][b]-%d BP[/b][/color] | Health: [b]%d/%d BP[/b] %s %s%s\n" % [
			c_name, c_class, w_lost, c_cur, c_max, bar, status_str, hit_info
		]
		if c_shattered:
			out += "   ↳ [color=#ffd700][BUFF LOST] Rock Skin Shattered[/color]\n"

	out += "[color=#ff9999]Turn Total: -%d Body Points lost across %d Hero(es)[/color]\n" % [total_wounds, char_count]
	out += "[color=#445566]────────────────────────────────────────────────[/color]\n"

	# 3. Recent Log
	out += "[b][color=#8899aa]RECENT LOG:[/color][/b]\n"
	var recent_lines: Array[String] = []
	for i in range(maxi(0, combat_log.size() - 3), combat_log.size()):
		recent_lines.append(_format_log_line_bbcode(combat_log[i]))
	out += "\n".join(recent_lines)

	return out

func record_player_attack_hit(target_h: Dictionary, monster: Dictionary, res: Dictionary, prev_h_bp: int, rock_shattered: bool) -> void:
	var h_id = str(target_h.get("id", ""))
	var h_name = str(target_h.get("name", "Hero"))
	var c_name = get_hero_character_name(target_h)
	var h_class = get_hero_class_name(target_h)
	var wounds = int(res.get("wounds", 1))
	var cur_bp = int(target_h.get("current_bp", 0))
	var max_bp = int(target_h.get("bodyPoints", 8))
	var is_def = (cur_bp <= 0)

	last_player_attack_hit = {
		"attacker_id": str(monster.get("id", "")),
		"attacker_name": str(monster.get("name", "Monster")),
		"target_id": h_id,
		"target_name": h_name,
		"character_name": c_name,
		"hero_class": h_class,
		"wounds_inflicted": wounds,
		"skulls_rolled": int(res.get("total_skulls", 0)),
		"shields_rolled": int(res.get("effective_shields", 0)),
		"attack_dice": int(monster.get("attackDice", 2)),
		"defend_dice": get_hero_defend_dice(target_h),
		"prev_bp": prev_h_bp,
		"current_bp": cur_bp,
		"max_bp": max_bp,
		"is_defeated": is_def,
		"rock_skin_shattered": rock_shattered,
		"round": current_round,
		"phase": current_phase,
		"timestamp": Time.get_ticks_msec()
	}

	if turn_player_losses.has(h_id):
		var prev_loss = turn_player_losses[h_id]
		prev_loss["wounds_lost"] = int(prev_loss.get("wounds_lost", 0)) + wounds
		prev_loss["current_bp"] = cur_bp
		prev_loss["is_defeated"] = is_def
		if rock_shattered:
			prev_loss["rock_skin_shattered"] = true
		prev_loss["hit_count"] = int(prev_loss.get("hit_count", 1)) + 1
	else:
		turn_player_losses[h_id] = {
			"hero_id": h_id,
			"hero_name": h_name,
			"character_name": c_name,
			"hero_class": h_class,
			"wounds_lost": wounds,
			"start_bp": prev_h_bp,
			"current_bp": cur_bp,
			"max_bp": max_bp,
			"rock_skin_shattered": rock_shattered,
			"is_defeated": is_def,
			"hit_count": 1
		}

	turn_losses_active = true
	log_display_mode = "damage_report"
	_update_log_display()

func _get_total_turn_wounds_lost() -> int:
	var total = 0
	for loss in turn_player_losses.values():
		total += int(loss.get("wounds_lost", 0))
	return total

func _update_log_display() -> void:
	if not log_label:
		return
	if turn_losses_active and log_display_mode == "damage_report" and not last_player_attack_hit.is_empty():
		log_label.text = _build_turn_damage_report_bbcode()
	else:
		var log_text = ""
		for i in range(maxi(0, combat_log.size() - 8), combat_log.size()):
			log_text += _format_log_line_bbcode(combat_log[i]) + "\n"
		log_label.text = log_text

func _log(msg: String) -> void:
	var clean_msg = _sanitize_ui_text(msg)
	print("[Tabletop] ", clean_msg)
	combat_log.append(clean_msg)
	_update_log_display()

func _get_hero_weapon_texture_path(h: Dictionary) -> String:
	var eq_w = str(h.get("equipped_weapon", h.get("weapon", ""))).strip_edges().to_lower()
	if eq_w == "" or eq_w == "unarmed" or eq_w == "fists":
		return ""
	var tex = get_ai_icon_texture("weapon", eq_w)
	if tex and tex.resource_path != "":
		return tex.resource_path
	return str(_ai_icon_paths.get("weapon:%s" % eq_w, ""))

func _get_hero_card_icons_telemetry(h: Dictionary) -> Array:
	var icons_out: Array = []
	var eq_w = str(h.get("equipped_weapon", h.get("weapon", ""))).strip_edges().to_lower()
	if eq_w != "" and eq_w != "unarmed" and eq_w != "fists":
		var w_tex = get_ai_icon_texture("weapon", eq_w)
		var w_meta = HeroQuestEquipment.get_weapon(eq_w)
		var w_name = str(w_meta.get("name", eq_w.replace("_", " ").capitalize()))
		var w_path = (w_tex.resource_path if (w_tex and w_tex.resource_path != "") else str(_ai_icon_paths.get("weapon:%s" % eq_w, "")))
		icons_out.append({
			"type": "weapon",
			"category": "weapon",
			"id": eq_w,
			"name": w_name,
			"texture": w_path,
			"isPotion": ("potion" in w_path)
		})
	for a_id in h.get("equipped_armor", []):
		var a_s = str(a_id).strip_edges().to_lower()
		var a_tex = get_ai_icon_texture("armor", a_s)
		var a_meta = HeroQuestEquipment.get_armor(a_s)
		var a_name = str(a_meta.get("name", a_s.replace("_", " ").capitalize()))
		var a_path = (a_tex.resource_path if (a_tex and a_tex.resource_path != "") else str(_ai_icon_paths.get("armor:%s" % a_s, "")))
		icons_out.append({
			"type": "armor",
			"category": "armor",
			"id": a_s,
			"name": a_name,
			"texture": a_path,
			"isPotion": false
		})
	for s_id in h.get("spells", []):
		var s_s = str(s_id).strip_edges().to_lower()
		var s_tex = get_ai_icon_texture("spell", s_s)
		var s_meta = HeroQuestSpells.get_spell(s_s)
		var s_name = str(s_meta.get("name", s_s.replace("_", " ").capitalize()))
		var s_path = (s_tex.resource_path if (s_tex and s_tex.resource_path != "") else str(_ai_icon_paths.get("spell:%s" % s_s, "")))
		var is_spent = is_spell_used(h, s_s)
		icons_out.append({
			"type": "spell",
			"category": "spell",
			"id": s_s,
			"name": s_name,
			"texture": s_path,
			"isPotion": false,
			"isSpent": is_spent,
			"disabled": is_spent
		})
	for it in h.get("inventory", []):
		var it_s = ""
		if it is Dictionary:
			it_s = str(it.get("id", it.get("item", it.get("name", "")))).strip_edges().to_lower()
		else:
			it_s = str(it).strip_edges().to_lower()
		if it_s == eq_w or h.get("equipped_armor", []).has(it_s):
			continue
		var it_cat = "item"
		if HeroQuestEquipment.get_weapon(it_s).size() > 0 or "broadsword" in it_s or "shortsword" in it_s or "axe" in it_s or "bow" in it_s or "dagger" in it_s or "staff" in it_s:
			it_cat = "weapon"
		elif HeroQuestEquipment.get_armor(it_s).size() > 0 or "shield" in it_s or "helm" in it_s or "mail" in it_s:
			it_cat = "armor"
		elif HeroQuestSpells.get_spell(it_s).size() > 0:
			it_cat = "spell"
		var i_tex = get_ai_icon_texture(it_cat, it_s)
		var i_meta = HeroQuestEquipment.get_item(it_s)
		var i_name = str(i_meta.get("name", it_s.replace("_", " ").capitalize()))
		var i_path = (i_tex.resource_path if (i_tex and i_tex.resource_path != "") else str(_ai_icon_paths.get("%s:%s" % [it_cat, it_s], "")))
		icons_out.append({
			"type": it_cat,
			"category": it_cat,
			"id": it_s,
			"name": i_name,
			"texture": i_path,
			"isPotion": ("potion" in i_path)
		})
	return icons_out

func _get_hero_detail_items_telemetry() -> Array:
	var items_out: Array = []
	var h = null
	for hero in heroes:
		if str(hero.get("id")) == active_detail_hero_id:
			h = hero
			break
	if not h:
		return items_out
	for it in h.get("inventory", []):
		var it_s = ""
		if it is Dictionary:
			it_s = str(it.get("id", it.get("item", it.get("name", "")))).strip_edges().to_lower()
		else:
			it_s = str(it).strip_edges().to_lower()
		var it_cat = "item"
		if HeroQuestEquipment.get_weapon(it_s).size() > 0 or "broadsword" in it_s or "shortsword" in it_s or "axe" in it_s or "bow" in it_s or "dagger" in it_s or "staff" in it_s:
			it_cat = "weapon"
		elif HeroQuestEquipment.get_armor(it_s).size() > 0 or "shield" in it_s or "helm" in it_s or "mail" in it_s:
			it_cat = "armor"
		elif HeroQuestSpells.get_spell(it_s).size() > 0:
			it_cat = "spell"
		var i_tex = get_ai_icon_texture(it_cat, it_s)
		var i_meta = HeroQuestEquipment.get_item(it_s)
		var i_path = (i_tex.resource_path if (i_tex and i_tex.resource_path != "") else str(_ai_icon_paths.get("%s:%s" % [it_cat, it_s], "")))
		items_out.append({
			"id": it_s,
			"name": str(i_meta.get("name", it_s.replace("_", " ").capitalize())),
			"category": it_cat,
			"texture": i_path,
			"isPotion": ("potion" in i_path)
		})
	return items_out

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
		hc["equipped_weapon"] = str(h.get("equipped_weapon", "unarmed"))
		hc["weapon"] = str(h.get("equipped_weapon", h.get("weapon", "unarmed")))
		hc["hasDepartedStart"] = bool(h.get("has_departed_start", false))
		hc["has_departed_start"] = bool(h.get("has_departed_start", false))
		hc["isOnBoard"] = bool(h.get("is_on_board", false))
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

		var eq_w = str(h.get("equipped_weapon", h.get("weapon", ""))).strip_edges().to_lower()
		var eq_a = h.get("equipped_armor", [])
		var h_sp = h.get("spells", [])
		var h_inv = h.get("inventory", [])
		var total_ic = 0
		if eq_w != "" and eq_w != "unarmed" and eq_w != "fists": total_ic += 1
		total_ic += eq_a.size()
		total_ic += h_sp.size()
		for it in h_inv:
			var it_s = ""
			if it is Dictionary:
				it_s = str(it.get("id", it.get("item", it.get("name", "")))).strip_edges().to_lower()
			else:
				it_s = str(it).strip_edges().to_lower()
			if it_s != eq_w and not eq_a.has(it_s): total_ic += 1
		if can_hero_disarm(h).get("is_dwarf", false): total_ic += 1

		var ov_cnt = max(0, total_ic - 20) if total_ic > 21 else 0

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
			"hasGoldBox": true,
			"goldBoxText": ("%d GP" % int(h.get("gold", 0))),
			"isActive": is_act,
			"isOnBoard": bool(h.get("is_on_board", false)),
			"isAlive": cur_bp > 0,
			"weapon": str(h.get("equipped_weapon", h.get("weapon", "unarmed"))),
			"weaponIcon": HeroQuestEquipment.get_weapon(str(h.get("equipped_weapon", h.get("weapon", "")))).get("icon", "⚔️"),
			"weaponTexture": _get_hero_weapon_texture_path(h),
			"cardIcons": _get_hero_card_icons_telemetry(h),
			"armor": h.get("equipped_armor", []),
			"statusEffects": effs,
			"tokenAsset": get_hero_token_path(h),
			"hasTokenTexture": (get_hero_token_texture(h) != null),
			"hasAiBackground": (get_hero_card_bg_texture(str(h.get("id"))) != null),
			"hasPortraitButton": true,
			"aiIconsCount": total_ic,
			"overflowCount": ov_cnt,
			"spells": h.get("spells", []),
			"usedSpells": h.get("used_spells", []).duplicate(),
			"availableSpells": _get_available_spells(h),
			"inventory": h.get("inventory", [])
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
				"hasTokenTexture": (get_monster_token_texture(m) != null),
				"hasAiBackground": (get_monster_card_bg_texture(m) != null),
				"hasPortraitButton": true,
				"monsterKey": get_monster_token_key(m),
				"loreTitle": get_monster_lore(m).get("title", ""),
				"loreArchetype": get_monster_lore(m).get("archetype", "")
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
		var tr_tex = get_tile_texture(tc["type"])
		tc["hasTexture"] = (tr_tex != null)
		tc["texturePath"] = tr_tex.resource_path if tr_tex != null else ""
		traps_copy.append(tc)

	var furniture_copy: Array = []
	for f in furniture:
		var fc = f.duplicate(true)
		var fx = int(f.get("x", f.get("position", [0, 0])[0]))
		var fy = int(f.get("y", f.get("position", [0, 0])[1]))
		var fw = int(f.get("width", f.get("w", 1)))
		var fh = int(f.get("height", f.get("h", 1)))
		var f_type = str(f.get("type", "chest"))
		if f_type == "altar" and fw == 1 and fh == 1:
			fw = 3; fh = 2
		elif f_type == "bookcase" and fw == 1 and fh == 1:
			fw = 3; fh = 1
		elif (f_type == "bookshelf" or f_type == "cupboard") and fw == 1 and fh == 1:
			fw = 2; fh = 1
		elif f_type == "table" and fw == 1 and fh == 1:
			fw = 3; fh = 2
		elif f_type == "tomb" and fw == 1 and fh == 1:
			fw = 2; fh = 3
		fc["x"] = fx
		fc["y"] = fy
		fc["width"] = fw
		fc["height"] = fh
		fc["grid_pos"] = [fx, fy]
		var f_tiles: Array = []
		for tx in range(fx, fx + fw):
			for ty in range(fy, fy + fh):
				f_tiles.append([tx, ty])
		fc["tiles"] = f_tiles
		var f_tex = get_furniture_texture(f_type)
		fc["hasTexture"] = (f_tex != null)
		fc["texturePath"] = f_tex.resource_path if f_tex != null else ""
		furniture_copy.append(fc)

	var wall_blocks_copy: Array = []
	for wb in wall_blocks:
		var wbc = wb.duplicate(true)
		var px = int(wb.get("x", wb.get("position", [0, 0])[0]))
		var py = int(wb.get("y", wb.get("position", [0, 0])[1]))
		var w = int(wb.get("width", 1))
		var h = int(wb.get("height", 1))
		var b_type = str(wb.get("type", "1-tile-wall"))
		if b_type == "2-tile-wall-h" or b_type == "double-h":
			w = 2; h = 1
		elif b_type == "2-tile-wall-v" or b_type == "double-v":
			w = 1; h = 2
		wbc["x"] = px
		wbc["y"] = py
		wbc["grid_pos"] = [px, py]
		var is_rev = is_gm_role()
		if not is_rev:
			for bx in range(px, px + w):
				for by in range(py, py + h):
					if explored_tiles.has(Vector2i(bx, by)):
						is_rev = true
						break
				if is_rev:
					break
		wbc["is_revealed"] = is_rev
		wbc["isRevealed"] = is_rev
		var wb_tex = get_tile_texture("wall_block")
		wbc["hasTexture"] = (wb_tex != null)
		wbc["texturePath"] = wb_tex.resource_path if wb_tex != null else ""
		wall_blocks_copy.append(wbc)

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
			"summon": { "visible": btn_summon.visible, "disabled": btn_summon.disabled, "tooltip": btn_summon.tooltip_text, "icon": "action_summon" } if btn_summon else {},
			"armory": {
				"visible": btn_armory.visible,
				"disabled": btn_armory.disabled,
				"tooltip": btn_armory.tooltip_text,
				"icon": "action_armory",
				"badge": (btn_armory.get_node_or_null("Badge") as Label).text if (btn_armory and btn_armory.get_node_or_null("Badge") and (btn_armory.get_node_or_null("Badge") as Label).visible) else "",
				"badgeVisible": (btn_armory.get_node_or_null("Badge") as Label).visible if (btn_armory and btn_armory.get_node_or_null("Badge")) else false
			} if btn_armory else {},
			"map_end_turn": { "visible": btn_map_end_turn.visible, "disabled": btn_map_end_turn.disabled, "text": btn_map_end_turn.text, "tooltip": btn_map_end_turn.tooltip_text, "icon": "action_end_turn" } if btn_map_end_turn else {}
		},
		"hotbar": {
			"actionsCount": actions_container.get_child_count() if actions_container else 10,
			"scrollHorizontal": actions_scroll.scroll_horizontal if actions_scroll else 0,
			"overflow": (btn_scroll_right.visible or btn_scroll_left.visible) if (btn_scroll_right and btn_scroll_left) else false
		},
		"modal": {
			"aiConfirmModalVisible": ai_confirm_modal.visible if ai_confirm_modal else false,
			"elfSpellSelectModalVisible": elf_spell_modal.visible if elf_spell_modal else false,
			"armoryModalVisible": armory_modal.visible if armory_modal else false,
			"spellCastModalVisible": spell_cast_modal.visible if spell_cast_modal else false,
			"itemUseModalVisible": item_use_modal.visible if item_use_modal else false,
			"disarmTrapModalVisible": disarm_trap_modal.visible if disarm_trap_modal else false,
			"heroDetailModalVisible": hero_detail_modal.visible if hero_detail_modal else false,
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
		"currentRole": current_role,
		"round": current_round,
		"phase": current_phase,
		"activeHero": h_act.get("id", ""),
		"activeHeroId": h_act.get("id", ""),
		"activeHeroIndex": active_hero_idx,
		"activeHeroPos": [h_pos.x, h_pos.y],
		"activeHeroTokenPos": [active_center.x, active_center.y],
		"boardOffset": [board_offset.x, board_offset.y],
		"tileSize": tile_size,
		"movementRemaining": movement_remaining,
		"movementRolled": movement_rolled,
		"hasActed": has_acted_this_turn,
		"hasActedThisTurn": has_acted_this_turn,
		"hasMoved": has_moved_this_turn,
		"hasMovedThisTurn": has_moved_this_turn,
		"movedBeforeAction": moved_before_action,
		"movementClosed": movement_closed,
		"movementStartPos": [movement_start_pos.x, movement_start_pos.y],
		"movementTrail": movement_trail.map(func(v): return [v.x, v.y]),
		"turnState": turn_state,
		"elfElement": current_elf_element,
		"elfSpellModalVisible": elf_spell_modal.visible if elf_spell_modal else false,
		"activeTargeting": {
			"active": is_targeting_active(),
			"type": str(active_targeting.get("type", "")),
			"id": str(active_targeting.get("id", "")),
			"name": str(active_targeting.get("name", "")),
			"heroId": str(active_targeting.get("hero_id", "")),
			"heroName": str(active_targeting.get("hero_name", "")),
			"targetType": str(active_targeting.get("target_type", "")),
			"validTargets": _get_valid_targeting_ids(),
			"hoveredTarget": active_targeting.get("hovered_target", {})
		},
		"spellPanelOpen": spell_cast_modal.visible if spell_cast_modal else false,
		"itemPanelOpen": item_use_modal.visible if item_use_modal else false,
		"disarmModalOpen": disarm_trap_modal.visible if disarm_trap_modal else false,
		"heroDetailModalOpen": hero_detail_modal.visible if hero_detail_modal else false,
		"heroDetailModal": {
			"visible": hero_detail_modal.visible if hero_detail_modal else false,
			"heroId": active_detail_hero_id,
			"heroName": hero_detail_name.text if (hero_detail_modal and hero_detail_modal.visible and hero_detail_name) else "",
			"heroClass": hero_detail_class.text if (hero_detail_modal and hero_detail_modal.visible and hero_detail_class) else "",
			"statusBadge": hero_detail_status_badge.text if (hero_detail_modal and hero_detail_modal.visible and hero_detail_status_badge) else "",
			"inventoryItems": _get_hero_detail_items_telemetry()
		},
		"monsterDetailModalOpen": monster_detail_modal.visible if monster_detail_modal else false,
		"monsterDetailModal": {
			"visible": monster_detail_modal.visible if monster_detail_modal else false,
			"monsterId": active_detail_monster_id,
			"monsterName": monster_detail_name.text if (monster_detail_modal and monster_detail_modal.visible and monster_detail_name) else "",
			"monsterType": monster_detail_type.text if (monster_detail_modal and monster_detail_modal.visible and monster_detail_type) else "",
			"statusBadge": monster_detail_status_badge.text if (monster_detail_modal and monster_detail_modal.visible and monster_detail_status_badge) else "",
			"hasPortrait": (monster_detail_portrait != null and monster_detail_portrait.texture != null)
		},
		"activeHeroSpells": h_act.get("spells", []),
		"activeHeroUsedSpells": h_act.get("used_spells", []).duplicate(),
		"activeHeroAvailableSpells": _get_available_spells(h_act),
		"activeHeroInventory": h_act.get("inventory", []),
		"spellAllocation": {
			"elfElement": current_elf_element,
			"elfSpells": _get_hero_spells_by_id("elf"),
			"wizardSpells": _get_hero_spells_by_id("wizard"),
			"modalVisible": elf_spell_modal.visible if elf_spell_modal else false
		},
		"armoryOpen": armory_open,
		"armoryModalVisible": armory_modal.visible if armory_modal else false,
		"selectedArmoryHeroId": selected_armory_hero_id,
		"armoryCatalog": ARMORY_CATALOG,
		"partyTotalGold": get_total_party_gold(),
		"armoryTabs": (armory_hero_tabs.get_children().map(func(btn): return (btn as Button).text) if (armory_hero_tabs and armory_modal and armory_modal.visible) else []),
		"armoryPartyGoldText": armory_party_gold_badge.text if (armory_party_gold_badge and armory_modal and armory_modal.visible) else "",
		"armoryHeroInfoText": armory_hero_info_text.text if (armory_hero_info_text and armory_modal and armory_modal.visible) else "",
		"armoryItemCards": _get_armory_item_cards_telemetry(),
		"mapEndTurnButton": {
			"visible": btn_map_end_turn.visible if btn_map_end_turn else false,
			"disabled": btn_map_end_turn.disabled if btn_map_end_turn else false,
			"text": btn_map_end_turn.text if btn_map_end_turn else "",
			"tooltip": btn_map_end_turn.tooltip_text if btn_map_end_turn else ""
		},
		"startingStair": [starting_stair.x, starting_stair.y],
		"hasSaveGame": has_saved_game(),
		"saveFilePath": get_save_file_path(),
		"hasStartingStairTexture": (get_tile_texture("stairs") != null),
		"startingStairTexturePath": (get_tile_texture("stairs").resource_path if get_tile_texture("stairs") != null else ""),
		"textureManifest": {
			"furnitureLoadedCount": furniture_textures.size(),
			"tilesLoadedCount": tile_textures.size()
		},
		"isStartingTileSpecial": true,
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
		"unavailableNotice": {
			"active": unavailable_notice_timer > 0.0,
			"text": unavailable_notice_text,
			"timer": unavailable_notice_timer,
			"duration": unavailable_notice_duration,
			"alpha": (unavailable_notice_panel.modulate.a if unavailable_notice_panel else 0.0),
			"isFading": (unavailable_notice_timer > 0.0 and unavailable_notice_timer <= 0.5)
		},
		"hoveredTile": [hovered_tile.x, hovered_tile.y],
		"isMouseOverBoard": (hovered_tile.x >= 0 and hovered_tile.x < grid_cols and hovered_tile.y >= 0 and hovered_tile.y < grid_rows),
		"isShowingReachableIndicators": (movement_rolled and movement_remaining > 0 and not movement_closed and current_phase == "hero_phase" and hovered_tile.x >= 0 and hovered_tile.x < grid_cols and hovered_tile.y >= 0 and hovered_tile.y < grid_rows),
		"reachableWalkTiles": (get_reachable_walk_tiles().map(func(v): return [v.x, v.y])),
		"storyTriggers": story_triggers,
		"activeStoryTrigger": active_story_trigger_overlay,
		"activeEnemyTurnMonsterId": active_enemy_turn_monster_id,
		"isEnemyTurnWaiting": is_enemy_turn_waiting,
		"enemyTurnWaitRemaining": enemy_turn_wait_timer,
		"enemyTurnStage": enemy_turn_stage,
		"enemyTurnStepIndex": enemy_turn_step_index,
		"enemyTurnPath": enemy_turn_path.map(func(v): return [v.x, v.y]),
		"enemyMovementRemaining": enemy_movement_remaining,
		"enemyMovementRolledTotal": enemy_movement_rolled_total,
		"lastDamageEvent": last_damage_event,
		"damageEvents": damage_events,
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
		},
		"trapOverlay": {
			"active": not active_trap_overlay.is_empty(),
			"type": active_trap_overlay.get("type", ""),
			"trapName": active_trap_overlay.get("trap_name", ""),
			"heroName": active_trap_overlay.get("hero_name", ""),
			"title": active_trap_overlay.get("title", ""),
			"description": active_trap_overlay.get("description", ""),
			"flavor": active_trap_overlay.get("flavor", ""),
			"diceCount": active_trap_overlay.get("dice_count", 1),
			"waitingForClick": not active_trap_overlay.is_empty()
		} if not active_trap_overlay.is_empty() else {},
		"treasureOverlay": {
			"active": not active_treasure_overlay.is_empty(),
			"modalVisible": treasure_modal.visible if treasure_modal else false,
			"title": active_treasure_overlay.get("title", ""),
			"icon": active_treasure_overlay.get("icon", "💎"),
			"heroName": active_treasure_overlay.get("hero_name", ""),
			"description": active_treasure_overlay.get("description", ""),
			"flavor": active_treasure_overlay.get("flavor", ""),
			"cardType": active_treasure_overlay.get("card_type", "gold"),
			"isQuestNote": active_treasure_overlay.get("is_quest_note", false),
			"goldFound": active_treasure_overlay.get("gold_found", 0),
			"waitingForClick": not active_treasure_overlay.is_empty(),
			"card": active_treasure_overlay.get("card", {}),
			"deckCount": get_treasure_deck_stats().total,
			"goodsCount": get_treasure_deck_stats().goods,
			"hazardsCount": get_treasure_deck_stats().hazards,
			"hazardRatio": get_treasure_deck_stats().hazardRatio,
			"discardCount": get_treasure_deck_stats().discardCount
		} if not active_treasure_overlay.is_empty() else {},
		"flashItem": {
			"active": not flashing_item.is_empty() and bool(flashing_item.get("active", false)),
			"name": flashing_item.get("name", ""),
			"type": flashing_item.get("type", ""),
			"amount": flashing_item.get("amount", 0),
			"icon": flashing_item.get("icon", ""),
			"heroName": flashing_item.get("hero_name", ""),
			"heroId": flashing_item.get("hero_id", ""),
			"timer": flashing_item.get("timer", 0.0),
			"message": flashing_item.get("message", "")
		} if (not flashing_item.is_empty() and bool(flashing_item.get("active", false))) else {},
		"pendingFlashItem": {
			"active": not pending_flash_item.is_empty(),
			"name": pending_flash_item.get("name", ""),
			"type": pending_flash_item.get("type", ""),
			"amount": pending_flash_item.get("amount", 0),
			"heroId": pending_flash_item.get("hero_id", "")
		} if not pending_flash_item.is_empty() else {},
		"searchedRooms": searched_rooms,
		"roomSpecialTreasureCollected": room_special_treasure_collected,
		"lastTreasureCard": last_treasure_card,
		"treasureDeckCount": treasure_deck.size(),
		"treasureGoodsCount": get_treasure_deck_stats().goods,
		"treasureHazardsCount": get_treasure_deck_stats().hazards,
		"treasureHazardRatio": get_treasure_deck_stats().hazardRatio,
		"treasureDiscardCount": treasure_discard.size(),
		"treasureModalOpen": treasure_modal.visible if treasure_modal else false,
		"lastPlayerAttackHit": last_player_attack_hit,
		"turnPlayerLosses": turn_player_losses,
		"turnDamageSummary": {
			"active": turn_losses_active,
			"displayMode": log_display_mode,
			"lastAttackHit": last_player_attack_hit,
			"characterLosses": turn_player_losses,
			"totalPartyWoundsLost": _get_total_turn_wounds_lost(),
			"damagedCharactersCount": turn_player_losses.size(),
			"displayedLogText": log_label.text if log_label else "",
			"parsedLogText": log_label.get_parsed_text() if log_label else ""
		},
		"displayedLogText": log_label.text if log_label else "",
		"parsedLogText": log_label.get_parsed_text() if log_label else ""
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
		"open_hero_detail", "show_hero_detail", "click_hero_portrait":
			var h_id = str(action_data.get("heroId", action_data.get("id", "")))
			var target_hero: Dictionary = {}
			if not h_id.is_empty():
				for h in heroes:
					if str(h.get("id")) == h_id:
						target_hero = h
						break
			if target_hero.is_empty() and active_hero_idx >= 0 and active_hero_idx < heroes.size():
				target_hero = heroes[active_hero_idx]
			if not target_hero.is_empty():
				open_hero_detail_modal(target_hero)
				return {
					"success": true,
					"heroId": str(target_hero.get("id", "")),
					"heroName": get_hero_character_name(target_hero),
					"modalVisible": hero_detail_modal.visible if hero_detail_modal else false
				}
			return { "success": false, "error": "Hero not found" }
		"close_hero_detail", "dismiss_hero_detail":
			close_hero_detail_modal()
			return {
				"success": true,
				"modalVisible": hero_detail_modal.visible if hero_detail_modal else false
			}
		"open_monster_detail", "show_monster_detail", "click_monster_portrait":
			var m_id = str(action_data.get("monsterId", action_data.get("id", "")))
			var target_monster: Dictionary = {}
			if not m_id.is_empty():
				for m in monsters:
					if str(m.get("id")) == m_id or str(m.get("slug")) == m_id:
						target_monster = m
						break
			if target_monster.is_empty() and monsters.size() > 0:
				target_monster = monsters[0]
			if not target_monster.is_empty():
				open_monster_detail_modal(target_monster)
				return {
					"success": true,
					"monsterId": str(target_monster.get("id", "")),
					"monsterName": str(target_monster.get("name", "")),
					"modalVisible": monster_detail_modal.visible if monster_detail_modal else false
				}
			return { "success": false, "error": "Monster not found" }
		"close_monster_detail", "dismiss_monster_detail":
			close_monster_detail_modal()
			return {
				"success": true,
				"modalVisible": monster_detail_modal.visible if monster_detail_modal else false
			}
		"dismiss_dice_roll":
			dismiss_active_dice_roll()
			return { "success": true }
		"start_targeting":
			var a_type = str(action_data.get("type", action_data.get("action_type", "spell")))
			var a_id = str(action_data.get("id", action_data.get("action_id", "")))
			var h_id = str(action_data.get("hero_id", action_data.get("heroId", "")))
			return start_targeting(a_type, a_id, h_id)
		"toggle_targeting":
			var a_type = str(action_data.get("type", action_data.get("action_type", "spell")))
			var a_id = str(action_data.get("id", action_data.get("action_id", "")))
			var h_id = str(action_data.get("hero_id", action_data.get("heroId", "")))
			toggle_targeting(a_type, a_id, h_id)
			return {
				"success": true,
				"active": is_targeting_active(),
				"targeting": active_targeting
			}
		"cancel_targeting":
			cancel_targeting()
			return {
				"success": true,
				"active": false
			}
		"select_target":
			var t_id = str(action_data.get("target_id", action_data.get("targetId", action_data.get("id", ""))))
			var tile_arr = action_data.get("tile", action_data.get("grid_pos", []))
			if tile_arr is Array and tile_arr.size() >= 2:
				return resolve_targeting_click(Vector2i(int(tile_arr[0]), int(tile_arr[1])))
			elif t_id != "":
				var t_type = str(action_data.get("target_type", action_data.get("type", "")))
				if t_type == "":
					t_type = str(active_targeting.get("target_type", "monster"))
				return resolve_targeting_entity(t_type, t_id)
			return { "success": false, "error": "No target specified for select_target" }
		"click_toolbar_icon":
			var h_id = str(action_data.get("hero_id", action_data.get("heroId", "")))
			var a_type = str(action_data.get("type", "spell"))
			var a_id = str(action_data.get("id", ""))
			toggle_targeting(a_type, a_id, h_id)
			return {
				"success": true,
				"active": is_targeting_active(),
				"targeting": active_targeting
			}
		"close_all_dialogs":
			close_all_dialogs()
			return { "success": true }
		"set_test_mouse_pos":
			var px = float(action_data.get("x", 400.0))
			var py = float(action_data.get("y", 300.0))
			if targeting_cursor:
				targeting_cursor.set_meta("test_mouse_pos", Vector2(px, py))
				_update_targeting_hover_info(Vector2(px, py))
				targeting_cursor.queue_redraw()
			queue_redraw_all()
			return { "success": true, "pos": [px, py] }
		"toggle_log_view", "toggle_log_display_mode":
			var mode = toggle_log_display_mode()
			return { "success": true, "mode": mode, "displayedLogText": log_label.text if log_label else "" }
		"set_log_display_mode":
			log_display_mode = str(action_data.get("mode", "damage_report"))
			_update_log_display()
			return { "success": true, "mode": log_display_mode, "displayedLogText": log_label.text if log_label else "" }
		"clear_turn_damage", "reset_turn_damage":
			turn_player_losses.clear()
			last_player_attack_hit.clear()
			turn_losses_active = false
			_update_log_display()
			return { "success": true }
		"click_treasure_overlay", "resolve_treasure_overlay_click", "dismiss_treasure_overlay":
			if not active_treasure_overlay.is_empty():
				return resolve_treasure_overlay_click()
			return { "success": false, "error": "No active treasure overlay" }
		"click_trap_overlay", "confirm_trap_roll":
			if not active_trap_overlay.is_empty():
				var res = resolve_trap_overlay_click()
				return res
			return { "success": false, "error": "No active trap overlay" }
		"skip_trap_overlay":
			if not active_trap_overlay.is_empty():
				resolve_trap_overlay_click()
				dismiss_active_dice_roll()
				return { "success": true }
		"hover_tile":
			var tx = int(action_data.get("x", action_data.get("tile", [0, 0])[0]))
			var ty = int(action_data.get("y", action_data.get("tile", [0, 0])[1]))
			hovered_tile = Vector2i(tx, ty)
			queue_redraw_all()
			return {
				"success": true,
				"hoveredTile": [hovered_tile.x, hovered_tile.y],
				"isMouseOverBoard": (hovered_tile.x >= 0 and hovered_tile.x < grid_cols and hovered_tile.y >= 0 and hovered_tile.y < grid_rows),
				"isShowingReachableIndicators": (movement_rolled and movement_remaining > 0 and not movement_closed and current_phase == "hero_phase" and hovered_tile.x >= 0 and hovered_tile.x < grid_cols and hovered_tile.y >= 0 and hovered_tile.y < grid_rows),
				"reachableWalkTiles": get_reachable_walk_tiles().map(func(v): return [v.x, v.y])
			}
		"unhover_tile":
			hovered_tile = Vector2i(-1, -1)
			queue_redraw_all()
			return {
				"success": true,
				"hoveredTile": [-1, -1],
				"isMouseOverBoard": false,
				"isShowingReachableIndicators": false
			}
		"click_story_trigger", "resolve_story_trigger", "dismiss_story_trigger":
			if not active_story_trigger_overlay.is_empty():
				return resolve_story_trigger_overlay_click()
			return { "success": false, "error": "No active story trigger overlay" }
		"trigger_story_event":
			var target_id = str(action_data.get("id", action_data.get("marker", "")))
			var found_tr: Dictionary = {}
			for st in story_triggers:
				if str(st.get("id", "")) == target_id or str(st.get("marker", "")) == target_id:
					found_tr = st
					break
			if not found_tr.is_empty():
				found_tr["triggered"] = true
				_setup_story_trigger_overlay(found_tr, get_active_hero())
				return { "success": true, "trigger": found_tr }
			return { "success": false, "error": "Story trigger not found: " + target_id }
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
				"armory": target_btn = btn_armory
				"end_turn": target_btn = btn_end_turn
				"map_end_turn", "btnmapendturn": target_btn = btn_map_end_turn
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
				"armory": target_btn = btn_armory
				"end_turn": target_btn = btn_end_turn
				"map_end_turn", "btnmapendturn": target_btn = btn_map_end_turn
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
			var v_img = get_viewport().get_texture().get_image() if get_viewport() and get_viewport().get_texture() else null
			if not v_img:
				var vp_size = get_viewport().get_visible_rect().size if get_viewport() else Vector2(1280, 720)
				var img_w = int(maxf(100.0, vp_size.x))
				var img_h = int(maxf(100.0, vp_size.y))
				v_img = Image.create(img_w, img_h, false, Image.FORMAT_RGBA8)
				v_img.fill(Color(0.08, 0.05, 0.06, 1.0))
			if v_img:
				var err = v_img.save_png(out_p)
				return { "success": err == OK, "path": out_p }
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
		"set_state", "patch_state":
			if action_data.has("role"):
				current_role = str(action_data.get("role"))
			if action_data.has("currentRole"):
				current_role = str(action_data.get("currentRole"))
			if action_data.has("round"):
				current_round = int(action_data.get("round"))
			elif action_data.has("current_round"):
				current_round = int(action_data.get("current_round"))
			elif action_data.has("currentRound"):
				current_round = int(action_data.get("currentRound"))
			if action_data.has("phase"):
				current_phase = str(action_data.get("phase"))
			elif action_data.has("current_phase"):
				current_phase = str(action_data.get("current_phase"))
			elif action_data.has("currentPhase"):
				current_phase = str(action_data.get("currentPhase"))
			if action_data.has("activeHeroIndex") or action_data.has("active_hero_index"):
				active_hero_idx = int(action_data.get("activeHeroIndex", action_data.get("active_hero_index", 0)))
			if action_data.has("activeHero") or action_data.has("active_hero"):
				var req_h = str(action_data.get("activeHero", action_data.get("active_hero", "")))
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
			elif action_data.has("hasActedThisTurn"):
				has_acted_this_turn = bool(action_data.get("hasActedThisTurn"))
			elif action_data.has("has_acted_this_turn"):
				has_acted_this_turn = bool(action_data.get("has_acted_this_turn"))
			if action_data.has("hasMoved"):
				has_moved_this_turn = bool(action_data.get("hasMoved"))
			elif action_data.has("hasMovedThisTurn"):
				has_moved_this_turn = bool(action_data.get("hasMovedThisTurn"))
			if action_data.has("movedBeforeAction"):
				moved_before_action = bool(action_data.get("movedBeforeAction"))
			elif (action_data.has("hasMoved") or action_data.has("hasMovedThisTurn")) and (action_data.has("hasActed") or action_data.has("hasActedThisTurn")):
				moved_before_action = bool(action_data.get("hasMoved", action_data.get("hasMovedThisTurn")))
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
			if action_data.has("trapOverlay"):
				if action_data.trapOverlay is Dictionary:
					active_trap_overlay = action_data.trapOverlay
				elif not bool(action_data.trapOverlay):
					active_trap_overlay = {}
			if action_data.has("treasureOverlay"):
				if action_data.treasureOverlay is Dictionary:
					active_treasure_overlay = action_data.treasureOverlay.duplicate(true)
				elif not bool(action_data.treasureOverlay):
					active_treasure_overlay = {}
			if action_data.has("flashItem"):
				if action_data.flashItem is Dictionary:
					flashing_item = action_data.flashItem.duplicate(true)
				elif not bool(action_data.flashItem):
					flashing_item = {}
			if action_data.has("pendingFlashItem"):
				if action_data.pendingFlashItem is Dictionary:
					pending_flash_item = action_data.pendingFlashItem.duplicate(true)
				elif not bool(action_data.pendingFlashItem):
					pending_flash_item = {}
			if action_data.has("searchedRooms"):
				searched_rooms = action_data.get("searchedRooms").duplicate(true)
			elif not action_data.has("preserveSearchedRooms") and (action_data.has("activeHero") or action_data.has("hasActed")):
				searched_rooms.clear()
				room_special_treasure_collected.clear()
			if action_data.has("roomSpecialTreasureCollected"):
				room_special_treasure_collected = action_data.get("roomSpecialTreasureCollected").duplicate(true)
			if action_data.has("treasureDeck") and action_data.treasureDeck is Array:
				treasure_deck.clear()
				for c in action_data.treasureDeck:
					treasure_deck.append(c.duplicate(true))
			if action_data.has("treasureDiscard") and action_data.treasureDiscard is Array:
				treasure_discard.clear()
				for c in action_data.treasureDiscard:
					treasure_discard.append(c.duplicate(true))
			if action_data.has("furniture") and action_data.furniture is Array:
				furniture.clear()
				for f in action_data.furniture:
					furniture.append(f.duplicate(true))
				_rebuild_spatial_caches()
			if action_data.has("resetTurnLosses") and bool(action_data.get("resetTurnLosses")):
				turn_player_losses.clear()
				last_player_attack_hit.clear()
				turn_losses_active = false
				_update_log_display()
			if action_data.has("turnLossesActive"):
				turn_losses_active = bool(action_data.get("turnLossesActive"))
				_update_log_display()
			if action_data.has("logDisplayMode"):
				log_display_mode = str(action_data.get("logDisplayMode"))
				_update_log_display()
			if action_data.has("turnPlayerLosses") and action_data.turnPlayerLosses is Dictionary:
				turn_player_losses = action_data.get("turnPlayerLosses").duplicate(true)
				turn_losses_active = true
				_update_log_display()
			if action_data.has("lastPlayerAttackHit") and action_data.lastPlayerAttackHit is Dictionary:
				last_player_attack_hit = action_data.get("lastPlayerAttackHit").duplicate(true)
				turn_losses_active = true
				_update_log_display()
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
								elif k == "hasDepartedStart" or k == "has_departed_start":
									h["has_departed_start"] = bool(h_patch[k])
								elif k == "used_spells" or k == "usedSpells":
									h["used_spells"] = h_patch[k].duplicate(true) if (h_patch[k] is Array) else []
								else:
									h[k] = h_patch[k]
							break
			if action_data.has("clearMonsters") and bool(action_data.get("clearMonsters")):
				monsters.clear()
			if action_data.has("monsters") and action_data.monsters is Array:
				if action_data.monsters.is_empty() or action_data.get("clearMonsters", false) or action_data.get("resetMonsters", false):
					monsters.clear()
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

			if action_data.has("storyTriggers") and action_data.storyTriggers is Array:
				for st_patch in action_data.storyTriggers:
					var st_id = str(st_patch.get("id", st_patch.get("marker", "")))
					var found_st = false
					for st in story_triggers:
						if str(st.get("id")) == st_id or str(st.get("marker")) == st_id:
							for k in st_patch:
								st[k] = st_patch[k]
							found_st = true
							break
					if not found_st:
						story_triggers.append(st_patch.duplicate(true))

			if action_data.has("revealedRooms") and action_data.revealedRooms is Array:
				revealed_rooms.clear()
				for r in action_data.revealedRooms:
					revealed_rooms.append(str(r))
			if action_data.has("discoveredMonsterIds") or action_data.has("discovered_monster_ids"):
				var dm_arr = action_data.get("discoveredMonsterIds", action_data.get("discovered_monster_ids", []))
				if dm_arr is Array:
					discovered_monster_ids.clear()
					for mid in dm_arr:
						discovered_monster_ids[str(mid)] = true
			if action_data.has("showDefeatedMonsters") or action_data.has("show_defeated_monsters"):
				show_defeated_monsters = bool(action_data.get("showDefeatedMonsters", action_data.get("show_defeated_monsters", false)))
			if action_data.has("resetExplored") and bool(action_data.resetExplored):
				explored_tiles.clear()
			if action_data.has("resetFloatingTexts") and bool(action_data.resetFloatingTexts):
				floating_texts.clear()
			if action_data.has("isEnemyTurnWaiting"):
				is_enemy_turn_waiting = bool(action_data.get("isEnemyTurnWaiting"))
				if not is_enemy_turn_waiting:
					pending_enemy_turn_monsters.clear()
					enemy_turn_stage = "idle"
					enemy_turn_path.clear()
					enemy_turn_step_index = 0
					movement_trail.clear()
					if active_dice_animation.get("type", "") == "movement":
						active_dice_animation = {}
			if action_data.has("activeEnemyTurnMonsterId"):
				active_enemy_turn_monster_id = str(action_data.get("activeEnemyTurnMonsterId"))
			if action_data.has("enemyTurnWaitTimer"):
				enemy_turn_wait_timer = float(action_data.get("enemyTurnWaitTimer"))
			if action_data.has("enemyTurnWaitDuration"):
				enemy_turn_wait_duration = float(action_data.get("enemyTurnWaitDuration"))
			if action_data.has("showHeroDetail") or action_data.has("heroDetail"):
				var req_id = str(action_data.get("showHeroDetail", action_data.get("heroDetail", "")))
				var target_hero: Dictionary = {}
				for h in heroes:
					if str(h.get("id")) == req_id:
						target_hero = h
						break
				if target_hero.is_empty() and active_hero_idx >= 0 and active_hero_idx < heroes.size():
					target_hero = heroes[active_hero_idx]
				if not target_hero.is_empty():
					open_hero_detail_modal(target_hero)
			if action_data.has("closeHeroDetail") and bool(action_data.get("closeHeroDetail")):
				close_hero_detail_modal()
			if action_data.has("showMonsterDetail") or action_data.has("monsterDetail"):
				var req_m_id = str(action_data.get("showMonsterDetail", action_data.get("monsterDetail", "")))
				var target_monster: Dictionary = {}
				for m in monsters:
					if str(m.get("id")) == req_m_id or str(m.get("slug")) == req_m_id:
						target_monster = m
						break
				if target_monster.is_empty() and monsters.size() > 0:
					target_monster = monsters[0]
				if not target_monster.is_empty():
					open_monster_detail_modal(target_monster)
			if action_data.has("closeMonsterDetail") and bool(action_data.get("closeMonsterDetail")):
				close_monster_detail_modal()
			_rebuild_spatial_caches()
			update_party_vision()
			_update_ui()
			queue_redraw_all()
			auto_save_game()
			return { "success": true }
		"reset_game", "reset_quest", "force_reload":
			var clear_save = bool(action_data.get("clear_save", action_data.get("clearSave", true)))
			if clear_save:
				delete_save_game()
			_load_active_cartridge(true)
			return { "success": true }
		"save_game", "autosave":
			auto_save_game()
			return { "success": true, "path": get_save_file_path() }
		"load_game", "restore_game":
			var ok = restore_saved_game()
			return { "success": ok, "path": get_save_file_path() }
		"has_save_game":
			return { "success": true, "has_save": has_saved_game(), "path": get_save_file_path() }
		"delete_save_game", "clear_save":
			var ok = delete_save_game()
			return { "success": ok, "path": get_save_file_path() }
		"reset_quest_spells", "reset_spells":
			reset_all_heroes_spells_for_quest()
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
			var is_interactive = bool(action_data.get("interactive", false))
			var ok = move_hero(Vector2i(tx, ty), is_interactive)
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
			if has_party_gold_for_armory():
				open_armory()
			return { "success": true, "modal_visible": false, "armory_opened": armory_open }
		"confirm_spell_selection", "confirm_elf_spell_selection":
			return confirm_elf_spell_selection()
		"select_elf_element":
			var elem = str(action_data.get("element", action_data.get("deck", "water")))
			var confirm_flag = bool(action_data.get("confirm", true))
			var res = select_elf_element(elem)
			if confirm_flag:
				res = confirm_elf_spell_selection()
			return res
		"cast_spell":
			var spell_id = str(action_data.get("spell", action_data.get("spellId", "")))
			var target_id = str(action_data.get("target", action_data.get("targetId", "")))
			var caster_id = str(action_data.get("caster", action_data.get("heroId", action_data.get("hero", ""))))
			var tx = int(action_data.get("tile_x", -1))
			var ty = int(action_data.get("tile_y", -1))
			var res = cast_spell(spell_id, target_id, Vector2i(tx, ty), caster_id)
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
		"open_armory":
			var h_id = str(action_data.get("heroId", action_data.get("hero", "")))
			open_armory(h_id)
			return {
				"success": true,
				"armoryOpen": armory_open,
				"modalVisible": armory_modal.visible if armory_modal else false,
				"selectedHeroId": selected_armory_hero_id,
				"partyTotalGold": get_total_party_gold()
			}
		"close_armory":
			close_armory()
			return {
				"success": true,
				"armoryOpen": armory_open,
				"modalVisible": armory_modal.visible if armory_modal else false
			}
		"toggle_armory":
			toggle_armory()
			return {
				"success": true,
				"armoryOpen": armory_open,
				"modalVisible": armory_modal.visible if armory_modal else false,
				"selectedHeroId": selected_armory_hero_id,
				"partyTotalGold": get_total_party_gold()
			}
		"select_armory_hero":
			var h_id = str(action_data.get("heroId", action_data.get("hero", "barbarian")))
			select_armory_hero(h_id)
			return {
				"success": true,
				"selectedHeroId": selected_armory_hero_id
			}
		"buy_armory_item", "buy_item":
			var h_id = str(action_data.get("heroId", action_data.get("hero_id", action_data.get("hero", selected_armory_hero_id))))
			var item_id = str(action_data.get("itemId", action_data.get("item_id", action_data.get("item", ""))))
			var res = buy_armory_item(h_id, item_id)
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
		"search", "search_room", "search_treasure":
			var is_interactive = bool(action_data.get("interactive", false))
			var res = search_room(is_interactive)
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
		"click_tile":
			var tx = int(action_data.get("x", action_data.get("tile", [0, 0])[0]))
			var ty = int(action_data.get("y", action_data.get("tile", [0, 0])[1]))
			_handle_tile_click(Vector2i(tx, ty))
			return { "success": true, "tile": [tx, ty] }
		"trigger_unavailable_notice", "show_unavailable_notice":
			var n_text = str(action_data.get("text", action_data.get("notice", "Not enough actions")))
			var tx = int(action_data.get("tile_x", action_data.get("x", -1)))
			var ty = int(action_data.get("tile_y", action_data.get("y", -1)))
			var t_pos = Vector2i(tx, ty) if tx >= 0 and ty >= 0 else Vector2i(-1, -1)
			show_unavailable_notice(n_text, t_pos)
			return { "success": true, "text": n_text }
		"click_action_button":
			var btn_name = str(action_data.get("button", action_data.get("name", "")))
			var target_btn: Button = null
			match btn_name.to_lower():
				"roll", "btnroll": target_btn = btn_roll
				"attack", "btnattack": target_btn = btn_attack
				"spell", "btncastspell", "cast_spell": target_btn = btn_cast_spell
				"item", "btnuseitem", "use_item": target_btn = btn_use_item
				"search", "btnsearch": target_btn = btn_search
				"traps", "btnsearchtraps", "search_traps": target_btn = btn_search_traps
				"disarm", "btndisarmtrap", "disarm_trap": target_btn = btn_disarm_trap
				"end_turn", "btnendturn": target_btn = btn_end_turn
				"summon", "btnsummon": target_btn = btn_summon
				"ai_step", "btnaistep": target_btn = btn_ai_step
				"armory", "btnarmory": target_btn = btn_armory
				"map_end_turn", "btnmapendturn", "end_turn_top_right", "map_end": target_btn = btn_map_end_turn
			if target_btn:
				if target_btn.disabled:
					var reason = _get_button_unavailable_reason(target_btn)
					if reason != "":
						show_unavailable_notice(reason, Vector2i(-1, -1), target_btn.global_position + target_btn.size * 0.5)
					return { "success": false, "clicked": false, "disabled": true, "reason": reason }
				else:
					if target_btn == btn_end_turn or target_btn == btn_map_end_turn:
						end_turn()
					else:
						target_btn.emit_signal("pressed")
					return { "success": true, "clicked": true, "disabled": false }
			return { "success": false, "error": "Button not found: " + btn_name }
		"click_map_end_turn", "map_end_turn":
			if btn_map_end_turn:
				if btn_map_end_turn.disabled:
					var reason = _get_button_unavailable_reason(btn_map_end_turn)
					if reason != "":
						show_unavailable_notice(reason, Vector2i(-1, -1), btn_map_end_turn.global_position + btn_map_end_turn.size * 0.5)
					return { "success": false, "clicked": false, "disabled": true, "reason": reason }
			end_turn()
			return { "success": true, "clicked": true, "disabled": false }
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
			if action_data.get("async", false) or action_data.get("interactive", false):
				return start_ai_monster_turn_sequence()
			else:
				var res = ai_monster_turn()
				return res
		"start_enemy_turn", "start_ai_monster_turn", "trigger_enemy_turn":
			return start_ai_monster_turn_sequence()
		"skip_enemy_timeout", "skip_enemy_turn_timeout":
			return skip_enemy_turn_timeout()
		"set_enemy_turn_timeout":
			enemy_turn_wait_duration = float(action_data.get("duration", 1.5))
			return { "success": true, "duration": enemy_turn_wait_duration }
		"trigger_damage_event":
			var t_name = str(action_data.get("target_name", "Target"))
			var t_id = str(action_data.get("target_id", "target"))
			var wounds = int(action_data.get("wounds", 1))
			var cur_bp = int(action_data.get("current_bp", 5))
			var max_bp = int(action_data.get("max_bp", 8))
			var tile = Vector2i(int(action_data.get("x", 2)), int(action_data.get("y", 2)))
			var is_hero = bool(action_data.get("is_hero", true))
			var is_def = bool(action_data.get("is_defeat", cur_bp <= 0))
			var evt = record_damage_event(t_name, t_id, wounds, cur_bp, max_bp, tile, is_hero, is_def)
			return { "success": true, "event": evt }
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

		# Game Master Mode: Draw Story Trigger Markers ([A], [B], etc.)
		_draw_gm_story_trigger_markers(canvas)

	# Draw Reachable Walk Tile Indicators (Green outline around walkable tiles on revealed map when hovering over map)
	_draw_reachable_walk_indicators(canvas)

	# Draw Wall Blocks (1-tile and 2-tile walls)
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

		var is_visible = is_gm_role()
		if not is_visible:
			for bx in range(px, px + w):
				for by in range(py, py + h):
					if explored_tiles.has(Vector2i(bx, by)):
						is_visible = true
						break
				if is_visible:
					break

		if is_visible:
			var block_rect = Rect2(board_offset + Vector2(px * tile_size + 2, py * tile_size + 2), Vector2(w * tile_size - 4, h * tile_size - 4))
			var wb_tex = get_tile_texture("wall_block")
			if wb_tex:
				for bx in range(w):
					for by in range(h):
						var c_rect = Rect2(board_offset + Vector2((px + bx) * tile_size + 1, (py + by) * tile_size + 1), Vector2(tile_size - 2, tile_size - 2))
						canvas.draw_texture_rect(wb_tex, c_rect, false)
						canvas.draw_rect(c_rect, Color(0.1, 0.1, 0.15, 0.6), false, 1.0)
			else:
				# Base stone (dark masonry)
				canvas.draw_rect(block_rect, Color(0.18, 0.20, 0.24, 0.98))
				canvas.draw_rect(block_rect, Color(0.48, 0.54, 0.62, 1.0), false, 2.0)
				# Inner masonry lines (clean geometric X crossbar)
				canvas.draw_line(block_rect.position + Vector2(4, 4), block_rect.end - Vector2(4, 4), Color(0.35, 0.40, 0.48, 0.7), 1.5)
				canvas.draw_line(Vector2(block_rect.end.x - 4, block_rect.position.y + 4), Vector2(block_rect.position.x + 4, block_rect.end.y - 4), Color(0.35, 0.40, 0.48, 0.7), 1.5)
				# Clean embossed [BLOCK] label
				var font = ThemeDB.fallback_font
				var lbl = "BLOCK"
				var lbl_size = font.get_string_size(lbl, HORIZONTAL_ALIGNMENT_CENTER, -1, 10)
				var lbl_bg = Rect2(block_rect.get_center().x - lbl_size.x * 0.5 - 4, block_rect.get_center().y - lbl_size.y * 0.5 - 2, lbl_size.x + 8, lbl_size.y + 4)
				canvas.draw_rect(lbl_bg, Color(0.10, 0.12, 0.16, 0.90))
				canvas.draw_rect(lbl_bg, Color(0.55, 0.60, 0.70, 0.8), false, 1.0)
				canvas.draw_string(font, Vector2(block_rect.get_center().x - lbl_size.x * 0.5, block_rect.get_center().y + lbl_size.y * 0.35), lbl, HORIZONTAL_ALIGNMENT_CENTER, -1, 10, Color(0.90, 0.92, 0.98, 0.95))

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

			var tr_tex = get_tile_texture(t_type)
			if tr_tex:
				# Drop shadow
				canvas.draw_rect(Rect2(trap_rect.position + Vector2(1, 1), trap_rect.size), Color(0.0, 0.0, 0.0, 0.5))
				# Authentic AI Texture
				canvas.draw_texture_rect(tr_tex, trap_rect, false)

				if is_dis:
					canvas.draw_rect(trap_rect, Color(0.25, 0.85, 0.45, 0.9), false, 1.5)
					var b_rect = Rect2(trap_rect.get_center().x - 14, trap_rect.get_center().y - 6, 28, 12)
					canvas.draw_rect(b_rect, Color(0.10, 0.22, 0.12, 0.85))
					canvas.draw_rect(b_rect, Color(0.25, 0.85, 0.45, 0.9), false, 1.0)
					canvas.draw_string(ThemeDB.fallback_font, trap_rect.get_center() + Vector2(-11, 3), "SAFE", HORIZONTAL_ALIGNMENT_CENTER, -1, 9, Color(0.4, 1.0, 0.6, 0.95))
				elif "spear" in t_type:
					if is_spn or is_spr:
						canvas.draw_rect(trap_rect, Color(0.55, 0.60, 0.68, 0.75), false, 1.5)
						var b_rect = Rect2(trap_rect.get_center().x - 17, trap_rect.get_center().y - 6, 34, 12)
						canvas.draw_rect(b_rect, Color(0.15, 0.17, 0.20, 0.85))
						canvas.draw_rect(b_rect, Color(0.55, 0.60, 0.68, 0.75), false, 1.0)
						canvas.draw_string(ThemeDB.fallback_font, trap_rect.get_center() + Vector2(-15, 3), "SPENT", HORIZONTAL_ALIGNMENT_CENTER, -1, 9, Color(0.7, 0.75, 0.82, 0.9))
					elif is_det:
						canvas.draw_rect(trap_rect, Color(1.0, 0.55, 0.15, 0.95), false, 1.5)
						var b_rect = Rect2(trap_rect.get_center().x - 18, trap_rect.get_center().y - 6, 36, 12)
						canvas.draw_rect(b_rect, Color(0.25, 0.12, 0.05, 0.85))
						canvas.draw_rect(b_rect, Color(1.0, 0.55, 0.15, 0.95), false, 1.0)
						canvas.draw_string(ThemeDB.fallback_font, trap_rect.get_center() + Vector2(-15, 3), "SPEAR", HORIZONTAL_ALIGNMENT_CENTER, -1, 8, Color(1.0, 0.85, 0.5, 0.95))
					elif is_gm:
						canvas.draw_rect(trap_rect, Color(0.85, 0.3, 0.85, 0.85), false, 1.5)
						var b_rect = Rect2(trap_rect.get_center().x - 24, trap_rect.get_center().y - 6, 48, 12)
						canvas.draw_rect(b_rect, Color(0.25, 0.05, 0.25, 0.85))
						canvas.draw_rect(b_rect, Color(0.85, 0.3, 0.85, 0.85), false, 1.0)
						canvas.draw_string(ThemeDB.fallback_font, trap_rect.get_center() + Vector2(-22, 3), "GM: SPEAR", HORIZONTAL_ALIGNMENT_CENTER, -1, 8, Color(0.9, 0.6, 1.0, 0.9))
				elif "falling" in t_type or "boulder" in t_type or "rock" in t_type:
					if is_blk or is_spr:
						canvas.draw_rect(trap_rect, Color(0.55, 0.60, 0.68, 1.0), false, 2.0)
						var b_rect = Rect2(trap_rect.get_center().x - 18, trap_rect.get_center().y - 6, 36, 12)
						canvas.draw_rect(b_rect, Color(0.12, 0.14, 0.18, 0.85))
						canvas.draw_rect(b_rect, Color(0.55, 0.60, 0.68, 1.0), false, 1.0)
						canvas.draw_string(ThemeDB.fallback_font, trap_rect.get_center() + Vector2(-16, 3), "BLOCK", HORIZONTAL_ALIGNMENT_CENTER, -1, 9, Color(0.85, 0.88, 0.95, 0.9))
					elif is_det:
						canvas.draw_rect(trap_rect, Color(0.95, 0.55, 0.2, 0.95), false, 1.5)
						var b_rect = Rect2(trap_rect.get_center().x - 18, trap_rect.get_center().y - 6, 36, 12)
						canvas.draw_rect(b_rect, Color(0.25, 0.12, 0.05, 0.85))
						canvas.draw_rect(b_rect, Color(0.95, 0.55, 0.2, 0.95), false, 1.0)
						canvas.draw_string(ThemeDB.fallback_font, trap_rect.get_center() + Vector2(-16, 3), "BLOCK", HORIZONTAL_ALIGNMENT_CENTER, -1, 9, Color(1.0, 0.85, 0.6, 0.95))
					elif is_gm:
						canvas.draw_rect(trap_rect, Color(0.85, 0.3, 0.85, 0.85), false, 1.5)
						var b_rect = Rect2(trap_rect.get_center().x - 24, trap_rect.get_center().y - 6, 48, 12)
						canvas.draw_rect(b_rect, Color(0.25, 0.05, 0.25, 0.85))
						canvas.draw_rect(b_rect, Color(0.85, 0.3, 0.85, 0.85), false, 1.0)
						canvas.draw_string(ThemeDB.fallback_font, trap_rect.get_center() + Vector2(-22, 3), "GM: BLOCK", HORIZONTAL_ALIGNMENT_CENTER, -1, 8, Color(0.9, 0.6, 1.0, 0.9))
				else:
					if is_spr:
						canvas.draw_rect(trap_rect, Color(0.85, 0.15, 0.15, 0.95), false, 2.0)
						var b_rect = Rect2(trap_rect.get_center().x - 12, trap_rect.get_center().y - 6, 24, 12)
						canvas.draw_rect(b_rect, Color(0.20, 0.05, 0.05, 0.85))
						canvas.draw_rect(b_rect, Color(0.85, 0.15, 0.15, 0.95), false, 1.0)
						canvas.draw_string(ThemeDB.fallback_font, trap_rect.get_center() + Vector2(-10, 3), "PIT", HORIZONTAL_ALIGNMENT_CENTER, -1, 9, Color(1.0, 0.3, 0.3, 0.95))
					elif is_det:
						canvas.draw_rect(trap_rect, Color(1.0, 0.3, 0.2, 0.95), false, 1.5)
						var b_rect = Rect2(trap_rect.get_center().x - 12, trap_rect.get_center().y - 6, 24, 12)
						canvas.draw_rect(b_rect, Color(0.25, 0.05, 0.05, 0.85))
						canvas.draw_rect(b_rect, Color(1.0, 0.3, 0.2, 0.95), false, 1.0)
						canvas.draw_string(ThemeDB.fallback_font, trap_rect.get_center() + Vector2(-10, 3), "PIT", HORIZONTAL_ALIGNMENT_CENTER, -1, 9, Color(1.0, 0.85, 0.8, 0.95))
					elif is_gm:
						canvas.draw_rect(trap_rect, Color(0.85, 0.3, 0.85, 0.85), false, 1.5)
						var b_rect = Rect2(trap_rect.get_center().x - 20, trap_rect.get_center().y - 6, 40, 12)
						canvas.draw_rect(b_rect, Color(0.25, 0.05, 0.25, 0.85))
						canvas.draw_rect(b_rect, Color(0.85, 0.3, 0.85, 0.85), false, 1.0)
						canvas.draw_string(ThemeDB.fallback_font, trap_rect.get_center() + Vector2(-18, 3), "GM: PIT", HORIZONTAL_ALIGNMENT_CENTER, -1, 8, Color(0.9, 0.6, 1.0, 0.9))
			elif is_dis:
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
			var f_tex = get_furniture_texture(f_type)
			if f_type == "boulder":
				f_tex = get_tile_texture("boulder")

			if f_tex:
				# Drop shadow under furniture
				canvas.draw_rect(Rect2(f_rect.position + Vector2(2, 2), f_rect.size), Color(0.0, 0.0, 0.0, 0.55))
				canvas.draw_texture_rect(f_tex, f_rect, false)
				# Subtle border highlight
				canvas.draw_rect(f_rect, Color(0.65, 0.55, 0.35, 0.4), false, 1.0)
			else:
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

			# Check if this chest or furniture is trapped
			if f_type == "chest" or "chest" in f_type:
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
	var st_tex = get_tile_texture("stairs")
	if st_tex:
		# Drop shadow and texture
		canvas.draw_rect(Rect2(stair_rect.position + Vector2(2, 2), stair_rect.size), Color(0.0, 0.0, 0.0, 0.5))
		canvas.draw_texture_rect(st_tex, stair_rect, false)
		canvas.draw_rect(stair_rect, Color(0.45, 0.60, 0.75, 0.9), false, 1.5)
		var st_w = ThemeDB.fallback_font.get_string_size("STAIR", HORIZONTAL_ALIGNMENT_CENTER, -1, 8).x
		var b_rect = Rect2(stair_rect.get_center().x - st_w * 0.5 - 3, stair_rect.get_center().y - 4, st_w + 6, 12)
		canvas.draw_rect(b_rect, Color(0.10, 0.12, 0.18, 0.85))
		canvas.draw_rect(b_rect, Color(0.45, 0.60, 0.75, 0.8), false, 1.0)
		canvas.draw_string(ThemeDB.fallback_font, Vector2(stair_rect.get_center().x - st_w * 0.5, stair_rect.get_center().y + 5), "STAIR", HORIZONTAL_ALIGNMENT_CENTER, -1, 8, Color(0.85, 0.9, 1.0, 0.95))
	else:
		canvas.draw_rect(stair_rect, Color(0.18, 0.22, 0.28, 0.95))
		canvas.draw_rect(stair_rect, Color(0.45, 0.60, 0.75, 1.0), false, 1.5)
		canvas.draw_arc(stair_rect.get_center(), tile_size * 0.36, 0, TAU, 24, Color(0.35, 0.45, 0.58, 0.8), 1.5)
		canvas.draw_arc(stair_rect.get_center(), tile_size * 0.20, 0, TAU, 16, Color(0.55, 0.68, 0.82, 0.9), 1.5)
		var st_w = ThemeDB.fallback_font.get_string_size("STAIR", HORIZONTAL_ALIGNMENT_CENTER, -1, 8).x
		canvas.draw_string(ThemeDB.fallback_font, Vector2(stair_rect.get_center().x - st_w * 0.5, stair_rect.get_center().y + 3), "STAIR", HORIZONTAL_ALIGNMENT_CENTER, -1, 8, Color(0.85, 0.9, 1.0, 0.85))

	# Draw Movement Trail (Green line from where hero or monster came from with moves remaining in middle)
	var is_enemy_moving = (is_enemy_turn_waiting or active_enemy_turn_monster_id != "") and (enemy_turn_stage in ["moving", "pause_after_move", "acting", "waiting_for_action"])
	if movement_trail.size() >= 2 and (has_moved_this_turn or movement_remaining > 0 or is_enemy_moving):
		var pts: Array[Vector2] = []
		for tile_coord in movement_trail:
			pts.append(board_offset + Vector2(tile_coord.x * tile_size + tile_size * 0.5, tile_coord.y * tile_size + tile_size * 0.5))

		# 1. Start origin footprint ring (where the character came from)
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
		var moves_num = movement_remaining if current_phase == "hero_phase" else enemy_movement_remaining
		if total_len >= 75.0:
			badge_txt = ("%d MOVES LEFT" % moves_num) if moves_num != 1 else "1 MOVE LEFT"
		else:
			badge_txt = "%d LEFT" % moves_num

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
	_draw_targeting_board_highlights(canvas)
	_draw_vfx_effects(canvas)
	_draw_damage_hit_auras(canvas)
	_draw_active_enemy_turn_highlight(canvas)
	_draw_floating_texts(canvas)
	_draw_active_dice_roll(canvas)
	_draw_trap_sprung_overlay(canvas)
	_draw_treasure_card_overlay(canvas)
	_draw_story_trigger_overlay(canvas)
	_draw_item_flash_banner(canvas)

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

func _draw_reachable_walk_indicators(canvas: CanvasItem) -> void:
	if not movement_rolled or movement_remaining <= 0 or movement_closed:
		return
	if current_phase != "hero_phase" or (current_role != "player" and not is_gm_role()):
		return
	if hovered_tile.x < 0 or hovered_tile.x >= grid_cols or hovered_tile.y < 0 or hovered_tile.y >= grid_rows:
		return

	var reachable_tiles = get_reachable_walk_tiles()
	if reachable_tiles.is_empty():
		return

	var normal_border = Color(0.20, 0.95, 0.42, 0.88)
	var normal_fill = Color(0.12, 0.75, 0.35, 0.16)
	var hover_border = Color(0.35, 1.0, 0.55, 1.0)
	var hover_fill = Color(0.25, 0.95, 0.48, 0.32)
	var bracket_len: float = 6.0

	for t in reachable_tiles:
		var is_hovered = (t == hovered_tile)
		var b_col = hover_border if is_hovered else normal_border
		var f_col = hover_fill if is_hovered else normal_fill
		var line_w: float = 2.5 if is_hovered else 1.8

		var t_pos = board_offset + Vector2(t.x * tile_size, t.y * tile_size)
		var inset: float = 2.0
		var r = Rect2(t_pos.x + inset, t_pos.y + inset, tile_size - inset * 2.0, tile_size - inset * 2.0)

		# 1. Subtle glowing translucent fill
		canvas.draw_rect(r, f_col, true)

		# 2. Crisp perimeter contour outline
		canvas.draw_rect(r, b_col, false, line_w)

		# 3. Tactical corner brackets
		# Top-Left corner
		canvas.draw_line(Vector2(r.position.x, r.position.y), Vector2(r.position.x + bracket_len, r.position.y), b_col, line_w + 0.8)
		canvas.draw_line(Vector2(r.position.x, r.position.y), Vector2(r.position.x, r.position.y + bracket_len), b_col, line_w + 0.8)
		# Top-Right corner
		canvas.draw_line(Vector2(r.end.x, r.position.y), Vector2(r.end.x - bracket_len, r.position.y), b_col, line_w + 0.8)
		canvas.draw_line(Vector2(r.end.x, r.position.y), Vector2(r.end.x, r.position.y + bracket_len), b_col, line_w + 0.8)
		# Bottom-Left corner
		canvas.draw_line(Vector2(r.position.x, r.end.y), Vector2(r.position.x + bracket_len, r.end.y), b_col, line_w + 0.8)
		canvas.draw_line(Vector2(r.position.x, r.end.y), Vector2(r.position.x, r.end.y - bracket_len), b_col, line_w + 0.8)
		# Bottom-Right corner
		canvas.draw_line(Vector2(r.end.x, r.end.y), Vector2(r.end.x - bracket_len, r.end.y), b_col, line_w + 0.8)
		canvas.draw_line(Vector2(r.end.x, r.end.y), Vector2(r.end.x, r.end.y - bracket_len), b_col, line_w + 0.8)

		# 4. Central micro pip on currently hovered tile
		if is_hovered:
			canvas.draw_circle(r.get_center(), 3.5, Color(0.9, 1.0, 0.9, 0.95))
			canvas.draw_arc(r.get_center(), 7.0, 0, TAU, 16, Color(0.35, 1.0, 0.55, 0.9), 1.5)

func _draw_damage_hit_auras(canvas: CanvasItem) -> void:
	for evt in damage_events:
		var evt_time = float(evt.get("time", 0.0))
		var evt_dur = float(evt.get("duration", 3.5))
		if evt_time < evt_dur:
			var tile_pos: Vector2i = _to_grid_pos(evt.get("tile", Vector2i(-1, -1)))
			if tile_pos.x >= 0 and tile_pos.y >= 0:
				var center = board_offset + Vector2((tile_pos.x + 0.5) * tile_size, (tile_pos.y + 0.5) * tile_size)
				var alpha = clampf(1.0 - (evt_time / evt_dur), 0.0, 1.0)
				var pulse = 0.5 + 0.5 * sin(evt_time * 12.0)
				var r = tile_size * (0.42 + 0.06 * pulse)
				canvas.draw_arc(center, r, 0, TAU, 32, Color(1.0, 0.15, 0.15, alpha * 0.9), 2.5)
				canvas.draw_arc(center, tile_size * 0.35, 0, TAU, 24, Color(1.0, 0.45, 0.2, alpha * 0.6), 1.5)

func _draw_active_enemy_turn_highlight(canvas: CanvasItem) -> void:
	if not is_enemy_turn_waiting or active_enemy_turn_monster_id == "":
		return

	var m: Dictionary = {}
	for monster in monsters:
		if str(monster.get("id", "")) == active_enemy_turn_monster_id:
			m = monster
			break

	if m.is_empty():
		return

	var pos: Vector2i = _to_grid_pos(m.get("grid_pos", Vector2i(0, 0)))
	var screen_pos = board_offset + Vector2((pos.x + 0.5) * tile_size, (pos.y + 0.5) * tile_size)
	var token_radius = tile_size * 0.42

	# 1. Pulsing golden/crimson halo aura
	var t_msec = Time.get_ticks_msec()
	var pulse = 0.5 + 0.5 * sin(t_msec * 0.008)
	var halo_radius = token_radius * (1.30 + 0.20 * pulse)
	canvas.draw_circle(screen_pos, halo_radius, Color(0.95, 0.25, 0.15, 0.28 * pulse))
	canvas.draw_arc(screen_pos, halo_radius, 0, TAU, 36, Color(1.0, 0.78, 0.2, 0.95), 2.8)
	canvas.draw_arc(screen_pos, token_radius * 1.12, 0, TAU, 32, Color(0.95, 0.2, 0.2, 0.9), 2.0)

	# 2. Rotating reticle corner crosshairs
	var angle_rot = t_msec * 0.002
	for i in range(4):
		var ang = angle_rot + i * (PI * 0.5)
		var p1 = screen_pos + Vector2(cos(ang), sin(ang)) * (halo_radius + 2.0)
		var p2 = screen_pos + Vector2(cos(ang), sin(ang)) * (halo_radius + 9.0)
		canvas.draw_line(p1, p2, Color(1.0, 0.85, 0.25, 0.9), 2.5)

	# 3. Floating billboard badge above token: [ ⚔️ ENEMY TURN ]
	var font = ThemeDB.fallback_font
	var m_name = str(m.get("name", "Monster")).to_upper()
	var badge_title = "⚔️ ENEMY TURN: " + m_name
	var sub_text = "(Click to Skip)"
	var b_size = font.get_string_size(badge_title, HORIZONTAL_ALIGNMENT_CENTER, -1, 13)
	var sub_size = font.get_string_size(sub_text, HORIZONTAL_ALIGNMENT_CENTER, -1, 10)
	var badge_w = maxf(b_size.x, sub_size.x) + 24.0
	var badge_h = 36.0
	var badge_x = screen_pos.x - badge_w * 0.5
	var badge_y = screen_pos.y - halo_radius - badge_h - 6.0
	if badge_y < 10.0:
		badge_y = screen_pos.y + halo_radius + 8.0

	var bg_rect = Rect2(badge_x, badge_y, badge_w, badge_h)
	# Drop shadow
	canvas.draw_rect(Rect2(badge_x + 2, badge_y + 2, badge_w, badge_h), Color(0.0, 0.0, 0.0, 0.6))
	# Main box
	canvas.draw_rect(bg_rect, Color(0.18, 0.04, 0.05, 0.96))
	# Crimson/gold border
	canvas.draw_rect(bg_rect, Color(1.0, 0.75, 0.2, 0.95), false, 2.0)
	# Title
	canvas.draw_string(font, Vector2(badge_x + (badge_w - b_size.x) * 0.5, badge_y + 16.0), badge_title, HORIZONTAL_ALIGNMENT_CENTER, -1, 13, Color(1.0, 0.9, 0.3, 1.0))
	# Subtitle
	canvas.draw_string(font, Vector2(badge_x + (badge_w - sub_size.x) * 0.5, badge_y + 30.0), sub_text, HORIZONTAL_ALIGNMENT_CENTER, -1, 10, Color(0.85, 0.85, 0.9, 0.85))

func _draw_floating_texts(canvas: CanvasItem) -> void:
	for ft in floating_texts:
		var font = ThemeDB.fallback_font
		if ft.get("is_damage", false):
			var t_name = str(ft.get("target_name", "Target")).to_upper()
			var wounds_txt = "-%d HP" % int(ft.get("wounds", 1))
			var is_def = bool(ft.get("is_defeat", false))
			var cur_bp = int(ft.get("current_bp", 0))
			var max_bp = int(ft.get("max_bp", 1))
			var status_txt = "💀 DEFEATED!" if is_def else "❤️ %d / %d BP" % [cur_bp, max_bp]

			var t_name_size = font.get_string_size("💥 " + t_name, HORIZONTAL_ALIGNMENT_CENTER, -1, 13)
			var wounds_size = font.get_string_size(wounds_txt, HORIZONTAL_ALIGNMENT_CENTER, -1, 17)
			var status_size = font.get_string_size(status_txt, HORIZONTAL_ALIGNMENT_CENTER, -1, 12)

			var max_content_w = maxf(t_name_size.x, maxf(wounds_size.x, status_size.x))
			var plaque_w = maxf(150.0, max_content_w + 24.0)
			var plaque_h = 58.0
			var plaque_x = ft.pos.x - plaque_w * 0.5
			var plaque_y = ft.pos.y - plaque_h * 0.5

			# Drop shadow
			canvas.draw_rect(Rect2(plaque_x + 2.0, plaque_y + 3.0, plaque_w, plaque_h), Color(0.0, 0.0, 0.0, 0.6 * ft.alpha))

			# Plaque Background (deep crimson charcoal)
			var plaque_rect = Rect2(plaque_x, plaque_y, plaque_w, plaque_h)
			canvas.draw_rect(plaque_rect, Color(0.12, 0.03, 0.04, 0.95 * ft.alpha))

			# Plaque Border (vibrant crimson)
			var border_col = Color(0.95, 0.25, 0.22, 0.95 * ft.alpha) if not is_def else Color(1.0, 0.15, 0.15, 0.95 * ft.alpha)
			canvas.draw_rect(plaque_rect, border_col, false, 2.0)

			# Inner gold trim line
			var inner_rect = Rect2(plaque_x + 2.0, plaque_y + 2.0, plaque_w - 4.0, plaque_h - 4.0)
			canvas.draw_rect(inner_rect, Color(0.95, 0.75, 0.2, 0.35 * ft.alpha), false, 1.0)

			# Line 1: Target Name (Amber)
			var line1_y = plaque_y + 16.0
			canvas.draw_string(font, Vector2(plaque_x + (plaque_w - t_name_size.x) * 0.5, line1_y), "💥 " + t_name, HORIZONTAL_ALIGNMENT_CENTER, -1, 13, Color(1.0, 0.85, 0.3, ft.alpha))

			# Line 2: Wounds / Damage (Red)
			var line2_y = line1_y + 20.0
			canvas.draw_string(font, Vector2(plaque_x + (plaque_w - wounds_size.x) * 0.5, line2_y), wounds_txt, HORIZONTAL_ALIGNMENT_CENTER, -1, 17, Color(1.0, 0.25, 0.25, ft.alpha))

			# Line 3: Status / Remaining BP
			var line3_y = line2_y + 15.0
			var stat_col = Color(1.0, 0.3, 0.3, ft.alpha) if is_def else Color(0.85, 0.95, 1.0, ft.alpha)
			canvas.draw_string(font, Vector2(plaque_x + (plaque_w - status_size.x) * 0.5, line3_y), status_txt, HORIZONTAL_ALIGNMENT_CENTER, -1, 12, stat_col)
		elif ft.get("is_unavailable", false):
			var f_size = 14
			var txt = str(ft.get("text", ""))
			var full_txt = "⚠️ " + txt
			var str_size = font.get_string_size(full_txt, HORIZONTAL_ALIGNMENT_CENTER, -1, f_size)
			var pad_x = 12.0
			var pad_y = 6.0
			var plaque_w = str_size.x + pad_x * 2.0
			var plaque_h = str_size.y + pad_y * 2.0
			var plaque_x = ft.pos.x - plaque_w * 0.5
			var plaque_y = ft.pos.y - plaque_h * 0.5

			# Drop shadow
			canvas.draw_rect(Rect2(plaque_x + 2.0, plaque_y + 2.0, plaque_w, plaque_h), Color(0.0, 0.0, 0.0, 0.65 * ft.alpha))
			# Plaque Background (deep obsidian amber)
			var plaque_rect = Rect2(plaque_x, plaque_y, plaque_w, plaque_h)
			canvas.draw_rect(plaque_rect, Color(0.12, 0.08, 0.02, 0.95 * ft.alpha))
			# Border (warm warning amber)
			canvas.draw_rect(plaque_rect, Color(1.0, 0.75, 0.2, 0.95 * ft.alpha), false, 1.5)
			# Inner subtle trim
			canvas.draw_rect(Rect2(plaque_x + 2.0, plaque_y + 2.0, plaque_w - 4.0, plaque_h - 4.0), Color(1.0, 0.85, 0.3, 0.25 * ft.alpha), false, 1.0)
			# Text
			var text_y = plaque_y + pad_y + str_size.y * 0.85
			canvas.draw_string(font, Vector2(plaque_x + pad_x, text_y), full_txt, HORIZONTAL_ALIGNMENT_CENTER, -1, f_size, Color(1.0, 0.92, 0.45, ft.alpha))
		else:
			var f_size = 18
			var col = Color(ft.color.r, ft.color.g, ft.color.b, ft.alpha)
			var txt = str(ft.get("text", ""))
			var tw = font.get_string_size(txt, HORIZONTAL_ALIGNMENT_CENTER, -1, f_size).x
			var bg_rect = Rect2(ft.pos.x - tw * 0.5 - 6.0, ft.pos.y - 15.0, tw + 12.0, 20.0)
			canvas.draw_rect(bg_rect, Color(0.05, 0.05, 0.08, 0.85 * ft.alpha))
			canvas.draw_rect(bg_rect, Color(col.r, col.g, col.b, 0.65 * ft.alpha), false, 1.2)
			canvas.draw_string(font, Vector2(ft.pos.x - tw * 0.5, ft.pos.y), txt, HORIZONTAL_ALIGNMENT_CENTER, -1, f_size, col)

func _setup_trap_sprung_overlay(trap: Dictionary, hero: Dictionary, final_pos: Vector2i, path: Array, actual_cost: int, is_chest: bool = false) -> void:
	var t_type = str(trap.get("type", trap.get("trapType", "pit"))).to_lower()
	var h_char = get_hero_character_name(hero)
	var h_cls = get_hero_class_name(hero)
	var h_full = ("%s the %s" % [h_char, h_cls]) if h_cls != "" else (h_char if h_char != "" else "Hero")

	var overlay_type = "pit"
	var trap_title = "Pit Trap"
	var icon = "🕳️"
	var desc = "The dungeon floor collapses into a spike-lined pit!"
	var flavor = "Roll 1 Hazard Die! Movement halts in the pit."
	var dice_count = 1

	if "spear" in t_type:
		overlay_type = "spear"
		trap_title = "Spear Trap"
		icon = "🔺"
		desc = "Spring-loaded iron spears erupt from the stone walls!"
		flavor = "Roll 1 Combat Die! Skull = 1 Damage; White Shield = Dodged!"
		dice_count = 1
	elif "falling" in t_type or "boulder" in t_type or "rock" in t_type:
		overlay_type = "falling_block"
		trap_title = "Falling Block Trap"
		icon = "🪨"
		desc = "A colossal stone block crashes down from the ceiling!"
		flavor = "Roll 3 Hazard Combat Dice! Each Skull inflicts 1 Damage. Path is blocked!"
		dice_count = int(trap.get("damageDice", 3))
	elif is_chest or "chest" in t_type or "furniture" in t_type:
		overlay_type = "chest"
		trap_title = "Poison Needle Chest Trap"
		icon = "☠️"
		desc = "A concealed poison needle darts from the locked chest lid!"
		flavor = "Roll 2 Hazard Combat Dice! Toxic poison inflicts 2 Body Points."
		dice_count = int(trap.get("damageDice", 2))
	else:
		overlay_type = "pit"
		trap_title = "Pit Trap"
		icon = "🕳️"
		desc = "The dungeon floor collapses into a spike-lined pit!"
		flavor = "Roll 1 Hazard Die! Inflicts 1 Body Point damage."
		dice_count = int(trap.get("damageDice", 1))

	active_trap_overlay = {
		"type": overlay_type,
		"trap_name": trap_title,
		"icon": icon,
		"hero_name": h_full,
		"title": "%s SPRUNG!" % trap_title.to_upper(),
		"description": desc,
		"flavor": flavor,
		"dice_count": dice_count,
		"trap": trap,
		"hero": hero,
		"final_pos": final_pos,
		"path": path,
		"actual_cost": actual_cost,
		"is_chest": is_chest
	}
	_log("[TRAP] ⚠️ %s SPRUNG! %s must roll hazard dice!" % [trap_title.to_upper(), h_full])
	queue_redraw_all()

func resolve_trap_overlay_click() -> Dictionary:
	if active_trap_overlay.is_empty():
		return { "success": false, "error": "No active trap overlay" }

	var overlay = active_trap_overlay.duplicate(false)
	active_trap_overlay = {}

	trigger_hazard_dice_roll(overlay)
	queue_redraw_all()
	return { "success": true, "diceStarted": true, "trapType": overlay.get("type", "") }

func trigger_hazard_dice_roll(overlay: Dictionary) -> void:
	_update_board_metrics()
	var center = board_offset + Vector2(grid_cols * tile_size * 0.5, grid_rows * tile_size * 0.45)
	var t_type = str(overlay.get("type", "pit"))
	var hero = overlay.get("hero", {})
	var trap = overlay.get("trap", {})
	var hero_name = str(overlay.get("hero_name", "Hero"))
	var trap_name = str(overlay.get("trap_name", "Trap"))
	var icon = str(overlay.get("icon", "⚠️"))
	var num_dice = int(overlay.get("dice_count", 1))
	var final_pos = overlay.get("final_pos", Vector2i.ZERO)
	var path = overlay.get("path", [])
	var actual_cost = int(overlay.get("actual_cost", 0))

	var faces: Array = []
	var summary_txt = ""
	var total_wounds = 0
	var skulls = 0
	var shields = 0
	var pending_res: Dictionary = {}

	if t_type == "spear":
		var roll_skull = (randi() % 2 == 0)
		var base_dmg = int(trap.get("damageDice", 1))
		var dmg = base_dmg if roll_skull else 0
		total_wounds = dmg
		if roll_skull:
			faces.append("skull")
			skulls = 1
			summary_txt = "1 SKULL -> 1 WOUND! Spear strikes %s!" % hero_name
		else:
			faces.append("white_shield")
			shields = 1
			summary_txt = "WHITE SHIELD -> DODGED! %s avoids the spears!" % hero_name
		pending_res = {
			"type": "spear",
			"trap": trap,
			"hero": hero,
			"final_pos": final_pos,
			"damage": dmg,
			"roll_skull": roll_skull
		}
	elif t_type == "falling_block":
		for _d in range(num_dice):
			if randi() % 2 == 0:
				faces.append("skull")
				skulls += 1
			else:
				faces.append("white_shield")
				shields += 1
		var dmg = maxi(1, skulls)
		total_wounds = dmg
		summary_txt = "%d SKULL%s -> %d WOUND%s! Crushing masonry crashes down!" % [
			skulls, "S" if skulls != 1 else "", dmg, "S" if dmg != 1 else ""
		]
		var trap_tile = final_pos
		var safe_pos = path[maxi(0, actual_cost - 1)] if path.size() > 0 else final_pos
		pending_res = {
			"type": "falling_block",
			"trap": trap,
			"hero": hero,
			"trap_tile": trap_tile,
			"safe_pos": safe_pos,
			"damage": dmg,
			"skulls": skulls
		}
	elif t_type == "chest":
		faces = ["skull", "skull"]
		skulls = 2
		total_wounds = 2
		summary_txt = "2 SKULLS -> 2 WOUNDS! Poison needle strikes %s!" % hero_name
		pending_res = {
			"type": "chest",
			"trap": trap,
			"hero": hero,
			"final_pos": final_pos,
			"damage": 2
		}
	else:
		# Pit trap
		faces = ["skull"]
		skulls = 1
		total_wounds = 1
		summary_txt = "1 SKULL -> 1 WOUND! %s plunges into the pit!" % hero_name
		pending_res = {
			"type": "pit",
			"trap": trap,
			"hero": hero,
			"final_pos": final_pos,
			"damage": 1
		}

	var dice_arr: Array = []
	var spacing = 78.0
	var n_dice = faces.size()
	var tray_width = maxf(400.0, float(n_dice) * spacing + 120.0)
	var tray_height = 200.0
	var top_y = center.y - tray_height * 0.5
	var start_x = center.x - (float(maxi(1, n_dice) - 1) * spacing * 0.5)

	for i in range(n_dice):
		var face = str(faces[i])
		var target_pos = Vector2(start_x + float(i) * spacing, top_y + 90.0)
		var init_pos = Vector2(target_pos.x + randf_range(-4.0, 4.0), target_pos.y - 120.0 - randf_range(15.0, 35.0))
		var is_hit = (face == "skull")
		var is_block = (face == "white_shield")
		dice_arr.append({
			"type": "combat_white",
			"group": "hazard",
			"lane_index": i,
			"init_pos": init_pos,
			"target_pos": target_pos,
			"pos": init_pos,
			"final_face": face,
			"current_face": ["skull", "white_shield", "black_shield"][randi() % 3],
			"angle": randf_range(-0.5, 0.5),
			"spin_speed": randf_range(7.0, 13.0) * (1.0 if randf() > 0.5 else -1.0),
			"bounces": 2.2 + randf() * 0.4,
			"z": 20.0 + randf() * 5.0,
			"current_z": 0.0,
			"settled": false,
			"is_hit": is_hit,
			"is_block": is_block
		})

	active_dice_animation = {
		"type": "hazard",
		"title": "%s %s - %s HAZARD ROLL (%d Dice)" % [icon, hero_name, trap_name.to_upper(), n_dice],
		"summary": summary_txt,
		"dice": dice_arr,
		"time": 0.0,
		"roll_duration": 0.8,
		"total_duration": 5.5,
		"settled": false,
		"center": center,
		"tray_width": tray_width,
		"tray_height": tray_height,
		"skulls": skulls,
		"shields": shields,
		"wounds": total_wounds,
		"attacker_name": trap_name,
		"defender_name": hero_name,
		"pending_trap_resolution": pending_res,
		"effects_applied": false
	}
	queue_redraw_all()

func _apply_pending_trap_resolution(res: Dictionary) -> void:
	if res.is_empty():
		return
	var r_type = str(res.get("type", ""))
	var dmg = int(res.get("damage", 0))

	# Directly access canonical active hero reference
	var hero = get_active_hero()
	if hero.is_empty():
		return

	# Directly locate canonical trap reference from traps array
	var trap_id = str(res.get("trap", {}).get("id", ""))
	var final_pos = res.get("final_pos", Vector2i.ZERO)
	if final_pos == Vector2i.ZERO and res.has("trap_tile"):
		final_pos = res.get("trap_tile", Vector2i.ZERO)
	var trap: Dictionary = {}
	for tr in traps:
		var tr_id = str(tr.get("id", ""))
		var tx = int(tr.get("x", tr.get("position", [0, 0])[0]))
		var ty = int(tr.get("y", tr.get("position", [0, 0])[1]))
		if (trap_id != "" and tr_id == trap_id) or (final_pos != Vector2i.ZERO and Vector2i(tx, ty) == final_pos):
			trap = tr
			break

	if r_type == "spear":
		if not trap.is_empty():
			trap["spent"] = true
			trap["sprung"] = true
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

	elif r_type == "falling_block":
		hero["current_bp"] = maxi(0, hero.get("current_bp", 1) - dmg)
		var trap_tile = res.get("trap_tile", final_pos)
		var safe_pos = res.get("safe_pos", Vector2i.ZERO)
		hero["grid_pos"] = safe_pos
		wall_blocks.append({
			"x": trap_tile.x,
			"y": trap_tile.y,
			"type": "falling-block",
			"width": 1,
			"height": 1
		})
		_blocked_wall_tiles[trap_tile] = true
		if not trap.is_empty():
			trap["blocked"] = true
			trap["sprung"] = true
		_log("[TRAP] 🪨 FALLING BLOCK TRAP! Rubble crashes down at (%d, %d)! %s suffers %d damage (Remaining BP: %d). The path is permanently blocked by fallen rock!" % [
			trap_tile.x, trap_tile.y, hero.get("name"), dmg, hero.get("current_bp")
		])
		spawn_floating_text(trap_tile, "FALLEN BLOCK!", Color(0.9, 0.6, 0.1), 1.8)
		if dmg > 0:
			spawn_floating_text(safe_pos, "-%d HP" % dmg, Color(1.0, 0.2, 0.2), 1.6)

	elif r_type == "pit":
		hero["current_bp"] = maxi(0, hero.get("current_bp", 1) - dmg)
		if not trap.is_empty():
			trap["sprung"] = true
		_log("[TRAP] 🕳️ Pit trap sprung at (%d, %d)! %s plunges into the pit and suffers %d damage (Remaining BP: %d). Movement halts!" % [
			final_pos.x, final_pos.y, hero.get("name"), dmg, hero.get("current_bp")
		])
		spawn_floating_text(final_pos, "-%d HP PIT TRAP" % dmg, Color(1.0, 0.2, 0.2), 1.5)

	elif r_type == "chest":
		hero["current_bp"] = maxi(0, hero.get("current_bp", 1) - dmg)
		if not trap.is_empty():
			trap["sprung"] = true
		_log("[TRAP] ☠️ CHEST TRAP SPRUNG! A poison needle fires from the locked chest! %s suffers %d damage (Remaining BP: %d)!" % [
			hero.get("name"), dmg, hero.get("current_bp")
		])
		spawn_floating_text(final_pos, "-%d HP POISON NEEDLE" % dmg, Color(0.85, 0.25, 0.85), 1.8)

	_update_ui()
	queue_redraw_all()

func _draw_trap_sprung_overlay(canvas: CanvasItem) -> void:
	if active_trap_overlay.is_empty():
		return

	var overlay = active_trap_overlay
	var font = ThemeDB.fallback_font
	_update_board_metrics()
	var center = board_offset + Vector2(grid_cols * tile_size * 0.5, grid_rows * tile_size * 0.44)

	# 1. Full Board Dark Vignette / Backdrop Dimmer
	var total_w = float(grid_cols * tile_size)
	var total_h = float(grid_rows * tile_size)
	canvas.draw_rect(Rect2(board_offset, Vector2(total_w, total_h)), Color(0.0, 0.0, 0.0, 0.65))

	# 2. Modal Box (580x270)
	var box_w = 580.0
	var box_h = 270.0
	var box_rect = Rect2(center.x - box_w * 0.5, center.y - box_h * 0.5, box_w, box_h)

	# Outer Drop Shadow
	canvas.draw_rect(Rect2(box_rect.position + Vector2(8.0, 10.0), box_rect.size), Color(0.0, 0.0, 0.0, 0.75))

	# Main Obsidian Slate Body
	canvas.draw_rect(box_rect, Color(0.08, 0.05, 0.06, 0.98))

	# Fiery / Amber Hazard Border (Triple-layer for intense pop)
	canvas.draw_rect(box_rect, Color(0.85, 0.15, 0.10, 1.0), false, 3.0)
	var inner_border = Rect2(box_rect.position + Vector2(4.0, 4.0), box_rect.size - Vector2(8.0, 8.0))
	canvas.draw_rect(inner_border, Color(1.0, 0.75, 0.15, 0.85), false, 1.8)
	var innermost = Rect2(box_rect.position + Vector2(8.0, 8.0), box_rect.size - Vector2(16.0, 16.0))
	canvas.draw_rect(innermost, Color(0.35, 0.08, 0.08, 0.60), false, 1.0)

	# Corner Hazard Accents
	var corner_len = 24.0
	canvas.draw_line(box_rect.position + Vector2(2, corner_len), box_rect.position + Vector2(corner_len, 2), Color(1.0, 0.85, 0.2, 0.9), 3.0)
	canvas.draw_line(Vector2(box_rect.end.x - corner_len, box_rect.position.y + 2), Vector2(box_rect.end.x - 2, box_rect.position.y + corner_len), Color(1.0, 0.85, 0.2, 0.9), 3.0)
	canvas.draw_line(Vector2(box_rect.position.x + 2, box_rect.end.y - corner_len), Vector2(box_rect.position.x + corner_len, box_rect.end.y - 2), Color(1.0, 0.85, 0.2, 0.9), 3.0)
	canvas.draw_line(Vector2(box_rect.end.x - corner_len, box_rect.end.y - 2), Vector2(box_rect.end.x - 2, box_rect.end.y - corner_len), Color(1.0, 0.85, 0.2, 0.9), 3.0)

	# 3. Top Banner: ⚠️ TRAP SPRUNG!
	var banner_rect = Rect2(box_rect.position.x + 20.0, box_rect.position.y + 16.0, box_w - 40.0, 42.0)
	canvas.draw_rect(banner_rect, Color(0.38, 0.06, 0.06, 0.95))
	canvas.draw_rect(banner_rect, Color(1.0, 0.30, 0.20, 0.90), false, 2.0)
	var banner_text = "⚠️ TRAP SPRUNG!"
	var b_sz = font.get_string_size(banner_text, HORIZONTAL_ALIGNMENT_CENTER, -1, 22)
	canvas.draw_string(font, Vector2(center.x - b_sz.x * 0.5, banner_rect.position.y + 29.0), banner_text, HORIZONTAL_ALIGNMENT_CENTER, -1, 22, Color(1.0, 0.92, 0.40, 1.0))

	# 4. Trap Type & Icon Badge
	var icon = str(overlay.get("icon", "⚠️"))
	var trap_title = str(overlay.get("trap_name", "Trap"))
	var badge_text = "%s %s" % [icon, trap_title.to_upper()]
	var trap_sz = font.get_string_size(badge_text, HORIZONTAL_ALIGNMENT_CENTER, -1, 16)
	var badge_w = trap_sz.x + 32.0
	var badge_rect = Rect2(center.x - badge_w * 0.5, banner_rect.end.y + 14.0, badge_w, 28.0)
	canvas.draw_rect(badge_rect, Color(0.18, 0.08, 0.12, 0.90))
	canvas.draw_rect(badge_rect, Color(0.95, 0.60, 0.20, 0.80), false, 1.4)
	canvas.draw_string(font, Vector2(center.x - trap_sz.x * 0.5, badge_rect.position.y + 20.0), badge_text, HORIZONTAL_ALIGNMENT_CENTER, -1, 16, Color(1.0, 0.80, 0.30, 1.0))

	# 5. Victim Line
	var hero_name = str(overlay.get("hero_name", "Hero"))
	var victim_text = "%s has triggered a hidden trap!" % hero_name
	var v_sz = font.get_string_size(victim_text, HORIZONTAL_ALIGNMENT_CENTER, -1, 14)
	canvas.draw_string(font, Vector2(center.x - v_sz.x * 0.5, badge_rect.end.y + 24.0), victim_text, HORIZONTAL_ALIGNMENT_CENTER, -1, 14, Color(0.96, 0.96, 0.96, 1.0))

	# 6. Description / Flavor Text
	var desc = str(overlay.get("description", ""))
	var flavor = str(overlay.get("flavor", ""))
	var desc_sz = font.get_string_size(desc, HORIZONTAL_ALIGNMENT_CENTER, -1, 12)
	canvas.draw_string(font, Vector2(center.x - desc_sz.x * 0.5, badge_rect.end.y + 44.0), desc, HORIZONTAL_ALIGNMENT_CENTER, -1, 12, Color(0.85, 0.85, 0.82, 0.95))
	if flavor != "":
		var flv_sz = font.get_string_size(flavor, HORIZONTAL_ALIGNMENT_CENTER, -1, 11)
		canvas.draw_string(font, Vector2(center.x - flv_sz.x * 0.5, badge_rect.end.y + 60.0), flavor, HORIZONTAL_ALIGNMENT_CENTER, -1, 11, Color(1.0, 0.65, 0.35, 0.90))

	# 7. CTA Action Bar: 👉 CLICK ANYWHERE TO ROLL HAZARD DICE 🎲
	var pulse = 0.85 + 0.15 * sin(Time.get_ticks_msec() * 0.005)
	var cta_rect = Rect2(box_rect.position.x + 30.0, box_rect.end.y - 56.0, box_w - 60.0, 42.0)
	canvas.draw_rect(cta_rect, Color(0.25, 0.08, 0.06, 0.96))
	canvas.draw_rect(cta_rect, Color(1.0, 0.80, 0.20, pulse), false, 2.2)
	var cta_text = "👉 CLICK ANYWHERE TO ROLL HAZARD DICE 🎲"
	var cta_sz = font.get_string_size(cta_text, HORIZONTAL_ALIGNMENT_CENTER, -1, 15)
	canvas.draw_string(font, Vector2(center.x - cta_sz.x * 0.5, cta_rect.position.y + 27.0), cta_text, HORIZONTAL_ALIGNMENT_CENTER, -1, 15, Color(1.0, 0.94, 0.60, pulse))

func _draw_sparkle_star(canvas: CanvasItem, pos: Vector2, size: float, col: Color) -> void:
	var pts: PackedVector2Array = [
		pos + Vector2(0, -size),
		pos + Vector2(size * 0.28, -size * 0.28),
		pos + Vector2(size, 0),
		pos + Vector2(size * 0.28, size * 0.28),
		pos + Vector2(0, size),
		pos + Vector2(-size * 0.28, size * 0.28),
		pos + Vector2(-size, 0),
		pos + Vector2(-size * 0.28, -size * 0.28)
	]
	canvas.draw_colored_polygon(pts, col)

func _wrap_card_text(text: String, font: Font, font_size: int, max_width: float) -> Array[String]:
	var result: Array[String] = []
	var words = text.split(" ")
	var current_line = ""
	for w in words:
		if w.is_empty():
			continue
		var test_line = (current_line + " " + w).strip_edges()
		var sz = font.get_string_size(test_line, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size)
		if sz.x <= max_width or current_line.is_empty():
			current_line = test_line
		else:
			result.append(current_line)
			current_line = w
	if not current_line.is_empty():
		result.append(current_line)
	return result

func _draw_woodcut_illustration(canvas: CanvasItem, rect: Rect2, card_type: String, is_quest_note: bool, overlay: Dictionary) -> void:
	var cx = rect.position.x + rect.size.x * 0.5
	var cy = rect.position.y + rect.size.y * 0.5
	var ink = Color(0.18, 0.11, 0.06, 0.95)
	var ink_shade = Color(0.18, 0.11, 0.06, 0.40)
	var gold_fill = Color(0.98, 0.88, 0.55, 1.0)

	# Ground / Flagstone line across bottom of window
	var ground_y = rect.end.y - 18.0
	canvas.draw_line(Vector2(rect.position.x + 8.0, ground_y), Vector2(rect.end.x - 8.0, ground_y), ink, 1.5)
	canvas.draw_line(Vector2(rect.position.x + 14.0, ground_y + 6.0), Vector2(rect.end.x - 14.0, ground_y + 6.0), ink_shade, 1.0)
	# Floor flagstone joints
	canvas.draw_line(Vector2(cx - 50.0, ground_y), Vector2(cx - 65.0, rect.end.y - 4.0), ink_shade, 1.0)
	canvas.draw_line(Vector2(cx + 25.0, ground_y), Vector2(cx + 15.0, rect.end.y - 4.0), ink_shade, 1.0)
	canvas.draw_line(Vector2(cx + 80.0, ground_y), Vector2(cx + 70.0, rect.end.y - 4.0), ink_shade, 1.0)

	if is_quest_note or card_type == "quest_note":
		# Ancient Runic Sarcophagus / Quest Chest
		var chest_rect = Rect2(cx - 52.0, cy - 8.0, 104.0, 48.0)
		canvas.draw_rect(chest_rect, Color(0.88, 0.84, 0.78, 1.0))
		canvas.draw_rect(chest_rect, ink, false, 2.0)
		# Sarcophagus lid angled open
		var lid_pts: PackedVector2Array = [
			Vector2(cx - 56.0, cy - 8.0),
			Vector2(cx - 30.0, cy - 32.0),
			Vector2(cx + 72.0, cy - 32.0),
			Vector2(cx + 56.0, cy - 8.0)
		]
		canvas.draw_colored_polygon(lid_pts, Color(0.92, 0.88, 0.82, 1.0))
		canvas.draw_polyline(lid_pts, ink, 2.0)
		canvas.draw_line(lid_pts[3], lid_pts[0], ink, 2.0)
		# Light beam radiating out from opening
		var beam_pts: PackedVector2Array = [
			Vector2(cx - 35.0, cy - 8.0),
			Vector2(cx - 18.0, rect.position.y + 12.0),
			Vector2(cx + 38.0, rect.position.y + 12.0),
			Vector2(cx + 45.0, cy - 8.0)
		]
		canvas.draw_colored_polygon(beam_pts, Color(1.0, 0.95, 0.60, 0.35))
		# Carved Runes on Chest Front
		canvas.draw_line(Vector2(cx - 28, cy + 8), Vector2(cx - 28, cy + 32), ink, 1.8)
		canvas.draw_line(Vector2(cx - 28, cy + 14), Vector2(cx - 16, cy + 8), ink, 1.8)
		canvas.draw_line(Vector2(cx - 28, cy + 24), Vector2(cx - 16, cy + 18), ink, 1.8)

		canvas.draw_line(Vector2(cx, cy + 8), Vector2(cx, cy + 32), ink, 1.8)
		canvas.draw_line(Vector2(cx - 8, cy + 14), Vector2(cx + 8, cy + 14), ink, 1.8)

		canvas.draw_line(Vector2(cx + 26, cy + 8), Vector2(cx + 26, cy + 32), ink, 1.8)
		canvas.draw_line(Vector2(cx + 26, cy + 12), Vector2(cx + 36, cy + 20), ink, 1.8)
		canvas.draw_line(Vector2(cx + 36, cy + 20), Vector2(cx + 26, cy + 28), ink, 1.8)

		_draw_sparkle_star(canvas, Vector2(cx, cy - 20), 7.0, Color(1.0, 0.85, 0.2))

	elif card_type == "gold":
		# Overflowing Cloth Money Sack & Spilling Gold Coins
		var sack_cx = cx - 38.0
		var sack_cy = cy + 6.0
		# Body of cloth sack
		var sack_pts: PackedVector2Array = [
			Vector2(sack_cx - 12.0, sack_cy - 24.0),
			Vector2(sack_cx - 32.0, sack_cy - 4.0),
			Vector2(sack_cx - 36.0, sack_cy + 22.0),
			Vector2(sack_cx - 22.0, sack_cy + 34.0),
			Vector2(sack_cx + 18.0, sack_cy + 34.0),
			Vector2(sack_cx + 30.0, sack_cy + 18.0),
			Vector2(sack_cx + 14.0, sack_cy - 4.0),
			Vector2(sack_cx + 12.0, sack_cy - 24.0)
		]
		canvas.draw_colored_polygon(sack_pts, Color(0.82, 0.72, 0.58, 1.0))
		canvas.draw_polyline(sack_pts, ink, 2.0)
		# Sack mouth bundle at top
		var top_pts: PackedVector2Array = [
			Vector2(sack_cx - 12.0, sack_cy - 24.0),
			Vector2(sack_cx - 18.0, sack_cy - 38.0),
			Vector2(sack_cx, sack_cy - 32.0),
			Vector2(sack_cx + 18.0, sack_cy - 38.0),
			Vector2(sack_cx + 12.0, sack_cy - 24.0)
		]
		canvas.draw_colored_polygon(top_pts, Color(0.85, 0.75, 0.62, 1.0))
		canvas.draw_polyline(top_pts, ink, 1.8)
		# Tie cord
		canvas.draw_line(Vector2(sack_cx - 14.0, sack_cy - 24.0), Vector2(sack_cx + 14.0, sack_cy - 24.0), ink, 3.0)
		canvas.draw_line(Vector2(sack_cx, sack_cy - 24.0), Vector2(sack_cx - 6.0, sack_cy - 12.0), ink, 1.8)
		canvas.draw_line(Vector2(sack_cx + 2.0, sack_cy - 24.0), Vector2(sack_cx + 8.0, sack_cy - 10.0), ink, 1.8)
		# Fabric wrinkles
		canvas.draw_line(Vector2(sack_cx - 20.0, sack_cy + 6.0), Vector2(sack_cx - 6.0, sack_cy + 18.0), ink_shade, 1.2)
		canvas.draw_line(Vector2(sack_cx - 14.0, sack_cy + 16.0), Vector2(sack_cx + 2.0, sack_cy + 26.0), ink_shade, 1.2)
		canvas.draw_line(Vector2(sack_cx + 12.0, sack_cy + 4.0), Vector2(sack_cx + 4.0, sack_cy + 18.0), ink_shade, 1.2)

		# Spilling Gold Coins pile
		var coin_positions = [
			Vector2(cx - 2.0, cy + 22.0),
			Vector2(cx + 12.0, cy + 16.0),
			Vector2(cx + 28.0, cy + 22.0),
			Vector2(cx + 46.0, cy + 26.0),
			Vector2(cx + 64.0, cy + 24.0),
			Vector2(cx + 6.0, cy + 30.0),
			Vector2(cx + 22.0, cy + 32.0),
			Vector2(cx + 38.0, cy + 34.0),
			Vector2(cx + 56.0, cy + 33.0),
			Vector2(cx + 74.0, cy + 31.0),
			Vector2(cx - 12.0, cy + 33.0),
			Vector2(cx + 16.0, cy + 24.0),
			Vector2(cx + 34.0, cy + 18.0),
			Vector2(cx + 50.0, cy + 16.0)
		]
		for cpos in coin_positions:
			canvas.draw_circle(cpos, 7.5, gold_fill)
			canvas.draw_arc(cpos, 7.5, 0.0, TAU, 16, ink, 1.4)
			canvas.draw_arc(cpos, 5.0, 0.0, TAU, 12, ink_shade, 0.9)
			canvas.draw_line(cpos + Vector2(-2, 0), cpos + Vector2(2, 0), ink, 1.0)
			canvas.draw_line(cpos + Vector2(0, -2), cpos + Vector2(0, 2), ink, 1.0)

		# Twinkling stars
		_draw_sparkle_star(canvas, Vector2(cx + 24.0, cy - 8.0), 6.5, ink)
		_draw_sparkle_star(canvas, Vector2(cx + 58.0, cy + 2.0), 5.0, ink)
		_draw_sparkle_star(canvas, Vector2(cx + 2.0, cy + 4.0), 4.0, ink)
		_draw_sparkle_star(canvas, Vector2(cx + 80.0, cy + 12.0), 4.5, ink)

	elif card_type == "gem" or card_type == "jewels":
		# Open Velvet-Lined Jewelry Casket with Brilliant Faceted Gems & Pearls
		var casket_rect = Rect2(cx - 55.0, cy - 2.0, 110.0, 42.0)
		canvas.draw_rect(casket_rect, Color(0.48, 0.32, 0.20, 1.0))
		canvas.draw_rect(casket_rect, ink, false, 2.0)
		# Horizontal wood planks
		canvas.draw_line(Vector2(casket_rect.position.x, cy + 12.0), Vector2(casket_rect.end.x, cy + 12.0), ink_shade, 1.2)
		canvas.draw_line(Vector2(casket_rect.position.x, cy + 26.0), Vector2(casket_rect.end.x, cy + 26.0), ink_shade, 1.2)
		# Brass corner corner braces
		canvas.draw_line(casket_rect.position + Vector2(0, 14), casket_rect.position + Vector2(14, 0), ink, 2.0)
		canvas.draw_line(Vector2(casket_rect.end.x - 14, casket_rect.position.y), Vector2(casket_rect.end.x, casket_rect.position.y + 14), ink, 2.0)
		# Open lid angled back
		var lid_pts: PackedVector2Array = [
			Vector2(cx - 55.0, cy - 2.0),
			Vector2(cx - 40.0, cy - 36.0),
			Vector2(cx + 40.0, cy - 36.0),
			Vector2(cx + 55.0, cy - 2.0)
		]
		canvas.draw_colored_polygon(lid_pts, Color(0.55, 0.36, 0.22, 1.0))
		canvas.draw_polyline(lid_pts, ink, 2.0)
		# Dark velvet interior
		var velvet_rect = Rect2(cx - 48.0, cy - 2.0, 96.0, 14.0)
		canvas.draw_rect(velvet_rect, Color(0.24, 0.08, 0.12, 1.0))
		canvas.draw_rect(velvet_rect, ink, false, 1.2)

		# Large faceted cut diamond in center
		var gem_pts: PackedVector2Array = [
			Vector2(cx - 14.0, cy - 4.0),
			Vector2(cx - 8.0, cy - 18.0),
			Vector2(cx + 8.0, cy - 18.0),
			Vector2(cx + 14.0, cy - 4.0),
			Vector2(cx, cy + 10.0)
		]
		canvas.draw_colored_polygon(gem_pts, Color(0.85, 0.96, 1.0, 1.0))
		canvas.draw_polyline(gem_pts, ink, 1.8)
		canvas.draw_line(gem_pts[4], gem_pts[0], ink, 1.8)
		canvas.draw_line(gem_pts[0], gem_pts[3], ink, 1.2)
		canvas.draw_line(gem_pts[1], Vector2(cx, cy - 4.0), ink, 1.2)
		canvas.draw_line(gem_pts[2], Vector2(cx, cy - 4.0), ink, 1.2)
		canvas.draw_line(gem_pts[4], Vector2(cx, cy - 4.0), ink, 1.4)

		# Ruby on left
		var ruby_pts: PackedVector2Array = [
			Vector2(cx - 36.0, cy + 2.0),
			Vector2(cx - 30.0, cy - 10.0),
			Vector2(cx - 20.0, cy - 8.0),
			Vector2(cx - 18.0, cy + 4.0),
			Vector2(cx - 28.0, cy + 10.0)
		]
		canvas.draw_colored_polygon(ruby_pts, Color(0.95, 0.35, 0.40, 1.0))
		canvas.draw_polyline(ruby_pts, ink, 1.5)
		canvas.draw_line(ruby_pts[4], ruby_pts[0], ink, 1.5)

		# Emerald on right
		var emerald_pts: PackedVector2Array = [
			Vector2(cx + 18.0, cy - 8.0),
			Vector2(cx + 34.0, cy - 8.0),
			Vector2(cx + 38.0, cy + 6.0),
			Vector2(cx + 22.0, cy + 6.0)
		]
		canvas.draw_colored_polygon(emerald_pts, Color(0.35, 0.88, 0.55, 1.0))
		canvas.draw_polyline(emerald_pts, ink, 1.5)
		canvas.draw_line(emerald_pts[3], emerald_pts[0], ink, 1.5)

		# Pearl necklace beads draping over rim
		for i in range(8):
			var px = cx - 24.0 + float(i) * 6.5
			var py = cy + 12.0 + sin(float(i) * 0.45) * 4.0
			canvas.draw_circle(Vector2(px, py), 3.2, Color(0.98, 0.98, 0.94, 1.0))
			canvas.draw_arc(Vector2(px, py), 3.2, 0.0, TAU, 10, ink, 1.0)

		# Starbursts
		_draw_sparkle_star(canvas, Vector2(cx, cy - 24.0), 6.0, ink)
		_draw_sparkle_star(canvas, Vector2(cx - 26.0, cy - 16.0), 4.5, ink)
		_draw_sparkle_star(canvas, Vector2(cx + 32.0, cy - 14.0), 4.5, ink)

	elif card_type == "potion":
		# Classical Apothecary Glass Phial / Flask
		var bottle_cy = cy + 10.0
		var r = 32.0

		# Liquid fill color based on potion title
		var title_lower = str(overlay.get("title", "")).to_lower()
		var p_fill = Color(0.98, 0.82, 0.40, 0.95)
		if "strength" in title_lower:
			p_fill = Color(0.92, 0.30, 0.30, 0.95)
		elif "defense" in title_lower:
			p_fill = Color(0.35, 0.70, 0.95, 0.95)
		elif "holy" in title_lower:
			p_fill = Color(0.90, 0.98, 1.0, 0.95)

		# Spherical decanter bulb
		canvas.draw_circle(Vector2(cx, bottle_cy), r, Color(0.96, 0.94, 0.90, 1.0))
		canvas.draw_circle(Vector2(cx, bottle_cy), r - 2.5, p_fill)
		# Meniscus cut-off in top third
		var empty_top = Rect2(cx - r, bottle_cy - r, r * 2.0, r * 0.75)
		canvas.draw_rect(empty_top, Color(0.96, 0.94, 0.90, 1.0))
		canvas.draw_line(Vector2(cx - 24.0, bottle_cy - 8.0), Vector2(cx + 24.0, bottle_cy - 8.0), ink, 1.5)

		# Neck of flask
		var neck_rect = Rect2(cx - 8.0, bottle_cy - 48.0, 16.0, 26.0)
		canvas.draw_rect(neck_rect, Color(0.96, 0.94, 0.90, 1.0))
		canvas.draw_rect(neck_rect, ink, false, 1.8)

		# Fluted lip rim
		canvas.draw_rect(Rect2(cx - 12.0, bottle_cy - 52.0, 24.0, 5.0), Color(0.96, 0.94, 0.90, 1.0))
		canvas.draw_rect(Rect2(cx - 12.0, bottle_cy - 52.0, 24.0, 5.0), ink, false, 1.8)

		# Cork stopper inserted into neck
		var cork_pts: PackedVector2Array = [
			Vector2(cx - 7.0, bottle_cy - 52.0),
			Vector2(cx - 9.0, bottle_cy - 64.0),
			Vector2(cx + 9.0, bottle_cy - 64.0),
			Vector2(cx + 7.0, bottle_cy - 52.0)
		]
		canvas.draw_colored_polygon(cork_pts, Color(0.76, 0.58, 0.40, 1.0))
		canvas.draw_polyline(cork_pts, ink, 1.8)
		canvas.draw_line(cork_pts[3], cork_pts[0], ink, 1.8)

		# Outer bulb outline
		canvas.draw_arc(Vector2(cx, bottle_cy), r, 0.0, TAU, 32, ink, 2.2)

		# Glass reflection highlight
		canvas.draw_arc(Vector2(cx, bottle_cy), r - 6.0, PI * 0.75, PI * 1.25, 12, Color.WHITE, 2.2)

		# Emblem on bottle
		if "strength" in title_lower:
			canvas.draw_line(Vector2(cx, bottle_cy - 2.0), Vector2(cx, bottle_cy + 18.0), ink, 2.2)
			canvas.draw_line(Vector2(cx - 6.0, bottle_cy + 4.0), Vector2(cx + 6.0, bottle_cy + 4.0), ink, 2.2)
		elif "defense" in title_lower:
			var s_pts: PackedVector2Array = [
				Vector2(cx - 7.0, bottle_cy),
				Vector2(cx + 7.0, bottle_cy),
				Vector2(cx + 5.0, bottle_cy + 12.0),
				Vector2(cx, bottle_cy + 18.0),
				Vector2(cx - 5.0, bottle_cy + 12.0)
			]
			canvas.draw_colored_polygon(s_pts, Color(0.85, 0.85, 0.88, 1.0))
			canvas.draw_polyline(s_pts, ink, 1.5)
			canvas.draw_line(s_pts[4], s_pts[0], ink, 1.5)
		else:
			canvas.draw_line(Vector2(cx, bottle_cy + 1.0), Vector2(cx, bottle_cy + 17.0), ink, 3.2)
			canvas.draw_line(Vector2(cx - 8.0, bottle_cy + 9.0), Vector2(cx + 8.0, bottle_cy + 9.0), ink, 3.2)

		# Radiant aura rays
		for ang in [0.2, 0.6, 1.0, 1.4, 1.8, 2.2, 2.6, 3.0]:
			var dir = Vector2(cos(ang * PI), sin(ang * PI))
			canvas.draw_line(Vector2(cx, bottle_cy) + dir * (r + 4.0), Vector2(cx, bottle_cy) + dir * (r + 14.0), ink_shade, 1.4)

	elif card_type == "hazard":
		# Spiked Pit Trap Opening in Cracked Dungeon Floor
		var pit_pts: PackedVector2Array = [
			Vector2(cx - 62.0, ground_y),
			Vector2(cx - 48.0, ground_y + 4.0),
			Vector2(cx - 24.0, ground_y - 2.0),
			Vector2(cx, ground_y + 3.0),
			Vector2(cx + 28.0, ground_y - 3.0),
			Vector2(cx + 58.0, ground_y),
			Vector2(cx + 44.0, ground_y + 30.0),
			Vector2(cx + 18.0, ground_y + 36.0),
			Vector2(cx - 18.0, ground_y + 36.0),
			Vector2(cx - 48.0, ground_y + 28.0)
		]
		canvas.draw_colored_polygon(pit_pts, Color(0.12, 0.08, 0.06, 1.0))
		canvas.draw_polyline(pit_pts, ink, 2.2)
		canvas.draw_line(pit_pts[pit_pts.size() - 1], pit_pts[0], ink, 2.2)

		# Spikes pointing upward
		for sp_x in [cx - 36.0, cx - 18.0, cx, cx + 18.0, cx + 36.0]:
			var spike_pts: PackedVector2Array = [
				Vector2(sp_x - 5.0, ground_y + 32.0),
				Vector2(sp_x, ground_y + 6.0),
				Vector2(sp_x + 5.0, ground_y + 32.0)
			]
			canvas.draw_colored_polygon(spike_pts, Color(0.72, 0.60, 0.44, 1.0))
			canvas.draw_polyline(spike_pts, ink, 1.6)

		# Danger Warning Diamond above pit
		var dia_pts: PackedVector2Array = [
			Vector2(cx, cy - 42.0),
			Vector2(cx + 18.0, cy - 24.0),
			Vector2(cx, cy - 6.0),
			Vector2(cx - 18.0, cy - 24.0)
		]
		canvas.draw_colored_polygon(dia_pts, Color(0.96, 0.88, 0.35, 1.0))
		canvas.draw_polyline(dia_pts, ink, 2.0)
		canvas.draw_line(dia_pts[3], dia_pts[0], ink, 2.0)
		canvas.draw_line(Vector2(cx, cy - 34.0), Vector2(cx, cy - 20.0), ink, 3.0)
		canvas.draw_circle(Vector2(cx, cy - 13.0), 2.2, ink)

		# Falling pebbles
		canvas.draw_circle(Vector2(cx - 42.0, ground_y + 8.0), 2.5, ink)
		canvas.draw_circle(Vector2(cx + 38.0, ground_y + 12.0), 3.0, ink)
		canvas.draw_line(Vector2(cx - 42.0, ground_y + 4.0), Vector2(cx - 42.0, ground_y - 4.0), ink_shade, 1.0)
		canvas.draw_line(Vector2(cx + 38.0, ground_y + 8.0), Vector2(cx + 38.0, ground_y - 2.0), ink_shade, 1.0)

	elif card_type == "wandering_monster":
		# Snarling Orc Warrior Ambush with Spiked Helm & Raised Blade
		for sh_i in range(12):
			var sx = cx - 60.0 + float(sh_i) * 10.0
			canvas.draw_line(Vector2(sx, cy - 35.0), Vector2(sx - 15.0, ground_y), ink_shade, 1.0)

		# Spiked Conical Iron Helmet
		var helm_pts: PackedVector2Array = [
			Vector2(cx - 28.0, cy - 10.0),
			Vector2(cx - 18.0, cy - 42.0),
			Vector2(cx, cy - 54.0),
			Vector2(cx + 18.0, cy - 42.0),
			Vector2(cx + 28.0, cy - 10.0),
			Vector2(cx, cy - 16.0)
		]
		canvas.draw_colored_polygon(helm_pts, Color(0.38, 0.40, 0.42, 1.0))
		canvas.draw_polyline(helm_pts, ink, 2.2)
		canvas.draw_line(helm_pts[5], helm_pts[0], ink, 2.2)
		canvas.draw_line(Vector2(cx, cy - 54.0), Vector2(cx, cy - 64.0), ink, 3.0)

		# Orc Face
		var face_pts: PackedVector2Array = [
			Vector2(cx - 26.0, cy - 10.0),
			Vector2(cx - 32.0, cy + 12.0),
			Vector2(cx - 18.0, cy + 28.0),
			Vector2(cx + 18.0, cy + 28.0),
			Vector2(cx + 32.0, cy + 12.0),
			Vector2(cx + 26.0, cy - 10.0)
		]
		canvas.draw_colored_polygon(face_pts, Color(0.48, 0.60, 0.42, 1.0))
		canvas.draw_polyline(face_pts, ink, 2.0)

		# Menacing Eyes
		canvas.draw_line(Vector2(cx - 16.0, cy - 2.0), Vector2(cx - 6.0, cy - 4.0), ink, 2.5)
		canvas.draw_line(Vector2(cx + 6.0, cy - 4.0), Vector2(cx + 16.0, cy - 2.0), ink, 2.5)
		canvas.draw_circle(Vector2(cx - 10.0, cy - 3.0), 1.5, Color.WHITE)
		canvas.draw_circle(Vector2(cx + 10.0, cy - 3.0), 1.5, Color.WHITE)

		# Snarling Mouth with Tusks
		var mouth_pts: PackedVector2Array = [
			Vector2(cx - 14.0, cy + 12.0),
			Vector2(cx, cy + 10.0),
			Vector2(cx + 14.0, cy + 12.0),
			Vector2(cx + 10.0, cy + 20.0),
			Vector2(cx - 10.0, cy + 20.0)
		]
		canvas.draw_colored_polygon(mouth_pts, Color(0.20, 0.08, 0.08, 1.0))
		canvas.draw_polyline(mouth_pts, ink, 1.6)
		var tusk_left: PackedVector2Array = [
			Vector2(cx - 9.0, cy + 20.0),
			Vector2(cx - 7.0, cy + 8.0),
			Vector2(cx - 4.0, cy + 19.0)
		]
		canvas.draw_colored_polygon(tusk_left, Color(0.96, 0.94, 0.88, 1.0))
		canvas.draw_polyline(tusk_left, ink, 1.2)
		var tusk_right: PackedVector2Array = [
			Vector2(cx + 4.0, cy + 19.0),
			Vector2(cx + 7.0, cy + 8.0),
			Vector2(cx + 9.0, cy + 20.0)
		]
		canvas.draw_colored_polygon(tusk_right, Color(0.96, 0.94, 0.88, 1.0))
		canvas.draw_polyline(tusk_right, ink, 1.2)

		# Raised Jagged Notched Scimitar
		var blade_pts: PackedVector2Array = [
			Vector2(cx + 38.0, ground_y),
			Vector2(cx + 44.0, cy - 8.0),
			Vector2(cx + 52.0, cy - 38.0),
			Vector2(cx + 48.0, cy - 42.0),
			Vector2(cx + 36.0, cy - 14.0),
			Vector2(cx + 32.0, ground_y)
		]
		canvas.draw_colored_polygon(blade_pts, Color(0.70, 0.72, 0.74, 1.0))
		canvas.draw_polyline(blade_pts, ink, 1.8)
		canvas.draw_line(Vector2(cx + 46.0, cy - 22.0), Vector2(cx + 41.0, cy - 20.0), ink, 1.8)

func _draw_treasure_card_overlay(canvas: CanvasItem) -> void:
	if active_treasure_overlay.is_empty():
		return
	if treasure_modal and treasure_modal.visible:
		return

	var overlay = active_treasure_overlay
	var font = ThemeDB.fallback_font
	_update_board_metrics()
	var center = board_offset + Vector2(grid_cols * tile_size * 0.5, grid_rows * tile_size * 0.44)

	# 1. Full Board Dark Vignette / Backdrop Dimmer
	var total_w = float(grid_cols * tile_size)
	var total_h = float(grid_rows * tile_size)
	canvas.draw_rect(Rect2(board_offset, Vector2(total_w, total_h)), Color(0.0, 0.0, 0.0, 0.72))

	# 2. Vertical Playing Card (340 x 520) - Authentic 1:1.5 playing card ratio
	var card_w = 340.0
	var card_h = 520.0
	var card_rect = Rect2(center.x - card_w * 0.5, center.y - card_h * 0.5, card_w, card_h)

	# Drop shadow
	canvas.draw_rect(Rect2(card_rect.position + Vector2(10.0, 12.0), card_rect.size), Color(0.0, 0.0, 0.0, 0.75))

	# Outer Card Margin (Dark chocolate brown border edge)
	var card_edge_col = Color(0.15, 0.09, 0.06, 1.0)
	canvas.draw_rect(card_rect, card_edge_col)
	canvas.draw_rect(card_rect, Color(0.32, 0.20, 0.12, 0.9), false, 1.5)

	# Parchment Body (Warm aged yellow-tan parchment)
	var parchment_rect = Rect2(card_rect.position + Vector2(12.0, 12.0), card_rect.size - Vector2(24.0, 24.0))
	var parchment_fill = Color(0.93, 0.86, 0.72, 1.0)
	canvas.draw_rect(parchment_rect, parchment_fill)

	# Subtle vintage edge aging
	canvas.draw_rect(Rect2(parchment_rect.position, Vector2(parchment_rect.size.x, 3.0)), Color(0.80, 0.70, 0.55, 0.45))
	canvas.draw_rect(Rect2(Vector2(parchment_rect.position.x, parchment_rect.end.y - 3.0), Vector2(parchment_rect.size.x, 3.0)), Color(0.80, 0.70, 0.55, 0.45))
	canvas.draw_rect(Rect2(parchment_rect.position, Vector2(3.0, parchment_rect.size.y)), Color(0.80, 0.70, 0.55, 0.45))
	canvas.draw_rect(Rect2(Vector2(parchment_rect.end.x - 3.0, parchment_rect.position.y), Vector2(3.0, parchment_rect.size.y)), Color(0.80, 0.70, 0.55, 0.45))

	# Double-line hairline inner border frame
	var inner_frame = Rect2(parchment_rect.position + Vector2(8.0, 8.0), parchment_rect.size - Vector2(16.0, 16.0))
	var ink_col = Color(0.22, 0.13, 0.08, 0.95)
	canvas.draw_rect(inner_frame, ink_col, false, 2.0)

	var inner_hairline = Rect2(inner_frame.position + Vector2(3.0, 3.0), inner_frame.size - Vector2(6.0, 6.0))
	canvas.draw_rect(inner_hairline, Color(0.38, 0.24, 0.15, 0.70), false, 1.0)

	# Corner tick marks
	var corners = [
		inner_frame.position,
		Vector2(inner_frame.end.x, inner_frame.position.y),
		Vector2(inner_frame.position.x, inner_frame.end.y),
		inner_frame.end
	]
	var tick = 6.0
	canvas.draw_line(corners[0] + Vector2(tick, 0), corners[0] + Vector2(tick, tick), ink_col, 1.0)
	canvas.draw_line(corners[0] + Vector2(0, tick), corners[0] + Vector2(tick, tick), ink_col, 1.0)
	canvas.draw_line(corners[1] + Vector2(-tick, 0), corners[1] + Vector2(-tick, tick), ink_col, 1.0)
	canvas.draw_line(corners[1] + Vector2(0, tick), corners[1] + Vector2(-tick, tick), ink_col, 1.0)
	canvas.draw_line(corners[2] + Vector2(tick, 0), corners[2] + Vector2(tick, -tick), ink_col, 1.0)
	canvas.draw_line(corners[2] + Vector2(0, -tick), corners[2] + Vector2(tick, -tick), ink_col, 1.0)
	canvas.draw_line(corners[3] + Vector2(-tick, 0), corners[3] + Vector2(-tick, -tick), ink_col, 1.0)
	canvas.draw_line(corners[3] + Vector2(0, -tick), corners[3] + Vector2(-tick, -tick), ink_col, 1.0)

	# 3. Card Title (Antique classic serif font centered at top)
	var raw_title = str(overlay.get("title", "Treasure"))
	var title_display = raw_title
	if "(" in title_display and ("gold" in raw_title.to_lower() or "gem" in raw_title.to_lower() or "hazard" in raw_title.to_lower()):
		title_display = raw_title.split("(")[0].strip_edges()
	if title_display.is_empty():
		title_display = raw_title

	var t_sz = font.get_string_size(title_display, HORIZONTAL_ALIGNMENT_CENTER, -1, 19)
	var title_y = parchment_rect.position.y + 34.0
	canvas.draw_string(font, Vector2(center.x - t_sz.x * 0.5, title_y), title_display, HORIZONTAL_ALIGNMENT_CENTER, -1, 19, ink_col)

	# Decorative divider line under title
	var div_y = title_y + 8.0
	canvas.draw_line(Vector2(center.x - 70.0, div_y), Vector2(center.x + 70.0, div_y), Color(ink_col.r, ink_col.g, ink_col.b, 0.4), 1.0)
	canvas.draw_circle(Vector2(center.x, div_y), 2.5, ink_col)

	# 4. Framed Woodcut Illustration Window (250 x 160)
	var illus_w = 250.0
	var illus_h = 160.0
	var illus_rect = Rect2(center.x - illus_w * 0.5, div_y + 10.0, illus_w, illus_h)

	# Cream window fill
	canvas.draw_rect(illus_rect, Color(0.97, 0.94, 0.88, 1.0))
	# Frame border
	canvas.draw_rect(illus_rect, ink_col, false, 2.0)
	canvas.draw_rect(Rect2(illus_rect.position + Vector2(3, 3), illus_rect.size - Vector2(6, 6)), Color(ink_col.r, ink_col.g, ink_col.b, 0.4), false, 0.8)

	var card_type = str(overlay.get("card_type", "gold"))
	var is_quest_note = bool(overlay.get("is_quest_note", false))
	_draw_woodcut_illustration(canvas, illus_rect, card_type, is_quest_note, overlay)

	# 5. Card Body Prose (Rules & Flavor)
	var body_y = illus_rect.end.y + 18.0
	var desc = str(overlay.get("description", ""))
	var flavor = str(overlay.get("flavor", ""))

	# Authentic text wrapping
	var desc_lines = _wrap_card_text(desc, font, 12, illus_w)
	var cur_y = body_y
	for line in desc_lines:
		var l_sz = font.get_string_size(line, HORIZONTAL_ALIGNMENT_CENTER, -1, 12)
		canvas.draw_string(font, Vector2(center.x - l_sz.x * 0.5, cur_y), line, HORIZONTAL_ALIGNMENT_CENTER, -1, 12, ink_col)
		cur_y += 16.0

	if flavor != "":
		cur_y += 4.0
		var flv_divider = "— ✦ —"
		var fd_sz = font.get_string_size(flv_divider, HORIZONTAL_ALIGNMENT_CENTER, -1, 10)
		canvas.draw_string(font, Vector2(center.x - fd_sz.x * 0.5, cur_y), flv_divider, HORIZONTAL_ALIGNMENT_CENTER, -1, 10, Color(ink_col.r, ink_col.g, ink_col.b, 0.5))
		cur_y += 14.0

		var flv_lines = _wrap_card_text(flavor, font, 11, illus_w)
		for fline in flv_lines:
			var fl_sz = font.get_string_size(fline, HORIZONTAL_ALIGNMENT_CENTER, -1, 11)
			canvas.draw_string(font, Vector2(center.x - fl_sz.x * 0.5, cur_y), fline, HORIZONTAL_ALIGNMENT_CENTER, -1, 11, Color(0.35, 0.22, 0.12, 0.90))
			cur_y += 15.0

	# 6. Bottom CTA / Dismiss Prompt
	var pulse = 0.82 + 0.18 * sin(Time.get_ticks_msec() * 0.006)
	var cta_y = parchment_rect.end.y - 18.0
	var cta_text = "[ CLICK ANYWHERE OR PRESS SPACE TO COLLECT ]"
	if card_type == "wandering_monster":
		cta_text = "[ CLICK ANYWHERE OR PRESS SPACE TO ENGAGE ]"
	elif card_type == "hazard":
		cta_text = "[ CLICK ANYWHERE OR PRESS SPACE TO CONTINUE ]"

	var c_sz = font.get_string_size(cta_text, HORIZONTAL_ALIGNMENT_CENTER, -1, 11)
	canvas.draw_string(font, Vector2(center.x - c_sz.x * 0.5, cta_y), cta_text, HORIZONTAL_ALIGNMENT_CENTER, -1, 11, Color(0.36, 0.20, 0.10, pulse))

func _draw_gm_story_trigger_markers(canvas: CanvasItem) -> void:
	var font = ThemeDB.fallback_font
	for st in story_triggers:
		var marker = str(st.get("marker", "?"))
		var is_trig = bool(st.get("triggered", false))
		var marker_tile = Vector2i(-1, -1)
		if st.has("tile") and st.tile is Array and st.tile.size() >= 2:
			marker_tile = Vector2i(int(st.tile[0]), int(st.tile[1]))
		elif st.has("room"):
			var rm = _get_room_by_id(str(st.room))
			if rm.size() > 0:
				marker_tile = Vector2i(int(rm.get("x", 0)) + int(rm.get("w", 1) / 2), int(rm.get("y", 0)) + int(rm.get("h", 1) / 2))
		if marker_tile.x < 0 or marker_tile.y < 0:
			continue

		var center = board_offset + Vector2((marker_tile.x + 0.5) * tile_size, (marker_tile.y + 0.5) * tile_size)
		var radius = tile_size * 0.36
		# Drop shadow
		canvas.draw_circle(center + Vector2(1.5, 2.0), radius, Color(0.0, 0.0, 0.0, 0.6))
		# Circular seal body
		var bg_col = Color(0.35, 0.15, 0.15, 0.75) if is_trig else Color(0.72, 0.12, 0.16, 0.95)
		canvas.draw_circle(center, radius, bg_col)
		# Gold border
		var rim_col = Color(0.65, 0.55, 0.35, 0.7) if is_trig else Color(1.0, 0.85, 0.25, 1.0)
		canvas.draw_arc(center, radius, 0, TAU, 24, rim_col, 2.0)
		canvas.draw_arc(center, radius * 0.75, 0, TAU, 18, Color(rim_col.r, rim_col.g, rim_col.b, 0.5), 1.0)
		# Letter label
		var txt = marker if not is_trig else "%s✓" % marker
		var txt_w = font.get_string_size(txt, HORIZONTAL_ALIGNMENT_CENTER, -1, 13).x
		canvas.draw_string(font, Vector2(center.x - txt_w * 0.5, center.y + 5), txt, HORIZONTAL_ALIGNMENT_CENTER, -1, 13, Color.WHITE)

func _draw_story_trigger_overlay(canvas: CanvasItem) -> void:
	if active_story_trigger_overlay.is_empty():
		return

	var overlay = active_story_trigger_overlay
	var font = ThemeDB.fallback_font
	_update_board_metrics()
	var center = board_offset + Vector2(grid_cols * tile_size * 0.5, grid_rows * tile_size * 0.44)

	# 1. Full Board Dark Vignette / Backdrop Dimmer
	var total_w = float(grid_cols * tile_size)
	var total_h = float(grid_rows * tile_size)
	canvas.draw_rect(Rect2(board_offset, Vector2(total_w, total_h)), Color(0.02, 0.03, 0.06, 0.84))

	# 2. Deluxe Parchment Folio Card (440 x 580)
	var card_w = 440.0
	var card_h = 580.0
	var card_rect = Rect2(center.x - card_w * 0.5, center.y - card_h * 0.5, card_w, card_h)

	# Drop shadow
	canvas.draw_rect(Rect2(card_rect.position + Vector2(10.0, 12.0), card_rect.size), Color(0.0, 0.0, 0.0, 0.85))

	# Outer Card Margin (Dark gothic obsidian leather border)
	var leather_col = Color(0.12, 0.08, 0.05, 1.0)
	canvas.draw_rect(card_rect, leather_col)
	canvas.draw_rect(card_rect, Color(0.85, 0.68, 0.25, 0.95), false, 2.0)

	# Parchment Body (Rich aged parchment)
	var parchment_rect = Rect2(card_rect.position + Vector2(14.0, 14.0), card_rect.size - Vector2(28.0, 28.0))
	var parchment_fill = Color(0.94, 0.88, 0.74, 1.0)
	canvas.draw_rect(parchment_rect, parchment_fill)

	# Vintage edge aging
	canvas.draw_rect(Rect2(parchment_rect.position, Vector2(parchment_rect.size.x, 3.0)), Color(0.80, 0.70, 0.52, 0.45))
	canvas.draw_rect(Rect2(Vector2(parchment_rect.position.x, parchment_rect.end.y - 3.0), Vector2(parchment_rect.size.x, 3.0)), Color(0.80, 0.70, 0.52, 0.45))
	canvas.draw_rect(Rect2(parchment_rect.position, Vector2(3.0, parchment_rect.size.y)), Color(0.80, 0.70, 0.52, 0.45))
	canvas.draw_rect(Rect2(Vector2(parchment_rect.end.x - 3.0, parchment_rect.position.y), Vector2(3.0, parchment_rect.size.y)), Color(0.80, 0.70, 0.52, 0.45))

	# Inner double border frame
	var inner_frame = Rect2(parchment_rect.position + Vector2(8.0, 8.0), parchment_rect.size - Vector2(16.0, 16.0))
	var ink_col = Color(0.22, 0.12, 0.07, 0.95)
	canvas.draw_rect(inner_frame, ink_col, false, 2.0)
	var inner_hairline = Rect2(inner_frame.position + Vector2(3.0, 3.0), inner_frame.size - Vector2(6.0, 6.0))
	canvas.draw_rect(inner_hairline, Color(0.70, 0.55, 0.30, 0.70), false, 1.0)

	# 3. Top Banner: Royal Crimson Ribbon
	var banner_w = 260.0
	var banner_h = 24.0
	var banner_rect = Rect2(center.x - banner_w * 0.5, parchment_rect.position.y + 12.0, banner_w, banner_h)
	canvas.draw_rect(banner_rect, Color(0.60, 0.10, 0.14, 0.98))
	canvas.draw_rect(banner_rect, Color(0.95, 0.80, 0.30, 1.0), false, 1.5)
	var banner_text = str(overlay.get("banner", "QUEST BOOK NOTE"))
	var b_sz = font.get_string_size(banner_text, HORIZONTAL_ALIGNMENT_CENTER, -1, 11)
	canvas.draw_string(font, Vector2(center.x - b_sz.x * 0.5, banner_rect.position.y + 16.0), banner_text, HORIZONTAL_ALIGNMENT_CENTER, -1, 11, Color(1.0, 0.95, 0.85))

	# 4. Circular Wax Seal Medallion (with marker letter e.g. "A" or "B")
	var seal_center = Vector2(center.x, banner_rect.end.y + 36.0)
	var seal_radius = 24.0
	# Seal drop shadow
	canvas.draw_circle(seal_center + Vector2(1.5, 2.5), seal_radius, Color(0.0, 0.0, 0.0, 0.5))
	# Seal body
	canvas.draw_circle(seal_center, seal_radius, Color(0.72, 0.12, 0.16, 1.0))
	canvas.draw_arc(seal_center, seal_radius, 0, TAU, 32, Color(0.95, 0.80, 0.25, 1.0), 2.0)
	canvas.draw_arc(seal_center, seal_radius * 0.76, 0, TAU, 24, Color(0.95, 0.80, 0.25, 0.6), 1.0)
	var marker_letter = str(overlay.get("marker", "A"))
	var m_sz = font.get_string_size(marker_letter, HORIZONTAL_ALIGNMENT_CENTER, -1, 22)
	canvas.draw_string(font, Vector2(seal_center.x - m_sz.x * 0.5, seal_center.y + 8.0), marker_letter, HORIZONTAL_ALIGNMENT_CENTER, -1, 22, Color(1.0, 0.95, 0.80))

	# 5. Story Title
	var title_text = str(overlay.get("title", "Story Event"))
	var t_sz = font.get_string_size(title_text, HORIZONTAL_ALIGNMENT_CENTER, -1, 18)
	var title_y = seal_center.y + seal_radius + 24.0
	canvas.draw_string(font, Vector2(center.x - t_sz.x * 0.5, title_y), title_text, HORIZONTAL_ALIGNMENT_CENTER, -1, 18, ink_col)

	# Decorative divider
	var div_y = title_y + 8.0
	var div_w = 280.0
	canvas.draw_line(Vector2(center.x - div_w * 0.5, div_y), Vector2(center.x + div_w * 0.5, div_y), Color(0.60, 0.45, 0.30, 0.8), 1.0)
	canvas.draw_circle(Vector2(center.x, div_y), 3.0, Color(0.60, 0.10, 0.14, 0.9))

	# 6. Narrative Folio Box (Zargon's Read-Aloud Text)
	var text_box_y = div_y + 14.0
	var text_box_w = card_w - 64.0
	var text_box_h = 210.0
	var text_box_rect = Rect2(center.x - text_box_w * 0.5, text_box_y, text_box_w, text_box_h)
	# Subtle parchment inset
	canvas.draw_rect(text_box_rect, Color(0.90, 0.83, 0.68, 0.95))
	canvas.draw_rect(text_box_rect, Color(0.70, 0.55, 0.38, 0.8), false, 1.0)

	# Render word-wrapped narrative
	var narrative = str(overlay.get("narrative", ""))
	var lines = _wrap_card_text(narrative, font, 12, text_box_w - 24.0)
	var line_y = text_box_rect.position.y + 24.0
	for l in lines:
		if line_y > text_box_rect.end.y - 12.0:
			break
		var l_sz = font.get_string_size(l, HORIZONTAL_ALIGNMENT_LEFT, -1, 12)
		canvas.draw_string(font, Vector2(text_box_rect.position.x + 12.0, line_y), l, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(0.18, 0.10, 0.06, 0.95))
		line_y += 18.0

	# 7. Rewards / Consequences Section
	var reward_y = text_box_rect.end.y + 12.0
	var gold_val = int(overlay.get("gold", 0))
	var item_data = overlay.get("item", null)
	var spawns = overlay.get("spawnMonsters", [])

	var loot_items: Array[String] = []
	if gold_val > 0:
		loot_items.append("💰 +%d Gold Coins" % gold_val)
	if item_data != null:
		var iname = item_data.get("name", "Quest Item") if item_data is Dictionary else str(item_data)
		loot_items.append("📜 %s" % iname)
	if spawns is Array and spawns.size() > 0:
		loot_items.append("⚔️ AMBUSH! %d Monster(s) appear!" % spawns.size())

	if loot_items.size() > 0:
		var loot_str = "  •  ".join(loot_items)
		var loot_sz = font.get_string_size(loot_str, HORIZONTAL_ALIGNMENT_CENTER, -1, 12)
		var loot_box_w = minf(card_w - 64.0, loot_sz.x + 24.0)
		var loot_rect = Rect2(center.x - loot_box_w * 0.5, reward_y, loot_box_w, 28.0)
		canvas.draw_rect(loot_rect, Color(0.12, 0.24, 0.16, 0.95) if spawns.is_empty() else Color(0.35, 0.10, 0.12, 0.95))
		canvas.draw_rect(loot_rect, Color(0.95, 0.80, 0.30, 1.0), false, 1.5)
		canvas.draw_string(font, Vector2(center.x - loot_sz.x * 0.5, reward_y + 19.0), loot_str, HORIZONTAL_ALIGNMENT_CENTER, -1, 12, Color.WHITE)

	# 8. Dismiss Action Prompt
	var pulse = 0.82 + 0.18 * sin(Time.get_ticks_msec() * 0.006)
	var prompt_text = "[ CLICK ANYWHERE OR PRESS SPACE / ENTER TO PROCEED ]"
	var p_sz = font.get_string_size(prompt_text, HORIZONTAL_ALIGNMENT_CENTER, -1, 10)
	var prompt_y = parchment_rect.end.y - 14.0
	canvas.draw_string(font, Vector2(center.x - p_sz.x * 0.5, prompt_y), prompt_text, HORIZONTAL_ALIGNMENT_CENTER, -1, 10, Color(0.36, 0.20, 0.10, pulse))

func _draw_item_flash_banner(canvas: CanvasItem) -> void:
	if flashing_item.is_empty() or not bool(flashing_item.get("active", false)):
		return

	var font = ThemeDB.fallback_font
	_update_board_metrics()
	var center_x = board_offset.x + float(grid_cols * tile_size) * 0.5
	var banner_y = board_offset.y + 24.0
	var banner_w = 520.0
	var banner_h = 56.0
	var banner_rect = Rect2(center_x - banner_w * 0.5, banner_y, banner_w, banner_h)

	var pulse = 0.80 + 0.20 * sin(Time.get_ticks_msec() * 0.015)

	# Shadow
	canvas.draw_rect(Rect2(banner_rect.position + Vector2(0, 4), banner_rect.size), Color(0.0, 0.0, 0.0, 0.65))

	# Background (deep dark velvet navy)
	canvas.draw_rect(banner_rect, Color(0.06, 0.08, 0.12, 0.96))

	# Double glowing gold borders
	canvas.draw_rect(banner_rect, Color(1.0, 0.84, 0.15, pulse), false, 2.5)
	var inner_rect = Rect2(banner_rect.position + Vector2(3, 3), banner_rect.size - Vector2(6, 6))
	canvas.draw_rect(inner_rect, Color(1.0, 0.95, 0.50, pulse * 0.6), false, 1.0)

	# Text lines
	var msg = str(flashing_item.get("message", ""))
	if msg == "":
		var itype = str(flashing_item.get("type", "item"))
		if itype == "gold":
			msg = "💰 TREASURE COLLECTED: +%d Gold Coins added to Purse! 💰" % int(flashing_item.get("amount", 0))
		else:
			msg = "✨ NEW ITEM ACQUIRED: %s added to Backpack! ✨" % str(flashing_item.get("name", "Item"))

	var m_sz = font.get_string_size(msg, HORIZONTAL_ALIGNMENT_CENTER, -1, 14)
	canvas.draw_string(font, Vector2(center_x - m_sz.x * 0.5, banner_rect.position.y + 24.0), msg, HORIZONTAL_ALIGNMENT_CENTER, -1, 14, Color(1.0, 0.95, 0.70, pulse))

	var hero_name = str(flashing_item.get("hero_name", "Hero"))
	var sub_msg = "⚡ [ OUT OF MOVEMENT — %s is ready for Action or End Turn ] ⚡" % hero_name
	var s_sz = font.get_string_size(sub_msg, HORIZONTAL_ALIGNMENT_CENTER, -1, 11)
	canvas.draw_string(font, Vector2(center_x - s_sz.x * 0.5, banner_rect.position.y + 44.0), sub_msg, HORIZONTAL_ALIGNMENT_CENTER, -1, 11, Color(0.65, 0.90, 1.0, 0.95))

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
	var felt_color = Color(0.05, 0.14, 0.08, 0.97) if anim_type == "movement" else (Color(0.14, 0.04, 0.05, 0.98) if anim_type == "hazard" else Color(0.06, 0.08, 0.14, 0.98))
	canvas.draw_rect(felt_rect, felt_color)

	# Gold/Brass Inlay Filigree Trim
	canvas.draw_rect(felt_rect, Color(0.85, 0.72, 0.25, 0.75), false, 1.8)

	if anim_type == "movement":
		# Movement Header Banner
		var title = str(anim.get("title", ""))
		var title_w = font.get_string_size(title, HORIZONTAL_ALIGNMENT_CENTER, -1, 14).x
		canvas.draw_string(font, Vector2(center.x - title_w * 0.5, tray_rect.position.y + 24.0), title, HORIZONTAL_ALIGNMENT_CENTER, -1, 14, Color(1.0, 0.90, 0.45, 1.0))
	elif anim_type == "hazard":
		# Hazard Tray Header Banner
		var title = str(anim.get("title", "HAZARD ROLL"))
		var title_w = font.get_string_size(title, HORIZONTAL_ALIGNMENT_CENTER, -1, 14).x
		var h_rect = Rect2(felt_rect.position.x + 12.0, felt_rect.position.y + 6.0, felt_rect.size.x - 24.0, 24.0)
		canvas.draw_rect(h_rect, Color(0.32, 0.06, 0.06, 0.92))
		canvas.draw_rect(h_rect, Color(1.0, 0.40, 0.15, 0.85), false, 1.2)
		canvas.draw_string(font, Vector2(center.x - title_w * 0.5, h_rect.position.y + 17.0), title, HORIZONTAL_ALIGNMENT_CENTER, -1, 14, Color(1.0, 0.92, 0.65, 1.0))
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
			if settled and anim_type == "combat":
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
			var outline_col = Color(1.0, 0.85, 0.25, 0.9) if ("WOUND" in summary or "square" in summary or "SKULL" in summary or "DODGED" in summary) else Color(0.4, 0.8, 1.0, 0.9)
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

