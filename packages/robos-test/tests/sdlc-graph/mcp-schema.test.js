'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {SHACLValidator,BUILTIN_SHACL_SHAPES}=require('../../../robos-graph/lib/shacl-validator');
const {OSLCGraphParser}=require('../../../robos-graph/lib/oslc-parser');
const classification=require('../../../robos-graph/lib/classification');
const node=(type,props={})=>({'@id':'urn:test:'+type,'@type':['robos:'+type],'dcterms:title':type,...props});
const validate=n=>new SHACLValidator().validateGraph(new OSLCGraphParser({'robos:nodes':[n]}));
test('MCP inventories allow resources-only, prompts-only, empty and unknown tools',()=>{
 for(const props of [{},{'robos:toolsProvided':[]},{'robos:resourcesProvided':['urn:test:resource']},{'robos:promptsProvided':['urn:test:prompt']}])
  assert.equal(validate(node('MCPServer',{'robos:transport':'Streamable HTTP',...props})).conforms,true);
 assert.equal(validate(node('MCPServer')).conforms,false,'transport remains required');
});
test('MCP tool contracts are optional and nested declarations remain intact',()=>{
 const base=node('MCPTool',{'robos:toolName':'lookup','robos:mcpServer':{'@id':'urn:test:server'}});
 assert.equal(validate(base).conforms,true);
 const rich={...base,'robos:inputSchema':{type:'object',properties:{query:{type:'string'}},required:['query']},'robos:outputSchema':{type:'object'},'robos:annotations':{readOnlyHint:true},'robos:toolAnnotations':{openWorldHint:false},'robos:parameters':{query:'Search text'}};
 const before=JSON.stringify(rich);assert.equal(validate(rich).conforms,true);assert.equal(JSON.stringify(rich),before);
 assert.equal(validate(node('MCPTool',{'robos:toolName':'lookup'})).conforms,false,'parent remains required');
});
test('concrete resources need no invented template and prompts accept argument descriptors',()=>{
 for(const props of [{'robos:uri':'file:///recorded/readme','robos:mimeType':'text/plain'},{'robos:uriTemplate':'file:///{path}'}])
  assert.equal(validate(node('MCPResource',{'robos:mcpServer':'urn:test:server',...props})).conforms,true);
 assert.equal(validate(node('MCPPrompt',{'robos:promptName':'review','robos:mcpServer':'urn:test:server','robos:arguments':[{name:'topic',required:true}]})).conforms,true);
});
test('optional MCP properties have agents classifications in both published ontologies',()=>{
 const predicates=['inputSchema','outputSchema','annotations','toolAnnotations','parameters','arguments','uri','mimeType','endpoint','resourcesProvided','promptsProvided'];
 for(const local of predicates){const id='robos:'+local;assert.ok(classification.PREDICATE_CODES[id].includes('agents'),id);assert.ok(BUILTIN_SHACL_SHAPES.filter(s=>s.targetClass.startsWith('robos:MCP')).some(s=>s.properties.some(p=>p.path===id&&p.minCount===0)),id);}
 for(const file of ['.robos/ontology.jsonld','docs/schemas/ontology.jsonld']){
  const graph=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../../..',file),'utf8'))['@graph'];
  for(const local of predicates)assert.ok(graph.find(n=>n['@id']==='robos:'+local)['robos:classification'].some(c=>c['@id'].endsWith('/agents')),local);
 }
});
test('MCP JSON-LD context protects structured keys and declares only actual node references',()=>{
 const {OSLC_CONTEXT}=require('../../../robos-graph/lib/oslc-parser');
 const structures={inputSchema:{$schema:'https://json-schema.org/draft/2020-12/schema',type:'object',properties:{query:{type:'string'}},required:['query']},outputSchema:{type:'object',properties:{result:{type:'array',items:{type:'string'}}}},annotations:{readOnlyHint:false},arguments:[{name:'topic',required:true},{name:'detail',required:false}],parameters:{query:{description:'Recorded parameter'}},toolAnnotations:{openWorldHint:false}};
 const props=Object.fromEntries(Object.entries(structures).map(([key,value])=>['robos:'+key,value]));
 for(const key of Object.keys(structures))assert.deepEqual(OSLC_CONTEXT['robos:'+key],{'@id':'robos:'+key,'@type':'@json'});
 for(const key of ['mcpServer','resourcesProvided','promptsProvided'])assert.equal(OSLC_CONTEXT['robos:'+key]['@type'],'@id');
 assert.notEqual(OSLC_CONTEXT['robos:toolsProvided']?.['@type'],'@id','legacy tool names must remain literals');
 const original=node('MCPTool',props), parser=new OSLCGraphParser({'robos:nodes':[original]});
 const saved=JSON.parse(JSON.stringify(parser.toJSONLD()));
 assert.deepEqual(new OSLCGraphParser(saved).getNode(original['@id']),original);
 assert.deepEqual(saved['@context'],OSLC_CONTEXT);
});
test('MCP resource and prompt inventories are references, never impact dependencies',()=>{
 const {predicateKind,nodeRelations,dependencyEdges}=require('../../../robos-graph/lib/relationships');
 const server=node('MCPServer',{'robos:resourcesProvided':['urn:test:resource'],'robos:promptsProvided':[{'@id':'urn:test:prompt'}]});
 const children=[{'@id':'urn:test:resource','@type':['robos:MCPResource']},{'@id':'urn:test:prompt','@type':['robos:MCPPrompt']}];
 for(const key of ['robos:resourcesProvided','robos:promptsProvided'])assert.equal(predicateKind(key),'reference');
 const edges=nodeRelations(server,new Set([server,...children].map(n=>n['@id'])));assert.equal(edges.length,2);assert.ok(edges.every(e=>e.kind==='reference'&&e.internal));
 assert.deepEqual(dependencyEdges([server,...children]),[]);
});
