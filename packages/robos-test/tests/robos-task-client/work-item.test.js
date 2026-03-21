'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { WORK_ITEM_TYPES, validateParentChild, calculateProgress, buildHierarchy, detectWorkItemType, statusBucket } =
  require(path.resolve(__dirname, '../../../robos-task-client/work-item'));

describe('Work Item Hierarchy', () => {
  describe('WORK_ITEM_TYPES', () => {
    it('defines release, epic, story, bug', () => {
      assert.ok(WORK_ITEM_TYPES.release);
      assert.ok(WORK_ITEM_TYPES.epic);
      assert.ok(WORK_ITEM_TYPES.story);
      assert.ok(WORK_ITEM_TYPES.bug);
    });

    it('release allows epic children', () => {
      assert.ok(WORK_ITEM_TYPES.release.allowedChildren.includes('epic'));
    });

    it('epic allows story and bug children', () => {
      assert.ok(WORK_ITEM_TYPES.epic.allowedChildren.includes('story'));
      assert.ok(WORK_ITEM_TYPES.epic.allowedChildren.includes('bug'));
    });

    it('story has no children', () => {
      assert.strictEqual(WORK_ITEM_TYPES.story.allowedChildren.length, 0);
    });
  });

  describe('validateParentChild', () => {
    it('allows release → epic', () => {
      assert.deepStrictEqual(validateParentChild('release', 'epic'), { ok: true });
    });

    it('allows epic → story', () => {
      assert.deepStrictEqual(validateParentChild('epic', 'story'), { ok: true });
    });

    it('allows epic → bug', () => {
      assert.deepStrictEqual(validateParentChild('epic', 'bug'), { ok: true });
    });

    it('rejects release → story (must go through epic)', () => {
      const result = validateParentChild('release', 'story');
      assert.strictEqual(result.ok, false);
      assert.ok(result.error.includes('cannot contain'));
    });

    it('rejects story → bug (leaf nodes have no children)', () => {
      const result = validateParentChild('story', 'bug');
      assert.strictEqual(result.ok, false);
    });

    it('rejects unknown parent type', () => {
      const result = validateParentChild('spike', 'story');
      assert.strictEqual(result.ok, false);
      assert.ok(result.error.includes('Unknown'));
    });
  });

  describe('calculateProgress', () => {
    it('returns 0% for empty children', () => {
      assert.deepStrictEqual(calculateProgress([]), { total: 0, done: 0, percent: 0 });
    });

    it('calculates correct percentages', () => {
      const result = calculateProgress([
        { statusCategory: 'done' },
        { statusCategory: 'done' },
        { statusCategory: 'indeterminate' },
        { statusCategory: 'new' },
      ]);
      assert.strictEqual(result.total, 4);
      assert.strictEqual(result.done, 2);
      assert.strictEqual(result.percent, 50);
      assert.strictEqual(result.inProgress, 1);
    });

    it('treats deployed as done', () => {
      const result = calculateProgress([
        { statusCategory: 'deployed' },
        { statusCategory: 'released' },
      ]);
      assert.strictEqual(result.done, 2);
      assert.strictEqual(result.percent, 100);
    });
  });

  describe('buildHierarchy', () => {
    it('groups children under parents', () => {
      const items = [
        { key: 'EPIC-1', summary: 'Epic 1', parent: null },
        { key: 'STORY-1', summary: 'Story 1', parent: { key: 'EPIC-1' } },
        { key: 'STORY-2', summary: 'Story 2', parent: { key: 'EPIC-1' } },
        { key: 'STORY-3', summary: 'Story 3', parent: null },
      ];
      const tree = buildHierarchy(items);
      assert.strictEqual(tree.length, 2); // EPIC-1 and STORY-3 are roots
      const epic = tree.find(n => n.key === 'EPIC-1');
      assert.strictEqual(epic.children.length, 2);
    });

    it('calculates progress on parents', () => {
      const items = [
        { key: 'E-1', parent: null },
        { key: 'S-1', parent: { key: 'E-1' }, statusCategory: 'done' },
        { key: 'S-2', parent: { key: 'E-1' }, statusCategory: 'indeterminate' },
      ];
      const tree = buildHierarchy(items);
      const epic = tree.find(n => n.key === 'E-1');
      assert.strictEqual(epic.progress.total, 2);
      assert.strictEqual(epic.progress.done, 1);
      assert.strictEqual(epic.progress.percent, 50);
    });

    it('handles flat list (no parents)', () => {
      const items = [{ key: 'A' }, { key: 'B' }];
      const tree = buildHierarchy(items);
      assert.strictEqual(tree.length, 2);
    });
  });

  describe('detectWorkItemType', () => {
    it('detects epic from issue type', () => {
      assert.strictEqual(detectWorkItemType('Epic'), 'epic');
    });

    it('detects bug from issue type', () => {
      assert.strictEqual(detectWorkItemType('Bug'), 'bug');
    });

    it('detects story from task type', () => {
      assert.strictEqual(detectWorkItemType('Task'), 'story');
    });

    it('detects epic from labels', () => {
      assert.strictEqual(detectWorkItemType('Issue', ['epic']), 'epic');
    });

    it('defaults to story for unknown types', () => {
      assert.strictEqual(detectWorkItemType('Custom'), 'story');
    });
  });

  describe('statusBucket', () => {
    it('maps done statuses', () => {
      assert.strictEqual(statusBucket('done'), 'done');
      assert.strictEqual(statusBucket('deployed'), 'done');
      assert.strictEqual(statusBucket('closed'), 'done');
    });

    it('maps in-progress statuses', () => {
      assert.strictEqual(statusBucket('indeterminate'), 'in_progress');
      assert.strictEqual(statusBucket('in_review'), 'in_progress');
      assert.strictEqual(statusBucket('deploying'), 'in_progress');
    });

    it('maps todo statuses', () => {
      assert.strictEqual(statusBucket('new'), 'todo');
      assert.strictEqual(statusBucket(''), 'todo');
      assert.strictEqual(statusBucket(undefined), 'todo');
    });
  });
});
