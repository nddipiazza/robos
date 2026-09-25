---
name: add-ai-text-area-to-app
description: Add the standard <robos-ai-textarea> widget with auto-resize, streaming, and @mention file typeahead to a RobOS Electron app.
---

# Add AI Textarea to a RobOS App

Add the standard `<robos-ai-textarea>` widget to any RobOS Electron app.

## Core Rules & Principles

1. **Always Multi-Line**: `<robos-ai-textarea>` is **strictly a multi-line expandable input** (typically `min-height="100"` to `min-height="120"`). **Never use a single-line text input for AI prompts.** Prompts in RobOS require rich, multi-line architectural descriptions, acceptance criteria, and context.
2. **Adjacent Action Button**: The action button (`✦ Plan using AI Prompt`, `✦ Generate with AI`, etc.) is placed directly adjacent to or alongside the `<robos-ai-textarea>`.
3. **Starts Disabled**: The action button **must start disabled** (`disabled` attribute in HTML). It only enables once the developer enters non-empty text into the multi-line textarea.

The `<robos-ai-textarea>` component provides:
- Multi-line auto-resize, dark theme, streaming display
- `/slash` command palette (optional)
- `@mention` file typeahead (via search index)
- `Ctrl+Enter` submit shortcut
- Waiting spinner and stream overlay

The component lives in `packages/robos-ui/robos-ui.js`. All apps load it at runtime from `/usr/local/share/robos/robos-ui/robos-ui.js`.

## Reference implementation

`packages/task-planner/` is the canonical reference. Study it before adding to a new app.

---

## Step 1 — HTML (`renderer/index.html`)

**Add the script tag** (before `app.js`):
```html
<script src="/usr/local/share/robos/robos-ui/robos-ui.js"></script>
<script src="app.js"></script>
```

**Replace any existing textarea/input with:**
```html
<robos-ai-textarea
  id="prompt-input"
  show-submit="false"
  show-commands="false"
  placeholder="e.g. Describe your task…"
  min-height="100">
</robos-ai-textarea>
```

### Attributes

| Attribute | Default | Description |
|-----------|---------|-------------|
| `show-submit` | `"true"` | Show built-in Submit button inside the component |
| `show-commands` | `"true"` | Show `/slash` command palette |
| `placeholder` | *(generic)* | Placeholder text |
| `min-height` | `"0"` | Minimum height in pixels for the editable area |
| `max-chars` | `"0"` | Max character limit (0 = unlimited) |

**Typical SDLC app config:** `show-submit="false" show-commands="false"` with a separate submit button.

---

## Step 2 — Preload (`preload.js`)

Expose the search index call so `@mention` file typeahead works:
```javascript
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('robos', {
  // … existing methods …
  searchIndex: (prefix) => ipcRenderer.invoke('<app-prefix>-list-path', prefix),
});
```

Replace `<app-prefix>` with a short unique prefix for the app (e.g. `tp` for task-planner, `ap` for ai-prompt, `gp` for git-projects).

---

## Step 3 — Main process (`main.js`)

Add the `<app-prefix>-list-path` IPC handler for `@mention` typeahead:

```javascript
// ── <app-prefix>-list-path: @-mention file typeahead for robos-ai-textarea ──────
ipcMain.handle('<app-prefix>-list-path', (_, prefix) => {
  try {
    const home     = os.homedir();
    const expanded = prefix.replace(/^~/, home);
    const isDir    = expanded.endsWith('/');
    const dir      = isDir ? expanded : path.dirname(expanded);
    const partial  = isDir ? '' : path.basename(expanded);
    const isRecursive = partial && !expanded.slice(home.length + 1).includes('/');
    if (isRecursive) {
      const INDEX_DIR = path.join(home, '.config', 'robos', 'search-index');
      let items = [];
      if (fs.existsSync(INDEX_DIR)) {
        const indexFiles = fs.readdirSync(INDEX_DIR).filter(f => f.endsWith('.txt'));
        const seen = new Set();
        for (const indexFile of indexFiles) {
          const fp = path.join(INDEX_DIR, indexFile);
          const lines = fs.readFileSync(fp, 'utf8').split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || seen.has(trimmed)) continue;
            const bn = path.basename(trimmed).toLowerCase();
            if (!bn.includes(partial.toLowerCase())) continue;
            seen.add(trimmed);
            items.push({ name: path.basename(trimmed), path: trimmed });
            if (items.length >= 12) break;
          }
          if (items.length >= 12) break;
        }
      }
      return { ok: true, items };
    }
    if (!fs.existsSync(dir)) return { ok: true, items: [] };
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const items = entries
      .filter(e => !partial || e.name.toLowerCase().startsWith(partial.toLowerCase()))
      .slice(0, 12)
      .map(e => ({
        name: e.name + (e.isDirectory() ? '/' : ''),
        path: path.join(dir, e.name) + (e.isDirectory() ? '/' : ''),
      }));
    return { ok: true, items };
  } catch { return { ok: true, items: [] }; }
});
```

---

### Get/set value & dynamic button state
The AI Action / Plan button placed adjacent to `<robos-ai-textarea>` **must start disabled** (`disabled` attribute in HTML). It should only enable when non-empty text is typed into the textarea.

```javascript
const promptEl = document.getElementById('prompt-input');
const genBtn   = document.getElementById('btn-generate');

function updateButtonState() {
  const val = (promptEl.value || '').trim();
  if (genBtn) genBtn.disabled = !val;
}

promptEl.addEventListener('input', updateButtonState);
promptEl.addEventListener('change', updateButtonState);
promptEl.addEventListener('keyup', updateButtonState);
```

### Wire Ctrl+Enter submit
```javascript
promptEl.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    const val = (promptEl.value || '').trim();
    if (val) handleSubmit();
  }
});
```

### Wire @mention file typeahead
```javascript
if (typeof customElements !== 'undefined') {
  customElements.whenDefined('robos-ai-textarea').then(() => {
    const promptEl = document.getElementById('prompt-input');
    if (promptEl && promptEl.addEventListener) {
      promptEl.addEventListener('robos-path-query', async (e) => {
        try {
          const r = await window.robos.searchIndex(e.detail.query);
          if (r && r.ok && promptEl._showMentions) promptEl._showMentions(r.items);
        } catch (_) {}
      });
    }
  }).catch(() => {});
}
```

---

## Validation checklist

- [ ] `robos-ui.js` script tag appears before `app.js` in `index.html`
- [ ] `<robos-ai-textarea>` replaces any plain `<textarea>` or `<input type="text">` used for AI
- [ ] The submit / plan button is placed directly adjacent to `<robos-ai-textarea>` and **starts `disabled`**
- [ ] Typing into `<robos-ai-textarea>` dynamically toggles the button's `disabled` state
- [ ] `searchIndex` exposed in `preload.js`
- [ ] `<app-prefix>-list-path` IPC handler added in `main.js`
- [ ] `robos-path-query` event wired in `renderer/app.js`
- [ ] `.value` used to get/set text
- [ ] `robos-ui` deployed to VM at `/usr/local/share/robos/robos-ui/`

