extends SceneTree

const Campaign = preload("res://scripts/engine/RTSCampaign.gd")
const HubData = preload("res://scripts/engine/RTSCampaignHubData.gd")

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
	# Simulate interactive title launch even under headless test runner
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

	# 2. Switch across all 4 Flagship Rooms
	for room in ["armory", "cantina", "laboratory", "bridge"]:
		state = title.apply_ui_state({"hub_room": room})
		_check(state.campaign_room == room, "Switches cleanly to room: " + room)

	# 3. Mission Select Console & Escape hierarchy
	state = title.apply_ui_state({"hub_console": "mission_select"})
	_check(state.campaign_console == "mission_select", "Mission Select CRT console opens")
	var esc_event := InputEventKey.new()
	esc_event.pressed = true
	esc_event.keycode = KEY_ESCAPE
	title._unhandled_key_input(esc_event)
	state = title.ui_state()
	_check(state.page == "campaign" and state.campaign_console == "", "First Escape closes Mission Select back to Bridge")
	title._unhandled_key_input(esc_event)
	state = title.ui_state()
	_check(state.page == "main", "Second Escape from Bridge returns to main title screen")

	# 4. Armory Tech Purchase persistence & credit accounting
	title.apply_ui_state({"page": "campaign", "hub_room": "armory", "hub_console": "armory", "hub_category": "infantry", "hub_unit": "rifleman"})
	var before_credits := HubData.credits_available()
	var buy_res := HubData.purchase_tech("rifle_shield")
	_check(bool(buy_res.get("ok", false)), "Purchases Rifleman Ballistic Riot Shield")
	_check(HubData.credits_available() == before_credits - 45000, "Deducts 45,000 credits accurately")
	_check(not bool(HubData.purchase_tech("rifle_shield").get("ok", true)), "Rejects duplicate upgrade purchase")
	_check("rifle_shield" in HubData.purchased_techs(), "Persists purchased upgrade in campaign config")

	# 5. Cantina Mercenary Contract hiring
	var merc_res := HubData.hire_mercenary("merc_ashhounds")
	_check(bool(merc_res.get("ok", false)), "Charters Ashfall Hellhounds mercenary company")
	_check("merc_ashhounds" in HubData.hired_mercenaries(), "Persists chartered mercenary squad")
	_check(HubData.credits_available() == before_credits - 45000 - 35000, "Tracks cumulative Armory + Cantina spend")

	# 6. Mission completion credit & Laboratory Research unlock
	_check(Campaign.save_completion(0, 2, 2) == OK, "Saves Mission 01 completion and research samples")
	_check(HubData.credits_available() == before_credits - 80000 + 45000, "Completed mission adds its credit reward")
	var lab_ok := HubData.select_lab_perk("brood", 0, "brood_t1_bunker")
	_check(bool(lab_ok.get("ok", false)), "Unlocks Tier 1 Brood adaptation with 2 samples")
	var lab_locked := HubData.select_lab_perk("brood", 4, "brood_t5_nova")
	_check(not bool(lab_locked.get("ok", true)), "Blocks Tier 5 adaptation when samples are insufficient")

	title.queue_free()
	if FileAccess.file_exists(fixture):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(fixture))
	OS.set_environment("RTS_CAMPAIGN_PROGRESS_PATH", old_path)

	print("Campaign Hub: ", "passed" if failures.is_empty() else failures)
	quit(0 if failures.is_empty() else 1)
