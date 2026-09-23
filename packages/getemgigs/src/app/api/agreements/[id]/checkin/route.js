import { route, requireBand, readJson } from '@/lib/session';
import { rateLimit, audit, clientIp } from '@/lib/security';
import { checkIn } from '@/lib/services';

export const POST = route(async (request, { id }) => {
  const user = await requireBand();
  await rateLimit(`checkin:${user.id}`, 12, 600, request);
  const body = await readJson(request);
  const result = await checkIn(user, id, { lat: body.lat, lon: body.lon, accuracy: body.accuracy });
  await audit(result.ok ? 'checkin_verified' : 'checkin_rejected', {
    userId: user.id,
    ip: clientIp(request),
    detail: `${id} ${result.distanceM ?? ''}m`,
  });
  return Response.json(result, { status: result.ok ? 200 : 422 });
});
