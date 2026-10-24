---
name: publish-blog-post
description: Write and publish a new Engineering Blog entry in site/blog/index.md with jump navigation, E2E screenshots or videos, reproducible CLI commands, documentation links, and commit references.
---

# Publish Engineering Blog Post

Add a new entry to the RobOS Engineering Blog (`site/blog/index.md`, published at `https://rowbose.com/blog/`) following the repository's newest-first structure, visual evidence standards, and link conventions.

## Input

`$ARGUMENTS` — `<slug> "<title>"` or a description of the feature/release to document on `/blog/`.

## Procedure

1. **Prepare Visual Evidence**:
   - Capture real E2E screenshots (via the DOM snapshot debug server `GET http://127.0.0.1:<port>/screenshot` or `packages/robos-lib/snapshot-cli.js`) or walkthrough videos and place them under `site/assets/blog/<slug>/` or the relevant `site/assets/<section>/` directory.
   - If including an architecture diagram, include both a clean technical diagram image and Mermaid syntax per RobOS documentation rules.

2. **Add Jump Link in `site/blog/index.md`**:
   - Insert `<a href="#<slug>"><Short Label></a>` as the first link inside `<nav class="blog-jump" aria-label="Jump to blog post">` in `site/blog/index.md`.

3. **Insert `<article class="blog-entry" id="<slug">` at the Top of `<div class="blog-feed">`**:
   - Include `<div class="blog-meta">` with `<time class="blog-date" datetime="YYYY-MM-DD">`, 3–4 `<span class="blog-tag">` pills, `<h2><a href="#<slug>">Title</a></h2>`, `<p class="blog-summary">`, `<div class="blog-body">` (with `<figure class="blog-fig">`, `<div class="blog-fig-grid">`, and `<div class="blog-log">` reproducible commands), and `<div class="blog-links">` linking to docs pages and GitHub commit hashes.

## Validation

- Verify `site/blog/index.md` contains the matching `#<slug>` anchor in both `.blog-jump` and `<article class="blog-entry" id="<slug">`.
- Verify all referenced image/video asset paths exist under `site/assets/`.
