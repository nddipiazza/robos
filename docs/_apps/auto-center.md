---
title: "RobOS Auto Center"
package: auto-center
category: auto
icon: auto-center.svg
summary: "Vehicle reference catalog, VIN decoding, garage and service history"
description: "Vehicle reference catalog, VIN decoding, garage and service history"
---


Auto Center starts the **RobOS Auto** family with a searchable KGraph catalog of public vehicle data, VIN decoding through NHTSA, and local vehicle/service records.

Use **Vehicle catalog** to filter makes, models, year/configurations, diagnostic codes and model-level safety reports. Select a record to inspect its properties and source row. **My garage & service** stores vehicles and maintenance history in your private local graph.

**Sources & imports** collects public sources under `~/.robos/auto-scrape` and prepares a validated graph proposal. Review the changes and failed downloads before applying it. The post-2010 recall archive is staged for later parsing; VIN-specific history, comprehensive repair procedures and parts fitment require additional sources.

The ontology includes parts, shop operations, registration, ownership and accident records as foundations for future workflows. These schemas do not imply those workflows are implemented. See the [source and coverage guide](https://github.com/nddipiazza/robos/blob/main/packages/auto-center/README.md) for setup and limitations.

![Auto Center showing real EPA configurations for a Toyota Camry](/assets/images/screenshots/auto-center-catalog.png)
