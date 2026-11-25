#!/usr/bin/env bash
# Installs and enables the always-on headless RobOS Voice & Phone Assistant Server (:19188)
# as a persistent systemd --user service (`robos-voice-server.service`).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
VOICE_PKG="$(cd "$HERE/.." && pwd)"
PORT="${ROBOS_VOICE_PORT:-19188}"
NODE_BIN="${ROBOS_NODE_BIN:-$(command -v node || echo "$HOME/.local/share/robos/node/bin/node")}"
RUN_DIR="$HOME/.local/share/robos/voice-prompt"
UNIT_DIR="$HOME/.config/systemd/user"

if [ ! -x "$NODE_BIN" ]; then
  echo "Error: Node.js binary not found ($NODE_BIN)." >&2
  exit 1
fi

mkdir -p "$RUN_DIR" "$UNIT_DIR" "$HOME/.local/bin"

cat > "$RUN_DIR/serve-managed.cjs" <<EOF
'use strict';
process.env.ROBOS_HEADLESS = '1';
const PORT = parseInt(process.env.ROBOS_VOICE_PORT || '${PORT}', 10);
const voiceMain = require('${VOICE_PKG}/main');
const fs = require('fs');
const os = require('os');
const path = require('path');
try {
  // Start each Voice Server boot with a fresh listening-device session so music never
  // plays silently or unexpectedly before the user chooses a current listening device.
  const sessFile = path.join(os.homedir(), '.config', 'robos', 'listening-session.json');
  if (fs.existsSync(sessFile)) fs.unlinkSync(sessFile);
} catch {}
try {
  const kokoroModel = path.join(os.homedir(), '.local/share/kokoro/kokoro-v1.0.onnx');
  if (!fs.existsSync(kokoroModel)) {
    voiceMain.ttsEngine.savePrefs({ engine: 'piper', voice: 'en_US-lessac-medium' });
  }
  // Pre-warm Moonshine C++ INT8 ASR + CAM++ 512-dim Speaker ID + persistent C++ Piper daemon
  const { getFastMoonshineRecognizer } = require('${VOICE_PKG}/lib/stt-engine');
  const { getCamPlusPlusExtractor } = require('${VOICE_PKG}/lib/speaker-id');
  getFastMoonshineRecognizer();
  getCamPlusPlusExtractor();
  voiceMain.ttsEngine._synthesizePiperCli('Warmup', path.join(os.tmpdir(), 'robos-piper-warmup.wav')).then(() => {
    try { fs.unlinkSync(path.join(os.tmpdir(), 'robos-piper-warmup.wav')); } catch {}
  }).catch(() => {});
} catch {}
const server = voiceMain.startApiServer(PORT);
try {
  require('/usr/local/share/robos/robos-lib/service-registry.cjs').trackServer(server, {
    appId: 'voice-prompt',
    name: 'RobOS Voice & Phone Assistant Server',
  });
} catch {}
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    try { server.close(() => process.exit(0)); } catch { process.exit(0); }
  });
}
EOF

cat > "$UNIT_DIR/robos-voice-server.service" <<EOF
[Unit]
Description=RobOS Voice & Phone Assistant Server (:${PORT})
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment="ROBOS_HEADLESS=1"
Environment="ROBOS_VOICE_PORT=${PORT}"
Environment="PATH=%h/.local/bin:%h/.local/share/robos/node/bin:/usr/local/bin:/usr/bin:/bin"
ExecStart=${NODE_BIN} %h/.local/share/robos/voice-prompt/serve-managed.cjs
Restart=always
RestartSec=3
UMask=0077
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable robos-voice-server.service
systemctl --user restart robos-voice-server.service
loginctl enable-linger "$USER" 2>/dev/null || true

echo "RobOS Voice & Phone Assistant Server active on 0.0.0.0:${PORT}"
systemctl --user status robos-voice-server.service --no-pager
