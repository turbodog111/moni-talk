// ====== CURSOR EFFECTS ======
// Settings-driven: color, trail density/width, click effect (ripple / hearts / lightning)
(function () {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:99999;';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const TRAIL_LEN = 60; // hardcoded — no UI control

  // --- Settings ---
  const S = {
    enabled:       localStorage.getItem('moni_effects_enabled') !== 'false',
    color:         localStorage.getItem('moni_effects_color')         || 'pink',
    trailWidth:    parseFloat(localStorage.getItem('moni_effects_trail_width')) || 1.0,
    clickEffect:   localStorage.getItem('moni_effects_click')         || 'ripple',
    heartsCount:   parseInt(localStorage.getItem('moni_effects_hearts_count')) || 7,
    lightningSize: localStorage.getItem('moni_effects_lightning_size')|| 'medium',
  };

  // Lightning size presets
  const LIGHTNING_PRESETS = {
    small:  { count: 7,  minLen: 50,  maxLen: 90,  segs: 6,  lw: 1.5 },
    medium: { count: 12, minLen: 90,  maxLen: 170, segs: 8,  lw: 2.5 },
    large:  { count: 18, minLen: 150, maxLen: 250, segs: 10, lw: 4.0 },
  };

  function rgb(a) {
    return S.color === 'pink'
      ? `rgba(199,87,122,${a})`
      : `rgba(72,187,120,${a})`;
  }
  function glowColor() {
    return S.color === 'pink' ? 'rgba(199,87,122,0.7)' : 'rgba(72,187,120,0.7)';
  }

  // --- Trail ---
  const TRAIL_MAX_AGE = 700; // ms
  const trail = [];
  document.addEventListener('mousemove', e => {
    if (!S.enabled) return;
    trail.push({ x: e.clientX, y: e.clientY, t: Date.now() });
    if (trail.length > TRAIL_LEN) trail.shift();
  });

  // --- Ripples ---
  const ripples = [];

  // --- Hearts ---
  const hearts = [];

  // --- Lightning: bolts + flash ---
  const bolts = [];
  const flashes = [];

  function jaggedBolt(ox, oy, angle, len, segs) {
    const pts = [{ x: ox, y: oy }];
    let cx = ox, cy = oy, a = angle;
    for (let i = 0; i < segs; i++) {
      a += (Math.random() - 0.5) * 1.5;
      cx += Math.cos(a) * (len / segs);
      cy += Math.sin(a) * (len / segs);
      pts.push({ x: cx, y: cy });
    }
    return pts;
  }

  document.addEventListener('click', e => {
    if (!S.enabled) return;
    const x = e.clientX, y = e.clientY;

    if (S.clickEffect === 'ripple') {
      ripples.push({ x, y, r: 0,  maxR: 7,  life: 1,    lw: 0,   fill: true  });
      ripples.push({ x, y, r: 1,  maxR: 30, life: 0.85, lw: 1.2, fill: false });
      setTimeout(() => ripples.push({ x, y, r: 2, maxR: 62, life: 1, lw: 1.5, fill: false }), 55);

    } else if (S.clickEffect === 'hearts') {
      for (let i = 0; i < S.heartsCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 3 + Math.random() * 5;
        hearts.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 2,
          life: 1.0,
          size: 12 + Math.random() * 14,
        });
      }

    } else if (S.clickEffect === 'lightning') {
      const P = LIGHTNING_PRESETS[S.lightningSize] || LIGHTNING_PRESETS.medium;
      flashes.push({ x, y, r: 8, life: 1.0 });

      for (let i = 0; i < P.count; i++) {
        const angle = (i / P.count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        const len = P.minLen + Math.random() * (P.maxLen - P.minLen);
        const pts = jaggedBolt(x, y, angle, len, P.segs);
        bolts.push({ pts, life: 1.0, lw: P.lw });

        // Branch off midpoint of every other bolt
        if (i % 2 === 0) {
          const mid = pts[Math.floor(pts.length / 2)];
          const branchAngle = angle + (Math.random() > 0.5 ? 1 : -1) * (0.6 + Math.random() * 0.6);
          const branchLen = len * 0.45;
          bolts.push({ pts: jaggedBolt(mid.x, mid.y, branchAngle, branchLen, Math.max(3, P.segs - 2)), life: 0.85, lw: P.lw * 0.6 });
        }
      }
    }
  });

  // --- Render loop ---
  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!S.enabled) {
      requestAnimationFrame(tick);
      return;
    }

    const now = Date.now();

    // ---- Trail: fluid gradient line ----
    while (trail.length > TRAIL_LEN) trail.shift();
    while (trail.length > 0 && now - trail[0].t > TRAIL_MAX_AGE) trail.shift();
    const n = trail.length;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 1; i < n; i++) {
      const t       = i / (n - 1);
      const ageFade = 1 - (now - trail[i].t) / TRAIL_MAX_AGE;
      const alpha   = (0.06 + t * 0.9) * ageFade;
      const width   = (0.4 + t * 5.0) * ageFade * S.trailWidth;

      if (alpha < 0.005) continue;

      ctx.beginPath();
      ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
      ctx.lineTo(trail[i].x, trail[i].y);
      ctx.strokeStyle = rgb(alpha.toFixed(3));
      ctx.lineWidth = width;

      if (t > 0.7 && ageFade > 0.35) {
        ctx.shadowBlur = 14;
        ctx.shadowColor = glowColor();
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // ---- Ripples ----
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      rp.r = Math.min(rp.r + (rp.maxR - rp.r) * 0.12 + 0.5, rp.maxR);
      rp.life -= rp.fill ? 0.055 : 0.026;
      if (rp.life <= 0) { ripples.splice(i, 1); continue; }
      const alpha = Math.max(0, rp.life * 0.8);
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
      if (rp.fill) {
        ctx.fillStyle = rgb(alpha.toFixed(2));
        ctx.shadowBlur = 10;
        ctx.shadowColor = glowColor();
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.strokeStyle = rgb(alpha.toFixed(2));
        ctx.lineWidth = rp.lw;
        ctx.stroke();
      }
    }

    // ---- Hearts ----
    for (let i = hearts.length - 1; i >= 0; i--) {
      const h = hearts[i];
      h.x  += h.vx;
      h.y  += h.vy;
      h.vy += 0.12;
      h.vx *= 0.97;
      h.life -= 0.022;
      if (h.life <= 0) { hearts.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, h.life);
      ctx.font = `${h.size}px serif`;
      ctx.fillStyle = rgb(1);
      ctx.shadowBlur = 8;
      ctx.shadowColor = glowColor();
      ctx.fillText('♥', h.x, h.y);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    // ---- Lightning flash ----
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.r   += (120 - f.r) * 0.35;
      f.life -= 0.14;
      if (f.life <= 0) { flashes.splice(i, 1); continue; }
      const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
      grad.addColorStop(0,   rgb((f.life * 0.55).toFixed(2)));
      grad.addColorStop(0.4, rgb((f.life * 0.25).toFixed(2)));
      grad.addColorStop(1,   rgb('0'));
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // ---- Lightning bolts ----
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      b.life -= 0.07;
      if (b.life <= 0) { bolts.splice(i, 1); continue; }

      ctx.beginPath();
      ctx.moveTo(b.pts[0].x, b.pts[0].y);
      for (let j = 1; j < b.pts.length; j++) ctx.lineTo(b.pts[j].x, b.pts[j].y);

      ctx.strokeStyle = rgb(Math.max(0, b.life * 0.9).toFixed(2));
      ctx.lineWidth = b.lw + 3;
      ctx.shadowBlur = 18;
      ctx.shadowColor = glowColor();
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = `rgba(255,255,255,${Math.max(0, b.life * 0.85).toFixed(2)})`;
      ctx.lineWidth = b.lw * 0.5;
      ctx.stroke();
    }

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);

  // --- Exposed update function (called by settings handlers) ---
  window.updateEffectsSettings = function (patch) {
    const wasEnabled = S.enabled;
    Object.assign(S, patch);
    // Clear particles when disabling
    if (wasEnabled && !S.enabled) {
      trail.length = 0; ripples.length = 0;
      hearts.length = 0; bolts.length = 0; flashes.length = 0;
    }
  };
})();
