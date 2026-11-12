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
  editingEventId: '',
  editingCalendarId: '',
  detectedItineraryEvents: [],
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

function updateDateSpanBadge() {
  const badge = document.getElementById('date-span-badge');
  if (!badge) return;
  const startDate = document.getElementById('evt-start-date')?.value || '';
  const endDate = document.getElementById('evt-end-date')?.value || startDate;
  const isAllDay = Boolean(document.getElementById('evt-all-day')?.checked);
  if (!startDate) {
    badge.classList.add('hidden');
    return;
  }
  const sObj = new Date(`${startDate}T12:00:00`);
  const eObj = new Date(`${(endDate >= startDate ? endDate : startDate)}T12:00:00`);
  const diffDays = Math.round((eObj.getTime() - sObj.getTime()) / (86400 * 1000)) + 1;
  const sFmt = sObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const eFmt = eObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  badge.classList.remove('hidden');
  if (diffDays > 1) {
    badge.textContent = `🗓️ Multi-Day Event (${diffDays} days inclusive): ${sFmt} → ${eFmt}`;
  } else if (isAllDay) {
    badge.textContent = `☀️ All-Day Event: ${sFmt} (Set End Date to a later day for a multi-day trip/vacation)`;
  } else {
    const st = document.getElementById('evt-start-time')?.value || '';
    const et = document.getElementById('evt-end-time')?.value || '';
    badge.textContent = `🕒 Timed Event: ${sFmt} · ${st} – ${et}`;
  }
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
  updateDateSpanBadge();
}

function recomputeEndFromDuration(opts = {}) {
  const startDate = document.getElementById('evt-start-date').value;
  const endDateEl = document.getElementById('evt-end-date');
  const currentEndDate = endDateEl.value;
  const isAllDay = document.getElementById('evt-all-day').checked;
  if (!startDate) return;

  // Never clobber a multi-day endDate when All-Day is checked or when the user already picked a multi-day endDate
  if (isAllDay) {
    if (!currentEndDate || currentEndDate < startDate) {
      endDateEl.value = startDate;
    }
    updateDateSpanBadge();
    return;
  }

  const startTime = document.getElementById('evt-start-time').value || '17:00';
  const startObj = new Date(`${startDate}T${startTime}`);
  if (Number.isNaN(startObj.getTime())) return;
  const endObj = new Date(startObj.getTime() + state.durationMinutes * 60000);
  const endYmd = `${endObj.getFullYear()}-${String(endObj.getMonth() + 1).padStart(2, '0')}-${String(endObj.getDate()).padStart(2, '0')}`;
  const endHm = `${String(endObj.getHours()).padStart(2, '0')}:${String(endObj.getMinutes()).padStart(2, '0')}`;
  if (opts.forceDate || !currentEndDate || currentEndDate <= startDate) {
    endDateEl.value = endYmd;
  }
  document.getElementById('evt-end-time').value = endHm;
  updateDateSpanBadge();
}

function getVisibleMembersForSelectedCalendar() {
  const cal = state.calendars.find((c) => c.id === state.selectedCalendarId) || state.calendars[0];
  if (!cal) return state.familyMembers;
  if (Array.isArray(cal.sharedWith) && cal.sharedWith.length > 0) {
    const allowedEmails = new Set(cal.sharedWith.map((m) => String(m.email || '').toLowerCase()).filter(Boolean));
    return state.familyMembers.filter((fm) => allowedEmails.has(String(fm.email || '').toLowerCase()));
  }
  if (cal.primary) {
    return state.familyMembers.filter(
      (fm) => String(fm.email || '').toLowerCase() === String(state.email || '').toLowerCase()
    );
  }
  return state.familyMembers;
}

