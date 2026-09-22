import { store } from '../../../lib/storage.js';

export async function GET() {
  const groups = store.getGroups();
  const links = store.getBuddyLinks();
  const totalLocked = links.reduce((sum, l) => sum + (l.securityDepositAmount * 2), 0);

  return Response.json({
    success: true,
    totalEscrowLocked: totalLocked,
    activeAgreements: links.length,
    groups: groups.map(g => ({
      id: g.id,
      name: g.name,
      escrowBalance: g.escrowBalance,
      reputationScore: g.reputationScore,
    })),
  });
}

export async function POST(request) {
  try {
    const { action, buddyLinkId, bailedGroupId } = await request.json();

    if (action === 'FORFEIT_NO_SHOW') {
      if (!buddyLinkId || !bailedGroupId) {
        return Response.json({ success: false, error: 'buddyLinkId and bailedGroupId are required' }, { status: 400 });
      }
      const result = store.forfeitNoShowDeposit(buddyLinkId, bailedGroupId);
      return Response.json(result);
    }

    return Response.json({ success: false, error: 'Unknown escrow action' }, { status: 400 });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}
