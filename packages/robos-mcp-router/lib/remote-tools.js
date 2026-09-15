'use strict';
const {request}=require('./remote-service'),catalog=require('./connections');
function bridge(ids){const allowed=new Set(ids||[]),names=new Map();return async function call(operation,args={}){
 if(operation==='remote_tools'){
  names.clear();const tools=[];
  for(const s of catalog.list().filter(s=>allowed.has(s.id))){let cursor;try{do{const page=await request('invoke',{serverId:s.id,method:'tools/list',params:cursor?{cursor}:{}});for(const t of page.tools){const name='remote_'+catalog.key(s).slice(0,10)+'_'+t.name;if(name.length>128)continue;names.set(name,{serverId:s.id,tool:t.name});tools.push({...t,name,description:s.name+': '+(t.description||'')});}cursor=page.nextCursor;}while(cursor);}catch(e){const name='remote_'+catalog.key(s).slice(0,10)+'_connection_status';names.set(name,{serverId:s.id,connectionStatus:true,error:e.message});tools.push({name,description:s.name+': connection unavailable. '+e.message,inputSchema:{type:'object',properties:{}},annotations:{readOnlyHint:true}});}}
  return {tools};
 }
 if(operation==='remote_call'){const route=names.get(args.name);if(!route)throw Error('Remote MCP tool is not enabled in this agent.');if(route.connectionStatus){try{await request('invoke',{serverId:route.serverId,method:'tools/list'});await call('remote_tools');return {content:[{type:'text',text:'Connected. The MCP tool catalog is ready to refresh.'}]};}catch(e){return {isError:true,content:[{type:'text',text:e.message}]};}}return request('invoke',{serverId:route.serverId,method:'tools/call',params:{name:route.tool,arguments:args.arguments||{}}});}
 throw Error('Unknown remote MCP bridge operation.');
};}
module.exports={bridge};
