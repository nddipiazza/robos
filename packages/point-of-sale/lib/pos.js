'use strict';
const crypto = require('node:crypto');
const { PosError } = require('./errors');
const { Store } = require('./store');
const { permsFor, emptyState, defaultSettings } = require('./defaults');
const { isValidGtin } = require('./gtin');
const { assertCents } = require('./money');
const scancode = require('./scancode');
const { localStore, sharedStore, round3: roundQty } = require('./inventory-store');

const SESSION_MS = 12 * 60 * 60 * 1000;
const LOCKOUT_AFTER = 5;
const LOCKOUT_MS = 60 * 1000;

function clone(value) { return JSON.parse(JSON.stringify(value)); }

class PointOfSale {
  // inventory: a RobOS Inventory (packages/robos-inventory) to sell from instead of the register's own stock records.
  constructor({ dir = null, now = () => new Date(), providers = {}, inventory = null } = {}) {
    this.store = new Store(dir);
    this.now = now;
    this.state = this.store.load() || emptyState();
    this.sessions = new Map();
    this.failures = { count: 0, until: 0 };
    this.providers = {};
    for (const [id, provider] of Object.entries(providers)) this.providers[id] = provider;
    this.inv = inventory ? sharedStore(inventory) : localStore(this);
    if (this.inv.shared && this.state.inventory.length) this.moveStockToShared();
  }

  // A register that kept its own stock and is now connected to a shared inventory: each stock record joins the
  // shared one (matched by SKU, otherwise added with its count) and the catalog points at it.
  moveStockToShared() {
    const ids = new Map();
    for (const rec of this.state.inventory) {
      const same = rec.sku && this.inv.bySku(rec.sku);
      ids.set(rec.id, (same || this.inv.create({ ...rec, onHand: rec.active === false ? 0 : rec.onHand })).id);
    }
    const remap = r => ({ ...r, inventoryId: ids.get(r.inventoryId) || r.inventoryId });
    for (const item of this.state.items) { if (item.inventoryId) item.inventoryId = ids.get(item.inventoryId) || item.inventoryId; item.recipe = item.recipe.map(remap); for (const v of item.variants) if (v.inventoryId) v.inventoryId = ids.get(v.inventoryId) || v.inventoryId; }
    for (const g of this.state.modifierGroups) for (const o of g.options) o.recipe = o.recipe.map(remap);
    this.audit(null, 'inventory.shared', null, `${ids.size} stock records moved to the shared inventory`);
    this.state.inventory = []; this.save();
  }

  // ---- plumbing -----------------------------------------------------------
  id(prefix) { return `${prefix}_${crypto.randomBytes(5).toString('hex')}`; }
  iso() { return this.now().toISOString(); }
  save() { this.store.save(this.state); }
  audit(staff, action, ref, detail) {
    this.state.audit.push({ at: this.iso(), staffId: staff && staff.id || null, action, ref: ref || null, detail: detail || null });
    if (this.state.audit.length > 5000) this.state.audit.splice(0, this.state.audit.length - 5000);
  }
  get settings() { return this.state.settings; }
  find(collection, id, label = collection) {
    const found = collection === 'inventory' ? this.inv.get(id) : this.state[collection].find(x => x.id === id);
    if (!found) throw new PosError('not_found', `Unknown ${label}`, 404);
    return found;
  }

  // ---- staff & auth -------------------------------------------------------
  hashPin(pin, salt) { return crypto.scryptSync(String(pin), salt, 32).toString('hex'); }

  addStaff({ name, role = 'cashier', pin }, actor) {
    if (!name || !String(name).trim()) throw new PosError('invalid_staff', 'Name is required');
    if (!['cashier', 'manager', 'admin'].includes(role)) throw new PosError('invalid_staff', 'Unknown role');
    if (!/^\d{4,8}$/.test(String(pin))) throw new PosError('invalid_pin', 'PIN must be 4 to 8 digits');
    if (this.state.staff.some(s => s.active !== false && this.hashPin(pin, s.salt) === s.pinHash)) throw new PosError('duplicate_pin', 'That PIN is already in use');
    const salt = crypto.randomBytes(8).toString('hex');
    const staff = { id: this.id('stf'), name: String(name).trim(), role, salt, pinHash: this.hashPin(pin, salt), active: true };
    this.state.staff.push(staff);
    this.audit(actor, 'staff.add', staff.id, role);
    this.save();
    return this.publicStaff(staff);
  }

  publicStaff(s) { return { id: s.id, name: s.name, role: s.role, active: s.active !== false, permissions: permsFor(s.role) }; }
  listStaff() { return this.state.staff.map(s => this.publicStaff(s)); }

