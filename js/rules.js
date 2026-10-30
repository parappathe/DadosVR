// Regras do Rio de Dados: os 3 rios (casas e casas especiais), a vez com os dados (push-your-luck)
// e o movimento dos barcos. Sem navegador e sem Three.js: os testes rodam no Node.
//
// Coordenadas do tabuleiro em metros, no plano da mesa: x = direita de quem joga, z = para perto
// de quem joga (+). O tabuleiro fica centrado em (0, 0) com 1,14 × 0,74 m.

export const BOARD = { w: 1.14, d: 0.74 };
export const ROW_X = 0.40;            // as retas do rio vão de -ROW_X a +ROW_X
export const N_DICE = 3;
export const CURRENT_PUSH = 3;        // correnteza empurra 3 casas
export const FALL_BACK = 5;           // cachoeira: volta umas 5 casas, até o remanso
export const BUMP_BACK = 1;           // marola: barco que já estava na casa volta 1
export const RULES = { maxEmbalo: 1 };   // quantas vezes por vez dá para pegar os 3 dados de novo

// Tipos de casa
export const C = { NORMAL: 0, CURRENT: 1, FALL: 2, BRIDGE: 3, ROCK: 4, START: 5, DOCK: 6, EXIT: 7 };
export const CELL_NAME = ['casa', 'correnteza', 'cachoeira', 'ponte', 'pedra', 'largada', 'cais', 'saída da ponte'];

export const RIVERS = [
  {
    name: 'Rio Manso', title: 'O rio calmo',
    desc: 'Águas mansas, muita correnteza a favor e só três cachoeiras.',
    rows: 3, dz: 0.22, wig: 0.028, waves: [2, 3, 2], spacing: 0.040,
    counts: { current: 9, fall: 3, rock: 0 }, seed: 11,
    water: ['#2f8fb0', '#5cc6d8'],
  },
  {
    name: 'Rio das Pedras', title: 'Cheio de pedras',
    desc: 'Pedras no caminho: parou numa, encalha e começa a vez com 2 dados.',
    rows: 3, dz: 0.22, wig: 0.045, waves: [3, 2, 3], spacing: 0.040,
    counts: { current: 5, fall: 4, rock: 11 }, seed: 23,
    water: ['#3a7f8a', '#7fb8b0'],
  },
  {
    name: 'Rio das Cachoeiras', title: 'Despencando',
    desc: 'Rio comprido de quatro voltas, nove cachoeiras e três pontes.',
    rows: 4, dz: 0.17, wig: 0.026, waves: [2, 3, 2, 3], spacing: 0.042,
    counts: { current: 6, fall: 9, rock: 3 }, seed: 37,
    water: ['#2a6fa8', '#66b4e8'],
  },
];

// Sorteio com semente (sfc32, com a semente espalhada pelo splitmix32)
export function rng(seed) {
  let z = (seed >>> 0) ^ 0x9E3779B9;
  const mix = () => {
    z = (z + 0x9E3779B9) >>> 0;
    let t = z;
    t = Math.imul(t ^ (t >>> 16), 0x85EBCA6B);
    t = Math.imul(t ^ (t >>> 13), 0xC2B2AE35);
    return (t ^ (t >>> 16)) >>> 0;
  };
  let a = mix(), b = mix(), c = mix(), d = mix();
  const next = () => {
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    return t;
  };
  for (let i = 0; i < 12; i++) next();
  return () => next() / 4294967296;
}

// Linha do meio do rio: retas sinuosas que vão e voltam, ligadas por curvas em U.
function riverPath(def) {
  const pts = [];
  const R = def.rows, dz = def.dz;
  const z0 = (R - 1) * dz / 2;            // primeira reta perto de quem joga
  for (let r = 0; r < R; r++) {
    const zr = z0 - r * dz;
    const dir = r % 2 === 0 ? 1 : -1;     // primeira reta vai para a direita
    const n = 80;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = dir * (-ROW_X + 2 * ROW_X * t);
      const z = zr + def.wig * Math.sin(Math.PI * t) * Math.sin(2 * Math.PI * def.waves[r] * t + r);
      if (r > 0 && i === 0) continue;
      pts.push({ x, z, row: r });
    }
    if (r < R - 1) {
      // curva em U para fora da reta, até a próxima
      const cx = dir * ROW_X, cz = zr - dz / 2, rad = dz / 2;
      for (let i = 1; i < 24; i++) {
        const a = Math.PI / 2 - Math.PI * i / 24;   // de cima (+z) para baixo (-z), passando pelo lado de fora
        pts.push({ x: cx + dir * rad * Math.cos(a), z: cz + rad * Math.sin(a), row: r, turn: true });
      }
    }
  }
  // comprimento acumulado
  let s = 0;
  pts[0].s = 0;
  for (let i = 1; i < pts.length; i++) { s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z); pts[i].s = s; }
  return { pts, length: s };
}

