#!/usr/bin/env python3
"""Parse NHTSA's 29-column tab-delimited recall archive without executing data."""
import hashlib, json, pathlib, sqlite3, sys, uuid, zipfile
from urllib.parse import quote
FIELDS = 'RECORD_ID CAMPNO MAKETXT MODELTXT YEARTXT MFGCAMPNO COMPNAME MFGNAME BGMAN ENDMAN RCLTYPECD POTAFF ODATE INFLUENCED_BY MFGTXT RCDATE DATEA RPNO FMVSS DESC_DEFECT CONEQUENCE_DEFECT CORRECTIVE_ACTION NOTES RCL_CMPT_ID MFR_COMP_NAME MFR_COMP_DESC MFR_COMP_PTNO DO_NOT_DRIVE PARK_OUTSIDE'.split()
VERSION = 1

def digest(file):
 h=hashlib.sha256()
 with open(file,'rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
 return h.hexdigest()

def uid(kind,key): return 'urn:robos:auto:'+kind+':'+quote(str(key),safe="~!*'()")
def ref(value): return {'@id':value}
def node(kind,key,title,**props):
 return {'@id':uid(kind,key),'@type':'robos:'+kind,'dcterms:title':title,'robos:package':'auto-recalls',**props}
def short(value): return hashlib.sha256(value.encode()).hexdigest()[:24]
def inside(root,relative):
 file=(root/relative).resolve()
 if not file.is_relative_to(root.resolve()): raise ValueError('Source path outside cache')
 return file

def prepare(root):
 root=pathlib.Path(root).expanduser().resolve()
 manifest=json.loads((root/'manifest.json').read_text())
 source=next(s for s in manifest['sources'] if s['id']=='recalls-bulk' and s['status']=='downloaded')
 archive=inside(root,source['file'])
 if digest(archive)!=source['sha256']: raise ValueError('Recall archive hash mismatch')
 build=root/'recalls'/'builds'/(source['sha256'][:16]+'-v'+str(VERSION)+'-'+uuid.uuid4().hex[:8]);build.mkdir(parents=True)
 db=sqlite3.connect(build/'index.sqlite');db.executescript('''
 CREATE TABLE entries(id TEXT PRIMARY KEY,type TEXT,title TEXT,search TEXT,shard TEXT,campaign TEXT);
 CREATE TABLE source_rows(line INTEGER PRIMARY KEY,record TEXT UNIQUE,fields TEXT,sha256 TEXT);
 CREATE TABLE vehicles(id TEXT PRIMARY KEY,make TEXT,model TEXT,year TEXT,campaign TEXT);
 ''')
 shards=[{} for _ in range(64)]; campaign_terms={};counts={};total=0;member='FLAT_RCL_POST_2010.txt'
 dataset=node('AutoDataset','recalls-bulk',source['title'],**{'schema:url':source['url'],'schema:license':source['license'],'robos:provenance':{**source,'archiveMember':member,'dictionaryUrl':'https://static.nhtsa.gov/odi/ffdd/rcl/RCL.txt'}})
 with zipfile.ZipFile(archive) as z:
  info=z.getinfo(member)
  if info.file_size>512*1024*1024: raise ValueError('Expanded recall archive exceeds 512 MiB')
  with z.open(info) as f:
   for line_no,raw in enumerate(f,1):
    values=raw.decode('utf-8').rstrip('\r\n').split('\t')
    if len(values)!=29: raise ValueError(f'Expected 29 fields at physical line {line_no}, got {len(values)}')
    r=dict(zip(FIELDS,values));v={k:x.strip() for k,x in r.items()};camp=v['CAMPNO']
    if not camp or not v['RECORD_ID']: raise ValueError(f'Missing identity at line {line_no}')
    db.execute('INSERT INTO source_rows VALUES(?,?,?,?)',(line_no,v['RECORD_ID'],json.dumps(r),hashlib.sha256(raw).hexdigest()))
    shard=int(hashlib.sha256(camp.encode()).hexdigest()[:2],16)%64;nodes=shards[shard]
    origin={'dcterms:source':ref(dataset['@id']),'robos:sourceRow':line_no,'robos:sourceRecordId':v['RECORD_ID']}
    campaign_id=uid('BulkRecallCampaign',camp)
    if campaign_id not in nodes:
     nodes[campaign_id]=node('BulkRecallCampaign',camp,camp+' · '+v['MFGNAME'],**{'schema:identifier':camp,'schema:manufacturer':v['MFGNAME'],'schema:description':[], 'robos:consequences':[], 'robos:campaignNumber':camp,'schema:url':'https://api.nhtsa.gov/recalls/recallsByCampaignNumber?campaignNumber='+quote(camp),**origin})
    campaign=nodes[campaign_id]
    for field,key in [('DESC_DEFECT','schema:description'),('CONEQUENCE_DEFECT','robos:consequences')]:
     if v[field] and v[field] not in campaign[key]:campaign[key].append(v[field])
    campaign_terms.setdefault(camp,set()).add(' '.join([v['YEARTXT'],v['MAKETXT'],v['MODELTXT'],v['COMPNAME']]))
    remedy_id=None
    if v['CORRECTIVE_ACTION']:
     remedy_id=uid('RecallRemedy',camp+'-'+short(v['CORRECTIVE_ACTION']))
     nodes.setdefault(remedy_id,node('RecallRemedy',camp+'-'+short(v['CORRECTIVE_ACTION']),camp+' · repair remedy',**{'robos:campaign':ref(campaign_id),'robos:campaignNumber':camp,'schema:description':v['CORRECTIVE_ACTION'],**origin}))
    part_key=camp+'-'+short('\0'.join(v[k] for k in ['MFGNAME','COMPNAME','RCL_CMPT_ID','MFR_COMP_NAME','MFR_COMP_DESC','MFR_COMP_PTNO']))
    part_id=uid('RecallAffectedPart',part_key)
    nodes.setdefault(part_id,node('RecallAffectedPart',part_key,camp+' · '+(v['MFR_COMP_NAME'] or v['COMPNAME'] or 'Unspecified component')+((' · '+v['MFR_COMP_PTNO']) if v['MFR_COMP_PTNO'] else ''),**{'schema:name':v['MFR_COMP_NAME'] or v['COMPNAME'] or 'Unspecified component','schema:description':v['MFR_COMP_DESC'],'schema:manufacturer':v['MFGNAME'],'robos:campaign':ref(campaign_id),'robos:campaignNumber':camp,'robos:component':v['COMPNAME'],'robos:componentId':v['RCL_CMPT_ID'],'robos:reportedPartNumber':v['MFR_COMP_PTNO'],'robos:coverage':'Manufacturer-reported affected component; not a verified replacement part or general fitment claim',**origin}))
    title=' '.join([v['YEARTXT'],v['MAKETXT'],v['MODELTXT']])+' · '+camp+' · '+v['COMPNAME']
    applicability=node('RecallApplicability',v['RECORD_ID'],title,**{'robos:campaign':ref(campaign_id),'robos:campaignNumber':camp,'robos:affectedPart':ref(part_id),'robos:makeName':v['MAKETXT'],'robos:modelName':v['MODELTXT'],'robos:modelYear':v['YEARTXT'],'robos:productionStart':v['BGMAN'],'robos:productionEnd':v['ENDMAN'],'robos:doNotDrive':v['DO_NOT_DRIVE'],'robos:parkOutside':v['PARK_OUTSIDE'],'robos:productType':v['RCLTYPECD'],**({'robos:remedy':ref(remedy_id)} if remedy_id else {}),**origin})
    nodes[applicability['@id']]=applicability
    db.execute('INSERT INTO vehicles VALUES(?,?,?,?,?)',(applicability['@id'],v['MAKETXT'].casefold(),v['MODELTXT'].casefold(),v['YEARTXT'],camp));total+=1
 plan={'version':VERSION,'build':str(build.relative_to(root)),'archiveSha256':source['sha256'],'source':source,'member':member,'records':total,'shards':[]}
 for index,nodes in enumerate(shards):
  if not nodes:continue
  shard=f'{index:02x}';filename=f'{shard}.json';nodes[dataset['@id']]=dataset
  for n in nodes.values():
   if n['@type']=='robos:AutoDataset':continue
   kind=n['@type'];counts[kind]=counts.get(kind,0)+1
   camp=n.get('robos:campaignNumber','')
   search=n['dcterms:title']+' '+str(n.get('schema:description',''))
   if kind=='robos:BulkRecallCampaign':search+=' '+' '.join(sorted(campaign_terms[camp]))
   db.execute('INSERT INTO entries VALUES(?,?,?,?,?,?)',(n['@id'],kind,n['dcterms:title'],search.casefold(),shard,camp))
  target=build/filename;target.write_text(json.dumps({'robos:nodes':list(nodes.values())},ensure_ascii=False,separators=(',',':')))
  plan['shards'].append({'id':shard,'file':filename,'sha256':digest(target),'nodes':len(nodes)})
 db.executescript('CREATE INDEX by_campaign ON entries(campaign); CREATE INDEX by_type ON entries(type); CREATE INDEX by_vehicle ON vehicles(make,model,year);');db.commit();db.close()
 plan['counts']=counts;plan['nodes']=sum(counts.values());plan['indexSha256']=digest(build/'index.sqlite')
 (build/'plan.json').write_text(json.dumps(plan,indent=2));print(json.dumps(plan))

def query(root,request):
 root=pathlib.Path(root).resolve();current=json.loads((root/'recalls/current.json').read_text());build=inside(root,current['build']);db=sqlite3.connect(f'file:{build}/index.sqlite?mode=ro',uri=True);db.row_factory=sqlite3.Row
 if request['action']=='search':
  where=[];params=[]
  if request.get('type'):where.append('type=?');params.append(request['type'])
  for term in request.get('query','').casefold().split():where.append('instr(search,?)>0');params.append(term)
  if request.get('vehicle'):
   v=request['vehicle'];where.append('id IN (SELECT id FROM vehicles WHERE make=? AND model=? AND year=?)');params.extend([v['make'].casefold().strip(),v['model'].casefold().strip(),str(v['year'])])
  condition=' AND '.join(where) or '1'
  total=db.execute('SELECT COUNT(*) FROM entries WHERE '+condition,params).fetchone()[0]
  rows=[{'@id':r['id'],'@type':r['type'],'dcterms:title':r['title']} for r in db.execute('SELECT * FROM entries WHERE '+condition+' ORDER BY id LIMIT 100',params)]
  print(json.dumps({'total':total,'nodes':rows}))
 elif request['action']=='lookup':
  row=db.execute('SELECT * FROM entries WHERE id=?',(request['id'],)).fetchone();print(json.dumps(dict(row) if row else None))
 elif request['action']=='source':
  row=db.execute('SELECT * FROM source_rows WHERE line=?',(request['line'],)).fetchone();print(json.dumps({**dict(row),'fields':json.loads(row['fields']),'archive':current['source'],'member':current['member']} if row else None))
 db.close()
if __name__=='__main__':
 if sys.argv[1]=='prepare':prepare(sys.argv[2])
 else:query(sys.argv[2],json.loads(sys.argv[3]))
