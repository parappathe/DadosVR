// Liga as regras, a física dos dados e a IA à tela, ao Quest (mãos e controles) e ao mouse/teclado.
import * as THREE from '../vendor/three/three.module.js';
import { Race, RIVERS, C, CELL_NAME, rng, bustChance, RULES, N_DICE } from './rules.js';
import { PILOTS, ROBOT, decide } from './ai.js';
import { DIE, TRAY, DT, makeDie, stepDice, allAsleep, topFace, randomToss, clampIntoTray, orientationFor, randomQuat } from './dice.js';
import { buildWorld, makeDiceMeshes, makeBoat, cellWorld, TOP, TRAY_POS, CUP_POS, BOWL_POS, KEPT_POS, BOAT_COLORS, BOARD_POS } from './scene.js';
import { Panel, Label } from './ui.js';
import { Sfx } from './audio.js';
import { loadSave, storeSave, riverUnlocked } from './save.js';

const HEADLESS = !!globalThis.__DADOSVR_HEADLESS__;   // teste de fumaça no Node: sem WebGL
const save = loadSave();
const sfx = new Sfx();
sfx.on = save.sound;
const IS_QUEST = /OculusBrowser|Quest/i.test(globalThis.navigator?.userAgent || '');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const H = DIE / 2;
const VR_STAND = { x: 0.08, z: 0.95 };          // onde a cabeça fica (de frente para a mesa)
const GRAB_R = 0.15;                            // mão até 15 cm do copo pega os dados
const HAND_GAIN = 1.0;
const MAX_THROW = 2.6;                          // m/s

// ---------- Render e cena ----------
function headlessRenderer() {
  const noop = () => {};
  return {
    xr: { enabled: false, isPresenting: false, setReferenceSpaceType: noop, setFoveation: noop, addEventListener: noop, getSession: () => null,
      getController: () => new THREE.Group(), getControllerGrip: () => new THREE.Group() },
    domElement: document.createElement('canvas'), setPixelRatio: noop, setSize: noop, render: noop, setAnimationLoop: noop,
  };
}
const renderer = HEADLESS ? headlessRenderer() : new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: !IS_QUEST });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_QUEST ? 1 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation?.(1);
document.getElementById('app').appendChild(renderer.domElement);

const world = buildWorld(renderer);
const { scene } = world;
const rig = new THREE.Group();
scene.add(rig);
const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.03, 300);
rig.add(camera);
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();

const menu = new Panel(0.9);
const act = new Panel(0.46);                    // painel de ações da vez (no mundo no VR, no canto no PC)
act.mesh.visible = false;
const fpsLabel = new Label(0.12);
fpsLabel.mesh.position.set(0.16, -0.14, -0.6);
fpsLabel.mesh.visible = false;
camera.add(fpsLabel.mesh);
const previewLabel = new Label(0.11, 256, 72);
previewLabel.mesh.visible = false;
scene.add(previewLabel.mesh);
const previewRing = new THREE.Mesh(new THREE.RingGeometry(0.015, 0.021, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false }));
previewRing.renderOrder = 5; previewRing.visible = false;
scene.add(previewRing);

// Dados (malhas) e barcos
const diceViz = makeDiceMeshes(N_DICE);
const dice = diceViz.map((v, id) => {
  scene.add(v.mesh, v.glow, v.shadow);
  return { id, ...v, state: 'cup', body: null, sel: false, hover: false, fly: null, value: 3 + id, yaw: id * 1.7, idle: randomQuat(Math.random) };
});
const boats = BOAT_COLORS.map(c => { const b = makeBoat(c); scene.add(b); return b; });

// ---------- Estado ----------
let app = 'menu';            // 'menu' | 'play' | 'paused'
let race = null, riverIndex = 0;
let phase = 'idle';          // 'intro' | 'ready' | 'held' | 'rolling' | 'choose' | 'bust' | 'moving' | 'over'
let timer = 0;
let thrown = [];             // ids dos dados do último lance, na ordem de race.turn.lastThrow
let sel = new Set();         // índices (do último lance) escolhidos para usar
let held = null;             // { kind: 'pc' | 'vr', entry, hist }
let msg = null;              // { text, t }
let swirl = 0, swirlTarget = 0;
let random = rng(Date.now() % 1e6);
let time = 0, acc = 0;
let anim = null;             // fila de animação do barco
let vis = [0, 0, 0, 0];      // casa mostrada de cada barco
let cpuPick = null;
let placesShown = null;
const pilots = () => [{ name: 'Você', title: 'Você', color: BOAT_COLORS[0] }, ...PILOTS];
const pilotOf = (k) => (k === 0 ? (dev.autoplay ? ROBOT : null) : PILOTS[k - 1]);
// De quem é a vez na tela (as regras já passaram a vez enquanto o barco ainda rema ou gira)
const shownTurn = () => (phase === 'moving' && anim ? anim.who : phase === 'bust' && bustBoat >= 0 ? bustBoat : race.cur);
const isHumanTurn = () => race && race.cur === 0 && !dev.autoplay && race.phase !== 'over';
const speed = () => (save.fast ? 2 : 1);

function startRace(i) {
  riverIndex = clamp(i, 0, RIVERS.length - 1);
  race = new Race(riverIndex, pilots().map(p => ({ name: p.name })));
  world.setRiver(race.river);
  vis = race.boats.map(b => b.pos);
  anim = null; held = null; msg = null; placesShown = null;
  for (const d of dice) { d.state = 'cup'; d.body = null; d.sel = false; d.fly = null; }
  app = 'play';
  menu.hide();
  phase = 'intro';
  timer = dev.autoplay ? 0.2 : 2.2;
  msg = { text: `${race.river.def.name}: ${race.river.cells.length} casas até o cais. Você sai na frente!`, t: 4 };
  placeForPhase();
  updateHint();
}

function beginTurn() {
  const t = race.turn;
  sel = new Set(); thrown = []; cpuPick = null; held = null;
  // dados da mão no copo; os outros de lado (pedra: começa com 2)
  dice.forEach((d, i) => sendDie(d, i < t.hand ? 'cup' : 'off'));
  phase = 'ready';
  timer = race.cur === 0 && !dev.autoplay ? 0 : 1.0 / speed();
  const name = race.cur === 0 ? 'Sua vez' : `Vez de ${PILOTS[race.cur - 1].name}`;
  msg = { text: t.stuckStart ? `${name}: encalhado na pedra, começa com 2 dados.` : `${name}.`, t: 2.5 };
  if (race.cur === 0) sfx.turnChime();
  updateHint();
  drawAct();
}

// Os dados do copo vão para a bandeja: com a velocidade do arremesso (mão ou mouse) ou sorteada.
function throwDice(fromHeld = null) {
  const ids = dice.filter(d => d.state === 'cup' || d.state === 'held').map(d => d.id);
  if (!ids.length || race.phase !== 'throw') return;
  let bodies;
  if (fromHeld) {
    bodies = ids.map((id, k) => {
      const d = dice[id];
      const p = d.mesh.position.clone().sub(TRAY_POS);
      const b = makeDie(id, [p.x, p.y, p.z], [d.mesh.quaternion.x, d.mesh.quaternion.y, d.mesh.quaternion.z, d.mesh.quaternion.w]);
      clampIntoTray(b);
      const v = fromHeld.v;
      b.v = [v.x + (Math.random() - 0.5) * 0.2, v.y + (Math.random() - 0.5) * 0.15, v.z + (Math.random() - 0.5) * 0.2];
      const sp = 14 + fromHeld.shake * 14 + Math.random() * 8;
      b.w = [(Math.random() - 0.5) * 2 * sp, (Math.random() - 0.5) * 2 * sp, (Math.random() - 0.5) * 2 * sp];
      return b;
    });
  } else {
    bodies = randomToss(ids.length, Math.random);
    bodies.forEach((b, k) => { b.id = ids[k]; });
  }
  thrown = ids;
  ids.forEach((id, k) => { const d = dice[id]; d.state = 'tray'; d.body = bodies[k]; d.fly = null; d.sel = false; });
  held = null;
  phase = 'rolling';
  timer = 0;
  acc = 0;
  updateHint();
  drawAct();
}

