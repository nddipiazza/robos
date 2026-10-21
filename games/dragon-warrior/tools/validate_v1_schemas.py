#!/usr/bin/env python3
"""
Dragon Warrior v1 JSON Schema Validation Suite.
Validates all v1 JSON Schemas for correctness and tests existing data files against v1 Schemas.
"""

import os
import json
import sys
import jsonschema
from jsonschema import Draft202012Validator, Draft7Validator

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCHEMA_DIR = os.path.join(PROJECT_ROOT, "schemas", "v1")
DATA_DIR = os.path.join(PROJECT_ROOT, "data", "v1")
V1_DATA_DIR = DATA_DIR
V1_SAVE_STATES_DIR = os.path.join(V1_DATA_DIR, "save-states")

SCHEMA_FILES = [
    "common.schema.json",
    "dragon_warrior_v1.schema.json",
    "monsters.schema.json",
    "spells.schema.json",
    "levels.schema.json",
    "equipment.schema.json",
    "items.schema.json",
    "locations.schema.json",
    "encounter_zones.schema.json",
    "map_grids.schema.json",
    "tiles_meta.schema.json",
    "registries.schema.json",
    "dialogue.schema.json",
    "combat_formulas.schema.json",
    "name_system.schema.json",
    "sprite_frames.schema.json",
    "npcs.schema.json",
    "save_state.schema.json"
]

DATA_SCHEMA_MAPPINGS = {
    "monsters.json": "monsters.schema.json",
    "spells.json": "spells.schema.json",
    "levels.json": "levels.schema.json",
    "weapons.json": "equipment.schema.json",
    "armor.json": "equipment.schema.json",
    "shields.json": "equipment.schema.json",
    "items.json": "items.schema.json",
    "quest_items.json": "items.schema.json",
    "locations.json": "locations.schema.json",
    "dungeons.json": "locations.schema.json",
    "encounter_zones.json": "encounter_zones.schema.json",
    "worldmap_zones.json": "encounter_zones.schema.json",
    "map_grids.json": "map_grids.schema.json",
    "tiles_meta.json": "tiles_meta.schema.json",
    "dialogue.json": "dialogue.schema.json",
    "combat_formulas.json": "combat_formulas.schema.json",
    "name_system.json": "name_system.schema.json",
    "sprite_frames.json": "sprite_frames.schema.json"
}

def create_resolver(schema, schema_store):
    return jsonschema.RefResolver(
        base_uri=f"file://{SCHEMA_DIR}/",
        referrer=schema,
        store=schema_store
    )

