---
name: publish-blog-post
description: Write and publish a new Engineering Blog post as its own page in site/_blog/<slug>.html with E2E screenshots or videos, reproducible CLI commands, documentation links, and commit references.
---

# Publish Engineering Blog Post

Add a new post to the RobOS Engineering Blog (published at `https://rowbose.com/blog/`) following the repository's post format, visual evidence standards, and link conventions. Each post is its own page, `site/_blog/<slug>.html`, published at `https://rowbose.com/blog/<slug>/`; the `/blog/` index lists posts newest first from their front matter.

## Input

`$ARGUMENTS` — `<slug> "<title>"` or a description of the feature/release to document on `/blog/`.

## Procedure

1. **Prepare Visual Evidence**:
   - Capture real E2E screenshots (via the DOM snapshot debug server `GET http://127.0.0.1:<port>/screenshot` or `packages/robos-lib/snapshot-cli.js`) or walkthrough videos and place them under `site/assets/blog/<slug>/` or the relevant `site/assets/<section>/` directory.
   - If including an architecture diagram, include both a clean technical diagram image and Mermaid syntax per RobOS documentation rules.

2. **Create `site/_blog/<slug>.html`**:
   - Front matter: `title`, `nav_label` (short label for the index's jump links), `date` (`YYYY-MM-DD`; it orders the posts, so add a time such as `13:00:00 +0000` to put a post above another from the same day), `date_label` (displayed text, may be a range), 3–4 `tags`, `summary` (HTML without Liquid; use root-relative links), `description` (the summary as plain text), and `og_image` / `og_image_alt` for link previews.
   - Body: `<div class="blog-body">` (with `<figure class="blog-fig">`, `<div class="blog-fig-grid">`, and `<div class="blog-log">` reproducible commands), then `<div class="blog-links">` linking to docs pages and GitHub commit hashes. Copy the structure of an existing post in `site/_blog/`.
   - Link to other posts as `{{ '/blog/<slug>/' | relative_url }}`, not `/blog/#<slug>`.

## Validation

- Verify the post's front matter has `title`, `date`, `date_label`, `summary` and `description`.
- Verify all referenced image/video asset paths exist under `site/assets/`.
