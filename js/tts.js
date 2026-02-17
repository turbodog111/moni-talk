// ====== TTS (Text-to-Speech) ======

const TTS_VOICE_BASE = 'A warm, confident young woman with a clear, articulate voice. Natural American English. Slightly playful with genuine warmth.';

const TTS_MOOD_INSTRUCTS = {
  cheerful:    'Speak cheerfully with bright energy.',
  playful:     'Speak playfully with teasing lightness.',
  thoughtful:  'Speak thoughtfully with a measured, contemplative pace.',
  melancholic: 'Speak softly with gentle melancholy and wistfulness.',
  excited:     'Speak with excitement and high energy.',
  tender:      'Speak tenderly and gently, with soft warmth.',
  teasing:     'Speak with a teasing, mischievous tone.',
  curious:     'Speak with curious interest and engaged energy.',
  nostalgic:   'Speak with warm nostalgia and bittersweet softness.',
  flustered:   'Speak with slight nervousness and flustered embarrassment.',
  calm:        'Speak calmly and evenly, with peaceful composure.',
  passionate:  'Speak with intense passion and conviction.'
};

let ttsAudio = null;
let ttsPlaying = false;

function buildTTSInstruct(mood, intensity) {
  const moodText = TTS_MOOD_INSTRUCTS[mood] || TTS_MOOD_INSTRUCTS.cheerful;
  let adjusted = moodText;
  if (intensity === 'strong') {
    adjusted = 'Very strongly ' + moodText.charAt(0).toLowerCase() + moodText.slice(1);
  }
  // subtle = no mood modifier at all
  if (intensity === 'subtle') return TTS_VOICE_BASE;
  return TTS_VOICE_BASE + ' ' + adjusted;
}

function cleanTextForTTS(text) {
  let t = text;
  // Strip [POEM]...[/POEM] blocks entirely
  t = t.replace(/\[POEM\][\s\S]*?\[\/POEM\]/gi, '');
  // Strip any remaining bracket tags like [MOOD:...] etc
  t = t.replace(/\[[^\]]*\]/g, '');
  // Strip markdown: bold, italic, code
  t = t.replace(/\*\*(.+?)\*\*/g, '$1');
  t = t.replace(/\*(.+?)\*/g, '$1');
  t = t.replace(/`(.+?)`/g, '$1');
  // Collapse whitespace
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

function stopTTS() {
  if (ttsAudio) {
    ttsAudio.pause();
    ttsAudio.src = '';
    ttsAudio = null;
  }
  ttsPlaying = false;
  updateTTSIcon();
}

async function speakText(text, mood, intensity) {
  console.log('[TTS] speakText called — enabled:', ttsEnabled, 'muted:', ttsMuted);
  if (!ttsEnabled || ttsMuted) return;
  // Stop any current playback
  stopTTS();

  const cleaned = cleanTextForTTS(text);
  if (!cleaned) { console.log('[TTS] cleaned text is empty, skipping'); return; }

  const instruct = buildTTSInstruct(mood || 'cheerful', intensity || 'moderate');
  console.log('[TTS] fetching audio from', ttsEndpoint, '— text length:', cleaned.length);

  try {
    const resp = await fetch(ttsEndpoint + '/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: cleaned, language: 'English', instruct })
    });

    console.log('[TTS] response status:', resp.status);
    if (!resp.ok) throw new Error('TTS server error ' + resp.status);

    const blob = await resp.blob();
    console.log('[TTS] got audio blob, size:', blob.size, 'type:', blob.type);
    const url = URL.createObjectURL(blob);
    ttsAudio = new Audio(url);
    ttsPlaying = true;
    updateTTSIcon();

    ttsAudio.addEventListener('ended', () => {
      console.log('[TTS] playback ended');
      ttsPlaying = false;
      URL.revokeObjectURL(url);
      ttsAudio = null;
      updateTTSIcon();
    });

    ttsAudio.addEventListener('error', (e) => {
      console.error('[TTS] audio playback error:', e);
      ttsPlaying = false;
      URL.revokeObjectURL(url);
      ttsAudio = null;
      updateTTSIcon();
    });

    await ttsAudio.play();
    console.log('[TTS] playback started');
  } catch (err) {
    console.error('[TTS] error:', err);
    ttsPlaying = false;
    updateTTSIcon();
    showToast('TTS unavailable: ' + (err.message || 'server unreachable'));
  }
}

async function testTTSConnection() {
  try {
    const resp = await fetch(ttsEndpoint + '/api/tts/health', { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) throw new Error('status ' + resp.status);
    const data = await resp.json();
    if (data.status === 'ok') {
      showToast('TTS connected! Model: ' + (data.model || 'unknown'), 'success');
      return true;
    }
    throw new Error('unexpected response');
  } catch (err) {
    showToast('TTS connection failed: ' + (err.message || 'unreachable'));
    return false;
  }
}

function updateTTSIcon() {
  const btn = $('ttsToggleBtn');
  if (!btn) return;
  // Hide in story mode or when TTS is disabled in settings
  const chat = typeof getChat === 'function' ? getChat() : null;
  if (!ttsEnabled || (chat && chat.mode === 'story')) {
    btn.style.display = 'none';
    return;
  }
  btn.style.display = '';
  if (ttsPlaying) {
    btn.innerHTML = '&#128266;'; // loud speaker (playing)
  } else if (ttsMuted) {
    btn.innerHTML = '&#128263;'; // muted speaker
  } else {
    btn.innerHTML = '&#128264;'; // normal speaker (ready)
  }
  btn.classList.toggle('tts-playing', ttsPlaying);
  btn.classList.toggle('tts-muted', ttsMuted && !ttsPlaying);
}
