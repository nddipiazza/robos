Feature: Register the customer's vehicle
  Each vehicle belongs to a customer and keeps its own repair history, so the next visit starts with
  everything you already know.

  Background:
    Given the customer "Sam Rivera" is on file

  Scenario: Add a vehicle to a customer
    Expand **Add a customer vehicle**, choose the customer and enter year, make, model, VIN and plate.
    When I add the vehicle "Sam's Camry" for "Sam Rivera" — a 2015 Toyota Camry
    Then the customer list shows "Sam Rivera · 1 vehicle(s)"

  Scenario: A malformed VIN is rejected
    A VIN has 17 characters and never contains I, O or Q. A typo is caught before it reaches a recall lookup.
    When I add the vehicle "Sam's Camry" for "Sam Rivera" with the VIN "TOO-SHORT"
    Then I am told "Invalid VIN"

  Scenario: The same VIN cannot be on file twice
    Each VIN maps to exactly one vehicle, which prevents a car being registered to two customers.
    Given "Sam Rivera" has the vehicle "Sam's Camry"
    When I add the vehicle "Camry copy" for "Sam Rivera" with the VIN "4T1BF1FK5FU123456"
    And I add the vehicle "Camry again" for "Sam Rivera" with the VIN "4T1BF1FK5FU123456"
    Then I am told "A vehicle with this VIN is already on file"
