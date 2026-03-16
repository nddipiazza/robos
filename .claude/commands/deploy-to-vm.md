# Deploy to RobOS VM

Deploy one or more packages from the local repo to the running RobOS VM.

## Input

$ARGUMENTS — Package name(s) to deploy (e.g. `app-launcher`, `icon-manager`, `robos-icons robos-lib`). Use `all` to deploy every package in `packages/`.

## Steps

### 1. Verify VM is reachable

```bash
ssh -p 2224 -o StrictHostKeyChecking=no -o ConnectTimeout=5 robos@localhost 'echo SSH_OK'
```

If not reachable, tell the user to start the VM first (`/start-vm`).

### 2. Resolve packages

- If `all`: list all directories in `packages/`
- Otherwise: use the provided package name(s)
- Verify each `packages/<name>/` exists locally

### 3. Deploy each package

For each package, determine if it's an **app** (has `main.js` + `renderer/`) or a **library** (no renderer):

**For apps:**
```bash
scp -P 2224 -o StrictHostKeyChecking=no -r packages/<name>/* robos@localhost:/tmp/<name>-deploy/
ssh -p 2224 -o StrictHostKeyChecking=no robos@localhost "
  sudo rm -rf /usr/local/share/robos/<name> &&
  sudo cp -r /tmp/<name>-deploy /usr/local/share/robos/<name> &&
  sudo chmod -R a+rX /usr/local/share/robos/<name> &&
  sudo bash -c 'cd /usr/local/share/robos/<name> && npm install --quiet' &&
  sudo cp /usr/local/share/robos/<name>/<name>.desktop /usr/share/applications/<name>.desktop 2>/dev/null;
  rm -rf /tmp/<name>-deploy
"
```

**For libraries (no renderer/):**
```bash
scp -P 2224 -o StrictHostKeyChecking=no -r packages/<name>/* robos@localhost:/tmp/<name>-deploy/
ssh -p 2224 -o StrictHostKeyChecking=no robos@localhost "
  sudo rm -rf /usr/local/share/robos/<name> &&
  sudo cp -r /tmp/<name>-deploy /usr/local/share/robos/<name> &&
  sudo chmod -R a+rX /usr/local/share/robos/<name> &&
  rm -rf /tmp/<name>-deploy
"
```

**IMPORTANT reminders:**
- Always `sudo chmod -R a+rX` after `sudo cp -r` — otherwise Electron can't read the files
- `.desktop` files go to `/usr/share/applications/` (NOT `/usr/local/share/applications/`)
- Clean up `/tmp/<name>-deploy/` after install

### 4. Verify

For each deployed package:
```bash
ssh -p 2224 -o StrictHostKeyChecking=no robos@localhost 'ls /usr/local/share/robos/<name>/'
```

### 5. Report

List each package with deploy status (success/fail).
