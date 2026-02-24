// ====== ACHIEVEMENTS & XP ======

const ACHIEVEMENTS = [
  // Chat
  { id: 'first_message', name: 'First Words',    desc: 'Say hello',                           group: 'Chat' },
  { id: 'familiar',      name: 'Familiar Face',  desc: '25 messages sent',                    group: 'Chat' },
  { id: 'regular',       name: 'Regular',        desc: '100 messages sent',                   group: 'Chat' },
  { id: 'dedicated',     name: 'Dedicated',      desc: '500 messages sent',                   group: 'Chat' },
  { id: 'daily_visit',   name: 'Daily Visit',    desc: 'Come back on 3 separate days',        group: 'Chat' },
  // Story
  { id: 'story_day1',    name: 'Opening Chapter', desc: 'Begin the story',                    group: 'Story' },
  { id: 'affinity_25',   name: 'Growing Closer',  desc: 'Reach the first milestone with any girl', group: 'Story' },
  { id: 'affinity_50',   name: 'Heart to Heart',  desc: 'Reach the second milestone',         group: 'Story' },
  { id: 'affinity_75',   name: 'Soulbound',       desc: 'Reach the highest milestone',        group: 'Story' },
  { id: 'all_milestones',name: 'Club President',  desc: 'First milestone with all 4 girls',   group: 'Story' },
  // Adventure
  { id: 'first_adventure', name: 'Into the Unknown', desc: 'Start your first adventure',                   group: 'Adventure' },
  { id: 'domain_walker',   name: 'Domain Walker',    desc: 'Explore beyond the Clubroom',                  group: 'Adventure' },
  { id: 'three_realms',    name: 'Three Realms',     desc: 'Find all three main domains',                  group: 'Adventure' },
  { id: 'first_fragment',  name: 'Fragment Seeker',  desc: 'Something precious lies within',               group: 'Adventure' },
  { id: 'heartmender',     name: 'Heartmender',      desc: 'Collect all 3 Heart Fragments',                group: 'Adventure' },
  { id: 'void_gazer',      name: 'Void Gazer',       desc: 'What waits beyond the fragments?',            group: 'Adventure' },
  { id: 'survivor',        name: 'Survivor',          desc: 'Reach turn 25 in a single run',               group: 'Adventure' },
  // Misc
  { id: 'first_open',     name: 'First Impression', desc: 'Just be yourself',                group: 'Misc' },
  { id: 'voice_on',       name: 'Voice Activated',  desc: 'Let her speak',                   group: 'Misc' },
  { id: 'benchmark_run',  name: 'Benchmark Runner', desc: 'Put the model to the test',       group: 'Misc' },
];

// --- Core state ---
let _xp = parseInt(localStorage.getItem(STORAGE.XP) || '0');
let _unlockedIds = new Set(JSON.parse(localStorage.getItem(STORAGE.ACHIEVEMENTS) || '[]'));
let _claimedEvents = new Set(JSON.parse(localStorage.getItem(STORAGE.XP_EVENTS) || '[]'));

// --- Toast queue ---
let _achToastQueue = [];
let _achToastActive = false;

// --- Level helpers ---
function getLevel(points) {
  let idx = 0;
  for (let i = LEVEL_TIERS.length - 1; i >= 0; i--) {
    if (points >= LEVEL_TIERS[i].xp) { idx = i; break; }
  }
  const tier = LEVEL_TIERS[idx];
  const next = LEVEL_TIERS[idx + 1];
  return {
    idx,
    name: tier.name,
    xpStart: tier.xp,
    xpNext: next ? next.xp : tier.xp,
  };
}

// --- XP grant ---
function grantXp(amount) {
  const prevLevel = getLevel(_xp);
  _xp += amount;
  localStorage.setItem(STORAGE.XP, _xp);
  const newLevel = getLevel(_xp);
  if (newLevel.idx > prevLevel.idx) {
    showToast(`You\'ve become a ${newLevel.name}! ⭐`, 'success');
  }
  updateXpDisplay();
}

