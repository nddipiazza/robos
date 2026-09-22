import { verifyVenueCheckIn } from './geo.js';

// Pre-seeded local music ecosystem
const INITIAL_VENUES = [
  {
    id: 'venue-1',
    name: 'The Subterranean Lounge',
    city: 'Austin, TX',
    address: '412 E 6th St',
    capacity: 250,
    lat: 30.2672,
    lon: -97.7431,
    stayToPlayPartner: true,
  },
  {
    id: 'venue-2',
    name: 'Black Velvet Ballroom',
    city: 'Nashville, TN',
    address: '810 Broadway',
    capacity: 350,
    lat: 36.1627,
    lon: -86.7816,
    stayToPlayPartner: true,
  },
  {
    id: 'venue-3',
    name: 'Mercury Electric Room',
    city: 'Brooklyn, NY',
    address: '217 N 12th St',
    capacity: 180,
    lat: 40.7128,
    lon: -73.9610,
    stayToPlayPartner: true,
  },
  {
    id: 'venue-4',
    name: 'The Echo Chamber',
    city: 'Seattle, WA',
    address: '1420 2nd Ave',
    capacity: 300,
    lat: 47.6062,
    lon: -122.3321,
    stayToPlayPartner: true,
  },
];

const INITIAL_GROUPS = [
  {
    id: 'group-1',
    name: 'The Neon Vipers',
    genre: 'Synthwave / Indie Rock',
    hometown: 'Austin, TX',
    membersCount: 4,
    bio: 'Driving 80s synthesizers meets gritty garage rock guitars.',
    escrowBalance: 150,
    reputationScore: 98,
    avatar: '🎸',
  },
  {
    id: 'group-2',
    name: 'Velvet Riot',
    genre: 'Post-Punk / Alternative',
    hometown: 'Austin, TX',
    membersCount: 3,
    bio: 'Punchy basslines and angular reverb guitars for midnight dancers.',
    escrowBalance: 200,
    reputationScore: 94,
    avatar: '⚡',
  },
  {
    id: 'group-3',
    name: 'Electric Brass Syndicate',
    genre: 'Funk / Soul Fusion',
    hometown: 'Nashville, TN',
    membersCount: 6,
    bio: 'High-energy horns, infectious grooves, and heavy rhythm sections.',
    escrowBalance: 100,
    reputationScore: 91,
    avatar: '🎺',
  },
  {
    id: 'group-4',
    name: 'Midnight Echoes',
    genre: 'Dream Pop / Shoegaze',
    hometown: 'Brooklyn, NY',
    membersCount: 4,
    bio: 'Lush sonic textures and ethereal vocal harmonies.',
    escrowBalance: 75,
    reputationScore: 88,
    avatar: '🌙',
  },
  {
    id: 'group-5',
    name: 'Rusty Anchor Collective',
    genre: 'Folk / Americana',
    hometown: 'Seattle, WA',
    membersCount: 5,
    bio: 'Banjo, fiddle, stomp boxes, and rowdy communal choruses.',
    escrowBalance: 125,
    reputationScore: 96,
    avatar: '🪕',
  },
];

const INITIAL_GIGS = [
  {
    id: 'gig-101',
    title: 'Neon Underground: Friday Night Showcase',
    groupId: 'group-1',
    groupName: 'The Neon Vipers',
    venueId: 'venue-1',
    venueName: 'The Subterranean Lounge',
    date: '2026-10-02',
    doorsTime: '20:00',
    ticketPrice: 15,
    buddiedGigId: 'gig-102',
    status: 'SCHEDULED',
    securityDeposit: 50,
  },
  {
    id: 'gig-102',
    title: 'Post-Punk Saturday Revelry',
    groupId: 'group-2',
    groupName: 'Velvet Riot',
    venueId: 'venue-1',
    venueName: 'The Subterranean Lounge',
    date: '2026-10-10',
    doorsTime: '21:00',
    ticketPrice: 12,
    buddiedGigId: 'gig-101',
    status: 'SCHEDULED',
    securityDeposit: 50,
  },
  {
    id: 'gig-103',
    title: 'Funk & Soul Revolution',
    groupId: 'group-3',
    groupName: 'Electric Brass Syndicate',
    venueId: 'venue-2',
    venueName: 'Black Velvet Ballroom',
    date: '2026-10-16',
    doorsTime: '19:30',
    ticketPrice: 18,
    buddiedGigId: null,
    status: 'LOOKING_FOR_BUDDY',
    securityDeposit: 50,
  },
  {
    id: 'gig-104',
    title: 'Shoegaze Reverie Vol. 4',
    groupId: 'group-4',
    groupName: 'Midnight Echoes',
    venueId: 'venue-3',
    venueName: 'Mercury Electric Room',
    date: '2026-10-23',
    doorsTime: '20:30',
    ticketPrice: 15,
    buddiedGigId: null,
    status: 'LOOKING_FOR_BUDDY',
    securityDeposit: 40,
  },
];

