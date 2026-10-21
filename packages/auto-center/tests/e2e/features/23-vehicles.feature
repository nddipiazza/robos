Feature: Register the customer's vehicle
  Each vehicle belongs to a customer and keeps its own repair history, so the next visit starts with
  everything you already know.

  Background:
    Given the customer "Sam Rivera" is on file

  Scenario: Add a vehicle to a customer
    Expand **Add a customer vehicle**, choose the customer and enter year, make, model, VIN and plate. The car
    is shown everywhere as make, model and year with the customer's name, such as "Toyota Camry 2015 — Sam
    Rivera". A nickname is optional and appears in brackets after the model year.
    When I add a 2015 Toyota Camry for "Sam Rivera"
    Then the customer list shows "Sam Rivera · 1 vehicle(s)"

  Scenario: A malformed VIN is rejected
    A VIN has 17 characters and never contains I, O or Q. A typo is caught before it reaches a recall lookup.
    When I add a 2015 Toyota Camry for "Sam Rivera" with the VIN "TOO-SHORT"
    Then I am told "Invalid VIN"

  Scenario: The same VIN cannot be on file twice
    Each VIN maps to exactly one vehicle, which prevents a car being registered to two customers.
    Given "Sam Rivera" has the vehicle "Toyota Camry 2015"
    When I add a 2015 Toyota Camry for "Sam Rivera" with the VIN "4T1BF1FK5FU123456"
    And I add a 2015 Toyota Camry for "Sam Rivera" with the VIN "4T1BF1FK5FU123456"
    Then I am told "A vehicle with this VIN is already on file"
