---
nav_exclude: true
---

# Story 02-05: AuthorizerField Custom Component

**Epic:** [buildbarn-forms Core Library](epic.md)
**Status:** Complete
**Points:** 3

## Description

Implement `AuthorizerField` — a custom form component that renders the Buildbarn `AuthorizerConfiguration` proto message in a user-friendly way. Authorizer configurations appear in nearly every Buildbarn config (get/put/findMissing authorizers on storage, worker, etc.), so a purpose-built component significantly improves the UX over the generic `ProtoFormBuilder` rendering for this message type.

## Context

The `AuthorizerConfiguration` proto uses a `oneof` with many possible variants:
- `allow` — allows all requests (no auth)
- `deny` — denies all requests
- `jwt` — JWT token validation
- `jmespath` — JMESPath expression against request metadata
- `any_of` / `all_of` — logical combinators

The generic `ProtoFormBuilder` would render this as a nested collapsible oneof, but it's complex enough that a dedicated component with a cleaner UI is warranted.

## Acceptance Criteria

- [ ] `AuthorizerField` renders all authorizer variants in a friendly dropdown + contextual sub-form
- [ ] Default selection is `allow` (most common for development configs)
- [ ] `allow` variant shows no additional fields (just a label)
- [ ] `deny` variant shows no additional fields (just a label)
- [ ] `jwt` variant shows: JWKS URL, signing key, audience, issuer fields with tooltips
- [ ] `jmespath` variant shows a text area for the JMESPath expression
- [ ] `any_of` / `all_of` variants show a list of nested `AuthorizerField` items (recursive)
- [ ] Component is exported from `src/index.ts` as `AuthorizerField`
- [ ] `AuthorizerField` is registered in the default `customComponents` registry for `ProtoFormBuilder`

## Props

```typescript
interface AuthorizerFieldProps {
  label: string;            // e.g., "Get Authorizer"
  value: AuthorizerValue;
  onChange: (value: AuthorizerValue) => void;
  tooltip?: string;
  error?: string;
}
```

## Files

- `src/ProtoFormBuilder/AuthorizerField.tsx`
- `src/ProtoFormBuilder/AuthorizerField.css`
