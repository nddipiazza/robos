---
title: "RobOS Documentation"
package: robos-documentation
category: arch-planning
icon: robos-documentation.svg
summary: "Living documentation hub, selective KGraph asset discovery, persistent artifact maintainer, and static site exporter."
related:
  - /schemas/documentation/documentation.html
  - /system-documentation/
---

**RobOS Documentation** (`packages/robos-documentation`) is the official documentation application for the RobOS platform. Operating directly atop the Dual-State Knowledge Graph, it discovers architectural assets that deserve documentation, tracks coverage, maintains living documentation in persistent repository markdown artifacts backed by declarative GitOps (`.robos/documentation.yaml`), and exports static, responsive GitHub Pages documentation for publication to `rowbose.com`.

![RobOS Documentation Architecture]({{ '/assets/images/architecture/robos-documentation-architecture.jpg' | relative_url }})

