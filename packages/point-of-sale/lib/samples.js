'use strict';
// Demo businesses. Prices are cents, barcodes are valid UPC-A, PINs are demo-only (Admin 1111, Manager 2222, Cashier 3333).
const { withCheckDigit } = require('./gtin');
const { emptyState } = require('./defaults');
const { PosError } = require('./errors');

const upc = n => withCheckDigit(String(61200000000 + n));

function staff(pos) {
  pos.addStaff({ name: 'Olivia (Owner)', role: 'admin', pin: '1111' });
  pos.addStaff({ name: 'Marcus (Manager)', role: 'manager', pin: '2222' });
  pos.addStaff({ name: 'Cleo (Cashier)', role: 'cashier', pin: '3333' });
}

const helpers = pos => ({
  cat: (name, color) => pos.upsert('categories', { name, color }).id,
  tax: (name, rateBp) => pos.upsert('taxes', { name, rateBp }).id,
  inv: (name, onHand, unit, extra = {}) => pos.upsert('inventory', { name, onHand, unit, ...extra }).id,
  group: (g) => pos.upsert('modifierGroups', g).id,
  item: (i) => pos.upsert('items', i),
});

function clothing(pos) {
  const { cat, tax, item } = helpers(pos);
  Object.assign(pos.state.settings.business, { name: 'Threadwell Clothing', type: 'retail', address: '14 Market Street' });
  Object.assign(pos.state.settings, { orderTypes: ['retail'], autoSendOnPay: false });
  pos.state.settings.kiosk.allowPayAtCounter = true;
  pos.state.settings.card.provider = 'mock';
  const salesTax = tax('Sales tax', 825);
  const tops = cat('Tops', '#3b82f6'), bottoms = cat('Bottoms', '#7c3aed'), outer = cat('Outerwear', '#f97316'), acc = cat('Accessories', '#14b8a6');
  let n = 0, style = 0;
  const sized = (name, categoryId, price, sizes, stock, emoji) => {
    const code = `TW${String(++style).padStart(2, '0')}`;
    return item({
      name, categoryId, price, taxId: salesTax, emoji, sku: code,
      variants: sizes.map(size => ({ name: size, sku: `${code}-${size}`, barcode: upc(++n), stock, cost: Math.round(price * 0.4) })),
    });
  };
  sized('Classic Tee White', tops, 2400, ['S', 'M', 'L', 'XL'], 10, '👕');
  sized('Classic Tee Black', tops, 2400, ['S', 'M', 'L', 'XL'], 10, '👕');
  sized('Oxford Shirt', tops, 5800, ['S', 'M', 'L'], 6, '👔');
  sized('Slim Jeans', bottoms, 6800, ['30', '32', '34', '36'], 5, '👖');
  sized('Chino Shorts', bottoms, 4400, ['30', '32', '34'], 4, '🩳');
  sized('Rain Jacket', outer, 12000, ['S', 'M', 'L'], 3, '🧥');
  sized('Zip Hoodie', outer, 5500, ['S', 'M', 'L', 'XL'], 6, '🧥');
  item({ name: 'Wool Beanie', categoryId: acc, price: 2200, taxId: salesTax, barcode: upc(++n), stock: 15, emoji: '🧢', sku: 'TW-BEANIE' });
  item({ name: 'Leather Belt', categoryId: acc, price: 3800, taxId: salesTax, barcode: upc(++n), stock: 8, emoji: '🪢', sku: 'TW-BELT' });
  item({ name: 'Canvas Tote', categoryId: acc, price: 1800, taxId: salesTax, barcode: upc(++n), stock: 20, emoji: '👜', sku: 'TW-TOTE' });
  item({ name: 'Wool Socks (pair)', categoryId: acc, price: 1400, taxId: salesTax, barcode: upc(++n), stock: 2, emoji: '🧦', sku: 'TW-SOCKS' });
  pos.upsert('promotions', { code: 'SAVE10', name: '10% off', type: 'percent', value: 10 });
  pos.upsert('promotions', { code: 'WELCOME5', name: '$5 off $50', type: 'fixed', value: 500, minSubtotal: 5000 });
}

