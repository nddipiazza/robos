# Story 02-06: Test Suite (>50% Coverage)

**Epic:** [buildbarn-forms Core Library](epic.md)
**Status:** Complete
**Points:** 5

## Description

Build a comprehensive Jest + `@testing-library/react` test suite for the core library, targeting >50% line coverage. Tests cover `ProtoFormBuilder` rendering and interactions, form field components, proto comment utilities, and tooltip rendering.

## Acceptance Criteria

- [ ] `npm run test` passes with 0 failures
- [ ] `npm run test:coverage` reports ≥50% line coverage
- [ ] `ProtoFormBuilder.test.tsx` covers:
  - [ ] Renders form with a string field
  - [ ] Renders form with a number field
  - [ ] Renders form with a boolean (checkbox) field
  - [ ] Renders form with an enum field (dropdown)
  - [ ] Renders nested message fields (collapsible section)
  - [ ] Renders repeated fields (array with add/remove)
  - [ ] Renders oneof fields (type selector)
  - [ ] `onChange` fires after field change
  - [ ] `onSubmit` fires with correct data on form submit
  - [ ] Validation errors display for required fields
  - [ ] `initialValues` pre-populates fields correctly
- [ ] `protoComments.test.ts` covers:
  - [ ] `getFieldComment` returns correct comment for known field
  - [ ] `getFieldComment` returns `undefined` for unknown field
  - [ ] `getMessageComment` returns correct message comment
- [ ] `BuildBarnConfigEditor.test.tsx` covers:
  - [ ] Component renders without crashing
  - [ ] Monaco editor placeholder renders when no value
- [ ] Jest configured with `jsdom` environment and `identity-obj-proxy` for CSS modules

## Test Configuration

**jest.config.cjs:**
```javascript
module.exports = {
  testEnvironment: 'jsdom',
  transform: { '^.+\\.(ts|tsx)$': 'ts-jest' },
  moduleNameMapper: {
    '\\.(css|less)$': 'identity-obj-proxy',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  setupFilesAfterFramework: ['<rootDir>/src/setupTests.tsx'],
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
};
```

## Files

- `src/ProtoFormBuilder/ProtoFormBuilder.test.tsx`
- `src/utils/protoComments.test.ts`
- `src/BuildBarnConfigEditor/BuildBarnConfigEditor.test.tsx`
- `src/setupTests.tsx` (imports `@testing-library/jest-dom`)
- `jest.config.cjs`
