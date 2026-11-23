/* HORCRUX project page: the 3-D engine shared by every viewer (three.js r160, vendored next to this file).
   A Stage draws several panels of one group with a single WebGL canvas laid over them, so a group costs one context; the context is
   created when the group comes near the screen and released when it is far away. An Orbit holds the view that the panels of a group
   share, and its idle motion, which a grab interrupts and a release resumes. Posed scenes use the camera of the photograph (its
   intrinsics and the crop shown in the input panel), so at yaw = pitch = 0 the meshes are seen as in the image, drawn beside it and
   not over it. All vertex data arrive as base64 typed arrays in JSON (paper/fig_code/project_page/build_*.py). */
import * as THREE from './three.module.min.js';

export { THREE };
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const D = Math.PI / 180;
const TYPES = { f32: Float32Array, u16: Uint16Array, u8: Uint8Array, i16: Int16Array, u32: Uint32Array };

// the mesh colors of the paper's figures (sRGB, 0..1)
export const HAND = [0.72, 0.81, 0.94], HAND_L = [0.55, 0.66, 0.88], OBJ = [0.97, 0.64, 0.22], CONTACT = [0.835, 0.278, 0.318];
export const VIOLET = [0.40, 0.22, 0.60], GHOST = [0.6, 0.63, 0.68];

export function dec(o) {
  const bin = atob(o.d), buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new TYPES[o.t](buf.buffer);
}
const jsonCache = new Map();
export function getJSON(url) {
  if (!jsonCache.has(url)) {
    const p = fetch(url).then(r => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); });
    p.catch(() => jsonCache.delete(url));
    jsonCache.set(url, p);
  }
  return jsonCache.get(url);
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const lin = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

export function failed(host, err) {
  console.error(err);
  const msg = location.protocol === 'file:' ? 'Open the page over http(s) to load the 3D data.' : 'Could not load the 3D data.';
  $$('.loading', host).forEach(l => { l.textContent = msg; });
}

/* ---------------------------------------------------------------- stage: one WebGL canvas over a group of panels */
export class Stage {
  constructor(host) {
    this.host = host; this.views = []; this.ticks = new Set(); this.visible = false; this.raf = 0; this.renderer = null; this.canvas = null;
    new ResizeObserver(() => { this.resize(); this.request(); }).observe(host);
    new IntersectionObserver(es => { this.visible = es[0].isIntersecting; if (this.visible) { this.wake(); this.request(); } }, { rootMargin: '200px' }).observe(host);
    new IntersectionObserver(es => { if (!es[0].isIntersecting) this.sleep(); }, { rootMargin: '1600px' }).observe(host);
    document.addEventListener('visibilitychange', () => this.request());
  }
  wake() {
    if (this.renderer || this.dead) return;
    const c = document.createElement('canvas'); c.className = 'stage-canvas';
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: true, powerPreference: 'high-performance' });
    } catch (e) {
      this.dead = true; $$('.loading', this.host).forEach(l => { l.textContent = 'This view needs WebGL.'; }); return;
    }
    this.canvas = c; this.host.appendChild(c);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.world = world(this.renderer);
    this.resize();
  }
  sleep() {   // far from the screen: give the context back (browsers allow only a handful at once)
    if (!this.renderer) return;
    if (this.world) { this.world.dispose(); this.world = null; }
    this.renderer.dispose(); this.renderer.forceContextLoss(); this.canvas.remove(); this.renderer = this.canvas = null;
  }
  resize() {
    if (!this.renderer) return;
    const r = this.host.getBoundingClientRect(); this.renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
  }
  add(view) { this.views.push(view); this.request(); return view; }
  request() { if (!this.raf) this.raf = requestAnimationFrame(t => { this.raf = 0; this.frame(t); }); }
  frame(t) {
    if (!this.visible || document.hidden) return;
    this.wake();
    if (!this.renderer) return;
    let again = false;
    for (const f of this.ticks) again = f(t) || again;
    this.render();
    if (again) this.request();
  }
  render() {
    const hr = this.host.getBoundingClientRect(), H = hr.height, R = this.renderer;
    R.setScissorTest(false); R.clear(); R.setScissorTest(true);
    for (const v of this.views) {
      if (!v.scene || v.hidden) continue;
      const r = v.el.getBoundingClientRect(), x = r.left - hr.left, y = r.top - hr.top, w = r.width, h = r.height;
      if (w < 2 || h < 2) continue;
      R.setViewport(x, H - y - h, w, h); R.setScissor(x + 1, H - y - h + 1, w - 2, h - 2);   // inside the 1px border of the tile
      if (v.fit) v.fit(w / h);
      v.scene.environment = this.world;
      R.render(v.scene, v.camera);
    }
  }
}

