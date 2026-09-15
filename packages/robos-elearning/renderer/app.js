"use strict";
let activeCourse=null,activeApp=null,progress={certificate:null};
window.addEventListener('DOMContentLoaded',async()=>{const player=document.getElementById('course-player');player.addEventListener('course-updated',e=>{activeCourse=e.detail.course;document.getElementById('player-status').textContent='Course updated in the KGraph.';});player.addEventListener('progress-change',async event=>{const p=event.detail;document.getElementById('progress-percent').textContent=p.percent+'%';document.getElementById('progress-bar-fill').style.width=p.percent+'%';if(p.percent===100&&p.hasAssessment&&!progress.certificate){try{const result=await window.robosELearning.issueCertificate({courseId:activeCourse['@id'],appId:activeApp?.['@id'],userId:'robos',scorePercentage:100});if(result?.certificate){progress.certificate=result.certificate;document.getElementById('btn-view-certificate').hidden=false;}}catch(e){document.getElementById('player-status').textContent=e.message;}}});try{const courses=await window.robosELearning.listCourses(),select=document.getElementById('course-selector');for(const c of courses){const option=document.createElement('option');option.value=c.id;option.textContent=c.title;select.append(option);}const target=await window.robosELearning.getInitialTarget();await loadCourse(target?.courseId||target?.appId||'');}catch(e){document.getElementById('player-status').textContent=e.message;}});
async function loadCourse(id){const r=await window.robosELearning.getCourse(id);if(!r?.course){document.getElementById('player-status').textContent=r?.error||'No course found in this KGraph.';return;}activeCourse=r.course;activeApp=r.application;progress={certificate:null};document.getElementById('btn-view-certificate').hidden=true;document.getElementById('course-title').textContent=activeCourse['dcterms:title'];document.getElementById('course-player').course=activeCourse;const p=document.getElementById('course-player').progress;document.getElementById('progress-percent').textContent=p.percent+'%';document.getElementById('progress-bar-fill').style.width=p.percent+'%';}
window.onCourseSelected=id=>{if(id)loadCourse(id).catch(e=>document.getElementById('player-status').textContent=e.message);};
window.showCertificateModal = function() {
  if (progress.certificate) {
    document.getElementById('cert-course-name').textContent = progress.certificate['dcterms:title'].replace('Certificate of Completion: ', '');
    document.getElementById('cert-recipient-name').textContent = progress.certificate['robos:recipientUser'] || 'robos';
    document.getElementById('cert-score').textContent = (progress.certificate['robos:scorePercentage'] || 100) + '%';
    document.getElementById('cert-date').textContent = new Date(progress.certificate['robos:issueDate'] || Date.now()).toLocaleDateString();
    document.getElementById('cert-target-app').textContent = activeApp ? (activeApp['dcterms:title'] || activeApp['@id']) : 'RobOS Platform';
    document.getElementById('cert-hash').textContent = progress.certificate['robos:verificationHash'] || 'ROBOS-CERT-VERIFIED';
  } else if (activeCourse) {
    document.getElementById('cert-course-name').textContent = activeCourse['dcterms:title'];
  }
  const m = document.getElementById('cert-modal');
  if (m) m.style.display = 'flex';
};

window.closeCertificateModal = function() {
  const m = document.getElementById('cert-modal');
  if (m) m.style.display = 'none';
};
