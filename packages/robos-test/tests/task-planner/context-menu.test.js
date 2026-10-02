'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');

// Exercise the actual renderer without a task server or Electron IPC.
test('feature context menu creates an epic in the chosen feature and dismisses cleanly', async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
    const renderer = path.resolve(__dirname, '../../../task-planner/renderer');
    const html = fs.readFileSync(path.join(renderer, 'index.html'), 'utf8')
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    await page.setContent(html);
    await page.addStyleTag({ path: path.join(renderer, 'style.css') });
    await page.addScriptTag({ path: path.join(renderer, 'app.js') });
    await page.evaluate(() => {
      document.getElementById('main-content').style.display = 'flex';
      document.getElementById('project-metadata-card').style.display = 'block';
      document.getElementById('no-server').style.display = 'none';
      projectFeatures = [{ id: 'first', name: 'First feature', tasks: [] },
        { id: 'second', name: 'Second feature', tasks: [] }];
      switchFeature('first');
      addEpic();
      tasks[0].title = 'Existing epic';
    });
    const second = page.getByRole('button', { name: 'Second feature', exact: true });
    await second.click({ button: 'right' });
    assert.equal(await page.getByRole('menuitem', { name: 'Add epic' }).count(), 1);
    await page.getByRole('menuitem', { name: 'Add epic' }).click();
    assert.deepEqual(await page.evaluate(() => ({
      active: activeFeatureId, count: tasks.length, epic: tasks[0].isEpic,
      firstTitle: projectFeatures[0].tasks[0].title,
      focused: document.activeElement.className,
    })), { active: 'second', count: 1, epic: true, firstTitle: 'Existing epic', focused: 'task-title-input' });
    await page.evaluate(() => { switchFeature('first'); switchFeature('second'); });
    assert.equal(await page.evaluate(() => tasks.length), 1);
    await second.focus();
    await page.keyboard.press('Shift+F10');
    assert.equal(await page.getByRole('menu').count(), 1);
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('menu').count(), 0);
    assert.equal(await second.evaluate(el => el === document.activeElement), true);
    await second.click({ button: 'right' });
    await page.locator('.app-header h1').click();
    assert.equal(await page.getByRole('menu').count(), 0);
    assert.equal(await page.evaluate(() => tasks.length), 1);
    await second.evaluate(el => el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 1099, clientY: 799 })));
    const box = await page.getByRole('menu').boundingBox();
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 1100 && box.y + box.height <= 800, JSON.stringify(box));
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => tasks.length), 2);
  } finally {
    await browser.close();
  }
});
