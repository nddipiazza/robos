'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { launchApp, killApp } = require('../../lib/harness');
const { evalJS, evalClick } = require('../../lib/snapshot');
const scenarios = require('../../lib/scenarios');

describe('Entity Schema Studio & Registry (TypeSpec / JSON Schema / Buf) Tests with In-Depth Assertions', () => {
  it('launches Schema Studio GUI, switches multi-language targets, switches models, and compiles targets', async () => {
    const app = await launchApp('schema-studio', {
      ...scenarios['all-good'],
      env: { ROBOS_TEST: '1', ROBOS_DEMO_SHOW: '1' },
    });

    try {
      assert.ok(app.port, 'schema-studio debug port should be allocated');

      // 1. Initial State
      const text = await evalJS(app.port, 'document.body.textContent');
      assert.ok(text.includes('Entity Schema Studio & Code Generator'), 'Should render title');
      assert.ok(text.includes('form.typespec'), 'Should render form.typespec entity');
      assert.ok(text.includes('model DynamicForm'), 'Should render TypeSpec model');

      // 2. Switch to Java 21 Target Tab
      await evalClick(app.port, '#target-tab-java');
      await new Promise(r => setTimeout(r, 400));
      const javaCode = await evalJS(app.port, `document.getElementById('compiled-target-pre').textContent`);
      assert.ok(javaCode.includes('public record DynamicForm'), 'Should render Java 21 Record DTO');
      assert.ok(javaCode.includes('public record FormStep'), 'Should render nested Record');

      // 3. Switch to TypeScript Target Tab
      await evalClick(app.port, '#target-tab-ts');
      await new Promise(r => setTimeout(r, 400));
      const tsCode = await evalJS(app.port, `document.getElementById('compiled-target-pre').textContent`);
      assert.ok(tsCode.includes('DynamicFormSchema = z.object'), 'Should render Zod Schema');

      // 4. Switch Entity to user.typespec
      await evalClick(app.port, '#entity-item-user_typespec');
      await new Promise(r => setTimeout(r, 400));
      const userText = await evalJS(app.port, 'document.body.textContent');
      assert.ok(userText.includes('User Account Model'), 'Should switch to User model');
      assert.ok(userText.includes('model User'), 'Should render User TypeSpec');

      // 5. Switch GitOps Branch to feature/TAX-1099-ein-verification
      await evalJS(app.port, `window.switchGitBranch('feature/TAX-1099-ein-verification')`);
      await new Promise(r => setTimeout(r, 400));
      const commitBadge = await evalJS(app.port, `document.getElementById('git-commit-badge').textContent`);
      assert.ok(commitBadge.includes('d4e5f6a'), 'Should update Git commit badge');

      // 6. Compile All Targets
      const compileRes = await evalJS(app.port, 'window.compileAllTargets()');
      assert.strictEqual(compileRes.ok, true);
      assert.ok(compileRes.targetsCompiled.includes('TypeScript'));

      // 7. Detect Breaking Changes
      const auditRes = await evalJS(app.port, 'window.detectBreakingChanges()');
      assert.strictEqual(auditRes.ok, true);
      assert.strictEqual(auditRes.isBackwardCompatible, true);
    } finally {
      await killApp(app);
    }
  });
});
