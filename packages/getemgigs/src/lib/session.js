// Next.js request helpers: current user for server components and API route wrappers.

import { cookies } from 'next/headers';
import { cache } from 'react';
import { SESSION_COOKIE, userForToken } from './auth.js';
import { HttpError, assertSameOrigin } from './security.js';

export const currentUser = cache(async () => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  try {
    return await userForToken(token);
  } catch (err) {
    console.error('session lookup failed', err);
    return null;
  }
});

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new HttpError(401, 'Please log in first.');
  return user;
}

export async function requireBand() {
  const user = await requireUser();
  if (!user.band) throw new HttpError(409, 'Create your band profile first.');
  return user;
}

export async function readJson(request) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > 20000) throw new HttpError(413, 'Request too large.');
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('bad');
    return body;
  } catch {
    throw new HttpError(400, 'Invalid JSON body.');
  }
}

/** Wrap a route handler: same-origin check on mutations and uniform error responses. */
export function route(handler) {
  return async (request, ctx) => {
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') assertSameOrigin(request);
      const params = ctx?.params ? await ctx.params : {};
      return await handler(request, params);
    } catch (err) {
      if (err instanceof HttpError) {
        const headers = {};
        if (err.extra?.retryAfter) headers['Retry-After'] = String(err.extra.retryAfter);
        return Response.json({ ok: false, error: err.message }, { status: err.status, headers });
      }
      console.error(err);
      return Response.json({ ok: false, error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
  };
}
