from behave import then

from tactical_controls_steps import find_unit


@then('"{name}" runs {count:d} paid production lines')
@then('"{name}" runs {count:d} paid production line')
def active_production_lines(context, name, count):
    producer = find_unit(context, name)
    assert producer["production_active_slots"] == count, producer
    assert sum(progress > 0 for progress in producer["production_progress"]) == count, producer


@then('"{name}" has {hp:d} HP and {seconds:d} seconds of Surge')
def surge_health_and_time(context, name, hp, seconds):
    unit = find_unit(context, name)
    assert (unit["hp"], unit["surge_timer"]) == (hp, seconds), unit


@then('"{name}" is airborne with {count:d} reserved jobs')
@then('"{name}" is airborne with {count:d} reserved job')
def airborne_queue(context, name, count):
    producer = find_unit(context, name)
    assert producer["airborne"] and producer["production_queue_len"] == count, producer
    assert producer["production_active_slots"] == 0, producer


@then('"{name}" is grounded with a "{unit_type}" attached')
def grounded_attachment(context, name, unit_type):
    producer = find_unit(context, name)
    assert not producer.get("airborne", False), producer
    attachment = next(unit for unit in context.client.get_observation()["units"]
                      if unit["tag"] == producer["attachment_tag"])
    assert attachment["unit_type"] == unit_type and attachment["attachment_parent_tag"] == producer["tag"], attachment
