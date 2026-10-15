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
 ['RepairOrder','Order',['robos:vehicle']],
 ['Estimate','Offer',['robos:vehicle']],
 ['Invoice','Invoice',['robos:vehicle']],
 ['Part','Product',['schema:name']],
 ['PartFitment','ProductModel',['robos:part','robos:configuration']],
 ['OdometerReading','QuantitativeValue',['robos:vehicle','schema:value','schema:unitCode']],
 ['Registration','PropertyValue',['robos:vehicle']],
 ['OwnershipRecord','OwnershipInfo',['robos:vehicle']],
 ['AccidentRecord','Event',['robos:vehicle']],
 ['Inspection','CheckAction',['robos:vehicle']],
 ['DiagnosticCode','DefinedTerm',['schema:name']],
 ['RecallCampaign','CreativeWork',['schema:identifier']],
 ['SafetyComplaint','Report',['schema:identifier']],
 ['AutoDataset','Dataset',['schema:url']],
 ['AutoVocabularyTerm','DefinedTerm',['schema:url']],
 ['AutoSoftware','SoftwareApplication',['schema:url']],
];
const AUTO_SHAPES = AUTO_TYPES.map(([name, upstream, required]) => ({
 shapeId: `urn:robos:shape:${name}Shape`, targetClass: `robos:${name}`,
 refersFrom: `https://schema.org/${upstream}`, schemaOrgType: `https://schema.org/${upstream}`,
 properties: ['dcterms:title', ...required].map(path => ({path,minCount:1})),
}));
module.exports = { AUTO_TYPES, AUTO_SHAPES };
