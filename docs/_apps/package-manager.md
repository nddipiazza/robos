---
title: "Package Manager"
package: package-manager
category: core-desktop
summary: "Prototype screen for listing apps and daemons with start, stop and health-probe buttons. It shows built-in sample data."
description: "A prototype of an app and runtime manager for Dev Containers, Mise and Nix. Today it renders a fixed sample list; it does not read your project or run containers."
---

Package Manager is a prototype. It is meant to become a screen for the apps and background services of a project, but the current code shows a fixed sample list and does not run anything.

## What it shows

The window has a branch selector and two header buttons, **Rebuild Devcontainers** and **Start All Services**, which only open an alert. Below them are two panels.

- **Apps & Daemons** lists four hard-coded entries (`forms-api`, `web-client`, `postgres-db`, `rabbitmq-broker`). A search box filters the list by name or id.
- **Devcontainer Runtime & Process Supervisor** shows the selected entry: port, memory, CPU, container spec path, runtime label, health URL and a log pane. The buttons are **Start Service**, **Restart**, **Stop** and **Probe Healthz**.

The branch selector offers three hard-coded branch names. Switching changes the commit badge only.

## What is not wired up

- The service list is built into `main.js`. The app does not read `.robos/packages.yaml` or any `.devcontainer` folder, even though the header text mentions them.
- Start, Stop and Restart change an in-memory status and append a log line. No process, container, Mise or Nix command is run.
- **Probe Healthz** returns a fixed "200 OK" result without making a request.
- Memory, CPU, PID and log text are sample values.

## Run it

The package has no `.desktop` launcher. From the repository, run `npm start` in `packages/package-manager`. The window uses a DOM-snapshot debug server on port `19166` when the RobOS library is installed.
