---
layout: default
title: Contribute
permalink: /contribute/
description: Learn context engineering by contributing to RobOS, an open-source project built by people steering coding agents. Every merged pull request is public work you can point to.
og_image: /assets/build-apps/shots/review-4-walkthrough.jpg
og_image_alt: "Contributing to RobOS with recorded walkthrough evidence"
keywords: "contribute to RobOS, open-source AI project, context engineering internship, coding agents, pull requests"
---
<section class="hero">
  <div class="wrap">
    <a class="pill" href="https://discord.gg/6PjxzkHujE" target="_blank" rel="noopener"><b>Open to everyone</b> · Say hello in Discord and we'll help you pick a task →</a>
    <h1>Intern in <em>context engineering</em>. Build public software.</h1>
    <p class="lead">RobOS is built by people steering coding agents. Contributing here means learning to brief an agent, give it the right knowledge, and prove what it did, on a real Apache-2.0 codebase where every merged pull request carries your name.</p>
    <div class="cta">
      <a class="btn" href="https://github.com/nddipiazza/robos/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener">Read the contributor guide</a>
      <a class="btn btn-ghost" href="https://discord.gg/6PjxzkHujE" target="_blank" rel="noopener">Join the Discord</a>
    </div>
    <p class="sub">No application, no fixed dates. Go at your own pace.</p>
  </div>
</section>

<section class="alt" id="why">
  <div class="wrap">
    <p class="eyebrow">Why intern here</p>
    <h2 class="h2">The whole project is a context-engineering exercise</h2>
    <p class="sec-p">Context engineering is deciding what an agent knows, when it knows it, and how you check its work. Most people learn it on private projects nobody else sees. In RobOS the instructions, skills, knowledge graph and specs are all in the open, and improving them is the work.</p>
    <div class="grid3">
      <div class="card"><div class="ic">🌐</div><h3>Your work is public</h3><p>Commits, reviews and discussions live on GitHub under your name. A merged PR is a better reference than a certificate.</p></div>
      <div class="card"><div class="ic">🧭</div><h3>Agents type, you think</h3><p>You aren't expected to hand-write every line. You frame the task, give the agent the right context, and prove the result. That's the skill teams hire for now.</p></div>
      <div class="card"><div class="ic">🎬</div><h3>Feedback is built in</h3><p>Every PR ships with test output and, for anything visible, a recorded walkthrough. Reviewers comment on how you scoped and verified the work, not just the diff.</p></div>
    </div>
  </div>
</section>

<section id="skills">
  <div class="wrap">
    <p class="eyebrow">What you'll practise</p>
    <h2 class="h2">Six skills, each with a home in the repo</h2>
    <table class="t">
      <thead><tr><th>Skill</th><th>Where you practise it</th></tr></thead>
      <tbody>
        <tr><td><b>Writing agent instructions</b></td><td><code>AGENTS.md</code> and the per-tool files. Tighten a rule and watch agents behave differently.</td></tr>
        <tr><td><b>Authoring skills</b></td><td><code>.agents/skills/</code>: short <code>SKILL.md</code> playbooks agents run, like <code>create-robos-app</code> and <code>kgraph-diff</code>.</td></tr>
        <tr><td><b>Modelling knowledge for agents</b></td><td><code>.robos/kgraphs/</code>: JSON-LD checked against SHACL shapes, so an agent gets only the slice it needs.</td></tr>
        <tr><td><b>Writing specs as prompt contracts</b></td><td><code>docs/ideas/specs/</code> and <code>docs/issues/reported/</code>: tasks any contributor's agent can pick up and finish.</td></tr>
        <tr><td><b>Verifying agent output</b></td><td>E2E tests, the headless container run and narrated recordings. Prove the work instead of trusting it.</td></tr>
        <tr><td><b>Reviewing agent pull requests</b></td><td>Read other contributors' PRs, check their evidence and leave useful comments.</td></tr>
      </tbody>
    </table>
  </div>
