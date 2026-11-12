extends Node

const ALBUM_DIR := "res://assets/audio/music/bloodlines"
const GAMEPLAY_DIR := ALBUM_DIR + "/gameplay"
const SHADOWS_TRACK_PATH := "res://assets/audio/music/tempest-eternal/04.ogg"
const TITLE_TRACK := 1
const FIRST_GAMEPLAY_TRACK := 2
const BLOODLINES_TRACK_COUNT := 12
const SHADOWS_TRACK := BLOODLINES_TRACK_COUNT + 1
const TRACK_FADE_SECONDS := 6.0
const SCENE_FADE_SECONDS := 3.5
const CREDIT := "Bloodlines by Pathless Land"
const ALBUM_URL := "https://pathlessland.bandcamp.com/album/bloodlines-2"
const TEMPEST_CREDIT := "Tempest Eternal"
const TEMPEST_ALBUM_URL := "https://tempesteternal.bandcamp.com/album/tempest-eternal"
const ARTIST_CHANNEL_URL := "https://www.youtube.com/user/Mattowarrior777"
const DEFAULT_VOLUME := 100
const TITLE_GAIN_DB := -4.0
const GAMEPLAY_GAIN_DB := -3.0
const SHADOWS_GAIN_DB := GAMEPLAY_GAIN_DB - 1.3
const TITLE_SCENE := "res://scenes/RTSStart.tscn"
const BATTLE_SCENE := "res://scenes/RTSMain.tscn"

var volume_percent := DEFAULT_VOLUME
var _players: Array[AudioStreamPlayer] = []
var _active_player := 1
var _deck_db := [TITLE_GAIN_DB, TITLE_GAIN_DB]
var _campaign_voice: AudioStreamPlayer
var _playlist := ""
var _track := 0
var _bookmarks := {}
var _gameplay_tracks: Array[int] = []
var _shuffle_rng := RandomNumberGenerator.new()
var _fade_duration := SCENE_FADE_SECONDS
var _fade_elapsed := SCENE_FADE_SECONDS
var _outgoing_gain := 0.0
var _incoming_gain := 0.0
var _duck_db := 0.0

func _ready() -> void:
	var prefs := ConfigFile.new()
	prefs.load(RTSAudio.prefs_path())
	volume_percent = clampi(int(prefs.get_value("audio", "music_volume", DEFAULT_VOLUME)), 0, 100)
	RTSAudio.set_bus_percent("Music", volume_percent)
	if DisplayServer.get_name() == "headless" or "--no-music" in OS.get_cmdline_user_args():
		set_process(false)
		return
	_shuffle_rng.randomize()
	for deck_name in ["Soundtrack", "SoundtrackAlternate"]:
		var player := AudioStreamPlayer.new()
		player.name = deck_name
		player.bus = "Music"
		player.volume_db = -80.0
		add_child(player)
		_players.append(player)

func set_volume_percent(percent: int) -> void:
	percent = clampi(percent, 0, 100)
	if percent == volume_percent:
		return
	volume_percent = percent
	RTSAudio.set_bus_percent("Music", percent)
	RTSAudio.save_volume("music_volume", percent)

func watch_campaign_voice(player: AudioStreamPlayer) -> void:
	_campaign_voice = player

func seek_for_capture(seconds: float) -> bool:
	if _players.is_empty() or not _players[_active_player].playing:
		return false
	var player := _players[_active_player]
	player.seek(clampf(seconds, 0.0, maxf(0.0, player.stream.get_length() - TRACK_FADE_SECONDS - 1.0)))
	_fade_elapsed = _fade_duration
	_players[1 - _active_player].stop()
	_incoming_gain = 1.0
	return true

