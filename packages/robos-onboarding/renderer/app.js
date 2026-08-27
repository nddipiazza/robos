document.addEventListener('DOMContentLoaded', () => {
  const api = window.onboardingAPI;
  let currentStep = 1;
  const TOTAL_STEPS = 8;

  // DOM Elements
  const stepItems = document.querySelectorAll('.step-nav-item');
  const stepPanels = document.querySelectorAll('.step-panel');
  const btnBack = document.getElementById('btn-back');
  const btnNext = document.getElementById('btn-next');
  const btnSkip = document.getElementById('btn-skip');

  // Step 1 Elements (GPG Key)
  const badgeGpgStatus = document.getElementById('badge-gpg-status');
  const gpgKeyDetails = document.getElementById('gpg-key-details');
  const btnCreateGpg = document.getElementById('btn-create-gpg');
  const cardGpgForm = document.getElementById('card-gpg-form');
  const btnSubmitGpg = document.getElementById('btn-submit-gpg');
  const outputStep1 = document.getElementById('output-step-1');

  // Step 2 Elements (Pass Store)
  const badgePassStatus = document.getElementById('badge-pass-status');
  const btnInitPass = document.getElementById('btn-init-pass');
  const outputStep2 = document.getElementById('output-step-2');

  // Step 3 Elements (GUI Pinentry)
  const badgePinentryStatus = document.getElementById('badge-pinentry-status');
  const btnConfigPinentry = document.getElementById('btn-config-pinentry');
  const outputStep3 = document.getElementById('output-step-3');

  // Step 4 Elements (SSH & Git)
  const gitUsername = document.getElementById('git-username');
  const gitUseremail = document.getElementById('git-useremail');
  const btnSaveGitConfig = document.getElementById('btn-save-git-config');
  const badgeSshStatus = document.getElementById('badge-ssh-status');
  const sshPubkey = document.getElementById('ssh-pubkey');
  const btnGenSshKey = document.getElementById('btn-gen-ssh-key');
  const btnCopySshKey = document.getElementById('btn-copy-ssh-key');
  const btnUploadGithubSsh = document.getElementById('btn-upload-github-ssh');
  const btnTestSsh = document.getElementById('btn-test-ssh');
  const badgeGhStatus = document.getElementById('badge-gh-status');
  const ghAuthDetail = document.getElementById('gh-auth-detail');
  const btnGhLogin = document.getElementById('btn-gh-login');
  const outputStep4 = document.getElementById('output-step-4');

  // Step 5 Elements (AI Agents)
  const selectDefaultModel = document.getElementById('select-default-model');
  const keyAnthropic = document.getElementById('key-anthropic');
  const keyGemini = document.getElementById('key-gemini');
  const outputStep5 = document.getElementById('output-step-5');

  // Step 6 & 7 Elements (Dev Apps & Git Projects)
  const devAppsGrid = document.getElementById('dev-apps-grid');
  const projectsListContainer = document.getElementById('projects-list-container');
  const inputNewRepo = document.getElementById('input-new-repo');
  const btnAddRepo = document.getElementById('btn-add-repo');

  // Step 8 Elements (Complete)
  const btnFinishOnboarding = document.getElementById('btn-finish-onboarding');
  const btnLaunchDevCentral = document.getElementById('btn-launch-dev-central');

  // ── Step Navigation ──
  function goToStep(step) {
    if (step < 1 || step > TOTAL_STEPS) return;
    currentStep = step;
    clearAllOutputs();

    document.querySelectorAll('.step-nav-item').forEach(item => {
      const itemStep = parseInt(item.dataset.step, 10);
      item.classList.toggle('active', itemStep === currentStep);
      if (itemStep < currentStep) item.classList.add('completed');
      else item.classList.remove('completed');
    });

    document.querySelectorAll('.step-panel').forEach(panel => {
      const panelStep = parseInt(panel.id.replace('step-', ''), 10);
      if (panelStep === currentStep) {
        panel.classList.add('active');
        panel.removeAttribute('inert');
        panel.setAttribute('aria-hidden', 'false');
      } else {
        panel.classList.remove('active');
        panel.setAttribute('inert', '');
        panel.setAttribute('aria-hidden', 'true');
      }
    });

    btnBack.style.display = currentStep === 1 ? 'none' : 'inline-flex';

    if (currentStep === TOTAL_STEPS) {
      btnNext.style.display = 'none';
      btnSkip.style.display = 'none';
    } else {
      btnNext.style.display = 'inline-flex';
      btnSkip.style.display = 'inline-flex';
    }
  }

  stepItems.forEach(item => {
    item.addEventListener('click', () => {
      const step = parseInt(item.dataset.step, 10);
      goToStep(step);
    });
  });

  window.handleBackStep = function() {
    try { goToStep(currentStep - 1); } catch (e) { console.error('Back error:', e); }
  };

  window.handleNextStep = function() {
    try { saveCurrentStepData(); } catch (e) { console.error('Save step data error:', e); }
    try { goToStep(currentStep + 1); } catch (e) { console.error('Go to next step error:', e); }
  };

  btnBack.addEventListener('click', window.handleBackStep);
  btnNext.addEventListener('click', window.handleNextStep);
  btnSkip.addEventListener('click', window.handleNextStep);

  // Keyboard navigation & accessibility handlers
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
        e.preventDefault();
        window.handleNextStep();
      }
      return;
    }
    if ((e.altKey && e.key.toLowerCase() === 'n') || (e.ctrlKey && e.key === 'ArrowRight')) {
      e.preventDefault();
      window.handleNextStep();
    } else if ((e.altKey && e.key.toLowerCase() === 'b') || (e.ctrlKey && e.key === 'ArrowLeft')) {
      e.preventDefault();
      window.handleBackStep();
    } else if (e.key === 'Enter' || e.key === ' ') {
      if (e.target.classList.contains('step-nav-item')) {
        e.preventDefault();
        const step = parseInt(e.target.dataset.step, 10);
        goToStep(step);
      }
    }
  });

  // ── Data Loaders & Refresh ──
  async function loadAllData() {
    if (!api) return;
    await refreshSecurityStatus();
    await refreshSshStatus();
    await refreshGitConfig();
    await refreshGhAuth();
    await refreshAiConfig();
    await refreshDevApps();
    await refreshGitProjects();
  }

  function clearAllOutputs() {
    document.querySelectorAll('.status-output').forEach(el => {
      el.textContent = '';
      el.style.display = 'none';
      const container = el.closest('.output-container');
      if (container) container.style.display = 'none';
    });
  }

  function logOutput(element, text, clear = false) {
    if (!element) return;
    const container = element.closest('.output-container') || element;
    container.style.display = 'block';
    element.style.display = 'block';
    if (clear) {
      element.textContent = '';
    }
    const timestamp = `[${new Date().toLocaleTimeString()}] `;
    element.textContent += timestamp + text + '\n';
    element.scrollTop = element.scrollHeight;
  }

  // Step 1, 2, 3 Security Handlers
  async function refreshSecurityStatus() {
    if (!api) return;
    const sec = await api.getSecurityStatus();
    const passAlertEl = document.getElementById('pass-prerequisite-alert');

    // Pass Prerequisite Check
    if (sec.passInstalled === false) {
      if (passAlertEl) passAlertEl.style.display = 'block';
      if (badgePassStatus) {
        badgePassStatus.className = 'badge badge-danger';
        badgePassStatus.textContent = 'Missing Software: pass';
      }
      if (btnInitPass) {
        btnInitPass.disabled = true;
        btnInitPass.title = "'pass' is required software that needs to be installed on the system before pass store can be initialized.";
      }
    } else {
      if (passAlertEl) passAlertEl.style.display = 'none';
      if (btnInitPass) {
        btnInitPass.disabled = false;
        btnInitPass.removeAttribute('title');
      }
    }

    // GPG Status
    if (sec.gpgKeys && sec.gpgKeys.length > 0) {
      if (badgeGpgStatus) {
        badgeGpgStatus.className = 'badge badge-success';
        badgeGpgStatus.textContent = 'GPG Key Present';
      }
      if (gpgKeyDetails) {
        gpgKeyDetails.innerHTML = `<div>Detected GPG Key: <code>${sec.gpgKeys[0]}</code></div>`;
      }
    } else {
      if (badgeGpgStatus) {
        badgeGpgStatus.className = 'badge badge-warning';
        badgeGpgStatus.textContent = 'No GPG Key Found';
      }
      if (gpgKeyDetails) {
        gpgKeyDetails.textContent = 'Generate a GPG key to secure your local secrets store.';
      }
    }

    // Pass Status
    if (badgePassStatus && sec.passInstalled !== false) {
      if (sec.passReady) {
        badgePassStatus.className = 'badge badge-success';
        badgePassStatus.textContent = 'Pass Store Initialized';
      } else {
        badgePassStatus.className = 'badge badge-warning';
        badgePassStatus.textContent = 'Pass Uninitialized';
      }
    }
  }

  btnCreateGpg.addEventListener('click', async () => {
    cardGpgForm.style.display = cardGpgForm.style.display === 'none' ? 'block' : 'none';
    if (cardGpgForm.style.display === 'block') {
      const gpgNameEl = document.getElementById('gpg-name');
      const gpgEmailEl = document.getElementById('gpg-email');
      if (!gpgNameEl.value || !gpgEmailEl.value) {
        const cfg = await api.getGitConfig();
        if (!gpgNameEl.value && cfg.name) gpgNameEl.value = cfg.name;
        if (!gpgEmailEl.value && cfg.email) gpgEmailEl.value = cfg.email;
      }
    }
  });

  btnSubmitGpg.addEventListener('click', async () => {
    const name = document.getElementById('gpg-name').value || 'RobOS Developer';
    const email = document.getElementById('gpg-email').value || 'robos@localhost';
    const passphrase = document.getElementById('gpg-passphrase').value;
    logOutput(outputStep1, 'Generating GPG master key...', true);
    const res = await api.createGpgKey({ name, email, passphrase });
    if (res.ok) {
      logOutput(outputStep1, 'GPG key created successfully!');
      cardGpgForm.style.display = 'none';
      await refreshSecurityStatus();
    } else {
      logOutput(outputStep1, `Error: ${res.error}`);
    }
  });

  btnInitPass.addEventListener('click', async () => {
    const sec = await api.getSecurityStatus();
    const gpgId = sec.passGpgId || (sec.gpgKeys && sec.gpgKeys[0]);
    if (!gpgId) {
      logOutput(outputStep2, 'Error: Create a GPG key in Step 1 first before initializing pass store.', true);
      return;
    }
    logOutput(outputStep2, `Initializing pass store with ${gpgId}...`, true);
    const res = await api.initPass({ gpgId });
    if (res.ok) {
      logOutput(outputStep2, 'Pass store initialized successfully!');
      await refreshSecurityStatus();
    } else {
      logOutput(outputStep2, `Error: ${res.error}`);
    }
  });

  btnConfigPinentry.addEventListener('click', async () => {
    logOutput(outputStep3, 'Configuring GUI pinentry-gnome3...', true);
    const res = await api.configurePinentry();
    if (res.ok) {
      if (badgePinentryStatus) {
        badgePinentryStatus.className = 'badge badge-success';
        badgePinentryStatus.textContent = 'Configured';
      }
      logOutput(outputStep3, 'GUI pinentry configured in ~/.gnupg/gpg-agent.conf');
    } else {
      logOutput(outputStep3, `Error: ${res.error}`);
    }
  });

  // Step 4 Handlers (SSH & Git)
  async function refreshSshStatus() {
    if (!api) return;
    const ssh = await api.getSshStatus();
    if (ssh.keyFound && ssh.pubKey) {
      badgeSshStatus.className = 'badge badge-success';
      badgeSshStatus.textContent = `SSH Key Present (${ssh.keyFound})`;
      sshPubkey.value = ssh.pubKey;
    } else {
      badgeSshStatus.className = 'badge badge-neutral';
      badgeSshStatus.textContent = 'No SSH Key Found';
      sshPubkey.value = '';
    }
  }

  async function refreshGitConfig() {
    if (!api) return;
    const cfg = await api.getGitConfig();
    if (cfg.name) gitUsername.value = cfg.name;
    if (cfg.email) gitUseremail.value = cfg.email;
  }

  async function refreshGhAuth() {
    if (!api) return;
    const gh = await api.getGhAuthStatus();
    if (gh.ok) {
      badgeGhStatus.className = 'badge badge-success';
      badgeGhStatus.textContent = 'Authenticated';
      ghAuthDetail.textContent = `Logged in as GitHub user: ${gh.user || 'Unknown'}`;
    } else {
      badgeGhStatus.className = 'badge badge-warning';
      badgeGhStatus.textContent = 'Not Authenticated';
      ghAuthDetail.textContent = 'Click "Login via Web Browser" or enter a PAT token to authenticate.';
    }
  }

  btnSaveGitConfig.addEventListener('click', async () => {
    const name = gitUsername.value;
    const email = gitUseremail.value;
    logOutput(outputStep4, 'Saving global git user.name and user.email...', true);
    const res = await api.saveGitConfig({ name, email });
    if (res.ok) {
      logOutput(outputStep4, 'Saved git global user.name and user.email');
    } else {
      logOutput(outputStep4, `Error saving git config: ${res.error}`);
    }
  });

  btnGenSshKey.addEventListener('click', async () => {
    logOutput(outputStep4, 'Generating Ed25519 SSH keypair...', true);
    const res = await api.generateSshKey({ comment: gitUseremail.value || 'robos@localhost' });
    if (res.ok) {
      logOutput(outputStep4, 'Generated SSH Ed25519 keypair!');
      await refreshSshStatus();
    } else {
      logOutput(outputStep4, `Error: ${res.error}`);
    }
  });

  btnCopySshKey.addEventListener('click', () => {
    if (sshPubkey.value) {
      navigator.clipboard.writeText(sshPubkey.value);
      logOutput(outputStep4, 'Public SSH key copied to clipboard!', true);
    }
  });

  btnUploadGithubSsh.addEventListener('click', async () => {
    logOutput(outputStep4, 'Uploading public SSH key to GitHub...', true);
    const res = await api.addSshKeyToGithub();
    if (res.ok) {
      logOutput(outputStep4, res.alreadyAdded ? 'Key is already registered on GitHub.' : 'SSH Public Key uploaded to GitHub!');
    } else {
      logOutput(outputStep4, `Error: ${res.error}`);
    }
  });

  btnTestSsh.addEventListener('click', async () => {
    logOutput(outputStep4, 'Testing SSH connection to git@github.com...', true);
    const res = await api.testSshConnection();
    logOutput(outputStep4, res.detail);
  });

  btnGhLogin.addEventListener('click', async () => {
    logOutput(outputStep4, 'Launching GitHub authentication terminal window...', true);
    logOutput(outputStep4, 'Please complete the login prompt or browser confirmation window.');
    const res = await api.startGhLogin();
    if (res.ok) {
      logOutput(outputStep4, `GitHub login completed successfully! Logged in as: ${res.user || 'authenticated user'}`);
      await refreshGhAuth();
    } else {
      logOutput(outputStep4, `GitHub login output: ${res.error || 'Attempt finished.'}`);
      await refreshGhAuth();
    }
  });

  const btnGhTokenLogin = document.getElementById('btn-gh-token-login');
  const ghTokenInput = document.getElementById('gh-token-input');
  if (btnGhTokenLogin && ghTokenInput) {
    btnGhTokenLogin.addEventListener('click', async () => {
      const token = ghTokenInput.value.trim();
      if (!token) {
        logOutput(outputStep4, 'Error: Token field is empty.', true);
        return;
      }
      logOutput(outputStep4, 'Authenticating GitHub CLI with provided token...', true);
      const res = await api.loginGhWithToken(token);
      if (res.ok) {
        logOutput(outputStep4, 'Successfully authenticated GitHub CLI with token!');
        ghTokenInput.value = '';
        await refreshGhAuth();
      } else {
        logOutput(outputStep4, `Error authenticating token: ${res.error}`);
      }
    });
  }

  // Step 5 Handlers (AI Agents)
  async function refreshAiConfig() {
    if (!api) return;
    const cfg = await api.getAiAgentConfig();
    if (cfg.defaultModel) selectDefaultModel.value = cfg.defaultModel;
  }

  document.querySelectorAll('.test-conn-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const agentId = btn.dataset.agent;
      const apiKey = agentId === 'claude' ? keyAnthropic.value : agentId === 'gemini' ? keyGemini.value : '';
      logOutput(outputStep5, `Testing connection for ${agentId}...`);
      const res = await api.testAgentConnection({ agentId, apiKey });
      logOutput(outputStep5, `[${agentId}] ${res.message}`);
    });
  });

  function saveCurrentStepData() {
    if (!api) return;
    try {
      if (currentStep === 5 && selectDefaultModel) {
        api.saveAiAgentConfig({
          defaultModel: selectDefaultModel.value || 'gemini-3.6-flash',
          anthropicKey: (keyAnthropic && keyAnthropic.value) ? keyAnthropic.value : undefined,
          geminiKey: (keyGemini && keyGemini.value) ? keyGemini.value : undefined,
        });
      }
    } catch (e) {
      console.error('saveCurrentStepData error:', e);
    }
  }

  // Step 6 & 7 Handlers (Dev Apps & Git Projects)
  async function refreshDevApps() {
    if (!api) return;
    const apps = await api.getDevAppsCatalog();
    devAppsGrid.innerHTML = apps.map(app => `
      <label class="checkbox-card">
        <input type="checkbox" checked value="${app.id}">
        <div>
          <div class="checkbox-card-title">${app.name}</div>
          <div class="checkbox-card-desc">${app.category} — Ready</div>
        </div>
      </label>
    `).join('');
  }

  let projectsList = [];
  async function refreshGitProjects() {
    if (!api) return;
    projectsList = await api.getGitProjectsList();
    renderProjectsList();
  }

  function renderProjectsList() {
    projectsListContainer.innerHTML = projectsList.map((p, idx) => `
      <div class="repo-item">
        <div class="repo-info">
          <span class="repo-name">${p.name}</span>
          <span class="repo-path">Target: ${p.targetPath}</span>
        </div>
        <button class="btn btn-outline btn-sm remove-repo-btn" data-idx="${idx}">Remove</button>
      </div>
    `).join('');

    document.querySelectorAll('.remove-repo-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.dataset.idx, 10);
        projectsList.splice(idx, 1);
        renderProjectsList();
      });
    });
  }

  btnAddRepo.addEventListener('click', () => {
    const url = inputNewRepo.value.trim();
    if (!url) return;
    const parts = url.replace(/\.git$/, '').split('/');
    const name = parts.length >= 2 ? `${parts[parts.length - 2]}/${parts[parts.length - 1]}` : url;
    projectsList.push({ name, url, targetPath: `/home/robos/source/${name}` });
    inputNewRepo.value = '';
    renderProjectsList();
  });

  // Step 8 Handlers (Complete)
  btnFinishOnboarding.addEventListener('click', async () => {
    saveCurrentStepData();
    const details = {
      completed: true,
      configuredAt: new Date().toISOString(),
      defaultModel: selectDefaultModel.value,
      projects: projectsList,
    };
    const res = await api.completeOnboarding(details);
    if (res.ok) {
      await api.closeWindow();
    }
  });

  btnLaunchDevCentral.addEventListener('click', async () => {
    saveCurrentStepData();
    await api.completeOnboarding({ completed: true });
    await api.launchApp('dev-central');
    await api.closeWindow();
  });

  // Clear Log button handlers
  document.querySelectorAll('.clear-log-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        targetEl.textContent = '';
        const container = targetEl.closest('.output-container') || targetEl;
        container.style.display = 'none';
      }
    });
  });

  // Initialize
  loadAllData();
});
