'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');

let BUILTIN_SHACL_SHAPES = {};
try {
  const shaclMod = require('../../robos-graph/lib/shacl-validator');
  BUILTIN_SHACL_SHAPES = shaclMod.BUILTIN_SHACL_SHAPES || {};
} catch (e) {
  try {
    const shaclMod = require('/usr/local/share/robos/robos-graph/lib/shacl-validator');
    BUILTIN_SHACL_SHAPES = shaclMod.BUILTIN_SHACL_SHAPES || {};
  } catch (_) {}
}

class SchemaRegistry {
  constructor(options = {}) {
    this.bundledPath = options.bundledPath || path.join(__dirname, 'bundled-schemaorg.json');
    this.configCacheDir = options.cacheDir || path.join(process.env.HOME || '', '.config/robos/schemas');
    this.cacheFile = path.join(this.configCacheDir, 'schemaorg-cache.json');
    this.data = null;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;

    if (fs.existsSync(this.cacheFile)) {
      try {
        const raw = fs.readFileSync(this.cacheFile, 'utf-8');
        this.data = JSON.parse(raw);
      } catch (err) {
        console.warn('Failed to parse cached schema.org data, falling back to bundle:', err.message);
      }
    }

    if (!this.data && fs.existsSync(this.bundledPath)) {
      const raw = fs.readFileSync(this.bundledPath, 'utf-8');
      this.data = JSON.parse(raw);
    }

    if (!this.data) {
      this.data = {
        version: '28.1',
        totalClasses: 0,
        totalProperties: 0,
        classes: {},
        properties: {},
        domainStandards: {},
      };
    }

    this._indexRobosMappings();
    this.initialized = true;
  }

  _indexRobosMappings() {
    this.robosClassMap = {};
    for (const [key, shape] of Object.entries(BUILTIN_SHACL_SHAPES)) {
      const shapeId = shape.shapeId || key;
      const sType = shape.schemaOrgType || '';
      const rawClass = sType.replace('https://schema.org/', '');
      if (rawClass) {
        if (!this.robosClassMap[rawClass]) {
          this.robosClassMap[rawClass] = [];
        }
        this.robosClassMap[rawClass].push({
          shapeId,
          targetClass: shape.targetClass,
          domainStandard: shape.domainStandard,
          description: shape.description || shape.label,
          properties: shape.properties || [],
        });
      }
    }
  }

  search(query, options = {}) {
    this.init();
    const q = (query || '').toLowerCase().trim();
    const limit = options.limit || 40;
    const filterStandard = options.standard || null;

    const results = [];

    for (const [id, cls] of Object.entries(this.data.classes)) {
      if (q && !id.toLowerCase().includes(q) && !(cls.comment || '').toLowerCase().includes(q)) {
        continue;
      }
      const robosShapes = this.robosClassMap[id] || [];
      if (filterStandard && filterStandard !== 'ALL') {
        if (filterStandard === 'ROBOS_ONLY' && robosShapes.length === 0) continue;
        if (filterStandard !== 'ROBOS_ONLY') {
          const hasMatch = robosShapes.some(s => (s.domainStandard || '').includes(filterStandard));
          if (!hasMatch) continue;
        }
      }

      results.push({
        type: 'class',
        id: cls.id,
        uri: cls.uri,
        label: cls.label,
        comment: cls.comment,
        subClassOf: cls.subClassOf,
        propertyCount: (cls.properties || []).length,
        robosShapesCount: robosShapes.length,
        robosShapes: robosShapes.map(s => s.shapeId),
      });

      if (results.length >= limit) break;
    }

    return {
      query,
      count: results.length,
      totalClasses: this.data.totalClasses,
      totalProperties: this.data.totalProperties,
      results,
    };
  }