/* the lighting of the paper's Cycles figures (paper/fig_code/teaser_v8_blender.py, view transform Standard), without their shadows: a
   uniform white world of strength 0.42 (diffuse and its soft reflection at grazing angles), a key light of 2.0 from the upper left and a
   fill of 0.45 from the right, both fixed to the camera. Directions = the way the light travels, in the camera frame (x right, y up,
   -z forward). */
const KEY_DIR = new THREE.Vector3(0.45, -0.55, -0.70).normalize(), FILL_DIR = new THREE.Vector3(-0.75, 0.05, -0.65).normalize();
export function makeScene(camera) {
  const scene = new THREE.Scene(), aim = new THREE.Object3D(); aim.position.set(0, 0, -1); camera.add(aim);
  for (const [dir, e] of [[KEY_DIR, 2.0], [FILL_DIR, 0.45]]) {
    const l = new THREE.DirectionalLight(0xffffff, e); l.position.copy(aim.position).sub(dir); l.target = aim; camera.add(l);
  }
  scene.add(camera);
  return scene;
}
function world(renderer) {   // the uniform world as an environment map (one per WebGL context)
  const sc = new THREE.Scene(); sc.background = new THREE.Color().setScalar(0.42);   // linear radiance
  const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromScene(sc, 0); pm.dispose();
  return rt.texture;
}
export function disposeScene(scene) {
  if (scene) scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
}
export function mat(rgb, vertexColors = false, roughness = 0.55) {   // 0.55 the hands, 0.42 the objects (as the Cycles figures)
  const m = new THREE.MeshStandardMaterial({ roughness, metalness: 0, vertexColors, side: THREE.DoubleSide });
  if (vertexColors) m.color.setRGB(1, 1, 1); else m.color.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
  return m;
}
export function ghost() {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.7, transparent: true, opacity: 0.36, depthWrite: false, side: THREE.DoubleSide });
  m.color.setRGB(GHOST[0], GHOST[1], GHOST[2], THREE.SRGBColorSpace);
  return m;
}
export function setColors(geo, n, fn) {   // fn(i) -> [r, g, b] in sRGB 0..1
  let a = geo.getAttribute('color');
  if (!a) { a = new THREE.BufferAttribute(new Float32Array(n * 3), 3); geo.setAttribute('color', a); }
  for (let i = 0; i < n; i++) { const c = fn(i); a.array[3 * i] = lin(c[0]); a.array[3 * i + 1] = lin(c[1]); a.array[3 * i + 2] = lin(c[2]); }
  a.needsUpdate = true;
}
export function geometry(V, F) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(V instanceof Float32Array ? V : new Float32Array(V), 3));
  g.setIndex(new THREE.BufferAttribute(F, 1)); g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}
/* an object mesh shaded as the Cycles figures shade it (teaser_v8_render.py welds, teaser_v8_blender.py smooths with a 40 degree crease):
   the copies of a vertex that the dataset meshes keep at texture seams (the H2O meshes at every face) welded, normals smooth across edges
   flatter than `crease` and sharp across steeper ones; C = per-vertex colors (0..255) or null. Drawn unindexed (one normal per corner). */
