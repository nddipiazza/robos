'use strict';
// Auto repair plugin: the Front desk intake and the Mechanic bench. Repair jobs, tickets, estimates and
// invoices are the shop's shared job model in the core (workshop.js); this plugin adds the desks that run them.
module.exports = core => {
  const frontDesk = require('./frontdesk')(core), bench = require('./bench')(core);
  return { actions: { intakeForm: frontDesk.intakeForm, intakeRepair: frontDesk.intakeRepair, logContact: frontDesk.logContact, ...bench } };
};
