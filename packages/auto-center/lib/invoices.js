'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {promisify}=require('node:util'),{execFile}=require('node:child_process');const run=promisify(execFile);
function ocrRuntime(){const local=path.join(os.homedir(),'.robos/tools/ocr');return fs.existsSync(path.join(local,'usr/bin/tesseract'))?{bin:path.join(local,'usr/bin/tesseract'),env:{...process.env,LD_LIBRARY_PATH:[path.join(local,'usr/lib/x86_64-linux-gnu'),process.env.LD_LIBRARY_PATH].filter(Boolean).join(':'),TESSDATA_PREFIX:path.join(local,'usr/share/tesseract-ocr/5/tessdata')}}:{bin:'tesseract',env:process.env};}
async function scan(file,root){
 const extension=path.extname(file).toLowerCase();if(!['.png','.jpg','.jpeg','.pdf'].includes(extension))throw new Error('Choose a PNG, JPEG or PDF invoice');
 const info=fs.statSync(file);if(!info.isFile()||info.size>25*1024*1024)throw new Error('Invoice must be a file under 25 MiB');
 const bytes=fs.readFileSync(file),digest=crypto.createHash('sha256').update(bytes).digest('hex');
 if(extension==='.pdf'&&!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))throw new Error('Invalid PDF signature');
 if(extension==='.png'&&!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('Invalid PNG signature');
 if(['.jpg','.jpeg'].includes(extension)&&!(bytes[0]===255&&bytes[1]===216))throw new Error('Invalid JPEG signature');
 const token=crypto.randomUUID();const staging=path.join(root,'pending-invoices',token);fs.mkdirSync(staging,{recursive:true,mode:0o700});
 const original=path.join(staging,'original'+extension);fs.writeFileSync(original,bytes,{mode:0o600});let text='',method='OCR';
 if(extension==='.pdf'){
  try{text=(await run('pdftotext',['-layout',original,'-'],{timeout:30000,maxBuffer:1024*1024})).stdout;}catch(error){throw new Error('PDF text extraction requires Poppler (pdftotext): '+error.message);}
  if(text.trim().length>30)method='PDF text extraction';
 }
 if(!text.trim()||method==='OCR'){
  const runtime=ocrRuntime();let images=[original];
  if(extension==='.pdf'){
   const meta=(await run('pdfinfo',[original],{timeout:30000,maxBuffer:1024*1024})).stdout;const pages=Number(meta.match(/Pages:\s+(\d+)/)?.[1]);if(!pages||pages>10)throw new Error('Scanned PDFs support up to 10 pages; split longer invoices before import');
   await run('pdftoppm',['-r','150','-png',original,path.join(staging,'page')],{timeout:90000,maxBuffer:1024*1024});images=fs.readdirSync(staging).filter(f=>/^page-.*\.png$/.test(f)).sort().map(f=>path.join(staging,f));
  }
  try{for(const image of images)text+=(await run(runtime.bin,[image,'stdout','--psm','6'],{env:runtime.env,timeout:60000,maxBuffer:1024*1024})).stdout+'\n';}catch(error){throw new Error('Invoice OCR requires Tesseract and English language data: '+error.message);}
 }
 if(!text.trim())throw new Error('No text recognized; try a clearer scan');
 const record={token,sha256:digest,extension,originalName:path.basename(file),method,text:text.slice(0,50000)};fs.writeFileSync(path.join(staging,'review.json'),JSON.stringify(record),{mode:0o600});
 return {...record,preview:extension==='.pdf'?null:`data:image/${extension==='.png'?'png':'jpeg'};base64,${bytes.toString('base64')}`};
}
function accept(root,token,expectedHash){if(!/^[a-f0-9-]{36}$/.test(token))throw new Error('Invalid invoice review');const dir=path.join(root,'pending-invoices',token);const review=JSON.parse(fs.readFileSync(path.join(dir,'review.json')));const bytes=fs.readFileSync(path.join(dir,'original'+review.extension));const actual=crypto.createHash('sha256').update(bytes).digest('hex');if(actual!==review.sha256||actual!==expectedHash)throw new Error('Invoice review changed; scan it again');const relative='documents/'+actual+review.extension;fs.mkdirSync(path.join(root,'documents'),{recursive:true,mode:0o700});fs.writeFileSync(path.join(root,relative),bytes,{mode:0o600});return {...review,path:relative};}
module.exports={scan,accept,ocrRuntime};
