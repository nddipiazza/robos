'use strict';

const err = { description: 'Error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
const json = ref => ({ content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } } });

module.exports = function openapi(version) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'RobOS Point of Sale API', version,
      description: 'Open checkout API modelled on the Agentic Commerce Protocol checkout-session flow (create, retrieve, update, complete, cancel). Amounts are integer minor units (cents). Staff and kiosk endpoints are used by the bundled touchscreen apps.',
      license: { name: 'Apache-2.0' },
    },
    servers: [{ url: 'http://127.0.0.1:3410' }],
    components: {
      securitySchemes: { apiKey: { type: 'http', scheme: 'bearer', description: 'API key created in Back office > API keys' }, staff: { type: 'http', scheme: 'bearer', description: 'Session token from POST /api/auth/login' } },
      schemas: {
        Error: { type: 'object', properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } } } },
        CheckoutItem: { type: 'object', required: ['id', 'quantity'], properties: { id: { type: 'string', description: 'Item id, SKU or barcode' }, quantity: { type: 'integer', minimum: 1 }, variant_id: { type: 'string' }, modifiers: { type: 'array', items: { type: 'string' } } } },
        CheckoutSessionCreate: { type: 'object', required: ['items'], properties: { items: { type: 'array', items: { $ref: '#/components/schemas/CheckoutItem' } }, buyer: { type: 'object' }, fulfillment_option_id: { type: 'string' } } },
        CheckoutSession: { type: 'object', properties: { id: { type: 'string' }, status: { enum: ['not_ready_for_payment', 'ready_for_payment', 'completed', 'canceled'] }, currency: { type: 'string' }, line_items: { type: 'array', items: { type: 'object' } }, totals: { type: 'array', items: { type: 'object', properties: { type: { type: 'string' }, display_text: { type: 'string' }, amount: { type: 'integer' } } } }, fulfillment_options: { type: 'array', items: { type: 'object' } }, messages: { type: 'array', items: { type: 'object' } } } },
        CheckoutComplete: { type: 'object', required: ['payment_data'], properties: { buyer: { type: 'object' }, payment_data: { type: 'object', required: ['token'], properties: { token: { type: 'string' }, provider: { type: 'string' } } } } },
      },
    },
    paths: {
      '/api/health': { get: { summary: 'Health check', responses: { 200: { description: 'OK' } } } },
      '/api/v1/checkout_sessions': { post: { summary: 'Create a checkout session', security: [{ apiKey: [] }], parameters: [{ name: 'Idempotency-Key', in: 'header', schema: { type: 'string' } }], requestBody: { required: true, ...json('CheckoutSessionCreate') }, responses: { 201: { description: 'Created', ...json('CheckoutSession') }, 400: err, 401: err } } },
      '/api/v1/checkout_sessions/{id}': {
        get: { summary: 'Retrieve a checkout session', security: [{ apiKey: [] }], responses: { 200: { description: 'OK', ...json('CheckoutSession') }, 404: err } },
        post: { summary: 'Update a checkout session', security: [{ apiKey: [] }], requestBody: { ...json('CheckoutSessionCreate') }, responses: { 200: { description: 'OK', ...json('CheckoutSession') }, 405: err } },
      },
      '/api/v1/checkout_sessions/{id}/complete': { post: { summary: 'Complete a checkout session with a payment token', security: [{ apiKey: [] }], parameters: [{ name: 'Idempotency-Key', in: 'header', schema: { type: 'string' } }], requestBody: { required: true, ...json('CheckoutComplete') }, responses: { 200: { description: 'Completed', ...json('CheckoutSession') }, 402: err } } },
      '/api/v1/checkout_sessions/{id}/cancel': { post: { summary: 'Cancel a checkout session', security: [{ apiKey: [] }], responses: { 200: { description: 'Canceled', ...json('CheckoutSession') }, 405: err } } },
      '/api/auth/login': { post: { summary: 'Sign in a team member with a PIN', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { pin: { type: 'string' } } } } } }, responses: { 200: { description: 'Session token' }, 401: err } } },
      '/api/orders': { get: { summary: 'List orders', security: [{ staff: [] }], responses: { 200: { description: 'OK' } } }, post: { summary: 'Start an order or tab', security: [{ staff: [] }], responses: { 201: { description: 'Created' } } } },
      '/api/orders/{id}/pay': { post: { summary: 'Take a cash or card payment', security: [{ staff: [] }], responses: { 200: { description: 'Payment accepted' }, 402: err } } },
      '/api/orders/{id}/refund': { post: { summary: 'Refund lines (manager)', security: [{ staff: [] }], responses: { 200: { description: 'Refunded' } } } },
      '/api/kiosk/menu': { get: { summary: 'Self-checkout menu', responses: { 200: { description: 'OK' } } } },
      '/api/kiosk/orders': { post: { summary: 'Create a self-checkout order', responses: { 201: { description: 'Created' } } } },
      '/api/kiosk/orders/{id}/pay': { post: { summary: 'Pay at the kiosk by card or choose pay-at-counter', responses: { 200: { description: 'OK' } } } },
    },
  };
};
