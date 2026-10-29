---
name: robos-blog
description: Write and publish a new Engineering Blog post (/blog, /robos-blog) as its own page in site/_blog/<slug>.html with E2E screenshots or videos, reproducible CLI commands, documentation links, and commit references.
---

# RobOS Engineering Blog Skill (`robos-blog` / `/blog`)

Use this skill whenever the user invokes `/blog`, `/robos-blog`, or asks to blog about a completed feature, architecture update, or E2E verification in the RobOS Engineering Blog (published at `https://rowbose.com/blog/`).

Each post is one file, `site/_blog/<slug>.html`, published at `https://rowbose.com/blog/<slug>/`. The `/blog/` index (`site/blog/index.html`), its jump links, and each post's newer/older links are generated from the posts' front matter, newest `date` first. Do not edit the index to add a post.

## Input

`$ARGUMENTS` — `<slug> "<title>"` or a description of the feature/release to document on `/blog/`.

## Procedure

1. **Capture & Prepare Visual Evidence**:
   - Capture real E2E screenshots (via `node packages/robos-lib/snapshot-cli.js <app-id> --screenshot > site/assets/blog/<slug>/<name>.png` or HTTP `GET http://127.0.0.1:<port>/screenshot`) or recorded walkthrough videos and store them under `site/assets/blog/<slug>/` (or `site/assets/<section>/`).
   - Verify the captured images visually using `read_file` to ensure the UI is crisp, populated with real data, and free of blank states.

2. **Create `site/_blog/<slug>.html`**:
   - The file name is the URL slug (lowercase, hyphens). Front matter holds everything the index shows; the body is the post itself:
     ```html
     ---
     title: "Full Post Title"
     nav_label: "Short Label"
     date: YYYY-MM-DD
     date_label: "Mon DD, YYYY"
     tags:
       - "Tag 1"
       - "Tag 2"
       - "Tag 3"
     summary: "Concise executive summary of what changed, how it works, and what was verified."
     description: "The summary as plain text, for search results and link previews."
     og_image: /assets/blog/<slug>/hero.png
     og_image_alt: "Descriptive alt text"
     ---
     <div class="blog-body">
       <figure class="blog-fig">
         <img src="{{ '/assets/blog/<slug>/hero.png' | relative_url }}" alt="Descriptive alt text" loading="lazy">
         <figcaption>Detailed caption explaining the screenshot.</figcaption>
       </figure>
       <p><strong>Technical section heading.</strong> Detailed engineering narrative...</p>
       <div class="blog-fig-grid">
         <figure class="blog-fig"><img src="{{ '/assets/blog/<slug>/fig1.png' | relative_url }}" alt="..." loading="lazy"><figcaption>...</figcaption></figure>
         <figure class="blog-fig"><img src="{{ '/assets/blog/<slug>/fig2.png' | relative_url }}" alt="..." loading="lazy"><figcaption>...</figcaption></figure>
       </div>
       <div class="blog-log"># Reproducible CLI / IPC / test commands
     node --test ...</div>
     </div>
     <div class="blog-links">
       <a href="{{ '/v1/apps/<app-id>/' | relative_url }}">App docs →</a>
       <span class="blog-commits">Commits: <a href="https://github.com/nddipiazza/robos/commit/<sha>"><sha></a></span>
     </div>
     ```
   - `date` orders the posts. When two posts share a day, give the newer one a later time (`date: YYYY-MM-DD 13:00:00 +0000`). `date_label` is the text shown and may be a range (`Oct 12 – Oct 19, 2026`).
   - `summary` is HTML but is not run through Liquid: link with root-relative paths (`<a href="/config-management/">`), not `relative_url`. The body can use Liquid as usual.
   - Link to another post with `{{ '/blog/<slug>/' | relative_url }}`, never `/blog/#<slug>`.

3. **Commit & Push**:
   - Stage `site/_blog/<slug>.html` and `site/assets/blog/<slug>/`, commit with Conventional Commits (`docs(blog): ...`), and push to `origin <branch>`.

## Validation

- Verify `site/_blog/<slug>.html` has `title`, `date`, `date_label`, `summary` and `description` in its front matter.
- Verify all referenced image/video asset paths exist under `site/assets/`.
- `node scripts/check-install-docs.cjs <built site>` checks every post's page for its title, description and social preview tags.
