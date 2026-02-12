// ====== SETTINGS ======
function toggleProviderFields(p) {
  openrouterFields.style.display = p === 'openrouter' ? '' : 'none';
  puterFields.style.display = p === 'puter' ? '' : 'none';
  ollamaFields.style.display = p === 'ollama' ? '' : 'none';
  providerHint.textContent = PROVIDER_HINTS[p];
  if (p === 'ollama') refreshOllamaModels();
}
function openSettings() {
  providerSelect.value = provider; apiKeyInput.value = apiKey;
  orModelSelect.value = selectedModel; puterModelSelect.value = puterModel;
  ollamaEndpointInput.value = ollamaEndpoint;
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
  } else if (p === 'ollama') {
    ollamaModel = ollamaModelSelect.value;
    ollamaEndpoint = ollamaEndpointInput.value.trim().replace(/\/+$/, '') || 'http://localhost:11434';
    localStorage.setItem(STORAGE.MODEL_OLLAMA, ollamaModel);
    localStorage.setItem(STORAGE.OLLAMA_ENDPOINT, ollamaEndpoint);
  } else {
    puterModel = puterModelSelect.value;
    localStorage.setItem(STORAGE.MODEL_PUTER, puterModel);
  }
  provider = p; localStorage.setItem(STORAGE.PROVIDER, provider);
  closeSettings(); showToast('Settings saved!', 'success');
}
function clearKey() { apiKey = ''; localStorage.removeItem(STORAGE.API); apiKeyInput.value = ''; showToast('Key cleared.'); }

async function refreshOllamaModels() {
  ollamaModelSelect.innerHTML = '';
  const models = await fetchOllamaModels();
  if (models.length === 0) {
    const o = document.createElement('option');
    o.value = ''; o.textContent = 'No models found — is Ollama running?';
    ollamaModelSelect.appendChild(o);
    return;
  }
  models.forEach(m => {
    const o = document.createElement('option');
    o.value = m.id; o.textContent = m.label;
    ollamaModelSelect.appendChild(o);
  });
  if (ollamaModel && models.some(m => m.id === ollamaModel)) {
    ollamaModelSelect.value = ollamaModel;
  }
}

// ====== TOAST ======
let toastTimer;
function showToast(msg, type) {
  toast.textContent = msg;
  toast.className = 'toast visible' + (type === 'success' ? ' success' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3500);
}
