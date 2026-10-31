from ast import literal_eval
import time
from behave import given, when, then


def owned(context, kind):
    return [u for u in context.client.get_observation()["units"] if u["owner"]==1 and u["unit_type"]==kind]


def click(context, x, y, **mods):
    context.client.mouse(x,y,pressed=True,**mods)
    context.client.mouse(x,y,pressed=False,**mods)


def play_scene(context):
    # Earlier authoring scenarios intentionally leave the map editor open.
    if "command_card" in context.client.ui().get("state",{}):
        return
    assert context.client.editor("playtest")["ok"]
    for _ in range(100):
        if "command_card" in context.client.ui().get("state",{}):
            return
        time.sleep(.02)
    raise AssertionError("The gameplay input scene did not open")


@given("the three-worker Shift construction scenario")
def fixture(context):
    play_scene(context)
    assert context.client.load_scenario_slug("shift-workers")["ok"]


@when("the workers queue three halls followed by crystal gathering")
def build_queue(context):
    workers = owned(context,"pioneer")
    context.shift_workers = [w["tag"] for w in workers]
    for w,(x,y) in zip(workers,[(40,35),(52,35),(64,35)]):
        assert context.client.command("build_muster_hall",tags=[w["tag"]],x=x,y=y,queue=True)["accepted"]==1
    assert context.client.command("harvest",tags=context.shift_workers,target_tag=1001,queue=True)["accepted"]==3
    assert all([o["type"] for o in w["orders"]]==["harvest","build","harvest"] for w in owned(context,"pioneer"))


@then("three paid halls finish within 110 seconds and all builders deliver new income")
def build_outcomes(context):
    for second in range(110):
        obs = context.client.step(64)
        if obs["players"]["1"]["structures_built"]==3: break
    assert second<109
    halls = owned(context,"muster_hall")
    assert len(halls)==3 and all(h["build_progress"]==1 for h in halls)
    p = obs["players"]["1"]
    assert 1500+p["crystal_collected"]-p["crystal"]==450
    obs = context.client.step(18*64)
    assert obs["players"]["1"]["crystal_collected"]>=p["crystal_collected"]+15
    assert all(w["orders"][0]["type"]=="harvest" for w in owned(context,"pioneer"))


@when("one worker starts a paid hall and cancels it")
def cancel(context):
    workers = owned(context,"pioneer")
    # Halt everyone to isolate the refund from unrelated harvest income.
    context.client.command("stop",tags=[w["tag"] for w in workers])
    worker = workers[0]["tag"]
    assert context.client.command("build_muster_hall",tags=[worker],x=40,y=35)["accepted"]==1
    for _ in range(15):
        context.client.step(64)
        if owned(context,"muster_hall"): break
    assert len(owned(context,"muster_hall"))==1
    context.shift_before_refund = context.client.get_observation()["players"]["1"]["crystal"]
    context.client.select(tags=[worker])
    context.client.key("N",True)
    context.client.key("N",False)
    context.shift_worker = worker


@then("the foundation is removed and exactly 112 crystal is refunded once")
def refund(context):
    assert not owned(context,"muster_hall")
    p = context.client.get_observation()["players"]["1"]
    assert p["crystal"]==context.shift_before_refund+112 and p["units_lost"]==0
    assert context.client.command("cancel_build",tags=[context.shift_worker])["accepted"]==0
    assert context.client.get_observation()["players"]["1"]["crystal"]==p["crystal"]


@given("one Rifleman with two waypoints and a final attack-move")
def waypoints(context):
    play_scene(context)
    context.client.load_scenario({"paused":True,"units":[{"type":"rifleman","owner":1,"x":20,"y":20}]})
    for i,(command,x,y) in enumerate([("move",35,20),("move",35,45),("attack_move",55,45)]):
        assert context.client.command(command,tags=[1001],x=x,y=y,queue=i>0)["accepted"]==1


@when("the queued movement runs for 15 seconds")
def movement(context):
    first = second = False
    for _ in range(120):
        u = context.client.step(8)["units"][0]
        x,y = u["pos"]["x"],u["pos"]["y"]
        first |= (x-35)**2+(y-20)**2<9
        second |= first and (x-35)**2+(y-45)**2<9
    context.shift_path_passed = first and second and (x-55)**2+(y-45)**2<9


