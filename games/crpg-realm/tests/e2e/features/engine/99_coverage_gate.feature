@engine @coverage_gate
Feature: Coverage gate: the suite exercises all content and every rule path
  Runs last. Coverage accumulates across the whole engine suite, so run the full
  engine folder; exclude this feature with --tags=-coverage_gate when running a
  subset.

  Scenario Outline: Every <kind> in data/v1 has been exercised by the engine
    Then the engine has exercised every <kind> in the content data

    Examples:
      | kind           |
      | spells         |
      | monsters       |
      | classes        |
      | races          |
      | items          |
      | traps          |
      | status_effects |

  Scenario: Every rule path the engine defines has been exercised
    Then the engine has exercised every rule path it defines
