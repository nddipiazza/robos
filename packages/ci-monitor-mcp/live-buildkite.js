'use strict';
const {Buildkite}=require('../robos-lib/ci/buildkite');
class LiveBuildkiteService {
 constructor({config=()=>require('../robos-lib/ci/connections').read().buildkite,client=config=>new Buildkite(config)}={}){this.config=config;this.client=client;}
 connection(){const config=this.config();if(!config)throw Error('Configure Buildkite in CI Monitor before using CI tools.');return config;}
 async listRuns(filters={}){
  const config=this.connection(),rows=await this.client(config).list();
  return rows.map(r=>({...r,id:'buildkite:'+r.repo.replace('/',':')+':'+r.id,status:r.conclusion==='success'?'SUCCESS':r.conclusion==='failure'?'FAILURE':r.conclusion==='cancelled'?'CANCELLED':r.status==='blocked'?'BLOCKED':'RUNNING',updatedAt:r.updated})).filter(r=>(!filters.branch||r.branch===filters.branch)&&(!filters.status||r.status.toLowerCase()===filters.status.toLowerCase()));
 }
 async getStatus(branch='main'){return (await this.listRuns({branch}))[0]||null;}
 target(runId){const m=String(runId).match(/^buildkite:([\w-]+):([\w-]+):(\d+)$/),config=this.connection();if(!m||m[1]!==config.org||config.pipeline&&m[2]!==config.pipeline)throw Error('Use a Buildkite run ID from robos_ci_list_runs.');return {client:this.client({...config,pipeline:m[2]}),number:Number(m[3])};}
 async getLogs(runId){const {client,number}=this.target(runId);return (await client.detail(number)).failedLog||'No failed job logs in this build.';}
 async getFailures(runId){const {client,number}=this.target(runId);const result=await client.detail(number);return {build:result.number,commit:result.head,jobs:result.jobs.filter(j=>j.conclusion==='failure'),excerpt:result.failureExcerpt,artifactsUrl:result.artifactsUrl};}
 retryRun(){throw Error('Buildkite integration is read-only. Open the build in Buildkite to explicitly retry; no run was retried.');}
 getDeployments(){return [];}
}
module.exports={LiveBuildkiteService};