@then("both waypoints are visited before the final destination")
def arrived(context):
    assert context.shift_path_passed


@given("a Rifleman with two queued enemy targets")
def targets(context):
    play_scene(context)
    context.client.load_scenario({"paused":True,"units":[{"type":"rifleman","owner":1,"x":40,"y":40},
        {"type":"pioneer","owner":2,"x":60,"y":40},{"type":"pioneer","owner":2,"x":80,"y":40}]})
    context.client.command("hold_position",tags=[1002,1003])
    for tag in [1002,1003]:
        assert context.client.command("attack_target",tags=[1001],target_tag=tag,queue=tag==1003)["accepted"]==1


@when("the queued attacks run for 35 seconds")
def attacks(context):
    context.shift_target_order = True
    for _ in range(280):
        units = {u["tag"]:u for u in context.client.step(8)["units"]}
        if 1002 in units:
            context.shift_target_order &= 1003 in units and units[1003]["hp"]==45
    context.shift_targets_dead = 1002 not in units and 1003 not in units


@then("the second enemy stays unharmed until the first dies and both enemies are defeated")
def target_outcomes(context):
    assert context.shift_target_order and context.shift_targets_dead


@given("two nearby owned Riflemen")
def selectable(context):
    play_scene(context)
    context.client.load_scenario({"paused":True,"units":[{"type":"rifleman","owner":1,"x":40,"y":40},
        {"type":"rifleman","owner":1,"x":48,"y":40}]})
    context.client.focus_camera(44,40,height=50)
    context.client.select(tags=[1001])


@when("the second Rifleman is Shift-clicked twice")
def selection(context):
    x,y = context.client.project((48,40,1.05))[0]
    click(context,x,y,shift=True)
    context.shift_added = set(context.client.ui()["state"]["selected"])=={1001,1002}
    click(context,x,y,shift=True)


@then("the selection first contains both units and then only the original")
def selection_outcomes(context):
    assert context.shift_added and context.client.ui()["state"]["selected"]==[1001]


@given("a supplied Muster Hall with 500 crystal")
def producer(context):
    play_scene(context)
    context.client.load_scenario({"paused":True,"players":{"1":{"crystal":500,"aether":0}},"units":[
        {"type":"colony_hub","owner":1,"x":20,"y":20},{"type":"muster_hall","owner":1,"x":40,"y":40}]})
    context.client.select(tags=[1002])


@when("its Rifleman button is Shift-clicked")
def batch(context):
    button = next(b for b in context.client.ui()["state"]["command_card"] if b["ability"]=="train_rifleman")
    x,y,w,h = button["rect"]
    click(context,x+w*.5,y+h*.5,shift=True)


@then("five Riflemen are queued and exactly 250 crystal is spent")
def batch_outcomes(context):
    obs = context.client.get_observation()
    assert obs["players"]["1"]["crystal"]==250
    assert owned(context,"muster_hall")[0]["production_queue_len"]==5


@when("the first Rifleman is assigned to group 1 and recalled with Shift onto the second")
def control_group(context):
    context.client.key("1",True,ctrl=True)
    context.client.key("1",False,ctrl=True)
    context.client.select(tags=[1002])
    context.client.key("1",True,shift=True)
    context.client.key("1",False,shift=True)


@then("both Riflemen are selected")
def group_members(context):
    assert set(context.client.ui()["state"]["selected"])=={1001,1002}


@when("another ground destination is Shift-right-clicked on the minimap")
def minimap_move(context):
    context.client.select(tags=[1001])
    # Inside the fixed 1080p minimap canvas; native HUD input converts to world.
    context.client.mouse(180,960,button=2,pressed=True,shift=True)
    context.client.mouse(180,960,button=2,pressed=False,shift=True)


@then("the original three orders remain ahead of the new move")
def minimap_queue(context):
    orders = owned(context,"rifleman")[0]["orders"]
    assert [o["type"] for o in orders]==["move","move","attack_move","move"]
    # Order Vector2 fields currently use Godot's tuple string on this API.
    points = [literal_eval(o["target_pos"]) if isinstance(o["target_pos"],str)
              else (o["target_pos"]["x"],o["target_pos"]["y"]) for o in orders]
    assert points[:3]==[(35,20),(35,45),(55,45)]
    assert abs(points[3][0]-78.22222)<.01 and abs(points[3][1]-42.66667)<.01
