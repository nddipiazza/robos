'use client';

export async function api(url, { method = 'POST', body } = {}) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    // ignore
  }
  if (!res.ok && data.ok !== false) data = { ...data, ok: false, error: data.error || `Request failed (${res.status})` };
  return { status: res.status, ...data };
}

export async function getCaptchaToken(action) {
  if (process.env.NEXT_PUBLIC_RECAPTCHA_ENABLED !== 'true') return undefined;
  const key = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  const g = typeof window !== 'undefined' ? window.grecaptcha : null;
  if (!key || !g) return undefined;
  return new Promise((resolve) => g.ready(() => g.execute(key, { action }).then(resolve, () => resolve(undefined))));
}
