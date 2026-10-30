// Cenário: varanda de palafita à beira do rio ao entardecer, mesa de madeira com o tabuleiro
// pintado (o rio sinuoso com as casas), bandeja de feltro para os dados, copo, bacia do
// redemoinho, barquinhos, pontes, cachoeiras, árvores e a placa dos pilotos.
import * as THREE from '../vendor/three/three.module.js';
import { C, BOARD } from './rules.js';
import { DIE, TRAY, FACE_AXES } from './dice.js';

export const TOP = 0.76;                                    // altura do tampo da mesa
export const BOARD_POS = new THREE.Vector3(0, TOP + 0.02, -0.17);
export const TRAY_POS = new THREE.Vector3(0.0, TOP + 0.006, 0.42);
export const CUP_POS = new THREE.Vector3(0.3, TOP, 0.45);
export const BOWL_POS = new THREE.Vector3(0.5, TOP, 0.36);
export const KEPT_POS = new THREE.Vector3(-0.33, TOP + 0.012, 0.44);
export const BOAT_COLORS = ['#ff6a3d', '#4fbf6a', '#4f8fe0', '#b468e0'];
const RIVER_W = 0.074;

function canvasTex(w, h, draw, { repeat = null, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  t.anisotropy = 4;
  return t;
}
function hash(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

// ---------- texturas ----------
function woodTex(base, dark, w = 512, h = 512, planks = 6) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let p = 0; p < planks; p++) {
      const y = p * h / planks;
      g.fillStyle = `rgba(0,0,0,${0.05 + hash(p) * 0.08})`; g.fillRect(0, y, w, h / planks);
      g.strokeStyle = dark; g.lineWidth = 3; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
      for (let k = 0; k < 18; k++) {
        g.strokeStyle = `rgba(60,30,10,${0.08 + hash(p * 31 + k) * 0.12})`; g.lineWidth = 1 + hash(k + p) * 2;
        const yy = y + hash(p * 7 + k * 3) * h / planks;
        g.beginPath(); g.moveTo(0, yy);
        for (let x = 0; x <= w; x += 32) g.lineTo(x, yy + Math.sin(x * 0.02 + k) * 3);
        g.stroke();
      }
    }
  }, { repeat: [1, 1] });
}

function pipTex(v) {
  return canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 20, 64, 64, 92);
    gr.addColorStop(0, '#fffaf0'); gr.addColorStop(0.75, '#f4ead6'); gr.addColorStop(1, '#c9b894');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const P = { 1: [[64, 64]], 2: [[34, 34], [94, 94]], 3: [[32, 32], [64, 64], [96, 96]], 4: [[34, 34], [94, 34], [34, 94], [94, 94]],
      5: [[32, 32], [96, 32], [64, 64], [32, 96], [96, 96]], 6: [[34, 30], [94, 30], [34, 64], [94, 64], [34, 98], [94, 98]] }[v];
    for (const [x, y] of P) {
      g.fillStyle = v === 1 ? '#1d6f9e' : '#2a1a10';
      g.beginPath(); g.arc(x, y, v === 1 ? 22 : 11, 0, Math.PI * 2); g.fill();
      if (v === 1) {
        // o 1 é o redemoinho: espiral no lugar do ponto
        g.strokeStyle = '#bfe9ff'; g.lineWidth = 4; g.beginPath();
        for (let a = 0; a < 12; a += 0.2) { const r = 2 + a * 1.5; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
        g.stroke();
      }
    }
  });
}

// ---------- dados ----------
export function makeDiceMeshes(n) {
  // ordem dos materiais da BoxGeometry: +x, -x, +y, -y, +z, -z
  const order = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const mats = order.map(ax => {
    const f = FACE_AXES.find(a => a.n.every((c, k) => c === ax[k]));
    return new THREE.MeshStandardMaterial({ map: pipTex(f.v), roughness: 0.35, metalness: 0.0 });
  });
  const geo = new THREE.BoxGeometry(DIE, DIE, DIE);
  const list = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, mats);
    const glow = new THREE.Mesh(new THREE.RingGeometry(DIE * 0.75, DIE * 0.98, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x7dffb0, transparent: true, opacity: 0.9, depthWrite: false }));
    glow.renderOrder = 3; glow.visible = false;
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(DIE * 1.6, DIE * 1.6).rotateX(-Math.PI / 2), shadowMat);
    shadow.renderOrder = 2;
    list.push({ mesh: m, glow, shadow });
  }
  return list;
}
const shadowMat = new THREE.MeshBasicMaterial({
  map: canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }),
  transparent: true, depthWrite: false,
});

