'use strict';
// The selection carries workspace-scoped IDs, never display-name guesses.
window.mountReviewerPicker = function(host, loadMembers, changed = () => {}) {
  const field = document.createElement('fieldset');
  const legend = document.createElement('legend');legend.textContent = 'Reviewers to @mention';
  const search = document.createElement('input');search.type = 'search';search.placeholder = '@ Search team members';search.setAttribute('aria-label','Search reviewers');
  const list = document.createElement('div');list.style.maxHeight = '180px';list.style.overflowY = 'auto';
  const status = document.createElement('p');status.setAttribute('role','status');
  field.append(legend,search,list,status);host.append(field);
  let directory = [], selected = new Set(), generation = 0, loading = false, error = '';
  function value() {return directory.filter(m => selected.has(m.userId));}
  function render() {
    list.replaceChildren();
    const query = search.value.replace(/^@/,'').trim().toLowerCase();
    for (const member of directory.filter(m => (m.name+' '+m.userId).toLowerCase().includes(query))) {
      const label = document.createElement('label');label.style.display = 'block';
      const checkbox = document.createElement('input');checkbox.type = 'checkbox';checkbox.checked = selected.has(member.userId);
      checkbox.onchange = () => {if(checkbox.checked)selected.add(member.userId);else selected.delete(member.userId);render();changed();};
      label.append(checkbox, ' @'+member.name+' ('+member.userId+')');list.append(label);
    }
    status.textContent = error || (loading ? 'Loading team members…' : value().length+' reviewers selected. Your own account is excluded.');
  }
  search.oninput = render;
  return {value,configured() {if(loading)throw Error('Wait for team members to load.');if(error)throw Error(error);return value();},validate() {if(loading)throw Error('Wait for team members to load.');if(error)throw Error(error);if(!value().length)throw Error('Choose at least one reviewer other than yourself.');},async load(serverId, saved = []) {
    const current = ++generation;directory = [];selected.clear();error = '';loading = !!serverId;search.value = '';render();changed();
    if(!serverId)return;
    try {
      const result = await loadMembers(serverId);
      if(current !== generation)return;
      if(!result.ok)throw Error(result.error);
      directory = result.members;
      selected = new Set(saved.filter(s => s.serverId === serverId && directory.some(m => m.userId === s.userId)).map(s => s.userId));
    } catch(e) {if(current !== generation)return;error = e.message;}
    if(current !== generation)return;
    loading = false;render();changed();
  }};
};
