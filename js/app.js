// ====== THEME ======
function applyTheme() {
  let effective;
  if (currentTheme === 'system') {
    effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } else {
    effective = currentTheme;
  }
  document.documentElement.dataset.theme = effective;
  const icon = $('themeToggleBtn');
  if (icon) icon.innerHTML = effective === 'dark' ? '&#9788;' : '&#9790;';
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
  $('newChatBackBtn').addEventListener('click', () => showScreen('chatList'));
  $('startChatBtn').addEventListener('click', createChat);
  $('modeChatBtn').addEventListener('click', () => setNewChatMode('chat'));
  $('modeStoryBtn').addEventListener('click', () => setNewChatMode('story'));
  $('modeAdventureBtn').addEventListener('click', () => setNewChatMode('adventure'));
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
  $('profileBackBtn').addEventListener('click', () => showScreen('chatList'));
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
  $('chatBackBtn').addEventListener('click', () => { if (typeof stopTTS === 'function') stopTTS(); if (typeof hideMicButton === 'function') hideMicButton(); activeChatId = null; screens.chat.classList.remove('vn-mode'); screens.chat.classList.remove('room-mode'); screens.chat.classList.remove('adventure-mode'); teardownRoomMode(); closeVnPanel(); closeChatPanel(); closeAdventurePanel(); const advAct = $('adventureActions'); if (advAct) advAct.style.display = 'none'; const picker = document.querySelector('.adv-item-picker'); if (picker) picker.remove(); showScreen('chatList'); renderChatList(); });
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
  providerSelect.addEventListener('change', () => { toggleProviderFields(providerSelect.value); setTimeout(renderSettingsBenchHint, 100); });
  // Update bench hint when model selects change
  [puterModelSelect, ollamaModelSelect, llamacppModelSelect].forEach(sel => {
    sel.addEventListener('change', () => setTimeout(renderSettingsBenchHint, 50));
  });
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

  // Theme
  $('themeToggleBtn').addEventListener('click', toggleTheme);
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
  $('syncBtn').addEventListener('click', openSyncModal);
  $('signInBtn').addEventListener('click', handleSignIn);
  $('signOutBtn').addEventListener('click', handleSignOut);
  $('syncNowBtn').addEventListener('click', () => { fullSync(); });
  $('cancelSyncBtn').addEventListener('click', closeSyncModal);
  $('closeSyncBtn').addEventListener('click', closeSyncModal);
  syncModal.addEventListener('click', (e) => { if (e.target === syncModal) closeSyncModal(); });
  initSync();
}

// ====== MOBILE KEYBOARD ======
function setupViewport() {
  let baseHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  const KEYBOARD_THRESHOLD = 150;

  const update = () => {
    const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty('--app-height', h + 'px');

    // Track largest viewport as base (keyboard closed state)
    if (h > baseHeight) baseHeight = h;

    // Toggle .keyboard-open when viewport shrinks significantly
    const keyboardOpen = (baseHeight - h) > KEYBOARD_THRESHOLD;
    document.documentElement.classList.toggle('keyboard-open', keyboardOpen);

    if (screens.chat.classList.contains('active')) scrollToBottom();
  };

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', update);
  }
  window.addEventListener('resize', update);

  // Reset baseHeight on orientation change (toolbar size differs)
  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      baseHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      update();
    }, 300);
  });

  update();
}

setupViewport();
init();