import time

from behave import given, then, when


def wait_for(read, condition):
    deadline = time.monotonic() + 4
    while True:
        current = read()
        if condition(current):
            return current
        assert time.monotonic() < deadline, current
        time.sleep(0.05)


def menu_state(context):
    return context.client.ui().get("state", {})


def click(context, x, y):
    context.client.mouse(x, y)
    context.client.mouse(x, y, pressed=False)


def key(context, name, **mods):
    context.client.key(name, **mods)
    context.client.key(name, pressed=False, **mods)


@given("Starfall Command is idle on the title screen")
def fresh_title(context):
    title_page(context, "main")
    assert context.client.health()["paused"]
    assert context.client.get_observation()["units"] == []
    assert not menu_state(context)["resume_available"]


@given("the title screen is captured")
def capture_title(context):
    result = context.client.screenshot(str(context.reports_dir / "title-screen.png"))
    assert result["ok"], result


@when("the commander clicks {choice} on the title screen")
def choose_title(context, choice):
    state = menu_state(context)
    assert state["page"] == "main", state
    positions = {"Skirmish": 398, "Scenarios": 472, "Map Editor": 546, "Settings": 640}
    click(context, 275, positions[choice] + (74 if state["resume_available"] else 0))


@then('the title shows the "{page}" page')
def title_page(context, page):
    wait_for(lambda: menu_state(context), lambda state: state.get("screen") == "title" and state.get("page") == page)


@when("the commander chooses Iron Narrows and starts from the title")
def start_iron_narrows(context):
    for name in ("Space", "Down", "Enter"):
        key(context, name)
    for _ in range(5):
        key(context, "Tab")
    key(context, "Enter")
    wait_for(lambda: menu_state(context), lambda state: "selected" in state)


@when("the commander remembers the match and puts a worker in group 1")
def remember_match(context):
    observation = context.client.get_observation()
    context.start_seed = observation["match"]["seed"]
    worker = next(u for u in observation["units"] if u["owner"] == 1 and u["is_worker"])
    context.worker_tag = worker["tag"]
    context.client.ui(control_group={"id": 1, "tags": [context.worker_tag]})


@when("the commander returns to the title from the battlefield")
def return_to_title(context):
    key(context, "F8")
    for _ in range(3):
        key(context, "Tab", shift=True)
    key(context, "Enter")
    title_page(context, "main")


@then("the match is paused at the title")
def paused_on_title(context):
    assert menu_state(context)["resume_available"]
    before = context.client.health()
    assert before["paused"]
    time.sleep(0.2)
    assert context.client.health()["tick"] == before["tick"]


@then("the same match and control group resume")
def resumed(context):
    view = wait_for(lambda: menu_state(context), lambda state: "selected" in state)
    assert view["control_group_members"]["1"] == [context.worker_tag]
    assert context.client.get_observation()["match"]["seed"] == context.start_seed
    assert not context.client.health()["paused"]


@then("Colony Macro Economy is open in the battlefield")
def practice_loaded(context):
    wait_for(lambda: menu_state(context), lambda state: "selected" in state)
    assert context.client.health()["scenario"].startswith("Colony Macro Economy")


@then("the map editor is open")
def editor_loaded(context):
    wait_for(lambda: context.client.editor("state"), lambda state: state.get("ok"))