function onSettled() {
  const values = thrown.map(id => topFace(dice[id].body).v);
  thrown.forEach((id, k) => { dice[id].value = values[k]; });
  const who = race.cur;
  const res = race.throwResult(values);
  thrown.forEach((id, k) => { if (values[k] === 1) sendDie(dice[id], 'bowl'); });
  const name = who === 0 ? 'Você' : PILOTS[who - 1].name;
  if (res.bust) {
    phase = 'bust';
    timer = 2.6 / Math.sqrt(speed());
    swirlTarget = 1;
    const lost = race.lastResult.lost;
    msg = { text: `REDEMOINHO! ${name === 'Você' ? 'Você perdeu' : `${name} perdeu`} ${lost} casa${lost === 1 ? '' : 's'} da vez.`, t: 3.5 };
    sfx.bust();
    bustBoat = who; bustT = 0;
    pulseAll(0.7, 220);
  } else {
    phase = 'choose';
    sel = new Set();
    if (res.ones) {
      sfx.mark();
      msg = { text: race.turn.marks >= 1 ? `Saiu 1: o redemoinho está girando! Mais um 1 nesta vez e ${who === 0 ? 'você perde' : 'perde'} tudo.` : '', t: 3.5 };
      pulseAll(0.3, 80);
    }
    if (!isHumanTurn()) { timer = 1.1 / speed(); cpuPick = null; }
  }
  swirlTarget = race.phase === 'over' ? 0 : (phase === 'bust' ? 1 : (race.turn?.marks || 0) * 0.45);
  updateHint();
  drawAct();
}

// Aplica a escolha (de quem for a vez): usa os dados escolhidos e para ou joga de novo.
function applyChoice(indices, action) {
  if (!race.canChoose(indices)) return false;
  const who = race.cur;
  const t = race.turn;
  const embBefore = t.embalos || 0;
  const pickedIds = indices.map(i => thrown[i]);
  const keptBefore = t.kept.length;
  const res = race.choose(indices, action);
  pickedIds.forEach((id, k) => { dice[id].keptSlot = keptBefore + k; sendDie(dice[id], 'kept'); });
  sfx.click();
  if (res) { startMoveAnim(who); return true; }
  if ((race.turn.embalos || 0) > embBefore) {
    dice.forEach(d => sendDie(d, 'cup'));
    msg = { text: 'Embalo! Os 3 dados voltam para a mão, mas o redemoinho já está girando: qualquer 1 agora é redemoinho.', t: 4.5 };
    sfx.embalo();
    swirlTarget = 0.45;
  } else {
    thrown.forEach((id, k) => { if (!indices.includes(k) && dice[id].state === 'tray') sendDie(dice[id], 'cup'); });
  }
  phase = 'ready';
  sel = new Set();
  timer = isHumanTurn() ? 0 : 0.8 / speed();
  updateHint();
  drawAct();
  return true;
}

// ---------- Animação do barco ----------
let bustBoat = -1, bustT = 0;
function startMoveAnim(who) {
  const r = race.lastResult;
  const segs = [];
  for (const e of r.events) {
    if (e.type === 'step') segs.push({ kind: 'step', to: e.to, dur: 0.17 });
    else if (e.type === 'bridge') segs.push({ kind: 'bridge', from: e.from, to: e.to, dur: 0.9 });
    else if (e.type === 'current') segs.push({ kind: 'current', from: e.from, to: e.to, dur: 0.7 });
    else if (e.type === 'fall') segs.push({ kind: 'fall', from: e.from, to: e.to, dur: 1.1 });
    else if (e.type === 'rock') segs.push({ kind: 'rock', dur: 0.6 });
  }
  if (r.bumped.length) segs.push({ kind: 'bump', boats: r.bumped, dur: 0.45 });
  anim = { who, segs, i: 0, t: 0, from: r.from, cur: r.from };
  phase = 'moving';
  swirlTarget = 0;
  const sp = r.finished ? 'e chegou ao cais!' : `até a casa ${r.pos}`;
  msg = { text: `${who === 0 ? 'Você remou' : `${PILOTS[who - 1].name} remou`} ${r.M} casa${r.M === 1 ? '' : 's'} ${sp}`, t: 3 };
  updateHint();
  drawAct();
}

function updateMoveAnim(dt) {
  if (!anim) return;
  const s = anim.segs[anim.i];
  if (!s) { anim = null; afterTurn(); return; }
  if (anim.t === 0) {
    if (s.kind === 'step') sfx.paddle();
    else if (s.kind === 'bridge') { sfx.bridge(); msg = { text: 'Sequência! O barco atravessa pela ponte.', t: 2.5 }; }
    else if (s.kind === 'current') { sfx.current(); msg = { text: `Correnteza: empurrou ${s.to - s.from} casas para a frente.`, t: 2.5 }; }
    else if (s.kind === 'fall') { sfx.fall(); msg = { text: `Cachoeira! Voltou até o remanso da casa ${s.to}.`, t: 3 }; }
    else if (s.kind === 'rock') { sfx.rock(); msg = { text: 'Encalhou na pedra: na próxima vez começa com 2 dados.', t: 3 }; }
    else if (s.kind === 'bump') { sfx.bump(); msg = { text: `Marola! ${s.boats.map(k => (k === 0 ? 'Você' : PILOTS[k - 1].name)).join(' e ')} ${s.boats.length > 1 ? 'voltaram' : 'voltou'} 1 casa.`, t: 2.5 }; }
  }
  anim.t += dt * speed();
  if (anim.t >= s.dur) {
    if (s.to != null) { anim.cur = s.to; vis[anim.who] = s.to; }
    if (s.kind === 'bump') for (const k of s.boats) vis[k] = race.boats[k].pos;
    anim.i++; anim.t = 0;
  }
}

function boatTransform(k, out) {
  // devolve { pos, yaw, extraY, spin } do barco k agora
  const river = race.river;
  if (anim && anim.who === k && anim.segs[anim.i]) {
    const s = anim.segs[anim.i];
    const u = clamp(anim.t / s.dur, 0, 1);
    const a = cellWorld(river, anim.cur), b = s.to != null ? cellWorld(river, s.to) : a.clone();
    const ca = river.cells[anim.cur], cb = river.cells[s.to ?? anim.cur];
    if (s.kind === 'step') {
      out.pos.lerpVectors(a, b, u); out.y = Math.sin(Math.PI * u) * 0.012; out.yaw = lerpAng(ca.ang, cb.ang, u); out.spin = 0;
    } else if (s.kind === 'bridge') {
      out.pos.lerpVectors(a, b, u); out.y = Math.sin(Math.PI * u) * 0.045; out.yaw = Math.atan2(b.x - a.x, b.z - a.z); out.spin = 0;
    } else if (s.kind === 'current') {
      const f = s.from + (s.to - s.from) * u;
      const i0 = Math.floor(f), i1 = Math.min(river.last, i0 + 1);
      out.pos.lerpVectors(cellWorld(river, i0), cellWorld(river, i1), f - i0); out.y = 0.002; out.yaw = river.cells[i0].ang; out.spin = Math.sin(u * 20) * 0.15;
    } else if (s.kind === 'fall') {
      const f = s.from + (s.to - s.from) * u;
      const i0 = Math.floor(f), i1 = Math.min(river.last, i0 + 1);
      out.pos.lerpVectors(cellWorld(river, i0), cellWorld(river, i1), f - i0); out.y = Math.sin(Math.PI * u) * 0.02; out.yaw = river.cells[i0].ang; out.spin = u * Math.PI * 4;
    } else {
      out.pos.copy(a); out.y = 0; out.yaw = ca.ang; out.spin = s.kind === 'rock' ? Math.sin(u * 30) * 0.3 * (1 - u) : 0;
    }
    return out;
  }
  if (bustBoat === k && phase === 'bust') {
    const c = river.cells[vis[k]];
    out.pos.copy(cellWorld(river, vis[k])); out.y = 0; out.yaw = c.ang; out.spin = bustT * 10;
    return out;
  }
  // parado: barcos na mesma casa ficam lado a lado
  const same = race.boats.map((_, j) => j).filter(j => vis[j] === vis[k] && !(anim && anim.who === j));
  const rank = same.indexOf(k);
  const c = river.cells[vis[k]];
  cellWorld(river, vis[k], (rank - (same.length - 1) / 2) * 0.016, out.pos);
  out.y = 0; out.yaw = c.ang; out.spin = 0;
  return out;
}
function lerpAng(a, b, t) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; }

function afterTurn() {
  bustBoat = -1;
  vis = race.boats.map(b => b.pos);
  if (race.phase === 'over') { finishRace(); return; }
  beginTurn();
}

function finishRace() {
  phase = 'over';
  const place = race.placeOf(0);
  save.races[riverIndex]++;
  if (place === 1) save.wins[riverIndex]++;
  if (!save.best[riverIndex] || place < save.best[riverIndex]) save.best[riverIndex] = place;
  storeSave(save);
  placesShown = race.places.slice();
  sfx.fanfare(place === 1);
  dice.forEach(d => sendDie(d, 'cup'));
  timer = 4;
  showScreen('over');
  drawAct();
  updateHint();
}

