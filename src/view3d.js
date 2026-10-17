/* WinchForce 3D view.
   Built with `npm run build:3d`, which bundles this file and the parts of
   three.js it uses into index.html (between the WF3D markers), so the app
   stays a single offline file.

   World axes: x = deck length (app x), y = up (app z, height above deck),
   z = -(app y) so that looking straight down matches the plan grid.

   The app owns all physics. This file only draws what it is given:
     WF3D.mount(el)            -> true if WebGL is available
     WF3D.update(data)         -> redraw for new points / results / selection
     WF3D.view(name)           -> 'quarter' | 'top' | 'side' | 'fit'
     WF3D.onPick = (kind, id)  -> kind 'pt' (id = point id), 'leg' (id = index) or null (empty space)
*/
import {
  Scene, PerspectiveCamera, WebGLRenderer, Color, HemisphereLight, DirectionalLight,
  Mesh, Group, MeshStandardMaterial, MeshBasicMaterial, PlaneGeometry, BoxGeometry, CylinderGeometry,
  TorusGeometry, ConeGeometry, SphereGeometry, OctahedronGeometry, TubeGeometry, LineCurve3, Vector3, Vector2, Raycaster,
  BufferGeometry, Float32BufferAttribute, LineSegments, LineBasicMaterial, LineDashedMaterial, Quaternion,
  DoubleSide, SRGBColorSpace,
} from 'three';

const S = {
  el: null, renderer: null, scene: null, camera: null, root: null, labels: null,
  cam: { target: new Vector3(), radius: 60, theta: -0.75, phi: 0.95 },  // theta: azimuth, phi: polar from +y
  touched: false, drag: null, level: null, data: null, pickables: [], raf: 0, span: 40, sig: '', box: null, labelDefs: [],
};
const WF3D = { onPick: null, onMove: null, onMoveEnd: null, mount, update, view, resize, active: () => !!S.renderer, screenOf };

const W = p => new Vector3(p.x, p.z, -p.y);             // app metres -> world
const WV = v => new Vector3(v[0], v[2], -v[1]);         // app vector -> world

// Screen position of a point or a leg midpoint (tests use this).
function screenOf(kind, id) {
  if (!S.data) return null;
  let v;
  if (kind === 'pt' || kind === 'zh') { const p = S.data.points.find(q => q.id === id); if (!p) return null; v = W(p); if (kind === 'zh') v.y += S.u * 2.4; }
  else { const a = S.data.points[id], b = S.data.points[id + 1]; if (!a || !b) return null; v = W(a).lerp(W(b), 0.5); }
  placeCamera(); v.project(S.camera);
  const r = S.renderer.domElement.getBoundingClientRect();
  return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
}

/* ------------------------------------------------------------------ */
function mount(el) {
  if (S.renderer) { if (S.el !== el) el.appendChild(S.renderer.domElement); S.el = el; resize(); return true; }
  let renderer;
  try { renderer = new WebGLRenderer({ antialias: true, alpha: false }); } catch (e) { return false; }
  if (!renderer.getContext()) return false;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  S.renderer = renderer; S.el = el;
  const cv = renderer.domElement;
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;outline:none';
  el.appendChild(cv);
  S.labels = document.createElement('div');
  S.labels.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
  el.appendChild(S.labels);

  S.scene = new Scene();
  S.camera = new PerspectiveCamera(42, 1, 0.1, 50000);
  S.scene.add(new HemisphereLight(0xe6f2ff, 0x2a3138, 1.25));
  const sun = new DirectionalLight(0xffffff, 1.5); sun.position.set(-40, 90, 60); S.scene.add(sun);
  const fill = new DirectionalLight(0x9fc4ff, 0.45); fill.position.set(60, 30, -80); S.scene.add(fill);
  S.root = new Group(); S.scene.add(S.root);
  bindControls(cv);
  new ResizeObserver(resize).observe(el);
  resize();
  return true;
}

function resize() {
  if (!S.renderer || !S.el) return;
  const w = Math.max(10, S.el.clientWidth), h = Math.max(10, S.el.clientHeight);
  S.renderer.setSize(w, h, false);
  S.camera.aspect = w / h; S.camera.updateProjectionMatrix();
  render();
}

