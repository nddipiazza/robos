---
title: "Schema Studio & Registry"
package: schema-studio
category: arch-planning
icon: schema-studio.svg
summary: "Browse the bundled Schema.org vocabulary, generate JSON-LD, TypeSpec, SHACL and code stubs for a new entity, and validate JSON-LD against RobOS shapes."
description: "Explorer for Schema.org 28.1 (1,003 classes, 1,676 properties) with a synthesizer and validator built on it. The TypeSpec models tab, compile and breaking-change checks use fixed sample data."
---

Schema Studio helps you define a RobOS entity in terms of Schema.org. It has four tabs: **TypeSpec & Models**, **Schema.org Explorer**, **KGraph Synthesizer** and **Schema Validator**. For how RobOS uses schemas in general, see [Schemas]({{ site.baseurl }}{% link schemas.md %}).

## What works

- **Schema.org Explorer.** Search and browse the classes and properties in `lib/bundled-schemaorg.json` (Schema.org 28.1). Filter by "Mapped in RobOS SHACL" or by standard (OSLC, C4, Cucumber). Selecting a class shows its description, parent chain and direct and inherited properties. **Synthesize KGraph Node** sends the selected class to the synthesizer.
- **KGraph Synthesizer.** Enter an entity name, pick a Schema.org base class (SoftwareApplication, CodeRepository, WebAPI, Organization, Action, Dataset, DigitalDocument or Person) and a domain standard, then click **Generate Full Specification Suite**. The result tabs are JSON-LD, TypeSpec, W3C SHACL, TypeScript/Zod, Java 21, Python and Go.
- **Schema Validator.** Paste a JSON-LD payload, or load the presets Microservice, OSLC Task or Organization, and click **Validate Conformance**. The report checks the payload against Schema.org types and the built-in RobOS SHACL shapes from `packages/robos-graph/lib/shacl-validator.js`.

The explorer reads `~/.config/robos/schemas/schemaorg-cache.json` if it exists, and otherwise the bundled file.

## What is a placeholder

- **TypeSpec & Models** lists two built-in sample models (a dynamic form model and a user model) defined in `main.js`. They are not read from `.robos/entities/` even though the paths are shown.
- The branch selector offers three hard-coded branch names and swaps a sample TypeSpec text.
- The compile and breaking-change buttons return fixed results (six targets compiled, 0 errors, 100% backward compatible). No TypeSpec compiler or Buf runs, and the "TypeSpec 0.61 Compiler Online" label is static text.
- **Sync Upstream** calls a registry method that does not exist, so it reports an error. To update the vocabulary, replace `lib/bundled-schemaorg.json`.

Generated output is not saved by the app. Copy it from the code pane.

## Run it

Launch **Schema Studio & Definitive Registry** from the app launcher, or run `npm start` in `packages/schema-studio`.
