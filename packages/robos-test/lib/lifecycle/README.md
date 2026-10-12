# Review lifecycle demo

One task, from idea to merged PR, driven through the real RobOS apps and recorded.
It produces the hero video on the front page (`site/assets/hero/`).

| Step | App | What is real | What is a stand-in |
|---|---|---|---|
| 1 Task created | Task Explorer | the UI, issue creation flow | `gh` (stateful forge), the AI that drafts the tasks |
| 2 Task implemented | Task Implementer | the UI, the branch, commit, push, test run | the `claude` agent's narration |
| 3-6 Review, evidence, walkthrough, draft PR | PR Review Theater | the diff, the evidence (before/after runs of the code), PR creation flow | `gh`, the `codex` walkthrough agent's narration (it runs real commands) |
| 7-8 CI, ready | PR Review Theater | the CI banner, ready dialog | CI check results (set by the script) |
| 9 Reviewer approves | PR Review (reviewer mode) | the UI and the approve flow | `gh` |
| 10 Owner merges | PR Review Theater | the merged state | the merge itself (`gh pr merge` against the stand-in forge) |
| 11 Post-merge CI, follow-up | PR Review Theater, Task Explorer | the failing-CI banner, the follow-up task flow | CI result, the AI that drafts the follow-up |

The repository (`pawfinder-api`), its tests and the local "remote" are real git. The forge
(`bin/gh`), agents (`bin/claude`, `bin/codex`) and CI results are scripted so the run is
hermetic and repeatable.

```bash
# 1. Record (needs xvfb, ffmpeg, Electron in packages/robos-test/node_modules)
xvfb-run -a -s "-screen 0 1920x1080x24" node packages/robos-test/demos/review-lifecycle-hero-demo.js /tmp/hero
# 2. Cut dead time, add captions, encode MP4/WebM/poster/storyboard GIF
node packages/robos-test/lib/lifecycle/compose.js /tmp/hero /tmp/hero/out
# 3. Publish into the front site
node packages/robos-test/lib/lifecycle/publish-hero.js /tmp/hero/out
```

`HERO_SPEED` (default 1.7) sets how much the recording is sped up; `CHROME_BIN` points at a
Chromium used to render the caption bars.

Files: `world.js` (git fixture), `forge.js` + `pulls.js` (stateful GitHub), `plan.js` (scripted
task drafts), `evidence.js` (real before/after evidence bundle), `env.js` (scenarios),
`driver.js` (pointer, typing, recorder), `compose.js`, `publish-hero.js`.
