
// ====== ACCENT ======
function applyAccent() {
  document.documentElement.dataset.accent = currentAccent;
}

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
  applyAccent();
  renderChatList();
  updateRelDisplay();
  loadProfile();

  relSlider.addEventListener('input', updateRelDisplay);
  $('newChatFab').addEventListener('click', () => { resetNewChatScreen(); showScreen('newChat'); });
  $('landingNewBtn').addEventListener('click', () => { resetNewChatScreen(); showScreen('newChat'); });
  $('topbarNewChatBtn').addEventListener('click', () => { resetNewChatScreen(); showScreen('newChat'); });
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
    if (deleteMemory(delBtn.dataset.id)) {
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
    if (deleteMemory(delBtn.dataset.id)) {
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
      $('topbarNewChatBtn').style.display = 'none';
    }
    showScreen('landing');
  });
  $('trimBtn').addEventListener('click', trimContext);
  $('ctxInfoBtn').addEventListener('click', openContextInspector);
  $('ctxInspectorClose').addEventListener('click', () => { $('ctxInspectorOverlay').style.display = 'none'; });
  $('ctxInspectorOverlay').addEventListener('click', e => { if (e.target === $('ctxInspectorOverlay')) $('ctxInspectorOverlay').style.display = 'none'; });
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

  const accentSelect = $('accentSelect');
  if (accentSelect) {
    accentSelect.value = currentAccent;
    accentSelect.addEventListener('change', () => {
      currentAccent = accentSelect.value;
      localStorage.setItem('moni_accent', currentAccent);
      applyAccent();
    });
  }

  // Cursor effects — Color
  const effectsColorSel = $('effectsColorSelect');
  if (effectsColorSel) {
    effectsColorSel.value = localStorage.getItem('moni_effects_color') || 'pink';
    effectsColorSel.addEventListener('change', () => {
      localStorage.setItem('moni_effects_color', effectsColorSel.value);
      window.updateEffectsSettings?.({ color: effectsColorSel.value });
    });
  }

  // Cursor effects — Click effect + conditional sub-settings visibility
  const effectsClickSel = $('effectsClickSelect');
  function syncClickSubSettings(val) {
    const hg = $('effectsHeartsGroup');
    const lg = $('effectsLightningGroup');
    if (hg) hg.style.display = val === 'hearts'    ? '' : 'none';
    if (lg) lg.style.display = val === 'lightning' ? '' : 'none';
  }
  if (effectsClickSel) {
    effectsClickSel.value = localStorage.getItem('moni_effects_click') || 'ripple';
    syncClickSubSettings(effectsClickSel.value);
    effectsClickSel.addEventListener('change', () => {
      localStorage.setItem('moni_effects_click', effectsClickSel.value);
      window.updateEffectsSettings?.({ clickEffect: effectsClickSel.value });
      syncClickSubSettings(effectsClickSel.value);
    });
  }

  // Cursor effects — Hearts count
  const effectsHeartsSlider = $('effectsHeartsSlider');
  const effectsHeartsVal = $('effectsHeartsVal');
  if (effectsHeartsSlider) {
    const v = parseInt(localStorage.getItem('moni_effects_hearts_count')) || 7;
    effectsHeartsSlider.value = v;
    if (effectsHeartsVal) effectsHeartsVal.textContent = v;
    effectsHeartsSlider.addEventListener('input', () => {
      const n = parseInt(effectsHeartsSlider.value);
      if (effectsHeartsVal) effectsHeartsVal.textContent = n;
      localStorage.setItem('moni_effects_hearts_count', n);
      window.updateEffectsSettings?.({ heartsCount: n });
    });
  }

  // Cursor effects — Lightning size
  const effectsLightningSz = $('effectsLightningSize');
  if (effectsLightningSz) {
    effectsLightningSz.value = localStorage.getItem('moni_effects_lightning_size') || 'medium';
    effectsLightningSz.addEventListener('change', () => {
      localStorage.setItem('moni_effects_lightning_size', effectsLightningSz.value);
      window.updateEffectsSettings?.({ lightningSize: effectsLightningSz.value });
    });
  }

  // Cursor effects — Trail width
  const effectsTrailWidthSlider = $('effectsTrailWidthSlider');
  const effectsTrailWidthVal = $('effectsTrailWidthVal');
  if (effectsTrailWidthSlider) {
    const v = parseFloat(localStorage.getItem('moni_effects_trail_width')) || 1.0;
    effectsTrailWidthSlider.value = v;
    if (effectsTrailWidthVal) effectsTrailWidthVal.textContent = v.toFixed(1);
    effectsTrailWidthSlider.addEventListener('input', () => {
      const n = parseFloat(effectsTrailWidthSlider.value);
      if (effectsTrailWidthVal) effectsTrailWidthVal.textContent = n.toFixed(1);
      localStorage.setItem('moni_effects_trail_width', n);
      window.updateEffectsSettings?.({ trailWidth: n });
    });
  }

  // Cursor effects — Enable/disable
  const effectsEnabledCheck = $('effectsEnabledCheck');
  if (effectsEnabledCheck) {
    effectsEnabledCheck.checked = localStorage.getItem('moni_effects_enabled') !== 'false';
    effectsEnabledCheck.addEventListener('change', () => {
      localStorage.setItem('moni_effects_enabled', effectsEnabledCheck.checked);
      window.updateEffectsSettings?.({ enabled: effectsEnabledCheck.checked });
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
function addSwitcherOpt(dropdown, wrap, text, isActive, onClick) {
  const opt = document.createElement('button');
  opt.className = 'model-switcher-option' + (isActive ? ' active' : '');
  opt.textContent = text;
  opt.addEventListener('click', () => {
    onClick(opt);
    dropdown.querySelectorAll('.model-switcher-option').forEach(o => o.classList.remove('active'));
    opt.classList.add('active');
    wrap.classList.remove('open');
    updateModelSwitcherLabel();
  });
  dropdown.appendChild(opt);
  return opt;
}

function initModelSwitcher() {
  const dropdown = $('modelSwitcherDropdown');
  const btn = $('modelSwitcherBtn');
  const wrap = $('modelSwitcherWrap');
  if (!dropdown || !btn || !wrap) return;

  dropdown.innerHTML = '';

  // ── Arbor Models ──
  const arborLabel = document.createElement('div');
  arborLabel.className = 'model-switcher-group-label';
  arborLabel.textContent = 'Arbor Models';
  dropdown.appendChild(arborLabel);

  const arborModels = ARBOR_ORDER
    .map(k => [k, KNOWN_MODELS[k]])
    .filter(([, m]) => m && (m.status === 'released' || m.status === 'active' || m.status === 'inactive'));

  arborModels.forEach(([id, m]) => {
    const isSelected = provider === 'llamacpp' && llamacppModel === id;
    const isInactive = m.status === 'inactive';
    const label = m.status === 'active' ? `${m.name} ⭐` : m.name;
    if (isInactive) {
      const opt = document.createElement('button');
      opt.className = 'model-switcher-option inactive';
      opt.textContent = label;
      opt.disabled = true;
      dropdown.appendChild(opt);
    } else {
      addSwitcherOpt(dropdown, wrap, label, isSelected, () => {
        provider = 'llamacpp';
        llamacppModel = id;
        localStorage.setItem(STORAGE.PROVIDER, provider);
        localStorage.setItem(STORAGE.LLAMACPP_MODEL, id);
      });
    }
  });

  // Auto-select best Arbor model on first use
  if (provider === 'llamacpp' && !llamacppModel) {
    const selectableArbor = arborModels.filter(([, m]) => m.status !== 'inactive');
    const best = selectableArbor.find(([, m]) => m.best) || selectableArbor[selectableArbor.length - 1];
    if (best) {
      llamacppModel = best[0];
      localStorage.setItem(STORAGE.LLAMACPP_MODEL, best[0]);
      dropdown.querySelector('.model-switcher-option').classList.add('active');
    }
  }

  // ── Other Local ──
  const sep = document.createElement('div');
  sep.className = 'model-switcher-sep';
  dropdown.appendChild(sep);

  const otherLabel = document.createElement('div');
  otherLabel.className = 'model-switcher-group-label';
  otherLabel.textContent = 'Other Local';
  dropdown.appendChild(otherLabel);

  addSwitcherOpt(dropdown, wrap, 'Ollama (local)', provider === 'ollama', () => {
    provider = 'ollama';
    localStorage.setItem(STORAGE.PROVIDER, provider);
  });

  addSwitcherOpt(dropdown, wrap, 'llama.cpp (generic)', provider === 'llamacpp' && !KNOWN_MODELS[llamacppModel], () => {
    provider = 'llamacpp';
    llamacppModel = '';
    localStorage.setItem(STORAGE.PROVIDER, provider);
    localStorage.setItem(STORAGE.LLAMACPP_MODEL, '');
  });

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    wrap.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) wrap.classList.remove('open');
    if (!e.target.closest('.chat-item-menu-btn') && !e.target.closest('.chat-item-dropdown')) {
      document.querySelectorAll('.chat-item-dropdown.open').forEach(d => {
        d.classList.remove('open');
        d.closest('.chat-item')?.classList.remove('menu-open');
      });
    }
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
    const activeModel = _confirmedLlamaCppModel || llamacppModel;
    const known = activeModel && KNOWN_MODELS[activeModel];
    label.textContent = known ? known.name : (activeModel ? activeModel.replace(/-Q\d+[^.]*\.gguf$/i, '') : 'llama.cpp');
  }
}

init();