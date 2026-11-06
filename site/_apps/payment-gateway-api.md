---
title: "Payment Gateway API"
package: payment-gateway-api
category: "libraries"
component_type: component
permalink: /payment-gateway-api/
summary: "Experimental payment-service scaffold with an OpenAPI contract."
description: "Experimental payment-service scaffold with an OpenAPI contract."
---

Experimental payment-service scaffold with an OpenAPI contract.

## Source and integration

The component lives in [`packages/payment-gateway-api`](https://github.com/nddipiazza/robos/tree/main/packages/payment-gateway-api).

## Scaffold status

This folder contains an experimental Backstage catalog entry, a Dockerfile, a setup script and an OpenAPI specification. It has no application implementation or package manifest in this checkout.

The specification declares a health check, payment creation and refund creation. These are proposed endpoints; this scaffold does not process payments. Read [`openapi.yaml`](https://github.com/nddipiazza/robos/blob/main/packages/payment-gateway-api/openapi.yaml) for the contract.