  getClass(id) {
    this.init();
    const cleanId = (id || '').replace('schema:', '').replace('https://schema.org/', '');
    const cls = this.data.classes[cleanId];
    if (!cls) return null;

    const lineage = this.getLineage(cleanId);
    const directProps = (cls.properties || []).map(pId => this.getProperty(pId)).filter(Boolean);

    // Collect inherited properties
    const inheritedProps = [];
    const seenProps = new Set(cls.properties || []);
    for (const parentId of lineage.slice(1)) {
      const parentCls = this.data.classes[parentId];
      if (parentCls && parentCls.properties) {
        for (const pId of parentCls.properties) {
          if (!seenProps.has(pId)) {
            seenProps.add(pId);
            const pObj = this.getProperty(pId);
            if (pObj) {
              inheritedProps.push({ ...pObj, inheritedFrom: parentId });
            }
          }
        }
      }
    }

    const robosShapes = this.robosClassMap[cleanId] || [];

    return {
      ...cls,
      lineage,
      directProperties: directProps,
      inheritedProperties: inheritedProps,
      totalPropertiesCount: directProps.length + inheritedProps.length,
      robosShapes,
    };
  }

  getProperty(id) {
    this.init();
    const cleanId = (id || '').replace('schema:', '').replace('https://schema.org/', '');
    return this.data.properties[cleanId] || null;
  }

  getLineage(id) {
    this.init();
    const lineage = [id];
    let curr = id;
    const visited = new Set([id]);

    while (curr && this.data.classes[curr]) {
      const parents = this.data.classes[curr].subClassOf || [];
      if (parents.length > 0) {
        const nextParent = parents[0];
        if (!visited.has(nextParent)) {
          visited.add(nextParent);
          lineage.push(nextParent);
          curr = nextParent;
        } else {
          break;
        }
      } else {
        break;
      }
    }
    return lineage;
  }

  validateJsonLd(payload) {
    this.init();
    const errors = [];
    const warnings = [];

    if (!payload || typeof payload !== 'object') {
      return { valid: false, errors: ['Payload must be a valid JSON-LD object'], warnings: [] };
    }

    let rawType = payload['@type'];
    if (!rawType) {
      errors.push("Missing '@type' declaration in JSON-LD root");
      return { valid: false, errors, warnings };
    }

    const types = Array.isArray(rawType) ? rawType : [rawType];
    let matchedClass = null;

    for (const t of types) {
      const clean = t.replace('schema:', '').replace('robos:', '');
      if (this.data.classes[clean]) {
        matchedClass = this.data.classes[clean];
        break;
      }
    }

    if (!matchedClass) {
      for (const t of types) {
        const shape = Array.isArray(BUILTIN_SHACL_SHAPES) ? BUILTIN_SHACL_SHAPES.find(s => s.targetClass === t || s.targetClass === `robos:${t}`) : (BUILTIN_SHACL_SHAPES[t] || BUILTIN_SHACL_SHAPES[t.replace('robos:', '')]);
        if (shape && shape.schemaOrgType) {
          const sName = shape.schemaOrgType.replace('https://schema.org/', '');
          matchedClass = this.data.classes[sName];
          break;
        }
      }
    }

    if (matchedClass) {
      const allowedProps = new Set([...matchedClass.properties]);
      const lineage = this.getLineage(matchedClass.id);
      for (const parent of lineage) {
        const pCls = this.data.classes[parent];
        if (pCls && pCls.properties) {
          pCls.properties.forEach(p => allowedProps.add(p));
        }
      }

      for (const key of Object.keys(payload)) {
        if (key.startsWith('@')) continue;
        const strippedKey = key.replace('schema:', '').replace('robos:', '');
        if (!allowedProps.has(strippedKey) && !this.data.properties[strippedKey]) {
          warnings.push(`Property '${key}' is not declared in Schema.org '${matchedClass.id}' or its parent classes.`);
        }
      }
    } else {
      errors.push(`Unrecognized entity type: none of [${types.join(', ')}] map to a known Schema.org or RobOS SHACL class.`);
    }

    return {
      valid: errors.length === 0,
      matchedClass: matchedClass ? matchedClass.id : null,
      canonicalUri: matchedClass ? matchedClass.uri : null,
      errors,
      warnings,
    };
  }

