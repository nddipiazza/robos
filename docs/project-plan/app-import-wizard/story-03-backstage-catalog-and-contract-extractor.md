---
nav_exclude: true
---

# Story: Backstage Catalog & Contract Extractor

**Epic:** Existing App Import Wizard
**Points:** 8
**Status:** In Progress

## Description
Automatically extract or create Backstage catalog-info.yaml; discover existing OpenAPI, GraphQL, Protobuf, or database migration scripts.

## Tasks
- [x] Scan repository for existing OpenAPI / Swagger YAML/JSON specs.
- [x] Scan for GraphQL schemas, Protobuf .proto files, and database migrations.
- [x] Auto-generate or enrich Spotify Backstage catalog-info.yaml with detected components and APIs.
- [x] Link discovered API contracts to Knowledge Graph contract entities.
- [x] Validate extracted contracts using Spectral linting.
