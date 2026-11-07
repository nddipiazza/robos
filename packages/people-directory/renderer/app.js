'use strict';

const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const uid = () => 'person-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,6);

let allPeople    = [];
let filtered     = [];
let activeUid    = null;
let activeTab    = 'overview';
let editMode     = false;
let myProfileUid = null;
let partySchema  = { questions: [], roles: [] };

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  try {
    partySchema = await window.api.getPartySchema();
  } catch {}
  await reload();

  document.getElementById('search').addEventListener('input', applyFilter);
  document.getElementById('filter-dept').addEventListener('change', applyFilter);
  document.getElementById('btn-add').addEventListener('click', openNew);
  document.getElementById('btn-import').addEventListener('click', () => document.getElementById('import-modal').classList.remove('hidden'));
  document.getElementById('btn-settings').addEventListener('click', openSettings);
  document.getElementById('import-modal-close').addEventListener('click', () => document.getElementById('import-modal').classList.add('hidden'));
  document.getElementById('settings-modal-close').addEventListener('click', () => document.getElementById('settings-modal').classList.add('hidden'));
  document.getElementById('btn-do-import').addEventListener('click', doImport);
  document.getElementById('btn-save-settings').addEventListener('click', saveSettings);
  document.getElementById('cfg-backend').addEventListener('change', e => {
    document.getElementById('ldap-fields').classList.toggle('hidden', e.target.value !== 'ldap');
  });
  const partyBtn = document.getElementById('btn-party-game');
  if (partyBtn) partyBtn.addEventListener('click', () => window.api.launchPartyGame());
  initAIPanel();

  if (!activeUid && allPeople.length) {
    const startUid = allPeople.find(p => p.uid === myProfileUid)?.uid || allPeople[0].uid;
    selectPerson(startUid);
  }
});

async function reload() {
  [allPeople, myProfileUid] = await Promise.all([
    window.api.listPeople(),
    window.api.getMyProfile(),
  ]);
  allPeople.sort((a,b) => {
    if (a.uid === myProfileUid) return -1;
    if (b.uid === myProfileUid) return 1;
    return (a.displayName||'').localeCompare(b.displayName||'');
  });
  populateDeptFilter();
  applyFilter();
}

// ── Filter ────────────────────────────────────────────────────────────────────
function populateDeptFilter() {
  const depts = [...new Set(allPeople.flatMap(p => [p.department, ...(p.groups||[])]).filter(Boolean))].sort();
  const sel = document.getElementById('filter-dept');
  const cur = sel.value;
  sel.innerHTML = '<option value="">All departments &amp; groups</option>' +
    depts.map(d => `<option value="${esc(d)}"${d===cur?' selected':''}>${esc(d)}</option>`).join('');
}

function applyFilter() {
  const q    = document.getElementById('search').value.toLowerCase();
  const dept = document.getElementById('filter-dept').value;
  filtered = allPeople.filter(p => {
    const hay = [
      p.displayName, p.nickname, p.email, p.title, p.uid, p.bio,
      p.personality?.archetype, ...(p.personality?.traits || []),
      ...(p.interests?.expertTopics || []), ...(p.interests?.hobbies || []),
      p.gameProfile?.gamerTag, p.gameProfile?.rpgCharacter?.characterClass, p.gameProfile?.rpgCharacter?.subclass,
    ].filter(Boolean).join(' ').toLowerCase();
    const matchQ = !q || hay.includes(q);
    const matchD = !dept || p.department === dept || (p.groups || []).includes(dept);
    return matchQ && matchD;
  });
  renderList();
}

// ── List ──────────────────────────────────────────────────────────────────────
function renderList() {
  const ul = document.getElementById('people-list');
  if (!filtered.length) {
    ul.innerHTML = '<li class="no-results">No matching user profiles</li>';
    return;
  }
  ul.innerHTML = filtered.map(p => {
    const rpg = p.gameProfile?.rpgCharacter;
    const rpgLabel = rpg && (rpg.subclass || rpg.characterClass)
      ? `${rpg.subclass || ''} ${rpg.characterClass || ''}`.trim()
      : '';
    return `
    <li class="person-item${p.uid===activeUid?' active':''}" data-uid="${esc(p.uid)}" style="--accent:${esc(p.color || '#00bcd4')}">
      <div class="person-avatar" style="--accent:${esc(p.color || '#00bcd4')}">${avatarSmall(p)}</div>
      <div class="person-info">
        <div class="person-name">
          <span>${esc(p.displayName||p.uid)}</span>
          ${p.uid===myProfileUid ? '<span class="me-badge">👤 Me</span>' : ''}
        </div>
        <div class="person-sub">${esc(p.personality?.archetype || p.title || '')}</div>
        <div class="person-badges">
          ${p.gameProfile?.gamerTag ? `<span class="mini-pill game">🎮 ${esc(p.gameProfile.gamerTag)}</span>` : ''}
          ${rpgLabel ? `<span class="mini-pill">${esc(p.avatar || '⚔️')} ${esc(rpgLabel)}</span>` : ''}
        </div>
      </div>
    </li>`;
  }).join('');
  ul.querySelectorAll('.person-item').forEach(li =>
    li.addEventListener('click', () => selectPerson(li.dataset.uid)));
}

function avatarSmall(p) {
  if (p.photoDataUrl) {
    return `<img src="${esc(p.photoDataUrl)}" alt="${esc(p.displayName)}">`;
  }
  if (p.avatar) {
    return `<span class="avatar-emoji">${esc(p.avatar)}</span>`;
  }
  const initials = ((p.firstName||'')[0]||'') + ((p.lastName||'')[0]||'') ||
                   (p.displayName||'?')[0].toUpperCase();
  return `<span class="avatar-initials">${esc(initials.toUpperCase())}</span>`;
}

function avatarLarge(p) {
  if (p.photoDataUrl) {
    return `<img src="${esc(p.photoDataUrl)}" alt="${esc(p.displayName)}">` +
      (p.avatar ? `<span class="avatar-corner-emoji">${esc(p.avatar)}</span>` : '');
  }
  if (p.avatar) {
    return `<span class="avatar-emoji">${esc(p.avatar)}</span>`;
  }
  const initials = ((p.firstName||'')[0]||'') + ((p.lastName||'')[0]||'') ||
                   (p.displayName||'?')[0].toUpperCase();
  return `<span class="avatar-initials">${esc(initials.toUpperCase())}</span>`;
}

