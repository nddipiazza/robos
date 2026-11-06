'use strict';

// A Camera Watch invite: `robos-cam://<base64url JSON>` holding
//   - net:     a scoped App Mesh invite (robos-net://…) that lets the holder reach
//              only this machine's "camera-watch-share" port, and only after its
//              certificate is pinned by joining
//   - cameras: the shared cameras, each with its share secret
// Treat an invite like a key: anyone who has it can watch those cameras until the
// sharer revokes the invite or stops sharing the camera.

const PREFIX = 'robos-cam://';
const SHARE_APP_ID = 'camera-watch-share';

function encodeInvite({ from, net, cameras }) {
  const payload = {
    v: 1,
    from: String(from || ''),
    net: String(net || ''),
    cameras: (cameras || []).map((c) => ({ id: c.id, name: c.name, secret: c.secret })),
  };
  return PREFIX + Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeInvite(text) {
  const raw = String(text || '').trim();
  if (!raw.toLowerCase().startsWith(PREFIX)) {
    if (/^robos-(net|mesh):\/\//i.test(raw)) {
      throw new Error('That is a Private Network invite, not a camera invite. Ask for a Camera Watch invite (it starts with robos-cam://).');
    }
    throw new Error('A camera invite starts with robos-cam://');
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(raw.slice(PREFIX.length), 'base64url').toString('utf8'));
  } catch {
    throw new Error('This camera invite is damaged. Copy it again.');
  }
  if (payload?.v !== 1 || !/^robos-net:\/\//i.test(payload.net || '') || !Array.isArray(payload.cameras) || !payload.cameras.length) {
    throw new Error('This camera invite is damaged or from a newer version of Camera Watch.');
  }
  const cameras = payload.cameras
    .filter((c) => c && /^[\w-]{1,80}$/.test(String(c.id || '')) && c.secret)
    .map((c) => ({ id: String(c.id), name: String(c.name || 'Camera').slice(0, 80), secret: String(c.secret) }));
  if (!cameras.length) throw new Error('This camera invite has no cameras in it.');
  return { from: String(payload.from || '').slice(0, 120), net: payload.net, cameras };
}

module.exports = { encodeInvite, decodeInvite, SHARE_APP_ID, PREFIX };