</section>

<section class="alt" id="tracks">
  <div class="wrap">
    <p class="eyebrow">Pick a track</p>
    <h2 class="h2">Choose a focus for your first few PRs</h2>
    <div class="grid3 grid2">
      <div class="card"><div class="ic">📜</div><h3>Instructions and skills</h3><p>Fix a skill agents misuse, or write one for a task you keep repeating. Start by running a skill end to end and fixing whatever confused the agent.</p></div>
      <div class="card"><div class="ic">🧬</div><h3>Knowledge graph</h3><p>Add or correct entities, validate them, and check the blast radius with <code>kgraph-diff</code>. Start with an app whose graph entry is out of date.</p></div>
      <div class="card"><div class="ic">📝</div><h3>Specs and issues</h3><p>Turn a bug or idea into a task another contributor's agent can run. Start by reproducing a reported issue and sharpening its steps.</p></div>
      <div class="card"><div class="ic">🖥️</div><h3>Apps and tests</h3><p>Fix a bug or build a feature in one of the Electron apps, with a test and a recording as proof. Start with an issue that touches one app.</p></div>
    </div>
  </div>
</section>

<section id="first-week">
  <div class="wrap">
    <p class="eyebrow">Your first week</p>
    <h2 class="h2">From clone to merged PR</h2>
    <ol class="flow">
      <li><b>Read the context</b><span>AGENTS.md, a few skills, one graph package</span></li>
      <li><b>Run something</b><span>Launch an app and the unit tests</span></li>
      <li><b>Say hello</b><span>Tell us your track in Discord</span></li>
      <li><b>Ship one small PR</b><span>A doc fix, a sharper skill, a graph node</span></li>
      <li><b>Fix what tripped you</b><span>Make it easier for the next person</span></li>
    </ol>
    <div style="margin-top:44px;max-width:760px">
      <pre class="code"><button data-copy>Copy</button><code>git clone https://github.com/nddipiazza/robos.git
cd robos
electron packages/dev-central
cd packages/robos-test &amp;&amp; npm install &amp;&amp; npm run test:unit</code></pre>
      <p class="muted small">Needs Node.js 20+ and a coding agent. Docker is used for the headless test run. Each package has its own dependencies; there's no root <code>package.json</code>.</p>
    </div>
  </div>
</section>

<section class="alt" id="flow">
  <div class="wrap">
    <p class="eyebrow">How a contribution flows</p>
    <h2 class="h2">You steer, the agent builds, the evidence decides</h2>
    <ol class="flow">
      <li><b>Pick a task</b><span>An issue, a spec, or your own idea written up</span></li>
      <li><b>Brief the agent</b><span>AGENTS.md, the spec and the right skills</span></li>
      <li><b>Implement</b><span>On a feature branch, with you reading along</span></li>
      <li><b>Prove it</b><span>Tests plus a recorded walkthrough</span></li>
      <li><b>Open a PR</b><span>Evidence attached, and a note on how you briefed the agent</span></li>
    </ol>
    <p class="sec-p">The contributor guide has copy-paste prompts for fixing an issue, implementing a spec, creating an app, improving a skill and updating the knowledge graph, along with the conventions reviewers check.</p>
    <p style="margin-top:18px"><a style="color:var(--accent);font-weight:600" href="https://github.com/nddipiazza/robos/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener">Open the full contributor guide →</a></p>
  </div>
</section>

<section class="final">
  <div class="wrap">
    <h2 class="h2">Learn context engineering where everyone can see the work.</h2>
    <div class="cta" style="margin-top:30px">
      <a class="btn btn-accent" href="https://discord.gg/6PjxzkHujE" target="_blank" rel="noopener">Find a starter task in Discord</a>
      <a class="btn btn-ghost" href="https://github.com/nddipiazza/robos/tree/main/docs/issues/reported" target="_blank" rel="noopener">Browse open issues</a>
    </div>
  </div>
</section>
