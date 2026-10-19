'use strict';
const { formatMoney } = require('./money');

const WIDTH = 42;
const pad = (left, right) => left.slice(0, WIDTH - right.length - 1).padEnd(WIDTH - right.length) + right;
const center = text => ' '.repeat(Math.max(0, Math.floor((WIDTH - text.length) / 2))) + text;

// Plain text receipt that prints straight to an ESC/POS thermal printer (or any text printer).
function renderReceipt(order, settings) {
  const cur = settings.business.currency;
  const m = c => formatMoney(c, cur);
  const out = [center(settings.business.name)];
  if (settings.business.address) out.push(center(settings.business.address));
  out.push('-'.repeat(WIDTH), pad(`Order #${order.number}`, new Date(order.paidAt || order.createdAt).toISOString().slice(0, 16).replace('T', ' ')));
  if (order.tabName || order.customerName) out.push(order.tabName || order.customerName);
  for (const l of order.lines.filter(x => !x.removed)) {
    out.push(pad(`${l.qty} x ${l.name}${l.variantName ? ' ' + l.variantName : ''}`, m(l.gross)));
    for (const mod of l.modifiers) out.push(pad(`   + ${mod.name}`, mod.price ? m(mod.price * l.qty) : ''));
    if (l.priceRule) out.push(`   ${l.priceRule}`);
    if (l.comped) out.push(`   Comped: ${l.compReason}`);
  }
  out.push('-'.repeat(WIDTH), pad('Subtotal', m(order.totals.subtotal)));
  for (const d of order.discounts) out.push(pad(`Discount ${d.name}`, '-' + m(d.amount)));
  for (const t of order.totals.taxBreakdown) out.push(pad(`${t.name} ${(t.rateBp / 100).toFixed(2)}%${order.totals.taxInclusive ? ' (incl.)' : ''}`, m(t.amount)));
  if (order.totals.tip) out.push(pad('Tip', m(order.totals.tip)));
  if (order.totals.rounding) out.push(pad('Cash rounding', m(order.totals.rounding)));
  out.push(pad('TOTAL', m(order.totals.total)), '');
  for (const p of order.payments) {
    out.push(pad(p.method === 'cash' ? 'Cash tendered' : `Card ${p.reference || ''}`, m(p.method === 'cash' ? p.tendered : p.amount)));
    if (p.change) out.push(pad('Change', m(p.change)));
  }
  for (const r of order.refunds) out.push(pad(`Refund: ${r.reason}`, '-' + m(r.amount)));
  out.push('', center(settings.business.receiptFooter || ''));
  return out.join('\n') + '\n';
}

// schema.org Order as JSON-LD so a receipt can be read by anything that speaks Linked Data.
function receiptJsonLd(order, settings) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Order',
    orderNumber: String(order.number),
    orderDate: order.createdAt,
    orderStatus: { paid: 'https://schema.org/OrderDelivered', open: 'https://schema.org/OrderProcessing', void: 'https://schema.org/OrderCancelled', refunded: 'https://schema.org/OrderReturned', partially_refunded: 'https://schema.org/OrderDelivered' }[order.status],
    seller: { '@type': 'Organization', name: settings.business.name },
    priceCurrency: settings.business.currency,
    orderedItem: order.lines.filter(l => !l.removed).map(l => ({
      '@type': 'OrderItem', orderQuantity: l.qty,
      orderedItem: { '@type': 'Product', name: l.variantName ? `${l.name} (${l.variantName})` : l.name, sku: l.sku || undefined },
      orderItemStatus: 'https://schema.org/OrderDelivered',
      priceSpecification: { '@type': 'UnitPriceSpecification', price: (l.unitPrice / 100).toFixed(2), priceCurrency: settings.business.currency },
    })),
    paymentMethod: order.payments.map(p => (p.method === 'cash' ? 'http://purl.org/goodrelations/v1#Cash' : 'PaymentCard')),
    totalPaymentDue: { '@type': 'PriceSpecification', price: (order.totals.total / 100).toFixed(2), priceCurrency: settings.business.currency, valueAddedTaxIncluded: !!order.totals.taxInclusive },
  };
}

module.exports = { renderReceipt, receiptJsonLd };