function pointAt(path, s) {
  const P = path.pts;
  let lo = 0, hi = P.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P[m].s <= s) lo = m; else hi = m; }
  const a = P[lo], b = P[hi];
  const t = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, ang: Math.atan2(b.x - a.x, b.z - a.z), row: a.row, turn: !!(a.turn || b.turn) };
}

// Monta um rio: casas ao longo do caminho, pontes nas curvas em U e casas especiais sorteadas
// com semente fixa (o mesmo rio sempre igual).
export function buildRiver(index) {
  const def = RIVERS[index];
  const path = riverPath(def);
  const n = Math.floor((path.length - 0.04) / def.spacing) + 1;
  const sp = (path.length - 0.04) / (n - 1);
  const cells = [];
  for (let i = 0; i < n; i++) {
    const p = pointAt(path, 0.02 + i * sp);
    cells.push({ i, x: p.x, z: p.z, ang: p.ang, row: p.row, turn: p.turn, type: C.NORMAL });
  }
  cells[0].type = C.START;
  cells[n - 1].type = C.DOCK;
  // Pontes: em cada curva em U, da última casa reta antes da curva (menos uma) para a casa
  // equivalente depois da curva, atravessando a margem.
  const bridges = [];
  for (let r = 0; r < def.rows - 1; r++) {
    const before = cells.filter(c => c.row === r && !c.turn);
    const after = cells.filter(c => c.row === r + 1 && !c.turn);
    const a = before[before.length - 3];
    let best = null;
    for (const b of after.slice(0, 8)) {
      const d = Math.hypot(a.x - b.x, a.z - b.z) + Math.abs(a.x - b.x) * 2;
      if (!best || d < best.d) best = { b, d };
    }
    a.type = C.BRIDGE; a.bridgeTo = best.b.i;
    best.b.type = C.EXIT; best.b.bridgeFrom = a.i;
    bridges.push({ from: a.i, to: best.b.i });
  }
  // Casas especiais: longe da largada e do cais, nunca grudadas umas nas outras
  const r = rng(def.seed);
  const free = (i) => i > 3 && i < n - 3 && cells[i].type === C.NORMAL
    && cells[i - 1].type === C.NORMAL && cells[i + 1].type === C.NORMAL;
  const place = (type, count, ok = () => true) => {
    let tries = 0;
    while (count > 0 && tries++ < 4000) {
      const i = 4 + Math.floor(r() * (n - 7));
      if (!free(i) || !ok(i)) continue;
      cells[i].type = type;
      count--;
    }
  };
  // cachoeiras espalhadas: no máximo uma em cada sexto do rio
  const sixth = (i) => Math.floor(i / (n / def.counts.fall));
  const usedSix = new Set();
  place(C.FALL, def.counts.fall, (i) => !usedSix.has(sixth(i)) && !cells[i].turn && (usedSix.add(sixth(i)), true));
  place(C.CURRENT, def.counts.current, (i) => i + CURRENT_PUSH < n - 1);
  place(C.ROCK, def.counts.rock);
  for (const c of cells) {
    if (c.type === C.FALL) {
      // volta para o remanso: a última casa comum umas 5 casas para trás
      let j = Math.max(1, c.i - FALL_BACK);
      while (j > 1 && cells[j].type !== C.NORMAL) j--;
      c.backTo = j;
    }
  }
  return { index, def, cells, path, bridges, last: n - 1 };
}

// Tem 3 valores seguidos (2-3-4, 3-4-5 ou 4-5-6) entre os dados usados na vez?
export function hasSequence(kept) {
  const s = new Set(kept);
  for (let a = 2; a <= 4; a++) if (s.has(a) && s.has(a + 1) && s.has(a + 2)) return true;
  return false;
}

