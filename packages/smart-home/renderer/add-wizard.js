'use strict';

// The Add-light wizard: pick a brand, follow that brand's steps, and add the light.
// Uses esc, showBanner, renderAll and currentOverview from app.js.

const WIZARD_BRANDS = [
  { id: 'feit', name: 'Feit Electric', note: 'Uses the Smart Life app', flow: 'tuya' },
  { id: 'smartlife', name: 'Smart Life or Tuya', note: 'Globe, Gosund, Treatlife, Merkury and other brands', flow: 'tuya' },
  {
    id: 'wiz',
    name: 'Philips WiZ',
    protocolId: 'wiz-udp',
    steps: [
      'Set the light up in the WiZ app first, on the same Wi-Fi network as this computer.',
      'In the WiZ app, open Settings, then Security, and turn on Allow Local Communication.',
    ],
    scan: true,
  },
  {
    id: 'hue',
    name: 'Philips Hue',
    protocolId: 'hue-rest',
    steps: [
      'Hue lights are controlled through the Hue Bridge. Set the lights up in the Hue app first.',
      'Find the bridge address in the Hue app: Settings, then My Hue system, then the bridge, then the "i" button.',
      'Add each light with the bridge address. Its number is its position in the Hue app, starting at 1.',
      'Then press the round button on top of the bridge and use Pair Hue Bridge on the Lights tab within 30 seconds.',
    ],
    keyLabel: 'Light number on the bridge',
    keyPlaceholder: 'e.g. 1',
  },
  {
    id: 'kasa',
    name: 'TP-Link Kasa',
    protocolId: 'kasa-lan',
    steps: [
      'Set the light up in the Kasa app first, on the same Wi-Fi network as this computer.',
      'If the Kasa app offers Third-Party Compatibility (Me, then Settings), turn it on.',
    ],
    scan: true,
  },
  {
    id: 'lifx',
    name: 'LIFX',
    protocolId: 'lifx-udp',
    steps: ['Set the light up in the LIFX app first, on the same Wi-Fi network as this computer. Nothing else is needed.'],
    scan: true,
  },
  {
    id: 'govee',
    name: 'Govee',
    protocolId: 'govee-udp',
    steps: [
      'Set the light up in the Govee Home app first, on the same Wi-Fi network as this computer.',
      'In the Govee Home app, open the light, tap the gear icon, and turn on LAN Control. Not every Govee model has it.',
    ],
    scan: true,
  },
  {
    id: 'wled',
    name: 'WLED',
    protocolId: 'wled-http',
    steps: ['Connect the WLED controller to your Wi-Fi. Its address is shown in the WLED app or on your router.'],
  },
  {
    id: 'elgato',
    name: 'Elgato Key Light',
    protocolId: 'elgato-http',
    steps: ['Set the light up in Elgato Control Center first. Its address is under the light\'s settings there.'],
  },
  {
    id: 'yeelight',
    name: 'Yeelight',
    protocolId: 'yeelight-tcp',
    steps: ['In the Yeelight app, open the light, then its settings, and turn on LAN Control. The app also shows its address.'],
  },
  {
    id: 'shelly',
    name: 'Shelly',
    protocolId: 'shelly',
    steps: ['Set the Shelly up in the Shelly app first. Its address is under the device\'s settings, then Device Information.'],
  },
  {
    id: 'ha',
    name: 'Home Assistant',
    protocolId: 'ha-rest',
    steps: [
      'Use this for lights you already control in Home Assistant, such as Zigbee or Matter lights.',
      'In Home Assistant, open your profile, then Security, and create a long-lived access token.',
    ],
    keyLabel: 'Entity ID and token',
    keyPlaceholder: 'light.kitchen|your-token',
  },
  { id: 'other', name: 'Something else', note: 'Add a light by its IP address', protocolId: null, steps: [] },
];

const wizard = {
  history: [],
  render: null,
};

function wizardEls() {
  return {
    overlay: document.getElementById('add-wizard'),
    body: document.getElementById('wizard-body'),
    title: document.getElementById('wizard-title'),
    back: document.getElementById('wizard-back'),
  };
}

function wizardShow(title, html, bind, { isStart = false } = {}) {
  const { body, title: titleEl, back } = wizardEls();
  titleEl.textContent = title;
  body.innerHTML = html;
  back.classList.toggle('hidden', isStart);
  bind?.(body);
}

function wizardGo(screen) {
  if (wizard.render) wizard.history.push(wizard.render);
  wizard.render = screen;
  screen();
}

