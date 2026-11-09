@crowded_picking
Feature: Screen picks match visible units at either zoom limit
  Scenario Outline: Select either worker when their footprints overlap
    Given an RTS test scenario
      """
      {"name":"Crowded mineral line","paused":true,"decor":false,
       "map":{"width":96,"height":64},
       "units":[{"id":"left_worker","type":"pioneer","owner":1,"x":39.55,"y":28},
                {"id":"right_worker","type":"pioneer","owner":1,"x":40.45,"y":28},
                {"id":"rear_worker","type":"pioneer","owner":1,"x":46,"y":27.5},
                {"id":"front_worker","type":"pioneer","owner":1,"x":46,"y":28},
                {"id":"escort","type":"rifleman","owner":1,"x":34,"y":24}]}
      """
    When the commander frames (40, 28) at zoom height <height>
    And the commander clicks the projected body of "left_worker" at (-0.25, 1.15)
    Then the commander has selected "left_worker"
    When the commander clicks the projected body of "right_worker" at (0.45, 1.15)
    Then the commander has selected "right_worker"
    When the commander clicks the projected body of "front_worker" at (0.0, 1.6)
    Then the commander has selected "front_worker"
    When the commander clicks the projected body of "escort" at (0.0, 1.15)
    And the commander right-clicks the projected body of "right_worker" at (0.45, 1.15)
    Then "escort" has a "follow" order for "right_worker"
    When the commander right-clicks the projected body of "front_worker" at (0.0, 1.6)
    Then "escort" has a "follow" order for "front_worker"

    Examples:
      | height |
      | 28     |
      | 320    |

  Scenario Outline: Target the airframe over a ground unit
    Given an RTS test scenario
      """
      {"name":"Stacked flight and ground","paused":true,"decor":false,
       "map":{"width":96,"height":64},
       "units":[{"id":"rifle","type":"rifleman","owner":1,"x":34,"y":24},
                {"id":"infantry","type":"breacher","owner":2,"x":41,"y":28},
                {"id":"fighter","type":"kestrel_interceptor","owner":2,"x":41,"y":28},
                {"id":"rear_infantry","type":"breacher","owner":2,"x":48,"y":24.9},
                {"id":"front_fighter","type":"kestrel_interceptor","owner":2,"x":48,"y":29}]}
      """
    When the commander frames (40, 28) at zoom height <height>
    And the commander clicks the projected body of "fighter" at (0.0, 0.55)
    Then the commander has selected "fighter"
    When the commander clicks the projected body of "infantry" at (0.0, 1.2)
    Then the commander has selected "infantry"
    When the commander clicks the projected body of "front_fighter" at (0.0, 0.55)
    Then the commander has selected "front_fighter"
    When the commander clicks the projected body of "rifle" at (0.0, 1.15)
    And the commander right-clicks the projected body of "fighter" at (0.0, 0.55)
    Then "rifle" has an "attack_target" order for "fighter"
    When the commander right-clicks the projected body of "front_fighter" at (0.0, 0.55)
    Then "rifle" has an "attack_target" order for "front_fighter"
    When the commander presses "A"
    And the commander clicks the projected body of "infantry" at (0.0, 1.2)
    Then "rifle" has an "attack_target" order for "infantry"

    Examples:
      | height |
      | 28     |
      | 320    |

  Scenario Outline: Click visible infantry in brush without revealing a concealed unit
    Given an RTS test scenario
      """
      {"name":"Brush silhouettes","paused":true,"decor":false,"fog_of_war":true,
       "map":{"width":96,"height":64,"terrain_tiles":[
         {"x":40,"y":24,"terrain":"brush"},{"x":56,"y":24,"terrain":"brush"}]},
       "units":[{"id":"scout","type":"rifleman","owner":1,"x":37,"y":26},
                {"id":"exposed","type":"rifleman","owner":2,"x":41,"y":26},
                {"id":"concealed","type":"rifleman","owner":2,"x":57,"y":26}]}
      """
    When the commander frames (43, 26) at zoom height <height>
    Then player 1 can see "exposed" through the brush
    And player 1 cannot see "concealed" through the brush
    When the commander clicks the projected body of "exposed" at (0.0, 1.15)
    Then the commander has selected "exposed"
    When the commander clicks the projected body of "concealed" at (0.0, 1.15)
    Then the commander has selected "none"
    When the commander clicks the projected body of "scout" at (0.0, 1.15)
    And the commander right-clicks the projected body of "exposed" at (0.0, 1.15)
    Then "scout" has an "attack_target" order for "exposed"
    When the commander presses "A"
    And the commander clicks the projected body of "concealed" at (0.0, 1.15)
    Then "scout" has orders "attack_move"

    Examples:
      | height |
      | 28     |
      | 320    |
