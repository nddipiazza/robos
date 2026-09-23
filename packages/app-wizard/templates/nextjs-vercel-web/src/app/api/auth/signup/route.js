import { cookies } from 'next/headers';
import { route, readJson } from '@/lib/session';
import { clientIp, rateLimit, assertHuman, audit } from '@/lib/security';
import { verifyCaptcha } from '@/lib/captcha';
import { signup } from '@/lib/accounts';
import { createSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth';

export const POST = route(async (request) => {
  const ip = clientIp(request);
  const body = await readJson(request);
  assertHuman(body, request);
  await rateLimit(`signup:ip:${ip}:h`, 5, 3600, request);
  await rateLimit(`signup:ip:${ip}:d`, 20, 86400, request);
  await rateLimit(`signup:global:m`, 60, 60, request);
  await verifyCaptcha(body.captchaToken, 'signup', ip);
  const user = await signup({ email: body.email, password: body.password, displayName: body.displayName, ip });
  const { token, expires } = await createSession(user.id, { ip, userAgent: request.headers.get('user-agent') });
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expires));
  await audit('signup', { userId: user.id, ip });
  return Response.json({ ok: true, user: { id: user.id, email: user.email, displayName: user.display_name } }, { status: 201 });
});
