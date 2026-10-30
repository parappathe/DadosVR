// Pilotos do computador: escolhem quais dados usar e se param ou arriscam de novo.
// Fazem a conta da esperança (quanto se espera andar) olhando alguns lances à frente, e cada um
// tem o seu jeito de encarar o risco. Sem navegador: os testes rodam no Node.
import { resolveMove, hasSequence, N_DICE, C, RULES } from './rules.js';

export const PILOTS = [
  {
    name: 'Dona Lia', title: 'Cautelosa', color: '#4fbf6a',
    desc: 'Rema devagar e sempre: para cedo e foge do redemoinho.',
    bias: 3.0, depth: 1, stopAtMark: 5, minGo: 0, noise: 0.4,
  },
  {
    name: 'Seu Bento', title: 'Calculista', color: '#4f8fe0',
    desc: 'Faz a conta de cabeça: arrisca só quando vale a pena.',
    bias: 0.6, depth: 2, stopAtMark: 0, minGo: 0, noise: 0.15,
  },
  {
    name: 'Capitã Faísca', title: 'Arrojada', color: '#b468e0',
    desc: 'Nunca para com pouco: ou voa no rio ou roda no redemoinho.',
    bias: -3.5, depth: 2, stopAtMark: 0, minGo: 14, noise: 0.4,
  },
];
// O robô que joga por você no modo automático e nos testes: só a conta, sem medo nem pressa.
export const ROBOT = { name: 'Robô', title: 'Robô', bias: 0, depth: 2, stopAtMark: 0, minGo: 0, noise: 0 };

// Todas as jogadas de n dados agrupadas (ex.: {1,1,4} com a chance dela) para fazer a conta rápido.
const OUTCOMES = [null, [], [], []];
for (let n = 1; n <= 3; n++) {
  const map = new Map();
  const rec = (arr) => {
    if (arr.length === n) {
      const key = arr.slice().sort().join('');
      const e = map.get(key);
      if (e) e.p += 1 / 6 ** n; else map.set(key, { vals: arr.slice().sort(), p: 1 / 6 ** n });
      return;
    }
    for (let v = 1; v <= 6; v++) rec([...arr, v]);
  };
  rec([]);
  OUTCOMES[n] = [...map.values()];
}

// Subconjuntos não vazios de índices
function subsets(idx) {
  const out = [];
  for (let m = 1; m < 1 << idx.length; m++) out.push(idx.filter((_, k) => m & (1 << k)));
  return out;
}

