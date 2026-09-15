'use strict';
function searchPeople(people,{query='',selectedUid}={}){
 const words=String(query).trim().toLowerCase().split(/\s+/).filter(Boolean);
 const matches=words.length?people.filter(p=>words.every(w=>[p.displayName,p.email,p.githubLogin].filter(Boolean).join(' ').toLowerCase().includes(w))):[];
 return {people:matches.slice(0,20),total:matches.length,selected:selectedUid?people.find(p=>p.uid===selectedUid)||null:null};
}
module.exports={searchPeople};
