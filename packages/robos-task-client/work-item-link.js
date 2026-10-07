'use strict';
// Work-item URLs belong to the task server, not the repository containing code.
function workItemLink(task = {}) {
 const value=task.url || task.taskServerUrl || task.issueUrl;
 let url;
 try {url=new URL(value);if(!['https:','http:'].includes(url.protocol))return null;} catch {return null;}
 const key=String(task.key || (task.number ? '#'+task.number : task.id || 'Task'));
 return {key,title:task.summary || task.title || key,url:url.href,type:task.issueType || task.type || 'task',status:task.status || 'Linked'};
}
module.exports={workItemLink};
