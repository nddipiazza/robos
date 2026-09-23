import QRCode from 'qrcode';
import { route, requireBand } from '@/lib/session';
import { rateLimit } from '@/lib/security';
import { attendeeCode } from '@/lib/services';

export const dynamic = 'force-dynamic';

function siteOrigin(request) {
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const proto = request.headers.get('x-forwarded-proto') || (host?.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

// Attendee: current rotating check-in QR (refreshes every 30 s).
export const GET = route(async (request, { id }) => {
  const user = await requireBand();
  await rateLimit(`code:${user.id}`, 120, 600, request);
  const res = await attendeeCode(user, id);
  if (res.status !== 'PENDING') return Response.json({ ok: true, status: res.status });
  const url = `${siteOrigin(request)}/scan/${res.code}`;
  const svg = await QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 2, color: { dark: '#0c0a12', light: '#ffffff' } });
  return Response.json(
    { ok: true, status: 'PENDING', code: res.code, url, svg, rotatesAt: res.rotatesAt, hostBandName: res.hostBandName, venueName: res.venueName },
    { headers: { 'Cache-Control': 'no-store' } },
  );
});
