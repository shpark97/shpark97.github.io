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
    const w = (live || img).offsetWidth;   // layout width: the panel's opening animation scales what getBoundingClientRect reports
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
      img.removeAttribute('src'); img.alt = '';   // nothing left over from a static figure opened before
    } else {
      img.src = full;
      img.alt = thumb.querySelector('img') ? thumb.querySelector('img').alt : '';
      // data-scale draws a figure at that share of the column's width, with the caption keeping the full width
      img.style.setProperty('--side', `${(1 - (parseFloat(thumb.dataset.scale) || 1)) * 50}%`);
    }
    // innerHTML, not textContent: captions may carry light markup such as <em>.
    cap.innerHTML = thumb.dataset.caption || '';
    box.hidden = false;
    document.body.style.overflow = 'hidden';
    fitCaption();
    box.querySelector('.lightbox-close').focus();
    if (live) live.dispatchEvent(new CustomEvent('fig:open'));   // media figures start here
  }

  function close() {
    box.hidden = true;
    fig.style.width = '';
    img.removeAttribute('src'); img.alt = '';
    img.style.removeProperty('--side');
    img.hidden = false;
    if (live) { live.dispatchEvent(new CustomEvent('fig:close')); live.hidden = true; live = null; }
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
    // A loop that goes through several clips or stages lists them beside it: mark the one on screen.
    const row = thumb.querySelector('[data-cuts]');
    // A cut past the last item wraps round to the first (a loop that returns to its start before it ends).
    if (row) {
      const cuts = row.dataset.cuts.split(',').map(Number), n = row.children.length;
      v.addEventListener('timeupdate', () => {
        const at = cuts.filter((c) => v.currentTime >= c).length % n;
        Array.from(row.children).forEach((el, k) => el.classList.toggle('on', k === at));
      });
    }
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
    { title: 'Misoriented Input', short: 'Misoriented', sub: 'Prediction of the frozen model', score: 'mIoU ' + data.miou_source.toFixed(2), cls: 'bad' },
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
      // what the panels' colours mean, beneath them; the caption below keeps to the method
      const foot = big && '<span class="lf-note">Colours show the parts a frozen PointNet++ predicts before and after CanDO, and the GT parts.</span><span>Drag to orbit</span>';
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
        // the legend top left, and what the rows are top right
        root.insertAdjacentHTML('beforeend', `<div class="lf-legend is-tight">${legend}</div><div class="lf-tag">Hessian Spectra</div>`);
        return cvs.map((cv, j) => [cv, data[j]]);
      }
      const inner = data.map((d) => `<div class="lf-t">${d.title}<small>Feature-Hessian Spectrum of Each Test Set</small></div>`);
      const foot = `<span class="lf-legend">${legend}</span>` +
        '<span>Spikes: Eigenvalues, Height: Log Density · ● Largest Eigenvalue</span>';
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
    const noise = `Noise Rate ${Math.round(gammaAt(p) * 100)}%`;
    if (big) {
      // a line lower where the lightbox's close button sits over the panel's top right (on a phone)
      const x = document.querySelector('.lightbox-close')?.getBoundingClientRect(), r = cv.getBoundingClientRect();
      const under = x && x.right > r.left && x.left < r.right && x.bottom > r.top && x.top < r.top + 40;
      ctx.fillStyle = page.getPropertyValue('--ink').trim(); ctx.font = `600 ${15 * u}px Inter, sans-serif`;
      ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText(noise, w - 14 * u, (under ? 44 : 12) * u);
    } else {   // as the Concept Alignment title of the panel beside it: its colour, size and weight, centred, on its line (7px down, 15.5px high)
      ctx.fillStyle = '#55555c'; ctx.font = `400 ${10 * u}px Inter, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(noise, w / 2, (7 + 15.5 / 2) * u);
    }
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
  const legendLong = '<span><i class="on"></i>Concept Present</span><span><i class="off"></i>Concept Absent</span>';
  liveFigure(document.getElementById('cbmThumb'), document.getElementById('cbmLightbox'), {
    step() {},
    build(root, big) {
      const inner = big
        ? ['<div class="lf-t">“Blue Upperparts” Concept<small>t-SNE of CUB test images</small></div>',
           '<div class="lf-t">As the Noise Rate Grows<small>Noise Rate: Fraction of training concept labels flipped</small></div>']
        : [`<div class="lf-legend at-bottom stacked is-center"><b>Concept</b>${legend}</div>`, '<div class="lf-t solo at-top">Concept Alignment</div>'];
      const foot = big && `<span class="lf-legend">${legendLong}</span>`;
      const cvs = livePanels(root, inner, foot, big ? null : '1fr 1fr');
      return [[cvs[0], drawTsne], [cvs[1], drawCurves]];
    },
    draw(cv, paint, big) { paint(cv, big); },
  });
})();

// ----- Lightbox figures built from media -----
// The preprints open something that moves rather than an image: CodeHOI plays
// a clip per kind of matter, while HORCRUX and Beyond Rigid Hands run their
// project pages' own WebGL viewers (vendored under images/pubs/), which can be
// dragged to orbit. A figure's files are fetched when its thumbnail is first
// hovered, focused or touched, so that they are usually there by the click.
(function () {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const once = (fn) => { let p; return () => p || (p = fn()); };
  // The meshes' faces come packed for transfer (walk() in homepage-figures/make_preprints.py): three planes of int16
  // differences, each face's first vertex from the previous face's, then its other two from its first.
  const unwalk = (d, Out = Uint16Array) => {
    const n = d.length / 3, F = new Out(3 * n);
    for (let i = 0, a = 0; i < n; i++) { a += d[i]; F[3 * i] = a; F[3 * i + 1] = a + d[n + i]; F[3 * i + 2] = a + d[2 * n + i]; }
    return F;
  };
  function figure(id, load, open, close) {
    const el = document.getElementById(id), thumb = document.querySelector(`.pub-thumb[data-live="${id}"]`);
    if (!el || !thumb) return;
    const warm = () => { Promise.resolve(load(el)).catch(() => {}); };
    ['pointerenter', 'focus', 'touchstart'].forEach((t) => thumb.addEventListener(t, warm, { once: true, passive: true }));
    el.addEventListener('fig:open', () => open(el));
    if (close) el.addEventListener('fig:close', () => close(el));
  }
  const fail = (el) => (e) => {
    console.error(e);
    el.querySelectorAll('.mfig-msg').forEach((m) => { m.textContent = 'This 3D view could not be loaded.'; });
  };

  // CodeHOI: sets of two clips, by task (generation, reconstruction) and kind of
  // matter, in the page's order. Opening the figure starts at the first set; once
  // both of a set's clips can play they start together, and the set stays for
  // data-s seconds (most of the longer clip), then the next follows, round
  // through both tasks. A task or a kind can be chosen at any time; the next set
  // is fetched while one plays. With reduced motion nothing starts on its own.
  (function () {
    const el = document.getElementById('codehoiLightbox');
    if (!el) return;
    const sets = [...el.querySelectorAll('.hoi-set')], modes = [...el.querySelectorAll('[data-mode]:not(.hoi-set)')];
    const kinds = [...el.querySelectorAll('.hoi-kinds button')];
    const vids = (s) => [...s.querySelectorAll('video')];
    const fetchSet = (s) => vids(s).forEach((v) => { if (!v.src) { v.poster = v.dataset.poster; v.preload = 'auto'; v.src = v.dataset.src; } });
    let at = -1, timer = 0, turn = 0;
    function stop() { clearTimeout(timer); kinds.forEach((b) => b.classList.remove('run')); }
    function show(k) {
      stop();
      const s = sets[k], my = ++turn;
      at = k;
      sets.forEach((x, i) => { x.classList.toggle('on', i === k); if (i !== k) vids(x).forEach((v) => v.pause()); });
      modes.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === s.dataset.mode)));
      kinds.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === s.dataset.kind)));
      fetchSet(s);
      const ready = vids(s).map((v) => (v.readyState >= 3 ? null : new Promise((r) => v.addEventListener('canplay', r, { once: true }))));
      Promise.race([Promise.all(ready), new Promise((r) => setTimeout(r, 4000))]).then(() => {
        if (my !== turn) return;                                   // another set was chosen meanwhile
        fetchSet(sets[(k + 1) % sets.length]);
        if (still) { vids(s).forEach((v) => { v.controls = true; }); return; }   // played only when asked
        vids(s).forEach((v) => { try { v.currentTime = 0; } catch (e) {} v.play().catch(() => {}); });
        const ms = Number(s.dataset.s) * 1000, bar = kinds.find((b) => b.dataset.kind === s.dataset.kind);
        el.style.setProperty('--dwell', ms + 'ms');
        void bar.offsetWidth;                                      // restart the bar's fill
        bar.classList.add('run');
        timer = setTimeout(() => show((k + 1) % sets.length), ms);
      });
    }
    const find = (mode, kind) => sets.findIndex((s) => s.dataset.mode === mode && s.dataset.kind === kind);
    modes.forEach((b) => b.addEventListener('click', () => show(find(b.dataset.mode, sets[at].dataset.kind))));
    kinds.forEach((b) => b.addEventListener('click', () => show(find(sets[at].dataset.mode, b.dataset.kind))));
    figure('codehoiLightbox', () => fetchSet(sets[0]), () => show(0), () => { stop(); turn++; sets.forEach((s) => vids(s).forEach((v) => v.pause())); });
  })();

  // HORCRUX: a canvas over each row. The top row holds HORCRUX's reconstructions,
  // three at a time: the one-hand examples, then the two-hand ones, taking turns
  // or chosen above. Each set opens in the view of its input images and turns to
  // the side, where the grasp shows, then sways until dragged; nothing changes
  // while a view is held. The bottom row is the fine contact head on one example,
  // as on the project page: the coarse contact over 21 joints and the distance of
  // each of 103 hand regions to the object resolve the contact over those regions.
  // Its three hands turn together, all the way round.
  const hxBase = 'images/pubs/horcrux/';
  const hxEl = document.getElementById('horcruxLightbox');
  const hxSets = hxEl ? [...hxEl.querySelectorAll('[data-set]')] : [];
  const hxNames = (k) => hxSets[k].dataset.set.split(',');
  const HX_DWELL = 9000, HX_FADE = 280;
  const hxFiles = once(() => import('./' + hxBase + 'viewer.js').then((V) => {
    hxNames(0).forEach((n) => V.getJSON(hxBase + n + '.json').catch(() => {}));
    ['mano.json', 'hand.json', 'contact.json'].forEach((f) => V.getJSON(hxBase + f).catch(() => {}));
    return V;
  }));
  let hxShow = null, hxStop = () => {};
  const hxBuild = once(() => hxFiles().then(async (V) => {
    const { THREE } = V, el = hxEl;
    const recHost = el.querySelector('.hx-recon'), conHost = el.querySelector('.hx-c2f');
    const top = new V.Stage(recHost), bottom = new V.Stage(conHost);
    const mano = V.dec((await V.getJSON(hxBase + 'mano.json')).F), left = new Uint16Array(mano.length);
    for (let i = 0; i < mano.length; i += 3) { left[i] = mano[i]; left[i + 1] = mano[i + 2]; left[i + 2] = mano[i + 1]; }   // mirrored winding

    // A scene per example, built when its set is first shown; its input image is decoded by then too.
    const scenes = new Map();
    const sceneOf = (name) => {
      if (!scenes.has(name)) scenes.set(name, Promise.all([V.getJSON(hxBase + name + '.json'), new Promise((ok) => {
        const im = new Image(); im.onload = im.onerror = () => ok(); im.src = hxBase + name + '.jpg';
      })]).then(([d]) => {
        const target = new THREE.Vector3(...d.target), camera = new THREE.PerspectiveCamera(24, 1, 0.01, 20), scene = V.makeScene(camera);
        const box = (o) => Float32Array.from(V.dec(o), (q, i) => o.lo[i % 3] + (o.hi[i % 3] - o.lo[i % 3]) * q / 65535);   // 16-bit steps across its box
        const hands = d.hands.map((h) => V.dec(h.V)), obj = d.obj.V.lo ? box(d.obj.V) : V.dec(d.obj.V);
        hands.forEach((hv, k) => {
          const isLeft = d.hands[k].side === 'L';
          scene.add(new THREE.Mesh(V.geometry(hv, isLeft ? left : mano), V.mat(hands.length > 1 && isLeft ? V.HAND_L : V.HAND)));
        });
        scene.add(new THREE.Mesh(V.geometry(obj, V.dec(d.obj.F)), V.mat(V.OBJ)));
        return { name, d, scene, camera, target, radius: V.radiusAbout(target, [...hands, obj]) * 1.16, toCam: target.clone().negate().normalize() };
      }));
      return scenes.get(name);
    };
    let at = -1, turn = 0, timer = 0;
    const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
    const later = (ms) => { clearTimeout(timer); if (!still) timer = setTimeout(() => hxShow((at + 1) % hxSets.length), ms); };
    const slots = [...recHost.querySelectorAll('.mfig-p')].map((panel) => {
      const orbit = new V.Orbit(() => top.request(), { idle: { sway: 16, period: 10000 } });
      orbit.bind(panel);
      orbit.onGrab = () => clearTimeout(timer);            // held: the set stays
      orbit.onRelease = () => later(2 * HX_DWELL);         // and a while longer once let go
      top.ticks.add((t) => orbit.tick(t));
      return { panel, orbit, view: top.add({ el: panel, scene: null, camera: null }), img: panel.querySelector('.mfig-in') };
    });
    hxShow = async (k, fade = true) => {
      const my = ++turn;
      at = k; clearTimeout(timer);
      hxSets.forEach((b, i) => b.setAttribute('aria-pressed', String(i === k)));
      const shown = await Promise.all(hxNames(k).map(sceneOf));
      if (my !== turn) return;                             // another set was chosen meanwhile
      if (fade && !still) { recHost.classList.add('swap'); await wait(HX_FADE); if (my !== turn) return; }
      shown.forEach((s, j) => {
        const { view, orbit, img } = slots[j], cam = s.camera;
        Object.assign(view, { scene: s.scene, camera: cam, fit: (a) => {
          cam.setViewOffset(a * 1000, 1000, 0, -70, a * 1000, 1000);   // a little low: the input image holds the top
          V.poseFit(cam, s.target, s.radius, s.toCam, orbit.yaw, orbit.pitch, a);
        } });
        img.src = hxBase + s.name + '.jpg';
        orbit.set(0, 0); orbit.animateTo(s.d.novel.yaw, s.d.novel.pitch, 2600);
      });
      top.request();
      recHost.classList.remove('swap');
      hxNames((k + 1) % hxSets.length).forEach((n) => sceneOf(n).catch(() => {}));   // the next set is ready when its turn comes
      later(HX_DWELL);
    };
    hxStop = () => { clearTimeout(timer); turn++; };
    hxSets.forEach((b, i) => b.addEventListener('click', () => hxShow(i)));

    // The fine contact head on the canonical hand: a vertex takes the colour of its joint (coarse) or region (distance, fine).
    const [c, h] = await Promise.all([V.getJSON(hxBase + 'contact.json'), V.getJSON(hxBase + 'hand.json')]);
    const hd = { V: Float32Array.from(V.dec(h.V), (x) => x * h.scale) };
    ['F', 'coarse', 'fine', 'seamC', 'seamF'].forEach((k) => { hd[k] = h[k].walk ? unwalk(V.dec(h[k])) : V.dec(h[k]); });
    const seam = (rgb, s) => V.mix3(rgb, [1, 1, 1], s / 255 * 0.5), FAR = [0.86, 0.89, 0.95];
    const near = (mm) => Math.pow(V.clamp(1 - Math.max(mm, 0) / 30, 0, 1), 1.5);   // within 3 cm, as on the project page
    const paint = {
      coarse: (i) => seam(c.coarse[hd.coarse[i]] > 0.5 ? V.CONTACT : V.HAND, hd.seamC[i]),
      dist: (i) => seam(V.mix3(FAR, V.VIOLET, near(c.dmin[hd.fine[i]])), hd.seamF[i]),
      fine: (i) => seam(c.fine[hd.fine[i]] > 0.5 ? V.CONTACT : V.HAND, hd.seamF[i]),
    };
    const all = new V.Orbit(() => bottom.request(), { minPitch: -70, maxPitch: 70, idle: { spin: 16 } });
    bottom.ticks.add((t) => all.tick(t));
    conHost.querySelectorAll('.mfig-p[data-step]').forEach((cell) => {
      all.bind(cell);
      const view = V.canonicalView(bottom, cell, hd, all, paint[cell.dataset.step], null, null, { scale: 1.14, lift: 0.03 });
      const fit = view.fit, cam = view.camera;              // a little left and low in every cell: the first holds the input image top right
      view.fit = (a) => { cam.setViewOffset(a * 1000, 1000, 40 * a, -40, a * 1000, 1000); fit(a); };
    });

    el.classList.add('is-ready');
    return () => {
      hxShow(0, false);
      all.set(0, 0); all.rest();
      // The canvases were sized while the panel was still scaling in: size them again once that is over.
      const settle = () => { [top, bottom].forEach((st) => { st.resize(); st.request(); }); };
      el.closest('.lightbox-panel').addEventListener('animationend', settle, { once: true });
      setTimeout(settle, 500);
    };
  }));
  figure('horcruxLightbox', hxFiles, (el) => hxBuild().then((replay) => replay()).catch(fail(el)), () => hxStop());

  // Beyond Rigid Hands: the project page's thermal-contact view (its chapter 03), one canvas split 2 x 2 in one
  // shared view: the contact on a camera measured from thermal imprints, then the contact of the rigid annotation,
  // ContactOpt and the lift, each on the object in its own colours (the hand hidden, as on the page).
  const brhBase = 'images/pubs/brh/';
  const brhFiles = once(() => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = brhBase + 'viewer.js'; s.onload = resolve; s.onerror = () => reject(new Error('viewer.js'));
    document.head.appendChild(s);
  }).then(() => window.BRH.loadScene('thermal_full15_handoff_camera', brhBase)));
  const brhBuild = once(() => brhFiles().then((raw) => {
    const el = document.getElementById('brhLightbox'), chips = el.querySelectorAll('.mfig-over .mfig-s');
    const o = raw.object;
    if (o && o.Fw) {   // the object's faces, unpacked into the base64 the viewer reads
      const bin = atob(o.Fw), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const F = new Uint8Array(unwalk(new Int16Array(u.buffer), o.wide ? Uint32Array : Uint16Array).buffer);
      let s = '';
      for (let i = 0; i < F.length; i += 0x8000) s += String.fromCharCode.apply(null, F.subarray(i, i + 0x8000));
      o.F = btoa(s); delete o.Fw;
    }
    const viewer = new window.BRH.Viewer(el.querySelector('canvas'), {
      panels: (sc) => sc.states.map((_, i) => ({ track: [i], objRgb: i })),
      object: 'solid', hand: 0, sway: 24,
      cols: () => 2, ratio: (w) => (w < 420 ? 1.15 : 0.9),   // taller panels on a phone, for the chips
    });
    viewer.setScene(raw).states.forEach((st, k) => {   // the share of the measured contact missed, and of the predicted contact that is false
      if (chips[k] && st.meta && st.meta.missed !== undefined) {
        chips[k].innerHTML = `<i style="background:#466ec8"></i>Missed <b>${st.meta.missed}%</b><i style="background:#f08c28"></i>False <b>${st.meta.false}%</b>`;
      }
    });
    el.classList.add('is-ready');
  }));
  figure('brhLightbox', brhFiles, (el) => brhBuild().catch(fail(el)));
})();

// ----- ZIP: prompt tuning through a black box -----
// Left, a sketch of zeroth-order search. The loss surface is out of sight (faint
// contours): each step queries the model at two nearby prompts and moves on those
// two outputs alone, and the surface comes into view only around what has been
// queried. Right, the paper's train-accuracy curves (mean over 13 tasks) drawn as
// the query count runs up. The lightbox adds, on the same count, the queries each
// method needs to reach the target accuracy, and reads the curves under the pointer.
(function () {
  const data = window.ZIP_RACE;
  const boxRoot = document.getElementById('zipLightbox');
  if (!data) return;
  const METHODS = [   // drawn in this order, so ZIP ends up on top
    { key: 'BAR', name: 'BAR', cls: 'm-bar' },
    { key: 'BlackVIP', name: 'BlackVIP', cls: 'm-bvip' },
    { key: 'BPTVLM', name: 'BPT-VLM', cls: 'm-bpt' },
    { key: 'ZIP', name: 'ZIP', cls: 'm-zip' },
  ];
  const STEP = data.step, QMAX = data.curves.ZIP.length * STEP;   // 50 queries a point, 5,000 in all
  const LEAD = 500, SWEEP = 6000, HOLD = 2800, FADE = 500, LOOP = LEAD + SWEEP + HOLD + FADE;   // ms
  const EASE = 1.6;   // the count runs slower early on, while the bars fill
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // BlackVIP's best accuracy, the first point where ZIP gets there, and the paper's "~8x" from them
  const bestQ = (data.best.at + 1) * STEP, zipQ = (data.best.zip + 1) * STEP;
  const fold = Math.floor(data.best.at / (data.best.zip + 1));
  const fmt = (q) => Math.round(q).toLocaleString('en-US');
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const ease = (e) => (e < 0.5 ? 2 * e * e : 1 - (2 - 2 * e) ** 2 / 2);
  const s0 = performance.now();   // the sketch's clock
  let t0 = s0;                    // the query count's clock, moved when the pointer lets go of it
  let scrub = null;               // the query count under the pointer in the lightbox, if any

  function clock() {
    if (scrub !== null && (!boxRoot || boxRoot.hidden)) release();   // the lightbox closed under the pointer
    const t = still ? LEAD + SWEEP + HOLD / 2 : (performance.now() - t0) % LOOP;
    if (scrub !== null) return { q: scrub, fade: 1, note: scrub >= bestQ ? 1 : 0 };
    return {
      q: QMAX * clamp((t - LEAD) / SWEEP) ** EASE,
      fade: 1 - clamp((t - LEAD - SWEEP - HOLD) / FADE),
      note: clamp((t - LEAD - SWEEP) / 400),
    };
  }
  // Let go of the pointer's count and run on from it.
  function release() {
    if (scrub === null) return;
    t0 = performance.now() - (LEAD + SWEEP * (scrub / QMAX) ** (1 / EASE));
    scrub = null;
  }
  // Train accuracy after q queries, between the plotted points; null before the first.
  function accAt(ys, q) {
    const i = q / STEP - 1;
    if (i < 0) return null;
    const k = Math.min(ys.length - 2, Math.floor(i));
    return ys[k] + (ys[k + 1] - ys[k]) * Math.min(1, i - k);
  }
  // Colours: the thumbnail stays a light plate in both themes; the lightbox follows the page.
  function inks(cv, big) {
    const style = getComputedStyle(cv.closest('.live-fig')), page = getComputedStyle(document.documentElement);
    const v = (n) => page.getPropertyValue(n).trim();
    const color = {};
    METHODS.forEach((m) => { color[m.key] = style.getPropertyValue(`--lf-${m.cls.slice(2)}`).trim(); });
    return big
      ? { color, line: v('--line'), mute: v('--ink-mute'), soft: v('--ink-soft'), ink: v('--ink'), card: v('--bg-elev') }
      : { color, line: '#e2e2e6', mute: '#8a8a92', soft: '#55555c', ink: '#3f3f46', card: '#fff' };
  }

  // ---- The sketch: a surface the optimizer never sees, and a zeroth-order walk down it ----
  // A curved valley, tilted a little; its floor at the centre.
  const TILT = -0.26, ct = Math.cos(TILT), stl = Math.sin(TILT);
  const surf = (x, y) => {
    const a = ct * x + stl * y, b = -stl * x + ct * y;
    return 0.5 * a * a + 2.4 * (b - 0.2 * a * a + 0.06) ** 2;
  };
  const LEVELS = [0.025, 0.08, 0.16, 0.27, 0.41, 0.6];
  // Iso-lines by marching squares, as flat [x0, y0, x1, y1, ...] segment lists.
  const GRID = 90, G0 = -1.6, G1 = 1.6;
  const contours = LEVELS.map((c) => {
    const s = (G1 - G0) / GRID, n = GRID + 1, g = new Float32Array(n * n), seg = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) g[j * n + i] = surf(G0 + i * s, G0 + j * s) - c;
    const cross = (i0, j0, i1, j1) => {
      const a = g[j0 * n + i0], e = a / (a - g[j1 * n + i1]);
      return [G0 + (i0 + (i1 - i0) * e) * s, G0 + (j0 + (j1 - j0) * e) * s];
    };
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
      const c4 = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]], pts = [];
      for (let k = 0; k < 4; k++) {
        const [a, b] = [c4[k], c4[(k + 1) % 4]];
        if ((g[a[1] * n + a[0]] < 0) !== (g[b[1] * n + b[0]] < 0)) pts.push(...cross(a[0], a[1], b[0], b[1]));
      }
      seg.push(...pts.slice(0, 8));
    }
    return seg;
  });
  // The box the outermost line fills, which the sketch is fitted to.
  const outer = contours[contours.length - 1], bb = [Infinity, Infinity, -Infinity, -Infinity];
  for (let i = 0; i < outer.length; i += 2) {
    bb[0] = Math.min(bb[0], outer[i]); bb[2] = Math.max(bb[2], outer[i]);
    bb[1] = Math.min(bb[1], outer[i + 1]); bb[3] = Math.max(bb[3], outer[i + 1]);
  }
  // Each step: a random direction, the surface queried a little either side, a move by the
  // difference, clipped (as ZIP clips its estimates). A fixed seed, so every loop is the same walk.
  const MU = 0.12, LR = 0.2, CLIP = 1.3, NSTEP = 18;
  const walk = (function () {
    let s = 185;
    const rnd = () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), s | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    let p = [-0.905, 0.489];   // up one arm of the valley
    const out = [];
    for (let k = 0; k < NSTEP; k++) {
      const a = rnd() * 2 * Math.PI, u = [Math.cos(a), Math.sin(a)];
      const plus = [p[0] + MU * u[0], p[1] + MU * u[1]], minus = [p[0] - MU * u[0], p[1] - MU * u[1]];
      const d = Math.max(-CLIP, Math.min(CLIP, (surf(...plus) - surf(...minus)) / (2 * MU)));
      const next = [p[0] - LR * d * u[0], p[1] - LR * d * u[1]];
      out.push({ p, plus, minus, next, upPlus: d > 0 });
      p = next;
    }
    return out;
  })();
  const WSTEP = 400, WALK = NSTEP * WSTEP;   // ms a step

  function drawSearch(cv, big) {
    const f = liveCanvas(cv, big);
    if (!f) return;
    const { ctx, w, h, dpr: u, bg } = f;
    const k = inks(cv, big), surface = `rgb(${bg[0]},${bg[1]},${bg[2]})`;
    const t = still ? LEAD + WALK + 1 : (performance.now() - s0) % LOOP;
    const fade = still ? 1 : 1 - clamp((t - LEAD - SWEEP - HOLD) / FADE);
    // Fit the surface into the panel, clear of the labels above and below.
    const top = (big ? 60 : 25) * u, bot = h - (big ? 34 : 28) * u, pad = (big ? 12 : 11) * u;
    const sc = Math.min((w - 2 * pad) / (bb[2] - bb[0]), (bot - top) / (bb[3] - bb[1]));
    const cx = w / 2, cy = (top + bot) / 2, mx = (bb[0] + bb[2]) / 2, my = (bb[1] + bb[3]) / 2;
    const P = (q) => [cx + (q[0] - mx) * sc, cy - (q[1] - my) * sc];
    const lines = () => {
      ctx.beginPath();
      contours.forEach((seg) => {
        for (let i = 0; i < seg.length; i += 4) {
          const a = P([seg[i], seg[i + 1]]), b = P([seg[i + 2], seg[i + 3]]);
          ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
        }
      });
      ctx.stroke();
    };

    // Where the walk is: step i, and how far into it (probes show, then the prompt moves).
    const tw = Math.min(WALK, Math.max(0, t - LEAD));
    const i = Math.min(NSTEP - 1, Math.floor(tw / WSTEP)), p = tw >= WALK ? 1 : tw / WSTEP - i;
    const st = walk[i], probe = clamp(p / 0.18) * (1 - clamp((p - 0.72) / 0.22));
    const m = ease(clamp((p - 0.42) / 0.46));
    const cur = [st.p[0] + (st.next[0] - st.p[0]) * m, st.p[1] + (st.next[1] - st.p[1]) * m];

    // The surface: faint everywhere, clearer around every prompt queried so far.
    ctx.lineWidth = u; ctx.lineCap = 'round';
    ctx.strokeStyle = k.line; ctx.globalAlpha = big ? 0.9 : 0.75;
    lines();
    const seen = [walk[0].p];
    for (let j = 0; j <= i; j++) if (j < i || (tw > 0 && p > 0.05)) seen.push(walk[j].plus, walk[j].minus);
    const R = 0.34 * sc;
    ctx.strokeStyle = k.mute;
    [1, 0.72, 0.45].forEach((r) => {
      ctx.save();
      ctx.beginPath();
      seen.forEach((q, j) => {
        const grow = j >= seen.length - 2 && tw < WALK && j > 0 ? clamp(p / 0.3) : 1;   // the newest two open up
        const c = P(q);
        ctx.moveTo(c[0] + R * r * grow, c[1]); ctx.arc(c[0], c[1], R * r * grow, 0, 6.2832);
      });
      ctx.clip();
      ctx.globalAlpha = (big ? 0.26 : 0.3) * fade;
      lines();
      ctx.restore();
    });

    // The path so far, with a dot where each step landed.
    const zip = k.color.ZIP, path = walk.slice(0, i + 1).map((s) => P(s.p));
    path.push(P(cur));
    ctx.globalAlpha = 0.55 * fade; ctx.strokeStyle = ctx.fillStyle = zip;
    ctx.lineWidth = (big ? 1.8 : 1.2) * u; ctx.lineJoin = 'round';
    ctx.beginPath(); path.forEach((q, j) => (j ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke();
    path.slice(1, -1).forEach((q) => { ctx.beginPath(); ctx.arc(q[0], q[1], (big ? 2 : 1.3) * u, 0, 6.2832); ctx.fill(); });

    // This step's two queries: the lower output filled, the higher one open.
    if (probe > 0 && tw < WALK) {
      const a = P(st.plus), b = P(st.minus), r = (big ? 3.6 : 2.2) * u;
      ctx.globalAlpha = probe * fade; ctx.strokeStyle = k.mute; ctx.lineWidth = u;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      [[a, !st.upPlus], [b, st.upPlus]].forEach(([q, low]) => {
        ctx.fillStyle = low ? k.mute : surface; ctx.lineWidth = (big ? 1.4 : 1) * u;
        ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 6.2832); ctx.fill(); ctx.stroke();
      });
    }

    // The prompt being tuned.
    const c = P(cur);
    ctx.globalAlpha = fade; ctx.fillStyle = zip; ctx.strokeStyle = surface; ctx.lineWidth = (big ? 2 : 1.5) * u;
    ctx.beginPath(); ctx.arc(c[0], c[1], (big ? 5 : 3.2) * u, 0, 6.2832); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 1;

    if (big) {   // a key along the bottom
      const y = h - 16 * u, r = 3.6 * u;
      ctx.font = `${11 * u}px Inter, sans-serif`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      let x = 14 * u;
      ctx.strokeStyle = k.mute; ctx.fillStyle = surface; ctx.lineWidth = 1.4 * u;
      ctx.beginPath(); ctx.arc(x + r, y, r, 0, 6.2832); ctx.fill(); ctx.stroke();
      ctx.fillStyle = k.mute; ctx.fillText('Query', x + 2 * r + 6 * u, y);
      x += 2 * r + 6 * u + ctx.measureText('Query').width + 16 * u;
      ctx.fillStyle = zip;
      ctx.beginPath(); ctx.arc(x + r, y, r + 0.8 * u, 0, 6.2832); ctx.fill();
      ctx.fillStyle = k.mute; ctx.fillText('Prompt', x + 2 * r + 6 * u, y);
    }
  }

  // ---- Train accuracy against queries ----
  function drawCurves(cv, big) {
    const f = liveCanvas(cv, big);
    if (!f) return;
    const { ctx, w, h, dpr: u, bg } = f;
    const c = clock(), k = inks(cv, big), surface = `rgb(${bg[0]},${bg[1]},${bg[2]})`;
    const L = (big ? 38 : 7) * u, R = (big ? 16 : 10) * u, T = (big ? 70 : 26) * u, B = (big ? 42 : 31) * u;
    const LO = big ? 33 : 34, HI = big ? 57 : 56;
    const X = (q) => L + q / QMAX * (w - L - R), Y = (a) => h - B - (a - LO) / (HI - LO) * (h - B - T);

    // Grid: hairlines at the paper's ticks, labelled in the lightbox.
    ctx.strokeStyle = k.line; ctx.lineWidth = u;
    (big ? [36, 42, 48, 54] : [40, 48]).forEach((a) => { ctx.beginPath(); ctx.moveTo(L, Y(a)); ctx.lineTo(w - R, Y(a)); ctx.stroke(); });
    ctx.beginPath(); ctx.moveTo(L, h - B); ctx.lineTo(w - R, h - B); ctx.stroke();
    if (big) {
      ctx.fillStyle = k.mute; ctx.font = `${11 * u}px Inter, sans-serif`;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      [36, 42, 48, 54].forEach((a) => ctx.fillText(a, L - 8 * u, Y(a)));
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      [0, 1000, 2000, 3000, 4000, 5000].forEach((q) => ctx.fillText(q ? q / 1000 + 'K' : '0', X(q), h - B + 7 * u));
      ctx.fillText('Queries', (L + w - R) / 2, h - B + 23 * u);
    }

    // The curves up to the count, each led by a dot.
    ctx.save();
    ctx.globalAlpha = c.fade; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const heads = [];
    METHODS.forEach((m) => {
      const ys = data.curves[m.key], a = accAt(ys, c.q);
      if (a === null) return;
      const lead = m.key === 'ZIP';
      ctx.strokeStyle = k.color[m.key]; ctx.lineWidth = (lead ? (big ? 2.4 : 1.7) : (big ? 1.6 : 1.1)) * u;
      ctx.beginPath(); ctx.moveTo(X(STEP), Y(ys[0]));
      for (let i = 1; i < ys.length && (i + 1) * STEP <= c.q; i++) ctx.lineTo(X((i + 1) * STEP), Y(ys[i]));
      ctx.lineTo(X(c.q), Y(a)); ctx.stroke();
      heads.push({ m, a, x: X(c.q), y: Y(a) });
    });
    heads.forEach(({ m, x, y }) => {
      ctx.fillStyle = k.color[m.key]; ctx.strokeStyle = surface; ctx.lineWidth = (big ? 2 : 1.2) * u;
      ctx.beginPath(); ctx.arc(x, y, (m.key === 'ZIP' ? (big ? 4.5 : 2.6) : (big ? 3.5 : 2)) * u, 0, 6.2832); ctx.fill(); ctx.stroke();
    });

    // Once the count is past BlackVIP's best: where ZIP got there, and the queries saved.
    if (c.note > 0) {
      const y = Y(data.best.acc), xa = X(zipQ), xb = X(bestQ), ah = (big ? 6 : 4) * u;
      ctx.globalAlpha = c.fade * c.note;
      ctx.strokeStyle = ctx.fillStyle = k.ink; ctx.lineWidth = (big ? 1.3 : 1) * u;
      ctx.beginPath(); ctx.moveTo(xb, y); ctx.lineTo(xa + ah, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(xa + 1.5 * u, y); ctx.lineTo(xa + ah * 1.6, y - ah * 0.7); ctx.lineTo(xa + ah * 1.6, y + ah * 0.7); ctx.closePath(); ctx.fill();
      // over the arrow's right end, where ZIP's curve has climbed clear of it; a halo in the
      // surface colour keeps it legible where a short plot (a phone) brings the curve close
      const note = `~${fold}× fewer queries`, ty = y - (big ? 6 : 3) * u;
      ctx.font = `600 ${(big ? 12 : 7.5) * u}px Inter, sans-serif`; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      ctx.strokeStyle = surface; ctx.lineWidth = (big ? 4 : 2.5) * u; ctx.lineJoin = 'round';
      ctx.strokeText(note, xb, ty); ctx.fillText(note, xb, ty);
    }
    ctx.restore();

    if (!big) return;
    // The count, top right; a line lower where the lightbox's close button sits over this corner.
    const x = document.querySelector('.lightbox-close')?.getBoundingClientRect(), r = cv.getBoundingClientRect();
    const under = x && x.right > r.left && x.left < r.right && x.bottom > r.top && x.top < r.top + 40;
    ctx.fillStyle = k.ink; ctx.font = `600 ${14 * u}px Inter, sans-serif`; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText(fmt(c.q), w - 14 * u, (under ? 46 : 12) * u);
    ctx.fillStyle = k.mute; ctx.font = `${11 * u}px Inter, sans-serif`;
    ctx.fillText('queries', w - 14 * u, (under ? 64 : 30) * u);

    // Under the pointer: a rule, and every method's accuracy there.
    if (scrub === null) return;
    const xs = X(scrub), rows = heads.slice().sort((p, q) => q.a - p.a);
    ctx.strokeStyle = k.mute; ctx.lineWidth = u; ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.moveTo(xs, T - 8 * u); ctx.lineTo(xs, h - B); ctx.stroke();
    ctx.globalAlpha = 1;
    const bw = 136 * u, rh = 18 * u, bh = rows.length * rh + 12 * u;
    const bx = xs + 12 * u + bw < w - 6 * u ? xs + 12 * u : xs - 12 * u - bw, by = h - B - bh - 8 * u;
    ctx.fillStyle = k.card; ctx.strokeStyle = k.line;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 6 * u); ctx.fill(); ctx.stroke();
    ctx.font = `${11.5 * u}px Inter, sans-serif`; ctx.textBaseline = 'middle';
    rows.forEach(({ m, a }, j) => {
      const y = by + 6 * u + rh * (j + 0.5);
      ctx.fillStyle = k.color[m.key]; ctx.beginPath(); ctx.arc(bx + 12 * u, y, 3.5 * u, 0, 6.2832); ctx.fill();
      ctx.fillStyle = k.soft; ctx.textAlign = 'left'; ctx.fillText(m.name, bx + 22 * u, y);
      ctx.fillStyle = k.ink; ctx.textAlign = 'right'; ctx.fillText(a.toFixed(1) + '%', bx + bw - 10 * u, y);
    });
  }

  // ---- Queries to reach the target accuracy, filling on the same count (lightbox) ----
  function drawBars(cv) {
    const f = liveCanvas(cv, true);
    if (!f) return;
    const { ctx, w, h, dpr: u } = f;
    const c = clock(), k = inks(cv, true);
    const rows = METHODS.map((m) => ({ m, q: data.queries[m.key] })).sort((a, b) => a.q - b.q);
    const L = 80 * u, R = 44 * u, T = 70 * u, B = 66 * u, QB = 2500;
    const X = (q) => L + q / QB * (w - L - R);
    ctx.strokeStyle = k.line; ctx.lineWidth = u;
    ctx.fillStyle = k.mute; ctx.font = `${11 * u}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    [0, 500, 1000, 1500, 2000].forEach((q) => {   // a line every 500, a label every 1,000
      ctx.beginPath(); ctx.moveTo(X(q), T - 6 * u); ctx.lineTo(X(q), h - B); ctx.stroke();
      if (q % 1000 === 0) ctx.fillText(fmt(q), X(q), h - B + 7 * u);
    });
    const band = (h - T - B) / rows.length, bh = Math.min(20 * u, band * 0.5);
    rows.forEach(({ m, q }, i) => {
      const y = T + band * (i + 0.5), len = Math.min(c.q, q), done = clamp((c.q - q) / 150);
      ctx.globalAlpha = 1;
      ctx.fillStyle = m.key === 'ZIP' ? k.ink : k.soft;
      ctx.font = `${m.key === 'ZIP' ? 600 : 400} ${12 * u}px Inter, sans-serif`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(m.name, L - 10 * u, y);
      if (len <= 0) return;
      // a bar, square at the baseline and rounded at its end, pale until it reaches the target
      const x1 = X(len), r = Math.min(4 * u, (x1 - L) / 2);
      ctx.globalAlpha = c.fade * (0.38 + 0.62 * done); ctx.fillStyle = k.color[m.key];
      ctx.beginPath(); ctx.roundRect(L, y - bh / 2, x1 - L, bh, [0, r, r, 0]); ctx.fill();
      if (done > 0) {
        ctx.globalAlpha = c.fade * done; ctx.fillStyle = k.ink;
        ctx.font = `600 ${12 * u}px Inter, sans-serif`; ctx.textAlign = 'left';
        ctx.fillText(fmt(q), x1 + 7 * u, y);
      }
    });
    // ZIP against the best baseline, once both are in
    const zipRow = rows.find((r) => r.m.key === 'ZIP'), next = rows.find((r) => r.m.key !== 'ZIP');
    const shown = clamp((c.q - Math.max(zipRow.q, next.q)) / 300) * c.fade;
    if (shown > 0) {
      const y = h - B + 34 * u;
      ctx.globalAlpha = shown; ctx.fillStyle = k.color.ZIP;
      ctx.beginPath(); ctx.arc(18 * u, y, 3.5 * u, 0, 6.2832); ctx.fill();
      ctx.fillStyle = k.soft; ctx.font = `${12 * u}px Inter, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(`ZIP: ${(next.q / zipRow.q).toFixed(1)}× fewer queries than ${next.m.name}`, 28 * u, y);
    }
    ctx.globalAlpha = 1;
  }

  const legend = ['ZIP', 'BAR', 'BlackVIP', 'BPTVLM'].map((key) => {
    const m = METHODS.find((x) => x.key === key);
    return `<span><i class="${m.cls}"></i>${m.name}</span>`;
  }).join('');
  const bigViews = [];
  const redraw = () => bigViews.forEach(([cv, paint]) => paint(cv, true));

  liveFigure(document.getElementById('zipThumb'), boxRoot, {
    step() {},
    build(root, big) {
      if (!big) {
        const cvs = livePanels(root, ['<div class="lf-t solo">Black-Box Search</div>', '<div class="lf-t solo">Train Accuracy</div>'], null, '1fr 1.3fr');
        root.insertAdjacentHTML('beforeend', `<div class="lf-legend is-tight is-right">${legend}</div>`);   // over the curves it keys
        return [[cvs[0], drawSearch], [cvs[1], drawCurves]];
      }
      const inner = [
        '<div class="lf-t">Black-Box Search<small>A sketch: outputs only, no gradients</small></div>',
        '<div class="lf-t">Queries to Reach the Target<small>Mean over 13 tasks</small></div>',
        '<div class="lf-t">Training Accuracy (%)<small>Mean over 13 tasks</small></div>',
      ];
      const foot = `<span class="lf-legend">${legend}</span><span>Hover the curves to read them</span>`;
      const cvs = livePanels(root, inner, foot);
      // Point at the curves to set the count there; let go and it runs on from there.
      const pane = cvs[2].parentElement;
      pane.classList.add('is-scrub');
      const at = (e) => {
        const r = cvs[2].getBoundingClientRect();
        return Math.max(STEP, Math.min(QMAX, (e.clientX - r.left - 38) / (r.width - 54) * QMAX));
      };
      const move = (e) => { scrub = at(e); redraw(); };
      pane.addEventListener('pointermove', move);
      pane.addEventListener('pointerdown', move);
      pane.addEventListener('pointerleave', () => { release(); redraw(); });
      pane.addEventListener('pointercancel', () => { release(); redraw(); });
      pane.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') { release(); redraw(); } });
      bigViews.push([cvs[0], drawSearch], [cvs[1], drawBars], [cvs[2], drawCurves]);
      return bigViews.slice();
    },
    draw(cv, paint, big) { paint(cv, big); },
  });
})();
