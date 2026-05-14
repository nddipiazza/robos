# Story 01-04: CI/CD Publish Pipeline

**Epic:** [buildbarn-forms-proto Package](epic.md)
**Status:** Complete
**Points:** 3

## Description

Set up GitHub Actions workflows for `buildbarn-forms-proto` that: (1) validate PRs don't break the build, (2) publish a new package version to GitHub Packages when changes land on `main`, and (3) create a GitHub Release with a version tag.

The pipeline must enforce that the `package.json` version is bumped before merging, preventing accidental republishes of the same version number.

## Acceptance Criteria

- [ ] CI workflow runs on every PR: builds the package and runs any tests
- [ ] CI workflow fails if package builds with errors
- [ ] Publish workflow triggers on push to `main`
- [ ] Publish workflow publishes to `https://npm.pkg.github.com` with `GITHUB_TOKEN`
- [ ] Publish workflow creates a git tag (`v{version}`) after publishing
- [ ] Publish workflow creates a GitHub Release linked to the tag
- [ ] Version check workflow fails PR if `package.json` version is unchanged from `main`
- [ ] `.npmrc` is configured for authentication with GitHub Packages during publish

## Workflow Files

```
.github/workflows/
  ci.yml           — PR build validation
  publish.yml      — Publish on merge to main
  version-check.yml — Block PRs without version bump
```

## Key Workflow Snippets

```yaml
# publish.yml (simplified)
- name: Setup Node
  uses: actions/setup-node@v4
  with:
    node-version: '20'
    registry-url: 'https://npm.pkg.github.com'
    scope: '@hermetiq'

- name: Build
  run: npm run build

- name: Publish
  run: npm publish
  env:
    NODE_AUTH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

- name: Create Release
  uses: actions/create-release@v1
  with:
    tag_name: v${{ env.PACKAGE_VERSION }}
    release_name: Release v${{ env.PACKAGE_VERSION }}
```

## Notes

- The `GITHUB_TOKEN` secret is automatically available in GitHub Actions; no additional PAT is required for publishing to the same org's GitHub Packages.
- The `.npmrc` file must set `@hermetiq:registry=https://npm.pkg.github.com` for consumers to resolve the package.
