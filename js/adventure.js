// ====== ADVENTURE MODE ======

// --- Domain Definitions ---
const ADVENTURE_DOMAINS = {
  clubroom: { name: 'The Clubroom', color: '#48bb78', icon: '\u{1F3E0}', keywords: ['clubroom', 'hub', 'literature club', 'club room', 'central hub'] },
  sayori:   { name: "Sayori's Sunlit Meadow", color: '#DAA520', icon: '\u{1F33B}', keywords: ['meadow', 'sunlit', 'sayori', 'golden', 'grassland', 'wildflower', 'cottage', 'memory cave'] },
  natsuki:  { name: "Natsuki's Bakehouse", color: '#FF69B4', icon: '\u{1F9C1}', keywords: ['bakehouse', 'fortress', 'natsuki', 'bakery', 'cupcake', 'candy', 'frosting', 'kitchen', 'caramel'] },
  yuri:     { name: "Yuri's Library", color: '#9370DB', icon: '\u{1F4DA}', keywords: ['library', 'shadows', 'yuri', 'books', 'gothic', 'bookshelf', 'reading room', 'restricted', 'grimoire'] },
  monika:   { name: "Monika's Void", color: '#3CB371', icon: '\u{1F49A}', keywords: ['void', 'monika', 'digital', 'code', 'static', 'between worlds'] }
};

// --- Domain Detection ---
function detectDomain(location) {
  if (!location) return 'clubroom';
  const lower = location.toLowerCase();
  // Check specific domains first (not clubroom — it's the fallback)
  for (const [key, domain] of Object.entries(ADVENTURE_DOMAINS)) {
    if (key === 'clubroom') continue;
    if (domain.keywords.some(kw => lower.includes(kw))) return key;
  }
  return 'clubroom';
}

// --- Tag Parsing ---
function parseAdventureTags(text) {
  const result = { scene: null, hp: null, items: [], removed: [], text };

  const sceneMatch = text.match(/\[SCENE:([^\]]+)\]/i);
  if (sceneMatch) result.scene = sceneMatch[1].trim();

  const hpMatch = text.match(/\[HP:(\d+)\]/i);
  if (hpMatch) result.hp = parseInt(hpMatch[1]);

  for (const m of text.matchAll(/\[ITEM:([^\]]+)\]/gi)) result.items.push(m[1].trim());
  for (const m of text.matchAll(/\[REMOVE:([^\]]+)\]/gi)) result.removed.push(m[1].trim());

  result.text = text.replace(/\[(SCENE|HP|ITEM|REMOVE):[^\]]*\]\s*/gi, '').trim();
  return result;
}

// --- Game State Processing ---
function processAdventureResponse(chat, replyText) {
  if (!chat.advState) return replyText;
  const tags = parseAdventureTags(replyText);
  const prevHp = chat.advState.hp;

  // Update location and track domain visits
  if (tags.scene) {
    chat.advState.location = tags.scene;
    const domain = detectDomain(tags.scene);
    if (domain !== 'clubroom' && !chat.advState.flags[`${domain}_entered`]) {
      chat.advState.flags[`${domain}_entered`] = true;
      showToast(`Entered ${ADVENTURE_DOMAINS[domain].name}!`, 'success');
    }
    chat.advState.currentDomain = domain;
  }

  // Update HP with clamping
  if (tags.hp !== null) {
    chat.advState.hp = Math.max(0, Math.min(chat.advState.maxHp, tags.hp));
  }

  // Collect items
  for (const item of tags.items) {
    if (!chat.advState.inventory.includes(item)) {
      chat.advState.inventory.push(item);
      if (item.toLowerCase().includes('heart fragment') && !chat.advState.fragments.includes(item)) {
        chat.advState.fragments.push(item);
        // Track domain fragment
        const domain = chat.advState.currentDomain || detectDomain(chat.advState.location);
        chat.advState.flags[`${domain}_fragment`] = true;
        showToast(`Heart Fragment collected! (${chat.advState.fragments.length}/3)`, 'success');
        // Unlock Monika's Void when all 3 collected
        if (chat.advState.fragments.length >= 3 && !chat.advState.flags.void_unlocked) {
          chat.advState.flags.void_unlocked = true;
          setTimeout(() => showToast("Monika's Void has been unlocked!", 'success'), 1500);
        }
      }
    }
  }

  // Remove items
  for (const item of tags.removed) {
    const idx = chat.advState.inventory.indexOf(item);
    if (idx !== -1) chat.advState.inventory.splice(idx, 1);
  }

  chat.advState.turns++;

  // HP change visual feedback
  const hpDelta = chat.advState.hp - prevHp;
  if (hpDelta !== 0) flashHpBar(hpDelta);

  // Death handling
  if (chat.advState.hp <= 0) handleAdventureDeath(chat);

  // Auto-checkpoint every 10 turns (if alive)
  if (chat.advState.turns % 10 === 0 && chat.advState.hp > 0) {
    createAdventureCheckpoint(chat, true);
  }

  updateAdventureStatusBar(chat);
  updateAdventureActions(chat);
  return tags.text;
}

