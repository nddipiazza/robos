'use strict';
window.startCodeReview=async function(initialize){
 const screen=document.getElementById('startup-screen'),message=document.getElementById('startup-message'),retry=document.getElementById('startup-retry');
 retry.onclick=()=>window.location.reload();
 const timer=setTimeout(()=>{message.textContent='Your review is taking longer to load. You can retry if it stays here.';retry.hidden=false;},15000);
 try{
  await initialize();await document.fonts.ready;
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  document.documentElement.removeAttribute('data-startup');screen.hidden=true;
 }catch(error){message.textContent='Could not open Code Review. '+(error.message||'Please try again.');screen.setAttribute('role','alert');retry.hidden=false;}
 finally{clearTimeout(timer);}
};