func _process(delta: float) -> void:
	var scene := get_tree().current_scene
	var path := scene.scene_file_path if scene != null and SimEngine.rts_mode != "backend" else ""
	var playlist := ALBUM_DIR if path == TITLE_SCENE else (GAMEPLAY_DIR if path == BATTLE_SCENE else "")
	var pause_music := playlist.is_empty()
	for deck in _players:
		if deck.playing and deck.stream_paused != pause_music:
			deck.stream_paused = pause_music
	if pause_music:
		return

	var current := _players[_active_player]
	if playlist != _playlist:
		if current.playing and not _playlist.is_empty():
			_bookmarks[_playlist] = {"track": _track, "position": current.get_playback_position()}
		# Keep the menu theme and battle music on their own side of the scene change.
		for deck in _players:
			deck.stop()
		_playlist = playlist
		var resume: Dictionary = _bookmarks.get(playlist, {})
		var position := float(resume.get("position", 0.0))
		if playlist == ALBUM_DIR:
			if not _open_track(TITLE_TRACK, position, SCENE_FADE_SECONDS):
				_stop_playlist()
		elif not _open_track(int(resume.get("track", 0)), position, SCENE_FADE_SECONDS):
			_open_next_gameplay_track(SCENE_FADE_SECONDS)
	elif _track > 0 and (not current.playing or (_fade_elapsed >= _fade_duration and
			current.stream.get_length() - current.get_playback_position() <= TRACK_FADE_SECONDS)):
		if playlist == GAMEPLAY_DIR:
			_open_next_gameplay_track(TRACK_FADE_SECONDS)
		elif not _open_track(TITLE_TRACK, 0.0, TRACK_FADE_SECONDS):
			_stop_playlist()

	var campaign_speaking := RTSAudio.volume_percent > 0 and is_instance_valid(_campaign_voice) and _campaign_voice.playing and not _campaign_voice.stream_paused
	var speaking := campaign_speaking or RTSAudio.unit_voice_playing()
	_duck_db = move_toward(_duck_db, -9.0 if speaking else 0.0, delta * (90.0 if speaking else 18.0))
	_fade_elapsed = minf(_fade_elapsed + delta, _fade_duration)
	var angle := (_fade_elapsed / _fade_duration) * PI * 0.5
	_incoming_gain = sin(angle)
	_set_deck_volume(_active_player, _incoming_gain)
	_set_deck_volume(1 - _active_player, cos(angle) * _outgoing_gain)
	if _fade_elapsed >= _fade_duration and _players[1 - _active_player].playing:
		_players[1 - _active_player].stop()

func _set_deck_volume(index: int, gain: float) -> void:
	_players[index].volume_db = -80.0 if gain <= 0.0001 else linear_to_db(gain) + _deck_db[index] + _duck_db

func _shuffle_gameplay_tracks() -> void:
	for track in range(FIRST_GAMEPLAY_TRACK, SHADOWS_TRACK + 1):
		var path := _gameplay_track_path(track)
		if ResourceLoader.exists(path, "AudioStreamOggVorbis") or FileAccess.file_exists(path):
			_gameplay_tracks.append(track)
	for index in range(_gameplay_tracks.size() - 1, 0, -1):
		var swap := _shuffle_rng.randi_range(0, index)
		var track := _gameplay_tracks[index]
		_gameplay_tracks[index] = _gameplay_tracks[swap]
		_gameplay_tracks[swap] = track
	if _gameplay_tracks.size() > 1 and _gameplay_tracks.back() == _track:
		_gameplay_tracks[-1] = _gameplay_tracks[0]
		_gameplay_tracks[0] = _track

func _open_next_gameplay_track(fade_seconds: float) -> void:
	# If a file goes missing mid-rotation, a fresh shuffle can still use the other tracks.
	for _attempt in 2:
		if _gameplay_tracks.is_empty():
			_shuffle_gameplay_tracks()
		while not _gameplay_tracks.is_empty():
			if _open_track(_gameplay_tracks.pop_back(), 0.0, fade_seconds):
				return
	_stop_playlist()

func _gameplay_track_path(track: int) -> String:
	if track == SHADOWS_TRACK:
		return SHADOWS_TRACK_PATH
	return "%s/%02d.ogg" % [GAMEPLAY_DIR, track]

func _open_track(track: int, seconds: float, fade_seconds: float) -> bool:
	var gameplay := _playlist == GAMEPLAY_DIR
	if (gameplay and (track < FIRST_GAMEPLAY_TRACK or track > SHADOWS_TRACK)) or (not gameplay and track != TITLE_TRACK):
		return false
	var path := _gameplay_track_path(track) if gameplay else "%s/%02d.ogg" % [ALBUM_DIR, track]
	var stream := ResourceLoader.load(path, "AudioStreamOggVorbis") as AudioStreamOggVorbis if ResourceLoader.exists(path, "AudioStreamOggVorbis") else null
	if stream == null and FileAccess.file_exists(path):
		stream = AudioStreamOggVorbis.load_from_file(path)
	if stream == null:
		return false
	stream.loop = false
	_outgoing_gain = _incoming_gain if _players[_active_player].playing else 0.0
	_active_player = 1 - _active_player
	var player := _players[_active_player]
	player.stop()
	player.stream = stream
	player.stream_paused = false
	player.volume_db = -80.0
	_deck_db[_active_player] = GAMEPLAY_GAIN_DB if gameplay else TITLE_GAIN_DB
	if track == SHADOWS_TRACK:
		_deck_db[_active_player] = SHADOWS_GAIN_DB
	_track = track
	_fade_duration = fade_seconds
	_fade_elapsed = 0.0
	var resume := seconds if seconds < stream.get_length() - TRACK_FADE_SECONDS else 0.0
	player.play(resume)
	return true

func _stop_playlist() -> void:
	_track = 0
	for player in _players:
		player.stop()
	push_warning("Starfall Command could not load the soundtrack at %s." % _playlist)