// --- HP Visual Feedback ---
function flashHpBar(delta) {
  const bar = $('adventureStatusBar');
  if (!bar) return;
  const cls = delta < 0 ? 'adv-hp-damage' : 'adv-hp-heal';
  bar.classList.add(cls);
  setTimeout(() => bar.classList.remove(cls), 600);
}

// --- Death / Respawn ---
function handleAdventureDeath(chat) {
  showToast('You fell in battle! Respawning at the Clubroom...', 'warning');
  setTimeout(() => {
    chat.advState.hp = chat.advState.maxHp;
    chat.advState.location = 'The Clubroom';
    chat.advState.currentDomain = 'clubroom';
    // Lose non-essential items (keep fragments, keys, quest items)
    const kept = chat.advState.inventory.filter(item => {
      const lower = item.toLowerCase();
      return lower.includes('heart fragment') || lower.includes('key') || lower.includes('quest');
    });
    const lost = chat.advState.inventory.length - kept.length;
    chat.advState.inventory = kept;
    if (lost > 0) showToast(`Lost ${lost} item(s) on respawn.`, 'warning');
    chat.advState.flags.deaths = (chat.advState.flags.deaths || 0) + 1;
    updateAdventureStatusBar(chat);
    updateAdventureActions(chat);
    saveChats();
  }, 1200);
}

// --- Status Bar ---
function updateAdventureStatusBar(chat) {
  const bar = $('adventureStatusBar');
  if (!bar) return;
  if (!chat || chat.mode !== 'adventure' || !chat.advState) { bar.style.display = 'none'; return; }

  const s = chat.advState;
  const hpPct = Math.round((s.hp / s.maxHp) * 100);
  const hpColor = hpPct > 60 ? 'var(--green-mid)' : hpPct > 30 ? '#FF9800' : '#c0392b';
  const domain = s.currentDomain || detectDomain(s.location);
  const domainInfo = ADVENTURE_DOMAINS[domain] || ADVENTURE_DOMAINS.clubroom;

  // Domain-themed accent
  bar.style.borderBottomColor = domainInfo.color;

  // Breadcrumb trail
  const breadcrumb = domain === 'clubroom'
    ? `${domainInfo.icon} ${escapeHtml(s.location)}`
    : `\u{1F3E0} Hub \u203A ${domainInfo.icon} ${escapeHtml(s.location)}`;

  bar.innerHTML = `
    <div class="adv-stat adv-location-stat"><span class="adv-stat-label">Location</span><span class="adv-stat-val">${breadcrumb}</span></div>
    <div class="adv-stat adv-hp-stat"><span class="adv-stat-label">HP</span><div class="adv-hp-track"><div class="adv-hp-fill" style="width:${hpPct}%;background:${hpColor}"></div></div><span class="adv-hp-num">${s.hp}</span></div>
    <div class="adv-stat"><span class="adv-stat-label">Items</span><span class="adv-stat-val">${s.inventory.length}</span></div>
    <div class="adv-stat"><span class="adv-stat-label">Fragments</span><span class="adv-stat-val">${s.fragments.length}/3</span></div>
  `;
  bar.style.display = 'flex';
}

