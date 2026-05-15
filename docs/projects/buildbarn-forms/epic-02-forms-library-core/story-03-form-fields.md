---
nav_exclude: true
---

# Story 02-03: Form Field Components

**Epic:** [buildbarn-forms Core Library](epic.md)
**Status:** Complete
**Points:** 5

## Description

Build a library of reusable styled form field components matching the Hermetiq dark design system. These are the atomic building blocks that `ProtoFormBuilder` uses to render individual fields.

## Acceptance Criteria

- [ ] `TextInput` — text input with label, error, tooltip support
- [ ] `NumberInput` — numeric input with min/max validation, label, error, tooltip
- [ ] `Checkbox` — checkbox with label, tooltip support
- [ ] `FormField` — base wrapper providing consistent label + error layout
- [ ] `Tooltip` — generic hover tooltip accepting any `ReactNode` as trigger
- [ ] `InfoTooltip` — icon-based tooltip for proto documentation (ⓘ icon on hover shows text)
- [ ] All components accept `className` for style extension
- [ ] All components render accessible labels (`<label htmlFor>`, ARIA attributes)
- [ ] Dark theme CSS using Hermetiq design tokens: `--bg-primary: #0d1117`, `--bg-card: #161b22`, `--accent: #00bcd4`
- [ ] All components are exported from `src/index.ts`

## Component API Summary

```typescript
// TextInput
interface TextInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  tooltip?: string;
  placeholder?: string;
  readOnly?: boolean;
  className?: string;
}

// NumberInput
interface NumberInputProps {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  error?: string;
  tooltip?: string;
  min?: number;
  max?: number;
  className?: string;
}

// Checkbox
interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  tooltip?: string;
  className?: string;
}

// InfoTooltip — displays proto documentation on hover
interface InfoTooltipProps {
  text: string;        // Proto comment text to display
  className?: string;
}

// Tooltip — generic tooltip wrapper
interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}
```

## Design Notes

- `InfoTooltip` renders an ⓘ (information circle) SVG icon inline with field labels. On hover, a popup shows the full proto documentation text.
- `Tooltip` is the generic implementation used by `InfoTooltip` and available for other uses.
- CSS follows Hermetiq conventions: dark navy backgrounds, cyan accent (`#00bcd4`), rounded corners, subtle borders.

## Files

- `src/components/FormFields.tsx` — TextInput, NumberInput, Checkbox, FormField
- `src/components/FormFields.css`
- `src/components/InfoTooltip.tsx`
- `src/components/Tooltip/Tooltip.tsx`
- `src/components/Tooltip/Tooltip.css`
- `src/components/Tooltip/index.ts`
- `src/components/index.ts`
