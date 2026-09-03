---
nav_exclude: true
---

# Story 22-08: Language Mixing and App Menu Customization

**Epic:** [Desktop Customizer](epic.md)
**Status:** Not started
**Points:** 5

## Description

Support mixed-language desktop experiences and deep customization of the app launcher menu.

### Language Mixing

RobOS serves global teams. A developer might want the app menu in Spanish but tooltips in English, or the system UI in Japanese with English terminal apps.

```
/language system es                        # System language → Spanish
/language menu es,en                       # App menu: Spanish primary, English fallback
/language terminal en                      # Terminal stays English
/language tooltips en                      # Tooltips in English
/language app task-board ja                # Task Board UI in Japanese
/language list                             # Show current language config
/language reset                            # Reset to system default
```

Implementation: modify `LANG`, `LC_*` environment variables per-app, generate translated `.desktop` files with `Name[es]=`, install language packs via `apt`.

### App Menu Customization

```
/menu hide calculator fonts characters     # Hide specific apps
/menu show calculator                      # Unhide
/menu group "Development" task-board issue-manager pr-review ci-monitor
/menu group "Dashboards" dev-central manager-dashboard deploy-tracker
/menu rename "task-board" "Sprint Board"   # Custom display name
/menu icon task-board /path/to/custom.svg  # Custom icon
/menu order "Development" "Dashboards" "Security" "System"  # Category order
/menu separator after "Dashboards"         # Visual separator
/menu reset                                # Reset to defaults
```

Implementation: modify `.desktop` files (`NoDisplay=true`, `Categories=`, `Name=`), update `robos-icons` registry, refresh App Launcher via IPC.

## Acceptance Criteria

- [ ] `/language` can set system, menu, terminal, and per-app languages
- [ ] Mixed language configs persist across sessions
- [ ] `/menu hide/show` toggles app visibility in the launcher
- [ ] `/menu group` creates custom categories with specified apps
- [ ] `/menu rename` and `/menu icon` customize app display
- [ ] `/menu reset` restores original configuration
- [ ] Changes reflect immediately in the App Launcher
