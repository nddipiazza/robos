'use strict';
// Auto parts sales plugin: the parts counter is RobOS Point of Sale itself (packages/point-of-sale), embedded, not
// rebuilt. Its register, back office, barcode scanning, cash drawer and reports run on a loopback-only server
// started inside Auto Center, with the register's data in the shop's plugin folder so it is backed up with the shop.
const path = require('node:path');
const POS = path.join(__dirname, '../../../point-of-sale/lib');
module.exports = core => {
  const counters = new Map(); // data folder -> { pos, origin }
  function pos(service) {
    const dir = core.host.dataDir(service, 'parts-sales');
    if (!counters.has(dir)) { const { PointOfSale } = require(path.join(POS, 'pos')); counters.set(dir, { pos: new PointOfSale({ dir, now: () => service.clock() }), origin: null }); }
    return counters.get(dir);
  }
  async function serve(service) {
    const c = pos(service);
    if (!c.origin) { const { createServer, listen } = require(path.join(POS, 'server')); const server = createServer(c.pos, { lan: false }), port = await listen(server, { port: 0, host: '127.0.0.1' }); server.unref(); c.origin = `http://127.0.0.1:${port}`; }
    return c;
  }
  const dayStart = now => new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  function today(service) {
    const { pos: p } = pos(service), now = service.clock(), r = p.salesReport({ from: dayStart(now), to: now.toISOString() });
    return { orders: r.orders, netSales: r.netSales, netCollected: r.netCollected, currency: p.settings.business.currency || 'USD', business: p.settings.business.name, setUp: p.state.staff.length > 0, items: p.state.items.length, lowStock: p.lowStock().length, topItems: r.topItems.slice(0, 5) };
  }
  const money = (minor, currency) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100);
  return {
    actions: {
      partsCounter: service => today(service),
      async openPartsCounter(service, input = {}) {
        if (!service.ui?.openWindow) throw new Error('The parts counter opens in its own window from the Auto Center app');
        const c = await serve(service), route = { register: '/', kiosk: '/kiosk' }[input.screen || 'register']; if (!route) throw new Error('Unknown parts counter screen');
        service.ui.openWindow(c.origin + route, { title: input.screen === 'kiosk' ? 'Parts counter self-checkout' : 'Parts counter', origin: c.origin, fullscreen: input.screen === 'kiosk' });
        return { opened: true };
      },
    },
    reportCards(nodes, { service }) {
      const t = today(service); if (!t.setUp) return [];
      return [{ panel: 'floor', label: 'Parts counter sales today', value: money(t.netSales, t.currency), note: `${t.orders} sale${t.orders === 1 ? '' : 's'} · ${t.lowStock} counter items low` }];
    },
  };
};
