'use strict';
// A vehicle is shown as make, model and year, then the optional nickname, then the customer:
// "Honda Accord 2005 (Old Blue) — Jim Parker". Built when shown, so renaming a customer updates every label.
const carName = (make, model, year) => [make, model, year].map(x => String(x || '').trim()).filter(Boolean).join(' ');
function vehicleLabel(v, customer) {
  if (!v) return '';
  const car = carName(v['schema:brand'], v['schema:model'], v['schema:modelDate']) || v['dcterms:title'] || 'Vehicle';
  const owner = customer?.['schema:name'] || customer?.['dcterms:title'] || '';
  return car + (v['robos:nickname'] ? ` (${v['robos:nickname']})` : '') + (owner ? ' — ' + owner : '');
}
module.exports = { carName, vehicleLabel };
