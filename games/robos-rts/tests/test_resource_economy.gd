extends SceneTree

const Layout = preload("res://scripts/engine/RTSResourceLayout.gd")
var sim: Node
var checks := 0
var failures: Array = []

func _initialize() -> void: call_deferred("_run")

func check(condition: bool, message: String) -> void:
	checks+=1
	if not condition: failures.append(message)

func _fixture() -> void:
	sim.reset_state(42,128,112)
	sim.match_state={"mode":"economy_contract"}
	sim.players[1].crystal=0
	sim.players[1].aether=0
	root.get_node("RTSCommanderAI").configure_from_scenario([])
	sim.spawn_unit("colony_hub",1,Vector2(40,56))

func _geometry() -> void:
	for facing in [Vector2.LEFT,Vector2.RIGHT,Vector2.UP,Vector2.DOWN]:
		var base := Vector2(40,56)
		var pocket := Layout.crescent(base,facing,"test")
		check(pocket.size()==10,"A standard pocket has eight crystal fields and two vents")
		var angles: Array = []
		for i in range(8):
			var r: Dictionary=pocket[i]
			var offset := Vector2(r.x,r.y)-base
			check(absf(offset.length()-(12.3 if i%2==0 else 14.3))<0.002,"Close/far radii alternate with a 2-unit separation")
			check(r.amount==(900 if i%2==0 else 1800),"Small/large capacities alternate independently of depletion")
			angles.append(rad_to_deg(facing.angle_to(offset)))
			for j in range(i):
				check(Vector2(pocket[j].x,pocket[j].y).distance_to(Vector2(r.x,r.y))>3.6,"Crystal meshes never overlap")
		check(absf(angles[0]+63)<0.01 and absf(angles[7]-63)<0.01,"The inward-facing crescent spans 126 degrees")
		for i in range(1,8): check(angles[i]>angles[i-1],"Patch angles advance around the crescent rather than forming a straight row")
		var first := Vector2(pocket[8].x,pocket[8].y)-base
		var second := Vector2(pocket[9].x,pocket[9].y)-base
		check((first+second).length()<0.001 and absf(first.dot(facing))<0.001,"Vents occupy symmetric cardinal flanks")
		for r in pocket.slice(8):
			var vent := Vector2(r.x,r.y)-base
			for patch in pocket.slice(0,8):
				var endpoint := Vector2(patch.x,patch.y)-base
				var nearest := Geometry2D.get_closest_point_to_segment(vent,Vector2.ZERO,endpoint)
				check(vent.distance_to(nearest)>3.5,"A vent never blocks the direct crystal return lane")
	sim.load_scenario_file("frontier-hunters")
	var source: Dictionary=JSON.parse_string(FileAccess.get_file_as_string("res://scenarios/frontier-hunters.jsonld"))
	var doc=load("res://scripts/editor/RTSMapDocument.gd").new()
	doc.load_scenario(source)
	check(sim.resources.size()==170 and doc.data.resources.size()==170,"Every starting and expansion site has a complete pocket")
	for worker in sim.units.values():
		if worker.is_worker:
			var slot: int=sim.match_state.assigned_starts[str(worker.owner)]
			check(sim.resources[worker.orders[0].target_tag].site_id=="start_%d" % slot,"Starting workers choose their owned hub's line rather than a neighboring expansion")
	var all_resources: Array=sim.resources.values()
	for i in range(all_resources.size()):
		for j in range(i):
			var a: Dictionary=all_resources[i]
			var b: Dictionary=all_resources[j]
			check(a.pos.distance_to(b.pos)>float(a.radius)+float(b.radius),"Resource pockets never overlap: %s / %s" % [a.id,b.id])
	for r in doc.data.resources:
		var found: Array=sim.resources.values().filter(func(actual):return actual.id==r.id)
		check(found.size()==1 and found[0].pos.distance_to(Vector2(r.x,r.y))<0.001 and found[0].amount==r.amount,"Editor and runtime share identical resource geometry and capacities")
		if not found.is_empty(): check(not sim.is_water_at(found[0].pos,found[0].radius),"No crescent resource overlaps water")
	var exported: Dictionary=doc.to_scenario()
	exported.resources[0]["rich"]=true
	doc.load_scenario(exported)
	var round_trip: Dictionary=doc.to_scenario()
	check(round_trip.resources[0].rich and round_trip.resources[0].site_id==exported.resources[0].site_id,"Editor round-trips preserve high-yield and resource-pocket metadata")
	sim.load_scenario_file("campaign-first-strike")
	check(sim.resources.size()==10,"Campaign also uses the standard eight-plus-two layout")
	var standard := Layout.crescent(Vector2(28,56),Vector2.LEFT,"base")
	for i in range(10):
		var r: Dictionary=sim.resources[1001+i]
		check(r.pos.distance_to(Vector2(standard[i].x,standard[i].y))<0.001 and r.amount==standard[i].amount,"Campaign's authored pocket matches the shared template")

