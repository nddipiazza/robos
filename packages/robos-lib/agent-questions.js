'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{createHash}=require('node:crypto');
class AgentQuestions {
 constructor(directory=path.join(os.homedir(),'.robos','agent-questions')){this.directory=directory;fs.mkdirSync(directory,{recursive:true,mode:0o700});}
 file(id){if(!/^[a-f0-9]{24}$/.test(id||''))throw Error('Invalid questionnaire.');return path.join(this.directory,id+'.json');}
 read(id){return JSON.parse(fs.readFileSync(this.file(id),'utf8'));}
 save(item){const file=this.file(item.id);fs.writeFileSync(file+'.tmp',JSON.stringify(item,null,2),{mode:0o600});fs.renameSync(file+'.tmp',file);return item;}
 create({source,kind,sessionId,eventId,context,questions,agentName}){
  const id=createHash('sha256').update(JSON.stringify([source,kind,sessionId,eventId])).digest('hex').slice(0,24);try{return {created:false,item:this.read(id)};}catch(e){if(e.code!=='ENOENT')throw e;}
  const prompts=Array.isArray(questions)?questions.filter(q=>typeof q==='string'&&q.trim()).slice(0,5):[];
  if(!prompts.length)throw Error('A questionnaire requires specific agent questions.');
  return {created:true,item:this.save({id,source,kind,sessionId,eventId,agentName,context:String(context||'').slice(0,16000),questions:prompts.map((prompt,i)=>({id:'q'+i,prompt:prompt.slice(0,2000)})),status:'pending',createdAt:Date.now()})};
 }
 answer(id,answers){const item=this.read(id);if(item.status!=='pending')throw Error('This questionnaire has already been submitted.');const normalized={};for(const q of item.questions){const a=answers?.[q.id];if(typeof a!=='string'||!a.trim()||a.length>8000)throw Error('Answer each question (up to 8,000 characters).');normalized[q.id]=a.trim();}return this.save({...item,answers:normalized,status:'answered',answeredAt:Date.now()});}
 list(){return fs.readdirSync(this.directory).filter(f=>/^[a-f0-9]{24}\.json$/.test(f)).flatMap(f=>{try{return [this.read(f.slice(0,-5))];}catch{return [];}});}
}
module.exports={AgentQuestions};