// ---------- barcos ----------
export function makeBoat(color) {
  const g = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.7 });
  const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), hullMat);
  hull.scale.set(0.0085, 0.009, 0.019);
  hull.position.y = 0.007;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 6, 20), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
  rim.rotation.x = Math.PI / 2; rim.scale.set(0.0085, 0.019, 0.01); rim.position.y = 0.007;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.0009, 0.0009, 0.034, 6), new THREE.MeshStandardMaterial({ color: 0x4a2c14 }));
  mast.position.set(0, 0.024, 0.003);
  const sailGeo = new THREE.BufferGeometry();
  sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.04, 0.003, 0, 0.011, 0.003, 0, 0.011, -0.016], 3));
  sailGeo.computeVertexNormals();
  const sail = new THREE.Mesh(sailGeo, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.6, emissive: color, emissiveIntensity: 0.15 }));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 12, 8), new THREE.MeshStandardMaterial({ color: 0xf2c9a0 }));
  head.position.set(0, 0.016, 0.009);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.004, 12), new THREE.MeshStandardMaterial({ color: 0xe8d28a }));
  hat.position.set(0, 0.0205, 0.009);
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.014, 0.018, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
  marker.position.y = 0.002; marker.visible = false;
  g.add(hull, rim, mast, sail, head, hat, marker);
  g.userData = { marker, sail };
  return g;
}

// ---------- tabuleiro ----------
const PX = 2048, PY = Math.round(2048 * BOARD.d / BOARD.w);
const toPx = (x, z) => [(x / BOARD.w + 0.5) * PX, (z / BOARD.d + 0.5) * PY];
const M2P = PX / BOARD.w;

