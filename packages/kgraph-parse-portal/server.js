'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const {
  detectDirectoryArchetype,
  classifyFile,
  scanPathToGraphNodes,
} = require('./lib/fs-mime-classifier');
const { TikaGrpcConnector } = require('./lib/tika-grpc-connector');
const {
  BUILDBARN_OCI_CHART,
  generateBuildbarnHelmValues,
  generateHelmInstallCommand,
  checkRbeClusterStatus,
  generateKgraphClusterNode,
} = require('./lib/buildbarn-rbe');
const { LuxirSearchBridge } = require('./lib/luxir-search-bridge');

let SDLCKnowledgeGraphStore = null;
try {
  const storePath = path.resolve(__dirname, '../robos-graph/lib/graph-store.js');
  SDLCKnowledgeGraphStore = require(storePath).SDLCKnowledgeGraphStore;
} catch {}

class ParsePortalServer {
  constructor(options = {}) {
    this.port = options.port || parseInt(process.env.ROBOS_PARSE_PORT || '19192', 10);
    this.tika = new TikaGrpcConnector(options.tika || {});
    this.luxir = new LuxirSearchBridge(options.luxir || {});
    this.server = null;
  }

  getGraphStore() {
    if (!SDLCKnowledgeGraphStore) return null;
    try {
      const graphFile = path.resolve(__dirname, '../../.robos/knowledge-graph.jsonld');
      return new SDLCKnowledgeGraphStore({ filePath: graphFile, rootDir: path.dirname(graphFile) });
    } catch {
      return null;
    }
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        const parsedUrl = new URL(req.url, `http://localhost:${this.port}`);
        const pathname = parsedUrl.pathname;
        const method = req.method.toUpperCase();

        // Standard CORS Headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (method === 'OPTIONS') {
          res.writeHead(204);
          return res.end();
        }

        const readJsonBody = () =>
          new Promise((resBody, rejBody) => {
            let data = '';
            req.on('data', (chunk) => (data += chunk));
            req.on('end', () => {
              try {
                resBody(data ? JSON.parse(data) : {});
              } catch (e) {
                rejBody(e);
              }
            });
            req.on('error', rejBody);
          });

