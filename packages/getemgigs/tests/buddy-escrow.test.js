import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateDistanceMeters, verifyVenueCheckIn } from '../src/lib/geo.js';
import { store } from '../src/lib/storage.js';

describe('The Gig Bandit: Geolocation & Distance Verification', () => {
  it('accurately computes Haversine distance between two coordinates', () => {
    // The Subterranean Lounge (Austin, TX)
    const venueLat = 30.2672;
    const venueLon = -97.7431;

    // Point 25 meters away
    const nearLat = 30.2673;
    const nearLon = -97.7432;
    const distNear = calculateDistanceMeters(nearLat, nearLon, venueLat, venueLon);
    assert.ok(distNear < 50, `Distance should be under 50m, got ${distNear}m`);

    // Point 1.8 kilometers away
    const farLat = 30.2820;
    const farLon = -97.7320;
    const distFar = calculateDistanceMeters(farLat, farLon, venueLat, venueLon);
    assert.ok(distFar > 1500, `Distance should be over 1500m, got ${distFar}m`);
  });

  it('verifies check-in within 150m boundary and rejects out-of-range fixes', () => {
    const venueLat = 30.2672;
    const venueLon = -97.7431;

    // Inside venue boundary
    const verified = verifyVenueCheckIn(30.2673, -97.7432, venueLat, venueLon, 150);
    assert.strictEqual(verified.isVerified, true);
    assert.ok(verified.distanceMeters <= 150);
    assert.match(verified.message, /Geolocation Verified/);

    // Outside venue boundary (bailed at home)
    const failed = verifyVenueCheckIn(30.2820, -97.7320, venueLat, venueLon, 150);
    assert.strictEqual(failed.isVerified, false);
    assert.ok(failed.distanceMeters > 150);
    assert.match(failed.message, /Check-in Failed/);
  });
});

describe('The Gig Bandit: Buddy Gig Escrow Lifecycle', () => {
  it('creates mutual agreement and locks security deposit in escrow', () => {
    const link = store.createBuddyLink('gig-103', 'gig-104', 50);
    assert.ok(link.id);
    assert.strictEqual(link.status, 'ESCROW_LOCKED');
    assert.strictEqual(link.securityDepositAmount, 50);
    assert.strictEqual(link.checkIns.length, 2);
    assert.strictEqual(link.checkIns[0].attended, false);
    assert.strictEqual(link.checkIns[1].attended, false);
  });

  it('reimburses security deposit when attendee check-in is verified by geolocation', () => {
    // Velvet Riot checking in for The Neon Vipers show at venue-1 (Austin: 30.2672, -97.7431)
    const link = store.getBuddyLinks()[0];
    const initialBalance = store.getGroupById('group-2').escrowBalance;

    const res = store.verifyAndProcessCheckIn(link.id, 'group-2', 30.2673, -97.7432);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.escrowAction, 'DEPOSIT_REIMBURSED');
    assert.strictEqual(res.refundedAmount, 50);

    const updatedGroup = store.getGroupById('group-2');
    assert.strictEqual(updatedGroup.escrowBalance, initialBalance + 50);
  });

  it('forfeits security deposit and pays host band if attendee bails (no-show)', () => {
    // Create new buddy link to test forfeiture
    const testLink = store.createBuddyLink('gig-101', 'gig-103', 75);
    const hostInitialBalance = store.getGroupById('group-1').escrowBalance;

    // Simulate group-3 bailing
    const forfeitRes = store.forfeitNoShowDeposit(testLink.id, 'group-3');
    assert.strictEqual(forfeitRes.success, true);
    assert.strictEqual(forfeitRes.escrowAction, 'PAYOUT_TRANSFERRED_TO_HOST');
    assert.strictEqual(forfeitRes.amountTransferred, 75);
    assert.strictEqual(forfeitRes.recipientGroupId, 'group-1');

    const updatedHost = store.getGroupById('group-1');
    assert.strictEqual(updatedHost.escrowBalance, hostInitialBalance + 75);
  });
});

describe('The Gig Bandit: Stay-To-Play Reciprocal Ticket Pools', () => {
  it('allows bands to join Stay-To-Play pool, eliminating predatory pay-to-play', () => {
    const pools = store.getStayToPlayPools();
    assert.ok(pools.length > 0);

    const initialTotal = pools[0].poolTotalTickets;
    const updated = store.joinStayToPlay('stp-1', 'group-4', 4);
    assert.ok(updated.participatingBands.includes('group-4'));
    assert.strictEqual(updated.poolTotalTickets, initialTotal + 4);
  });
});