// --- Action Buttons ---
function updateAdventureActions(chat) {
  const actions = $('adventureActions');
  if (!actions) return;
  if (!chat || chat.mode !== 'adventure' || !chat.advState) { actions.style.display = 'none'; return; }
  actions.style.display = 'flex';

  // Reset all buttons to enabled first
  actions.querySelectorAll('.adv-action-btn').forEach(btn => { btn.disabled = false; });

  // Item button — show count of usable items
  const itemBtn = actions.querySelector('[data-action="item"]');
  if (itemBtn) {
    const usable = chat.advState.inventory.filter(i => !i.toLowerCase().includes('heart fragment'));
    itemBtn.textContent = usable.length === 0 ? 'Use Item' : usable.length === 1 ? `Use Item: ${usable[0]}` : `Use Item (${usable.length})`;
    if (usable.length === 0) itemBtn.disabled = true;
  }

  // Hub button — disable when already at hub
  const hubBtn = actions.querySelector('[data-action="hub"]');
  if (hubBtn) {
    const atHub = (chat.advState.currentDomain || detectDomain(chat.advState.location)) === 'clubroom';
    if (atHub) hubBtn.disabled = true;
  }

  // Disable all actions during generation
  if (isGenerating) {
    actions.querySelectorAll('.adv-action-btn').forEach(btn => { btn.disabled = true; });
  }
}

function handleAdventureAction(action) {
  const chat = getChat();
  if (!chat || chat.mode !== 'adventure' || isGenerating) return;

  switch (action) {
    case 'attack':
      userInput.value = 'I attack!';
      sendMessage();
      break;
    case 'defend':
      userInput.value = 'I defend and brace for the next attack.';
      sendMessage();
      break;
    case 'flee':
      userInput.value = 'I try to flee from the encounter!';
      sendMessage();
      break;
    case 'hub':
      userInput.value = 'I return to the Clubroom hub to rest and heal.';
      sendMessage();
      break;
    case 'item': {
      const items = chat.advState.inventory.filter(i => !i.toLowerCase().includes('heart fragment'));
      if (items.length === 0) { showToast('No usable items!'); return; }
      showItemPicker(items);
      break;
    }
  }
}

// --- Item Picker ---
function showItemPicker(items) {
  const existing = document.querySelector('.adv-item-picker');
  if (existing) existing.remove();

  const picker = document.createElement('div');
  picker.className = 'adv-item-picker';
  picker.innerHTML = `
    <div class="adv-item-picker-title">Use which item?</div>
    ${items.map(item => `<button class="adv-item-pick-btn">${escapeHtml(item)}</button>`).join('')}
    <button class="adv-item-pick-cancel">Cancel</button>
  `;

  picker.addEventListener('click', (e) => {
    const btn = e.target.closest('.adv-item-pick-btn');
    if (btn) {
      userInput.value = `I use ${btn.textContent}.`;
      picker.remove();
      sendMessage();
      return;
    }
    if (e.target.closest('.adv-item-pick-cancel')) picker.remove();
  });

  const actionsBar = $('adventureActions');
  if (actionsBar) actionsBar.after(picker);
}

// --- Side Panel ---
function toggleAdventurePanel() {
  const panel = $('adventurePanel');
  const backdrop = $('adventurePanelBackdrop');
  if (!panel) return;
  const isOpen = panel.classList.contains('open');
  panel.classList.toggle('open', !isOpen);
  backdrop.classList.toggle('open', !isOpen);
  if (!isOpen) updateAdventurePanel();
}

function closeAdventurePanel() {
  const panel = $('adventurePanel');
  const backdrop = $('adventurePanelBackdrop');
  if (panel) panel.classList.remove('open');
  if (backdrop) backdrop.classList.remove('open');
}