function coffee(pos) {
  const { cat, tax, inv, group, item } = helpers(pos);
  Object.assign(pos.state.settings.business, { name: 'Bean There Coffee', type: 'food', address: '2 Roaster Lane' });
  Object.assign(pos.state.settings, { orderTypes: ['dine_in', 'takeout'], autoSendOnPay: true });
  pos.state.settings.tips = { enabled: true, presets: [15, 18, 20] };
  pos.state.settings.card.provider = 'mock';
  const food = tax('Prepared food tax', 850);
  const espresso = cat('Espresso', '#7c3aed'), brewed = cat('Brewed & Cold', '#3b82f6'), bakery = cat('Bakery', '#f97316'), eats = cat('Sandwiches', '#22c55e');
  const beans = inv('Espresso beans', 5000, 'g', { reorderPoint: 500 });
  const whole = inv('Whole milk', 20000, 'ml', { reorderPoint: 2000 });
  const oat = inv('Oat milk', 8000, 'ml', { reorderPoint: 1000 });
  const almond = inv('Almond milk', 6000, 'ml', { reorderPoint: 1000 });
  const cups = inv('Cups', 400, 'each', { reorderPoint: 50 });
  const size = group({ name: 'Size', required: true, options: [{ name: 'Small', price: 0 }, { name: 'Medium', price: 50 }, { name: 'Large', price: 100 }] });
  const milk = group({ name: 'Milk', required: true, options: [
    { name: 'Whole', price: 0, recipe: [{ inventoryId: whole, qty: 200 }] },
    { name: 'Oat', price: 60, recipe: [{ inventoryId: oat, qty: 200 }] },
    { name: 'Almond', price: 60, recipe: [{ inventoryId: almond, qty: 200 }] },
  ] });
  const extras = group({ name: 'Extras', max: 3, multiple: true, options: [{ name: 'Extra shot', price: 75, recipe: [{ inventoryId: beans, qty: 18 }] }, { name: 'Vanilla syrup', price: 50 }, { name: 'Caramel drizzle', price: 50 }] });
  const toasted = group({ name: 'Warm up', max: 1, options: [{ name: 'Toasted', price: 0 }, { name: 'Warmed', price: 0 }] });
  const drink = (name, categoryId, price, extra = {}) => item({ name, categoryId, price, taxId: food, station: 'barista', recipe: [{ inventoryId: cups, qty: 1 }, ...(extra.shots ? [{ inventoryId: beans, qty: 18 * extra.shots }] : [])], modifierGroupIds: extra.groups || [size], emoji: extra.emoji || '☕', sku: `CF-${name.replace(/\W+/g, '').slice(0, 8).toUpperCase()}` });
  drink('Espresso', espresso, 300, { shots: 1, groups: [] });
  drink('Americano', espresso, 350, { shots: 1, groups: [size, extras] });
  drink('Latte', espresso, 450, { shots: 1, groups: [size, milk, extras] });
  drink('Cappuccino', espresso, 450, { shots: 1, groups: [size, milk, extras] });
  drink('Drip Coffee', brewed, 275, { groups: [size] });
  drink('Cold Brew', brewed, 425, { groups: [size], emoji: '🧊' });
  drink('Hot Chocolate', brewed, 375, { groups: [size, milk], emoji: '🍫' });
  const bake = (name, categoryId, price, stock, emoji, groups = []) => item({ name, categoryId, price, taxId: food, station: 'kitchen', stock, cost: Math.round(price * 0.35), emoji, modifierGroupIds: groups, sku: `BK-${name.replace(/\W+/g, '').slice(0, 8).toUpperCase()}` });
  bake('Butter Croissant', bakery, 325, 12, '🥐', [toasted]);
  bake('Blueberry Muffin', bakery, 350, 10, '🧁');
  bake('Banana Bread Slice', bakery, 300, 10, '🍞', [toasted]);
  bake('Breakfast Sandwich', eats, 650, 6, '🥪', [toasted]);
  bake('Turkey Pesto Panini', eats, 895, 4, '🥪');
}

