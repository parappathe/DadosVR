// Física dos dados, feita à mão: cubos rígidos que caem, quicam, rolam e param na bandeja.
// Contato vértice contra plano (chão e paredes) e vértice contra cubo (um dado no outro), com
// impulso, atrito e um pouco de quique. O resultado é a face que ficou para cima.
// Sem navegador e sem Three.js: os testes rodam no Node.
//
// Coordenadas da bandeja em metros: origem no centro do fundo, y para cima, x para a direita,
// z para perto de quem joga. Quaternions como [x, y, z, w] (igual ao Three.js).

export const DIE = 0.026;                     // aresta do dado
const H = DIE / 2;
export const TRAY = { w: 0.38, d: 0.27, wall: 0.05 };
export const DT = 1 / 360;
const G = 9.81;
const MASS = 1;
const INERTIA = MASS * DIE * DIE / 6;         // cubo: inércia igual em qualquer eixo
const MU_FLOOR = 0.45, MU_WALL = 0.25, MU_DIE = 0.2;
const REST_FLOOR = 0.32, REST_WALL = 0.45, REST_DIE = 0.4;

// Faces: eixo local → número. Opostos somam 7.
export const FACE_AXES = [
  { n: [0, 1, 0], v: 1 }, { n: [0, -1, 0], v: 6 },
  { n: [1, 0, 0], v: 2 }, { n: [-1, 0, 0], v: 5 },
  { n: [0, 0, 1], v: 3 }, { n: [0, 0, -1], v: 4 },
];
const VERTS = [];
for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) VERTS.push([x * H, y * H, z * H]);

const PERMS = [];
{
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let k = 0; k < 64; k++) {
    const p = [0, 1, 2, 3, 4, 5, 6, 7];
    for (let i = 7; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    PERMS.push(p);
  }
}
let permI = 0;

// ---------- vetores e quaternions ----------
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export function rotate(q, v) {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}
const conj = (q) => [-q[0], -q[1], -q[2], q[3]];
function qmul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
function qnorm(q) { const l = Math.hypot(...q) || 1; return q.map(c => c / l); }
export function qFromAxisAngle(ax, a) { const s = Math.sin(a / 2), l = Math.hypot(...ax) || 1; return [ax[0] / l * s, ax[1] / l * s, ax[2] / l * s, Math.cos(a / 2)]; }
export function randomQuat(random) {
  // uniforme na esfera de rotações (Shoemake)
  const u1 = random(), u2 = random() * 2 * Math.PI, u3 = random() * 2 * Math.PI;
  const a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
  return [a * Math.sin(u2), a * Math.cos(u2), b * Math.sin(u3), b * Math.cos(u3)];
}

// ---------- dado ----------
export function makeDie(id, p = [0, 0.1, 0], q = [0, 0, 0, 1]) {
  return { id, p: p.slice(), v: [0, 0, 0], q: q.slice(), w: [0, 0, 0], asleep: false, still: 0, touching: false, age: 0 };
}

// Número da face de cima e quanto ela está alinhada com "para cima" (1 = deitado reto).
export function topFace(d) {
  let best = null;
  for (const f of FACE_AXES) {
    const up = rotate(d.q, f.n)[1];
    if (!best || up > best.up) best = { v: f.v, up };
  }
  return best;
}

// Gira o dado para que a face `v` fique para cima (para os dados de enfeite e os separados).
export function orientationFor(v, yaw = 0) {
  const f = FACE_AXES.find(a => a.v === v).n;
  // rotação que leva f para +y
  const c = cross(f, [0, 1, 0]);
  const d = dot(f, [0, 1, 0]);
  let q;
  if (Math.hypot(...c) < 1e-6) q = d > 0 ? [0, 0, 0, 1] : [1, 0, 0, 0];
  else q = qFromAxisAngle(c, Math.acos(Math.max(-1, Math.min(1, d))));
  return qnorm(qmul(qFromAxisAngle([0, 1, 0], yaw), q));
}

function applyImpulse(d, r, J) {
  d.v[0] += J[0] / MASS; d.v[1] += J[1] / MASS; d.v[2] += J[2] / MASS;
  const t = cross(r, J);
  d.w[0] += t[0] / INERTIA; d.w[1] += t[1] / INERTIA; d.w[2] += t[2] / INERTIA;
}
const velAt = (d, r) => { const c = cross(d.w, r); return [d.v[0] + c[0], d.v[1] + c[1], d.v[2] + c[2]]; };

