// ====== TTS (Text-to-Speech) ======

const TTS_VOICE_PROFILES = {
  classic: {
    label: 'Classic',
    desc: 'Warm and confident with a clear, articulate voice. Slightly playful with genuine warmth.',
    instruct: 'A warm, confident young woman with a clear, articulate voice. Natural American English. Slightly playful with genuine warmth.',
    seed: 42
  },
  soft: {
    label: 'Soft & Gentle',
    desc: 'Quiet and intimate, like a whispered conversation. Soothing and delicate.',
    instruct: 'A soft-spoken, gentle young woman with a quiet, intimate voice. Natural American English. Delicate and soothing, as if speaking closely and privately.',
    seed: 88
  },
  bright: {
    label: 'Bright & Energetic',
    desc: 'Upbeat and lively with a higher register. Bubbly and expressive.',
    instruct: 'A bright, energetic young woman with a lively, expressive voice. Natural American English. Upbeat and bubbly with a slightly higher pitch.',
    seed: 137
  },
  cool: {
    label: 'Cool & Composed',
    desc: 'Calm and measured with a deeper tone. Poised and elegant.',
    instruct: 'A calm, composed young woman with a smooth, slightly deeper voice. Natural American English. Poised, elegant, and self-assured with measured delivery.',
    seed: 256
  },
  sweet: {
    label: 'Sweet & Cute',
    desc: 'Cheerful and adorable with a higher, softer tone. Endearing and youthful.',
    instruct: 'A sweet, adorable young woman with a cute, higher-pitched voice. Natural American English. Cheerful and endearing with youthful charm.',
    seed: 314
  },
  jarvis: {
    label: 'Jarvis (Dev)',
    desc: 'Smooth, composed male assistant. Dry wit with calm authority.',
    instruct: 'A smooth, composed man with a clear, refined baritone voice. British English. Calm and authoritative with subtle dry wit, like an intelligent personal assistant.',
    seed: 777
  }
};

function getVoiceProfile() {
  return TTS_VOICE_PROFILES[ttsVoice] || TTS_VOICE_PROFILES.classic;
}

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
let ttsLoading = false;
let ttsQueue = [];       // queued audio URLs to play next
let ttsCancelled = false; // flag to abort sentence pipeline

// Audio cache — keyed by text, stores blob URLs for instant replay
const ttsCache = new Map();
const TTS_CACHE_MAX = 50; // max cached entries

function buildTTSInstruct(mood, intensity) {
  const profile = getVoiceProfile();
  const moodText = TTS_MOOD_INSTRUCTS[mood] || TTS_MOOD_INSTRUCTS.cheerful;
  let adjusted = moodText;
  if (intensity === 'strong') {
    adjusted = 'Very strongly ' + moodText.charAt(0).toLowerCase() + moodText.slice(1);
  }
  // subtle = no mood modifier at all
  if (intensity === 'subtle') return profile.instruct;
  return profile.instruct + ' ' + adjusted;
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
  // Strip emojis and other non-speech symbols
  t = t.replace(/[\u{1F600}-\u{1F9FF}]/gu, '');  // emoticons, supplemental symbols
  t = t.replace(/[\u{1FA00}-\u{1FAFF}]/gu, '');  // extended symbols
  t = t.replace(/[\u{2600}-\u{26FF}]/gu, '');     // misc symbols
  t = t.replace(/[\u{2700}-\u{27BF}]/gu, '');     // dingbats
  t = t.replace(/[\u{FE00}-\u{FE0F}]/gu, '');     // variation selectors
  t = t.replace(/[\u{200D}]/gu, '');               // zero-width joiner
  t = t.replace(/[\u{20E3}]/gu, '');               // combining enclosing keycap
  t = t.replace(/[\u{E0020}-\u{E007F}]/gu, '');   // tags
  // Strip kaomoji-style faces like (╥_╥) (~‾▿‾)~ etc
  t = t.replace(/[(\[{][^)\]}\n]{1,10}[)\]}]/g, (match) => {
    // Only strip if it contains special symbols (not normal parenthetical text)
    if (/[╥▿‾◕◡≧≦•̀•́ω╯°□ノ┻━┬─_]/.test(match)) return '';
    return match;
  });
  // Collapse whitespace
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

