# CI Pipeline Servers

Configure Buildkite, Jenkins, GitHub Actions, GitLab CI, Azure Pipelines, CircleCI,
and TeamCity endpoints independently of Task Servers. Settings contain credential
references only. Credentials are not fetched or tested by this app.

Save a server, choose a repository, review the tracked definition files, and
import into an explicit graph workspace. Imports retain revision, file hash,
working-tree status, repository, and relationships to the CI server. Applying
uses the graph workspace's revision-checked proposal mechanism. Reimporting
unchanged definitions is a no-op. Existing graph properties outside imported
fields are preserved.

This app manages configuration and source definitions. CI Monitor remains the
GitHub Actions build viewer; live Buildkite/Jenkins/other-provider build listing,
logs, reruns, credential validation, and nested include expansion are not supplied
by this configuration app. No repository scripts are executed during import.
