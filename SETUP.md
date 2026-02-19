# Moni-Talk Setup & Reference Guide

## Quick Start (After PC Restart)

Everything runs in WSL2 Ubuntu. Open a WSL terminal and follow these steps in order.

### 1. Start Ollama (LLM Server)

Ollama is a systemd service, so it should auto-start with WSL. Verify:

```bash
systemctl status ollama
```

If it's not running:

```bash
sudo systemctl start ollama
```

Confirm it's responding:

```bash
curl http://localhost:11434/v1/models
```

You should see a JSON list of your installed models.

**Endpoint:** `http://localhost:11434`
**Config:** `/etc/systemd/system/ollama.service`
**Environment:** `OLLAMA_HOST=0.0.0.0`, `OLLAMA_ORIGINS=*`

---

### 2. Start the TTS Server (Voice)

```bash
cd /mnt/c/Users/joshu/moni-talk/server
bash start.sh
```

Or manually:

```bash
cd /mnt/c/Users/joshu/moni-talk/server
python tts_server.py --port 8880
```

Wait for `"Model loaded"` and `"Uvicorn running on 0.0.0.0:8880"` in the output.

Confirm it's responding:

```bash
curl http://localhost:8880/api/tts/health
```

Should return `{"status":"ok","model":"loaded"}`.

**Endpoint:** `http://localhost:8880`
**Reference voice:** `server/voices/monika.wav`

---

### 3. Start Tailscale (Remote Access)

Tailscale allows you to use Moni-Talk from your iPad/iPhone via the Ollama server.

```bash
tailscale serve --bg http://localhost:11434
```

**Important:** After every WSL restart, the Tailscale serve config is lost. You must re-run this command.

Verify Tailscale is connected:

```bash
tailscale status
```

**Tailscale URL:** `https://xturbo-1.tail3b3470.ts.net`

---

### 4. Open Moni-Talk

The app itself is a static GitHub Pages site. No server needed for the frontend.

**URL:** https://turbodog111.github.io/moni-talk/

Or open the local file directly:

```
C:\Users\joshu\moni-talk\index.html
```

In the app settings, make sure:
- **Provider** is set to Ollama
- **Ollama endpoint** is `http://localhost:11434` (or `http://[::1]:11434` if IPv4 is flaky)
- **TTS endpoint** is `http://localhost:8880`

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Browser can't reach localhost:11434 | Try `http://[::1]:11434` (IPv6) or restart WSL: `wsl --shutdown` then reopen |
| Ollama won't start | Check logs: `journalctl -u ollama -n 50` |
| TTS server crashes on startup | Make sure GPU drivers are loaded. Check CUDA: `nvidia-smi` |
| Tailscale serve not working | Make sure WSL is in NAT mode (default), NOT mirrored networking |
| `sudo` commands hang in Claude Code | Run sudo commands in a real WSL terminal instead |

---

## Repository Structure

```
moni-talk/
├── index.html              Main app (single page, all screens)
├── SETUP.md                This file
│
├── css/
│   ├── base.css            Theme variables, layout, buttons, forms
│   ├── chat.css            Chat bubbles, message actions, status bars, side panels
│   ├── room.css            Room mode canvas and sprite display
│   └── vn.css              Visual novel layout, affinity panel, day/phase display
│
├── js/
│   ├── config.js           Models, relationships, moods, story phases, prompts
│   ├── state.js            Global state variables, DOM refs, screen management
│   ├── app.js              Init, event listeners, theme toggle
│   ├── chat.js             Chat CRUD, message rendering, send/receive, streaming
│   ├── ai.js               AI provider dispatch (OpenRouter, Puter, Ollama, Gemini)
│   ├── story.js            Story mode: phases, days, affinity, poem writing
│   ├── adventure.js        Adventure mode: tag parsing, game state, status bar
│   ├── vn.js               Visual novel sprites, affinity panel, day display
│   ├── room.js             Room mode: MAS-style sprite composition on canvas
│   ├── profile.js          User profile load/save, profile prompt builder
│   ├── memory.js           Persistent memory extraction and retrieval
│   ├── tts.js              Text-to-speech: voice profiles, mood mapping, playback
│   ├── sync.js             Cloud sync via Puter.js KV store
│   ├── settings.js         Settings modal: providers, API keys, models
│   └── benchmark.js        Model benchmarking suite with comparison tables
│
├── server/
│   ├── tts_server.py       FastAPI TTS server (Qwen3-TTS + voice cloning)
│   ├── generate_reference.py  Generate Monika reference voice clip
│   ├── requirements.txt    Python deps: qwen-tts, fastapi, uvicorn, soundfile
│   ├── start.sh            WSL2 startup script
│   └── voices/
│       └── monika.wav      Reference voice for cloning
│
├── sprites/
│   ├── location/           Backgrounds (spaceroom day/night)
│   └── monika/             Layered sprite parts
│       ├── a/              Accessories (ribbon)
│       ├── b/              Body base layers
│       ├── c/              Clothing layers
│       ├── f/              Face parts (eyes, brows, mouth, blush, tears)
│       ├── h/              Hair layers
│       └── t/              Table/chair furniture
│
└── *.png                   Character profile pictures (Monika, Sayori, Natsuki, Yuri)
```

---

## App Modes

### Chat Mode
Free-form conversation with Monika. Adjustable relationship level (Stranger through In Love). Mood system tracks her emotional state across the conversation. Side panel shows mood ring, mood journal, memories, and stats.

### Story Mode
Interactive DDLC visual novel. Multi-day narrative with phase progression (morning, club meeting, free time, poem writing, walk home). Affinity tracking for all four girls. Branching choices. Checkpoint save/load system. Visual novel sprites and backgrounds.

### Adventure Mode
Text-based RPG called "The Poem Labyrinth." Monika acts as Game Master in a fantasy world built from the club members' poems and personalities. Four domains to explore (Sayori's Meadow, Natsuki's Bakehouse, Yuri's Library, Monika's Void). HP system, inventory, collectible Heart Fragments. Side panel shows game state.

---

## AI Providers

| Provider | Setup | Notes |
|----------|-------|-------|
| **Ollama** | Local WSL2 service | Free, unlimited, private. Best for local use. |
| **Puter** | Built-in (no key needed) | Free tier via puter.js. Claude Sonnet, GPT-4o Mini, etc. |
| **OpenRouter** | API key from openrouter.ai | Free tier models available. |
| **Gemini** | API key from aistudio.google.com | Free tier: 15 req/min, 1500/day. |

---

## Key Technical Details

- **State persistence:** LocalStorage (`moni_talk_chats_v2`, `moni_talk_profile`, etc.)
- **Cloud sync:** Puter.js KV store (optional sign-in)
- **Streaming:** All providers support streaming responses (SSE for Gemini/OpenRouter, NDJSON for Ollama)
- **Think-tag filtering:** Strips `<think>...</think>` blocks from models like Qwen3 in real-time
- **State tags:** AI responses start with `[MOOD:word:intensity] [DRIFT:category]` tags (parsed and stripped before display)
- **Adventure tags:** `[SCENE:location] [HP:number] [ITEM:name] [REMOVE:name]` parsed for game state
- **Sprite engine:** Room mode composites 10+ PNG layers onto a canvas (MAS-style expression system)
- **TTS voices:** 6 voice profiles with mood-aware speech instructions. Voice cloning from reference audio.
