import json
import time

from behave import given, then, when


def wait_for(read, condition, timeout=4):
    deadline = time.monotonic() + timeout
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


def confirm_leave(context, heading):
    wait_for(lambda: menu_state(context), lambda state: state.get("confirmation") == heading)
    key(context, "Tab")
    key(context, "Enter")


@when("the commander confirms replacing a paused battle if prompted")
def confirm_title_replacement(context):
    state = menu_state(context)
    if state.get("resume_available"):
        confirm_leave(context, {"campaign": "Start a campaign mission?", "scenarios": "Start a scenario?"}[state["page"]])


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
    positions = {"Campaign": 398, "Skirmish": 472, "Scenarios": 546, "Map Editor": 620, "Settings": 714}
    click(context, 275, positions[choice] + (74 if state["resume_available"] else 0))


@given('the title shows the "{page}" page')
@then('the title shows the "{page}" page')
def title_page(context, page):
    wait_for(lambda: menu_state(context), lambda state: state.get("screen") == "title" and state.get("page") == page)


@then("Alt+Enter and Shift+F11 toggle fullscreen without leaving Settings")
def toggle_fullscreen(context):
    initial = menu_state(context)["fullscreen"]
    for name, modifiers, expected in [("Enter", {"alt": True}, not initial), ("F11", {"shift": True}, initial)]:
        key(context, name, **modifiers)
        state = wait_for(lambda: menu_state(context), lambda state: state.get("fullscreen") == expected)
        assert state["page"] == "settings", state


@then("campaign mission access is {access}")
def campaign_access(context, access):
    assert menu_state(context)["campaign_unlocked"] == json.loads(access)


@then("mission {number:d} begins with its voiced cinematic")
def campaign_opening(context, number):
    presentation = wait_for(
        lambda: menu_state(context).get("campaign_presentation", {}),
        lambda state: state.get("cinematic") and state.get("voice_started"),
    )
    assert presentation["caption_visible"]
    assert context.client.get_observation()["campaign"]["mission"] == number
    assert context.client.screenshot(str(context.reports_dir / f"campaign-mission-{number}.png"))["ok"]


@when("the commander skips the cinematic and clears the route")
def finish_campaign_assault(context):
    key(context, "Space")
    wait_for(lambda: menu_state(context)["campaign_presentation"], lambda state: not state["cinematic"])
    context.client.set_playback(speed=8.0)
    stage_count = context.client.get_observation()["campaign"]["stage_total"]
    for stage in range(stage_count):
        observation = context.client.get_observation()
        marker = next(m for m in observation["campaign"]["markers"] if not m["bonus"] and m["kind"] != "hero")
        tags = [u["tag"] for u in observation["units"] if u["owner"] == 1 and not u["is_structure"]]
        assert context.client.command("attack_move", tags, *marker["point"])["ok"]
        wait_for(
            lambda: context.client.get_observation()["campaign"],
            lambda mission: mission["stage"] > stage,
            timeout=18,
        )
    context.client.set_playback(paused=True, speed=1.0)


@then("Cut the Signal is complete and five survivors have joined")
def campaign_victory(context):
    wait_for(
        lambda: menu_state(context)["campaign_presentation"],
        lambda state: state["result_visible"],
    )
    mission = context.client.get_observation()["campaign"]
    assert mission["status"] == "victory" and mission["troops_joined"] == 5
    assert mission["bonus_done"] < mission["bonus_total"]


@when("the commander opens the replay picker from the campaign result")
def open_replay_picker(context):
    key(context, "Tab")
    key(context, "Enter")


@when("the commander opens the restart picker from the pause menu")
def open_restart_picker(context):
    key(context, "Space")
    wait_for(lambda: menu_state(context)["campaign_presentation"], lambda state: not state["cinematic"])
    key(context, "F8")
    wait_for(lambda: menu_state(context), lambda state: state["match_menu_visible"])
    key(context, "Tab")
    key(context, "Enter")


@then('the restart picker defaults to "{difficulty}"')
def restart_picker_difficulty(context, difficulty):
    picker = wait_for(lambda: menu_state(context)["campaign_presentation"], lambda state: state["restart_visible"])
    assert picker["restart_difficulty"] == difficulty, picker


@then("the campaign result is visible again")
def restore_campaign_result(context):
    wait_for(lambda: menu_state(context)["campaign_presentation"],
             lambda state: state["result_visible"] and not state["restart_visible"])


@then("the campaign pause menu is visible again")
def restore_campaign_pause(context):
    wait_for(lambda: menu_state(context), lambda state: state["match_menu_visible"])
    assert context.client.health()["paused"]


@when("the commander selects the next difficulty and confirms restart")
def confirm_restart(context):
    for name in ("Space", "Down", "Enter", "Tab", "Enter"):
        key(context, name)


@then('the active mission difficulty is "{difficulty}"')
def active_difficulty(context, difficulty):
    assert context.client.get_observation()["campaign"]["difficulty"] == difficulty


@when("the commander skips the cinematic and waits for the first Directorate raid")
def campaign_wait_for_raid(context):
    key(context, "Escape")
    context.client.set_playback(speed=8.0)
    wait_for(
        lambda: context.client.get_observation()["campaign"],
        lambda mission: mission["waves_sent"] >= 1,
        timeout=20,
    )


@then("the dig site is sending raiders toward the staging base")
def campaign_first_raid(context):
    mission = context.client.get_observation()["campaign"]
    assert mission["mission"] == 2 and mission["waves_sent"] > 0
    assert mission["primary"] == "Destroy the Directorate dig base"
    assert "camp_siege" in mission["cue_history"]
    assert context.client.health()["manual_step_requests"] == 0


@when("the commander leaves the campaign for the title")
def pause_campaign(context):
    key(context, "F8")
    key(context, "Tab")
    key(context, "Tab")
    key(context, "Enter")
    confirm_leave(context, "Return to the main menu?")
    title_page(context, "main")


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
    confirm_leave(context, "Return to the main menu?")
    title_page(context, "main")


@when("the commander cancels leaving an active campaign")
def cancel_leave_mission(context):
    key(context, "F8")
    wait_for(lambda: menu_state(context), lambda state: state["match_menu_visible"])
    before = context.client.get_observation()["campaign"]
    for name in ("Tab", "Tab", "Enter"):
        key(context, name)
    wait_for(lambda: menu_state(context), lambda state: state["confirmation"] == "Return to the main menu?")
    key(context, "Escape")
    wait_for(lambda: menu_state(context), lambda state: state["match_menu_visible"] and not state["confirmation"])
    assert context.client.get_observation()["campaign"] == before
    assert context.client.health()["paused"]
    key(context, "F8")


@when("the commander cancels replacing the paused mission")
def cancel_replacing_mission(context):
    before = context.client.get_observation()["campaign"]
    key(context, "Enter")
    wait_for(lambda: menu_state(context), lambda state: state["confirmation"] == "Start a campaign mission?")
    key(context, "Enter")
    state = wait_for(lambda: menu_state(context), lambda state: not state["confirmation"])
    assert state["resume_available"]
    assert context.client.get_observation()["campaign"] == before


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
