---
title: Configure the prompt security guard
layout: default
parent: Agent harness and security
grand_parent: Training
nav_order: 1
permalink: /training/harness-and-security/prompt-security-guard.html
redirect_from:
  - /training/agent-harness-engineering/02-zero-leak-prompt-security-guard.html
---

# Configure the prompt security guard
{: .no_toc }

The prompt security guard (`packages/robos-lib/prompt-security.js`) scans prompt text for secrets, personal data and injection phrases, and then redacts it, blocks it or lets it through, depending on the mode. This lesson covers what it matches, which RobOS components call it, how to configure it and how to see what it did.
{: .fs-6 }

<details open markdown="block">
  <summary>On this page</summary>
  {: .text-delta }
1. TOC
{:toc}
</details>

## What it matches

The guard is a self-contained JavaScript module. Its rule catalog is modeled on Gitleaks, TruffleHog, Microsoft Presidio and OWASP LLM01, but it does not run those tools or call any service.

| Category | Examples |
|:---|:---|
| Secrets | AWS access keys and secret keys, GitHub, GitLab, Slack, Stripe, Anthropic, OpenAI and Google API keys, PEM private key blocks, database URLs with a password, `user:password@` URLs, JWTs, `password = "..."` style assignments |
| Personal data | US Social Security numbers, card numbers that pass the Luhn check, email addresses, North American phone numbers, private IP ranges (10.x, 172.16-31.x, 192.168.x) |
| Injection and exfiltration | "ignore all previous instructions" and similar overrides, "you are now in developer mode" style phrases (also DAN, jailbreak, unfiltered, god), "bypass safety filters", "act as an unfiltered AI", `curl`, `wget` or `nc` commands that mention `~/.ssh`, `/etc/shadow`, `/etc/passwd`, `~/.aws`, `~/.gnupg` or `~/.password-store`, and `cat ~/.password-store` |
| High entropy | Unmatched tokens of 24 or more characters whose Shannon entropy is at least 4.5 bits per character |
| Your own terms | Any word in the blocklist setting, matched case-insensitively |

Well-known dummy values such as AWS's `AKIAIOSFODNN7EXAMPLE`, `example.com`, `localhost` and `127.0.0.1` are allowed.

## Where it runs

| Component | Mode comes from | When it is blocked |
|:---|:---|:---|
| `<robos-ai-textarea>` in `packages/robos-ui` | The element's `prompt-security` attribute, default `redact` | A banner appears and the message is not submitted |
| `AgentSession.start()` in `robos-agent-client` | `~/.config/robos/settings.json` | Throws `PromptSecurityError` |
| `EmbeddedHarnessRouter.runTask()` | `~/.config/robos/settings.json` | Returns status 400 with code `prompt_security_violation` |
| AI Prompt and Agent Chat | `~/.config/robos/settings.json` | Returns the summary as an error to the window |

The text box is separate code. It has its own, smaller rule list (secrets, SSNs, card numbers, injection and exfiltration phrases) and does not read the settings below. It has no email, phone, IP, entropy, allowlist or blocklist checks. While you type, a banner appears when something matches, in every mode except `off`. It reads "RobOS Prompt Security: Detected ... Use Auto-Redact to sanitize before sending to AI." The **Auto-Redact** button masks the matches in the box, and the close button on the right dismisses the banner.

These do not call the guard:

- Task Implementer and Task Planner. They start `claude` and `gh copilot` directly from their main process.
- The HTTP client for a remote router (`HarnessRouterClient`). Whatever that server does is up to the server.
- Files an agent opens on its own, and the agent's output.

## Choose a mode

| Mode | Prompt passes? | What changes |
|:---|:---|:---|
| `redact` (default) | Yes | Matched text is replaced with a placeholder such as `[REDACTED:DB_PASSWORD]` before the prompt is sent |
| `block` | No | The caller refuses to send it |
| `warn` | Yes, unchanged | The result carries the findings and a summary. There is no confirmation dialog. |
| `audit-only` | Yes, unchanged | Same as `warn`; only the summary wording differs |
| `off` | Yes | No scan, no audit entry |

## Set the options

Open **RobOS Preferences** and go to **Prompt Security & Guardrails**. Each field is a key in `~/.config/robos/settings.json`:

| Field in Preferences | Key | Default |
|:---|:---|:---|
| Security Policy Mode | `prompt_security_mode` | `redact` |
| Scan Secrets & Credentials | `prompt_security_scan_secrets` | `true` |
| Scan PII & Financial Data | `prompt_security_scan_pii` | `true` |
| Scan Prompt Injection & System Overrides | `prompt_security_scan_injection` | `true` |
| High-Entropy Secret Detection | `prompt_security_entropy_check` | `true` |
| Entropy Threshold (bits/char) | `prompt_security_entropy_threshold` | `4.5` |
| Custom Allowlist (comma-separated tokens) | `prompt_security_allowlist` | `example.com,localhost,127.0.0.1` |
| Custom Forbidden Terms (comma-separated keywords) | `prompt_security_blocklist` | empty |

An allowlist entry must equal the matched text exactly. A guard reads the file when it is created. AI Prompt and Agent Chat create one per prompt, so a change applies to the next prompt there. A running agent session keeps the settings it started with.

## Try it

From a checkout, scan a prompt that contains a database password:

```bash
node -e "
const { scanPrompt } = require('./packages/robos-lib/prompt-security');
const r = scanPrompt('DATABASE_URL=postgres://app:hunter2secret@db.internal:5432/orders');
console.log(r.mode, r.allowed, r.riskLevel);
console.log(r.redactedText);
"
```

```text
redact true critical
DATABASE_URL=postgres://app:[REDACTED:DB_PASSWORD]@db.internal:5432/orders
```

To see a block, create a guard with an explicit mode:

```bash
node -e "
const { PromptSecurityGuard } = require('./packages/robos-lib/prompt-security');
const r = new PromptSecurityGuard({ mode: 'block' }).scan('card 4111 1111 1111 1111');
console.log(r.allowed, r.summary);
"
```

```text
false Prompt blocked by security policy: detected Payment Card Number.
```

Both commands append to the audit log in your real `~/.config/robos`. Prefix them with `HOME=$(mktemp -d)` to keep the test entries out of it.

## Read the audit log

Every scan that finds something is appended to `~/.config/robos/prompt-security-audit.json`, in every mode except `off`. The file is a JSON array that keeps the last 200 entries. An entry records the time, mode, whether the prompt was allowed, the risk level and the names of the matched rules. It does not store the matched text.

```json
{
  "timestamp": "2026-10-13T02:51:53.641Z",
  "mode": "redact",
  "allowed": true,
  "riskLevel": "critical",
  "findingsCount": 1,
  "findingTypes": ["Database URL with Password"],
  "summary": "Prompt sanitized via redaction: masked Database URL with Password."
}
```

The module's tests cover each rule, the modes and the integration points. They also write to the audit log, so give them a scratch home:

```bash
HOME=$(mktemp -d) node --test packages/robos-test/tests/prompt-security/prompt-security.test.js
```

## Limits

- It matches patterns and measures entropy. It will miss a secret in an unfamiliar format that is short or low-entropy, and it can flag a harmless long token.
- It scans the text it is given. It does not know where a prompt came from or where it is going.
- Redaction replaces every occurrence of the matched text in the prompt, not only the first.
