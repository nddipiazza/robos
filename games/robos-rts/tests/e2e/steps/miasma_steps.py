from behave import then


def _fields(context):
    return context.client.get_observation().get("miasma", [])


@then("the miasma field is absent")
def field_absent(context):
    assert not _fields(context)


@then("the miasma field shows a warning with {ticks:d} ticks remaining")
def field_warning(context, ticks):
    fields = _fields(context)
    assert len(fields) == 1 and fields[0]["warning"] and fields[0]["ticks"] == ticks, fields


@then("the miasma field is active with {ticks:d} ticks remaining")
def field_active(context, ticks):
    fields = _fields(context)
    assert len(fields) == 1 and not fields[0]["warning"] and fields[0]["ticks"] == ticks, fields
