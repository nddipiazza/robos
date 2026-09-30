import { cookies } from 'next/headers';
import { route, requireUser, readJson } from '@/lib/session';
import { HttpError, clientIp, audit } from '@/lib/security';
import { deleteAccount } from '@/lib/accounts';
import { SESSION_COOKIE } from '@/lib/auth';

export const GET = route(async () => {
  const user = await requireUser();
  return Response.json({ ok: true, user });
});

export const DELETE = route(async (request) => {
  const user = await requireUser();
  const body = await readJson(request);
  if (String(body.confirm || '').trim().toLowerCase() !== user.email) {
    throw new HttpError(400, 'Type your email address to confirm account deletion.');
  }
  await deleteAccount(user.id);
  (await cookies()).delete(SESSION_COOKIE);
  await audit('account_deleted', { ip: clientIp(request), detail: user.email });
  return Response.json({ ok: true });
});