function goMenu() {
  app = 'menu';
  phase = 'idle';
  race = null; held = null; anim = null;
  act.mesh.visible = false;
  world.setRiver(menuRiver);
  dice.forEach(d => sendDie(d, 'cup'));
  if (renderer.xr.isPresenting) placeRig(VR_STAND.x, VR_STAND.z);
  showScreen('main');
  updateHint();
}

function togglePause() {
  if (app === 'play' && !menu.visible) { app = 'paused'; held = null; showScreen('pause'); }
  else if (app === 'paused') { app = 'play'; menu.hide(); }
  updateHint();
}

// ---------- Onde cada dado fica ----------
const CUP_SLOTS = [[-0.018, -0.008], [0.018, -0.006], [0, 0.016]];
function sendDie(d, state) {
  const from = { p: d.mesh.position.clone(), q: d.mesh.quaternion.clone() };
  d.state = state;
  if (state !== 'tray') d.body = null;
  d.sel = false;
  d.fly = { from, t: 0, dur: 0.45 };
}
function dieTarget(d, outP, outQ) {
  if (d.state === 'cup') {
    const cupDice = dice.filter(o => o.state === 'cup');
    const k = cupDice.indexOf(d);
    const s = CUP_SLOTS[k] || [0, 0];
    outP.set(CUP_POS.x + s[0], TOP + 0.004 + H + (k === 2 ? 0.004 : 0), CUP_POS.z + s[1]);
    const q = orientationFor(d.value || 3, d.yaw);
    outQ.set(q[0], q[1], q[2], q[3]);
  } else if (d.state === 'kept') {
    const slot = d.keptSlot ?? 0;
    outP.set(KEPT_POS.x - 0.05 + (slot % 3) * 0.05, KEPT_POS.y + 0.006 + H, KEPT_POS.z);
    const q = orientationFor(d.value, 0);
    outQ.set(q[0], q[1], q[2], q[3]);
  } else if (d.state === 'bowl') {
    const a = time * (0.8 + swirl * 4) + d.id * 2.1;
    outP.set(BOWL_POS.x + Math.cos(a) * 0.03, TOP + 0.024 + H * 0.6, BOWL_POS.z + Math.sin(a) * 0.03);
    const q = orientationFor(1, -a);
    outQ.set(q[0], q[1], q[2], q[3]);
  } else if (d.state === 'off') {
    outP.set(CUP_POS.x - 0.07, TOP + H, CUP_POS.z + 0.08);
    const q = orientationFor(6, 0.3);
    outQ.set(q[0], q[1], q[2], q[3]);
  }
}
const _tp = new THREE.Vector3(), _tq = new THREE.Quaternion();
function updateDiceViz(dt) {
  for (const d of dice) {
    if (d.state === 'tray' && d.body) {
      d.mesh.position.set(TRAY_POS.x + d.body.p[0], TRAY_POS.y + d.body.p[1], TRAY_POS.z + d.body.p[2]);
      d.mesh.quaternion.set(d.body.q[0], d.body.q[1], d.body.q[2], d.body.q[3]);
    } else if (d.state === 'held') {
      // posição definida pelo segurar
    } else {
      dieTarget(d, _tp, _tq);
      if (d.fly) {
        d.fly.t += dt;
        const u = clamp(d.fly.t / d.fly.dur, 0, 1), e = u * u * (3 - 2 * u);
        d.mesh.position.lerpVectors(d.fly.from.p, _tp, e);
        d.mesh.position.y += Math.sin(Math.PI * u) * 0.06;
        d.mesh.quaternion.slerpQuaternions(d.fly.from.q, _tq, e);
        if (u >= 1) d.fly = null;
      } else {
        d.mesh.position.copy(_tp);
        d.mesh.quaternion.copy(_tq);
      }
    }
    // sombra no tampo / no feltro e anel de escolhido
    const onTray = Math.abs(d.mesh.position.x - TRAY_POS.x) < TRAY.w / 2 && Math.abs(d.mesh.position.z - TRAY_POS.z) < TRAY.d / 2;
    const floorY = onTray ? TRAY_POS.y : TOP;
    d.shadow.position.set(d.mesh.position.x, floorY + 0.0008, d.mesh.position.z);
    const hgt = d.mesh.position.y - floorY;
    d.shadow.visible = hgt < 0.4 && d.state !== 'bowl';
    d.shadow.scale.setScalar(1 + hgt * 6);
    const idx = thrown.indexOf(d.id);
    const chosen = phase === 'choose' && d.state === 'tray' && (sel.has(idx) || (cpuPick && cpuPick.indices.includes(idx)));
    d.glow.visible = chosen || (phase === 'choose' && d.hover && isHumanTurn() && race.turn.usable.includes(idx));
    d.glow.material.color.set(chosen ? 0x7dffb0 : 0xffffff);
    d.glow.material.opacity = chosen ? 0.95 : 0.45;
    d.glow.position.set(d.mesh.position.x, floorY + 0.0015, d.mesh.position.z);
  }
}

// ---------- Painel de ações ----------
function choiceInfo() {
  if (!race || phase !== 'choose') return null;
  const idx = [...sel].sort();
  const t = race.turn;
  const valid = race.canChoose(idx);
  const pv = race.preview(idx);
  const handAfter = t.hand - t.ones - idx.length;
  const embaloNext = handAfter <= 0 && (t.embalos || 0) < RULES.maxEmbalo;
  const canAgain = valid && (handAfter > 0 || embaloNext);
  const nextHand = handAfter > 0 ? handAfter : N_DICE;
  const nextMarks = embaloNext ? Math.max(1, t.marks) : t.marks;
  return { idx, valid, pv, handAfter, embaloNext, canAgain, nextHand, risk: bustChance(nextHand, nextMarks) };
}

function landingText(pv) {
  const m = pv.move;
  if (m.finished) return 'chega ao cais!';
  const parts = [];
  for (const e of m.events) {
    if (e.type === 'bridge') parts.push('ponte');
    if (e.type === 'current') parts.push('correnteza +3');
    if (e.type === 'fall') parts.push(`cachoeira: volta à ${e.to}`);
    if (e.type === 'rock') parts.push('pedra: encalha');
  }
  if (m.bumped.length) parts.push('marola');
  return `casa ${m.pos}${parts.length ? ` (${parts.join(', ')})` : ''}`;
}

