'use strict';
function resolveReviewLink(href,pr){
 if(!href||href.startsWith('#'))return null;
 if(/^https?:\/\//i.test(href)||href.startsWith('//')){const url=new URL(href,'https://github.com');if(url.username||url.password)throw Error('Links containing credentials cannot be opened.');return url.href;}
 if(/^[a-z][a-z0-9+.-]*:/i.test(href))throw Error('Only web and repository links are supported.');
 if(!/^[\w.-]+\/[\w.-]+$/.test(pr?.repo||'')||!/^[a-f0-9]{40,64}$/i.test(pr?.headRefOid||''))throw Error('Reload the PR to resolve this repository link.');
 const relative=new URL(href,'https://repository.invalid/');
 const filePath=decodeURIComponent(relative.pathname).replace(/^\/+|\/+$/g,'');
 const files=pr.files||[];
 const isFile=files.some(f=>f.path===filePath)||(!files.some(f=>f.path.startsWith(filePath+'/'))&&/\.[a-z0-9]+$/i.test(filePath));
 const encoded=filePath.split('/').map(encodeURIComponent).join('/');
 return `https://github.com/${pr.repo}/${isFile?'blob':'tree'}/${pr.headRefOid}${encoded?'/'+encoded:''}${relative.search}${relative.hash}`;
}
if(typeof module!=='undefined')module.exports={resolveReviewLink};
if(typeof window!=='undefined')window.resolveReviewLink=resolveReviewLink;
