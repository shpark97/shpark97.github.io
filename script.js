// ----- Theme toggle: white / dark (persisted) -----
// The initial theme is set inline in <head> to avoid a flash; this only wires the button.
(function () {
  const root = document.documentElement;
  document.getElementById('themeToggle').addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'white' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
  });
})();

// ----- News expand / collapse -----
(function () {
  const list = document.getElementById('newsList');
  const btn = document.getElementById('toggleNews');
  btn.addEventListener('click', () => {
    const open = list.classList.toggle('open');
    btn.setAttribute('aria-expanded', open);
    btn.textContent = open ? 'Show less' : 'Show all';
  });
})();

// ----- Publication filters (year + topic) -----
const pubFilters = (function () {
  const filters = document.querySelectorAll('.filter');
  const pubs = Array.from(document.querySelectorAll('.pub'));
  const empty = document.getElementById('emptyState');
  const state = { year: 'all', topic: 'all' };

  function apply() {
    let visible = 0;
    pubs.forEach((p) => {
      const py = p.dataset.year;
      const pt = (p.dataset.topic || '').split(/\s+/);
      const okYear = state.year === 'all' || state.year === py;
      const okTopic = state.topic === 'all' || pt.includes(state.topic);
      const show = okYear && okTopic;
      p.classList.toggle('hide', !show);
      if (show) visible++;
    });
    empty.hidden = visible > 0;
  }

  function set(type, val) {
    state[type] = val;
    // toggle active state within the same row
    document
      .querySelectorAll(`.filter[data-filter-type="${type}"]`)
      .forEach((b) => b.classList.toggle('active', b.dataset.filter === val));
    apply();
  }

  filters.forEach((btn) => {
    btn.addEventListener('click', () => set(btn.dataset.filterType, btn.dataset.filter));
  });

  return { reset: () => { set('year', 'all'); set('topic', 'all'); } };
})();

// ----- Smooth scroll for in-page links -----
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (id.length < 2) return;
    const target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();

    // Jumping to a paper: make sure no filter is hiding it, then flash it.
    if (a.hasAttribute('data-pub-link')) {
      if (target.classList.contains('hide')) pubFilters.reset();
      target.classList.remove('flash');
      void target.offsetWidth; // restart the animation
      target.classList.add('flash');
      // The publications section may not have been revealed yet.
      const sec = target.closest('.reveal');
      if (sec) sec.classList.add('in');
    }
    target.scrollIntoView({ behavior: 'smooth', block: a.hasAttribute('data-pub-link') ? 'center' : 'start' });
    history.replaceState(null, '', id);
  });
});

// ----- Scroll reveal for sections -----
(function () {
  const secs = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    secs.forEach((s) => s.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
  secs.forEach((s) => io.observe(s));
})();

// ----- Scroll spy: highlight the nav link of the section in view -----
(function () {
  const links = Array.from(document.querySelectorAll('.nav-links a'));
  const sections = links
    .map((l) => document.querySelector(l.getAttribute('href')))
    .filter(Boolean);

  function update() {
    const y = window.scrollY + window.innerHeight * 0.35;
    let current = sections[0];
    sections.forEach((s) => { if (s.offsetTop <= y) current = s; });
    // At the very bottom, the last section wins even if it is short.
    if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) {
      current = sections[sections.length - 1];
    }
    links.forEach((l) => l.classList.toggle('active', l.getAttribute('href') === '#' + current.id));
  }
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
})();

// ----- Back to top -----
(function () {
  const btn = document.getElementById('toTop');
  if (!btn) return;
  const toggle = () => btn.classList.toggle('show', window.scrollY > 700);
  window.addEventListener('scroll', toggle, { passive: true });
  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    history.replaceState(null, '', location.pathname + location.search);
  });
  toggle();
})();

// ----- Footer year -----
document.getElementById('year').textContent = new Date().getFullYear();