// Split text into chunks for pipelined TTS
// Targets ~8-20 words per chunk for consistent voice and even playback
function splitSentences(text) {
  const MIN_WORDS = 5;
  const MAX_WORDS = 22;
  const SPLIT_TARGET = 15; // ideal split point when breaking long chunks

  // Step 1: Split on sentence-ending punctuation
  const raw = text.match(/[^.!?]*[.!?]+[\s]?|[^.!?]+$/g);
  if (!raw) return [text];
  const sentences = raw.map(s => s.trim()).filter(s => s.length > 0);

  // Step 2: Split long sentences at natural breath points
  const midChunks = [];
  for (const sent of sentences) {
    const wordCount = sent.split(/\s+/).length;
    if (wordCount <= MAX_WORDS) {
      midChunks.push(sent);
      continue;
    }
    // Split at commas, semicolons, colons, em-dashes, ellipses
    const parts = sent.split(/(?<=[,;:\u2014–])\s+|(?<=\.\.\.)\s+/);
    if (parts.length > 1) {
      // Recombine parts that are too small
      let buf = '';
      for (const part of parts) {
        const combined = buf ? buf + ' ' + part : part;
        if (combined.split(/\s+/).length >= SPLIT_TARGET && buf) {
          midChunks.push(buf.trim());
          buf = part;
        } else {
          buf = combined;
        }
      }
      if (buf.trim()) midChunks.push(buf.trim());
    } else {
      // No punctuation breaks — split at conjunctions
      const conjSplit = sent.split(/\s+(?=(?:and|but|or|so|because|although|while|then|yet)\s)/i);
      if (conjSplit.length > 1) {
        let buf = '';
        for (const part of conjSplit) {
          const combined = buf ? buf + ' ' + part : part;
          if (combined.split(/\s+/).length >= SPLIT_TARGET && buf) {
            midChunks.push(buf.trim());
            buf = part;
          } else {
            buf = combined;
          }
        }
        if (buf.trim()) midChunks.push(buf.trim());
      } else {
        // Last resort: hard split at word limit
        const words = sent.split(/\s+/);
        for (let i = 0; i < words.length; i += MAX_WORDS) {
          midChunks.push(words.slice(i, i + MAX_WORDS).join(' '));
        }
      }
    }
  }

  // Step 3: Merge short fragments with neighbors
  const merged = [];
  for (const chunk of midChunks) {
    if (merged.length > 0 && merged[merged.length - 1].split(/\s+/).length < MIN_WORDS) {
      merged[merged.length - 1] += ' ' + chunk;
    } else {
      merged.push(chunk);
    }
  }
  // Check if the last chunk is too short — merge it back
  if (merged.length > 1 && merged[merged.length - 1].split(/\s+/).length < MIN_WORDS) {
    const last = merged.pop();
    merged[merged.length - 1] += ' ' + last;
  }

  return merged.filter(s => s.length > 0);
}

function stopTTS() {
  ttsCancelled = true;
  ttsQueue = [];
  if (ttsAudio) {
    ttsAudio.pause();
    ttsAudio.src = '';
    ttsAudio = null;
  }
  ttsPlaying = false;
  ttsLoading = false;
  updateTTSIcon();
}

// Fetch audio for a single chunk of text (with caching)
async function fetchTTSAudio(text, instruct) {
  // Check cache first
  const cacheKey = text;
  if (ttsCache.has(cacheKey)) {
    console.log('[TTS] cache hit:', text.slice(0, 30));
    return ttsCache.get(cacheKey);
  }

  const profile = getVoiceProfile();
  const resp = await fetch(ttsEndpoint + '/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, language: 'English', instruct, seed: profile.seed })
  });
  if (!resp.ok) throw new Error('TTS server error ' + resp.status);
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);

  // Store in cache (evict oldest if full)
  if (ttsCache.size >= TTS_CACHE_MAX) {
    const oldest = ttsCache.keys().next().value;
    URL.revokeObjectURL(ttsCache.get(oldest));
    ttsCache.delete(oldest);
  }
  ttsCache.set(cacheKey, url);

  return url;
}