// Planos da bandeja: normal para dentro e distância
const PLANES = [
  { n: [0, 1, 0], o: 0, mu: MU_FLOOR, e: REST_FLOOR, floor: true },
  { n: [1, 0, 0], o: -TRAY.w / 2, mu: MU_WALL, e: REST_WALL },
  { n: [-1, 0, 0], o: -TRAY.w / 2, mu: MU_WALL, e: REST_WALL },
  { n: [0, 0, 1], o: -TRAY.d / 2, mu: MU_WALL, e: REST_WALL },
  { n: [0, 0, -1], o: -TRAY.d / 2, mu: MU_WALL, e: REST_WALL },
];

function contactPlane(d, pl, events, first) {
  let maxPen = 0, hit = 0;
  // A ordem em que os vértices recebem o impulso muda a cada vez (permutações fixas, em rodízio):
  // com ordem fixa, um dado equilibrado numa aresta cai sempre para o mesmo lado e uma face
  // sai mais que a outra.
  const perm = PERMS[permI = (permI + 1) % PERMS.length];
  const list = [];
  for (const k of perm) {
    const r = rotate(d.q, VERTS[k]);
    const pen = pl.o - (dot(d.p, pl.n) + dot(r, pl.n));
    if (pen > 0) list.push({ r, pen });
  }
  for (const { r, pen } of list) {
    if (pen > maxPen) maxPen = pen;
    const vel = velAt(d, r);
    const vn = dot(vel, pl.n);
    if (vn >= 0) continue;
    const rn = cross(r, pl.n);
    const kn = 1 / MASS + dot(rn, rn) / INERTIA;
    const e = first && vn < -0.25 ? pl.e : 0;
    const jn = -(1 + e) * vn / kn;
    applyImpulse(d, r, [pl.n[0] * jn, pl.n[1] * jn, pl.n[2] * jn]);
    if (first && -vn > hit) hit = -vn;
    // atrito
    const v2 = velAt(d, r);
    const vn2 = dot(v2, pl.n);
    const vt = [v2[0] - vn2 * pl.n[0], v2[1] - vn2 * pl.n[1], v2[2] - vn2 * pl.n[2]];
    const sp = Math.hypot(...vt);
    if (sp > 1e-7) {
      const t = [vt[0] / sp, vt[1] / sp, vt[2] / sp];
      const rt = cross(r, t);
      const kt = 1 / MASS + dot(rt, rt) / INERTIA;
      const jt = Math.min(sp / kt, pl.mu * jn);
      applyImpulse(d, r, [-t[0] * jt, -t[1] * jt, -t[2] * jt]);
    }
  }
  if (maxPen > 0) {
    d.p[0] += pl.n[0] * maxPen; d.p[1] += pl.n[1] * maxPen; d.p[2] += pl.n[2] * maxPen;
    if (pl.floor) d.touching = true;
    if (hit > 0.15 && events) events.push({ type: pl.floor ? 'floor' : 'wall', v: hit, id: d.id });
  }
}

// Vértices de A dentro do cubo B. `impact` guarda a maior velocidade de encontro.
let impact = 0;
function contactDice(A, B, events, first) {
  let found = false;
  impact = 0;
  const qi = conj(B.q);
  const perm = PERMS[permI = (permI + 1) % PERMS.length];
  for (const vi of perm) {
    const lv = VERTS[vi];
    const r = rotate(A.q, lv);
    const wp = [A.p[0] + r[0], A.p[1] + r[1], A.p[2] + r[2]];
    const l = rotate(qi, [wp[0] - B.p[0], wp[1] - B.p[1], wp[2] - B.p[2]]);
    if (Math.abs(l[0]) >= H || Math.abs(l[1]) >= H || Math.abs(l[2]) >= H) continue;
    // eixo de menor penetração
    let ax = 0, pen = H - Math.abs(l[0]);
    for (let k = 1; k < 3; k++) { const pk = H - Math.abs(l[k]); if (pk < pen) { pen = pk; ax = k; } }
    const nl = [0, 0, 0]; nl[ax] = Math.sign(l[ax]) || 1;
    const n = rotate(B.q, nl);             // de B para A
    const rB = [wp[0] - B.p[0], wp[1] - B.p[1], wp[2] - B.p[2]];
    const va = velAt(A, r), vb = velAt(B, rB);
    const rel = [va[0] - vb[0], va[1] - vb[1], va[2] - vb[2]];
    const vn = dot(rel, n);
    // separa as posições
    if (n[1] > 0.6) A.touching = true;     // A apoiado em cima de B
    A.p[0] += n[0] * pen / 2; A.p[1] += n[1] * pen / 2; A.p[2] += n[2] * pen / 2;
    B.p[0] -= n[0] * pen / 2; B.p[1] -= n[1] * pen / 2; B.p[2] -= n[2] * pen / 2;
    found = true;
    if (vn >= 0) continue;
    if (-vn > impact) impact = -vn;
    const ra = cross(r, n), rb = cross(rB, n);
    const k = 2 / MASS + (dot(ra, ra) + dot(rb, rb)) / INERTIA;
    const e = first && vn < -0.25 ? REST_DIE : 0;
    const j = -(1 + e) * vn / k;
    applyImpulse(A, r, [n[0] * j, n[1] * j, n[2] * j]);
    applyImpulse(B, rB, [-n[0] * j, -n[1] * j, -n[2] * j]);
    // atrito entre os dados
    const va2 = velAt(A, r), vb2 = velAt(B, rB);
    const rel2 = [va2[0] - vb2[0], va2[1] - vb2[1], va2[2] - vb2[2]];
    const vn2 = dot(rel2, n);
    const vt = [rel2[0] - vn2 * n[0], rel2[1] - vn2 * n[1], rel2[2] - vn2 * n[2]];
    const sp = Math.hypot(...vt);
    if (sp > 1e-7) {
      const t = [vt[0] / sp, vt[1] / sp, vt[2] / sp];
      const ta = cross(r, t), tb = cross(rB, t);
      const kt = 2 / MASS + (dot(ta, ta) + dot(tb, tb)) / INERTIA;
      const jt = Math.min(sp / kt, MU_DIE * j);
      applyImpulse(A, r, [-t[0] * jt, -t[1] * jt, -t[2] * jt]);
      applyImpulse(B, rB, [t[0] * jt, t[1] * jt, t[2] * jt]);
    }
    if (first && -vn > 0.3 && events) events.push({ type: 'die', v: -vn, id: A.id });
  }
  return found;
}

