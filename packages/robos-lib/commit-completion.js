'use strict';
const {execFileSync}=require('node:child_process');
const instructions=`COMMIT COMPLETION REQUIREMENT:
Before editing, inspect git status --porcelain=v1 --untracked-files=all, staged and unstaged diffs, and the current branch. Record pre-existing edits. After EVERY completed implementation or review-edit iteration, run relevant checks, refresh affected evidence and walkthrough artifacts, and commit all task-owned source, tests, documentation and required artifacts on the existing feature branch. Stage explicit paths or hunks; never git add -A or include unrelated work. Keep generated local captures ignored, not committed.
Verify the commit with git log -1 and inspect git status again AFTER generating artifacts. Report the actual commit hash. Do not declare completion with uncommitted task changes. If unrelated edits remain, explain the exact paths and ask a concrete questionnaire question about ownership/disposition; do not silently include, stash, discard, reset, amend or delete them. A failed check or commit is a blocker to resolve or ask about, not a successful handoff. Never push or publish unless the enclosing workflow authorizes it.`;
function dirtyFiles(workspace){return execFileSync('git',['status','--porcelain=v1','--untracked-files=all'],{cwd:workspace,encoding:'utf8',maxBuffer:1024*1024}).trim();}
function assertClean(workspace){const files=dirtyFiles(workspace);if(files){const error=new Error('Uncommitted changes need review before creating the PR.');error.code='DIRTY_WORKTREE';throw error;}}
module.exports={instructions,dirtyFiles,assertClean};