function wizardOpen() {
  wizard.history = [];
  wizard.render = null;
  wizardEls().overlay.classList.remove('hidden');
  wizardGo(renderBrandPicker);
}

function wizardClose() {
  wizardEls().overlay.classList.add('hidden');
}

function roomOptions(selected) {
  return (currentOverview?.rooms || [])
    .map((r) => `<option value="${esc(r.id)}" ${r.id === selected ? 'selected' : ''}>${esc(r.name)}</option>`)
    .join('');
}

function stepList(steps) {
  return `<ol class="wizard-steps">${steps.map((s) => `<li>${s}</li>`).join('')}</ol>`;
}

// ── Brand picker ─────────────────────────────────────────────────────────────

function renderBrandPicker() {
  const html = `
    <p class="muted-text">What brand is the light? Check the box it came in or the app you use for it now.</p>
    <div class="wizard-brands">
      ${WIZARD_BRANDS.map(
        (b) => `<button type="button" class="wizard-brand" data-brand="${esc(b.id)}">
          <strong>${esc(b.name)}</strong>${b.note ? `<span>${esc(b.note)}</span>` : ''}
        </button>`
      ).join('')}
    </div>`;
  wizardShow('Add a light', html, (body) => {
    body.querySelectorAll('[data-brand]').forEach((btn) =>
      btn.addEventListener('click', () => {
        const brand = WIZARD_BRANDS.find((b) => b.id === btn.getAttribute('data-brand'));
        if (brand.flow === 'tuya') wizardGo(() => renderTuyaSteps(brand));
        else wizardGo(() => renderBrandSteps(brand));
      })
    );
  }, { isStart: true });
}

// ── Brands that work on the local network directly ──────────────────────────

function renderBrandSteps(brand) {
  if (!brand.steps.length) {
    renderManualForm(brand);
    return;
  }
  const html = `
    ${stepList(brand.steps.map(esc))}
    <div class="wizard-actions">
      ${brand.scan ? '<button type="button" class="btn btn-primary" id="wiz-scan">Search this network</button>' : ''}
      <button type="button" class="btn ${brand.scan ? '' : 'btn-primary'}" id="wiz-manual">Add by IP address</button>
    </div>
    <p class="muted-text" id="wiz-scan-result"></p>`;
  wizardShow(`Add a ${brand.name} light`, html, (body) => {
    body.querySelector('#wiz-manual')?.addEventListener('click', () => wizardGo(() => renderManualForm(brand)));
    body.querySelector('#wiz-scan')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const out = body.querySelector('#wiz-scan-result');
      btn.disabled = true;
      out.textContent = 'Searching this network...';
      const res = await window.robos.scanLan();
      btn.disabled = false;
      if (res?.overview) renderAll(res.overview);
      const n = res?.discoveredCount || 0;
      out.textContent = n
        ? `Added ${n} new light${n === 1 ? '' : 's'}. You can close this window.`
        : 'No new lights answered. Check the steps above, or add the light by its IP address.';
    });
  });
}