function bar(pos) {
  const { cat, tax, inv, group, item } = helpers(pos);
  Object.assign(pos.state.settings.business, { name: 'The Rusty Anchor', type: 'bar', address: '9 Harbor Row' });
  Object.assign(pos.state.settings, { orderTypes: ['bar', 'table'], autoSendOnPay: false });
  pos.state.settings.tips = { enabled: true, presets: [18, 20, 25] };
  pos.state.settings.kiosk.enabled = false;
  pos.state.settings.card.provider = 'mock';
  const alc = tax('Alcohol tax', 1000), food = tax('Food tax', 800);
  const beer = cat('Draft Beer', '#eab308'), cocktails = cat('Cocktails', '#ec4899'), wine = cat('Wine', '#7c3aed'), shots = cat('Shots', '#ef4444'), snacks = cat('Bar Snacks', '#22c55e');
  const ipa = inv('IPA keg', 1984, 'oz', { reorderPoint: 200 }), lager = inv('Lager keg', 1984, 'oz', { reorderPoint: 200 });
  const bourbon = inv('Bourbon', 300, 'oz', { reorderPoint: 40 }), tequila = inv('Tequila', 300, 'oz', { reorderPoint: 40 }), gin = inv('Gin', 300, 'oz', { reorderPoint: 40 }), vodka = inv('Vodka', 300, 'oz', { reorderPoint: 40 });
  const tonic = inv('Tonic', 800, 'oz'), limes = inv('Limes', 60, 'each', { reorderPoint: 10 }), red = inv('House red (bottles)', 12, 'bottle', { reorderPoint: 2 });
  const wings = inv('Wing portions', 30, 'each', { reorderPoint: 5 }), pretzels = inv('Pretzel bites', 20, 'each', { reorderPoint: 4 });
  const pitcher = group({ name: 'Size', required: true, options: [{ name: 'Pint', price: 0 }, { name: 'Pitcher', price: 1300, recipe: [{ inventoryId: ipa, qty: 48 }] }] });
  const lagerSize = group({ name: 'Lager size', required: true, options: [{ name: 'Pint', price: 0 }, { name: 'Pitcher', price: 1200, recipe: [{ inventoryId: lager, qty: 48 }] }] });
  // A double pour uses one more measure of that item's own spirit, so each spirit gets its own group.
  const pourOf = spirit => group({ name: 'Pour', required: true, options: [{ name: 'Single', price: 0 }, { name: 'Double', price: 500, recipe: [{ inventoryId: spirit, qty: 2 }] }] });
  const prep = group({ name: 'Style', max: 1, options: [{ name: 'On the rocks', price: 0 }, { name: 'Up', price: 0 }, { name: 'Neat', price: 0 }] });
  const drinkItem = (name, categoryId, price, recipe, groups, emoji) => item({ name, categoryId, price, taxId: alc, station: 'bar', ageRestricted: true, recipe, modifierGroupIds: groups, emoji, sku: `BR-${name.replace(/\W+/g, '').slice(0, 8).toUpperCase()}` });
  drinkItem('Hazy IPA', beer, 700, [{ inventoryId: ipa, qty: 16 }], [pitcher], '🍺');
  drinkItem('Crisp Lager', beer, 600, [{ inventoryId: lager, qty: 16 }], [lagerSize], '🍺');
  drinkItem('Old Fashioned', cocktails, 1200, [{ inventoryId: bourbon, qty: 2 }], [pourOf(bourbon), prep], '🥃');
  drinkItem('Margarita', cocktails, 1100, [{ inventoryId: tequila, qty: 2 }, { inventoryId: limes, qty: 1 }], [pourOf(tequila)], '🍹');
  drinkItem('Gin & Tonic', cocktails, 1000, [{ inventoryId: gin, qty: 2 }, { inventoryId: tonic, qty: 4 }, { inventoryId: limes, qty: 1 }], [pourOf(gin)], '🍸');
  drinkItem('Moscow Mule', cocktails, 1100, [{ inventoryId: vodka, qty: 2 }, { inventoryId: limes, qty: 1 }], [pourOf(vodka)], '🍹');
  drinkItem('House Red (glass)', wine, 900, [{ inventoryId: red, qty: 0.2 }], [], '🍷');
  drinkItem('Well Whiskey Shot', shots, 600, [{ inventoryId: bourbon, qty: 1.5 }], [], '🥃');
  item({ name: 'Wings (6)', categoryId: snacks, price: 1300, taxId: food, station: 'kitchen', recipe: [{ inventoryId: wings, qty: 1 }], emoji: '🍗', sku: 'BR-WINGS' });
  item({ name: 'Pretzel Bites', categoryId: snacks, price: 800, taxId: food, station: 'kitchen', recipe: [{ inventoryId: pretzels, qty: 1 }], emoji: '🥨', sku: 'BR-PRETZEL' });
  item({ name: 'Salted Peanuts', categoryId: snacks, price: 300, taxId: food, stock: 40, emoji: '🥜', sku: 'BR-PEANUT' });
  pos.upsert('priceRules', { name: 'Happy Hour -25%', percentOff: 25, categoryIds: [beer, cocktails, wine], days: [1, 2, 3, 4, 5], start: '16:00', end: '18:00' });
}

const PROFILES = {
  clothing: { title: 'Clothing store', summary: 'Retail: sizes, barcodes, returns, self-checkout scanning', build: clothing },
  coffee: { title: 'Coffee shop', summary: 'Food and drinks: modifiers, recipes, prep queue, tips, self-checkout', build: coffee },
  bar: { title: 'Bar', summary: 'Open tabs, happy hour, age checks, comps, split checks, tips', build: bar },
};

// Replaces the shop's data with a sample business. Allowed when empty, or for an admin.
function loadSample(pos, profile) {
  const def = PROFILES[profile];
  if (!def) throw new PosError('unknown_profile', `Choose one of ${Object.keys(PROFILES).join(', ')}`, 404);
  const keepProviders = pos.providers;
  pos.state = emptyState();
  pos.sessions.clear();
  pos.providers = keepProviders;
  staff(pos);
  def.build(pos);
  pos.audit(null, 'sample.load', profile);
  pos.save();
  return { profile, title: def.title };
}

module.exports = { PROFILES, loadSample };