// Um passo de física para os dados em jogo.
export function stepDice(dice, dt = DT, events = null) {
  for (const d of dice) {
    if (d.asleep) continue;
    d.age += dt;
    d.v[1] -= G * dt;
    // resistência do ar bem leve
    const air = 1 - 0.08 * dt;
    d.v[0] *= air; d.v[1] *= air; d.v[2] *= air;
    d.p[0] += d.v[0] * dt; d.p[1] += d.v[1] * dt; d.p[2] += d.v[2] * dt;
    const wq = [d.w[0], d.w[1], d.w[2], 0];
    const dq = qmul(wq, d.q);
    d.q = qnorm([d.q[0] + dq[0] * dt / 2, d.q[1] + dq[1] * dt / 2, d.q[2] + dq[2] * dt / 2, d.q[3] + dq[3] * dt / 2]);
    d.touching = false;
  }
  for (let it = 0; it < 3; it++) {
    for (const d of dice) {
      if (d.asleep) continue;
      for (const pl of PLANES) contactPlane(d, pl, events, it === 0);
    }
    for (let a = 0; a < dice.length; a++) {
      for (let b = a + 1; b < dice.length; b++) {
        const A = dice[a], B = dice[b];
        if (A.asleep && B.asleep) continue;
        // perto o bastante para encostar?
        const dx = A.p[0] - B.p[0], dy = A.p[1] - B.p[1], dz = A.p[2] - B.p[2];
        if (dx * dx + dy * dy + dz * dz > (DIE * 1.75) ** 2) continue;
        const wasA = A.asleep, wasB = B.asleep;
        A.asleep = B.asleep = false;
        let hit = contactDice(A, B, events, it === 0);
        let imp = impact;
        hit = contactDice(B, A, events, it === 0) || hit;
        imp = Math.max(imp, impact);
        // aresta contra aresta escapa do teste de vértices: esfera de dentro como reserva
        const dist = Math.hypot(A.p[0] - B.p[0], A.p[1] - B.p[1], A.p[2] - B.p[2]);
        if (dist < DIE * 0.98 && dist > 1e-6) {
          const n = [(A.p[0] - B.p[0]) / dist, (A.p[1] - B.p[1]) / dist, (A.p[2] - B.p[2]) / dist];
          const pen = (DIE * 0.98 - dist) / 2;
          for (let k = 0; k < 3; k++) { A.p[k] += n[k] * pen; B.p[k] -= n[k] * pen; }
          const vn = (A.v[0] - B.v[0]) * n[0] + (A.v[1] - B.v[1]) * n[1] + (A.v[2] - B.v[2]) * n[2];
          if (vn < 0) for (let k = 0; k < 3; k++) { A.v[k] -= n[k] * vn / 2; B.v[k] += n[k] * vn / 2; }
          hit = true;
        }
        if (!hit) { A.asleep = wasA; B.asleep = wasB; }
        else {
          // quem estava parado só acorda se levou um empurrão de verdade
          if (wasA && Math.hypot(...A.v) < 0.05 && Math.hypot(...A.w) < 1) { A.asleep = true; A.v = [0, 0, 0]; A.w = [0, 0, 0]; }
          if (wasB && Math.hypot(...B.v) < 0.05 && Math.hypot(...B.w) < 1) { B.asleep = true; B.v = [0, 0, 0]; B.w = [0, 0, 0]; }
          if (imp > 0.08) {
            if (!A.asleep) A.still = Math.min(A.still, 0.1);
            if (!B.asleep) B.still = Math.min(B.still, 0.1);
          }
        }
      }
    }
  }
  for (const d of dice) {
    if (d.asleep) continue;
    if (d.touching) {
      // rolamento perde força no feltro
      const k = 1 - 1.6 * dt;
      d.w[0] *= k; d.w[1] *= k; d.w[2] *= k;
      d.v[0] *= 1 - 0.6 * dt; d.v[2] *= 1 - 0.6 * dt;
    }
    const sv = Math.hypot(d.v[0], d.v[2]) + Math.abs(d.v[1]) * 0.3, sw = Math.hypot(...d.w);
    const up = topFace(d).up;
    if (d.touching && up > 0.99 && sv < 0.08) {
      // deitado numa face e devagar: o feltro segura (sem isto o dado fica tremendo e andando)
      const k = 1 - Math.min(1, 10 * dt);
      d.w[0] *= k; d.w[1] *= k; d.w[2] *= k;
      d.v[0] *= k; d.v[2] *= k;
    }
    if (d.touching && sv < 0.05 && sw < 1.2) d.still += dt;
    else d.still = Math.max(0, d.still - 2 * dt);
    if (d.age > 8) { d.asleep = true; d.forced = true; d.v = [0, 0, 0]; d.w = [0, 0, 0]; continue; }
    if (d.still > 0.2) {
      // muito tempo andando (preso torto entre dois dados): vale a face mais para cima
      if (up > 0.97 || d.age > 6) { d.asleep = true; d.v = [0, 0, 0]; d.w = [0, 0, 0]; if (up <= 0.97) d.forced = true; }
      else if (d.still > 0.6) {
        // dado torto (encostado na parede ou em outro dado): um tapinha na bandeja
        d.v[1] += 0.25; d.w = [d.w[0] + (d.id % 2 ? 4 : -4), d.w[1], d.w[2] + 3];
        d.still = 0;
        if (events) events.push({ type: 'nudge', id: d.id });
      }
    }
  }
}

