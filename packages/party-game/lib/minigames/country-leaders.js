'use strict';

// Game 3: Co-Leaders in Crisis
//
// The players co-lead a country facing a major national crisis.
// They are given a problem and must choose the BEST 3 options out of 20 options.
// The AI has judged and ranked all 20 options from #1 (Best, 20 pts) to #20
// (Worst, 1 pt) based on empirical data.
// Points are distributed based on the AI's 1–20 rating:
//   Rank #1 = 20 pts, Rank #2 = 19 pts, ..., Rank #20 = 1 pt (points = 21 - rank).

const { defineMiniGame } = require('./template');

const CRISIS_SCENARIOS = [
  {
    id: 'hospital-trauma-crisis',
    kicker: 'National Crisis #1 · Healthcare & Diagnostic Bottleneck',
    headline: 'Emergency Rooms & Radiology Departments Are at 142% Capacity Nationwide',
    problem:
      'Wait times in emergency departments have hit 9.4 hours, rural trauma centers face closure, and diagnostic imaging / nursing burnout is at 62%. As Co-Leaders of the country, pick the BEST 3 data-backed policies out of 20 to solve the crisis.',
    dataSummary:
      'AI empirical health-systems data shows the highest ROI comes from (1) diverting non-emergency volume to extended-hour urgent/diagnostic clinics (+38% ER throughput), (2) fast-tracking interstate licensure & student-loan forgiveness for imaging/nursing techs, and (3) eliminating insurance prior-authorization delays that trap stabilized patients in acute beds.',
    // Ordered from Rank 1 (20 pts) to Rank 20 (1 pt) before shuffling for display:
    rankedPolicies: [
      { rank: 1, text: 'Fund 24/7 Urgent-Care + Rapid X-Ray/CT Triage Clinics adjacent to ERs to divert non-critical visits', dataNote: 'Cuts ER wait times 38% within 60 days' },
      { rank: 2, text: 'Enact nationwide licensure reciprocity + tax-free loan forgiveness for Radiology Techs, Nurses & ER MDs', dataNote: 'Reduces clinical vacancy rates by 29%' },
      { rank: 3, text: 'Abolish insurance prior-authorization delays for post-acute discharge so hospital beds clear 2x faster', dataNote: 'Frees 18% of inpatient bed capacity immediately' },
      { rank: 4, text: 'Deploy mobile diagnostic imaging & trauma stabilization units to underserved rural counties', dataNote: 'Reduces rural transfer mortality by 22%' },
      { rank: 5, text: 'Mandate safe staffing ratios with federally funded overtime hazard pay and protected rest shifts', dataNote: 'Cuts clinician burnout turnover by 31%' },
      { rank: 6, text: 'Standardize AI-assisted triage pre-screening for fracture/stroke prioritization (with human rad sign-off)', dataNote: 'Speeds critical stat reads by 24%' },
      { rank: 7, text: 'Expand community paramedicine so EMTs can treat minor injuries at home without ER transport', dataNote: 'Diverts 11% of low-acuity ambulance runs' },
      { rank: 8, text: 'Create a national strategic reserve of IV fluids, contrast dye, and generic emergency medications', dataNote: 'Prevents supply-chain procedure cancellations' },
      { rank: 9, text: 'Subsidize hospital-at-home remote telemetry monitoring for stable recovery patients', dataNote: 'Modest 8% bed relief in urban hospitals' },
      { rank: 10, text: 'Double accredited community-college clinical slots for Radiography and Nursing programs', dataNote: 'High long-term value, but 24-month lag' },
      { rank: 11, text: 'Cap medical malpractice non-economic damages for good-faith emergency trauma care', dataNote: 'Lowers defensive medicine ordering by ~5%' },
      { rank: 12, text: 'Publish real-time live ER wait-time dashboards on highway signs and mobile apps', dataNote: 'Shifts 4% of traffic between hospitals' },
      { rank: 13, text: 'Offer $100 tax credits for citizens who complete a basic first-aid and CPR course', dataNote: 'Helpful civic education, minimal ER relief' },
      { rank: 14, text: 'Build three new mega-hospitals in major capitals with a 7-year construction timeline', dataNote: 'Too slow and expensive for an acute crisis' },
      { rank: 15, text: 'Require a $250 upfront cash co-pay before anyone is allowed into an Emergency Room waiting area', dataNote: 'Dangerous: deters heart-attack/stroke care' },
      { rank: 16, text: 'Lengthen mandatory hospital shifts from 12 hours to 18 hours to cover staffing gaps', dataNote: 'Spikes medical errors and mass resignations' },
      { rank: 17, text: 'Cut diagnostic X-ray and CT imaging quality protocols in half to rush patients through', dataNote: 'Causes missed fractures and repeat radiation' },
      { rank: 18, text: 'Nationalize pharmaceutical marketing budgets to print motivational posters for waiting rooms', dataNote: 'Zero clinical throughput impact' },
      { rank: 19, text: 'Close all rural clinics and force every citizen to drive to regional metropolitan hubs', dataNote: 'Collapses urban ERs and spikes rural deaths' },
      { rank: 20, text: 'Replace licensed Radiology Techs and ER triage nurses with unverified chatbots', dataNote: 'Catastrophic misdiagnosis & safety failure' },
    ],
  },
  {
    id: 'grid-cyber-crisis',
    kicker: 'National Crisis #2 · Energy Grid & Cyber-Infrastructure Emergency',
    headline: 'Polar Vortex + Coordinated Grid Cyberattack Threatens 40 Million Homes',
    problem:
      'A winter freeze has pushed power demand 19% above reserve capacity while a foreign ransomware attack just hit regional grid SCADA routers. As Co-Leaders, choose the BEST 3 policies out of 20 based on engineering & resilience data.',
    dataSummary:
      'AI grid-reliability & CISA incident data ranks (1) air-gapping compromised SCADA nodes while activating manual substation islanding, (2) utility-scale battery dispatch + industrial demand-response load shifting, and (3) emergency HVDC interconnect power transfers as the top 3 life-saving interventions.',
    rankedPolicies: [
      { rank: 1, text: 'Isolate compromised SCADA routers to manual air-gapped control & prioritize hospital/water circuits', dataNote: 'Prevents cascading grid collapse in 94% of models' },
      { rank: 2, text: 'Dispatch 100% of grid-scale battery storage & pay heavy industry to shift peak load to off-peak hours', dataNote: 'Shaves 14% off peak winter load immediately' },
      { rank: 3, text: 'Open emergency HVDC cross-regional power interconnects to import surplus power from neighboring grids', dataNote: 'Adds 8.5 GW of clean reserve capacity' },
      { rank: 4, text: 'Deploy CISA incident-response strike teams with immutable offline firmware backups to utilities', dataNote: 'Restores automated substation telemetry in 18h' },
      { rank: 5, text: 'Mandate hardware FIDO2 security keys & zero-trust network segmentation for all utility operators', dataNote: 'Blocks 99% of credential-replay lateral movement' },
      { rank: 6, text: 'Activate voluntary smart-thermostat 2°F peak-shaving credits for residential households', dataNote: 'Saves 3.2 GW across 15M participating homes' },
      { rank: 7, text: 'Grant temporary emergency waivers to run backup dual-fuel peaker plants at full output for 72 hours', dataNote: 'Bridges acute overnight thermal deficit' },
      { rank: 8, text: 'Pre-position mobile diesel/battery microgrids at dialysis centers, trauma hospitals, and shelters', dataNote: 'Zeroes out critical medical outage mortality' },
      { rank: 9, text: 'Require AI hyperscale data centers to throttle non-essential batch training jobs during peak hours', dataNote: 'Frees 2.1 GW of regional transmission capacity' },
      { rank: 10, text: 'Distribute emergency heat-pump & pipe-insulation weatherization grants to low-income housing', dataNote: 'High efficiency gain over 30–60 days' },
      { rank: 11, text: 'Fast-track permitting for shovel-ready solar + storage projects waiting in interconnect queues', dataNote: 'Great 6-month payoff, low 72-hour impact' },
      { rank: 12, text: 'Launch a national SMS alert asking citizens to delay running clothes dryers and dishwashers', dataNote: 'Reduces residential peak by ~1.5%' },
      { rank: 13, text: 'Stockpile domestic transformer coils and high-voltage switchgear in federal depots', dataNote: 'Vital for hardware damage, medium immediate effect' },
      { rank: 14, text: 'Commission a 10-year nuclear modular reactor construction program', dataNote: 'Excellent decade policy, 0% impact this winter' },
      { rank: 15, text: 'shut down all municipal street lights and traffic signals nationwide for two weeks', dataNote: 'Tiny energy savings (<0.4%), spikes traffic fatalities' },
      { rank: 16, text: 'Order utilities to ignore transformer thermal overload limits and run lines at 150% rating', dataNote: 'Melts substation transformers, causing months-long blackouts' },
      { rank: 17, text: 'Pay the hackers $2 Billion in Bitcoin hoping they send a working decryption key', dataNote: '82% re-extortion rate and funds future attacks' },
      { rank: 18, text: 'Ban all electric vehicles from charging anywhere in the country for 60 days', dataNote: 'Strands emergency/commuter fleet for <1% grid share' },
      { rank: 19, text: 'Disconnect the entire national internet backbone to stop the cyberattack', dataNote: 'Paralyzes banking, hospitals, and emergency 911' },
      { rank: 20, text: 'Tell citizens to burn charcoal grills indoors for supplemental living-room heating', dataNote: 'Lethal carbon monoxide poisoning hazard' },
    ],
  },
  {
    id: 'economic-housing-crisis',
    kicker: 'National Crisis #3 · Housing Shortage, Cost-of-Living & Infrastructure Crunch',
    headline: 'Housing Costs Hit Record Highs While Commute Bridges & Supply Chains Stall',
    problem:
      'Housing supply is 4.2 million units short, grocery freight costs are up 28% due to aging rail/port bottlenecks, and young families are priced out. As Co-Leaders, pick the BEST 3 data-rated policies out of 20.',
    dataSummary:
      'AI macroeconomic & urban-planning data ranks (1) by-right multi-family & starter-home zoning reform + automated 14-day digital building permits, (2) automated port/rail freight corridor upgrades, and (3) modular/prefab construction financing + trade-school apprenticeships as the highest-impact solutions.',
    rankedPolicies: [
      { rank: 1, text: 'Legalize by-right starter homes & middle-housing near transit + mandate 14-day automated digital permitting', dataNote: 'Boosts housing starts 34% and cuts build cost 18%' },
      { rank: 2, text: 'Modernize freight rail bottlenecks & port cranes with 24/7 automated intermodal customs clearing', dataNote: 'Lowers grocery & building-material shipping cost 21%' },
      { rank: 3, text: 'Fund paid apprenticeships for electricians, plumbers & builders + low-interest modular factory loans', dataNote: 'Resolves 45% of skilled construction labor shortage' },
      { rank: 4, text: 'Convert vacant commercial office buildings into residential apartments via tax-abatement fast tracks', dataNote: 'Adds 320,000 urban units in 18 months' },
      { rank: 5, text: 'Eliminate tariffs on lumber, steel, electrical transformers, and HVAC heat-pump components', dataNote: 'Drops per-home materials cost by $19,000' },
      { rank: 6, text: 'Target down-payment assistance strictly to first-time owner-occupant families (paired with supply)', dataNote: 'Raises first-time homeownership without fueling investor bids' },
      { rank: 7, text: 'Enact progressive vacancy & bulk-speculation taxes on institutional portfolios holding >100 empty homes', dataNote: 'Returns 140,000 idle homes to active market' },
      { rank: 8, text: 'Standardize pre-approved architectural blueprints for ADUs (backyard cottages) and duplexes', dataNote: 'Saves $15k and 4 months of architectural review' },
      { rank: 9, text: 'Invest in predictive bridge & highway maintenance sensors to prevent emergency freight detours', dataNote: 'Prevents $14B/yr in supply-chain delay losses' },
      { rank: 10, text: 'Expand universal pre-K and childcare tax credits so working parents can stay in the labor force', dataNote: 'Increases household disposable income & GDP +1.2%' },
      { rank: 11, text: 'Release underutilized non-conservation federal land parcels near cities for workforce housing', dataNote: 'Moderate supply boost in Western metros' },
      { rank: 12, text: 'Create a national portable mortgage rule so homeowners can move without losing their locked rate', dataNote: 'Unlocks existing home inventory turnover' },
      { rank: 13, text: 'Subsidize regional passenger rail expansion between satellite towns and job centers', dataNote: 'Strong 5-year regional benefit' },
      { rank: 14, text: 'Cap credit-card late fees at $8 and ban hidden junk fees on apartment rental applications', dataNote: 'Popular consumer relief, small housing-supply effect' },
      { rank: 15, text: 'Give every buyer an unconditional $50,000 cash voucher without building any new homes', dataNote: 'Immediately bid into higher home prices (+9% inflation)' },
      { rank: 16, text: 'Freeze all residential construction for 3 years while a committee studies neighborhood aesthetics', dataNote: 'Deepens the housing deficit by 1.5M units' },
      { rank: 17, text: 'Impose strict nationwide price controls on groceries and building lumber below production cost', dataNote: 'Triggers immediate store shortages and sawmill closures' },
      { rank: 18, text: 'Double property taxes on primary residences to discourage people from wanting larger houses', dataNote: 'Causes widespread family foreclosures' },
      { rank: 19, text: 'Abolish all structural and fire-safety building codes so contractors can build out of anything', dataNote: 'Severe structural collapse and fire mortality risk' },
      { rank: 20, text: 'Print $5 Trillion in new currency to mail everyone a check and declare inflation illegal', dataNote: 'Hyperinflation & bond market collapse' },
    ],
  },
];

