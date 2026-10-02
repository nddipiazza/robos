---
title: "CI Monitor"
package: ci-monitor
category: devops-cloud
icon: ci-monitor.svg
summary: "GitHub Actions and Buildkite builds, job results, and failure logs."
description: "GitHub Actions and Buildkite builds, job results, and failure logs."
---

Monitor GitHub Actions and Buildkite builds with actual job results and failure logs.
![CI Monitor]({{ '/assets/images/screenshots/acme-petshop-step6-ci_checks_frame.png' | relative_url }})


Select **Buildkite** in CI Monitor, then **Connection**. Enter the organization,
an optional pipeline, and the name of an existing `pass` entry. **Verify & save**
checks real API access before saving the connection. Only the credential reference
is stored in `~/.config/robos/ci-providers.json`; the token stays in `pass`.
The DevOps integration catalog uses the same Buildkite connection.

Buildkite runs show failed jobs, cleaned job logs, and links to the original job
and artifacts. Retry a Buildkite job from its Buildkite page; RobOS reads builds
and logs without automatically retrying them. The log summary uses pattern matching,
not an AI diagnosis. Missing permissions are reported explicitly.

In Code Review, Buildkite checks expand to their actual failed jobs. **Read failure**
opens job output inside CI recovery, and the repair agent receives the job details.
RobOS checks the build commit against the PR head before presenting those details.
Use a token with organization access and `read_builds` / `read_build_logs` scopes.
See [Buildkite REST API authentication](https://buildkite.com/docs/apis/rest-api).