const pct = (p) => `${Math.round(p * 100)}%`;
function drawAct() {
  const show = app === 'play' && race && phase !== 'over' && phase !== 'idle';
  act.mesh.visible = show;
  if (!show) return;
  act.show((p) => {
    const who = shownTurn();
    const shownOld = who !== race.cur || race.phase === 'over';
    const t = shownOld ? { M: phase === 'moving' ? race.lastResult.M : race.lastResult?.lost ?? 0, kept: [], marks: phase === 'bust' ? 2 : 0, hand: 0 } : race.turn;
    const human = isHumanTurn();
    const color = BOAT_COLORS[who];
    p.text(phase === 'intro' ? race.river.def.name : who === 0 ? (dev.autoplay ? 'Sua vez (robô jogando)' : 'Sua vez') : `Vez de ${PILOTS[who - 1].name}`, 512, 56, { size: 46, bold: true, color });
    // marcas do redemoinho e o que já tem na vez
    const marks = phase === 'bust' ? 2 : t.marks;
    p.text('Redemoinho:', 300, 128, { size: 30, color: '#c9ad8a', align: 'right' });
    for (let k = 0; k < 2; k++) {
      const g = p.ctx; g.beginPath(); g.arc(340 + k * 52, 128, 18, 0, Math.PI * 2);
      g.fillStyle = k < marks ? '#5cc6d8' : 'rgba(255,255,255,0.12)'; g.fill();
      g.strokeStyle = '#ffc970'; g.lineWidth = 3; g.stroke();
    }
    p.text(`Já tem: ${t.M} casa${t.M === 1 ? '' : 's'}${t.kept.length ? ` (${t.kept.join('+')})` : ''}`, 470, 128, { size: 30, align: 'left' });
    if (phase === 'intro') {
      p.text('Prepare os dados...', 512, 260, { size: 36 });
    } else if (phase === 'ready' || phase === 'held') {
      if (human) {
        p.text(renderer.xr.isPresenting ? 'Pegue os dados do copo (botão lateral ou pinça),' : 'Arraste os dados do copo e solte em cima da bandeja,', 512, 220, { size: 30 });
        p.text(renderer.xr.isPresenting ? 'chacoalhe e solte em cima da bandeja.' : 'ou aperte Espaço para jogar.', 512, 264, { size: 30 });
        p.text(`${t.hand} dado${t.hand > 1 ? 's' : ''} na mão · chance de redemoinho agora: ${pct(bustChance(t.hand, t.marks))}`, 512, 330, { size: 28, color: '#ffe3a0' });
        if (t.M > 0) p.text(`Você decidiu arriscar: as ${t.M} casas só valem se não der redemoinho.`, 512, 392, { size: 26, color: '#c9ad8a' });
      } else p.text('Chacoalhando os dados...', 512, 260, { size: 34 });
    } else if (phase === 'rolling') {
      p.text('Rolando...', 512, 260, { size: 40 });
    } else if (phase === 'bust') {
      p.text('REDEMOINHO!', 512, 240, { size: 66, bold: true, color: '#5cc6d8' });
      p.text(`Dois 1 na mesma vez: perdeu ${race.lastResult?.lost ?? 0} casa(s).`, 512, 320, { size: 32 });
    } else if (phase === 'moving') {
      const r = race.lastResult;
      p.text(`Remando ${r.M} casa${r.M === 1 ? '' : 's'}...`, 512, 240, { size: 40 });
      if (r.bridge) p.text('Sequência: passou pela ponte!', 512, 300, { size: 30, color: '#ffcf4a' });
    } else if (phase === 'choose') {
      const ci = choiceInfo();
      const vals = t.lastThrow.map((v, i) => (v === 1 ? '1 (redemoinho)' : String(v)));
      p.text(`Saiu: ${vals.join('  ·  ')}`, 512, 196, { size: 32, bold: true });
      if (human) {
        if (!t.usable.length) p.text('Nenhum dado para usar neste lance.', 512, 244, { size: 28, color: '#c9ad8a' });
        else if (!ci.idx.length) p.text(renderer.xr.isPresenting ? 'Aponte para os dados que quer usar e aperte o gatilho' : 'Clique nos dados que quer usar (ou 1, 2, 3)', 512, 244, { size: 28, color: '#c9ad8a' });
        else p.text(`Usando ${ci.idx.map(i => t.lastThrow[i]).join('+')}: total ${ci.pv.M} → ${landingText(ci.pv)}`, 512, 244, { size: 28, color: '#ffe3a0' });
        p.button(`Parar e remar ${ci.valid ? ci.pv.M : '...'}`, () => humanAction('stop'), 40, 292, 460, 110, { size: 36, locked: !ci.valid, sub: ci.valid ? landingText(ci.pv) : 'escolha os dados' });
        const againLabel = ci.embaloNext ? 'Embalo: os 3 de novo' : `Jogar de novo (${ci.handAfter > 0 ? ci.handAfter : 0})`;
        p.button(againLabel, () => humanAction('again'), 524, 292, 460, 110, { size: 34, locked: !ci.canAgain, sub: ci.canAgain ? `chance de redemoinho: ${pct(ci.risk)}` : (ci.valid ? 'sem dados na mão' : 'escolha os dados') });
        p.text(t.usable.length > 1 ? 'Dica: 3 seguidos (2-3-4, 3-4-5, 4-5-6) usados na vez atravessam as pontes.' : '', 512, 448, { size: 22, color: '#c9ad8a' });
      } else {
        p.text(cpuPick ? `${who === 0 ? 'O robô' : PILOTS[who - 1].name} usa ${cpuPick.indices.map(i => t.lastThrow[i]).join('+') || 'nada'} e ${cpuPick.action === 'stop' ? 'para' : 'arrisca de novo'}` : 'Pensando...', 512, 270, { size: 32 });
      }
    }
    if (msg?.text) p.text(msg.text.length > 70 ? msg.text.slice(0, 68) + '…' : msg.text, 512, 520, { size: 25, color: '#ffe3a0' });
    p.text(`Rodada ${race.round + 1} · ${race.river.def.name}`, 512, 600, { size: 24, color: '#c9ad8a' });
    p.text(renderer.xr.isPresenting ? 'B ou Y: pausa' : 'Esc: pausa', 512, 660, { size: 22, color: '#8a7458' });
  });
}

function humanAction(action) {
  if (!isHumanTurn() || phase !== 'choose') return;
  const idx = [...sel].sort();
  if (!race.canChoose(idx)) return;
  applyChoice(idx, action);
}
function toggleDie(id) {
  if (!isHumanTurn() || phase !== 'choose') return;
  const i = thrown.indexOf(id);
  if (i < 0 || !race.turn.usable.includes(i)) return;
  if (sel.has(i)) sel.delete(i); else sel.add(i);
  sfx.select(sel.has(i));
  drawAct();
}

// ---------- Menus ----------
const placeName = (p) => (p ? `${p}º` : '—');
let helpPage = 0;
function showScreen(name) {
  const vr = renderer.xr.isPresenting;
  if (vr) placeMenuVR();
  menu.show((p) => {
    if (name === 'main') {
      p.title('Rio de Dados', 76);
      p.text('Corrida de barquinhos: jogue os dados, arrisque e fuja do redemoinho!', 512, 138, { size: 26, color: '#c9ad8a' });
      p.button('Correr', () => showScreen('rivers'), 212, 186, 600, 100, { size: 42 });
      p.button('Como jogar', () => { helpPage = 0; showScreen('help'); }, 212, 304, 600, 84);
      p.button(`Som: ${save.sound ? 'sim' : 'não'}`, () => { save.sound = !save.sound; sfx.setOn(save.sound); storeSave(save); showScreen('main'); }, 212, 410, 190, 70, { size: 26 });
      p.button(`FPS: ${save.fps ? 'sim' : 'não'}`, () => { save.fps = !save.fps; storeSave(save); showScreen('main'); }, 417, 410, 190, 70, { size: 26 });
      p.button(`Rápido: ${save.fast ? 'sim' : 'não'}`, () => { save.fast = !save.fast; storeSave(save); showScreen('main'); }, 622, 410, 190, 70, { size: 26 });
      p.text(`Vitórias: ${save.wins.reduce((a, b) => a + b, 0)}  ·  Melhores: ${save.best.map((b, i) => `${RIVERS[i].name.replace('Rio ', '')} ${placeName(b)}`).join('  ·  ')}`, 512, 540, { size: 24, color: '#ffc970' });
      p.text(vr ? 'Aponte com o controle e aperte o gatilho' : 'No Quest: abra esta página no navegador do óculos e aperte "Entrar em VR"', 512, 640, { size: 22, color: '#c9ad8a' });
    } else if (name === 'rivers') {
      p.title('Escolha o rio', 60);
      RIVERS.forEach((r, i) => {
        const lock = !riverUnlocked(save, i);
        p.button(`${i + 1}. ${r.name}  ·  ${r.title}`, () => startRace(i), 92, 112 + i * 150, 840, 128, {
          size: 34, locked: lock, sub: lock ? 'Chegue em 1º ou 2º no rio anterior para liberar' : `${r.desc}  (melhor: ${placeName(save.best[i])})`,
        });
      });
      p.text('Contra Dona Lia (cautelosa), Seu Bento (calculista) e Capitã Faísca (arrojada).', 512, 582, { size: 24, color: '#c9ad8a' });
      p.button('Voltar', () => showScreen('main'), 362, 616, 300, 70, { size: 28 });
    } else if (name === 'help') {
      p.title('Como jogar', 56);
      const pages = [[
        'Na sua vez, jogue os dados da mão (3) na bandeja.',
        'Cada 1 vai para o REDEMOINHO. Dois 1 na mesma vez: perde tudo o que juntou.',
        'Escolha pelo menos um dado (sem ser 1) para usar: ele soma casas.',
        'Depois: PARAR e remar o total, ou JOGAR DE NOVO os dados que sobraram.',
        'Usou os 3? EMBALO: joga os 3 de novo (uma vez por vez), mas qualquer 1 derruba.',
        'Correnteza: empurra 3 casas.  Cachoeira: volta até o remanso.',
        'Ponte: com 3 seguidos usados na vez (ex.: 3-4-5), atravessa e corta a curva.',
        'Pedra: encalha, começa a próxima vez com 2 dados.  Parou em cima de outro: marola, ele volta 1.',
        'A rodada termina para todos; ganha quem chegar ao cais mais longe.',
      ], vr ? [
        'Pegar os dados: aperte o botão lateral (ou faça pinça) com a mão no copo.',
        'Chacoalhe e solte em cima da bandeja: a força da mão é a força do lançamento.',
        'Escolher dados: aponte o controle para o dado e aperte o gatilho.',
        'Botões do painel: aponte e gatilho.   B ou Y: pausa.',
        'O placar dos pilotos fica atrás do tabuleiro.',
      ] : [
        'Jogar: arraste os dados do copo com o mouse e solte em cima da bandeja',
        '(a velocidade do mouse vira a força), ou clique no copo / aperte Espaço.',
        'Escolher dados: clique neles ou aperte 1, 2 e 3.',
        'Enter: parar e remar.   R: jogar de novo.   Esc: pausa.   F: FPS.',
        'O anel branco no tabuleiro mostra onde o barco vai parar.',
      ]];
      pages[helpPage].forEach((t, i) => p.text(t, 40, 120 + i * 52, { size: helpPage === 0 ? 24 : 27, align: 'left' }));
      p.button(helpPage === 0 ? 'Controles' : 'Regras', () => { helpPage = 1 - helpPage; showScreen('help'); }, 212, 606, 290, 76, { size: 30 });
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 522, 606, 290, 76, { size: 30 });
    } else if (name === 'pause') {
      p.title('Pausa', 66);
      p.text(`${race.river.def.name} · rodada ${race.round + 1}`, 512, 130, { size: 28, color: '#c9ad8a' });
      p.button('Continuar', () => togglePause(), 262, 176, 500, 84);
      p.button('Recomeçar a corrida', () => startRace(riverIndex), 262, 276, 500, 84);
      p.button('Como jogar', () => { helpPage = 0; showScreen('help'); }, 262, 376, 245, 84, { size: 30 });
      p.button('Recentralizar', () => { togglePause(); placeRig(VR_STAND.x, VR_STAND.z); }, 517, 376, 245, 84, { size: 30, locked: !vr });
      p.button('Menu principal', () => goMenu(), 262, 476, 500, 84);
    } else if (name === 'over') {
      const place = race.placeOf(0);
      p.title(place === 1 ? 'Você venceu!' : `Você chegou em ${place}º`, 70);
      race.places.forEach((k, i) => {
        const b = race.boats[k];
        const nm = k === 0 ? 'Você' : PILOTS[k - 1].name;
        p.text(`${i + 1}º  ${nm}`, 300, 150 + i * 56, { size: 36, bold: true, color: BOAT_COLORS[k], align: 'left' });
        p.text(b.finished ? 'no cais' : `casa ${b.pos} de ${race.last}`, 640, 150 + i * 56, { size: 30, align: 'left' });
      });
      const next = riverIndex + 1;
      p.button('Correr de novo', () => startRace(riverIndex), 112, 400, 390, 90, { size: 34 });
      p.button(next < RIVERS.length ? 'Próximo rio' : 'Último rio!', () => startRace(next), 522, 400, 390, 90, { size: 34, locked: next >= RIVERS.length || !riverUnlocked(save, next) });
      p.button('Escolher rio', () => showScreen('rivers'), 112, 510, 390, 80, { size: 30 });
      p.button('Menu principal', () => goMenu(), 522, 510, 390, 80, { size: 30 });
      p.text(next < RIVERS.length && !riverUnlocked(save, next) ? 'Chegue em 1º ou 2º para liberar o próximo rio.' : '', 512, 630, { size: 24, color: '#c9ad8a' });
    }
  });
}

