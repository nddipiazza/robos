import { ImageResponse } from 'next/og';
import { SITE_INITIALS, THEME } from '@/lib/site';

// PNG app icons generated from the site initials: /icon/small, /icon/large, /icon/maskable.
export function generateImageMetadata() {
  return [
    { id: 'small', size: { width: 192, height: 192 }, contentType: 'image/png' },
    { id: 'large', size: { width: 512, height: 512 }, contentType: 'image/png' },
    { id: 'maskable', size: { width: 512, height: 512 }, contentType: 'image/png' },
  ];
}

export default async function Icon({ id }) {
  const key = await id;
  const size = key === 'small' ? 192 : 512;
  const maskable = key === 'maskable';
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: THEME.accent, borderRadius: maskable ? 0 : size * 0.22, color: THEME.background, fontSize: size * (maskable ? 0.32 : 0.44), fontWeight: 900 }}>
        {SITE_INITIALS}
      </div>
    ),
    { width: size, height: size },
  );
}
