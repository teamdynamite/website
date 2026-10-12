// Glyph field: a faint grid of code characters. Glyphs near the pointer
// scramble and turn purple. A click sends a ripple across the grid.
(() => {
  const canvas = document.querySelector('[data-js-background]');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  const CELL = 24;
  const FONT = '14px "JetBrains Mono", monospace';
  const GLYPHS = '{}[]()<>;:=+-*/&|!?#$%01';
  const RADIUS = 180;
  const RIPPLE_SPEED = 600; // px per second
  const RIPPLE_WIDTH = 40;
  const RIPPLE_LIFE = 2; // seconds
  const LEVELS = 32;

  // Precomputed fill styles from faint black (cold) to purple (hot).
  const STYLES = Array.from({ length: LEVELS }, (_, i) => {
    const t = i / (LEVELS - 1);
    const r = Math.round(164 * t);
    const g = Math.round(61 * t);
    const b = Math.round(255 * t);
    const a = (0.08 + 0.6 * t).toFixed(3);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  });

  const pointer = { x: 0, y: 0, tx: 0, ty: 0, active: false };
  const ripples = [];
  let width = 0;
  let height = 0;
  let cols = 0;
  let rows = 0;
  let offsetX = 0;
  let offsetY = 0;
  let cells = [];
  let clearZone = null;
  let frameId = 0;
  let lastTime = 0;

  const randomGlyph = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)];

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cols = Math.ceil(width / CELL) + 1;
    rows = Math.ceil(height / CELL) + 1;
    offsetX = (width - (cols - 1) * CELL) / 2;
    offsetY = (height - (rows - 1) * CELL) / 2;
    cells = Array.from({ length: cols * rows }, () => ({ glyph: randomGlyph(), heat: 0 }));
  }

  // An ellipse around the main content where the background fades out,
  // so the text stays easy to read.
  function measureClearZone() {
    const children = document.querySelectorAll('main > *');
    if (!children.length) return;
    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (const child of children) {
      const rect = child.getBoundingClientRect();
      left = Math.min(left, rect.left);
      top = Math.min(top, rect.top);
      right = Math.max(right, rect.right);
      bottom = Math.max(bottom, rect.bottom);
    }
    const color = getComputedStyle(document.body).backgroundColor;
    clearZone = {
      x: (left + right) / 2,
      y: (top + bottom) / 2,
      rx: ((right - left) / 2) * 1.3 + 40,
      ry: ((bottom - top) / 2) * 1.6 + 40,
      inner: color.replace(/^rgba?\(([^,]+),([^,]+),([^,)]+).*$/, 'rgba($1,$2,$3, 0.9)'),
      outer: color.replace(/^rgba?\(([^,]+),([^,]+),([^,)]+).*$/, 'rgba($1,$2,$3, 0)'),
    };
  }

  function drawClearZone() {
    if (!clearZone) return;
    ctx.save();
    ctx.translate(clearZone.x, clearZone.y);
    ctx.scale(clearZone.rx, clearZone.ry);
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    gradient.addColorStop(0, clearZone.inner);
    gradient.addColorStop(0.7, clearZone.inner);
    gradient.addColorStop(1, clearZone.outer);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // `dt` is the elapsed time in 60 fps frames. The rates below are tuned per
  // 60 fps frame and scaled by `dt`, so the effect looks the same at any
  // refresh rate.
  function update(time, dt) {
    const follow = 1 - 0.75 ** dt;
    const rise = 1 - 0.7 ** dt;
    const decay = 0.94 ** dt;
    const flicker = 1 - (1 - 0.0008) ** dt;

    pointer.x += (pointer.tx - pointer.x) * follow;
    pointer.y += (pointer.ty - pointer.y) * follow;

    for (let i = ripples.length - 1; i >= 0; i--) {
      ripples[i].age = (time - ripples[i].start) / 1000;
      if (ripples[i].age > RIPPLE_LIFE) ripples.splice(i, 1);
    }

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = cells[row * cols + col];
        const x = offsetX + col * CELL;
        const y = offsetY + row * CELL;
        let target = 0;

        if (pointer.active) {
          const d = Math.hypot(x - pointer.x, y - pointer.y);
          if (d < RADIUS) {
            const t = 1 - d / RADIUS;
            target = t * t * (3 - 2 * t);
          }
        }

        for (const ripple of ripples) {
          const d = Math.abs(Math.hypot(x - ripple.x, y - ripple.y) - ripple.age * RIPPLE_SPEED);
          if (d < RIPPLE_WIDTH) {
            target = Math.max(target, (1 - d / RIPPLE_WIDTH) * (1 - ripple.age / RIPPLE_LIFE));
          }
        }

        if (target > cell.heat) {
          cell.heat += (target - cell.heat) * rise;
        } else {
          cell.heat *= decay;
        }

        if (cell.heat > 0.15 && Math.random() < 1 - (1 - cell.heat * 0.25) ** dt) {
          cell.glyph = randomGlyph();
        } else if (Math.random() < flicker) {
          // Idle flicker, so the field is never fully still.
          cell.glyph = randomGlyph();
          cell.heat = Math.max(cell.heat, 0.25);
        }
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, width, height);
    ctx.font = FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = cells[row * cols + col];
        ctx.fillStyle = STYLES[Math.min(LEVELS - 1, Math.round(cell.heat * (LEVELS - 1)))];
        ctx.fillText(cell.glyph, offsetX + col * CELL, offsetY + row * CELL);
      }
    }

    drawClearZone();
  }

  function loop(time) {
    const dt = lastTime ? Math.min((time - lastTime) / (1000 / 60), 3) : 1;
    lastTime = time;
    update(time, dt);
    draw();
    frameId = requestAnimationFrame(loop);
  }

  function start() {
    cancelAnimationFrame(frameId);
    lastTime = 0;
    if (reducedMotion.matches) {
      draw();
    } else {
      frameId = requestAnimationFrame(loop);
    }
  }

  window.addEventListener('pointermove', (event) => {
    if (!pointer.active) {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    }
    pointer.tx = event.clientX;
    pointer.ty = event.clientY;
    pointer.active = true;
  });

  window.addEventListener('pointerdown', (event) => {
    ripples.push({ x: event.clientX, y: event.clientY, start: performance.now(), age: 0 });
  });

  window.addEventListener('pointerup', (event) => {
    if (event.pointerType === 'touch') pointer.active = false;
  });

  document.documentElement.addEventListener('pointerleave', () => {
    pointer.active = false;
  });

  window.addEventListener('blur', () => {
    pointer.active = false;
  });

  window.addEventListener('resize', () => {
    resize();
    measureClearZone();
    if (reducedMotion.matches) draw();
  });

  reducedMotion.addEventListener('change', start);

  resize();
  document.fonts.load(FONT).finally(() => {
    measureClearZone();
    start();
  });
})();
