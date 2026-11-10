'use strict';

const state = {
  email: '',
  defaultCalendarId: '',
  selectedCalendarId: '',
  filterCalendarId: 'ALL',
  calendars: [],
  familyMembers: [],
  events: [],
  selectedFamilyEmails: new Set(),
  durationMinutes: 60,
  accessDoc: {},
  recording: false,
  mediaRecorder: null,
  audioChunks: [],
};

function esc(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(msg, durationMs = 4200) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => el.classList.add('hidden'), durationMs);
}

function initDefaultDates() {
  const now = new Date();
  const nextHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 0);
  const ymd = `${nextHour.getFullYear()}-${String(nextHour.getMonth() + 1).padStart(2, '0')}-${String(nextHour.getDate()).padStart(2, '0')}`;
  const startHm = `${String(nextHour.getHours()).padStart(2, '0')}:00`;
  const endObj = new Date(nextHour.getTime() + state.durationMinutes * 60000);
  const endYmd = `${endObj.getFullYear()}-${String(endObj.getMonth() + 1).padStart(2, '0')}-${String(endObj.getDate()).padStart(2, '0')}`;
  const endHm = `${String(endObj.getHours()).padStart(2, '0')}:${String(endObj.getMinutes()).padStart(2, '0')}`;

  document.getElementById('evt-start-date').value = ymd;
  document.getElementById('evt-start-time').value = startHm;
  document.getElementById('evt-end-date').value = endYmd;
  document.getElementById('evt-end-time').value = endHm;
}

function recomputeEndFromDuration() {
  const startDate = document.getElementById('evt-start-date').value;
  const startTime = document.getElementById('evt-start-time').value || '17:00';
  if (!startDate) return;
  const startObj = new Date(`${startDate}T${startTime}`);
  if (Number.isNaN(startObj.getTime())) return;
  const endObj = new Date(startObj.getTime() + state.durationMinutes * 60000);
  const endYmd = `${endObj.getFullYear()}-${String(endObj.getMonth() + 1).padStart(2, '0')}-${String(endObj.getDate()).padStart(2, '0')}`;
  const endHm = `${String(endObj.getHours()).padStart(2, '0')}:${String(endObj.getMinutes()).padStart(2, '0')}`;
  document.getElementById('evt-end-date').value = endYmd;
  document.getElementById('evt-end-time').value = endHm;
}

function syncDefaultGuestsForSelectedCalendar(calendarId) {
  const cal = state.calendars.find((c) => c.id === calendarId);
  state.selectedFamilyEmails.clear();
  if (cal && cal.isFamilyCalendar) {
    const sharedList = Array.isArray(cal.sharedWith) && cal.sharedWith.length ? cal.sharedWith : state.familyMembers;
    for (const fm of sharedList) {
      if (fm && fm.email) state.selectedFamilyEmails.add(fm.email);
    }
  }
}

