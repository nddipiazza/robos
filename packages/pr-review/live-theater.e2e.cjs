'use strict';
const assert=require('node:assert/strict');
(async()=>{
 const r=await fetch('http://localhost:19129/eval',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({js:"({real:theaterContext.real,url:theaterContext.pr.url,files:theaterContext.fileDiffs.length,quiz:theaterContext.elearning.quiz.length,answered:document.querySelectorAll('#theater-quiz-questions input:checked').length,mergeDisabled:document.querySelector('#btn-theater-submit-review').disabled,stages:document.querySelectorAll('.theater-stage').length,theaterVisible:!document.querySelector('#pr-review-theater').classList.contains('hidden')})"})});
 const {result:s}=await r.json();assert(s.real);assert.equal(s.url,'https://github.com/Hermetiq/MVP/pull/685');assert.equal(s.files,0);assert.equal(s.answered,0);assert.equal(s.quiz,5);assert(s.mergeDisabled);assert.equal(s.stages,6);assert(s.theaterVisible);
 console.log('Existing six-stage theater displays real draft PR #685; diff and merge remain locked for human review.');
})().catch(e=>{console.error(e);process.exitCode=1;});
