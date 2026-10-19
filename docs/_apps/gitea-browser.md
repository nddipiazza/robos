---
title: "Gitea Browser"
package: gitea-browser
category: code-review
summary: "A static mock-up of a browser window showing a Gitea issues page, used as a prop in recorded demos. It is not a working browser."
description: "Gitea Browser loads one hardcoded HTML page that looks like a Chrome window on a Gitea issues list at localhost:3000. It does not connect to any Gitea server."
icon: gitea-browser.svg
---

Gitea Browser exists for the demo recordings in `packages/robos-test/demos`, such as the Acme Petshop task-creation demo. The test harness opens it so a recording can show "the issues now exist on the forge" without a real browser or Gitea instance.

{: .note }
Nothing in the window is live. The tab bar, the address `http://localhost:3000/robos/acme-petshop/issues`, the "Signed in as robos-tester" label, the six open issues (an epic and tasks such as "PET-101: PostgreSQL Database Schema & Migrations") and the counters are written directly into `renderer/index.html`. The buttons and links do nothing, there is no network access, and the preload script exposes only `appId`.

## Using it

```bash
electron packages/gitea-browser
```

The window is 1480 by 900 pixels, always on top, and titled "Google Chrome - robos/acme-petshop: Issues · Gitea" so that a screen recording reads like a browser. Only one instance runs at a time. To look at a real Gitea or GitHub repository, use your own browser or [Git Projects]({{ '/apps/git-projects/' | relative_url }}).

Source: [`packages/gitea-browser`](https://github.com/nddipiazza/robos/tree/main/packages/gitea-browser).
