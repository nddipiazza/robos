# Story 03-02: Live JSON Preview Panel

**Epic:** [Jsonnet Editor](epic.md)
**Status:** Complete
**Points:** 3

## Description

Build the right-panel preview that evaluates Jsonnet as the user types and displays the result as formatted JSON. Evaluation is debounced to avoid excessive calls. Evaluation errors are shown clearly so users can diagnose syntax errors.

## Acceptance Criteria

- [ ] Preview panel updates automatically as user types (300ms debounce)
- [ ] Evaluated JSON is displayed as pretty-printed, syntax-highlighted JSON
- [ ] Evaluation errors display a red error message with the error text from the evaluator
- [ ] While evaluation is pending, a subtle loading indicator is shown
- [ ] Preview panel has tabs: "JSON Preview" and "Field Tree" (see Epic 04 for Field Tree)
- [ ] When no `evaluateJsonnet` prop is provided, preview shows a setup prompt ("Wire up a Jsonnet evaluator to see live preview")
- [ ] Panel layout is a 50/50 horizontal split with a draggable divider

## Implementation Notes

```typescript
// In JsonnetEditor.tsx
const [preview, setPreview] = useState<string | null>(null);
const [error, setError] = useState<string | null>(null);
const [loading, setLoading] = useState(false);

const evaluate = useCallback(
  debounce(async (src: string) => {
    if (!props.evaluateJsonnet) return;
    setLoading(true);
    try {
      const result = await props.evaluateJsonnet(src);
      setPreview(JSON.stringify(JSON.parse(result), null, 2));
      setError(null);
    } catch (e) {
      setError(String(e));
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, 300),
  [props.evaluateJsonnet]
);

useEffect(() => {
  evaluate(props.value);
}, [props.value, evaluate]);
```

## Files

- `src/JsonnetEditor/JsonnetEditor.tsx` — preview panel implementation
