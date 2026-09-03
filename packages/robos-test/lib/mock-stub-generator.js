'use strict';

class MockStubGenerator {
  constructor(options = {}) {
    this.stubs = new Map();
    this.eventLog = [];
    this.initDefaultStubs();
  }

  initDefaultStubs() {
    // 1. External Third-Party Tax API Stub (Acme Tax Forms)
    this.registerStub('GET', '/v2/forms/2026/vendor-1099', {
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: {
        formId: 'tax-1099-2026-v88',
        formType: '1099-MISC',
        taxYear: 2026,
        vendorName: 'Acme Global Seller LLC',
        ein: 'XX-XXX8921',
        status: 'CERTIFIED_READY',
        retrievedAt: new Date().toISOString(),
      },
    });

    // 2. Forms API Service Endpoints
    this.registerStub('GET', '/api/v1/forms/form-101', {
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: {
        id: 'form-101',
        title: 'Application Wizard',
        steps: [
          { step: 1, title: 'Personal Details', fields: ['fullName', 'email'] },
          { step: 2, title: 'Document Attachments', fields: ['idProof', 'incomeProof'] },
          { step: 3, title: 'Payment Authorization', fields: ['paymentMethod'] },
        ],
      },
    });

    this.registerStub('POST', '/api/v1/forms/form-101/submit', {
      status: 201,
      headers: { 'content-type': 'application/json' },
      body: {
        submissionId: 'sub-98765',
        formId: 'form-101',
        status: 'SUBMITTED',
        submittedAt: new Date().toISOString(),
      },
    });

    // 3. Third-Party Auth & Payment Stubs
    this.registerStub('POST', '/oauth/token', {
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: {
        access_token: 'mock-jwt-token-standard-user',
        token_type: 'Bearer',
        expires_in: 3600,
      },
    });

    this.registerStub('POST', '/v1/charges', {
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: {
        id: 'ch_mock123456789',
        status: 'succeeded',
        amount: 5000,
        currency: 'usd',
      },
    });
  }

  registerStub(method, path, responseSpec) {
    const key = `${method.toUpperCase()} ${path}`;
    this.stubs.set(key, responseSpec);
  }

  handleRequest(method, path, body = null) {
    const key = `${method.toUpperCase()} ${path}`;
    const stub = this.stubs.get(key);
    if (!stub) {
      return {
        status: 404,
        headers: { 'content-type': 'application/json' },
        body: { error: `No mock stub configured for ${key}` },
      };
    }

    // If request emits async events
    if (key === 'POST /api/v1/forms/form-101/submit') {
      this.emitEvent('order-events', {
        eventType: 'FormSubmittedEvent',
        submissionId: 'sub-98765',
        timestamp: new Date().toISOString(),
      });
    }

    return {
      status: stub.status,
      headers: stub.headers,
      body: typeof stub.body === 'function' ? stub.body(body) : stub.body,
    };
  }

  emitEvent(topic, payload) {
    const event = {
      topic,
      payload,
      emittedAt: new Date().toISOString(),
    };
    this.eventLog.push(event);
    return event;
  }

  getEvents(topic) {
    if (!topic) return this.eventLog;
    return this.eventLog.filter(e => e.topic === topic);
  }

  clearEvents() {
    this.eventLog = [];
  }
}

module.exports = { MockStubGenerator };
