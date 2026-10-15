// ----- Theme switch: white / cream / dark (persisted) -----
// The initial theme is set inline in <head> to avoid a flash; this only wires the buttons.
(function () {
  const root = document.documentElement;
  const buttons = document.querySelectorAll('[data-theme-choice]');

  function sync() {
    const current = root.getAttribute('data-theme');
    buttons.forEach((b) => b.setAttribute('aria-checked', b.dataset.themeChoice === current));
  }

  buttons.forEach((b) => {
    b.addEventListener('click', () => {
      root.setAttribute('data-theme', b.dataset.themeChoice);
      try { localStorage.setItem('theme', b.dataset.themeChoice); } catch (e) {}
      sync();
    });
  });
  sync();
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

  // Match the caption column to the figure. CSS can only shrink-wrap to the
  // image's intrinsic width, which is wrong whenever the image is limited by
  // max-height instead, so measure what actually got rendered.
  function fitCaption() {
    fig.style.width = '';
    const w = img.getBoundingClientRect().width;
    if (w) fig.style.width = w + 'px';
  }

  function open(thumb) {
    const full = thumb.dataset.full;
    if (!full) return;
    opener = thumb;
    img.src = full;
    img.alt = thumb.querySelector('img') ? thumb.querySelector('img').alt : '';
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
