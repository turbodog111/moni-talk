// ====== STATE ======
let provider = localStorage.getItem(STORAGE.PROVIDER) || 'puter';
let puterModel = localStorage.getItem(STORAGE.MODEL_PUTER) || PUTER_MODELS[0].id;
let ollamaModel = localStorage.getItem(STORAGE.MODEL_OLLAMA) || 'qwen2.5:14b-instruct-q6_K';
let ollamaEndpoint = localStorage.getItem(STORAGE.OLLAMA_ENDPOINT) || 'http://localhost:11434';
let llamacppEndpoint = localStorage.getItem(STORAGE.LLAMACPP_ENDPOINT) || 'http://localhost:8080';
let llamacppModel = localStorage.getItem(STORAGE.LLAMACPP_MODEL) || '';
let chats = JSON.parse(localStorage.getItem(STORAGE.CHATS) || '[]');
let profile = JSON.parse(localStorage.getItem(STORAGE.PROFILE) || '{}');
let activeChatId = null;
let isGenerating = false;
let newChatMode = 'chat';
let selectedWords = [];
let wordMap = {};
let syncStatus = 'offline'; // offline | syncing | synced | error
let puterUser = null;
let syncTimer = null;
let deletedChatIds = new Set(JSON.parse(localStorage.getItem('moni_talk_deleted_ids') || '[]'));
let currentTheme = localStorage.getItem('moni_talk_theme') || 'system';
let memories = JSON.parse(localStorage.getItem('moni_talk_memories') || '[]');
let pendingImage = null;
let activeAbortController = null; // AbortController for current streaming generation
let ttsEnabled = localStorage.getItem('moni_talk_tts_enabled') === 'true';
let ttsEndpoint = localStorage.getItem('moni_talk_tts_endpoint') || 'http://spark-0af9:5005';
let ttsMuted = localStorage.getItem('moni_talk_tts_muted') === 'true';
let ttsVoice = localStorage.getItem('moni_talk_tts_voice') || 'tara';
let ttsProvider = localStorage.getItem('moni_talk_tts_provider') || 'orpheus';
let ttsEndpointQwen = localStorage.getItem('moni_talk_tts_endpoint_qwen') || 'http://spark-0af9:8880';

// ====== DOM ======
const $ = id => document.getElementById(id);
const screens = { chatList: $('screenChatList'), profile: $('screenProfile'), newChat: $('screenNewChat'), chat: $('screenChat') };
const chatListBody = $('chatListBody');
const relSlider = $('relSlider'), relLabel = $('relLabel'), relDesc = $('relDesc');
const chatArea = $('chatArea'), typingIndicator = $('typingIndicator');
const userInput = $('userInput'), sendBtn = $('sendBtn');
const chatHeaderSub = $('chatHeaderSub');
const contextLabel = $('contextLabel'), contextFill = $('contextFill');
const syncDot = $('syncDot');
const toolsSyncSignedOut = $('toolsSyncSignedOut'), toolsSyncSignedIn = $('toolsSyncSignedIn');
const toolsSyncUsername = $('toolsSyncUsername'), toolsSyncStateText = $('toolsSyncStateText');
const settingsModal = $('settingsModal');
const providerSelect = $('providerSelect'), providerHint = $('providerHint');
const puterModelSelect = $('puterModelSelect');
const puterFields = $('puterFields'), ollamaFields = $('ollamaFields'), llamacppFields = $('llamacppFields');
const toast = $('toast');
const ollamaModelSelect = $('ollamaModelSelect'), ollamaEndpointInput = $('ollamaEndpointInput');
const llamacppEndpointInput = $('llamacppEndpointInput');
const llamacppModelSelect = $('llamacppModelSelect');

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

function renderMarkdown(text) {
  let h = escapeHtml(text);

  // Detect [POEM]...[/POEM] blocks and replace with styled poetry
  h = h.replace(/\[POEM\]([\s\S]*?)\[\/POEM\]/gi, (match, poemContent) => {
    const lines = poemContent.trim().split('\n').map(l => l.trim()).filter(l => l).join('<br>');
    return `<div class="poem-block"><div class="poem-text">${lines}</div><div class="poem-attr">&mdash; Monika</div></div>`;
  });

  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*(.+?)\*/g, '<em>$1</em>');
  h = h.replace(/`(.+?)`/g, '<code>$1</code>');
  h = h.split(/\n{2,}/).map(p => `<p>${p.trim()}</p>`).join('');
  h = h.replace(/\n/g, '<br>');
  return h;
}