---
title: "GraphQL Client & Explorer"
package: graphql-client
category: apis-testing
icon: graphql-client.svg
summary: "A GraphiQL-style window with a query editor, variables and response panes; it returns built-in sample data and never contacts the endpoint."
description: "GraphQL Client lays out an endpoint box, query and variables editors and a response view. The schema and results are hardcoded samples for a pet-shop API."
related:
  - /apps/rest-client/
---

GraphQL Client has the layout of a GraphQL explorer: an endpoint field (default `http://localhost:8443/graphql`), a **GraphQL Query / Mutation** editor, **Query Variables (JSON)**, a **Schema Documentation** panel and a **JSON Response** pane with a status line.

{: .important }
The request is not sent. `gql-execute` in `main.js` waits about 160 ms, then returns a fixed `pet` result (Luna, with a vaccination certificate) if the query text contains `pet(` or `allPets`, and `{"result": "SUCCESS"}` otherwise. The response also carries made-up `extensions` such as a serving pod name. `gql-introspect` returns a fixed sample schema (`Query`, `Mutation` and `Pet` types) rather than running an introspection query. The endpoint, headers and variables are ignored.

## What you can do

- Read the sample schema in **Schema Documentation**.
- Edit a query and click **Execute Query** (`Ctrl+Enter`) to see the sample response and its timing line.

There is nothing to configure and nothing is saved. For talking to a real GraphQL server today, use a tool such as `curl` or a dedicated GraphQL IDE; for REST calls see [REST API Client]({{ '/apps/rest-client/' | relative_url }}).

```bash
electron packages/graphql-client
```

Source: [`packages/graphql-client`](https://github.com/nddipiazza/robos/tree/main/packages/graphql-client).
