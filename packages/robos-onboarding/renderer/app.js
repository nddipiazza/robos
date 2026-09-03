document.addEventListener('DOMContentLoaded', () => {
  const api = window.onboardingAPI;
  let currentStep = 1;
  const TOTAL_STEPS = 11;

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
  const gpgSuccessBanner = document.getElementById('gpg-success-banner');
  const btnGpgStepNext = document.getElementById('btn-gpg-step-next');

  // Step 2 Elements (Pass Store)
  const badgePassStatus = document.getElementById('badge-pass-status');
  const btnInitPass = document.getElementById('btn-init-pass');
  const outputStep2 = document.getElementById('output-step-2');
  const passSuccessBanner = document.getElementById('pass-success-banner');
  const passGpgIdDisplay = document.getElementById('pass-gpg-id-display');
  const btnPassStepNext = document.getElementById('btn-pass-step-next');

  // Step 3 Elements (GUI Pinentry)
  const badgePinentryStatus = document.getElementById('badge-pinentry-status');
  const btnConfigPinentry = document.getElementById('btn-config-pinentry');
  const outputStep3 = document.getElementById('output-step-3');
  const pinentrySuccessBanner = document.getElementById('pinentry-success-banner');
  const btnPinentryStepNext = document.getElementById('btn-pinentry-step-next');

  // Step 4 Elements (Git Profile)
  const gitUsername = document.getElementById('git-username');
  const gitUseremail = document.getElementById('git-useremail');
  const btnSaveGitConfig = document.getElementById('btn-save-git-config');
  const badgeGitProfileStatus = document.getElementById('badge-git-profile-status');
  const gitProfileSuccessBanner = document.getElementById('git-profile-success-banner');
  const btnGitProfileStepNext = document.getElementById('btn-git-profile-step-next');
  const outputStep4 = document.getElementById('output-step-4');

  // Step 5 Elements (SSH Keypair)
  const badgeSshStatus = document.getElementById('badge-ssh-status');
  const sshPubkey = document.getElementById('ssh-pubkey');
  const btnGenSshKey = document.getElementById('btn-gen-ssh-key');
  const btnCopySshKey = document.getElementById('btn-copy-ssh-key');
  const btnTestSsh = document.getElementById('btn-test-ssh');
  const sshKeySuccessBanner = document.getElementById('ssh-key-success-banner');
  const btnSshKeyStepNext = document.getElementById('btn-ssh-key-step-next');
  const outputStep5 = document.getElementById('output-step-5');

  // Step 6 Elements (Google Chrome Browser)
  const badgeBrowserStatus = document.getElementById('badge-browser-status');
  const browserStatusDetail = document.getElementById('browser-status-detail');
  const btnInstallChrome = document.getElementById('btn-install-chrome');
  const btnSetDefaultChrome = document.getElementById('btn-set-default-chrome');
  const btnOpenTestChrome = document.getElementById('btn-open-test-chrome');
  const browserSuccessBanner = document.getElementById('browser-success-banner');
  const btnBrowserStepNext = document.getElementById('btn-browser-step-next');
  const outputStep6 = document.getElementById('output-step-6');

  // Step 7 Elements (GitHub Auth - Optional)
  const badgeGhStatus = document.getElementById('badge-gh-status');
  const ghAuthDetail = document.getElementById('gh-auth-detail');
  const btnGhLogin = document.getElementById('btn-gh-login');
  const btnOpenGithubDeviceUrl = document.getElementById('btn-open-github-device-url');
  const btnUploadGithubSsh = document.getElementById('btn-upload-github-ssh');
  const ghTokenInput = document.getElementById('gh-token-input');
  const btnGhTokenLogin = document.getElementById('btn-gh-token-login');
  const btnSkipGhAuth = document.getElementById('btn-skip-gh-auth');
  const ghAuthSuccessBanner = document.getElementById('gh-auth-success-banner');
  const btnGhAuthStepNext = document.getElementById('btn-gh-auth-step-next');
  const outputStep7 = document.getElementById('output-step-7');

  // Step 8 Elements (AI Agents)
  const selectDefaultModel = document.getElementById('select-default-model');
  const keyAnthropic = document.getElementById('key-anthropic');
  const keyGemini = document.getElementById('key-gemini');
  const outputStep8 = document.getElementById('output-step-8');
  const aiSuccessBanner = document.getElementById('ai-success-banner');
  const btnAiStepNext = document.getElementById('btn-ai-step-next');

  // Step 9 & 10 Elements (Dev Apps & Git Projects)
  const devAppsGrid = document.getElementById('dev-apps-grid');
  const devAppsSuccessBanner = document.getElementById('dev-apps-success-banner');
  const btnDevAppsStepNext = document.getElementById('btn-dev-apps-step-next');

  const projectsListContainer = document.getElementById('projects-list-container');
  const inputNewRepo = document.getElementById('input-new-repo');
  const btnAddRepo = document.getElementById('btn-add-repo');
  const projectsSuccessBanner = document.getElementById('projects-success-banner');
  const btnProjectsStepNext = document.getElementById('btn-projects-step-next');

  // Step 11 Elements (Complete)
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

    // Toggle Back / Next / Skip buttons
    btnBack.style.display = currentStep > 1 ? 'inline-block' : 'none';

    if (currentStep === TOTAL_STEPS) {
      btnNext.style.display = 'none';
      btnSkip.style.display = 'none';
    } else {
      btnNext.style.display = 'inline-block';
      btnNext.textContent = `Next Step (${currentStep + 1}/${TOTAL_STEPS}) →`;
      btnSkip.style.display = [7, 9, 10].includes(currentStep) ? 'inline-block' : 'none';
    }

    // Refresh context for step
    if (currentStep === 1 || currentStep === 2 || currentStep === 3) refreshSecurityStatus();
    if (currentStep === 4) refreshGitProfileStatus();
    if (currentStep === 5) refreshSshStatus();
    if (currentStep === 6) refreshBrowserStatus();
    if (currentStep === 7) refreshGhStatus();
    if (currentStep === 8) loadAiAgentConfig();
    if (currentStep === 9) loadGitProjectsList();
    if (currentStep === 10) loadDevAppsCatalog();
  }

  // Sidebar item click
  stepItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetStep = parseInt(item.dataset.step, 10);
      goToStep(targetStep);
    });
  });

  // Footer nav buttons
  btnBack.addEventListener('click', () => goToStep(currentStep - 1));
  btnNext.addEventListener('click', () => handleNextStep());
  btnSkip.addEventListener('click', () => goToStep(currentStep + 1));

  window.handleNextStep = function() {
    if (currentStep < TOTAL_STEPS) {
      goToStep(currentStep + 1);
    }
  };

  // Banner "Move to Next Step" button click listeners
  if (btnGpgStepNext) btnGpgStepNext.addEventListener('click', () => goToStep(2));
  if (btnPassStepNext) btnPassStepNext.addEventListener('click', () => goToStep(3));
  if (btnPinentryStepNext) btnPinentryStepNext.addEventListener('click', () => goToStep(4));
  if (btnGitProfileStepNext) btnGitProfileStepNext.addEventListener('click', () => goToStep(5));
  if (btnSshKeyStepNext) btnSshKeyStepNext.addEventListener('click', () => goToStep(6));
  if (btnBrowserStepNext) btnBrowserStepNext.addEventListener('click', () => goToStep(7));
  if (btnGhAuthStepNext) btnGhAuthStepNext.addEventListener('click', () => goToStep(8));
  if (btnSkipGhAuth) btnSkipGhAuth.addEventListener('click', () => goToStep(8));
  if (btnAiStepNext) btnAiStepNext.addEventListener('click', () => goToStep(9));
  if (btnProjectsStepNext) btnProjectsStepNext.addEventListener('click', () => goToStep(10));
  if (btnDevAppsStepNext) btnDevAppsStepNext.addEventListener('click', () => goToStep(11));

  // Output logging
  function logOutput(stepNum, text, isError = false) {
    const el = document.getElementById(`output-step-${stepNum}`);
    if (!el) return;
    el.style.display = 'block';
    el.innerHTML = `<span style="color: ${isError ? '#f85149' : '#3fb950'};">${text}</span>`;
  }

  function clearAllOutputs() {
    for (let i = 1; i <= TOTAL_STEPS; i++) {
      const el = document.getElementById(`output-step-${i}`);
      if (el) {
        el.style.display = 'none';
        el.textContent = '';
      }
    }
  }

  // ── Step 1, 2, 3: Security & Pass ──
  async function refreshSecurityStatus() {
    const passAlertEl = document.getElementById('pass-prerequisite-alert');
    if (api && api.checkPassPrerequisite) {
      try {
        const passCheck = await api.checkPassPrerequisite();
        if (passCheck && passCheck.installed === false) {
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
      } catch (e) {}
    }

    if (!api || !api.getSecurityStatus) return;
    try {
      const sec = await api.getSecurityStatus();

      // GPG Status
      if (sec.hasGpgKey || (sec.gpgKeys && sec.gpgKeys.length > 0)) {
        if (badgeGpgStatus) {
          badgeGpgStatus.className = 'badge badge-success';
          badgeGpgStatus.textContent = '✓ GPG Key Present';
        }
        if (gpgKeyDetails) {
          const keyStr = sec.keyId || (sec.gpgKeys && sec.gpgKeys[0]) || 'GPG Master Key';
          gpgKeyDetails.innerHTML = `<div>Detected GPG Key: <code>${keyStr}</code></div>`;
        }
        if (gpgSuccessBanner) gpgSuccessBanner.style.display = 'block';
        const step1NavItem = document.querySelector('.step-nav-item[data-step="1"]');
        if (step1NavItem) step1NavItem.classList.add('completed');
      } else {
        if (badgeGpgStatus) {
          badgeGpgStatus.className = 'badge badge-warning';
          badgeGpgStatus.textContent = 'No GPG Key Found';
        }
        if (gpgKeyDetails) {
          gpgKeyDetails.textContent = 'Generate a GPG key to secure your local secrets store.';
        }
        if (gpgSuccessBanner) gpgSuccessBanner.style.display = 'none';
      }

      // Pass Status
      if (badgePassStatus && sec.passInstalled !== false) {
        if (sec.passInitialized || sec.passReady) {
          badgePassStatus.className = 'badge badge-success';
          badgePassStatus.textContent = '✓ Initialized & Ready';
          if (btnInitPass) {
            btnInitPass.className = 'btn btn-secondary btn-sm';
            btnInitPass.textContent = '✓ Password Store Initialized (Click to Re-initialize)';
          }
          if (passSuccessBanner) passSuccessBanner.style.display = 'block';
          if (passGpgIdDisplay) passGpgIdDisplay.textContent = sec.passGpgId || sec.keyId || (sec.gpgKeys && sec.gpgKeys[0]) || '';
          const step2NavItem = document.querySelector('.step-nav-item[data-step="2"]');
          if (step2NavItem) step2NavItem.classList.add('completed');
        } else {
          badgePassStatus.className = 'badge badge-warning';
          badgePassStatus.textContent = 'Pass Uninitialized';
          if (btnInitPass) {
            btnInitPass.className = 'btn btn-primary btn-sm';
            btnInitPass.textContent = 'Initialize Password Store';
          }
          if (passSuccessBanner) passSuccessBanner.style.display = 'none';
        }
      }

      // Pinentry Status
      if (badgePinentryStatus) {
        if (sec.pinentryConfigured) {
          badgePinentryStatus.className = 'badge badge-success';
          badgePinentryStatus.textContent = '✓ Configured & Active';
          if (btnConfigPinentry) {
            btnConfigPinentry.className = 'btn btn-secondary btn-sm';
            btnConfigPinentry.textContent = '✓ GUI Pinentry Configured (Click to Re-configure)';
          }
          if (pinentrySuccessBanner) pinentrySuccessBanner.style.display = 'block';
          const step3NavItem = document.querySelector('.step-nav-item[data-step="3"]');
          if (step3NavItem) step3NavItem.classList.add('completed');
        } else {
          badgePinentryStatus.className = 'badge badge-neutral';
          badgePinentryStatus.textContent = 'Unconfigured';
          if (btnConfigPinentry) {
            btnConfigPinentry.className = 'btn btn-primary btn-sm';
            btnConfigPinentry.textContent = 'Configure GUI Pinentry';
          }
          if (pinentrySuccessBanner) pinentrySuccessBanner.style.display = 'none';
        }
      }
    } catch (e) {}
  }

  btnCreateGpg.addEventListener('click', () => {
    cardGpgForm.style.display = 'block';
  });

  btnSubmitGpg.addEventListener('click', async () => {
    const name = document.getElementById('gpg-name').value;
    const email = document.getElementById('gpg-email').value;
    const passphrase = document.getElementById('gpg-passphrase').value;
    logOutput(1, 'Generating 4096-bit RSA GPG Key... Please wait...');
    try {
      const res = await api.createGpgKey({ name, email, passphrase });
      if (res.ok) {
        logOutput(1, 'GPG Key created successfully!');
        cardGpgForm.style.display = 'none';
        if (badgeGpgStatus) {
          badgeGpgStatus.className = 'badge badge-success';
          badgeGpgStatus.textContent = '✓ GPG Key Present';
        }
        if (gpgKeyDetails) {
          const keyStr = res.keyId || 'GPG Master Key';
          gpgKeyDetails.innerHTML = `<div>Detected GPG Key: <code>${keyStr}</code></div>`;
        }
        if (gpgSuccessBanner) {
          gpgSuccessBanner.style.display = 'block';
        }
        const step1NavItem = document.querySelector('.step-nav-item[data-step="1"]');
        if (step1NavItem) step1NavItem.classList.add('completed');
        await refreshSecurityStatus();
      } else {
        logOutput(1, `Error: ${res.error}`, true);
      }
    } catch (e) {
      logOutput(1, `Error: ${e.message}`, true);
    }
  });

  btnInitPass.addEventListener('click', async () => {
    logOutput(2, 'Initializing password store...');
    try {
      const sec = await api.getSecurityStatus();
      const gpgId = sec.keyId || (sec.gpgKeys && sec.gpgKeys[0]) || 'robos-default';
      const res = await api.initPass({ gpgId, keyId: gpgId });
      if (res.ok) {
        logOutput(2, 'Password store initialized successfully!');
        await refreshSecurityStatus();
      } else {
        logOutput(2, `Error: ${res.error}`, true);
      }
    } catch (e) {
      logOutput(2, `Error: ${e.message}`, true);
    }
  });

  btnConfigPinentry.addEventListener('click', async () => {
    logOutput(3, 'Configuring pinentry in ~/.gnupg/gpg-agent.conf...');
    try {
      const res = await api.configurePinentry();
      if (res.ok) {
        logOutput(3, 'Pinentry configured successfully!');
        await refreshSecurityStatus();
      } else {
        logOutput(3, `Error: ${res.error}`, true);
      }
    } catch (e) {
      logOutput(3, `Error: ${e.message}`, true);
    }
  });

  // ── Step 4: Git User Profile ──
  async function refreshGitProfileStatus() {
    if (!api || !api.getGitConfig) return;
    try {
      const cfg = await api.getGitConfig();
      if (cfg.name) gitUsername.value = cfg.name;
      if (cfg.email) gitUseremail.value = cfg.email;

      if (cfg.name && cfg.email) {
        if (badgeGitProfileStatus) {
          badgeGitProfileStatus.className = 'badge badge-success';
          badgeGitProfileStatus.textContent = '✓ Configured';
        }
        if (gitProfileSuccessBanner) gitProfileSuccessBanner.style.display = 'block';
        const step4NavItem = document.querySelector('.step-nav-item[data-step="4"]');
        if (step4NavItem) step4NavItem.classList.add('completed');
      } else {
        if (badgeGitProfileStatus) {
          badgeGitProfileStatus.className = 'badge badge-warning';
          badgeGitProfileStatus.textContent = 'Incomplete Identity';
        }
        if (gitProfileSuccessBanner) gitProfileSuccessBanner.style.display = 'none';
      }
    } catch (e) {}
  }

  btnSaveGitConfig.addEventListener('click', async () => {
    logOutput(4, 'Saving global Git user configuration...');
    try {
      const name = gitUsername.value;
      const email = gitUseremail.value;
      const res = await api.saveGitConfig({ name, email });
      if (res.ok) {
        logOutput(4, 'Git profile saved successfully!');
        await refreshGitProfileStatus();
      } else {
        logOutput(4, `Error: ${res.error}`, true);
      }
    } catch (e) {
      logOutput(4, `Error: ${e.message}`, true);
    }
  });

  // ── Step 5: SSH Keypair ──
  async function refreshSshStatus() {
    if (!api || !api.getSshStatus) return;
    try {
      const res = await api.getSshStatus();
      if (res.keyExists || res.keyFound) {
        badgeSshStatus.className = 'badge badge-success';
        badgeSshStatus.textContent = `✓ Key Present (${res.keyType || 'Ed25519'})`;
        if (sshPubkey) sshPubkey.value = res.pubKeyContent || res.pubKey || '';
        if (sshKeySuccessBanner) sshKeySuccessBanner.style.display = 'block';
        const step5NavItem = document.querySelector('.step-nav-item[data-step="5"]');
        if (step5NavItem) step5NavItem.classList.add('completed');
      } else {
        badgeSshStatus.className = 'badge badge-warning';
        badgeSshStatus.textContent = 'No Key Found';
        if (sshPubkey) sshPubkey.value = '';
        if (sshKeySuccessBanner) sshKeySuccessBanner.style.display = 'none';
      }
    } catch (e) {}
  }

  btnGenSshKey.addEventListener('click', async () => {
    logOutput(5, 'Generating Ed25519 SSH Keypair...');
    try {
      const res = await api.generateSshKey({ comment: `robos-dev-key` });
      if (res.ok) {
        logOutput(5, res.alreadyExisted ? 'SSH key already existed.' : 'SSH key generated successfully!');
        refreshSshStatus();
      } else {
        logOutput(5, `Error: ${res.error}`, true);
      }
    } catch (e) {
      logOutput(5, `Error: ${e.message}`, true);
    }
  });

  btnCopySshKey.addEventListener('click', () => {
    if (sshPubkey.value) {
      navigator.clipboard.writeText(sshPubkey.value);
      logOutput(5, 'SSH Public Key copied to clipboard!');
    }
  });

  btnTestSsh.addEventListener('click', async () => {
    logOutput(5, 'Testing SSH connection to GitHub...');
    try {
      const res = await api.testSshConnection();
      logOutput(5, res.detail || (res.ok ? 'Connection successful!' : 'SSH authentication failed.'), !res.ok);
    } catch (e) {
      logOutput(5, `Error: ${e.message}`, true);
    }
  });

  // ── Step 6: Google Chrome Browser ──
  async function refreshBrowserStatus() {
    if (!api || !api.getBrowserStatus) return;
    try {
      const status = await api.getBrowserStatus();
      if (status.chromeInstalled) {
        badgeBrowserStatus.className = 'badge badge-success';
        badgeBrowserStatus.textContent = '✓ Installed & Ready';
        browserStatusDetail.textContent = `Google Chrome is installed (${status.chromePath}). Default browser: ${status.defaultBrowser}.`;
        if (browserSuccessBanner) browserSuccessBanner.style.display = 'block';
        const step6NavItem = document.querySelector('.step-nav-item[data-step="6"]');
        if (step6NavItem) step6NavItem.classList.add('completed');
      } else {
        badgeBrowserStatus.className = 'badge badge-warning';
        badgeBrowserStatus.textContent = 'Not Installed';
        browserStatusDetail.textContent = 'Google Chrome is not detected on your system. Click "Install Google Chrome" below to prepare web browser login.';
        if (browserSuccessBanner) browserSuccessBanner.style.display = 'none';
      }
    } catch (e) {}
  }

  btnInstallChrome.addEventListener('click', async () => {
    logOutput(6, 'Installing Google Chrome and setting as default browser... Please wait...');
    try {
      const res = await api.installGoogleChrome();
      if (res.ok) {
        logOutput(6, res.message || 'Google Chrome installed successfully!');
        refreshBrowserStatus();
      } else {
        logOutput(6, `Error installing Chrome: ${res.error}`, true);
      }
    } catch (e) {
      logOutput(6, `Error: ${e.message}`, true);
    }
  });

  btnSetDefaultChrome.addEventListener('click', async () => {
    logOutput(6, 'Setting Google Chrome as system default browser...');
    try {
      const res = await api.setChromeDefaultBrowser();
      if (res.ok) {
        logOutput(6, 'Google Chrome is now configured as your default web browser!');
        refreshBrowserStatus();
      } else {
        logOutput(6, `Error: ${res.error}`, true);
      }
    } catch (e) {
      logOutput(6, `Error: ${e.message}`, true);
    }
  });

  btnOpenTestChrome.addEventListener('click', async () => {
    logOutput(6, 'Opening https://github.com in Google Chrome...');
    try {
      const res = await api.openUrlInBrowser('https://github.com');
      if (res.ok) {
        logOutput(6, 'Opened web page in Google Chrome.');
      } else {
        logOutput(6, `Error: ${res.error}`, true);
      }
    } catch (e) {
      logOutput(6, `Error: ${e.message}`, true);
    }
  });

  // ── Step 7: GitHub Auth (Optional) ──
  async function refreshGhStatus() {
    if (!api || !api.getGhAuthStatus) return;
    try {
      const gh = await api.getGhAuthStatus();
      if (gh.authenticated || gh.ok) {
        const u = gh.username || gh.user || 'connected user';
        badgeGhStatus.className = 'badge badge-success';
        badgeGhStatus.textContent = `✓ Logged in as ${u}`;
        ghAuthDetail.textContent = `Authenticated with GitHub account: ${u}`;
        if (ghAuthSuccessBanner) ghAuthSuccessBanner.style.display = 'block';
        const step7NavItem = document.querySelector('.step-nav-item[data-step="7"]');
        if (step7NavItem) step7NavItem.classList.add('completed');
      } else {
        badgeGhStatus.className = 'badge badge-warning';
        badgeGhStatus.textContent = 'Not Authenticated';
        ghAuthDetail.textContent = 'Click "Login via Web Browser" to authenticate with GitHub CLI via Google Chrome, or enter a Personal Access Token (PAT).';
        if (ghAuthSuccessBanner) ghAuthSuccessBanner.style.display = 'none';
      }
    } catch (e) {}
  }

  btnGhLogin.addEventListener('click', async () => {
    logOutput(7, 'Launching Google Chrome and GitHub web authentication... Complete login in browser.');
    try {
      const res = await api.startGhLogin();
      if (res.ok) {
        logOutput(7, `GitHub login successful! Welcome, ${res.user || 'user'}.`);
        refreshGhStatus();
      } else {
        logOutput(7, `GitHub login: ${res.error || 'Pending or cancelled.'}`, true);
      }
    } catch (e) {
      logOutput(7, `Error: ${e.message}`, true);
    }
  });

  btnOpenGithubDeviceUrl.addEventListener('click', async () => {
    logOutput(7, 'Opening https://github.com/login/device in Google Chrome...');
    try {
      await api.openUrlInBrowser('https://github.com/login/device');
      logOutput(7, 'Opened GitHub Device Authentication page in Google Chrome!');
    } catch (e) {
      logOutput(7, `Error: ${e.message}`, true);
    }
  });

  btnUploadGithubSsh.addEventListener('click', async () => {
    logOutput(7, 'Uploading SSH public key to GitHub via gh CLI...');
    try {
      const res = await api.addSshKeyToGithub();
      if (res.ok) {
        logOutput(7, res.alreadyAdded ? 'SSH key was already present on your GitHub account.' : 'SSH key uploaded to GitHub successfully!');
      } else {
        logOutput(7, `Error uploading SSH key: ${res.error}`, true);
      }
    } catch (e) {
      logOutput(7, `Error: ${e.message}`, true);
    }
  });

  btnGhTokenLogin.addEventListener('click', async () => {
    const token = ghTokenInput.value;
    if (!token) {
      logOutput(7, 'Please enter a GitHub Personal Access Token', true);
      return;
    }
    logOutput(7, 'Authenticating GitHub CLI with token...');
    try {
      const res = await api.loginGhWithToken(token);
      if (res.ok) {
        logOutput(7, 'Authenticated with GitHub token!');
        refreshGhStatus();
      } else {
        logOutput(7, `Error: ${res.error}`, true);
      }
    } catch (e) {
      logOutput(7, `Error: ${e.message}`, true);
    }
  });

  // ── Step 8: AI Agents (Optional) ──
  async function loadAiAgentConfig() {
    if (!api || !api.getAiAgentConfig) return;
    try {
      const cfg = await api.getAiAgentConfig();
      if (selectDefaultModel && cfg.defaultModel) selectDefaultModel.value = cfg.defaultModel;
      if (cfg.hasApiKey || cfg.defaultModel) {
        const step8NavItem = document.querySelector('.step-nav-item[data-step="8"]');
        if (step8NavItem) step8NavItem.classList.add('completed');
      }
    } catch (e) {}
  }

  document.querySelectorAll('.test-conn-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const agent = btn.dataset.agent;
      logOutput(8, `Testing connection to ${agent}...`);
      try {
        const res = await api.testAgentConnection({ agent });
        logOutput(8, res.detail || (res.ok ? `${agent} connection verified!` : `${agent} connection failed.`), !res.ok);
        if (res.ok) {
          const step8NavItem = document.querySelector('.step-nav-item[data-step="8"]');
          if (step8NavItem) step8NavItem.classList.add('completed');
        }
      } catch (e) {
        logOutput(8, `Error testing ${agent}: ${e.message}`, true);
      }
    });
  });

  if (selectDefaultModel) {
    selectDefaultModel.addEventListener('change', async () => {
      const defaultModel = selectDefaultModel.value;
      try {
        await api.saveAiAgentConfig({ defaultModel });
        logOutput(8, `Saved default AI model: ${defaultModel}`);
        const step8NavItem = document.querySelector('.step-nav-item[data-step="8"]');
        if (step8NavItem) step8NavItem.classList.add('completed');
      } catch (e) {}
    });
  }

  // ── Step 9: Git Projects (Optional) ──
  async function loadGitProjectsList() {
    if (!api || !api.getGitProjectsList) return;
    try {
      const list = await api.getGitProjectsList();
      if (projectsListContainer) {
        projectsListContainer.innerHTML = list.map(p => `
          <div style="padding: 8px 12px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 6px; margin-bottom: 6px; font-size: 13px;">
            📦 <strong>${p.name || p.repo}</strong> <span style="color: var(--text-secondary); font-size: 12px;">(${p.url || ''})</span>
          </div>
        `).join('');
      }
    } catch (e) {}
  }

  // ── Step 10: Software Center / Dev Apps (Optional) ──
  async function loadDevAppsCatalog() {
    if (!api || !api.getDevAppsCatalog) return;
    try {
      const catalog = await api.getDevAppsCatalog();
      if (devAppsGrid) {
        devAppsGrid.innerHTML = catalog.map(app => `
          <div class="checkbox-card">
            <input type="checkbox" id="app-${app.id}" ${app.installed ? 'checked' : ''}>
            <label for="app-${app.id}">
              <strong>${app.name}</strong>
              <div class="checkbox-card-desc">${app.description || ''}</div>
            </label>
          </div>
        `).join('');
      }
    } catch (e) {}
  }

  if (btnAddRepo) {
    btnAddRepo.addEventListener('click', () => {
      const val = inputNewRepo ? inputNewRepo.value : '';
      if (val && projectsListContainer) {
        const div = document.createElement('div');
        div.style.cssText = 'padding: 8px 12px; background: var(--bg-input); border: 1px solid var(--border); border-radius: 6px; margin-bottom: 6px; font-size: 13px;';
        div.innerHTML = `📦 <strong>${val}</strong>`;
        projectsListContainer.appendChild(div);
        if (inputNewRepo) inputNewRepo.value = '';
      }
    });
  }

  // ── Step 11: Complete & Provision ──
  btnFinishOnboarding.addEventListener('click', async () => {
    try {
      await api.completeOnboarding({ finishedAt: new Date().toISOString() });
      await api.closeWindow();
    } catch (e) {}
  });

  btnLaunchDevCentral.addEventListener('click', async () => {
    try {
      await api.completeOnboarding({ finishedAt: new Date().toISOString() });
      await api.launchApp('dev-central');
      await api.closeWindow();
    } catch (e) {}
  });

  // Initial setup: Smart Resumption
  async function initStartup() {
    try {
      if (api && api.getSecurityStatus) {
        const sec = await api.getSecurityStatus();
        const git = api.getGitConfig ? await api.getGitConfig() : null;
        const ssh = api.getSshStatus ? await api.getSshStatus() : null;
        const state = api.getState ? await api.getState() : null;

        if (sec.hasGpgKey || (sec.gpgKeys && sec.gpgKeys.length > 0)) {
          document.querySelector('.step-nav-item[data-step="1"]')?.classList.add('completed');
        }
        if (sec.passInitialized) {
          document.querySelector('.step-nav-item[data-step="2"]')?.classList.add('completed');
        }
        if (sec.pinentryConfigured) {
          document.querySelector('.step-nav-item[data-step="3"]')?.classList.add('completed');
        }
        if (git && git.configured) {
          document.querySelector('.step-nav-item[data-step="4"]')?.classList.add('completed');
        }
        if (ssh && ssh.keyExists) {
          document.querySelector('.step-nav-item[data-step="5"]')?.classList.add('completed');
        }

        let resumeStep = 1;
        if (state && state.lastStep) {
          resumeStep = state.lastStep;
        } else if (sec.hasGpgKey && sec.passInitialized && sec.pinentryConfigured && git?.configured && ssh?.keyExists) {
          resumeStep = 6;
        } else if (sec.hasGpgKey && sec.passInitialized && sec.pinentryConfigured && git?.configured) {
          resumeStep = 5;
        } else if (sec.hasGpgKey && sec.passInitialized && sec.pinentryConfigured) {
          resumeStep = 4;
        } else if (sec.hasGpgKey && sec.passInitialized) {
          resumeStep = 3;
        } else if (sec.hasGpgKey) {
          resumeStep = 2;
        }

        goToStep(resumeStep);
        return;
      }
    } catch (e) {}
    goToStep(1);
  }

  initStartup();
});
