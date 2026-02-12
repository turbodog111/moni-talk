// ====== PROFILE ======
function loadProfile() {
  $('profileName').value = profile.name || '';
  $('profileAbout').value = profile.about || '';
  $('profileInterests').value = profile.interests || '';
  $('profileValues').value = profile.values || '';
}

function saveProfile() {
  profile = {
    name: $('profileName').value.trim(),
    about: $('profileAbout').value.trim(),
    interests: $('profileInterests').value.trim(),
    values: $('profileValues').value.trim(),
    lastModified: Date.now()
  };
  localStorage.setItem(STORAGE.PROFILE, JSON.stringify(profile));
  queueSync();
  showScreen('chatList');
  showToast('Profile saved! Monika will remember.', 'success');
}

function buildProfilePrompt() {
  const parts = [];
  if (profile.name) parts.push(`Their name is ${profile.name}.`);
  if (profile.about) parts.push(`About them: ${profile.about}`);
  if (profile.interests) parts.push(`Their interests: ${profile.interests}`);
  if (profile.values) parts.push(`What they value: ${profile.values}`);
  if (parts.length === 0) return '';
  return '\n\nABOUT THE PERSON YOU\'RE TALKING TO:\n' + parts.join('\n') + '\n- Use this info naturally in conversation — don\'t dump it all at once or make it obvious you were "briefed". Just know them.';
}

// ====== RELATIONSHIP SLIDER ======
function updateRelDisplay() {
  const v = parseInt(relSlider.value);
  relLabel.textContent = RELATIONSHIPS[v].label;
  relDesc.textContent = RELATIONSHIPS[v].desc;
}