function renderNamedCalendars() {
  const grid = document.getElementById('named-calendars-grid');
  const select = document.getElementById('evt-calendar');
  const targetPill = document.getElementById('target-cal-pill');

  const writableCals = state.calendars.filter((c) => c.writable !== false);
  if (!state.selectedCalendarId && writableCals.length) {
    const urlCal = new URLSearchParams(window.location.search).get('calendar');
    const matched = urlCal && writableCals.find((c) => c.id === urlCal || c.name.toLowerCase() === urlCal.toLowerCase());
    state.selectedCalendarId = matched ? matched.id : (state.defaultCalendarId || writableCals[0].id);
    syncDefaultGuestsForSelectedCalendar(state.selectedCalendarId);
  }

  select.innerHTML = writableCals
    .map(
      (c) =>
        `<option value="${esc(c.id)}" ${c.id === state.selectedCalendarId ? 'selected' : ''}>${
          c.isFamilyCalendar ? '👨‍👩‍👧‍👦 ' : c.primary ? '📅 ' : '🗓️ '
        }${esc(c.name)}</option>`
    )
    .join('');

  const activeCal = state.calendars.find((c) => c.id === state.selectedCalendarId) || writableCals[0];
  if (activeCal && targetPill) {
    targetPill.textContent = `${activeCal.isFamilyCalendar ? '👨‍👩‍👧‍👦' : '📅'} ${activeCal.name}`;
    targetPill.style.borderColor = activeCal.color;
    targetPill.style.color = activeCal.color;
  }

  grid.innerHTML = state.calendars
    .map((c) => {
      const isSelected = c.id === state.selectedCalendarId;
      const roleLabel = c.primary
        ? 'Primary · Owner'
        : c.isFamilyCalendar
          ? 'Shared Family Calendar'
          : c.writable
            ? 'Shared · Writable'
            : 'Read-Only Feed';
      const sharedAvatars = Array.isArray(c.sharedWith) && c.sharedWith.length
        ? `<div class="named-cal-shared">Shared with: ${c.sharedWith.map((m) => `${esc(m.avatar)} ${esc(m.nickname || m.firstName)}`).join(' · ')}</div>`
        : `<div class="named-cal-shared">${esc(c.description || c.id)}</div>`;
      const gcalUrl = c.googleCalendarUrl || `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(c.id)}`;
      const gcalEmbedUrl = c.googleCalendarEmbedUrl || `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(c.id)}`;

      return `
        <div class="named-cal-card ${isSelected ? 'active' : ''}" data-cal-id="${esc(c.id)}" data-writable="${c.writable !== false}">
          <div class="named-cal-top">
            <div class="named-cal-title">
              <span class="color-dot" style="background:${esc(c.color)}"></span>
              <span>${esc(c.name)}</span>
            </div>
            <span class="cal-role-badge">${esc(roleLabel)}</span>
          </div>
          ${sharedAvatars}
          <div class="named-cal-links" style="margin-top:6px;display:flex;gap:10px;flex-wrap:wrap;font-size:11.5px;">
            <a href="${esc(gcalUrl)}" target="_blank" rel="noopener" class="gcal-ext-link" style="color:#38bdf8;text-decoration:none;font-weight:600;">🌐 Open in Google Calendar ↗</a>
            <a href="${esc(gcalEmbedUrl)}" target="_blank" rel="noopener" class="gcal-ext-link" style="color:#94a3b8;text-decoration:none;">📅 Browser View ↗</a>
          </div>
        </div>
      `;
    })
    .join('');

  grid.querySelectorAll('.gcal-ext-link').forEach((link) => {
    link.addEventListener('click', (ev) => ev.stopPropagation());
  });

  grid.querySelectorAll('.named-cal-card').forEach((card) => {
    card.addEventListener('click', () => {
      const calId = card.dataset.calId;
      const writable = card.dataset.writable === 'true';
      state.filterCalendarId = calId;
      if (writable) {
        state.selectedCalendarId = calId;
        select.value = calId;
        syncDefaultGuestsForSelectedCalendar(calId);
        renderFamilyChips();
      }
      document.getElementById('cfg-cal-id').value = calId;
      renderNamedCalendars();
      renderEvents();
    });
  });
}

function renderFamilyChips() {
  const container = document.getElementById('family-chips');
  const profilesContainer = document.getElementById('family-profiles-list');

  container.innerHTML = state.familyMembers
    .map((fm) => {
      const selected = state.selectedFamilyEmails.has(fm.email);
      return `
        <div class="family-chip ${selected ? 'selected' : ''}" data-email="${esc(fm.email)}" title="${esc(fm.name)} (${esc(fm.email)})">
          <span>${esc(fm.avatar || '👤')}</span>
          <span>${esc(fm.nickname || fm.firstName || fm.name)}</span>
          <span class="chip-email">&lt;${esc(fm.email)}&gt;</span>
        </div>
      `;
    })
    .join('');

  container.querySelectorAll('.family-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const email = chip.dataset.email;
      if (!email) return;
      if (state.selectedFamilyEmails.has(email)) {
        state.selectedFamilyEmails.delete(email);
      } else {
        state.selectedFamilyEmails.add(email);
      }
      renderFamilyChips();
    });
  });

  if (profilesContainer) {
    profilesContainer.innerHTML = state.familyMembers
      .map(
        (fm) => `
        <div class="family-profile-row">
          <div class="family-profile-top">
            <div>
              <span class="family-profile-name">${esc(fm.avatar)} ${esc(fm.name)}</span>
              ${fm.birthday ? `<span class="cal-role-badge">🎂 ${esc(fm.birthday)}</span>` : ''}
            </div>
            <button type="button" class="btn-link schedule-with-btn" data-email="${esc(fm.email)}" data-name="${esc(fm.nickname || fm.firstName)}">
              + Invite ${esc(fm.nickname || fm.firstName)}
            </button>
          </div>
          <div class="family-profile-email">${esc(fm.email)} · ${esc(fm.role || '')}</div>
          <div class="family-profile-summary">${esc(fm.summary || '')}</div>
        </div>
      `
      )
      .join('');

    profilesContainer.querySelectorAll('.schedule-with-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const email = btn.dataset.email;
        const name = btn.dataset.name;
        if (email) {
          state.selectedFamilyEmails.add(email);
          renderFamilyChips();
          const sumEl = document.getElementById('evt-summary');
          if (!sumEl.value.trim()) {
            sumEl.value = `Event with ${name}`;
          }
          sumEl.focus();
          showToast(`Added ${name} <${email}> to event guests`);
        }
      });
    });
  }
}

