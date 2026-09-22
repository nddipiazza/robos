import { store } from '../../../lib/storage.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get('city');
  const status = searchParams.get('status');

  let gigs = store.getGigs();

  if (city) {
    gigs = gigs.filter(g => g.venue && g.venue.city.toLowerCase().includes(city.toLowerCase()));
  }
  if (status) {
    gigs = gigs.filter(g => g.status === status);
  }

  return Response.json({
    success: true,
    total: gigs.length,
    gigs,
  });
}

export async function POST(request) {
  try {
    const data = await request.json();
    if (!data.groupId || !data.venueId || !data.title) {
      return Response.json({ success: false, error: 'Missing required gig fields' }, { status: 400 });
    }
    const created = store.createGig(data);
    return Response.json({ success: true, gig: created }, { status: 201 });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
