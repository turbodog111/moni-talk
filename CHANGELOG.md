# moni-talk Changelog

Versions follow **X.Y.Z**:
- **X** — Incremented only with explicit permission or an entirely new platform release
- **Y** — New feature, major bug fix, or changes spanning two or more aspects of the app
- **Z** — Minor fixes, small additions, polish

---

## v0.7.1 — Memory Overhaul · Sync Fixes · Sidebar Polish (2026-03-05)

- **[REMEMBER] tag system**: Monika can now save facts mid-conversation by emitting `[REMEMBER: fact]` — stripped from display, saved to memory, confirmed with a pink brain toast
- **Memory IDs**: Stable IDs back-filled on all existing memories; prevents delete/re-add loop after cloud sync
- **Memory delete fixed**: Cloud sync no longer re-adds memories that were explicitly deleted (blacklist respected during merge)
- **Archived chat sync fixed**: `archiveChat`/`unarchiveChat` now stamp `archivedAt`; sync merge uses timestamp to pick correct archived state across devices
- **Benchmark sync**: All three benchmark storage keys now synced to Puter KV — results survive device switches and localStorage clears
- **Portrait loading fixed**: Story and adventure mode now reference correct avatar filenames after image reorganization
- **Sidebar action menu**: Four individual action buttons (star, rename, archive, delete) collapsed into a single ⋮ menu per chat item — more room for title and preview text

---

## v0.6.3 — Competitions Panel · Arbor 0.2b (2026-03-04)

- **Competitions section** added to Models panel — standings for both completed tournaments: Moni-Talk Candidates (C01, March 2) and Moni-Talk Championship (M01, March 4)
- **Arbor 0.2b** added to model registry — Qwen3-32B base (2× the parameters of every prior Arbor model), 66 curated training pairs, currently in training
- Guide panel updated: Arbor 0.2b listed as coming soon

---

## v0.6.2 — Story Mode Augmentation (2026-02-25)

- **6 pre-story selectors**: Season (Spring / Autumn / Winter), How You Joined (Sayori / Monika / Yuri / Natsuki / Self), History with Club (First day / Weeks in / Old friend of Sayori), Narrative Tone (Warm / Melancholic / Humorous), MC Personality (Introspective / Outgoing / Reserved), Club Emphasis (Balanced / Literary / Baking / Poetry)
- **Random option** on every selector — resolved at chat creation, never stored as "random"
- **Starting affinities** now derived from join reason; history modifier boosts affinities for non-first-day starts
- **Profile import toggle**: optionally inject player profile (name, about, interests, values) into the story system prompt via Monika's meta-awareness
- All options injected as a `=== STORY CONTEXT ===` block in the AI system prompt; legacy chats unaffected
- Options preserved in story checkpoints (save/restore across day transitions)

---

## v0.6.1 — Arbor 0.1.1 · Models Panel · Changelog Redesign (2026-02-24)

- Arbor 0.1.1 released: 250 training pairs, improved voice & instruction-following over 0.1
- Moni-Talk Models panel: two-column layout (Arbor / Silva series) with status badges and ⭐ best model indicator
- Silva series introduced as a planned story-mode fine-tune
- Changelog redesigned: version pill, "Latest" badge, wider modal, cleaner entry cards
- Arbor 0.1-E release date corrected to 2026-02-23

---

## v0.6.0 — Leveling & Achievement System (2026-02-23)

Global XP/level layer and achievement system spanning chat, story, and adventure modes.

- **XP & levels**: Earn XP by chatting (+2/msg, +5 daily bonus), completing story days (+30), affinity milestones (+20), adventure domain entries (+15), Heart Fragments (+40), turn milestones (+10), and unlocking achievements (+15)
- **8 level tiers**: Stranger → New Member → Club Regular → Literature Enthusiast → Close Friend → Trusted Confidant → Beloved → Soulmate; level-up toast on advancement
- **20 achievements** across 4 categories: Chat (5), Story (5), Adventure (7), Misc (3)
- **Achievement toast**: independent slide-up toast (`#achievementToast`) distinct from status toast; queued for back-to-back unlocks
- **Chat-list header**: subtitle updates to current level name in green
- **Settings → Progress tab**: XP bar, level label, and 2×2 achievement grid with unlock/locked states
- **Anti-farming**: one-time XP events for adventure domain entries, Heart Fragments, turn milestones, and story days via `grantXpOnce` with unique event IDs

