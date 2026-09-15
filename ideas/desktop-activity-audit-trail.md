# Idea: useful desktop activity audit trail

Status: Idea — hidden in Dev Central until a real event source exists.

The former Desktop Activity tab was a view of an optional journal JSON file. It
had no dependable collection, retention, or task correlation and presented an
empty placeholder as a working feature.

Explore a local, opt-in history of RobOS work: task assignment, plan approval,
agent start/stop/failure, verification, PR review, and merge. Each event should
include its timestamp, source app, task/feature URL, session ID, outcome, and a
link to the relevant evidence. Repeated polls must not create new events.

Decide event ownership, cross-app delivery, retention, redaction, and deletion
before implementing collection. Never capture keystrokes, clipboard contents,
secrets, or unrelated desktop activity. Start with explicit RobOS workflow
events. Restore a searchable timeline only after real events and links work.

Acceptance: follow one real ticket through its lifecycle, see each event once,
open its source, and verify retention and opt-out without fabricated entries.