function clearRoot() {
  S.root.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
  });
  S.root.clear();
  S.pickables = [];
}
const mat = (color, o = {}) => new MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, ...o });
const glow = (color, k = 0.35, o = {}) => mat(color, { emissive: new Color(color), emissiveIntensity: k, ...o });

/* ------------------------------------------------------------------ */
function update(data) {
  if (!S.renderer) return;
  const sig = JSON.stringify(data) + JSON.stringify(S.level);
  if (sig === S.sig) return;                 // nothing changed: keep the frame
  S.sig = sig; S.data = data;
  clearRoot();
  const T = data.theme, D = data.deck, P = data.points;
  const span = Math.max(D.X, D.Y, 8); S.span = span;
  const u = Math.min(4, Math.max(0.6, span * 0.03)); S.u = u;   // drawn size of fittings (not to scale on big decks)
  S.renderer.setClearColor(new Color(T.bg));

  // ---- deck
  const below = P.some(p => p.z < -0.05);     // something under the deck: let it show through
  const deck = new Mesh(new BoxGeometry(D.X, 0.12, D.Y), mat(T.deck, { roughness: 0.9, metalness: 0, transparent: below, opacity: below ? 0.72 : 1, depthWrite: !below }));
  deck.position.set(D.X / 2, -0.06, -D.Y / 2); S.root.add(deck);
  const step = niceStep(span / 10);
  S.root.add(new LineSegments(gridGeom(D.X, D.Y, step / 5, 0.005), new LineBasicMaterial({ color: T.grid, transparent: true, opacity: 0.35 })));
  S.root.add(new LineSegments(gridGeom(D.X, D.Y, step, 0.01), new LineBasicMaterial({ color: T.grid2, transparent: true, opacity: 0.9 })));
  S.root.add(new LineSegments(edgeGeom(D.X, D.Y, 0.02), new LineBasicMaterial({ color: T.edge })));

  const show = data.show;
  const colOf = c => show && c && T[c] ? T[c] : T.line;

  // ---- legs
  const rl = Math.max(0.05, u * 0.09);
  data.legs.forEach((L, i) => {
    const a = W(P[i]), b = W(P[i + 1]), c = colOf(L.cls), sel = data.selLeg === i;
    const curve = new LineCurve3(a, b);
    const tube = new Mesh(new TubeGeometry(curve, 1, sel ? rl * 1.9 : rl, 10, false), glow(c, sel ? 0.6 : 0.22));
    S.root.add(tube);
    if (sel) { const halo = new Mesh(new TubeGeometry(curve, 1, rl * 4.5, 12, false), new MeshBasicMaterial({ color: T.sel, transparent: true, opacity: 0.22, depthWrite: false })); S.root.add(halo); }
    const hit = new Mesh(new TubeGeometry(curve, 1, Math.max(rl * 6, span * 0.018), 6, false), new MeshBasicMaterial({ visible: false }));
    hit.userData = { kind: 'leg', id: i }; S.root.add(hit); S.pickables.push(hit);
    // where the line passes through the deck
    if ((P[i].z > 0.02 && P[i + 1].z < -0.02) || (P[i].z < -0.02 && P[i + 1].z > 0.02)) {
      const k = P[i].z / (P[i].z - P[i + 1].z), x = a.clone().lerp(b, k);
      const ring = new Mesh(new TorusGeometry(u * 0.55, u * 0.09, 8, 32), new MeshBasicMaterial({ color: T.sel }));
      ring.rotation.x = Math.PI / 2; ring.position.copy(x); S.root.add(ring);
      const hole = new Mesh(new CylinderGeometry(u * 0.5, u * 0.5, 0.14, 28), new MeshBasicMaterial({ color: T.bg }));
      hole.position.copy(x); S.root.add(hole);
    }
  });
  // the level being dragged to
  if (S.level) {
    const lv = new Mesh(new PlaneGeometry(D.X, D.Y), new MeshBasicMaterial({ color: T.sel, transparent: true, opacity: 0.1, side: DoubleSide, depthWrite: false }));
    lv.rotation.x = -Math.PI / 2; lv.position.set(D.X / 2, S.level.y, -D.Y / 2); S.root.add(lv);
    S.root.add(new LineSegments(edgeGeom(D.X, D.Y, S.level.y), new LineBasicMaterial({ color: T.sel, transparent: true, opacity: 0.6 })));
  }

  // ---- points
  const maxR = Math.max(1e-9, ...P.filter(p => p.role !== 'start').map(p => p.R || 0));
  P.forEach(p => {
    const g = new Group(), w = W(p), c = p.role === 'start' ? T.known : p.role === 'end' ? T.sel : (show && p.cls ? T[p.cls] : T.ink2);
    const body = mat(T.metal), accent = glow(c, p.sel ? 0.55 : 0.18);
    g.position.copy(w);
    const h = Math.max(0, p.z);
    if (p.type === 'winch') {
      const base = new Mesh(new BoxGeometry(u * 2.2, Math.max(0.2, h), u * 2.4), body); base.position.y = -h / 2; g.add(base);
      const drum = new Mesh(new CylinderGeometry(u * 0.7, u * 0.7, u * 1.8, 24), accent); drum.rotation.x = Math.PI / 2; g.add(drum);
      [-1, 1].forEach(s => { const f = new Mesh(new CylinderGeometry(u * 1.0, u * 1.0, u * 0.12, 24), body); f.rotation.x = Math.PI / 2; f.position.z = s * u * 0.95; g.add(f); });
    } else if (p.type === 'bollard') {
      const post = new Mesh(new CylinderGeometry(u * 0.45, u * 0.5, Math.max(0.3, h + u * 0.3), 24), accent); post.position.y = (u * 0.3 - h) / 2; g.add(post);
      const cap = new Mesh(new CylinderGeometry(u * 0.62, u * 0.62, u * 0.14, 24), body); cap.position.y = u * 0.3; g.add(cap);
      const foot = new Mesh(new BoxGeometry(u * 1.4, 0.12, u * 1.4), body); foot.position.y = -h + 0.06; g.add(foot);
    } else if (p.type === 'block' || p.type === 'purchase') {
      const sheave = new Mesh(new TorusGeometry(u * 0.55, u * 0.16, 12, 28), accent);
      // sheave plane contains the line in and out
      if (p.n) { const n = WV(p.n).normalize(); if (n.lengthSq() > 0.5) sheave.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), n)); }
      g.add(sheave);
      const hub = new Mesh(new SphereGeometry(u * 0.2, 12, 8), body); g.add(hub);
      if (Math.abs(p.z) > 0.2) addDrop(g, p.z, T, u);
    } else if (p.type === 'fairlead') {
      const box = new Mesh(new BoxGeometry(u * 1.2, Math.max(0.3, h + u * 0.4), u * 0.5), accent); box.position.y = (u * 0.4 - h) / 2; g.add(box);
      const roll = new Mesh(new CylinderGeometry(u * 0.22, u * 0.22, u * 1.3, 16), body); roll.rotation.z = Math.PI / 2; roll.position.y = u * 0.25; g.add(roll);
    } else if (p.type === 'padeye') {
      const eye = new Mesh(new TorusGeometry(u * 0.38, u * 0.12, 10, 24), accent); g.add(eye);
      const plate = new Mesh(new BoxGeometry(u * 1.1, Math.max(0.12, h), u * 0.25), body); plate.position.y = -h / 2 - u * 0.2; g.add(plate);
    } else {                                   // the load
      const load = new Mesh(new OctahedronGeometry(u * 0.85, 0), accent); g.add(load);
      if (Math.abs(p.z) > 0.2) addDrop(g, p.z, T, u);
    }
    if (p.sel) {
      const ring = new Mesh(new TorusGeometry(u * 1.5, u * 0.07, 8, 40), new MeshBasicMaterial({ color: T.sel })); ring.rotation.x = Math.PI / 2; ring.position.y = -p.z + 0.05; g.add(ring);
      // up/down handle: drag it to raise or lower the point
      const hm = new MeshBasicMaterial({ color: T.sel }), hy = u * 2.4;
      const stem = new Mesh(new CylinderGeometry(u * 0.06, u * 0.06, hy - u * 0.9, 8), hm); stem.position.y = u * 0.9 + (hy - u * 0.9) / 2 - u * 0.45; g.add(stem);
      const upC = new Mesh(new ConeGeometry(u * 0.32, u * 0.6, 16), hm); upC.position.y = hy + u * 0.3; g.add(upC);
      const dnC = new Mesh(new ConeGeometry(u * 0.32, u * 0.6, 16), hm); dnC.rotation.x = Math.PI; dnC.position.y = hy - u * 0.45; g.add(dnC);
      const zh = new Mesh(new SphereGeometry(u * 1.1, 10, 8), new MeshBasicMaterial({ visible: false }));
      zh.position.copy(w).add(new Vector3(0, hy, 0)); zh.userData = { kind: 'zh', id: p.id }; S.root.add(zh); S.pickables.push(zh);
    }
    S.root.add(g);
    const hit = new Mesh(new SphereGeometry(Math.max(u * 1.6, span * 0.025), 10, 8), new MeshBasicMaterial({ visible: false }));
    hit.position.copy(w); hit.userData = { kind: 'pt', id: p.id }; S.root.add(hit); S.pickables.push(hit);

    // load arrow: the pull the line puts on the point (bollards, blocks, fairleads and the end)
    if (show && p.role !== 'start' && p.R > 0 && p.Rv) {
      const dir = WV(p.Rv).normalize(), len = span * (0.05 + 0.13 * (p.R / maxR));
      S.root.add(arrow(w, dir, len, u, T.res));
    }
  });

  // ---- labels (drawn as HTML on top)
  S.labelDefs = [];
  data.legs.forEach((L, i) => {
    if (!show) return;
    S.labelDefs.push({ p: W(P[i]).lerp(W(P[i + 1]), 0.5), text: L.text, color: colOf(L.cls), pri: data.selLeg === i ? 3 : 1, cls: data.selLeg === i ? 'on' : '' });
  });
  P.forEach(p => {
    const lift = new Vector3(0, p.sel ? u * 4 : u * 1.9, 0);
    if (p.sel && S.level) S.labelDefs.push({ p: W(p).add(new Vector3(0, u * 2.4, 0)), text: (p.z >= 0 ? '+' : '') + p.z.toFixed(1) + ' m', color: T.sel, pri: 5, cls: 'on', side: 1 });
    S.labelDefs.push({ p: W(p).add(lift), text: p.code + (show && p.text ? ' · ' + p.text : ''), color: p.role === 'start' ? T.known : p.role === 'end' ? T.sel : (show && p.cls ? T[p.cls] : T.ink), pri: p.sel ? 4 : 2, cls: 'pt' + (p.sel ? ' on' : '') });
  });
  S.labelDefs.sort((a, b) => b.pri - a.pri);

  const zs = P.map(p => p.z);
  S.box = { x0: 0, x1: D.X, y0: Math.min(0, ...zs), y1: Math.max(2, ...zs) + u * 2, z0: -D.Y, z1: 0 };
  if (!S.touched) fitCamera('quarter', false);
  render();
}