// ----- Subtle parallax on hero photo -----
(function () {
  const frame = document.querySelector('.photo-frame');
  if (!frame || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const wrap = frame.parentElement;
  wrap.addEventListener('mousemove', (e) => {
    const r = wrap.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    frame.style.transform = `rotate(${x * -2}deg) translate(${x * 4}px, ${y * 4}px)`;
  });
  wrap.addEventListener('mouseleave', () => {
    frame.style.transform = '';
  });
})();

// ----- Publication figure lightbox -----
(function () {
  const box = document.getElementById('lightbox');
  if (!box) return;
  const img = document.getElementById('lightboxImg');
  const cap = document.getElementById('lightboxCaption');
  const fig = box.querySelector('.lightbox-fig');
  let opener = null;
  let live = null;   // the live figure shown in place of the image, if any

  // Match the caption column to the figure. CSS can only shrink-wrap to the
  // image's intrinsic width, which is wrong whenever the image is limited by
  // max-height instead, so measure what actually got rendered.
  function fitCaption() {
    fig.style.width = '';
    const w = (live || img).getBoundingClientRect().width;
    if (w) fig.style.width = w + 'px';
  }

  function open(thumb) {
    const full = thumb.dataset.full;
    if (!full) return;
    opener = thumb;
    // A figure with a live version (data-live) shows that instead of the static image.
    live = thumb.dataset.live ? document.getElementById(thumb.dataset.live) : null;
    if (live) {
      live.hidden = false;
      img.hidden = true;
    } else {
      img.src = full;
      img.alt = thumb.querySelector('img') ? thumb.querySelector('img').alt : '';
    }
    // innerHTML, not textContent: captions may carry light markup such as <em>.
    cap.innerHTML = thumb.dataset.caption || '';
    box.hidden = false;
    document.body.style.overflow = 'hidden';
    fitCaption();
    box.querySelector('.lightbox-close').focus();
  }

  function close() {
    box.hidden = true;
    fig.style.width = '';
    img.src = '';
    img.hidden = false;
    if (live) { live.hidden = true; live = null; }
    document.body.style.overflow = '';
    if (opener) { opener.focus(); opener = null; }
  }

  document.querySelectorAll('.pub-thumb[data-full]').forEach((thumb) => {
    thumb.addEventListener('click', () => open(thumb));
    thumb.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(thumb); }
    });
  });

  box.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !box.hidden) close();
  });
  img.addEventListener('load', fitCaption);
  window.addEventListener('resize', () => { if (!box.hidden) fitCaption(); });
})();



// ----- Video thumbnails -----
// A thumbnail with a <video class="thumb-video"> plays it in place of its image:
// fetched only once it nears the viewport, paused while offscreen, and shown
// only once a frame is ready, so the static image covers until then.
(function () {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.querySelectorAll('.pub-thumb .thumb-video').forEach((v) => {
    const thumb = v.closest('.pub-thumb');
    v.addEventListener('loadeddata', () => thumb.classList.add('is-live'), { once: true });
    new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) {
        if (!v.src) v.src = v.dataset.src;
        v.play().catch(() => {});
      } else {
        v.pause();
      }
    }), { rootMargin: '200px' }).observe(thumb);
  });
})();

