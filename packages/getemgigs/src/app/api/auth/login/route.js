import { cookies } from 'next/headers';
import { route, readJson } from '@/lib/session';
import { clientIp, rateLimit, audit } from '@/lib/security';
import { verifyCaptcha } from '@/lib/captcha';
import { login } from '@/lib/services';
import { createSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth';

export const POST = route(async (request) => {
  const ip = clientIp(request);
  const body = await readJson(request);
  const email = String(body.email || '').toLowerCase().trim().slice(0, 254);
  await rateLimit(`login:ip:${ip}`, 30, 900, request);
  await rateLimit(`login:email:${email}`, 10, 900, request);
  await verifyCaptcha(body.captchaToken, 'login', ip);
  let user;
  try {
    user = await login({ email: body.email, password: body.password });
  } catch (err) {
    await audit('login_failed', { ip, detail: email });
    throw err;
  }
  const { token, expires } = await createSession(user.id, { ip, userAgent: request.headers.get('user-agent') });
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expires));
  await audit('login', { userId: user.id, ip });
  return Response.json({ ok: true });
});
