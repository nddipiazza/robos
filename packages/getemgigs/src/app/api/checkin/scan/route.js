import { route, requireBand, readJson } from '@/lib/session';
import { rateLimit, audit, clientIp } from '@/lib/security';
import { scanCode } from '@/lib/services';

// Host band: verify an attendee by scanning their check-in QR.
export const POST = route(async (request) => {
  const user = await requireBand();
  await rateLimit(`scan:${user.id}`, 40, 600, request);
  const { code } = await readJson(request);
  try {
    const result = await scanCode(user, code);
    await audit('checkin_scanned', { userId: user.id, ip: clientIp(request), detail: result.agreementId });
    return Response.json(result);
  } catch (err) {
    await audit('checkin_scan_rejected', { userId: user.id, ip: clientIp(request), detail: err.message });
    throw err;
  }
});
