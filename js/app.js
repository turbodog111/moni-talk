// ====== INIT ======
function init() {
  OPENROUTER_MODELS.forEach(m => { const o = document.createElement('option'); o.value = m.id; o.textContent = m.label; orModelSelect.appendChild(o); });
  orModelSelect.value = selectedModel;
  PUTER_MODELS.forEach(m => { const o = document.createElement('option'); o.value = m.id; o.textContent = m.label; puterModelSelect.appendChild(o); });
  puterModelSelect.value = puterModel;

  renderChatList();
  updateRelDisplay();
  loadProfile();

  relSlider.addEventListener('input', updateRelDisplay);
  $('newChatFab').addEventListener('click', () => { resetNewChatScreen(); showScreen('newChat'); });
  $('newChatBackBtn').addEventListener('click', () => showScreen('chatList'));
  $('startChatBtn').addEventListener('click', createChat);
  $('modeChatBtn').addEventListener('click', () => setNewChatMode('chat'));
  $('modeStoryBtn').addEventListener('click', () => setNewChatMode('story'));
  $('wordSubmitBtn').addEventListener('click', submitPoem);
  $('vnPanelBtn').addEventListener('click', toggleVnPanel);
  $('vnPanelClose').addEventListener('click', closeVnPanel);
  $('vnPanelBackdrop').addEventListener('click', closeVnPanel);
  $('journalContinueBtn').addEventListener('click', closeJournal);
  initVnTicks();
  $('profileBtn').addEventListener('click', () => { loadProfile(); showScreen('profile'); });
  $('profileBackBtn').addEventListener('click', () => showScreen('chatList'));
  $('saveProfileBtn').addEventListener('click', saveProfile);
  $('chatBackBtn').addEventListener('click', () => { activeChatId = null; screens.chat.classList.remove('vn-mode'); closeVnPanel(); showScreen('chatList'); renderChatList(); });
  $('trimBtn').addEventListener('click', trimContext);

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
  const update = () => {
    const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    document.documentElement.style.setProperty('--app-height', h + 'px');
    if (screens.chat.classList.contains('active')) scrollToBottom();
  };
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', update);
  }
  window.addEventListener('resize', update);
  update();
}

setupViewport();
init();