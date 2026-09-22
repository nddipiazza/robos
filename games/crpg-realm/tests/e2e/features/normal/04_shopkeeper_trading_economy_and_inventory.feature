Feature: Detailed Shopkeeper Merchant Trading, Economy & Inventory Verification
  As an adventurer interacting with Blacksmith Brand's Armory in Oakhaven Village Square
  I want to browse wares, inspect equipment stats and comparison tooltips, buy and sell items across categories
  So that character wealth, inventory counts, and tactical loadout economy adhere to D&D 5e mechanics

  Background:
    Given the cRPG game is running and healthy
    And an isolated test starting in scene "VillageSquare" with party "Lieutenant Vance" the "fighter"
    Then the current scene is "VillageSquare"
    When the player speaks with Blacksmith Brand
    And the player opens the shopkeeper trading window
    Then the shopkeeper trading window is visible
    And the shopkeeper title displays "Blacksmith Brand's Armory"
    And the shopkeeper active tab is "buy"
    And the player has 150 gold

  Scenario Outline: Buying various equipment and consumable items from the merchant
    When the player records the current gold balance
    And the player trades with the shopkeeper to buy "<item_id>"
    Then the player inventory contains "<item_id>"
    And the player gold decreased by <cost>
    And the activity log contains message "Purchased <item_title> for <cost> GP."
    And the shopkeeper window displays gold "<remaining_gold> GP"

    Examples:
      | item_id        | item_title           | cost | remaining_gold |
      | dagger         | Dagger               | 2    | 148            |
      | mace           | Flanged Mace         | 5    | 145            |
      | shield         | Knightly Shield      | 10   | 140            |
      | potion-healing | Potion of Healing    | 50   | 100            |
      | greatsword     | Greatsword           | 50   | 100            |

  Scenario: Selling looted items back to the merchant at fair market rate
    When the player switches to the shopkeeper "sell" tab
    Then the shopkeeper active tab is "sell"
    And the player inventory contains "service-sword"
    When the player records the current gold balance
    And the player sells "service-sword" to the shopkeeper
    Then the player gold increased by 7
    And the player has 157 gold
    And the activity log contains message "Sold Royal Guard Service Sword for 7 GP."
    And the shopkeeper window displays gold "157 GP"

  Scenario: Multi-item buy and sell trading cycle with inventory balance assertions
    When the player trades with the shopkeeper to buy "dagger"
    Then the player has 148 gold
    And the player inventory contains "dagger"
    When the player trades with the shopkeeper to buy "potion-healing"
    Then the player has 98 gold
    And the player inventory count for "potion-healing" is 3
    When the player switches to the shopkeeper "sell" tab
    Then the shopkeeper active tab is "sell"
    When the player sells "dagger" to the shopkeeper
    Then the player has 99 gold
    And the player inventory does not contain "dagger"
    When the player closes the shopkeeper trading window
    Then the shopkeeper trading window is not visible

  Scenario: Attempting to purchase expensive wares with insufficient funds
    When the player attempts to buy "plate-armor" costing 1500 gold
    Then the purchase is rejected due to insufficient gold
    And the player has 150 gold
    And the player inventory does not contain "plate-armor"
    When the player attempts to sell "non-existent-relic"
    Then the sale is rejected
    And the player has 150 gold
