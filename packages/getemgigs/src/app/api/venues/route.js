import { route, requireUser, readJson } from '@/lib/session';
import { rateLimit } from '@/lib/security';
import { createVenue, listVenues } from '@/lib/services';

export const GET = route(async () => Response.json({ ok: true, venues: await listVenues() }));

export const POST = route(async (request) => {
  const user = await requireUser();
  await rateLimit(`venue:${user.id}`, 10, 3600, request);
  const venue = await createVenue(user, await readJson(request));
  return Response.json({ ok: true, venue }, { status: 201 });
});
