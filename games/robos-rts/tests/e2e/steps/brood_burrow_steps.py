from behave import then


@then("the Skitterling is {stance:w} and visible to its owner")
def skitterling_stance(context, stance):
    unit = next(u for u in context.client.get_observation(player=1)["units"] if u["id"] == "ling")
    assert unit.get("burrowed", False) == (stance == "burrowed"), unit
    if stance == "burrowed":
        assert unit["orders"] == [] and unit["effective_speed"] == 0, unit