// Preview a voice profile with a short sample
async function previewVoice(profileKey) {
  const profile = TTS_VOICE_PROFILES[profileKey];
  if (!profile) return;
  stopTTS();
  ttsLoading = true;
  updateTTSIcon();
  try {
    const resp = await fetch(ttsEndpoint + '/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Hey, it\'s me, Monika! How are you doing today?',
        language: 'English',
        instruct: profile.instruct,
        seed: profile.seed
      })
    });
    if (!resp.ok) throw new Error('TTS server error ' + resp.status);
    const blob = await resp.blob();
    ttsLoading = false;
    const url = URL.createObjectURL(blob);
    await playAudioUrl(url, true);
  } catch (err) {
    showToast('Preview failed: ' + (err.message || 'server unreachable'));
  } finally {
    ttsLoading = false;
    ttsPlaying = false;
    ttsAudio = null;
    updateTTSIcon();
  }
}

// Play a single audio URL, returns a promise that resolves when playback ends
// skipRevoke=true for preview (URL not from cache)
function playAudioUrl(url, skipRevoke) {
  return new Promise((resolve, reject) => {
    ttsAudio = new Audio(url);
    ttsAudio.addEventListener('ended', () => {
      if (skipRevoke) URL.revokeObjectURL(url);
      ttsAudio = null;
      resolve();
    });
    ttsAudio.addEventListener('error', (e) => {
      if (skipRevoke) URL.revokeObjectURL(url);
      ttsAudio = null;
      reject(e);
    });
    ttsAudio.play().catch(reject);
  });
}

async function speakText(text, mood, intensity) {
  console.log('[TTS] speakText called — enabled:', ttsEnabled, 'muted:', ttsMuted);
  if (!ttsEnabled || ttsMuted) return;
  // Stop any current playback
  stopTTS();
  ttsCancelled = false;

  const cleaned = cleanTextForTTS(text);
  if (!cleaned) { console.log('[TTS] cleaned text is empty, skipping'); return; }

  const sentences = splitSentences(cleaned);
  const instruct = buildTTSInstruct(mood || 'cheerful', intensity || 'moderate');
  console.log('[TTS] pipelined generation —', sentences.length, 'sentences');

  ttsLoading = true;
  updateTTSIcon();

  try {
    // Pipeline: fetch next sentence while playing current one
    let nextFetch = fetchTTSAudio(sentences[0], instruct);

    for (let i = 0; i < sentences.length; i++) {
      if (ttsCancelled) break;
      console.log('[TTS] generating sentence', i + 1, '/', sentences.length, ':', sentences[i].slice(0, 50));

      // Wait for the current sentence's audio
      const audioUrl = await nextFetch;
      if (ttsCancelled) break;

      // Start fetching the NEXT sentence while we play this one
      if (i + 1 < sentences.length) {
        nextFetch = fetchTTSAudio(sentences[i + 1], instruct);
      }

      // Play current sentence
      ttsLoading = false;
      ttsPlaying = true;
      updateTTSIcon();
      console.log('[TTS] playing sentence', i + 1);

      await playAudioUrl(audioUrl);
      if (ttsCancelled) break;

      // Show loading again if more sentences coming
      if (i + 1 < sentences.length) {
        ttsLoading = true;
        ttsPlaying = false;
        updateTTSIcon();
      }
    }
  } catch (err) {
    if (!ttsCancelled) {
      console.error('[TTS] error:', err);
      showToast('TTS unavailable: ' + (err.message || 'server unreachable'));
    }
  } finally {
    ttsPlaying = false;
    ttsLoading = false;
    ttsCancelled = false;
    ttsAudio = null;
    updateTTSIcon();
    console.log('[TTS] done');
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
  if (ttsLoading) {
    btn.innerHTML = '&#9676;'; // loading circle
  } else if (ttsPlaying) {
    btn.innerHTML = '&#128266;'; // loud speaker (playing)
  } else if (ttsMuted) {
    btn.innerHTML = '&#128263;'; // muted speaker
  } else {
    btn.innerHTML = '&#128264;'; // normal speaker (ready)
  }
  btn.classList.toggle('tts-loading', ttsLoading);
  btn.classList.toggle('tts-playing', ttsPlaying && !ttsLoading);
  btn.classList.toggle('tts-muted', ttsMuted && !ttsPlaying && !ttsLoading);
}
