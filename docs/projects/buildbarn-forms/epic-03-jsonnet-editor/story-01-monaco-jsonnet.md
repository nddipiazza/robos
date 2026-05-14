# Story 03-01: Monaco Editor with Jsonnet Syntax Highlighting

**Epic:** [Jsonnet Editor](epic.md)
**Status:** Complete
**Points:** 5

## Description

Integrate `@monaco-editor/react` and register a custom Jsonnet language with syntax highlighting. The editor must feel like a proper IDE: colored tokens, bracket matching, line numbers, and a dark theme matching Hermetiq's design system.

## Acceptance Criteria

- [ ] Monaco editor renders in the left panel with correct dimensions
- [ ] Jsonnet language is registered with Monaco using `languages.register` and `languages.setMonarchTokensProvider`
- [ ] Keywords highlighted: `local`, `function`, `if`, `then`, `else`, `import`, `importstr`, `error`, `in`, `self`, `super`, `null`, `true`, `false`
- [ ] Strings highlighted (single-quote, double-quote, `|||` block strings)
- [ ] Comments highlighted: `//`, `#`, `/* ... */`
- [ ] Numbers highlighted
- [ ] Operators highlighted: `+`, `-`, `*`, `/`, `%`, `==`, `!=`, `<`, `>`, `<=`, `>=`, `&&`, `||`, `!`
- [ ] Bracket matching and auto-closing brackets work
- [ ] Editor uses dark theme consistent with Hermetiq (`vs-dark` or custom)
- [ ] `readOnly` prop disables editing
- [ ] `onChange` fires on every keystroke with the current editor content

## Implementation Notes

Monaco language registration:
```typescript
import * as monaco from 'monaco-editor';

monaco.languages.register({ id: 'jsonnet' });

monaco.languages.setMonarchTokensProvider('jsonnet', {
  keywords: ['local', 'function', 'if', 'then', 'else', 'import',
             'importstr', 'error', 'in', 'self', 'super',
             'null', 'true', 'false'],
  tokenizer: {
    root: [
      [/#.*$/, 'comment'],
      [/\/\/.*$/, 'comment'],
      [/\/\*/, 'comment', '@comment'],
      [/"([^"\\]|\\.)*"/, 'string'],
      [/'([^'\\]|\\.)*'/, 'string'],
      [/\|\|\|/, 'string', '@blockString'],
      [/[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?/, 'number'],
      [/[a-zA-Z_][a-zA-Z0-9_]*/, {
        cases: { '@keywords': 'keyword', '@default': 'identifier' }
      }],
    ],
    comment: [
      [/\*\//, 'comment', '@pop'],
      [/./, 'comment'],
    ],
    blockString: [
      [/\|\|\|/, 'string', '@pop'],
      [/./, 'string'],
    ],
  },
});
```

## Files

- `src/JsonnetEditor/JsonnetEditor.tsx`
- `src/JsonnetEditor/JsonnetEditor.css`
