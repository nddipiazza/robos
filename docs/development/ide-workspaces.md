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
