import { cookies } from 'next/headers';
import { route } from '@/lib/session';
import { destroySession, SESSION_COOKIE } from '@/lib/auth';

export const POST = route(async () => {
  const jar = await cookies();
  await destroySession(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  return Response.json({ ok: true });
});
