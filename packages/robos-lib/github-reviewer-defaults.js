'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const project=require('./project-review-settings');
function groupDefaults(repo){
 const settings=JSON.parse(fs.readFileSync(path.join(os.homedir(),'.config/robos/settings.json'),'utf8'));
 const roots=[__dirname,process.env.ROBOS_HOME&&path.join(process.env.ROBOS_HOME,'packages/robos-lib'),path.join(os.homedir(),'.hermetiq/robos/packages/robos-lib')].filter(Boolean);
 const root=roots.find(r=>fs.existsSync(path.join(r,'code-reviewer-group.js'))&&fs.existsSync(path.join(r,'git-project-graphs.js')));
 const id=settings.default_code_reviewer_group||settings.review_handoff?.[repo.split('/')[0].toLowerCase()]?.groupId;
 if(!id)return {reviewers:[],source:'No default reviewer group configured'};
 if(!root)throw Error('RobOS reviewer directory is unavailable.');
 const nodes=require(path.join(root,'git-project-graphs')).catalog().nodes,group=nodes.find(n=>n['@id']===id);
 if(!group)throw Error('The configured reviewer group is unavailable.');
 const reviewers=(group['robos:hasMember']||[]).map(ref=>{const person=nodes.find(n=>n['@id']===(ref['@id']||ref));if(!person?.['robos:githubLogin'])throw Error('Add a GitHub login for '+(person?.['dcterms:title']||'the missing group member')+' in RobOS Users.');return person['robos:githubLogin'];});
 return {reviewers,source:'RobOS · '+(group['dcterms:title']||'Code Reviewers')};
}
function resolve(repo,author,{settings=project.read(repo),group=()=>groupDefaults(repo)}={}){
 const defaults=settings.githubReviewers?.length?{reviewers:settings.githubReviewers,source:'Git Projects · '+repo}:group();
 const seen=new Set(),reviewers=project.validateGitHubReviewers(defaults.reviewers).filter(login=>{const key=login.toLowerCase();if(key===String(author||'').toLowerCase()||seen.has(key))return false;seen.add(key);return true;});
 return {...defaults,reviewers};
}
module.exports={resolve};
