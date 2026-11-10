'use strict';

/**
 * Default store templates, aisles, quick-add staples, and smart aisle/store classification
 * for RobOS Shopping Lists (Household & Personal Finance suite).
 */

const UNITS = ['ea', 'pack', 'lb', 'oz', 'gal', 'case', 'bag', 'box', 'bunch', 'bottle', 'jar'];

const BADGES = [
  { id: '', label: 'None', icon: '' },
  { id: 'urgent', label: 'Must Have', icon: '🔥', color: '#f97316' },
  { id: 'deal', label: 'Sale / Coupon', icon: '🏷️', color: '#eab308' },
  { id: 'organic', label: 'Organic', icon: '🌿', color: '#10b981' },
  { id: 'kirkland', label: 'Store Brand / Fav', icon: '⭐', color: '#3b82f6' },
];

const DEFAULT_LISTS = [
  {
    id: 'grocery',
    slug: 'grocery',
    name: 'Grocery',
    subtitle: 'Weekly fresh market, produce, dairy & pantry',
    icon: '🥬',
    accent: '#10b981',
    accentGlow: 'rgba(16, 185, 129, 0.24)',
    docTitle: 'Grocery — RobOS Shopping List',
    householdCategory: 'Groceries',
    aisles: [
      'Produce',
      'Dairy & Eggs',
      'Bakery',
      'Meat & Seafood',
      'Pantry & Dry Goods',
      'Frozen',
      'Beverages',
      'Snacks',
      'Household',
    ],
    staples: [
      { name: 'Organic Whole Milk', qty: 1, unit: 'gal', aisle: 'Dairy & Eggs', estPrice: 5.49, badge: 'organic' },
      { name: 'Pasture-Raised Eggs (12ct)', qty: 1, unit: 'box', aisle: 'Dairy & Eggs', estPrice: 6.29, badge: 'organic' },
      { name: 'Hass Avocados', qty: 4, unit: 'ea', aisle: 'Produce', estPrice: 1.50, badge: '' },
      { name: 'Honeycrisp Apples', qty: 6, unit: 'ea', aisle: 'Produce', estPrice: 0.99, badge: '' },
      { name: 'Sourdough Country Loaf', qty: 1, unit: 'ea', aisle: 'Bakery', estPrice: 5.99, badge: '' },
      { name: 'Baby Spinach', qty: 1, unit: 'bag', aisle: 'Produce', estPrice: 3.99, badge: 'organic' },
      { name: 'Plain Greek Yogurt (32oz)', qty: 1, unit: 'ea', aisle: 'Dairy & Eggs', estPrice: 5.79, badge: '' },
      { name: 'Boneless Chicken Thighs', qty: 2, unit: 'lb', aisle: 'Meat & Seafood', estPrice: 5.99, badge: '' },
      { name: 'Cold Brew Coffee', qty: 1, unit: 'bottle', aisle: 'Beverages', estPrice: 4.99, badge: '' },
      { name: 'San Marzano Tomatoes', qty: 2, unit: 'ea', aisle: 'Pantry & Dry Goods', estPrice: 3.49, badge: '' },
      { name: 'Salted Grass-Fed Butter', qty: 1, unit: 'pack', aisle: 'Dairy & Eggs', estPrice: 4.99, badge: '' },
      { name: 'Bananas', qty: 1, unit: 'bunch', aisle: 'Produce', estPrice: 1.89, badge: '' },
    ],
    starterItems: [
      { id: 'groc-1', name: 'Organic Whole Milk', qty: 1, unit: 'gal', aisle: 'Dairy & Eggs', estPrice: 5.49, badge: 'organic', note: 'Whole or 2% if out', checked: false },
      { id: 'groc-2', name: 'Pasture-Raised Eggs (12ct)', qty: 1, unit: 'box', aisle: 'Dairy & Eggs', estPrice: 6.29, badge: 'urgent', note: 'Check for cracked shells', checked: false },
      { id: 'groc-3', name: 'Hass Avocados', qty: 4, unit: 'ea', aisle: 'Produce', estPrice: 1.50, badge: '', note: '2 ripe for tonight, 2 firm', checked: false },
      { id: 'groc-4', name: 'Honeycrisp Apples', qty: 6, unit: 'ea', aisle: 'Produce', estPrice: 0.99, badge: 'organic', note: 'Lunchbox size', checked: false },
      { id: 'groc-5', name: 'Sourdough Country Loaf', qty: 1, unit: 'ea', aisle: 'Bakery', estPrice: 5.99, badge: '', note: 'Sliced thick', checked: false },
      { id: 'groc-6', name: 'Wild Alaskan Sockeye Salmon', qty: 1.5, unit: 'lb', aisle: 'Meat & Seafood', estPrice: 12.99, badge: 'deal', note: 'Friday dinner', checked: false },
      { id: 'groc-7', name: 'Bronze-Cut Rigatoni Pasta', qty: 2, unit: 'box', aisle: 'Pantry & Dry Goods', estPrice: 2.79, badge: '', note: '', checked: false },
      { id: 'groc-8', name: 'Baby Spinach', qty: 1, unit: 'bag', aisle: 'Produce', estPrice: 3.99, badge: 'organic', note: '', checked: true },
    ],
  },
  {
    id: 'target',
    slug: 'target',
    name: 'Target',
    subtitle: 'Household essentials, pharmacy, personal care & home run',
    icon: '🎯',
    accent: '#ef4444',
    accentGlow: 'rgba(239, 68, 68, 0.24)',
    docTitle: 'Target — RobOS Shopping List',
    householdCategory: 'Household & Personal Care',
    aisles: [
      'Household Essentials',
      'Personal Care & Beauty',
      'Health & Pharmacy',
      'Kitchen & Dining',
      'Home & Storage',
      'Kids & Pets',
      'Electronics & Tech',
      'Market & Snacks',
    ],
    staples: [
      { name: 'Free & Clear Laundry Pods', qty: 1, unit: 'pack', aisle: 'Household Essentials', estPrice: 15.99, badge: 'deal' },
      { name: 'Dishwasher Platinum Pacs', qty: 1, unit: 'pack', aisle: 'Household Essentials', estPrice: 14.49, badge: '' },
      { name: 'Foaming Hand Soap Refill', qty: 2, unit: 'bottle', aisle: 'Personal Care & Beauty', estPrice: 5.99, badge: '' },
      { name: 'Sensodyne Toothpaste 2-Pack', qty: 1, unit: 'pack', aisle: 'Personal Care & Beauty', estPrice: 12.49, badge: '' },
      { name: 'Ziploc Freezer Quart Bags', qty: 1, unit: 'box', aisle: 'Kitchen & Dining', estPrice: 5.79, badge: '' },
      { name: 'AA Alkaline Batteries (16pk)', qty: 1, unit: 'pack', aisle: 'Electronics & Tech', estPrice: 13.99, badge: '' },
      { name: 'Unbleached Parchment Paper', qty: 1, unit: 'box', aisle: 'Kitchen & Dining', estPrice: 4.49, badge: '' },
      { name: 'Allergy Relief 24hr Tablets', qty: 1, unit: 'box', aisle: 'Health & Pharmacy', estPrice: 16.99, badge: '' },
      { name: 'Facial Tissues 4-Cube Pack', qty: 1, unit: 'pack', aisle: 'Household Essentials', estPrice: 6.99, badge: '' },
      { name: 'USB-C Braided Cable (6ft)', qty: 1, unit: 'ea', aisle: 'Electronics & Tech', estPrice: 9.99, badge: '' },
    ],
    starterItems: [
      { id: 'tgt-1', name: 'Free & Clear Laundry Pods', qty: 1, unit: 'pack', aisle: 'Household Essentials', estPrice: 15.99, badge: 'deal', note: 'Target Circle $3 digital coupon', checked: false },
      { id: 'tgt-2', name: 'Foaming Hand Soap Refill', qty: 2, unit: 'bottle', aisle: 'Personal Care & Beauty', estPrice: 5.99, badge: '', note: 'Lavender or Meyer Lemon', checked: false },
      { id: 'tgt-3', name: 'Sensodyne Toothpaste 2-Pack', qty: 1, unit: 'pack', aisle: 'Personal Care & Beauty', estPrice: 12.49, badge: 'urgent', note: 'Hallway bathroom out', checked: false },
      { id: 'tgt-4', name: 'Ziploc Freezer Quart Bags', qty: 2, unit: 'box', aisle: 'Kitchen & Dining', estPrice: 5.79, badge: '', note: 'Grip n Seal', checked: false },
      { id: 'tgt-5', name: 'Children Ibuprofen Chewables', qty: 1, unit: 'box', aisle: 'Health & Pharmacy', estPrice: 8.49, badge: '', note: 'Grape flavor for medicine cabinet', checked: false },
      { id: 'tgt-6', name: 'Clear Pantry Organizer Bins', qty: 2, unit: 'ea', aisle: 'Home & Storage', estPrice: 9.00, badge: 'kirkland', note: 'Brightroom 10x6x5 stackable', checked: false },
      { id: 'tgt-7', name: 'Sparkling Peach Water (8pk)', qty: 1, unit: 'pack', aisle: 'Market & Snacks', estPrice: 3.99, badge: '', note: '', checked: true },
    ],
  },
  {
    id: 'costco',
    slug: 'costco',
    name: 'Costco',
    subtitle: 'Wholesale club bulk pantry, Kirkland favorites & freezer stock-up',
    icon: '📦',
    accent: '#3b82f6',
    accentGlow: 'rgba(59, 130, 246, 0.24)',
    docTitle: 'Costco — RobOS Shopping List',
    householdCategory: 'Groceries & Wholesale',
    aisles: [
      'Kirkland Signature',
      'Rotisserie & Deli',
      'Bulk Produce',
      'Meat & Poultry',
      'Freezer Bulk',
      'Pantry & Oils',
      'Paper & Cleaning',
      'Beverages & Cases',
      'Bakery & Sweet',
    ],
    staples: [
      { name: 'Hot Rotisserie Chicken', qty: 1, unit: 'ea', aisle: 'Rotisserie & Deli', estPrice: 4.99, badge: 'kirkland' },
      { name: 'Kirkland Paper Towels (12ct)', qty: 1, unit: 'pack', aisle: 'Paper & Cleaning', estPrice: 19.99, badge: 'kirkland' },
      { name: 'Kirkland Bath Tissue (30ct)', qty: 1, unit: 'pack', aisle: 'Paper & Cleaning', estPrice: 21.49, badge: 'kirkland' },
      { name: 'Extra Virgin Olive Oil (2L)', qty: 1, unit: 'bottle', aisle: 'Pantry & Oils', estPrice: 22.99, badge: 'organic' },
      { name: 'Kerrygold Pure Irish Butter (4pk)', qty: 1, unit: 'pack', aisle: 'Rotisserie & Deli', estPrice: 14.89, badge: '' },
      { name: 'Butter Croissants (12ct)', qty: 1, unit: 'box', aisle: 'Bakery & Sweet', estPrice: 5.99, badge: 'kirkland' },
      { name: 'Organic Blueberries (18oz)', qty: 2, unit: 'pack', aisle: 'Bulk Produce', estPrice: 6.99, badge: 'organic' },
      { name: 'Topo Chico Sparkling Mineral Water (18ct)', qty: 1, unit: 'case', aisle: 'Beverages & Cases', estPrice: 21.99, badge: '' },
      { name: 'Wild Caught Mahi-Mahi Portions', qty: 1, unit: 'bag', aisle: 'Freezer Bulk', estPrice: 26.99, badge: '' },
      { name: 'Kirkland Fancy Mixed Nuts (2.5lb)', qty: 1, unit: 'jar', aisle: 'Kirkland Signature', estPrice: 16.99, badge: 'kirkland' },
    ],
    starterItems: [
      { id: 'cos-1', name: 'Hot Rotisserie Chicken', qty: 1, unit: 'ea', aisle: 'Rotisserie & Deli', estPrice: 4.99, badge: 'kirkland', note: 'Grab last on way to checkout', checked: false },
      { id: 'cos-2', name: 'Kirkland Paper Towels (12ct)', qty: 1, unit: 'pack', aisle: 'Paper & Cleaning', estPrice: 19.99, badge: 'kirkland', note: 'Create-a-size rolls', checked: false },
      { id: 'cos-3', name: 'Extra Virgin Olive Oil (2L)', qty: 1, unit: 'bottle', aisle: 'Pantry & Oils', estPrice: 22.99, badge: 'organic', note: '100% Italian glass or dark bottle', checked: false },
      { id: 'cos-4', name: 'Kerrygold Pure Irish Butter (4pk)', qty: 1, unit: 'pack', aisle: 'Rotisserie & Deli', estPrice: 14.89, badge: 'deal', note: 'Instant savings $3.50 off', checked: false },
      { id: 'cos-5', name: 'Organic Blueberries (18oz)', qty: 2, unit: 'pack', aisle: 'Bulk Produce', estPrice: 6.99, badge: 'organic', note: 'Walk-in cold produce room', checked: false },
      { id: 'cos-6', name: 'Just Bare Lightly Breaded Chicken Chunks (4lb)', qty: 1, unit: 'bag', aisle: 'Freezer Bulk', estPrice: 17.99, badge: '', note: 'Quick weeknight air-fryer lunches', checked: false },
      { id: 'cos-7', name: 'Butter Croissants (12ct)', qty: 1, unit: 'box', aisle: 'Bakery & Sweet', estPrice: 5.99, badge: 'kirkland', note: 'Freeze half right away', checked: false },
      { id: 'cos-8', name: 'Kirkland Drawstring Kitchen Bags (200ct)', qty: 1, unit: 'box', aisle: 'Paper & Cleaning', estPrice: 19.49, badge: 'kirkland', note: '13-gallon flex-tech', checked: true },
    ],
  },
];