function syncDefaultGuestsForSelectedCalendar(calendarId) {
  const cal = state.calendars.find((c) => c.id === calendarId);
  state.selectedFamilyEmails.clear();
  if (cal && (cal.isFamilyCalendar || (Array.isArray(cal.sharedWith) && cal.sharedWith.length > 0))) {
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
  const purposeEl = document.getElementById('selected-cal-purpose');
  if (purposeEl) {
    purposeEl.textContent = activeCal?.description ? `📌 ${activeCal.description}` : '';
  }

  grid.innerHTML = state.calendars
    .map((c) => {
      const isSelected = c.id === state.selectedCalendarId;
      const roleLabel = c.primary
        ? 'Primary · Private'
        : c.isFamilyCalendar
          ? 'Shared Family Calendar'
          : c.writable
            ? 'Shared · Writable'
            : 'Read-Only Feed';
      const descLine = c.description
        ? `<div class="named-cal-desc" style="font-size:12px;color:#cbd5e1;margin-top:4px;line-height:1.35;">📌 ${esc(c.description)}</div>`
        : '';
      const sharedAvatars = Array.isArray(c.sharedWith) && c.sharedWith.length
        ? `<div class="named-cal-shared" style="margin-top:4px;">Shared with: ${c.sharedWith.map((m) => `${esc(m.avatar)} ${esc(m.nickname || m.firstName)}`).join(' · ')}</div>`
        : '';
      const gcalUrl = c.googleCalendarUrl || `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(c.id)}`;
      const gcalEmbedUrl = c.googleCalendarEmbedUrl || `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(c.id)}`;
      const inviteDocLink = c.inviteDocUrl
        ? `<a href="${esc(c.inviteDocUrl)}" target="_blank" rel="noopener" class="gcal-ext-link" style="color:#10b981;text-decoration:none;font-weight:600;" title="Open ${esc(c.name)}'s dedicated Invite &amp; Access Google Doc">📄 Invite Google Doc ↗</a>`
        : '';
      const sendInviteBtn =
        !c.primary && c.writable !== false
          ? `<button type="button" class="btn-link btn-send-cal-invite" data-cal-id="${esc(c.id)}" data-cal-name="${esc(c.name)}" style="font-size:11.5px;color:#c084fc;font-weight:600;">✉️ Invite Person to Calendar</button>`
          : '';
      const createInGcalLink = c.needsGoogleCalendarContainer
        ? `<a href="${esc(c.googleCreateCalendarUrl || 'https://calendar.google.com/calendar/u/0/r/settings/createcalendar')}" target="_blank" rel="noopener" class="gcal-ext-link" style="color:#f59e0b;text-decoration:none;font-weight:600;" title="Google CalDAV disables MKCALENDAR; click to create '${esc(c.name)}' in Google Calendar Settings so it appears as its own sidebar calendar">➕ Create "${esc(c.name)}" in Google Calendar Sidebar ↗</a>`
        : '';

      return `
        <div class="named-cal-card ${isSelected ? 'active' : ''}" data-cal-id="${esc(c.id)}" data-writable="${c.writable !== false}">
          <div class="named-cal-top">
            <div class="named-cal-title">
              <span class="color-dot" style="background:${esc(c.color)}"></span>
              <span>${esc(c.name)}</span>
            </div>
            <span class="cal-role-badge">${esc(roleLabel)}</span>
          </div>
          ${descLine}
          ${sharedAvatars}
          <div class="named-cal-links" style="margin-top:6px;display:flex;gap:10px;flex-wrap:wrap;font-size:11.5px;align-items:center;">
            ${inviteDocLink}
            ${sendInviteBtn}
            <a href="${esc(gcalUrl)}" target="_blank" rel="noopener" class="gcal-ext-link" style="color:#38bdf8;text-decoration:none;font-weight:600;">🌐 Open in Google Calendar ↗</a>
            <a href="${esc(gcalEmbedUrl)}" target="_blank" rel="noopener" class="gcal-ext-link" style="color:#94a3b8;text-decoration:none;">📅 Browser View ↗</a>
            ${createInGcalLink}
          </div>
        </div>
      `;
    })
    .join('');

  grid.querySelectorAll('.gcal-ext-link').forEach((link) => {
    link.addEventListener('click', (ev) => ev.stopPropagation());
  });

  grid.querySelectorAll('.btn-send-cal-invite').forEach((btn) => {
    btn.addEventListener('click', async (ev) => {
      ev.stopPropagation();
      const calId = btn.dataset.calId;
      const calName = btn.dataset.calName;
      const email = window.prompt(`Enter email address (or family member name) to invite to "${calName}":`);
      if (!email || !email.trim()) return;
      btn.disabled = true;
      btn.textContent = '⏳ Sending Invite...';
      try {
        const res = await fetch('/api/calendars/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ calendarId: calId, email: email.trim() }),
        });
        const data = await res.json();
        if (data.ok) {
          showToast(`✉️ Invited ${data.invitedName} <${data.invitedEmail}> to "${data.calendarName}" via Google Docs!`);
          await loadState();
        } else {
          showToast(`⚠️ ${data.error || 'Could not send invite.'}`);
        }
      } finally {
        btn.disabled = false;
        btn.textContent = '✉️ Invite Person to Calendar';
      }
    });
  });

  grid.querySelectorAll('.named-cal-card').forEach((card) => {
    card.addEventListener('click', () => {
      const calId = card.dataset.calId;
      const writable = card.dataset.writable === 'true';
      const clickedCal = state.calendars.find((c) => c.id === calId);
      state.filterCalendarId = calId;
      if (writable) {
        state.selectedCalendarId = calId;
        select.value = calId;
        syncDefaultGuestsForSelectedCalendar(calId);
        renderFamilyChips();
      }
      document.getElementById('cfg-cal-id').value = calId;
      if (clickedCal) {
        document.getElementById('cfg-cal-name').value = clickedCal.name || '';
        const descInput = document.getElementById('cfg-cal-desc');
        if (descInput) descInput.value = clickedCal.description || '';
        if (clickedCal.color) document.getElementById('cfg-cal-color').value = clickedCal.color;
      }
      renderNamedCalendars();
      renderEvents();
    });
  });
}