  synthesizeKGraphEntity(classIdOrOptions, maybeOptions = {}) {
    this.init();
    let classId = classIdOrOptions;
    let customOptions = maybeOptions;
    if (typeof classIdOrOptions === 'object' && classIdOrOptions !== null) {
      customOptions = classIdOrOptions;
      classId = classIdOrOptions.classId || classIdOrOptions.schemaOrgType || classIdOrOptions.type;
    }

    const details = this.getClass(classId);
    if (!details) {
      throw new Error(`Schema.org class '${classId}' not found.`);
    }

    const entityName = customOptions.entityName || `My${details.id}`;
    const domainStandard = customOptions.domainStandard || 'OASIS_OSLC_AM';
    const standardDef = (this.data.domainStandards && this.data.domainStandards[domainStandard]) || {
      name: 'OASIS OSLC Architecture Management 3.0',
      uri: 'http://open-services.net/ns/am#',
    };

    const selectedProps = details.directProperties.slice(0, 6);

    const jsonLd = {
      '@context': {
        robos: 'https://robos.dev/schema/',
        schema: 'https://schema.org/',
        rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
      },
      '@id': `urn:robos:${(customOptions.robosNamespace || 'core')}:${entityName.toLowerCase()}-1`,
      '@type': customOptions.robosType ? `robos:${customOptions.robosType}` : [`robos:${entityName}`, `schema:${details.id}`],
      'schema:additionalType': details.uri,
      'robos:name': entityName,
      'robos:description': customOptions.description || details.comment || `Enterprise implementation of ${details.id}`,
      'rdfs:isDefinedBy': details.uri,
      'robos:refersFrom': details.uri,
    };

    const typeSpecFields = selectedProps.map(p => {
      let tsType = 'string';
      const range = (p.rangeIncludes && p.rangeIncludes[0]) || 'Text';
      if (range === 'Integer' || range === 'Number') tsType = 'int32';
      else if (range === 'Boolean') tsType = 'boolean';
      else if (range === 'DateTime' || range === 'Date') tsType = 'utcDateTime';
      return `  ${p.id}?: ${tsType}; // ${p.comment ? p.comment.slice(0, 60).replace(/\n/g, ' ') : ''}...`;
    }).join('\n');

    const typeSpec = `import "@typespec/http";
import "@typespec/rest";

namespace RobOS.Architecture;

@doc("${(details.comment || '').replace(/"/g, "'").replace(/\n/g, ' ')}")
model ${entityName} {
  id: string;
  name: string;
  description?: string;
${typeSpecFields}
}`;

    const shaclShape = {
      shapeId: `robos:${entityName}Shape`,
      targetClass: `robos:${entityName}`,
      schemaOrgType: details.uri,
      domainStandard: standardDef.uri,
      label: `${entityName} Constraint Shape`,
      description: `Validates ${entityName} nodes conforming to schema.org/${details.id}`,
      propertyConstraints: selectedProps.map(p => ({
        path: `schema:${p.id}`,
        datatype: 'xsd:string',
        minCount: 0,
        description: p.comment || '',
      })),
    };

    const polyglot = {
      typescript: `import { z } from "zod";

export const ${entityName}Schema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
${selectedProps.map(p => `  ${p.id}: z.string().optional(),`).join('\n')}
});

export type ${entityName} = z.infer<typeof ${entityName}Schema>;`,
      java: `package com.robos.entities;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.Optional;

public record ${entityName}(
    @JsonProperty("id") String id,
    @JsonProperty("name") String name,
    @JsonProperty("description") Optional<String> description
) {}`,
      python: `from pydantic import BaseModel, Field
from typing import Optional

class ${entityName}(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
`,
      go: `package entities

type ${entityName} struct {
    ID          string \`json:"id"\`
    Name        string \`json:"name"\`
    Description string \`json:"description,omitempty"\`
}`,
    };

    return {
      entityName,
      schemaOrgClass: details.id,
      schemaOrgUri: details.uri,
      domainStandard: standardDef.name,
      domainStandardUri: standardDef.uri,
      jsonLd,
      typeSpec,
      shaclShape,
      polyglot,
    };
  }
}

module.exports = { SchemaRegistry };
