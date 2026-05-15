---
nav_exclude: true
---

# Story 01-05: Version Check & Branch Protection

**Epic:** [buildbarn-forms-proto Package](epic.md)
**Status:** Complete
**Points:** 2

## Description

Add a CI workflow that blocks merging PRs to `main` if the `package.json` version has not been bumped. This prevents accidental republishes of the same version, which would fail at the publish step but waste CI time and create confusion.

## Acceptance Criteria

- [ ] PR check fails with a clear message if `package.json` version equals the version on `main`
- [ ] PR check passes when version has been incremented (any semver bump: patch, minor, major)
- [ ] Check runs quickly (< 30 seconds) — just compares version strings
- [ ] Error message tells contributor exactly what to do: "Bump the version in package.json before merging"

## Implementation Notes

Compare the PR branch's `package.json` version to the base branch's version:

```bash
BASE_VERSION=$(git show origin/main:package.json | jq -r '.version')
PR_VERSION=$(jq -r '.version' package.json)

if [ "$BASE_VERSION" = "$PR_VERSION" ]; then
  echo "❌ Version not bumped. PR version ($PR_VERSION) == main version ($BASE_VERSION)"
  exit 1
fi
echo "✅ Version bumped: $BASE_VERSION → $PR_VERSION"
```

## Files

- `.github/workflows/version-check.yml`
