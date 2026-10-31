extends SceneTree

# Expectations are literal gameplay contracts, independent of the implementation.
const COVERED_ABILITIES = ["repair"]
var sim: Node
var main: Node
var worker: Dictionary
var target: Dictionary
var failures: Array = []
var checks := 0

func _initialize() -> void:
	call_deferred("_run")

func check(condition: bool, message: String, observed: Variant = null) -> void:
	checks += 1
	if not condition: failures.append({"expected":message,"observed":observed})

func near(actual: float, expected: float, message: String) -> void:
	check(absf(actual-expected)<0.00001,message,{"actual":actual,"expected":expected})

func fixture(kind: String = "howitzer", hp: float = 35.0, crystal: int = 100, aether: int = 100) -> void:
	sim.reset_state(42,128,96)
	sim.match_state={"mode":"repair_contract"}
	root.get_node("RTSCommanderAI").configure_from_scenario([])
	sim.players[1].crystal=crystal
	sim.players[1].aether=aether
	worker=sim.spawn_unit("pioneer",1,Vector2(36.5,40))
	target=sim.spawn_unit(kind,1,Vector2(40,40))
	target.hp=hp
	sim.issue_command([target.tag],"hold_position")
	sim.battle_stats.begin(sim.units,sim.tick)

func repair(queue: bool = false) -> Dictionary:
	return sim.issue_command([worker.tag],"repair",target.pos,target.tag,"",queue)

func money(crystal: int, aether: int, message: String) -> void:
	check(sim.players[1].crystal==crystal and sim.players[1].aether==aether,message,[sim.players[1].crystal,sim.players[1].aether])

func _run() -> void:
	await process_frame
	sim=root.get_node("SimEngine")
	main=load("res://scripts/RTSMain.gd").new()
	root.add_child(main)
	_rates_and_costs()
	_resource_limits()
	_shared_accounting()
	_eligibility()
	_movement_and_queues()
	_input_and_feedback()
	_telemetry_and_audio()
	print(JSON.stringify({"suite":"pioneer_repair","checks":checks,"failures":failures}))
	main.queue_free()
	quit(0 if failures.is_empty() else 1)

func _rates_and_costs() -> void:
	fixture()
	check(repair().accepted==1,"Pioneer accepts damaged friendly mechanical target")
	money(100,100,"Accepting repair spends nothing before work")
	sim.step_ticks(64)
	near(target.hp,40.46875,"Howitzer gains exactly 175/32 HP in one second")
	money(98,99,"First second costs ceil(1.171875) crystal and ceil(0.9765625) aether")
	sim.step_ticks(1575) # 25.609375 seconds total, first tick after completion.
	near(target.hp,175,"140 missing HP is fully repaired within one tick of 25.6 seconds")
	money(70,75,"140 HP costs exactly 30 crystal and 25 aether")
	check(worker.orders.is_empty(),"Completed repair clears its order")
	sim.step_ticks(640)
	near(target.hp,175,"Full target cannot be overhealed")
	money(70,75,"No charge after completion")
	fixture("silo",200,100,0)
	repair()
	sim.step_ticks(5*64)
	near(target.hp,200.0+2000.0/21.0,"Silo repairs at 400/21 HP per second")
	money(94,0,"Five seconds of Silo repair costs six crystal and no aether")
	sim.step_ticks(352)
	near(target.hp,400,"Half-health Silo completes at 10.5 seconds")
	money(87,0,"Half a Silo costs ceil(12.5)=13 crystal")
	fixture("silo",1,100,0)
	repair()
	sim.step_ticks(21*64)
	near(target.hp,400,"Almost destroyed building restores 399 HP")
	money(75,0,"399 Silo HP costs 25 crystal with no gas requirement")
	fixture("howitzer_emplaced",1)
	repair()
	sim.step_ticks(32*64)
	near(target.hp,175,"Emplaced mechanical unit is repairable")
	money(62,68,"174 Howitzer HP costs 38 crystal and 32 aether")

