# Projects, Features, Epics, and Tasks

A **Project** is the set of Git repositories, web resources, and other components
that delivers a usable service or application. Its description explains its
purpose; repositories are managed in the Repositories tab and web resources in
Details.

A **Feature** is a lasting part of a Project, such as BB Config Editor. Features
have descriptions and related-feature links. They are peers, not a nested tree.
Select a Project and use Add feature. Open a Feature and use Add epic to define
a delivery goal for it.

An **Epic** is a goal accomplished by a collection of tasks. Epics can contain
sub-epics. Use Add sub-epic from an Epic's More options menu. Change Parent in
Details to move an Epic or Task under a Feature or Epic within its Project.
Cycles are rejected. Tasks may also live directly in a Project or Feature when
there is no larger delivery goal, and existing ungrouped Epics remain accessible.

A **Task** is an implementable unit of work. Its saved implementation plan,
optional required signoff, agent session, and PR review behavior are unchanged.

## Migration and compatibility

The former delivery-oriented Feature is now Epic. Planner records use
`hierarchyVersion: 2`; existing Feature records migrate exactly once to Epic.
The migration keeps the record ID, task-server URL, tasks, plan, timestamps,
required reviewer, and learning links. Original records are retained in
`task-planner/projects/hierarchy-v1-backup` beside the local records. Newly created
Features have version 2 and are not renamed during later loads.

The graph migration uses GraphWorkspace proposals to change legacy `robos:Feature`
nodes to `robos:Epic`, and child `robos:inFeature` links to `robos:inEpic`. Node IDs
are stable. New Features carry `robos:hierarchyVersion: 2`, `robos:inProject`, and
`robos:relatedFeature`. Planner nesting uses `robos:parentWorkItem`. Projects retain
`robos:hasRepository` and add `robos:webResources`.

Legacy GitHub native Feature issues are imported as RobOS Epics. Their native
server type is shown truthfully under Ticket & repositories; this migration does
not rename GitHub organization-wide types. Epic submission uses a configured Epic
type, with the legacy configured Feature type as a compatibility fallback. Saved
plan import likewise maps legacy Feature entries to Epic, preserving references.

Dev Central calls the existing assigned delivery collections Epics. PR Review
calls their parent plan Epic plan. Internal IPC names and learning IDs retain
legacy names to keep existing saved references working.

Planner hierarchy data is synchronized through GraphWorkspace into the local Task
Planner graph alongside its record store, and appears by name in the reusable
KGraph selector. This replaces the old writer to the shared legacy demo aggregate;
it does not mix new work with invalid sample references. The imported Hermetiq
graph keeps its own stable issue identities and was migrated in place.
