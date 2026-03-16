# Run Command on RobOS VM

Execute a shell command on the RobOS VM via SSH.

## Input

$ARGUMENTS — The shell command to run on the VM (e.g. `ls /usr/local/share/robos/`, `systemctl status gdm3`, `journalctl -xe --no-pager | tail -50`)

## Steps

### 1. Verify SSH is available

```bash
ssh -p 2224 -o StrictHostKeyChecking=no -o ConnectTimeout=5 robos@localhost 'echo SSH_OK' 2>/dev/null
```

If not reachable, tell the user the VM may not be running and suggest `/start-vm`.

### 2. Run the command

```bash
ssh -p 2224 -o StrictHostKeyChecking=no robos@localhost '$ARGUMENTS'
```

Use a timeout of 30 seconds for the SSH command. For long-running commands, run in the background.

### 3. Report output

Display the command output to the user. If the command failed, show the exit code and stderr.
