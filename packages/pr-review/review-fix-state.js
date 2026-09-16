'use strict';
// Small shared contract for completion notifications; no network or UI side effects.
(function(root){
 function completion(watch,state,currentUrl,isOpen){
  if(!watch)return 'idle';
  if(state.reviewFix?.id!==watch.id)return 'superseded';
  if(['provisioning','implementing','planning-agent'].includes(state.phase))return 'running';
  if(!isOpen||currentUrl!==watch.pr.url)return 'away';
  return state.phase==='review'?'refresh':'error';
 }
 if(typeof module!=='undefined')module.exports={completion};else root.robosReviewFixCompletion=completion;
})(typeof window==='undefined'?globalThis:window);
