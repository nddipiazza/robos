'use strict';
// Tow center: take a tow or roadside call, quote it from the shop's rate card, dispatch a truck and driver,
// follow it to the drop-off, then invoice, take payment and release the vehicle. Questions come from the
// KGraph form in data/tow-form.jsonld (or an edited tow-form.jsonld in the shop's data folder).
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const w = require('./workshop');
const { node, ref } = require('./importer');
const { shop, commit, checkInNode } = require('./shop-operations');
const { amountMinor, CURRENCIES } = require('./reports');
const STAGES = ['requested', 'dispatched', 'on-scene', 'in-tow', 'delivered', 'invoiced', 'closed'];
const STAGE_LABELS = { requested: 'Call taken', dispatched: 'Truck on the way', 'on-scene': 'Truck at the vehicle', 'in-tow': 'Vehicle on the truck', delivered: 'Dropped off / done', invoiced: 'Invoiced', closed: 'Paid and closed', cancelled: 'Cancelled' };
const ACTIVE = ['dispatched', 'on-scene', 'in-tow'], DONE = ['closed', 'cancelled'];
const TRUCK_TYPES = { flatbed: 'Flatbed (rollback)', 'wheel-lift': 'Wheel-lift', 'heavy-duty': 'Heavy-duty wrecker' };
const DESTINATIONS = { shop: 'Our shop', yard: 'Our storage yard', other: 'Another address' };
const BILL_TO = ['customer', 'motor club', 'insurance', 'police or city', 'fleet account'];
const RATE_FIELDS = { hookup: 'robos:hookupMinor', perMile: 'robos:perMileMinor', roadside: 'robos:roadsideMinor', winchPerHour: 'robos:winchPerHourMinor', afterHours: 'robos:afterHoursMinor', storagePerDay: 'robos:storagePerDayMinor' };
function formDocument(service) {
  const custom = path.join(service.dataRoot, 'tow-form.jsonld');
  return JSON.parse(fs.readFileSync(fs.existsSync(custom) ? custom : path.join(__dirname, '../data/tow-form.jsonld'), 'utf8'));
}
function towForm(service) {
  shop(service);
  const graph = formDocument(service)['@graph'], byOrder = (a, b) => a['robos:order'] - b['robos:order'];
  const question = n => ({ key: n['robos:questionKey'], label: n['schema:name'], type: n['robos:questionType'], options: n['robos:options'] || [] });
  const all = graph.filter(n => n['@type'] === 'robos:IntakeQuestion');
  return { destinations: DESTINATIONS, billTo: BILL_TO, truckTypes: TRUCK_TYPES,
    services: graph.filter(n => n['@type'] === 'robos:TowService').sort(byOrder).map(s => ({ id: s['@id'].split(':').pop(), label: s['schema:name'], description: s['schema:description'] || '', kind: s['robos:serviceKind'], questions: all.filter(q => q['robos:towService']?.['@id'] === s['@id']).sort(byOrder).map(question) })),
    common: all.filter(q => q['robos:appliesToAll']).sort(byOrder).map(question) };
}
// Which truck the call needs, and why. A wheel-lift drags the car on two wheels, which damages AWD and
// electric drivetrains, locked wheels and low bodywork; a trailer needs a heavy-duty wrecker.
function truckNeed(answers = {}) {
  const lowered = [].concat(answers.lowered || []), reasons = [];
  if (lowered.includes('Trailer attached')) return { needs: 'heavy-duty', reasons: ['A trailer is attached'] };
  if (answers.rolls === 'No, a wheel is locked or damaged') reasons.push('A wheel does not turn');
  if (answers.drivetrain === 'Yes, AWD or 4x4') reasons.push('All-wheel or four-wheel drive');
  if (answers.drivetrain === 'Electric or hybrid') reasons.push('Electric or hybrid drivetrain');
  if (answers.reason === 'Accident') reasons.push('Accident damage');
  if (lowered.includes('Lowered or low front spoiler')) reasons.push('Low front end');
  return { needs: reasons.length ? 'flatbed' : 'any', reasons };
}
const canCarry = (type, needs) => needs === 'any' || type === 'heavy-duty' || (needs === 'flatbed' && type === 'flatbed');
function rateCard(records) { return records.find(n => n['@type'] === 'robos:TowRateCard') || null; }
function rateSnapshot(card) { return card ? { ...Object.fromEntries(Object.entries(RATE_FIELDS).map(([k, p]) => [k, card[p] ?? 0])), includedMiles: card['robos:includedMiles'] ?? 0, currency: card['robos:currency'] || 'USD' } : null; }
// Itemized charges from a rate snapshot. All amounts are integer cents.
function towLines(rates, { kind, serviceLabel, miles = 0, winchHours = 0, afterHours = false, storageDays = 0, extraMinor = 0, extraNote = '' }) {
  const lines = [], add = (description, quantity, unitMinor) => { if (quantity > 0) lines.push({ description, quantity, unitMinor, amountMinor: Math.round(quantity * unitMinor) }); };
  if (kind === 'tow') {
    add('Hook-up', 1, rates.hookup);
    const billable = Math.max(0, Math.round((miles - rates.includedMiles) * 10) / 10);
    add(`Loaded miles (${miles} mi${rates.includedMiles ? `, first ${rates.includedMiles} included` : ''})`, billable, rates.perMile);
  } else add(serviceLabel, 1, rates.roadside);
  add('Winching (hours)', winchHours, rates.winchPerHour);
  if (afterHours) add('After-hours call', 1, rates.afterHours);
  add('Storage (days)', storageDays, rates.storagePerDay);
  if (extraMinor) add(extraNote, 1, extraMinor);
  return { lines, totalMinor: lines.reduce((s, l) => s + l.amountMinor, 0), currency: rates.currency };
}
const num = (v, label, max, { integer = false } = {}) => {
  if (v === undefined || v === null || String(v).trim() === '') return 0;
  const n = Number(v); if (!Number.isFinite(n) || n < 0 || n > max || (integer && !Number.isInteger(n))) throw new Error(`${label} must be ${integer ? 'a whole number ' : ''}between 0 and ${max}`);
  return Math.round(n * 10) / 10;
};
const findTow = (service, id) => w.find(service, 'TowJob', id, 'Select a tow call');
const tkey = t => t['robos:workItemKey'] || 'tow';
const event = (service, tow, kind, detail) => ({ 'robos:events': [...(tow['robos:events'] || []), w.event(service, kind, detail)] });
function requireStage(tow, allowed, what) { if (!allowed.includes(tow['robos:jobStatus'])) throw new Error(`${what} (${tkey(tow)} is ${STAGE_LABELS[tow['robos:jobStatus']].toLowerCase()})`); }
// Validate a call and build its node. Shared by the tow desk and by a front-desk intake that needs a tow.
function buildTowCall(service, input, records, repairJob = null) {
  const form = towForm(service), vehicle = records.find(n => n['@id'] === input.vehicle && n['@type'] === 'robos:OwnedVehicle');
  if (!vehicle) throw new Error('Select the customer’s vehicle');
  const customer = records.find(n => n['@id'] === w.linked(vehicle, 'robos:customer'));
  const svc = form.services.find(s => s.id === (input.service || 'tow')); if (!svc) throw new Error('Choose what the caller needs');
  if (records.some(n => n['@type'] === 'robos:TowJob' && w.linked(n, 'robos:vehicle') === vehicle['@id'] && !DONE.includes(n['robos:jobStatus']))) throw new Error('This vehicle already has an open tow call');
  const answers = input.answers && typeof input.answers === 'object' ? input.answers : {}, clean = {}, labels = [];
  for (const q of [...svc.questions, ...form.common]) {
    const raw = answers[q.key]; if (raw === undefined || raw === '' || (Array.isArray(raw) && !raw.length)) continue;
    const list = Array.isArray(raw) ? raw : [raw];
    if (q.type === 'single' && list.length > 1) throw new Error('Choose one answer for "' + q.label + '"');
    for (const v of list) { if (typeof v !== 'string' || v.length > 500) throw new Error('Invalid answer for "' + q.label + '"'); if (q.options.length && !q.options.includes(v)) throw new Error('"' + v + '" is not a choice for "' + q.label + '"'); }
    clean[q.key] = q.type === 'multi' ? list : list[0]; labels.push({ question: q.label, answer: clean[q.key] });
  }
  const pickup = w.text(input.pickupAddress, 300, 'Pickup location'), pickupNotes = w.text(input.pickupNotes, 500, 'Pickup notes', false);
  const destination = svc.kind === 'tow' ? input.destination || 'shop' : 'roadside';
  if (svc.kind === 'tow' && !DESTINATIONS[destination]) throw new Error('Choose where the vehicle is going');
  const destinationAddress = destination === 'other' ? w.text(input.destinationAddress, 300, 'Drop-off address') : '';
  const billTo = BILL_TO.includes(input.billTo || 'customer') ? input.billTo || 'customer' : null; if (!billTo) throw new Error('Choose who pays for the call');
  const billToName = billTo === 'customer' ? customer?.['schema:name'] || '' : w.text(input.billToName, 200, 'Name of the ' + billTo);
  const authorization = w.text(input.authorization, 100, 'Authorization or PO number', false);
  const miles = svc.kind === 'tow' ? num(input.estimatedMiles, 'Estimated miles', 1000) : 0;
  const need = svc.kind === 'tow' ? truckNeed(clean) : { needs: 'any', reasons: [] };
  const rates = rateSnapshot(rateCard(records)), afterHours = input.afterHours === true || input.afterHours === 'on';
  const quote = rates ? towLines(rates, { kind: svc.kind, serviceLabel: svc.label, miles, afterHours }) : null;
  const urgent = clean.safety === 'Highway lane, or someone is in danger' || input.urgent === true;
  const seq = records.filter(n => n['@type'] === 'robos:TowJob').length + 1, key = 'TW-' + String(seq).padStart(4, '0');
  const notes = w.text(input.notes, 2000, 'Notes', false);
  const where = destination === 'roadside' ? 'at the roadside' : destination === 'other' ? 'to ' + destinationAddress : 'to ' + DESTINATIONS[destination].toLowerCase();
  const title = `${svc.label} ${where}`;
  return node('TowJob', crypto.randomUUID(), title, {
    'robos:workItemKey': key, 'robos:vehicle': ref(vehicle['@id']), ...(customer ? { 'robos:customer': ref(customer['@id']) } : {}), 'robos:jobStatus': 'requested', 'schema:orderDate': service.clock().toISOString(),
    'robos:towService': svc.id, 'robos:serviceLabel': svc.label, 'robos:serviceKind': svc.kind, 'robos:answers': labels, 'robos:towNeeds': need.needs, 'robos:towNeedReasons': need.reasons,
    'robos:pickupAddress': pickup, 'robos:pickupNotes': pickupNotes, 'robos:destinationKind': destination, 'robos:destinationAddress': destinationAddress,
    'robos:billTo': billTo, 'robos:billToName': billToName, 'robos:authorization': authorization, 'robos:estimatedMiles': miles, 'robos:afterHours': afterHours,
    'robos:rates': rates, 'robos:quotedMinor': quote ? quote.totalMinor : null, 'robos:priority': urgent ? 'urgent' : 'normal', 'robos:towNotes': notes,
    'robos:callbackPhone': customer?.['schema:telephone'] || '', ...(repairJob ? { 'robos:repairJob': ref(repairJob) } : {}),
    'robos:events': [w.event(service, 'requested', `${svc.label} requested by ${customer?.['schema:name'] || 'caller'}. Pickup: ${pickup}${quote ? '. Quoted ' + (quote.totalMinor / 100).toFixed(2) + ' ' + quote.currency : ''}${need.needs === 'flatbed' ? '. Needs a flatbed: ' + need.reasons.join(', ') : need.needs === 'heavy-duty' ? '. Needs a heavy-duty wrecker' : ''}`)],
  });
}
function takeTowCall(service, input) {
  shop(service); const n = buildTowCall(service, input, w.nodes(service));
  commit(service, [{ op: 'add', node: n }], tkey(n) + ': call taken'); return n;
}
function dispatchTow(service, input) {
  shop(service); const records = w.nodes(service), tow = findTow(service, input.tow); requireStage(tow, ['requested'], 'Only a waiting call can be dispatched');
  const truck = w.find(service, 'TowTruck', input.truck, 'Choose a truck'), driver = w.find(service, 'Teammate', input.driver, 'Choose a driver');
  if (truck['robos:active'] === false) throw new Error(truck['schema:name'] + ' is out of service');
  if (driver['robos:active'] === false) throw new Error(driver['schema:name'] + ' is no longer active');
  const busy = records.filter(n => n['@type'] === 'robos:TowJob' && ACTIVE.includes(n['robos:jobStatus']));
  const truckBusy = busy.find(n => w.linked(n, 'robos:truck') === truck['@id']); if (truckBusy) throw new Error(`${truck['schema:name']} is already out on ${tkey(truckBusy)}`);
  const driverBusy = busy.find(n => w.linked(n, 'robos:driver') === driver['@id']); if (driverBusy) throw new Error(`${driver['schema:name']} is already driving ${tkey(driverBusy)}`);
  if (tow['robos:serviceKind'] === 'tow' && !canCarry(truck['robos:truckType'], tow['robos:towNeeds'])) throw new Error(`This vehicle needs a ${tow['robos:towNeeds'] === 'flatbed' ? 'flatbed' : 'heavy-duty wrecker'} (${(tow['robos:towNeedReasons'] || []).join(', ') || 'see the call'}); ${truck['schema:name']} is a ${TRUCK_TYPES[truck['robos:truckType']].toLowerCase()}`);
  const eta = num(input.etaMinutes, 'ETA minutes', 600, { integer: true });
  commit(service, [{ op: 'update', id: tow['@id'], set: { 'robos:jobStatus': 'dispatched', 'robos:truck': ref(truck['@id']), 'robos:driver': ref(driver['@id']), 'robos:driverName': driver['schema:name'], 'robos:etaMinutes': eta || null, 'robos:dispatchedAt': service.clock().toISOString(), ...event(service, tow, 'dispatched', `${truck['schema:name']} with ${driver['schema:name']}${eta ? ', ETA ' + eta + ' min' : ''}`) } }], `${tkey(tow)}: dispatched ${truck['schema:name']}`);
  return { dispatched: true };
}
function arriveTow(service, input) {
  shop(service); const tow = findTow(service, input.tow); requireStage(tow, ['dispatched'], 'The truck must be on the way first');
  commit(service, [{ op: 'update', id: tow['@id'], set: { 'robos:jobStatus': 'on-scene', 'robos:arrivedAt': service.clock().toISOString(), ...event(service, tow, 'on scene', (tow['robos:driverName'] || 'Driver') + ' arrived at the vehicle') } }], tkey(tow) + ': on scene');
  return { arrived: true };
}
// Note the vehicle's condition before it goes on the truck, so damage that was already there is on record.
function hookTow(service, input) {
  shop(service); const tow = findTow(service, input.tow); requireStage(tow, ['on-scene'], 'The driver must be at the vehicle first');
  if (tow['robos:serviceKind'] !== 'tow') throw new Error('Roadside calls are finished with "Service done"');
  const condition = w.text(input.condition, 1000, 'Condition before towing (write "No visible damage" if there is none)');
  const odometer = input.odometer === undefined || input.odometer === '' ? null : num(input.odometer, 'Odometer', 2000000, { integer: true });
  commit(service, [{ op: 'update', id: tow['@id'], set: { 'robos:jobStatus': 'in-tow', 'robos:hookedAt': service.clock().toISOString(), 'robos:conditionAtPickup': condition, 'robos:odometerAtPickup': odometer, ...event(service, tow, 'hooked', 'On the truck. Condition: ' + condition) } }], tkey(tow) + ': vehicle on the truck');
  return { hooked: true };
}
// Drop-off (tow) or service done (roadside). A vehicle dropped at our shop or yard is checked in.
function deliverTow(service, input) {
  shop(service); const records = w.nodes(service), tow = findTow(service, input.tow), kind = tow['robos:serviceKind'];
  requireStage(tow, kind === 'tow' ? ['in-tow'] : ['on-scene'], kind === 'tow' ? 'The vehicle must be on the truck first' : 'The driver must be at the vehicle first');
  const miles = kind === 'tow' ? num(input.loadedMiles, 'Loaded miles', 1000) : 0;
  if (kind === 'tow' && (input.loadedMiles === undefined || String(input.loadedMiles).trim() === '')) throw new Error('Enter the loaded miles from pickup to drop-off');
  const winch = num(input.winchHours, 'Winch hours', 24);
  if (kind === 'winch' && !winch) throw new Error('Enter how long the winch-out took');
  const note = w.text(input.note, 1000, 'Note', false), now = service.clock().toISOString(), edits = [];
  const dest = tow['robos:destinationKind'], vehicleId = w.linked(tow, 'robos:vehicle');
  let checkedIn = false;
  if (['shop', 'yard'].includes(dest) && !records.some(s => s['@type'] === 'robos:VehicleStay' && w.linked(s, 'robos:vehicle') === vehicleId && !s['schema:endDate'])) {
    edits.push({ op: 'add', node: checkInNode(service, { vehicle: vehicleId, location: String(input.location || (dest === 'yard' ? 'Tow yard' : 'Tow drop-off')).slice(0, 200) }, records) }); checkedIn = true;
  }
  const repair = records.find(n => n['@id'] === w.linked(tow, 'robos:repairJob')), wi = repair && w.workItemFor(records, repair['@id']);
  if (wi) edits.push({ op: 'update', id: wi['@id'], set: { 'robos:events': [...(wi['robos:events'] || []), w.event(service, 'arrived on tow', `Arrived on ${tkey(tow)} (${miles} mi)`)] } });
  const detail = kind === 'tow' ? `Dropped at ${dest === 'other' ? tow['robos:destinationAddress'] : DESTINATIONS[dest].toLowerCase()} after ${miles} loaded miles${winch ? ', ' + winch + ' h winching' : ''}${checkedIn ? '; checked in' : ''}` : `${tow['robos:serviceLabel']} done${winch ? ', ' + winch + ' h winching' : ''}`;
  edits.unshift({ op: 'update', id: tow['@id'], set: { 'robos:jobStatus': 'delivered', 'robos:deliveredAt': now, 'robos:loadedMiles': miles, 'robos:winchHours': winch, 'robos:deliveryNote': note, ...event(service, tow, 'delivered', detail + (note ? '. ' + note : '')) } });
  commit(service, edits, tkey(tow) + (kind === 'tow' ? ': delivered' : ': service done')); return { delivered: true, checkedIn };
}
function cancelTow(service, input) {
  shop(service); const tow = findTow(service, input.tow); requireStage(tow, ['requested', 'dispatched'], 'Only a call that is waiting or on the way can be cancelled');
  const reason = w.text(input.reason, 500, 'Reason for cancelling');
  commit(service, [{ op: 'update', id: tow['@id'], set: { 'robos:jobStatus': 'cancelled', 'robos:closedAt': service.clock().toISOString(), ...event(service, tow, 'cancelled', reason) } }], tkey(tow) + ': cancelled'); return { cancelled: true };
}
function towSummary(records, tow) {
  const payments = records.filter(n => n['@type'] === 'robos:ShopPayment' && w.linked(n, 'robos:job') === tow['@id']);
  const paid = payments.reduce((s, p) => s + (p['robos:paymentDirection'] === 'refund' ? -1 : 1) * p['robos:amountMinor'], 0);
  const invoice = records.find(n => n['@type'] === 'robos:Invoice' && w.linked(n, 'robos:job') === tow['@id'] && n['robos:issued']);
  const currency = invoice?.['robos:currency'] || tow['robos:rates']?.currency || 'USD';
  return { currency, quoted: tow['robos:quotedMinor'] ?? null, billed: invoice?.['robos:totalMinor'] ?? null, paid, balance: invoice ? invoice['robos:totalMinor'] - paid : null, invoice: invoice?.['@id'] || null, lines: invoice?.['robos:lines'] || [] };
}
function issueTowInvoice(service, input) {
  shop(service); const records = w.nodes(service), tow = findTow(service, input.tow); requireStage(tow, ['delivered'], 'Invoice a call once the vehicle is dropped off or the service is done');
  const rates = tow['robos:rates'] || rateSnapshot(rateCard(records)); if (!rates) throw new Error('Set your tow rates in Admin → Tow trucks before invoicing');
  const storageDays = num(input.storageDays, 'Storage days', 365, { integer: true });
  if (storageDays && tow['robos:destinationKind'] !== 'yard') throw new Error('Storage is only charged for vehicles held in our yard');
  const extraMinor = input.extra ? amountMinor(String(input.extra)) : 0, extraNote = extraMinor ? w.text(input.extraNote, 200, 'What the extra charge is for') : '';
  const { lines, totalMinor, currency } = towLines(rates, { kind: tow['robos:serviceKind'], serviceLabel: tow['robos:serviceLabel'], miles: tow['robos:loadedMiles'] || 0, winchHours: tow['robos:winchHours'] || 0, afterHours: tow['robos:afterHours'], storageDays, extraMinor, extraNote });
  if (!CURRENCIES.includes(currency)) throw new Error('Choose a currency for your tow rates');
  const inv = node('Invoice', crypto.randomUUID(), tkey(tow) + ' tow invoice', { 'robos:vehicle': tow['robos:vehicle'], 'robos:job': ref(tow['@id']), 'robos:issued': true, 'robos:lines': lines, 'robos:totalMinor': totalMinor, 'robos:currency': currency, 'robos:billTo': tow['robos:billTo'], 'robos:billToName': tow['robos:billToName'], 'robos:authorization': tow['robos:authorization'] || '', 'schema:dateCreated': service.clock().toISOString(), 'robos:reviewedByUser': true });
  commit(service, [{ op: 'add', node: inv }, { op: 'update', id: tow['@id'], set: { 'robos:jobStatus': 'invoiced', 'robos:billedMinor': totalMinor, 'robos:billingCurrency': currency, 'robos:storageDays': storageDays, 'robos:invoicedAt': service.clock().toISOString(), ...event(service, tow, 'invoiced', `Invoice issued to ${tow['robos:billToName'] || tow['robos:billTo']}: ${(totalMinor / 100).toFixed(2)} ${currency}`) } }], tkey(tow) + ': invoice issued');
  return inv;
}
// Close a paid call. A vehicle held in our yard is released to whoever collects it.
function closeTow(service, input) {
  shop(service); const records = w.nodes(service), tow = findTow(service, input.tow); requireStage(tow, ['invoiced'], 'Issue the invoice before closing the call');
  const s = towSummary(records, tow); if (s.balance > 0) throw new Error('The tow invoice still has a balance of ' + (s.balance / 100).toFixed(2) + ' ' + s.currency);
  const edits = [], stay = records.find(n => n['@type'] === 'robos:VehicleStay' && w.linked(n, 'robos:vehicle') === w.linked(tow, 'robos:vehicle') && !n['schema:endDate']);
  let detail = 'Paid in full';
  if (tow['robos:destinationKind'] === 'yard' && stay) { const by = w.text(input.releasedTo, 200, 'Name of the person collecting the vehicle'); edits.push({ op: 'update', id: stay['@id'], set: { 'schema:endDate': service.clock().toISOString() } }); detail += '; released from the yard to ' + by; }
  edits.unshift({ op: 'update', id: tow['@id'], set: { 'robos:jobStatus': 'closed', 'robos:closedAt': service.clock().toISOString(), ...event(service, tow, 'closed', detail) } });
  commit(service, edits, tkey(tow) + ': closed'); return { closed: true };
}
function saveTowTruck(service, input) {
  shop(service);
  if (input.id) {
    const t = w.find(service, 'TowTruck', input.id, 'Select a truck'), set = {};
    if (input.active !== undefined) { if (!input.active && w.nodes(service).some(n => n['@type'] === 'robos:TowJob' && ACTIVE.includes(n['robos:jobStatus']) && w.linked(n, 'robos:truck') === t['@id'])) throw new Error(t['schema:name'] + ' is out on a call; finish it first'); set['robos:active'] = !!input.active; }
    if (input.truckType !== undefined) { if (!TRUCK_TYPES[input.truckType]) throw new Error('Choose a truck type'); set['robos:truckType'] = input.truckType; }
    if (!Object.keys(set).length) throw new Error('Nothing to change');
    commit(service, [{ op: 'update', id: t['@id'], set }], 'auto: update tow truck ' + t['schema:name']); return { id: t['@id'] };
  }
  const name = w.text(input.name, 100, 'Truck name'); if (!TRUCK_TYPES[input.truckType]) throw new Error('Choose a truck type');
  if (w.nodes(service).some(n => n['@type'] === 'robos:TowTruck' && n['schema:name'].toLowerCase() === name.toLowerCase())) throw new Error('A truck with this name already exists');
  const n = node('TowTruck', crypto.randomUUID(), name, { 'schema:name': name, 'robos:truckType': input.truckType, 'robos:licensePlate': w.text(input.plate, 20, 'Plate', false), 'robos:active': true });
  commit(service, [{ op: 'add', node: n }], 'auto: add tow truck ' + name); return n;
}
function saveTowRates(service, input) {
  shop(service); const records = w.nodes(service), currency = input.currency || records.find(n => n['@type'] === 'robos:AutoShop')?.['robos:currency'] || 'USD';
  if (!CURRENCIES.includes(currency)) throw new Error('Choose a currency');
  const props = { 'schema:name': 'Tow rates', 'robos:currency': currency, 'robos:includedMiles': num(input.includedMiles, 'Included miles', 100) };
  for (const [k, p] of Object.entries(RATE_FIELDS)) props[p] = input[k] === undefined || String(input[k]).trim() === '' ? 0 : amountMinor(String(input[k]).trim().replace(/^\$/, ''));
  const card = rateCard(records);
  if (card) commit(service, [{ op: 'update', id: card['@id'], set: props }], 'auto: update tow rates');
  else commit(service, [{ op: 'add', node: node('TowRateCard', crypto.randomUUID(), 'Tow rates', props) }], 'auto: save tow rates');
  return rateSnapshot({ ...props });
}
function towBoard(service) {
  shop(service); const records = w.nodes(service), now = service.clock().getTime();
  const trucks = records.filter(n => n['@type'] === 'robos:TowTruck'), active = records.filter(n => n['@type'] === 'robos:TowJob' && ACTIVE.includes(n['robos:jobStatus']));
  const tows = records.filter(n => n['@type'] === 'robos:TowJob').map(t => {
    const vehicle = records.find(n => n['@id'] === w.linked(t, 'robos:vehicle')), customer = records.find(n => n['@id'] === w.linked(t, 'robos:customer')), truck = records.find(n => n['@id'] === w.linked(t, 'robos:truck'));
    const repair = records.find(n => n['@id'] === w.linked(t, 'robos:repairJob'));
    return { id: t['@id'], key: tkey(t), title: t['dcterms:title'], stage: t['robos:jobStatus'], stageLabel: STAGE_LABELS[t['robos:jobStatus']], service: t['robos:towService'], serviceLabel: t['robos:serviceLabel'], kind: t['robos:serviceKind'], priority: t['robos:priority'] || 'normal',
      vehicle: w.vehicleLabel(vehicle, customer), vehicleId: vehicle?.['@id'] || null, customer: customer?.['schema:name'] || '', customerId: customer?.['@id'] || null, phone: t['robos:callbackPhone'] || customer?.['schema:telephone'] || '',
      pickup: t['robos:pickupAddress'], pickupNotes: t['robos:pickupNotes'] || '', destination: t['robos:destinationKind'], destinationLabel: t['robos:destinationKind'] === 'other' ? t['robos:destinationAddress'] : DESTINATIONS[t['robos:destinationKind']] || 'Roadside', needs: t['robos:towNeeds'], needReasons: t['robos:towNeedReasons'] || [],
      answers: t['robos:answers'] || [], billTo: t['robos:billTo'], billToName: t['robos:billToName'], authorization: t['robos:authorization'] || '', afterHours: !!t['robos:afterHours'], estimatedMiles: t['robos:estimatedMiles'] || 0, loadedMiles: t['robos:loadedMiles'] ?? null, winchHours: t['robos:winchHours'] || 0,
      truck: truck?.['schema:name'] || '', truckId: truck?.['@id'] || null, driver: t['robos:driverName'] || '', etaMinutes: t['robos:etaMinutes'] || null, dispatchedAt: t['robos:dispatchedAt'] || null, deliveredAt: t['robos:deliveredAt'] || null, condition: t['robos:conditionAtPickup'] || '',
      repairKey: repair?.['robos:workItemKey'] || '', repairId: repair?.['@id'] || null, notes: t['robos:towNotes'] || '', events: t['robos:events'] || [], orderDate: t['schema:orderDate'],
      storageDaysSoFar: t['robos:destinationKind'] === 'yard' && t['robos:deliveredAt'] ? Math.max(0, Math.floor((now - Date.parse(t['robos:deliveredAt'])) / 86400000)) : 0, summary: towSummary(records, t) };
  }).sort((a, b) => (a.priority === 'urgent' ? 0 : 1) - (b.priority === 'urgent' ? 0 : 1) || String(b.orderDate).localeCompare(String(a.orderDate)));
  return { stages: STAGES.map(s => ({ id: s, label: STAGE_LABELS[s] })), tows, rates: rateSnapshot(rateCard(records)), truckTypes: TRUCK_TYPES, destinations: DESTINATIONS,
    trucks: trucks.map(t => ({ id: t['@id'], name: t['schema:name'], type: t['robos:truckType'], typeLabel: TRUCK_TYPES[t['robos:truckType']], plate: t['robos:licensePlate'] || '', active: t['robos:active'] !== false, onCall: active.find(j => w.linked(j, 'robos:truck') === t['@id'])?.['robos:workItemKey'] || null })),
    drivers: records.filter(n => n['@type'] === 'robos:Teammate' && n['robos:active'] !== false).map(t => ({ id: t['@id'], name: t['schema:name'], role: t['robos:role'], onCall: active.find(j => w.linked(j, 'robos:driver') === t['@id'])?.['robos:workItemKey'] || null })) };
}
function quoteTow(service, input) {
  shop(service); const form = towForm(service), svc = form.services.find(s => s.id === (input.service || 'tow')); if (!svc) throw new Error('Choose what the caller needs');
  const rates = rateSnapshot(rateCard(w.nodes(service))), need = svc.kind === 'tow' ? truckNeed(input.answers || {}) : { needs: 'any', reasons: [] };
  return { need, quote: rates ? towLines(rates, { kind: svc.kind, serviceLabel: svc.label, miles: svc.kind === 'tow' ? num(input.estimatedMiles, 'Estimated miles', 1000) : 0, afterHours: input.afterHours === true }) : null };
}
module.exports = { STAGES, STAGE_LABELS, TRUCK_TYPES, truckNeed, towLines, buildTowCall, towForm, towBoard, takeTowCall, quoteTow, dispatchTow, arriveTow, hookTow, deliverTow, cancelTow, issueTowInvoice, closeTow, saveTowTruck, saveTowRates, towSummary };