// ── Profile view ──────────────────────────────────────────────────────────────
function selectPerson(id, keepTab = true) {
  activeUid = id;
  editMode  = false;
  if (!keepTab) activeTab = 'overview';
  renderList();
  const p = allPeople.find(x => x.uid === id);
  if (!p) return;
  showProfile(p);
}

function showProfile(p) {
  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('edit-panel').classList.add('hidden');
  const el = document.getElementById('profile');
  el.classList.remove('hidden');

  const pers = p.personality || {};
  const intr = p.interests || {};
  const fam  = p.family || {};
  const gp   = p.gameProfile || {};
  const rpg  = gp.rpgCharacter || {};
  const pg   = gp.partyGame || {};
  const accent = p.color || gp.color || '#00bcd4';

  const surveyAnswers = pg.surveyAnswers || {};
  const answeredCount = Object.keys(surveyAnswers).length;
  const roleInfo = partySchema.roles.find(r => r.id === pg.preferredRole);

  el.innerHTML = `
    <div class="profile-hero" style="--accent:${esc(accent)}">
      <div class="profile-avatar-lg" style="--accent:${esc(accent)}">${avatarLarge(p)}</div>
      <div class="profile-header-info">
        ${pers.archetype ? `<div class="profile-archetype" style="--accent:${esc(accent)}">${esc(pers.archetype)}</div>` : ''}
        <h2>
          <span>${esc(p.displayName||p.uid)}</span>
          ${p.nickname ? `<span style="font-size:14px;color:#8b949e;font-weight:400">“${esc(p.nickname)}”</span>` : ''}
        </h2>
        <div class="profile-title">${esc(p.title||'')}${p.title&&p.department?' · ':''}${esc(p.department||'')}</div>
        ${pers.tagline ? `<div class="profile-tagline">“${esc(pers.tagline)}”</div>` : ''}
        <div class="profile-meta-row">
          ${p.location ? `<span>📍 ${esc(p.location)}</span>` : ''}
          ${p.ageRange ? `<span>🎂 ${esc(p.ageRange)}</span>` : ''}
          ${gp.gamerTag ? `<span>🎮 GamerTag: <b>${esc(gp.gamerTag)}</b></span>` : ''}
          ${fam.partnerName ? `<span>❤️ Partner: <a href="#" id="link-partner" data-partner="${esc(fam.partnerUid)}">${esc(fam.partnerName)}</a></span>` : ''}
        </div>
      </div>
      <div class="profile-actions">
        <div class="profile-actions-row">
          ${p.uid === myProfileUid
            ? '<button class="btn-me-active" id="btn-set-me" title="Click to unset">👤 This is you ✕</button>'
            : `<button class="btn-secondary" id="btn-set-me">Set as My Profile</button>`}
          <button class="btn-secondary" id="btn-add-photo">📷 Add Photo</button>
        </div>
        <div class="profile-actions-row">
          <button class="btn-primary" id="btn-edit">✎ Edit Profile</button>
          <button class="btn-danger" id="btn-delete">Delete</button>
        </div>
      </div>
    </div>

    <div class="profile-tabs">
      <button class="tab-btn ${activeTab==='overview'?'active':''}" data-tab="overview">Overview &amp; Bio</button>
      <button class="tab-btn ${activeTab==='personality'?'active':''}" data-tab="personality">Personality &amp; Quirks</button>
      <button class="tab-btn ${activeTab==='interests'?'active':''}" data-tab="interests">Interests, Music &amp; Books</button>
      <button class="tab-btn ${activeTab==='family'?'active':''}" data-tab="family">Family &amp; Dynamic</button>
      <button class="tab-btn ${activeTab==='game'?'active':''}" data-tab="game">🎮 Game Profile (${answeredCount} answers)</button>
      <button class="tab-btn ${activeTab==='photos'?'active':''}" data-tab="photos">📷 Photos (${(p.photos||[]).length})</button>
      <button class="tab-btn ${activeTab==='custom'?'active':''}" data-tab="custom">➕ Additional Info (${(p.customProperties||[]).length})</button>
    </div>

    <!-- TAB 1: OVERVIEW -->
    <div class="tab-pane ${activeTab==='overview'?'active':''}" id="pane-overview">
      <div class="section-grid">
        <div class="info-card full">
          <h3>About ${esc(p.firstName || p.displayName)}</h3>
          <p class="text-block">${esc(p.bio || 'No bio added yet.')}</p>
        </div>

        <div class="info-card">
          <h3>Identity &amp; Contact</h3>
          ${field('Full Name', p.displayName)}
          ${field('Nickname', p.nickname)}
          ${field('Pronouns', p.pronouns)}
          ${field('Age Range', p.ageRange)}
          ${field('Location', p.location)}
          ${field('Email', p.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : '')}
          ${field('Phone', p.phone)}
          ${field('Username', p.username)}
          ${field('UID', `<code>${esc(p.uid)}</code>`)}
        </div>

        <div class="info-card">
          <h3>Quick Highlights</h3>
          ${field('Archetype', pers.archetype)}
          ${field('RPG Class', rpg.characterClass ? `${rpg.subclass || ''} ${rpg.characterClass} (${rpg.game || 'RPG'})` : '')}
          ${field('Partner', fam.partnerName)}
          ${field('Children / Family', (fam.children || []).join(', '))}
          ${field('Groups', (p.groups || []).join(', '))}
          ${pers.traits?.length ? `<div style="margin-top:10px"><div class="field-label" style="margin-bottom:6px">Defining Traits</div><div class="chip-list">${pers.traits.map(t => `<span class="chip accent">${esc(t)}</span>`).join('')}</div></div>` : ''}
        </div>
      </div>
    </div>

    <!-- TAB 2: PERSONALITY & QUIRKS -->
    <div class="tab-pane ${activeTab==='personality'?'active':''}" id="pane-personality">
      <div class="section-grid">
        <div class="info-card full">
          <h3>${esc(pers.archetype || 'Personality Profile')}</h3>
          ${pers.tagline ? `<p class="text-block" style="margin-bottom:12px;font-weight:600;color:#e6edf3">${esc(pers.tagline)}</p>` : ''}
          ${pers.traits?.length ? `<div class="chip-list">${pers.traits.map(t => `<span class="chip accent">${esc(t)}</span>`).join('')}</div>` : '<p class="text-block">No traits listed yet.</p>'}
        </div>

        <div class="info-card">
          <h3>Defining Quirks &amp; Habits</h3>
          ${pers.quirks?.length ? `<ul class="bullet-list">${pers.quirks.map(q => `<li>${esc(q)}</li>`).join('')}</ul>` : '<p class="text-block">None listed.</p>'}
        </div>

        <div class="info-card">
          <h3>Pet Peeves &amp; Dealbreakers</h3>
          ${pers.petPeeves?.length ? `<ul class="bullet-list warn">${pers.petPeeves.map(q => `<li>${esc(q)}</li>`).join('')}</ul>` : '<p class="text-block">None listed.</p>'}
        </div>

        <div class="info-card">
          <h3>Boundaries &amp; Expectations</h3>
          ${pers.boundaries?.length ? `<ul class="bullet-list">${pers.boundaries.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : '<p class="text-block">None listed.</p>'}
        </div>

        <div class="info-card">
          <h3>Adaptability &amp; Communication</h3>
          ${field('Adaptability', pers.adaptability)}
          ${field('Communication', pers.communicationStyle)}
        </div>
      </div>
    </div>

    <!-- TAB 3: INTERESTS, MUSIC & BOOKS -->
    <div class="tab-pane ${activeTab==='interests'?'active':''}" id="pane-interests">
      <div class="section-grid">
        <div class="info-card">
          <h3>🧠 Expert Topics (Can Talk for Hours)</h3>
          ${intr.expertTopics?.length ? `<div class="chip-list">${intr.expertTopics.map(t => `<span class="chip accent">${esc(t)}</span>`).join('')}</div>` : '<p class="text-block">None listed.</p>'}
        </div>

        <div class="info-card">
          <h3>⚡ Hobbies &amp; Pastimes</h3>
          ${intr.hobbies?.length ? `<ul class="bullet-list">${intr.hobbies.map(h => `<li>${esc(h)}</li>`).join('')}</ul>` : '<p class="text-block">None listed.</p>'}
        </div>

        <div class="info-card">
          <h3>🎸 Music Tastes &amp; Rules</h3>
          ${intr.favoriteBands?.length ? field('Favorite Bands', intr.favoriteBands.join(', ')) : ''}
          ${intr.musicLikes?.length ? `<div style="margin:8px 0"><div class="field-label" style="margin-bottom:4px">Loves</div><div class="chip-list">${intr.musicLikes.map(m => `<span class="chip good">♥ ${esc(m)}</span>`).join('')}</div></div>` : ''}
          ${intr.musicDislikes?.length ? `<div style="margin:8px 0"><div class="field-label" style="margin-bottom:4px">Hates / Dealbreakers</div><div class="chip-list">${intr.musicDislikes.map(m => `<span class="chip warn">🚫 ${esc(m)}</span>`).join('')}</div></div>` : ''}
        </div>

        <div class="info-card">
          <h3>📚 Books, Reading &amp; Games</h3>
          ${intr.booksAndGenres?.length ? field('Books & Genres', intr.booksAndGenres.join(', ')) : ''}
          ${intr.gamesAndPlatforms?.length ? field('Video / Tabletop Games', intr.gamesAndPlatforms.join(', ')) : ''}
        </div>

        <div class="info-card full">
          <h3>🍽️ Food Textures &amp; Environment Preferences</h3>
          ${field('Food & Textures', intr.foodAndTextureNotes)}
          ${field('Environment & Crowds', intr.environmentPreferences)}
        </div>
      </div>
    </div>

    <!-- TAB 4: FAMILY & RELATIONSHIP DYNAMIC -->
    <div class="tab-pane ${activeTab==='family'?'active':''}" id="pane-family">
      <div class="section-grid">
        <div class="info-card full">
          <h3>❤️ Relationship Dynamic</h3>
          <p class="text-block">${esc(fam.relationshipDynamic || 'No relationship dynamic notes yet.')}</p>
        </div>

        <div class="info-card">
          <h3>👨‍👩‍👧‍👦 Family &amp; Household</h3>
          ${field('Partner', fam.partnerName)}
          ${field('Children / Parenting', (fam.children || []).join(', '))}
          ${field('Household Routines', fam.householdRoutines)}
        </div>

        <div class="info-card">
          <h3>🎮 Shared Co-Op &amp; Activities</h3>
          ${fam.sharedActivities?.length ? `<ul class="bullet-list">${fam.sharedActivities.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : '<p class="text-block">None listed.</p>'}
        </div>
      </div>
    </div>

    <!-- TAB 5: GAME PROFILE -->
    <div class="tab-pane ${activeTab==='game'?'active':''}" id="pane-game">
      <div class="rpg-banner">
        <div class="rpg-main">
          <div class="rpg-kicker">🎮 RobOS Game Profile · ${esc(gp.gamerTag || p.displayName)}</div>
          <div class="rpg-title">${esc(gp.avatar || p.avatar || '🎲')} ${esc([rpg.subclass, rpg.characterClass].filter(Boolean).join(' ') || 'Party Adventurer')}</div>
          <div class="rpg-sub">${esc(rpg.game || 'RobOS Game Night')}${rpg.platform ? ` · ${esc(rpg.platform)}` : ''}${rpg.playstyle ? ` — ${esc(rpg.playstyle)}` : ''}</div>
          ${rpg.blurb ? `<div class="rpg-blurb">“${esc(rpg.blurb)}”</div>` : ''}
        </div>
        <div>
          <button class="btn-party" id="btn-launch-party-tab" style="padding:10px 18px;font-size:13px">🎉 Launch RobOS Party Game</button>
        </div>
      </div>

      <div class="section-grid">
        <div class="info-card">
          <h3>🎭 Party Game Role &amp; Preferences</h3>
          ${field('GamerTag', gp.gamerTag)}
          ${field('Preferred Role', roleInfo ? `${roleInfo.emoji} ${roleInfo.title} — ${roleInfo.blurb}` : (pg.preferredRole || 'Auto-assigned from survey traits'))}
          ${field('Favorite Games', (gp.favoriteGames || []).join(', '))}
          ${field('House Host Profile', Object.keys(pg.houseDefaults || {}).length ? '✅ Pre-configured for Game Night' : 'Not set')}
        </div>

        <div class="info-card">
          <h3>🗣️ Custom Party Game Facts (${(pg.customFacts||[]).length})</h3>
          ${(pg.customFacts||[]).length
            ? `<ul class="bullet-list">${pg.customFacts.map(f => `<li><b>${esc(f.prompt || 'Fact')}:</b> ${esc(f.answer || f.text)}</li>`).join('')}</ul>`
            : '<p class="text-block">No custom facts added.</p>'}
        </div>

        <div class="info-card">
          <h3>🧠 Custom Nerd Alert Trivia (${(pg.customTrivia||[]).length})</h3>
          ${(pg.customTrivia||[]).length
            ? `<ul class="bullet-list">${pg.customTrivia.map(t => `<li><b>[${esc(t.interest)}]</b> ${esc(t.question)} → <span style="color:#7ee787">${esc(t.choices?.[t.answer] || '')}</span></li>`).join('')}</ul>`
            : '<p class="text-block">No custom trivia questions added.</p>'}
        </div>

        <div class="info-card">
          <h3>🏅 Custom Superlatives &amp; Bot Bluffs</h3>
          ${(pg.customSuperlatives||[]).length
            ? `<ul class="bullet-list" style="margin-bottom:10px">${pg.customSuperlatives.map(s => `<li><b>${esc(s.superlative)}</b> — ${esc(s.reason)}</li>`).join('')}</ul>`
            : ''}
          ${(pg.customBluffs||[]).length
            ? `<div class="field-label" style="margin-bottom:4px">Two Truths &amp; a Bot Bluffs:</div><ul class="bullet-list warn">${pg.customBluffs.map(b => `<li>${esc(b)}</li>`).join('')}</ul>`
            : ''}
        </div>

        <div class="info-card full">
          <h3>📋 Pre-Saved RobOS Party Game Survey Answers (${answeredCount}/${partySchema.questions.length || 18})</h3>
          <div class="survey-grid">
            ${(partySchema.questions || []).map(q => {
              const val = surveyAnswers[q.id];
              const opt = q.kind === 'choice' ? (q.options || []).find(o => o.value === val) : null;
              const display = opt ? opt.label : (val !== undefined && val !== '' ? String(val) : '—');
              return `<div class="survey-item">
                <div class="survey-q">${esc(q.prompt)}</div>
                <div class="survey-a">${esc(display)}${q.kind === 'scale' && val ? ' / 5' : ''}</div>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 6: PHOTOS -->
    <div class="tab-pane ${activeTab==='photos'?'active':''}" id="pane-photos">
      <div class="info-card full" style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">
        <div>
          <h3 style="margin-bottom:4px">Photo Gallery</h3>
          <p class="text-block">Associate profile portraits, RPG character art, and Game Night photos with ${esc(p.displayName)}.</p>
        </div>
        <button class="btn-primary" id="btn-upload-gallery-photo">📷 Upload Photo from Computer</button>
      </div>
      <div class="photo-grid">
        ${(p.photos || []).map((ph, idx) => `
          <div class="photo-card">
            <img src="${esc(ph.dataUrl || ph.url)}" alt="${esc(ph.caption || p.displayName)}">
            <div class="photo-card-body">
              <div class="photo-caption">${esc(ph.caption || 'Profile photo')}</div>
              <div class="photo-actions">
                ${p.photo === ph.url
                  ? '<span class="mini-pill game">★ Primary Photo</span>'
                  : `<button class="btn-secondary btn-sm" data-set-primary="${esc(ph.url)}">Set as Primary</button>`}
                <button class="btn-danger btn-sm" data-remove-photo="${idx}">Remove</button>
              </div>
            </div>
          </div>
        `).join('') || '<p class="text-block">No photos uploaded yet. Click "Upload Photo from Computer" to add one.</p>'}
      </div>
    </div>

    <!-- TAB 7: CUSTOM / ADDITIONAL PROPERTIES -->
    <div class="tab-pane ${activeTab==='custom'?'active':''}" id="pane-custom">
      <div class="section-grid">
        <div class="info-card full">
          <h3>Additional Properties &amp; Notes</h3>
          ${(p.customProperties || []).length
            ? (p.customProperties || []).map(cp => field(`${cp.section ? `[${cp.section}] ` : ''}${cp.key}`, cp.value)).join('')
            : '<p class="text-block">No custom properties added yet. Click Edit Profile to add custom sections and key-value properties.</p>'}
        </div>
      </div>
    </div>
  `;

  // Wire tab buttons
  el.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      showProfile(p);
    });
  });

  // Partner link
  const partnerLink = document.getElementById('link-partner');
  if (partnerLink) {
    partnerLink.addEventListener('click', (e) => {
      e.preventDefault();
      const targetUid = partnerLink.dataset.partner;
      if (targetUid && allPeople.some(x => x.uid === targetUid)) {
        selectPerson(targetUid, true);
      }
    });
  }

  document.getElementById('btn-edit').addEventListener('click', () => openEdit(p));
  document.getElementById('btn-delete').addEventListener('click', () => doDelete(p.uid));

  const addPhotoHandler = async () => {
    const caption = prompt('Optional caption for this photo:', `${p.displayName} portrait`) || '';
    const res = await window.api.pickPhoto({ uid: p.uid, caption, setPrimary: true });
    if (res && res.ok) {
      await reload();
      selectPerson(p.uid, true);
    }
  };
  document.getElementById('btn-add-photo').addEventListener('click', addPhotoHandler);
  const galleryBtn = document.getElementById('btn-upload-gallery-photo');
  if (galleryBtn) galleryBtn.addEventListener('click', addPhotoHandler);

  const launchPartyBtn = document.getElementById('btn-launch-party-tab');
  if (launchPartyBtn) launchPartyBtn.addEventListener('click', () => window.api.launchPartyGame());

  el.querySelectorAll('[data-set-primary]').forEach(btn => {
    btn.addEventListener('click', async () => {
      p.photo = btn.dataset.setPrimary;
      await window.api.savePerson(p);
      await reload();
      selectPerson(p.uid, true);
    });
  });

  el.querySelectorAll('[data-remove-photo]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = Number(btn.dataset.removePhoto);
      const removed = (p.photos || [])[idx];
      p.photos = (p.photos || []).filter((_, i) => i !== idx);
      if (removed && p.photo === removed.url) {
        p.photo = p.photos[0]?.url || '';
      }
      await window.api.savePerson(p);
      await reload();
      selectPerson(p.uid, true);
    });
  });

  const btnMe = document.getElementById('btn-set-me');
  if (btnMe) btnMe.addEventListener('click', async () => {
    const isMe = p.uid === myProfileUid;
    await window.api.setMyProfile(isMe ? null : p.uid);
    myProfileUid = isMe ? null : p.uid;
    renderList();
    showProfile(p);
  });
}

function field(label, val) {
  if (!val) return '';
  return `<div class="profile-field"><span class="field-label">${esc(label)}</span><span class="field-val">${val}</span></div>`;
}

// ── Edit / New ────────────────────────────────────────────────────────────────
function openNew() {
  activeUid = null;
  editMode  = true;
  renderList();
  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('profile').classList.add('hidden');
  openEdit({
    uid: uid(),
    displayName: '',
    firstName: '',
    lastName: '',
    nickname: '',
    username: '',
    pronouns: '',
    ageRange: '',
    email: '',
    phone: '',
    location: '',
    title: '',
    department: '',
    manager: '',
    avatar: '🎲',
    color: '#00bcd4',
    bio: '',
    groups: [],
    personality: {},
    interests: {},
    family: {},
    gameProfile: { rpgCharacter: {}, partyGame: { surveyAnswers: {} } },
    customProperties: [],
  });
}

function openEdit(p) {
  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('profile').classList.add('hidden');
  const el = document.getElementById('edit-panel');
  el.classList.remove('hidden');

  const pers = p.personality || {};
  const intr = p.interests || {};
  const fam  = p.family || {};
  const gp   = p.gameProfile || {};
  const rpg  = gp.rpgCharacter || {};
  const pg   = gp.partyGame || {};
  const surveyAnswers = pg.surveyAnswers || {};

  el.innerHTML = `
    <div class="edit-header">
      <h2>${p.displayName ? 'Edit User &amp; Game Profile — ' + esc(p.displayName) : 'New User &amp; Game Profile'}</h2>
      <div>
        <button class="btn-primary" id="btn-save-top">Save Profile</button>
        <button class="btn-secondary" id="btn-cancel-top">Cancel</button>
      </div>
    </div>

    <div class="edit-body">
      <div class="edit-section-card">
        <div class="edit-section-title">1 · Identity, Avatar &amp; Contact</div>
        ${editRow('UID *',         'f-uid',         p.uid,         'text',  p.displayName ? 'readonly' : '')}
        ${editRow('Display Name',  'f-displayName', p.displayName, 'text')}
        ${editRow('First Name',    'f-firstName',   p.firstName,   'text')}
        ${editRow('Last Name',     'f-lastName',    p.lastName,    'text')}
        ${editRow('Nickname',      'f-nickname',    p.nickname,    'text')}
        ${editRow('Username',      'f-username',    p.username,    'text')}
        ${editRow('Pronouns',      'f-pronouns',    p.pronouns,    'text')}
        ${editRow('Age Range',     'f-ageRange',    p.ageRange,    'text')}
        ${editRow('Emoji Avatar',  'f-avatar',      p.avatar || '🎲', 'text')}
        ${editRow('Accent Color',  'f-color',       p.color || '#00bcd4', 'color')}
        ${editRow('Email',         'f-email',       p.email,       'email')}
        ${editRow('Phone',         'f-phone',       p.phone,       'text')}
        ${editRow('Location',      'f-location',    p.location,    'text')}
        ${editRow('Title / Role',  'f-title',       p.title,       'text')}
        ${editRow('Department',    'f-department',  p.department,  'text')}
        ${editRow('Groups (one/line)', 'f-groups',  (p.groups||[]).join('\n'), 'textarea', 'rows="2"')}
        ${editRow('Bio',           'f-bio',         p.bio,         'textarea', 'rows="3"')}
      </div>

      <div class="edit-section-card">
        <div class="edit-section-title">2 · Personality, Quirks &amp; Boundaries (Optional)</div>
        ${editRow('Archetype Title', 'f-pers-archetype', pers.archetype, 'text', 'placeholder="e.g. The Pragmatic, Loudmouthed Engineer"')}
        ${editRow('Tagline / Vibe',  'f-pers-tagline',   pers.tagline,   'text', 'placeholder="e.g. Spontaneity and irreverence"')}
        ${editRow('Defining Traits (one per line)', 'f-pers-traits', (pers.traits||[]).join('\n'), 'textarea', 'rows="3"')}
        ${editRow('Quirks &amp; Habits (one per line)', 'f-pers-quirks', (pers.quirks||[]).join('\n'), 'textarea', 'rows="4"')}
        ${editRow('Pet Peeves &amp; Dealbreakers', 'f-pers-peeves', (pers.petPeeves||[]).join('\n'), 'textarea', 'rows="3"')}
        ${editRow('Boundaries &amp; Rules', 'f-pers-boundaries', (pers.boundaries||[]).join('\n'), 'textarea', 'rows="3"')}
        ${editRow('Adaptability Notes', 'f-pers-adaptability', pers.adaptability, 'textarea', 'rows="2"')}
        ${editRow('Communication Style', 'f-pers-comm', pers.communicationStyle, 'textarea', 'rows="2"')}
      </div>

      <div class="edit-section-card">
        <div class="edit-section-title">3 · Interests, Music, Books &amp; Food (Optional)</div>
        ${editRow('Expert Topics (one per line)', 'f-int-expert', (intr.expertTopics||[]).join('\n'), 'textarea', 'rows="3"')}
        ${editRow('Hobbies (one per line)', 'f-int-hobbies', (intr.hobbies||[]).join('\n'), 'textarea', 'rows="3"')}
        ${editRow('Favorite Bands', 'f-int-bands', (intr.favoriteBands||[]).join('\n'), 'textarea', 'rows="2"')}
        ${editRow('Music Likes', 'f-int-mlikes', (intr.musicLikes||[]).join('\n'), 'textarea', 'rows="2"')}
        ${editRow('Music Dislikes / Hates', 'f-int-mdislikes', (intr.musicDislikes||[]).join('\n'), 'textarea', 'rows="2"')}
        ${editRow('Books &amp; Genres', 'f-int-books', (intr.booksAndGenres||[]).join('\n'), 'textarea', 'rows="2"')}
        ${editRow('Games &amp; Platforms', 'f-int-games', (intr.gamesAndPlatforms||[]).join('\n'), 'textarea', 'rows="2"')}
        ${editRow('Food &amp; Texture Notes', 'f-int-food', intr.foodAndTextureNotes, 'textarea', 'rows="2"')}
        ${editRow('Environment Preferences', 'f-int-env', intr.environmentPreferences, 'textarea', 'rows="2"')}
      </div>

      <div class="edit-section-card">
        <div class="edit-section-title">4 · Family, Partner &amp; Household Dynamic (Optional)</div>
        ${editRow('Partner UID', 'f-fam-partnerUid', fam.partnerUid, 'text', 'placeholder="e.g. diana-arrington"')}
        ${editRow('Partner Name', 'f-fam-partnerName', fam.partnerName, 'text', 'placeholder="e.g. Diana Arrington"')}
        ${editRow('Children / Family (one per line)', 'f-fam-children', (fam.children||[]).join('\n'), 'textarea', 'rows="2"')}
        ${editRow('Household Routines', 'f-fam-routines', fam.householdRoutines, 'textarea', 'rows="2"')}
        ${editRow('Relationship Dynamic', 'f-fam-dynamic', fam.relationshipDynamic, 'textarea', 'rows="3"')}
        ${editRow('Shared Activities (one per line)', 'f-fam-shared', (fam.sharedActivities||[]).join('\n'), 'textarea', 'rows="3"')}
      </div>

      <div class="edit-section-card">
        <div class="edit-section-title">5 · Game Profile &amp; RPG Persona (Optional)</div>
        ${editRow('GamerTag / Handle', 'f-gp-tag', gp.gamerTag, 'text')}
        ${editRow('RPG Game', 'f-rpg-game', rpg.game, 'text', 'placeholder="e.g. Baldur\'s Gate 3 (PS5 Co-op)"')}
        ${editRow('Character Class', 'f-rpg-class', rpg.characterClass, 'text', 'placeholder="e.g. Wizard or Paladin"')}
        ${editRow('Subclass / Oath', 'f-rpg-subclass', rpg.subclass, 'text', 'placeholder="e.g. School of Illusion / Oath of the Ancients"')}
        ${editRow('Platform', 'f-rpg-platform', rpg.platform, 'text', 'placeholder="e.g. PS5"')}
        ${editRow('Playstyle', 'f-rpg-playstyle', rpg.playstyle, 'textarea', 'rows="2"')}
        ${editRow('Character Blurb', 'f-rpg-blurb', rpg.blurb, 'textarea', 'rows="2"')}
        ${editRow('Favorite Games (one per line)', 'f-gp-favgames', (gp.favoriteGames||[]).join('\n'), 'textarea', 'rows="2"')}
        <div class="form-row">
          <label>Preferred Party Role</label>
          <select id="f-pg-role">
            <option value="">Auto-assign from survey traits</option>
            ${(partySchema.roles || []).map(r => `<option value="${esc(r.id)}" ${pg.preferredRole === r.id ? 'selected' : ''}>${esc(r.emoji)} ${esc(r.title)} — ${esc(r.blurb)}</option>`).join('')}
          </select>
        </div>
        ${editRow('Two Truths &amp; a Bot Bluffs (one per line)', 'f-pg-bluffs', (pg.customBluffs||[]).join('\n'), 'textarea', 'rows="2"')}
      </div>

      <div class="edit-section-card">
        <div class="edit-section-title">6 · RobOS Party Game Onboarding Survey Answers</div>
        ${(partySchema.questions || []).map(q => {
          const v = surveyAnswers[q.id];
          if (q.kind === 'choice') {
            return `<div class="form-row"><label>${esc(q.prompt)}</label><select data-survey-q="${esc(q.id)}">
              <option value="">—</option>
              ${(q.options||[]).map(o => `<option value="${esc(o.value)}" ${v===o.value?'selected':''}>${esc(o.label)}</option>`).join('')}
            </select></div>`;
          }
          if (q.kind === 'scale') {
            return `<div class="form-row"><label>${esc(q.prompt)} (1-5)</label><select data-survey-q="${esc(q.id)}" data-kind="scale">
              <option value="">—</option>
              ${[1,2,3,4,5].map(n => `<option value="${n}" ${Number(v)===n?'selected':''}>${n} (${n===1?esc(q.minLabel):n===5?esc(q.maxLabel):''})</option>`).join('')}
            </select></div>`;
          }
          return `<div class="form-row"><label>${esc(q.prompt)}</label><input type="text" data-survey-q="${esc(q.id)}" value="${esc(v||'')}" placeholder="${esc(q.placeholder||'')}"></div>`;
        }).join('')}
      </div>

      <div class="edit-section-card">
        <div class="edit-section-title">7 · Additional Custom Properties</div>
        <div id="custom-props-list">
          ${(p.customProperties || []).map((cp, idx) => renderCustomPropRow(cp, idx)).join('')}
        </div>
        <button type="button" class="btn-secondary btn-sm" id="btn-add-custom-prop">＋ Add Custom Property</button>
      </div>
    </div>

    <div class="edit-footer">
      <button class="btn-primary" id="btn-save-person">Save Profile</button>
      <button class="btn-secondary" id="btn-cancel-edit">Cancel</button>
    </div>`;

  document.getElementById('btn-add-custom-prop').addEventListener('click', () => {
    const container = document.getElementById('custom-props-list');
    container.insertAdjacentHTML('beforeend', renderCustomPropRow({ section: 'Custom', key: '', value: '' }, Date.now()));
    wireCustomPropRemoves();
  });
  wireCustomPropRemoves();

  const cancelFn = () => {
    if (activeUid) selectPerson(activeUid, true);
    else { document.getElementById('edit-panel').classList.add('hidden'); document.getElementById('empty-state').classList.remove('hidden'); }
  };
  document.getElementById('btn-save-person').addEventListener('click', () => doSave(p));
  document.getElementById('btn-save-top').addEventListener('click', () => doSave(p));
  document.getElementById('btn-cancel-edit').addEventListener('click', cancelFn);
  document.getElementById('btn-cancel-top').addEventListener('click', cancelFn);
}

function renderCustomPropRow(cp, idx) {
  return `<div class="custom-prop-row" data-cp-row="${idx}">
    <input type="text" class="cp-section" placeholder="Section" value="${esc(cp.section || '')}">
    <input type="text" class="cp-key" placeholder="Property Name" value="${esc(cp.key || '')}">
    <input type="text" class="cp-val" placeholder="Value" value="${esc(cp.value || '')}">
    <button type="button" class="btn-danger btn-sm cp-rm">✕</button>
  </div>`;
}

function wireCustomPropRemoves() {
  document.querySelectorAll('.cp-rm').forEach(btn => {
    btn.onclick = () => btn.closest('.custom-prop-row').remove();
  });
}

function editRow(label, id, val, type, extra='') {
  if (type === 'textarea') {
    return `<div class="form-row"><label>${label}</label><textarea id="${id}" ${extra}>${esc(val||'')}</textarea></div>`;
  }
  return `<div class="form-row"><label>${label}</label><input id="${id}" type="${type}" value="${esc(val||'')}" ${extra}></div>`;
}

function splitLines(id) {
  const el = document.getElementById(id);
  if (!el) return [];
  return el.value.split('\n').map(s => s.trim()).filter(Boolean);
}

async function doSave(orig) {
  const surveyAnswers = { ...(orig.gameProfile?.partyGame?.surveyAnswers || {}) };
  document.querySelectorAll('[data-survey-q]').forEach(el => {
    const qid = el.dataset.surveyQ;
    const val = el.value.trim();
    if (!val) delete surveyAnswers[qid];
    else surveyAnswers[qid] = el.dataset.kind === 'scale' ? Number(val) : val;
  });

  const customProperties = [];
  document.querySelectorAll('.custom-prop-row').forEach(row => {
    const section = row.querySelector('.cp-section').value.trim();
    const key     = row.querySelector('.cp-key').value.trim();
    const value   = row.querySelector('.cp-val').value.trim();
    if (key || value) customProperties.push({ section: section || 'General', key, value });
  });

  const avatar = document.getElementById('f-avatar').value.trim() || '🎲';
  const color  = document.getElementById('f-color').value.trim() || '#00bcd4';

  const person = {
    ...orig,
    uid:         document.getElementById('f-uid').value.trim(),
    displayName: document.getElementById('f-displayName').value.trim(),
    firstName:   document.getElementById('f-firstName').value.trim(),
    lastName:    document.getElementById('f-lastName').value.trim(),
    nickname:    document.getElementById('f-nickname').value.trim(),
    username:    document.getElementById('f-username').value.trim(),
    pronouns:    document.getElementById('f-pronouns').value.trim(),
    ageRange:    document.getElementById('f-ageRange').value.trim(),
    avatar,
    color,
    email:       document.getElementById('f-email').value.trim(),
    phone:       document.getElementById('f-phone').value.trim(),
    location:    document.getElementById('f-location').value.trim(),
    title:       document.getElementById('f-title').value.trim(),
    department:  document.getElementById('f-department').value.trim(),
    groups:      splitLines('f-groups'),
    bio:         document.getElementById('f-bio').value.trim(),
    personality: {
      ...(orig.personality || {}),
      archetype:          document.getElementById('f-pers-archetype').value.trim(),
      tagline:            document.getElementById('f-pers-tagline').value.trim(),
      traits:             splitLines('f-pers-traits'),
      quirks:             splitLines('f-pers-quirks'),
      petPeeves:          splitLines('f-pers-peeves'),
      boundaries:          splitLines('f-pers-boundaries'),
      adaptability:       document.getElementById('f-pers-adaptability').value.trim(),
      communicationStyle: document.getElementById('f-pers-comm').value.trim(),
    },
    interests: {
      ...(orig.interests || {}),
      expertTopics:           splitLines('f-int-expert'),
      hobbies:                splitLines('f-int-hobbies'),
      favoriteBands:          splitLines('f-int-bands'),
      musicLikes:             splitLines('f-int-mlikes'),
      musicDislikes:          splitLines('f-int-mdislikes'),
      booksAndGenres:         splitLines('f-int-books'),
      gamesAndPlatforms:      splitLines('f-int-games'),
      foodAndTextureNotes:    document.getElementById('f-int-food').value.trim(),
      environmentPreferences: document.getElementById('f-int-env').value.trim(),
    },
    family: {
      ...(orig.family || {}),
      partnerUid:          document.getElementById('f-fam-partnerUid').value.trim(),
      partnerName:         document.getElementById('f-fam-partnerName').value.trim(),
      children:            splitLines('f-fam-children'),
      householdRoutines:   document.getElementById('f-fam-routines').value.trim(),
      relationshipDynamic: document.getElementById('f-fam-dynamic').value.trim(),
      sharedActivities:    splitLines('f-fam-shared'),
    },
    gameProfile: {
      ...(orig.gameProfile || {}),
      gamerTag: document.getElementById('f-gp-tag').value.trim(),
      avatar,
      color,
      rpgCharacter: {
        ...(orig.gameProfile?.rpgCharacter || {}),
        game:           document.getElementById('f-rpg-game').value.trim(),
        characterClass: document.getElementById('f-rpg-class').value.trim(),
        subclass:       document.getElementById('f-rpg-subclass').value.trim(),
        platform:       document.getElementById('f-rpg-platform').value.trim(),
        playstyle:      document.getElementById('f-rpg-playstyle').value.trim(),
        blurb:          document.getElementById('f-rpg-blurb').value.trim(),
      },
      favoriteGames: splitLines('f-gp-favgames'),
      partyGame: {
        ...(orig.gameProfile?.partyGame || {}),
        enabled: true,
        preferredRole: document.getElementById('f-pg-role').value,
        surveyAnswers,
        customBluffs: splitLines('f-pg-bluffs'),
      },
    },
    customProperties,
  };
  if (!person.uid) { alert('UID is required'); return; }
  if (!person.displayName) person.displayName = `${person.firstName} ${person.lastName}`.trim() || person.uid;
  await window.api.savePerson(person);
  activeUid = person.uid;
  await reload();
  selectPerson(person.uid, true);
}

async function doDelete(id) {
  if (!confirm('Delete this person profile?')) return;
  await window.api.deletePerson(id);
  activeUid = null;
  document.getElementById('profile').classList.add('hidden');
  document.getElementById('empty-state').classList.remove('hidden');
  await reload();
}

// ── Import LDIF ───────────────────────────────────────────────────────────────
async function doImport() {
  const text = document.getElementById('ldif-text').value;
  if (!text.trim()) return;
  const res = await window.api.importLdif(text);
  document.getElementById('import-modal').classList.add('hidden');
  document.getElementById('ldif-text').value = '';
  await reload();
  alert(`Imported ${res.imported} people.`);
}

// ── Settings ──────────────────────────────────────────────────────────────────
async function openSettings() {
  const cfg = await window.api.getConfig();
  document.getElementById('cfg-backend').value = cfg.backend || 'filesystem';
  document.getElementById('cfg-url').value       = cfg.ldap?.url || '';
  document.getElementById('cfg-basedn').value    = cfg.ldap?.baseDn || '';
  document.getElementById('cfg-binddn').value    = cfg.ldap?.bindDn || '';
  document.getElementById('cfg-bindpass').value  = cfg.ldap?.bindPassPath || '';
  document.getElementById('cfg-searchbase').value= cfg.ldap?.searchBase || '';
  document.getElementById('ldap-fields').classList.toggle('hidden', cfg.backend !== 'ldap');
  document.getElementById('settings-modal').classList.remove('hidden');
}

async function saveSettings() {
  const backend = document.getElementById('cfg-backend').value;
  const cfg = { backend };
  if (backend === 'ldap') {
    cfg.ldap = {
      url:          document.getElementById('cfg-url').value.trim(),
      baseDn:       document.getElementById('cfg-basedn').value.trim(),
      bindDn:       document.getElementById('cfg-binddn').value.trim(),
      bindPassPath: document.getElementById('cfg-bindpass').value.trim(),
      searchBase:   document.getElementById('cfg-searchbase').value.trim(),
    };
  }
  await window.api.saveConfig(cfg);
  document.getElementById('settings-modal').classList.add('hidden');
}

// ── AI Add Person panel ───────────────────────────────────────────────────────
function initAIPanel() {
  const toggle   = document.getElementById('ai-panel-toggle');
  const body     = document.getElementById('ai-panel-body');
  const select   = document.getElementById('ai-agent-select');
  const textarea = document.getElementById('ai-prompt');
  const btn      = document.getElementById('ai-generate-btn');
  const status   = document.getElementById('ai-status');

  if (typeof customElements !== 'undefined') {
    customElements.whenDefined('robos-ai-textarea').then(() => {
      if (textarea && textarea.addEventListener) {
        textarea.addEventListener('robos-path-query', async (e) => {
          try {
            const r = await window.api.searchIndex(e.detail.query);
            if (r && r.ok && textarea._showMentions) textarea._showMentions(r.items);
          } catch (_) {}
        });
      }
    }).catch(() => {});
  }

  function showStatus(msg, type = '') {
    status.textContent = msg;
    status.className = type;
    status.classList.remove('hidden');
    if (type === 'success') setTimeout(() => status.classList.add('hidden'), 4000);
  }

  window.api.listAIProviders().then(({ activeName, providers }) => {
    select.options[0].textContent = `Default (${activeName})`;
    providers.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      select.appendChild(opt);
    });
  }).catch(() => {});

  toggle.addEventListener('click', () => {
    body.classList.toggle('hidden');
    toggle.textContent = body.classList.contains('hidden') ? '✨ Add / Enrich with AI' : '✨ Add / Enrich with AI ▲';
  });

  btn.addEventListener('click', async () => {
    const prompt = textarea.value.trim();
    if (!prompt) { showStatus('Describe the person first.', 'error'); return; }
    btn.disabled = true;
    btn.textContent = '⏳ Generating…';
    showStatus('', '');
    try {
      const providerId = select.value || null;
      const result = await window.api.aiAddPerson(prompt, providerId);
      if (!result.ok) { showStatus(result.error || 'AI generation failed.', 'error'); return; }
      const people = result.people || [result.person];
      await reload();
      activeUid = people[0].uid;
      selectPerson(people[0].uid);
      const names = people.map(p => p.displayName).join(', ');
      showStatus(`✅ Saved ${people.length} profile(s): ${names}`, 'success');
      textarea.value = '';
    } catch (e) {
      showStatus(e.message || String(e), 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Generate & Save Profile';
    }
  });
}

// ── RobOS icon registry injection ────────────────────────────────────
(function() {
  const _apps = window.ROBOS_BUILTIN_APPS || [];
  const _entry = _apps.find(a => a.appId === 'people-directory');
  if (_entry) {
    const _el = document.getElementById('app-logo-icon');
    if (_el) _el.innerHTML = _entry.iconSvg
      .replace(/width="48"/, 'width="28"').replace(/height="48"/, 'height="28"');
  }
})();

// ── Resizable sidebar splitter ────────────────────────────────────────────────
(function() {
  const handle  = document.getElementById('resize-handle');
  const sidebar = document.getElementById('sidebar');
  if (!handle || !sidebar) return;
  let dragging = false, startX = 0, startW = 0;
  handle.addEventListener('mousedown', e => {
    dragging = true;
    startX = e.clientX;
    startW = sidebar.getBoundingClientRect().width;
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const newW = Math.min(520, Math.max(220, startW + (e.clientX - startX)));
    sidebar.style.width = newW + 'px';
  });
  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
})();
