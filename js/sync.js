// ====== CLOUD SYNC (Puter.js KV) ======
function hasPuter() { return typeof puter !== 'undefined' && puter.auth && puter.kv; }

function setSyncStatus(s) {
  syncStatus = s;
  syncDot.className = 'sync-dot ' + s;
  const sub = $('chatListSub');
  if (s === 'offline') sub.textContent = 'Your conversations with Monika';
  else if (s === 'syncing') sub.textContent = 'Syncing...';
  else if (s === 'synced') sub.textContent = 'Synced \u2713';
  else if (s === 'error') sub.textContent = 'Sync failed \u2014 tap cloud to retry';
  // Update modal if open
  if (syncStateText) {
    const labels = { offline: 'Not signed in', syncing: 'Syncing...', synced: 'Synced \u2713', error: 'Sync error \u2014 try again' };
    syncStateText.textContent = labels[s] || s;
  }
}

function queueSync() {
  if (!hasPuter() || !puter.auth.isSignedIn()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncToCloud(), 1000);
}

function parseKV(val) {
  if (val == null) return null;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return null; }
}

async function syncToCloud() {
  if (!hasPuter() || !puter.auth.isSignedIn()) return;
  setSyncStatus('syncing');
  try {
    const index = chats.map(c => ({ id: c.id, relationship: c.relationship, created: c.created, lastModified: c.lastModified || c.created }));
    const promises = [
      puter.kv.set('moni_chat_index', JSON.stringify(index)),
      puter.kv.set('moni_profile', JSON.stringify(profile))
    ];
    for (const chat of chats) {
      promises.push(puter.kv.set('moni_chat_' + chat.id, JSON.stringify(chat)));
    }
    await Promise.all(promises);
    setSyncStatus('synced');
  } catch (err) {
    console.error('Sync to cloud failed:', err);
    setSyncStatus('error');
  }
}

async function syncFromCloud() {
  if (!hasPuter() || !puter.auth.isSignedIn()) return;
  setSyncStatus('syncing');
  try {
    // Pull chat index
    const indexRaw = await puter.kv.get('moni_chat_index');
    const cloudIndex = parseKV(indexRaw) || [];

    // Pull all cloud chats in parallel
    const chatPromises = cloudIndex.map(entry =>
      puter.kv.get('moni_chat_' + entry.id).then(raw => parseKV(raw)).catch(() => null)
    );
    const cloudChats = (await Promise.all(chatPromises)).filter(Boolean);

    // Merge chats
    const merged = new Map();
    for (const c of chats) merged.set(c.id, c);
    for (const cc of cloudChats) {
      const local = merged.get(cc.id);
      if (!local) {
        merged.set(cc.id, cc);
      } else {
        const lm = local.lastModified || local.created || 0;
        const cm = cc.lastModified || cc.created || 0;
        if (cm > lm) merged.set(cc.id, cc);
      }
    }
    chats = Array.from(merged.values());
    saveChatsLocal();

    // Pull profile
    const cloudProfile = parseKV(await puter.kv.get('moni_profile'));
    if (cloudProfile) {
      const localMod = profile.lastModified || 0;
      const cloudMod = cloudProfile.lastModified || 0;
      if (cloudMod > localMod) {
        profile = cloudProfile;
        localStorage.setItem(STORAGE.PROFILE, JSON.stringify(profile));
      }
    }

    renderChatList();
    setSyncStatus('synced');
  } catch (err) {
    console.error('Sync from cloud failed:', err);
    setSyncStatus('error');
  }
}

async function fullSync() {
  await syncFromCloud();
  await syncToCloud();
}

async function deleteCloudChat(id) {
  if (!hasPuter() || !puter.auth.isSignedIn()) return;
  try {
    await puter.kv.del('moni_chat_' + id);
    const index = chats.map(c => ({ id: c.id, relationship: c.relationship, created: c.created, lastModified: c.lastModified || c.created }));
    await puter.kv.set('moni_chat_index', JSON.stringify(index));
  } catch (err) { console.error('Cloud delete failed:', err); }
}

async function initSync() {
  if (!hasPuter()) { setSyncStatus('offline'); return; }
  try {
    if (puter.auth.isSignedIn()) {
      puterUser = await puter.auth.getUser();
      updateSyncUI();
      await fullSync();
    } else {
      setSyncStatus('offline');
    }
  } catch (err) {
    console.error('Init sync error:', err);
    setSyncStatus('offline');
  }
}

// ====== SYNC UI ======
function updateSyncUI() {
  const signedIn = hasPuter() && puter.auth.isSignedIn();
  syncSignedOut.style.display = signedIn ? 'none' : '';
  syncSignedIn.style.display = signedIn ? '' : 'none';
  if (signedIn && puterUser) {
    syncUsername.textContent = puterUser.username || 'Puter User';
  }
}

function openSyncModal() {
  updateSyncUI();
  syncModal.classList.add('open');
}
function closeSyncModal() { syncModal.classList.remove('open'); }

async function handleSignIn() {
  if (!hasPuter()) { showToast('Puter SDK not available.'); return; }
  try {
    await puter.auth.signIn();
    puterUser = await puter.auth.getUser();
    updateSyncUI();
    showToast('Signed in as ' + (puterUser.username || 'Puter User') + '!', 'success');
    await fullSync();
    renderChatList();
  } catch (err) {
    console.error('Sign in failed:', err);
    showToast('Sign in failed. Allow the popup and try again.');
  }
}

function handleSignOut() {
  if (!hasPuter()) return;
  puter.auth.signOut();
  puterUser = null;
  setSyncStatus('offline');
  updateSyncUI();
  closeSyncModal();
  showToast('Signed out. Data stays on this device.');
}