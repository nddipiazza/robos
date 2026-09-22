extends Node

var bgm_player: AudioStreamPlayer
var sfx_player: AudioStreamPlayer
var sfx_players: Array[AudioStreamPlayer] = []
var sfx_pool_size: int = 8
var current_sfx_idx: int = 0

var tracks: Dictionary = {
	"title": "res://assets/audio/music/title_theme.ogg",
	"safe_room": "res://assets/audio/music/safe_room_theme.ogg",
	"town": "res://assets/audio/music/town_theme.ogg",
	"boss": "res://assets/audio/music/boss_theme.ogg"
}

var sound_effects: Dictionary = {
	"door_open": "res://assets/audio/sfx/door_open.ogg",
	"wood_open": "res://assets/audio/sfx/wood_open.ogg",
	"melee_attack": "res://assets/audio/sfx/melee_attack.ogg",
	"melee_hit": "res://assets/audio/sfx/melee_hit.ogg",
	"melee_miss": "res://assets/audio/sfx/melee_miss.ogg",
	"melee_crit": "res://assets/audio/sfx/melee_crit.ogg",
	"melee_swing": "res://assets/audio/sfx/melee_swing.ogg",
	"ranged_shoot": "res://assets/audio/sfx/ranged_shoot.ogg",
	"spell_cast": "res://assets/audio/sfx/spell_cast.ogg",
	"spell_impact": "res://assets/audio/sfx/spell_impact.ogg",
	"heal_cast": "res://assets/audio/sfx/heal_cast.ogg"
}

var current_track: String = ""
var last_scene_name: String = ""

func _ready() -> void:
	process_mode = PROCESS_MODE_ALWAYS
	bgm_player = AudioStreamPlayer.new()
	bgm_player.volume_db = -8.0
	add_child(bgm_player)

	for i in range(sfx_pool_size):
		var p = AudioStreamPlayer.new()
		p.volume_db = -4.0
		add_child(p)
		sfx_players.append(p)
	sfx_player = sfx_players[0]

func _process(_delta: float) -> void:
	var cur = get_tree().current_scene
	if cur and cur.name != last_scene_name:
		last_scene_name = cur.name
		_update_scene_music()

func _update_scene_music() -> void:
	match last_scene_name:
		"CharacterSelect", "VictoryScreen":
			play_bgm("title")
		"Homestead":
			play_bgm("safe_room")
		"VillageSquare":
			play_bgm("town")
		"GarrisonKeep":
			play_bgm("boss")

func play_bgm(track_key: String) -> void:
	if current_track == track_key and bgm_player.playing:
		return
	if tracks.has(track_key):
		var p = tracks[track_key]
		if ResourceLoader.exists(p):
			var stream = load(p)
			if stream:
				bgm_player.stream = stream
				bgm_player.play()
				current_track = track_key

func play_sfx(sfx_key: String) -> void:
	if sound_effects.has(sfx_key):
		var p = sound_effects[sfx_key]
		if ResourceLoader.exists(p):
			var stream = load(p)
			if stream:
				var target_player: AudioStreamPlayer = null
				for pl in sfx_players:
					if not pl.playing:
						target_player = pl
						break
				if not target_player:
					target_player = sfx_players[current_sfx_idx]
					current_sfx_idx = (current_sfx_idx + 1) % sfx_pool_size
				target_player.stream = stream
				target_player.play()