function renderManualForm(brand) {
  const protocols = (currentOverview?.protocols || []).filter((p) => p.id !== 'tuya-lan');
  const fixedProtocol = brand.protocolId;
  const html = `
    <p class="muted-text">Your router's app or website lists the IP address of each device on your network.</p>
    <div class="form-stack">
      <div class="field">
        <label for="wiz-name">Name</label>
        <input type="text" id="wiz-name" class="input" placeholder="e.g. Morning Room Light" />
      </div>
      <div class="form-row-2">
        <div class="field">
          <label for="wiz-room">Room</label>
          <select id="wiz-room" class="select">${roomOptions()}</select>
        </div>
        <div class="field">
          <label for="wiz-ip">IP address</label>
          <input type="text" id="wiz-ip" class="input" placeholder="e.g. 192.168.1.40" />
        </div>
      </div>
      ${
        fixedProtocol
          ? ''
          : `<div class="field">
              <label for="wiz-protocol">Kind of light</label>
              <select id="wiz-protocol" class="select">${protocols.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select>
            </div>`
      }
      ${
        brand.keyLabel || !fixedProtocol
          ? `<div class="field">
              <label for="wiz-key">${esc(brand.keyLabel || 'Light ID or key, if the light needs one')}</label>
              <input type="text" id="wiz-key" class="input" placeholder="${esc(brand.keyPlaceholder || '')}" />
            </div>`
          : ''
      }
      <p class="error-text hidden" id="wiz-error"></p>
      <button type="button" class="btn btn-primary" id="wiz-add">Add light</button>
    </div>`;
  wizardShow(brand.id === 'other' ? 'Add a light by IP address' : `Add a ${brand.name} light`, html, (body) => {
    body.querySelector('#wiz-add').addEventListener('click', async () => {
      const err = body.querySelector('#wiz-error');
      const name = body.querySelector('#wiz-name').value.trim();
      const ip = body.querySelector('#wiz-ip').value.trim();
      const fail = (msg) => {
        err.textContent = msg;
        err.classList.remove('hidden');
      };
      if (!name) return fail('Give the light a name.');
      if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return fail('Enter the IP address as four numbers with dots, like 192.168.1.40.');
      const res = await window.robos.addOrUpdateLight({
        name,
        ip,
        roomId: body.querySelector('#wiz-room').value,
        protocolId: fixedProtocol || body.querySelector('#wiz-protocol').value,
        deviceKey: body.querySelector('#wiz-key')?.value.trim() || '',
      });
      if (!res?.ok) return fail(res?.error || 'Could not add the light.');
      renderAll(res.overview);
      showBanner(`Added ${res.light.name}.`);
      wizardClose();
      return undefined;
    });
  });
}

// ── Feit / Smart Life (Tuya) ─────────────────────────────────────────────────

async function renderTuyaSteps(brand) {
  const setup = await window.robos.tuyaGetSetup();
  const feit = brand.id === 'feit';
  const regionOptions = (setup.regions || [])
    .map((r) => `<option value="${esc(r.id)}" ${r.id === setup.region ? 'selected' : ''}>${esc(r.name)}</option>`)
    .join('');

  const steps = [
    `<strong>Put the light in pairing mode.</strong> ${
      feit ? 'If it is in the Feit Electric app, remove it there first (open the light, then the settings icon, then Remove Device). ' : ''
    }Turn the light off and on at its switch three times, ending on: on, off, on, off, on. It blinks quickly when it is ready. If it blinks slowly, do it again until it blinks quickly.`,
    '<strong>Pair it in the Smart Life app.</strong> Install Smart Life on your phone from the App Store or Google Play and create an account. Tap the + button, then Add Device; the app finds the blinking light. Give it the name you want to see here, such as Morning Room Light.',
    `<strong>Create a free Tuya cloud project.</strong> You only do this once. <button type="button" class="link-btn" id="wiz-open-tuya">Open iot.tuya.com</button> and sign up. Go to Cloud, then Development, then Create Cloud Project. Use any name, choose Smart Home for both Industry and Development Method, and choose the data center for your country (in the United States, Western America). On the next screen, keep the suggested services and click Authorize.`,
    '<strong>Link your Smart Life account to the project.</strong> In the project, open the Devices tab, then Link App Account, then Add App Account. A QR code appears. In Smart Life, tap Me, then the scan icon at the top right, scan the code, and confirm.',
    '<strong>Copy the project keys below.</strong> They are on the project\'s Overview tab. Smart Home uses them once to fetch each light\'s key; after that, it controls the light straight over your Wi-Fi.',
  ];

  const html = `
    ${
      setup.connected
        ? `<p class="muted-text">Your Tuya project (Access ID ending ${esc(setup.accessIdEnding)}) is already linked. For a new light, do steps 1 and 2, then click Find my lights. <button type="button" class="link-btn" id="wiz-forget">Forget these keys</button></p>`
        : '<p class="muted-text">Feit and Smart Life lights only share their control key through Tuya\'s cloud, so the first light takes about 20 minutes to set up. After that, adding a light takes a minute.</p>'
    }
    ${stepList(steps)}
    <div class="form-stack">
      <div class="form-row-2">
        <div class="field">
          <label for="wiz-access-id">Access ID</label>
          <input type="text" id="wiz-access-id" class="input" autocomplete="off" placeholder="${setup.connected ? 'Saved' : ''}" />
        </div>
        <div class="field">
          <label for="wiz-access-secret">Access Secret</label>
          <input type="password" id="wiz-access-secret" class="input" autocomplete="off" placeholder="${setup.connected ? 'Saved' : ''}" />
        </div>
      </div>
      <div class="field">
        <label for="wiz-region">Data center</label>
        <select id="wiz-region" class="select">${regionOptions}</select>
      </div>
      <p class="error-text hidden" id="wiz-error"></p>
      <button type="button" class="btn btn-primary" id="wiz-find">Find my lights</button>
    </div>`;

  wizardShow(`Add a ${brand.name} light`, html, (body) => {
    body.querySelector('#wiz-open-tuya')?.addEventListener('click', () => window.robos.openWizardPage('tuya-iot'));
    body.querySelector('#wiz-forget')?.addEventListener('click', async () => {
      await window.robos.tuyaForget();
      renderTuyaSteps(brand);
    });
    body.querySelector('#wiz-find').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const err = body.querySelector('#wiz-error');
      err.classList.add('hidden');
      btn.disabled = true;
      btn.textContent = 'Asking Tuya and searching this network...';
      const res = await window.robos.tuyaFindLights({
        accessId: body.querySelector('#wiz-access-id').value.trim(),
        accessSecret: body.querySelector('#wiz-access-secret').value.trim(),
        region: body.querySelector('#wiz-region').value,
      });
      btn.disabled = false;
      btn.textContent = 'Find my lights';
      if (!res?.ok) {
        err.textContent = res?.error || 'Could not reach Tuya.';
        err.classList.remove('hidden');
        return;
      }
      wizardGo(() => renderTuyaResults(res.devices));
    });
  });
}

