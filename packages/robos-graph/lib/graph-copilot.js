'use strict';
const { OSLCGraphParser } = require('./oslc-parser');
const { SHACLValidator } = require('./shacl-validator');

class GraphCoPilot {
  constructor(options = {}) {
    this.validator = options.validator || new SHACLValidator();
  }

  /**
   * Asks an AI agent for the nodes, then checks them with SHACL. `ask` is
   * robos-lib/ai-agent's ask(): the active coding-agent CLI by default, or the
   * optional API mode when the user turned it on. Falls back to the keyword
   * template when no agent is available or its answer is unusable.
   *
   * @param {string} promptText
   * @param {object} currentGraphDoc
   * @param {{ ask?: Function, parseJson?: Function }} [opts]
   */
  async generateMutationWithAgent(promptText, currentGraphDoc = {}, opts = {}) {
    const fallback = (reason) => ({ ...this.generateMutation(promptText, currentGraphDoc), source: 'template', agentError: reason });
    if (typeof opts.ask !== 'function') return fallback('No AI agent library is available.');

    const existing = (currentGraphDoc['robos:nodes'] || []).slice(0, 80)
      .map(n => `- ${n['@id']}: ${n['dcterms:title'] || ''}`).join('\n');
    const prompt = `You are adding nodes to an OSLC JSON-LD software architecture knowledge graph.

Request: "${promptText}"

Propose 1 to 4 new nodes that implement the request. Typical set: one service node, the contract it implements, and the requirement it satisfies. Use these shapes:
- Service: {"@id":"urn:robos:service:<slug>","@type":["oslc_am:Resource","c4:Container","robos:Microservice"],"dcterms:title":"...","robos:repository":"github.com/<org>/<repo>","robos:implementsContract":"urn:robos:contract:<slug>-v1","robos:ownerTeam":"urn:robos:team:<team>"}
- Contract: {"@id":"urn:robos:contract:<slug>-v1","@type":["robos:Contract","c4:Component"],"dcterms:title":"...","robos:specFile":"specs/contracts/<file>","robos:protocol":"OpenAPI 3.1 | AsyncAPI | GraphQL | gRPC"}
- Requirement: {"@id":"urn:robos:requirement:REQ-<slug>","@type":["oslc_rm:Requirement","robos:Feature"],"dcterms:title":"...","robos:featureFile":"specs/features/<file>.feature","oslc_qm:validatedBy":"urn:robos:test:e2e-<slug>","robos:targetNode":"urn:robos:service:<slug>"}

Do not reuse these existing node ids:
${existing || '(none)'}

Return only a JSON object: {"summary":"one sentence","proposedNodes":[...]}. No markdown fences.`;

    let res;
    try { res = await opts.ask(prompt); } catch (e) { return fallback(e.message); }
    if (!res || !res.ok) return fallback((res && res.error) || 'The AI agent did not answer.');

    let data = null;
    if (typeof opts.parseJson === 'function') {
      const parsed = opts.parseJson(res.text);
      if (parsed && parsed.ok) data = parsed.data;
    } else {
      try { data = JSON.parse(String(res.text).replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch {}
    }
    const nodes = data && Array.isArray(data.proposedNodes) ? data.proposedNodes : null;
    const existingIds = new Set((currentGraphDoc['robos:nodes'] || []).map(n => n['@id']));
    const valid = nodes && nodes.length > 0 && nodes.length <= 8 && nodes.every(n => n && typeof n === 'object'
      && typeof n['@id'] === 'string' && n['@id'].startsWith('urn:robos:') && !existingIds.has(n['@id'])
      && n['@type'] && typeof n['dcterms:title'] === 'string' && n['dcterms:title'].trim());
    if (!valid) return fallback('The AI answer was not a usable list of new graph nodes.');

    const shaclReport = this.validator.validateGraph(new OSLCGraphParser({
      '@context': {}, '@id': 'urn:robos:graph:temp', '@type': ['robos:SystemGraph'], 'robos:nodes': nodes,
    }));
    return {
      prompt: promptText,
      proposedNodes: nodes,
      conforms: shaclReport.conforms,
      shaclReport,
      summary: typeof data.summary === 'string' && data.summary.trim() ? data.summary.trim() : `Proposed ${nodes.length} graph nodes.`,
      source: 'agent',
      via: res.via || 'cli',
    };
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
