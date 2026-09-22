import { store } from '../../../lib/storage.js';

export async function GET() {
  const pools = store.getStayToPlayPools();
  return Response.json({
    success: true,
    pools,
  });
}

export async function POST(request) {
  try {
    const { poolId, bandId, ticketCount } = await request.json();
    if (!poolId || !bandId) {
      return Response.json({ success: false, error: 'poolId and bandId are required' }, { status: 400 });
    }
    const updated = store.joinStayToPlay(poolId, bandId, ticketCount);
    return Response.json({
      success: true,
      message: 'Successfully enrolled in Stay-to-Play reciprocal ticket pool!',
      pool: updated,
    });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
