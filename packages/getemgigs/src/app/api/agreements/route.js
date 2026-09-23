import { route, requireBand, readJson } from '@/lib/session';
import { rateLimit } from '@/lib/security';
import { proposeAgreement, agreementsForBand } from '@/lib/services';

export const GET = route(async () => {
  const user = await requireBand();
  return Response.json({ ok: true, agreements: await agreementsForBand(user.band.id) });
});

export const POST = route(async (request) => {
  const user = await requireBand();
  await rateLimit(`propose:${user.id}`, 10, 600, request);
  const agreement = await proposeAgreement(user, await readJson(request));
  return Response.json({ ok: true, agreement }, { status: 201 });
});
