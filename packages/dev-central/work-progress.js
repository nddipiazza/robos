'use strict';
const PHASES = {
  new:'Not started', planning:'Ready to plan', provisioning:'Preparing sandbox',
  'planning-agent':'Agent planning', 'plan-review':'Awaiting plan review',
  'plan-approved':'Plan approved', implementing:'Agent implementing',
  'checking-pr':'Checking pull request', review:'Awaiting PR review',
  merged:'Merged', complete:'Complete', stopped:'Stopped', failed:'Failed',
  'implementation-needs-attention':'Implementation needs attention',
};
function progress(session = {}, alive = pid => { try { process.kill(pid,0); return true; } catch { return false; } }) {
  const running = !!session.workerPid && alive(session.workerPid);
  const interrupted = !!session.workerPid && !running;
  const started = !!(session.workOpenedAt || session.workerPid || session.plan || session.phase && session.phase !== 'new');
  const phase = interrupted ? 'interrupted' : (session.phase && session.phase!=='new' ? session.phase : session.plan ? 'plan-review' : started ? 'launch-ready' : 'new');
  const stages = [['planning','Plan'],['plan-review','Review plan'],['implementing','Implement'],['review','Review PR'],['merged','Merge']];
  const stage = ['planning','planning-agent','provisioning','launch-ready'].includes(phase) ? (session.approvedPlanHash ? 'implementing' : 'planning') : phase === 'plan-approved' ? 'implementing' : phase === 'checking-pr' ? 'review' : phase === 'complete' ? 'merged' : phase;
  return {started,running,phase,label:interrupted?'Agent interrupted':PHASES[phase] || (phase==='launch-ready'?'Task Runner opened':phase),stages:stages.map(([id,label])=>({id,label,current:id===stage})),updatedAt:session.updatedAt,error:session.error || null};
}
const {ticketWorkflow}=require('../robos-lib/task-workflow');
module.exports={progress,ticketWorkflow};
