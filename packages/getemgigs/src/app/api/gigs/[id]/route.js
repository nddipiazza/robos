import { route, requireBand } from '@/lib/session';
import { HttpError } from '@/lib/security';
import { cancelGig, getGig } from '@/lib/services';

export const GET = route(async (_request, { id }) => {
  const gig = await getGig(id);
  if (!gig) throw new HttpError(404, 'Gig not found.');
  return Response.json({ ok: true, gig });
});

export const DELETE = route(async (_request, { id }) => {
  const user = await requireBand();
  await cancelGig(user, id);
  return Response.json({ ok: true });
});