// Calculadora de valor para uma vez: sabe onde o barco está e quanto vale parar em cada casa.
function makeEval(race, pilot) {
  const river = race.river, last = river.last;
  const b = race.boat, from = b.pos;
  const others = race.othersPos();
  const leader = Math.max(...race.boats.map((o, k) => (k === race.cur ? -1 : o.pos)));
  // atrás do líder: arrisca mais; na frente: um pouco menos
  const gap = leader - from;
  const bias = pilot.bias + (gap > 10 ? -1.5 : gap < -8 ? 0.8 : 0);
  const landMemo = new Map();
  function land(M, kept) {
    const seq = hasSequence(kept);
    const key = M * 2 + (seq ? 1 : 0);
    let v = landMemo.get(key);
    if (v !== undefined) return v;
    const r = resolveMove(river, from, M, kept, others);
    if (r.finished) v = last + 4 + r.over * 0.2;
    else {
      v = r.pos;
      if (r.stuck) v -= 3;
      v += r.bumped.length * 0.6;
      // parar na entrada da ponte sem usar: na próxima vez pode atravessar
      if (river.cells[r.pos].type === C.BRIDGE) v += 1.0;
      // casa de onde uma cachoeira de perto pode puxar não importa: só a casa onde parou
    }
    landMemo.set(key, v);
    return v;
  }
  const base = from;
  const finishedAt = (M) => from + M >= last;
  const memo = new Map();
  // Valor de jogar `hand` dados agora (antes de ver), com o que já se tem.
  function throwValue(M, hand, marks, kept, depth, emb) {
    let mask = 0;
    for (const x of kept) mask |= 1 << x;
    const key = `${M}|${hand}|${marks}|${depth}|${mask}|${emb}`;
    let v = memo.get(key);
    if (v !== undefined) return v;
    v = 0;
    for (const o of OUTCOMES[hand]) {
      const ones = o.vals.filter(x => x === 1).length;
      if (marks + ones >= 2) { v += o.p * base; continue; }
      v += o.p * bestAfter(o.vals, M, hand, marks + ones, kept, depth, emb).value;
    }
    memo.set(key, v);
    return v;
  }
  // Melhor escolha depois de ver um lance: { value, idx, action }
  function bestAfter(vals, M, hand, marks, kept, depth, emb) {
    const usable = vals.map((x, i) => (x === 1 ? -1 : i)).filter(i => i >= 0);
    const ones = vals.length - usable.length;
    const opts = usable.length ? subsets(usable) : [[]];
    let best = null;
    // cortar escolhas repetidas (dados com o mesmo valor)
    const seen = new Set();
    for (const idx of opts) {
      const pick = idx.map(i => vals[i]).sort();
      const sk = pick.join('');
      if (seen.has(sk)) continue;
      seen.add(sk);
      const M2 = M + pick.reduce((a, c) => a + c, 0);
      const kept2 = [...kept, ...pick];
      let hand2 = hand - ones - idx.length, marks2 = marks, emb2 = emb;
      const canGo = hand2 > 0 || emb < RULES.maxEmbalo;
      if (hand2 <= 0) { hand2 = N_DICE; marks2 = Math.max(1, marks); emb2 = emb + 1; }
      const stop = land(M2, kept2);
      let go = -Infinity;
      if (depth > 0 && canGo && !finishedAt(M2)) go = throwValue(M2, hand2, marks2, kept2, depth - 1, emb2);
      // personalidade: quem é cauteloso enxerga mais valor em parar
      // chegar ao cais é certo: aí não tem jeito de arriscar
      let stopAdj = stop + (finishedAt(M2) ? 5 : bias);
      if (pilot.stopAtMark && marks >= 1 && M2 >= pilot.stopAtMark) stopAdj += 50;
      if (pilot.minGo && M2 < pilot.minGo && !finishedAt(M2)) stopAdj -= 50;
      const action = stopAdj >= go ? 'stop' : 'again';
      const value = Math.max(stop, go === -Infinity ? stop : go);
      const score = Math.max(stopAdj, go);
      if (!best || score > best.score) best = { score, value, idx, action, close: Math.abs(stopAdj - go) < 1.5 };
    }
    return best;
  }
  return { bestAfter, throwValue, land };
}

// Decide depois de um lance da corrida. Devolve { indices, action }.
export function decide(race, pilot, random = Math.random) {
  const t = race.turn;
  const ev = makeEval(race, pilot);
  const vals = t.lastThrow;
  // bestAfter calcula com a mão do lance (os uns já contados nas marcas)
  const best = ev.bestAfter(vals, t.M, vals.length, t.marks, t.kept, pilot.depth, t.embalos || 0);
  let idx = best.idx, action = best.action;
  // um pouco de humanidade: às vezes muda de ideia numa decisão apertada
  if (best.close && pilot.noise && random() < pilot.noise) action = action === 'stop' ? 'again' : 'stop';
  if (!race.canChoose(idx)) idx = t.usable.length ? [t.usable[0]] : [];
  return { indices: idx, action };
}

// Joga uma vez inteira na hora (dados sorteados, sem física). Para testes e simulações.
export function playTurnInstant(race, pilot, random) {
  const who = race.cur;
  for (let guard = 0; guard < 40 && race.cur === who && race.phase !== 'over'; guard++) {
    if (race.phase === 'throw') {
      const vals = Array.from({ length: race.turn.hand }, () => 1 + Math.floor(random() * 6));
      race.throwResult(vals);
    } else if (race.phase === 'choose') {
      const d = decide(race, pilot, random);
      race.choose(d.indices, d.action);
    }
  }
}
