---
layout: default
nav_exclude: true
---

# Issue Specification: Bypass Ubuntu 26.04 Initial Setup Popups

**Issue ID**: `ISSUE-001`  
**Status**: `Triaged`  
**Severity**: `Medium`  
**Impacted Components**: `infra/desktop/cloud-init`, `gnome-initial-setup`, `gsettings`  
**Date Reported**: `2026-08-26`  

---

## 1. Executive Summary

Upon booting into Ubuntu GNOME 26.04 for the first time, interactive welcome popups, telemetry/privacy prompts, and GNOME Initial Setup dialogs interrupt developer auto-login. RobOS requires a seamless, zero-prompt login experience.

## 2. Problem Description & Impact

- **Observed Behavior**: First-boot desktop launch presents interactive modal dialogs ("Welcome to Ubuntu", "Privacy", "Software Upgrades") requiring user clicks.
- **Expected Behavior**: Stateless provisioning via cloud-init disables all first-run wizards, privacy prompts, and upgrade popups automatically.
- **User / Developer Impact**: Delays developer onboarding and breaks automated end-to-end VM provisioning tests.

## 3. Steps to Reproduce

1. Run `infra/desktop/build.sh` to generate the Ubuntu 26 image.
2. Boot VM with `infra/desktop/run.sh`.
3. Log in to desktop; observe Ubuntu initial setup popup window displayed on screen.

## 4. Technical Analysis & Root Cause

- `gnome-initial-setup` is enabled by default in standard Ubuntu desktop images.
- Missing `gsettings` overrides or `/etc/skel/.config/gnome-initial-setup-done` flag during cloud-init execution.

## 5. Proposed Fix Strategy

1. In cloud-init `user-data` / `runcmd`, write `~/.config/gnome-initial-setup-done` containing `YES`.
2. Execute `gsettings set org.gnome.initial-setup show-welcome-dialog false` via cloud-init.
3. Disable canonical-livepatch and ubuntu-report popups via systemd or pam config.

## 6. Acceptance Criteria & Verification

- [ ] First boot reaches desktop without displaying any setup modal popups.
- [ ] Automated VNC snapshot confirms desktop app launcher is immediately visible.
