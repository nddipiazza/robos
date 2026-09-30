import { ImageResponse } from 'next/og';
import { SITE_INITIALS, THEME } from '@/lib/site';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: THEME.accent, color: THEME.background, fontSize: 80, fontWeight: 900 }}>
        {SITE_INITIALS}
      </div>
    ),
    size,
  );
}
