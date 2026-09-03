(function () {
  'use strict';

  let currentConfigName = '';
  let currentEtag = '';
  let currentDoc = null;
  let isDirty = false;
  let activeRunId = null;
  let pollIntervalId = null;

  const csrfToken = document.querySelector('meta[name=\"csrf-token\"]')?.getAttribute('content') || '';

  const configSelect = document.getElementById('config-select');
  const btnReload = document.getElementById('btn-reload');
  const btnSave = document.getElementById('btn-save');
  const statusBanner = document.getElementById('status-banner');
  const projectsList = document.getElementById('projects-list');
  const rawJsonTextarea = document.getElementById('raw-json-textarea');
  const btnApplyJson = document.getElementById('btn-apply-json');
  const jsonValidationMsg = document.getElementById('json-validation-msg');
  const btnRunReports = document.getElementById('btn-run-reports');

  const runStatusBadge = document.getElementById('run-status-badge');
  const runIdDisplay = document.getElementById('run-id-display');
  const runResultBox = document.getElementById('run-result-box');
  const runLogs = document.getElementById('run-logs');

  const confirmDialog = document.getElementById('build-confirm-dialog');
  const confirmProjectId = document.getElementById('confirm-project-id');
  const confirmProjectName = document.getElementById('confirm-project-name');
  const confirmJobUrl = document.getElementById('confirm-job-url');
  const btnCancelBuild = document.getElementById('btn-cancel-build');
  const btnConfirmBuild = document.getElementById('btn-confirm-build');
  let pendingBuildProjectId = null;

  const credentialsDialog = document.getElementById('credentials-dialog');
  const credentialsFormRows = document.getElementById('credentials-form-rows');
  const credentialsLoading = document.getElementById('credentials-loading');
  const credentialsMessage = document.getElementById('credentials-message');
  const btnCredentials = document.getElementById('btn-credentials');
  const btnCancelCredentials = document.getElementById('btn-cancel-credentials');
  const btnSaveCredentials = document.getElementById('btn-save-credentials');

  function showBanner(type, message) {
    statusBanner.className = 'status-banner ' + type;
    statusBanner.textContent = message;
    statusBanner.classList.remove('hidden');
  }

  function hideBanner() {
    statusBanner.classList.add('hidden');
    statusBanner.textContent = '';
  }

  function setDirty(dirty) {
    isDirty = dirty;
    btnSave.disabled = !dirty;
    btnRunReports.disabled = dirty;
    document.querySelectorAll('.btn-auto-build').forEach((btn) => {
      btn.disabled = dirty;
    });
  }

  async function apiFetch(url, options = {}) {
    const headers = new Headers(options.headers || {});
    if (csrfToken && (options.method === 'POST' || options.method === 'PUT' || options.method === 'DELETE')) {
      headers.set('x-csrf-token', csrfToken);
    }
    const resp = await fetch(url, { ...options, headers });
    return resp;
  }

  async function loadConfigList() {
    try {
      const resp = await apiFetch('/api/configs');
      if (!resp.ok) throw new Error('Failed to load configs list');
      const data = await resp.json();
      configSelect.replaceChildren();
      for (const item of data.configs || []) {
        const opt = document.createElement('option');
        opt.value = item.name;
        opt.textContent = item.name;
        configSelect.appendChild(opt);
      }
      if (configSelect.options.length > 0) {
        currentConfigName = configSelect.value;
        await loadConfig(currentConfigName);
      }
    } catch (err) {
      showBanner('error', 'Error loading configs: ' + err.message);
    }
  }

  async function loadConfig(name) {
    hideBanner();
    try {
      const resp = await apiFetch('/api/config?name=' + encodeURIComponent(name));
      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        throw new Error(errJson.error?.message || 'HTTP ' + resp.status);
      }
      const data = await resp.json();
      currentConfigName = data.name;
      currentEtag = data.etag;
      currentDoc = data.document;
      setDirty(false);
      renderUI();
    } catch (err) {
      showBanner('error', 'Failed to load config: ' + err.message);
    }
  }

  function renderUI() {
    if (!currentDoc) return;
    rawJsonTextarea.value = JSON.stringify(currentDoc, null, 2);
    jsonValidationMsg.textContent = '';
    projectsList.replaceChildren();

    (currentDoc.projects || []).forEach((project, idx) => {
      const card = document.createElement('div');
      card.className = 'project-card';

      const header = document.createElement('div');
      header.className = 'project-card-header';
      const title = document.createElement('h3');
      title.textContent = project.name || project.id;
      header.appendChild(title);
      card.appendChild(header);

      const fields = document.createElement('div');
      fields.className = 'project-card-fields';

      // ID
      const idRow = document.createElement('div');
      idRow.className = 'field-row';
      const idLabel = document.createElement('span');
      idLabel.textContent = 'ID:';
      const idVal = document.createElement('span');
      idVal.className = 'mono';
      idVal.textContent = project.id;
      idRow.appendChild(idLabel);
      idRow.appendChild(idVal);
      fields.appendChild(idRow);

      // Enabled
      const enabledRow = document.createElement('div');
      enabledRow.className = 'field-row';
      const enabledLabel = document.createElement('label');
      enabledLabel.textContent = 'Enabled:';
      const enabledInput = document.createElement('input');
      enabledInput.type = 'checkbox';
      enabledInput.checked = project.enabled !== false;
      enabledInput.addEventListener('change', () => {
        project.enabled = enabledInput.checked;
        rawJsonTextarea.value = JSON.stringify(currentDoc, null, 2);
        setDirty(true);
      });
      enabledLabel.appendChild(enabledInput);
      enabledRow.appendChild(enabledLabel);
      fields.appendChild(enabledRow);

      // RunType
      const runTypeRow = document.createElement('div');
      runTypeRow.className = 'field-row';
      const runTypeLabel = document.createElement('label');
      runTypeLabel.textContent = 'Run Type:';
      const runTypeSelect = document.createElement('select');
      ['report', 'auto-build'].forEach((mode) => {
        const opt = document.createElement('option');
        opt.value = mode;
        opt.textContent = mode;
        if ((project.runType || 'report') === mode) opt.selected = true;
        runTypeSelect.appendChild(opt);
      });
      runTypeSelect.addEventListener('change', () => {
        project.runType = runTypeSelect.value;
        rawJsonTextarea.value = JSON.stringify(currentDoc, null, 2);
        setDirty(true);
        renderUI();
      });
      runTypeLabel.appendChild(runTypeSelect);
      runTypeRow.appendChild(runTypeLabel);
      fields.appendChild(runTypeRow);

      // Job URL
      const jobRow = document.createElement('div');
      jobRow.className = 'field-row';
      const jobLabel = document.createElement('span');
      jobLabel.textContent = 'Job URL:';
      const jobVal = document.createElement('span');
      jobVal.className = 'mono';
      jobVal.textContent = project.jobUrl || 'N/A';
      jobRow.appendChild(jobLabel);
      jobRow.appendChild(jobVal);
      fields.appendChild(jobRow);

      // Auto-build button if applicable
      if (project.runType === 'auto-build') {
        const actionRow = document.createElement('div');
        actionRow.className = 'field-row';
        const buildBtn = document.createElement('button');
        buildBtn.type = 'button';
        buildBtn.className = 'btn btn-danger btn-auto-build';
        buildBtn.textContent = 'Trigger Auto-Build';
        buildBtn.disabled = !project.enabled || isDirty;
        buildBtn.addEventListener('click', () => {
          openConfirmDialog(project);
        });
        actionRow.appendChild(buildBtn);
        fields.appendChild(actionRow);
      }

      card.appendChild(fields);
      projectsList.appendChild(card);
    });
  }

  function openConfirmDialog(project) {
    pendingBuildProjectId = project.id;
    confirmProjectId.textContent = project.id;
    confirmProjectName.textContent = project.name || project.id;
    confirmJobUrl.textContent = project.jobUrl;
    confirmDialog.showModal();
  }

  btnCancelBuild.addEventListener('click', () => {
    confirmDialog.close();
    pendingBuildProjectId = null;
  });

  btnConfirmBuild.addEventListener('click', async () => {
    confirmDialog.close();
    if (!pendingBuildProjectId) return;
    const projId = pendingBuildProjectId;
    pendingBuildProjectId = null;
    await triggerRun('auto-build', projId);
  });

  btnApplyJson.addEventListener('click', () => {
    try {
      const parsed = JSON.parse(rawJsonTextarea.value);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('Config must be a JSON object');
      }
      currentDoc = parsed;
      jsonValidationMsg.className = 'validation-msg valid';
      jsonValidationMsg.textContent = 'JSON valid and applied to model.';
      setDirty(true);
      renderUI();
    } catch (err) {
      jsonValidationMsg.className = 'validation-msg invalid';
      jsonValidationMsg.textContent = 'Invalid JSON: ' + err.message;
    }
  });

  btnSave.addEventListener('click', async () => {
    hideBanner();
    try {
      const resp = await apiFetch('/api/config?name=' + encodeURIComponent(currentConfigName), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'If-Match': currentEtag,
        },
        body: JSON.stringify(currentDoc),
      });
      if (resp.status === 409 || resp.status === 412) {
        showBanner('error', 'Conflict: Config was modified elsewhere. Please reload.');
        return;
      }
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || 'HTTP ' + resp.status);
      }
      const data = await resp.json();
      currentEtag = data.etag;
      currentDoc = data.document;
      setDirty(false);
      renderUI();
      showBanner('success', 'Configuration saved successfully.');
    } catch (err) {
      showBanner('error', 'Save failed: ' + err.message);
    }
  });

  btnReload.addEventListener('click', () => {
    if (currentConfigName) loadConfig(currentConfigName);
  });

  configSelect.addEventListener('change', () => {
    currentConfigName = configSelect.value;
    loadConfig(currentConfigName);
  });

  async function triggerRun(runType, projectId) {
    hideBanner();
    try {
      const resp = await apiFetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configName: currentConfigName,
          configEtag: currentEtag,
          runType: runType,
          ...(projectId ? { projectId } : {}),
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || 'HTTP ' + resp.status);
      }
      const runData = await resp.json();
      activeRunId = runData.id;
      startPollingRun(activeRunId);
    } catch (err) {
      showBanner('error', 'Failed to start run: ' + err.message);
    }
  }

  btnRunReports.addEventListener('click', () => {
    triggerRun('report');
  });

  function startPollingRun(runId) {
    if (pollIntervalId) clearInterval(pollIntervalId);
    pollRun(runId);
    pollIntervalId = setInterval(() => pollRun(runId), 1000);
  }

  async function pollRun(runId) {
    try {
      const resp = await apiFetch('/api/run?id=' + encodeURIComponent(runId));
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const data = await resp.json();
      const run = data.run;
      renderRunState(run);
      if (run.status === 'succeeded' || run.status === 'failed' || run.status === 'submission-unknown') {
        clearInterval(pollIntervalId);
        pollIntervalId = null;
      }
    } catch (err) {
      clearInterval(pollIntervalId);
      pollIntervalId = null;
    }
  }

  function renderRunState(run) {
    runIdDisplay.textContent = 'ID: ' + run.id;
    runStatusBadge.textContent = run.status;
    runStatusBadge.className = 'badge badge-' + (run.status === 'submission-unknown' ? 'unknown' : run.status);

    runLogs.replaceChildren();
    if (run.logs && run.logs.length > 0) {
      runLogs.textContent = run.logs.map((l) => '[' + l.timestamp.slice(11, 19) + '] ' + l.message).join('\n');
    } else {
      runLogs.textContent = 'Running...';
    }

    runResultBox.replaceChildren();
    if (run.result) {
      runResultBox.classList.remove('hidden');
      if (run.result.reportUrl) {
        const link = document.createElement('a');
        link.href = run.result.reportUrl;
        link.textContent = 'Open Generated Report';
        link.className = 'btn btn-primary';
        link.target = '_blank';
        link.rel = 'noopener';
        runResultBox.appendChild(link);
      }
      if (run.result.error) {
        const errP = document.createElement('p');
        errP.style.color = 'var(--status-error)';
        errP.textContent = 'Error: ' + run.result.error;
        runResultBox.appendChild(errP);
      }
    } else {
      runResultBox.classList.add('hidden');
    }
  }


  function showCredentialsMessage(type, message) {
    credentialsMessage.className = 'status-banner ' + type;
    credentialsMessage.textContent = message;
    credentialsMessage.classList.remove('hidden');
  }

  function hideCredentialsMessage() {
    credentialsMessage.className = 'status-banner hidden';
    credentialsMessage.textContent = '';
  }

  function discoverRequiredCredentialKeys(doc) {
    if (!doc || !Array.isArray(doc.projects) || doc.projects.length === 0) {
      return [];
    }

    const defaultCreds = doc.defaults?.credentials || doc.defaults?.credentialVariables;
    const defaultUser = (typeof defaultCreds === 'object' && defaultCreds !== null && typeof defaultCreds.usernameVariable === 'string' && defaultCreds.usernameVariable.trim()) || 'JENKINS_USERNAME';
    const defaultPass = (typeof defaultCreds === 'object' && defaultCreds !== null && typeof defaultCreds.passwordVariable === 'string' && defaultCreds.passwordVariable.trim()) || 'JENKINS_PASSWORD';

    const keys = new Set();

    for (const p of doc.projects) {
      if (!p || typeof p !== 'object') continue;

      if (Array.isArray(p.credentialVariables)) {
        for (const k of p.credentialVariables) {
          if (typeof k === 'string' && k.trim().length > 0) {
            keys.add(k.trim());
          }
        }
      } else {
        const userVar = (typeof p.credentialVariables?.usernameVariable === 'string' && p.credentialVariables.usernameVariable.trim()) ||
                        (typeof p.credentials?.usernameVariable === 'string' && p.credentials.usernameVariable.trim()) ||
                        defaultUser;

        const passVar = (typeof p.credentialVariables?.passwordVariable === 'string' && p.credentialVariables.passwordVariable.trim()) ||
                        (typeof p.credentials?.passwordVariable === 'string' && p.credentials.passwordVariable.trim()) ||
                        defaultPass;

        if (userVar && userVar.length > 0) keys.add(userVar);
        if (passVar && passVar.length > 0) keys.add(passVar);
      }
    }

    return Array.from(keys).sort();
  }

  function createClearButton(key, badge, input) {
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'btn btn-secondary btn-sm btn-clear-credential';
    clearBtn.dataset.key = key;
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', async () => {
      hideCredentialsMessage();
      clearBtn.disabled = true;
      try {
        const resp = await apiFetch('/api/secrets?name=' + encodeURIComponent(key), { method: 'DELETE' });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error?.message || 'HTTP ' + resp.status);
        }
        badge.className = 'badge badge-missing';
        badge.textContent = 'Missing';
        input.value = '';
        clearBtn.remove();
        showCredentialsMessage('success', key + ' cleared.');
      } catch (err) {
        clearBtn.disabled = false;
        showCredentialsMessage('error', 'Failed to clear ' + key + ': ' + err.message);
      }
    });
    return clearBtn;
  }

  function renderCredentialRows(keys, presenceMap) {
    credentialsFormRows.replaceChildren();

    for (const key of keys) {
      const isConfigured = Boolean(presenceMap[key]);

      const row = document.createElement('div');
      row.className = 'credential-row';

      const field = document.createElement('div');
      field.className = 'credential-field';

      const label = document.createElement('label');
      label.htmlFor = 'secret-input-' + key;
      label.textContent = key;
      field.appendChild(label);

      const badges = document.createElement('div');
      badges.className = 'credential-badges';
      const badge = document.createElement('span');
      badge.className = 'badge ' + (isConfigured ? 'badge-configured' : 'badge-missing');
      badge.textContent = isConfigured ? 'Configured' : 'Missing';
      badges.appendChild(badge);
      field.appendChild(badges);
      row.appendChild(field);

      const inputGroup = document.createElement('div');
      inputGroup.className = 'credential-input-group';

      const input = document.createElement('input');
      input.type = 'password';
      input.id = 'secret-input-' + key;
      input.name = key;
      input.className = 'credential-input';
      input.autocomplete = 'new-password';
      input.placeholder = '•••••••• (leave blank to keep)';
      input.spellcheck = false;
      inputGroup.appendChild(input);

      if (isConfigured) {
        const clearBtn = createClearButton(key, badge, input);
        inputGroup.appendChild(clearBtn);
      }

      row.appendChild(inputGroup);
      credentialsFormRows.appendChild(row);
    }
  }

  async function openCredentialsDialog() {
    hideCredentialsMessage();
    credentialsDialog.showModal();

    const keys = discoverRequiredCredentialKeys(currentDoc);
    if (keys.length === 0) {
      credentialsLoading.classList.add('hidden');
      credentialsFormRows.replaceChildren();
      const p = document.createElement('p');
      p.className = 'empty-msg';
      p.textContent = 'No credential variables required for the current configuration.';
      credentialsFormRows.appendChild(p);
      return;
    }

    credentialsLoading.classList.remove('hidden');
    credentialsFormRows.replaceChildren();

    try {
      const resp = await apiFetch('/api/secrets?keys=' + encodeURIComponent(keys.join(',')));
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || 'HTTP ' + resp.status);
      }
      const data = await resp.json();
      const presenceMap = data.secrets || {};
      renderCredentialRows(keys, presenceMap);
    } catch (err) {
      showCredentialsMessage('error', 'Failed to load credentials: ' + err.message);
    } finally {
      credentialsLoading.classList.add('hidden');
    }
  }

  btnCredentials.addEventListener('click', () => {
    openCredentialsDialog();
  });

  btnCancelCredentials.addEventListener('click', () => {
    credentialsDialog.close();
  });

  credentialsDialog.addEventListener('close', () => {
    credentialsFormRows.querySelectorAll('.credential-input').forEach((input) => {
      input.value = '';
    });
    hideCredentialsMessage();
  });

  btnSaveCredentials.addEventListener('click', async () => {
    hideCredentialsMessage();
    const inputs = credentialsFormRows.querySelectorAll('.credential-input');
    const secrets = {};
    inputs.forEach((input) => {
      const val = input.value.trim();
      if (val.length > 0) {
        secrets[input.name] = val;
      }
    });

    const changedKeys = Object.keys(secrets);
    if (changedKeys.length === 0) {
      showCredentialsMessage('info', 'No changes entered.');
      return;
    }

    btnSaveCredentials.disabled = true;
    try {
      const resp = await apiFetch('/api/secrets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secrets }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || 'HTTP ' + resp.status);
      }
      for (const key of changedKeys) {
        const input = document.getElementById('secret-input-' + key);
        if (input) {
          input.value = '';
          const row = input.closest('.credential-row');
          if (row) {
            const badge = row.querySelector('.badge');
            if (badge) {
              badge.className = 'badge badge-configured';
              badge.textContent = 'Configured';
            }
            let clearBtn = row.querySelector('.btn-clear-credential');
            if (!clearBtn && badge) {
              clearBtn = createClearButton(key, badge, input);
              const inputGroup = row.querySelector('.credential-input-group') || row;
              inputGroup.appendChild(clearBtn);
            }
          }
        }
      }
      showBanner('success', 'Credentials saved successfully.');
      showCredentialsMessage('success', 'Credentials saved successfully.');
    } catch (err) {
      showCredentialsMessage('error', 'Failed to save credentials: ' + err.message);
    } finally {
      btnSaveCredentials.disabled = false;
    }
  });
  loadConfigList();
})();