export function solid(V, F, C = null, crease = 40) {
  const nv = V.length / 3, nf = F.length / 3, weld = new Int32Array(nv), ids = new Map();
  for (let i = 0; i < nv; i++) {
    const k = `${Math.round(V[3 * i] * 1e6)},${Math.round(V[3 * i + 1] * 1e6)},${Math.round(V[3 * i + 2] * 1e6)}`;
    let w = ids.get(k); if (w === undefined) { w = ids.size; ids.set(k, w); } weld[i] = w;
  }
  const fn = new Float32Array(3 * nf), un = new Float32Array(3 * nf), deg = new Int32Array(ids.size + 1);
  for (let f = 0; f < nf; f++) {   // area-weighted and unit face normals, and the faces about each welded vertex
    const a = 3 * F[3 * f], b = 3 * F[3 * f + 1], c = 3 * F[3 * f + 2];
    const ux = V[b] - V[a], uy = V[b + 1] - V[a + 1], uz = V[b + 2] - V[a + 2], vx = V[c] - V[a], vy = V[c + 1] - V[a + 1], vz = V[c + 2] - V[a + 2];
    const x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx, l = Math.hypot(x, y, z) || 1;
    fn[3 * f] = x; fn[3 * f + 1] = y; fn[3 * f + 2] = z; un[3 * f] = x / l; un[3 * f + 1] = y / l; un[3 * f + 2] = z / l;
    for (let k = 0; k < 3; k++) deg[weld[F[3 * f + k]] + 1]++;
  }
  for (let w = 0; w < ids.size; w++) deg[w + 1] += deg[w];
  const inc = new Int32Array(3 * nf), fill = deg.slice(0, ids.size);
  for (let f = 0; f < nf; f++) for (let k = 0; k < 3; k++) inc[fill[weld[F[3 * f + k]]]++] = f;
  const cos = Math.cos(crease * D), P = new Float32Array(9 * nf), N = new Float32Array(9 * nf), K = C ? new Float32Array(9 * nf) : null;
  for (let f = 0; f < nf; f++) for (let k = 0; k < 3; k++) {
    const i = F[3 * f + k], w = weld[i], o = 9 * f + 3 * k;
    let x = 0, y = 0, z = 0;
    for (let j = deg[w]; j < deg[w + 1]; j++) {
      const g = inc[j];
      if (un[3 * f] * un[3 * g] + un[3 * f + 1] * un[3 * g + 1] + un[3 * f + 2] * un[3 * g + 2] >= cos) { x += fn[3 * g]; y += fn[3 * g + 1]; z += fn[3 * g + 2]; }
    }
    const l = Math.hypot(x, y, z) || 1;
    N[o] = x / l; N[o + 1] = y / l; N[o + 2] = z / l; P[o] = V[3 * i]; P[o + 1] = V[3 * i + 1]; P[o + 2] = V[3 * i + 2];
    if (K) { K[o] = lin(C[3 * i] / 255); K[o + 1] = lin(C[3 * i + 1] / 255); K[o + 2] = lin(C[3 * i + 2] / 255); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  if (K) g.setAttribute('color', new THREE.BufferAttribute(K, 3));
  g.computeBoundingSphere();
  return g;
}
export function radiusAbout(target, arrays) {   // largest distance of the vertices from the target
  let r = 0;
  for (const a of arrays) for (let i = 0; i < a.length; i += 3) r = Math.max(r, Math.hypot(a[i] - target.x, a[i + 1] - target.y, a[i + 2] - target.z));
  return r;
}
export function vertexColored(V, F, C) {
  const g = geometry(V, F); setColors(g, V.length / 3, k => [C[3 * k] / 255, C[3 * k + 1] / 255, C[3 * k + 2] / 255]); return g;
}

/* ---------------------------------------------------------------- the view shared by the panels of a group */
export class Orbit {
  /* idle: the motion of a view nobody holds, { spin: degrees per second } or { sway: degrees, period: ms }, optionally { when() }.
     It pauses while the view is held and resumes from wherever the view is left. */
  constructor(onChange, { yaw = 0, pitch = 0, minPitch = -80, maxPitch = 80, idle = null } = {}) {
    Object.assign(this, { onChange, yaw, pitch, minPitch, maxPitch, idle });
    this.anim = null; this.touched = this.held = false; this.onGrab = this.onRelease = null;
    this.base = yaw; this.phase = 0; this.since = -1e9; this.last = 0;
  }
  set(yaw, pitch) { this.yaw = yaw; this.pitch = clamp(pitch, this.minPitch, this.maxPitch); this.onChange(); }
  rest() { this.base = this.yaw; this.phase = 0; this.since = performance.now(); }   // the idle motion restarts from the present view
  bind(el) {
    let id = null, last = null;
    el.tabIndex = 0;
    el.addEventListener('dragstart', e => e.preventDefault());   // a drag turns the view, it never picks up an image
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('button, a')) return;   // a control inside the view (e.g. Reset view) gets its own click
      id = e.pointerId; last = [e.clientX, e.clientY]; el.classList.add('dragging'); this.anim = null; this.touched = this.held = true;
      try { el.setPointerCapture(id); } catch (err) { /* the pointer is already gone */ }
      if (this.onGrab) this.onGrab();
    });
    el.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - last[0], dy = e.clientY - last[1]; last = [e.clientX, e.clientY];
      this.set(this.yaw - dx * 0.45, this.pitch - (e.pointerType === 'touch' ? 0 : dy * 0.45));   // a touch turns, and still scrolls the page
    });
    const end = e => {
      if (e.pointerId !== id) return;
      id = null; el.classList.remove('dragging'); this.held = false; this.rest();
      if (this.onRelease) this.onRelease();
      this.onChange();
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el.addEventListener('keydown', e => {
      const k = { ArrowLeft: [8, 0], ArrowRight: [-8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] }[e.key];
      if (!k) return;
      e.preventDefault(); this.anim = null; this.touched = true; if (this.onGrab) this.onGrab();
      this.set(this.yaw + k[0], this.pitch + k[1]); this.rest(); if (this.onRelease) this.onRelease();
    });
  }
  animateTo(yaw, pitch, ms = 900) {
    if (reduceMotion) { this.anim = null; this.set(yaw, pitch); return; }
    const y0 = ((this.yaw + 180) % 360 + 360) % 360 - 180;                 // take the short way round
    this.yaw = y0; this.anim = { y0, p0: this.pitch, y1: yaw, p1: pitch, t0: performance.now(), ms };
    this.onChange();
  }
  tick(t) {   // true while the view moves by itself
    const dt = Math.min(t - (this.last || t), 50); this.last = t;
    const a = this.anim;
    if (a) {
      const u = clamp((t - a.t0) / a.ms, 0, 1), k = ease(u);
      this.yaw = a.y0 + (a.y1 - a.y0) * k; this.pitch = a.p0 + (a.p1 - a.p0) * k;
      if (u >= 1) { this.anim = null; this.rest(); }
      return true;
    }
    const m = this.idle;
    if (!m || this.held || reduceMotion || (m.when && !m.when())) return false;
    const u = clamp((t - this.since - IDLE_DELAY) / IDLE_RAMP, 0, 1), k = u * u * (3 - 2 * u);   // a short pause, then it eases in
    if (m.spin) { this.yaw += m.spin * k * dt / 1000; if (this.yaw > 180) this.yaw -= 360; }
    else { this.phase += k * dt / m.period * 2 * Math.PI; this.yaw = this.base + m.sway * Math.sin(this.phase); }
    return true;
  }
  get angle() { return Math.hypot(this.yaw, this.pitch); }
}
const IDLE_DELAY = 450, IDLE_RAMP = 900;

