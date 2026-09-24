---
title: "RobOS App Wizard"
package: app-wizard
category: arch-planning
icon: app-wizard.svg
summary: "Greenfield scaffolding and brownfield codebase ingestion across multi-app archetypes."
---

Scaffold brand-new applications or import existing repositories across multi-app archetypes:
- **Supported Archetypes**: `robos:Microservice`, `robos:FrontEndApp` (`schema:WebApplication`), `robos:DesktopApp`, `robos:PCGame` (`schema:VideoGame`), `robos:MobileGame` (`schema:VideoGame`), `robos:ConsoleApp`, `robos:MobileApp`, `robos:DataPipeline`, and `robos:Library`.
- **Greenfield Scaffolding**: Automatically generates runnable `dev-setup.sh`, Spotify Backstage `catalog-info.yaml`, CI/CD pipelines, Spectral-linted API contracts, and dual-state Knowledge Graph registrations.
- **Brownfield Codebase Ingestion**: Automatically scans existing directories, infers tech stacks (`package.json`, `pom.xml`, `go.mod`, `Cargo.toml`, `pyproject.toml`), and maps components into `.robos/packages.yaml` without manual YAML editing.
- **Dedicated Guides**: [Develop a New App]({{ '/new-app-wizard.html' | relative_url }}) and [Import Existing Apps]({{ '/app-import-wizard.html' | relative_url }}).
![RobOS App Wizard]({{ '/assets/images/screenshots/new-app-archetypes_frame.png' | relative_url }})