  setStaffActive(id, active, actor) {
    const staff = this.find('staff', id, 'staff member');
    if (!active && staff.role === 'admin' && this.state.staff.filter(s => s.role === 'admin' && s.active !== false).length < 2) {
      throw new PosError('last_admin', 'Keep at least one active admin');
    }
    staff.active = !!active;
    for (const [token, session] of this.sessions) if (session.staffId === id && !active) this.sessions.delete(token);
    this.audit(actor, 'staff.active', id, String(!!active));
    this.save();
    return this.publicStaff(staff);
  }

  login(pin) {
    const t = this.now().getTime();
    if (this.failures.until > t) throw new PosError('locked', 'Too many wrong PINs. Wait a minute and try again.', 429);
    const staff = this.state.staff.find(s => s.active !== false && this.hashPin(pin, s.salt) === s.pinHash);
    if (!staff) {
      this.failures.count++;
      if (this.failures.count >= LOCKOUT_AFTER) { this.failures = { count: 0, until: t + LOCKOUT_MS }; }
      throw new PosError('bad_pin', 'Wrong PIN', 401);
    }
    this.failures = { count: 0, until: 0 };
    const token = crypto.randomBytes(24).toString('hex');
    this.sessions.set(token, { staffId: staff.id, expires: t + SESSION_MS });
    this.audit(staff, 'login');
    return { token, staff: this.publicStaff(staff) };
  }

  logout(token) { this.sessions.delete(token); }

  staffFromToken(token) {
    const session = this.sessions.get(token);
    if (!session || session.expires < this.now().getTime()) { this.sessions.delete(token); throw new PosError('unauthorized', 'Sign in with your PIN', 401); }
    const staff = this.state.staff.find(s => s.id === session.staffId && s.active !== false);
    if (!staff) throw new PosError('unauthorized', 'Sign in with your PIN', 401);
    return staff;
  }

  // Require `perm`. A lower role may be approved on the spot by a manager's PIN.
  authorize(staff, perm, { managerPin } = {}) {
    if (permsFor(staff.role).includes(perm)) return staff;
    if (managerPin) {
      const approver = this.state.staff.find(s => s.active !== false && this.hashPin(managerPin, s.salt) === s.pinHash);
      if (approver && permsFor(approver.role).includes(perm)) { this.audit(staff, 'override', perm, approver.id); return approver; }
      throw new PosError('bad_override', 'Manager PIN not accepted', 403);
    }
    throw new PosError('manager_required', 'A manager must approve this', 403);
  }

  // ---- API keys for the open checkout API --------------------------------
  createApiKey(label, actor) {
    const secret = `pos_${crypto.randomBytes(18).toString('hex')}`;
    const record = { id: this.id('key'), label: String(label || 'API key'), hash: crypto.createHash('sha256').update(secret).digest('hex'), createdAt: this.iso(), active: true };
    this.state.apiKeys.push(record);
    this.audit(actor, 'apikey.create', record.id);
    this.save();
    return { id: record.id, label: record.label, key: secret };
  }

  verifyApiKey(secret) {
    const hash = crypto.createHash('sha256').update(String(secret || '')).digest('hex');
    const key = this.state.apiKeys.find(k => k.active && k.hash === hash);
    if (!key) throw new PosError('unauthorized', 'Invalid API key', 401);
    return key;
  }

  revokeApiKey(id, actor) {
    this.find('apiKeys', id, 'API key').active = false;
    this.audit(actor, 'apikey.revoke', id);
    this.save();
  }

  listApiKeys() { return this.state.apiKeys.map(({ id, label, createdAt, active }) => ({ id, label, createdAt, active })); }

  // ---- settings -----------------------------------------------------------
  getSettings() { return clone(this.state.settings); }

  updateSettings(section, patch, actor) {
    const defaults = defaultSettings();
    if (!(section in defaults)) throw new PosError('invalid_settings', 'Unknown settings section');
    const next = Array.isArray(defaults[section]) ? patch : { ...this.state.settings[section], ...patch };
    if (section === 'cash') this.validateCash(next);
    if (section === 'business' && !String(next.name || '').trim()) throw new PosError('invalid_settings', 'Business name is required');
    this.state.settings[section] = next;
    this.audit(actor, 'settings.update', section);
    this.save();
    return clone(next);
  }