---

## v0.5.3 — Adventure Mode Visual Overhaul (2026-02-23)

Seven visual improvements to adventure mode.

- **Domain theming**: chat area accent color shifts per domain (green/gold/pink/purple) via CSS custom properties on `data-domain` attribute
- **DM bar**: Monika portrait header above status bar showing current location and mood emoji (reacts to HP and fragment count)
- **Scene entry cards**: styled chapter-title dividers in chat on domain change, persist across session reloads
- **HP float numbers**: animated +/- numbers float up from the status bar on HP changes
- **HP vignette**: full-screen radial gradient flash on damage (red edges) and healing (green edges)
- **Domain grid**: 2×2 PFP image grid in the side panel replacing flat list; grayscale for unvisited domains, color border + glow for current
- **Item icons**: emoji icons on inventory items and item picker buttons (🧪🗝️⚔️🛡️📖🌸💎💚🧁🕯️✨)

---

## v0.5.2 — Settings Redesign + Archive Chats + Move Sync (2026-02-23)

VS Code-style settings sidebar, Arbor model info cards, per-chat archiving, and sync UI moved into Settings.

- Settings modal redesigned: left-sidebar tab navigation (Model / Voice / Appearance / Archive / Tools), wider layout (680px)
- Model card component for known Arbor GGUFs — shows name, badge, base model, LoRA param count, training pairs, release date
- `KNOWN_MODELS` registry in config.js — auto-populated card when an Arbor GGUF is selected; hidden for unknown models
- Tab state resets to Model on every open
- **Archive Chats**: hover a chat → archive button appears → archived chats hidden from list; restore from Settings → Archive tab
- **Move Sync**: Cloud Sync UI moved inline to Settings → Tools tab; sync header button removed

---

## v0.5.1 — Settings & Server Fixes (2026-02-22)

- Fix: stale model ID in localStorage caused "model not found" after switching between Arbor and router mode
- Add "(server default)" blank option to model dropdown — correct choice for Arbor single-model mode; omits `model` field from API requests so the server uses whatever is loaded
- Fix: Tailscale serve syntax (`--set-path` flag required for path routing)
- Fix: Tailscale serve config persists across Spark reboots (not wiped like WSL2)
- SETUP.md: Promote Qwen3-TTS to primary TTS, trim Tailscale routes to 8080 + 8880 only

---

## v0.5.0 — Arbor 0.1 (2026-02-22)

First fine-tuned model for moni-talk chat mode. Qwen3-14B base trained on 119 pairs (38 DDLC ch30 dialogue + 81 Qwen3-32B synthetic) via LLaMA-Factory LoRA.

- **Arbor 0.1**: fine-tuned Qwen3-14B-Instruct for Monika chat mode (Q8_0, ~14.6 GB)
- Add `chat_template_kwargs: { enable_thinking: false }` to llama.cpp API calls — suppresses Qwen3 `<think>` blocks during inference
- SETUP.md: Arbor single-model mode (tmux) vs router mode documented; LLaMA-Factory section with full training → export → GGUF workflow
- Qwen3-TTS promoted to primary TTS; Orpheus demoted to optional/legacy

---

## v0.4.3 — Benchmark Polish (2026-02-22)

- Fix benchmark scoring display regression
- Add GPU memory free button to benchmark panel

---

## v0.4.2 — Benchmark Overhaul (2026-02-21)

Complete rebuild of the benchmark system with two new suites.