function renderFamilyChips() {
  const container = document.getElementById('family-chips');
  const profilesContainer = document.getElementById('family-profiles-list');
  const countBadge = document.getElementById('family-count-badge');
  const visibleMembers = getVisibleMembersForSelectedCalendar();
  if (countBadge) countBadge.textContent = `${visibleMembers.length} Members`;

  container.innerHTML = visibleMembers
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
    profilesContainer.innerHTML = visibleMembers
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
    .slice(0, 35)
    .map((ev) => {
      const d = new Date(ev.start);
      let whenStr = '';
      if (ev.allDay) {
        const sYmd = ev.startDate || String(ev.start).slice(0, 10);
        const eYmd = ev.endDate || sYmd;
        const sObj = new Date(`${sYmd}T12:00:00`);
        const eObj = new Date(`${eYmd}T12:00:00`);
        const sLabel = sObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        if (eYmd > sYmd) {
          const eLabel = eObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          whenStr = `${sLabel} – ${eLabel} · Multi-Day`;
        } else {
          whenStr = `${sLabel} · All Day`;
        }
      } else {
        whenStr = d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      }
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
          <div style="display:flex;gap:6px;align-items:center;">
            <button type="button" class="btn-delete-ev btn-edit-ev" data-id="${esc(ev.id)}" style="border-color:rgba(56,189,248,0.4);color:#38bdf8;">✏️ Edit</button>
            <button type="button" class="btn-delete-ev btn-remove-ev" data-id="${esc(ev.id)}" data-cal-id="${esc(ev.calendarId || '')}">Delete</button>
          </div>
        </div>
      `;
    })
    .join('');

  listEl.querySelectorAll('.btn-edit-ev').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const ev = state.events.find((e) => e.id === id);
      if (ev) editExistingEvent(ev);
    });
  });

  listEl.querySelectorAll('.btn-remove-ev').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const calId = btn.dataset.calId || '';
      await fetch(`/api/events/${encodeURIComponent(id)}?calendarId=${encodeURIComponent(calId)}`, { method: 'DELETE' });
      showToast('Deleted event from Google Calendar');
      await loadState();
    });
  });
}

function editExistingEvent(ev) {
  state.editingEventId = ev.id;
  state.editingCalendarId = ev.calendarId || '';

  const sDateObj = new Date(ev.start);
  const eDateObj = new Date(ev.end || ev.start);
  const toYmd = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  const toHm = (dt) => `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;

  applyParsedEventToForm({
    summary: ev.summary || '',
    calendarId: ev.calendarId || state.selectedCalendarId,
    allDay: Boolean(ev.allDay),
    startDate: ev.startDate || toYmd(sDateObj),
    startTime: toHm(sDateObj),
    endDate: ev.endDate || toYmd(eDateObj),
    endTime: toHm(eDateObj),
    location: ev.location || '',
    description: ev.description || '',
    meetingUrl: ev.meetingUrl || '',
  });

  const titleEl = document.getElementById('form-section-title');
  if (titleEl) titleEl.textContent = `✏️ Edit Event: ${ev.summary}`;
  const submitBtn = document.getElementById('btn-submit-event');
  if (submitBtn) submitBtn.textContent = '💾 Update Event on Google Calendar';
  const cancelBtn = document.getElementById('btn-cancel-edit');
  if (cancelBtn) cancelBtn.classList.remove('hidden');

  document.getElementById('add-event-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('evt-summary')?.focus();
  showToast(`✏️ Editing "${ev.summary}" — adjust dates or details & tap Update Event!`);
}

function clearEditMode() {
  state.editingEventId = '';
  state.editingCalendarId = '';
  const titleEl = document.getElementById('form-section-title');
  if (titleEl) titleEl.textContent = '➕ Create Google Calendar Event';
  const submitBtn = document.getElementById('btn-submit-event');
  if (submitBtn) submitBtn.textContent = '📅 Save Event to Google Calendar & Thunderbird';
  const cancelBtn = document.getElementById('btn-cancel-edit');
  if (cancelBtn) cancelBtn.classList.add('hidden');
}

function renderDetectedItinerary(detectedEvents = []) {
  state.detectedItineraryEvents = Array.isArray(detectedEvents) ? detectedEvents : [];
  const box = document.getElementById('detected-itinerary-box');
  if (!box) return;
  if (state.detectedItineraryEvents.length <= 1) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }

  box.classList.remove('hidden');
  box.innerHTML = `
    <div style="background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.35);border-radius:10px;padding:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
        <strong style="color:#38bdf8;font-size:13.5px;">✈️ Detected ${state.detectedItineraryEvents.length} Events from Pasted Itinerary (Trip + Flights)</strong>
        <button type="button" id="btn-create-all-detected" class="btn btn-primary btn-sm">
          📅 Add All ${state.detectedItineraryEvents.length} Events to Calendar
        </button>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        ${state.detectedItineraryEvents
          .map((ev, idx) => {
            const rangeStr = ev.allDay
              ? `${ev.startDate} → ${ev.endDate} (All-Day / Multi-Day)`
              : `${ev.startDate} · ${ev.startTime} – ${ev.endTime}`;
            return `
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;background:#161b22;border:1px solid #30363d;border-radius:8px;padding:8px 10px;font-size:12.5px;">
                <div>
                  <div style="font-weight:600;color:#e6edf3;">${esc(ev.summary)}</div>
                  <div style="color:#8b949e;">🗓️ ${esc(rangeStr)} ${ev.location ? `· 📍 ${esc(ev.location)}` : ''}</div>
                </div>
                <div style="display:flex;gap:6px;flex-shrink:0;">
                  <button type="button" class="btn btn-secondary btn-sm btn-load-itin-ev" data-idx="${idx}">Load in Form</button>
                  <button type="button" class="btn btn-primary btn-sm btn-add-itin-ev" data-idx="${idx}">+ Add</button>
                </div>
              </div>
            `;
          })
          .join('')}
      </div>
    </div>
  `;

  box.querySelectorAll('.btn-load-itin-ev').forEach((btn) => {
    btn.addEventListener('click', () => {
      const ev = state.detectedItineraryEvents[Number(btn.dataset.idx)];
      if (ev) {
        applyParsedEventToForm(ev);
        showToast(`Loaded "${ev.summary}" into form`);
      }
    });
  });

  box.querySelectorAll('.btn-add-itin-ev').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const ev = state.detectedItineraryEvents[Number(btn.dataset.idx)];
      if (!ev) return;
      btn.disabled = true;
      btn.textContent = '⏳...';
      try {
        const res = await fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...ev,
            calendarId: document.getElementById('evt-calendar').value || ev.calendarId || state.selectedCalendarId,
            attendees: [...state.selectedFamilyEmails],
          }),
        });
        const data = await res.json();
        if (data.ok) {
          btn.textContent = '✅ Added';
          showToast(`✅ Added "${data.event.summary}" to ${data.event.calendarName}!`);
          await loadState();
        }
      } finally {
        btn.disabled = false;
      }
    });
  });

  const addAllBtn = document.getElementById('btn-create-all-detected');
  if (addAllBtn) {
    addAllBtn.addEventListener('click', async () => {
      addAllBtn.disabled = true;
      addAllBtn.textContent = '⏳ Adding All to Google Calendar...';
      try {
        const calId = document.getElementById('evt-calendar').value || state.selectedCalendarId;
        for (const ev of state.detectedItineraryEvents) {
          await fetch('/api/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...ev,
              calendarId: calId || ev.calendarId,
              attendees: [...state.selectedFamilyEmails],
            }),
          });
        }
        showToast(`✅ Added all ${state.detectedItineraryEvents.length} itinerary events to Google Calendar!`);
        box.classList.add('hidden');
        await loadState();
      } finally {
        addAllBtn.disabled = false;
      }
    });
  }
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
  if (parsed.location !== undefined) document.getElementById('evt-location').value = parsed.location;
  if (parsed.description !== undefined) document.getElementById('evt-description').value = parsed.description;
  if (parsed.meetingUrl !== undefined) document.getElementById('evt-meeting-url').value = parsed.meetingUrl;
  if (Array.isArray(parsed.attendees) && parsed.attendees.length) {
    for (const att of parsed.attendees) {
      if (att.email) state.selectedFamilyEmails.add(att.email);
    }
    renderFamilyChips();
  }
  updateDateSpanBadge();
}