function updateAdventurePanel() {
  const chat = getChat();
  if (!chat || chat.mode !== 'adventure' || !chat.advState) return;
  const s = chat.advState;

  // Domain Map
  const mapList = $('advDomainMap');
  if (mapList) {
    const domains = ['sayori', 'natsuki', 'yuri', 'monika'];
    const current = s.currentDomain || detectDomain(s.location);
    mapList.innerHTML = domains.map(key => {
      const d = ADVENTURE_DOMAINS[key];
      const entered = s.flags[`${key}_entered`];
      const fragment = s.flags[`${key}_fragment`];
      const isCurrent = current === key;
      const locked = key === 'monika' && !s.flags.void_unlocked;

      let status = '';
      if (locked) status = '\u{1F512}';
      else if (fragment) status = '\u{1F48E}';
      else if (entered) status = '\u2714\uFE0F';
      else status = '\u2014';

      return `<div class="adv-domain-item${isCurrent ? ' current' : ''}${locked ? ' locked' : ''}" style="--domain-color: ${d.color}">
        <span class="adv-domain-icon">${d.icon}</span>
        <span class="adv-domain-name">${d.name}</span>
        <span class="adv-domain-status">${status}</span>
      </div>`;
    }).join('');
  }

  // Inventory
  const invList = $('advInventoryList');
  if (invList) {
    if (s.inventory.length === 0) {
      invList.innerHTML = '<div class="adv-inv-empty">Your bag is empty</div>';
    } else {
      invList.innerHTML = s.inventory.map(item => {
        const isFrag = item.toLowerCase().includes('heart fragment');
        return `<div class="adv-inv-item${isFrag ? ' fragment' : ''}">${escapeHtml(item)}</div>`;
      }).join('');
    }
  }

  // Fragments
  const fragList = $('advFragmentList');
  if (fragList) {
    const girls = ['Sayori', 'Natsuki', 'Yuri'];
    fragList.innerHTML = girls.map(girl => {
      const found = s.fragments.some(f => f.toLowerCase().includes(girl.toLowerCase()));
      return `<div class="adv-frag-item${found ? ' found' : ''}"><span class="adv-frag-icon">${found ? '\u{1F48E}' : '\u2B1C'}</span><span>${girl}'s Domain</span></div>`;
    }).join('');
  }

  // Stats
  const stats = $('advStatsList');
  if (stats) {
    const domain = s.currentDomain || detectDomain(s.location);
    const domainInfo = ADVENTURE_DOMAINS[domain];
    const domainsVisited = ['sayori', 'natsuki', 'yuri', 'monika'].filter(k => s.flags[`${k}_entered`]).length;
    stats.innerHTML = `
      <div class="adv-panel-stat"><span>HP</span><span>${s.hp} / ${s.maxHp}</span></div>
      <div class="adv-panel-stat"><span>Location</span><span>${escapeHtml(s.location)}</span></div>
      <div class="adv-panel-stat"><span>Domain</span><span>${domainInfo.icon} ${domainInfo.name}</span></div>
      <div class="adv-panel-stat"><span>Turns</span><span>${s.turns}</span></div>
      <div class="adv-panel-stat"><span>Domains Explored</span><span>${domainsVisited}/4</span></div>
      <div class="adv-panel-stat"><span>Fragments</span><span>${s.fragments.length} / 3</span></div>
      <div class="adv-panel-stat"><span>Deaths</span><span>${s.flags.deaths || 0}</span></div>
    `;
  }

  // Checkpoints
  renderAdventureCheckpoints(chat);
}

// --- Adventure Checkpoint System ---
function createAdventureCheckpoint(chat, isAuto = false) {
  if (!chat || chat.mode !== 'adventure') return;

  const all = getCheckpoints();
  const key = `adv_${chat.id}`;
  const chatCPs = all[key] || [];

  // Capture text preview from last assistant message
  let preview = '';
  for (let i = chat.messages.length - 1; i >= 0; i--) {
    if (chat.messages[i].role === 'assistant') {
      const raw = chat.messages[i].content || '';
      const text = raw.replace(/\[(?:MOOD|DRIFT|SCENE|HP|ITEM|REMOVE)[^\]]*\]\s*/gi, '').trim();
      preview = text.slice(0, 100).replace(/\n/g, ' ');
      if (text.length > 100) preview += '...';
      break;
    }
  }

  const cp = {
    id: crypto.randomUUID(),
    auto: isAuto,
    timestamp: Date.now(),
    advState: JSON.parse(JSON.stringify(chat.advState)),
    messages: chat.messages.map(m => ({ role: m.role, content: m.content })),
    preview
  };

  chatCPs.push(cp);

  // Enforce limits: 5 auto + 5 manual
  const autos = chatCPs.filter(c => c.auto);
  const manuals = chatCPs.filter(c => !c.auto);
  while (autos.length > 5) autos.shift();
  while (manuals.length > 5) manuals.shift();

  all[key] = [...autos, ...manuals].sort((a, b) => a.timestamp - b.timestamp);
  saveCheckpoints(all);
  if (!isAuto) showToast('Checkpoint saved!', 'success');
  return cp;
}

