// ====== TTS (Text-to-Speech) ======

const TTS_VOICE_PROFILES = {
  tara:  { label: 'Tara',  desc: 'Warm and confident female voice. Clear and expressive — best default for Monika.' },
  leah:  { label: 'Leah',  desc: 'Soft and gentle female voice. Intimate and soothing.' },
  jess:  { label: 'Jess',  desc: 'Bright and energetic female voice. Upbeat and lively.' },
  mia:   { label: 'Mia',   desc: 'Sweet and youthful female voice. Cheerful and endearing.' },
  zoe:   { label: 'Zoe',   desc: 'Cool and composed female voice. Calm and poised.' },
  leo:   { label: 'Leo',   desc: 'Warm male voice. Friendly and natural.' },
  dan:   { label: 'Dan',   desc: 'Deep male voice. Smooth and confident.' },
  zac:   { label: 'Zac',   desc: 'Energetic male voice. Bright and expressive.' }
};

function getVoiceProfile() {
  return TTS_VOICE_PROFILES[ttsVoice] || TTS_VOICE_PROFILES.tara;
}

function getVoiceId() {
  return ttsVoice || 'tara';
}

// Map moods to Orpheus emotion tags injected into text
// Tags: <laugh> <chuckle> <sigh> <gasp> <groan> <yawn> <sniffle> <cough>
const TTS_MOOD_TAGS = {
  cheerful:    '<chuckle>',
  playful:     '<laugh>',
  thoughtful:  '<sigh>',
  melancholic: '<sigh>',
  excited:     '<gasp>',
  tender:      '',
  teasing:     '<chuckle>',
  curious:     '',
  nostalgic:   '<sigh>',
  flustered:   '<gasp>',
  calm:        '',
  passionate:  ''
};

let ttsPlaying = false;
let ttsLoading = false;
let ttsQueue = [];       // queued audio URLs to play next
let ttsCancelled = false; // flag to abort sentence pipeline
let ttsAudioUnlocked = false; // iOS audio context unlock state

// Persistent audio element — reused across all TTS playback.
// Mobile browsers only allow Audio.play() without a gesture if the *same*
// element was previously activated by a gesture.  Creating `new Audio()`
// each time loses that activation, which is why auto-play after an async
// response was blocked while the preview button (direct gesture) worked.
const ttsAudioEl = new Audio();

// iOS/Safari requires a user gesture to unlock audio playback.
// We play a tiny silent buffer on the first tap to permanently unlock
// the persistent element so future .play() calls succeed without gestures.
function unlockAudioContext() {
  if (ttsAudioUnlocked) return;
  // Unlock Web Audio API context
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
    ctx.close();
  } catch (_) {}
  // Unlock the persistent HTMLAudioElement
  ttsAudioEl.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
  ttsAudioEl.play().then(() => { ttsAudioEl.pause(); ttsAudioEl.src = ''; }).catch(() => {});
  ttsAudioUnlocked = true;
  // Remove listeners once unlocked
  document.removeEventListener('touchstart', unlockAudioContext, true);
  document.removeEventListener('touchend', unlockAudioContext, true);
  document.removeEventListener('click', unlockAudioContext, true);
}
document.addEventListener('touchstart', unlockAudioContext, true);
document.addEventListener('touchend', unlockAudioContext, true);
document.addEventListener('click', unlockAudioContext, true);

// Audio cache — keyed by text, stores blob URLs for instant replay
const ttsCache = new Map();
const TTS_CACHE_MAX = 50; // max cached entries

// Inject Orpheus emotion tag at the start of text based on mood
function injectEmotionTag(text, mood, intensity) {
  if (intensity === 'subtle') return text; // no emotion tag for subtle moods
  const tag = TTS_MOOD_TAGS[mood] || '';
  if (!tag) return text;
  return tag + ' ' + text;
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
  ttsAudioEl.pause();
  ttsAudioEl.onended = null;
  ttsAudioEl.onerror = null;
  ttsAudioEl.src = '';
  ttsPlaying = false;
  ttsLoading = false;
  updateTTSIcon();
}

// Fetch audio for a single chunk of text (with caching)
async function fetchTTSAudio(text) {
  // Check cache first
  const cacheKey = text;
  if (ttsCache.has(cacheKey)) {
    console.log('[TTS] cache hit:', text.slice(0, 30));
    return ttsCache.get(cacheKey);
  }

  const resp = await fetch(ttsEndpoint + '/v1/audio/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'orpheus',
      input: text,
      voice: getVoiceId(),
      response_format: 'wav'
    })
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
    const resp = await fetch(ttsEndpoint + '/v1/audio/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'orpheus',
        input: 'Hey, it\'s me, Monika! <chuckle> How are you doing today?',
        voice: profileKey,
        response_format: 'wav'
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
    updateTTSIcon();
  }
}

// Play a single audio URL, returns a promise that resolves when playback ends.
// Reuses the persistent ttsAudioEl so mobile gesture-unlock carries over.
// skipRevoke=true for preview (URL not from cache)
function playAudioUrl(url, skipRevoke) {
  return new Promise((resolve, reject) => {
    const audio = ttsAudioEl;
    const cleanup = () => {
      audio.onended = null;
      audio.onerror = null;
      if (skipRevoke) URL.revokeObjectURL(url);
    };
    audio.onended = () => { cleanup(); resolve(); };
    audio.onerror = (e) => { cleanup(); reject(e); };
    audio.src = url;
    audio.play().catch(err => {
      cleanup();
      reject(err);
    });
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
  // Inject emotion tag into the first sentence based on mood
  if (sentences.length > 0) {
    sentences[0] = injectEmotionTag(sentences[0], mood || 'cheerful', intensity || 'moderate');
  }
  console.log('[TTS] pipelined generation —', sentences.length, 'sentences');

  ttsLoading = true;
  updateTTSIcon();

  try {
    // Pipeline: fetch next sentence while playing current one
    let nextFetch = fetchTTSAudio(sentences[0]);

    for (let i = 0; i < sentences.length; i++) {
      if (ttsCancelled) break;
      console.log('[TTS] generating sentence', i + 1, '/', sentences.length, ':', sentences[i].slice(0, 50));

      // Wait for the current sentence's audio
      const audioUrl = await nextFetch;
      if (ttsCancelled) break;

      // Start fetching the NEXT sentence while we play this one
      if (i + 1 < sentences.length) {
        nextFetch = fetchTTSAudio(sentences[i + 1]);
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
    updateTTSIcon();
    console.log('[TTS] done');
  }
}

async function testTTSConnection() {
  try {
    const resp = await fetch(ttsEndpoint + '/v1/audio/voices', { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) throw new Error('status ' + resp.status);
    const data = await resp.json();
    const voices = data.voices || data;
    const count = Array.isArray(voices) ? voices.length : Object.keys(voices).length;
    showToast(`TTS connected! ${count} voices available`, 'success');
    return true;
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