func _resource_limits() -> void:
	fixture("howitzer",35,0,0)
	check(repair().accepted==1,"Unaffordable repair remains a resumable order")
	sim.step_ticks(128)
	near(target.hp,35,"No free healing when both resources are empty")
	check(worker.get("repair_state")=="resources" and worker.orders.size()==1,"Insufficient funds pauses without discarding order")
	money(0,0,"No negative balances")
	sim.players[1].crystal=100
	sim.step_ticks(64)
	near(target.hp,35,"Missing aether blocks a gas-priced repair atomically")
	money(100,0,"Missing gas does not spend crystal")
	sim.players[1].aether=100
	sim.step_ticks(64)
	near(target.hp,40.46875,"Funds arriving resume the existing order automatically")
	money(98,99,"Resumed healing pays the exact first-second price")
	fixture("howitzer",35,3,100)
	repair()
	sim.step_ticks(5*64)
	near(target.hp,49,"Three crystal permit exactly fourteen Howitzer HP")
	money(0,97,"Crystal-limited repair charges three crystal and three aether")
	check(worker.get("repair_state")=="resources","Crystal exhaustion displays paused state")
	sim.step_ticks(640)
	near(target.hp,49,"Paused repair does not leak additional HP")
	money(0,97,"Paused repair does not leak aether")
	sim.players[1].crystal=27
	sim.step_ticks(26*64)
	near(target.hp,175,"Refilled repair completes remaining HP")
	money(0,75,"Pause/resume retains cumulative price, total 30 crystal and 25 gas")
	fixture("howitzer",35,100,1)
	repair()
	sim.step_ticks(128)
	near(target.hp,40.6,"One aether permits exactly 5.6 Howitzer HP")
	money(98,0,"Gas-limited repair spends only two crystal and one aether")

func _shared_accounting() -> void:
	fixture()
	var other: Dictionary=sim.spawn_unit("pioneer",1,Vector2(40,36.5))
	check(sim.issue_command([worker.tag,other.tag],"repair",target.pos,target.tag).accepted==2,"Two Pioneers can repair the same target")
	sim.step_ticks(64)
	near(target.hp,45.9375,"Two repairers double healing speed")
	money(97,98,"Two workers share rounding: three crystal, two aether")
	sim.step_ticks(13*64)
	near(target.hp,175,"Parallel repair clamps the last worker to remaining HP")
	money(70,75,"Parallel repair has the same full cost as one worker")
	var sum_hp: float=sim.battle_stats.records[worker.tag].hp_repaired+sim.battle_stats.records[other.tag].hp_repaired
	near(sum_hp,140,"Parallel workers report their actual contribution without double counting")
	near(sim.battle_stats.records[worker.tag].repair_crystal_spent+sim.battle_stats.records[other.tag].repair_crystal_spent,30,"Parallel worker spending adds to actual crystal debit")
	fixture()
	for _tick in range(64):
		sim.issue_command([worker.tag],"stop")
		repair()
		sim.step_ticks(1)
	near(target.hp,40.46875,"Repeated Stop/requeue preserves healing rate")
	money(98,99,"Repeated Stop/requeue cannot multiply rounding charges")
	fixture("howitzer",174)
	repair()
	sim.step_ticks(64)
	money(99,99,"A one-HP repair rounds up once")
	target.hp=174
	repair()
	sim.step_ticks(64)
	money(99,99,"Later damage reuses paid fractional credit on the same target")
	near(target.get("repair_hp_total",0),2,"Cumulative accounting survives completed repairs")
	fixture()
	repair()
	sim.step_ticks(64)
	sim.issue_command([target.tag],"emplace")
	sim.step_ticks(25*64)
	near(target.hp,175,"Repair follows the same tag through an artillery mode switch")
	money(70,75,"Mode switch preserves repair ledger and total price")

