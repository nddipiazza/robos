class_name DefeatScreen
extends Control

signal retry_pressed
signal return_town_pressed

@onready var title_label: Label = find_child("TitleLabel", true, false)
@onready var desc_label: Label = find_child("DescLabel", true, false)
@onready var stats_label: Label = find_child("StatsLabel", true, false)
@onready var btn_retry: Button = find_child("BtnRetry", true, false)
@onready var btn_return_town: Button = find_child("BtnReturnTown", true, false)

func _ready() -> void:
	visible = false
	if btn_retry:
		btn_retry.pressed.connect(_on_retry_clicked)
	if btn_return_town:
		btn_return_town.pressed.connect(_on_return_town_clicked)
	GameState.party_defeated.connect(open)

func open() -> void:
	visible = true
	if desc_label:
		desc_label.text = "All companions have fallen in battle. The shadows claim another victory."
	if stats_label:
		stats_label.text = "Enemies Vanquished: %d   |   Gold Carried: %d GP" % [GameState.stats.kills, GameState.gold]
	if AudioManager:
		AudioManager.play_sfx("melee_miss")
	print("[DefeatScreen] Opened: Party defeat overlay displayed.")

func close() -> void:
	visible = false

func _on_retry_clicked() -> void:
	print("[DefeatScreen] Retry encounter selected.")
	GameState.retry_encounter()
	close()
	retry_pressed.emit()

func _on_return_town_clicked() -> void:
	print("[DefeatScreen] Return to Village Square selected.")
	GameState.retry_encounter()
	close()
	return_town_pressed.emit()
	get_tree().change_scene_to_file("res://scenes/VillageSquare.tscn")
