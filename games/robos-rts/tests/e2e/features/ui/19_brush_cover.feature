@brush_cover
Feature: Walkable brush conceals infantry
  Scenario: An approaching scout reveals an enemy hidden in painted brush
    Given an RTS test scenario
      """
      {"name":"Brush scouting","paused":true,"decor":false,"fog_of_war":true,
       "map":{"width":96,"height":64,"terrain_tiles":[
         {"x":40,"y":24,"terrain":"brush"},{"x":44,"y":24,"terrain":"brush"},
         {"x":40,"y":28,"terrain":"brush"},{"x":44,"y":28,"terrain":"brush"}]},
       "units":[{"id":"scout","type":"rifleman","owner":1,"x":28,"y":26},
                {"id":"hidden","type":"rifleman","owner":2,"x":43,"y":26},
                {"id":"vehicle","type":"howitzer_emplaced","owner":2,"x":46,"y":31}]}
      """
    When the commander frames (38, 26) at zoom height 36
    And both sides hold fire for the scouting check
    Then player 1 can see "vehicle" through the brush
    And player 1 cannot see "hidden" through the brush
    When the commander clicks unit "scout"
    And the commander right-clicks terrain at (40, 29)
    And the simulation advances 155 ticks
    Then player 1 can see "hidden" through the brush
    When the commander captures the revealed brush
    And the commander right-clicks terrain at (28, 26)
    And the simulation advances 155 ticks
    Then player 1 cannot see "hidden" through the brush