/* camera of a dataset image (intrinsics K, the crop `box` of the input panel), turned about `target` by yaw / pitch */
export function kCamera(meta, target) {
  const { W, H, K } = meta, fx = K[0][0], fy = K[1][1], cx = K[0][2], cy = K[1][2];
  const cam = new THREE.PerspectiveCamera(2 * Math.atan(H / (2 * fy)) / D, (W / fx) / (H / fy), 0.02, 20);
  const tp = [fx * target.x / -target.z + cx, fy * -target.y / -target.z + cy];   // pixel of the orbit center (three.js -> OpenCV)
  cam.userData = { W, H, fx, fy, cx, cy, box: meta.box, tp, key: '', radius: 0 };   // radius: extent of the scene about the target, set by the caller
  return cam;
}
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
export function poseK(cam, target, yaw, pitch, aspect) {
  const u = cam.userData, a = u.far ? 1 : clamp(Math.hypot(yaw, pitch) / 35, 0, 1), k = a * a * (3 - 2 * a);   // far: framed about the scene at any angle
  // the part of the crop that a panel of this aspect shows (as the photo of the input panel, drawn with object-fit: cover)
  let [x0, y0, x1, y1] = u.box, w = x1 - x0, h = y1 - y0;
  if (aspect && Math.abs(w / h - aspect) > 1e-3) {
    if (w / h > aspect) { const nw = h * aspect; x0 += (w - nw) / 2; w = nw; } else { const nh = w / aspect; y0 += (h - nh) / 2; h = nh; }
  }
  // leaving the camera view: slide the crop to center on the target (it keeps its pixel), and move along the view axis until the
  // scene fits the panel with a margin, so that a misplaced object stays in sight
  const s1 = u.radius ? clamp((u.fill || 2.25) * u.radius * Math.max(u.fy / h, u.fx / w) / target.length(), 0.55, 2) : 0.85, s = 1 + (s1 - 1) * k;
  const bx = x0 + w / 2, by = y0 + h / 2, mx = bx + (u.tp[0] - bx) * k, my = by + (u.tp[1] - by) * k;
  const key = `${mx.toFixed(2)},${my.toFixed(2)},${w.toFixed(2)},${h.toFixed(2)}`;
  if (key !== u.key) { cam.setViewOffset(u.W, u.H, mx - w / 2 - u.cx + u.W / 2, my - h / 2 - u.cy + u.H / 2, w, h); u.key = key; }
  _q.setFromEuler(_e.set(pitch * D, yaw * D, 0, 'YXZ'));
  cam.position.copy(target).negate().multiplyScalar(s).applyQuaternion(_q).add(target);
  cam.quaternion.copy(_q); cam.updateMatrixWorld();
}
/* camera framing a bounding sphere, on a sphere about `target`; base = unit direction of the zero view */
export function poseFit(cam, target, radius, base, yaw, pitch, aspect) {
  if (aspect && cam.aspect !== aspect) { cam.aspect = aspect; cam.updateProjectionMatrix(); }
  const az = Math.atan2(base.x, base.z) + yaw * D, el = clamp(Math.asin(clamp(base.y, -1, 1)) - pitch * D, -1.4, 1.4);
  const fov = cam.fov * D, dist = radius / Math.sin(Math.min(fov, 2 * Math.atan(Math.tan(fov / 2) * cam.aspect)) / 2) * 1.04;
  cam.position.set(target.x + dist * Math.cos(el) * Math.sin(az), target.y + dist * Math.sin(el), target.z + dist * Math.cos(el) * Math.cos(az));
  cam.up.set(0, 1, 0); cam.lookAt(target); cam.updateMatrixWorld();
}

