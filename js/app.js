
// ====== THEME ======
function applyTheme() {
  let effective;
  if (currentTheme === 'system') {
    effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } else {
    effective = currentTheme;
  }
  document.documentElement.dataset.theme = effective;
}

function toggleTheme() {
  if (currentTheme === 'system') {
    currentTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'light' : 'dark';
  } else if (currentTheme === 'dark') {
    currentTheme = 'light';
  } else {
    currentTheme = 'dark';
  }
  localStorage.setItem('moni_talk_theme', currentTheme);
  applyTheme();
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (currentTheme === 'system') applyTheme();
});

// ====== INIT ======
function init() {
  PUTER_MODELS.forEach(m => { const o = document.createElement('option'); o.value = m.id; o.textContent = m.label; puterModelSelect.appendChild(o); });
  puterModelSelect.value = puterModel;

  applyTheme();
  renderChatList();
  updateRelDisplay();
  loadProfile();

  relSlider.addEventListener('input', updateRelDisplay);
  $('newChatFab').addEventListener('click', () => { resetNewChatScreen(); showScreen('newChat'); });
  $('landingNewBtn').addEventListener('click', () => { resetNewChatScreen(); showScreen('newChat'); });
  $('startChatBtn').addEventListener('click', createChat);
  $('modeChatBtn').addEventListener('click', () => setNewChatMode('chat'));
  $('modeStoryBtn').addEventListener('click', () => setNewChatMode('story'));
  $('modeAdventureBtn').addEventListener('click', () => setNewChatMode('adventure'));

  // Story option chip selection — select chip and update hint text
  document.querySelectorAll('.story-opt-chips').forEach(group => {
    group.addEventListener('click', e => {
      const chip = e.target.closest('.story-chip');
      if (!chip) return;
      group.querySelectorAll('.story-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      const hint = group.closest('.story-opt-row').querySelector('.story-opt-hint');
      if (hint && chip.dataset.desc) hint.textContent = chip.dataset.desc;
    });
  });
  $('wordSubmitBtn').addEventListener('click', submitPoem);
  $('vnPanelBtn').addEventListener('click', toggleVnPanel);
  $('vnPanelClose').addEventListener('click', closeVnPanel);
  $('vnPanelBackdrop').addEventListener('click', closeVnPanel);
  $('chatPanelBtn').addEventListener('click', toggleChatPanel);
  $('chatPanelClose').addEventListener('click', closeChatPanel);
  $('chatPanelBackdrop').addEventListener('click', closeChatPanel);
  $('advPanelBtn').addEventListener('click', toggleAdventurePanel);
  $('advPanelClose').addEventListener('click', closeAdventurePanel);
  $('adventurePanelBackdrop').addEventListener('click', closeAdventurePanel);
  // Adventure action buttons
  $('adventureActions').addEventListener('click', (e) => {
    const btn = e.target.closest('.adv-action-btn');
    if (btn && btn.dataset.action) handleAdventureAction(btn.dataset.action);
  });
  // Adventure checkpoint save
  $('advSaveBtn').addEventListener('click', () => {
    const chat = getChat();
    if (!chat || chat.mode !== 'adventure') return;
    createAdventureCheckpoint(chat, false);
    updateAdventurePanel();
  });
  // Memory delete delegation
  $('memoryList').addEventListener('click', (e) => {
    const delBtn = e.target.closest('.memory-delete');
    if (!delBtn) return;
    const fact = delBtn.dataset.fact;
    if (!fact) return;
    const idx = memories.findIndex(m => m.fact === fact);
    if (idx !== -1) {
      memories.splice(idx, 1);
      saveMemories(memories);
      const chat = getChat();
      if (chat) updateChatPanel(chat);
      showToast('Memory forgotten.', 'success');
    }
  });
  $('cpSaveBtn').addEventListener('click', () => {
    const chat = getChat();
    if (!chat || chat.mode !== 'story') return;
    createCheckpoint(chat, false);
    renderCheckpointList(chat);
    showToast('Checkpoint saved!', 'success');
  });
  $('journalContinueBtn').addEventListener('click', closeJournal);
  initVnTicks();
  $('profileBtn').addEventListener('click', () => { loadProfile(); showScreen('profile'); });
  $('saveProfileBtn').addEventListener('click', saveProfile);
  $('addSpecialDateBtn').addEventListener('click', addSpecialDate);
  // Special date delete delegation
  $('specialDatesList').addEventListener('click', (e) => {
    const delBtn = e.target.closest('.special-date-delete');
    if (!delBtn) return;
    const id = delBtn.dataset.id;
    if (id) deleteSpecialDate(id);
  });
  // Profile memory delete delegation
  $('profileMemoryList').addEventListener('click', (e) => {
    const delBtn = e.target.closest('.memory-delete');
    if (!delBtn) return;
    const fact = delBtn.dataset.fact;
    if (!fact) return;
    const idx = memories.findIndex(m => m.fact === fact);
    if (idx !== -1) {
      memories.splice(idx, 1);
      saveMemories(memories);
      renderProfileMemories();
      showToast('Memory forgotten.', 'success');
    }
  });
  $('topbarBackBtn').addEventListener('click', () => {
    if (screens.chat.classList.contains('active')) {
      if (typeof stopTTS === 'function') stopTTS();
      if (typeof hideMicButton === 'function') hideMicButton();
      activeChatId = null;
      screens.chat.classList.remove('vn-mode', 'room-mode', 'adventure-mode');
      teardownRoomMode();
      closeVnPanel(); closeChatPanel(); closeAdventurePanel();
      const advAct = $('adventureActions');
      if (advAct) advAct.style.display = 'none';
      const picker = document.querySelector('.adv-item-picker');
      if (picker) picker.remove();
      renderChatList();
    }
    showScreen('landing');
  });
  $('trimBtn').addEventListener('click', trimContext);
  $('regenBtn').addEventListener('click', regenerateLastResponse);
  $('cancelBtn').addEventListener('click', () => { if (activeAbortController) activeAbortController.abort(); });
  $('storyRetryBtn').addEventListener('click', forceStoryRetry);

  userInput.addEventListener('input', () => { userInput.style.height = 'auto'; userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px'; });
  userInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
  sendBtn.addEventListener('click', sendMessage);

  // Image attach
  const imageAttachBtn = $('imageAttachBtn');
  const imageFileInput = $('imageFileInput');
  if (imageAttachBtn && imageFileInput) {
    imageAttachBtn.addEventListener('click', () => imageFileInput.click());
    imageFileInput.addEventListener('change', (e) => {
      if (e.target.files[0]) handleImageAttach(e.target.files[0]);
      e.target.value = '';
    });
  }

  // Paste image from clipboard
  document.addEventListener('paste', (e) => {
    if (!screens.chat.classList.contains('active')) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        handleImageAttach(item.getAsFile());
        return;
      }
    }
  });

  // Drag & drop image onto chat area
  chatArea.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault();
      chatArea.classList.add('drag-over');
    }
  });
  chatArea.addEventListener('dragleave', (e) => {
    if (!chatArea.contains(e.relatedTarget)) chatArea.classList.remove('drag-over');
  });
  chatArea.addEventListener('drop', (e) => {
    e.preventDefault();
    chatArea.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) handleImageAttach(file);
  });

  // Copy message text delegation
  chatArea.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('.msg-copy-btn');
    if (copyBtn) {
      const msgEl = copyBtn.closest('.message');
      if (!msgEl) return;
      const text = msgEl.dataset.text || msgEl.querySelector('.msg-bubble')?.textContent || '';
      navigator.clipboard.writeText(text).then(() => showToast('Copied!', 'success')).catch(() => showToast('Copy failed.'));
      return;
    }
    // Edit message delegation
    const editBtn = e.target.closest('.msg-edit-btn');
    if (editBtn) {
      const msgEl = editBtn.closest('.message');
      if (msgEl) startEditMessage(msgEl);
      return;
    }
  });

  $('globalSettingsBtn').addEventListener('click', () => { openSettings(); renderSettingsBenchHint(); });
  $('chatSettingsBtn').addEventListener('click', () => { openSettings(); renderSettingsBenchHint(); });
  $('saveKeyBtn').addEventListener('click', saveSettings);
  $('cancelSettingsBtn').addEventListener('click', closeSettings);
  $('clearKeyBtn').addEventListener('click', clearKey);
  // Settings sidebar tab navigation
  document.querySelectorAll('.settings-nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchSettingsTab(btn.dataset.tab));
  });
  providerSelect.addEventListener('change', () => { toggleProviderFields(providerSelect.value); setTimeout(renderSettingsBenchHint, 100); });
  // Update bench hint when model selects change
  [puterModelSelect, ollamaModelSelect, llamacppModelSelect].forEach(sel => {
    sel.addEventListener('change', () => setTimeout(renderSettingsBenchHint, 50));
  });
  // Update model card when llama.cpp model changes
  llamacppModelSelect.addEventListener('change', () => updateLlamaCppModelCard(llamacppModelSelect.value));
  // Re-fetch llama.cpp models when endpoint is changed and user tabs/clicks away
  llamacppEndpointInput.addEventListener('change', () => {
    llamacppEndpoint = llamacppEndpointInput.value.trim().replace(/\/+$/, '') || 'http://localhost:8080';
    refreshLlamaCppModels();
  });
  // Show model info when Ollama model changes
  ollamaModelSelect.addEventListener('change', () => {
    if (typeof updateOllamaModelInfo === 'function') updateOllamaModelInfo(ollamaModelSelect.value);
  });
  settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) closeSettings(); });

  // Theme (toggle button removed — use Settings → Appearance)
  const themeSelect = $('themeSelect');
  if (themeSelect) {
    themeSelect.value = currentTheme;
    themeSelect.addEventListener('change', () => {
      currentTheme = themeSelect.value;
      localStorage.setItem('moni_talk_theme', currentTheme);
      applyTheme();
    });
  }

  // TTS toggle button — mute/unmute (not full disable)
  $('ttsToggleBtn').addEventListener('click', () => {
    if (ttsPlaying) { stopTTS(); return; }
    // Toggle muted state — keep ttsEnabled true but skip playback when muted
    ttsMuted = !ttsMuted;
    localStorage.setItem('moni_talk_tts_muted', ttsMuted);
    updateTTSIcon();
    showToast(ttsMuted ? 'Voice muted' : 'Voice unmuted', 'success');
  });
  // TTS provider select — toggle fields
  $('ttsProviderSelect').addEventListener('change', (e) => {
    toggleTTSProviderFields(e.target.value);
  });
  // TTS test connection
  $('ttsTestBtn').addEventListener('click', () => {
    const provSel = $('ttsProviderSelect');
    const selectedProv = provSel ? provSel.value : ttsProvider;
    if (selectedProv === 'qwen3') {
      const qwenInput = $('ttsQwenEndpointInput');
      if (qwenInput) ttsEndpointQwen = qwenInput.value.trim().replace(/\/+$/, '') || 'http://spark-0af9:8880';
    } else {
      const input = $('ttsEndpointInput');
      if (input) ttsEndpoint = input.value.trim().replace(/\/+$/, '') || 'http://spark-0af9:5005';
    }
    // Temporarily apply selected provider for the test
    const prevProv = ttsProvider;
    ttsProvider = selectedProv;
    testTTSConnection().finally(() => { ttsProvider = prevProv; });
  });
  // TTS voice select — update description on change
  $('ttsVoiceSelect').addEventListener('change', (e) => {
    updateTTSVoiceDesc(e.target.value);
  });
  // TTS voice preview
  $('ttsPreviewBtn').addEventListener('click', () => {
    const sel = $('ttsVoiceSelect');
    if (!sel) return;
    const provSel = $('ttsProviderSelect');
    const selectedProv = provSel ? provSel.value : ttsProvider;
    // Apply selected provider/endpoint temporarily for preview
    const prevProv = ttsProvider;
    ttsProvider = selectedProv;
    if (selectedProv === 'qwen3') {
      const qwenInput = $('ttsQwenEndpointInput');
      if (qwenInput) ttsEndpointQwen = qwenInput.value.trim().replace(/\/+$/, '') || 'http://spark-0af9:8880';
    } else {
      const input = $('ttsEndpointInput');
      if (input) ttsEndpoint = input.value.trim().replace(/\/+$/, '') || 'http://spark-0af9:5005';
    }
    previewVoice(sel.value).finally(() => { ttsProvider = prevProv; });
  });
  updateTTSIcon();

  // STT (voice input)
  if (typeof initSTT === 'function') initSTT();
  $('micBtn').addEventListener('click', toggleSTT);

  // Free GPU memory (llama.cpp)
  $('llamaFreeMemBtn').addEventListener('click', () => {
    navigator.clipboard.writeText('pkill -f llama-server').then(() => {
      showToast('Copied! Paste in your Spark terminal to stop llama-server.', 'success');
    }).catch(() => {
      showToast('pkill -f llama-server — run this in your Spark terminal.', '');
    });
  });

  // Models
  $('modelsBtn').addEventListener('click', openModelsModal);
  $('modelsCloseBtn').addEventListener('click', closeModelsModal);
  $('modelsModal').addEventListener('click', (e) => { if (e.target === $('modelsModal')) closeModelsModal(); });

  // About
  $('aboutBtn').addEventListener('click', () => $('aboutModal').classList.add('open'));
  $('aboutCloseBtn').addEventListener('click', () => $('aboutModal').classList.remove('open'));
  $('aboutModal').addEventListener('click', (e) => { if (e.target === $('aboutModal')) $('aboutModal').classList.remove('open'); });

  // Changelog
  $('changelogBtn').addEventListener('click', openChangelogModal);
  $('changelogCloseBtn').addEventListener('click', closeChangelogModal);
  $('changelogModal').addEventListener('click', (e) => { if (e.target === $('changelogModal')) closeChangelogModal(); });

  // Benchmark
  $('openBenchmarkBtn').addEventListener('click', () => { closeSettings(); openBenchmarkModal(); });
  $('benchCloseBtn').addEventListener('click', closeBenchmarkModal);
  $('benchmarkModal').addEventListener('click', (e) => { if (e.target === $('benchmarkModal')) closeBenchmarkModal(); });
  $('benchTabRun').addEventListener('click', () => switchBenchTab('run'));
  $('benchTabResults').addEventListener('click', () => switchBenchTab('results'));
  $('benchTabCompare').addEventListener('click', () => switchBenchTab('compare'));
  // benchRunBtn is wired dynamically in renderBenchRunTab (re-wired on each render)
  $('benchCancelBtn').addEventListener('click', cancelBenchmark);

  // Sync
  $('signInBtn').addEventListener('click', handleSignIn);
  $('signOutBtn').addEventListener('click', handleSignOut);
  $('syncNowBtn').addEventListener('click', () => { fullSync(); });
  initSync();
  initModelSwitcher();
}

