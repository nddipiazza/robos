import { HttpError, isUuid } from '@/lib/security';
import { route } from '@/lib/session';
import { settleAgreements } from '@/lib/services';

// Vercel Cron calls this daily with `Authorization: Bearer $CRON_SECRET`.
// Operators may POST {agreementId, asOf} with the same secret to settle one agreement as of a given time.
function authorize(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    throw new HttpError(401, 'Unauthorized.');
  }
}

export const dynamic = 'force-dynamic';

export const GET = route(async (request) => {
  authorize(request);
  const results = await settleAgreements({ now: new Date() });
  return Response.json({ ok: true, settled: results.length, results });
});

export const POST = route(async (request) => {
  authorize(request);
  const body = await request.json().catch(() => ({}));
  if (!isUuid(body.agreementId)) throw new HttpError(400, 'agreementId is required.');
  const asOf = body.asOf ? new Date(body.asOf) : new Date();
  if (Number.isNaN(asOf.getTime())) throw new HttpError(400, 'Invalid asOf.');
  const results = await settleAgreements({ now: asOf, agreementId: body.agreementId });
  return Response.json({ ok: true, settled: results.length, results });
});
