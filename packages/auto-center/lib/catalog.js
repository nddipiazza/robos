'use strict';
// Type-ahead search over makes, models, years, trouble codes, parts and labor operations.
// Vehicle data comes from the imported public KGraph; parts come from the shop's own catalog plus a small
// bundled list of common part names (names only: no prices and no fitment claims).
const fs = require('node:fs'), path = require('node:path');
const common = file => JSON.parse(fs.readFileSync(path.join(__dirname, '../data', file), 'utf8'));
const norm = s => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9./+ -]+/g, ' ').replace(/\s+/g, ' ').trim();
class Index {
  constructor(items) {
    this.items = items.map(i => ({ ...i, key: norm(i.label + ' ' + (i.alias || '')) })).map(i => ({ ...i, words: i.key.split(' ') }));
    this.buckets = new Map();
    this.items.forEach((item, n) => { const seen = new Set(); for (const w of item.words) for (const len of [1, 2]) { const p = w.slice(0, len); if (p && !seen.has(p)) { seen.add(p); (this.buckets.get(p) || this.buckets.set(p, []).get(p)).push(n); } } });
  }
  search(query, { limit = 12, filter, boost } = {}) {
    const tokens = norm(query).split(' ').filter(Boolean);
    const pool = tokens.length ? this.buckets.get(tokens[0].slice(0, 2)) || (tokens[0].length > 1 ? [] : this.buckets.get(tokens[0])) || [] : this.items.map((_, n) => n);
    const hits = [];
    for (const n of pool) {
      const item = this.items[n]; if (filter && !filter(item)) continue;
      if (!tokens.every(t => item.words.some(w => w.startsWith(t)))) continue;
      const q = tokens.join(' ');
      const rank = (item.key.startsWith(q) ? 0 : item.words[0].startsWith(tokens[0] || '') ? 1 : 2) + (boost?.(item) ? -3 : 0);
      hits.push({ item, rank });
      if (hits.length > 4000) break;
    }
    hits.sort((a, b) => a.rank - b.rank || a.item.label.length - b.item.label.length || a.item.label.localeCompare(b.item.label));
    return hits.slice(0, limit).map(h => { const { key, words, ...rest } = h.item; return rest; });
  }
}
class Catalog {
  constructor() { this.vehicleIndexes = null; this.signature = null; this.common = null; }
  build(parser) {
    const nodes = parser.nodes, byId = new Map(nodes.map(n => [n['@id'], n]));
    const makes = new Map(), models = new Map(), years = new Map(), configs = [], codes = [];
    const name = n => n?.['schema:name'] || n?.['dcterms:title'] || '';
    for (const n of nodes) if (n['@type'] === 'robos:VehicleMake' && name(n) && !makes.has(norm(name(n)))) makes.set(norm(name(n)), { label: name(n), kind: 'make', make: name(n) });
    for (const n of nodes) {
      if (n['@type'] === 'robos:VehicleModel') {
        const make = name(byId.get(n['robos:make']?.['@id'])); if (!make || !name(n)) continue;
        const key = norm(make) + '|' + norm(name(n)); if (!models.has(key)) models.set(key, { label: name(n), detail: make, kind: 'model', make, model: name(n) });
        if (!makes.has(norm(make))) makes.set(norm(make), { label: make, kind: 'make', make });
      } else if (n['@type'] === 'robos:VehicleConfiguration') {
        const model = byId.get(n['robos:model']?.['@id']), make = name(byId.get(model?.['robos:make']?.['@id'])), year = String(n['schema:modelDate'] || '');
        if (!model || !make || !year) continue;
        const key = norm(make) + '|' + norm(name(model)); (years.get(key) || years.set(key, new Set()).get(key)).add(year);
        const engine = n['schema:vehicleEngine']?.['schema:engineDisplacement']?.['schema:value'];
        configs.push({ label: `${year} ${make} ${name(model)}`, detail: [engine ? engine + ' L' : '', n['schema:vehicleTransmission'], n['schema:driveWheelConfiguration'], n['schema:fuelType']].filter(Boolean).join(' · '), kind: 'config', year, make, model: name(model) });
      } else if (n['@type'] === 'robos:DiagnosticCode') codes.push({ label: n['schema:name'], detail: n['schema:description'], alias: n['schema:description'], kind: 'dtc', code: n['schema:name'], description: n['schema:description'] });
    }
    return { make: new Index([...makes.values()]), model: new Index([...models.values()]), config: new Index(configs), dtc: new Index(codes), years };
  }
  vehicles(parser) { if (!this.vehicleIndexes || this.signature !== parser) { this.vehicleIndexes = this.build(parser); this.signature = parser; } return this.vehicleIndexes; }
  commonIndexes() {
    if (!this.common) this.common = {
      part: new Index(common('common-parts.json').map(p => ({ label: p.name, detail: p.category, kind: 'part', name: p.name, source: 'common' }))),
      labor: new Index(common('common-labor.json').map(l => ({ label: l.name, detail: `typically about ${l.hours} h — adjust to the job`, kind: 'labor', name: l.name, hours: String(l.hours), source: 'common' }))),
    };
    return this.common;
  }
  search(kind, query, ctx, { parser, shopParts = [] }) {
    query = String(query ?? '').slice(0, 100); ctx = ctx || {};
    if (kind === 'make') return this.vehicles(parser).make.search(query);
    if (kind === 'model') { const m = norm(ctx.make); return this.vehicles(parser).model.search(query, { filter: m ? i => norm(i.make) === m : undefined }); }
    if (kind === 'year') {
      const set = this.vehicles(parser).years.get(norm(ctx.make) + '|' + norm(ctx.model)), q = String(query).trim();
      return [...(set || [])].filter(y => y.startsWith(q)).sort((a, b) => b - a).slice(0, 12).map(y => ({ label: y, kind: 'year', year: y }));
    }
    if (kind === 'config') return this.vehicles(parser).config.search(query, { filter: i => (!ctx.make || norm(i.make) === norm(ctx.make)) && (!ctx.model || norm(i.model) === norm(ctx.model)) });
    if (kind === 'dtc') return this.vehicles(parser).dtc.search(query);
    if (kind === 'part') {
      const own = new Index(shopParts), mk = norm(ctx.make), md = norm(ctx.model);
      const fits = i => i.fitsMake && norm(i.fitsMake) === mk && (!i.fitsModel || !md || norm(i.fitsModel) === md);
      const mine = own.search(query, { boost: fits }), seen = new Set(mine.map(p => norm(p.name)));
      return [...mine, ...this.commonIndexes().part.search(query).filter(p => !seen.has(norm(p.name)))].slice(0, 12);
    }
    if (kind === 'labor') return this.commonIndexes().labor.search(query);
    throw new Error('Unknown catalog search');
  }
}
module.exports = { Catalog, Index, norm };
