import { route, requireBand, readJson } from '@/lib/session';
import { HttpError, rateLimit } from '@/lib/security';
import { respondAgreement, getAgreement } from '@/lib/services';

export const GET = route(async (_request, { id }) => {
  const user = await requireBand();
  const a = await getAgreement(id);
  if (!a || (a.proposer_band_id !== user.band.id && a.target_band_id !== user.band.id)) {
    throw new HttpError(404, 'Agreement not found.');
  }
  return Response.json({ ok: true, agreement: a });
});

export const POST = route(async (request, { id }) => {
  const user = await requireBand();
  await rateLimit(`respond:${user.id}`, 30, 600, request);
  const { action } = await readJson(request);
  const agreement = await respondAgreement(user, id, action);
  return Response.json({ ok: true, agreement });
});
