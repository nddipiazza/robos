---
layout: default
title: The future of software
permalink: /future/
description: "A proposal: solve each software task once, keep it in a shared catalog, and let a small AI on your own computer snap finished pieces together."
extra_css: /assets/future.css
og_image: /assets/future/og.png
---
<section class="hero future-hero">
  <div class="wrap">
    <a class="pill" href="{{ '/future/whitepaper/' | relative_url }}"><b>Whitepaper</b> · The Skill Commons, draft 2 →</a>
    <h1>Solve it once.<br><em>Reuse it everywhere.</em></h1>
    <p class="lead">Today, every new app asks a giant computer to rewrite things that were solved long ago. There is a better way: a shared catalog of finished building blocks, and a small AI on your own laptop that snaps them together.</p>
    <div class="cta">
      <a class="btn btn-accent" href="{{ '/future/whitepaper/' | relative_url }}">Read the whitepaper</a>
      <a class="btn btn-ghost" href="{{ '/future/skill-commons-whitepaper.pdf' | relative_url }}">⬇ Download the PDF</a>
    </div>
    <p class="sub">A proposal, not a product. <a href="#is-this-real">What exists today, and what doesn't →</a></p>
  </div>
</section>

<div class="fig-wide">
  <figure class="fig-card">
    <a href="{{ '/assets/future/commons-map.svg' | relative_url }}" target="_blank" rel="noopener"><img src="{{ '/assets/future/ai/commons-map.jpg' | relative_url }}" alt="The Skill Commons. People, AI agents and companies add skills through one gate: not already there, passes its tests, built and signed. A clinic reminder app is broken into smaller jobs and then into base tasks, which other apps reuse. A small AI model on your own computer searches a local copy of the catalog and your company's private knowledge and snaps the pieces together." width="1600" height="893"></a>
    <figcaption>The Skill Commons at a glance. Every job is broken down to base tasks, each built once and reused by every other app. <a href="{{ '/assets/future/commons-map.svg' | relative_url }}" target="_blank" rel="noopener">View exact schematic (SVG)</a>.</figcaption>
  </figure>
</div>

<section id="how">
  <div class="wrap">
    <p class="eyebrow">In plain words</p>
    <h2 class="h2">Four ideas, no jargon</h2>
    <p class="sec-p">Software is built from jobs: send a text, check a card number, convert a time zone. Almost every one of them has been done before, thousands of times. The Skill Commons stops us doing them over.</p>
    <div class="steps4">
      <div class="card"><span class="n">1</span><h3>Break it down</h3><p>Every job is split into smaller jobs, all the way down to base tasks that can't usefully be split further.</p></div>
      <div class="card"><span class="n">2</span><h3>Look before you build</h3><p>Before anything is made, search the catalog. If it already exists, reuse it. Nothing is redone.</p></div>
      <div class="card"><span class="n">3</span><h3>Build once, share with everyone</h3><p>If it truly doesn't exist, a person or an AI builds it once. It is tested, signed and compiled, then added for all.</p></div>
      <div class="card"><span class="n">4</span><h3>Snap it together at home</h3><p>A small AI on your own computer finds the pieces and connects them. Machines check that they fit.</p></div>
    </div>
  </div>
</section>

<div class="fig-wide">
  <figure class="fig-card">
    <a href="{{ '/assets/future/worked-example.svg' | relative_url }}" target="_blank" rel="noopener"><img src="{{ '/assets/future/ai/worked-example.jpg' | relative_url }}" alt="A worked example: text my patients the day before their appointment becomes four smaller jobs and seven base tasks. Five are reused from the commons, one from the clinic's private shelf, and one is built once and added." width="1600" height="893"></a>
    <figcaption>A worked example: assembling an appointment reminder app from four smaller jobs and seven base tasks. <a href="{{ '/assets/future/worked-example.svg' | relative_url }}" target="_blank" rel="noopener">View exact schematic (SVG)</a>.</figcaption>
  </figure>
</div>

<section class="alt">
  <div class="wrap">
    <div class="split">
      <div class="split-t">
        <p class="eyebrow">Why it matters</p>
        <h3>Less waste, better software, and it stays yours</h3>
        <ul class="ticks">
          <li><b>Less rework.</b> Solved problems stay solved. New effort goes to problems nobody has solved yet.</li>
          <li><b>Tested once, trusted everywhere.</b> A piece is checked carefully one time, then used by everyone.</li>
          <li><b>Runs on your own machine.</b> A small local model can assemble from the catalog, so ordinary work doesn't need a data center.</li>
          <li><b>Your knowledge stays private.</b> Your company's own pieces sit on a private shelf beside the shared one.</li>
          <li><b>Open to everyone.</b> People and AI add to the catalog through the same gate.</li>
        </ul>
      </div>
      <figure class="fig-card" style="margin:0">
        <a href="{{ '/assets/future/assembler-loop.svg' | relative_url }}" target="_blank" rel="noopener"><img src="{{ '/assets/future/ai/assembler-loop.jpg' | relative_url }}" alt="Five steps. You describe the job in plain language. The small model breaks it into smaller jobs and looks each one up, company knowledge first and then the catalog. Machines then check that the pieces fit and run each piece's own tests. If nothing matches, a person or an AI builds that one piece once, it passes the gate and joins the catalog, and the lookup runs again." width="1600" height="893"></a>
        <figcaption>The model proposes. Machines check. <a href="{{ '/assets/future/assembler-loop.svg' | relative_url }}" target="_blank" rel="noopener">View exact schematic (SVG)</a>.</figcaption>
      </figure>
    </div>
  </div>
