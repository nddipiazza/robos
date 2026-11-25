# Manage RobOS Groups (`/robos-groups`)

List, inspect, create, update, manage members, and sync **RobOS Groups** (`~/.config/robos/groups/`) via CLI, AI agents, or RobOS Voice Assistant.

## Quick Commands

```bash
./packages/robos-cli/robos-groups list
./packages/robos-cli/robos-groups show "<group>"
./packages/robos-cli/robos-groups emails "<group>"
./packages/robos-cli/robos-groups user-groups "<user>"
./packages/robos-cli/robos-groups create "<group name>" --members "<u1,u2>"
./packages/robos-cli/robos-groups add-member "<user>" "<group>"
./packages/robos-cli/robos-groups remove-member "<user>" "<group>"
./packages/robos-cli/robos-groups sync --host 192.168.1.25
./packages/robos-cli/robos-groups say "<natural-language command>"
```

See `plugins/robos/skills/robos-groups/SKILL.md` for full CLI flags, Voice Assistant utterances, and RobOS Services synchronization details.