        try {
          // 1. Health / Status
          if ((pathname === '/health' || pathname === '/api/v1/status') && method === 'GET') {
            const tikaOnline = await this.tika.isAvailable();
            const luxirStats = await this.luxir.getIndexStats();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(
              JSON.stringify({
                ok: true,
                service: 'RobOS Kgraph Parse Portal',
                version: '1.0.0',
                tika: {
                  endpoint: this.tika.endpoint,
                  online: tikaOnline,
                  mode: tikaOnline ? 'streaming-grpc' : 'offline-polyglot-engine',
                },
                luxir: luxirStats,
                buildbarn: {
                  chart: BUILDBARN_OCI_CHART,
                  supportedProtocols: ['REAPI_v2'],
                },
              })
            );
          }

          // 2. Parse Single Resource (URL / File / String)
          if (pathname === '/api/v1/parse' && method === 'POST') {
            const body = await readJsonBody();
            let content = body.content || '';
            const filePath = body.filePath || body.fileName || 'input-document.txt';

            // If a local file path was supplied and content was empty, read the file
            if (!content && body.filePath && fs.existsSync(body.filePath)) {
              content = fs.readFileSync(body.filePath);
            }

            const parseResult = await this.tika.parseDocument(content, {
              fileName: path.basename(filePath),
              filePath,
            });

            // Auto-index into Luxir
            const classification = classifyFile(filePath, null, content);
            const slug = path.basename(filePath).toLowerCase().replace(/[^a-z0-9_.-]+/g, '-');
            const graphNode = {
              '@id': `urn:robos:source:${slug}`,
              '@type': [classification.semanticType, classification.targetClass, 'schema:CreativeWork'],
              'dcterms:title': path.basename(filePath),
              'dcterms:description': `${classification.semanticRole} (${classification.rawMime})`,
              'robos:mimeType': classification.rawMime,
              'robos:semanticRole': classification.semanticRole,
              'robos:sourcePath': filePath,
              'robos:fileSize': parseResult.metadata.fileSize,
              'robos:astSymbols': parseResult.astSymbols,
              'robos:evidence': [
                {
                  repository: body.repository || 'workspace',
                  path: filePath,
                  line: 1,
                  revision: 'working-tree',
                },
              ],
            };
            if (classification.protocol) {
              graphNode['robos:protocol'] = classification.protocol;
              graphNode['robos:specFile'] = filePath;
            }

            await this.luxir.indexNodes([graphNode]);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(
              JSON.stringify({
                ok: true,
                parseResult,
                graphNode,
              })
            );
          }

          // 3. Crawl Filesystem Directory
          if (pathname === '/api/v1/crawl' && method === 'POST') {
            const body = await readJsonBody();
            const targetPath = body.directoryPath || body.path || process.cwd();
            const maxDepth = body.maxDepth || 8;
            const repository = body.repository || path.basename(targetPath);
            const pkg = body.package || 'core-platform';

            const scanResult = scanPathToGraphNodes(targetPath, {
              maxDepth,
              repository,
              package: pkg,
            });

            // Index all nodes into Luxir
            await this.luxir.indexNodes(scanResult.nodes);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(
              JSON.stringify({
                ok: true,
                archetype: scanResult.archetype,
                fileCount: scanResult.fileCount,
                nodeCount: scanResult.nodes.length,
                nodes: scanResult.nodes,
              })
            );
          }

          // 4. Ingest & Commit directly to KGraph Store
          if (pathname === '/api/v1/ingest' && method === 'POST') {
            const body = await readJsonBody();
            const targetPath = body.directoryPath || body.path || process.cwd();
            const scanResult = scanPathToGraphNodes(targetPath, {
              maxDepth: body.maxDepth || 8,
              repository: body.repository || path.basename(targetPath),
              package: body.package || 'core-platform',
            });

            const store = this.getGraphStore();
            let addedCount = 0;
            if (store) {
              for (const node of scanResult.nodes) {
                store.addNode(node);
                addedCount++;
              }
            }

            await this.luxir.indexNodes(scanResult.nodes);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(
              JSON.stringify({
                ok: true,
                committedToGraph: Boolean(store),
                nodesCommitted: addedCount,
                archetype: scanResult.archetype,
                nodes: scanResult.nodes,
              })
            );
          }

          // 5. Search Luxir Index
          if (pathname === '/api/v1/search' && method === 'GET') {
            const q = parsedUrl.searchParams.get('q') || '';
            const filters = {
              type: parsedUrl.searchParams.get('type') || undefined,
              mimeType: parsedUrl.searchParams.get('mimeType') || undefined,
              semanticRole: parsedUrl.searchParams.get('semanticRole') || undefined,
              archetype: parsedUrl.searchParams.get('archetype') || undefined,
              protocol: parsedUrl.searchParams.get('protocol') || undefined,
            };

            const results = await this.luxir.search(q, filters);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(
              JSON.stringify({
                ok: true,
                query: q,
                count: results.length,
                results,
              })
            );
          }

          // 6. Hermetiq Buildbarn RBE Status Probe
          if (pathname === '/api/v1/rbe/status' && method === 'GET') {
            const endpoint = parsedUrl.searchParams.get('endpoint') || '127.0.0.1:8980';
            const status = await checkRbeClusterStatus(endpoint);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: true, rbe: status }));
          }

          // 7. Hermetiq Buildbarn Helm Values Generator
          if (pathname === '/api/v1/rbe/values' && method === 'POST') {
            const body = await readJsonBody();
            const valuesYaml = generateBuildbarnHelmValues(body);
            const installCommand = generateHelmInstallCommand(body);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(
              JSON.stringify({
                ok: true,
                chart: BUILDBARN_OCI_CHART,
                valuesYaml,
                installCommand,
              })
            );
          }

          // 8. Register Buildbarn Cluster into KGraph
          if (pathname === '/api/v1/rbe/register-cluster' && method === 'POST') {
            const body = await readJsonBody();
            const clusterNode = generateKgraphClusterNode(body);
            const store = this.getGraphStore();
            if (store) {
              store.addNode(clusterNode);
            }
            await this.luxir.indexNodes([clusterNode]);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(
              JSON.stringify({
                ok: true,
                clusterNode,
                committed: Boolean(store),
              })
            );
          }

          // 9. Static UI Assets
          if (pathname === '/' || pathname === '/index.html') {
            const htmlPath = path.join(__dirname, 'renderer', 'index.html');
            if (fs.existsSync(htmlPath)) {
              res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
              return res.end(fs.readFileSync(htmlPath));
            }
          }

          if (pathname.startsWith('/renderer/')) {
            const rel = pathname.replace('/renderer/', '');
            const safePath = path.join(__dirname, 'renderer', path.normalize(rel));
            if (fs.existsSync(safePath) && !safePath.endsWith('/')) {
              const ext = path.extname(safePath).toLowerCase();
              const mimeMap = {
                '.html': 'text/html; charset=utf-8',
                '.js': 'application/javascript; charset=utf-8',
                '.css': 'text/css; charset=utf-8',
                '.svg': 'image/svg+xml',
                '.json': 'application/json',
              };
              res.writeHead(200, { 'Content-Type': mimeMap[ext] || 'text/plain' });
              return res.end(fs.readFileSync(safePath));
            }
          }

          // 404 Not Found
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: 'Endpoint not found' }));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });

      this.server.listen(this.port, () => {
        resolve({ port: this.port });
      });

      this.server.on('error', (err) => {
        reject(err);
      });
    });
  }

  async stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }
}

// Standalone execution: node server.js
if (require.main === module) {
  const portalServer = new ParsePortalServer();
  portalServer.start().then(({ port }) => {
    console.log(`RobOS Kgraph Parse Portal Server listening on http://localhost:${port}`);
  });
}

module.exports = {
  ParsePortalServer,
};