function drawBoard(river) {
  return canvasTex(PX, PY, (g) => {
    // grama com manchas
    const gr = g.createLinearGradient(0, 0, 0, PY);
    gr.addColorStop(0, '#5e8f3c'); gr.addColorStop(1, '#7aa84a');
    g.fillStyle = gr; g.fillRect(0, 0, PX, PY);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `rgba(${hash(i) > 0.5 ? '40,80,20' : '150,190,90'},${0.12 + hash(i * 3) * 0.15})`;
      g.beginPath(); g.arc(hash(i * 7) * PX, hash(i * 13) * PY, 3 + hash(i * 17) * 10, 0, Math.PI * 2); g.fill();
    }
    // moldura pintada
    g.strokeStyle = '#3d2410'; g.lineWidth = 26; g.strokeRect(13, 13, PX - 26, PY - 26);
    g.strokeStyle = '#d9b26a'; g.lineWidth = 6; g.strokeRect(34, 34, PX - 68, PY - 68);
    // rio: margem de areia, água funda, água clara no meio
    const P = river.path.pts;
    const stroke = (w, style) => {
      g.strokeStyle = style; g.lineWidth = w * M2P; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath();
      P.forEach((p, i) => { const [x, y] = toPx(p.x, p.z); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.stroke();
    };
    stroke(RIVER_W + 0.022, '#c9b07a');
    stroke(RIVER_W + 0.01, '#9c8a5a');
    stroke(RIVER_W, river.def.water[0]);
    stroke(RIVER_W * 0.55, river.def.water[1]);
    // pontes: caminho de terra por baixo
    for (const b of river.bridges) {
      const a = river.cells[b.from], c = river.cells[b.to];
      const [x1, y1] = toPx(a.x, a.z), [x2, y2] = toPx(c.x, c.z);
      g.strokeStyle = 'rgba(90,60,30,0.5)'; g.lineWidth = 0.03 * M2P; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    }
    // casas
    const R = 0.0135 * M2P;
    for (const c of river.cells) {
      const [x, y] = toPx(c.x, c.z);
      const fill = { [C.NORMAL]: 'rgba(240,226,190,0.85)', [C.CURRENT]: '#3fd0e8', [C.FALL]: '#ffffff', [C.BRIDGE]: '#ffcf4a', [C.EXIT]: '#ffe9a8',
        [C.ROCK]: '#8a8f96', [C.START]: '#7dff9a', [C.DOCK]: '#ffffff' }[c.type];
      g.fillStyle = fill;
      g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(40,30,20,0.75)'; g.lineWidth = 3; g.stroke();
      g.save(); g.translate(x, y); g.rotate(-c.ang);
      if (c.type === C.CURRENT) {
        // setas na direção do rio
        g.strokeStyle = '#0b4a66'; g.lineWidth = 5; g.lineCap = 'round';
        for (const o of [-8, 6]) { g.beginPath(); g.moveTo(-10, o - 6); g.lineTo(0, o + 4); g.lineTo(10, o - 6); g.stroke(); }
      } else if (c.type === C.FALL) {
        g.strokeStyle = '#2a6fa8'; g.lineWidth = 4;
        for (const o of [-12, -4, 4, 12]) { g.beginPath(); g.moveTo(o, -12); g.quadraticCurveTo(o + 4, 0, o, 12); g.stroke(); }
      } else if (c.type === C.ROCK) {
        g.fillStyle = '#4a4f56'; g.beginPath(); g.moveTo(-12, 8); g.lineTo(-4, -10); g.lineTo(6, -6); g.lineTo(12, 9); g.closePath(); g.fill();
      } else if (c.type === C.DOCK) {
        for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) if ((a + b) % 2) { g.fillStyle = '#222'; g.fillRect(-16 + a * 8, -16 + b * 8, 8, 8); }
      } else if (c.type === C.BRIDGE || c.type === C.EXIT) {
        g.fillStyle = '#6b4220'; for (const o of [-10, -2, 6]) g.fillRect(-12, o, 24, 5);
      }
      g.restore();
      if (c.type === C.NORMAL && c.i % 5 === 0) {
        g.fillStyle = '#4a3218'; g.font = 'bold 22px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(c.i), x, y + 1);
      }
    }
    // nome do rio no canto
    g.fillStyle = 'rgba(40,24,10,0.65)';
    g.fillRect(PX - 520, PY - 110, 470, 70);
    g.fillStyle = '#ffe3a0'; g.font = 'bold 44px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(river.def.name, PX - 285, PY - 75);
  });
}

const rippleTex = canvasTex(128, 256, (g) => {
  g.clearRect(0, 0, 128, 256);
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(255,255,255,${0.12 + hash(i) * 0.3})`; g.lineWidth = 2 + hash(i * 3) * 3;
    const x = hash(i * 7) * 128, y = hash(i * 11) * 256, l = 10 + hash(i * 5) * 30;
    g.beginPath(); g.moveTo(x - l / 2, y); g.quadraticCurveTo(x, y - 6, x + l / 2, y); g.stroke();
  }
}, { repeat: [1, 1], srgb: false });

const foamTex = canvasTex(64, 128, (g) => {
  g.fillStyle = 'rgba(255,255,255,0.0)'; g.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(255,255,255,${0.35 + hash(i) * 0.6})`;
    g.beginPath(); g.arc(hash(i * 3) * 64, hash(i * 5) * 128, 2 + hash(i * 7) * 6, 0, Math.PI * 2); g.fill();
  }
}, { repeat: [1, 1], srgb: false });

// Faixa de água por cima do rio pintado (ondinhas que andam na direção da correnteza)
function riverRibbon(river) {
  const P = river.path.pts;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    let dx = b.x - a.x, dz = b.z - a.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const nx = -dz, nz = dx, w = RIVER_W / 2;
    pos.push(P[i].x + nx * w, 0, P[i].z + nz * w, P[i].x - nx * w, 0, P[i].z - nz * w);
    uv.push(0, -P[i].s / 0.12, 1, -P[i].s / 0.12);
    if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const tex = rippleTex.clone(); tex.needsUpdate = true;
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.position.y = 0.0012; m.renderOrder = 1;
  return m;
}

