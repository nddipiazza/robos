import { route, requireUser, readJson } from '@/lib/session';
import { rateLimit } from '@/lib/security';
import { upsertBand } from '@/lib/services';

export const POST = route(async (request) => {
  const user = await requireUser();
  await rateLimit(`band:${user.id}`, 20, 3600, request);
  const band = await upsertBand(user, await readJson(request));
  return Response.json({ ok: true, band });
});
