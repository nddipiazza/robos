---
title: "RobOS Reviewer"
package: robos-reviewer
category: "libraries"
component_type: component
permalink: /robos-reviewer/
redirect_from:
  - /apps/robos-reviewer/
summary: "Proof-of-work walkthrough video metadata, WebVTT caption builder, and chaptered review bundle generator."
description: "Shared Node.js library in packages/robos-reviewer (WalkthroughVideoGenerator) that builds WebVTT captions, timecoded chapter metadata, and proof-of-work video artifacts for Code Review Theater."
related:
  - /pr-review/
  - /code-review/
  - /robos-test/
---

`packages/robos-reviewer` provides the `WalkthroughVideoGenerator` helper used to assemble structured proof-of-work review artifacts for [Agent Code Review](/pr-review/) and the [Code Review Theater](/code-review/).

## Public API (`index.js` & `lib/video-generator.js`)

`index.js` exports `WalkthroughVideoGenerator`, which defaults to `1920×1080` at `30` fps and turns recorded E2E step cues (`startMs`, `endMs`, `narration`, `assertion`) into synchronized review metadata:

- **`formatTimecode(ms)`**: Formats millisecond offsets into standard `HH:MM:SS.mmm` cue timestamps.
- **`buildWebVTT(cues)`**: Produces a `WEBVTT - RobOS Automated Walkthrough` subtitle track so browser and Electron video players display step-by-step captions alongside recorded frames.
- **`buildMetadata(cues, options)`**: Emits chaptered JSON metadata (`stepIndex`, `title`, `startMs`, `endMs`, `durationMs`, `status`) consumed by the review timeline and step-jump controls.

## Integration

Headless walkthrough recordings in [`packages/robos-test`](/robos-test/) (`lib/recorder.js` and `lib/demo-runner.js`) pair captured Xvfb/FFmpeg video streams with `WalkthroughVideoGenerator` captions and metadata so reviewers can jump directly to any verified step inside [Agent Code Review](/pr-review/).

Source: [`packages/robos-reviewer`](https://github.com/nddipiazza/robos/tree/main/packages/robos-reviewer).