const KEYWORD_AISLES = {
  grocery: [
    [/\b(apple|banana|avocado|spinach|lettuce|kale|tomato|onion|garlic|potato|\w*berr(?:y|ies)|lemon|lime|cilantro|parsley|carrot|pepper|broccoli|cucumber|fruit|herb|mushroom|grape|orange)(?:s|es)?\b/i, 'Produce'],
    [/\b(milk|egg|yogurt|butter|cheese|cream|cheddar|mozzarella|parmesan|kefir|sour cream|oatmilk)(?:s|es)?\b/i, 'Dairy & Eggs'],
    [/\b(bread|loaf|loaves|sourdough|bagel|baguette|muffin|tortilla|brioche|bun|roll|pita)(?:s|es)?\b/i, 'Bakery'],
    [/\b(chicken|beef|steak|salmon|shrimp|pork|bacon|sausage|turkey|fish|cod|tuna|ground)(?:s|es)?\b/i, 'Meat & Seafood'],
    [/\b(frozen|ice cream|pizza|pea|waffle|popsicle|sorbet)(?:s|es)?\b/i, 'Frozen'],
    [/\b(coffee|tea|water|juice|soda|seltzer|sparkling|kombucha|espresso|milk|wine|beer)(?:s|es)?\b/i, 'Beverages'],
    [/\b(chip|cracker|pretzel|popcorn|granola|bar|cookie|chocolate|almond|nut|hummus)(?:s|es)?\b/i, 'Snacks'],
    [/\b(soap|sponge|foil|napkin|towel|trash|bleach|cleaner|wipe)(?:s|es)?\b/i, 'Household'],
  ],
  target: [
    [/\b(laundry|detergent|pod|dishwasher|tissue|paper towel|trash|bleach|cleaner|lysol|swiffer|wipe)(?:s|es)?\b/i, 'Household Essentials'],
    [/\b(soap|shampoo|conditioner|toothpaste|toothbrush|deodorant|lotion|razor|face|sunscreen|wash|floss)(?:s|es)?\b/i, 'Personal Care & Beauty'],
    [/\b(ibuprofen|tylenol|allergy|vitamin|band-aid|bandage|cough|medicine|melatonin|thermometer|aid)(?:s|es)?\b/i, 'Health & Pharmacy'],
    [/\b(ziploc|parchment|foil|spatula|mug|plate|tupperware|container|wrap|sponge)(?:s|es)?\b/i, 'Kitchen & Dining'],
    [/\b(bin|hanger|basket|candle|pillow|sheet|towel|lamp|frame|organizer|storage)(?:s|es)?\b/i, 'Home & Storage'],
    [/\b(diaper|toy|crayon|lego|cat|dog|pet|treat|litter|marker|kid)(?:s|es)?\b/i, 'Kids & Pets'],
    [/\b(battery|batteries|cable|usb|charger|hdmi|airtag|headphone|adapter)(?:s|es)?\b/i, 'Electronics & Tech'],
  ],
  costco: [
    [/\b(kirkland)\b/i, 'Kirkland Signature'],
    [/\b(rotisserie|deli|ravioli|butter|kerrygold|cheese|salami|prosciutto|hummus|queso)(?:s|es)?\b/i, 'Rotisserie & Deli'],
    [/\b(berry|berries|avocado|spinach|salad|apple|banana|grape|mango|produce|broccoli)(?:s|es)?\b/i, 'Bulk Produce'],
    [/\b(steak|ribeye|chicken breast|thigh|ground beef|pork|brisket|lamb|bacon)(?:s|es)?\b/i, 'Meat & Poultry'],
    [/\b(frozen|chunk|salmon|mahi|dumpling|gyoza|berry|pizza|lasagna|ice cream)(?:s|es)?\b/i, 'Freezer Bulk'],
    [/\b(paper towel|bath tissue|toilet paper|trash bag|detergent|cascade|dawn|clorox|wipe)(?:s|es)?\b/i, 'Paper & Cleaning'],
    [/\b(water|topo chico|coffee|kirkland roast|protein shake|juice|case|soda|seltzer)(?:s|es)?\b/i, 'Beverages & Cases'],
    [/\b(croissant|muffin|danish|cake|cookie|pie|bagel|bakery)(?:s|es)?\b/i, 'Bakery & Sweet'],
    [/\b(olive oil|oil|syrup|honey|rice|quinoa|pasta|flour|spice|oat|nut|almond|peanut butter)(?:s|es)?\b/i, 'Pantry & Oils'],
  ],
};