func _trial(count: int, gas: bool) -> int:
	_fixture()
	var source=sim.spawn_resource("aether_vent" if gas else "crystal_field",Vector2(53,56),10000)
	if gas: sim.spawn_unit("aether_tap",1,source.pos)
	for i in range(count):
		var worker=sim.spawn_unit("pioneer",1,Vector2(46,52+i*2))
		sim.issue_command([worker.tag],"harvest",source.pos,source.tag)
	sim.step_ticks(10*64)
	var before: int=sim.players[1].aether_collected if gas else sim.players[1].crystal_collected
	sim.step_ticks(40*64)
	var income: int=(sim.players[1].aether_collected if gas else sim.players[1].crystal_collected)-before
	var cargo := 0
	for u in sim.units.values(): cargo+=int(u.cargo_amount)
	check(10000-source.amount==sim.players[1].aether_collected+sim.players[1].crystal_collected+cargo,"Saturation conserves every delivered and carried resource")
	return income

func _assignment_and_yield() -> void:
	_fixture()
	var patches: Array = []
	for r in Layout.crescent(Vector2(40,56),Vector2.LEFT,"base").slice(0,8):
		patches.append(sim.spawn_resource("crystal_field",Vector2(r.x,r.y),r.amount))
	for i in range(16):
		var worker=sim.spawn_unit("pioneer",1,Vector2(33+(i%4)*2,50+(i/4)*2))
		sim.issue_command([worker.tag],"harvest",patches[0].pos,patches[0].tag)
	var counts: Dictionary = {}
	for u in sim.units.values():
		if u.is_worker: counts[u.orders[0].target_tag]=int(counts.get(u.orders[0].target_tag,0))+1
	check(counts.size()==8 and counts.values().all(func(n):return n==2),"A group right-click distributes sixteen workers as two per patch")
	var neighbor=sim.spawn_resource("crystal_field",patches[0].pos+Vector2(-4,0),900,"neighbor",false,"other_base")
	for r in patches: r.site_id="home"
	var extra=sim.spawn_unit("pioneer",1,Vector2(33,56))
	sim.issue_command([extra.tag],"harvest",patches[0].pos,patches[0].tag)
	check(extra.orders[0].target_tag!=neighbor.tag,"Balancing keeps workers in the clicked base's resource pocket")
	_fixture()
	var gold=sim.spawn_resource("crystal_field",Vector2(51,56),14,"gold",true)
	var worker=sim.spawn_unit("pioneer",1,Vector2(46,56))
	sim.issue_command([worker.tag],"harvest",gold.pos,gold.tag)
	sim.step_ticks(10*64)
	check(gold.yield_per_trip==7 and sim.players[1].crystal_collected==14 and gold.amount==0,"Gold yields seven per trip and stops after exactly fourteen total")
	_fixture()
	var empty=sim.spawn_resource("aether_vent",Vector2(53,56),0)
	sim.spawn_unit("aether_tap",1,empty.pos)
	worker=sim.spawn_unit("pioneer",1,Vector2(46,56))
	sim.step_ticks(1)
	check(sim.issue_command([worker.tag],"harvest",empty.pos,empty.tag).accepted==0,"Depleted vents reject gathering rather than paying legacy depleted-gas income")
	sim.step_ticks(10*64)
	check(sim.players[1].aether_collected==0,"Depleted vents never mint gas")

func _run() -> void:
	await process_frame
	sim=root.get_node("SimEngine")
	_geometry()
	_assignment_and_yield()
	var mineral: Array = []
	var gas: Array = []
	for n in range(1,5):
		mineral.append(_trial(n,false))
		gas.append(_trial(n,true))
	check(mineral[1]>=mineral[0]+5,"A second crystal worker increases delivered income")
	check(mineral[2]<=mineral[1]*1.2+5,"A third crystal worker has diminishing returns")
	check(mineral[3]<=mineral[2]+5,"A fourth crystal worker cannot beat the three-worker capacity")
	check(gas[2]>=gas[1]*1.1,"The third gas worker contributes meaningful income")
	check(gas[3]<=gas[2]+4,"The fourth gas worker adds no more than one timing-boundary cargo")
	print(JSON.stringify({"suite":"resource_economy","checks":checks,"crystal_40_seconds":mineral,"aether_40_seconds":gas,"failures":failures}))
	quit(0 if failures.is_empty() else 1)
