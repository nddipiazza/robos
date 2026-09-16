# Git project IDE associations and task review workspaces

Use **Git Projects → IDE & workspaces** to choose a repository's IDE. **Add checkout…** registers another local checkout after verifying its Git origin; it does not move or replace an existing checkout. Use the checkout selector to discover roots or open a workspace in a specific location.

**Discover project roots** reads build manifests without executing repository code. It uses the chosen checkout, or GitHub's repository tree API when no checkout is selected. Review the relative paths and IDE choices in the project-roots table, then **Save associations**. Paths stay relative so the configuration can be reused in a developer checkout or a task's sandbox. Discovery recognizes JavaScript packages, Go modules, Maven/Gradle, Python, Cargo, CMake, .NET, Composer, Ruby, Helm and Bazel roots. Dependency/vendor/generated directories and symlinks are skipped; scans report truncation. A manifest indicates a candidate project root, not a verified build.

Software Center manages installation of the JetBrains suite through its official stable Linux snaps. Installation uses the desktop administrator authentication dialog. IDE licenses remain under the developer's control. RobOS-generated sandbox review workspaces are automatically registered as trusted JetBrains locations before launch. Trust is scoped to the generated review directory, not the home directory or ordinary checkouts. Git Projects, Workspace Manager and PR Review Theater use the same IDE catalog and launcher detection. Repository and per-root associations, dependencies and checkout locations are stored in the developer's `~/.config/robos/git-projects.json`; they are workstation preferences rather than shared machine paths in a company graph.

## Task review

A task may select several repositories. Task Runner preserves those clones before releasing the ephemeral container. In the theater, **Open session in <IDE>** creates a review workspace under the preserved session with all discovered/configured project roots loaded. Different root IDE associations expose multiple launch buttons. Shared `robos-lib/project-roots.js`, `project-ides.js` and `ide-workspaces.js` provide discovery, associations and workspace generation.

Review copies use the exact PR commits, with unchanged repositories at their preserved session commits. They are separate from the original exported clones and the developer's normal checkouts. Reopening a review preserves reviewer edits. If a PR changed since its theater page loaded, reload the page first. Missing exports are reported instead of falling back to the application's current working directory.

JetBrains workspaces use `.idea/modules.xml`, per-root module files and VCS mappings for actual repository roots only. Nested application/test roots remain modules; they are not registered as separate Git repositories. VS Code-family IDEs use a multi-root `.code-workspace`. Nested roots are excluded from their parent JetBrains module to avoid overlapping content roots. These files establish the project layout; language SDKs, package installation and runtime services still follow each project's development setup.

## Multiple PRs

The theater has persistent PR pages for every linked PR on the task. Each page has its own diff, summary and review acknowledgements, keyed by reviewed commit. Repository dependencies declared in Git Projects and npm package dependencies found in the preserved session establish prerequisite edges; transitive dependencies are included. Independent PRs sort by repository and number. No ordering is guessed from a repository's name or from the words “library” and “service.” For other build systems, declare repository dependencies explicitly.

Review pages can be inspected in any order. Merge is blocked in the backend until prerequisite PRs are merged, and dependency cycles must be corrected. GitHub checks, required reviewers and exact-commit checks continue to apply. These dependency rules order PR merges; they do not publish library versions or prove downstream deployment readiness.

### Shared Open in IDE control

Git Projects and PR Review Theater use `robos-lib/open-ide-dialog.js` and the shared `project-ides.choicesFor` resolver. One applicable installed IDE opens directly. Multiple IDE associations show a chooser explaining which repositories or project roots use each IDE; users can open one or several. Review sessions resolve associations across all selected Git projects, and every chosen IDE receives the complete session workspace. Missing installations point to Software Center; missing associations point to Git Projects. Backend validation rejects an unrelated IDE or an ambiguous request without a choice.

### Session evidence

Task Runner creates `/home/agent/evidence` outside the Git clones and exposes it as `ROBOS_EVIDENCE_DIR` to Codex and AGY. The sandbox exporter preserves it as `sessions/<session-id>/evidence` alongside `repos` before teardown. Build logs, screenshots, videos and test reports belong there, not in a committed `docs/validation` tree. The PR description and final response should summarize validation and reference evidence. Intentional documentation deliverables remain part of the source change.

### Inline review feedback

Click an old/new line number in File changes to open **PR comment** or **AI fix**. Comments are posted using GitHub's [review-comment API](https://docs.github.com/en/rest/pulls/comments), anchored to the reviewed commit, path, side and line. Existing comments show their author and timestamp. A changed or closed PR requires reloading before posting.

AI fix starts a new Task Runner session for the existing task, using its saved Task Planner plan and the selected feedback. The shared launch dialog selects provider, model and sandbox resources. The sandbox checks out the exact reviewed PR head and the agent updates that branch without force-pushing or creating a duplicate PR/ticket. Fork PR fixes are currently unsupported. The runner opens for progress; an open theater refreshes on completion only if it still displays that PR. A new commit clears review acknowledgments and any old quiz result.

The AI fix tab embeds `mountTaskRunnerLaunch({container, ...})`, the same reusable form used by `openTaskRunnerLaunch` dialogs. Agent/model remain visible; resources and MCP connections live under Advanced. Normal task launches collapse the repository chooser when repositories are already selected; PR fixes hide it and retain the task associations. Blank fix prompts disable launch, and a submitted launch cannot be duplicated while pending.

### Provider model catalog

The shared agent selector uses a dropdown of discovered models. Codex discovery starts the installed CLI with `app-server --listen stdio://`, initializes its protocol and paginates `model/list`; it never starts an agent turn. RobOS caches the catalog for 24 hours, keyed by CLI version/installation and account. Concurrent lookups share an in-flight request; failures retain the previous catalog with a five-minute retry backoff. The refresh button bypasses the TTL. The picker does not filter its available choices by the currently selected model. Protocol reference: https://learn.chatgpt.com/docs/app-server#models

The agent selector exposes Effort only when the selected model reports supported reasoning levels. Model-specific selections survive switching providers/models and refreshing the catalog. Default omits the CLI override; explicit effort is validated against the model catalog and passed as `model_reasoning_effort` for Codex task runs and summary generation. Summary cache keys include effort. AGY currently reports no configurable effort and does not receive a guessed flag.
