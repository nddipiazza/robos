'use strict';
const crypto=require('node:crypto');
const path=require('node:path');
const {execFile}=require('node:child_process');
const Papa=require('papaparse');
const cents=s=>{ if(!/^-?\d+\.\d{2}$/.test(String(s))) throw new Error('Enter a decimal amount with two places.'); const n=Math.round(Number(s)*100);if(!Number.isSafeInteger(n))throw new Error('Amount exceeds the supported range.');return n; };
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
class Household {
  constructor(files){this.files=files;this.family=null;this.transactions=[];this.documents=[];this.date='2025-12-31';this.audit=[];this.tax=null;}
  allowed(name,buffer){if(!this.files[name]||digest(buffer)!==digest(this.files[name]))throw new Error('Only the supplied synthetic fixtures are allowed. Production imports are locked.');}
  importFile(name,buffer){
    this.allowed(name,buffer);
    if(name==='family.json'){
      if(this.family) return {added:0,message:'Family already onboarded.'};
      this.family=JSON.parse(buffer);return {added:1,message:'Family members, placements and six accounts onboarded.'};
    }
    if(!this.family)throw new Error('Onboard the family first.');
    const account=name.replace('.csv','');
    if(!this.family.accounts.some(a=>a.id===account))throw new Error('Unknown account.');
    const parsed=Papa.parse(buffer.toString(),{header:true,skipEmptyLines:true});
    if(parsed.errors.length)throw new Error('Invalid statement CSV.');
    let added=0;
    for(const row of parsed.data){
      if(this.transactions.some(t=>t.id===row.id))continue;
      this.transactions.push({...row,account,amount:cents(row.amount),splits:[]}); added++;
    }
    this.tax=null;return {added,message:`${added} new transactions; ${parsed.data.length-added} duplicates skipped.`};
  }
  categorize(id,category){
    if(!['Household','Education','Groceries','Healthcare','Uncategorized'].includes(category))throw new Error('Unknown category.');
    const row=this.transactions.find(t=>t.id===id);if(!row)throw new Error('Unknown transaction.');
    row.category=category;this.tax=null;
  }
  split(id,household,education){
    const row=this.transactions.find(t=>t.id===id);if(!row||row.kind!=='expense')throw new Error('Select an expense.');
    const a=cents(household),b=cents(education);
    if(a<0||b<0||a+b!==-row.amount)throw new Error('Split amounts must equal the original purchase.');
    row.splits=[{category:'Household',amount:a},{category:'Education',amount:b}];this.tax=null;
  }
  advance(date){if(date!=='2026-02-15')throw new Error('This scenario advances to February 15, 2026.');this.date=date;}
  async importDocument(name,buffer){
    this.allowed(name,buffer);if(!this.family)throw new Error('Onboard the family first.');
    if(!name.endsWith('.pdf'))throw new Error('Use a supported synthetic PDF.');
    if(this.documents.some(d=>d.id===name))return {message:'Document already imported.'};
    const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
    const pdf=await getDocument({data:new Uint8Array(buffer),useSystemFonts:true}).promise;
    let doc;
    try {
      const page=await pdf.getPage(1);const text=await page.getTextContent();
      const tokens=text.items.filter(t=>t.str.trim());
      const labels=name==='interest.pdf'?[['interest','Box 1 - Interest income']]:[['wages','Box 1 - Wages'],['withholding','Box 2 - Federal withholding']];
      const fields=labels.map(([key,label])=>{
        const index=tokens.findIndex(t=>t.str===label);const item=tokens[index+1];
        if(index<0||!item)throw new Error('A critical PDF field was not found.');
        const value=/^\d+\.\d{2}$/.test(item.str)?item.str:'';
        return {key,label,raw:item.str,value,confidence:value?1:0.25,page:1,box:{x:item.transform[4],y:500-item.transform[5]-22,width:Math.max(item.width,100),height:30}};
      });
      doc={id:name,title:name==='maya-w2.pdf'?'Maya · W-2':name==='jordan-w2.pdf'?'Jordan · W-2':'Family reserve · 1099-INT',form:name==='interest.pdf'?'1099-INT':'W-2',taxYear:2025,fields,approved:false,parser:'PDF.js 5.4.624 · embedded text'};
    } finally {await pdf.destroy();}
    this.documents.push(doc);this.tax=null;return {message:'PDF text extracted. Review every critical field.'};
  }
  reviewDocument(id,values){
    const doc=this.documents.find(d=>d.id===id);if(!doc)throw new Error('Unknown document.');
    const next=doc.fields.map(f=>{const value=values[f.key];if(cents(value)<0)throw new Error('This scenario requires nonnegative document values.');return {...f,value};});
    for(const field of next)this.audit.push({document:id,field:field.key,original:doc.fields.find(f=>f.key===field.key).value,value:field.value,reviewer:'Synthetic household adult'});
    doc.fields=next;doc.approved=true;this.tax=null;
  }
  async calculate(confirmed=true){
    if(this.date!=='2026-02-15')throw new Error('Advance to February before preparing the prior year.');
    if(this.documents.length!==3||this.documents.some(d=>!d.approved))throw new Error('Review and approve all three documents before calculating.');
    if(!confirmed)throw new Error('Confirm the supported synthetic family scenario first.');
    const value=(doc,key)=>Number(doc.fields.find(f=>f.key===key).value);
    const wages=this.documents.filter(d=>d.form==='W-2').reduce((s,d)=>s+value(d,'wages'),0);
    const withheld=this.documents.filter(d=>d.form==='W-2').reduce((s,d)=>s+cents(d.fields.find(f=>f.key==='withholding').value),0);
    const inputs={year:2025,filing_status:'Married/Joint',num_dependents:2,w2_income:wages,taxable_interest:value(this.documents.find(d=>d.form==='1099-INT'),'interest')};
    if(inputs.w2_income+inputs.taxable_interest>400000)throw new Error('Child-credit phaseout is outside this supported synthetic scenario.');
    const python=process.env.HOUSEHOLD_PYTHON||path.join(__dirname,'../.venv/bin/python');
    // The third-party engine may use temporary files; keep those in memory-backed /dev/shm.
    const result=await new Promise((resolve,reject)=>{
      const proc=execFile(python,[path.join(__dirname,'tax.py')],{env:{...process.env,TMPDIR:'/dev/shm'},maxBuffer:1024*1024,timeout:15000},(err,out)=>err?reject(new Error('Tax engine unavailable; no fallback estimate was substituted.')):resolve(JSON.parse(out)));
      proc.stdin.end(JSON.stringify(inputs));
    });
    // Explicit scenario supplement: TenForty does not apply child credits from num_dependents.
    // Two confirmed eligible US children under 17, full-year residents, AGI below MFJ phaseout.
    const childCredit=Math.min(440000,Math.round(result.result.federal_total_tax*100));
    const federalTax=Math.round(result.result.federal_total_tax*100)-childCredit;
    this.tax={inputs,result:result.result,engine:`TenForty ${result.version} / OpenTaxSolver`,status:'estimate',childCredit,federalTax,withheld,refund:withheld-federalTax,
      limitation:'Synthetic federal scenario only. Child credits are an explicit scenario supplement; no state return or IRS submission.'};
    return this.tax;
  }
  snapshot(){
    const accounts=(this.family?.accounts||[]).map(a=>({...a,balance:a.opening+this.transactions.filter(t=>t.account===a.id).reduce((s,t)=>s+t.amount,0)}));
    const expenses=-this.transactions.filter(t=>['expense','refund'].includes(t.kind)).reduce((s,t)=>s+t.amount,0);
    const categories={};for(const row of this.transactions.filter(t=>['expense','refund'].includes(t.kind))){
      if(row.splits.length)for(const part of row.splits)categories[part.category]=(categories[part.category]||0)+part.amount;
      else categories[row.category]=(categories[row.category]||0)-row.amount;
    }
    return {family:this.family,date:this.date,accounts,transactions:this.transactions,documents:this.documents,audit:this.audit,tax:this.tax,categories,
      summary:{expenses,income:this.transactions.filter(t=>t.kind==='income').reduce((s,t)=>s+t.amount,0),netWorth:accounts.reduce((s,a)=>s+a.balance,0),donations:categories.Donations||0,unreviewed:this.transactions.filter(t=>t.category==='Uncategorized').length,transfers:this.transactions.filter(t=>t.kind==='transfer'&&t.amount<0).reduce((s,t)=>s-t.amount,0)},
      storage:{mode:'Synthetic sandbox · memory only',productionEnabled:false,reason:'Approved RobOS cloud-provider binding is not connected.'}};
  }
}
module.exports={Household,cents};
