'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const root=__dirname;
function discover(sessionRoot){
 const sessions=[];
 if(!fs.existsSync(sessionRoot))return sessions;
 for(const entry of fs.readdirSync(sessionRoot,{withFileTypes:true})){
  if(!entry.isDirectory())continue;
  const evidence=path.join(sessionRoot,entry.name,'evidence');
  if(!fs.existsSync(evidence)||fs.lstatSync(evidence).isSymbolicLink())continue;
  const files=[];let visited=0;
  function walk(dir,depth=0){
   if(depth>8)return;
   for(const item of fs.readdirSync(dir,{withFileTypes:true})){
    if(++visited>3000)return;
    if(item.isSymbolicLink()||item.name.startsWith('.'))continue;
    const full=path.join(dir,item.name);
    if(item.isDirectory())walk(full,depth+1);
    else if(item.isFile()&&/\.(webm|mp4|html?)$/i.test(item.name))files.push({path:path.relative(evidence,full),video:/\.(webm|mp4)$/i.test(item.name),modifiedAt:fs.statSync(full).mtime.toISOString()});
   }
  }
  walk(evidence);
  files.sort((a,b)=>b.modifiedAt.localeCompare(a.modifiedAt)||a.path.localeCompare(b.path));
  if(files.length)sessions.push({id:entry.name,root:fs.realpathSync(evidence),files,time:fs.statSync(evidence).mtime.toISOString()});
 }
 return sessions.sort((a,b)=>b.time.localeCompare(a.time));
}
function safeFile(root,relative){
 const target=fs.realpathSync(path.resolve(root,relative));
 if(!target.startsWith(root+path.sep)||!fs.statSync(target).isFile())throw Error('Invalid artifact path');
 return target;
}
async function start({sessions=[],title,head,checks=[],files=[]}){
 const token=crypto.randomBytes(24).toString('hex');
 const model={title,head,checks,files,sessions:sessions.map(s=>({id:s.id,time:s.time,files:s.files.map(f=>({...f,url:'artifact/'+encodeURIComponent(s.id)+'/'+f.path.split(path.sep).map(encodeURIComponent).join('/')}))}))};
 const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webm':'video/webm','.mp4':'video/mp4','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.zip':'application/zip'};
 const server=http.createServer((req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Content-Security-Policy',"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-src 'self'; connect-src 'self';");
  try{
   if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return;}
   const pathname=new URL(req.url,'http://localhost').pathname;
   const prefix='/'+token+'/';
   if(!pathname.startsWith(prefix)){res.writeHead(404).end();return;}
   const relative=decodeURIComponent(pathname.slice(prefix.length));
   if(relative==='data.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(model));return;}
   let file;
   if(relative.startsWith('artifact/')){
    const [,id,...parts]=relative.split('/'),session=sessions.find(s=>s.id===id);
    if(!session)throw Error('Unknown session');
    file=safeFile(session.root,parts.join('/'));
   }else{
    if(!['','index.html','viewer.js','viewer.css'].includes(relative))throw Error('Unknown resource');
    file=path.join(root,relative||'index.html');
   }
   const size=fs.statSync(file).size;res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.setHeader('Accept-Ranges','bytes');
   let start=0,end=size-1;
   if(req.headers.range){
    const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
    if(!range||Number(range[1])>=size){res.writeHead(416,{'Content-Range':'bytes */'+size}).end();return;}
    start=Number(range[1]);end=range[2]?Math.min(Number(range[2]),end):end;
    if(end<start){res.writeHead(416).end();return;}
    res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${size}`);
   }
   res.setHeader('Content-Length',Math.max(0,end-start+1));
   if(req.method==='HEAD'||size===0){res.end();return;}
   fs.createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);
  }catch{res.writeHead(404).end();}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 return {url:`http://127.0.0.1:${server.address().port}/${token}/`,close:()=>server.close()};
}
module.exports={discover,safeFile,start};