function loadAdventureCheckpoint(chat, cpId) {
  if (!chat) return false;
  const all = getCheckpoints();
  const key = `adv_${chat.id}`;
  const chatCPs = all[key] || [];
  const cp = chatCPs.find(c => c.id === cpId);
  if (!cp) return false;

  chat.advState = JSON.parse(JSON.stringify(cp.advState));
  chat.messages = cp.messages.map(m => ({ role: m.role, content: m.content }));
  saveChats();
  return true;
}

function deleteAdventureCheckpoint(chatId, cpId) {
  const all = getCheckpoints();
  const key = `adv_${chatId}`;
  const chatCPs = all[key] || [];
  all[key] = chatCPs.filter(c => c.id !== cpId);
  saveCheckpoints(all);
}

function renderAdventureCheckpoints(chat) {
  const container = $('advCheckpointList');
  if (!container || !chat) return;
  const all = getCheckpoints();
  const key = `adv_${chat.id}`;
  const chatCPs = (all[key] || []).sort((a, b) => b.timestamp - a.timestamp);

  if (chatCPs.length === 0) {
    container.innerHTML = '<div class="adv-inv-empty">No checkpoints yet</div>';
    return;
  }

  container.innerHTML = chatCPs.map(cp => {
    const time = new Date(cp.timestamp);
    const timeStr = time.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    const s = cp.advState;
    const domain = detectDomain(s.location);
    const domainInfo = ADVENTURE_DOMAINS[domain];

    const advPreview = cp.preview ? `<div class="adv-cp-preview">${escapeHtml(cp.preview)}</div>` : '';
    return `<div class="adv-cp-item" data-cpid="${cp.id}">
      <div class="adv-cp-info">
        <div class="adv-cp-label">${cp.auto ? 'Auto' : 'Save'} \u2014 ${domainInfo.icon} ${escapeHtml(s.location)}</div>
        <div class="adv-cp-detail">${timeStr} \u2022 HP ${s.hp}/${s.maxHp} \u2022 ${s.fragments.length}/3 \u{1F48E} \u2022 Turn ${s.turns}</div>
        ${advPreview}
      </div>
      <div class="adv-cp-actions">
        <button class="adv-cp-load" title="Load">\u25B6</button>
        <button class="adv-cp-delete" title="Delete">\u00D7</button>
      </div>
    </div>`;
  }).join('');

  // Bind events via delegation
  container.querySelectorAll('.adv-cp-load').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cpId = btn.closest('.adv-cp-item').dataset.cpid;
      if (!confirm('Load this checkpoint? Current progress will be lost unless you save first.')) return;
      if (loadAdventureCheckpoint(chat, cpId)) {
        closeAdventurePanel();
        updateChatHeader(chat);
        updateAdventureStatusBar(chat);
        updateAdventureActions(chat);
        renderMessages();
        updateContextBar();
        showToast('Checkpoint loaded!', 'success');
      }
    });
  });

  container.querySelectorAll('.adv-cp-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cpId = btn.closest('.adv-cp-item').dataset.cpid;
      if (!confirm('Delete this checkpoint?')) return;
      deleteAdventureCheckpoint(chat.id, cpId);
      renderAdventureCheckpoints(chat);
      showToast('Checkpoint deleted.');
    });
  });
}

// --- Init ---
function initAdventureMode(chat) {
  if (!chat || !chat.advState) return;
  // Migration: add new fields if missing
  if (!chat.advState.currentDomain) chat.advState.currentDomain = detectDomain(chat.advState.location);
  if (!chat.advState.flags) chat.advState.flags = {};
  updateAdventureStatusBar(chat);
  updateAdventureActions(chat);
}
