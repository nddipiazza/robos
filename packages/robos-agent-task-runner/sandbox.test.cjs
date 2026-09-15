'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');const {validate}=require('./sandbox');
const config={provider:'codex',model:'gpt-6-astra',memoryGb:4,cpus:2,repositories:['https://github.com/Hermetiq/MVP']};
test('launch settings enforce provider, resources and credential-free repository URLs',()=>{
 assert.equal(validate(config).memoryGb,4);
 for(const patch of [{provider:'claude'},{memoryGb:1024},{cpus:999},{repositories:[]},{repositories:['https://secret:token@github.com/Hermetiq/MVP']},{repositories:['file:///home/user/project']},{model:'model; command'}])assert.throws(()=>validate({...config,...patch}));
 assert.deepEqual(validate({...config,repositories:[...config.repositories,...config.repositories]}).repositories,config.repositories);
});
