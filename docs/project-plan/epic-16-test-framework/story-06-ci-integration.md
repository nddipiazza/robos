# Story 16-06: CI Integration — Run Tests in Headless VM

**Epic:** [RobOS App Test Framework](epic.md)
**Status:** Not started
**Points:** 5

## Description

Run the full test suite in CI (GitHub Actions). Boot a headless RobOS VM, wait for provisioning, then run all smoke tests.

### CI Workflow

```yaml
jobs:
  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build VM
        run: ./infra/desktop/build.sh
      - name: First boot (headless)
        run: ./infra/desktop/run.sh --firstboot --headless &
      - name: Wait for cloud-init
        run: |
          until ssh -p 2224 robos@localhost "cloud-init status" 2>/dev/null | grep -q done; do sleep 30; done
      - name: Wait for reboot
        run: |
          sleep 60 && ssh -p 2224 robos@localhost "uptime"
      - name: Run smoke tests
        run: npx robos-test --ci --report test-results/
      - name: Upload results
        uses: actions/upload-artifact@v4
        with:
          name: test-results
          path: test-results/
```

### CI-Specific Features

- `--ci` flag: headless mode, no interactive prompts, exit code reflects pass/fail
- JUnit XML output for CI dashboards
- Screenshot artifacts uploaded on failure
- Timeout handling (kill VM if tests hang)

## Acceptance Criteria

- [ ] Full test suite runs in GitHub Actions
- [ ] VM boots and provisions in CI
- [ ] Test results uploaded as artifacts
- [ ] Clear pass/fail exit code
