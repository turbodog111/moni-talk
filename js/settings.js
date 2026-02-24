// ====== SETTINGS ======
function switchSettingsTab(tab) {
  document.querySelectorAll('.settings-nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  document.querySelectorAll('.settings-tab').forEach(t => {
    t.style.display = t.dataset.tab === tab ? '' : 'none';
  });
  if (tab === 'archive') renderArchivedChats();
  if (tab === 'progress' && typeof renderProgressTab === 'function') renderProgressTab();
}

function renderArchivedChats() {
  const el = $('archivedChatsList');
  if (!el) return;
  const archived = chats.filter(c => c.archived);
  if (!archived.length) {
    el.innerHTML = '<div class="archived-empty">No archived chats.</div>';
    return;
  }
  el.innerHTML = archived.map(c => `
    <div class="archived-item">
      <div class="archived-item-name">${escapeHtml(c.title || getChatTitle(c))}</div>
      <span class="archived-item-mode">${c.mode || 'chat'}</span>
      <button class="btn btn-secondary btn-sm archived-item-restore" data-id="${c.id}">Restore</button>
    </div>
  `).join('');
  el.querySelectorAll('.archived-item-restore').forEach(btn => {
    btn.addEventListener('click', () => unarchiveChat(btn.dataset.id));
  });
}

function updateLlamaCppModelCard(modelId) {
  const card = $('llamacppModelCard');
  if (!card) return;
  const info = KNOWN_MODELS[modelId];
  if (!info) { card.style.display = 'none'; return; }
  $('llamacppCardName').textContent = info.name;
  $('llamacppCardBadge').textContent = info.badge;
  $('llamacppCardDesc').textContent = info.desc;
  const chips = [];
  chips.push(`<span>${info.base}</span>`);
  chips.push(`<span>${info.loraParams}</span>`);
  if (info.trainingPairs) chips.push(`<span>${info.trainingPairs} training pairs</span>`);
  if (info.released) chips.push(`<span>${info.released}</span>`);
  $('llamacppCardMeta').innerHTML = chips.join('');
  card.style.display = '';
}

function toggleProviderFields(p) {
  puterFields.style.display = p === 'puter' ? '' : 'none';
  ollamaFields.style.display = p === 'ollama' ? '' : 'none';
  llamacppFields.style.display = p === 'llamacpp' ? '' : 'none';
  providerHint.textContent = PROVIDER_HINTS[p];
  if (p === 'ollama') refreshOllamaModels();
  if (p === 'llamacpp') refreshLlamaCppModels();
}
function toggleTTSProviderFields(p) {
  const orpheusFields = $('ttsOrpheusFields');
  const qwenFields = $('ttsQwenFields');
  const hint = $('ttsProviderHint');
  if (orpheusFields) orpheusFields.style.display = p === 'orpheus' ? '' : 'none';
  if (qwenFields) qwenFields.style.display = p === 'qwen3' ? '' : 'none';
  if (hint) hint.textContent = p === 'qwen3'
    ? 'Qwen3-TTS with voice cloning support. Custom voices loaded from server.'
    : 'Orpheus TTS via Orpheus-FastAPI on the DGX Spark.';
  populateTTSVoices(p);
}

function populateTTSVoices(providerKey) {
  const voiceSel = $('ttsVoiceSelect');
  if (!voiceSel) return;
  const profiles = providerKey === 'qwen3' ? TTS_QWEN_VOICE_PROFILES : TTS_VOICE_PROFILES;
  voiceSel.innerHTML = '';
  for (const [key, profile] of Object.entries(profiles)) {
    const o = document.createElement('option');
    o.value = key; o.textContent = profile.label;
    voiceSel.appendChild(o);
  }
  // Try to keep current voice if it exists in the new profile set
  if (profiles[ttsVoice]) {
    voiceSel.value = ttsVoice;
  } else {
    voiceSel.value = Object.keys(profiles)[0];
  }
  updateTTSVoiceDesc(voiceSel.value);
}

function openSettings() {
  switchSettingsTab('model');
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
  const ttsQwenInput = $('ttsQwenEndpointInput');
  if (ttsQwenInput) ttsQwenInput.value = ttsEndpointQwen;
  const ttsProv = $('ttsProviderSelect');
  if (ttsProv) {
    ttsProv.value = ttsProvider;
    toggleTTSProviderFields(ttsProvider);
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
    if (ttsEnabled && typeof checkAchievement === 'function') checkAchievement('voice_on');
  }
  const ttsProv = $('ttsProviderSelect');
  if (ttsProv) {
    const oldProvider = ttsProvider;
    ttsProvider = ttsProv.value;
    localStorage.setItem('moni_talk_tts_provider', ttsProvider);
    // Clear TTS cache when provider changes (cache keys are provider-prefixed)
    if (oldProvider !== ttsProvider) {
      ttsCache.forEach((url) => URL.revokeObjectURL(url));
      ttsCache.clear();
    }
  }
  const ttsInput = $('ttsEndpointInput');
  if (ttsInput) {
    ttsEndpoint = ttsInput.value.trim().replace(/\/+$/, '') || 'http://spark-0af9:5005';
    localStorage.setItem('moni_talk_tts_endpoint', ttsEndpoint);
  }
  const ttsQwenInput = $('ttsQwenEndpointInput');
  if (ttsQwenInput) {
    ttsEndpointQwen = ttsQwenInput.value.trim().replace(/\/+$/, '') || 'http://spark-0af9:8880';
    localStorage.setItem('moni_talk_tts_endpoint_qwen', ttsEndpointQwen);
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
  // Blank option first — lets llama-server use whatever is loaded (correct for single-model Arbor mode)
  const blank = document.createElement('option');
  blank.value = ''; blank.textContent = '(server default)';
  llamacppModelSelect.appendChild(blank);
  models.forEach(id => {
    const o = document.createElement('option');
    o.value = id;
    // Clean display name: strip split GGUF suffix (e.g. "-00001-of-00002.gguf")
    o.textContent = id.replace(/-\d+-of-\d+(\.gguf)?$/i, '');
    llamacppModelSelect.appendChild(o);
  });
  // Restore saved selection only if it's still valid for the current server.
  // If the saved model isn't in the list (e.g. switched from router → Arbor mode),
  // fall back to blank so we don't send a stale model name that causes "model not found".
  if (llamacppModel && models.includes(llamacppModel)) {
    llamacppModelSelect.value = llamacppModel;
  } else {
    llamacppModelSelect.value = '';
    llamacppModel = '';
    localStorage.setItem(STORAGE.LLAMACPP_MODEL, '');
  }
  if (el) {
    el.innerHTML = `${models.length} model${models.length > 1 ? 's' : ''} available`;
    el.classList.add('visible');
  }
  updateLlamaCppModelCard(llamacppModelSelect.value);
}

function updateTTSVoiceDesc(key) {
  const el = $('ttsVoiceDesc');
  if (!el) return;
  const profiles = typeof getVoiceProfiles === 'function' ? getVoiceProfiles() : TTS_VOICE_PROFILES;
  const profile = profiles[key];
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
