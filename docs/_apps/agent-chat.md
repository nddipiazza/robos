---
title: "Agent Chat"
package: agent-chat
category: ai-agents
icon: agent-chat.svg
summary: "A chat window with session history, a model and mode selector and tool cards; replies are currently scripted samples."
description: "Agent Chat is a prototype of a Copilot-style chat for RobOS. It stores sessions locally and scans prompts for secrets, but it does not call a language model yet."
---

Agent Chat is the chat front end for the RobOS app suite. Today it is a working interface over scripted behavior.

{: .important }
`chat:send-message` in `main.js` does not call a model. It streams a fixed list of "thoughts", attaches sample tool results chosen by keywords in your message (such as `sql`, `kube`, `pr`, `petshop`), and returns canned text. The tool cards show names like `robos_db_execute_sql` but nothing is executed. For a prompt that runs a real agent, use [AI Prompt Studio]({{ '/apps/ai-prompt/' | relative_url }}).

## What you do in it

- The left column lists **Active Threads**. The plus button starts a new session.
- Choose a model in the header dropdown (Claude 3.7 Sonnet, OpenAI o3-mini, Gemini 2.5 Flash, Antigravity Harness, Local Ollama) and a mode with the **Agent**, **Chat**, **Edit** and **Review** buttons. The choice is passed along with the message and echoed in the sample reply; it does not change which model answers.
- Type in the box at the bottom. `Enter` sends, `Shift+Enter` adds a line. The chips `/explain`, `/fix`, `/test`, `/plan` and `/skills` prepend that text to your message.
- Code blocks in replies have **Copy** (copies to the clipboard) and **Insert** buttons. **Insert** has no handler yet.
- **Pop Out Prompt** and **Prompt Popup** start the AI Prompt app (`packages/ai-prompt`) in a separate window.
- The wrench button opens a list of twelve sample MCP tool names for apps such as DB Manager, Kube Studio and PR Review Theater.

![Agent Chat showing the sample Vaccination Tracking Feature session with tool cards and a formatted reply]({{ '/assets/images/screenshots/agent-chat.png' | relative_url }})
{: .robos-zoomable-img }

*The bundled sample session: tool cards above the reply, model and mode selectors on top, session list on the left.*

## Data and security

Sessions are saved to `~/.config/robos/agent-chat-sessions.json`. On first run, and whenever that file is missing, the app shows two built-in sample sessions (an Acme Petshop vaccination feature and an auth blast-radius question). The workspace pill (`acme-petshop`, `feature/rabies-tracking`) and the "32 MCP Tools" label are static text.

Each outgoing message is scanned with the shared `PromptSecurityGuard` from `robos-lib` before it is stored. Depending on the configured policy, a message is blocked with a "Security Policy Violation" error or has sensitive strings redacted.

## Running it

```bash
electron packages/agent-chat
```

Only one instance runs at a time. No Docker or API keys are needed because no model is called.
