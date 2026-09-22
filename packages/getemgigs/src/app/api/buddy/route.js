import { store } from '../../../lib/storage.js';

export async function GET() {
  const links = store.getBuddyLinks();
  return Response.json({
    success: true,
    count: links.length,
    buddyLinks: links,
  });
}

export async function POST(request) {
  try {
    const { gig1Id, gig2Id, securityDeposit = 50 } = await request.json();
    if (!gig1Id || !gig2Id) {
      return Response.json({ success: false, error: 'Both gig1Id and gig2Id are required to link a Buddy Gig' }, { status: 400 });
    }
    const link = store.createBuddyLink(gig1Id, gig2Id, securityDeposit);
    return Response.json({
      success: true,
      message: 'Buddy Gig agreement established. Security deposit escrow is locked.',
      buddyLink: link,
    }, { status: 201 });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