function bridgeMesh(a, c) {
  const g = new THREE.Group();
  const dx = c.x - a.x, dz = c.z - a.z, L = Math.hypot(dx, dz);
  const ang = Math.atan2(dx, dz);
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x5a3818, roughness: 0.8 });
  const n = Math.max(6, Math.round(L / 0.012));
  const plankGeo = new THREE.BoxGeometry(0.03, 0.002, 0.008);
  const planks = new THREE.InstancedMesh(plankGeo, wood, n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
  const arc = (t) => 0.006 + Math.sin(Math.PI * t) * 0.028;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const slope = Math.cos(Math.PI * t) * Math.PI * 0.028 / L;
    q.setFromEuler(new THREE.Euler(-Math.atan(slope), 0, 0));
    m.compose(new THREE.Vector3(0, arc(t), -L / 2 + t * L), q, s);
    planks.setMatrixAt(i, m);
  }
  g.add(planks);
  for (const side of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector3(side * 0.015, arc(t) + 0.012, -L / 2 + t * L)); }
    const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.0012, 5), dark);
    g.add(rail);
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.012 + arc(t), 0.002), dark);
      post.position.set(side * 0.015, (0.012 + arc(t)) / 2, -L / 2 + t * L);
      g.add(post);
    }
  }
  g.position.set((a.x + c.x) / 2, 0, (a.z + c.z) / 2);
  g.rotation.y = ang;
  return g;
}

function rockMesh(seed, size) {
  const geo = new THREE.DodecahedronGeometry(size, 0);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.8 + hash(seed + i) * 0.4), p.getY(i) * (0.55 + hash(seed * 3 + i) * 0.3), p.getZ(i) * (0.8 + hash(seed * 7 + i) * 0.4));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x7d8288, roughness: 0.95, flatShading: true }));
}