func _eligibility() -> void:
	for kind in ["rifleman","brood_nest"]:
		fixture(kind,10)
		sim.issue_command([worker.tag],"move",Vector2(20,40))
		check(repair().accepted==0,"Biological target rejected: "+kind)
		check(worker.orders.size()==1 and worker.orders[0].type=="move","Invalid repair preserves previous move: "+kind)
		money(100,100,"Invalid target costs nothing")
	for kind in ["forager","mote","rifleman"]:
		fixture()
		var other: Dictionary=sim.spawn_unit(kind,1,Vector2(40,36.5))
		check(sim.issue_command([other.tag],"repair",target.pos,target.tag).accepted==0,"Only a Pioneer can repair: "+kind)
	fixture()
	for invalid in ["enemy","dead","unfinished","full"]:
		target.owner=2 if invalid=="enemy" else 1
		target.hp=0 if invalid=="dead" else (175 if invalid=="full" else 35)
		target.build_progress=0.5 if invalid=="unfinished" else 1.0
		check(repair().accepted==0,"Reject "+invalid+" target")
	worker.hp=10
	check(sim.issue_command([worker.tag],"repair",worker.pos,worker.tag).accepted==0,"Pioneer cannot repair itself")
	fixture("pioneer",10)
	worker.pos=Vector2(37.8,40)
	check(repair().accepted==1,"Pioneer can repair another friendly Pioneer")
	sim.step_ticks(64)
	near(target.hp,13.75,"Pioneer target repairs at 45/12 HP per second")
	fixture()
	worker.hp=0
	check(repair().accepted==0,"Dead Pioneer cannot start repair")
	fixture("muster_hall",100)
	target.build_progress=0.5
	main._select_tags([worker.tag])
	main._issue_smart_right_click(target.pos,false,target)
	check(worker.orders[0].type=="build","Unfinished building right-click resumes construction instead of repair")
	var before: Array=worker.orders.duplicate(true)
	var damaged: Dictionary=sim.spawn_unit("howitzer",1,Vector2(50,40))
	damaged.hp=35
	check(sim.issue_command([worker.tag],"repair",damaged.pos,damaged.tag).accepted==0 and worker.orders==before,"Active builder requires Halt before replacing work with repair")

func _movement_and_queues() -> void:
	fixture()
	worker.pos=Vector2(20,40)
	repair()
	sim.step_ticks(64)
	near(target.hp,35,"Out-of-range Pioneer must approach before healing")
	money(100,100,"Moving into repair range is free")
	check(worker.pos.x>20 and worker.get("repair_state")=="moving","Repair order paths toward its target")
	sim.step_ticks(32*64)
	near(target.hp,175,"Distant Pioneer reaches target and completes repair within 33 seconds")
	money(70,75,"Travel time does not change total repair cost")
	fixture()
	repair()
	sim.issue_command([target.tag],"move",Vector2(60,40))
	sim.step_ticks(64)
	check(worker.pos.x>36.5 and target.hp<40.46875,"Pioneer follows a moving mechanical target and pauses work while out of range")
	sim.step_ticks(32*64)
	near(target.hp,175,"Pioneer catches up and repairs after moving target stops")
	money(70,75,"Following a moving target preserves total price")
	fixture("silo",200)
	worker.pos=Vector2(20,40)
	repair()
	sim.step_ticks(20*64)
	near(target.hp,400,"Approach reaches building edge without trying to enter footprint")
	money(87,100,"Structure approach preserves expected cost")
	fixture("howitzer",170)
	sim.issue_command([worker.tag],"move",Vector2(32,40))
	repair(true)
	sim.issue_command([worker.tag],"move",Vector2(40,55),0,"",true)
	check(worker.orders.map(func(o):return o.type)==["move","repair","move"],"Shift preserves move, repair, then move order")
	var healed_before_followup := true
	for _tick in range(12*64):
		sim.step_ticks(1)
		if worker.pos.y>41 and target.hp<175: healed_before_followup=false
	check(healed_before_followup and worker.pos.distance_to(Vector2(40,55))<3,"Queued follow-up starts after repair finishes")
	near(target.hp,175,"Queued repair really heals target")
	money(98,99,"Queued five-HP repair pays two crystal and one aether")
	for invalid in ["removed","dead","enemy","full"]:
		fixture()
		repair()
		sim.issue_command([worker.tag],"move",Vector2(30,40),0,"",true)
		match invalid:
			"removed": sim.units.erase(target.tag)
			"dead": target.hp=0
			"enemy": target.owner=2
			"full": target.hp=175
		sim.step_ticks(1)
		check(worker.orders.size()==1 and worker.orders[0].type=="move","Invalidated repair skips to follow-up: "+invalid)
		money(100,100,"Invalidated target never charged: "+invalid)
	fixture()
	worker.cargo_type="crystal"
	worker.cargo_amount=5
	repair()
	sim.step_ticks(64)
	sim.issue_command([worker.tag],"stop")
	sim.step_ticks(64)
	near(target.hp,40.46875,"Halt immediately stops repair healing")
	money(98,99,"Halt immediately stops repair charges")
	check(worker.cargo_amount==5 and worker.orders.is_empty(),"Repair and Halt preserve carried cargo")
	fixture("silo",200)
	var enemy: Dictionary=sim.spawn_unit("pioneer",2,Vector2(35,40))
	sim.issue_command([enemy.tag],"hold_position")
	sim.issue_command([worker.tag],"attack_target",enemy.pos,enemy.tag)
	sim.step_ticks(1)
	check(worker.attack_state=="windup","Interruption fixture starts an actual melee wind-up")
	repair()
	check(worker.attack_state=="idle","Immediate repair interrupts current attack wind-up")
	sim.step_ticks(64)
	near(enemy.hp,45,"Interrupted attack cannot finish while Pioneer repairs")
	near(sim.battle_stats.records[worker.tag].windup_cancels,1,"Repair interruption is counted once in combat telemetry")