  validateCash(c) {
    if (typeof c.enabled !== 'boolean') throw new PosError('invalid_settings', 'Cash enabled must be on or off');
    for (const key of ['rounding', 'maxTender', 'varianceThreshold']) assertCents(c[key], key);
    if (![0, 5, 10, 25, 100].includes(c.rounding)) throw new PosError('invalid_settings', 'Cash rounding must be none, 5, 10, 25 or 100 cents');
    if (!Array.isArray(c.quickTender) || c.quickTender.length > 6) throw new PosError('invalid_settings', 'Up to six quick-tender buttons');
    c.quickTender.forEach(v => assertCents(v, 'quick tender'));
    if (!Array.isArray(c.denominations) || !c.denominations.length) throw new PosError('invalid_settings', 'Add at least one denomination');
    c.denominations.forEach(v => assertCents(v, 'denomination'));
    if (c.maxTender < 100) throw new PosError('invalid_settings', 'Maximum tender is too small');
  }

  // ---- catalog ------------------------------------------------------------
  list(collection) {
    if (!['categories', 'items', 'modifierGroups', 'taxes', 'promotions', 'priceRules', 'inventory'].includes(collection)) throw new PosError('not_found', 'Unknown collection', 404);
    return clone((collection === 'inventory' ? this.inv.list() : this.state[collection]).filter(x => x.active !== false));
  }

  upsert(collection, data, actor) {
    const normalize = this[`normalize_${collection}`];
    if (!normalize) throw new PosError('not_found', 'Unknown collection', 404);
    const stock = collection === 'inventory';
    const existing = data.id ? (stock ? this.inv.get(data.id) : this.state[collection].find(x => x.id === data.id)) : null;
    if (data.id && !existing) throw new PosError('not_found', 'Unknown record', 404);
    let record = normalize.call(this, { ...(existing || {}), ...data }, existing);
    if (stock) record = existing ? this.inv.update(existing.id, record) : this.inv.create(record);
    else if (existing) Object.assign(existing, record);
    else this.state[collection].push(record);
    this.audit(actor, `${collection}.${existing ? 'update' : 'create'}`, record.id);
    this.save();
    return clone(record);
  }

  remove(collection, id, actor) {
    const record = this.find(collection, id);
    if (collection === 'inventory') this.inv.update(id, { ...record, active: false });
    else record.active = false;
    this.audit(actor, `${collection}.remove`, id);
    this.save();
  }

  requireName(data, label) {
    if (!data.name || !String(data.name).trim()) throw new PosError('invalid_' + label, 'Name is required');
    return String(data.name).trim();
  }

  normalize_categories(data) {
    return { id: data.id || this.id('cat'), name: this.requireName(data, 'category'), color: data.color || '#3b82f6', sort: data.sort ?? this.state.categories.length, active: data.active !== false };
  }

  normalize_taxes(data) {
    const name = this.requireName(data, 'tax');
    if (!Number.isInteger(data.rateBp) || data.rateBp < 0 || data.rateBp > 5000) throw new PosError('invalid_tax', 'Tax rate must be between 0% and 50%');
    return { id: data.id || this.id('tax'), name, rateBp: data.rateBp, active: data.active !== false };
  }

  normalize_modifierGroups(data) {
    const name = this.requireName(data, 'modifier');
    const options = (data.options || []).map(o => {
      if (!o.name || !String(o.name).trim()) throw new PosError('invalid_modifier', 'Every option needs a name');
      const price = Number.isInteger(o.price) ? o.price : 0;
      const recipe = (o.recipe || []).map(r => ({ inventoryId: this.find('inventory', r.inventoryId, 'ingredient').id, qty: Number(r.qty) }));
      return { id: o.id || this.id('opt'), name: String(o.name).trim(), price, recipe };
    });
    if (!options.length) throw new PosError('invalid_modifier', 'Add at least one option');
    const min = data.required ? Math.max(1, data.min || 1) : (data.min || 0);
    const max = data.max || (data.multiple ? options.length : 1);
    if (min > max) throw new PosError('invalid_modifier', 'Minimum choices cannot exceed maximum');
    return { id: data.id || this.id('mod'), name, required: !!data.required, min, max, options, active: data.active !== false };
  }

