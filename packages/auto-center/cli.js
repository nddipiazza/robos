#!/usr/bin/env node
'use strict';
const path=require('node:path'),os=require('node:os');
const {propose}=require('./lib/importer');
const root=process.env.ROBOS_AUTO_CACHE||path.join(os.homedir(),'.robos/auto-scrape');
const {workspace,proposal}=propose(root);
console.log(JSON.stringify({root,nodes:proposal.candidate['robos:nodes'].length,added:proposal.delta.added.length,changed:proposal.delta.changed.length,conflicts:proposal.conflicts,validation:proposal.validation.errors}));
if(process.argv.includes('--apply')) console.log(JSON.stringify(workspace.apply(proposal,{expectedProposalId:proposal.id})));
