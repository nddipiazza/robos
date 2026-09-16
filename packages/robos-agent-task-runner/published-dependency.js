'use strict';
// Local aliases and detached checkouts are valid for an unchanged dependency.
// Compare with the live PR head, never a cached head or an arbitrary remote SHA.
async function publishedDependency(state,repo,head,gh){
 for(const pr of state.prs||[]){
  if(!pr.url?.toLowerCase().startsWith(('https://github.com/'+repo+'/pull/').toLowerCase()))continue;
  try{const live=await gh(['pr','view',pr.url,'--json','headRefOid']);if(live.headRefOid===head)return true;}catch{}
 }
 return false;
}
module.exports={publishedDependency};
