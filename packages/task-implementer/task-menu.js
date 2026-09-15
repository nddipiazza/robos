'use strict';
function taskMenu(task,{action,copy}) {
 const title=`${task.key} ${task.title}`.trim();
 return [
  {label:'Run Task…',enabled:!!task.activity?.planApproved&&!task.activity?.running,click:()=>action('run')},
  ...(task.activity?.running?[{label:'Stop running task',click:()=>action('stop')}]:[]),
  {label:'View task session',click:()=>action('session')},
  {label:'Open in Task Planner',click:()=>action('plan')},
  {label:'Open issue on task server',click:()=>action('issue')},
  {type:'separator'},
  {label:'Copy text',click:()=>copy([title,task.body,task.url].filter(Boolean).join('\n\n'))},
  {label:'Copy title',click:()=>copy(title)},
  {label:'Copy issue link',click:()=>copy(task.url)},
  {label:'Copy Markdown link',click:()=>copy(`[${title.replace(/([\\\[\]])/g,'\\$1')}](${task.url})`)},
  {type:'separator'},
  {label:'Refresh task list',click:()=>action('refresh')},
 ];
}
module.exports={taskMenu};
