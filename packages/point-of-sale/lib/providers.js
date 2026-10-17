'use strict';
// Card providers are plugins: { authorize({amount, currency, order, token, reference}), refund({reference, amount}) }.
// Both may be async, so a real gateway (Stripe, Square, Adyen, SumUp ...) can be dropped in via `providers`.
const crypto = require('node:crypto');
const { PosError } = require('./errors');

// A standalone card terminal: the card is taken on the terminal and the worker keys in its approval code.
const manual = {
  id: 'manual',
  name: 'Standalone card terminal',
  authorize({ reference }) {
    if (!reference || !/^[A-Za-z0-9-]{4,24}$/.test(String(reference))) throw new PosError('reference_required', 'Enter the terminal approval code (4 to 24 letters or digits)');
    return { status: 'approved', reference: String(reference) };
  },
  refund({ reference }) { return { status: 'refunded', reference: `${reference}-R` }; },
};

// A deterministic test gateway used by the demo data and the end-to-end tests. No real money moves.
const mock = {
  id: 'mock',
  name: 'Test gateway (no real charges)',
  authorize({ token }) {
    if (token === 'tok_decline') return { status: 'declined', reason: 'card_declined' };
    if (token === 'tok_insufficient') return { status: 'declined', reason: 'insufficient_funds' };
    if (!token || !/^tok_[A-Za-z0-9_]+$/.test(token)) throw new PosError('invalid_token', 'Payment token must look like tok_...');
    return { status: 'approved', reference: `mock_${crypto.randomBytes(5).toString('hex')}` };
  },
  refund({ reference }) { return { status: 'refunded', reference: `${reference}_refund` }; },
};

module.exports = { builtin: { manual, mock } };