// ---------- Painéis no PC e no VR ----------
function fitPC() {
  if (renderer.xr.isPresenting) return;
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  if (menu.mesh.parent !== camera) camera.add(menu.mesh);
  const half = THREE.MathUtils.degToRad(camera.fov / 2);
  const visH = 2 * 0.8 * Math.tan(half), visW = visH * aspect;
  menu.mesh.position.set(0, 0, -0.8);
  menu.mesh.quaternion.identity();
  menu.mesh.scale.setScalar(Math.min(1, visW * 0.94 / 0.9, visH * 0.92 / 0.633));
  // painel de ações: canto de baixo à esquerda
  if (vrPreviewOn) return;
  if (act.mesh.parent !== camera) camera.add(act.mesh);
  const vh = 2 * Math.tan(half), vw = vh * aspect;
  const s = Math.min(vh * 0.31 / 0.3234, vw * 0.34 / 0.46);
  act.mesh.scale.setScalar(s);
  act.mesh.quaternion.identity();
  act.mesh.position.set(-vw / 2 + 0.23 * s + vh * 0.02, -vh / 2 + 0.162 * s + vh * 0.02, -1);
}
function placeMenuVR() {
  const head = new THREE.Vector3(), hq = new THREE.Quaternion();
  camera.getWorldPosition(head);
  camera.getWorldQuaternion(hq);
  const yaw = new THREE.Euler().setFromQuaternion(hq, 'YXZ').y;
  const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  menu.mesh.position.copy(head).addScaledVector(fwd, 1.0);
  menu.mesh.position.y = head.y - 0.1;
  menu.mesh.rotation.set(0, yaw, 0);
}
function placeActVR() {
  if (act.mesh.parent !== scene) scene.add(act.mesh);
  // atrás do tabuleiro, na altura dos olhos: dá para ver o rio e o painel juntos
  act.mesh.scale.setScalar(1.75);
  act.mesh.position.set(0, TOP + 0.43, -0.68);
  act.mesh.rotation.set(-0.1, 0, 0);
}
// Põe a cabeça do jogador em (x, z), olhando para -z (a mesa).
function placeRig(x, z) {
  const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  rig.rotation.set(0, -e.y, 0);
  const head = camera.position.clone().setY(0).applyAxisAngle(UP, rig.rotation.y);
  rig.position.set(x - head.x, 0, z - head.z);
  rig.updateMatrixWorld(true);
}
function placeForPhase() { if (!renderer.xr.isPresenting) pcCamSnap = true; }

// ---------- Controles do VR ----------
const ctrls = [];
const raycaster = new THREE.Raycaster();
for (let i = 0; i < 2; i++) {
  const ctrl = renderer.xr.getController(i);
  const grip = renderer.xr.getControllerGrip(i);
  rig.add(ctrl, grip);
  const laser = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0xffc970 }));
  laser.visible = false;
  ctrl.add(laser);
  const mark = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffc970, roughness: 0.4 }));
  grip.add(mark);
  const entry = { ctrl, grip, laser, mark, source: null, side: null, prevButtons: [], hover: null, hist: [] };
  ctrls.push(entry);
  ctrl.addEventListener('connected', (e) => { entry.source = e.data; entry.side = e.data.handedness; });
  ctrl.addEventListener('disconnected', () => { if (held?.entry === entry) held = null; entry.source = null; entry.side = null; });
  ctrl.addEventListener('selectstart', () => onSelect(entry));
  ctrl.addEventListener('selectend', () => { if (entry.source?.hand && held?.entry === entry) releaseHeld(); });
  ctrl.addEventListener('squeezestart', () => { sfx.unlock(); if (!entry.source?.hand) tryGrab(entry); });
  ctrl.addEventListener('squeezeend', () => { if (!entry.source?.hand && held?.entry === entry) releaseHeld(); });
}
function pulse(entry, v, ms) { try { entry?.source?.gamepad?.hapticActuators?.[0]?.pulse?.(clamp(v, 0, 1), ms); } catch { /* sem vibração */ } }
function pulseAll(v, ms) { if (renderer.xr.isPresenting) ctrls.forEach(e => pulse(e, v, ms)); }

