# Story 05-01: Install Library & Configure .npmrc

**Epic:** [MVP Integration](epic.md)
**Status:** Not started
**Points:** 1

## Description

Install `@hermetiq/buildbarn-forms` as a dependency in the MVP project and configure `.npmrc` so npm can resolve packages from GitHub Packages (`@hermetiq` scope).

## Acceptance Criteria

- [ ] `@hermetiq/buildbarn-forms` added to `package.json` dependencies
- [ ] `.npmrc` in MVP root sets `@hermetiq:registry=https://npm.pkg.github.com`
- [ ] `npm install` succeeds (authenticated with `NPM_TOKEN` or `GITHUB_TOKEN`)
- [ ] `import { BuildBarnConfigEditor } from '@hermetiq/buildbarn-forms'` resolves without errors in a test file
- [ ] CI pipeline for MVP sets `NODE_AUTH_TOKEN` secret for GitHub Packages access

## Implementation

```
# MVP/.npmrc
@hermetiq:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

```json
// package.json additions
{
  "dependencies": {
    "@hermetiq/buildbarn-forms": "^0.2.0"
  }
}
```

## Notes

- `NODE_AUTH_TOKEN` must be a GitHub Personal Access Token or Actions token with `read:packages` scope.
- Do not commit the actual token to source — use environment variable substitution in `.npmrc`.
- If MVP is deployed via CI/CD, the token must be injected as a build secret.
