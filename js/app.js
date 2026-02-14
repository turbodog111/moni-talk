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
  OPENROUTER_MODELS.forEach(m => { const o = document.createElement('option'); o.value = m.id; o.textContent = m.label; orModelSelect.appendChild(o); });
  orModelSelect.value = selectedModel;
  PUTER_MODELS.forEach(m => { const o = document.createElement('option'); o.value = m.id; o.textContent = m.label; puterModelSelect.appendChild(o); });
  puterModelSelect.value = puterModel;
  GEMINI_MODELS.forEach(m => { const o = document.createElement('option'); o.value = m.id; o.textContent = m.label; geminiModelSelect.appendChild(o); });
  geminiModelSelect.value = geminiModel;

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
  $('modeRoomBtn').addEventListener('click', () => setNewChatMode('room'));
  const roomSlider = $('roomRelSlider');
  if (roomSlider) roomSlider.addEventListener('input', updateRoomRelDisplay);
  $('wordSubmitBtn').addEventListener('click', submitPoem);
  $('vnPanelBtn').addEventListener('click', toggleVnPanel);
  $('vnPanelClose').addEventListener('click', closeVnPanel);
  $('vnPanelBackdrop').addEventListener('click', closeVnPanel);
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
  $('chatBackBtn').addEventListener('click', () => { activeChatId = null; screens.chat.classList.remove('vn-mode'); screens.chat.classList.remove('room-mode'); teardownRoomMode(); closeVnPanel(); showScreen('chatList'); renderChatList(); });
  $('trimBtn').addEventListener('click', trimContext);
  $('storyRetryBtn').addEventListener('click', forceStoryRetry);

  userInput.addEventListener('input', () => { userInput.style.height = 'auto'; userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px'; });
  userInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
  sendBtn.addEventListener('click', sendMessage);

  $('globalSettingsBtn').addEventListener('click', openSettings);
  $('chatSettingsBtn').addEventListener('click', openSettings);
  $('saveKeyBtn').addEventListener('click', saveSettings);
  $('cancelSettingsBtn').addEventListener('click', closeSettings);
  $('clearKeyBtn').addEventListener('click', clearKey);
  providerSelect.addEventListener('change', () => toggleProviderFields(providerSelect.value));
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