extends Control

@onready var hero_label = $VBoxContainer/StatsBox/HeroLabel
@onready var kills_label = $VBoxContainer/StatsBox/KillsLabel
@onready var chests_label = $VBoxContainer/StatsBox/ChestsLabel
@onready var gold_label = $VBoxContainer/StatsBox/GoldLabel
@onready var replay_btn = $VBoxContainer/BtnReplay
@onready var quit_btn = $VBoxContainer/BtnQuit

func _ready() -> void:
	hero_label.text = "Hero: " + GameState.hero_name + " (" + GameState.hero_class.capitalize() + ")"
	kills_label.text = "Enemies Defeated: " + str(GameState.stats.kills)
	chests_label.text = "Chests Discovered: " + str(GameState.stats.chests)
	gold_label.text = "Gold Acquired: " + str(GameState.gold)
	replay_btn.pressed.connect(func(): get_tree().change_scene_to_file("res://scenes/CharacterSelect.tscn"))
	quit_btn.pressed.connect(func(): get_tree().quit())