export const allAsleep = (dice) => dice.every(d => d.asleep);

// Lançamento: posições perto de (cx, cy, cz) e velocidade (vx, vy, vz), com giro sorteado.
export function tossDice(n, random, { at = [0, 0.13, 0.08], vel = [0, -0.4, -0.9], spin = 22, spread = 0.03 } = {}) {
  const dice = [];
  for (let i = 0; i < n; i++) {
    const p = [at[0] + (i - (n - 1) / 2) * DIE * 1.4 + (random() - 0.5) * spread, at[1] + random() * spread, at[2] + (random() - 0.5) * spread];
    const d = makeDie(i, p, randomQuat(random));
    d.v = [vel[0] + (random() - 0.5) * 0.3, vel[1] + (random() - 0.5) * 0.2, vel[2] + (random() - 0.5) * 0.3];
    d.w = [(random() - 0.5) * 2 * spin, (random() - 0.5) * 2 * spin, (random() - 0.5) * 2 * spin];
    dice.push(d);
  }
  return dice;
}

// Sorteia um lançamento de quem não está segurando (computador, robô, clique rápido no PC).
export function randomToss(n, random) {
  const ang = (random() - 0.5) * 1.2;
  const sp = 0.6 + random() * 0.9;
  return tossDice(n, random, {
    at: [(random() - 0.5) * 0.16, 0.10 + random() * 0.08, 0.06 + random() * 0.04],
    vel: [Math.sin(ang) * sp, -0.3 - random() * 0.4, -Math.cos(ang) * sp],
    spin: 15 + random() * 15,
  });
}

// Põe os dados para dentro da bandeja se o lançamento começou do lado de fora (mão longe).
export function clampIntoTray(d) {
  const mx = TRAY.w / 2 - DIE, mz = TRAY.d / 2 - DIE;
  d.p[0] = Math.max(-mx, Math.min(mx, d.p[0]));
  d.p[2] = Math.max(-mz, Math.min(mz, d.p[2]));
  d.p[1] = Math.max(DIE, Math.min(0.45, d.p[1]));
}

// Roda até todos pararem (ou estourar o tempo). Devolve { values, time, nudges }.
export function settle(dice, maxTime = 10, events = []) {
  let t = 0;
  while (!allAsleep(dice) && t < maxTime) { stepDice(dice, DT, events); t += DT; }
  return { values: dice.map(d => topFace(d).v), time: t, settled: allAsleep(dice), nudges: events.filter(e => e.type === 'nudge').length };
}
