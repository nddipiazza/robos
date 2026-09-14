'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  KGraphPackageManager,
} = require('../../../robos-graph/index');
const { SHACLValidator, BUILTIN_SHACL_SHAPES } = require('../../../robos-graph/lib/shacl-validator');
const { resolveSchemaElement, CLASS_CODES, PREDICATE_CODES } = require('../../../robos-graph/lib/classification');
const PORT_REGISTRY = require('../../../robos-lib/snapshot-cli');
const { BUILTIN_APPS } = require('../../../robos-icons/index');

describe('RobOS Dev Discussions: Knowledge Graph Shapes, Classification & Application', () => {
  it('1. Built-in SHACL Shapes exist and conform for discussions, comments, and attachments', () => {
    const commentShape = BUILTIN_SHACL_SHAPES.find(s => s.shapeId === 'urn:robos:shape:CommentShape');
    assert.ok(commentShape, 'CommentShape must be registered');
    assert.strictEqual(commentShape.targetClass, 'robos:Comment');
    assert.strictEqual(commentShape.refersFrom, 'https://schema.org/Comment');

    const threadShape = BUILTIN_SHACL_SHAPES.find(s => s.shapeId === 'urn:robos:shape:DiscussionThreadShape');
    assert.ok(threadShape, 'DiscussionThreadShape must be registered');
    assert.strictEqual(threadShape.targetClass, 'robos:DiscussionThread');
    assert.strictEqual(threadShape.refersFrom, 'https://schema.org/Conversation');

    const reviewCommentShape = BUILTIN_SHACL_SHAPES.find(s => s.shapeId === 'urn:robos:shape:ReviewCommentShape');
    assert.ok(reviewCommentShape, 'ReviewCommentShape must be registered');
    assert.strictEqual(reviewCommentShape.targetClass, 'robos:ReviewComment');

    const attachmentShape = BUILTIN_SHACL_SHAPES.find(s => s.shapeId === 'urn:robos:shape:CommentAttachmentShape');
    assert.ok(attachmentShape, 'CommentAttachmentShape must be registered');
    assert.strictEqual(attachmentShape.targetClass, 'robos:CommentAttachment');
    assert.strictEqual(attachmentShape.refersFrom, 'https://schema.org/MediaObject');
  });

  it('2. SHACLValidator validates valid and detects invalid discussion nodes', () => {
    const validator = new SHACLValidator();

    // Valid Thread
    const validThread = {
      '@id': 'urn:robos:thread:petshop:pr42',
      '@type': ['robos:DiscussionThread'],
      'dcterms:title': 'PR #42: feat(vet): rabies check validation',
      'robos:associatedWorkItem': 'urn:robos:pull-request:42',
      'robos:threadType': 'pr-review',
    };
    const threadRes = validator.validate(validThread);
    assert.strictEqual(threadRes.conforms, true, 'Valid thread must conform');

    // Invalid Thread (missing dcterms:title)
    const invalidThread = {
      '@id': 'urn:robos:thread:petshop:bad',
      '@type': ['robos:DiscussionThread'],
      'robos:associatedWorkItem': 'urn:robos:pull-request:42',
      'robos:threadType': 'pr-review',
    };
    const invThreadRes = validator.validate(invalidThread);
    assert.strictEqual(invThreadRes.conforms, false, 'Invalid thread without title must fail');

    // Valid Comment
    const validComment = {
      '@id': 'urn:robos:comment:pr42:c1',
      '@type': ['robos:Comment'],
      'robos:content': 'Please verify booster window.',
      'robos:author': 'Sarah Chen',
      'robos:createdAt': '2026-09-14T12:00:00Z',
      'robos:parentItem': 'urn:robos:thread:petshop:pr42',
    };
    const commentRes = validator.validate(validComment);
    assert.strictEqual(commentRes.conforms, true, 'Valid comment must conform');

    // Valid ReviewComment
    const validReviewComment = {
      '@id': 'urn:robos:comment:pr42:rev1',
      '@type': ['robos:ReviewComment'],
      'robos:content': 'Circuit breaker needed on Redis call.',
      'robos:pullRequest': 'urn:robos:pull-request:42',
      'robos:filePath': 'controllers/vet.js',
    };
    const revRes = validator.validate(validReviewComment);
    assert.strictEqual(revRes.conforms, true, 'Valid review comment must conform');

    // Valid Attachment
    const validAttachment = {
      '@id': 'urn:robos:attachment:c1:spec',
      '@type': ['robos:CommentAttachment'],
      'dcterms:title': 'spec.pdf',
      'robos:fileUrl': 'https://acme.org/spec.pdf',
    };
    const attRes = validator.validate(validAttachment);
    assert.strictEqual(attRes.conforms, true, 'Valid attachment must conform');
  });

  it('3. SDLC Classification resolves discussion classes and predicates', () => {
    const commentClassification = resolveSchemaElement('robos:Comment');
    assert.ok(commentClassification.length > 0, 'robos:Comment must have classification');
    assert.strictEqual(commentClassification[0]['@id'], 'https://robos.dev/ns/sdlc#classification/work');

    const threadClassification = resolveSchemaElement('robos:DiscussionThread');
    assert.ok(threadClassification.length > 0, 'robos:DiscussionThread must have classification');
    assert.strictEqual(threadClassification[0]['@id'], 'https://robos.dev/ns/sdlc#classification/work');

    const revClassification = resolveSchemaElement('robos:ReviewComment');
    assert.ok(revClassification.length > 0, 'robos:ReviewComment must have classification');

    const attClassification = resolveSchemaElement('robos:CommentAttachment');
    assert.ok(attClassification.length > 0, 'robos:CommentAttachment must have classification');

    // Predicates
    assert.ok(PREDICATE_CODES['robos:commentId'], 'robos:commentId must be in PREDICATE_CODES');
    assert.ok(PREDICATE_CODES['robos:associatedWorkItem'], 'robos:associatedWorkItem must be in PREDICATE_CODES');
    assert.ok(PREDICATE_CODES['robos:filePath'], 'robos:filePath must be in PREDICATE_CODES');
    assert.ok(PREDICATE_CODES['robos:diffHunk'], 'robos:diffHunk must be in PREDICATE_CODES');
  });

  it('4. KGraphPackageManager infers organization package for discussion nodes', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-disc-pkg-'));
    const pkgMgr = new KGraphPackageManager({ rootDir: tmpDir });

    const threadNode = {
      '@id': 'urn:robos:thread:sample',
      '@type': ['robos:DiscussionThread'],
    };
    assert.strictEqual(pkgMgr.inferPackageForNode(threadNode), 'organization');

    const commentNode = {
      '@id': 'urn:robos:comment:sample',
      '@type': ['robos:Comment'],
    };
    assert.strictEqual(pkgMgr.inferPackageForNode(commentNode), 'organization');

    const revNode = {
      '@id': 'urn:robos:review:sample',
      '@type': ['robos:ReviewComment'],
    };
    assert.strictEqual(pkgMgr.inferPackageForNode(revNode), 'organization');
  });

  it('5. App is registered in BUILTIN_APPS and desktop file exists', () => {
    const registered = BUILTIN_APPS.find(a => a.appId === 'dev-discussions');
    assert.ok(registered, 'dev-discussions must be in BUILTIN_APPS');
    assert.strictEqual(registered.label, 'Dev Discussions');
    assert.strictEqual(registered.category, 'Development');
    assert.ok(registered.iconSvg.includes('<svg'), 'Icon must be valid SVG');

    const desktopFile = path.resolve(__dirname, '../../../../packages/dev-discussions/dev-discussions.desktop');
    assert.ok(fs.existsSync(desktopFile), 'Desktop entry file must exist');
    const content = fs.readFileSync(desktopFile, 'utf8');
    assert.ok(content.includes('X-RobOS-App=true'));
    assert.ok(content.includes('X-RobOS-Category=Dev'));
  });
});
