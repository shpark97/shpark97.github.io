// ----- Theme toggle (persisted) -----
(function () {
  const root = document.documentElement;
  const stored = localStorage.getItem('theme');
  const initial = stored || 'light';
  root.setAttribute('data-theme', initial);

  document.getElementById('themeToggle').addEventListener('click', () => {
    const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
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
(function () {
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

  filters.forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.filterType;
      const val = btn.dataset.filter;
      state[type] = val;
      // toggle active state within the same row
      document
        .querySelectorAll(`.filter[data-filter-type="${type}"]`)
        .forEach((b) => b.classList.toggle('active', b === btn));
      apply();
    });
  });
})();

// ----- Smooth scroll for nav links -----
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (id.length > 1) {
      const target = document.querySelector(id);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  });
});

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
