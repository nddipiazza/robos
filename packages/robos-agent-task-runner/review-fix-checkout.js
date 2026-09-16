'use strict';
// Serialized into the sandbox bootstrap; keep this function self-contained.
function checkoutReviewFix(cp,root,fix,env){
 if(!Number.isSafeInteger(fix.number)||fix.number<1||!/^([a-f0-9]{40}|[a-f0-9]{64})$/.test(fix.head))throw Error('Invalid reviewed PR revision.');
 cp.execFileSync('git',['check-ref-format','--branch',fix.branch],{stdio:'ignore'});
 cp.execFileSync('git',['-C',root,'fetch','--depth','1','origin','refs/pull/'+fix.number+'/head'],{stdio:'ignore',env});
 const head=cp.execFileSync('git',['-C',root,'rev-parse','FETCH_HEAD'],{encoding:'utf8'}).trim();
 if(head!==fix.head)throw Error('PR changed before checkout. Reload the review.');
 cp.execFileSync('git',['-C',root,'checkout','-b',fix.branch,'FETCH_HEAD'],{stdio:'ignore'});
}
module.exports={checkoutReviewFix};
