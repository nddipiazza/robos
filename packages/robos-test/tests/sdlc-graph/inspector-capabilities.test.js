'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const c=require('../../../robos-graph/lib/inspector-capabilities');
const n=(id,extra={})=>({'@id':id,'@type':['example:Node'],...extra});
test('isolates expose only overview, query and JSON-LD; removed tabs always fall back',()=>{
 const node=n('urn:test:alone');assert.deepEqual(c.capabilities(node).tabs,['visual','query','rdf']);
 for(const tab of ['gitops','edd','fabric','video','traceability','documentation','evidence','topology','impact','unknown'])assert.equal(c.selectTab(tab,node,[]),'visual');
});
test('internal relationship and dependency participation control topology and impact separately',()=>{
 const index=c.relationIndex([{from:'a',to:'b',kind:'reference'},{from:'b',to:'c',kind:'dependency'}]);
 assert.ok(c.capabilities(n('a'),[],index).tabs.includes('topology'));assert.ok(!c.capabilities(n('a'),[],index).tabs.includes('impact'));
 assert.ok(c.capabilities(n('b'),[],index).tabs.includes('impact'));assert.ok(c.capabilities(n('c'),[],index).tabs.includes('impact'));
});
test('documentation requires content, paths or valid explicit URLs; no empty/unresolved doc links',()=>{
 const blank=n('urn:doc:blank',{'@type':['robos:DocumentationPage']});
 for(const node of [blank,n('a',{'robos:hasDocumentationPage':{'@id':blank['@id']}}),n('b',{'robos:hasDocumentationPage':'urn:doc:missing'}),n('c',{'robos:documentation':'javascript:alert(1)'})])assert.ok(!c.capabilities(node,[blank]).tabs.includes('documentation'));
 assert.ok(c.capabilities(n('a',{'robos:documentation':{docsUrl:'https://example.org/docs'}})).tabs.includes('documentation'));
 assert.ok(c.capabilities(n('a',{'robos:documentation':'Actual <script>plaintext</script>'})).tabs.includes('documentation'));
});
test('duplicate documentation paths collapse into one source record with exact evidence',()=>{
 const evidence={repository:'example',path:'README.md',line:4,revision:'abc',sha256:'a'.repeat(64)};
 const doc=n('urn:doc:readme',{'@type':['robos:DocumentationPage'],'robos:docPath':'README.md','robos:sourcePath':'README.md','robos:evidence':[evidence]});
 const result=c.capabilities(doc,[doc]);assert.equal(result.documents.length,1);assert.deepEqual(result.documents[0].sourceEvidence,[evidence]);
 const linked=c.capabilities(n('app',{'robos:hasDocumentationPage':{'@id':doc['@id']}}),[doc]);assert.equal(linked.documents.filter(d=>d.kind==='path').length,1);
});
test('source evidence includes full direct and matching relationship evidence only',()=>{
 const e={repository:'example',path:'api.js',line:9,revision:'abc',sha256:'b'.repeat(64)};
 const node=n('a',{'robos:uses':{'@id':'b'},'robos:relationshipEvidence':[{predicate:'robos:uses',target:'b',evidence:[e]}]});
 const result=c.capabilities(node);assert.ok(result.tabs.includes('evidence'));assert.equal(result.evidence[0].sha256,e.sha256);
 assert.ok(!c.capabilities({...node,'robos:uses':null}).tabs.includes('evidence'));
});
test('only HTTP(S) without credentials is permitted for external documentation',()=>{
 for(const url of ['javascript:alert(1)','file:///tmp/private','data:text/html,boom','https://user:pass@example.org','https://example.org/<script>',' https://example.org','https://example.org/\nfoo'])assert.equal(c.safeUrl(url),null,url);
 assert.equal(c.safeUrl('https://example.org/docs?x=1&y=2'),'https://example.org/docs?x=1&y=2');
});
test('recorded GitHub links require explicit clean evidence, full revision, safe remote and encoded path',()=>{
 const source=n('doc',{'robos:inRepository':{'@id':'repo'}}),repo=n('repo',{'robos:url':'https://github.com/example/docs.git'});
 const evidence={workingTreeStatus:'clean',revision:'a'.repeat(40),path:'docs/a b#?.md',line:12};
 assert.equal(c.recordedSourceUrl(source,evidence,[repo]),`https://github.com/example/docs/blob/${'a'.repeat(40)}/docs/a%20b%23%3F.md#L12`);
 for(const patch of [{workingTreeStatus:'dirty'},{workingTreeStatus:undefined},{revision:'HEAD'},{path:'../secret'},{path:'/tmp/a'},{line:0}])assert.equal(c.recordedSourceUrl(source,{...evidence,...patch},[repo]),null);
 for(const remote of ['https://evil.example/x/y','https://user:pass@github.com/x/y','https://github.com/x/y?token=x','http://github.com/x/y','https://github.com/x/y/z'])assert.equal(c.recordedSourceUrl(source,evidence,[{...repo,'robos:url':remote}]),null);
});
test('recorded source links resolve normalized repository arrays only when unambiguous',()=>{
 const repo=n('repo',{'robos:url':'https://github.com/example/docs.git'}),other=n('other',{'robos:url':'https://github.com/example/other.git'});
 const e={workingTreeStatus:'clean',revision:'a'.repeat(40),path:'README.md',line:1};
 for(const refs of [[{'@id':'repo'}],['repo'],[{'@id':'repo'},'repo']])assert.ok(c.recordedSourceUrl(n('doc',{'robos:inRepository':refs}),e,[repo,other]));
 for(const refs of [[],[{'@id':'repo'},{'@id':'other'}],[{'@id':'repo'},{'@id':'unresolved'}]])assert.equal(c.recordedSourceUrl(n('doc',{'robos:inRepository':refs}),e,[repo,other]),null);
});
test('an empty graph has only Overview and cannot retain an old selected tab',()=>{
 assert.deepEqual(c.capabilities({}).tabs,['visual']);
 for(const tab of ['query','rdf','documentation','evidence','impact','topology'])assert.equal(c.selectTab(tab,{},[]),'visual');
});
