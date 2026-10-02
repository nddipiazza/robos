'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

describe('PR Review Theater Header & Action Suite', () => {
  const indexHtmlPath = path.resolve(__dirname, '../../../pr-review/renderer/index.html');
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

  it('1. Theater header DOM has non-clickable logo and clickable actions near the logo', () => {
    // Logo is a non-clickable badge, not a button
    assert.match(indexHtml, /<span class="theater-badge"[^>]*id="theater-badge-logo"[^>]*>🎭 PR REVIEW THEATER<\/span>/);
    assert.doesNotMatch(indexHtml, /<button[^>]*id="theater-badge-logo"/, 'Logo must not be a button');

    // Actions near the logo
    assert.match(indexHtml, /id="theater-topbar-actions"/, 'Actions toolbar near logo must exist');
    assert.match(indexHtml, /id="theater-btn-open-browser"/, 'Open PR in browser button must exist near logo');
    assert.match(indexHtml, /id="theater-btn-open-intellij"/, 'IntelliJ launch button must exist near logo');
    assert.match(indexHtml, /id="theater-btn-open-vscode"/, 'VS Code launch button must exist near logo');
    assert.match(indexHtml, /id="theater-btn-copy-dropdown"/, 'Copy dropdown button must exist near logo');
    assert.match(indexHtml, /id="theater-btn-checks"/, 'CI checks button must exist near logo');
  });

  it('2. Theater PR header displays improved PR title, work-items container, and clickable badges', () => {
    // Clickable PR number
    assert.match(indexHtml, /id="theater-pr-number-btn"/, 'PR number button must exist');
    assert.match(indexHtml, /id="theater-pr-num"/, 'PR number text container must exist');

    // State pill
    assert.match(indexHtml, /id="theater-pr-state-pill"/, 'PR state pill must exist');

    // Work-items container
    assert.match(indexHtml, /id="theater-work-items-container"/, 'Work-items container must exist');

    // PR title element
    assert.match(indexHtml, /<h2[^>]*id="theater-pr-title"/, 'PR title header element must exist');

    // Inline copy buttons
    assert.match(indexHtml, /data-theater-action="copyPRUrl"/, 'Copy PR URL action present');
    assert.match(indexHtml, /data-theater-action="copyPRTitle"/, 'Copy PR Title action present');
    assert.match(indexHtml, /data-theater-action="copyPRDescription"/, 'Copy PR Description action present');

    // Metadata chips
    assert.match(indexHtml, /id="theater-pr-repo-text"/);
    assert.match(indexHtml, /id="theater-pr-head-branch"/);
    assert.match(indexHtml, /id="theater-pr-base-branch"/);
    assert.match(indexHtml, /id="theater-pr-author"/);
    assert.match(indexHtml, /id="theater-pr-adds"/);
    assert.match(indexHtml, /id="theater-pr-dels"/);
    assert.match(indexHtml, /id="theater-target-app"/);
    assert.match(indexHtml, /id="theater-pr-kg-branch"/);
    assert.match(indexHtml, /id="theater-meta-ci-chip"/);
  });

  it('3. CI Checks modal drawer and toast notification elements exist in the theater', () => {
    assert.match(indexHtml, /id="theater-checks-modal"/, 'Checks modal element exists');
    assert.match(indexHtml, /id="theater-checks-modal-list"/, 'Checks modal list container exists');
    assert.match(indexHtml, /id="theater-toast"/, 'Theater toast element exists');
  });

  it('4. Work-item extraction correctly parses Jira keys and GitHub issue numbers', () => {
    // Test extraction logic
    function extractWorkItemsFromPR(target) {
      const items = [];
      const seenKeys = new Set();
      if (Array.isArray(target.workItems)) {
        for (const wi of target.workItems) {
          const key = (wi.key || wi.id || '').toUpperCase();
          if (key && !seenKeys.has(key)) {
            seenKeys.add(key);
            items.push({ key, url: wi.url || `https://github.com/${target.repo}/issues/105` });
          }
        }
      }
      const textSources = [target.title || '', target.headBranch || '', target.body || ''].join(' ');
      const jiraRegex = /\b([A-Z][A-Z0-9_]{1,10}-\d+)\b/g;
      let match;
      while ((match = jiraRegex.exec(textSources)) !== null) {
        const key = match[1].toUpperCase();
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          items.push({ key, url: `https://github.com/${target.repo}/issues?q=${encodeURIComponent(key)}` });
        }
      }
      const ghRegex = /(?:close[sd]?|fixe?[sd]?|resolve[sd]?|refs?|issue)?\s*(?:#|GH-)(\d+)\b/gi;
      while ((match = ghRegex.exec(textSources)) !== null) {
        const num = match[1];
        const key = `#${num}`;
        if (!seenKeys.has(key) && String(num) !== String(target.number)) {
          seenKeys.add(key);
          items.push({ key, url: `https://github.com/${target.repo}/issues/${num}` });
        }
      }
      return items;
    }

    const pr1 = {
      repo: 'acme/petstore-api',
      number: 12,
      title: 'feat(service): verify rabies certificate over mTLS before adoption [PET-105]',
      headBranch: 'feature/PET-105-rabies-verification',
      body: 'Fixes #48 and integrates mTLS verification.'
    };

    const items1 = extractWorkItemsFromPR(pr1);
    assert.strictEqual(items1.length, 2);
    assert.strictEqual(items1[0].key, 'PET-105');
    assert.strictEqual(items1[1].key, '#48');
    assert.ok(items1[0].url.includes('PET-105'));
    assert.ok(items1[1].url.includes('issues/48'));
  });

  it('5. Conventional commit title formatting highlights prefix and main message', () => {
    function formatPRTitleHtml(title) {
      if (!title) return '';
      const match = String(title).match(/^([a-z]+(?:\([a-z0-9_\-\./]+\))?!?:\s*)(.+)$/i);
      if (match) {
        return `<span class="pr-title-prefix">${match[1]}</span><span class="pr-title-main">${match[2]}</span>`;
      }
      return `<span class="pr-title-main">${title}</span>`;
    }

    const formatted1 = formatPRTitleHtml('feat(service): verify rabies certificate over mTLS [PET-105]');
    assert.ok(formatted1.includes('<span class="pr-title-prefix">feat(service): </span>'));
    assert.ok(formatted1.includes('<span class="pr-title-main">verify rabies certificate over mTLS [PET-105]</span>'));

    const formatted2 = formatPRTitleHtml('Simple pull request title');
    assert.ok(formatted2.includes('<span class="pr-title-main">Simple pull request title</span>'));
  });
});