const INITIAL_BUDDY_LINKS = [
  {
    id: 'buddy-link-1',
    gig1Id: 'gig-101',
    group1Id: 'group-1',
    group1Name: 'The Neon Vipers',
    gig2Id: 'gig-102',
    group2Id: 'group-2',
    group2Name: 'Velvet Riot',
    venueId: 'venue-1',
    securityDepositAmount: 50,
    status: 'ESCROW_LOCKED',
    terms: 'Mutual attendance agreement: The Neon Vipers attend Velvet Riot gig on Oct 10; Velvet Riot attends The Neon Vipers gig on Oct 2.',
    checkIns: [
      {
        groupId: 'group-2',
        groupName: 'Velvet Riot',
        gigId: 'gig-101',
        attended: false,
        verifiedAt: null,
      },
      {
        groupId: 'group-1',
        groupName: 'The Neon Vipers',
        gigId: 'gig-102',
        attended: false,
        verifiedAt: null,
      },
    ],
  },
];

const INITIAL_STAY_TO_PLAY_POOLS = [
  {
    id: 'stp-1',
    venueId: 'venue-1',
    venueName: 'The Subterranean Lounge',
    cycle: 'October 2026',
    ticketsPerBand: 4,
    ticketPrice: 12,
    participatingBands: ['group-1', 'group-2'],
    poolTotalTickets: 8,
    description: 'Bands purchase 4 tickets to another bill at Subterranean Lounge to support fellow acts, unlocking prime weekend booking slots.',
  },
  {
    id: 'stp-2',
    venueId: 'venue-2',
    venueName: 'Black Velvet Ballroom',
    cycle: 'October 2026',
    ticketsPerBand: 5,
    ticketPrice: 15,
    participatingBands: ['group-3'],
    poolTotalTickets: 5,
    description: 'Replace pay-to-play with mutual attendance. Attend a fellow Nashville act show and secure headliner slot.',
  },
];

// In-Memory Data Store (Singleton)
class MemoryDataStore {
  constructor() {
    this.venues = JSON.parse(JSON.stringify(INITIAL_VENUES));
    this.groups = JSON.parse(JSON.stringify(INITIAL_GROUPS));
    this.gigs = JSON.parse(JSON.stringify(INITIAL_GIGS));
    this.buddyLinks = JSON.parse(JSON.stringify(INITIAL_BUDDY_LINKS));
    this.stayToPlayPools = JSON.parse(JSON.stringify(INITIAL_STAY_TO_PLAY_POOLS));
  }

  // Venues
  getVenues() {
    return this.venues;
  }
  getVenueById(id) {
    return this.venues.find(v => v.id === id) || null;
  }

  // Groups
  getGroups() {
    return this.groups;
  }
  getGroupById(id) {
    return this.groups.find(g => g.id === id) || null;
  }

  // Gigs
  getGigs() {
    return this.gigs.map(gig => {
      const venue = this.getVenueById(gig.venueId);
      const group = this.getGroupById(gig.groupId);
      return {
        ...gig,
        venue,
        group,
      };
    });
  }
  getGigById(id) {
    const gig = this.gigs.find(g => g.id === id);
    if (!gig) return null;
    return {
      ...gig,
      venue: this.getVenueById(gig.venueId),
      group: this.getGroupById(gig.groupId),
    };
  }
  createGig(data) {
    const newId = 'gig-' + (Date.now() % 10000);
    const newGig = {
      id: newId,
      title: data.title || 'Untitled Gig',
      groupId: data.groupId,
      groupName: data.groupName || this.getGroupById(data.groupId)?.name || 'Local Act',
      venueId: data.venueId,
      venueName: data.venueName || this.getVenueById(data.venueId)?.name || 'Local Venue',
      date: data.date || new Date().toISOString().split('T')[0],
      doorsTime: data.doorsTime || '20:00',
      ticketPrice: Number(data.ticketPrice) || 15,
      buddiedGigId: null,
      status: 'LOOKING_FOR_BUDDY',
      securityDeposit: Number(data.securityDeposit) || 50,
    };
    this.gigs.push(newGig);
    return this.getGigById(newId);
  }

  // Buddy Gigs & Escrow
  getBuddyLinks() {
    return this.buddyLinks;
  }
  getBuddyLinkById(id) {
    return this.buddyLinks.find(b => b.id === id) || null;
  }
  createBuddyLink(gig1Id, gig2Id, securityDeposit = 50) {
    const gig1 = this.getGigById(gig1Id);
    const gig2 = this.getGigById(gig2Id);
    if (!gig1 || !gig2) throw new Error('One or both gigs not found');

    const buddyId = 'buddy-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    const newLink = {
      id: buddyId,
      gig1Id,
      group1Id: gig1.groupId,
      group1Name: gig1.groupName,
      gig2Id,
      group2Id: gig2.groupId,
      group2Name: gig2.groupName,
      venueId: gig1.venueId,
      securityDepositAmount: Number(securityDeposit),
      status: 'ESCROW_LOCKED',
      terms: `Mutual agreement: ${gig1.groupName} attends ${gig2.groupName}'s show on ${gig2.date}; ${gig2.groupName} attends ${gig1.groupName}'s show on ${gig1.date}. $${securityDeposit} refundable deposit held in escrow.`,
      checkIns: [
        {
          groupId: gig2.groupId,
          groupName: gig2.groupName,
          gigId: gig1Id,
          attended: false,
          verifiedAt: null,
        },
        {
          groupId: gig1.groupId,
          groupName: gig1.groupName,
          gigId: gig2Id,
          attended: false,
          verifiedAt: null,
        },
      ],
    };

