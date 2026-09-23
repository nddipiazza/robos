import { ImageResponse } from 'next/og';

export const alt = "Get 'Em Gigs — Fill the room. Kill pay-to-play.";
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          padding: '64px 72px', color: '#f4f1fb',
          backgroundColor: '#0c0a12', backgroundImage: 'radial-gradient(circle at 85% 10%, rgba(255,61,127,0.55), transparent 55%), radial-gradient(circle at 0% 100%, rgba(62,230,255,0.25), transparent 50%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 72, height: 72, borderRadius: 18, background: '#ff3d7f', color: '#0c0a12', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, fontWeight: 900 }}>GG</div>
          <div style={{ fontSize: 40, fontWeight: 800 }}>Get ’Em Gigs</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 92, fontWeight: 900, lineHeight: 1, letterSpacing: -3 }}>Fill the room.</div>
          <div style={{ fontSize: 92, fontWeight: 900, lineHeight: 1.05, letterSpacing: -3, color: '#ff3d7f' }}>Kill pay-to-play.</div>
          <div style={{ fontSize: 32, marginTop: 28, color: '#d9d4ea', maxWidth: 980 }}>
            Local bands trade attendance, lock a deposit, and get scanned in at the door to get it back.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 18, fontSize: 26, color: '#ffd23f', fontWeight: 700 }}>
          <span>Buddy Gigs</span><span>•</span><span>Scan-in at the door</span><span>•</span><span>Stay-To-Play</span><span>•</span><span style={{ color: '#a49fbd' }}>getemgigs.com</span>
        </div>
      </div>
    ),
    size,
  );
}