// Anda `steps` casas a partir de `from`, usando a ponte se tiver sequência, e aplica a casa onde
// parou (correnteza, cachoeira, pedra). Devolve a lista de passos para animar e o resultado.
// others: posições dos outros barcos (para a marola). Não muda nada: só calcula.
export function resolveMove(river, from, steps, kept, others = []) {
  const { cells, last } = river;
  const seq = hasSequence(kept);
  const ev = [];
  let pos = from, left = steps, usedBridge = false;
  const tryBridge = () => {
    if (seq && !usedBridge && cells[pos].bridgeTo != null) {
      usedBridge = true;
      ev.push({ type: 'bridge', from: pos, to: cells[pos].bridgeTo });
      pos = cells[pos].bridgeTo;
    }
  };
  if (steps > 0) tryBridge();
  while (left > 0 && pos < last) {
    pos++; left--;
    ev.push({ type: 'step', to: pos });
    tryBridge();
  }
  let finished = pos >= last;
  let over = finished ? left : 0;
  let stuck = false;
  // efeito da casa onde parou (em cadeia, no máximo 3)
  if (steps > 0) {
    for (let k = 0; k < 3 && !finished; k++) {
      const c = cells[pos];
      if (c.type === C.CURRENT) {
        const to = Math.min(last, pos + CURRENT_PUSH);
        ev.push({ type: 'current', from: pos, to });
        pos = to;
        if (pos >= last) { finished = true; over = 0; }
      } else if (c.type === C.FALL) {
        ev.push({ type: 'fall', from: pos, to: c.backTo });
        pos = c.backTo;
        break;
      } else if (c.type === C.ROCK) {
        ev.push({ type: 'rock', at: pos });
        stuck = true;
        break;
      } else break;
    }
  }
  const bumped = [];
  if (steps > 0 && !finished) others.forEach((o, k) => { if (o != null && o === pos && pos > 0) bumped.push(k); });
  return { pos, finished, over, stuck, events: ev, bumped, bridge: usedBridge };
}

// ---------- A corrida ----------
// pilots: [{ name, human }] na ordem de jogar (o jogador primeiro).
// Fases: 'throw' (vai jogar os dados da mão), 'choose' (escolher quais dados usar e se para ou
// joga de novo), 'over' (acabou). Depois de parar ou de dar redemoinho a vez passa sozinha.
export class Race {
  constructor(riverIndex, pilots, { maxRounds = 80 } = {}) {
    this.river = buildRiver(riverIndex);
    this.pilots = pilots;
    this.boats = pilots.map(() => ({ pos: 0, stuck: false, finished: false, over: 0, busts: 0, turns: 0, moved: 0 }));
    this.cur = 0;
    this.round = 0;
    this.maxRounds = maxRounds;
    this.phase = 'throw';
    this.places = null;
    this.log = [];
    this.startTurn();
  }

  get boat() { return this.boats[this.cur]; }
  get last() { return this.river.last; }

  startTurn() {
    const b = this.boat;
    this.turn = { hand: b.stuck ? 2 : N_DICE, marks: 0, M: 0, kept: [], lastThrow: null, ones: 0, usable: [], throws: 0, stuckStart: b.stuck };
    b.stuck = false;
    this.phase = 'throw';
  }

  // Resultado de um lance (os dados que estavam na mão). Devolve { bust, ones, usable }.
  throwResult(values) {
    if (this.phase !== 'throw') throw new Error('não é hora de jogar');
    const t = this.turn;
    if (values.length !== t.hand) throw new Error(`esperava ${t.hand} dados, veio ${values.length}`);
    t.throws++;
    t.lastThrow = values.slice();
    const ones = values.filter(v => v === 1).length;
    t.ones = ones;
    t.marks += ones;
    t.usable = values.map((v, i) => (v === 1 ? -1 : i)).filter(i => i >= 0);
    if (t.marks >= 2) {
      this.boat.busts++;
      this.lastResult = { bust: true, lost: t.M, boat: this.cur };
      this.log.push({ boat: this.cur, bust: true, lost: t.M });
      this.endTurn();
      return { bust: true, ones, usable: [] };
    }
    this.phase = 'choose';
    return { bust: false, ones, usable: t.usable.slice() };
  }