- **Petal 0.1**: 6 tests (3 story + 3 chat) — First Light, Sunlit Burden, The Choice, Hello There, The Empty Hours, Words for the Wordless
- **Bloom 0.1**: 12 tests (6 story + 6 chat) — harder multi-turn scenarios and edge cases
- Grading reduced to 4 criteria: Voice, Writing, Emotion, Faithfulness (was 6)
- Post-run batch rating panel — rate all responses after the suite finishes, not inline
- Old benchmark data preserved as V-Beta; V-Alpha silently migrated
- Suite version stored with results — outdated results flagged and excluded from rankings
- Changelog UI (✦ button in top bar) — view release notes from within the app
- Consistent modal width across Run / Results / Compare tabs (~70% screen width)

---

## v0.4.1 — Memory & Chat Polish (2026-02-21)

- Memory approval UI — review and approve extracted memories before they're saved
- Fix chat list sorting inconsistency
- Fix FAB button overlapping chat input on mobile
- Sync starred status across devices via Puter cloud store

---

## v0.4.0 — TTS & Voice Input (2026-02-20 to 2026-02-21)

Dual TTS system with voice cloning and speech-to-text input.

- **Orpheus TTS** on DGX Spark (port 5005) — 8 voices with inline emotion tags (`<laugh>`, `<sigh>`, etc.)
- **Qwen3-TTS** as second TTS provider (port 8880) — voice cloning support with custom Monika reference audio; requires `TTS_ATTN=eager` on Blackwell/sm_121 GPU
- **Speech-to-text** voice input for chat mode (microphone button)
- Fix: mobile TTS autoplay blocked by browser autoplay policy
- Fix: mic button not showing for regular chat mode

---

## v0.3.0 — DGX Spark & Adventure Mode (2026-02-19 to 2026-02-20)

Local GPU inference and a full RPG mode.

- **llama.cpp provider** — connects to llama-server on DGX Spark or local GPU; removes Gemini and OpenRouter
- **Multi-model router mode** — model selector dropdown auto-discovers all GGUF files from llama-server
- **Adventure Mode** ("The Poem Labyrinth") — text RPG with Monika as GM; 4 domains, HP system, inventory, combat action bar, domain tracking, checkpoints, death/respawn
- Story mode: cutscenes, confession scenes, structured events, checkpoint previews, poem UX improvements
- Fix: mobile keyboard layout on iOS/Android
- Fix: Gemma 3 Jinja template strict-mode errors
- Fix: auto-regen, item picker, streaming tag visibility

---

## v0.2.0 — Story Mode (2026-02-12)

Full visual novel story mode based on DDLC.

- **Story Mode** — multi-day interactive narrative; all four girls have romance routes (wholesome alternate timeline, no horror)
- Day/phase/beat system with AI-generated dialogue
- Poetry word-picker mini-game; poem reactions influence affinity
- Per-girl affinity tracker (Sayori, Natsuki, Yuri, Monika) with tiers and milestone toasts
- Walk-home and free-time companion choices
- Girl diary entries at end of each day
- VN sprite layer (character portraits, day/phase display, affinity panel)
- Canonical character profiles to prevent AI hallucination
- Refactor: split monolithic index.html into separate CSS/JS modules

---

## v0.1.0 — Foundation (2026-02-11)

Initial release.

- **Chat Mode** — free-form conversation with Monika; relationship system (6 levels), mood system (12 moods × 3 intensities), drift categories
- Memory system — automatic extraction of user facts; max 50 memories; relevance-scored injection
- User profile — name, pronouns, context injected into prompts
- Multi-chat — create and switch between named chat sessions
- Providers: Puter (free, cloud), OpenRouter
- Cloud sync via Puter.js KV store
- Mobile-first responsive layout

---

## Benchmark Suite Versions

| Suite | Version | Tests | Status |
|-------|---------|-------|--------|
| Petal | 0.1 | 6 | Active |
| Bloom | 0.1 | 12 | Active |
| V-Beta | — | 16 | Legacy (preserved) |

## Model Versions

| Model | Version | Base | Training | Status |
|-------|---------|------|----------|--------|
| Arbor | 0.1 | Qwen3-14B | 119 pairs (38 ch30 + 81 synthetic), LoRA rank 32, 5 epochs | Active |