</section>

<section id="is-this-real">
  <div class="wrap">
    <p class="eyebrow">Is this real?</p>
    <h2 class="h2">An honest status</h2>
    <p class="sec-p">This is a proposal. The catalog does not exist yet, and no consortium runs it. Most of the ideas are borrowed from systems that already work; what's untested is the combination.</p>
    <div class="honest">
      <div class="card"><h3><span class="tag-ok">Exists in RobOS</span></h3>
        <ul>
          <li>Skill files that tell AI agents how to do a task</li>
          <li>A knowledge graph of your systems, with validation</li>
          <li>A search bridge over that graph</li>
          <li>Disposable sandboxes and video proof for agent changes</li>
        </ul>
      </div>
      <div class="card"><h3><span class="tag-no">Not built yet</span></h3>
        <ul>
          <li>The shared catalog and its gate</li>
          <li>Compiling, signing and mirroring skills</li>
          <li>The small-model assembler</li>
          <li>Any governing body</li>
        </ul>
      </div>
    </div>
    <p class="sec-p" style="max-width:70ch">The whitepaper includes a plan for finding out whether the idea works, and says what would prove it wrong. We would rather find that out early.</p>
  </div>
</section>

<div class="fig-wide">
  <figure class="fig-card">
    <a href="{{ '/assets/future/skill-lifecycle.svg' | relative_url }}" target="_blank" rel="noopener"><img src="{{ '/assets/future/ai/skill-lifecycle.jpg' | relative_url }}" alt="How a skill enters the commons: propose, find a twin, check, build reproducibly, sign and log, share to mirrors. Duplicates link to the existing skill; failing tests go back." width="1600" height="893"></a>
    <figcaption>How a skill enters the commons: one gate, the same for people and AI. <a href="{{ '/assets/future/skill-lifecycle.svg' | relative_url }}" target="_blank" rel="noopener">View exact schematic (SVG)</a>.</figcaption>
  </figure>
</div>

<section class="alt">
  <div class="wrap">
    <p class="eyebrow">Questions</p>
    <h2 class="h2">What people ask first</h2>
    <div class="faq">
      <details><summary>Does this mean we won't need AI any more?</summary><p>No. New problems always need new work, and AI will help build the new pieces. What changes is that everyday assembly no longer needs a giant model. A small local one is enough, if the plan in the paper holds up.</p></details>
      <details><summary>Isn't this just a package manager?</summary><p>Package managers are the closest relative, and the paper credits them. They hand you whole libraries by name and language. The commons indexes single tasks by what they do, whatever language they were written in, and refuses to add one that already exists.</p></details>
      <details><summary>Who runs the catalog?</summary><p>Nobody yet. The paper proposes a neutral non-profit foundation, as other open infrastructure has. Anyone could also keep a full copy, so a company or country can keep working offline.</p></details>
      <details><summary>Can anyone add to it?</summary><p>Yes, people and AI agents, through one gate: it must not already exist, pass its tests, and be built and signed. No one is trusted or distrusted because of what wrote the code.</p></details>
      <details><summary>What stops someone sneaking in something harmful?</summary><p>Nothing makes a shared catalog completely safe. The paper describes layers: reproducible builds, signatures and a public log, stronger review for widely used pieces, and sandboxes that confine what each piece may do.</p></details>
      <details><summary>How can I help?</summary><p>Read the paper and tell us where it is wrong. Join the <a href="https://github.com/nddipiazza/robos/issues" target="_blank" rel="noopener" style="text-decoration:underline">discussion on GitHub</a>.</p></details>
    </div>
  </div>
</section>

<section class="final">
  <div class="wrap">
    <h2 class="h2">Read the full paper</h2>
    <p class="sec-p" style="margin-inline:auto">The evidence, the design, the limits, and a plan to test it.</p>
    <div class="cta" style="margin-top:26px">
      <a class="btn btn-accent" href="{{ '/future/whitepaper/' | relative_url }}">Read it online</a>
      <a class="btn btn-ghost" href="{{ '/future/skill-commons-whitepaper.pdf' | relative_url }}">⬇ Download the PDF</a>
    </div>
  </div>
</section>
