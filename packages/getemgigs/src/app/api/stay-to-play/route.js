import { route, requireBand, readJson } from '@/lib/session';
import { rateLimit } from '@/lib/security';
import { stayCommit, stayCommitmentsForBand } from '@/lib/services';

export const GET = route(async () => {
  const user = await requireBand();
  return Response.json({ ok: true, commitments: await stayCommitmentsForBand(user.band.id) });
});

export const POST = route(async (request) => {
  const user = await requireBand();
  await rateLimit(`stay:${user.id}`, 20, 3600, request);
  const commitment = await stayCommit(user, await readJson(request));
  return Response.json({ ok: true, commitment }, { status: 201 });
});
