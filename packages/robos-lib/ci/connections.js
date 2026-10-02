'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const file=path.join(os.homedir(),'.config','robos','ci-providers.json');
function read(){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw Error('Cannot read CI provider settings.');}}
function saveBuildkite(input){const buildkite=require('./buildkite').validate(input),config={...read(),buildkite};fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file+'.tmp',JSON.stringify(config,null,2)+'\n',{mode:0o600});fs.renameSync(file+'.tmp',file);return buildkite;}
function forBuild(url){const identity=require('./buildkite').parseBuildURL(url);if(!identity)return null;const saved=read().buildkite;return {...identity,passPath:saved?.org===identity.org?saved.passPath:'buildkite-api-access-token'};}
module.exports={read,saveBuildkite,forBuild};
