'use strict';
// Entirely invented family and files. Generated in memory, never read from a user's accounts.
const Papa = require('papaparse');
const {PDFDocument, StandardFonts, rgb} = require('pdf-lib');
let cached;
const family = {
  name:'The Rivera family', year:2025, state:'TX', filingStatus:'Married/Joint',
  members:[
    {id:'maya',name:'Maya Rivera',role:'Adult · RobOS user',age:38},
    {id:'jordan',name:'Jordan Rivera',role:'Adult · RobOS user',age:40},
    {id:'leo',name:'Leo Rivera',role:'Dependent · child',age:10},
    {id:'ava',name:'Ava Rivera',role:'Dependent · child',age:6}
  ],
  placements:[{dependent:'leo',type:'Shared custody',from:'2025-01-01',to:'2025-12-31',nights:365},
    {dependent:'ava',type:'Parental residence',from:'2025-01-01',to:'2025-12-31',nights:365}],
  accounts:[
    {id:'checking',name:'Everyday checking',type:'Checking',opening:1000000,expected:4228000},
    {id:'savings',name:'Family reserve',type:'Savings',opening:2000000,expected:2628800},
    {id:'visa',name:'Household card',type:'Credit card',opening:-50000,expected:-52500},
    {id:'loan',name:'Car loan',type:'Loan',opening:-1500000,expected:-1200000},
    {id:'brokerage',name:'Long-term investments',type:'Brokerage · cash contributions only',opening:1200000,expected:1440000},
    {id:'cash',name:'Cash wallet',type:'Cash',opening:20000,expected:104000}
  ]
};
async function taxPdf(name,form,rows) {
  const pdf=await PDFDocument.create();
  pdf.setCreationDate(new Date('2026-01-31T12:00:00Z')); pdf.setModificationDate(new Date('2026-01-31T12:00:00Z'));
  const font=await pdf.embedFont(StandardFonts.Helvetica);const page=pdf.addPage([612,500]);
  page.drawText('SYNTHETIC TEST DOCUMENT - NOT FOR FILING',{x:40,y:460,size:12,font,color:rgb(.6,.15,.1)});
  page.drawText(form+' | Tax year 2025',{x:40,y:425,size:23,font});
  page.drawText(name,{x:40,y:392,size:16,font});
  let y=340;
  for(const [label,value] of rows) {
    page.drawRectangle({x:35,y:y-12,width:540,height:45,borderWidth:1,borderColor:rgb(.75,.78,.8)});
    page.drawText(label,{x:45,y:y+12,size:11,font});
    page.drawText(value,{x:370,y,size:18,font}); y-=75;
  }
  page.drawText('Invented employer/bank. No SSN or bank account number.',{x:40,y:65,size:11,font});
  if(name.startsWith('Jordan')) page.drawText('Ambiguous letter O characters intentionally exercise manual review.',{x:40,y:40,size:10,font});
  return Buffer.from(await pdf.save());
}
async function build() {
  const files={'family.json':Buffer.from(JSON.stringify(family))}; const rows={};
  for(const a of family.accounts) rows[a.id]=[];
  const add=(account,month,day,amount,description,kind='expense',category='',pair='') =>
    rows[account].push({id:account+'-'+month+'-'+rows[account].length,date:`2025-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,amount,description,kind,category,pair});
  const transfer=(month,from,to,amount,label)=>{
    const pair=`${month}-${from}-${to}`;
    add(from,month,20,(-amount).toFixed(2),label,'transfer','',pair);
    add(to,month,20,amount.toFixed(2),label,'transfer','',pair);
  };
  for(let m=1;m<=12;m++) {
    add('checking',m,1,'4500.00','MAYA PAYROLL','income','Salary');
    add('checking',m,1,'3200.00','JORDAN PAYROLL','income','Salary');
    for(const [amount,payee,category] of [[1800,'RENT','Housing'],[220,'ELECTRIC','Utilities'],[60,'WATER','Water'],[180,'INSURANCE','Insurance'],[400,'CHILDCARE','Childcare'],[100,'COMMUNITY FOOD BANK','Donations'],[50,'LOAN INTEREST','Interest']])
      add('checking',m,5,(-amount).toFixed(2),payee,'expense',category);
    for(const [to,amount] of [['loan',250],['savings',500],['visa',1150],['brokerage',200],['cash',100]]) transfer(m,'checking',to,amount,'TRANSFER TO '+to.toUpperCase());
    add('savings',m,28,'24.00','BANK INTEREST','income','Interest income');
    for(const [amount,payee,category] of [[600,'GROCER','Groceries'],[160,'FUEL','Transport'],[120,'DINING','Dining'],[80,'PHARMACY','Healthcare'],[90,'LOCAL MARKET','Uncategorized']])
      add('visa',m,12,(-amount).toFixed(2),payee,'expense',category);
    add('cash',m,14,'-30.00','SCHOOL SUPPLIES','expense','Education');
    if(m%3===0) add('visa',m,19,'-250.00','DENTIST','expense','Healthcare');
  }
  add('visa',6,22,'-300.00','ELECTRONICS','expense','Household');
  add('visa',3,23,'75.00','GROCER REFUND','refund','Groceries');
  for(const [id,data] of Object.entries(rows)) files[id+'.csv']=Buffer.from(Papa.unparse(data));
  files['maya-w2.pdf']=await taxPdf('Maya Rivera - Example Employer A','W-2',[['Box 1 - Wages','72000.00'],['Box 2 - Federal withholding','10000.00']]);
  files['jordan-w2.pdf']=await taxPdf('Jordan Rivera - Example Employer B','W-2',[['Box 1 - Wages','48000.00'],['Box 2 - Federal withholding','4OOO.OO']]);
  files['interest.pdf']=await taxPdf('Rivera family - Example Bank','1099-INT',[['Box 1 - Interest income','288.00']]);
  return files;
}
function fixtures(){ return cached ||= build(); }
module.exports={fixtures};
