// ====== CURSOR EFFECTS ======
// Settings-driven: color, trail density, click effect (ripple / hearts / lightning)
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

  // --- Settings ---
  const S = {
    color:       localStorage.getItem('moni_effects_color')           || 'pink',
    trailLen:    parseInt(localStorage.getItem('moni_effects_trail')) || 60,
    clickEffect: localStorage.getItem('moni_effects_click')           || 'ripple',
  };

  function rgb(a) {
    return S.color === 'pink'
      ? `rgba(199,87,122,${a})`
      : `rgba(72,187,120,${a})`;
  }

  function shadowColor() {
    return S.color === 'pink' ? 'rgba(199,87,122,0.55)' : 'rgba(72,187,120,0.55)';
  }

  // --- Trail ---
  const TRAIL_MAX_AGE = 900; // ms
  const trail = [];
  document.addEventListener('mousemove', e => {
    trail.push({ x: e.clientX, y: e.clientY, t: Date.now() });
    if (trail.length > S.trailLen) trail.shift();
  });

  // --- Ripples: { x, y, r, maxR, life, lw, fill } ---
  const ripples = [];

  // --- Hearts: { x, y, vx, vy, life, size } ---
  const hearts = [];

  // --- Lightning bolts: { pts, life } ---
  const bolts = [];

  function jaggedBolt(ox, oy, angle, len) {
    const pts = [{ x: ox, y: oy }];
    let cx = ox, cy = oy, a = angle;
    for (let i = 0; i < 4; i++) {
      a += (Math.random() - 0.5) * 1.0;
      cx += Math.cos(a) * (len / 4);
      cy += Math.sin(a) * (len / 4);
      pts.push({ x: cx, y: cy });
    }
    return pts;
  }

  document.addEventListener('click', e => {
    const x = e.clientX, y = e.clientY;

    if (S.clickEffect === 'ripple') {
      ripples.push({ x, y, r: 0,  maxR: 7,  life: 1,    lw: 0,   fill: true  });
      ripples.push({ x, y, r: 1,  maxR: 30, life: 0.85, lw: 1.2, fill: false });
      setTimeout(() => ripples.push({ x, y, r: 2, maxR: 62, life: 1, lw: 1.5, fill: false }), 55);

    } else if (S.clickEffect === 'hearts') {
      for (let i = 0; i < 7; i++) {
        const angle = (i / 7) * Math.PI * 2 + Math.random() * 0.4;
        hearts.push({
          x, y,
          vx: Math.cos(angle) * (1.5 + Math.random() * 2),
          vy: Math.sin(angle) * (1.5 + Math.random() * 2) - 1.5,
          life: 1.0,
          size: 10 + Math.random() * 10,
        });
      }

    } else if (S.clickEffect === 'lightning') {
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        const len = 40 + Math.random() * 30;
        bolts.push({ pts: jaggedBolt(x, y, angle, len), life: 1.0 });
      }
    }
  });

  // --- Render loop ---
  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Trail: evict stale / excess points, draw oldest→dimmest to newest→brightest
    const now = Date.now();
    while (trail.length > S.trailLen) trail.shift();
    while (trail.length > 0 && now - trail[0].t > TRAIL_MAX_AGE) trail.shift();
    const n = trail.length;
    for (let i = 0; i < n; i++) {
      const t       = n > 1 ? i / (n - 1) : 1;
      const ageFade = 1 - (now - trail[i].t) / TRAIL_MAX_AGE;
      const radius  = (0.8 + t * 3.8) * ageFade;
      const alpha   = (0.04 + t * 0.62) * ageFade;
      if (alpha < 0.005) continue;
      ctx.beginPath();
      ctx.arc(trail[i].x, trail[i].y, radius, 0, Math.PI * 2);
      ctx.fillStyle = rgb(alpha.toFixed(2));
      if (t > 0.6 && ageFade > 0.3) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = shadowColor();
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Ripples
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
        ctx.shadowColor = shadowColor();
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.strokeStyle = rgb(alpha.toFixed(2));
        ctx.lineWidth = rp.lw;
        ctx.stroke();
      }
    }

    // Hearts
    for (let i = hearts.length - 1; i >= 0; i--) {
      const h = hearts[i];
      h.x += h.vx;
      h.y += h.vy;
      h.vy += 0.05; // gravity
      h.life -= 0.028;
      if (h.life <= 0) { hearts.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, h.life);
      ctx.font = `${h.size}px serif`;
      ctx.fillStyle = rgb(1);
      ctx.fillText('♥', h.x, h.y);
      ctx.globalAlpha = 1;
    }

    // Lightning bolts
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      b.life -= 0.07;
      if (b.life <= 0) { bolts.splice(i, 1); continue; }
      ctx.beginPath();
      ctx.moveTo(b.pts[0].x, b.pts[0].y);
      for (let j = 1; j < b.pts.length; j++) ctx.lineTo(b.pts[j].x, b.pts[j].y);
      ctx.strokeStyle = rgb(Math.max(0, b.life).toFixed(2));
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);

  // --- Exposed update function (called by settings handlers) ---
  window.updateEffectsSettings = function (patch) {
    Object.assign(S, patch);
    trail.length = 0;
    ripples.length = 0;
    hearts.length = 0;
    bolts.length = 0;
  };
})();