export function buildBoard(river) {
  const group = new THREE.Group();
  const top = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.w, BOARD.d).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: drawBoard(river), roughness: 0.85 }));
  group.add(top);
  const ribbon = riverRibbon(river);
  group.add(ribbon);
  const anim = { ribbon, foams: [] };
  // cachoeiras: faixa de espuma atravessando o rio e duas pedras nas margens
  for (const c of river.cells) {
    if (c.type === C.FALL) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(RIVER_W * 1.05, 0.02).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: foamTex.clone(), transparent: true, depthWrite: false }));
      f.material.map.needsUpdate = true;
      f.position.set(c.x, 0.003, c.z); f.rotation.y = c.ang; f.renderOrder = 2;
      group.add(f); anim.foams.push(f);
      for (const side of [-1, 1]) {
        const r = rockMesh(c.i * 2 + side, 0.009);
        r.position.set(c.x + Math.cos(c.ang) * side * RIVER_W * 0.6, 0.004, c.z - Math.sin(c.ang) * side * RIVER_W * 0.6);
        group.add(r);
      }
    } else if (c.type === C.ROCK) {
      const r = rockMesh(c.i, 0.008);
      r.position.set(c.x + Math.cos(c.ang) * 0.02, 0.004, c.z - Math.sin(c.ang) * 0.02);
      group.add(r);
    }
  }
  for (const b of river.bridges) group.add(bridgeMesh(river.cells[b.from], river.cells[b.to]));
  // árvores e moitas fora do rio e fora das pontes
  const trees = [];
  const nearRiver = (x, z) => {
    for (const p of river.path.pts) if ((p.x - x) ** 2 + (p.z - z) ** 2 < 0.062 ** 2) return true;
    for (const b of river.bridges) {
      const a = river.cells[b.from], c = river.cells[b.to];
      const t = Math.max(0, Math.min(1, ((x - a.x) * (c.x - a.x) + (z - a.z) * (c.z - a.z)) / ((c.x - a.x) ** 2 + (c.z - a.z) ** 2)));
      if ((a.x + (c.x - a.x) * t - x) ** 2 + (a.z + (c.z - a.z) * t - z) ** 2 < 0.035 ** 2) return true;
    }
    return false;
  };
  for (let i = 0; i < 900 && trees.length < 110; i++) {
    const x = (hash(i * 3 + river.index * 100) - 0.5) * (BOARD.w - 0.07), z = (hash(i * 5 + 1 + river.index * 100) - 0.5) * (BOARD.d - 0.07);
    if (nearRiver(x, z)) continue;
    if (x > BOARD.w / 2 - 0.3 && z > BOARD.d / 2 - 0.09) continue;  // placa com o nome do rio
    trees.push({ x, z, s: 0.7 + hash(i * 9) * 0.6, k: hash(i * 11) });
  }
  const pineGeo = new THREE.ConeGeometry(0.012, 0.04, 7).translate(0, 0.024, 0);
  const bushGeo = new THREE.IcosahedronGeometry(0.011, 0).translate(0, 0.008, 0);
  const trunkGeo = new THREE.CylinderGeometry(0.002, 0.0025, 0.01, 5).translate(0, 0.005, 0);
  const pines = new THREE.InstancedMesh(pineGeo, new THREE.MeshStandardMaterial({ color: 0x2f6b34, roughness: 0.9, flatShading: true }), trees.length);
  const bushes = new THREE.InstancedMesh(bushGeo, new THREE.MeshStandardMaterial({ color: 0x4f8a36, roughness: 0.9, flatShading: true }), trees.length);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x5a3a1e }), trees.length);
  let np = 0, nb = 0;
  const m = new THREE.Matrix4();
  for (const t of trees) {
    m.makeScale(t.s, t.s, t.s).setPosition(t.x, 0, t.z);
    if (t.k < 0.55) { pines.setMatrixAt(np, m); trunks.setMatrixAt(np, m); np++; } else { bushes.setMatrixAt(nb++, m); }
  }
  pines.count = np; trunks.count = np; bushes.count = nb;
  group.add(pines, bushes, trunks);
  // cais de chegada e bandeira; trapiche da largada
  const end = river.cells[river.last], start = river.cells[0];
  const pierMat = new THREE.MeshStandardMaterial({ color: 0x9a6a38, roughness: 0.8 });
  for (const [c, flag] of [[end, true], [start, false]]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.006, 0.03), pierMat);
    pier.position.set(c.x + Math.cos(c.ang) * 0.045, 0.004, c.z - Math.sin(c.ang) * 0.045);
    pier.rotation.y = c.ang;
    group.add(pier);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.0013, 0.0013, 0.08, 6), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
    pole.position.set(c.x + Math.cos(c.ang) * 0.065, 0.04, c.z - Math.sin(c.ang) * 0.065);
    group.add(pole);
    const ft = canvasTex(64, 40, (g) => {
      if (flag) { for (let a = 0; a < 8; a++) for (let b = 0; b < 5; b++) { g.fillStyle = (a + b) % 2 ? '#111' : '#fff'; g.fillRect(a * 8, b * 8, 8, 8); } }
      else { g.fillStyle = '#3fbf5a'; g.fillRect(0, 0, 64, 40); g.fillStyle = '#fff'; g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.fillText('LARGADA', 32, 25); }
    });
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(0.032, 0.02), new THREE.MeshBasicMaterial({ map: ft, side: THREE.DoubleSide }));
    fl.position.set(pole.position.x + 0.016, 0.07, pole.position.z);
    group.add(fl);
    anim.flag = anim.flag || fl;
  }
  group.position.copy(BOARD_POS);
  return { group, anim };
}

