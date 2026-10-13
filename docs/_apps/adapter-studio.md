---
title: "Adapter Studio"
package: adapter-studio
category: apis-testing
summary: "A prototype window that shows sample translations between Backstage, TypeSpec, Buf, Pact and Dev Container files and RobOS specs."
description: "Adapter Studio displays built-in example input and output for five open-source formats. It does not read or write your repository; the adapter code is in the robos-adapters package."
---

Adapter Studio is a demo of the idea behind the `robos-adapters` library: take a file in an existing standard (a Backstage `catalog-info.yaml`, a TypeSpec `main.tsp`, a Buf config, a Pact contract, a `devcontainer.json`) and show the matching RobOS spec next to it.

{: .note }
Everything on screen is hardcoded sample data in `main.js` (a "forms-api" service and a few fake branches). The status badges, entity counts, "100% Lossless" and "14/14 Pact" figures are not computed from your files.

## What you can do in it

- Pick one of the five adapters from the **Open-Source Standards** list. A search box filters the list by name or standard.
- Read the two columns in the **Bi-Directional Zero-Loss Translation Bridge** panel: the raw input on the left, the translated RobOS specification on the right.
- Change the branch in the header dropdown. It offers three fixed names (`main`, `feature/TAX-1099-ein-verification`, `hotfix/calc-rate`) and only changes the commit badge.
- Click **Export Backstage YAML** or **Run Adapter Suite (All 5 OSS Standards)**. Each one shows a confirmation banner. No file is written and no adapter runs.

## Where the real code is

The conversion logic is in [`packages/robos-adapters`](https://github.com/nddipiazza/robos/tree/main/packages/robos-adapters): one module each for Backstage (`importCatalog`, `exportCatalog`), TypeSpec, Buf, Pact and Dev Containers. Adapter Studio does not import it. The library is exercised by the tests in `packages/robos-test/tests/sdlc-graph/oss-adapters.test.js`.

## Running it

```bash
electron packages/adapter-studio
```

The app needs no network access, Docker or tokens, and stores no data.
