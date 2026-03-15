#!/usr/bin/env bash
# RobOS Profile Widget — reads current user from person service (hardcoded to robos)
# Will be replaced by real OAuth identity once robos-auth providers are configured

python3 - << 'PYEOF'
import json, os, sys

SETTINGS = os.path.expanduser('~/.config/robos/settings.json')
PEOPLE_DIR = os.path.expanduser('~/.config/robos/people')

def load_settings():
    try:
        return json.load(open(SETTINGS))
    except:
        return {}

def load_person(uid):
    f = os.path.join(PEOPLE_DIR, f'{uid}.json')
    try:
        return json.load(open(f))
    except:
        return None

settings = load_settings()
# Hardcoded to 'robos' until OAuth providers are configured
uid = settings.get('myProfileUid', 'robos')
person = load_person(uid)

if not person:
    print('${color #ff6b6b}⚠ No profile linked${color}')
    sys.exit(0)

first = person.get('firstName', '')
last  = person.get('lastName', '')
initials = (first[:1] + last[:1]).upper() or person.get('displayName','?')[:1].upper()
name  = person.get('displayName') or f'{first} {last}'.strip() or uid
title = person.get('title', '')
dept  = person.get('department', '')
loc   = person.get('location', '')

print(f'${{color #00bcd4}}${{font DejaVu Sans:bold:size=11}}{initials}${{font}}${{color}}  ${{color #e0e0ff}}${{font DejaVu Sans:bold:size=10}}{name}${{font}}${{color}}')
if title:
    print(f'   ${{color #8888aa}}{title}${{color}}')
if dept:
    print(f'   ${{color #666688}}⬡ {dept}${{color}}')
if loc:
    print(f'   ${{color #555577}}📍 {loc}${{color}}')
print(f'   ${{color #444466}}uid: {uid}${{color}}')
PYEOF