// --- One-time XP grant (anti-farming) ---
function grantXpOnce(eventId, amount) {
  if (_claimedEvents.has(eventId)) return;
  _claimedEvents.add(eventId);
  localStorage.setItem(STORAGE.XP_EVENTS, JSON.stringify([..._claimedEvents]));
  grantXp(amount);
}

// --- Achievement unlock ---
function checkAchievement(id) {
  if (_unlockedIds.has(id)) return;
  const ach = ACHIEVEMENTS.find(a => a.id === id);
  if (!ach) return;
  _unlockedIds.add(id);
  localStorage.setItem(STORAGE.ACHIEVEMENTS, JSON.stringify([..._unlockedIds]));
  grantXp(15);
  showAchievementToast(ach);
}

// --- Display update ---
function updateXpDisplay() {
  const sub = $('chatListSub');
  if (!sub) return;
  const level = getLevel(_xp);
  sub.textContent = level.name;
  sub.classList.add('level-active');
}

// --- Achievement toast ---
function showAchievementToast(ach) {
  _achToastQueue.push(ach);
  if (!_achToastActive) _processAchToastQueue();
}

function _processAchToastQueue() {
  if (!_achToastQueue.length) { _achToastActive = false; return; }
  _achToastActive = true;
  const ach = _achToastQueue.shift();
  const el = $('achievementToast');
  if (!el) { _achToastActive = false; return; }
  el.textContent = `⭐ ${ach.name} · ${ach.desc} · +15 XP`;
  el.classList.add('visible');
  setTimeout(() => {
    el.classList.remove('visible');
    setTimeout(_processAchToastQueue, 400);
  }, 4000);
}

// --- Progress tab render ---
function renderProgressTab() {
  const el = $('progressTabContent');
  if (!el) return;
  const level = getLevel(_xp);
  const xpInLevel = _xp - level.xpStart;
  const xpNeeded = level.xpNext > level.xpStart ? level.xpNext - level.xpStart : 1;
  const pct = level.xpNext > level.xpStart ? Math.min(100, Math.round(xpInLevel / xpNeeded * 100)) : 100;
  const unlockCount = _unlockedIds.size;
  const groups = ['Chat', 'Story', 'Adventure', 'Misc'];

  el.innerHTML = `
    <div class="progress-level-label">Level ${level.idx} &mdash; ${level.name}</div>
    <div class="progress-xp-bar-wrap"><div class="progress-xp-bar-fill" style="width:${pct}%"></div></div>
    <div class="progress-xp-label">${xpInLevel} / ${xpNeeded} XP to next level</div>
    <div class="progress-ach-count">${unlockCount} / ${ACHIEVEMENTS.length} Achievements Unlocked</div>
    ${groups.map(g => {
      const achs = ACHIEVEMENTS.filter(a => a.group === g);
      return `
        <div class="progress-section-label">&mdash; ${g.toUpperCase()} &mdash;&mdash;&mdash;&mdash;&mdash;&mdash;</div>
        <div class="progress-ach-grid">
          ${achs.map(a => {
            const unlocked = _unlockedIds.has(a.id);
            return `<div class="progress-ach-card ${unlocked ? 'unlocked' : 'locked'}">
              ${unlocked
                ? `<div class="progress-ach-name">⭐ ${a.name}</div><div class="progress-ach-desc">${a.desc}</div>`
                : `<div class="progress-ach-desc">🔒 ${a.desc}</div>`}
            </div>`;
          }).join('')}
        </div>`;
    }).join('')}
  `;
}

// --- Init (runs on load) ---
(function initAchievements() {
  // Daily visit tracking
  const today = new Date().toISOString().slice(0, 10);
  const visitDates = new Set(JSON.parse(localStorage.getItem(STORAGE.VISIT_DATES) || '[]'));
  if (!visitDates.has(today)) {
    visitDates.add(today);
    localStorage.setItem(STORAGE.VISIT_DATES, JSON.stringify([...visitDates]));
  }
  if (visitDates.size >= 3) checkAchievement('daily_visit');

  // First open
  checkAchievement('first_open');

  // Sync display
  updateXpDisplay();
})();
