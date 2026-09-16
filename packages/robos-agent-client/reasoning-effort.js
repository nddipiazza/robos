'use strict';
function args(provider,effort){
 if(!effort)return [];
 if(provider!=='codex')throw Error('This provider does not expose configurable reasoning effort.');
 if(typeof effort!=='string'||! /^[a-z][a-z0-9_-]{0,30}$/.test(effort))throw Error('Invalid reasoning effort.');
 return ['-c','model_reasoning_effort='+JSON.stringify(effort)];
}
async function validate({provider,model,effort},catalog=require('./providers').models){
 args(provider,effort);if(!effort)return;
 if(!model)throw Error('Choose a model before setting reasoning effort.');
 const result=await catalog(provider);const selected=result.models.find(m=>m.id===model);
 if(!selected?.reasoningEfforts?.some(e=>e.id===effort))throw Error('This model does not list the selected effort. Refresh models and choose an available effort.');
}
module.exports={args,validate};
