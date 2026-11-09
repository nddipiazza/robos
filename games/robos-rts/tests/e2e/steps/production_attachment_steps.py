from behave import then

from tactical_controls_steps import find_unit


@then('"{name}" runs {count:d} paid production lines')
@then('"{name}" runs {count:d} paid production line')
def active_production_lines(context, name, count):
    producer = find_unit(context, name)
    assert producer["production_active_slots"] == count, producer
    assert sum(progress > 0 for progress in producer["production_progress"]) == count, producer
