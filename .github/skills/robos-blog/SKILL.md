---
name: robos-blog
description: Write and publish a new Engineering Blog entry (/blog, /robos-blog) in site/blog/index.md with jump navigation, E2E screenshots or videos, reproducible CLI commands, documentation links, and commit references.
---

# RobOS Engineering Blog Skill (`robos-blog` / `/blog`)

Use this skill whenever the user invokes `/blog`, `/robos-blog`, or asks to blog about a completed feature, architecture update, or E2E verification in the RobOS Engineering Blog (`site/blog/index.md`, published at `https://rowbose.com/blog/`).

## Input

`$ARGUMENTS` — `<slug> "<title>"` or a description of the feature/release to document on `/blog/`.

## Procedure

1. **Capture & Prepare Visual Evidence**:
   - Capture real E2E screenshots (via `node packages/robos-lib/snapshot-cli.js <app-id> --screenshot > site/assets/blog/<slug>/<name>.png` or HTTP `GET http://127.0.0.1:<port>/screenshot`) or recorded walkthrough videos and store them under `site/assets/blog/<slug>/` (or `site/assets/<section>/`).
   - Verify the captured images visually using `read_file` to ensure the UI is crisp, populated with real data, and free of blank states.

2. **Add Jump Navigation Link in `site/blog/index.md`**:
   - Insert `<a href="#<slug>"><Short Label></a>` as the **first** link inside `<nav class="blog-jump" aria-label="Jump to blog post">` in `site/blog/index.md`.

3. **Insert `<article class="blog-entry" id="<slug">` at the Top of `<div class="blog-feed">`**:
   - Follow the newest-first HTML structure in `site/blog/index.md`:
     ```html
     <article class="blog-entry" id="<slug>">
       <div class="blog-meta">
         <time class="blog-date" datetime="YYYY-MM-DD">Mon DD, YYYY</time>
         <span class="blog-tag">Tag 1</span>
         <span class="blog-tag">Tag 2</span>
         <span class="blog-tag">Tag 3</span>
       </div>
       <h2><a href="#<slug>">Full Post Title</a></h2>
       <p class="blog-summary">Concise executive summary of what changed, how it works, and what was verified.</p>
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
     </article>
     ```

4. **Commit & Push**:
   - Stage `site/blog/index.md` and `site/assets/blog/<slug>/`, commit with Conventional Commits (`docs(blog): ...`), and push to `origin <branch>`.

## Validation

- Verify `site/blog/index.md` contains the matching `#<slug>` anchor in both `.blog-jump` and `<article class="blog-entry" id="<slug">`.
- Verify all referenced image/video asset paths exist under `site/assets/`.
