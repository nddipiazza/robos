'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {plannerProducts,plannerDate}=require('./renderer/project-tree');
const {navigation}=require('./lib/project-navigation');
test('distinct features group under a product, ordered by most recent work',()=>{
 const product={name:'Buildbarn Config Editor'};
 const old={id:'old',name:'Older feature',product,modifiedAt:'2026-01-01T12:00:00Z'};
 const recent={id:'recent',name:'Recent feature',product,modifiedAt:'2026-02-01T12:00:00Z'};
 const groups=plannerProducts([old,recent]);assert.equal(groups.length,1);assert.equal(groups[0].name,product.name);assert.equal(groups[0].families[0].project.id,'recent');
});
test('workspace identifies product; explicit assignment wins; missing metadata is unassigned',()=>{
 assert.equal(navigation({kind:'task',workspace:'/src/buildbarn-config-editor'}).product.name,'Buildbarn Config Editor');
 assert.equal(navigation({kind:'task',workspace:'/src/MVP',product:{name:'Custom product'}}).product.name,'Custom product');
 assert.equal(plannerProducts([{id:'a',name:'Feature'}])[0].name,'(No Project)');
});
test('timestamps preserve exact instant and unknown values are not invented',()=>{
 assert.equal(plannerDate(null).short,'—');assert.equal(plannerDate('bad').short,'—');
 assert.equal(plannerDate(1700000000000).full,new Date(1700000000000).toLocaleString());
});

test('opening an epic ticket separately keeps one canonical task under its epic',()=>{
 const url='https://github.com/Hermetiq/task-and-issue-tracking/issues/62';
 const epic={id:'epic',kind:'epic',name:'Type Explorer',product:{name:'BB Config Editor'},tasks:[{ticketUrl:url}]};
 const task={id:'task',kind:'task',name:'Remove counts',workTaskUrl:url};
 const groups=plannerProducts([epic,task]);
 assert.equal(groups.length,1);assert.equal(groups[0].name,'BB Config Editor');
 assert.deepEqual(groups[0].families[0].children,[task]);
 const other={...epic,id:'other'};
 assert.equal(plannerProducts([epic,other,task]).length,2,'ambiguous membership must not invent a parent');
});