function addDrop(g, h, T, u) {                 // dashed plumb line to the deck, and a footprint
  const geo = new BufferGeometry().setFromPoints([new Vector3(0, 0, 0), new Vector3(0, -h, 0)]);
  const ln = new LineSegments(geo, new LineDashedMaterial({ color: T.ink3, dashSize: u * 0.35, gapSize: u * 0.25 }));
  ln.computeLineDistances(); g.add(ln);
  const foot = new Mesh(new CylinderGeometry(u * 0.5, u * 0.5, 0.04, 24), new MeshBasicMaterial({ color: T.ink3, transparent: true, opacity: 0.5 }));
  foot.position.y = -h + 0.03; g.add(foot);
}

function arrow(from, dir, len, u, color) {
  const g = new Group(), head = Math.min(len * 0.35, u * 1.1), shaft = Math.max(0.01, len - head), r = Math.max(0.05, u * 0.11);
  const m = glow(color, 0.45, { transparent: true, opacity: 0.92 });
  const s = new Mesh(new CylinderGeometry(r, r, shaft, 12), m); s.position.y = shaft / 2; g.add(s);
  const c = new Mesh(new ConeGeometry(r * 2.8, head, 16), m); c.position.y = shaft + head / 2; g.add(c);
  g.position.copy(from);
  g.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir));
  return g;
}

