---
title: "gRPC Microservice Client"
package: grpc-client
category: apis-testing
icon: grpc-client.svg
summary: "A BloomRPC-style window that lists sample protobuf services and shows canned responses; no RPC is sent."
description: "gRPC Client lays out a service list, request payload editor and response pane. The services and replies are hardcoded samples for a pet-shop API, and no proto files are loaded."
related:
  - /apps/rest-client/
---

gRPC Client has the layout of a protobuf RPC tool: a **Protobuf Services (petshop.proto)** list, a request payload editor with an endpoint field, an **Invoke RPC** button and a **Response Payload** pane with status, latency and headers.

{: .important }
Nothing is loaded from a `.proto` file and nothing is called. `grpc-get-services` returns three hardcoded methods: `petshop.v1.VaccineVerificationService` (`VerifyCertificate`, unary, and `StreamVaccinationEvents`, server streaming) and `petshop.v1.SurgeryBookingService` (`BookEmergencySurgery`, unary). `grpc-invoke` waits about 220 ms and returns a fixed `0 OK` reply: a certificate verification result for `VerifyCertificate` and a surgery booking for every other method, including the streaming one. The endpoint and metadata are ignored, and there is no streaming, reflection or TLS handling.

## What you can do

- Pick a method. Its sample request payload fills the editor, and you can change it.
- Click **Invoke RPC** (`Ctrl+Enter`) to see the sample response, the status line (for example "0 OK (220ms)") and fake response headers.

Nothing is configured or saved.

```bash
electron packages/grpc-client
```

Source: [`packages/grpc-client`](https://github.com/nddipiazza/robos/tree/main/packages/grpc-client). For REST calls see [REST API Client]({{ '/apps/rest-client/' | relative_url }}).