func _input_and_feedback() -> void:
	fixture()
	main._select_tags([worker.tag])
	main._issue_smart_right_click(target.pos,false,target)
	check(worker.orders.size()==1 and worker.orders[0].type=="repair","Smart right-click issues repair on damaged friendly mechanical unit")
	check(main.command_feedback.kind=="repair" and main.command_feedback.accepted==1,"Accepted repair has positive target feedback")
	check(main.get_card_buttons().any(func(b):return b.ability_id=="repair" and b.def.hotkey=="E"),"Pioneer command card exposes Repair (E)")
	sim.issue_command([worker.tag],"stop")
	var key := InputEventKey.new()
	key.keycode=KEY_E
	key.pressed=true
	main._handle_hotkey(key)
	check(main.pending_ability=="repair","E enters targeted repair mode")
	main._execute_pending_ability_at(target.pos,true,target)
	check(worker.orders[0].type=="repair" and main.command_feedback.queued,"Targeted E repair supports Shift")
	fixture("aether_tap",250)
	var vent: Dictionary=sim.spawn_resource("aether_vent",target.pos,2250)
	main._select_tags([worker.tag])
	main._issue_smart_right_click(target.pos,false,target)
	check(worker.orders[0].type=="repair","Damaged tap right-click repairs rather than gathering underlying gas")
	sim.issue_command([worker.tag],"stop")
	target.hp=500
	main._issue_smart_right_click(target.pos,false,target)
	check(worker.orders[0].type=="harvest","Full-health tap right-click still gathers gas")
	sim.issue_command([worker.tag],"stop")
	target.build_progress=0.5
	main._issue_smart_right_click(target.pos,false,target)
	check(worker.orders[0].type=="build","Unfinished tap right-click resumes building instead of gathering gas")
	check(sim.resources.has(vent.tag),"Repair/resume never removes the underlying vent")
	fixture()
	var rifle: Dictionary=sim.spawn_unit("rifleman",1,Vector2(30,36))
	main._select_tags([worker.tag,rifle.tag])
	main._issue_smart_right_click(target.pos,false,target)
	check(worker.orders[0].type=="repair" and rifle.orders.is_empty() and main.command_feedback.accepted==1,"Mixed selection orders only eligible Pioneers to repair")

func _telemetry_and_audio() -> void:
	fixture()
	var audio: Node=root.get_node("RTSAudio")
	audio.cooldown_enabled=false
	audio.reset_stats()
	repair()
	sim.step_ticks(26*64)
	check(int(audio.sfx_counts.get("arc_welder",0))>0,"Actual repair work drives pooled welder audio")
	check(int(audio.sfx_counts.get("melee_hit",0))==0,"Repair does not invent a combat hit sound")
	var summary: Dictionary=sim.battle_stats.finish(sim.units,sim.tick,42)
	var side: Dictionary=summary.sides["1"] if summary.sides.has("1") else summary.sides[1]
	near(side.hp_repaired,140,"Results count actual worker healing")
	near(side.hp_healed,140,"Results count target HP restored once")
	near(side.repair_crystal_spent,30,"Results report exact repair crystal spending")
	near(side.repair_aether_spent,25,"Results report exact repair gas spending")
	near(side.shots,0,"Repairs are not shots")
	near(side.hp_damage,0,"Repairs are not combat damage")
	fixture("howitzer",35,0,0)
	audio.reset_stats()
	repair()
	sim.step_ticks(128)
	check(int(audio.sfx_counts.get("arc_welder",0))==0,"Paused repairs do not play work sounds")
