'use strict';
// RobOS Auto extensions retain their upstream vocabulary basis.
const AUTO_TYPES = [
 ['VehicleMake','Brand',['schema:name']],
 ['VehicleModel','ProductModel',['schema:name','robos:make']],
 ['VehicleConfiguration','Vehicle',['schema:modelDate','robos:model']],
 ['OwnedVehicle','Vehicle',['schema:name']],
 ['AutoShop','AutoRepair',['schema:name']],
 ['ServiceRecord','Service',['robos:vehicle','schema:startDate','schema:description']],
 ['MaintenanceSchedule','Schedule',['robos:vehicle']],
 ['VehicleStay','Event',['robos:vehicle','schema:startDate']],
 ['ShopFinanceEntry','MonetaryAmount',['robos:entryKind','robos:entryDirection','robos:amountMinor','robos:currency','robos:effectiveOn','robos:costCategory','schema:description']],
 ['ShopPayment','PayAction',['robos:job','robos:amountMinor','robos:currency','robos:paidOn','robos:paymentDirection']],
 ['RepairOrder','Order',['robos:vehicle']],
 ['Estimate','Offer',['robos:vehicle']],
 ['Invoice','Invoice',['robos:vehicle']],
 ['Part','Product',['schema:name']],
 ['Teammate','Person',['schema:name','robos:role']],
 ['Customer','Person',['schema:name']],
 ['LaborEntry','Action',['robos:job','robos:teammate','robos:hoursMinutes','schema:startDate']],
 ['PartUsage','Product',['robos:job','schema:name','robos:quantity','robos:currency']],
 ['IntakeCategory','CreativeWork',['schema:name','robos:order']],
 ['IntakeQuestion','Question',['schema:name','robos:questionKey','robos:questionType']],
 ['PartRequest','Order',['robos:job','schema:name','robos:quantity','robos:requestStatus']],
 ['RepairTicket','Action',['robos:job','robos:workItemKey','robos:workItemStatus']],
 ['Supplier','Organization',['schema:name']],
 ['PurchaseOrder','Order',['robos:orderNumber','robos:orderStatus','robos:supplier']],
 ['InventoryItem','Product',['schema:name']],
 ['StockMovement','Action',['robos:item','robos:movementKind','robos:quantity','schema:startTime']],
 ['PartFitment','ProductModel',['robos:part','robos:configuration']],
 ['OdometerReading','QuantitativeValue',['robos:vehicle','schema:value','schema:unitCode']],
 ['Registration','PropertyValue',['robos:vehicle']],
 ['OwnershipRecord','OwnershipInfo',['robos:vehicle']],
 ['AccidentRecord','Event',['robos:vehicle']],
 ['Inspection','CheckAction',['robos:vehicle']],
 ['DiagnosticCode','DefinedTerm',['schema:name']],
 ['RecallCampaign','CreativeWork',['schema:identifier']],
 ['BulkRecallCampaign','CreativeWork',['schema:identifier']],
 ['RecallRemedy','CreativeWork',['robos:campaign','schema:description']],
 ['RecallAffectedPart','Product',['robos:campaign','schema:name']],
 ['RecallApplicability','Vehicle',['robos:campaign','robos:affectedPart','robos:sourceRecordId']],
 ['SafetyComplaint','Report',['schema:identifier']],
 ['AutoDataset','Dataset',['schema:url']],
 ['AutoVocabularyTerm','DefinedTerm',['schema:url']],
 ['AutoSoftware','SoftwareApplication',['schema:url']],
];
const shapeOf = ([name, upstream, required]) => ({
 shapeId: `urn:robos:shape:${name}Shape`, targetClass: `robos:${name}`,
 refersFrom: `https://schema.org/${upstream}`, schemaOrgType: `https://schema.org/${upstream}`,
 properties: ['dcterms:title', ...required].map(path => ({path,minCount:1})),
});
const AUTO_SHAPES = AUTO_TYPES.map(shapeOf);
// RobOS Auto plugins (packages/robos-auto-plugins) add their own types, such as robos:TowJob, when they load.
// The types join the Auto schema and their shapes join the built-in SHACL shapes every workspace validates with.
function registerAutoTypes(types) {
 const { BUILTIN_SHACL_SHAPES } = require('./shacl-validator'), { resolveSchemaElement } = require('./classification');
 for (const type of types) {
  if (!Array.isArray(type) || !/^[A-Z][A-Za-z0-9]*$/.test(type[0]) || typeof type[1] !== 'string' || !Array.isArray(type[2])) throw new Error('An Auto type is [Name, schema.org type, [required properties]]');
  const known = AUTO_TYPES.find(([name]) => name === type[0]);
  if (known) { if (JSON.stringify(known) !== JSON.stringify(type)) throw new Error(`Auto type ${type[0]} is already defined differently`); continue; }
  const shape = shapeOf(type); AUTO_TYPES.push(type); AUTO_SHAPES.push(shape);
  if (!BUILTIN_SHACL_SHAPES.some(s => s.shapeId === shape.shapeId)) {
   shape['robos:classification'] = resolveSchemaElement(shape.targetClass);
   for (const property of shape.properties) property['robos:classification'] = resolveSchemaElement(property.path);
   BUILTIN_SHACL_SHAPES.push(shape);
  }
 }
}
module.exports = { AUTO_TYPES, AUTO_SHAPES, registerAutoTypes };
