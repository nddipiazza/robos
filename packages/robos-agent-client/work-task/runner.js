'use strict';
const core=require('./core');
const [mode,url,electron]=process.argv.slice(2);
(async()=>{try{if(mode==='/work-task')await core.route(url,electron);else await core.runWorker(url,mode,electron);}catch(error){core.save(url,{phase:'failed',error:error.message,workerPid:null});console.error(error.stack);process.exitCode=1;}})();
