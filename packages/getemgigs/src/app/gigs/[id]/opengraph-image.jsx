import { ImageResponse } from 'next/og';
import { getGig } from '@/lib/services';

export const alt = "Gig on Get 'Em Gigs";
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

function when(iso) {
  return new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default async function GigOgImage({ params }) {
  const { id } = await params;
  const gig = await getGig(id).catch(() => null);
  const title = gig?.title || 'Live gig';
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '60px 72px', color: '#f4f1fb', backgroundColor: '#0c0a12', backgroundImage: 'radial-gradient(circle at 90% 0%, rgba(255,61,127,0.5), transparent 55%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, fontSize: 30, fontWeight: 800 }}>
          <div style={{ width: 60, height: 60, borderRadius: 15, background: '#ff3d7f', color: '#0c0a12', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 900 }}>GG</div>
          Get ’Em Gigs
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 34, color: '#ffd23f', fontWeight: 800 }}>{gig ? when(gig.starts_at) : ''}</div>
          <div style={{ fontSize: title.length > 40 ? 64 : 80, fontWeight: 900, lineHeight: 1.05, letterSpacing: -2, marginTop: 10 }}>{title}</div>
          <div style={{ fontSize: 40, color: '#ff7aa8', fontWeight: 800, marginTop: 16 }}>{gig?.band_name || ''}</div>
          <div style={{ fontSize: 32, color: '#d9d4ea', marginTop: 8 }}>{gig ? `${gig.venue_name} · ${gig.venue_city}` : ''}</div>
        </div>
        <div style={{ display: 'flex', fontSize: 26, color: '#a49fbd' }}>Buddy Gigs for local bands · getemgigs.com</div>
      </div>
    ),
    size,
  );
}
