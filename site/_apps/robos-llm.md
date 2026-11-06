---
title: "RobOS LLM"
package: robos-llm
category: "libraries"
component_type: component
permalink: /robos-llm/
summary: "RobOS optional API mode — direct model calls (Anthropic, OpenAI, Gemini, Ollama) through LangChain.js. Off by default; the coding-agent CLIs stay the default path."
description: "RobOS optional API mode — direct model calls (Anthropic, OpenAI, Gemini, Ollama) through LangChain.js. Off by default; the coding-agent CLIs stay the default path."
---

RobOS optional API mode — direct model calls (Anthropic, OpenAI, Gemini, Ollama) through LangChain.js. Off by default; the coding-agent CLIs stay the default path.


## Enable API mode

Direct API mode is off by default. Turn on **Use direct model APIs** in [RobOS Preferences](/robos-preferences/) to install the LangChain dependencies and choose Anthropic, OpenAI, Gemini or local Ollama.

`index.js` provides configuration and completion helpers. `credentials.js` handles credentials, and `semantic-search.js` supports the optional semantic search path. Credentials are stored through the password store.

Normal coding-agent tasks continue through the agent CLIs. The shared `robos-lib/ai-agent` wrapper falls back to the CLI if API mode cannot answer. See [AI agents and API mode](/ai-providers/) for setup.

## Source

Browse [`packages/robos-llm`](https://github.com/nddipiazza/robos/tree/main/packages/robos-llm) for implementation and exports.
