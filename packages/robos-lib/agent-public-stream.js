'use strict';
const {StringDecoder}=require('node:string_decoder');
// Only public assistant text and tool activity labels cross into the chat UI.
class AgentPublicStream {
 constructor(provider,emit){this.provider=provider;this.emit=emit;this.buffer='';this.decoder=new StringDecoder('utf8');this.final='';}
 push(chunk){this.buffer+=this.decoder.write(chunk);let i;while((i=this.buffer.indexOf('\n'))>=0){this.line(this.buffer.slice(0,i));this.buffer=this.buffer.slice(i+1);}}
 end(){this.buffer+=this.decoder.end();if(this.buffer)this.line(this.buffer);this.buffer='';return this.final;}
 line(line){
  if(this.provider==='copilot'){this.final+=(this.final?'\n':'')+line;if(line.trim())this.emit({kind:'message',text:line});return;}
  let e;try{e=JSON.parse(line);}catch{return;}
  if(e.type==='result'){if(e.is_error)throw Error(e.result||'Agent failed');this.final=e.result||this.final;return;}
  if(e.type==='assistant')for(const c of e.message?.content||[]){if(c.type==='text'){this.final=c.text;this.emit({kind:'message',text:c.text});}else if(c.type==='tool_use')this.emit({kind:'activity',text:'Using '+c.name+'…'});}
  const item=e.item;
  if(e.type==='item.completed'&&item?.type==='agent_message'){this.final=item.text;this.emit({kind:'message',text:item.text});}
  if(e.type==='item.started'&&item?.type==='command_execution')this.emit({kind:'activity',text:'Running a local command.'});
  if(e.type==='item.started'&&item?.type==='mcp_tool_call')this.emit({kind:'activity',text:'Using '+item.tool+'…'});
 }
}
module.exports={AgentPublicStream};