// ----- Live publication figures -----
// A figure that moves, drawn small over its static thumbnail and large in the
// lightbox (the thumbnail's data-live names the lightbox copy). Each figure
// supplies its panels, a step and a draw function, and optionally a camera to
// orbit; this wires up visibility, animation, dragging and theme changes.
function liveFigure(thumbRoot, boxRoot, fig) {
  if (!thumbRoot || !document.createElement('canvas').getContext) return;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const views = [];   // { cv, item, big, visible }
  const drawAll = () => views.forEach((v) => v.visible && fig.draw(v.cv, v.item, v.big));
  const dragging = () => fig.cam && fig.cam.dragging;

  function add(root, big) {
    fig.build(root, big).forEach(([cv, item]) => {
      const v = { cv, item, big, visible: false };
      new IntersectionObserver((es) => es.forEach((e) => {
        v.visible = e.isIntersecting;
        if (v.visible) fig.draw(cv, item, big);
      })).observe(cv);
      views.push(v);
    });
  }

  add(thumbRoot, false);
  thumbRoot.closest('.pub-thumb').classList.add('is-live');
  views.forEach((v) => fig.draw(v.cv, v.item, false));   // first paint, before any visibility callback
  if (boxRoot) add(boxRoot, true);
  if (boxRoot && fig.orbit) {
    // Drag any large panel to orbit.
    let last = null;
    boxRoot.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('.lf-p')) return;
      fig.cam.dragging = true; last = [e.clientX, e.clientY];
      e.target.setPointerCapture(e.pointerId);
    });
    boxRoot.addEventListener('pointermove', (e) => {
      if (!fig.cam.dragging) return;
      fig.orbit(e.clientX - last[0], e.clientY - last[1]);
      last = [e.clientX, e.clientY];
      drawAll();
    });
    ['pointerup', 'pointercancel'].forEach((t) => boxRoot.addEventListener(t, () => { fig.cam.dragging = false; }));
  }

  function tick() {
    if (!still && !dragging() && views.some((v) => v.visible)) { fig.step(); drawAll(); }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  window.addEventListener('resize', drawAll);
  // The theme toggle changes the surface the figures are drawn on.
  new MutationObserver(drawAll).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

// Panels for a live figure: one canvas per entry of `inner` (each panel's
// overlay markup), plus an optional footer and column widths. Returns the canvases.
function livePanels(root, inner, foot, columns) {
  const grid = document.createElement('div');
  grid.className = 'lf-grid';
  grid.style.setProperty('--lf-cols', inner.length);
  if (columns) grid.style.gridTemplateColumns = columns;
  grid.innerHTML = inner.map((html) => `<div class="lf-p"><canvas></canvas>${html}</div>`).join('');
  root.appendChild(grid);
  if (foot) {
    const p = document.createElement('p');
    p.className = 'lf-foot';
    p.innerHTML = foot;
    root.appendChild(p);
  }
  return Array.from(grid.querySelectorAll('canvas'));
}

// Size a canvas to its box (capped at 2x) and clear it to the surface it sits
// on: the thumbnail plate, or the lightbox panel. Null while it has no box.
function liveCanvas(cv, big) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
  if (!w || !h) return null;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const ctx = cv.getContext('2d');
  const surface = big ? cv.parentElement : cv.closest('.pub-thumb');
  const bg = getComputedStyle(surface).backgroundColor.match(/\d+/g).slice(0, 3).map(Number);
  ctx.globalAlpha = 1;
  ctx.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`;
  ctx.fillRect(0, 0, w, h);
  return { ctx, w, h, dpr, bg };
}

// ----- CanDO: misoriented / recovered / upright airplane, spinning in sync -----
(function () {
  const data = window.CANDO_AIRPLANE;
  if (!data) return;
  const PALETTE = ['#1f77b4', '#d62728', '#17becf', '#e377c2', '#8c564b', '#ff7f0e'];  // as in the paper
  const cols = PALETTE.map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
  const cam = { yaw: 0.6, pitch: -0.35, dragging: false };

  // Center each cloud and scale it to unit radius.
  function normalize(ints) {
    const n = ints.length / 3, out = new Float32Array(ints.length);
    let cx = 0, cy = 0, cz = 0, r = 0;
    for (let i = 0; i < n; i++) { cx += ints[3 * i]; cy += ints[3 * i + 1]; cz += ints[3 * i + 2]; }
    cx /= n; cy /= n; cz /= n;
    for (let i = 0; i < n; i++) {
      out[3 * i] = ints[3 * i] - cx; out[3 * i + 1] = ints[3 * i + 1] - cy; out[3 * i + 2] = ints[3 * i + 2] - cz;
      r = Math.max(r, Math.hypot(out[3 * i], out[3 * i + 1], out[3 * i + 2]));
    }
    for (let i = 0; i < out.length; i++) out[i] /= r;
    return out;
  }
  const clouds = ['input', 'cando', 'target'].map((k) => ({ xyz: normalize(data[k].xyz), part: data[k].part }));
  const panels = [
    { title: 'Misoriented input', short: 'Misoriented', sub: 'Prediction of the frozen model', score: 'mIoU ' + data.miou_source.toFixed(2), cls: 'bad' },
    { title: 'After CanDO', short: 'After CanDO', sub: '', score: 'mIoU ' + data.miou_cando.toFixed(2), cls: 'good' },
    { title: 'Upright GT', short: 'Upright', sub: '', score: 'GT', cls: '' },
  ];

  liveFigure(document.getElementById('candoThumb'), document.getElementById('candoLightbox'), {
    cam,
    step() { cam.yaw += 0.006; },
    orbit(dx, dy) {
      cam.yaw += dx * 0.01;
      cam.pitch = Math.max(-1.5, Math.min(1.5, cam.pitch + dy * 0.01));
    },
    build(root, big) {
      const inner = panels.map((p) =>
        `<div class="lf-t">${big ? p.title : p.short}${p.sub && `<small>${p.sub}</small>`}</div><span class="lf-s ${p.cls}">${p.score}</span>`);
      const foot = big && `<span>${data.category} · rotated ${data.angle_deg.toFixed(0)}° about a random axis · ` +
        `${data.parts} parts · frozen PointNet++</span><span>Drag to orbit</span>`;
      return livePanels(root, inner, foot).map((cv, j) => [cv, clouds[j]]);
    },
    // Depth-sorted, depth-faded points.
    draw(cv, c, big) {
      const f = liveCanvas(cv, big);
      if (!f) return;
      const { ctx, w, h, dpr, bg } = f;
      const cyw = Math.cos(cam.yaw), syw = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
      const S = Math.min(w, h) * (big ? 0.36 : 0.47), rad = Math.max(0.9 * dpr, S * (big ? 0.012 : 0.026));
      const ox = w / 2, oy = h * (big ? 0.53 : 0.35);
      const n = c.xyz.length / 3, px = new Float32Array(n), py = new Float32Array(n), pz = new Float32Array(n);
      const order = new Uint32Array(n);
      for (let i = 0; i < n; i++) {
        const x = c.xyz[3 * i], y = c.xyz[3 * i + 1], z = c.xyz[3 * i + 2];
        const x1 = cyw * x + syw * z, z1 = -syw * x + cyw * z;
        px[i] = x1; py[i] = cp * y - sp * z1; pz[i] = sp * y + cp * z1; order[i] = i;
      }
      order.sort((a, b) => pz[a] - pz[b]);
      for (let k = 0; k < n; k++) {
        const i = order[k], col = cols[c.part.charCodeAt(i) - 48], t = 0.55 + 0.45 * (pz[i] + 1) / 2;
        ctx.fillStyle = `rgb(${bg[0] + (col[0] - bg[0]) * t | 0},${bg[1] + (col[1] - bg[1]) * t | 0},${bg[2] + (col[2] - bg[2]) * t | 0})`;
        ctx.beginPath(); ctx.arc(ox + px[i] * S, oy - py[i] * S, rad, 0, 6.2832); ctx.fill();
      }
    },
  });
})();


// ----- FOLD: one spectrum per dataset, revealed by a sweep along the eigenvalue
// axis; each row's largest eigenvalue lands further right as the shift grows -----
(function () {
  const data = window.FOLD_ESD;
  if (!data) return;
  const GROUPS = ['ID', 'Near OOD', 'Far OOD'];
  const LO = -7, HI = 4.5;   // log10 density shown, as on the paper's axes
  const SWEEP = 2800, HOLD = 2400, FADE = 500, LOOP = SWEEP + HOLD + FADE + 300;   // ms
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const t0 = performance.now();

  data.forEach((d) => {
    d.xhi = Math.max(d.xmax, ...d.series.flatMap((s) => s.pts.map((p) => p[0])));
    // Largest eigenvalue with visible density; rows go by group, then by it.
    d.series.forEach((s) => { s.lmax = Math.max(...s.pts.filter((p) => p[1] > -4).map((p) => p[0])); });
    d.series.sort((a, b) => a.group - b.group || a.lmax - b.lmax);
  });
  const legend = GROUPS.map((g, i) => `<span><i class="g${i}"></i>${g}</span>`).join('');

  liveFigure(document.getElementById('foldThumb'), document.getElementById('foldLightbox'), {
    step() {},
    build(root, big) {
      if (!big) {
        const cvs = livePanels(root, data.map((d) => `<div class="lf-t solo">${d.title}</div>`));
        root.insertAdjacentHTML('beforeend', `<div class="lf-legend">${legend}</div>`);
        return cvs.map((cv, j) => [cv, data[j]]);
      }
      const inner = data.map((d) => `<div class="lf-t">${d.title}<small>Feature-Hessian Spectrum of Each Test Set</small></div>`);
      const foot = `<span class="lf-legend">${legend}</span>` +
        '<span>spikes: eigenvalues, height: log density · ● largest eigenvalue</span>';
      return livePanels(root, inner, foot).map((cv, j) => [cv, data[j]]);
    },
    draw(cv, d, big) {
      const f = liveCanvas(cv, big);
      if (!f) return;
      const { ctx, w, h, dpr: u } = f;
      const t = still ? SWEEP : (performance.now() - t0) % LOOP;
      const reach = Math.min(1, t / SWEEP);
      const fade = t < SWEEP + HOLD ? 1 : Math.max(0, 1 - (t - SWEEP - HOLD) / FADE);
      const style = getComputedStyle(cv.closest('.live-fig')), page = getComputedStyle(document.documentElement);
      const color = [0, 1, 2].map((g) => style.getPropertyValue(`--lf-g${g}`).trim());
      const line = big ? page.getPropertyValue('--line').trim() : '#e2e2e6';
      const ink = big ? page.getPropertyValue('--ink-mute').trim() : '#8a8a92';
      const soft = big ? page.getPropertyValue('--ink-soft').trim() : '#55555c';

      // Layout: a label column (large view), then one row per dataset, groups set apart.
      const L = (big ? 110 : 10) * u, R = (big ? 46 : 7) * u, T = (big ? 62 : 24) * u, B = (big ? 38 : 27) * u;
      const n = d.series.length, GAP = 0.55;
      const unit = (h - T - B) / (n + 2 * GAP);
      let y = T;
      const rows = d.series.map((s, i) => {
        if (i && s.group !== d.series[i - 1].group) y += unit * GAP;
        y += unit;
        return { s, base: y };
      });
      const X = (e) => L + e / d.xhi * (w - L - R);
      const H = (l) => (Math.max(LO, l) - LO) / (HI - LO) * unit * 0.86;
      const sx = X(reach * d.xhi);

      // Eigenvalue grid.
      const ticks = [0, 1, 2, 3].map((i) => d.xmax * i / 3);
      ctx.strokeStyle = line; ctx.lineWidth = u;
      ticks.forEach((v) => { ctx.beginPath(); ctx.moveTo(X(v), T); ctx.lineTo(X(v), h - B + 3 * u); ctx.stroke(); });
      if (big) {
        ctx.fillStyle = ink; ctx.font = `${11 * u}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ticks.forEach((v) => ctx.fillText(v.toFixed(d.xmax < 0.1 ? 3 : 2), X(v), h - B + 7 * u));
        ctx.fillText('Eigenvalue', (L + w - R) / 2, h - B + 22 * u);
      }

      // A bracket per group, dataset names (large view), baselines.
      [0, 1, 2].forEach((g) => {
        const rs = rows.filter((r) => r.s.group === g);
        ctx.fillStyle = color[g];
        ctx.fillRect((big ? 10 : 3) * u, rs[0].base - unit * 0.86, 2.5 * u, rs[rs.length - 1].base - rs[0].base + unit * 0.86);
      });
      rows.forEach((r) => {
        const c = color[r.s.group];
        if (big) {
          ctx.fillStyle = soft; ctx.font = `${11.5 * u}px Inter, sans-serif`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
          ctx.fillText(r.s.name, L - 14 * u, r.base - unit * 0.32);
        }
        ctx.strokeStyle = c; ctx.globalAlpha = 0.3; ctx.lineWidth = u;
        ctx.beginPath(); ctx.moveTo(L, r.base); ctx.lineTo(w - R, r.base); ctx.stroke();
        ctx.globalAlpha = 1;
      });

      // Spectra, revealed up to the sweep.
      ctx.save();
      ctx.beginPath(); ctx.rect(L, 0, sx - L, h); ctx.clip();
      ctx.globalAlpha = fade;
      rows.forEach((r) => {
        const pts = r.s.pts.map((p) => [X(p[0]), r.base - H(p[1])]);
        ctx.fillStyle = ctx.strokeStyle = color[r.s.group];
        ctx.globalAlpha = 0.16 * fade;
        ctx.beginPath(); ctx.moveTo(pts[0][0], r.base);
        pts.forEach((q) => ctx.lineTo(q[0], q[1]));
        ctx.lineTo(pts[pts.length - 1][0], r.base); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = fade; ctx.lineWidth = (big ? 1.2 : 0.8) * u; ctx.lineJoin = 'round';
        ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke();
      });
      ctx.restore();

      // Largest eigenvalue of each row once the sweep has passed it, joined top to bottom.
      const hit = rows.filter((r) => X(r.s.lmax) <= sx + 0.5);
      ctx.globalAlpha = fade;
      if (hit.length > 1) {
        ctx.strokeStyle = soft; ctx.lineWidth = u; ctx.setLineDash([3 * u, 3 * u]);
        ctx.beginPath(); hit.forEach((r, i) => (i ? ctx.lineTo(X(r.s.lmax), r.base) : ctx.moveTo(X(r.s.lmax), r.base))); ctx.stroke();
        ctx.setLineDash([]);
      }
      hit.forEach((r) => {
        ctx.fillStyle = color[r.s.group]; ctx.strokeStyle = page.getPropertyValue('--bg-elev').trim() || '#fff';
        ctx.lineWidth = (big ? 2 : 1.2) * u;
        ctx.beginPath(); ctx.arc(X(r.s.lmax), r.base, (big ? 4 : 2.4) * u, 0, 6.2832); ctx.fill(); ctx.stroke();
        if (big) {
          ctx.fillStyle = color[r.s.group]; ctx.font = `600 ${11 * u}px Inter, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillText(r.s.lmax.toPrecision(2), w - R + 8 * u, r.base - unit * 0.1);
        }
      });
      ctx.globalAlpha = 1;

      // The sweep itself.
      if (reach < 1) {
        ctx.strokeStyle = soft; ctx.globalAlpha = 0.55; ctx.lineWidth = u;
        ctx.beginPath(); ctx.moveTo(sx, T - 4 * u); ctx.lineTo(sx, h - B); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    },
  });
})();

// ----- CBM: a concept's embedding coming apart as its training labels get noisier -----
// The t-SNE layouts at noise 0.0, 0.2 and 0.4 hold the same test images, so each
// dot glides to where that image lands at the next noise rate, while the
// Concept Alignment curve tracks the same noise rate. Concept-present images that
// end up stranded among absent ones are picked out, so the mixing shows.
(function () {
  const data = window.CBM_NOISE;
  if (!data) return;
  const HOLD = [1700, 1700, 2300], MOVE = 1500;   // ms at each noise rate, and between them
  const LOOP = HOLD.reduce((a, b) => a + b) + 3 * MOVE;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const t0 = performance.now();
  const RED = '#d62728', BLUE = '#1f77b4';      // concept present / absent, as in the paper
  const idx = [...data.on].map((c, i) => i);
  const absent = idx.filter((i) => data.on[i] === '0'), present = idx.filter((i) => data.on[i] === '1');

  // Where the loop is: layout a easing into layout b by e (0..1).
  function phase() {
    let t = still ? 0 : (performance.now() - t0) % LOOP;
    for (let k = 0; k < 3; k++) {
      if (t < HOLD[k]) return [k, k, 0];
      t -= HOLD[k];
      if (t < MOVE) { const e = t / MOVE; return [k, (k + 1) % 3, e < 0.5 ? 2 * e * e : 1 - (2 - 2 * e) ** 2 / 2]; }
      t -= MOVE;
    }
    return [0, 0, 0];
  }
  const gammaAt = ([a, b, e]) => data.gammas[a] + (data.gammas[b] - data.gammas[a]) * e;
  const mix = (v, [a, b, e]) => v[a] + (v[b] - v[a]) * e;
  const valueAt = (ys, g) => { const k = Math.min(3, Math.floor(g * 10)); return ys[k] + (ys[k + 1] - ys[k]) * (g * 10 - k); };

  function drawTsne(cv, big) {
    const f = liveCanvas(cv, big);
    if (!f) return;
    const { ctx, w, h, dpr: u, bg } = f;
    const p = phase(), [a, b, e] = p, A = data.xy[a], B = data.xy[b], Sa = data.stranded[a], Sb = data.stranded[b];
    const S = Math.min(w, h) * (big ? 0.4 : 0.4) / 1000, ox = w / 2, oy = h * (big ? 0.56 : 0.47);
    const rad = (big ? 1.7 : 0.85) * u;
    const at = (i) => [ox + (A[2 * i] + (B[2 * i] - A[2 * i]) * e) * S, oy - (A[2 * i + 1] + (B[2 * i + 1] - A[2 * i + 1]) * e) * S];
    // Absent images, dimmed; then present ones; stranded present ones last, larger and haloed.
    ctx.fillStyle = BLUE; ctx.globalAlpha = 0.5;
    for (const i of absent) { const q = at(i); ctx.beginPath(); ctx.arc(q[0], q[1], rad, 0, 6.2832); ctx.fill(); }
    ctx.fillStyle = RED; ctx.globalAlpha = 0.9;
    const lost = [];
    for (const i of present) {
      const s = (Sa[i] === '1' ? 1 - e : 0) + (Sb[i] === '1' ? e : 0);
      if (s > 0.05) { lost.push([i, s]); continue; }
      const q = at(i); ctx.beginPath(); ctx.arc(q[0], q[1], rad, 0, 6.2832); ctx.fill();
    }
    ctx.strokeStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`; ctx.lineWidth = (big ? 0.9 : 0.5) * u;
    for (const [i, s] of lost) {
      const q = at(i); ctx.beginPath(); ctx.arc(q[0], q[1], rad * (1 + 0.5 * s), 0, 6.2832); ctx.fill(); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const page = getComputedStyle(document.documentElement);
    ctx.fillStyle = big ? page.getPropertyValue('--ink').trim() : '#3f3f46';
    ctx.font = `600 ${(big ? 15 : 9.5) * u}px Inter, sans-serif`;
    ctx.textAlign = big ? 'right' : 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`Noise Rate ${Math.round(gammaAt(p) * 100)}%`, big ? w - 14 * u : 8 * u, (big ? 12 : 7) * u);
    if (big) {
      ctx.fillStyle = RED; ctx.font = `600 ${12.5 * u}px Inter, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText(`${mix(data.strandedRate, p).toFixed(0)}% of Present stranded among Absent`, 14 * u, h - 12 * u);
    }
  }

  function drawCurves(cv, big) {
    const f = liveCanvas(cv, big);
    if (!f) return;
    const { ctx, w, h, dpr: u } = f;
    const g = gammaAt(phase());
    const style = getComputedStyle(cv.closest('.live-fig')), page = getComputedStyle(document.documentElement);
    const line = big ? page.getPropertyValue('--line').trim() : '#e2e2e6';
    const ink = big ? page.getPropertyValue('--ink-mute').trim() : '#8a8a92';
    const charts = [{ ys: data.align, lo: 55, hi: 88, color: style.getPropertyValue('--lf-align').trim(), title: 'Concept Alignment (%)' }];
    if (big) charts.push({ ys: data.task, lo: 0, hi: 80, color: style.getPropertyValue('--lf-task').trim(), title: 'Task Accuracy (%)' });
    const L = (big ? 22 : 9) * u, R = (big ? 52 : 9) * u, top0 = (big ? 104 : 26) * u, bottom = h - (big ? 34 : 20) * u;
    const gapY = big ? 62 * u : 0, each = (bottom - top0 - gapY * (charts.length - 1)) / charts.length;
    const X = (v) => L + v / 0.4 * (w - L - R);

    charts.forEach((c, k) => {
      const T = top0 + k * (each + gapY), Bm = T + each;
      const Y = (v) => Bm - (v - c.lo) / (c.hi - c.lo) * (Bm - T);
      const pts = c.ys.map((v, i) => [X(i / 10), Y(v)]);
      ctx.strokeStyle = line; ctx.lineWidth = u;
      [0, 0.1, 0.2, 0.3, 0.4].forEach((v) => { ctx.beginPath(); ctx.moveTo(X(v), T); ctx.lineTo(X(v), Bm); ctx.stroke(); });
      ctx.beginPath(); ctx.moveTo(L, Bm); ctx.lineTo(w - R, Bm); ctx.stroke();
      ctx.fillStyle = ink; ctx.font = `${(big ? 11 : 8.5) * u}px Inter, sans-serif`; ctx.textBaseline = 'top';
      if (big) {
        ctx.textAlign = 'left'; ctx.fillText(c.title, L, T - 20 * u);
        ctx.textAlign = 'center';
        [0, 0.1, 0.2, 0.3, 0.4].forEach((v) => ctx.fillText(Math.round(v * 100) + '%', X(v), Bm + 6 * u));
        if (k === charts.length - 1) ctx.fillText('Noise Rate', (L + w - R) / 2, Bm + 22 * u);
      } else {
        ctx.textAlign = 'center'; ctx.fillText('Noise Rate →', (L + w - R) / 2, Bm + 4 * u);
      }
      // The whole curve faintly, the part up to the current noise rate solid, and a marker.
      ctx.strokeStyle = c.color; ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.25; ctx.lineWidth = (big ? 2 : 1.4) * u;
      ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
      ctx.globalAlpha = 1; ctx.lineWidth = (big ? 2.4 : 1.6) * u;
      const v = valueAt(c.ys, g), m = [X(g), Y(v)];
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      pts.forEach((p, i) => { if (i / 10 < g) ctx.lineTo(p[0], p[1]); });
      ctx.lineTo(m[0], m[1]); ctx.stroke();
      ctx.fillStyle = c.color; ctx.strokeStyle = page.getPropertyValue('--bg-elev').trim() || '#fff'; ctx.lineWidth = (big ? 2 : 1.2) * u;
      ctx.beginPath(); ctx.arc(m[0], m[1], (big ? 5 : 3) * u, 0, 6.2832); ctx.fill(); ctx.stroke();
      ctx.font = `600 ${(big ? 13 : 10.5) * u}px Inter, sans-serif`;
      if (big) { ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(v.toFixed(0) + '%', m[0] + 9 * u, m[1]); }
      else { ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText(v.toFixed(0) + '%', w - R, T + 2 * u); }
    });
  }

  const legend = '<span><i class="on"></i>Present</span><span><i class="off"></i>Absent</span>';
  const legendLong = '<span><i class="on"></i>Present: the bird has blue upperparts</span><span><i class="off"></i>Absent: it does not</span>';
  liveFigure(document.getElementById('cbmThumb'), document.getElementById('cbmLightbox'), {
    step() {},
    build(root, big) {
      const inner = big
        ? ['<div class="lf-t">“Blue Upperparts” Concept<small>t-SNE of its embedding over CUB test images</small></div>',
           '<div class="lf-t">As the Noise Rate Grows<small>Noise Rate: fraction of training concept labels flipped</small></div>']
        : [`<div class="lf-legend at-bottom stacked"><b>Concept</b>${legend}</div>`, '<div class="lf-t solo at-top">Concept Alignment</div>'];
      const foot = big && `<span class="lf-legend">${legendLong}</span>` +
        '<span>each dot is a test image · larger red: Present among mostly Absent neighbours</span>';
      const cvs = livePanels(root, inner, foot, big ? null : '1fr 1fr');
      return [[cvs[0], drawTsne], [cvs[1], drawCurves]];
    },
    draw(cv, paint, big) { paint(cv, big); },
  });
})();