// ====== MODEL SWITCHER ======
function initModelSwitcher() {
  const dropdown = $('modelSwitcherDropdown');
  const btn = $('modelSwitcherBtn');
  const wrap = $('modelSwitcherWrap');
  if (!dropdown || !btn || !wrap) return;

  dropdown.innerHTML = '';

  const cloudLabel = document.createElement('div');
  cloudLabel.className = 'model-switcher-group-label';
  cloudLabel.textContent = 'Cloud Models';
  dropdown.appendChild(cloudLabel);

  PUTER_MODELS.forEach(m => {
    const opt = document.createElement('button');
    opt.className = 'model-switcher-option';
    opt.dataset.provider = 'puter';
    opt.dataset.model = m.id;
    opt.textContent = m.label;
    if (provider === 'puter' && puterModel === m.id) opt.classList.add('active');
    opt.addEventListener('click', () => {
      provider = 'puter';
      puterModel = m.id;
      localStorage.setItem(STORAGE.PROVIDER, provider);
      localStorage.setItem(STORAGE.MODEL_PUTER, puterModel);
      updateModelSwitcherLabel();
      dropdown.querySelectorAll('.model-switcher-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      wrap.classList.remove('open');
    });
    dropdown.appendChild(opt);
  });

  const sep = document.createElement('div');
  sep.className = 'model-switcher-sep';
  dropdown.appendChild(sep);

  const localLabel = document.createElement('div');
  localLabel.className = 'model-switcher-group-label';
  localLabel.textContent = 'Local Models';
  dropdown.appendChild(localLabel);

  // Static Ollama fallback
  const ollamaOpt = document.createElement('button');
  ollamaOpt.className = 'model-switcher-option';
  ollamaOpt.dataset.provider = 'ollama';
  ollamaOpt.textContent = 'Ollama (local)';
  if (provider === 'ollama') ollamaOpt.classList.add('active');
  ollamaOpt.addEventListener('click', () => {
    provider = 'ollama';
    localStorage.setItem(STORAGE.PROVIDER, provider);
    updateModelSwitcherLabel();
    dropdown.querySelectorAll('.model-switcher-option').forEach(o => o.classList.remove('active'));
    ollamaOpt.classList.add('active');
    wrap.classList.remove('open');
  });
  dropdown.appendChild(ollamaOpt);

  // llama.cpp — populate dynamically from server, fall back to generic
  const lcppPlaceholder = document.createElement('button');
  lcppPlaceholder.className = 'model-switcher-option';
  lcppPlaceholder.textContent = 'llama.cpp (local)';
  lcppPlaceholder.disabled = true;
  lcppPlaceholder.style.opacity = '0.5';
  dropdown.appendChild(lcppPlaceholder);

  fetchLlamaCppModels().then(models => {
    lcppPlaceholder.remove();
    if (models.length === 0) {
      const fallback = document.createElement('button');
      fallback.className = 'model-switcher-option';
      fallback.dataset.provider = 'llamacpp';
      fallback.textContent = 'llama.cpp (local)';
      if (provider === 'llamacpp') fallback.classList.add('active');
      fallback.addEventListener('click', () => {
        provider = 'llamacpp'; llamacppModel = '';
        localStorage.setItem(STORAGE.PROVIDER, provider);
        localStorage.setItem(STORAGE.LLAMACPP_MODEL, '');
        updateModelSwitcherLabel();
        dropdown.querySelectorAll('.model-switcher-option').forEach(o => o.classList.remove('active'));
        fallback.classList.add('active');
        wrap.classList.remove('open');
      });
      dropdown.appendChild(fallback);
    } else {
      models.forEach(id => {
        const opt = document.createElement('button');
        opt.className = 'model-switcher-option';
        opt.dataset.provider = 'llamacpp';
        opt.dataset.model = id;
        opt.textContent = id.replace(/-Q\d+[^.]*\.gguf$/i, '').replace(/-/g, ' ');
        if (provider === 'llamacpp' && llamacppModel === id) opt.classList.add('active');
        opt.addEventListener('click', () => {
          provider = 'llamacpp'; llamacppModel = id;
          localStorage.setItem(STORAGE.PROVIDER, provider);
          localStorage.setItem(STORAGE.LLAMACPP_MODEL, id);
          updateModelSwitcherLabel();
          dropdown.querySelectorAll('.model-switcher-option').forEach(o => o.classList.remove('active'));
          opt.classList.add('active');
          wrap.classList.remove('open');
        });
        dropdown.appendChild(opt);
      });
      // Auto-select first local model if currently on llamacpp with no model set
      if (provider === 'llamacpp' && !llamacppModel) {
        llamacppModel = models[0];
        localStorage.setItem(STORAGE.LLAMACPP_MODEL, models[0]);
        dropdown.querySelector('[data-provider="llamacpp"]').classList.add('active');
        updateModelSwitcherLabel();
      }
    }
  });

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    wrap.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) wrap.classList.remove('open');
  });

  updateModelSwitcherLabel();
}

function updateModelSwitcherLabel() {
  const label = $('modelSwitcherLabel');
  if (!label) return;
  if (provider === 'puter') {
    const m = PUTER_MODELS.find(m => m.id === puterModel);
    label.textContent = m ? m.label : puterModel;
  } else if (provider === 'ollama') {
    label.textContent = `Ollama · ${ollamaModel || 'local'}`;
  } else if (provider === 'llamacpp') {
    const shortName = llamacppModel
      ? llamacppModel.replace(/-Q\d+[^.]*\.gguf$/i, '').replace(/-/g, ' ')
      : 'local';
    label.textContent = `llama.cpp · ${shortName}`;
  }
}

init();