#!/usr/bin/env bash
# Install as the SSH user. No root daemon, credentials in units, or exposed management API.
set -euo pipefail
PACKAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export PATH="$HOME/.local/share/robos/node/bin:$PATH"
command -v systemctl >/dev/null || { echo 'A Linux systemd host is required' >&2; exit 1; }
if ! command -v node >/dev/null || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)'; then
  command -v python3 >/dev/null || { echo 'Install Node.js 20+ or Python 3 to bootstrap Node' >&2; exit 1; }
  # Official Node distribution, SHA-256 checked before extracting into the user runtime.
  python3 - <<'PY'
import hashlib, json, os, platform, shutil, tarfile, tempfile, urllib.request
arch = {'x86_64':'x64', 'aarch64':'arm64'}.get(platform.machine())
if not arch: raise SystemExit('Install Node.js 20+ manually on this architecture')
base = 'https://nodejs.org/dist/'
versions = json.load(urllib.request.urlopen(base + 'index.json', timeout=30))
version = next(v['version'] for v in versions if v['version'].startswith('v22.') and v['lts'])
name = 'node-' + version + '-linux-' + arch
filename = name + '.tar.xz'
checksums = urllib.request.urlopen(base + version + '/SHASUMS256.txt', timeout=30).read().decode()
expected = next(line.split()[0] for line in checksums.splitlines() if line.split()[-1] == filename)
with tempfile.TemporaryDirectory(prefix='robos-node-') as temp:
    archive = os.path.join(temp, filename)
    urllib.request.urlretrieve(base + version + '/' + filename, archive)
    with open(archive, 'rb') as handle:
        actual = hashlib.sha256(handle.read()).hexdigest()
    if actual != expected: raise SystemExit('Node.js checksum mismatch')
    with tarfile.open(archive) as handle:
        for entry in handle.getmembers():
            if not (entry.name == name or entry.name.startswith(name + '/')) or '..' in entry.name.split('/'): raise SystemExit('Unsafe runtime archive')
            if entry.issym() or entry.islnk():
                resolved = os.path.normpath(os.path.join(os.path.dirname(entry.name), entry.linkname))
                if not resolved.startswith(name + '/'): raise SystemExit('Unsafe runtime symlink')
        handle.extractall(temp)
    target = os.path.expanduser('~/.local/share/robos/node')
    os.makedirs(target, exist_ok=True)
    source = os.path.join(temp, name)
    for folder, dirs, files in os.walk(source):
        for item in dirs + files:
            src = os.path.join(folder, item)
            dest = os.path.join(target, os.path.relpath(src, source))
            if os.path.islink(src) and os.path.lexists(dest) and not os.path.isdir(dest): os.unlink(dest)
    shutil.copytree(source, target, dirs_exist_ok=True, symlinks=True)
print('Installed verified Node.js runtime')
PY
fi
# Repair npm launcher links from older deployments that copied links as plain files.
if [[ "$(command -v node)" == "$HOME/.local/share/robos/node/bin/node" ]]; then
  ln -sfn ../lib/node_modules/npm/bin/npm-cli.js "$HOME/.local/share/robos/node/bin/npm"
  ln -sfn ../lib/node_modules/npm/bin/npx-cli.js "$HOME/.local/share/robos/node/bin/npx"
fi
cd "$PACKAGE_DIR"
if [[ -d node_modules/electron ]]; then
  npm install --include=dev --no-audit --no-fund
else
  npm install --omit=dev --no-audit --no-fund
fi
node cli.cjs install
if [[ -w /usr/local/share/robos/robos-lib/dom-snapshot.js && -f runtime-tracker.cjs ]]; then
  node tools/install-runtime-tracking.cjs || echo 'Shared library tracking upgrade needs review; source inventory remains available' >&2
fi
echo 'To start before login: sudo loginctl enable-linger "'"$USER"'"'
