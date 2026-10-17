'use strict';
// All money is integer minor units (cents). Floats never touch a balance.
const { PosError } = require('./errors');

function assertCents(value, label = 'amount') {
  if (!Number.isInteger(value) || value < 0) throw new PosError('invalid_amount', `${label} must be a non-negative whole number of cents`);
  return value;
}

// "12.5" | "12.50" | "$12.50" -> 1250. Rejects anything with more than two decimals.
function parseMoney(text) {
  const clean = String(text).trim().replace(/^\$/, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) throw new PosError('invalid_amount', 'Enter an amount with up to two decimals');
  const [whole, frac = ''] = clean.split('.');
  return Number(whole) * 100 + Number((frac + '00').slice(0, 2));
}

function formatMoney(cents, currency = 'USD') {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const symbol = { USD: '$', EUR: '€', GBP: '£', CAD: '$', AUD: '$' }[currency] || `${currency} `;
  return `${sign}${symbol}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

// Basis-point math keeps tax exact: rate 8.25% is 825 bp.
function percentOf(cents, basisPoints) {
  return Math.round((cents * basisPoints) / 10000);
}

function roundToIncrement(cents, increment) {
  if (!increment || increment <= 1) return cents;
  return Math.round(cents / increment) * increment;
}

// Split `total` across `parts` so the pieces always add back to the total.
function splitEvenly(total, parts) {
  if (!Number.isInteger(parts) || parts < 1) throw new PosError('invalid_split', 'Split into at least one part');
  const base = Math.floor(total / parts);
  const remainder = total - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0));
}

// Distribute `amount` proportionally to `weights`, remainder to the largest weights first.
function allocate(amount, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) return weights.map(() => 0);
  const shares = weights.map(w => Math.floor((amount * w) / sum));
  let left = amount - shares.reduce((a, b) => a + b, 0);
  const order = weights.map((w, i) => i).sort((a, b) => weights[b] - weights[a]);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) shares[order[k]]++;
  return shares;
}

module.exports = { assertCents, parseMoney, formatMoney, percentOf, roundToIncrement, splitEvenly, allocate };
