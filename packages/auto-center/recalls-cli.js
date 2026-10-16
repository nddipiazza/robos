#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFileSync}=require('node:child_process');
const {review,apply}=require('./lib/recalls');
const root=process.env.ROBOS_AUTO_CACHE||path.join(os.homedir(),'.robos/auto-scrape');
if(process.argv.includes('--apply-reviewed')){const at=process.argv.indexOf('--apply-reviewed');console.log(JSON.stringify(apply(root,process.argv[at+1],process.argv[at+2])));process.exit(0);}
let plan;
if(process.argv.includes('--plan'))plan=JSON.parse(fs.readFileSync(process.argv[process.argv.indexOf('--plan')+1]));
else plan=JSON.parse(execFileSync('python3',[path.join(__dirname,'recall_data.py'),'prepare',root],{maxBuffer:1024*1024,timeout:300000}));
const r=review(root,plan.build);console.log(JSON.stringify({build:r.build,reviewId:r.reviewId,records:r.records,counts:r.counts,nodes:r.nodes}));
if(process.argv.includes('--apply'))console.log(JSON.stringify(apply(root,r.build,r.reviewId,shard=>process.stderr.write('Applied recall shard '+shard+'\n'))));
