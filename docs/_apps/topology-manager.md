---
title: "System Topology Studio"
package: topology-manager
category: arch-planning
summary: "Visual C4 architecture canvas that reads your Backstage catalog and generates Kubernetes manifests."
---

A visual whiteboard for mapping your entire engineering architecture:
- **3-Level Visual Zoom**: Zoom from high-level personas (**Level 1: System Context**), down to microservices and databases (**Level 2: Containers**), to internal code modules (**Level 3: Components**).
- **Service Catalog Discovery**: Reads existing Spotify Backstage `catalog-info.yaml` files across Git repositories to automatically populate service ownership and dependencies.
- **Automatic Cloud Manifests**: Adding a new database or service to the canvas automatically creates ready-to-deploy Kubernetes YAML manifests and Helm charts.
![System Topology]({{ '/assets/images/screenshots/topology-db-c4_polyglot_frame.png' | relative_url }})
