'use strict';
const {AUTO_TYPES}=require('../robos-graph/lib/auto-shapes');
const ns='https://robos.dev/ns/sdlc#';
const expand=value=>value.replace(/^robos:/,ns).replace(/^schema:/,'https://schema.org/').replace(/^dcterms:/,'http://purl.org/dc/terms/');
const schema={
 '@context':{robos:ns,schema:'https://schema.org/',sh:'http://www.w3.org/ns/shacl#',rdfs:'http://www.w3.org/2000/01/rdf-schema#',dcterms:'http://purl.org/dc/terms/'},
 '@graph':AUTO_TYPES.flatMap(([name,upstream,required])=>[
  {'@id':ns+name,'@type':'rdfs:Class','rdfs:label':name,'rdfs:subClassOf':{'@id':'https://schema.org/'+upstream},'robos:refersFrom':{'@id':'https://schema.org/'+upstream}},
  {'@id':ns+name+'Shape','@type':'sh:NodeShape','sh:targetClass':{'@id':ns+name},'sh:property':['dcterms:title',...required].map(property=>({'sh:path':{'@id':expand(property)},'sh:minCount':1}))},
 ]),
};
module.exports={schema};
if(require.main===module) process.stdout.write(JSON.stringify(schema,null,2)+'\n');
