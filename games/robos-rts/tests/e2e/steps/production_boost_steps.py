from math import isclose

from behave import then, when

from tactical_controls_steps import find_unit


@then('"{name}" has {amount:f} Heartstone energy')
def heartstone_energy(context, name, amount):
    unit = find_unit(context, name)
    assert isclose(unit["energy"], amount, abs_tol=0.01), unit


@then('"{name}" has {ticks:d} boost ticks')
def boost_timer(context, name, ticks):
    unit = find_unit(context, name)
    assert unit.get("production_boost_ticks", 0) == ticks, unit


def progress(context, name):
    return find_unit(context, name)["production_progress"][0]


@then('"{name}" has {seconds:f} seconds of production progress')
def exact_production_progress(context, name, seconds):
    actual = progress(context, name)
    assert isclose(actual, seconds, abs_tol=0.011), actual


@when('a direct production boost from "{source}" to "{target}" is attempted')
def direct_boost(context, source, target):
    context.boost_result = context.client.command(
        "production_boost", tags=[find_unit(context, source)["tag"]], target_tag=find_unit(context, target)["tag"],
    )


@then("the production boost attempt is {outcome}")
def boost_outcome(context, outcome):
    assert context.boost_result["ok"] == (outcome == "accepted"), context.boost_result


@when("the opposing gun targets the Resonator")
def attack_resonator(context):
    result = context.client.command(
        "attack_target", tags=[find_unit(context, "gun")["tag"]],
        target_tag=find_unit(context, "power")["tag"], owner=2,
    )
    assert result["ok"], result


@then('"{name}" is {status} for production')
def production_power(context, name, status):
    unit = find_unit(context, name)
    assert unit["powered"] == (status == "powered"), unit


@when('the commander records the production progress of "{name}"')
def remember_production(context, name):
    context.production_record = progress(context, name)


@then('"{name}" production has advanced {seconds:f} seconds since the record')
def compare_progress(context, name, seconds):
    actual = progress(context, name) - context.production_record
    assert isclose(actual, seconds, abs_tol=0.011), actual


@then("the boosted production timer is captured")
def capture_boost(context):
    context.client.ui(banner=0, clear_messages=True, hover=[1000, 600])
    result = context.client.screenshot(str(context.reports_dir / "roadmap-production-boost.png"))
    assert result["ok"], result
