#!/usr/bin/env python3
"""robos-rename-desktop DESKTOP_INDEX NEW_NAME
Renames an Openbox virtual desktop by setting _NET_DESKTOP_NAMES via Xlib."""
import sys, os
from Xlib import display as Xdisplay

def main():
    if len(sys.argv) < 3:
        print("Usage: robos-rename-desktop <index> <name>", file=sys.stderr)
        sys.exit(1)
    idx  = int(sys.argv[1])
    name = sys.argv[2]

    d    = Xdisplay.Display(os.environ.get("DISPLAY", ":0"))
    root = d.screen().root

    atom_names = d.intern_atom("_NET_DESKTOP_NAMES")
    atom_utf8  = d.intern_atom("UTF8_STRING")

    # Read existing names
    prop = root.get_full_property(atom_names, atom_utf8)
    if prop and prop.value:
        raw   = bytes(prop.value)
        names = raw.rstrip(b"\x00").split(b"\x00")
        names = [n.decode("utf-8", errors="replace") for n in names]
    else:
        names = []

    # Extend if needed and set the target slot
    while len(names) <= idx:
        names.append(f"Workspace {len(names)+1}")
    names[idx] = name

    value = b"\x00".join(n.encode("utf-8") for n in names) + b"\x00"
    root.change_property(atom_names, atom_utf8, 8, value)
    d.flush()
    print(f"Renamed desktop {idx} → {name}")

if __name__ == "__main__":
    main()
