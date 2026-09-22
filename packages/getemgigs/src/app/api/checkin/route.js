import { store } from '../../../lib/storage.js';

export async function POST(request) {
  try {
    const { buddyLinkId, attendeeGroupId, lat, lon } = await request.json();
    if (!buddyLinkId || !attendeeGroupId || typeof lat !== 'number' || typeof lon !== 'number') {
      return Response.json({
        success: false,
        error: 'Missing required payload: buddyLinkId, attendeeGroupId, lat, and lon must be numbers.',
      }, { status: 400 });
    }

    const result = store.verifyAndProcessCheckIn(buddyLinkId, attendeeGroupId, lat, lon);

    if (result.success) {
      return Response.json(result, { status: 200 });
    } else {
      return Response.json(result, { status: 422 });
    }
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