function renderTuyaResults(devices) {
  const known = new Set((currentOverview?.lights || []).filter((l) => l.protocolId === 'tuya-lan').map((l) => l.deviceKey));
  const kindLabel = { light: 'Light', switch: 'Plug or switch', other: 'Other device' };
  const rows = devices
    .map((d) => {
      const where = d.ip ? `On this network at ${esc(d.ip)}` : 'Not found on this network right now';
      const already = known.has(d.id) ? ' (already added; adding again refreshes it)' : '';
      const usable = Boolean(d.ip && d.hasKey);
      return `<label class="wizard-device ${usable ? '' : 'is-off'}">
        <input type="checkbox" data-device="${esc(d.id)}" ${usable && d.kind !== 'other' && !known.has(d.id) ? 'checked' : ''} ${usable ? '' : 'disabled'} />
        <span><strong>${esc(d.name)}</strong><span class="muted-text">${esc(kindLabel[d.kind] || 'Device')} · ${where}${already}</span></span>
      </label>`;
    })
    .join('');
  const html = `
    <p class="muted-text">These are the devices in your Smart Life account. Choose the ones to add. A device that is not on this network cannot be added until it is on and connected.</p>
    <div class="wizard-device-list">${rows}</div>
    <div class="form-row-2">
      <div class="field">
        <label for="wiz-room">Room</label>
        <select id="wiz-room" class="select">${roomOptions()}</select>
      </div>
    </div>
    <p class="error-text hidden" id="wiz-error"></p>
    <div class="wizard-actions"><button type="button" class="btn btn-primary" id="wiz-add">Add selected</button></div>`;
  wizardShow('Your Smart Life devices', html, (body) => {
    body.querySelector('#wiz-add').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const err = body.querySelector('#wiz-error');
      const ids = [...body.querySelectorAll('[data-device]:checked')].map((c) => c.getAttribute('data-device'));
      if (!ids.length) {
        err.textContent = 'Choose at least one device.';
        err.classList.remove('hidden');
        return;
      }
      btn.disabled = true;
      btn.textContent = 'Connecting to each light...';
      const res = await window.robos.tuyaAddLights({
        devices: devices.filter((d) => ids.includes(d.id)),
        roomId: body.querySelector('#wiz-room').value,
      });
      btn.disabled = false;
      btn.textContent = 'Add selected';
      if (res?.overview) renderAll(res.overview);
      const failed = res?.failed || [];
      if (failed.length) {
        err.innerHTML = failed.map((f) => `${esc(f.name)}: ${esc(f.error)}`).join('<br />');
        err.classList.remove('hidden');
      }
      if (res?.added?.length) {
        showBanner(`Added ${res.added.join(', ')}.`);
        if (!failed.length) wizardClose();
      }
    });
  });
}

// ── Wiring ───────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-open-add-wizard')?.addEventListener('click', wizardOpen);
  document.getElementById('wizard-close')?.addEventListener('click', wizardClose);
  document.getElementById('wizard-back')?.addEventListener('click', () => {
    const prev = wizard.history.pop();
    if (!prev) return;
    wizard.render = prev;
    prev();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !wizardEls().overlay.classList.contains('hidden')) wizardClose();
  });
});
