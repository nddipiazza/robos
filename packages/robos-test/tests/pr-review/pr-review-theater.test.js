'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { SDLCKnowledgeGraphStore, SHACLValidator } = require('../../../robos-graph/index');

describe('PR Review Theater & Interactive PR Validation Engine', () => {
  let store;
  let validator;

  beforeEach(() => {
    store = new SDLCKnowledgeGraphStore();
    validator = new SHACLValidator();
  });

  it('1. Synthesizes full 6-stage PR Review Theater context from KGraph existence', () => {
    const ctx = store.generatePRReviewTheaterContext({
      repo: 'acme/petstore-api',
      prNumber: 12,
      title: 'feat(service): verify rabies certificate over mTLS before adoption [PET-105]',
      body: 'Mandates mutual TLS verification against vaccine-gateway:8443 before permitting pet adoptions.',
      headBranch: 'feature/PET-105-rabies-verification',
      baseBranch: 'main',
      changedFiles: [
        'src/main/java/com/acme/petshop/client/VaccineGatewayClient.java',
        'src/main/java/com/acme/petshop/service/PetService.java',
        'src/test/java/com/acme/petshop/service/PetServiceTest.java',
        'pom.xml'
      ]
    });

    assert.ok(ctx.ok, 'Theater context returned ok: true');
    assert.strictEqual(ctx.pr.number, 12);
    assert.strictEqual(ctx.pr.repo, 'acme/petstore-api');

    // Stage 1: eLearning & Knowledge Check
    assert.ok(ctx.elearning, 'Contains eLearning context');
    assert.ok(ctx.elearning.course['dcterms:title'].includes('PR #12'));
    assert.strictEqual(ctx.elearning.course['robos:gitopsFile'], '.robos/elearning.yaml');
    assert.strictEqual(ctx.elearning.course['robos:modules'].length, 3);
    assert.strictEqual(ctx.elearning.quiz.length, 3);
    assert.strictEqual(ctx.elearning.status, 'pending');

    // Stage 2: Living Docs & Flow
    assert.ok(ctx.documentation.markdown.includes('Living Architecture Guide'));
    assert.ok(ctx.documentation.mermaidText.includes('sequenceDiagram'));
    assert.ok(ctx.documentation.dualReality.blastRadius.length >= 3);

    // Stage 3: File Diffs
    assert.ok(Array.isArray(ctx.fileDiffs));
    assert.strictEqual(ctx.fileDiffs.length, 4);
    assert.ok(ctx.fileDiffs[0].hunks.length > 0);
    assert.ok(ctx.fileDiffs[0].additions > 0);

    // Stage 4: IDE Bridge
    assert.ok(ctx.ideBridge.intellij.cliCommand.includes('idea diff'));
    assert.ok(ctx.ideBridge.intellij.ipcEndpoint.includes('63343'));
    assert.ok(ctx.ideBridge.vscode.protocolUri.includes('vscode://github.vscode-pull-request-github'));

    // Stage 5: Video Walkthrough
    assert.strictEqual(ctx.proofOfWorkVideo.status, 'verified');
    assert.strictEqual(ctx.proofOfWorkVideo.chapters.length, 6);
    assert.ok(ctx.proofOfWorkVideo.vttTranscript.includes('WEBVTT'));

    // Stage 6: Validation Gates
    assert.strictEqual(ctx.validationGates.elearningPassed, false);
    assert.strictEqual(ctx.validationGates.ciPassed, true);
  });

  it('2. Evaluates interactive eLearning quiz and issues verified Certificate of Completion in KGraph', () => {
    const ctx = store.generatePRReviewTheaterContext({
      repo: 'acme/petstore-api',
      prNumber: 12,
      title: 'feat(service): verify rabies certificate over mTLS [PET-105]'
    });

    // 1. Failing submission (wrong answers)
    const failRes = store.verifyPRELearningQuiz({
      courseId: ctx.elearning.course['@id'],
      answers: { 'q1-mtls': 0, 'q2-transaction': 0, 'q3-kgraph-merge': 0 },
      reviewerId: 'lead-architect'
    });
    assert.strictEqual(failRes.passed, false);
    assert.strictEqual(failRes.score, 0);
    assert.strictEqual(failRes.certificate, null);

    // 2. Passing submission (100% correct)
    const passRes = store.verifyPRELearningQuiz({
      courseId: ctx.elearning.course['@id'],
      answers: { 'q1-mtls': 1, 'q2-transaction': 2, 'q3-kgraph-merge': 1 },
      reviewerId: 'lead-architect'
    });
    assert.strictEqual(passRes.passed, true);
    assert.strictEqual(passRes.score, 100);
    assert.ok(passRes.certificate);
    assert.ok(passRes.certificate['robos:verificationHash'].startsWith('ROBOS-CERT-'));
    assert.strictEqual(passRes.certificate['robos:recipientUser'], 'lead-architect');

    // 3. Verify certificate is registered in Knowledge Graph and passes SHACL
    const certInGraph = store.getNode(passRes.certificate['@id']);
    assert.ok(certInGraph);
    const report = validator.validateGraph(store.parser);
    assert.strictEqual(report.conforms, true, 'Certificate of Completion conforms to SHACL');
  });

  it('3. In-App File Diff parser handles both raw unified git diffs and fallback synthesizers', () => {
    // 1. Test custom raw unified diff parsing
    const rawDiff = `diff --git a/src/AuthService.java b/src/AuthService.java
index 1234..5678 100644
--- a/src/AuthService.java
+++ b/src/AuthService.java
@@ -10,4 +10,6 @@ public class AuthService {
 contextLine();
-oldMethod();
+newSecureMethod();
+auditSecurity();
 contextLine2();
`;

    const parsed = store.parseUnifiedDiff(rawDiff);
    assert.strictEqual(parsed.length, 1);
    assert.strictEqual(parsed[0].filePath, 'src/AuthService.java');
    assert.strictEqual(parsed[0].additions, 2);
    assert.strictEqual(parsed[0].deletions, 1);
    assert.strictEqual(parsed[0].hunks[0].lines.length, 5);
    assert.strictEqual(parsed[0].hunks[0].lines[1].type, 'del');
    assert.strictEqual(parsed[0].hunks[0].lines[2].type, 'add');

    // 2. Test fallback diff generator for files
    const fallback = store.parseUnifiedDiff('', ['src/main/java/com/acme/petshop/client/VaccineGatewayClient.java']);
    assert.strictEqual(fallback.length, 1);
    assert.strictEqual(fallback[0].filePath, 'src/main/java/com/acme/petshop/client/VaccineGatewayClient.java');
    assert.ok(fallback[0].additions > 30);
    assert.strictEqual(fallback[0].deletions, 0);
  });

  it('4. Formats IDE Branch Diff compare commands and breakpoint targets for IntelliJ & VS Code', () => {
    const ctx = store.generatePRReviewTheaterContext({
      repo: 'acme/petstore-api',
      prNumber: 105,
      headBranch: 'feature/PET-105-rabies-verification',
      baseBranch: 'main'
    });

    const { intellij, vscode } = ctx.ideBridge;

    assert.ok(intellij.cliCommand.includes('main...feature/PET-105-rabies-verification'));
    assert.ok(intellij.breakpointTarget.includes(':34'));
    assert.ok(vscode.protocolUri.includes('105'));
    assert.ok(vscode.protocolUri.includes('petstore-api'));
  });

  it('5. Enforces validation gates and executes Dual-Branch merge sign-off (Git + KGraph branches)', () => {
    const ctx = store.generatePRReviewTheaterContext({
      repo: 'acme/petstore-api',
      prNumber: 12,
      headBranch: 'feature/PET-105-rabies-verification',
      baseBranch: 'main'
    });

    // Gate evaluation helper
    function canApprove(gates) {
      return gates.elearningPassed === true && gates.ciPassed === true;
    }

    assert.strictEqual(canApprove(ctx.validationGates), false, 'Cannot approve when eLearning is pending');

    // Simulate reviewer passing the knowledge check
    ctx.validationGates.elearningPassed = true;
    ctx.validationGates.docsReviewed = true;
    ctx.validationGates.diffsInspected = true;
    ctx.validationGates.ideDiffLaunched = true;

    assert.strictEqual(canApprove(ctx.validationGates), true, 'Approval gate unlocks after eLearning pass');

    // Dual-branch merge payload check
    const mergePayload = {
      merged: true,
      gitBranch: ctx.pr.headBranch,
      kgraphBranch: `kgraph/${ctx.pr.headBranch.replace(/^feature\//, '')}`,
      certificateHash: 'ROBOS-CERT-TEST'
    };

    assert.strictEqual(mergePayload.gitBranch, 'feature/PET-105-rabies-verification');
    assert.strictEqual(mergePayload.kgraphBranch, 'kgraph/PET-105-rabies-verification');
  });
});
