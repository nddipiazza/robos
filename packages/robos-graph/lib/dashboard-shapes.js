'use strict';

// RobOS Graphical Dashboards extensions retain their upstream Schema.org vocabulary basis.
const DASHBOARD_TYPES = [
  ['Dashboard', 'WebPage', ['robos:dashboardId', 'robos:layout']],
  ['DashboardLayout', 'WebPageElement', ['robos:layoutId', 'robos:gridTemplate', 'robos:slotCount']],
  ['DashboardCard', 'WebPageElement', ['robos:cardId', 'robos:dashboard', 'robos:widget', 'robos:slotId']],
  ['DashboardWidget', 'SoftwareApplication', ['robos:widgetType', 'robos:componentTag']],
];

const DASHBOARD_SHAPES = DASHBOARD_TYPES.map(([name, upstream, required]) => ({
  shapeId: `urn:robos:shape:${name}Shape`,
  targetClass: `robos:${name}`,
  refersFrom: `https://schema.org/${upstream}`,
  schemaOrgType: `https://schema.org/${upstream}`,
  domainStandard: `https://schema.org/${upstream}`,
  properties: ['dcterms:title', ...required].map((path) => ({
    path,
    minCount: 1,
    message: `${name} must specify ${path}.`,
  })),
}));

module.exports = { DASHBOARD_TYPES, DASHBOARD_SHAPES };