  // Quais índices do último lance podem ser escolhidos
  canChoose(indices) {
    const t = this.turn;
    if (this.phase !== 'choose') return false;
    if (new Set(indices).size !== indices.length) return false;
    if (!indices.every(i => t.usable.includes(i))) return false;
    return indices.length > 0 || t.usable.length === 0;
  }

  // Quanto anda e onde para se usar estes dados e parar agora (para a prévia na tela e para a IA)
  preview(indices) {
    const t = this.turn;
    const vals = indices.map(i => t.lastThrow[i]);
    const M = t.M + vals.reduce((a, b) => a + b, 0);
    return { M, kept: [...t.kept, ...vals], move: resolveMove(this.river, this.boat.pos, M, [...t.kept, ...vals], this.othersPos()) };
  }

  othersPos() { return this.boats.map((b, k) => (k === this.cur || b.finished ? null : b.pos)); }

  // Escolhe os dados e decide: 'stop' (anda) ou 'again' (joga de novo o resto).
  choose(indices, action) {
    if (!this.canChoose(indices)) throw new Error('escolha inválida');
    const t = this.turn;
    const vals = indices.map(i => t.lastThrow[i]);
    t.M += vals.reduce((a, b) => a + b, 0);
    t.kept.push(...vals);
    t.hand -= t.ones + indices.length;
    t.embalo = false;
    // Embalo: usou os 3 dados? Pode jogar os 3 de novo, mas o redemoinho já está girando
    // (conta como uma marca): qualquer 1 agora é redemoinho.
    if (t.hand <= 0) {
      if ((t.embalos || 0) >= RULES.maxEmbalo) return this.stop();
      t.embalos = (t.embalos || 0) + 1;
      t.hand = N_DICE; t.embalo = true; t.marks = Math.max(t.marks, 1);
    }
    if (action === 'stop') return this.stop();
    this.phase = 'throw';
    return null;
  }

  stop() {
    const t = this.turn, b = this.boat;
    const res = resolveMove(this.river, b.pos, t.M, t.kept, this.othersPos());
    const from = b.pos;
    b.pos = res.pos;
    b.moved += res.pos - from;
    if (res.stuck) b.stuck = true;
    if (res.finished) { b.finished = true; b.over = res.over; b.pos = this.last; b.finishRound = this.round; }
    for (const k of res.bumped) this.boats[k].pos = Math.max(0, this.boats[k].pos - BUMP_BACK);
    this.lastResult = { bust: false, boat: this.cur, from, ...res, M: t.M };
    this.log.push({ boat: this.cur, from, to: b.pos, M: t.M });
    this.endTurn();
    return res;
  }

  endTurn() {
    this.boat.turns++;
    this.cur++;
    if (this.cur >= this.boats.length) {
      this.cur = 0;
      this.round++;
      if (this.boats.some(b => b.finished) || this.round >= this.maxRounds) { this.finish(); return; }
    }
    // quem já chegou não joga mais (só acontece se a corrida durou até o fim da rodada)
    let guard = 0;
    while (this.boat.finished && guard++ < this.boats.length) {
      this.cur++;
      if (this.cur >= this.boats.length) { this.cur = 0; this.round++; this.finish(); return; }
    }
    this.startTurn();
  }

  // Colocação: quem chegou ao cais primeiro na rodada; empate no cais, quem sobrou mais casas;
  // os outros pela casa onde estão. Empate total: quem joga antes.
  finish() {
    const order = this.boats.map((b, k) => k);
    order.sort((a, b) => {
      const A = this.boats[a], B = this.boats[b];
      if (A.finished !== B.finished) return A.finished ? -1 : 1;
      if (A.finished) return (A.finishRound - B.finishRound) || (B.over - A.over) || (a - b);
      return (B.pos - A.pos) || (a - b);
    });
    this.places = order;          // places[0] = índice do vencedor
    this.phase = 'over';
  }

  placeOf(k) { return this.places ? this.places.indexOf(k) + 1 : null; }
}

// Probabilidade exata de cair no redemoinho jogando `hand` dados já tendo `marks` marcas.
export function bustChance(hand, marks) {
  const need = 2 - marks;
  let p = 0;
  // P(pelo menos `need` uns em `hand` dados)
  for (let k = need; k <= hand; k++) p += binom(hand, k) * (1 / 6) ** k * (5 / 6) ** (hand - k);
  return p;
}
function binom(n, k) { let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i; return r; }
