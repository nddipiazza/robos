/**
 * RobOS Work Item Hierarchy — Release → Epic → Story/Bug
 *
 * Each work item type has a default workflow and supports parent-child
 * relationships with progress rollup.
 */
'use strict';

const WORK_ITEM_TYPES = {
  release: {
    id: 'release',
    label: 'Release',
    icon: '🚀',
    allowedChildren: ['epic'],
    defaultWorkflow: ['planning', 'development', 'code_freeze', 'qa_staging', 'released'],
  },
  epic: {
    id: 'epic',
    label: 'Epic',
    icon: '⚡',
    allowedChildren: ['story', 'bug'],
    allowedParents: ['release'],
    defaultWorkflow: ['draft', 'ready', 'in_progress', 'done'],
  },
  story: {
    id: 'story',
    label: 'Story',
    icon: '📋',
    allowedChildren: [],
    allowedParents: ['epic'],
    defaultWorkflow: ['backlog', 'in_progress', 'in_review', 'approved', 'deploying', 'deployed'],
  },
  bug: {
    id: 'bug',
    label: 'Bug',
    icon: '🐛',
    allowedChildren: [],
    allowedParents: ['epic'],
    defaultWorkflow: ['triage', 'in_progress', 'in_review', 'approved', 'deploying', 'deployed'],
  },
};

/** Validate parent-child relationship */
function validateParentChild(parentType, childType) {
  const parentDef = WORK_ITEM_TYPES[parentType];
  if (!parentDef) return { ok: false, error: `Unknown parent type: ${parentType}` };
  if (!parentDef.allowedChildren.includes(childType)) {
    return { ok: false, error: `${parentDef.label} cannot contain ${childType}` };
  }
  return { ok: true };
}

/** Calculate progress rollup for a parent work item */
function calculateProgress(children) {
  if (!children || children.length === 0) return { total: 0, done: 0, percent: 0 };

  const total = children.length;
  const done = children.filter(c => {
    const status = (c.statusCategory || '').toLowerCase();
    return status === 'done' || status === 'deployed' || status === 'released';
  }).length;

  return {
    total,
    done,
    percent: Math.round((done / total) * 100),
    inProgress: children.filter(c => {
      const s = (c.statusCategory || '').toLowerCase();
      return s === 'indeterminate' || s === 'in_progress';
    }).length,
  };
}

/** Build a hierarchy tree from a flat list of work items */
function buildHierarchy(items) {
  const byKey = new Map();
  const roots = [];

  // Index all items
  for (const item of items) {
    byKey.set(item.key, { ...item, children: [] });
  }

  // Link children to parents
  for (const item of items) {
    const node = byKey.get(item.key);
    if (item.parent && byKey.has(item.parent.key)) {
      byKey.get(item.parent.key).children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Calculate progress for each parent
  for (const [, node] of byKey) {
    if (node.children.length > 0) {
      node.progress = calculateProgress(node.children);
    }
  }

  return roots;
}

/** Detect work item type from Jira issue type or GitHub labels */
function detectWorkItemType(issueType, labels = []) {
  const type = (issueType || '').toLowerCase();
  if (type === 'epic' || labels.some(l => l.toLowerCase() === 'epic')) return 'epic';
  if (type === 'bug' || labels.some(l => l.toLowerCase() === 'bug')) return 'bug';
  if (type === 'story' || type === 'user story' || type === 'task') return 'story';
  if (type.includes('release') || type.includes('version')) return 'release';
  return 'story'; // default
}

/** Map a status category to a done/in-progress/todo bucket */
function statusBucket(statusCategory) {
  const cat = (statusCategory || '').toLowerCase();
  if (['done', 'deployed', 'released', 'closed', 'resolved'].includes(cat)) return 'done';
  if (['indeterminate', 'in_progress', 'in_review', 'deploying'].includes(cat)) return 'in_progress';
  return 'todo';
}

module.exports = {
  WORK_ITEM_TYPES,
  validateParentChild,
  calculateProgress,
  buildHierarchy,
  detectWorkItemType,
  statusBucket,
};
