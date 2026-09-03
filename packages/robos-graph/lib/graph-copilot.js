'use strict';
const { OSLCGraphParser } = require('./oslc-parser');
const { SHACLValidator } = require('./shacl-validator');

class GraphCoPilot {
  constructor(options = {}) {
    this.validator = options.validator || new SHACLValidator();
  }

  generateMutation(promptText, currentGraphDoc = {}) {
    const text = (promptText || '').toLowerCase();
    const isWorker = text.includes('worker') || text.includes('async') || text.includes('queue') || text.includes('notification');
    const isGraphQL = text.includes('graphql') || text.includes('federation');
    const isPayment = text.includes('payment') || text.includes('billing') || text.includes('stripe');

    let slug = 'notification-worker';
    let title = 'Async Notification Worker';
    let repo = 'github.com/acme/buildbarn-notifications';
    let protocol = 'AsyncAPI / RabbitMQ';
    let specFile = 'specs/contracts/notification-events.yaml';
    let reqTitle = 'Order Notification Event Dispatch';
    let featureFile = 'specs/features/order-notifications.feature';

    if (isGraphQL) {
      slug = 'graphql-gateway';
      title = 'GraphQL Federation Gateway';
      repo = 'github.com/acme/buildbarn-graphql';
      protocol = 'GraphQL Federation v2';
      specFile = 'specs/contracts/supergraph.graphql';
      reqTitle = 'Federated Query Execution';
      featureFile = 'specs/features/federation.feature';
    } else if (isPayment) {
      slug = 'payment-api';
      title = 'Stripe Payment API Service';
      repo = 'github.com/acme/buildbarn-payments';
      protocol = 'OpenAPI 3.1';
      specFile = 'specs/contracts/payment-api-v1.yaml';
      reqTitle = 'PCI-Compliant Checkout Processing';
      featureFile = 'specs/features/checkout.feature';
    } else if (text.includes('auth') || text.includes('login')) {
      slug = 'auth-gateway';
      title = 'Authentication Gateway Service';
      repo = 'github.com/acme/buildbarn-auth';
      protocol = 'OpenAPI 3.1';
      specFile = 'specs/contracts/auth-api-v1.yaml';
      reqTitle = 'OAuth 2.0 PKCE Login Flow';
      featureFile = 'specs/features/oauth-login.feature';
    }

    const serviceNode = {
      '@id': `urn:robos:service:${slug}`,
      '@type': ['oslc_am:Resource', 'c4:Container', 'robos:Microservice'],
      'dcterms:title': title,
      'robos:repository': repo,
      'robos:implementsContract': `urn:robos:contract:${slug}-v1`,
      'robos:ownerTeam': 'urn:robos:team:core-platform',
    };

    const contractNode = {
      '@id': `urn:robos:contract:${slug}-v1`,
      '@type': ['robos:Contract', 'c4:Component'],
      'dcterms:title': `${title} Spec`,
      'robos:specFile': specFile,
      'robos:protocol': protocol,
    };

    const reqNode = {
      '@id': `urn:robos:requirement:REQ-${slug}`,
      '@type': ['oslc_rm:Requirement', 'robos:Feature'],
      'dcterms:title': reqTitle,
      'robos:featureFile': featureFile,
      'oslc_qm:validatedBy': `urn:robos:test:e2e-${slug}`,
      'robos:targetNode': `urn:robos:service:${slug}`,
    };

    const proposedNodes = [serviceNode, contractNode, reqNode];

    // Pre-validate with SHACL
    const testParser = new OSLCGraphParser({
      '@context': {},
      '@id': 'urn:robos:graph:temp',
      '@type': ['robos:SystemGraph'],
      'robos:nodes': proposedNodes,
    });

    const shaclReport = this.validator.validateGraph(testParser);

    return {
      prompt: promptText,
      proposedNodes,
      conforms: shaclReport.conforms,
      shaclReport,
      summary: `Synthesized 3 OSLC graph nodes: ${title} (Microservice), Contract (${protocol}), and Requirement (${reqTitle}).`,
    };
  }
}

module.exports = { GraphCoPilot };
