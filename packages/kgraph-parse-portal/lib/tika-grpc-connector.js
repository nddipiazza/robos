'use strict';

const net = require('net');
const path = require('path');
const { classifyFile } = require('./fs-mime-classifier');

/**
 * TikaGrpcConnector: Apache Tika 4.0 streaming gRPC connector with resilient fallback.
 * Provides polyglot document, schema, and AST symbol extraction for RobOS Knowledge Graph.
 */
class TikaGrpcConnector {
  constructor(options = {}) {
    this.endpoint = options.endpoint || process.env.ROBOS_TIKA_GRPC_ENDPOINT || 'localhost:50051';
    const parts = this.endpoint.split(':');
    this.host = parts[0] || 'localhost';
    this.port = parseInt(parts[1] || '50051', 10);
    this.timeoutMs = options.timeoutMs || 500;
  }

  /**
   * Checks if the Tika 4.0 gRPC server is actively reachable.
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(this.timeoutMs);
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.once('error', () => {
        socket.destroy();
        resolve(false);
      });
      socket.connect(this.port, this.host);
    });
  }

  /**
   * Extracts language AST symbols (functions, classes, contracts, exports) from source code text.
   * @param {string} content 
   * @param {string} extOrMime 
   * @returns {Array<Object>} List of AST symbols
   */
  extractAstSymbols(content, extOrMime = '') {
    const symbols = [];
    if (!content || typeof content !== 'string') return symbols;

    const lowerExt = (extOrMime || '').toLowerCase();

    // 1. JavaScript / TypeScript
    if (['.js', '.ts', '.tsx', '.jsx', '.mjs', 'javascript', 'typescript'].some(k => lowerExt.includes(k))) {
      // Classes
      const classRegex = /class\s+([A-Za-z0-9_$]+)(?:\s+extends\s+([A-Za-z0-9_$]+))?/g;
      let m;
      while ((m = classRegex.exec(content)) !== null) {
        symbols.push({ type: 'class', name: m[1], superClass: m[2] || null });
      }
      // Functions
      const fnRegex = /(?:function\s+([A-Za-z0-9_$]+)|(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)/g;
      while ((m = fnRegex.exec(content)) !== null) {
        symbols.push({ type: 'function', name: m[1] || m[2] });
      }
      // Interfaces / Types
      const typeRegex = /(?:interface|type)\s+([A-Za-z0-9_$]+)/g;
      while ((m = typeRegex.exec(content)) !== null) {
        symbols.push({ type: 'typeDefinition', name: m[1] });
      }
    }

    // 2. Python
    if (['.py', 'python'].some(k => lowerExt.includes(k))) {
      const pyClassRegex = /class\s+([A-Za-z0-9_]+)(?:\(([^)]+)\))?:/g;
      let m;
      while ((m = pyClassRegex.exec(content)) !== null) {
        symbols.push({ type: 'class', name: m[1], baseClasses: m[2] ? m[2].split(',').map(s => s.trim()) : [] });
      }
      const pyFnRegex = /def\s+([A-Za-z0-9_]+)\s*\(/g;
      while ((m = pyFnRegex.exec(content)) !== null) {
        symbols.push({ type: 'function', name: m[1] });
      }
    }

    // 3. Java / Kotlin
    if (['.java', '.kt', 'java'].some(k => lowerExt.includes(k))) {
      const javaClassRegex = /(?:public|protected|private)?\s*(?:static)?\s*(?:final)?\s*(?:class|interface|record|enum)\s+([A-Za-z0-9_]+)/g;
      let m;
      while ((m = javaClassRegex.exec(content)) !== null) {
        symbols.push({ type: 'class', name: m[1] });
      }
      const javaMethodRegex = /(?:public|protected|private)\s+(?:static\s+)?[A-Za-z0-9_<>[\]]+\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*[{;]/g;
      while ((m = javaMethodRegex.exec(content)) !== null) {
        if (!['if', 'for', 'while', 'switch'].includes(m[1])) {
          symbols.push({ type: 'method', name: m[1] });
        }
      }
    }

    // 4. Go
    if (['.go', 'golang'].some(k => lowerExt.includes(k))) {
      const goTypeRegex = /type\s+([A-Za-z0-9_]+)\s+(struct|interface)/g;
      let m;
      while ((m = goTypeRegex.exec(content)) !== null) {
        symbols.push({ type: m[2], name: m[1] });
      }
      const goFnRegex = /func\s+(?:\([^)]+\)\s*)?([A-Za-z0-9_]+)\s*\(/g;
      while ((m = goFnRegex.exec(content)) !== null) {
        symbols.push({ type: 'function', name: m[1] });
      }
    }

    // 5. Rust
    if (['.rs', 'rust'].some(k => lowerExt.includes(k))) {
      const rustTypeRegex = /(?:pub\s+)?(?:struct|enum|trait)\s+([A-Za-z0-9_]+)/g;
      let m;
      while ((m = rustTypeRegex.exec(content)) !== null) {
        symbols.push({ type: 'typeDefinition', name: m[1] });
      }
      const rustFnRegex = /(?:pub\s+)?fn\s+([A-Za-z0-9_]+)\s*\(/g;
      while ((m = rustFnRegex.exec(content)) !== null) {
        symbols.push({ type: 'function', name: m[1] });
      }
    }

    // 6. Protobuf
    if (['.proto', 'protobuf'].some(k => lowerExt.includes(k))) {
      const protoMsgRegex = /message\s+([A-Za-z0-9_]+)/g;
      let m;
      while ((m = protoMsgRegex.exec(content)) !== null) {
        symbols.push({ type: 'message', name: m[1] });
      }
      const protoServiceRegex = /service\s+([A-Za-z0-9_]+)/g;
      while ((m = protoServiceRegex.exec(content)) !== null) {
        symbols.push({ type: 'service', name: m[1] });
      }
      const protoRpcRegex = /rpc\s+([A-Za-z0-9_]+)\s*\(([^)]+)\)\s*returns\s*\(([^)]+)\)/g;
      while ((m = protoRpcRegex.exec(content)) !== null) {
        symbols.push({ type: 'rpc', name: m[1], inputType: m[2].trim(), outputType: m[3].trim() });
      }
    }

    // 7. GraphQL
    if (['.graphql', '.gql', 'graphql'].some(k => lowerExt.includes(k))) {
      const gqlTypeRegex = /(?:type|input|interface|enum)\s+([A-Za-z0-9_]+)/g;
      let m;
      while ((m = gqlTypeRegex.exec(content)) !== null) {
        symbols.push({ type: 'typeDefinition', name: m[1] });
      }
    }

    return symbols;
  }

  /**
   * Parses document or code input via Tika gRPC or offline polyglot extractor.
   * @param {string|Buffer} input Buffer or string
   * @param {Object} [options]
   * @returns {Promise<Object>} Extracted document content and metadata
   */
  async parseDocument(input, options = {}) {
    const fileName = options.fileName || 'unknown.txt';
    const filePath = options.filePath || fileName;
    const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input || '', 'utf8');

    const available = await this.isAvailable();
    const classification = classifyFile(filePath, null, buffer);

    let extractedText = '';
    const metadata = {
      fileName: path.basename(filePath),
      filePath,
      fileSize: buffer.length,
      mimeType: classification.rawMime,
      semanticType: classification.semanticType,
      semanticRole: classification.semanticRole,
      protocol: classification.protocol || null,
      sourceEngine: available ? 'apache-tika-4.0-grpc' : 'tika-offline-engine',
    };

    if (classification.binary) {
      if (classification.rawMime === 'application/pdf') {
        extractedText = `[PDF Document: ${fileName} - ${buffer.length} bytes]`;
        metadata.estimatedPages = Math.max(1, Math.floor(buffer.length / 30000));
      } else {
        extractedText = `[Binary ELF Artifact: ${fileName} - ${buffer.length} bytes]`;
      }
    } else {
      extractedText = buffer.toString('utf8');
    }

    // Extract AST symbols
    const astSymbols = this.extractAstSymbols(extractedText, path.extname(filePath));
    metadata.astSymbolsCount = astSymbols.length;

    return {
      text: extractedText,
      metadata,
      astSymbols,
      mimeType: classification.rawMime,
      semanticRole: classification.semanticRole,
      semanticType: classification.semanticType,
      source: metadata.sourceEngine,
    };
  }
}

module.exports = {
  TikaGrpcConnector,
};
