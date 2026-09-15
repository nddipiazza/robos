'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const catalog=require('./connections'),{createManager}=require('./oauth'),{claimNotification}=require('../../robos-lib/notification-gate');
const port=19196,file=path.join(catalog.config,'mcp-remote-service-key');
function capability(){fs.mkdirSync(catalog.config,{recursive:true});try{fs.writeFileSync(file,crypto.randomBytes(32).toString('hex'),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}return fs.readFileSync(file,'utf8');}
function notify(server){return require('../../robos-lib/auth-notifications').report({kind:'mcp',id:server.id,name:server.name});}
async function serve(){const token=capability(),manager=createManager({notify,onConnected:server=>require('../../robos-lib/auth-notifications').resolve('mcp',server.id)}),server=http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
 const url=new URL(req.url,'http://127.0.0.1:'+port);
 if(req.method==='GET'&&/^\/oauth\/callback\/[a-f0-9]{24}$/.test(url.pathname)){
  try{await manager.callback(url.pathname.split('/').pop(),url.searchParams.get('state'),url.searchParams.get('code'),url.searchParams.get('error'));res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<title>RobOS MCP connected</title><script>history.replaceState(null,"",location.pathname)</script><h1>Connected to RobOS</h1><p>You can close this tab and return to your agent.</p>');}catch(e){res.writeHead(400,{'Content-Type':'text/plain'});res.end(e.message);}return;
 }
 const auth=Buffer.from(req.headers.authorization||''),expected=Buffer.from('Bearer '+token);if(auth.length!==expected.length||!crypto.timingSafeEqual(auth,expected)){res.writeHead(401);res.end();return;}
 if(req.method!=='POST'||url.pathname!=='/rpc'){res.writeHead(404);res.end();return;}
 let body='';req.on('data',b=>{body+=b;if(body.length>1024*1024)req.destroy();});req.on('end',async()=>{try{const {operation,args={}}=JSON.parse(body);let result;
 if(operation==='ping')result={ready:true};
 else if(operation==='list')result=catalog.options(args.provider).map(s=>({...s,...manager.status(s)}));
 else{const s=catalog.list().find(s=>s.id===args.serverId);if(!s)throw Error('MCP server is not imported.');if(operation==='login')result=await manager.login(s);else if(operation==='invoke')result=await manager.invoke(s,args.method,args.params||{});else throw Error('Unsupported MCP service request.');}
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,result}));}catch(e){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:false,error:e.message}));}});
 });server.on('error',e=>{if(e.code==='EADDRINUSE')process.exit(0);throw e;});server.listen(port,'127.0.0.1');}
let starting;
async function request(operation,args={}){const token=capability();async function send(op,input){const r=await fetch('http://127.0.0.1:'+port+'/rpc',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({operation:op,args:input}),signal:AbortSignal.timeout(90000)});if(!r.ok)throw Error('RobOS MCP service authentication failed.');const v=await r.json();if(!v.ok)throw Error(v.error);return v.result;}
 try{await send('ping',{});}catch(e){if(e.message!=='fetch failed')throw e;if(!starting)starting=(async()=>{const child=cp.spawn(process.execPath,[__filename,'--serve'],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},detached:true,stdio:'ignore'});child.on('error',()=>{});child.unref();for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,200));try{await send('ping',{});return;}catch{}}throw Error('RobOS MCP service could not start.');})().finally(()=>{starting=null;});await starting;}
 return send(operation,args);
}
if(require.main===module&&process.argv.includes('--serve'))serve();
module.exports={request,serve};