function handPos(entry, out) { entry.grip.getWorldPosition(out); return Number.isFinite(out.x) ? out : null; }
function canGrab() { return app === 'play' && !menu.visible && phase === 'ready' && isHumanTurn() && !held && dice.some(d => d.state === 'cup'); }
function tryGrab(entry) {
  if (!canGrab()) return false;
  const p = handPos(entry, _v);
  if (!p || p.distanceTo(_v2.set(CUP_POS.x, TOP + 0.03, CUP_POS.z)) > GRAB_R) return false;
  held = { kind: 'vr', entry, hist: [], shake: 0, rattleT: 0, prevV: new THREE.Vector3() };
  dice.forEach(d => { if (d.state === 'cup') { d.state = 'held'; d.fly = null; } });
  phase = 'held';
  sfx.grab();
  pulse(entry, 0.4, 40);
  drawAct();
  return true;
}
const HELD_OFF = [new THREE.Vector3(-0.017, -0.01, -0.035), new THREE.Vector3(0.016, -0.012, -0.03), new THREE.Vector3(0, -0.002, -0.05)];
function updateHeld(dt) {
  if (!held) return;
  let p;
  if (held.kind === 'vr') {
    p = handPos(held.entry, new THREE.Vector3());
    if (!p) return;
    held.entry.grip.getWorldQuaternion(_q);
  } else p = held.point.clone();
  held.hist.push({ t: time, p: p.clone() });
  while (held.hist.length && held.hist[0].t < time - 0.25) held.hist.shift();
  const v = heldVelocity();
  // chacoalho: mudanças bruscas de velocidade
  const dv = v.distanceTo(held.prevV) / Math.max(dt, 1e-3);
  held.prevV.copy(v);
  held.shake = Math.max(held.shake * Math.exp(-3 * dt), clamp(dv / 40, 0, 1));
  held.rattleT -= dt;
  if (held.rattleT <= 0 && dv > 6) { sfx.rattle(clamp(dv / 30, 0.1, 1)); held.rattleT = 0.05; if (held.kind === 'vr') pulse(held.entry, 0.15 + held.shake * 0.4, 20); }
  const hd = dice.filter(d => d.state === 'held');
  hd.forEach((d, k) => {
    const off = HELD_OFF[k].clone();
    if (held.kind === 'vr') off.applyQuaternion(_q); else off.set(HELD_OFF[k].x, HELD_OFF[k].z * 0.3 + 0.01 * k, HELD_OFF[k].y * 0.5);
    const j = held.shake * 0.006;
    d.mesh.position.copy(p).add(off).add(_v2.set((Math.random() - 0.5) * j, (Math.random() - 0.5) * j, (Math.random() - 0.5) * j));
    if (held.shake > 0.05) d.mesh.quaternion.multiply(_tq.setFromAxisAngle(_v2.set(Math.random(), Math.random(), Math.random()).normalize(), held.shake * 0.6));
  });
}
function heldVelocity() {
  const Hh = held.hist;
  if (Hh.length < 2) return new THREE.Vector3();
  const last = Hh[Hh.length - 1];
  let first = Hh[0];
  for (const e of Hh) if (e.t >= last.t - 0.09) { first = e; break; }
  const dt = Math.max(1e-3, last.t - first.t);
  return last.p.clone().sub(first.p).divideScalar(dt);
}
function releaseHeld() {
  if (!held) return;
  const v = heldVelocity().multiplyScalar(held.kind === 'vr' ? HAND_GAIN : 1);
  if (v.length() > MAX_THROW) v.setLength(MAX_THROW);
  const kind = held.kind, entry = held.entry;
  // longe da bandeja? os dados caem nela do mesmo jeito (por cima)
  const hd = dice.filter(d => d.state === 'held');
  const c = hd[0]?.mesh.position || _v;
  const far = Math.abs(c.x - TRAY_POS.x) > TRAY.w / 2 + 0.25 || Math.abs(c.z - TRAY_POS.z) > TRAY.d / 2 + 0.25;
  if (far) msg = { text: 'Solte em cima da bandeja! (os dados foram para lá)', t: 2.5 };
  const horiz = Math.hypot(v.x, v.z);
  if (horiz < 0.2 && kind === 'pc') { const a = (Math.random() - 0.5) * 1.0; v.set(Math.sin(a) * 0.9, -0.3, -Math.cos(a) * 0.9); }
  v.y = Math.min(v.y, 0.6) - 0.2;
  throwDice({ v, shake: held.shake });
  if (kind === 'vr') pulse(entry, 0.25, 30);
}

function onSelect(entry) {
  sfx.unlock();
  if (menu.visible) {
    if (entry.hover?.panel === menu) { const a = menu.actionAt(entry.hover.index); if (a) { sfx.click(); a(); } }
    return;
  }
  if (entry.source?.hand && tryGrab(entry)) return;   // mão rastreada: pinça no copo pega os dados
  if (entry.hover?.panel === act) { const a = act.actionAt(entry.hover.index); if (a) { sfx.click(); a(); } return; }
  if (entry.hover?.die != null) toggleDie(entry.hover.die);
}

function pollButtons() {
  for (const e of ctrls) {
    const gp = e.source?.gamepad;
    if (!gp || e.source.hand) continue;
    const b = gp.buttons.map(x => x.pressed);
    if (b[5] && !e.prevButtons[5]) togglePause();   // B ou Y
    e.prevButtons = b;
  }
}

// Raios dos controles: menu, painel de ações e dados
const rayOrigin = new THREE.Vector3(), rayDir = new THREE.Vector3();
const dieMeshes = dice.map(d => d.mesh);
function pickAt(ray) {
  if (menu.visible) {
    const hit = ray.intersectObject(menu.mesh)[0];
    return hit ? { panel: menu, index: menu.pick(hit.uv), dist: hit.distance } : null;
  }
  let best = null;
  if (act.mesh.visible) {
    const hit = ray.intersectObject(act.mesh)[0];
    if (hit) best = { panel: act, index: act.pick(hit.uv), dist: hit.distance };
  }
  if (phase === 'choose') {
    const hit = ray.intersectObjects(dieMeshes)[0];
    if (hit && (!best || hit.distance < best.dist)) best = { die: dieMeshes.indexOf(hit.object), dist: hit.distance };
  }
  return best;
}
function updateRays() {
  const vr = renderer.xr.isPresenting;
  let menuHover = -1, actHover = -1;
  dice.forEach(d => { d.hover = false; });
  for (const e of ctrls) {
    e.hover = null;
    e.laser.visible = false;
    e.mark.visible = vr && !!e.source && !e.source.hand && !(held?.entry === e);
    if (!vr || !e.source || held?.entry === e) continue;
    e.ctrl.getWorldPosition(rayOrigin);
    e.ctrl.getWorldQuaternion(_q);
    rayDir.set(0, 0, -1).applyQuaternion(_q);
    raycaster.set(rayOrigin, rayDir);
    const h = pickAt(raycaster);
    const pointy = menu.visible || (app === 'play' && (phase === 'choose' || h?.panel));
    e.laser.visible = !!pointy;
    e.laser.scale.z = h ? h.dist : 0.6;
    e.hover = h;
    if (h?.panel === menu) menuHover = h.index;
    if (h?.panel === act) actHover = h.index;
    if (h?.die != null) dice[h.die].hover = true;
  }
  if (!vr) {
    raycaster.setFromCamera(mouse.ndc, camera);
    const h = pickAt(raycaster);
    if (h?.panel === menu) menuHover = h.index;
    if (h?.panel === act) actHover = h.index;
    if (h?.die != null) dice[h.die].hover = true;
    let cursor = 'default';
    if ((h?.panel && h.panel.actionAt(h.index)) || (h?.die != null && isHumanTurn())) cursor = 'pointer';
    else if (canGrab() || held) cursor = held ? 'grabbing' : (overCup() ? 'grab' : 'default');
    renderer.domElement.style.cursor = cursor;
  }
  if (menu.visible) menu.setHover(menuHover);
  if (act.mesh.visible) act.setHover(actHover);
  // anel do copo acende quando dá para pegar
  const ring = world.cup.userData.ring;
  let near = false;
  if (vr && canGrab()) for (const e of ctrls) if (e.source && handPos(e, _v) && _v.distanceTo(_v2.set(CUP_POS.x, TOP + 0.03, CUP_POS.z)) < GRAB_R) near = true;
  ring.material.opacity = canGrab() ? (near ? 0.95 : 0.35 + 0.25 * Math.sin(time * 4)) : 0;
  ring.material.color.set(near ? 0x7dffb0 : 0xffc970);
}

