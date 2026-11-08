@economy
Feature: Workers pass through each other while mining crystal
  Scenario: Four workers share a crystal patch and deliver its entire yield
    Given an RTS test scenario
      """
      {"name":"Mineral walking","paused":true,"decor":false,
       "map":{"width":96,"height":64},
       "resources":[{"id":"patch","type":"crystal_field","x":42,"y":24,"amount":43}],
       "units":[{"type":"colony_hub","owner":1,"x":16,"y":24},
                {"type":"pioneer","owner":1,"x":25,"y":24},
                {"type":"pioneer","owner":1,"x":28,"y":24},
                {"type":"pioneer","owner":1,"x":31,"y":24},
                {"type":"pioneer","owner":1,"x":34,"y":24}]}
      """
    When player 1 sends all workers to gather from "patch"
    Then a returning worker passes through an outbound worker
    When the simulation advances 1800 ticks
    Then the patch is empty and player 1 has delivered exactly 43 crystal
