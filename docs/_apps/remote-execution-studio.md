---
title: "Remote Execution Studio"
package: remote-execution-studio
category: devops-cloud
icon: remote-execution-studio.svg
summary: "REAPI v2 distributed build control room, Bazel/Buck2 client synthesis, and Buildbarn management."
---

Eliminate the friction, operational overhead, and vendor lock-in of distributed build and caching infrastructure. Remote Execution Studio is a native developer OS control room built entirely on the open-source **Remote Execution API standard (REAPI v2)** (`build.bazel.remote.execution.v2`):
- **Zero-Friction Client Synthesis**: Push-button generation of production-ready `.bazelrc` and `.buckconfig` files targeting active cluster endpoints with remote caching, byte stream upload, and fine-grained concurrency control.
- **Live REAPI Endpoint Health Probes**: Real-time gRPC connectivity and latency checks against remote execution workers, Content Addressable Storage (CAS), and Action Cache (AC).
- **Modular Buildbarn & NativeLink Configuration**: Deep operational management of modular Go/Rust microservices (`bb-storage`, `bb-scheduler`, `bb-worker`, `bb-runner`, `bb-browser`) with zero vendor lock-in.
- **Knowledge Graph & SHACL Conformance**: First-class `robos:RemoteExecutionCluster` OSLC JSON-LD topology nodes with automated structural constraint validation.
- 👉 Read the complete guide: **[Remote Execution Studio & REAPI v2 Architecture]({{ site.baseurl }}{% link big-wins/remote-execution-studio.md %})** and **[E2E Walkthrough]({{ site.baseurl }}{% link walkthroughs.md %}#remote-execution-studio-distributed-reapi-v2-build-clusters--client-synthesis)**.

| REAPI Cluster Overview & Worker Pools | Live Endpoint Connectivity & Latency Probe |
|:---:|:---:|
| ![Cluster Overview]({{ '/assets/images/screenshots/re-studio-overview_frame.png' | relative_url }}) | ![Endpoint Health Probe]({{ '/assets/images/screenshots/re-studio-probe_frame.png' | relative_url }}) |

| Bazel Client Config Generator (`.bazelrc`) | Buck2 Client Config Generator (`.buckconfig`) |
|:---:|:---:|
| ![Bazel Config Generator]({{ '/assets/images/screenshots/re-studio-bazel_frame.png' | relative_url }}) | ![Buck2 Config Generator]({{ '/assets/images/screenshots/re-studio-buck2_frame.png' | relative_url }}) |

| Modular Buildbarn Microservice Specs (`bb-storage.json`) | Knowledge Graph & SHACL Validation Badge |
|:---:|:---:|
| ![Buildbarn Provider Config]({{ '/assets/images/screenshots/re-studio-buildbarn_frame.png' | relative_url }}) | ![Knowledge Graph SHACL Conformance]({{ '/assets/images/screenshots/re-studio-kgraph_frame.png' | relative_url }}) |
