class_name PorchDeckZone
extends Area2D

# RobOS cRPG Porch Deck Zone
# Confirms elevated platform tier (Z=1) and marks actors with tactical high-ground advantage.

signal actor_entered_deck(actor)
signal actor_exited_deck(actor)

@export var elevation_tier: int = 1
@export var deck_offset_px: float = -48.0

func _ready() -> void:
	body_entered.connect(_on_body_entered)
	body_exited.connect(_on_body_exited)

func _on_body_entered(body: Node2D) -> void:
	if body.has_method("set_elevation"):
		body.set_elevation(elevation_tier, deck_offset_px)
		actor_entered_deck.emit(body)
		print("🏰 [PorchDeckZone] Actor '%s' is standing on elevated porch deck (High Ground Active)." % body.name)

func _on_body_exited(body: Node2D) -> void:
	actor_exited_deck.emit(body)