function renderEvents() {
  const tabsEl = document.getElementById('calendar-filter-tabs');
  const listEl = document.getElementById('events-list');
  const badgeEl = document.getElementById('events-count-badge');

  const tabs = [
    { id: 'ALL', name: 'All Calendars' },
    ...state.calendars.map((c) => ({ id: c.id, name: c.name, color: c.color })),
  ];

  tabsEl.innerHTML = tabs
    .map(
      (t) => `
      <button type="button" class="filter-tab ${state.filterCalendarId === t.id ? 'active' : ''}" data-filter-id="${esc(t.id)}">
        ${esc(t.name)}
      </button>`
    )
    .join('');

  tabsEl.querySelectorAll('.filter-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.filterCalendarId = btn.dataset.filterId;
      renderEvents();
    });
  });

  const nowMs = Date.now() - 3600 * 1000;
  const filtered = state.events.filter((ev) => {
    if (new Date(ev.end || ev.start).getTime() < nowMs) return false;
    if (state.filterCalendarId === 'ALL') return true;
    return ev.calendarId === state.filterCalendarId || ev.calendarName === state.filterCalendarId;
  });

  badgeEl.textContent = String(filtered.length);

  if (!filtered.length) {
    listEl.innerHTML = `<div class="muted" style="padding:16px;text-align:center;">No upcoming events in this calendar view.</div>`;
    return;
  }

  listEl.innerHTML = filtered
    .slice(0, 25)
    .map((ev) => {
      const d = new Date(ev.start);
      const whenStr = ev.allDay
        ? d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' · All Day'
        : d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      const guests = Array.isArray(ev.attendees) && ev.attendees.length ? `👥 ${ev.attendees.length} guest(s)` : '';
      return `
        <div class="event-item" style="border-left-color:${esc(ev.color || '#00bcd4')}">
          <div>
            <div class="event-item-title">${esc(ev.summary)}</div>
            <div class="event-item-meta">
              <span>🗓️ ${esc(ev.calendarName || 'Primary')}</span>
              <span>🕒 ${esc(whenStr)}</span>
              ${ev.location ? `<span>📍 ${esc(ev.location)}</span>` : ''}
              ${guests ? `<span>${esc(guests)}</span>` : ''}
            </div>
          </div>
          <button type="button" class="btn-delete-ev" data-id="${esc(ev.id)}" data-cal-id="${esc(ev.calendarId || '')}">Delete</button>
        </div>
      `;
    })
    .join('');

  listEl.querySelectorAll('.btn-delete-ev').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const calId = btn.dataset.calId || '';
      await fetch(`/api/events/${encodeURIComponent(id)}?calendarId=${encodeURIComponent(calId)}`, { method: 'DELETE' });
      showToast('Deleted event from Google Calendar');
      await loadState();
    });
  });
}

function applyParsedEventToForm(parsed) {
  if (!parsed) return;
  if (parsed.summary) document.getElementById('evt-summary').value = parsed.summary;
  if (parsed.calendarId) {
    state.selectedCalendarId = parsed.calendarId;
    document.getElementById('evt-calendar').value = parsed.calendarId;
    syncDefaultGuestsForSelectedCalendar(parsed.calendarId);
    renderNamedCalendars();
    renderFamilyChips();
  }
  const allDayEl = document.getElementById('evt-all-day');
  allDayEl.checked = Boolean(parsed.allDay);
  toggleAllDayFields(allDayEl.checked);
  if (parsed.startDate) document.getElementById('evt-start-date').value = parsed.startDate;
  if (parsed.startTime) document.getElementById('evt-start-time').value = parsed.startTime;
  if (parsed.endDate) document.getElementById('evt-end-date').value = parsed.endDate;
  if (parsed.endTime) document.getElementById('evt-end-time').value = parsed.endTime;
  if (parsed.recurrence) document.getElementById('evt-recurrence').value = parsed.recurrence;
  if (parsed.location) document.getElementById('evt-location').value = parsed.location;
  if (Array.isArray(parsed.attendees) && parsed.attendees.length) {
    for (const att of parsed.attendees) {
      if (att.email) state.selectedFamilyEmails.add(att.email);
    }
    renderFamilyChips();
  }
}

