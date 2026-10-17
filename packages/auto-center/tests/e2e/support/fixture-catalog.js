'use strict';
// A small public vehicle catalog (makes, models, configurations, trouble codes) so type-ahead scenarios do
// not depend on the multi-gigabyte real import. Uses the same graph engine and node types as the importer.
const path = require('node:path');
const { GraphWorkspace } = require('../../../../robos-graph/lib/graph-workspace');
const { node, ref } = require('../../../lib/importer');
function build(cacheRoot) {
  const ws = new GraphWorkspace(path.join(cacheRoot, 'workspace')), nodes = [], makeRef = {}, modelRef = {};
  for (const m of ['Toyota', 'Honda', 'Ford', 'Mercedes-Benz', 'Mercury']) { const n = node('VehicleMake', 'fx-' + m, m, { 'schema:name': m }); nodes.push(n); makeRef[m] = ref(n['@id']); }
  const models = { Toyota: ['Camry', 'Corolla', 'Camry Hybrid'], Honda: ['Civic', 'Accord'], Ford: ['F-150', 'Focus'], 'Mercedes-Benz': ['C-Class'], Mercury: ['Mariner'] };
  for (const [make, list] of Object.entries(models)) for (const m of list) { const n = node('VehicleModel', `fx-${make}-${m}`, `${make} ${m}`, { 'schema:name': m, 'robos:make': makeRef[make] }); nodes.push(n); modelRef[make + '|' + m] = ref(n['@id']); }
  const configs = [['2014', 'Toyota', 'Camry', '2.5', 'Automatic (S6)'], ['2015', 'Toyota', 'Camry', '2.5', 'Automatic (S6)'], ['2015', 'Toyota', 'Camry', '3.5', 'Automatic (S6)'], ['2016', 'Toyota', 'Camry', '2.5', 'Automatic (S6)'], ['2015', 'Honda', 'Civic', '1.8', 'Automatic (variable gear ratios)'], ['2018', 'Ford', 'F-150', '5.0', 'Automatic (S10)']];
  configs.forEach(([year, make, model, displ, trans], i) => nodes.push(node('VehicleConfiguration', 'fx-cfg-' + i, `${year} ${make} ${model} · ${trans}`, { 'schema:modelDate': year, 'schema:name': `${make} ${model}`, 'robos:model': modelRef[make + '|' + model], 'schema:vehicleTransmission': trans, 'schema:driveWheelConfiguration': 'Front-Wheel Drive', 'schema:fuelType': 'Regular', 'schema:vehicleEngine': { '@type': 'schema:EngineSpecification', 'schema:engineDisplacement': { '@type': 'schema:QuantitativeValue', 'schema:value': displ, 'schema:unitText': 'L' } } })));
  for (const [code, description] of [['P0300', 'Random/Multiple Cylinder Misfire Detected'], ['P0301', 'Cylinder 1 Misfire Detected'], ['P0420', 'Catalyst System Efficiency Below Threshold (Bank 1)']]) nodes.push(node('DiagnosticCode', code, `${code} · ${description}`, { 'schema:name': code, 'schema:description': description }));
  const proposal = ws.propose({ document: { ...ws.empty('Test vehicle catalog'), 'robos:nodes': nodes }, prompt: 'Test fixture catalog' });
  ws.apply(proposal, { expectedProposalId: proposal.id });
}
module.exports = { build };
