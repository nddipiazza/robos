'use strict';
const core=require('./core');
const {references}=require('../../dev-central/task-board');
async function links(taskUrl,query=core.gh) {
  const id=core.identity(taskUrl);
  const task=await query(['issue','view',taskUrl,'--json','number,title,body,state,url']);
  const parents=references(task.body,'Parent Feature',id.repo).filter(url=>url!==taskUrl);
  const features=await Promise.all(parents.map(url=>query(['issue','view',url,'--json','number,title,body,state,url'])));
  return {task,features};
}
async function open(taskUrl,targetUrl,electron) {
  const related=await links(taskUrl);
  const issue=[related.task,...related.features].find(i=>i.url===targetUrl);
  if(!issue)throw Error('This plan is not linked to the reviewed task.');
  const plannerProjectId=core.plannerProject(targetUrl,issue);
  core.save(targetUrl,{issue,plannerProjectId});
  await core.launchApp('task-planner',targetUrl,electron);
  return {url:targetUrl};
}
module.exports={links,open};
