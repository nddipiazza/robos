extends SceneTree

const Campaign = preload("res://scripts/engine/RTSCampaign.gd")
const HubData = preload("res://scripts/engine/RTSCampaignHubData.gd")
const HubState = preload("res://scripts/campaign/RTSHubState.gd")
const CutsceneData = preload("res://scripts/campaign/RTSCutsceneData.gd")

var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func _check(condition: bool, message: String) -> void:
	if not condition:
		failures.append(message)
		printerr("HUB_PROG_FAIL: ", message)

func _idx_of(mission_id: String) -> int:
	for i in Campaign.MISSIONS.size():
		if str(Campaign.MISSIONS[i].id) == mission_id:
			return i
	return -1

func _hotspot_titles(layer: Control) -> Array[String]:
	var out: Array[String] = []
	for c in layer.get_children():
		if "callout_title" in c:
			out.append(str(c.get("callout_title")))
	return out

func _run() -> void:
	await process_frame
	var old_path := OS.get_environment("RTS_CAMPAIGN_PROGRESS_PATH")
	var fixture := "user://hub-progression-test-%d.cfg" % OS.get_process_id()
	OS.set_environment("RTS_CAMPAIGN_PROGRESS_PATH", fixture)
	if FileAccess.file_exists(fixture):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(fixture))

	var sim := root.get_node("SimEngine")
	sim.startup_complete = true
	var title: Control = load("res://scenes/RTSStart.tscn").instantiate()
	root.add_child(title)
	if title.get("_campaign") == null and title.has_method("_build_campaign_page"):
		title.call("_build_main_page")
		title.call("_build_scenario_page")
		title.call("_build_campaign_page")
	await process_frame
	var hub: Control = title._campaign

	# --- STAGE 1: VESPER OUTPOST SALOON (Missions 1-3 before Hold for Dawn) ---
	hub.open_hub()
	var snap := HubState.snapshot()
	_check(snap.macro_location == "vesper_saloon" and int(snap.stage_num) == 1 and int(snap.saloon_substage) == 0,
		"Fresh save opens Stage 1 Vesper Outpost Saloon (substage 0)")
	_check(hub.current_room == "cantina" and not hub._bar_housing.visible,
		"Stage 1 Saloon is a single room with starship nav bar hidden")
	_check("Corporal Rook" not in _hotspot_titles(hub._rooms["cantina"]),
		"Corporal Rook has not yet arrived before Cut the Signal")

	Campaign.save_completion(_idx_of("campaign-cut-the-signal"))
	hub.refresh_hub_state()
	snap = HubState.snapshot()
	_check(int(snap.saloon_substage) == 1 and "Corporal Rook" in _hotspot_titles(hub._rooms["cantina"]),
		"Completing Cut the Signal spawns Corporal Rook in Vesper Saloon")

	Campaign.save_completion(_idx_of("campaign-white-ridge"))
	hub.refresh_hub_state()
	snap = HubState.snapshot()
	_check(int(snap.saloon_substage) == 2 and int(snap.relic_pieces) == 1,
		"Completing White Ridge spawns 1st Relic Shard crate in Saloon")

	# --- STAGE 2: BOARDING MSV STARFALL (Post-Hold for Dawn, 0 bonus research) ---
	Campaign.save_completion(_idx_of("campaign-hold-for-dawn"), 0, 0)
	hub.open_hub()
	snap = HubState.snapshot()
	var camp_obj: Object = Campaign
	var expected_post_dawn_stage := 2 if camp_obj.has_method("profile") else 4
	_check(snap.macro_location == "starfall_ship" and int(snap.stage_num) == expected_post_dawn_stage,
		"Completing Hold for Dawn transitions macro hub to MSV Starfall")
	_check(hub.current_room == "bridge" and hub._bar_housing.visible,
		"Flagship Bridge opens with 4-compartment navigation bar visible")
	_check(not hub._nav_buttons["armory"].disabled, "Bay 07 Armory unlocks after Hold for Dawn")
	if camp_obj.has_method("profile"):
		_check(hub._nav_buttons["laboratory"].disabled, "Lab 01 stays gated at 3 missions when 0 research recovered")
	var unlocked_units_early := 0
	for u in snap.armory_units:
		if bool(u.unlocked):
			unlocked_units_early += 1
	_check(unlocked_units_early == 0, "Bay 07 Armory starts sparse with 0 mid/late unit floor spawns")

	# --- STAGE 4: XENO-RESEARCH, DR. LIRA & DYNAMIC BRIDGE ORBIT ---
	Campaign.save_completion(_idx_of("campaign-last-road"), 3, 0)
	hub.refresh_hub_state()
	snap = HubState.snapshot()
	_check(int(snap.stage_num) == 4 and not hub._nav_buttons["laboratory"].disabled,
		"Recovering Brood samples unlocks Lab 01 (Stage 4)")
	_check(str(snap.orbit_key) == "spores" and bool(snap.lira_present),
		"Last Road binds Bridge viewport to spore-cloud orbit and spawns Dr. Lira in Lab")
	_check("Dr. Lira" in _hotspot_titles(hub._rooms["laboratory"]),
		"Dr. Lira hotspot appears in Lab 01 during Colonist arc")

	Campaign.save_completion(_idx_of("campaign-redstone-claim"), 3, 0)
	hub.refresh_hub_state()
	snap = HubState.snapshot()
	_check(str(snap.orbit_key) == "magma" and bool(snap.voss_in_cantina),
		"Redstone Claim binds Bridge viewport to superheated magma orbit and spawns Agent Voss in Cantina")
	_check("Torchguard" in _hotspot_titles(hub._rooms["armory"]) and "Ridge Scout" in _hotspot_titles(hub._rooms["armory"]),
		"Unlocked infantry units dynamically spawn interactive hotspots in Bay 07 Armory")

	# --- STAGE 5..7 (Full 29-Mission Arc Checks when available) ---
	var vault_idx := _idx_of("campaign-vaultbreaker")
	if vault_idx >= 0:
		Campaign.save_completion(_idx_of("campaign-shattered-shrine"), 0, 4)
		Campaign.save_completion(_idx_of("campaign-sanctuary-skies"), 3, 0)
		Campaign.save_completion(vault_idx, 0, 3)
		hub.refresh_hub_state()
		snap = HubState.snapshot()
		_check(bool(snap.neral_crystal) and "Memory Crystal" in _hotspot_titles(hub._rooms["laboratory"]),
			"Completing Vaultbreaker spawns Seer Neral's Memory Crystal in Lab 01")
		_check(not bool(snap.lira_present) and bool(snap.trophies.sanctuary_banner),
			"Completing Sanctuary Skies resolves Dr. Lira's visit and mounts Colonist Banner on Cantina Trophy Wall")
		_check(CutsceneData.pending_milestone_cutscene() == "neral_crystal_arrival",
			"Vaultbreaker queues Neral's lights-out Memory Crystal arrival cutscene")
		hub.open_console("prophecy")
		_check(hub.active_console == "prophecy" and hub.prophecy_console.visible,
			"Clicking Memory Crystal opens Aurelian Prophecy sub-star-map console")
		hub.close_console()

	var knife_idx := _idx_of("campaign-glass-knife")
	if knife_idx >= 0:
		Campaign.save_completion(knife_idx, 0, 0)
		hub.refresh_hub_state()
		snap = HubState.snapshot()
		_check(str(snap.covert_mode) == "voss_cloak" and bool(snap.voss_knife_trophy),
			"Glass Knife spawns cloaked Voss gear in Armory and Combat Knife trophy in Cantina")

	var rift_idx := _idx_of("campaign-rift-silence")
	if rift_idx >= 0:
		Campaign.save_completion(_idx_of("campaign-broken-archive"), 0, 2)
		Campaign.save_completion(_idx_of("campaign-fireline"), 0, 2)
		Campaign.save_completion(rift_idx, 0, 2)
		hub.refresh_hub_state()
		snap = HubState.snapshot()
		_check(int(snap.stage_num) == 6 and int(snap.relic_pieces) == 5 and bool(snap.arden_comm),
			"Stage 6 assembles all 5 Relic pieces and activates Marshal Arden's Bridge Communicator")
		_check("Marshal Arden" in _hotspot_titles(hub._rooms["bridge"]),
			"Marshal Arden hololink hotspot appears on the Flagship Bridge")

	var cinder_idx := _idx_of("campaign-cinderfall")
	if cinder_idx >= 0:
		Campaign.save_completion(cinder_idx, 0, 0)
		hub.refresh_hub_state()
		snap = HubState.snapshot()
		_check(str(snap.macro_location) == "cinderfall_camp" and int(snap.stage_num) == 7,
			"Completing Cinderfall Landing switches macro hub to outdoor Cinderfall Forward Trench Camp (Stage 7)")
		_check(hub._nav_buttons["bridge"].text.begins_with("Command Tent") and hub._nav_buttons["armory"].text.begins_with("Field Depot"),
			"Stage 7 relabels bottom navigation shortcuts to outdoor trench camp stations")

		Campaign.save_completion(_idx_of("campaign-last-charge"), 0, 0)
		hub.refresh_hub_state()
		snap = HubState.snapshot()
		_check(str(snap.macro_location) == "starfall_ship" and str(snap.orbit_key) == "cinderfall_dawn",
			"Completing The Last Charge returns post-campaign archive hub to MSV Starfall over liberated Cinderfall")

	# Verify new voice WAV streams load cleanly
	var rts_audio := root.get_node("RTSAudio")
	for cue in ["neral_crystal_1", "neral_crystal_2", "arden_comm_1", "arden_comm_2", "voss_cantina_1", "lira_lab_1", "cinderfall_camp_1"]:
		var st: AudioStreamWAV = rts_audio.load_campaign_voice(cue)
		_check(st != null and st.data.size() > 4000, "New hub character voice WAV loads: " + cue)

	title.queue_free()
	await process_frame
	if FileAccess.file_exists(fixture):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(fixture))
	OS.set_environment("RTS_CAMPAIGN_PROGRESS_PATH", old_path)
	print("Hub 7-stage progression: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)
