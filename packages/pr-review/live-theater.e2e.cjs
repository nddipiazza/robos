'use strict';
const assert=require('node:assert/strict');
async function evaluate(js){const response=await fetch('http://localhost:19129/eval',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({js})});const data=await response.json();if(data.error)throw Error(data.error);return data.result;}
(async()=>{
 const initial=await evaluate(`({real:theaterContext.real,url:theaterContext.pr.url,files:theaterContext.fileDiffs.length,required:theaterContext.reviewPolicy.requireCompletionCertificate,quizParent:document.querySelector('#theater-quiz-card').parentElement.id,stages:document.querySelectorAll('.theater-stage').length})`);
 assert(initial.real);assert(initial.url.startsWith('https://github.com/Hermetiq/'));assert(initial.files>0);assert.equal(initial.required,false);assert.equal(initial.quizParent,'stage-7');assert.equal(initial.stages,7);
 try {
  const diff=await evaluate(`window.setTheaterStage(3);({visible:document.querySelector('#stage-3').classList.contains('active'),locked:!document.querySelector('#diff-anti-rubber-stamp-lock').classList.contains('hidden'),passed:theaterContext.validationGates.elearningPassed})`);
  assert(diff.visible);assert(!diff.locked);assert(!diff.passed);
  const quiz=await evaluate(`window.setTheaterStage(7);({blocked:!document.querySelector('#stage-7').classList.contains('active')})`);assert(quiz.blocked);
  const merge=await evaluate(`window.setTheaterStage(2);window.setTheaterStage(5);document.querySelector('#real-evidence-reviewed').click();document.querySelector('#skip-knowledge-check').click();({signoff:document.querySelector('#stage-6').classList.contains('active'),disabled:document.querySelector('#btn-theater-submit-review').disabled,checksReady:theaterContext.validationGates.ciPassed,passed:theaterContext.validationGates.elearningPassed,locked:!document.querySelector('#theater-signoff-lock-banner').classList.contains('hidden')})`);
  assert(merge.signoff);assert(!merge.passed);assert(!merge.locked);assert.equal(merge.disabled,!merge.checksReady);
  const after=await evaluate(`window.setTheaterStage(7);({visible:document.querySelector('#stage-7').classList.contains('active')})`);assert(after.visible);
  console.log('Live Hermetiq PR: diff accessible before quiz; quiz follows review; optional certificate does not block merge. No review submitted or PR merged.');
 } finally { await evaluate(`(async()=>{await window.openPRReviewTheater(theaterContext.pr);return true;})()`); }
})().catch(e=>{console.error(e);process.exitCode=1;});