function toggleAllDayFields(isAllDay) {
  document.getElementById('start-time-group').classList.toggle('hidden', isAllDay);
  document.getElementById('end-time-group').classList.toggle('hidden', isAllDay);
  document.getElementById('duration-pills').classList.toggle('hidden', isAllDay);
}

async function loadState() {
  const res = await fetch('/api/state');
  const data = await res.json();
  if (!data.ok) return;
  state.email = data.email || '';
  state.defaultCalendarId = data.defaultCalendarId || '';
  state.calendars = data.calendars || [];
  state.familyMembers = data.familyMembers || [];
  state.events = data.events || [];
  state.accessDoc = data.accessDoc || {};

  const sub = document.getElementById('account-subtitle');
  if (sub && state.email) {
    sub.textContent = `Signed in as ${state.email} · ${state.calendars.length} Named Google Calendars · Live CalDAV Sync`;
  }

  const gdocBtn = document.getElementById('btn-open-gdoc');
  if (gdocBtn && state.accessDoc?.docUrl) {
    gdocBtn.href = state.accessDoc.docUrl;
    gdocBtn.classList.remove('hidden');
  }

  renderNamedCalendars();
  renderFamilyChips();
  renderEvents();
}

function setupEventListeners() {
  document.getElementById('evt-calendar').addEventListener('change', (e) => {
    state.selectedCalendarId = e.target.value;
    syncDefaultGuestsForSelectedCalendar(state.selectedCalendarId);
    renderNamedCalendars();
    renderFamilyChips();
  });

  document.getElementById('evt-all-day').addEventListener('change', (e) => {
    toggleAllDayFields(e.target.checked);
  });

  document.querySelectorAll('.pill-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pill-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.durationMinutes = Number(btn.dataset.mins) || 60;
      recomputeEndFromDuration();
    });
  });

  document.getElementById('evt-start-date').addEventListener('change', recomputeEndFromDuration);
  document.getElementById('evt-start-time').addEventListener('change', recomputeEndFromDuration);

  document.getElementById('btn-invite-all-family').addEventListener('click', () => {
    for (const fm of state.familyMembers) {
      if (fm.email) state.selectedFamilyEmails.add(fm.email);
    }
    renderFamilyChips();
  });

  document.getElementById('btn-clear-family').addEventListener('click', () => {
    state.selectedFamilyEmails.clear();
    renderFamilyChips();
  });

  document.getElementById('btn-gen-meet').addEventListener('click', () => {
    const slug = (document.getElementById('evt-summary').value || 'family')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 20);
    const rand = Math.random().toString(36).slice(2, 7);
    document.getElementById('evt-meeting-url').value = `https://meet.jit.si/RobOS-${slug}-${rand}`;
  });

  document.getElementById('btn-Customize-cal').addEventListener('click', () => {
    document.getElementById('custom-cal-form').classList.toggle('hidden');
  });

  document.getElementById('custom-cal-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('cfg-cal-id').value.trim() || state.selectedCalendarId;
    const name = document.getElementById('cfg-cal-name').value.trim();
    const color = document.getElementById('cfg-cal-color').value;
    const res = await fetch('/api/calendars/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, color }),
    });
    const data = await res.json();
    if (data.ok) {
      showToast(`Saved Named Calendar "${name}" & synced to Thunderbird!`);
      document.getElementById('custom-cal-form').classList.add('hidden');
      await loadState();
    }
  });

  // Smart Quick-Add Parse / Create
  document.getElementById('btn-parse-fill').addEventListener('click', async () => {
    const text = document.getElementById('quick-add-input').value.trim();
    if (!text) return;
    const res = await fetch('/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, autoCreate: false }),
    });
    const data = await res.json();
    if (data.ok && data.parsed) {
      applyParsedEventToForm(data.parsed);
      showToast('✨ Filled form from natural-language description!');
    }
  });

  document.getElementById('btn-quick-create').addEventListener('click', async () => {
    const text = document.getElementById('quick-add-input').value.trim();
    if (!text) return;
    const res = await fetch('/api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, autoCreate: true }),
    });
    const data = await res.json();
    if (data.ok && data.created) {
      document.getElementById('quick-add-input').value = '';
      showToast(`📅 Added "${data.created.summary}" to ${data.created.calendarName}!`);
      await loadState();
    }
  });

  // Voice Dictation Button
  const dictateBtn = document.getElementById('btn-dictate');
  const statusEl = document.getElementById('dictate-status');
  dictateBtn.addEventListener('click', async () => {
    if (state.recording && state.mediaRecorder) {
      state.mediaRecorder.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      state.audioChunks = [];
      const mr = new MediaRecorder(stream);
      state.mediaRecorder = mr;
      state.recording = true;
      dictateBtn.classList.add('recording');
      dictateBtn.textContent = '⏹️ Stop & Transcribe';
      statusEl.textContent = '🎙️ Listening... Speak your calendar event now.';
      statusEl.classList.remove('hidden');

      mr.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) state.audioChunks.push(ev.data);
      };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        state.recording = false;
        dictateBtn.classList.remove('recording');
        dictateBtn.textContent = '🎙️ Dictate Event';
        statusEl.textContent = '⏳ Transcribing with RobOS Whisper STT & parsing event...';

        const blob = new Blob(state.audioChunks, { type: mr.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = String(reader.result || '');
          const res = await fetch('/api/dictate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64: base64, mimeType: blob.type || 'audio/webm', autoCreate: false }),
          });
          const data = await res.json();
          if (data.ok && data.transcript) {
            document.getElementById('quick-add-input').value = data.transcript;
            applyParsedEventToForm(data.parsed);
            statusEl.textContent = `✅ Heard: "${data.transcript}" — Review fields below & click Save Event!`;
          } else {
            statusEl.textContent = `⚠️ ${data.error || 'Could not transcribe speech.'}`;
          }
        };
        reader.readAsDataURL(blob);
      };
      mr.start();
    } catch (err) {
      showToast(`Microphone error: ${err.message}`);
    }
  });

  // Sync Access Google Doc button
  document.getElementById('btn-sync-gdoc').addEventListener('click', async () => {
    const btn = document.getElementById('btn-sync-gdoc');
    btn.disabled = true;
    btn.textContent = '⏳ Updating Google Doc...';
    try {
      const res = await fetch('/api/sync-doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.ok) {
        showToast('📄 Updated "RobOS Calendar — Add Event Access Form" on Google Docs!');
        await loadState();
      } else {
        showToast(`Error: ${data.error}`);
      }
    } finally {
      btn.disabled = false;
      btn.textContent = '🔄 Update Access Doc';
    }
  });

  // Main Event Form Submit
  document.getElementById('add-event-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('btn-submit-event');
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ Saving to Google Calendar & Thunderbird...';

    try {
      const customGuests = document.getElementById('evt-custom-guests').value
        .split(/[,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const attendees = [...state.selectedFamilyEmails, ...customGuests];
      const remVal = Number(document.getElementById('evt-reminder').value);

      const payload = {
        summary: document.getElementById('evt-summary').value.trim(),
        calendarId: document.getElementById('evt-calendar').value,
        category: document.getElementById('evt-category').value,
        allDay: document.getElementById('evt-all-day').checked,
        startDate: document.getElementById('evt-start-date').value,
        startTime: document.getElementById('evt-start-time').value,
        endDate: document.getElementById('evt-end-date').value,
        endTime: document.getElementById('evt-end-time').value,
        recurrence: document.getElementById('evt-recurrence').value,
        timeZone: document.getElementById('evt-timezone').value,
        location: document.getElementById('evt-location').value.trim(),
        meetingUrl: document.getElementById('evt-meeting-url').value.trim(),
        reminderMinutes: remVal >= 0 ? remVal : null,
        availability: document.getElementById('evt-availability').value,
        visibility: document.getElementById('evt-visibility').value,
        description: document.getElementById('evt-description').value.trim(),
        attendees,
      };

      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) {
        document.getElementById('evt-summary').value = '';
        document.getElementById('evt-location').value = '';
        document.getElementById('evt-meeting-url').value = '';
        document.getElementById('evt-description').value = '';
        document.getElementById('evt-custom-guests').value = '';
        showToast(
          `✅ Added "${data.event.summary}" to ${data.event.calendarName}${data.syncedToGoogle ? ' (Synced to Google Calendar!)' : ''}`
        );
        await loadState();
      } else {
        showToast(`Error: ${data.error}`);
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = '📅 Save Event to Google Calendar & Thunderbird';
    }
  });

  // Live SSE Stream
  try {
    const es = new EventSource('/api/stream');
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type && msg.type !== 'connected') {
          loadState();
        }
      } catch {}
    };
  } catch {}
}

initDefaultDates();
setupEventListeners();
loadState();
