'use strict';
const http=require('node:http');const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {Household}=require('./lib/household');const {fixtures}=require('./lib/fixtures');
const ROOT=__dirname;
async function start(port=0){
  const files=await fixtures();const sessions=new Map();
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'");
    const send=(status,value,type='application/json')=>{res.writeHead(status,{'Content-Type':type});res.end(type==='application/json'?JSON.stringify(value):value);};
    try{
      const url=new URL(req.url,'http://127.0.0.1');const cookie=req.headers.cookie?.match(/(?:^|; )household=([a-f0-9]{48})(?:;|$)/)?.[1];
      let session=sessions.get(cookie);
      if(url.pathname==='/'&&req.method==='GET'){
        if(!session){const id=crypto.randomBytes(24).toString('hex');session={state:new Household(files),token:crypto.randomBytes(24).toString('hex')};sessions.set(id,session);res.setHeader('Set-Cookie',`household=${id}; HttpOnly; SameSite=Strict; Path=/`);}
        return send(200,fs.readFileSync(path.join(ROOT,'renderer/index.html'),'utf8').replace('__TOKEN__',session.token),'text/html');
      }
      if(url.pathname.startsWith('/api/')){
        if(!session)return send(401,{error:'Start a new synthetic household session.'});
        if(req.method==='GET'&&url.pathname==='/api/state')return send(200,session.state.snapshot());
        if(req.method==='GET'&&url.pathname.startsWith('/api/pdf/')){
          const name=decodeURIComponent(url.pathname.slice('/api/pdf/'.length));
          if(!session.state.documents.some(d=>d.id===name))return send(404,{error:'Unknown document.'});
          return send(200,files[name],'application/pdf');
        }
        const origin=`http://${req.headers.host}`;
        if(req.method!=='POST'||req.headers['x-household-token']!==session.token||req.headers.origin!==origin)return send(403,{error:'This action requires the current household session.'});
        let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>2*1024*1024)return send(413,{error:'File exceeds sandbox limit.'});}
        const body=JSON.parse(raw);const h=session.state;let result={};
        if(url.pathname==='/api/import')result=body.name.endsWith('.pdf')?await h.importDocument(body.name,Buffer.from(body.data,'base64')):h.importFile(body.name,Buffer.from(body.data,'base64'));
        else if(url.pathname==='/api/category')h.categorize(body.id,body.category);
        else if(url.pathname==='/api/split')h.split(body.id,body.household,body.education);
        else if(url.pathname==='/api/advance')h.advance(body.date);
        else if(url.pathname==='/api/review')h.reviewDocument(body.id,body.values);
        else if(url.pathname==='/api/calculate')result=await h.calculate(body.confirmed===true);
        else return send(404,{error:'Unknown action.'});
        return send(200,{...result,state:h.snapshot()});
      }
      const staticFiles={'/app.js':['renderer/app.js','text/javascript'],'/style.css':['renderer/style.css','text/css'],
        '/vendor/pdf.mjs':['node_modules/pdfjs-dist/build/pdf.mjs','text/javascript'],
        '/vendor/pdf.worker.mjs':['node_modules/pdfjs-dist/build/pdf.worker.mjs','text/javascript']};
      if(staticFiles[url.pathname]){const [file,type]=staticFiles[url.pathname];return send(200,fs.readFileSync(path.join(ROOT,file)),type);}
      return send(404,{error:'Not found.'});
    }catch(e){return send(400,{error:e.message});}
  });
  await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));return server;
}
if(require.main===module)start(Number(process.env.PORT||4317)).then(s=>console.log(`Synthetic Household sandbox: http://127.0.0.1:${s.address().port}`));
module.exports={start};