// ---------- mundo ----------
export function buildWorld(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2b2440);
  scene.fog = new THREE.Fog(0x6a5470, 18, 70);

  // céu do entardecer
  const sky = new THREE.Mesh(new THREE.SphereGeometry(80, 32, 16), new THREE.MeshBasicMaterial({
    side: THREE.BackSide, fog: false, depthWrite: false,
    map: canvasTex(16, 256, (g) => {
      const gr = g.createLinearGradient(0, 0, 0, 256);
      gr.addColorStop(0, '#1d1d48'); gr.addColorStop(0.32, '#5a3d78'); gr.addColorStop(0.46, '#e2786a'); gr.addColorStop(0.52, '#ffc77a');
      gr.addColorStop(0.56, '#6a5470'); gr.addColorStop(1, '#2a2030');
      g.fillStyle = gr; g.fillRect(0, 0, 16, 256);
    }),
  }));
  scene.add(sky);
  const sun = new THREE.Mesh(new THREE.CircleGeometry(4, 32), new THREE.MeshBasicMaterial({ color: 0xffd08a, fog: false }));
  sun.position.set(-18, 6, -70); sun.lookAt(0, 1.6, 0);
  scene.add(sun);

  scene.add(new THREE.HemisphereLight(0xffd9b0, 0x3a2a40, 1.25));
  const key = new THREE.DirectionalLight(0xffc890, 1.6);
  key.position.set(-1.5, 3, 1.2);
  scene.add(key);
  const lamp = new THREE.PointLight(0xffb060, 1.4, 4, 1.5);
  lamp.position.set(0.1, TOP + 0.95, 0.15);
  scene.add(lamp);

  // rio lá fora
  const outWater = new THREE.Mesh(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a5a78, roughness: 0.25, metalness: 0.3 }));
  outWater.position.y = -1.2;
  scene.add(outWater);
  const glint = new THREE.Mesh(new THREE.PlaneGeometry(6, 60).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
    map: canvasTex(64, 256, (g) => { for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(255,${190 + hash(i) * 50},120,${0.2 + hash(i * 3) * 0.6})`; g.fillRect(hash(i * 5) * 64, hash(i * 7) * 256, 4 + hash(i) * 20, 2); } }, { srgb: true }),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  }));
  glint.position.set(-6, -1.18, -38); glint.rotation.y = 0.25;
  scene.add(glint);
  // mata do outro lado (cones e copas por instâncias)
  {
    const n = 260;
    const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x23402c, flatShading: true }), n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const a = -Math.PI * 0.95 + hash(i) * Math.PI * 1.9;
      const r = 32 + hash(i * 3) * 14;
      const s = 2.5 + hash(i * 7) * 3.5;
      m.makeScale(s * 1.2, s, s * 1.2).setPosition(Math.sin(a) * r, -1.2 + s * 0.6, -Math.cos(a) * r);
      crown.setMatrixAt(i, m);
    }
    scene.add(crown);
  }

  // varanda: assoalho, pilares, guarda-corpo e telhado
  const floorTex = woodTex('#8a6038', '#4a2c14', 512, 512, 8); floorTex.repeat.set(3, 3);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(7, 7).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85 }));
  scene.add(floor);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1e, roughness: 0.85 });
  const railMat = new THREE.MeshStandardMaterial({ color: 0x7a5028, roughness: 0.85 });
  for (const x of [-3.4, -1.1, 1.1, 3.4]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 3, 0.14), postMat);
    p.position.set(x, 1.5, -3.4); scene.add(p);
  }
  for (const z of [-3.4, -1.1, 1.1, 3.4]) {
    for (const x of [-3.4, 3.4]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 3, 0.14), postMat); p.position.set(x, 1.5, z); scene.add(p); }
  }
  const railGeo = new THREE.BoxGeometry(6.8, 0.07, 0.07);
  for (const h of [0.5, 1.0]) {
    const r = new THREE.Mesh(railGeo, railMat); r.position.set(0, h, -3.4); scene.add(r);
    for (const x of [-3.4, 3.4]) { const s = new THREE.Mesh(railGeo, railMat); s.rotation.y = Math.PI / 2; s.position.set(x, h, 0); scene.add(s); }
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.1, 7.4), new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.9 }));
  roof.position.y = 3.05; scene.add(roof);
  // varal de lampiões
  const bulbs = [];
  {
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd28a });
    for (let i = 0; i < 14; i++) {
      const t = i / 13;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), bulbMat);
      b.position.set(-3.3 + t * 6.6, 2.75 - Math.sin(Math.PI * t) * 0.35, -3.3);
      scene.add(b); bulbs.push(b);
    }
  }
  // lampião pendurado sobre a mesa
  {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.3, 4), postMat);
    cord.position.set(0.1, TOP + 1.65, 0.15); scene.add(cord);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.12, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0x8a3a1a, side: THREE.DoubleSide, roughness: 0.7 }));
    shade.position.set(0.1, TOP + 1.0, 0.15); scene.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffe2a8 }));
    bulb.position.set(0.1, TOP + 0.95, 0.15); scene.add(bulb);
  }

  // mesa
  const tableTex = woodTex('#9a6a3a', '#5a3818', 1024, 512, 5);
  const tableMat = new THREE.MeshStandardMaterial({ map: tableTex, roughness: 0.6 });
  const tabletop = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.05, 1.24), tableMat);
  tabletop.position.set(0, TOP - 0.025, 0);
  scene.add(tabletop);
  for (const x of [-0.7, 0.7]) for (const z of [-0.54, 0.54]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, TOP - 0.05, 0.07), postMat);
    leg.position.set(x, (TOP - 0.05) / 2, z); scene.add(leg);
  }
  // base do tabuleiro (madeira escura)
  const base = new THREE.Mesh(new THREE.BoxGeometry(BOARD.w + 0.02, 0.018, BOARD.d + 0.02), postMat);
  base.position.set(BOARD_POS.x, TOP + 0.01, BOARD_POS.z);
  scene.add(base);

  // bandeja de feltro
  {
    const felt = new THREE.Mesh(new THREE.PlaneGeometry(TRAY.w, TRAY.d).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({
      color: 0x1f6a4a, roughness: 1,
      map: canvasTex(128, 128, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128); for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${hash(i) * 0.12})`; g.fillRect(hash(i * 3) * 128, hash(i * 5) * 128, 2, 2); } }, { repeat: [3, 3] }),
    }));
    felt.position.copy(TRAY_POS);
    scene.add(felt);
    const wallMat = new THREE.MeshStandardMaterial({ map: woodTex('#a06a36', '#5a3818', 256, 64, 2), roughness: 0.6 });
    const t = 0.014, h = TRAY.wall;
    for (const [w, d, x, z] of [[TRAY.w + 2 * t, t, 0, -TRAY.d / 2 - t / 2], [TRAY.w + 2 * t, t, 0, TRAY.d / 2 + t / 2], [t, TRAY.d, -TRAY.w / 2 - t / 2, 0], [t, TRAY.d, TRAY.w / 2 + t / 2, 0]]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      wall.position.set(TRAY_POS.x + x, TRAY_POS.y + h / 2 - 0.006, TRAY_POS.z + z);
      scene.add(wall);
    }
  }
  // copo dos dados (a "mão": de onde se pegam os dados)
  const cup = new THREE.Group();
  {
    const cupMat = new THREE.MeshStandardMaterial({ color: 0x6a3a1a, roughness: 0.55, side: THREE.DoubleSide });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.045, 0.03, 24, 1, true), cupMat);
    body.position.y = 0.015;
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.045, 24).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2a5a3a, roughness: 1 }));
    bottom.position.y = 0.002;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.004, 6, 28), new THREE.MeshStandardMaterial({ color: 0xd9a24a, metalness: 0.5, roughness: 0.4 }));
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.03;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.068, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7dffb0, transparent: true, opacity: 0, depthWrite: false }));
    ring.position.y = 0.002;
    cup.add(body, bottom, rim, ring);
    cup.userData.ring = ring;
    cup.position.copy(CUP_POS);
    scene.add(cup);
  }
  // bacia do redemoinho
  const bowl = new THREE.Group();
  {
    const bowlMat = new THREE.MeshStandardMaterial({ color: 0x7a7f86, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.035, 28, 1, true), bowlMat);
    body.position.y = 0.0175;
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.066, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
      map: canvasTex(256, 256, (g) => {
        const gr = g.createRadialGradient(128, 128, 4, 128, 128, 128);
        gr.addColorStop(0, '#04131f'); gr.addColorStop(0.35, '#1d5f8a'); gr.addColorStop(1, '#5cc6d8');
        g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
        g.strokeStyle = 'rgba(220,250,255,0.7)'; g.lineWidth = 5;
        for (let k = 0; k < 4; k++) { g.beginPath(); for (let a = 0; a < 9; a += 0.1) { const r = 6 + a * 13; g.lineTo(128 + Math.cos(a + k * Math.PI / 2) * r, 128 + Math.sin(a + k * Math.PI / 2) * r); } g.stroke(); }
      }),
    }));
    water.position.y = 0.024;
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.03), new THREE.MeshBasicMaterial({
      map: canvasTex(256, 60, (g) => { g.fillStyle = '#ffe3a0'; g.font = 'bold 30px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('REDEMOINHO', 128, 30); }),
      transparent: true, depthWrite: false,
    }));
    label.position.set(0, 0.002, 0.09); label.rotation.x = -Math.PI / 2;
    bowl.add(body, water, label);
    bowl.userData.water = water;
    bowl.position.copy(BOWL_POS);
    scene.add(bowl);
  }
  // tábua dos dados usados na vez
  {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.06), new THREE.MeshStandardMaterial({ map: woodTex('#c08a4a', '#6a4220', 256, 128, 2), roughness: 0.6 }));
    plank.position.set(KEPT_POS.x, TOP + 0.006, KEPT_POS.z);
    scene.add(plank);
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.025), new THREE.MeshBasicMaterial({
      map: canvasTex(256, 40, (g) => { g.fillStyle = '#ffe3a0'; g.font = 'bold 24px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('USADOS NA VEZ', 128, 20); }),
      transparent: true, depthWrite: false,
    }));
    lab.rotation.x = -Math.PI / 2; lab.position.set(KEPT_POS.x, TOP + 0.002, KEPT_POS.z + 0.048);
    scene.add(lab);
  }

  // placa dos pilotos, atrás do tabuleiro
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 1024; signCanvas.height = 400;
  const signTex = new THREE.CanvasTexture(signCanvas);
  signTex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Group();
  {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.35), new THREE.MeshBasicMaterial({ map: signTex }));
    face.position.z = 0.011;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.4, 0.02), postMat);
    for (const x of [-0.4, 0.4]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.02), postMat); leg.position.set(x, -0.33, 0); sign.add(leg); }
    sign.add(frame, face);
    sign.position.set(-1.02, TOP + 0.42, -0.15);
    sign.rotation.set(-0.08, 0.95, 0, 'YXZ');
    scene.add(sign);
  }
  const drawSign = (fn) => { const g = signCanvas.getContext('2d'); fn(g, signCanvas.width, signCanvas.height); signTex.needsUpdate = true; };

  let board = null;
  function setRiver(river) {
    if (board) { scene.remove(board.group); board.group.traverse(o => { o.geometry?.dispose?.(); }); }
    board = buildBoard(river);
    scene.add(board.group);
    return board;
  }

  function animate(dt, time, swirl = 0) {
    if (board) {
      board.anim.ribbon.material.map.offset.y += dt * 0.35;
      for (const f of board.anim.foams) f.material.map.offset.y -= dt * 0.8;
    }
    bowl.userData.water.rotation.y -= dt * (0.6 + swirl * 5);
    bulbs.forEach((b, i) => b.scale.setScalar(0.9 + 0.1 * Math.sin(time * 2 + i)));
    glint.material.opacity = 0.7 + 0.3 * Math.sin(time * 0.7);
  }

  return { scene, setRiver, get board() { return board; }, animate, drawSign, cup, bowl, sign };
}

// Posição no mundo do centro de uma casa (com um desvio para o lado: barcos dividindo a casa)
export function cellWorld(river, i, side = 0, out = new THREE.Vector3()) {
  const c = river.cells[Math.max(0, Math.min(river.last, i))];
  return out.set(BOARD_POS.x + c.x + Math.cos(c.ang) * side, BOARD_POS.y + 0.001, BOARD_POS.z + c.z - Math.sin(c.ang) * side);
}
