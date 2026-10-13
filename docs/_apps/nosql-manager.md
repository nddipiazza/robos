---
title: "NoSQL DB Manager"
package: nosql-manager
category: databases-streams
icon: nosql-manager.svg
summary: "A MongoDB and Redis studio prototype with a document grid and a Redis key table; it shows built-in sample data and does not connect to a server."
description: "NoSQL DB Manager lists two connection entries and shows sample MongoDB documents and Redis keys. Find Documents and the Redis command box return fixed results."
---

NoSQL DB Manager has the layout of a MongoDB Compass and RedisInsight style tool: a **NoSQL Clusters** list, a MongoDB view with a **Filter** box and **Find Documents** button, and a Redis view with a key table and a **CLI Command** box with **Execute**. The **Switch to Redis Cache** button toggles between the two views.

{: .important }
No MongoDB or Redis driver is used. The handlers in `main.js` ignore the connection, collection, filter and key pattern and return the same data every time: a handful of pet-shop sample documents, four sample Redis keys (`session:token:usr_991204` and so on) with fixed TTL values, and canned command results. The Redis box returns a fixed session JSON for a `GET session:token:usr_991204` command, `3540` for any `TTL`, and `OK` for everything else. TTL values do not count down.

## What is real

- The two starting connection entries ("Petshop Document Store (MongoDB 7)" at `127.0.0.1:27017` and "Fastify Session Cache (Redis 7)" at `127.0.0.1:6379`) are written to `~/.config/robos/nosql-connections.json` on first run. Their status "Connected" is preset, and a `keysCount` of 4280 is a constant.
- Connections stored in the SDLC knowledge graph (`SDLCKnowledgeGraphStore` in `packages/robos-graph`) are merged into the list at startup, and the saved entries are pushed back as NoSQL database nodes. The window itself has no form for adding a connection.

Run it with `electron packages/nosql-manager`; it needs no database or network. Source: [`packages/nosql-manager`](https://github.com/nddipiazza/robos/tree/main/packages/nosql-manager). For a catalog of data stores that is also stored in the knowledge graph, see [Data Sources Explorer]({{ '/apps/data-sources/' | relative_url }}).
