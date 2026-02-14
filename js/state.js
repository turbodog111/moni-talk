// ====== STATE ======
let provider = localStorage.getItem(STORAGE.PROVIDER) || 'puter';
let apiKey = localStorage.getItem(STORAGE.API) || '';
let selectedModel = localStorage.getItem(STORAGE.MODEL_OR) || OPENROUTER_MODELS[0].id;
let puterModel = localStorage.getItem(STORAGE.MODEL_PUTER) || PUTER_MODELS[0].id;
let ollamaModel = localStorage.getItem(STORAGE.MODEL_OLLAMA) || 'qwen2.5:14b-instruct-q6_K';
let ollamaEndpoint = localStorage.getItem(STORAGE.OLLAMA_ENDPOINT) || 'http://localhost:11434';
let geminiKey = localStorage.getItem(STORAGE.GEMINI_API) || '';
let geminiModel = localStorage.getItem(STORAGE.MODEL_GEMINI) || GEMINI_MODELS[0].id;
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

// ====== DOM ======
const $ = id => document.getElementById(id);
const screens = { chatList: $('screenChatList'), profile: $('screenProfile'), newChat: $('screenNewChat'), chat: $('screenChat') };
const chatListBody = $('chatListBody');
const relSlider = $('relSlider'), relLabel = $('relLabel'), relDesc = $('relDesc');
const chatArea = $('chatArea'), typingIndicator = $('typingIndicator');
const userInput = $('userInput'), sendBtn = $('sendBtn');
const chatHeaderSub = $('chatHeaderSub');
const contextLabel = $('contextLabel'), contextFill = $('contextFill');
const syncModal = $('syncModal'), syncDot = $('syncDot');
const syncSignedOut = $('syncSignedOut'), syncSignedIn = $('syncSignedIn');
const syncUsername = $('syncUsername'), syncStateText = $('syncStateText');
const settingsModal = $('settingsModal');
const providerSelect = $('providerSelect'), providerHint = $('providerHint');
const orModelSelect = $('orModelSelect'), puterModelSelect = $('puterModelSelect');
const openrouterFields = $('openrouterFields'), puterFields = $('puterFields'), ollamaFields = $('ollamaFields'), geminiFields = $('geminiFields');
const apiKeyInput = $('apiKeyInput'), toast = $('toast');
const ollamaModelSelect = $('ollamaModelSelect'), ollamaEndpointInput = $('ollamaEndpointInput');
const geminiModelSelect = $('geminiModelSelect'), geminiKeyInput = $('geminiKeyInput');

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

function renderMarkdown(text) {
  let h = escapeHtml(text);
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*(.+?)\*/g, '<em>$1</em>');
  h = h.replace(/`(.+?)`/g, '<code>$1</code>');
  h = h.split(/\n{2,}/).map(p => `<p>${p.trim()}</p>`).join('');
  h = h.replace(/\n/g, '<br>');
  return h;
}