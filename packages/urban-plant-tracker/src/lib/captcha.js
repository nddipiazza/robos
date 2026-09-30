// Google reCAPTCHA v3 — wired in but DISABLED by default.
//
// To enable later:
//   RECAPTCHA_ENABLED=true
//   RECAPTCHA_SECRET_KEY=<server secret>
//   NEXT_PUBLIC_RECAPTCHA_ENABLED=true
//   NEXT_PUBLIC_RECAPTCHA_SITE_KEY=<site key>
//   RECAPTCHA_MIN_SCORE=0.5   (optional)
// The client <CaptchaScript/> + getCaptchaToken() only load Google's script when enabled.

import { HttpError } from './security.js';

export function captchaEnabled() {
  return process.env.RECAPTCHA_ENABLED === 'true' && Boolean(process.env.RECAPTCHA_SECRET_KEY);
}

export async function verifyCaptcha(token, expectedAction, ip) {
  if (!captchaEnabled()) return { skipped: true };
  if (!token) throw new HttpError(400, 'Captcha verification failed.');
  const body = new URLSearchParams({ secret: process.env.RECAPTCHA_SECRET_KEY, response: token });
  if (ip) body.set('remoteip', ip);
  const res = await fetch('https://www.google.com/recaptcha/api/siteverify', { method: 'POST', body });
  const data = await res.json();
  const minScore = Number(process.env.RECAPTCHA_MIN_SCORE || 0.5);
  if (!data.success || data.action !== expectedAction || (data.score ?? 0) < minScore) {
    throw new HttpError(400, 'Captcha verification failed.');
  }
  return { score: data.score };
}