    // Update gigs to buddied
    gig1.buddiedGigId = gig2Id;
    gig1.status = 'BUDDIED_ESCROW_LOCKED';
    gig2.buddiedGigId = gig1Id;
    gig2.status = 'BUDDIED_ESCROW_LOCKED';

    this.buddyLinks.push(newLink);
    return newLink;
  }

  // Process Geolocation Check-In
  verifyAndProcessCheckIn(buddyLinkId, attendeeGroupId, attendeeLat, attendeeLon) {
    const link = this.getBuddyLinkById(buddyLinkId);
    if (!link) {
      return { success: false, message: 'Buddy Gig link not found' };
    }

    // Determine target gig and venue
    const checkInRecord = link.checkIns.find(c => c.groupId === attendeeGroupId);
    if (!checkInRecord) {
      return { success: false, message: 'Group is not a participant in this Buddy Gig contract' };
    }

    const targetGig = this.getGigById(checkInRecord.gigId);
    if (!targetGig || !targetGig.venue) {
      return { success: false, message: 'Target gig or venue not found' };
    }

    // Verify distance with geo helper (150m boundary)
    const verification = verifyVenueCheckIn(
      Number(attendeeLat),
      Number(attendeeLon),
      targetGig.venue.lat,
      targetGig.venue.lon,
      150
    );

    if (verification.isVerified) {
      checkInRecord.attended = true;
      checkInRecord.verifiedAt = new Date().toISOString();
      checkInRecord.distanceMeters = verification.distanceMeters;

      // Reimburse security deposit
      const attendeeGroup = this.getGroupById(attendeeGroupId);
      if (attendeeGroup) {
        attendeeGroup.escrowBalance = (attendeeGroup.escrowBalance || 0) + link.securityDepositAmount;
        attendeeGroup.reputationScore = Math.min(100, (attendeeGroup.reputationScore || 90) + 2);
      }

      // Check if both groups completed their check-in
      const allAttended = link.checkIns.every(c => c.attended);
      if (allAttended) {
        link.status = 'COMPLETED_ALL_REIMBURSED';
      } else {
        link.status = 'PARTIAL_ATTENDANCE_VERIFIED';
      }

      return {
        success: true,
        verification,
        escrowAction: 'DEPOSIT_REIMBURSED',
        refundedAmount: link.securityDepositAmount,
        buddyLink: link,
      };
    } else {
      return {
        success: false,
        verification,
        escrowAction: 'PENDING_OR_HELD',
        buddyLink: link,
      };
    }
  }

  // Forfeit No-Show Deposit (Simulates 6:00 AM next-day reconciliation)
  forfeitNoShowDeposit(buddyLinkId, bailedGroupId) {
    const link = this.getBuddyLinkById(buddyLinkId);
    if (!link) return { success: false, message: 'Buddy link not found' };

    const bailedRecord = link.checkIns.find(c => c.groupId === bailedGroupId);
    if (!bailedRecord) return { success: false, message: 'Group record not found' };

    if (bailedRecord.attended) {
      return { success: false, message: 'Group already attended and verified. Cannot forfeit.' };
    }

    // Host group gets the forfeited deposit!
    const hostGroupId = link.group1Id === bailedGroupId ? link.group2Id : link.group1Id;
    const hostGroup = this.getGroupById(hostGroupId);
    const bailedGroup = this.getGroupById(bailedGroupId);

    if (hostGroup) {
      hostGroup.escrowBalance = (hostGroup.escrowBalance || 0) + link.securityDepositAmount;
    }
    if (bailedGroup) {
      bailedGroup.reputationScore = Math.max(50, (bailedGroup.reputationScore || 90) - 8);
    }

    bailedRecord.forfeited = true;
    bailedRecord.forfeitedAt = new Date().toISOString();
    link.status = 'NO_SHOW_FORFEITED_PAID_TO_HOST';

    return {
      success: true,
      escrowAction: 'PAYOUT_TRANSFERRED_TO_HOST',
      recipientGroupId: hostGroupId,
      recipientGroupName: hostGroup?.name,
      amountTransferred: link.securityDepositAmount,
      reason: 'Attendee group failed to check-in at venue before deadline.',
      buddyLink: link,
    };
  }

  // Stay-To-Play Ticket Pools
  getStayToPlayPools() {
    return this.stayToPlayPools;
  }
  joinStayToPlay(poolId, bandId, ticketCount = 4) {
    const pool = this.stayToPlayPools.find(p => p.id === poolId);
    if (!pool) throw new Error('Stay-to-Play pool not found');

    if (!pool.participatingBands.includes(bandId)) {
      pool.participatingBands.push(bandId);
      pool.poolTotalTickets += Number(ticketCount);
    }
    return pool;
  }
}

// Global instance
export const store = new MemoryDataStore();
