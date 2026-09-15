'use strict';
// Used by initial course generation and the shared player's AI revisions.
const lessonPolicy=`Write a lesson, not an audit log or a reformatted project plan.
Organize around learner goals and prerequisite concepts, not the source document's headings.
Introduce the problem in plain language, define unfamiliar terms, and use a concrete example to explain the intended workflow. Teach why each step matters and how the learner recognizes success. Keep lessons focused and concise.
Source plans may contain agent execution notes, source-access reports, PR inventories, inspection limitations, timestamps, local clone paths, and verification-status tables. Those are provenance, NOT teaching material: omit them from lessons. Do not reproduce headings such as "Verified source status" or "Inspection limits", Source/Verified finding tables, HTTP access errors, comment counts, merge timestamps, sandbox transcripts, or statements about what the generating agent could not inspect.
Translate relevant technical findings into an explanation of the behavior to implement or check. Retain a source link only when it helps the learner perform the task; label it by purpose, not a bare issue number. Explain necessary unresolved product decisions where they affect the workflow, without repeating verification disclaimers. Clearly frame a planned workflow as intended behavior once; never invent completed implementation, tests, deployment, or approval.
Start with learning objectives and an approachable example. Explain concepts before asking questions about them. Use a few knowledge checks after their teaching material; the opening section must have no quiz or reflection requiring prior knowledge. Questions must test understanding of the workflow, not source-access status, issue numbers, or audit trivia.
Keep required reviewers, meaningful dependencies and acceptance criteria, explaining their role in delivery. Do not simply copy headings and checklist bullets into slides. Preserve the original source and evidence as metadata, outside learner-facing prose.`;
function assertLessonContent(modules){
 for(const m of modules){const text=m.title+'\n'+m.markdown;
  if(/(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*\*)?(?:Verified source status|Inspection limits|Source.access (?:report|status)|Agent execution log)\b/i.test(text)||/\|\s*Source\s*\|\s*Verified finding\s*\|/i.test(text))throw Error('The generated course contains a source audit instead of a lesson. Regenerate it; the saved course has not changed.');
 }
 return modules;
}
module.exports={lessonPolicy,assertLessonContent};
