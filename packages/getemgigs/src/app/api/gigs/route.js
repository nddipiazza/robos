import { route, requireBand, readJson } from '@/lib/session';
import { rateLimit } from '@/lib/security';
import { createGig, listGigs } from '@/lib/services';

export const GET = route(async (request) => {
  const { searchParams } = new URL(request.url);
  const gigs = await listGigs({ city: searchParams.get('city') || '', lookingOnly: searchParams.get('looking') === '1' });
  return Response.json({ ok: true, gigs });
});

export const POST = route(async (request) => {
  const user = await requireBand();
  await rateLimit(`gig:${user.id}`, 20, 3600, request);
  const gig = await createGig(user, await readJson(request));
  return Response.json({ ok: true, gig }, { status: 201 });
});