  normalize_promotions(data) {
    const code = String(data.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,20}$/.test(code)) throw new PosError('invalid_promotion', 'Code is 3 to 20 letters or digits');
    if (!['percent', 'fixed'].includes(data.type)) throw new PosError('invalid_promotion', 'Type must be percent or fixed');
    if (data.type === 'percent' && !(data.value > 0 && data.value <= 100)) throw new PosError('invalid_promotion', 'Percent must be between 0 and 100');
    if (data.type === 'fixed') assertCents(data.value, 'discount');
    return { id: data.id || this.id('promo'), code, name: data.name || code, type: data.type, value: data.value, minSubtotal: data.minSubtotal || 0, active: data.active !== false };
  }

  normalize_priceRules(data) {
    const name = this.requireName(data, 'price_rule');
    if (!(data.percentOff > 0 && data.percentOff < 100)) throw new PosError('invalid_price_rule', 'Percent off must be between 0 and 100');
    const time = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!time.test(data.start || '') || !time.test(data.end || '')) throw new PosError('invalid_price_rule', 'Start and end are HH:MM');
    return { id: data.id || this.id('rule'), name, percentOff: data.percentOff, categoryIds: data.categoryIds || [], itemIds: data.itemIds || [], days: data.days || [0, 1, 2, 3, 4, 5, 6], start: data.start, end: data.end, active: data.active !== false };
  }

  normalize_inventory(data, existing) {
    const name = this.requireName(data, 'inventory');
    if (data.sku) {
      const dup = this.inv.list().find(i => i.sku === data.sku && i.id !== data.id);
      if (dup) throw new PosError('duplicate_sku', `SKU ${data.sku} is already used by ${dup.name}`);
    }
    const onHand = existing ? existing.onHand : (data.onHand ?? 0);
    if (typeof onHand !== 'number' || Number.isNaN(onHand)) throw new PosError('invalid_inventory', 'Quantity must be a number');
    return { id: data.id || this.id('inv'), sku: data.sku || '', name, unit: data.unit || 'each', onHand, reorderPoint: data.reorderPoint ?? 0, cost: data.cost ?? 0, active: data.active !== false };
  }

  normalize_items(data, existing) {
    const name = this.requireName(data, 'item');
    assertCents(data.price, 'price');
    if (data.categoryId) this.find('categories', data.categoryId, 'category');
    const taxId = data.taxId || (this.state.taxes[0] && this.state.taxes[0].id);
    if (taxId) this.find('taxes', taxId, 'tax');
    (data.modifierGroupIds || []).forEach(g => this.find('modifierGroups', g, 'modifier group'));
    const item = {
      id: data.id || this.id('itm'), name, categoryId: data.categoryId || null, price: data.price, taxId: taxId || null,
      sku: data.sku || '', barcode: scancode.canonicalBarcode(data.barcode || ''), station: data.station || null, ageRestricted: !!data.ageRestricted,
      modifierGroupIds: data.modifierGroupIds || [], recipe: (data.recipe || []).map(r => ({ inventoryId: this.find('inventory', r.inventoryId, 'ingredient').id, qty: Number(r.qty) })),
      inventoryId: data.inventoryId || null, color: data.color || null, emoji: data.emoji || '', active: data.active !== false, variants: [],
    };
    const itemId = item.id;
    // Variants carry their own SKU/barcode/stock; an opening stock count creates the inventory record.
    item.variants = (data.variants || []).map(v => {
      if (!v.name) throw new PosError('invalid_variant', 'Every variant needs a name');
      return { id: v.id || this.id('var'), name: String(v.name).trim(), sku: v.sku || '', barcode: scancode.canonicalBarcode(v.barcode || ''), price: Number.isInteger(v.price) ? v.price : null, inventoryId: v.inventoryId || null, _stock: v.stock, _cost: v.cost };
    });
    // Codes must be unique across the catalog and valid GS1 when they look numeric.
    const codes = [item.sku && ['sku', item.sku], item.barcode && ['barcode', item.barcode], ...item.variants.flatMap(v => [v.sku && ['sku', v.sku], v.barcode && ['barcode', v.barcode]])].filter(Boolean);
    const seen = new Set();
    for (const [kind, code] of codes) {
      if (seen.has(code)) throw new PosError('duplicate_code', `${code} is used twice on this item`);
      seen.add(code);
      if (kind === 'barcode' && /^\d{8,14}$/.test(code) && !isValidGtin(code)) throw new PosError('invalid_barcode', `${code} fails the GS1 check digit`);
      const clash = this.state.items.find(i => i.id !== itemId && i.active !== false && (i.sku === code || i.barcode === code || i.variants.some(v => v.sku === code || v.barcode === code)));
      if (clash) throw new PosError('duplicate_code', `${code} already belongs to ${clash.name}`);
    }
    // Validation passed: only now create opening-stock records.
    for (const v of item.variants) {
      if (!v.inventoryId && v._stock !== undefined && v._stock !== null && v._stock !== '') v.inventoryId = this.normalizedInventoryFor(`${name} - ${v.name}`, v.sku, Number(v._stock), v._cost);
      delete v._stock; delete v._cost;
    }
    if (!item.inventoryId && !item.variants.length && data.stock !== undefined && data.stock !== null && data.stock !== '') {
      item.inventoryId = this.normalizedInventoryFor(name, item.sku, Number(data.stock), data.cost);
    }
    if (item.inventoryId) this.find('inventory', item.inventoryId, 'inventory record');
    return item;
  }

  normalizedInventoryFor(name, sku, onHand, cost) {
    if (Number.isNaN(onHand) || onHand < 0) throw new PosError('invalid_inventory', 'Opening stock must be zero or more');
    // With a shared inventory, a part the business already stocks is sold from that stock rather than counted twice.
    const same = this.inv.shared && sku && this.inv.bySku(sku); if (same) return same.id;
    return this.inv.create(this.normalize_inventory({ name, sku, onHand, cost: cost || 0 }, null)).id;
  }

  // ---- inventory input ----------------------------------------------------
  receiveStock(id, { qty, cost, note }, actor) {
    const rec = this.find('inventory', id, 'inventory record');
    if (!(qty > 0)) throw new PosError('invalid_quantity', 'Quantity received must be more than zero');
    this.inv.move([{ id, delta: qty, kind: 'receive', cost, reason: note || 'Received at the counter', by: actor && actor.name }], `point of sale: received ${qty} × ${rec.name}`);
    this.audit(actor, 'inventory.receive', id, `${qty} ${note || ''}`.trim());
    this.save();
    return clone(this.inv.get(id));
  }

  adjustStock(id, { delta, counted, reason }, actor) {
    const rec = this.find('inventory', id, 'inventory record');
    if (!reason || !String(reason).trim()) throw new PosError('reason_required', 'A reason is required for adjustments');
    const next = counted !== undefined ? Number(counted) : round3(rec.onHand + Number(delta));
    if (Number.isNaN(next)) throw new PosError('invalid_quantity', 'Enter a number');
    this.audit(actor, 'inventory.adjust', id, `${rec.onHand} -> ${next}: ${reason}`);
    this.inv.move([{ id, delta: roundQty(round3(next) - rec.onHand), kind: 'adjust', reason: String(reason).trim(), by: actor && actor.name }], `point of sale: counted ${rec.name}`);
    this.save();
    return clone(this.inv.get(id));
  }

  importInventoryCsv(text, actor) {
    const lines = String(text).split(/\r?\n/).filter(l => l.trim());
    const header = lines.shift().split(',').map(h => h.trim().toLowerCase());
    for (const required of ['name', 'qty']) if (!header.includes(required)) throw new PosError('invalid_csv', `CSV needs a ${required} column`);
    const created = [], received = [];
    for (const line of lines) {
      const cells = line.split(',').map(c => c.trim());
      const row = Object.fromEntries(header.map((h, i) => [h, cells[i]]));
      const qty = Number(row.qty);
      if (!row.name || Number.isNaN(qty) || qty < 0) throw new PosError('invalid_csv', `Bad row: ${line}`);
      const existing = row.sku ? this.inv.bySku(row.sku) : this.inv.list().find(i => i.name === row.name);
      if (existing) { if (qty > 0) { this.receiveStock(existing.id, { qty, note: 'csv' }, actor); received.push(existing.id); } }
      else created.push(this.upsert('inventory', { name: row.name, sku: row.sku, onHand: qty, unit: row.unit, reorderPoint: Number(row.reorder) || 0, cost: row.cost ? Math.round(Number(row.cost) * 100) : 0 }, actor).id);
    }
    return { created: created.length, received: received.length };
  }

  lowStock() { return this.inv.list().filter(i => i.active !== false && i.onHand <= i.reorderPoint).map(clone); }

  inventoryValue() { return this.inv.list().filter(i => i.active !== false).reduce((sum, i) => sum + Math.round(i.onHand * i.cost), 0); }

  // Find an item by anything a scanner can produce: SKU, UPC/EAN/GTIN in any padding, UPC-E, GS1 Digital Link, GS1 element string.
  findItem(code) {
    const wanted = new Set(scancode.candidates(code));
    if (!wanted.size) return null;
    for (const item of this.state.items) {
      if (item.active === false) continue;
      if (scancode.matches(item.barcode, wanted) || scancode.matches(item.sku, wanted)) return { item, variant: null };
      const variant = item.variants.find(v => scancode.matches(v.barcode, wanted) || scancode.matches(v.sku, wanted));
      if (variant) return { item, variant };
    }
    return null;
  }

  stockOf(inventoryId) { return this.find('inventory', inventoryId, 'inventory record'); }
}

function round3(n) { return Math.round(n * 1000) / 1000; }

for (const mod of ['./orders', './cash', './reports', './checkout']) Object.assign(PointOfSale.prototype, require(mod));

module.exports = { PointOfSale };