// ---------- Mouse e teclado (PC) ----------
const mouse = { ndc: new THREE.Vector2(-5, -5) };
const keys = new Set();
const heldPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(TOP + 0.11));
function mousePoint(out) {
  raycaster.setFromCamera(mouse.ndc, camera);
  return raycaster.ray.intersectPlane(heldPlane, out);
}
function overCup() {
  raycaster.setFromCamera(mouse.ndc, camera);
  const p = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -TOP), new THREE.Vector3());
  return !!p && Math.hypot(p.x - CUP_POS.x, p.z - CUP_POS.z) < 0.08;
}
const dom = renderer.domElement;
dom.addEventListener('contextmenu', (e) => e.preventDefault());
dom.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  setMouse(e);
  raycaster.setFromCamera(mouse.ndc, camera);
  const h = pickAt(raycaster);
  if (h?.panel) { const a = h.panel.actionAt(h.index); if (a) { sfx.click(); a(); } return; }
  if (menu.visible) return;
  if (h?.die != null) { toggleDie(h.die); return; }
  if (canGrab() && overCup() && !renderer.xr.isPresenting) {
    const p = mousePoint(new THREE.Vector3());
    if (!p) return;
    held = { kind: 'pc', point: p, hist: [], shake: 0, rattleT: 0, prevV: new THREE.Vector3(), downAt: time };
    dice.forEach(d => { if (d.state === 'cup') { d.state = 'held'; d.fly = null; } });
    phase = 'held';
    sfx.grab();
    dom.setPointerCapture?.(e.pointerId);
    drawAct();
  }
});
function setMouse(e) { mouse.ndc.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1); }
dom.addEventListener('pointermove', (e) => {
  setMouse(e);
  if (held?.kind === 'pc') {
    const p = mousePoint(new THREE.Vector3());
    if (p) {
      p.x = clamp(p.x, TRAY_POS.x - TRAY.w / 2 - 0.45, TRAY_POS.x + TRAY.w / 2 + 0.2);
      p.z = clamp(p.z, TRAY_POS.z - TRAY.d / 2 - 0.15, TRAY_POS.z + TRAY.d / 2 + 0.1);
      held.point.copy(p);
    }
  }
});
window.addEventListener('pointerup', () => {
  if (held?.kind !== 'pc') return;
  releaseHeld();
});
window.addEventListener('blur', () => { keys.clear(); if (held?.kind === 'pc') { held = null; dice.forEach(d => { if (d.state === 'held') sendDie(d, 'cup'); }); if (phase === 'held') phase = 'ready'; } });
window.addEventListener('keydown', (e) => {
  sfx.unlock();
  const k = e.key.toLowerCase();
  if (k === 'escape' || k === 'p') { togglePause(); return; }
  if (k === 'f') { save.fps = !save.fps; storeSave(save); return; }
  if (k === ' ') e.preventDefault();
  keys.add(k);
  if (app !== 'play' || menu.visible || !isHumanTurn()) return;
  if ((k === ' ' || k === 'enter') && phase === 'ready' && !held) { throwDice(null); return; }
  if (phase === 'choose') {
    if (k >= '1' && k <= '3') { const id = thrown[+k - 1]; if (id != null) toggleDie(id); }
    if (k === 'enter') humanAction('stop');
    if (k === 'r' || k === ' ') humanAction('again');
  }
});
window.addEventListener('keyup', (e) => { keys.delete(e.key.toLowerCase()); });
window.addEventListener('resize', () => { renderer.setSize(window.innerWidth, window.innerHeight); fitPC(); });

// ---------- Câmera do PC ----------
const pcCam = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
let pcCamSnap = true;
let vrPreviewOn = false;
function updatePCCamera(dt) {
  if (renderer.xr.isPresenting) return;
  if (vrPreviewOn) {
    camera.position.set(VR_STAND.x, 1.6, VR_STAND.z);
    camera.lookAt(0, TOP + 0.08, -0.2);
    return;
  }
  let pos, look;
  if (app === 'menu') {
    const a = time * 0.06;
    pos = new THREE.Vector3(Math.sin(a) * 0.9, TOP + 0.75, 0.5 + Math.cos(a) * 0.5);
    look = new THREE.Vector3(0, TOP, -0.15);
  } else {
    // um pouco mais alto e para trás em telas estreitas, para caber a mesa toda
    const aspect = window.innerWidth / window.innerHeight;
    const back = aspect < 1.4 ? (1.4 - aspect) * 0.9 : 0;
    pos = new THREE.Vector3(0.04, TOP + 1.0 + back * 0.6, 1.12 + back);
    look = new THREE.Vector3(0.04, TOP + 0.02, -0.1);
  }
  if (pcCamSnap) { pcCam.pos.copy(pos); pcCam.look.copy(look); pcCamSnap = false; }
  pcCam.pos.lerp(pos, damp(3, dt));
  pcCam.look.lerp(look, damp(3, dt));
  camera.position.copy(pcCam.pos);
  camera.lookAt(pcCam.look);
}

// ---------- VR: sessão ----------
let recenterIn = 0;
renderer.xr.addEventListener('sessionstart', () => {
  recenterIn = 5;
  if (menu.mesh.parent) menu.mesh.parent.remove(menu.mesh);
  scene.add(menu.mesh);
  menu.mesh.scale.setScalar(1);
  placeActVR();
  updateHint();
  drawAct();
});
renderer.xr.addEventListener('sessionend', () => {
  held = null;
  rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
  camera.position.set(0, 1.6, 1); camera.quaternion.identity();
  pcCamSnap = true;
  fitPC();
  updateHint();
  drawAct();
});

// ---------- HUD (PC) e placa dos pilotos ----------
const hintEl = document.getElementById('hint');
const hudEl = document.getElementById('hud');
const fpsEl = document.getElementById('fps');
function updateHint() {
  if (renderer.xr.isPresenting) { hintEl.textContent = ''; return; }
  let t;
  if (app !== 'play' || menu.visible) t = 'Clique nas opções do painel';
  else if (isHumanTurn() && phase === 'ready') t = 'Arraste os dados do copo para a bandeja e solte (ou Espaço) · Esc: pausa';
  else if (isHumanTurn() && phase === 'choose') t = 'Clique nos dados para usar (1, 2, 3) · Enter: parar e remar · R: jogar de novo';
  else t = 'Esc: pausa';
  hintEl.innerHTML = `<span>${t}</span>`;
}
function updateHud(dt) {
  if (msg) { msg.t -= dt; if (msg.t <= 0) msg = null; }
  const vr = renderer.xr.isPresenting;
  const playing = app === 'play' && race && !menu.visible;
  hudEl.style.display = !vr && playing ? 'block' : 'none';
  if (!vr && playing) {
    const rows = race.boats.map((b, k) => `<span style="color:${BOAT_COLORS[k]}">●</span> ${k === shownTurn() && phase !== 'over' ? '<b>' : ''}${k === 0 ? 'Você' : PILOTS[k - 1].name}${k === shownTurn() && phase !== 'over' ? '</b>' : ''}: ${b.finished ? 'no cais' : `casa ${vis[k]}`}`).join(' &nbsp; ');
    const html = `<b>${race.river.def.name}</b> · rodada ${race.round + 1} · cais na casa ${race.last}<br>${rows}${msg?.text ? `<br><em>${msg.text}</em>` : ''}`;
    if (hudEl.dataset.last !== html) { hudEl.innerHTML = html; hudEl.dataset.last = html; }
  }
}
let signKey = '';
function updateSign() {
  const key = race ? JSON.stringify([race.river.index, vis, shownTurn(), race.round, race.phase, race.boats.map(b => b.stuck)]) : 'menu';
  if (key === signKey) return;
  signKey = key;
  world.drawSign((g, w, h) => {
    g.fillStyle = '#2e1e10'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffc970'; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
    g.textBaseline = 'middle';
    if (!race) {
      g.fillStyle = '#ffc970'; g.font = 'bold 84px Georgia, serif'; g.textAlign = 'center'; g.fillText('Rio de Dados', w / 2, h / 2 - 40);
      g.fillStyle = '#fff4e2'; g.font = '36px sans-serif'; g.fillText('Escolha um rio para correr', w / 2, h / 2 + 50);
      return;
    }
    g.fillStyle = '#ffc970'; g.font = 'bold 44px Georgia, serif'; g.textAlign = 'left';
    g.fillText(race.river.def.name, 36, 50);
    g.textAlign = 'right'; g.font = '30px sans-serif'; g.fillStyle = '#c9ad8a';
    g.fillText(race.phase === 'over' ? 'Fim da corrida' : `Rodada ${race.round + 1}`, w - 36, 50);
    race.boats.forEach((b, k) => {
      const y = 120 + k * 72;
      const nm = k === 0 ? 'Você' : PILOTS[k - 1].name;
      if (k === shownTurn() && phase !== 'over') { g.fillStyle = 'rgba(255,201,112,0.18)'; g.fillRect(20, y - 32, w - 40, 64); }
      g.fillStyle = BOAT_COLORS[k]; g.beginPath(); g.arc(56, y, 18, 0, Math.PI * 2); g.fill();
      g.textAlign = 'left'; g.fillStyle = '#fff4e2'; g.font = 'bold 34px sans-serif'; g.fillText(nm, 90, y);
      const x0 = 400, x1 = w - 160;
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x0, y - 9, x1 - x0, 18);
      g.fillStyle = BOAT_COLORS[k]; g.fillRect(x0, y - 9, (x1 - x0) * vis[k] / race.last, 18);
      g.textAlign = 'right'; g.font = '30px sans-serif'; g.fillStyle = '#fff4e2';
      g.fillText(b.finished ? 'cais!' : `${vis[k]}/${race.last}${b.stuck ? ' ⚓' : ''}`, w - 30, y);
    });
  });
}

