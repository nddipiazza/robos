---
title: "REST API Client & Runner"
package: rest-client
category: apis-testing
icon: rest-client.svg
summary: "Request editor and collection runner wired to a sample Acme Petshop collection on a local Kubernetes cluster. It is a demo built around that one scenario, not a general REST client yet."
description: "Sends HTTP requests from a built-in sample collection to a service on port 8443 and shows the response. Collections, the AI generator and the report buttons use fixed sample content."
---

REST API Client has the layout of a Bruno-style client: a collections tree, a request editor, a response pane and a collection runner. Today it works only for a demo scenario, the Acme Petshop services running on a local kind cluster. You cannot yet add your own collections or point it at an arbitrary base URL.

![REST Client showing the Acme Petshop collection and a POST request to the vaccine verification endpoint]({{ '/assets/images/screenshots/acme-petshop-step11-collections_tree_frame.png' | relative_url }}){: .robos-zoomable-img }

*The request editor with the sample collection on the left. The labelled overlays in this frame come from a recorded demo, not from the app.*

## What works

- **Request Editor.** Select a request from the **Acme Petshop API Collection** (create pet, verify rabies vaccine certificate, list available pets, submit adoption request, health check). Edit the method, URL, **Body (JSON)**, **Headers**, **Params** and the test text, and click **Send**. The response pane shows the status, time, size, body, headers and test results.
- **Collection Runner.** Switch with the **Collection Runner** button at the top, set Iterations and Delay, and click **Run Collection (5 Requests)**. It runs five fixed requests against `petstore-api`, `vaccine-gateway` and `petstore-infra` and fills a results matrix with status, latency and assertions.

![Collection Runner view with the Run Collection button and an empty results matrix]({{ '/assets/images/screenshots/acme-petshop-step12-runner_view_frame.png' | relative_url }}){: .robos-zoomable-img }

*The runner before a run: the five-request suite, the iteration and delay fields, and the empty test execution matrix.*

## Limits to know about

- **Fixed target.** Every request has `{% raw %}{{baseUrl}}{% endraw %}` replaced with `http://127.0.0.1:8443`, whichever environment you pick in the **Env** drop-down (the three environments are built in). Before sending, the app starts `kubectl port-forward svc/vaccine-gateway 8443:8443 -n acme-petshop-local` if nothing is listening on 8443, using `kubectl` from `~/.local/bin`. Without that cluster, requests fail with a network error, except one analytics request that returns a built-in sample answer.
- **Collections are built in.** They are defined in `main.js`. The `.bru` files under `packages/rest-client/collections/acme-petshop/` are not loaded by the app.
- **Tests are not Bruno scripts.** The "Tests / Assertions" text is shown but not executed. The app marks a request as passed if the HTTP status is below 400, with a few extra checks on fields such as `status` and `verified`.
- **Generate (.bru)** and the AI buttons return one fixed sample request regardless of your input. **Save & Commit to Git** writes a fixed template to `collections/acme-petshop/01-verify-rabies-vaccine.bru`, relative to the working directory, and does not commit. **Export Report** and **Publish Gate to PR #42** only change the button label.

## Run it

Launch from the app launcher, or run `npm start` in `packages/rest-client`.
