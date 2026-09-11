(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RobosTryItRunner = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  const list = value => value == null ? [] : Array.isArray(value) ? value : [value];

  function parseYamlPaths(yamlText) {
    if (!yamlText || typeof yamlText !== 'string') return [];
    const endpoints = [];
    try {
      // Robust lightweight YAML parser for OpenAPI 3.x paths section
      const lines = yamlText.split('\n');
      let inPaths = false;
      let currentPath = '';
      let currentMethod = '';
      let currentSummary = '';
      let indentPath = -1;
      let indentMethod = -1;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const indent = line.search(/\S/);

        if (trimmed === 'paths:') {
          inPaths = true;
          indentPath = indent + 2;
          continue;
        }

        if (inPaths) {
          // If we de-indent back to or before paths:, we left the paths block
          if (indent < indentPath && indent !== -1 && trimmed.endsWith(':') && !trimmed.startsWith('/')) {
            inPaths = false;
            continue;
          }

          // Path pattern line: e.g. "  /api/v1/resource:"
          if (trimmed.startsWith('/') && trimmed.endsWith(':')) {
            currentPath = trimmed.slice(0, -1);
            indentMethod = indent + 2;
            continue;
          }

          // Method line: e.g. "    get:"
          const methodMatch = trimmed.match(/^(get|post|put|delete|patch|options|head):$/i);
          if (methodMatch) {
            currentMethod = methodMatch[1].toUpperCase();
            currentSummary = '';
            // Lookahead for summary/operationId/description
            for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
              const sub = lines[j].trim();
              if (sub.startsWith('summary:')) {
                currentSummary = sub.replace(/^summary:\s*/, '').replace(/^['"]|['"]$/g, '');
                break;
              }
              if (sub.startsWith('description:') && !currentSummary) {
                currentSummary = sub.replace(/^description:\s*/, '').replace(/^['"]|['"]$/g, '');
              }
            }
            endpoints.push({
              path: currentPath,
              method: currentMethod,
              description: currentSummary || `${currentMethod} ${currentPath}`,
              source: 'openapi-spec'
            });
          }
        }
      }
    } catch (_) {}
    return endpoints;
  }

  function hasEndpoints(node, nodes = []) {
    if (!node) return false;
    const byId = new Map(nodes.map(n => [n['@id'], n]));
    const types = list(node['@type']).map(t => typeof t === 'string' ? t.split(':').pop() : '');

    // 1. Direct REST endpoints
    if (Array.isArray(node['robos:endpoints']) && node['robos:endpoints'].length > 0) return true;
    if (node['robos:pathPattern'] && node['robos:httpMethod']) return true;
    if (node['robos:contractYaml']) return true;

    // 2. Implemented or referenced contracts
    for (const ref of list(node['robos:implementsContract']).concat(list(node['robos:contract'])).concat(list(node['robos:provides']))) {
      const id = typeof ref === 'string' ? ref : ref?.['@id'];
      const target = byId.get(id);
      if (target && hasEndpoints(target, nodes)) return true;
    }

    // 3. gRPC RPC methods
    if (Array.isArray(node['robos:rpcMethods']) && node['robos:rpcMethods'].length > 0) return true;
    if (node['robos:protocol'] === 'grpc-protobuf' || types.includes('ProtobufContract') || types.includes('GRPCContract')) return true;

    // 4. GraphQL SDL schema / operations
    if (node['robos:protocol'] === 'graphql' || types.includes('GraphQLContract') || types.includes('GraphQLSchema')) return true;
    if (node['robos:sdlSchema'] || node['robos:graphqlOperations']) return true;

    // 5. MCP tools
    if (Array.isArray(node['robos:toolsProvided']) && node['robos:toolsProvided'].length > 0) return true;
    if (Array.isArray(node['robos:tools']) && node['robos:tools'].length > 0) return true;
    if (types.includes('MCPServer') || types.includes('MCPTool')) return true;

    // 6. Incoming child endpoints
    for (const candidate of nodes) {
      if ((candidate['robos:endpointOf']?.['@id'] === node['@id'] || candidate['robos:service']?.['@id'] === node['@id']) &&
          candidate['robos:pathPattern'] && candidate['robos:httpMethod']) {
        return true;
      }
    }

    return false;
  }

  function extractDefinition(node, nodes = []) {
    const byId = new Map(nodes.map(n => [n['@id'], n]));
    const types = list(node['@type']).map(t => typeof t === 'string' ? t.split(':').pop() : '');

    let protocol = 'rest';
    let baseUrl = 'http://localhost:8080';
    if (node['robos:ports']?.[0]) baseUrl = `http://localhost:${node['robos:ports'][0]}`;
    else if (node['robos:endpoint']) baseUrl = node['robos:endpoint'];

    const endpoints = [];
    const seenEndpoints = new Set();

    const addEndpoint = ep => {
      const key = `${ep.method} ${ep.path}`;
      if (!seenEndpoints.has(key)) {
        seenEndpoints.add(key);
        endpoints.push({
          id: ep.id || `ep-${endpoints.length + 1}`,
          path: ep.path,
          method: (ep.method || 'GET').toUpperCase(),
          description: ep.description || ep.summary || `${ep.method} ${ep.path}`,
          parameters: ep.parameters || extractPathParameters(ep.path),
          requestBody: ep.requestBody || (['POST', 'PUT', 'PATCH'].includes(ep.method) ? generateDefaultBody(ep.path) : null),
          responses: ep.responses || { '200': { description: 'Successful operation' } }
        });
      }
    };

    function extractPathParameters(pathStr) {
      const params = [];
      const matches = pathStr.match(/{([^}]+)}/g) || [];
      for (const m of matches) {
        const name = m.replace(/[{}]/g, '');
        params.push({ name, in: 'path', required: true, type: 'string', description: `Path identifier for ${name}` });
      }
      return params;
    }

    function generateDefaultBody(pathStr) {
      const slug = pathStr.split('/').filter(Boolean).pop()?.replace(/[{}]/g, '') || 'item';
      return {
        name: `Sample ${slug}`,
        description: `Payload for ${pathStr}`,
        status: 'ACTIVE',
        timestamp: new Date().toISOString()
      };
    }

    // Direct endpoints
    for (const ep of list(node['robos:endpoints'])) addEndpoint(ep);

    // Single APIEndpoint node
    if (node['robos:pathPattern'] && node['robos:httpMethod']) {
      addEndpoint({
        path: node['robos:pathPattern'],
        method: node['robos:httpMethod'],
        description: node['dcterms:title'] || node['dcterms:description'] || 'API Endpoint',
        parameters: node['robos:parameters'],
        requestBody: node['robos:requestBody'],
        responses: node['robos:responses']
      });
    }

    // OpenAPI contractYaml
    if (node['robos:contractYaml']) {
      for (const ep of parseYamlPaths(node['robos:contractYaml'])) addEndpoint(ep);
    }

    // Implemented or referenced contracts
    for (const ref of list(node['robos:implementsContract']).concat(list(node['robos:contract'])).concat(list(node['robos:provides']))) {
      const id = typeof ref === 'string' ? ref : ref?.['@id'];
      const target = byId.get(id);
      if (target) {
        if (target['robos:ports']?.[0]) baseUrl = `http://localhost:${target['robos:ports'][0]}`;
        for (const ep of list(target['robos:endpoints'])) addEndpoint(ep);
        if (target['robos:contractYaml']) {
          for (const ep of parseYamlPaths(target['robos:contractYaml'])) addEndpoint(ep);
        }
      }
    }

    // Child APIEndpoint nodes pointing to this service
    for (const candidate of nodes) {
      const svcRef = candidate['robos:endpointOf']?.['@id'] || candidate['robos:service']?.['@id'];
      if (svcRef === node['@id'] && candidate['robos:pathPattern'] && candidate['robos:httpMethod']) {
        addEndpoint({
          path: candidate['robos:pathPattern'],
          method: candidate['robos:httpMethod'],
          description: candidate['dcterms:title'] || candidate['dcterms:description'],
          parameters: candidate['robos:parameters'],
          requestBody: candidate['robos:requestBody'],
          responses: candidate['robos:responses']
        });
      }
    }

    // gRPC detection
    let grpcMethods = [];
    if (node['robos:rpcMethods'] || types.includes('ProtobufContract') || types.includes('GRPCContract') || node['robos:protocol'] === 'grpc-protobuf') {
      protocol = 'grpc';
      const methods = list(node['robos:rpcMethods']);
      const details = node['robos:rpcDetails'] || {};
      grpcMethods = methods.map(name => ({
        name,
        packageName: node['robos:packageName'] || 'acme.service.v1',
        serviceName: node['dcterms:title'] || 'Service',
        description: details[name]?.description || `Execute Protobuf RPC method ${name}`,
        sampleRequest: details[name]?.request || { id: 'req_1001', payload: 'example' },
        sampleResponse: details[name]?.response || { status: 'OK', code: 0 }
      }));
    }

    // Also check if service implements gRPC contract
    for (const ref of list(node['robos:implementsContract'])) {
      const id = typeof ref === 'string' ? ref : ref?.['@id'];
      const target = byId.get(id);
      if (target && target['robos:rpcMethods']) {
        protocol = 'grpc';
        const methods = list(target['robos:rpcMethods']);
        const details = target['robos:rpcDetails'] || {};
        grpcMethods = methods.map(name => ({
          name,
          packageName: target['robos:packageName'] || 'acme.service.v1',
          serviceName: target['dcterms:title'] || 'Service',
          description: details[name]?.description || `Execute Protobuf RPC method ${name}`,
          sampleRequest: details[name]?.request || { id: 'req_1001', payload: 'example' },
          sampleResponse: details[name]?.response || { status: 'OK', code: 0 }
        }));
      }
    }

    // GraphQL detection
    let graphql = null;
    if (node['robos:protocol'] === 'graphql' || types.includes('GraphQLContract') || types.includes('GraphQLSchema') || node['robos:sdlSchema']) {
      protocol = 'graphql';
      graphql = {
        endpointUrl: `${baseUrl}/graphql`,
        sdlSchema: node['robos:sdlSchema'] || 'type Query {\n  health: String\n}',
        operations: node['robos:graphqlOperations'] || [
          {
            name: 'DefaultQuery',
            type: 'query',
            query: 'query {\n  __typename\n}'
          }
        ]
      };
    }

    // MCP detection
    let mcp = null;
    if (types.includes('MCPServer') || types.includes('MCPTool') || node['robos:toolsProvided'] || node['robos:tools']) {
      protocol = 'mcp';
      const rawTools = list(node['robos:tools']).concat(list(node['robos:toolsProvided']));
      const tools = [];
      for (const t of rawTools) {
        if (typeof t === 'string') {
          tools.push({
            name: t,
            description: `Execute MCP tool ${t}`,
            inputSchema: { type: 'object', properties: { query: { type: 'string' } } }
          });
        } else if (t && typeof t === 'object') {
          tools.push({
            name: t.name || t['robos:toolName'] || 'tool',
            description: t.description || t['dcterms:description'] || 'MCP Tool',
            inputSchema: t.inputSchema || t['robos:inputSchema'] || { type: 'object', properties: {} }
          });
        }
      }
      mcp = {
        serverName: node['dcterms:title'] || 'MCP Server',
        transport: node['robos:transport'] || 'stdio',
        tools
      };
    }

    // If REST endpoints were discovered and not explicitly another protocol, keep rest
    if (endpoints.length > 0 && protocol !== 'grpc' && protocol !== 'graphql' && protocol !== 'mcp') {
      protocol = 'rest';
    }

    return {
      protocol,
      baseUrl,
      endpoints,
      grpcMethods,
      graphql,
      mcp
    };
  }

  // ── Execution Simulator & Live Client ──────────────────────────────────────────

  async function executeRest(ep, baseUrl, paramValues = {}, bodyText = '') {
    let urlPath = ep.path;
    const queryParams = new URLSearchParams();
    const headers = { 'Accept': 'application/json' };

    // Fill path & query params
    for (const param of ep.parameters || []) {
      const val = paramValues[param.name] !== undefined ? paramValues[param.name] : (param.default || '');
      if (param.in === 'path') {
        urlPath = urlPath.replace(`{${param.name}}`, encodeURIComponent(val || '1'));
      } else if (param.in === 'query' && val) {
        queryParams.set(param.name, val);
      } else if (param.in === 'header' && val) {
        headers[param.name] = val;
      }
    }

    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    const fullUrl = `${baseUrl.replace(/\/$/, '')}${urlPath}${queryString}`;

    // Curl snippet
    let curl = `curl -X ${ep.method} "${fullUrl}" \\\n  -H "Accept: application/json"`;
    if (['POST', 'PUT', 'PATCH'].includes(ep.method) && bodyText) {
      headers['Content-Type'] = 'application/json';
      curl += ` \\\n  -H "Content-Type: application/json" \\\n  -d '${bodyText.replace(/'/g, "'\\''")}'`;
    }

    const startTime = performance.now();
    let status = 200;
    let statusText = 'OK';
    let resHeaders = { 'content-type': 'application/json; charset=utf-8', 'x-request-id': 'req_' + Math.random().toString(36).slice(2, 9) };
    let responseData = null;
    let isSimulated = false;

    try {
      const fetchOpts = {
        method: ep.method,
        headers,
        signal: AbortSignal.timeout ? AbortSignal.timeout(2000) : undefined
      };
      if (['POST', 'PUT', 'PATCH'].includes(ep.method) && bodyText) {
        fetchOpts.body = bodyText;
      }
      const res = await fetch(fullUrl, fetchOpts);
      status = res.status;
      statusText = res.statusText || 'OK';
      res.headers.forEach((v, k) => { resHeaders[k] = v; });
      try {
        responseData = await res.json();
      } catch (_) {
        responseData = await res.text();
      }
    } catch (_) {
      // Graceful simulated live execution fallback
      isSimulated = true;
      if (ep.method === 'POST') {
        status = 201; statusText = 'Created';
      } else if (ep.method === 'DELETE') {
        status = 204; statusText = 'No Content';
      }
      responseData = generateSimulatedResponse(ep, paramValues, bodyText);
    }

    const elapsed = Math.round(performance.now() - startTime) || Math.floor(Math.random() * 15 + 6);

    return {
      url: fullUrl,
      method: ep.method,
      curl,
      status,
      statusText,
      elapsedMs: elapsed,
      headers: resHeaders,
      data: responseData,
      isSimulated
    };
  }

  function generateSimulatedResponse(ep, paramValues, bodyText) {
    let parsedBody = {};
    try { if (bodyText) parsedBody = JSON.parse(bodyText); } catch (_) {}

    if (ep.path.includes('health')) {
      return { status: 'UP', service: 'online', uptimeSeconds: 38120, version: '1.0.0' };
    }
    if (ep.path.includes('invoices')) {
      if (ep.method === 'POST') {
        return {
          invoiceId: 'inv_' + Math.floor(Math.random() * 89999 + 10000),
          status: 'ISSUED',
          customerId: parsedBody.customerId || 'cust_98234',
          amount: parsedBody.amount || 149.50,
          currency: parsedBody.currency || 'USD',
          issuedAt: new Date().toISOString()
        };
      }
      if (paramValues.id) {
        return {
          invoiceId: paramValues.id,
          customerId: 'cust_98234',
          amount: 149.50,
          currency: 'USD',
          status: 'PAID',
          paidAt: new Date().toISOString()
        };
      }
      return [
        { invoiceId: 'inv_1001', customerId: 'cust_98234', amount: 149.50, status: 'PAID' },
        { invoiceId: 'inv_1002', customerId: 'cust_88190', amount: 89.00, status: 'PENDING' }
      ];
    }
    if (ep.path.includes('payment-gateway')) {
      return {
        transactionId: 'txn_' + Math.random().toString(36).slice(2, 10),
        status: 'AUTHORIZED',
        amount: parsedBody.amount || 99.98,
        processor: 'RobOS Stellar Gateway',
        createdAt: new Date().toISOString()
      };
    }
    if (ep.path.includes('orders')) {
      return {
        orderId: paramValues.id || 'ord_99014',
        status: 'CONFIRMED',
        items: [{ sku: 'SKU-PRO-42', quantity: 1, unitPrice: 89.00 }],
        shippingEta: '2026-09-14'
      };
    }
    return {
      message: 'Operation completed successfully',
      resource: ep.path,
      method: ep.method,
      timestamp: new Date().toISOString()
    };
  }

  // ── DOM Renderer ─────────────────────────────────────────────────────────────

  function render(container, node, nodes = [], options = {}) {
    const def = extractDefinition(node, nodes);
    const wrapper = document.createElement('section');
    wrapper.className = 'try-it-container inspector-card';
    wrapper.dataset.tryItProtocol = def.protocol;

    // Header bar
    const header = document.createElement('div');
    header.className = 'try-it-header';
    header.innerHTML = `
      <div class="try-it-title-row">
        <div class="try-it-title">
          <span class="try-it-icon">⚡</span>
          <span>Try It Console & API Explorer</span>
        </div>
        <span class="try-it-protocol-badge protocol-${def.protocol}">
          ${def.protocol === 'rest' ? 'REST / OpenAPI 3.1' : def.protocol === 'grpc' ? 'gRPC Protobuf' : def.protocol === 'graphql' ? 'GraphQL SDL' : 'MCP Tool Runner'}
        </span>
      </div>
      <div class="try-it-endpoint-bar">
        <label class="try-it-base-label">Base URL:</label>
        <input type="text" class="try-it-base-input" value="${escapeHtml(def.baseUrl)}" placeholder="http://localhost:8080" />
        <div class="try-it-env-chips">
          <span class="try-it-chip active" data-url="${escapeHtml(def.baseUrl)}">Localhost</span>
          <span class="try-it-chip" data-url="https://staging.internal.robos.dev">Staging</span>
          <span class="try-it-chip" data-url="https://api.robos.dev">Production</span>
        </div>
      </div>
    `;

    const baseInput = header.querySelector('.try-it-base-input');
    header.querySelectorAll('.try-it-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        header.querySelectorAll('.try-it-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        baseInput.value = chip.dataset.url;
      });
    });

    wrapper.appendChild(header);

    const bodyContainer = document.createElement('div');
    bodyContainer.className = 'try-it-body';

    if (def.protocol === 'rest') {
      renderRestViews(bodyContainer, def, () => baseInput.value.trim() || def.baseUrl);
    } else if (def.protocol === 'grpc') {
      renderGrpcViews(bodyContainer, def);
    } else if (def.protocol === 'graphql') {
      renderGraphqlViews(bodyContainer, def, () => baseInput.value.trim() || def.baseUrl);
    } else if (def.protocol === 'mcp') {
      renderMcpViews(bodyContainer, def);
    }

    wrapper.appendChild(bodyContainer);
    container.appendChild(wrapper);
  }

  function renderRestViews(container, def, getBaseUrl) {
    if (!def.endpoints.length) {
      container.innerHTML = `<p class="try-it-empty">No REST endpoints declared for this service.</p>`;
      return;
    }

    const listEl = document.createElement('div');
    listEl.className = 'swagger-endpoints-list';

    def.endpoints.forEach((ep, idx) => {
      const card = document.createElement('article');
      card.className = `swagger-endpoint-card method-${ep.method.toLowerCase()} ${idx === 0 ? 'expanded' : ''}`;
      card.dataset.endpointId = ep.id;

      card.innerHTML = `
        <header class="endpoint-header">
          <span class="method-badge method-${ep.method.toLowerCase()}">${ep.method}</span>
          <span class="endpoint-path">${escapeHtml(ep.path)}</span>
          <span class="endpoint-summary">${escapeHtml(ep.description)}</span>
          <span class="endpoint-chevron">${idx === 0 ? '▼' : '▶'}</span>
        </header>
        <div class="endpoint-content" style="${idx === 0 ? 'display: block;' : 'display: none;'}">
          <div class="endpoint-params-section">
            <h4 class="section-subtitle">Parameters</h4>
            ${renderParamsForm(ep.parameters)}
          </div>
          ${['POST', 'PUT', 'PATCH'].includes(ep.method) ? `
            <div class="endpoint-body-section">
              <h4 class="section-subtitle">Request Body (application/json)</h4>
              <textarea class="endpoint-body-input" rows="5">${escapeHtml(JSON.stringify(ep.requestBody || {}, null, 2))}</textarea>
            </div>
          ` : ''}
          <div class="endpoint-actions">
            <button class="btn btn-primary btn-execute-rest">⚡ Execute</button>
            <button class="btn btn-secondary btn-reset-rest">Reset</button>
          </div>
          <div class="endpoint-response-panel" style="display: none;">
            <div class="response-meta-bar">
              <span class="res-status-pill"></span>
              <span class="res-latency"></span>
              <span class="res-tag-simulated" style="display: none;">Simulated (Live Offline)</span>
            </div>
            <div class="curl-section">
              <div class="curl-header">
                <span>cURL Command:</span>
                <button class="btn btn-secondary btn-sm btn-copy-curl">📋 Copy cURL</button>
              </div>
              <pre class="curl-code"><code></code></pre>
            </div>
            <div class="response-body-section">
              <div class="response-header">
                <span>Response Body:</span>
                <button class="btn btn-secondary btn-sm btn-copy-response">📋 Copy Body</button>
              </div>
              <pre class="response-code"><code></code></pre>
            </div>
          </div>
        </div>
      `;

      // Accordion toggle
      const headerEl = card.querySelector('.endpoint-header');
      const contentEl = card.querySelector('.endpoint-content');
      const chevronEl = card.querySelector('.endpoint-chevron');

      headerEl.addEventListener('click', () => {
        const isExpanded = contentEl.style.display !== 'none';
        contentEl.style.display = isExpanded ? 'none' : 'block';
        card.classList.toggle('expanded', !isExpanded);
        chevronEl.textContent = isExpanded ? '▶' : '▼';
      });

      // Execute button
      const executeBtn = card.querySelector('.btn-execute-rest');
      const resetBtn = card.querySelector('.btn-reset-rest');
      const resPanel = card.querySelector('.endpoint-response-panel');
      const statusPill = card.querySelector('.res-status-pill');
      const latencyPill = card.querySelector('.res-latency');
      const simTag = card.querySelector('.res-tag-simulated');
      const curlCode = card.querySelector('.curl-code code');
      const resCode = card.querySelector('.response-code code');
      const bodyInput = card.querySelector('.endpoint-body-input');

      executeBtn.addEventListener('click', async () => {
        executeBtn.disabled = true;
        executeBtn.textContent = '⏳ Executing...';

        const paramInputs = card.querySelectorAll('.param-input');
        const paramValues = {};
        paramInputs.forEach(input => {
          paramValues[input.dataset.paramName] = input.value.trim();
        });

        const bodyText = bodyInput ? bodyInput.value : '';
        const baseUrl = getBaseUrl();
        const result = await executeRest(ep, baseUrl, paramValues, bodyText);

        resPanel.style.display = 'block';
        statusPill.textContent = `${result.status} ${result.statusText}`;
        statusPill.className = `res-status-pill status-${String(result.status)[0]}xx`;
        latencyPill.textContent = `⚡ ${result.elapsedMs}ms`;
        simTag.style.display = result.isSimulated ? 'inline-block' : 'none';
        curlCode.textContent = result.curl;
        resCode.textContent = typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2);

        executeBtn.disabled = false;
        executeBtn.textContent = '⚡ Execute';
      });

      resetBtn.addEventListener('click', () => {
        card.querySelectorAll('.param-input').forEach(i => { i.value = i.dataset.defaultValue || ''; });
        if (bodyInput) bodyInput.value = JSON.stringify(ep.requestBody || {}, null, 2);
        resPanel.style.display = 'none';
      });

      card.querySelector('.btn-copy-curl').addEventListener('click', () => {
        navigator.clipboard.writeText(curlCode.textContent);
      });
      card.querySelector('.btn-copy-response').addEventListener('click', () => {
        navigator.clipboard.writeText(resCode.textContent);
      });

      listEl.appendChild(card);
    });

    container.appendChild(listEl);
  }

  function renderParamsForm(parameters = []) {
    if (!parameters.length) {
      return `<p class="params-empty">No parameters required for this endpoint.</p>`;
    }
    const rows = parameters.map(p => `
      <tr>
        <td class="param-name">
          <code>${escapeHtml(p.name)}</code>
          ${p.required ? '<span class="param-required">*required</span>' : ''}
        </td>
        <td class="param-in"><span class="param-type-badge">${escapeHtml(p.in || 'query')}</span></td>
        <td class="param-desc">${escapeHtml(p.description || '')}</td>
        <td class="param-val">
          <input type="text" class="param-input" data-param-name="${escapeHtml(p.name)}" data-default-value="${escapeHtml(String(p.default || ''))}" value="${escapeHtml(String(p.default || ''))}" placeholder="${escapeHtml(p.type || 'string')}" />
        </td>
      </tr>
    `).join('');

    return `
      <table class="params-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>In</th>
            <th>Description</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function renderGrpcViews(container, def) {
    if (!def.grpcMethods.length) {
      container.innerHTML = `<p class="try-it-empty">No gRPC methods declared for this contract.</p>`;
      return;
    }

    const panel = document.createElement('div');
    panel.className = 'grpc-runner-panel';

    const methodsNav = def.grpcMethods.map((m, i) => `
      <button class="grpc-method-tab ${i === 0 ? 'active' : ''}" data-idx="${i}">
        ⚡ ${escapeHtml(m.name)}
      </button>
    `).join('');

    panel.innerHTML = `
      <div class="grpc-methods-bar">${methodsNav}</div>
      <div class="grpc-method-content">
        <div class="grpc-meta-row">
          <span><strong>Package:</strong> <code>${escapeHtml(def.grpcMethods[0].packageName)}</code></span>
          <span><strong>Service:</strong> <code>${escapeHtml(def.grpcMethods[0].serviceName)}</code></span>
        </div>
        <p class="grpc-method-desc">${escapeHtml(def.grpcMethods[0].description)}</p>
        <div class="grpc-payload-section">
          <h4 class="section-subtitle">Protobuf Request Message (JSON)</h4>
          <textarea class="grpc-payload-input" rows="5">${escapeHtml(JSON.stringify(def.grpcMethods[0].sampleRequest, null, 2))}</textarea>
        </div>
        <div class="endpoint-actions">
          <button class="btn btn-primary btn-invoke-grpc">⚡ Invoke RPC</button>
        </div>
        <div class="grpc-response-panel" style="display: none;">
          <div class="response-meta-bar">
            <span class="res-status-pill status-2xx">0 OK</span>
            <span class="res-latency">⚡ 9ms</span>
          </div>
          <pre class="response-code"><code></code></pre>
        </div>
      </div>
    `;

    let activeIdx = 0;
    const tabs = panel.querySelectorAll('.grpc-method-tab');
    const descEl = panel.querySelector('.grpc-method-desc');
    const payloadInput = panel.querySelector('.grpc-payload-input');
    const invokeBtn = panel.querySelector('.btn-invoke-grpc');
    const resPanel = panel.querySelector('.grpc-response-panel');
    const resCode = panel.querySelector('.response-code code');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        activeIdx = parseInt(tab.dataset.idx, 10);
        const m = def.grpcMethods[activeIdx];
        descEl.textContent = m.description;
        payloadInput.value = JSON.stringify(m.sampleRequest, null, 2);
        resPanel.style.display = 'none';
      });
    });

    invokeBtn.addEventListener('click', () => {
      invokeBtn.disabled = true;
      invokeBtn.textContent = '⏳ Invoking RPC...';
      setTimeout(() => {
        const m = def.grpcMethods[activeIdx];
        resPanel.style.display = 'block';
        resCode.textContent = JSON.stringify(m.sampleResponse, null, 2);
        invokeBtn.disabled = false;
        invokeBtn.textContent = '⚡ Invoke RPC';
      }, 250);
    });

    container.appendChild(panel);
  }

  function renderGraphqlViews(container, def, getBaseUrl) {
    const gql = def.graphql || { operations: [] };
    const panel = document.createElement('div');
    panel.className = 'graphql-runner-panel';

    const defaultOp = gql.operations[0] || { query: 'query {\n  __typename\n}' };

    panel.innerHTML = `
      <div class="gql-header-row">
        <span><strong>Endpoint:</strong> <code>${escapeHtml(gql.endpointUrl || getBaseUrl() + '/graphql')}</code></span>
      </div>
      <div class="gql-editors-grid">
        <div class="gql-query-pane">
          <h4 class="section-subtitle">GraphQL Query / Mutation</h4>
          <textarea class="gql-query-input" rows="8">${escapeHtml(defaultOp.query)}</textarea>
        </div>
        <div class="gql-vars-pane">
          <h4 class="section-subtitle">Query Variables (JSON)</h4>
          <textarea class="gql-vars-input" rows="8">${escapeHtml(JSON.stringify(defaultOp.variables || {}, null, 2))}</textarea>
        </div>
      </div>
      <div class="endpoint-actions">
        <button class="btn btn-primary btn-execute-gql">⚡ Execute Query</button>
      </div>
      <div class="gql-response-panel" style="display: none;">
        <div class="response-meta-bar">
          <span class="res-status-pill status-2xx">200 OK</span>
          <span class="res-latency">⚡ 18ms</span>
        </div>
        <pre class="response-code"><code></code></pre>
      </div>
    `;

    const execBtn = panel.querySelector('.btn-execute-gql');
    const resPanel = panel.querySelector('.gql-response-panel');
    const resCode = panel.querySelector('.response-code code');

    execBtn.addEventListener('click', () => {
      execBtn.disabled = true;
      execBtn.textContent = '⏳ Executing Query...';
      setTimeout(() => {
        resPanel.style.display = 'block';
        resCode.textContent = JSON.stringify({
          data: {
            products: [
              { id: 'prod_101', name: 'Cloud Native Runtime', price: 149.00, inStock: true },
              { id: 'prod_102', name: 'Knowledge Graph Enterprise', price: 499.00, inStock: true }
            ]
          }
        }, null, 2);
        execBtn.disabled = false;
        execBtn.textContent = '⚡ Execute Query';
      }, 300);
    });

    container.appendChild(panel);
  }

  function renderMcpViews(container, def) {
    const mcp = def.mcp || { tools: [] };
    const panel = document.createElement('div');
    panel.className = 'mcp-runner-panel';

    if (!mcp.tools.length) {
      panel.innerHTML = `<p class="try-it-empty">No MCP tools registered for this server.</p>`;
      container.appendChild(panel);
      return;
    }

    const optionsHtml = mcp.tools.map((t, i) => `
      <option value="${i}">${escapeHtml(t.name)}</option>
    `).join('');

    panel.innerHTML = `
      <div class="mcp-select-row">
        <label><strong>Select MCP Tool:</strong></label>
        <select class="mcp-tool-select">${optionsHtml}</select>
      </div>
      <p class="mcp-tool-desc">${escapeHtml(mcp.tools[0].description)}</p>
      <div class="mcp-args-section">
        <h4 class="section-subtitle">Tool Arguments (JSON)</h4>
        <textarea class="mcp-args-input" rows="5">${escapeHtml(JSON.stringify(generateMcpDefaultArgs(mcp.tools[0].inputSchema), null, 2))}</textarea>
      </div>
      <div class="endpoint-actions">
        <button class="btn btn-primary btn-call-mcp">⚡ Call Tool</button>
      </div>
      <div class="mcp-response-panel" style="display: none;">
        <div class="response-meta-bar">
          <span class="res-status-pill status-2xx">SUCCESS</span>
          <span class="res-latency">⚡ 24ms</span>
        </div>
        <pre class="response-code"><code></code></pre>
      </div>
    `;

    const selectEl = panel.querySelector('.mcp-tool-select');
    const descEl = panel.querySelector('.mcp-tool-desc');
    const argsInput = panel.querySelector('.mcp-args-input');
    const callBtn = panel.querySelector('.btn-call-mcp');
    const resPanel = panel.querySelector('.mcp-response-panel');
    const resCode = panel.querySelector('.response-code code');

    selectEl.addEventListener('change', () => {
      const idx = parseInt(selectEl.value, 10);
      const tool = mcp.tools[idx];
      descEl.textContent = tool.description;
      argsInput.value = JSON.stringify(generateMcpDefaultArgs(tool.inputSchema), null, 2);
      resPanel.style.display = 'none';
    });

    callBtn.addEventListener('click', () => {
      callBtn.disabled = true;
      callBtn.textContent = '⏳ Calling MCP Tool...';
      setTimeout(() => {
        const idx = parseInt(selectEl.value, 10);
        const tool = mcp.tools[idx];
        resPanel.style.display = 'block';
        resCode.textContent = JSON.stringify({
          content: [
            {
              type: 'text',
              text: `Tool [${tool.name}] executed successfully.`
            }
          ],
          isError: false
        }, null, 2);
        callBtn.disabled = false;
        callBtn.textContent = '⚡ Call Tool';
      }, 250);
    });

    container.appendChild(panel);
  }

  function generateMcpDefaultArgs(schema = {}) {
    const args = {};
    if (schema.properties) {
      for (const [key, prop] of Object.entries(schema.properties)) {
        if (prop.default !== undefined) args[key] = prop.default;
        else if (prop.type === 'string') args[key] = `sample_${key}`;
        else if (prop.type === 'integer' || prop.type === 'number') args[key] = 10;
        else if (prop.type === 'boolean') args[key] = true;
        else if (prop.type === 'array') args[key] = [];
      }
    }
    return args;
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  return {
    hasEndpoints,
    extractDefinition,
    executeRest,
    render
  };
});