function toggleAllDayFields(isAllDay) {
  document.getElementById('start-time-group').classList.toggle('hidden', isAllDay);
  document.getElementById('end-time-group').classList.toggle('hidden', isAllDay);
  document.getElementById('duration-pills').classList.toggle('hidden', isAllDay);
  document.getElementById('multiday-pills')?.classList.toggle('hidden', !isAllDay);
  updateDateSpanBadge();
}

async function loadState() {
  const urlCal = new URLSearchParams(window.location.search).get('calendar') || '';
  const stateEndpoint = urlCal ? `/api/state?calendar=${encodeURIComponent(urlCal)}` : '/api/state';
  const res = await fetch(stateEndpoint);
  const data = await res.json();
  if (!data.ok) return;
  state.email = data.email || '';
  state.defaultCalendarId = data.defaultCalendarId || '';
  state.calendars = data.calendars || [];
  state.familyMembers = data.familyMembers || [];
  state.events = data.events || [];
  state.accessDoc = data.accessDoc || {};

  if (data.scopedCalendarId && state.calendars.length === 1) {
    state.selectedCalendarId = state.calendars[0].id;
    state.filterCalendarId = state.calendars[0].id;
    syncDefaultGuestsForSelectedCalendar(state.selectedCalendarId);
    document.getElementById('btn-Customize-cal')?.classList.add('hidden');
  }

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

async function parseQuickInputText(text, autoCreate = false) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return;
  const res = await fetch('/api/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: trimmed,
      calendarId: state.selectedCalendarId,
      autoCreate,
      createAllDetected: autoCreate,
    }),
  });
  const data = await res.json();
  if (!data.ok) return;

  if (autoCreate && data.created) {
    document.getElementById('quick-add-input').value = '';
    renderDetectedItinerary([]);
    const count = Array.isArray(data.createdEvents) ? data.createdEvents.length : 1;
    showToast(
      count > 1
        ? `📅 Added all ${count} itinerary events to ${data.created.calendarName}!`
        : `📅 Added "${data.created.summary}" to ${data.created.calendarName}!`
    );
    await loadState();
    return;
  }

  if (data.parsed) {
    applyParsedEventToForm(data.parsed);
    renderDetectedItinerary(data.detectedEvents || data.parsed.detectedEvents || []);
    const detCount = (data.detectedEvents || []).length;
    showToast(
      detCount > 1
        ? `✈️ Parsed ${detCount} itinerary events! Multi-day trip loaded in form — or tap "Add All ${detCount} Events" above!`
        : '✨ Filled form from pasted invite / natural-language description!'
    );
  }
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

  document.querySelectorAll('.multiday-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const days = Math.max(1, Number(btn.dataset.days) || 1);
      const startDate = document.getElementById('evt-start-date').value;
      if (!startDate) return;
      const [sy, sm, sd] = startDate.split('-').map(Number);
      const endObj = new Date(sy, sm - 1, sd + days - 1);
      const endYmd = `${endObj.getFullYear()}-${String(endObj.getMonth() + 1).padStart(2, '0')}-${String(endObj.getDate()).padStart(2, '0')}`;
      document.getElementById('evt-all-day').checked = true;
      toggleAllDayFields(true);
      document.getElementById('evt-end-date').value = endYmd;
      updateDateSpanBadge();
    });
  });

  document.getElementById('evt-start-date').addEventListener('change', () => recomputeEndFromDuration());
  document.getElementById('evt-start-time').addEventListener('change', () => recomputeEndFromDuration());
  document.getElementById('evt-end-date').addEventListener('change', () => {
    const s = document.getElementById('evt-start-date').value;
    const e = document.getElementById('evt-end-date').value;
    if (s && e && e > s) {
      // Automatically enable All-Day / Multi-Day if user selects a multi-day end date
      document.getElementById('evt-all-day').checked = true;
      toggleAllDayFields(true);
    }
    updateDateSpanBadge();
  });
  document.getElementById('evt-end-time').addEventListener('change', updateDateSpanBadge);

  document.getElementById('btn-cancel-edit')?.addEventListener('click', () => {
    clearEditMode();
    document.getElementById('evt-summary').value = '';
    document.getElementById('evt-location').value = '';
    document.getElementById('evt-description').value = '';
  });

  document.getElementById('btn-invite-all-family').addEventListener('click', () => {
    for (const fm of getVisibleMembersForSelectedCalendar()) {
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
    const description = document.getElementById('cfg-cal-desc')?.value?.trim() || '';
    const color = document.getElementById('cfg-cal-color').value;
    const res = await fetch('/api/calendars/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, description, color }),
    });
    const data = await res.json();
    if (data.ok) {
      showToast(`Saved Named Calendar "${name}" & synced to Thunderbird!`);
      document.getElementById('custom-cal-form').classList.add('hidden');
      await loadState();
    }
  });

  // Paste from Clipboard button & automatic paste listener
  document.getElementById('btn-paste-clipboard')?.addEventListener('click', async () => {
    try {
      const clipText = await navigator.clipboard.readText();
      if (!clipText || !clipText.trim()) {
        showToast('Clipboard is empty — paste directly into the box below.');
        document.getElementById('quick-add-input').focus();
        return;
      }
      document.getElementById('quick-add-input').value = clipText;
      await parseQuickInputText(clipText, false);
    } catch {
      document.getElementById('quick-add-input').focus();
      showToast('Press Ctrl+V (or long-press Paste) inside the box to paste your itinerary!');
    }
  });

  document.getElementById('quick-add-input').addEventListener('paste', () => {
    setTimeout(() => {
      const text = document.getElementById('quick-add-input').value.trim();
      if (text) parseQuickInputText(text, false);
    }, 60);
  });

  // Smart Quick-Add Parse / Create
  document.getElementById('btn-parse-fill').addEventListener('click', async () => {
    const text = document.getElementById('quick-add-input').value.trim();
    await parseQuickInputText(text, false);
  });

  document.getElementById('btn-quick-create').addEventListener('click', async () => {
    const text = document.getElementById('quick-add-input').value.trim();
    await parseQuickInputText(text, true);
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
        replaceEventId: state.editingEventId || undefined,
        replaceCalendarId: state.editingCalendarId || undefined,
      };

      const wasEditing = Boolean(state.editingEventId);
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) {
        clearEditMode();
        document.getElementById('evt-summary').value = '';
        document.getElementById('evt-location').value = '';
        document.getElementById('evt-meeting-url').value = '';
        document.getElementById('evt-description').value = '';
        document.getElementById('evt-custom-guests').value = '';
        showToast(
          `${wasEditing ? '💾 Updated' : '✅ Added'} "${data.event.summary}" on ${data.event.calendarName}${
            data.syncedToGoogle ? ' (Synced to Google Calendar!)' : ''
          }`
        );
        await loadState();
      } else {
        showToast(`Error: ${data.error}`);
      }
    } finally {
      submitBtn.disabled = false;
      if (!state.editingEventId) {
        submitBtn.textContent = '📅 Save Event to Google Calendar & Thunderbird';
      }
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
