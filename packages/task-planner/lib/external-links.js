'use strict';
const {openChrome}=require('../../robos-lib/open-chrome');
function routeExternalLinks(contents,{open=openChrome,onError=()=>{}}={}){
 const launch=url=>Promise.resolve().then(()=>open(url)).catch(onError);
 contents.setWindowOpenHandler(({url})=>{launch(url);return {action:'deny'};});
 contents.on('will-navigate',(event,url)=>{event.preventDefault();launch(url);});
}
module.exports={routeExternalLinks};
