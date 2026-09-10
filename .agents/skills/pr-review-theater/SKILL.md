---
name: pr-review-theater
description: Inspect and orchestrate the full-featured PR Review Theater, verifying training knowledge checks, living documentation, in-app file diffs, and IDE branch comparisons.
---

# PR Review Theater & Interactive PR Validation

The **PR Review Theater** is the immersive review and verification stage in the RobOS Agent Code Review Platform (`packages/pr-review`). It orchestrates a 6-stage review experience combining:
1. **Interactive Training & eLearning**: PR-specific masterclass and knowledge checks with Certificate of Completion issuance.
2. **Living Documentation & Mermaid Flow Diagrams**: Architecture guides and sequence diagrams contrasting Production Reality against Proposed Reality.
3. **In-App File Diff Viewer**: Syntax-highlighted unified and side-by-side file diffs with line-by-line inspection.
4. **IDE Branch Diff Viewer Bridge**: Direct one-click branch compare and breakpoint runner for IntelliJ IDEA (port 63343 IPC / `idea diff`) and VS Code (`code --diff` / `vscode://` PR extension).
5. **Proof-of-Work Video Walkthrough**: 1080p narrated video player with chapter bookmarks and WebVTT subtitles.
6. **Validation Gates & Dual-Branch Merge**: Strict gating requiring eLearning quiz pass before merging Git code and Knowledge Graph branches simultaneously into `main`.

## When to Use

Use this skill whenever:
- Reviewing an autonomous AI pull request or developer feature branch.
- Validating that reviewers understand architectural and security implications prior to approving code changes.
- Comparing Git branches in IntelliJ IDEA or VS Code with synchronized breakpoints.
- Enforcing Dual-Branch merges (Git code + Knowledge Graph branches) backed by a verified Certificate of Completion.

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
console.log('File diffs count:', theaterCtx.fileDiffs.length);
console.log('IntelliJ branch command:', theaterCtx.ideBridge.intellij.cliCommand);

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
   - Complete the knowledge check quiz and view your verified credential.
   - Review the living architecture guide and Mermaid sequence flow.
   - Inspect unified and side-by-side code diffs.
   - Launch IDE branch diffs in IntelliJ IDEA or VS Code.
   - Inspect the 1080p proof-of-work video walkthrough.
   - Submit approval to merge both Git and Knowledge Graph branches into `main`.
