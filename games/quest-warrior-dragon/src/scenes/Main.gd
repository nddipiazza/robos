extends Node

func _ready():
    print("Main scene loaded. Initializing systems...")
    # This demonstrates the architecture is working.
    DataManager.load_game_data()
    print("Welcome to AI Quest: Warrior Dragon V2!")
