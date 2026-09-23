import { dbKind, one } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await one('SELECT 1 AS ok');
    return Response.json({ ok: true, db: await dbKind(), captcha: process.env.RECAPTCHA_ENABLED === 'true' });
  } catch (err) {
    console.error(err);
    return Response.json({ ok: false, error: 'database unavailable' }, { status: 503 });
  }
}