/* ---------------------------------------------------------------- shared assets */
let handData = null, manoData = null;
export function loadHand() {   // the canonical hand: a dense mesh with its joint (21) and region (103) of every vertex, and the seams between them
  if (!handData) handData = getJSON('static/data/hand.json?v=20261113m').then(h => ({
    ...h, V: dec(h.V), F: dec(h.F), coarse: dec(h.coarse), fine: dec(h.fine), seamC: dec(h.seamC), seamF: dec(h.seamF),
  }));
  return handData;
}
export function loadMano() {   // MANO faces, and the mirrored winding of a left hand
  if (!manoData) manoData = getJSON('static/data/mano.json').then(m => {
    const R = dec(m.F), L = new Uint16Array(R.length);
    for (let i = 0; i < R.length; i += 3) { L[i] = R[i]; L[i + 1] = R[i + 2]; L[i + 2] = R[i + 1]; }
    return { R, L };
  });
  return manoData;
}
/* a panel showing the canonical hand; colorFn(i) -> rgb of vertex i; hover(i) -> [value, label] of the tooltip; scale > 1 leaves room around it */
export function canonicalView(stage, el, hd, orbit, colorFn, hover, tip, { scale = 0.94, lift = 0 } = {}) {
  const cam = new THREE.PerspectiveCamera(26, 1, 0.01, 10), scene = makeScene(cam);
  const geo = geometry(hd.V, hd.F); setColors(geo, hd.V.length / 3, colorFn);
  const mesh = new THREE.Mesh(geo, mat(null, true)); scene.add(mesh);
  const R = geo.boundingSphere.radius, target = new THREE.Vector3(0, lift * R, 0), radius = R * scale, base = new THREE.Vector3(0, 0, 1);   // lift > 0 lowers the hand in its panel
  const view = stage.add({ el, scene, camera: cam, geo, hover, fit: a => poseFit(cam, target, radius, base, orbit.yaw, orbit.pitch, a) });
  if (tip) {
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    el.addEventListener('pointermove', e => {
      if (e.buttons || !view.hover) { tip.hide(); return; }
      const r = el.getBoundingClientRect();
      ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
      ray.setFromCamera(ndc, cam);
      const hit = ray.intersectObject(mesh, false)[0];
      if (!hit) { tip.hide(); return; }
      const t = view.hover(hit.face.a); tip.show(el, t[0], t[1], e.clientX, e.clientY - 6);
    });
    el.addEventListener('pointerleave', tip.hide);
  }
  const l = $('.loading', el); if (l) l.remove();
  return view;
}
