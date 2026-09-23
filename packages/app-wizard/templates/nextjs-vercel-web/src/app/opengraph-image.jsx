import { ImageResponse } from 'next/og';
import { SITE_NAME, SITE_INITIALS, TAGLINE, DESCRIPTION, THEME, SITE_URL } from '@/lib/site';

export const alt = `${SITE_NAME} — ${TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '64px 72px', color: '#f4f1fb', backgroundColor: THEME.background, backgroundImage: `radial-gradient(circle at 85% 10%, ${THEME.accent}8c, transparent 55%)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 72, height: 72, borderRadius: 18, background: THEME.accent, color: THEME.background, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 900 }}>{SITE_INITIALS}</div>
          <div style={{ fontSize: 40, fontWeight: 800 }}>{SITE_NAME}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 80, fontWeight: 900, lineHeight: 1.05, letterSpacing: -2, color: THEME.accent }}>{TAGLINE}</div>
          <div style={{ fontSize: 30, marginTop: 24, color: '#d9d4ea', maxWidth: 1000 }}>{DESCRIPTION.slice(0, 180)}</div>
        </div>
        <div style={{ display: 'flex', fontSize: 26, color: '#a49fbd' }}>{SITE_URL.replace('https://', '')}</div>
      </div>
    ),
    size,
  );
}
