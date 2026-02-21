// ====== SETTINGS ======
function toggleProviderFields(p) {
  puterFields.style.display = p === 'puter' ? '' : 'none';
  ollamaFields.style.display = p === 'ollama' ? '' : 'none';
  llamacppFields.style.display = p === 'llamacpp' ? '' : 'none';
  providerHint.textContent = PROVIDER_HINTS[p];
  if (p === 'ollama') refreshOllamaModels();
  if (p === 'llamacpp') refreshLlamaCppModels();
}
function openSettings() {
  providerSelect.value = provider; puterModelSelect.value = puterModel;
  ollamaEndpointInput.value = ollamaEndpoint;
  llamacppEndpointInput.value = llamacppEndpoint;
  toggleProviderFields(provider);
  const ts = $('themeSelect');
  if (ts) ts.value = currentTheme;
  // TTS settings
  const ttsCheck = $('ttsEnabledCheck');
  if (ttsCheck) ttsCheck.checked = ttsEnabled;
  const ttsInput = $('ttsEndpointInput');
  if (ttsInput) ttsInput.value = ttsEndpoint;
  // Populate voice profiles dropdown
  const voiceSel = $('ttsVoiceSelect');
  if (voiceSel && typeof TTS_VOICE_PROFILES !== 'undefined') {
    voiceSel.innerHTML = '';
    for (const [key, profile] of Object.entries(TTS_VOICE_PROFILES)) {
      const o = document.createElement('option');
      o.value = key; o.textContent = profile.label;
      voiceSel.appendChild(o);
    }
    voiceSel.value = ttsVoice;
    updateTTSVoiceDesc(ttsVoice);
  }
  settingsModal.classList.add('open');
}
function closeSettings() { settingsModal.classList.remove('open'); }
function saveSettings() {
  const p = providerSelect.value;
  if (p === 'llamacpp') {
    llamacppEndpoint = llamacppEndpointInput.value.trim().replace(/\/+$/, '') || 'http://localhost:8080';
    llamacppModel = llamacppModelSelect.value || '';
    localStorage.setItem(STORAGE.LLAMACPP_ENDPOINT, llamacppEndpoint);
    localStorage.setItem(STORAGE.LLAMACPP_MODEL, llamacppModel);
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
  // TTS settings
  const ttsCheck = $('ttsEnabledCheck');
  if (ttsCheck) {
    ttsEnabled = ttsCheck.checked;
    localStorage.setItem('moni_talk_tts_enabled', ttsEnabled);
  }
  const ttsInput = $('ttsEndpointInput');
  if (ttsInput) {
    ttsEndpoint = ttsInput.value.trim().replace(/\/+$/, '') || 'http://localhost:8880';
    localStorage.setItem('moni_talk_tts_endpoint', ttsEndpoint);
  }
  const voiceSel = $('ttsVoiceSelect');
  if (voiceSel) {
    ttsVoice = voiceSel.value;
    localStorage.setItem('moni_talk_tts_voice', ttsVoice);
  }
  if (typeof updateTTSIcon === 'function') updateTTSIcon();
  closeSettings(); showToast('Settings saved!', 'success');
}
function clearKey() {
  showToast('No API keys to clear — all providers are local or keyless.');
}

let _ollamaModelsMeta = []; // cache for model info display

async function refreshOllamaModels() {
  ollamaModelSelect.innerHTML = '';
  const models = await fetchOllamaModels();
  _ollamaModelsMeta = models;
  if (models.length === 0) {
    const o = document.createElement('option');
    o.value = ''; o.textContent = 'No models found \u2014 is Ollama running?';
    ollamaModelSelect.appendChild(o);
    updateOllamaModelInfo('');
    return;
  }

  // Group by family for optgroups
  const grouped = {};
  models.forEach(m => {
    const fam = m.family || 'Other';
    if (!grouped[fam]) grouped[fam] = [];
    grouped[fam].push(m);
  });

  const families = Object.keys(grouped).sort();
  if (families.length === 1) {
    // Single family — no need for optgroups
    models.forEach(m => {
      const o = document.createElement('option');
      o.value = m.id; o.textContent = m.label;
      ollamaModelSelect.appendChild(o);
    });
  } else {
    families.forEach(fam => {
      const og = document.createElement('optgroup');
      og.label = fam;
      grouped[fam].forEach(m => {
        const o = document.createElement('option');
        o.value = m.id; o.textContent = m.label;
        og.appendChild(o);
      });
      ollamaModelSelect.appendChild(og);
    });
  }

  if (ollamaModel && models.some(m => m.id === ollamaModel)) {
    ollamaModelSelect.value = ollamaModel;
  }
  updateOllamaModelInfo(ollamaModelSelect.value);
  // Update benchmark hint now that models are loaded
  if (typeof renderSettingsBenchHint === 'function') renderSettingsBenchHint();
}

function updateOllamaModelInfo(modelId) {
  const el = $('ollamaModelInfo');
  if (!el) return;
  const m = _ollamaModelsMeta.find(x => x.id === modelId);
  if (!m || (!m.sizeGB && !m.quant && !m.size)) {
    el.classList.remove('visible');
    return;
  }
  const parts = [];
  if (m.family) parts.push(`<strong>${m.family}</strong>`);
  if (m.size) parts.push(`${m.size} parameters`);
  if (m.quant) parts.push(`${m.quant} quantization`);
  if (m.sizeGB) parts.push(`${m.sizeGB} on disk`);
  el.innerHTML = parts.join(' &middot; ');
  el.classList.add('visible');
}

async function refreshLlamaCppModels() {
  llamacppModelSelect.innerHTML = '';
  const el = $('llamacppModelInfo');
  if (el) { el.textContent = 'Connecting...'; el.classList.add('visible'); }
  const models = await fetchLlamaCppModels();
  if (models.length === 0) {
    const o = document.createElement('option');
    o.value = ''; o.textContent = 'No models found \u2014 is llama-server running?';
    llamacppModelSelect.appendChild(o);
    if (el) { el.innerHTML = 'Could not connect \u2014 check endpoint and server status.'; el.classList.add('visible'); }
    return;
  }
  models.forEach(id => {
    const o = document.createElement('option');
    o.value = id;
    // Clean display name: strip split GGUF suffix (e.g. "-00001-of-00002")
    o.textContent = id.replace(/-\d+-of-\d+$/, '');
    llamacppModelSelect.appendChild(o);
  });
  // Restore saved selection if available
  if (llamacppModel && models.includes(llamacppModel)) {
    llamacppModelSelect.value = llamacppModel;
  } else {
    llamacppModelSelect.value = models[0];
  }
  if (el) {
    el.innerHTML = `${models.length} model${models.length > 1 ? 's' : ''} available`;
    el.classList.add('visible');
  }
}

function updateTTSVoiceDesc(key) {
  const el = $('ttsVoiceDesc');
  if (!el || typeof TTS_VOICE_PROFILES === 'undefined') return;
  const profile = TTS_VOICE_PROFILES[key];
  el.textContent = profile ? profile.desc : '';
}

// ====== TOAST ======
let toastTimer;
function showToast(msg, type) {
  toast.textContent = msg;
  toast.className = 'toast visible' + (type === 'success' ? ' success' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 3500);
}
