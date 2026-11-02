---
title: "Proposal: Ask My Files"
layout: default
nav_exclude: true
description: "A private desktop app that searches your own documents by meaning and answers questions with citations, using local Ollama models and no cloud service. Keyword search works with no AI installed."
---

# Proposal: Ask My Files
{: .no_toc }

Search your own documents by meaning and get answers that cite the source, with nothing leaving your computer.
{: .fs-6 }

{: .important }
Proposal, not built. There is no `packages/ask-my-files` and no `packages/robos-local-llm` in the repository.

## Overview and vision

The documents people most want to ask questions about are the ones they least want to upload: tax papers, contracts, invoices, medical records. Ask My Files indexes folders the user chooses and answers questions from them using models running on the same machine.

It has to work on modest hardware. The reference machine is a ThinkPad E595: Ryzen 7 3700U (4 cores, 15 W), 64 GB of RAM, no usable GPU. That machine is slow at generating long text, and early measurements show it is also slow at embedding, so indexing a large folder takes many hours in the background (see [Phase 0 status](#phase-0-status)). Keyword search has to be useful on its own until that finishes.

It is also the first real use of local model management. Setup has to check Ollama, download models and show what is loaded, and that code becomes the start of a broader Local LLM app.

## User stories

- As a homeowner, I ask "what did we pay the contractor in 2024?" and get the amount with a link to the invoice and page.
- As someone filing taxes, I find "the form showing mortgage interest" without remembering its name or filename.
- As a privacy-conscious user, I can see which folders are indexed, that the model server is local, and I can delete the index at any time.
- As a user with no AI installed, I still get fast keyword search across my documents.
- As a user on a slow laptop, I can keep working while indexing runs, and I can tell how far along it is.

## Scope

### In scope

- Folders the user explicitly adds. Nothing is indexed by default.
- Text extraction from `.txt`, `.md`, text-based PDFs and `.docx`, then scanned PDFs and images through OCR.
- Incremental background indexing that can pause and resume.
- Keyword search with no models installed, and hybrid keyword and semantic search once an embedding model is available.
- Streamed answers with numbered citations, and a clear "not found in your documents" result.
- A **Models** tab that checks Ollama, downloads the two models with progress, shows what is loaded and removes models.

### Out of scope for the first version

- Cloud providers. This app never sends document text to a hosted API.
- Remote Ollama servers (see [Privacy and security](#privacy-and-security)).
- Installing Ollama for the user. The app detects it and shows instructions.
- Backends other than Ollama, although the client should leave room for them.
- `@` mentions in `<robos-ai-textarea>` and MCP tools for agents. Both are natural next steps, but agents reading private documents needs its own consent design.
- Images without text, audio and video.
- Coding models and agent workflows.

## What exists today

| Code | What it gives us | Limit for this feature |
|:---|:---|:---|
| [`packages/robos-llm/index.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-llm/index.js) | Ollama chat and embeddings through LangChain | No streaming, a 120-second default timeout, needs LangChain installed from Preferences, and no model listing, download or removal |
| [`packages/robos-llm/semantic-search.js`](https://github.com/nddipiazza/robos/blob/main/packages/robos-llm/semantic-search.js) | Hash-based re-embedding, cosine ranking, rebuild when the model changes | Stores vectors in one JSON file, which does not scale to document chunks |
| [`packages/search-index/main.js`](https://github.com/nddipiazza/robos/blob/main/packages/search-index/main.js) | Folder scanning and index management | Records file paths only, matches by substring, and its defaults include `~/.config/robos`, so its indexes must not be reused for content |
| [`packages/auto-center/lib/invoices.js`](https://github.com/nddipiazza/robos/blob/main/packages/auto-center/lib/invoices.js) | `pdftotext`, then `pdftoppm` and Tesseract; `ocrRuntime()` finds the binary | `scan()` is invoice-specific: 25 MiB and 10-page limits, and it writes review records |

No package depends on a `.docx` parser or on SQLite today. Tesseract is optional: Auto Center needs it only for scans, and it is not installed on the reference laptop.

## Architecture

### Packages

- **`packages/ask-my-files`**: the new Electron app, registered using the `create-robos-app` checklist.
- **`packages/robos-local-llm`**: a small library that calls Ollama's HTTP API directly with `fetch`, with no LangChain and no dependency on API mode.
- **`packages/robos-lib/document-text`**: text extraction, with `ocrRuntime()` and the PDF and OCR steps moved out of Auto Center so both apps share them. Auto Center keeps its invoice limits and review flow.

### Why not call `robos-llm` directly

The idea note proposed building on `robos-llm`, but its `complete()` and `embed()` are a poor fit here:

- Answers must stream. At about 10 tokens per second, a 120-second blocking call would feel broken, and long answers would hit the timeout.
- AGENTS.md says features must not depend on API mode, and `robos-llm` needs its LangChain packages installed first.
- `ai_api_base_url` is shared with the OpenAI-compatible provider and may point off the machine, which this app must never do by accident.
- `embed()` always redacts text (see [Decisions](#decisions)).

We reuse its ideas instead: the Ollama defaults (`llama3.2`, `nomic-embed-text`), content hashes for re-embedding, and rebuilding when the model changes. If `robos-llm` later wants streaming, it can adopt the new client.

### Ollama calls

| Purpose | Endpoint |
|:---|:---|
| Detect the server | `GET /api/version` |
| List installed and loaded models | `GET /api/tags`, `GET /api/ps` |
| Download or remove a model | `POST /api/pull` (streamed), `DELETE /api/delete` |
| Embed chunks and queries | `POST /api/embed` |
| Answer | `POST /api/chat` (streamed) |

`nomic-embed-text` expects `search_document:` and `search_query:` prefixes, so the client adds them per task.

### Indexing pipeline

1. **Scan** the chosen folders. Skip hidden files, symlinks, `node_modules` and the sensitive paths listed below.
2. **Detect changes** by size and modified time, then content hash.
3. **Extract** text with page numbers. OCR is optional and only runs if Tesseract is present.
4. **Chunk** into roughly 400-token passages with some overlap, each recording its file and page.
5. **Add to the keyword index** straight away, so search works before and without embeddings.
6. **Embed** in small batches when a model is available.

Indexing runs in a `utilityProcess` so the window stays responsive. It pauses while an answer is being generated and on battery power (Electron's `powerMonitor`), and it resumes from where it stopped.

### Retrieval and answers

1. Run keyword (BM25) and vector search, and merge the results with reciprocal rank fusion. Exact matters like invoice numbers come from keywords, and paraphrases come from vectors.
2. Stop if nothing passes the relevance threshold, and report that nothing was found. Do not call the model.
3. Send the top passages (about six) to the chat model with an explicit `num_ctx`, numbered so the model can cite them.
4. Stream the answer and show the passages beside it from the start. They appear first, and they are useful even if the model is slow.
5. Check that every `[n]` matches a passage that was sent. Remove any that do not, and flag answers left with no valid citation.

### Storage

Everything lives in `~/.local/share/robos/ask-my-files/`, with `0700` on the directory and `0600` on its files. Keeping it outside `~/.config/robos` matters: Config Sync backs up new app data there automatically, and this index holds the text of private documents.

A separate JSON file per index would not work. At 768 dimensions, with vectors rounded as `semantic-search.js` does, 100,000 chunks is roughly 700 MB, which is over V8's limit of about 512 MB for a single string. As 32-bit float blobs the same vectors take about 300 MB, and an exact scan over them should be fast enough without a vector database (to confirm in Phase 0).

The recommendation is SQLite with FTS5 for keyword search and BLOBs for vectors, using the built-in `node:sqlite`. See [Open questions](#open-questions) for the runtime constraint.

### Privacy and security

- **Local only.** The client refuses any Ollama address that is not loopback (`127.0.0.1`, `::1`, `localhost`) and has its own setting, separate from `ai_api_base_url`. Redirects are not followed.
- **Never indexed, even inside a chosen folder:** `~/.ssh`, `~/.gnupg`, `~/.password-store`, `~/.config/robos`, browser profiles and hidden files.
- **Documents are untrusted input.** A document could contain text aimed at the model. The answer step has no tools and no actions, passages are clearly delimited as data, and output renders as plain text with citations only, never as HTML or Markdown links.
- **Deleting is simple.** Removing a folder deletes its text and vectors, and "Delete index" removes everything. Documents themselves are never modified.
- **No telemetry.** The only network traffic is to the local model server. Downloads are performed by Ollama.
- **The index is not encrypted in the first version**, and the app says so during setup (see [Decisions](#decisions)).

### Interface

- **Search** (default): one box, ranked results with highlighted snippets, and an **Ask** action that adds an answer above them.
- **Folders**: add or remove folders, per-folder progress, a list of files that failed and why, and pause and resume.
- **Models**: Ollama status, download progress, what is loaded and how much memory it uses, and a remove action.

If Ollama is absent, **Search** still works in keyword mode, with a small note and a link to the Models tab.

### IPC

`list-folders`, `add-folder`, `remove-folder`, `index-status`, `pause-indexing`, `resume-indexing`, `search`, `ask` and `cancel-ask`; `models-status`, `pull-model`, `cancel-pull` and `delete-model`; and events `index-progress`, `answer-token` and `pull-progress`.

## Implementation plan

### Phase 0: Measure and decide

No app yet. On the reference laptop, install Ollama with the user's approval, then time embedding speed, first-token delay and answer speed on a real document set. Compare two or three small chat models for citation quality, confirm the scan speed, and settle the open questions. **Exit:** real numbers replace the targets below, or the design changes.

#### Phase 0 status

Started and paused, so the exit condition is not met. Ollama v0.40.13 ran on the reference laptop on loopback only, using this repository's documentation as a non-private test corpus: 646 files split into 1,149 chunks of about 300 words.

| Question | Result so far |
|:---|:---|
| Does `node:sqlite` with FTS5 work in a current Electron? | Yes, in Electron 44.9.0 (Node 24.22). It does not work in Electron 28, and it is not yet tested at 100,000 chunks |
| How fast does `nomic-embed-text` embed on CPU? | 0.5 to 0.6 chunks per second over 64 chunks, at batch sizes of 1, 8, 16 and 32. Batching does not help |
| Can Ollama use the Vega iGPU? | It detects it through Vulkan and skips it unless `OLLAMA_IGPU_ENABLE=1` is set. Not yet timed |

This is one short run on a machine that was not otherwise idle, so treat the speed as a first reading. If it holds, 25,000 chunks would take about 12 hours and 100,000 chunks about 46 hours, which makes pause and resume essential rather than a convenience.

Still to do:

- Time the embedding model at different thread counts, and with a smaller model such as `all-minilm`, including how much search quality it gives up.
- Score keyword, semantic and hybrid search on the same questions, to see whether semantic search justifies the indexing time.
- Compare answer quality, citations, "not found" behavior and prompt injection resistance across `llama3.2:3b`, `qwen3.5:4b`, `gemma4:e2b` and `qwen3.6:35b`. No answer has been timed or scored yet.
- Run the storage test at 100,000 chunks, compare CPU with the iGPU, and test on real private documents chosen by the user, because scans and tables may behave very differently from Markdown.

### Phase 1: Keyword search with no AI

Create the app, folder management, scanning, `.txt`, `.md` and text PDF extraction, chunking and FTS5 search. Move the PDF and OCR code into `robos-lib` and keep Auto Center's tests passing. **Exit:** useful search with no models and no network.

### Phase 2: Local model management

Build `robos-local-llm` and the Models tab. Add a fake Ollama server to `robos-test` so E2E tests need no real models. **Exit:** check, download with progress, cancel and remove all work.

### Phase 3: Semantic search

Add background embedding, the pause rules, hybrid ranking and rebuilds on model change. **Exit:** a paraphrased query finds a document that keyword search misses.

### Phase 4: Answers with citations

Add retrieval, the prompt, streaming, cancellation, citation checks, the "not found" path and prompt injection tests. **Exit:** the acceptance criteria below pass.

### Phase 5: More formats and handoff

Add `.docx` and OCR for scans, and move the Models tab into its own Local LLM app once a second feature needs it. Docs and a blog post go here.

## Acceptance criteria

### Works without AI

- [ ] With Ollama absent, adding a folder and searching by keyword works, and no feature shows an error beyond the setup note.
- [ ] Nothing is indexed until the user adds a folder.

### Privacy

- [ ] A test proves that non-loopback Ollama addresses, and redirects away from loopback, are refused.
- [ ] A network capture during indexing and answering shows no traffic except to loopback.
- [ ] The sensitive paths above are not indexed, even when their parent is chosen.
- [ ] Removing a folder removes its text and vectors from the database, confirmed by searching the store directly.

### Answers

- [ ] Every citation in an answer points to a passage that was sent, and opens the right file, at the right page where the viewer supports it.
- [ ] A question with no relevant documents gets "not found", and the model is not called.
- [ ] A test document containing instructions aimed at the model cannot change the app's behavior or insert a link into the output.
- [ ] Cancelling stops generation within a few seconds.

### Reliability

- [ ] Killing the app during indexing loses no finished work, and it resumes on restart.
- [ ] Changed files are re-indexed, deleted files are removed, and changing the embedding model triggers a clean rebuild.
- [ ] A corrupt or password-protected file is listed as failed and does not stop the run.

### Performance on the reference laptop

These are targets to confirm in Phase 0, not measurements.

- [ ] Keyword search over 100,000 chunks returns in under 200 ms.
- [ ] Semantic search, once embedded, returns in under 2 seconds.
- [ ] The first answer token appears within 30 seconds, with the chat model already loaded.
- [ ] The desktop stays usable during indexing.

## Open questions

1. **Which runtime gives us SQLite?** `node:sqlite` with FTS5 works in Electron 44.9.0, but not in Electron 28 (Node 18), which is the version installed in `packages/voice-prompt` and the most common range among packages. **Recommendation:** pin the new app to Electron 44, as `packages/point-of-sale` already does, once the 100,000-chunk test passes. The fallback is `better-sqlite3`, which adds a native build for each platform.
2. **Is the small default chat model good enough?** `llama3.2` (3B) is the existing default, and citation quality is unproven. Phase 0 decides, and a larger MoE model could be an optional upgrade.
3. **Separate app or part of Docu Vault?** This spec proposes a separate app, because it reads the user's existing files rather than a vault of its own. Docu Vault could become an indexed source later.

## Decisions

- **The prompt security guard does not apply to document passages sent to loopback Ollama.** The guard redacts by default and can block, which would mask the phone number or account number a user is asking about and reject any tax document containing an SSN in `block` mode. Its purpose is text leaving the machine, and here nothing does. The prompt injection defenses in [Privacy and security](#privacy-and-security) stay in place, and if remote servers are ever allowed, this decision must be revisited for them.
- **The index is not encrypted at rest in the first version.** It holds the text of private documents in readable form. The first version uses file permissions and a clear notice during setup.
