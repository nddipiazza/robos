Feature: Read the car with an OBD-II adapter
  Plug a Bluetooth OBD-II adapter (such as a vLinker MC+) into the port under the dash, turn the key to ON, and
  read the car from the ticket at the mechanic bench: the check-engine light, stored and pending trouble codes,
  the VIN and live engine data. The scan is saved on the ticket, and the codes can go straight into the diagnosis.
  These scenarios replay recordings of a real 2014 Dodge Grand Caravan (with a made-up VIN), with codes
  added so there is something to read.

  Background:
    Given the shop team has "Maria Lopez" as "Master technician"
    And the customer "Sam Rivera" is on file
    And "Sam Rivera" has the vehicle "Sam's Grand Caravan": year "2014", make "Dodge", model "Grand Caravan"
    And "Sam's Grand Caravan" is taken in with the concern "Check-engine light is on"

  Scenario: Connect to the adapter and read the codes
    Open the ticket and press **Read the car (OBD)**. **Find adapters** looks for Bluetooth OBD adapters
    nearby; pick yours. **Read codes** shows whether the check-engine light is on and every code with its
    description. Pending codes have been seen once but not confirmed by the car yet.
    Given I am at the mechanic bench
    When I sit down at the bench as "Maria Lopez"
    And I open the work ticket "RO-0001"
    And I open Read the car
    And I find adapters and connect to "vLinker MC-Android"
    Then the OBD panel shows "Connected to vLinker MC-Android · ELM327 v2.2 · battery 14.7 V"
    And the OBD panel shows "ISO 15765-4 CAN (11 bit, 500 kbaud)"
    When I read the codes
    Then the OBD panel shows "Check-engine light is ON · 2 code(s) reported"
    And "P0420" is listed under "Stored codes" as "Catalyst System Efficiency Below Threshold (Bank 1)"
    And "P0133" is listed under "Stored codes" as "No description on file"
    And "P0442" is listed under "Pending codes" as "No description on file"
    And the OBD panel shows "2C4RDGCG4ER100001"

  Scenario: Save the scan on the ticket
    **Save scan to ticket** writes what the car reported into the ticket history. If the vehicle has no VIN
    on file yet, the VIN read from the car is added to it.
    Given I am at the mechanic bench
    When I sit down at the bench as "Maria Lopez"
    And I open the work ticket "RO-0001"
    And I open Read the car
    And I find adapters and connect to "vLinker MC-Android"
    And I read the codes
    Then the OBD panel shows "not on file yet"
    When I save the scan to the ticket
    Then I am told "Scan saved. The VIN was added to the vehicle."
    And the bench history includes "check-engine light ON; stored P0133, P0420 (Catalyst System Efficiency Below Threshold (Bank 1)); pending P0442"
    And the bench history includes "VIN 2C4RDGCG4ER100001 saved to the vehicle"
    When I read the codes
    Then the OBD panel shows "matches this ticket"

  Scenario: Put the codes in the diagnosis
    **Use codes in diagnosis** opens the diagnosis with the codes already filled in. Write what you found
    and save it.
    Given I am at the mechanic bench
    When I sit down at the bench as "Maria Lopez"
    And I open the work ticket "RO-0001"
    And I open Read the car
    And I find adapters and connect to "vLinker MC-Android"
    And I read the codes
    And I use the codes in the diagnosis
    Then the diagnosis trouble codes are "P0133, P0420, P0442"
    When I save the diagnosis "Upstream O2 sensor slow to respond; catalyst efficiency low"
    Then the bench shows "Being diagnosed"

  Scenario: A scan from a different car is not saved
    If the VIN the car reports is not the VIN on the ticket, you are plugged into the wrong car. The bench
    warns you and will not save the scan on this ticket.
    Given "Sam Rivera" has the vehicle "Sam's Accord": year "2014", make "Honda", model "Accord", VIN "1HGCR2F30EA000001"
    And "Sam's Accord" is taken in with the concern "Oil change"
    And I am at the mechanic bench
    When I sit down at the bench as "Maria Lopez"
    And I open the work ticket "RO-0002"
    And I open Read the car
    And I find adapters and connect to "vLinker MC-Android"
    And I read the codes
    Then the OBD panel shows "This is not the car on the ticket"
    When I save the scan to the ticket
    Then I am told "does not match the vehicle on this ticket (1HGCR2F30EA000001)"

  Scenario: Clear the codes after the repair
    Clearing turns the check-engine light off, but it also resets the emissions readiness checks, so the
    bench asks first. Clear only after the repair, with the key ON and the engine off.
    Given I am at the mechanic bench
    When I sit down at the bench as "Maria Lopez"
    And I open the work ticket "RO-0001"
    And I open Read the car
    And I find adapters and connect to "vLinker MC-Android"
    And I read the codes
    And I ask to clear the codes
    Then the OBD panel shows "fail an inspection"
    When I confirm clearing the codes
    Then I am told "Codes cleared."
    And the OBD panel shows "Check-engine light is off"
    And the OBD panel shows "No trouble codes stored or pending."

  @obd-real
  Scenario: Watch live engine data
    **Show live data** reads engine speed, coolant and intake temperature, battery voltage, load, throttle,
    fuel trims, speed and fuel level about once a second. These readings are from a real van idling warm.
    Given I am at the mechanic bench
    When I sit down at the bench as "Maria Lopez"
    And I open the work ticket "RO-0001"
    And I open Read the car
    And I find adapters and connect to "vLinker MC-Android"
    And I show live data
    Then live data shows "Engine speed" as "628 rpm"
    And live data shows "Coolant temperature" as "216 °F (102 °C)"
    And live data shows "Battery / module voltage" as "14.45 V"
    And live data shows "Vehicle speed" as "0 mph"
    And live data shows "Short-term fuel trim (bank 1)" as "1.6 %"
    And live data shows "Time since engine start" as "17 min 12 s"
    When I stop live data
    Then the OBD panel shows "Live data · stopped"
    When I disconnect the adapter
    Then the OBD panel shows "Connect to vLinker MC-Android"
