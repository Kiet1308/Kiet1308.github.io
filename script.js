/* =====================================================================
   tvk1308 — decompiled
   ===================================================================== */
(() => {
  'use strict';
  window.__tvk = true;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const sleep = ms => wait(RM ? 0 : ms);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const fontsReady = (document.fonts && document.fonts.load)
    ? Promise.race([
        Promise.all([
          document.fonts.load('800 100px "Martian Mono"'),
          document.fonts.load('500 12px "Martian Mono"'),
        ]),
        wait(2500),
      ]).catch(() => {})
    : Promise.resolve();

  /* ------------------------------------------------------------------
     reveal on scroll
     ------------------------------------------------------------------ */
  function reveal() {
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
    $$('[data-reveal]').forEach(el => io.observe(el));
  }

  /* ------------------------------------------------------------------
     HUD + rail: which pass are we in
     ------------------------------------------------------------------ */
  function passes() {
    const hudPass = $('[data-hud-pass]'), hudWorld = $('[data-hud-world]');
    const fill = $('[data-hud-fill]'), pct = $('[data-hud-pct]');
    const rail = $$('.rail a');
    const WORLD = {
      machine: 'luau vm · attached · pid 1308',
      paper: 'notebook · ô li · red pen uncapped',
    };
    let current = null;

    const set = sec => {
      if (sec === current) return;
      current = sec;
      const p = sec.dataset.pass, w = sec.dataset.world;
      hudPass.innerHTML = `pass ${p}/07<span class="hud__pname"> · ${sec.dataset.passName}</span>`;
      hudWorld.textContent = WORLD[w];
      document.documentElement.dataset.world = w;
      rail.forEach(a => a.classList.toggle('is-active', a.dataset.rail === p));
    };

    const io = new IntersectionObserver(es => {
      es.forEach(e => { if (e.isIntersecting) set(e.target); });
    }, { rootMargin: '-48% 0px -48% 0px' });
    $$('[data-pass]').forEach(s => io.observe(s));

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const max = document.documentElement.scrollHeight - innerHeight;
        const p = max > 0 ? clamp(scrollY / max, 0, 1) : 0;
        fill.style.width = (p * 100).toFixed(1) + '%';
        pct.textContent = String(Math.round(p * 100)).padStart(3, '0') + '%';
      });
    };
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ------------------------------------------------------------------
     00 · the hexfield: a live memory dump whose bytes spell the name
     ------------------------------------------------------------------ */
  function hexfield() {
    const hero = $('.hero'), cv = $('.hero__hex');
    const ctx = cv && cv.getContext('2d');
    if (!hero || !ctx) return;

    const NAME = 'tvk1308';
    const HEX2 = Array.from({ length: 256 }, (_, i) => i.toString(16).toUpperCase().padStart(2, '0'));
    const HEX1 = Array.from({ length: 256 }, (_, i) => (i & 15).toString(16).toUpperCase());
    const ASC = Array.from({ length: 256 }, (_, i) => (i > 32 && i < 127 ? String.fromCharCode(i) : '·'));
    // glyph colours
    const COL = [
      'rgba(235,230,218,.045)', // 0 zero bytes
      'rgba(235,230,218,.13)',  // 1 dim
      'rgba(235,230,218,.42)',  // 2 mid / edges
      '#0a0b0d',                // 3 ink, printed on a selected cell
      'rgba(255,74,36,.9)',     // 4 red glyph
      'rgba(255,74,36,.5)',     // 5 lens, outside the name
    ];
    const ZERO = 0, DIM = 1, MID = 2, INK = 3, RED = 4, REDDIM = 5;
    // cell fills: the name is drawn as a hex-editor *selection*
    const FILL = [null, '#e9e4d8', '#ff4a24', 'rgba(235,230,218,.14)', 'rgba(255,74,36,.22)'];
    const F_SEL = 1, F_RED = 2, F_EDGE = 3, F_EDGE_RED = 4;

    let W = 0, H = 0, cols = 0, rows = 0, n = 0, HX = HEX2;
    let cw = 0, ch = 0, x0 = 0, y0 = 0;
    let val, cov, del, bkt, tok, fil, gx, gy;
    let cx = -1e5, cy = -1e5, inside = false;
    let visible = true, raf = 0, lastFrame = 0, t0 = performance.now(), introPlayed = false;

    const rndByte = () => {
      const r = Math.random();
      return r < 0.34 ? 0 : r < 0.4 ? 255 : (Math.random() * 256) | 0;
    };

    function build() {
      W = cv.clientWidth; H = cv.clientHeight;
      if (!W || !H) return false;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);

      const nib = W < 700; // phones: one nibble per cell, for resolution
      HX = nib ? HEX1 : HEX2;
      const fs = nib ? 10 : W < 1200 ? 11 : 12;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `500 ${fs}px "Martian Mono", ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const chw = ctx.measureText('0').width || fs * 0.62;
      cw = Math.round(chw * (nib ? 1.7 : 3));
      ch = Math.round(fs * (nib ? 1.45 : 1.6));
      cols = Math.ceil(W / cw) + 1;
      rows = Math.ceil(H / ch) + 1;
      n = cols * rows;
      val = new Uint8Array(n); cov = new Float32Array(n); del = new Float32Array(n);
      bkt = new Uint8Array(n); tok = new Uint16Array(n); fil = new Uint8Array(n);
      gx = new Float32Array(n); gy = new Float32Array(n);

      // draw the name into a mask, then sample coverage per cell
      const m = document.createElement('canvas');
      m.width = W; m.height = H;
      const mc = m.getContext('2d', { willReadFrequently: true });
      const portrait = W / H < 0.9;
      const lines = portrait ? ['tvk', '1308'] : [NAME];
      const setFont = s => { mc.font = `800 ${s}px "Martian Mono", ui-monospace, monospace`; };
      setFont(100);
      if ('fontStretch' in mc) { try { mc.fontStretch = 'expanded'; } catch (e) { /* older engines */ } }
      const widest = Math.max(...lines.map(l => mc.measureText(l).width));
      let size = (100 * W * (portrait ? 0.88 : 0.86)) / widest;
      size = Math.min(size, (H * (portrait ? 0.21 : 0.4)) / 0.74);
      setFont(size);
      const asc = mc.measureText('k').actualBoundingBoxAscent || size * 0.74;
      const gap = asc * 0.3;
      const blockH = asc * lines.length + gap * (lines.length - 1);
      const mid = H * (portrait ? 0.43 : 0.47);
      mc.fillStyle = '#fff';
      mc.textAlign = 'center';
      mc.textBaseline = 'alphabetic';
      lines.forEach((l, i) => mc.fillText(l, W / 2, mid - blockH / 2 + asc + i * (asc + gap)));
      const data = mc.getImageData(0, 0, W, H).data;
      const a = (x, y) => {
        x |= 0; y |= 0;
        return x < 0 || y < 0 || x >= W || y >= H ? 0 : data[(y * W + x) * 4 + 3] / 255;
      };

      x0 = Math.round((W - cols * cw) / 2);
      y0 = Math.round((H - rows * ch) / 2);
      const qx = cw * 0.28, qy = ch * 0.28;
      let k = 0;
      for (let r = 0, i = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++, i++) {
          const x = x0 + c * cw + cw / 2, y = y0 + r * ch + ch / 2;
          gx[i] = x; gy[i] = y;
          const cv_ = (a(x, y) * 2 + a(x - qx, y - qy) + a(x + qx, y - qy) + a(x - qx, y + qy) + a(x + qx, y + qy)) / 6;
          cov[i] = cv_;
          // inside the letters, the bytes are the name itself: 74 76 6B 31 33 30 38 …
          val[i] = cv_ >= 0.5 ? NAME.charCodeAt(k++ % NAME.length) : rndByte();
          del[i] = introPlayed || RM ? -1 : 250 + (c / cols) * 950 + Math.random() * 450;
        }
      }
      return true;
    }

    function render(now) {
      const t = now - t0;
      const rect = cv.getBoundingClientRect();
      const scrollP = clamp((-rect.top / rect.height) * 1.3, 0, 1);

      let lx = cx - rect.left, ly = cy - rect.top;
      if (!inside && !RM) {
        // nobody's holding the lens: let it drift
        const s = now * 0.00035;
        lx = W * (0.5 + 0.36 * Math.sin(s * 1.3));
        ly = H * (0.47 + 0.16 * Math.sin(s * 2.1 + 1));
      }
      const R = clamp(W * 0.1, 70, 150), R2 = R * R;
      const decodeRow = scrollP * rows * 1.6;
      const scan = RM ? -99 : ((t * 0.011) % (rows + 24)) - 12;

      if (!RM) {
        for (let f = (n * 0.006) | 0; f--;) {
          const i = (Math.random() * n) | 0;
          if (cov[i] < 0.14) val[i] = rndByte();
        }
      }

      for (let i = 0; i < n; i++) {
        const r = (i / cols) | 0;
        const dx = gx[i] - lx, dy = gy[i] - ly;
        const lens = dx * dx + dy * dy < R2;
        const decoded = r < decodeRow;
        const v = val[i], c = cov[i];
        let b, f = 0, tk = v;
        if (c >= 0.46) {
          const age = t - del[i];
          if (age < 0) { tk = (Math.random() * 256) | 0; b = Math.random() < 0.5 ? ZERO : DIM; }
          else if (lens || decoded) { tk = 256 + v; b = INK; f = F_RED; }
          else { b = INK; f = age < 180 ? F_RED : F_SEL; }
        } else if (c >= 0.14) {
          if (lens) { tk = 256 + v; b = REDDIM; f = F_EDGE_RED; }
          else { b = MID; f = t - del[i] < 0 ? 0 : F_EDGE; }
        } else if (lens) {
          tk = 256 + v; b = v === 0 ? DIM : REDDIM;
        } else {
          if (decoded) tk = 256 + v;
          b = v === 0 ? ZERO : DIM;
          if (Math.abs(r - scan) < 1) b = b === ZERO ? DIM : MID;
        }
        bkt[i] = b; tok[i] = tk; fil[i] = f;
      }

      ctx.clearRect(0, 0, W, H);
      // selection fills, as horizontal runs so neighbouring cells merge into solid letterforms
      for (let r = 0; r < rows; r++) {
        const y = y0 + r * ch, base = r * cols;
        let c = 0;
        while (c < cols) {
          const f = fil[base + c];
          if (!f) { c++; continue; }
          let e = c + 1;
          while (e < cols && fil[base + e] === f) e++;
          ctx.fillStyle = FILL[f];
          ctx.fillRect(x0 + c * cw, y, (e - c) * cw, f <= F_RED ? ch + 0.6 : ch);
          c = e;
        }
      }
      for (let b = 0; b < COL.length; b++) {
        ctx.fillStyle = COL[b];
        for (let i = 0; i < n; i++) {
          if (bkt[i] !== b) continue;
          const tk = tok[i];
          ctx.fillText(tk < 256 ? HX[tk] : ASC[tk - 256], gx[i], gy[i]);
        }
      }
    }

    function loop(now) {
      raf = 0;
      if (!visible || document.hidden) return;
      if (now - lastFrame >= 20) { lastFrame = now; render(now); }
      raf = requestAnimationFrame(loop);
    }
    const start = () => {
      if (RM) { render(performance.now()); return; }
      if (!raf && visible) raf = requestAnimationFrame(loop);
    };

    addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      cx = e.clientX; cy = e.clientY;
      if (RM && visible && n) render(performance.now());
    }, { passive: true });
    hero.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') inside = true; });
    hero.addEventListener('pointerleave', () => { inside = false; });

    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && n) start();
    }).observe(hero);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && n) start(); });
    if (RM) addEventListener('scroll', () => { if (visible && n) render(performance.now()); }, { passive: true });

    let rT;
    addEventListener('resize', () => {
      clearTimeout(rT);
      rT = setTimeout(() => {
        if (cv.clientWidth === W && Math.abs(cv.clientHeight - H) < 140) return;
        if (build()) start();
      }, 180);
    });

    fontsReady.then(() => {
      if (!build()) return;
      introPlayed = true;
      t0 = performance.now();
      hero.classList.add('hex-on');
      start();
    });
  }

  /* ------------------------------------------------------------------
     cursor: reticle + memory address in the machine, red pen on paper
     ------------------------------------------------------------------ */
  function cursor() {
    if (!FINE) return;
    const el = $('.cursor'), addr = $('.cursor__addr');
    let x = -100, y = -100, queued = false, world = '';
    const update = () => {
      queued = false;
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      const t = document.elementFromPoint(x, y);
      const host = t && t.closest('[data-world]');
      const w = host ? host.dataset.world : 'machine';
      if (w !== world) { world = w; el.dataset.world = w; }
      el.classList.toggle('is-hot', !!(t && t.closest('a, button, .blk')));
      addr.textContent = '0x' + Math.max(0, Math.round(scrollY + y)).toString(16).toUpperCase().padStart(6, '0');
    };
    const queue = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
    addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      x = e.clientX; y = e.clientY;
      document.documentElement.classList.add('has-cursor');
      el.classList.remove('is-out');
      queue();
    }, { passive: true });
    addEventListener('scroll', queue, { passive: true });
    document.documentElement.addEventListener('mouseleave', () => el.classList.add('is-out'));
    document.documentElement.addEventListener('mouseenter', () => el.classList.remove('is-out'));
  }

  /* ------------------------------------------------------------------
     01 · debugger watch tree
     ------------------------------------------------------------------ */
  function watch() {
    $$('.wt button.wt__row').forEach(b => b.addEventListener('click', () => {
      const open = b.parentElement.classList.toggle('is-open');
      b.setAttribute('aria-expanded', String(open));
    }));
  }

  /* ------------------------------------------------------------------
     02 · control-flow graph with IDA-style edges
     ------------------------------------------------------------------ */
  function cfg() {
    const root = $('#cfg');
    if (!root) return;
    const svg = $('.cfg__edges', root);
    const node = id => $(`[data-node="${id}"]`, root);
    // [from, to, kind, fromX, toX]   t = true branch, f = false branch, u = unconditional
    const EDGES = [
      ['entry', 'games', 't', 0.3, 0.5],
      ['entry', 'anticheat', 'f', 0.7, 0.5],
      ['games', 'backend', 'u'],
      ['backend', 'services', 'u'],
      ['anticheat', 'tools', 'u'],
      ['tools', 'tovek', 'u'],
      ['services', 'exit', 'u', 0.5, 0.3],
      ['tovek', 'exit', 'u', 0.5, 0.7],
    ];

    function draw() {
      const R = root.getBoundingClientRect();
      svg.setAttribute('viewBox', `0 0 ${R.width} ${R.height}`);
      let out = '';
      EDGES.forEach(([a, b, k, fa = 0.5, fb = 0.5], i) => {
        const A = node(a).getBoundingClientRect(), B = node(b).getBoundingClientRect();
        const sx = A.left - R.left + A.width * fa, sy = A.bottom - R.top;
        const tx = B.left - R.left + B.width * fb, ty = B.top - R.top;
        const my = sy + (ty - sy) / 2;
        const d = Math.abs(sx - tx) < 1
          ? `M${sx},${sy} V${ty - 10}`
          : `M${sx},${sy} V${my} H${tx} V${ty - 10}`;
        out += `<path class="edge edge--${k}" data-e="${i}" style="--i:${i}" d="${d}"/>`;
        out += `<path class="ah ah--${k}" data-e="${i}" style="--i:${i}" d="M${tx - 6},${ty - 12} L${tx + 6},${ty - 12} L${tx},${ty - 1} Z"/>`;
        if (k !== 'u') {
          const lx = sx + (tx > sx ? 8 : -16);
          out += `<text class="elabel elabel--${k}" style="--i:${i}" x="${lx}" y="${sy + 17}">${k.toUpperCase()}</text>`;
        }
      });
      svg.innerHTML = out;
      $$('path.edge', svg).forEach(p => p.style.setProperty('--len', Math.ceil(p.getTotalLength()) + 1));
    }

    const blocks = $$('.blk', root);
    function focus(id) {
      root.classList.toggle('is-focus', !!id);
      blocks.forEach(b => b.classList.remove('hot', 'near'));
      $$('.hot', svg).forEach(e => e.classList.remove('hot'));
      if (!id) return;
      node(id).classList.add('hot');
      EDGES.forEach(([a, b], i) => {
        if (a !== id && b !== id) return;
        node(a === id ? b : a).classList.add('near');
        $$(`[data-e="${i}"]`, svg).forEach(e => e.classList.add('hot'));
      });
    }
    blocks.forEach(b => {
      b.addEventListener('mouseenter', () => focus(b.dataset.node));
      b.addEventListener('mouseleave', () => focus(null));
      b.addEventListener('focusin', () => focus(b.dataset.node));
      b.addEventListener('focusout', () => focus(null));
    });

    draw();
    fontsReady.then(draw);
    let q = false;
    const ro = new ResizeObserver(() => {
      if (q) return;
      q = true;
      requestAnimationFrame(() => { q = false; draw(); });
    });
    ro.observe(root);
    blocks.forEach(b => ro.observe(b));

    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      root.classList.add('in');
      setTimeout(() => root.classList.add('settled'), 2200);
      io.disconnect();
    }, { threshold: 0.18 });
    io.observe(root);
  }

  /* ------------------------------------------------------------------
     03 · Tovek lifter demo
     ------------------------------------------------------------------ */
  function lifter() {
    const root = $('#lifter');
    if (!root) return;
    const bcEl = $('.bc', root), srcEl = $('.src', root), evEl = $('.evidence', root);
    const btn = $('[data-lift-run]', root), stat = $('[data-lift-stat]', root);
    const phases = $$('.phases li', root);

    // [pc, label, op, args, constant, source group]
    const BC = [
      [0, '', 'GETTABLEKS', 'R2 R0 K0', '"Character"', 1],
      [1, '', 'JUMPIF', 'R2 L0', '', 2],
      [2, '', 'RETURN', 'R0 1', '', 2],
      [3, 'L0', 'NAMECALL', 'R3 R2 K1', '"FindFirstChild"', 3],
      [4, '', 'LOADK', 'R5 K2', '"HumanoidRootPart"', 3],
      [5, '', 'CALL', 'R3 3 2', '', 3],
      [6, '', 'GETTABLEKS', 'R5 R3 K3', '"Position"', 4],
      [7, '', 'SUB', 'R4 R1 R5', '', 4],
      [8, '', 'GETTABLEKS', 'R4 R4 K4', '"Magnitude"', 4],
      [9, '', 'LOADN', 'R5 32', '', 4],
      [10, '', 'JUMPIFNOTLT', 'R5 R4 L1', '', 4],
      [11, '', 'NAMECALL', 'R4 R0 K5', '"Kick"', 5],
      [12, '', 'LOADK', 'R6 K6', '"speed"', 5],
      [13, '', 'CALL', 'R4 3 1', '', 5],
      [14, '', 'RETURN', 'R0 1', '', 6],
      [15, 'L1', 'GETIMPORT', 'R4 K8', 'CFrame.new', 8],
      [16, '', 'MOVE', 'R5 R1', '', 8],
      [17, '', 'CALL', 'R4 2 2', '', 8],
      [18, '', 'SETTABLEKS', 'R4 R3 K9', '"CFrame"', 8],
      [19, '', 'RETURN', 'R0 1', '', 9],
    ];
    // [group, html]  group 0 = parent proto, 7 = structural only
    const SRC = [
      [0, '<span class="id">Remote</span>.OnServerEvent:<span class="fn">Connect</span>(<span class="kw">function</span>({p1}, {p2})'],
      [1, '    <span class="kw">local</span> {v1} = {p1}.Character'],
      [2, '    <span class="kw">if not</span> {v1} <span class="kw">then return end</span>'],
      [3, '    <span class="kw">local</span> {v2} = {v1}:<span class="fn">FindFirstChild</span>(<span class="str">"HumanoidRootPart"</span>)'],
      [4, '    <span class="kw">if</span> ({p2} - {v2}.Position).Magnitude &gt; <span class="num">32</span> <span class="kw">then</span>'],
      [5, '        {p1}:<span class="fn">Kick</span>(<span class="str">"speed"</span>)'],
      [6, '        <span class="kw">return</span>'],
      [7, '    <span class="kw">end</span>'],
      [8, '    {v2}.CFrame = CFrame.<span class="fn">new</span>({p2})'],
      [9, '<span class="kw">end</span>)'],
    ];
    const NAMES = [
      ['p1', 'player', 'OnServerEvent: arg 1 is the sender'],
      ['v1', 'character', 'read from player.Character'],
      ['v2', 'HumanoidRootPart', 'FindFirstChild("HumanoidRootPart")'],
      ['p2', null, 'no evidence: kept. no guessing.'],
    ];

    bcEl.innerHTML = BC.map(([pc, l, op, a, k, g]) =>
      `<li data-g="${g}"><span class="lbl">${l ? l + ':' : ''}</span><span class="pc">${pc}</span><span class="opc">${op}</span><span class="args">${a}</span><span class="k">${k ? '; ' + k : ''}</span></li>`
    ).join('');
    const fillNames = h => h.replace(/\{(p1|p2|v1|v2)\}/g, (_, k) => `<span class="nm" data-n="${k}">${k}</span>`);
    srcEl.innerHTML = SRC.map(([g, h]) =>
      `<li${g && g !== 7 ? ` data-g="${g}"` : ''}><span>${fillNames(h)}</span></li>`
    ).join('');

    const bcRows = $$('li', bcEl), srcRows = $$('li', srcEl);

    const mapOn = g => {
      bcRows.forEach(r => r.classList.toggle('map', r.dataset.g === g));
      srcRows.forEach(r => r.classList.toggle('map', r.dataset.g === g));
    };
    root.addEventListener('mouseover', e => {
      const li = e.target.closest('li[data-g]');
      const ok = li && (bcEl.contains(li) || (srcEl.contains(li) && (li.classList.contains('typed') || li.classList.contains('shown'))));
      mapOn(ok ? li.dataset.g : null);
    });
    root.addEventListener('mouseleave', () => mapOn(null));

    const ORDER = ['lift', 'name', 'done'];
    const setPhase = p => {
      const k = ORDER.indexOf(p);
      phases.forEach((li, i) => { li.classList.toggle('on', i === k); li.classList.toggle('past', i < k); });
    };

    function scramble(spans, from, to) {
      return new Promise(res => {
        spans.forEach(s => s.classList.add('flash'));
        if (RM) { spans.forEach(s => { s.textContent = to; s.classList.remove('flash'); }); return res(); }
        const chars = 'abcdefghijklmnopqrstuvwxyz_0123456789';
        const dur = 560, start = performance.now();
        (function step(now) {
          const p = Math.min(1, (now - start) / dur);
          const len = Math.round(from.length + (to.length - from.length) * p);
          const fixed = Math.floor(to.length * p);
          let s = to.slice(0, fixed);
          for (let i = fixed; i < len; i++) s += chars[(Math.random() * chars.length) | 0];
          spans.forEach(el => { el.textContent = s; });
          if (p < 1) requestAnimationFrame(step);
          else { spans.forEach(el => el.classList.remove('flash')); res(); }
        })(start);
      });
    }

    let running = false;
    async function run() {
      if (running) return;
      running = true;
      btn.disabled = true;
      root.classList.add('is-running');

      srcRows.forEach(r => r.classList.remove('typed', 'shown', 'map'));
      bcRows.forEach(r => r.classList.remove('seen', 'scan', 'map'));
      $$('.nm', srcEl).forEach(s => { s.textContent = s.dataset.n; s.classList.remove('named', 'kept'); });
      evEl.innerHTML = '';
      void srcEl.offsetWidth; // restart the typing animations

      setPhase('lift');
      let lines = 0;
      const show = i => {
        srcRows[i].classList.add(RM ? 'shown' : 'typed');
        lines++;
        stat.textContent = `20 instr → ${lines} lines`;
      };

      show(0);
      await sleep(320);
      for (let i = 1; i < SRC.length; i++) {
        const g = String(SRC[i][0]);
        const rows = bcRows.filter(r => r.dataset.g === g);
        for (const r of rows) { r.classList.add('scan'); await sleep(80); }
        show(i);
        await sleep(rows.length ? 340 : 200);
        rows.forEach(r => { r.classList.remove('scan'); r.classList.add('seen'); });
      }

      await sleep(380);
      setPhase('name');
      let named = 0;
      for (const [from, to, why] of NAMES) {
        const spans = $$(`.nm[data-n="${from}"]`, srcEl);
        if (to) {
          await scramble(spans, from, to);
          spans.forEach(s => s.classList.add('named'));
          named++;
        } else {
          spans.forEach(s => s.classList.add('kept'));
        }
        const li = document.createElement('li');
        if (!to) li.className = 'kept';
        li.innerHTML = `<span class="from">${from}</span><span>→</span><span class="to">${to || from}</span><span class="why">${why}</span>`;
        evEl.appendChild(li);
        await sleep(360);
      }

      setPhase('done');
      stat.textContent = `20 instr → ${SRC.length} lines · ${named} names recovered · 0 guesses`;
      root.classList.remove('is-running');
      btn.disabled = false;
      btn.innerHTML = '<span>↻</span> run again';
      running = false;
    }

    btn.addEventListener('click', run);
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      setTimeout(run, RM ? 0 : 450);
    }, { threshold: 0.35 });
    io.observe(root);
  }

  /* ------------------------------------------------------------------
     the dissolve: ordered (Bayer) dither from machine to paper
     ------------------------------------------------------------------ */
  function dither() {
    const wrap = $('.dither');
    if (!wrap) return;
    const cv = $('canvas', wrap), ctx = cv.getContext('2d');
    if (!ctx) return;
    const B = [
      0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26,
      12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
      3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
      15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
    ];
    const INK = [10, 11, 13], PAPER = [242, 236, 223], RED = [255, 74, 36];
    let lastW = 0;

    function draw() {
      const px = innerWidth < 700 ? 4 : 6;
      const w = Math.max(2, Math.ceil(wrap.clientWidth / px));
      const h = Math.max(2, Math.ceil(wrap.clientHeight / px));
      if (w === lastW && cv.height === h) return;
      lastW = w;
      cv.width = w; cv.height = h;
      const img = ctx.createImageData(w, h), d = img.data;
      for (let y = 0; y < h; y++) {
        const b = clamp((y / (h - 1) - 0.06) / 0.88, 0, 1);
        const amp = b * (1 - b) * 4; // noise fades out at both ends, so the seams are clean
        for (let x = 0; x < w; x++) {
          const v = b + amp * (Math.sin(x * 0.09 + y * 0.05) * 0.06 + Math.sin(x * 0.023 - y * 0.11) * 0.07 + (Math.random() - 0.5) * 0.12);
          const th = (B[(y & 7) * 8 + (x & 7)] + 0.5) / 64;
          let c = v > th ? PAPER : INK;
          if (c === INK && v > th - 0.06 && b > 0.18 && b < 0.82 && Math.random() < 0.08) c = RED;
          const o = (y * w + x) * 4;
          d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    }
    draw();
    let t;
    addEventListener('resize', () => { clearTimeout(t); t = setTimeout(draw, 200); });
  }

  /* ------------------------------------------------------------------
     06 · lesson: swap two inks, discover the temporary variable
     ------------------------------------------------------------------ */
  function lab() {
    const root = $('#lab');
    if (!root) return;
    const glasses = $$('.glass', root);
    const msg = $('.lab__msg', root), movesEl = $('.lab__moves', root);
    const out = $('.lab__reveal', root), codeEl = $('.lab__code code', root);
    const score = $('.lab__score', root), gradeEl = $('.lab__grade', root), gnote = $('.lab__gnote', root);
    const stream = $('.stream', root), bench = $('.bench', root);
    const INK = { red: '#d3241a', purple: '#4a2bb5' };
    const POS = { a: 0, b: 1, c: 2 };
    const el = id => glasses.find(g => g.dataset.g === id);
    let state, sel, moves, busy, solved;

    glasses.forEach(g => {
      const id = g.dataset.g;
      g.innerHTML = `
        <svg class="glass__svg" viewBox="0 0 120 170" aria-hidden="true">
          <defs><clipPath id="gclip-${id}"><path d="M19 22 L101 22 L92 151 C 91 155, 86 157, 80 157 L40 157 C 34 157, 29 155, 28 151 Z"/></clipPath></defs>
          <ellipse class="glass__shadow" cx="60" cy="164" rx="42" ry="5"/>
          <g clip-path="url(#gclip-${id})">
            <g class="liq">
              <rect x="0" y="62" width="120" height="100"/>
              <path class="wave" d="M0 62 C 15 56, 15 56, 30 62 S 45 68, 60 62 S 75 56, 90 62 S 105 68, 120 62 S 135 56, 150 62 S 165 68, 180 62 V 70 H 0 Z"/>
            </g>
          </g>
          <path class="glass__line" d="M14 18 C 40 15, 80 15, 106 18 L 95 152 C 94 158, 88 161, 80 161 L 40 161 C 32 161, 26 158, 25 152 Z"/>
          <path class="glass__line glass__line--2" d="M16 21 C 42 19, 78 18, 104 20 L 93 150 C 92 156, 86 159, 79 159 L 41 159"/>
          <path class="glass__shine" d="M31 36 L 37 136"/>
        </svg>
        <span class="glass__label">${id}</span>
        <span class="glass__what"></span>`;
      g.addEventListener('click', () => pick(id));
    });

    const say = t => { msg.textContent = t; };

    function render() {
      glasses.forEach(g => {
        const id = g.dataset.g, ink = state[id];
        if (ink) g.style.setProperty('--ink-c', INK[ink]);
        g.classList.toggle('full', !!ink);
        g.classList.toggle('sel', sel === id);
        $('.glass__what', g).textContent = ink ? `${ink} ink` : 'empty';
        g.setAttribute('aria-label', `Glass ${id}: ${ink ? ink + ' ink' : 'empty'}${sel === id ? ', picked up' : ''}`);
        g.setAttribute('aria-pressed', String(sel === id));
      });
      movesEl.textContent = `moves: ${moves.length}`;
    }

    function reset() {
      state = { a: 'red', b: 'purple', c: null };
      sel = null; moves = []; busy = false; solved = false;
      out.hidden = true;
      score.classList.remove('in');
      glasses.forEach(g => g.classList.remove('pouring'));
      render();
      say('pick up a glass.');
    }

    function nope(id, text) {
      const g = el(id);
      g.classList.remove('nope'); void g.offsetWidth; g.classList.add('nope');
      say(text);
    }

    function pick(id) {
      if (busy) return;
      if (solved) { say('solved. hit reset to go again.'); return; }
      if (sel === null) {
        if (!state[id]) return nope(id, 'that one’s empty — nothing to pour.');
        sel = id; render();
        return say(`pour ${id} into…?`);
      }
      if (sel === id) { sel = null; render(); return say('put it back. pick a glass.'); }
      if (state[id]) return nope(id, `${id} isn’t empty — you’d mix the inks.`);
      pour(sel, id);
    }

    async function pour(from, to) {
      busy = true;
      const gf = el(from), gt = el(to);
      const dir = POS[to] > POS[from] ? 1 : -1;
      const ink = INK[state[from]];
      sel = null;
      gf.style.setProperty('--tilt', `${dir * 38}deg`);
      gf.classList.remove('sel');
      gf.classList.add('pouring');
      gt.style.setProperty('--ink-c', ink);
      say('pouring…');
      await sleep(330);

      const Bn = bench.getBoundingClientRect();
      const F = $('svg', gf).getBoundingClientRect(), T = $('svg', gt).getBoundingClientRect();
      const sx = (dir > 0 ? F.right - F.width * 0.1 : F.left + F.width * 0.1) - Bn.left;
      const sy = F.top + F.height * 0.14 - Bn.top;
      const tx = T.left + T.width / 2 - Bn.left, ty = T.top + T.height * 0.32 - Bn.top;
      stream.setAttribute('pathLength', '1');
      stream.setAttribute('d', `M${sx},${sy} Q${(sx + tx) / 2},${Math.min(sy, ty) - 34} ${tx},${ty}`);
      stream.style.setProperty('--stream', ink);
      stream.classList.remove('go'); void stream.getBoundingClientRect(); stream.classList.add('go');

      gf.classList.remove('full');
      gt.classList.add('full');
      await sleep(820);
      gf.classList.remove('pouring');

      state[to] = state[from];
      state[from] = null;
      moves.push([from, to]);
      render();
      busy = false;

      if (state.a === 'purple' && state.b === 'red') {
        solved = true;
        say('done. now look at what you wrote ↓');
        showCode();
      } else {
        say(moves.length === 1 ? 'ok… now what?' : moves.length > 6 ? 'keep thinking. that’s the exercise.' : 'keep going.');
      }
    }

    function showCode() {
      const L = [
        '<span class="kw">local</span> a, b, c = <span class="str">"red"</span>, <span class="str">"purple"</span>, <span class="kw">nil</span>',
        '',
      ];
      moves.forEach(([f, t], i) => {
        L.push(`${`${t} = ${f}`.padEnd(8, ' ')}<span class="cm">-- ${i + 1}. poured ${f} into ${t}</span>`);
      });
      L.push('', '<span class="ok">-- a == "purple", b == "red"  ✓</span>');
      codeEl.innerHTML = L.join('\n');
      const n = moves.length;
      gradeEl.textContent = n <= 3 ? '10/10' : `${Math.max(5, 13 - n)}/10`;
      gnote.textContent = n <= 3 ? 'optimal.' : 'works. now in 3?';
      out.hidden = false;
      requestAnimationFrame(() => requestAnimationFrame(() => score.classList.add('in')));
      if (!RM) setTimeout(() => out.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 250);
    }

    $('[data-lab-reset]', root).addEventListener('click', reset);
    $('[data-lab-hint]', root).addEventListener('click', () => say('hint: what is the empty glass for?'));
    reset();
  }

  /* ------------------------------------------------------------------
     anti-cheat reflex: flag impossible scroll velocity
     ------------------------------------------------------------------ */
  function anticheat() {
    const toast = $('.toast');
    if (!toast) return;
    const LIMIT = 8000;
    const LINES = [
      'action: none. it’s a reflex. the good stuff is in the middle.',
      'action: logged. second strike. speedrunning my portfolio?',
      'action: whitelisted. you’re clearly a professional.',
    ];
    let hist = [[performance.now(), scrollY]];
    let strikes = 0, coolUntil = 0, ignoreUntil = performance.now() + 2500, hideT;

    document.addEventListener('click', e => {
      if (e.target.closest('a[href^="#"]')) ignoreUntil = performance.now() + 2200;
    });
    addEventListener('scroll', () => {
      const now = performance.now(), y = scrollY;
      while (hist.length > 1 && now - hist[1][0] > 220) hist.shift();
      const [t0, y0] = hist[0];
      hist.push([now, y]);
      if (strikes >= 3 || now < ignoreUntil || now < coolUntil) return;
      const v = (Math.abs(y - y0) / Math.max(now - t0, 120)) * 1000;
      if (v > LIMIT) flag(v);
    }, { passive: true });

    function flag(v) {
      strikes++;
      coolUntil = performance.now() + 12000;
      toast.innerHTML =
        `<div class="toast__head"><span>⚠ anticheat</span><span>strike ${strikes}/3</span></div>` +
        `<p><b>impossible scroll velocity</b>: ${Math.round(v).toLocaleString('en-US')} px/s (limit ${LIMIT.toLocaleString('en-US')})</p>` +
        `<p class="toast__act">${LINES[strikes - 1]}</p>`;
      toast.classList.add('is-on');
      clearTimeout(hideT);
      hideT = setTimeout(() => toast.classList.remove('is-on'), 5200);
    }
  }

  /* ------------------------------------------------------------------
     small things
     ------------------------------------------------------------------ */
  function misc() {
    $$('[data-copy]').forEach(b => b.addEventListener('click', async () => {
      const i = $('i', b);
      try {
        await navigator.clipboard.writeText(b.dataset.copy);
        i.textContent = 'copied ✓';
      } catch (e) {
        i.textContent = b.dataset.copy;
      }
      setTimeout(() => { i.textContent = 'copy'; }, 1800);
    }));
    $$('[data-year]').forEach(e => { e.textContent = String(new Date().getFullYear()); });

    console.log(
      '%c tvk1308 %c\n\nLooking for exploits? Good instinct.\nNothing here trusts the client anyway. ;)\n',
      'background:#ff4a24;color:#0a0b0d;font:700 14px monospace;padding:4px 8px',
      'color:#888;font:12px monospace'
    );
  }

  [reveal, passes, hexfield, cursor, watch, cfg, lifter, dither, lab, anticheat, misc].forEach(fn => {
    try { fn(); } catch (err) { console.error(`[${fn.name}]`, err); }
  });
})();
