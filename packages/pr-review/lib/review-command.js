'use strict';
const {promisify}=require('node:util');
const exec=promisify(require('node:child_process').execFile);
module.exports=async function run(bin,args,options={}){
 if(bin==='gh')return require('../../robos-task-client/github-command').runGitHub(args,{repo:options.repo});
 return (await exec(bin,args,{...options,maxBuffer:4*1024*1024})).stdout;
};
