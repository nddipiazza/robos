'use strict';
// Provider links use the configured workspace and the actual send receipt.
function conversationLink(server,receipt){
 if(!server||!receipt)return null;
 if(server.provider==='slack'&&/^[CGD][A-Z0-9]+$/.test(receipt.channel||'')&&/^\d+\.\d+$/.test(receipt.ts||'')){
  let workspace;try{workspace=new URL(server.url);}catch{return null;}
  if(workspace.protocol!=='https:'||!workspace.hostname.endsWith('.slack.com'))return null;
  const root=receipt.threadTs||receipt.ts;if(!/^\d+\.\d+$/.test(root))return null;
  return `${workspace.origin}/archives/${receipt.channel}/p${receipt.ts.replace('.','')}?thread_ts=${encodeURIComponent(root)}&cid=${receipt.channel}`;
 }
 return null;
}
module.exports={conversationLink};
