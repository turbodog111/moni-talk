// ====== CURSOR EFFECTS ======
// Green trail + water-drop ripple on click
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

  // --- Trail ---
  const TRAIL_LEN = 22;
  const trail = [];
  document.addEventListener('mousemove', e => {
    trail.push({ x: e.clientX, y: e.clientY });
    if (trail.length > TRAIL_LEN) trail.shift();
  });

  // --- Ripples: { x, y, r, maxR, life, lw, fill } ---
  const ripples = [];
  document.addEventListener('click', e => {
    const x = e.clientX, y = e.clientY;
    // Center splash (filled dot)
    ripples.push({ x, y, r: 0, maxR: 7,  life: 1,    lw: 0,   fill: true  });
    // Inner ring
    ripples.push({ x, y, r: 1, maxR: 30, life: 0.85, lw: 1.2, fill: false });
    // Outer ring (slight delay for stagger)
    setTimeout(() => ripples.push({ x, y, r: 2, maxR: 62, life: 1, lw: 1.5, fill: false }), 55);
  });

  // --- Render loop ---
  function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Trail: oldest → dimmest/smallest, newest → brightest/biggest
    const n = trail.length;
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 1;   // 0 = oldest, 1 = newest
      const radius = 0.8 + t * 3.8;
      const alpha  = 0.04 + t * 0.62;
      ctx.beginPath();
      ctx.arc(trail[i].x, trail[i].y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(72,187,120,${alpha.toFixed(2)})`;
      if (t > 0.6) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(72,187,120,0.55)';
      }
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Ripples
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      // Ease-out expansion: fast at first, slows near maxR
      rp.r = Math.min(rp.r + (rp.maxR - rp.r) * 0.12 + 0.5, rp.maxR);
      rp.life -= rp.fill ? 0.055 : 0.026;
      if (rp.life <= 0) { ripples.splice(i, 1); continue; }

      const alpha = Math.max(0, rp.life * 0.8);
      ctx.beginPath();
      ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);

      if (rp.fill) {
        ctx.fillStyle = `rgba(72,187,120,${alpha.toFixed(2)})`;
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(72,187,120,0.6)';
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        ctx.strokeStyle = `rgba(72,187,120,${alpha.toFixed(2)})`;
        ctx.lineWidth = rp.lw;
        ctx.stroke();
      }
    }

    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
})();
