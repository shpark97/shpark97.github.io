/* Beyond Rigid Hands: interactive mesh viewer (WebGL2, no dependencies).
   A scene is a MANO hand in several states that share one topology, and optionally an object. One canvas shows one or more panels
   with a shared camera; each panel follows a track of states over the viewer's time (a morph between stages, a played clip, or one
   fixed state). The hand is colored either by its signed distance to the object on the thresholds of the paper's metrics (green
   within 1 mm of the surface, red deeper than 1 mm inside, skin elsewhere) or by per-vertex colors; the object is either glass
   blended over the hand, so that skin inside it stays visible, or opaque with per-vertex colors. */
(function () {
  "use strict";

  // ------------------------------------------------------------------ data
  function bytes(s) {
    const b = atob(s), n = b.length, u = new Uint8Array(n);
    for (let i = 0; i < n; i++) u[i] = b.charCodeAt(i);
    return u;
  }
  const f32 = (s) => new Float32Array(bytes(s).buffer);
  const u16 = (s) => new Uint16Array(bytes(s).buffer);
  const i16 = (s) => new Int16Array(bytes(s).buffer);
  const u32 = (s) => new Uint32Array(bytes(s).buffer);

  function vertexNormals(V, F) {
    const N = new Float32Array(V.length);
    for (let f = 0; f < F.length; f += 3) {
      const a = F[f] * 3, b = F[f + 1] * 3, c = F[f + 2] * 3;
      const ux = V[b] - V[a], uy = V[b + 1] - V[a + 1], uz = V[b + 2] - V[a + 2];
      const vx = V[c] - V[a], vy = V[c + 1] - V[a + 1], vz = V[c + 2] - V[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      N[a] += nx; N[a + 1] += ny; N[a + 2] += nz;
      N[b] += nx; N[b + 1] += ny; N[b + 2] += nz;
      N[c] += nx; N[c + 1] += ny; N[c + 2] += nz;
    }
    for (let i = 0; i < N.length; i += 3) {
      const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1;
      N[i] /= l; N[i + 1] /= l; N[i + 2] /= l;
    }
    return N;
  }

  function decodeScene(raw) {
    const F = u16(raw.faces), vs = raw.vscale;
    const states = raw.states.map((s) => {
      let V;
      if (vs) { const q = i16(s.V); V = new Float32Array(q.length); for (let i = 0; i < q.length; i++) V[i] = q[i] * vs; }
      else V = f32(s.V);
      return { key: s.key, name: s.name, V: V, N: vertexNormals(V, F), sd: s.sd ? f32(s.sd) : null, rgb: s.rgb ? bytes(s.rgb) : null, meta: s.meta || {} };
    });
    const V0 = states[0].V;
    states.forEach((s) => {
      if (!s.sd) return;
      let on = 0, ins = 0, moved = 0;
      const n = s.sd.length;
      for (let i = 0; i < n; i++) {
        const d = s.sd[i];
        if (Math.abs(d) <= 1) on++; else if (d < -1) ins++;
        moved += Math.hypot(s.V[3 * i] - V0[3 * i], s.V[3 * i + 1] - V0[3 * i + 1], s.V[3 * i + 2] - V0[3 * i + 2]);
      }
      s.stats = { on: on, ins: ins, moved: moved / n };
    });
    const sc = { id: raw.id, kind: raw.kind, F: F, states: states, cam: raw.cam, meta: raw.meta || {}, obj: null };
    if (raw.object) {
      const o = raw.object, q = u16(o.V), OV = new Float32Array(o.nv * 3);
      for (let i = 0; i < o.nv; i++)
        for (let k = 0; k < 3; k++) OV[3 * i + k] = o.lo[k] + ((o.hi[k] - o.lo[k]) * q[3 * i + k]) / 65535;
      const OF = o.wide ? u32(o.F) : u16(o.F);
      sc.obj = { V: OV, N: vertexNormals(OV, OF), F: OF, wide: !!o.wide, rgb: (o.rgb || []).map(bytes), E: o.E ? (o.wide ? u32(o.E) : u16(o.E)) : null };
    }
    return sc;
  }

  const pending = {};
  function loadScene(id, base) {
    window.BRH_SCENES = window.BRH_SCENES || {};
    if (window.BRH_SCENES[id]) return Promise.resolve(window.BRH_SCENES[id]);
    if (!pending[id]) {
      pending[id] = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = (base || "static/data/") + id + ".js";
        s.onload = () => (window.BRH_SCENES[id] ? resolve(window.BRH_SCENES[id]) : reject(new Error("scene " + id)));
        s.onerror = () => reject(new Error("scene " + id));
        document.head.appendChild(s);
      });
    }
    return pending[id];
  }

  // ------------------------------------------------------------------ shaders
  const VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPosA;
layout(location=1) in vec3 aPosB;
layout(location=2) in vec3 aNrmA;
layout(location=3) in vec3 aNrmB;
layout(location=4) in float aSdA;
layout(location=5) in float aSdB;
layout(location=6) in vec3 aColA;
layout(location=7) in vec3 aColB;
uniform mat4 uView, uProj;
uniform float uT;
out vec3 vN;
out float vSd;
out vec3 vCol;
void main() {
  vec4 p = uView * vec4(mix(aPosA, aPosB, uT), 1.0);
  vN = mat3(uView) * mix(aNrmA, aNrmB, uT);
  vSd = mix(aSdA, aSdB, uT);
  vCol = mix(aColA, aColB, uT);
  gl_Position = uProj * p;
}`;

  const FS = `#version 300 es
precision highp float;
in vec3 vN;
in float vSd;
in vec3 vCol;
uniform int uColor;       // 0 signed distance, 1 vertex color, 2 glass, 3 crease line
uniform float uAlpha;
out vec4 o;
const vec3 SKIN = vec3(0.87, 0.67, 0.55), GREEN = vec3(0.12, 0.60, 0.27), RED = vec3(0.82, 0.08, 0.09), GLASS = vec3(0.52, 0.63, 0.79);
vec3 ramp(float s) {
  vec3 c = mix(GREEN, SKIN, clamp((s - 1.0) / 1.5, 0.0, 1.0));
  vec3 inside = mix(0.7 * RED + 0.3 * SKIN, RED, clamp((-s - 1.0) / 2.0, 0.0, 1.0));
  float w = max(fwidth(s), 1e-4);
  return mix(inside, c, smoothstep(-1.0 - w, -1.0 + w, s));
}
void main() {
  if (uColor == 3) { o = vec4(vCol * 0.55, uAlpha); return; }
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float head = max(n.z, 0.0);
  float side = max(dot(n, vec3(0.616, 0.0, 0.788)), 0.0);
  float top = max(dot(n, vec3(0.0, 0.574, 0.819)), 0.0);
  float shade = 0.34 + 0.44 * head + 0.17 * side + 0.11 * top;
  shade *= mix(0.80, 1.0, smoothstep(0.0, 0.6, head));
  vec3 base = uColor == 0 ? ramp(vSd) : (uColor == 1 ? vCol : GLASS);
  o = vec4(min(base * shade * 1.06, vec3(1.0)), uAlpha);
}`;

  function program(gl) {
    const mk = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  const IDLE_DELAY = 450, IDLE_RAMP = 900;   // ms
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  // ------------------------------------------------------------------ viewer
  /* opts:
       panels    (scene) => [{ track: [state index, ...], objRgb: color set of the object or undefined }]   default: one panel, all states
       cols      (css width, n panels) => columns of the panel grid                                        default: one row
       ratio     (css width) => height / width of a panel; the canvas' container is then sized by the viewer  default: unset
       object    "glass" | "solid" | "none"        hand: opacity of the hand at the start (0 ... 1)         zoom: distance factor
       fps       frames per second of play()       onState(i, scene)   onTime(time)   onLayout(rects in css px) */
  class Viewer {
    constructor(canvas, opts) {
      opts = opts || {};
      this.canvas = canvas; this.opts = opts;
      this.onState = opts.onState || function () {};
      this.onTime = opts.onTime || function () {};
      this.onLayout = opts.onLayout || function () {};
      const gl = canvas.getContext("webgl2", { antialias: true, alpha: true });      // every frame clears to opaque white; before the first one the page shows through
      if (!gl) throw new Error("WebGL2 is not available");
      this.gl = gl;
      this.prog = program(gl);
      this.u = {};
      ["uView", "uProj", "uT", "uColor", "uAlpha"].forEach((k) => (this.u[k] = gl.getUniformLocation(this.prog, k)));
      this.scene = null; this.bufs = null; this.panels = []; this.rects = []; this.L = 1;
      this.time = 0; this.tw = null; this.target = 0; this.playing = false; this.fps = opts.fps || 6;
      this.yaw = 0; this.pitch = 0; this.zoom = opts.zoom || 1;
      this.reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      this.swayAmp = ((opts.sway === undefined ? 16 : opts.sway) * Math.PI) / 180; this.swayPeriod = 9000;
      this.sway = !this.reduced && this.swayAmp > 0; this.phase = 0; this.held = false; this.since = -1e9;   // idle sway: paused while held, resumed from where the view is left
      this.objMode = opts.object || "glass";
      this.objAlpha = this.objTarget = this.objMode === "glass" ? 0.38 : 1;
      if (opts.objectHidden) this.objAlpha = this.objTarget = 0;
      this.handAlpha = this.handTarget = opts.hand === undefined ? 1 : opts.hand;
      this.visible = false; this.raf = 0; this.last = 0; this.view = null;
      this._bind();
    }

    _bind() {
      const c = this.canvas;
      c.style.touchAction = "pan-y";
      let drag = null;
      c.addEventListener("pointerdown", (e) => {
        this._settle(); this.held = true; this.view = null;
        drag = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch, touch: e.pointerType === "touch" };
        c.setPointerCapture(e.pointerId); c.classList.add("dragging");
      });
      c.addEventListener("pointermove", (e) => {
        if (!drag) return;
        this.yaw = drag.yaw - (e.clientX - drag.x) * 0.0075;
        if (!drag.touch) this.pitch = Math.max(-1.25, Math.min(1.25, drag.pitch + (e.clientY - drag.y) * 0.0075));
        this._kick(true);
      });
      const end = () => {
        if (!drag) return;
        drag = null; c.classList.remove("dragging");
        this.held = false; this.since = performance.now(); this._kick();      // the sway resumes from here
      };
      c.addEventListener("pointerup", end); c.addEventListener("pointercancel", end);
      c.addEventListener("dblclick", () => this.resetView());
      new ResizeObserver(() => { this._layout(); this._kick(true); }).observe(c);
      new IntersectionObserver((es) => { this.visible = es[0].isIntersecting; this._kick(); }).observe(c);
      document.addEventListener("visibilitychange", () => this._kick());
    }

    /** the panel grid: sizes the canvas' container when the stage asks for a panel ratio, and reports the panels in css px */
    _layout() {
      const c = this.canvas, n = Math.max(1, this.panels.length), W = c.clientWidth;
      if (!W) return;
      const cols = Math.max(1, Math.min(n, this.opts.cols ? this.opts.cols(W, n) : n)), rows = Math.ceil(n / cols);
      if (this.opts.ratio) {
        const h = Math.round((W / cols) * this.opts.ratio(W)) * rows + "px";
        if (c.parentElement.style.height !== h) c.parentElement.style.height = h;
      }
      const H = c.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (!H) return;
      const w = Math.max(2, Math.round(W * dpr)), h = Math.max(2, Math.round(H * dpr));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      const css = [];
      for (let k = 0; k < n; k++) css.push({ x: ((k % cols) * W) / cols, y: (Math.floor(k / cols) * H) / rows, w: W / cols, h: H / rows });
      this.rects = css.map((r) => ({ x: Math.round(r.x * dpr), y: Math.round((H - r.y - r.h) * dpr), w: Math.round(r.w * dpr), h: Math.round(r.h * dpr) }));
      const key = cols + "x" + rows + ":" + W + "x" + H;
      if (key !== this._key) { this._key = key; this.onLayout(css, cols, rows); }
    }

    setScene(raw) {
      const gl = this.gl, sc = decodeScene(raw);
      if (this.bufs) this.bufs.all.forEach((b) => gl.deleteBuffer(b));
      const all = [];
      const mk = (target, data) => { const b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, data, gl.STATIC_DRAW); all.push(b); return b; };
      this.bufs = {
        all: all,
        states: sc.states.map((s) => ({ pos: mk(gl.ARRAY_BUFFER, s.V), nrm: mk(gl.ARRAY_BUFFER, s.N), sd: s.sd ? mk(gl.ARRAY_BUFFER, s.sd) : null, rgb: s.rgb ? mk(gl.ARRAY_BUFFER, s.rgb) : null })),
        hidx: mk(gl.ELEMENT_ARRAY_BUFFER, sc.F),
      };
      if (sc.obj) {
        this.bufs.opos = mk(gl.ARRAY_BUFFER, sc.obj.V); this.bufs.onrm = mk(gl.ARRAY_BUFFER, sc.obj.N); this.bufs.oidx = mk(gl.ELEMENT_ARRAY_BUFFER, sc.obj.F);
        this.bufs.orgb = sc.obj.rgb.map((c) => mk(gl.ARRAY_BUFFER, c));
        this.bufs.oedge = sc.obj.E ? mk(gl.ELEMENT_ARRAY_BUFFER, sc.obj.E) : null;
      }
      this.scene = sc;
      this.panels = this.opts.panels ? this.opts.panels(sc) : [{ track: sc.states.map((_, i) => i) }];
      this.L = Math.max.apply(null, this.panels.map((p) => p.track.length));
      const d = Math.hypot(sc.cam.eye[0], sc.cam.eye[1], sc.cam.eye[2]);
      const b0 = norm(sc.cam.eye); let u0 = sc.cam.up;
      u0 = norm([u0[0] - dot(u0, b0) * b0[0], u0[1] - dot(u0, b0) * b0[1], u0[2] - dot(u0, b0) * b0[2]]);
      this.cam = { d: d, b0: b0, u0: u0, r0: cross(u0, b0), fovy: (sc.cam.fovy * Math.PI) / 180 };
      this.time = 0; this.tw = null; this.target = 0;
      this._key = null; this._layout();
      this.onState(0, sc); this.onTime(0);
      if (this.rects.length) this._draw();                 // one frame at once, also while off screen
      this._kick();
      return sc;
    }

    /** morph to state i of the track (through the states between) */
    goTo(i, dur) {
      if (!this.scene || i === this.target) return;
      this.target = i;
      this.tw = { from: this.time, to: i, t0: performance.now(), dur: this.reduced ? 1 : dur || 900 };
      this.onState(i, this.scene); this._kick();
    }
    play() { this.playing = true; this.tw = null; this._kick(); }
    pause() { this.playing = false; }
    seek(t) { this.tw = null; this.time = Math.max(0, Math.min(this.L - 1, t)); this.onTime(this.time); this._kick(true); }

    setObjectVisible(v) { this.objTarget = v ? (this.objMode === "glass" ? 0.38 : 1) : 0; this._kick(); }
    setHandOpacity(a) { this.handTarget = a; this._kick(); }

    resetView() {
      this._settle();
      this.view = { yaw: this.yaw, pitch: this.pitch, t0: performance.now() };
      this._kick();
    }

    /** fold the current sway offset into the view, so that pausing or restarting the sway never jumps */
    _settle() {
      if (this.sway) this.yaw += this.swayAmp * Math.sin(this.phase);
      this.phase = 0;
    }

    /** ask for a frame; `once` also while the canvas is off screen */
    _kick(once) {
      if (this.raf || !this.scene) return;
      if (!(this.visible && !document.hidden) && !once) return;
      this.last = 0;
      this.raf = requestAnimationFrame(() => this._frame());
    }

    _frame() {
      this.raf = 0;
      if (!this.scene) return;
      const shown = this.visible && !document.hidden;
      const now = performance.now();               // one clock for the frame and for the times set in goTo / resetView
      const dt = this.last ? Math.max(0, Math.min(now - this.last, 100)) : 16; this.last = now;
      let busy = false;
      if (this.tw) {
        const k = clamp01((now - this.tw.t0) / this.tw.dur);
        this.time = this.tw.from + (this.tw.to - this.tw.from) * ease(k); busy = true;
        if (k >= 1) this.tw = null;
        this.onTime(this.time);
      } else if (this.playing && this.L > 1) {
        this.time += (dt / 1000) * this.fps;
        if (this.time >= this.L - 1) this.time = 0;
        busy = true; this.onTime(this.time);
      }
      if (this.view) {                                   // easing back to the first view
        const k = clamp01((now - this.view.t0) / 600), e = 1 - ease(k);
        this.yaw = this.view.yaw * e; this.pitch = this.view.pitch * e; busy = true;
        if (k >= 1) { this.view = null; this.since = now; }
      }
      if (this.sway && !this.held && !this.view) {       // after a release: a short pause, then the sway eases in
        const u = clamp01((now - this.since - IDLE_DELAY) / IDLE_RAMP), k = u * u * (3 - 2 * u);
        this.phase += k * (dt / this.swayPeriod) * 2 * Math.PI; busy = true;
      }
      const step = (cur, to) => (Math.abs(cur - to) > 0.002 ? cur + (to - cur) * Math.min(1, dt / 120) : to);
      const oa = step(this.objAlpha, this.objTarget), ha = step(this.handAlpha, this.handTarget);
      if (oa !== this.objTarget || ha !== this.handTarget) busy = true;
      this.objAlpha = oa; this.handAlpha = ha;
      if (!this.rects.length) this._layout();
      if (this.rects.length) this._draw();
      if (busy && shown) this.raf = requestAnimationFrame(() => this._frame());
    }

    _view() {
      const c = this.cam, yaw = this.yaw + (this.sway ? this.swayAmp * Math.sin(this.phase) : 0), p = this.pitch;
      const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(p), sp = Math.sin(p);
      const b1 = [c.b0[0] * cy + c.r0[0] * sy, c.b0[1] * cy + c.r0[1] * sy, c.b0[2] * cy + c.r0[2] * sy];
      const r = [c.r0[0] * cy - c.b0[0] * sy, c.r0[1] * cy - c.b0[1] * sy, c.r0[2] * cy - c.b0[2] * sy];
      const b = [b1[0] * cp + c.u0[0] * sp, b1[1] * cp + c.u0[1] * sp, b1[2] * cp + c.u0[2] * sp];
      const u = [c.u0[0] * cp - b1[0] * sp, c.u0[1] * cp - b1[1] * sp, c.u0[2] * cp - b1[2] * sp];
      const d = c.d * this.zoom, e = [b[0] * d, b[1] * d, b[2] * d];
      return { d: d, m: new Float32Array([r[0], u[0], b[0], 0, r[1], u[1], b[1], 0, r[2], u[2], b[2], 0, -dot(r, e), -dot(u, e), -dot(b, e), 1]) };
    }
    _proj(a, d) {
      const f = 1 / Math.tan(this.cam.fovy / 2), n = d * 0.05, fa = d * 6;
      const px = a >= 1 ? f / a : f, py = a >= 1 ? f : f * a;
      return new Float32Array([px, 0, 0, 0, 0, py, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, (2 * fa * n) / (n - fa), 0]);
    }

    _attr(loc, buf, size, type) {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, type || gl.FLOAT, type === gl.UNSIGNED_BYTE, 0, 0);
    }
    _const(loc, v) {
      const gl = this.gl;
      gl.disableVertexAttribArray(loc);
      if (v.length === 3) gl.vertexAttrib3f(loc, v[0], v[1], v[2]); else gl.vertexAttrib1f(loc, v[0]);
    }

    /** a mesh, opaque, or (alpha < 1) only its nearest layer blended over what is drawn */
    _mesh(count, type, color, alpha) {
      const gl = this.gl;
      gl.uniform1i(this.u.uColor, color); gl.uniform1f(this.u.uAlpha, alpha);
      if (alpha >= 0.999) { gl.drawElements(gl.TRIANGLES, count, type, 0); return; }
      gl.colorMask(false, false, false, false);
      gl.drawElements(gl.TRIANGLES, count, type, 0);
      gl.colorMask(true, true, true, true); gl.depthMask(false); gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);   // the canvas stays opaque
      gl.drawElements(gl.TRIANGLES, count, type, 0);
      gl.disable(gl.BLEND); gl.depthMask(true); gl.depthFunc(gl.LESS);
    }

    _hand(p, alpha) {
      const gl = this.gl, sc = this.scene, B = this.bufs, L = p.track.length;
      const s = Math.max(0, Math.min(L - 1, this.time)), i0 = Math.min(L - 1, Math.floor(s)), i1 = Math.min(L - 1, i0 + 1);
      const A = B.states[p.track[i0]], Z = B.states[p.track[i1]];
      this._attr(0, A.pos, 3); this._attr(1, Z.pos, 3); this._attr(2, A.nrm, 3); this._attr(3, Z.nrm, 3);
      let color = 0;
      if (A.rgb) { color = 1; this._attr(6, A.rgb, 3, gl.UNSIGNED_BYTE); this._attr(7, Z.rgb, 3, gl.UNSIGNED_BYTE); this._const(4, [9]); this._const(5, [9]); }
      else { this._attr(4, A.sd, 1); this._attr(5, Z.sd, 1); this._const(6, [1, 1, 1]); this._const(7, [1, 1, 1]); }
      gl.uniform1f(this.u.uT, s - i0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, B.hidx);
      this._mesh(sc.F.length, gl.UNSIGNED_SHORT, color, alpha);
    }

    _object(p, alpha) {
      const gl = this.gl, sc = this.scene, B = this.bufs;
      this._attr(0, B.opos, 3); this._attr(1, B.opos, 3); this._attr(2, B.onrm, 3); this._attr(3, B.onrm, 3);
      this._const(4, [9]); this._const(5, [9]);
      const solid = this.objMode === "solid" && p.objRgb !== undefined;
      if (solid) { this._attr(6, B.orgb[p.objRgb], 3, gl.UNSIGNED_BYTE); this._attr(7, B.orgb[p.objRgb], 3, gl.UNSIGNED_BYTE); }
      else { this._const(6, [1, 1, 1]); this._const(7, [1, 1, 1]); }
      gl.uniform1f(this.u.uT, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, B.oidx);
      const type = sc.obj.wide ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, lines = B.oedge && alpha >= 0.999;
      if (lines) { gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1, 1); }      // the crease lines win the depth test on their faces
      this._mesh(sc.obj.F.length, type, solid ? 1 : 2, alpha);
      if (!lines) return;
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, B.oedge);
      gl.uniform1i(this.u.uColor, 3);
      gl.drawElements(gl.LINES, sc.obj.E.length, type, 0);
    }

    _draw() {
      const gl = this.gl, sc = this.scene, v = this._view();
      gl.disable(gl.SCISSOR_TEST);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(1, 1, 1, 1); gl.clearDepth(1);
      gl.colorMask(true, true, true, true); gl.depthMask(true);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
      gl.useProgram(this.prog);
      gl.uniformMatrix4fv(this.u.uView, false, v.m);
      gl.enable(gl.SCISSOR_TEST);
      const hasObj = !!sc.obj && this.objMode !== "none";
      for (let k = 0; k < this.panels.length; k++) {
        const r = this.rects[k], p = this.panels[k];
        if (!r) continue;
        gl.viewport(r.x, r.y, r.w, r.h); gl.scissor(r.x, r.y, r.w, r.h);
        gl.uniformMatrix4fv(this.u.uProj, false, this._proj(r.w / r.h, v.d));
        const ha = this.handAlpha, oa = hasObj ? this.objAlpha : 0;
        // opaque meshes first, then each translucent one as a single blended layer
        if (oa >= 0.999) this._object(p, 1);
        if (ha >= 0.999) this._hand(p, 1);
        if (ha > 0.003 && ha < 0.999) this._hand(p, ha);
        if (oa > 0.003 && oa < 0.999) this._object(p, oa);
      }
      gl.disable(gl.SCISSOR_TEST);
    }
  }

  window.BRH = { Viewer: Viewer, loadScene: loadScene };
})();
