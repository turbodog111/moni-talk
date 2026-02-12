// ====== SETTINGS ======
function toggleProviderFields(p) {
  openrouterFields.style.display = p === 'openrouter' ? '' : 'none';
  puterFields.style.display = p === 'puter' ? '' : 'none';
  providerHint.textContent = PROVIDER_HINTS[p];
}
function openSettings() {
  providerSelect.value = provider; apiKeyInput.value = apiKey;
  orModelSelect.value = selectedModel; puterModelSelect.value = puterModel;
  toggleProviderFields(provider); settingsModal.classList.add('open');
}
function closeSettings() { settingsModal.classList.remove('open'); }
function saveSettings() {
  const p = providerSelect.value;
  if (p === 'openrouter') {
    const k = apiKeyInput.value.trim();
    if (!k) { showToast('Enter an OpenRouter API key.'); return; }
    apiKey = k; selectedModel = orModelSelect.value;
    localStorage.setItem(STORAGE.API, apiKey); localStorage.setItem(STORAGE.MODEL_OR, selectedModel);
  } else { puterModel = puterModelSelect.value; localStorage.setItem(STORAGE.MODEL_PUTER, puterModel); }
  provider = p; localStorage.setItem(STORAGE.PROVIDER, provider);
  closeSettings(); showToast('Settings saved!', 'success');
}
function clearKey() { apiKey = ''; localStorage.removeItem(STORAGE.API); apiKeyInput.value = ''; showToast('Key cleared.'); }

// ====== TOAST ======
let toastTimer;
function showToast(msg, type) {
  toast.textContent = msg;
  toast.className = 'toast visible' + (type === 'success' ? ' success' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3500);
}