function detectAisle(list, itemName) {
  const name = String(itemName || '').trim();
  const rules = KEYWORD_AISLES[list?.id] || KEYWORD_AISLES.grocery;
  for (const [re, aisle] of rules) {
    if (re.test(name) && (!Array.isArray(list?.aisles) || list.aisles.includes(aisle))) {
      return aisle;
    }
  }
  if (Array.isArray(list?.aisles) && list.aisles.length > 0) {
    return list.id === 'target' ? 'Household Essentials'
      : list.id === 'costco' ? 'Pantry & Oils'
      : list.aisles.includes('Pantry & Dry Goods') ? 'Pantry & Dry Goods'
      : list.aisles[0];
  }
  return 'General';
}

/**
 * Normalize Whisper STT phonetic mishearings for "Grocery", "Target", and "Costco" shopping lists.
 * Examples from Whisper tiny.en over ESPHome 16kHz mic:
 *   - "my grocery list" -> "the Mike Rotary list", "my grodery list", "my rotary list", "my rosary list", "my glossary list"
 *   - "my costco list"  -> "my cosco list", "my cost co list", "my cusco list", "my rosco list"
 *   - "my target list"  -> "my tar get list", "my targe list", "my targit list"
 */
function normalizeShoppingVoiceTranscript(rawText) {
  let s = String(rawText || '');
  if (!s.trim()) return s;

  // 1. De-hyphenate and normalize phonetic aliases for Grocery, Target, and Costco (e.g. "cost-co-shopping list", "tar-get-list", "grow-siri")
  s = s
    .replace(/\bwheat\s+things\b/gi, 'Wheat Thins')
    .replace(/\b(?:cost|cos|cus|cuz|ros|pas|bos|kos)[\s\-_]*(?:co|go|ko|coe)\b/gi, 'costco')
    .replace(/\b(?:tar)[\s\-_]+(?:get|git|jet|ge)\b/gi, 'target')
    .replace(/\b(?:targit|tarjet)\b/gi, 'target')
    .replace(/\b(?:mike[\s\-_]+rotary|my[\s\-_]+rotary|grodery|grosery|grossary|grossery|grow[\s\-_]*siri|grow[\s\-_]*serie|groceries)\b/gi, 'grocery')
    .replace(/\b(costco|target|grocery|shopping)[\-_]+(?=[a-z])/gi, '$1 ')
    .replace(/(?<=[a-z])[\-_]+(costco|target|grocery|shopping|lists?)\b/gi, ' $1')
    .replace(/\b(?:rotary|rosary|glossary|roastery)\b(?=[\s\-_]+(?:shopping[\s\-_]+)?lists?\b)/gi, 'grocery')
    .replace(/\b(?:targe)\b(?=[\s\-_]+(?:shopping[\s\-_]+)?lists?\b)/gi, 'target');

  // 2. If the utterance targets "[words] list" (with or without a leading "add" verb, e.g. "Rotisserie chicken to the cost-co-shopping list")
  //    and [words] was mangled by STT into something unknown (not task/todo/issue/ticket/movie/playlist),
  //    resolve [words] phonetically to target, costco, or default to grocery!
  if (
    (/\b(?:to|on|in|from|at|for)\s+(?:the\s+|my\s+|our\s+)?[a-z][a-z\s'\-]{1,32}?\s+lists?\b/i.test(s) ||
      /^(?:(?:hey|hello|hi|ok|okay|yo)\s+(?:nabu|robos)[,.:;!\s]*)?(?:please\s+)?(?:add|put|buy|get|need|remove|delete|check(?:\s+off)?|uncheck|clear(?:\s+checked)?|what(?:'s|\s+is|\s+are)\s+on|show|read)\b/i.test(s)) &&
    !/\b(?:task|tasks|todo|to-do|issue|issues|ticket|tickets|watch|movie|song|playlist)\b/i.test(s)
  ) {
    s = s.replace(
      /\b(to|on|in|from|at|for)\s+(?:the\s+|my\s+|our\s+)?([a-z][a-z\s'\-]{1,32}?)\s+(lists?)\b/gi,
      (full, prep, middle, listWord) => {
        const m = middle.replace(/[\-_]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
        if (/^(?:grocery|target|costco|shopping|(?:my|the|our)\s+(?:grocery|target|costco|shopping))$/.test(m)) {
          return full;
        }
        if (/^(?:grocery|target|costco)\s+shopping$/.test(m)) {
          return `${prep} my ${m.replace(/\s+shopping$/, '')} ${listWord}`;
        }
        if (/tar|trg|targe/.test(m)) return `${prep} my target ${listWord}`;
        if (/cos|cst|ksk|kirk|rosc|cusc|pasc|bosc/.test(m)) return `${prep} my costco ${listWord}`;
        return `${prep} my grocery ${listWord}`;
      },
    );
  }

  return s;
}

function detectTargetStoreId(chunk, defaultListId, availableListIds) {
  const s = normalizeShoppingVoiceTranscript(chunk);
  if (/(?:^|\s)@target\b|\b(?:at|from|to|on|in|for)\s+(?:my\s+|the\s+|our\s+)?target(?:\s+shopping)?(?:\s+lists?)?\b|\btarget:/i.test(s) && availableListIds.includes('target')) return 'target';
  if (/(?:^|\s)@costco\b|\b(?:at|from|to|on|in|for)\s+(?:my\s+|the\s+|our\s+)?costco(?:\s+shopping)?(?:\s+lists?)?\b|\b(?:costco:|kirkland|bulk|case of)\b/i.test(s) && availableListIds.includes('costco')) return 'costco';
  if (/(?:^|\s)@grocery\b|\b(?:at|from|to|on|in|for)\s+(?:my\s+|the\s+|our\s+)?grocery(?:\s+shopping)?(?:\s+lists?)?\b|\bgrocery:/i.test(s) && availableListIds.includes('grocery')) return 'grocery';
  return defaultListId;
}

const WORD_QTY = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, dozen: 12,
};

const COMPOUND_AND_ITEMS = [
  'mac and cheese',
  'macaroni and cheese',
  'half and half',
  'peanut butter and jelly',
  'chips and salsa',
  'salt and pepper',
  'bread and butter',
  'fish and chips',
  'oil and vinegar',
  'beans and rice',
  'rice and beans',
  'surf and turf',
  'pork and beans',
  'franks and beans',
];

function splitSpokenAndItems(str) {
  let s = String(str || '');
  const placeholders = [];
  for (const phrase of COMPOUND_AND_ITEMS) {
    const re = new RegExp(`\\b${phrase}\\b`, 'gi');
    s = s.replace(re, (m) => {
      const token = `__COMPOUND_${placeholders.length}__`;
      placeholders.push(m);
      return token;
    });
  }
  const chunks = s.split(/\s+\band\b\s+/i);
  return chunks.map((chunk) =>
    chunk.replace(/__COMPOUND_(\d+)__/g, (_m, idx) => placeholders[Number(idx)] || _m).trim()
  ).filter(Boolean);
}

/**
 * Local deterministic parser for natural-language multi-item / recipe input.
 * Works completely offline with zero AI agent required!
 * Example: "2 gal organic milk $4.89 (whole), 4 avocados, laundry pods @target, rotisserie chicken @costco"
 */
function parseSmartItemsOffline(rawText, lists, defaultListId = 'grocery') {
  const listIds = lists.map((l) => l.id);
  const listMap = new Map(lists.map((l) => [l.id, l]));
  const rawString = normalizeShoppingVoiceTranscript(rawText);
  const sentenceStoreId = detectTargetStoreId(rawString, defaultListId, listIds);
  const hasExplicitCommas = /[\r\n,;]/.test(rawString);

  // Strip trailing sentence-level "to my grocery list" / "on my shopping list" before splitting on spoken "and"
  const preCleaned = hasExplicitCommas
    ? rawString
    : rawString
        .replace(/\b(?:at|from|to|on|in|for)\s+(?:my\s+|the\s+|our\s+)?(?:target|costco|grocery|shopping)(?:\s+shopping)?(?:\s+lists?)?[.!?]*\s*$/i, '')
        .replace(/\b(?:at|from|to|on|in|for)\s+(?:my\s+|the\s+|our\s+)?lists?[.!?]*\s*$/i, '')
        .trim();

  const initialParts = preCleaned
    .split(/\r?\n|,|;/)
    .map((p) => p.replace(/^[\s•\-*☐☑✓+]+/, '').replace(/^(?:and\s+also|and|also|plus|then)\s+/i, '').trim())
    .filter(Boolean);

  const parts = [];
  for (const p of initialParts) {
    if (!hasExplicitCommas && /\s+\band\b\s+/i.test(p)) {
      parts.push(...splitSpokenAndItems(p));
    } else {
      parts.push(p);
    }
  }

  const effectiveDefaultListId = hasExplicitCommas ? defaultListId : sentenceStoreId;

  const parsed = [];
  for (const part of parts) {
    const listId = detectTargetStoreId(part, effectiveDefaultListId, listIds);
    let cleaned = part
      .replace(/(?:^|\s)@(?:target|costco|grocery)\b/gi, ' ')
      .replace(/\b(?:at|from|to|on|in|for)\s+(?:my\s+|the\s+|our\s+)?(?:target|costco|grocery|shopping)(?:\s+shopping)?(?:\s+lists?)?\b/gi, ' ')
      .replace(/\b(?:at|from|to|on|in|for)\s+(?:my\s+|the\s+|our\s+)?lists?\b/gi, ' ')
      .replace(/[.,;!\s]+(?:my\s+|the\s+|our\s+)?(?:target|costco|grocery|shopping)\s+lists?\b/gi, ' ')
      .replace(/^(?:target|costco|grocery):\s*/i, '')
      .replace(/^(?:and\s+also|and|also|plus|then)\s+/i, '')
      .replace(/^[.,;!\-\s]+|[.!?,;:\s]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) continue;
    if (/^(?:my\s+|the\s+|our\s+)?(?:target|costco|grocery|shopping|lists?)(?:\s+(?:target|costco|grocery|shopping|lists?))*$/i.test(cleaned)) {
      continue;
    }

    // Extract optional inline note in parentheses at the end: e.g. "Honeycrisp apples (extra crisp)"
    let note = '';
    const noteMatch = cleaned.match(/\(([^()]{1,80})\)\s*$/);
    if (noteMatch) {
      note = noteMatch[1].trim();
      cleaned = cleaned.slice(0, noteMatch.index).trim();
    }

    // Extract optional inline price: e.g. "$4.99" or "@ $12.49"
    let estPrice = null;
    const priceMatch = cleaned.match(/(?:@\s*)?\$(\d+(?:\.\d{1,2})?)\b/);
    if (priceMatch) {
      estPrice = Math.round(Number(priceMatch[1]) * 100) / 100;
      cleaned = cleaned.replace(priceMatch[0], ' ').replace(/\s+/g, ' ').trim();
    }

    // Normalize leading word numbers ("two gal milk" -> "2 gal milk")
    cleaned = cleaned.replace(/^(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen)\b/i, (m) => String(WORD_QTY[m.toLowerCase()] || m));

    let qty = 1;
    let unit = 'ea';
    const leadingQty = cleaned.match(/^(\d+(?:\.\d+)?)\s*(ea|packs?|lbs?|oz|gals?|gallons?|cases?|bags?|boxes|box|bunch(?:es)?|bottles?|jars?|ct|x)?\b\s*(?:of\s+)?(.+)$/i);
    if (leadingQty) {
      qty = Math.max(0.25, Number(leadingQty[1]) || 1);
      const rawUnit = (leadingQty[2] || '').toLowerCase();
      if (rawUnit.startsWith('gal')) unit = 'gal';
      else if (rawUnit.startsWith('lb')) unit = 'lb';
      else if (rawUnit === 'oz') unit = 'oz';
      else if (rawUnit.startsWith('pack')) unit = 'pack';
      else if (rawUnit.startsWith('case')) unit = 'case';
      else if (rawUnit.startsWith('bag')) unit = 'bag';
      else if (rawUnit.startsWith('box')) unit = 'box';
      else if (rawUnit.startsWith('bunch')) unit = 'bunch';
      else if (rawUnit.startsWith('bottle')) unit = 'bottle';
      else if (rawUnit.startsWith('jar')) unit = 'jar';
      cleaned = leadingQty[3].trim();
    }

    const badge = /(?:^|\s)#?urgent\b|\bmust(?:\s+have)?\b/i.test(cleaned) ? 'urgent'
      : /(?:^|\s)#?organic\b/i.test(cleaned) ? 'organic'
      : /(?:^|\s)#?kirkland\b/i.test(cleaned) ? 'kirkland'
      : /(?:^|\s)#?(?:coupon|deal|sale)\b/i.test(cleaned) ? 'deal'
      : '';

    cleaned = cleaned.replace(/(?:^|\s)#(?:urgent|organic|kirkland|coupon|deal|sale)\b/gi, ' ').replace(/\s+/g, ' ').trim();
    if (!cleaned) continue;

    const list = listMap.get(listId) || lists[0];
    const name = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    parsed.push({
      listId: list.id,
      name,
      qty,
      unit,
      aisle: detectAisle(list, name),
      badge,
      note,
      estPrice,
    });
  }
  return parsed;
}

module.exports = {
  UNITS,
  BADGES,
  DEFAULT_LISTS,
  detectAisle,
  normalizeShoppingVoiceTranscript,
  parseSmartItemsOffline,
};
