'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');const {resolve}=require('../../../robos-lib/github-reviewer-defaults');
test('project defaults take precedence, exclude author, and deduplicate identities',()=>{assert.deepEqual(resolve('org/repo','author',{settings:{githubReviewers:['author','Alice','alice','org/team']},group:()=>{throw Error('not needed');}}).reviewers,['Alice','org/team']);});
test('RobOS group supplies defaults when project list is empty',()=>{const r=resolve('org/repo','me',{settings:{githubReviewers:[]},group:()=>({source:'Code Reviewers',reviewers:['me','bob']})});assert.deepEqual(r,{source:'Code Reviewers',reviewers:['bob']});});
