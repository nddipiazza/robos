'use strict';

const ROLE_PERMS = {
  cashier: ['sell', 'tabs', 'cash.tender', 'drawer.open', 'drawer.close', 'prep', 'orders.view', 'discount.small', 'inventory.view'],
  manager: ['discount.any', 'refund', 'void.sent', 'void.paid', 'cash.movement', 'drawer.close.variance', 'inventory.adjust', 'inventory.receive', 'reports', 'cash.admin', 'orders.all'],
  admin: ['catalog', 'staff', 'settings', 'apikeys', 'seed'],
};

function permsFor(role) {
  const order = ['cashier', 'manager', 'admin'];
  const idx = order.indexOf(role);
  if (idx < 0) return [];
  return order.slice(0, idx + 1).flatMap(r => ROLE_PERMS[r]);
}

function defaultSettings() {
  return {
    business: { name: 'My Shop', type: 'retail', currency: 'USD', address: '', receiptFooter: 'Thank you!' },
    tax: { inclusive: false },
    cash: {
      enabled: true,
      requireOpenDrawer: true,
      rounding: 0,
      quickTender: [500, 1000, 2000, 5000],
      denominations: [10000, 5000, 2000, 1000, 500, 100, 25, 10, 5, 1],
      maxTender: 100000,
      varianceThreshold: 500,
      allowSelfServiceCash: false,
    },
    card: { enabled: true, provider: 'manual' },
    tips: { enabled: false, presets: [15, 18, 20] },
    discounts: { cashierMaxPercent: 10 },
    kiosk: { enabled: true, allowCard: true, allowPayAtCounter: true, allowAgeRestricted: false, welcome: 'Touch to start your order' },
    inventory: { allowNegativeStock: false },
    orderTypes: ['dine_in', 'takeout'],
    autoSendOnPay: true,
  };
}

function emptyState() {
  return {
    version: 1,
    settings: defaultSettings(),
    staff: [],
    categories: [],
    items: [],
    modifierGroups: [],
    taxes: [],
    promotions: [],
    priceRules: [],
    inventory: [],
    orders: [],
    drawers: [],
    checkoutSessions: [],
    apiKeys: [],
    audit: [],
    counters: { order: 0 },
  };
}

module.exports = { ROLE_PERMS, permsFor, defaultSettings, emptyState };
