# Story 02-07: App Deployment Pipeline

**Epic:** [App Framework](epic.md)
**Status:** Done
**Points:** 3

## Description

Create deploy.sh per-app deployment via SCP to running VM. Also implement seed ISO bundling in build.sh: packages are tarred into robos-packages.tar.gz on the cloud-init ISO so apps are installed during first boot provisioning. Cloud-init Step 6 extracts and deploys all bundled packages.

## Acceptance Criteria

- [ ] deploy.sh copies files, runs npm install, installs .desktop file
- [ ] build.sh bundles packages/ into seed ISO
- [ ] Cloud-init extracts and deploys all packages on first boot
- [ ] Permissions set correctly (world-readable for Electron)
