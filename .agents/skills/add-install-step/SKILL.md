---
name: add-install-step
description: Add a new installation provisioning step to the RobOS cloud-init sequence and ASCII boot splash screen.
---

# Add RobOS Installation Step

Add a new installation step to the RobOS cloud-init provisioning sequence and ASCII splash screen.

## Input

$ARGUMENTS — The name of the new installation step (e.g. "Installing Chrome browser" or "Configuring zsh")

## What to modify

You must update **all 3 locations** in `infra/desktop/cloud-init/user-data` that reference installation steps. Missing any location will break the splash screen or leave the step unexecuted.

### 1. Splash script STEPS array and TOTAL

In the `write_files` section, find the `/usr/local/bin/robos-splash` script. Update:
- Increment `TOTAL=N` to `TOTAL=N+1`
- Add the new step name to the `STEPS=()` array in the correct position

### 2. Add runcmd block

In the `runcmd` section, add a new step block **before** the final "Finalise" step. Follow this pattern:

```yaml
  # ── Step N: <Step description> ──
  - |
    # <implementation commands here>
  - /usr/local/bin/robos-splash N
```

The splash call number must match the step's 0-based index in the STEPS array.

### 3. Update splash call numbers

After inserting the new step, all subsequent `robos-splash` calls must be renumbered. The final step should always call `robos-splash N done` where N equals TOTAL.

### 4. Update the dconf load block (if applicable)

If the new step adds dconf settings, also add them to the `dconf load` block in the Finalise step (the `cat > /tmp/robos-dconf.ini` heredoc) and to the appropriate `/etc/dconf/db/local.d/` write_files entry.

## Validation

After making changes:
1. Verify the YAML is valid: `python3 -c "import yaml; yaml.safe_load(open('infra/desktop/cloud-init/user-data'))"`
2. Verify TOTAL matches the number of entries in STEPS array
3. Verify splash call numbers are sequential: 0, 1, 2, ..., N-1, then `N done` for the last call
4. Verify every runcmd step between "Step 0: Show splash" and "Finalise" has a corresponding splash call after it
