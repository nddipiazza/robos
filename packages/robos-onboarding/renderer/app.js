document.addEventListener('DOMContentLoaded', () => {
  const api = window.onboardingAPI;
  let currentStep = 1;
  const TOTAL_STEPS = 6;

  // DOM Elements
  const stepItems = document.querySelectorAll('.step-nav-item');
  const stepPanels = document.querySelectorAll('.step-panel');
  const btnBack = document.getElementById('btn-back');
  const btnNext = document.getElementById('btn-next');
  const btnSkip = document.getElementById('btn-skip');

  // Step 1 Elements
  const badgeSecurityStatus = document.getElementById('badge-security-status');
  const gpgKeyDetails = document.getElementById('gpg-key-details');
  const btnCreateGpg = document.getElementById('btn-create-gpg');
  const cardGpgForm = document.getElementById('card-gpg-form');
  const btnSubmitGpg = document.getElementById('btn-submit-gpg');
  const btnInitPass = document.getElementById('btn-init-pass');
  const btnConfigPinentry = document.getElementById('btn-config-pinentry');
  const outputStep1 = document.getElementById('output-step-1');

  // Step 2 Elements
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
  const outputStep2 = document.getElementById('output-step-2');

  // Step 3 Elements
  const selectDefaultModel = document.getElementById('select-default-model');
  const keyAnthropic = document.getElementById('key-anthropic');
  const keyGemini = document.getElementById('key-gemini');
  const outputStep3 = document.getElementById('output-step-3');

  // Step 4 & 5 Elements
  const devAppsGrid = document.getElementById('dev-apps-grid');
  const projectsListContainer = document.getElementById('projects-list-container');
  const inputNewRepo = document.getElementById('input-new-repo');
  const btnAddRepo = document.getElementById('btn-add-repo');

  // Step 6 Elements
  const btnFinishOnboarding = document.getElementById('btn-finish-onboarding');
  const btnLaunchDevCentral = document.getElementById('btn-launch-dev-central');

  // ── Step Navigation ──
  function goToStep(step) {
    if (step < 1 || step > TOTAL_STEPS) return;
    currentStep = step;

    stepItems.forEach(item => {
      const itemStep = parseInt(item.dataset.step, 10);
      item.classList.toggle('active', itemStep === currentStep);
      if (itemStep < currentStep) item.classList.add('completed');
    });

    stepPanels.forEach((panel, idx) => {
      panel.classList.toggle('active', (idx + 1) === currentStep);
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

  btnBack.addEventListener('click', () => goToStep(currentStep - 1));
  btnNext.addEventListener('click', () => {
    saveCurrentStepData();
    goToStep(currentStep + 1);
  });
  btnSkip.addEventListener('click', () => goToStep(currentStep + 1));

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

  function logOutput(element, text) {
    if (!element) return;
    element.style.display = 'block';
    element.textContent = `[${new Date().toLocaleTimeString()}] ${text}\n` + element.textContent;
  }

  // Step 1 Handlers
  async function refreshSecurityStatus() {
    if (!api) return;
    const sec = await api.getSecurityStatus();
    if (sec.passReady) {
      badgeSecurityStatus.className = 'badge badge-success';
      badgeSecurityStatus.textContent = 'Pass Store Initialized';
      gpgKeyDetails.innerHTML = `<div>Key: <code>${sec.passGpgId || sec.gpgKeys[0] || 'Active'}</code></div>`;
    } else if (sec.gpgKeys && sec.gpgKeys.length > 0) {
      badgeSecurityStatus.className = 'badge badge-warning';
      badgeSecurityStatus.textContent = 'GPG Key Present / Pass Uninitialized';
      gpgKeyDetails.innerHTML = `<div>Detected GPG Key: <code>${sec.gpgKeys[0]}</code></div>`;
    } else {
      badgeSecurityStatus.className = 'badge badge-neutral';
      badgeSecurityStatus.textContent = 'No GPG Key Found';
      gpgKeyDetails.textContent = 'Generate a GPG key to secure your local secrets store.';
    }
  }

  btnCreateGpg.addEventListener('click', () => {
    cardGpgForm.style.display = cardGpgForm.style.display === 'none' ? 'block' : 'none';
  });

  btnSubmitGpg.addEventListener('click', async () => {
    const name = document.getElementById('gpg-name').value;
    const email = document.getElementById('gpg-email').value;
    const passphrase = document.getElementById('gpg-passphrase').value;
    logOutput(outputStep1, 'Generating GPG master key...');
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
      logOutput(outputStep1, 'Error: Create a GPG key first before initializing pass store.');
      return;
    }
    logOutput(outputStep1, `Initializing pass store with ${gpgId}...`);
    const res = await api.initPass({ gpgId });
    if (res.ok) {
      logOutput(outputStep1, 'Pass store initialized successfully!');
      await refreshSecurityStatus();
    } else {
      logOutput(outputStep1, `Error: ${res.error}`);
    }
  });

  btnConfigPinentry.addEventListener('click', async () => {
    const res = await api.configurePinentry();
    if (res.ok) {
      logOutput(outputStep1, 'GUI pinentry configured in ~/.gnupg/gpg-agent.conf');
    } else {
      logOutput(outputStep1, `Error: ${res.error}`);
    }
  });

  // Step 2 Handlers
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
      ghAuthDetail.textContent = 'Click "Login with GitHub" to authenticate via gh CLI.';
    }
  }

  btnSaveGitConfig.addEventListener('click', async () => {
    const name = gitUsername.value;
    const email = gitUseremail.value;
    const res = await api.saveGitConfig({ name, email });
    if (res.ok) {
      logOutput(outputStep2, 'Saved git global user.name and user.email');
    } else {
      logOutput(outputStep2, `Error saving git config: ${res.error}`);
    }
  });

  btnGenSshKey.addEventListener('click', async () => {
    logOutput(outputStep2, 'Generating Ed25519 SSH keypair...');
    const res = await api.generateSshKey({ comment: gitUseremail.value || 'robos@localhost' });
    if (res.ok) {
      logOutput(outputStep2, 'Generated SSH Ed25519 keypair!');
      await refreshSshStatus();
    } else {
      logOutput(outputStep2, `Error: ${res.error}`);
    }
  });

  btnCopySshKey.addEventListener('click', () => {
    if (sshPubkey.value) {
      navigator.clipboard.writeText(sshPubkey.value);
      logOutput(outputStep2, 'Public SSH key copied to clipboard!');
    }
  });

  btnUploadGithubSsh.addEventListener('click', async () => {
    logOutput(outputStep2, 'Uploading public SSH key to GitHub...');
    const res = await api.addSshKeyToGithub();
    if (res.ok) {
      logOutput(outputStep2, res.alreadyAdded ? 'Key is already registered on GitHub.' : 'SSH Public Key uploaded to GitHub!');
    } else {
      logOutput(outputStep2, `Error: ${res.error}`);
    }
  });

  btnTestSsh.addEventListener('click', async () => {
    logOutput(outputStep2, 'Testing SSH connection to git@github.com...');
    const res = await api.testSshConnection();
    logOutput(outputStep2, res.detail);
  });

  btnGhLogin.addEventListener('click', async () => {
    logOutput(outputStep2, 'Opening GitHub login prompt...');
    const res = await api.startGhLogin();
    if (res.ok) {
      logOutput(outputStep2, 'GitHub login completed!');
      await refreshGhAuth();
    } else {
      logOutput(outputStep2, 'GitHub login attempt finished.');
    }
  });

  // Step 3 Handlers
  async function refreshAiConfig() {
    if (!api) return;
    const cfg = await api.getAiAgentConfig();
    if (cfg.defaultModel) selectDefaultModel.value = cfg.defaultModel;
  }

  document.querySelectorAll('.test-conn-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const agentId = btn.dataset.agent;
      const apiKey = agentId === 'claude' ? keyAnthropic.value : agentId === 'gemini' ? keyGemini.value : '';
      logOutput(outputStep3, `Testing connection for ${agentId}...`);
      const res = await api.testAgentConnection({ agentId, apiKey });
      logOutput(outputStep3, `[${agentId}] ${res.message}`);
    });
  });

  function saveCurrentStepData() {
    if (!api) return;
    if (currentStep === 3) {
      api.saveAiAgentConfig({
        defaultModel: selectDefaultModel.value,
        anthropicKey: keyAnthropic.value || undefined,
        geminiKey: keyGemini.value || undefined,
      });
    }
  }

  // Step 4 & 5 Handlers
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

  // Step 6 Handlers
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

  // Initialize
  loadAllData();
});