def validate_schemas():
    print("=== Step 1: Validating JSON Schema Syntaxes ===")
    schema_errors = 0
    loaded_schemas = {}
    schema_store = {}

    for schema_file in SCHEMA_FILES:
        filepath = os.path.join(SCHEMA_DIR, schema_file)
        if not os.path.exists(filepath):
            print(f"❌ [MISSING SCHEMA] {schema_file}")
            schema_errors += 1
            continue

        try:
            with open(filepath, "r", encoding="utf-8") as f:
                schema_data = json.load(f)

            loaded_schemas[schema_file] = schema_data
            if "$id" in schema_data:
                schema_store[schema_data["$id"]] = schema_data
            schema_store[schema_file] = schema_data
            schema_store[f"file://{SCHEMA_DIR}/{schema_file}"] = schema_data

        except Exception as e:
            print(f"❌ [INVALID JSON SCHEMA FILE] {schema_file}: {e}")
            schema_errors += 1

    for schema_file, schema_data in loaded_schemas.items():
        try:
            resolver = create_resolver(schema_data, schema_store)
            try:
                Draft202012Validator.check_schema(schema_data)
            except Exception:
                Draft7Validator.check_schema(schema_data)

            validator = Draft202012Validator(schema_data, resolver=resolver)
            print(f"✅ [VALID SCHEMA] {schema_file:32s} ($id: {schema_data.get('$id', 'N/A')})")
        except Exception as e:
            print(f"❌ [INVALID SCHEMA] {schema_file}: {e}")
            schema_errors += 1

    print("\n=== Step 2: Testing Data Files Against v1 Schemas ===")
    data_errors = 0
    passed_data = 0

    for data_file, schema_file in DATA_SCHEMA_MAPPINGS.items():
        data_path = os.path.join(DATA_DIR, data_file)

        if not os.path.exists(data_path):
            print(f"⚠️ [DATA MISSING] {data_file}")
            continue

        if schema_file not in loaded_schemas:
            print(f"❌ [SCHEMA NOT LOADED] {schema_file} for {data_file}")
            data_errors += 1
            continue

        try:
            with open(data_path, "r", encoding="utf-8") as f:
                instance = json.load(f)
            
            schema = loaded_schemas[schema_file]
            resolver = create_resolver(schema, schema_store)
            validator = jsonschema.Draft202012Validator(schema, resolver=resolver)
            errors = list(validator.iter_errors(instance))

            count = len(instance) if isinstance(instance, (dict, list)) else 1

            if errors:
                print(f"❌ [VALIDATION FAIL] {data_file:28s} against {schema_file} ({len(errors)} issues)")
                for err in errors[:3]:
                    print(f"    - {err.message} at path: {'/'.join(str(p) for p in err.path)}")
                data_errors += 1
            else:
                print(f"✅ [VALIDATED DATA] {data_file:28s} against {schema_file} ({count} entries)")
                passed_data += 1
        except Exception as e:
            print(f"❌ [ERROR] {data_file}: {e}")
            data_errors += 1

    # Validate generated npcs.json in data/v1/
    v1_npcs_path = os.path.join(V1_DATA_DIR, "npcs.json")
    if os.path.exists(v1_npcs_path):
        try:
            with open(v1_npcs_path, "r", encoding="utf-8") as f:
                instance = json.load(f)
            schema = loaded_schemas["npcs.schema.json"]
            resolver = create_resolver(schema, schema_store)
            validator = jsonschema.Draft202012Validator(schema, resolver=resolver)
            errors = list(validator.iter_errors(instance))

            if errors:
                print(f"❌ [VALIDATION FAIL] v1/npcs.json against npcs.schema.json ({len(errors)} issues)")
                for err in errors[:3]:
                    print(f"    - {err.message} at path: {'/'.join(str(p) for p in err.path)}")
                data_errors += 1
            else:
                print(f"✅ [VALIDATED DATA] v1/npcs.json                 against npcs.schema.json ({len(instance)} maps)")
                passed_data += 1
        except Exception as e:
            print(f"❌ [ERROR] v1/npcs.json: {e}")
            data_errors += 1

    # Validate all 107 Save State JSON files in data/v1/save-states/
    if os.path.exists(V1_SAVE_STATES_DIR):
        print("\n=== Step 3: Validating v1 Save States Against save_state.schema.json ===")
        save_state_files = [f for f in os.listdir(V1_SAVE_STATES_DIR) if f.endswith(".json")]
        save_state_passed = 0
        save_state_failed = 0
        schema = loaded_schemas["save_state.schema.json"]
        resolver = create_resolver(schema, schema_store)

        for sfile in save_state_files:
            spath = os.path.join(V1_SAVE_STATES_DIR, sfile)
            try:
                with open(spath, "r", encoding="utf-8") as f:
                    instance = json.load(f)
                validator = jsonschema.Draft202012Validator(schema, resolver=resolver)
                errors = list(validator.iter_errors(instance))
                if errors:
                    print(f"❌ [SAVE STATE FAIL] {sfile}: {errors[0].message}")
                    save_state_failed += 1
                    data_errors += 1
                else:
                    save_state_passed += 1
            except Exception as e:
                print(f"❌ [SAVE STATE ERROR] {sfile}: {e}")
                save_state_failed += 1
                data_errors += 1

        print(f"✅ [VALIDATED v1 SAVE STATES] {save_state_passed}/{len(save_state_files)} files passed cleanly")

    print("\n--- Summary ---")
    print(f"Schemas Checked: {len(loaded_schemas)}/{len(SCHEMA_FILES)}")
    print(f"Data Files Validated: {passed_data}/{len(DATA_SCHEMA_MAPPINGS) + 1}")
    print(f"v1 Save States Validated: {save_state_passed}/{len(save_state_files)}")
    print(f"Total Errors: {schema_errors + data_errors}")

    return (schema_errors + data_errors) == 0

if __name__ == "__main__":
    success = validate_schemas()
    sys.exit(0 if success else 1)
