---
name: pr-review-theater
description: Inspect and orchestrate the full-featured PR Review Theater, verifying training knowledge checks, living documentation, in-app file diffs, and IDE branch comparisons.
---

# PR Review Theater & Interactive PR Validation

The **PR Review Theater** is the immersive review and verification stage in the RobOS Agent Code Review Platform (`packages/pr-review`). Engineered to eliminate "rubber stamp" code reviews, it orchestrates an active, multi-modal verification experience across 6 stages:

1. **Anti-Rubber-Stamp Training & Knowledge Check**:
   - Mandatory interactive PR masterclass and knowledge checks with Certificate of Completion issuance.
   - **Gating**: Code diffs (Stage 3) and review approval (Stage 6) remain strictly locked until the reviewer scores &ge; 80% on the knowledge check.
   - Quick one-click launch to the application's comprehensive curriculum in the **RobOS eLearning Hub** (`packages/robos-elearning`).
2. **Living Documentation, Sequence Flows & Interactive REST API Verification**:
   - Living Architecture Guides and Mermaid sequence flows contrasting Production Reality against Proposed Reality.
   - **Interactive REST API Runner**: Inspect pre-populated endpoint parameters, headers (mTLS), and request payload. Send live requests with round-trip latency metrics, response previews, and OpenAPI 3.1 & Pact contract verification.
3. **In-App Semantic File Diff Viewer**:
   - Syntax-highlighted unified and side-by-side file diffs with line-by-line inspection (unlocked only after passing Stage 1).
4. **IDE Branch Diff Bridge & Interactive Breakpoint Runner**:
   - Direct one-click branch compare and breakpoint runner for IntelliJ IDEA (port 63343 IPC / `idea diff`) and VS Code (`code --diff` / `vscode://` PR extension).
   - **Interactive Breakpoint Debugger**: Start up the app with pre-set breakpoints at critical PR change lines (e.g. `VaccineGatewayClient.java:34`), inspect suspended thread call stacks and evaluated local variables (`this.sslContext`, `rootCaPath`, `petId`), and step through or resume execution.
5. **Dual-Mode Proof-of-Work Canvas**:
   - **Mode A: 1080p Recorded Xvfb Walkthrough Video**: Headless recording in virtual framebuffer with Piper neural TTS audio narration and synchronized WebVTT subtitle stream.
   - **Mode B: Live Desktop Session**: Execute the robot proof live on the reviewer's active workstation display (`DISPLAY=:0`), driving UI and API interactions in real time with live streaming telemetry.
6. **Validation Gates & Dual-Branch Merge**:
   - Strict gating requiring eLearning quiz pass before merging Git code and Knowledge Graph branches simultaneously into `main`.

## When to Use

Use this skill whenever:
- Reviewing an autonomous AI pull request or developer feature branch without blind diff reading or rubber stamping.
- Validating that reviewers genuinely understand architectural, contract, and security implications prior to approving code changes.
- Verifying endpoint behavior via live interactive REST requests directly from the review interface.
- Starting up the target application in IntelliJ IDEA or VS Code with synchronized breakpoints and suspended thread inspection.
- Choosing between a recorded 1080p video proof and watching the robot execute live on the current desktop display session.
- Enforcing Dual-Branch merges (Git code + Knowledge Graph branches) backed by an immutable Certificate of Completion.

## Programmatic Usage

```javascript
const { SDLCKnowledgeGraphStore } = require('/usr/local/share/robos/robos-graph');
const store = new SDLCKnowledgeGraphStore();

// 1. Generate full PR Review Theater context
const theaterCtx = store.generatePRReviewTheaterContext({
  repo: 'acme/petstore-api',
  prNumber: 12,
  title: 'feat(service): verify rabies certificate over mTLS [PET-105]',
  headBranch: 'feature/PET-105-rabies-verification',
  baseBranch: 'main'
});

console.log('eLearning course:', theaterCtx.elearning.course['dcterms:title']);
console.log('REST API endpoint:', theaterCtx.restCall.endpoint);
console.log('Breakpoint target:', theaterCtx.ideBridge.breakpointSession.breakpointTarget);
console.log('Desktop session display:', theaterCtx.desktopSession.display);

// 2. Verify Reviewer Knowledge Check & issue Certificate of Completion
const quizResult = store.verifyPRELearningQuiz({
  courseId: theaterCtx.elearning.course['@id'],
  answers: {
    'q1-mtls': 1,
    'q2-transaction': 2,
    'q3-kgraph-merge': 1
  },
  reviewerId: 'robos'
});

console.log('Passed:', quizResult.passed, 'Score:', quizResult.score);
console.log('Certificate hash:', quizResult.certificate['robos:verificationHash']);
```

## GUI Usage

1. Launch the **Agent Code Review Platform**:
   ```bash
   electron packages/pr-review
   ```
2. Select any Pull Request from the queue.
3. Click **"🎭 PR Review Theater"** in the header.
4. Progress through the 6 stages:
   - Complete the Stage 1 knowledge check quiz (score &ge;80%) to unlock code diff inspection and approval.
   - Review living architecture docs and send live test requests from the Interactive REST API panel.
   - Inspect unified and side-by-side code diffs in Stage 3.
   - Fire up breakpoints in IntelliJ IDEA or VS Code and inspect paused thread variables.
   - Choose between the 1080p video player or running the live proof in your current desktop session.
   - Submit approval to merge both Git and Knowledge Graph branches simultaneously into `main`.