function gridGeom(X, Y, step, y) {
  const v = [];
  for (let x = 0; x <= X + 1e-6; x += step) v.push(x, y, 0, x, y, -Y);
  for (let z = 0; z <= Y + 1e-6; z += step) v.push(0, y, -z, X, y, -z);
  const geo = new BufferGeometry(); geo.setAttribute('position', new Float32BufferAttribute(v, 3)); return geo;
}
function edgeGeom(X, Y, y) {
  const v = [0, y, 0, X, y, 0, X, y, 0, X, y, -Y, X, y, -Y, 0, y, -Y, 0, y, -Y, 0, y, 0];
  const geo = new BufferGeometry(); geo.setAttribute('position', new Float32BufferAttribute(v, 3)); return geo;
}
function niceStep(raw) { const m = 10 ** Math.floor(Math.log10(raw)), f = raw / m; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * m; }

/* ------------------------------------------------------------------ */
function fitCamera(name, animate) {
  const b = S.box || { x0: 0, x1: 40, y0: 0, y1: 4, z0: -20, z1: 0 };
  const tall = (S.camera.aspect || 1) < 0.9;   // phone held upright: run the deck's length up the screen
  const presets = { quarter: tall ? { theta: Math.PI / 2 - 0.22, phi: 0.72 } : { theta: -0.62, phi: 0.98 }, top: { theta: 0, phi: 0.001 }, side: { theta: 0, phi: Math.PI / 2 - 0.08 } };
  const p = presets[name] || presets.quarter;
  const center = new Vector3((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
  const half = new Vector3((b.x1 - b.x0) / 2, (b.y1 - b.y0) / 2, (b.z1 - b.z0) / 2);
  // project the box's corners onto the camera's right/up axes for this direction, then back off until it fits
  const fwd = new Vector3(-Math.sin(p.phi) * Math.sin(p.theta), -Math.cos(p.phi), -Math.sin(p.phi) * Math.cos(p.theta)).normalize();
  const upW = Math.abs(fwd.y) > 0.99 ? new Vector3(0, 0, -1) : new Vector3(0, 1, 0);
  const right = new Vector3().crossVectors(fwd, upW).normalize(), up = new Vector3().crossVectors(right, fwd).normalize();
  let sx = 0, sy = 0;
  for (const i of [-1, 1]) for (const j of [-1, 1]) for (const k of [-1, 1]) {
    const c = new Vector3(half.x * i, half.y * j, half.z * k);
    sx = Math.max(sx, Math.abs(c.dot(right))); sy = Math.max(sy, Math.abs(c.dot(up)));
  }
  // the value bar covers the top and the button rail the right: fit the box in what's left
  const Wd = S.el ? S.el.clientWidth : 800, Hd = S.el ? S.el.clientHeight : 600, railW = 84, barH = Math.min(Hd * 0.35, 135);
  const t = Math.tan((S.camera.fov * Math.PI / 180) / 2), asp = (Wd - railW) / (Hd - barH);
  const radius = Math.max(sy / t, sx / (t * asp)) * 1.18 * (Hd / (Hd - barH));
  // shift the target so the box sits in the middle of the free area
  const perPx = 2 * radius * t / Hd;
  const target = center.clone().addScaledVector(right, railW / 2 * perPx).addScaledVector(up, barH / 2 * perPx);
  const to = { target, radius, theta: p.theta, phi: p.phi };
  if (!animate || matchMedia('(prefers-reduced-motion: reduce)').matches) { Object.assign(S.cam, to); render(); return; }
  const from = { target: S.cam.target.clone(), radius: S.cam.radius, theta: S.cam.theta, phi: S.cam.phi };
  let dt = from.theta - to.theta; while (dt > Math.PI) { from.theta -= 2 * Math.PI; dt -= 2 * Math.PI; } while (dt < -Math.PI) { from.theta += 2 * Math.PI; dt += 2 * Math.PI; }
  const t0 = performance.now(), DUR = 520;
  const step = now => {
    const k = Math.min(1, (now - t0) / DUR), e = 1 - (1 - k) ** 3;
    S.cam.target.lerpVectors(from.target, to.target, e);
    S.cam.radius = from.radius + (to.radius - from.radius) * e;
    S.cam.theta = from.theta + (to.theta - from.theta) * e;
    S.cam.phi = from.phi + (to.phi - from.phi) * e;
    renderNow();
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function view(name) { if (name === 'fit') { S.touched = false; name = 'quarter'; } else S.touched = true; fitCamera(name, true); }

function placeCamera() {
  const { target, radius, theta, phi } = S.cam;
  S.camera.position.set(
    target.x + radius * Math.sin(phi) * Math.sin(theta),
    target.y + radius * Math.cos(phi),
    target.z + radius * Math.sin(phi) * Math.cos(theta),
  );
  // straight down: keep the plan's "up the screen" = away from the deck's near edge
  S.camera.up.set(0, 1, 0);
  if (phi < 0.02) S.camera.up.set(-Math.sin(theta), 0, -Math.cos(theta));
  S.camera.lookAt(target);
}

function render() { if (!S.renderer || S.raf) return; S.raf = requestAnimationFrame(() => { S.raf = 0; renderNow(); }); }
function renderNow() {
  if (!S.renderer) return;
  placeCamera();
  S.renderer.render(S.scene, S.camera);
  drawLabels();
}

function drawLabels() {
  if (!S.labels) return;
  const w = S.el.clientWidth, h = S.el.clientHeight;
  S.labels.innerHTML = '';
  const boxes = [];
  S.labelDefs.forEach(l => {
    const v = l.p.clone().project(S.camera);
    if (v.z > 1 || v.z < -1) return;
    const x = (v.x + 1) / 2 * w, y = (1 - v.y) / 2 * h;
    if (x < -40 || x > w + 40 || y < -20 || y > h + 20) return;
    const el = document.createElement('div');
    el.className = 'lbl3d ' + l.cls;
    el.textContent = l.text;
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.style.setProperty('--c', l.color);
    S.labels.appendChild(el);
    const r = el.getBoundingClientRect();
    if (boxes.some(b => r.left < b.right + 3 && r.right > b.left - 3 && r.top < b.bottom + 2 && r.bottom > b.top - 2)) { el.remove(); return; }
    boxes.push(r);
  });
}

/* ------------------------------------------------------------------ */
function bindControls(cv) {
  const ray = new Raycaster(), ndc = new Vector2(), pointers = new Map();
  let mode = null, pinch0 = 0, moved = 0, lastTap = 0;
  const pick = e => {
    const rect = cv.getBoundingClientRect();
    ndc.set((e.clientX - rect.left) / rect.width * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, S.camera);
    const hits = ray.intersectObjects(S.pickables, false);
    const h = hits.find(h => h.object.userData.kind === 'zh') || hits.find(h => h.object.userData.kind === 'pt') || hits[0];   // handle, then point, then line
    return h ? h.object.userData : null;
  };
  const rayAt = e => { const rect = cv.getBoundingClientRect(); ndc.set((e.clientX - rect.left) / rect.width * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1); ray.setFromCamera(ndc, S.camera); return ray.ray; };
  const ptPos = id => { const p = S.data && S.data.points.find(q => q.id === id); return p ? W(p) : null; };
  function dragTo(e) {
    const d = S.drag, r = rayAt(e), at = d.a0 || ptPos(d.id); if (!at) return;
    if (d.kind === 'zh') {                      // closest point on the vertical line through the point
      const w0 = r.origin.clone().sub(at), dir = r.direction, b = dir.y, dd = w0.dot(dir), e2 = w0.y;
      const den = 1 - b * b; if (den < 1e-4) return;
      const t = (e2 - b * dd) / den;            // height offset along +y
      const z = d.z0 + (t - d.t0);
      S.level = { y: z };
      if (WF3D.onMove) WF3D.onMove(d.id, { z });
    } else {                                     // slide on the point's own level
      if (Math.abs(r.direction.y) < 0.03) return;
      const k = (at.y - r.origin.y) / r.direction.y; if (k <= 0) return;
      const hit = r.origin.clone().addScaledVector(r.direction, k);
      if (WF3D.onMove) WF3D.onMove(d.id, { x: hit.x - d.off.x, y: -(hit.z - d.off.z) });
    }
  }
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => {
    try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0;
    mode = (e.button === 2 || e.shiftKey || pointers.size === 2) ? 'pan' : 'orbit';
    S.drag = null;
    if (pointers.size === 1 && mode === 'orbit') {
      const h = pick(e);
      if (h && (h.kind === 'pt' || h.kind === 'zh')) {
        const at = ptPos(h.id), r = rayAt(e);
        if (h.kind === 'zh') {
          const w0 = r.origin.clone().sub(at), dir = r.direction, b = dir.y, dd = w0.dot(dir), den = 1 - b * b;
          S.drag = { kind: 'zh', id: h.id, a0: at.clone(), z0: at.y, t0: den > 1e-4 ? (w0.y - b * dd) / den : 0 };
        } else if (Math.abs(r.direction.y) > 0.03) {
          const k = (at.y - r.origin.y) / r.direction.y, hit = r.origin.clone().addScaledVector(r.direction, k);
          S.drag = { kind: 'pt', id: h.id, off: hit.sub(at) };
        }
      }
    }
    if (pointers.size === 2) { S.drag = null; const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  cv.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) { if (e.pointerType === 'mouse') cv.style.cursor = pick(e) ? 'pointer' : 'grab'; return; }
    const prev = pointers.get(e.pointerId), dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved < 6) return;
    if (S.drag) { S.drag.moved = true; cv.style.cursor = 'grabbing'; dragTo(e); return; }
    S.touched = true;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()], dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0) zoomBy(pinch0 / dist);
      pinch0 = dist; pan(dx / 2, dy / 2);
    } else if (mode === 'pan') pan(dx, dy);
    else {
      S.cam.theta -= dx * 0.007;
      S.cam.phi = Math.min(Math.PI / 2 - 0.02, Math.max(0.001, S.cam.phi - dy * 0.007));   // never below the deck
    }
    render();
  });
  const end = e => {
    const was = pointers.has(e.pointerId); pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch0 = 0;
    if (S.drag && S.drag.moved) { S.drag = null; S.level = null; cv.style.cursor = 'grab'; if (WF3D.onMoveEnd) WF3D.onMoveEnd(); return; }
    S.drag = null;
    if (was && moved < 6 && e.type === 'pointerup' && pointers.size === 0) {
      const now = performance.now();
      if (now - lastTap < 320) { lastTap = 0; view('fit'); return; }
      lastTap = now;
      const h = pick(e);
      if (WF3D.onPick) WF3D.onPick(h ? h.kind : null, h ? h.id : null);
    }
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  cv.addEventListener('wheel', e => { e.preventDefault(); S.touched = true; zoomBy(Math.exp(e.deltaY * 0.0012)); render(); }, { passive: false });
  cv.style.cursor = 'grab';

  function zoomBy(f) { S.cam.radius = Math.min(S.span * 15, Math.max(2, S.cam.radius * f)); }
  function pan(dx, dy) {
    const k = S.cam.radius * 0.0018;
    const fwd = new Vector3().subVectors(S.cam.target, S.camera.position).normalize();
    const right = new Vector3().crossVectors(fwd, S.camera.up).normalize();
    const up = new Vector3().crossVectors(right, fwd).normalize();
    S.cam.target.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
  }
}

window.WF3D = WF3D;