// ---------- Botão de VR ----------
const vrBtn = document.getElementById('vr');
async function setupVR() {
  const ok = navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  if (!ok) {
    vrBtn.textContent = window.isSecureContext ? 'VR não disponível neste navegador' : 'VR precisa de HTTPS';
    vrBtn.disabled = true;
    return;
  }
  vrBtn.textContent = 'Entrar em VR';
  vrBtn.disabled = false;
  vrBtn.onclick = async () => {
    sfx.unlock();
    if (renderer.xr.isPresenting) { renderer.xr.getSession()?.end(); return; }
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
      await renderer.xr.setSession(session);
      vrBtn.textContent = 'Sair do VR';
      session.addEventListener('end', () => { vrBtn.textContent = 'Entrar em VR'; });
    } catch (err) {
      vrBtn.textContent = 'Erro ao entrar em VR';
      console.error(err);
    }
  };
}
setupVR();

// ---------- Laço principal ----------
let lastT = performance.now();
let fpsFrames = 0, fpsTime = 0;
const diceEvents = [];
const bt = { pos: new THREE.Vector3(), y: 0, yaw: 0, spin: 0 };

function tick(dt) {
  time += dt;
  if (recenterIn > 0 && --recenterIn === 0) { placeRig(VR_STAND.x, VR_STAND.z); if (menu.visible) placeMenuVR(); }
  pollButtons();
  rig.updateMatrixWorld(true);
  const fast = keys.has('shift') ? 3 : 1;

  if (app === 'play' && race) {
    const pdt = dt * fast;
    if (phase === 'intro') {
      timer -= pdt;
      if (timer <= 0) beginTurn();
    } else if (phase === 'ready') {
      if (!isHumanTurn()) {
        timer -= pdt;
        if (timer <= 0) throwDice(null);
      }
    } else if (phase === 'held') {
      updateHeld(dt);
    } else if (phase === 'rolling') {
      acc += pdt;
      timer += pdt;
      const bodies = dice.filter(d => d.state === 'tray' && d.body).map(d => d.body);
      const n = Math.min(240, Math.floor(acc / DT));
      for (let i = 0; i < n; i++) stepDice(bodies, DT, diceEvents);
      acc -= n * DT;
      let sounds = 0;
      for (const e of diceEvents) {
        if (e.type === 'nudge' || sounds > 3) continue;
        sfx.diceHit(e.type, e.v); sounds++;
        if (e.type !== 'floor' && e.v > 0.6) pulseAll(Math.min(0.4, e.v / 4), 15);
      }
      diceEvents.length = 0;
      if (allAsleep(bodies) && timer > 0.35) onSettled();
    } else if (phase === 'choose') {
      if (!isHumanTurn()) {
        timer -= pdt;
        if (timer <= 0) {
          if (!cpuPick) { cpuPick = decide(race, pilotOf(race.cur), random); timer = 0.9 / speed(); drawAct(); }
          else { const c = cpuPick; cpuPick = null; applyChoice(c.indices, c.action); }
        }
      }
    } else if (phase === 'bust') {
      timer -= pdt; bustT += pdt;
      if (timer <= 0) { swirlTarget = 0; afterTurn(); }
    } else if (phase === 'moving') {
      updateMoveAnim(pdt);
    } else if (phase === 'over' && dev.autoplay) {
      timer -= pdt;
      if (timer <= 0 && dev.autoRestart) startRace(riverIndex);
    }
  }

  // visual
  swirl += (swirlTarget - swirl) * damp(3, dt);
  world.animate(dt, time, swirl);
  updateDiceViz(dt);
  if (race) {
    for (let k = 0; k < boats.length; k++) {
      const b = boats[k];
      b.visible = true;
      boatTransform(k, bt);
      b.position.copy(bt.pos); b.position.y += bt.y + Math.sin(time * 2.2 + k) * 0.0008;
      b.rotation.set(Math.sin(time * 1.7 + k) * 0.04, bt.yaw + bt.spin, 0);
      b.userData.marker.visible = k === shownTurn() && phase !== 'over';
    }
  } else for (const b of boats) b.visible = false;
  updatePreview();
  updatePCCamera(dt);
  updateHud(dt);
  updateRays();
  updateSign();
  if (msg?.text !== lastMsg) { lastMsg = msg?.text; drawAct(); }
  sfx.update(dt, swirl);

  fpsFrames++; fpsTime += dt;
  if (fpsTime >= 0.5) {
    const f = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0; fpsTime = 0;
    const vr = renderer.xr.isPresenting;
    fpsEl.style.display = save.fps && !vr ? 'block' : 'none';
    fpsEl.textContent = `${f} FPS`;
    fpsLabel.mesh.visible = save.fps && vr;
    fpsLabel.set(`${f} FPS`);
  }
}
let lastMsg = null;

// Anel branco onde o barco vai parar com os dados escolhidos agora
function updatePreview() {
  let show = false;
  if (app === 'play' && race && race.phase !== 'over' && !menu.visible) {
    let idx = null;
    if (phase === 'choose') idx = cpuPick ? cpuPick.indices : [...sel];
    if (phase === 'ready' || phase === 'held') idx = [];
    if (idx && (idx.length || race.turn.M > 0)) {
      const pv = phase === 'choose' ? race.preview(idx) : { M: race.turn.M, move: race.preview([]).move };
      if (pv.M > 0) {
        show = true;
        cellWorld(race.river, pv.move.pos, 0, previewRing.position);
        previewRing.position.y += 0.002;
        const s = 1 + 0.15 * Math.sin(time * 6);
        previewRing.scale.set(s, 1, s);
        previewLabel.mesh.position.copy(previewRing.position).add(_v.set(0, 0.05, 0));
        previewLabel.mesh.quaternion.copy(camera.getWorldQuaternion(_q));
        previewLabel.set([{ text: pv.move.finished ? 'cais!' : `+${pv.M} → ${pv.move.pos}`, size: 0.7, color: '#fff4e2' }]);
      }
    }
  }
  previewRing.visible = show;
  previewLabel.mesh.visible = show;
}

function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  tick(dt);
  renderer.render(scene, camera);
}

// ---------- Depuração (console do navegador) ----------
// dev.autoplay = true     o robô joga por você (dev.autoRestart = true: corre de novo sozinho)
// dev.advance(20)         avança 20 s de jogo na hora
// dev.state()             resumo: tela, fase, vez, barcos, dados
// dev.loadLevel(2)        começa uma corrida no rio 2 (1 a 3)
// dev.resetSave()         apaga o progresso
const dev = {
  _auto: false,
  autoRestart: false,
  get autoplay() { return this._auto; },
  set autoplay(v) {
    this._auto = !!v;
    if (held) { held = null; dice.forEach(d => { if (d.state === 'held') sendDie(d, 'cup'); }); if (phase === 'held') phase = 'ready'; }
    timer = 0;
    drawAct();
  },
  loadLevel(n) { startRace(n - 1); return this.state(); },
  startRace(n = 1) { return this.loadLevel(n); },
  advance(sec, step = 1 / 60) {
    const frames = Math.round(sec / step);
    for (let i = 0; i < frames; i++) tick(step);
    lastT = performance.now();
    renderer.render(scene, camera);
    return this.state();
  },
  state() {
    const base = { tela: app, fase: phase, menu: menu.visible };
    if (!race) return base;
    const t = race.turn;
    return {
      ...base,
      rio: race.river.def.name, rodada: race.round + 1, casas: race.last,
      vez: race.cur === 0 ? 'você' : PILOTS[race.cur - 1].name,
      barcos: race.boats.map((b, k) => ({ nome: k === 0 ? 'você' : PILOTS[k - 1].name, casa: b.pos, mostrada: vis[k], chegou: b.finished, redemoinhos: b.busts, vezes: b.turns })),
      daVez: t ? { mao: t.hand, marcas: t.marks, juntou: t.M, usados: t.kept, ultimo: t.lastThrow } : null,
      dados: dice.map(d => d.state),
      colocacao: race.places ? race.places.map(k => (k === 0 ? 'você' : PILOTS[k - 1].name)) : null,
      salvo: { melhores: save.best, vitorias: save.wins },
    };
  },
  // olha a mesa de onde fica a cabeça no VR, com o painel de ações no lugar do VR (só para conferir)
  vrPreview(on = true) {
    vrPreviewOn = on;
    if (on) placeActVR(); else fitPC();
    return on;
  },
  resetSave() { save.best = [0, 0, 0]; save.wins = [0, 0, 0]; save.races = [0, 0, 0]; storeSave(save); },
};
window.dev = dev;
window.dados = { dev, get race() { return race; }, save, camera, scene, renderer };

// Rio de enfeite atrás do menu
const menuRiver = new Race(0, [{ name: 'a' }]).river;
fitPC();
goMenu();
renderer.setAnimationLoop(frame);
