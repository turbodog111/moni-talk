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
      puter.kv.set('moni_profile', JSON.stringify(profile)),
      puter.kv.set('moni_deleted_ids', JSON.stringify([...deletedChatIds])),
      puter.kv.set('moni_talk_memories', JSON.stringify(memories))
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

    // Pull and merge deleted IDs from cloud
    const cloudDeletedRaw = await puter.kv.get('moni_deleted_ids');
    const cloudDeleted = parseKV(cloudDeletedRaw) || [];
    for (const id of cloudDeleted) deletedChatIds.add(id);
    localStorage.setItem('moni_talk_deleted_ids', JSON.stringify([...deletedChatIds]));

    // Merge chats
    const merged = new Map();
    for (const c of chats) {
      if (!deletedChatIds.has(c.id)) merged.set(c.id, c);
    }
    for (const cc of cloudChats) {
      if (deletedChatIds.has(cc.id)) continue;
      const local = merged.get(cc.id);
      if (!local) {
        merged.set(cc.id, cc);
      } else {
        const lm = local.lastModified || local.created || 0;
        const cm = cc.lastModified || cc.created || 0;
        const winner = cm > lm ? cc : local;
        const loser = cm > lm ? local : cc;
        // Union-merge starred: if either has true, keep true
        if (loser.starred && !winner.starred) winner.starred = true;
        // Preserve custom title from either copy if winner's is null
        if (!winner.title && loser.title) winner.title = loser.title;
        merged.set(cc.id, winner);
      }
    }
    chats = Array.from(merged.values());
    saveChatsLocal();

    // Push merged deletedChatIds back to cloud immediately to prevent reappearance
    const deletedArr = [...deletedChatIds];
    const cleanupPromises = [puter.kv.set('moni_deleted_ids', JSON.stringify(deletedArr))];
    // Clean up orphaned KV entries for deleted chat IDs
    for (const delId of deletedArr) {
      cleanupPromises.push(puter.kv.del('moni_chat_' + delId).catch(() => {}));
    }
    await Promise.all(cleanupPromises);

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

    // Pull memories — merge cloud + local, deduplicate
    const cloudMemories = parseKV(await puter.kv.get('moni_talk_memories')) || [];
    if (cloudMemories.length > 0) {
      const merged = [...memories];
      for (const cm of cloudMemories) {
        const isDup = merged.some(m =>
          m.fact.toLowerCase().includes(cm.fact.toLowerCase()) ||
          cm.fact.toLowerCase().includes(m.fact.toLowerCase())
        );
        if (!isDup) merged.push(cm);
      }
      memories = merged.slice(0, 50);
      localStorage.setItem('moni_talk_memories', JSON.stringify(memories));
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
    await Promise.all([
      puter.kv.del('moni_chat_' + id),
      puter.kv.set('moni_chat_index', JSON.stringify(
        chats.map(c => ({ id: c.id, relationship: c.relationship, created: c.created, lastModified: c.lastModified || c.created }))
      )),
      puter.kv.set('moni_deleted_ids', JSON.stringify([...deletedChatIds]))
    ]);
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