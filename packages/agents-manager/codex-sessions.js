'use strict';
const {execFileSync}=require('node:child_process');
const path=require('node:path'),os=require('node:os');
const script=`import sqlite3,json,sys,pathlib
root=pathlib.Path(sys.argv[1]); selected=sys.argv[2]
for db in sorted(root.glob('state_*.sqlite'),key=lambda p:int(p.stem.split('_')[-1]),reverse=True):
 try:
  con=sqlite3.connect(db.as_uri()+'?mode=ro',uri=True);con.row_factory=sqlite3.Row
  cols={r[1] for r in con.execute('pragma table_info(threads)')}
  fields=','.join(c for c in ['id','title','first_user_message','cwd','model','updated_at'] if c in cols)
  rows=con.execute('SELECT '+fields+' FROM threads WHERE archived=0 OR id=? ORDER BY id=? DESC,updated_at DESC LIMIT 50',(selected,selected)).fetchall()
  print(json.dumps([dict(r) for r in rows]));break
 except (sqlite3.Error,OSError):continue
else: print('[]')
`;
function list(selected='',{root=process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),run=execFileSync}={}){
 const rows=JSON.parse(run('python3',['-c',script,root,selected],{encoding:'utf8',timeout:5000,maxBuffer:2*1024*1024}));
 return rows.map(r=>({session_id:r.id,job:require('../robos-lib/agent-job-state').read(r.id),name:r.title||path.basename(r.cwd||'')||r.id,cwd:r.cwd||'',first_message:(r.first_user_message||'').slice(0,120),model:r.model||'',updated_at:r.updated_at?new Date(r.updated_at*1000).toISOString():''}));
}
module.exports={list};
