// ====== ADVENTURE MODE ======

// Parse adventure state tags from AI response
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

// Process adventure response: parse tags, update game state, return clean text
function processAdventureResponse(chat, replyText) {
  if (!chat.advState) return replyText;
  const tags = parseAdventureTags(replyText);

  if (tags.scene) chat.advState.location = tags.scene;
  if (tags.hp !== null) chat.advState.hp = Math.max(0, Math.min(chat.advState.maxHp, tags.hp));

  for (const item of tags.items) {
    if (!chat.advState.inventory.includes(item)) {
      chat.advState.inventory.push(item);
      if (item.toLowerCase().includes('heart fragment') && !chat.advState.fragments.includes(item)) {
        chat.advState.fragments.push(item);
      }
    }
  }
  for (const item of tags.removed) {
    const idx = chat.advState.inventory.indexOf(item);
    if (idx !== -1) chat.advState.inventory.splice(idx, 1);
  }

  chat.advState.turns++;
  updateAdventureStatusBar(chat);
  return tags.text;
}

// Render the adventure status bar
function updateAdventureStatusBar(chat) {
  const bar = $('adventureStatusBar');
  if (!bar) return;
  if (!chat || chat.mode !== 'adventure' || !chat.advState) { bar.style.display = 'none'; return; }

  const s = chat.advState;
  const hpPct = Math.round((s.hp / s.maxHp) * 100);
  const hpColor = hpPct > 60 ? 'var(--green-mid)' : hpPct > 30 ? '#FF9800' : '#c0392b';

  bar.innerHTML = `
    <div class="adv-stat adv-location-stat"><span class="adv-stat-label">Location</span><span class="adv-stat-val">${escapeHtml(s.location)}</span></div>
    <div class="adv-stat adv-hp-stat"><span class="adv-stat-label">HP</span><div class="adv-hp-track"><div class="adv-hp-fill" style="width:${hpPct}%;background:${hpColor}"></div></div><span class="adv-hp-num">${s.hp}</span></div>
    <div class="adv-stat"><span class="adv-stat-label">Items</span><span class="adv-stat-val">${s.inventory.length}</span></div>
    <div class="adv-stat"><span class="adv-stat-label">Fragments</span><span class="adv-stat-val">${s.fragments.length}/3</span></div>
  `;
  bar.style.display = 'flex';
}

// Side panel toggle
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

// Update adventure side panel content
function updateAdventurePanel() {
  const chat = getChat();
  if (!chat || chat.mode !== 'adventure' || !chat.advState) return;
  const s = chat.advState;

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
    stats.innerHTML = `
      <div class="adv-panel-stat"><span>HP</span><span>${s.hp} / ${s.maxHp}</span></div>
      <div class="adv-panel-stat"><span>Location</span><span>${escapeHtml(s.location)}</span></div>
      <div class="adv-panel-stat"><span>Turns</span><span>${s.turns}</span></div>
      <div class="adv-panel-stat"><span>Fragments</span><span>${s.fragments.length} / 3</span></div>
    `;
  }
}

// Initialize adventure mode when opening a chat
function initAdventureMode(chat) {
  if (!chat || !chat.advState) return;
  updateAdventureStatusBar(chat);
}
