'use strict';
// Tow plugin: the Tow desk (calls, dispatch, drop-off), tow invoices at Checkout, report cards, and the Front desk
// add-on that sends our own truck for a car that cannot be driven in.
module.exports = core => {
  const tow = require('./tow')(core), { STAGE_LABELS } = require('./tow'), { dayAt, validInstant } = core.reports;
  const linked = (n, p) => n?.[p]?.['@id'];
  return {
    actions: { towForm: tow.towForm, towBoard: tow.towBoard, takeTowCall: tow.takeTowCall, quoteTow: tow.quoteTow, dispatchTow: tow.dispatchTow, arriveTow: tow.arriveTow, hookTow: tow.hookTow, deliverTow: tow.deliverTow, cancelTow: tow.cancelTow, issueTowInvoice: tow.issueTowInvoice, closeTow: tow.closeTow, saveTowTruck: tow.saveTowTruck, saveTowRates: tow.saveTowRates },
    // Tow calls are billed and paid like repair jobs, so payments, balances and profit count them.
    billableTypes: ['robos:TowJob'],
    reportCards(nodes, { now, timeZone, periods, asOf }) {
      const tows = nodes.filter(n => n['@type'] === 'robos:TowJob'), count = (...s) => tows.filter(t => s.includes(t['robos:jobStatus'])).length;
      const delivered = tows.filter(t => validInstant(t['robos:deliveredAt']) && Date.parse(t['robos:deliveredAt']) <= now.getTime());
      const period = start => delivered.filter(t => { const d = dayAt(t['robos:deliveredAt'], timeZone); return d >= start && d <= asOf; });
      const month = period(periods.month), miles = Math.round(month.reduce((s, t) => s + (Number(t['robos:loadedMiles']) || 0), 0) * 10) / 10;
      return [
        { panel: 'floor', label: 'Open tow calls', value: String(tows.length - count('closed', 'cancelled')), note: `${count('requested')} waiting for a truck · ${count('dispatched', 'on-scene', 'in-tow')} on the road · ${count('delivered')} to invoice` },
        { panel: 'performance', label: 'Tow calls completed this month', value: String(month.length), note: `${miles} loaded miles · ${period(periods.week).length} this week` },
      ];
    },
    // Shown on a repair job that came in on our truck.
    jobLinks(nodes, job) {
      const t = nodes.find(n => n['@type'] === 'robos:TowJob' && linked(n, 'robos:repairJob') === job['@id']); if (!t) return null;
      const s = tow.towSummary(nodes, t);
      return { id: t['@id'], key: t['robos:workItemKey'], stage: t['robos:jobStatus'], stageLabel: STAGE_LABELS[t['robos:jobStatus']], billed: s.billed, balance: s.balance, currency: s.currency };
    },
    intakeAddons: {
      // "No, it needs to be towed" at the Front desk can send our truck: the call opens with the ticket and drops the
      // car at the shop, where it is checked in.
      tow(service, { input, vehicle, answers, urgent, concern }) {
        if (answers.driveable !== 'No, it needs to be towed') throw new Error('Choose "No, it needs to be towed" to send a tow truck');
        const call = { ...input, vehicle, service: 'tow', destination: 'shop', urgent, notes: concern };
        tow.buildTowCall(service, call, core.workshop.nodes(service)); // fail before anything is saved
        return { build: (jobId, records) => tow.buildTowCall(service, call, records, jobId), link: 'robos:towJob', defersCheckIn: true, note: n => `Coming in on tow ${n['robos:workItemKey']}.`, message: 'tow requested' };
      },
    },
  };
};
