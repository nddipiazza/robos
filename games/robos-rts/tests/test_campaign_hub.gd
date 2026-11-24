extends SceneTree

const Campaign = preload("res://scripts/engine/RTSCampaign.gd")
const HubData = preload("res://scripts/engine/RTSCampaignHubData.gd")
const CutsceneData = preload("res://scripts/campaign/RTSCutsceneData.gd")

var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _check(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)

func _run() -> void:
	await process_frame
	var old_path := OS.get_environment("RTS_CAMPAIGN_PROGRESS_PATH")
	var fixture := "user://campaign-hub-test-%d.cfg" % OS.get_process_id()
	OS.set_environment("RTS_CAMPAIGN_PROGRESS_PATH", fixture)
	if FileAccess.file_exists(fixture):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(fixture))

	var title_packed := load("res://scenes/RTSStart.tscn") as PackedScene
	var title: Control = title_packed.instantiate()
	title._bypassing = false
	root.add_child(title)
	title._build_main_page()
	title._build_scenario_page()
	title._build_campaign_page()
	await process_frame

	# 1. Enter Flagship Campaign Hub -> lands on Command Bridge
	var state: Dictionary = title.apply_ui_state({"page": "campaign"})
	_check(state.page == "campaign", "Campaign page opens from title")
	_check(state.campaign_room == "bridge", "Campaign hub opens on the Flagship Bridge")
	_check(state.campaign_console == "", "No modal console blocks the Bridge initially")
	_check(state.campaign_credits == HubData.INITIAL_CREDITS, "Initial Meridian Charter credits match")
	_check(state.campaign_unlocked[0] == true and state.campaign_unlocked[1] == false, "Only Mission 01 starts unlocked on a fresh save")

	# 2. First-visit room cutscenes trigger automatically & skip cleanly on Escape
	var esc_event := InputEventKey.new()
	esc_event.pressed = true
	esc_event.keycode = KEY_ESCAPE

	state = title.apply_ui_state({"hub_room": "armory"})
	_check(state.campaign_room == "armory" and state.campaign_cutscene_playing and state.campaign_cutscene_id == "armory_intro",
		"First visit to Armory triggers Bay 07 cutscene")
	title._unhandled_key_input(esc_event)
	state = title.ui_state()
	_check(state.page == "campaign" and state.campaign_room == "armory" and not state.campaign_cutscene_playing,
		"Escape skips room cutscene without leaving the Armory")

	# Second visit does not re-trigger automatically
	title.apply_ui_state({"hub_room": "bridge"})
	state = title.apply_ui_state({"hub_room": "armory"})
	_check(not state.campaign_cutscene_playing, "Re-entering Armory does not replay seen intro automatically")

	for pair in [["cantina", "cantina_intro"], ["laboratory", "lab_intro"]]:
		state = title.apply_ui_state({"hub_room": pair[0]})
		_check(state.campaign_cutscene_id == pair[1], "First visit triggers " + pair[1])
		title.apply_ui_state({"skip_cutscene": true})
	title.apply_ui_state({"hub_room": "bridge"})

	# 3. Action-triggered Hub cutscenes (FRN Live Broadcast, Corporal Rook, Captain Vale, Prologue, Cinema Archive)
	for c_id in ["frn_broadcast", "cantina_rook", "bridge_vale", "hub_prologue", "tech_unlock", "merc_arrival", "lab_breakthrough"]:
		state = title.apply_ui_state({"play_cutscene": c_id})
		_check(state.campaign_cutscene_playing and state.campaign_cutscene_id == c_id, "Action cutscene starts: " + c_id)
		state = title.apply_ui_state({"skip_cutscene": true})
		_check(not state.campaign_cutscene_playing, "Action cutscene skips cleanly: " + c_id)

	state = title.apply_ui_state({"hub_console": "cutscenes"})
	_check(state.campaign_console == "cutscenes", "Cinema Archive console opens")
	title._unhandled_key_input(esc_event)

	# 4. Every mission (01..11) has a valid 3-shot Pre-Mission Movie & opening cue
	for idx in Campaign.MISSIONS.size():
		var spec := CutsceneData.mission_intro_movie(idx)
		var shots: Array = spec.get("shots", [])
		_check(shots.size() == 3 and CutsceneData.is_opening_cue(str(spec.voice_cue)),
			"Mission %02d has a 3-shot pre-mission movie and valid voice cue" % (idx + 1))

	# 5. Mission Select Console & Escape hierarchy
	state = title.apply_ui_state({"hub_console": "mission_select"})
	_check(state.campaign_console == "mission_select", "Mission Select CRT console opens")
	title._unhandled_key_input(esc_event)
	state = title.ui_state()
	_check(state.page == "campaign" and state.campaign_console == "", "First Escape closes Mission Select back to Bridge")
	title._unhandled_key_input(esc_event)
	state = title.ui_state()
	_check(state.page == "main", "Second Escape from Bridge returns to main title screen")

	# 6. Armory Tech Purchase, Mercenaries, Milestone Cutscenes & Laboratory Research
	title.apply_ui_state({"page": "campaign", "hub_room": "armory", "hub_console": "armory", "hub_category": "infantry", "hub_unit": "rifleman"})
	var before_credits := HubData.credits_available()
	_check(bool(HubData.purchase_tech("rifle_shield").get("ok", false)), "Purchases Rifleman Ballistic Riot Shield")
	_check(HubData.credits_available() == before_credits - 45000, "Deducts 45,000 credits accurately")
	_check(bool(HubData.hire_mercenary("merc_ashhounds").get("ok", false)), "Charters Ashfall Hellhounds mercenary company")
	_check(Campaign.save_completion(0, 2, 2) == OK, "Saves Mission 01 completion and research samples")
	_check(CutsceneData.pending_milestone_cutscene() == "arc_1_vesper", "Completing Mission 01 queues Act I milestone cutscene")
	title._campaign.check_milestone_cutscene()
	_check(title.ui_state().campaign_cutscene_id == "arc_1_vesper", "Milestone cutscene plays upon returning to Flagship Hub")
	title.apply_ui_state({"skip_cutscene": true})
	_check(CutsceneData.pending_milestone_cutscene() == "", "Seen milestone cutscene does not repeat")
	_check(bool(HubData.select_lab_perk("brood", 0, "brood_t1_bunker").get("ok", false)), "Unlocks Tier 1 Brood adaptation")

	title.queue_free()
	if FileAccess.file_exists(fixture):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(fixture))
	OS.set_environment("RTS_CAMPAIGN_PROGRESS_PATH", old_path)

	print("Campaign Hub: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)