function rankToPoints(rank) {
  return Math.max(1, 21 - Number(rank || 20));
}

function normalizePicks(rawAnswer, validIds, pickCount = 3) {
  const list = Array.isArray(rawAnswer)
    ? rawAnswer
    : Array.isArray(rawAnswer?.optionIds)
      ? rawAnswer.optionIds
      : typeof rawAnswer === 'string' && rawAnswer
        ? [rawAnswer]
        : [];
  const validSet = new Set(validIds);
  const out = [];
  for (const id of list) {
    const clean = String(id || '');
    if (validSet.has(clean) && !out.includes(clean)) {
      out.push(clean);
      if (out.length >= pickCount) break;
    }
  }
  return out;
}

module.exports = defineMiniGame({
  id: 'country-leaders',
  title: 'Co-Leaders in Crisis',
  icon: '🏛️',
  tagline: 'Co-lead the country. Pick the best 3 solutions out of 20 AI-ranked options.',
  description: 'You and your partner are Co-Leaders of a nation facing a crisis. Choose the best 3 policies out of 20 options. The AI has rated all 20 options from #1 (20 pts) to #20 (1 pt) based on real-world data!',
  minGuests: 2,
  defaultRounds: 3,
  preserveAllRounds: true,
  answerSeconds: 75,

  async buildRounds(ctx, count = 3) {
    if (!ctx.guests.length) return [];
    const total = Math.min(CRISIS_SCENARIOS.length, Math.max(1, Number(count) || 3));
    const scenarios = CRISIS_SCENARIOS.slice(0, total);
    const leaderNames = ctx.guests.map((g) => g.name).join(' & ');

    return scenarios.map((sc, idx) => {
      // Shuffle the 20 policies so the player can't just click the first 3
      const shuffled = ctx.shuffle(sc.rankedPolicies);
      const policyMap = {};
      const options = shuffled.map((pol, i) => {
        const id = `pol_${i + 1}`;
        const pts = rankToPoints(pol.rank);
        policyMap[id] = {
          id,
          displayNum: i + 1,
          label: `${i + 1}. ${pol.text}`,
          shortText: pol.text,
          aiRank: pol.rank,
          points: pts,
          dataNote: pol.dataNote,
        };
        return {
          id,
          label: `${i + 1}. ${pol.text}`,
        };
      });

      const rank1Entry = Object.values(policyMap).find((p) => p.aiRank === 1);

      return {
        crisisIndex: idx + 1,
        scenarioId: sc.id,
        dataSummary: sc.dataSummary,
        policyMap,
        correctId: rank1Entry ? rank1Entry.id : options[0].id,
        prompt: {
          kicker: `${sc.kicker} · Co-Leaders: ${leaderNames}`,
          headline: sc.headline,
          body: sc.problem,
          caption: 'Select your TOP 3 policies out of 20 on your controller. AI Data Rating: #1 = 20 pts, #2 = 19 pts, #3 = 18 pts … #20 = 1 pt (Max 57 pts + Co-Leader Consensus Bonus!)',
          inputMode: 'multi',
          pickCount: 3,
          options,
          excludeGuestIds: [],
          layout: 'grid-20',
          seconds: 75,
        },
      };
    });
  },

  correctOption(round) {
    return round.correctId;
  },

  score(round, answers, ctx) {
    const validIds = round.prompt.options.map((o) => o.id);
    const awards = {};
    const awardReasons = {};
    const playerPicks = {};

    for (const g of ctx.guests) {
      const picks = normalizePicks(answers?.[g.id], validIds, 3);
      playerPicks[g.id] = picks;
      if (!picks.length) continue;
      let totalPts = 0;
      const parts = [];
      for (const pid of picks) {
        const pol = round.policyMap[pid];
        if (!pol) continue;
        totalPts += pol.points;
        parts.push(`#${pol.aiRank} (+${pol.points})`);
      }
      awards[g.id] = totalPts;
      awardReasons[g.id] = `AI Ranks ${parts.join(', ')}`;
    }

    // Co-Leader Consensus Bonus: if 2+ co-leaders independently agree on the same Top-5 policy (aiRank <= 5)
    const consensusPolicies = [];
    if (ctx.guests.length >= 2) {
      for (const pol of Object.values(round.policyMap)) {
        if (pol.aiRank <= 5) {
          const pickers = ctx.guests.filter((g) => (playerPicks[g.id] || []).includes(pol.id));
          if (pickers.length >= 2) {
            consensusPolicies.push(pol);
            for (const g of pickers) {
              awards[g.id] = (awards[g.id] || 0) + 3;
              awardReasons[g.id] = `${awardReasons[g.id]} · +3 Co-Leader Consensus (#${pol.aiRank})`;
            }
          }
        }
      }
    }

    // Build per-option metadata for the 20-card TV reveal grid
    const optionMeta = {};
    for (const pol of Object.values(round.policyMap)) {
      const pickedBy = ctx.guests
        .filter((g) => (playerPicks[g.id] || []).includes(pol.id))
        .map((g) => g.name);
      const badgeKind = pol.aiRank <= 3
        ? 'rank-top'
        : pol.aiRank <= 7
          ? 'rank-good'
          : pol.aiRank <= 14
            ? 'rank-mid'
            : 'rank-low';
      optionMeta[pol.id] = {
        badge: `AI #${pol.aiRank} · +${pol.points} pt${pol.points === 1 ? '' : 's'}`,
        badgeKind,
        aiRank: pol.aiRank,
        points: pol.points,
        pickedBy,
      };
    }

    const sortedByRank = Object.values(round.policyMap).sort((a, b) => a.aiRank - b.aiRank);
    const top3 = sortedByRank.slice(0, 3);
    const playerSummaries = ctx.guests.map((g) => {
      const picks = (playerPicks[g.id] || []).map((pid) => round.policyMap[pid]).filter(Boolean);
      if (!picks.length) return `${g.name}: no policies locked in`;
      const breakdown = picks.map((p) => `Option ${p.displayNum} [AI #${p.aiRank} = +${p.points}]`).join(', ');
      return `${g.name}: ${awards[g.id] || 0} pts (${breakdown})`;
    });

    return {
      correct: round.correctId,
      awards,
      awardReasons,
      fooled: [],
      subjectId: null,
      bluffer: null,
      optionMeta,
      reveal: {
        headline: `🏛️ AI Top 3 Policies: #1 Option ${top3[0].displayNum} (20 pts) · #2 Option ${top3[1].displayNum} (19 pts) · #3 Option ${top3[2].displayNum} (18 pts)`,
        detail: `${playerSummaries.join('  |  ')}. ${round.dataSummary}`,
      },
    };
  },

  narration: {
    intro: () => 'Game three: Co-Leaders in Crisis! You and your partner co-lead a country. For each national crisis, choose the best three policies out of twenty options. The A I has rated all twenty from number one, worth twenty points, down to number twenty, worth one point, based on data!',
    round: (r) => `${r.prompt.kicker}. ${r.prompt.headline}. ${r.prompt.body} Pick your top three options on your controller now!`,
    reveal: (r, res) => `${res.reveal.headline}. ${r.dataSummary}`,
  },
});
