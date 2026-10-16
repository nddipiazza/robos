'use strict';
$('workspace-date').textContent = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date());
const reportTabs = [...document.querySelectorAll('[data-report-tab]')];
function selectReportTab(name, focus = false) {
  message('');
  for (const tab of reportTabs) {
    const selected = tab.dataset.reportTab === name;
    tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
    $(tab.getAttribute('aria-controls')).hidden = !selected;
    if (selected && focus) tab.focus();
  }
}
reportTabs.forEach((tab, index) => {
  tab.onclick = () => selectReportTab(tab.dataset.reportTab);
  tab.onkeydown = e => {
    let next;
    if (e.key === 'ArrowRight') next = (index + 1) % reportTabs.length;
    if (e.key === 'ArrowLeft') next = (index + reportTabs.length - 1) % reportTabs.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = reportTabs.length - 1;
    if (next !== undefined) { e.preventDefault(); selectReportTab(reportTabs[next].dataset.reportTab, true); }
  };
});
$('open-check-in').onclick = () => { $('check-in-drawer').open = true; $('check-in-drawer').scrollIntoView({ block: 'center', behavior: 'smooth' }); document.querySelector('#check-in-form select').focus({ preventScroll: true }); };
