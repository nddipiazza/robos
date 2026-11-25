# Manage RobOS Users (`/robos-users`)

List, query, create, update, switch, and sync **RobOS Users** (`~/.config/robos/people/`) via CLI, AI agents, or RobOS Voice Assistant.

## Quick Commands

```bash
./packages/robos-cli/robos-users list
./packages/robos-cli/robos-users whoami
./packages/robos-cli/robos-users show "<user>"
./packages/robos-cli/robos-users ask "<user>" <email|birthday|age|role|gamerTag|rpg|music|books|hobbies|pet-peeves|personality|groups>
./packages/robos-cli/robos-users switch "<user>"
./packages/robos-cli/robos-users add "<name>" --email "<email>" --groups "<g1,g2>"
./packages/robos-cli/robos-users sync --host 192.168.1.25
./packages/robos-cli/robos-users say "<natural-language command>"
```

See `plugins/robos/skills/robos-users/SKILL.md` for full CLI flags, Voice Assistant utterances, and RobOS Services synchronization details.
