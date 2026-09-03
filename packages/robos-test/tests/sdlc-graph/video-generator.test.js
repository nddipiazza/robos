'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { WalkthroughVideoGenerator } = require('../../../robos-reviewer/index');

describe('Multi-Modal Narrated Video Walkthrough Generator Tests with In-Depth Assertions', () => {
  it('generates compliant WebVTT subtitle track and structured JSON metadata index', async () => {
    const generator = new WalkthroughVideoGenerator({ width: 1920, height: 1080, fps: 30 });

    const sampleCues = [
      {
        startMs: 0,
        endMs: 3500,
        narration: 'RobOS Autonomous EDD Runner executes strict Red-Green-Refactor development loops for AI agents.',
        callout: 'Open Autonomous EDD Studio',
        target: '#tab-btn-edd',
        action: 'click',
      },
      {
        startMs: 3500,
        endMs: 7000,
        narration: 'Phase 1: The agent verifies that the synthesized E2E test fails meaningfully before code is written.',
        callout: 'Verify Strict RED Failure Guard',
        target: '#step-row-red',
        action: 'hover',
      },
      {
        startMs: 7000,
        endMs: 11000,
        narration: 'Phase 2: The agent applies minimal microservice code modifications and contract stubs.',
        callout: 'Apply Minimal Implementation',
        target: '#step-row-impl',
        action: 'hover',
      },
    ];

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-gen-test-'));
    const res = generator.generateWalkthroughArtifacts(sampleCues, {
      slug: 'task-201-multi-step',
      title: 'TASK-201: Multi-Step Dynamic Form Submission',
      outDir: tmpDir,
      audio: false,
    });

    // 1. WebVTT Assertions
    assert.ok(res.vttContent.startsWith('WEBVTT - RobOS Automated Walkthrough'));
    assert.ok(res.vttContent.includes('00:00:00.000 --> 00:00:03.500'));
    assert.ok(res.vttContent.includes('00:00:07.000 --> 00:00:11.000'));
    assert.ok(res.vttContent.includes('Phase 1: The agent verifies that the synthesized E2E test fails'));

    // 2. JSON Metadata Assertions
    const meta = res.metadata;
    assert.strictEqual(meta.schemaVersion, '1.0.0');
    assert.strictEqual(meta.slug, 'task-201-multi-step');
    assert.strictEqual(meta.resolution.width, 1920);
    assert.strictEqual(meta.resolution.height, 1080);
    assert.strictEqual(meta.fps, 30);
    assert.strictEqual(meta.stepCount, 3);
    assert.strictEqual(meta.durationMs, 11000);
    assert.strictEqual(meta.chapters.length, 3);
    assert.strictEqual(meta.chapters[0].startTimecode, '00:00:00.000');
    assert.strictEqual(meta.chapters[0].endTimecode, '00:00:03.500');
    assert.strictEqual(meta.chapters[0].callout, 'Open Autonomous EDD Studio');

    // 3. File System Artifact Validation
    assert.ok(fs.existsSync(path.join(tmpDir, 'task-201-multi-step.vtt')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'task-201-multi-step.json')));

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
