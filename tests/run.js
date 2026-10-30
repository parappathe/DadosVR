// Testes automáticos: node tests/run.js (ou npm test). Não tocam som nem abrem navegador.
import { RIVERS, C, buildRiver, hasSequence, resolveMove, Race, rng, bustChance, CURRENT_PUSH, RULES } from '../js/rules.js';
import { DIE, TRAY, DT, makeDie, stepDice, topFace, randomToss, settle, orientationFor, randomQuat } from '../js/dice.js';
import { PILOTS, ROBOT, decide, playTurnInstant } from '../js/ai.js';

let fails = 0, count = 0;
function ok(cond, msg) {
  count++;
  if (!cond) { fails++; console.log('  FALHOU:', msg); }
}
const t0 = Date.now();

console.log('Rios');
for (let ri = 0; ri < RIVERS.length; ri++) {
  const r = buildRiver(ri);
  const n = r.cells.length;
  const kinds = {};
  r.cells.forEach(c => { kinds[c.type] = (kinds[c.type] || 0) + 1; });
  console.log(`  ${RIVERS[ri].name}: ${n} casas, ${kinds[C.CURRENT] || 0} correntezas, ${kinds[C.FALL] || 0} cachoeiras, ${kinds[C.ROCK] || 0} pedras, ${r.bridges.length} pontes`);
  ok(n >= 70 && n <= 110, `${RIVERS[ri].name}: tamanho bom (${n})`);
  ok(r.cells[0].type === C.START && r.cells[n - 1].type === C.DOCK, 'largada e cais nas pontas');
  ok(r.bridges.length === RIVERS[ri].rows - 1, 'uma ponte em cada curva');
  for (const b of r.bridges) {
    const a = r.cells[b.from], c = r.cells[b.to];
    ok(b.to - b.from >= 7, `ponte corta pelo menos 7 casas (${b.from}→${b.to})`);
    ok(Math.hypot(a.x - c.x, a.z - c.z) < 0.28, 'ponte curta no tabuleiro');
  }
  ok((kinds[C.CURRENT] || 0) === RIVERS[ri].counts.current && (kinds[C.FALL] || 0) === RIVERS[ri].counts.fall && (kinds[C.ROCK] || 0) === RIVERS[ri].counts.rock, 'todas as casas especiais couberam');
  let adj = 0, badCur = 0, badFall = 0;
  for (let i = 1; i < n - 1; i++) {
    const t = r.cells[i].type;
    if ([C.CURRENT, C.FALL, C.ROCK].includes(t) && [C.CURRENT, C.FALL, C.ROCK].includes(r.cells[i + 1].type)) adj++;
    if (t === C.CURRENT && i + CURRENT_PUSH >= n - 1) badCur++;
    if (t === C.FALL && !(r.cells[i].backTo < i && r.cells[r.cells[i].backTo].type === C.NORMAL)) badFall++;
  }
  ok(!adj && !badCur && !badFall, 'casas especiais separadas, correnteza não joga no cais, cachoeira volta para casa comum');
  for (let i = 1; i < n; i++) ok(Math.hypot(r.cells[i].x - r.cells[i - 1].x, r.cells[i].z - r.cells[i - 1].z) > 0.03, `casas ${i - 1} e ${i} não se encostam`);
  ok(r.cells.every(c => Math.abs(c.x) < 0.53 && Math.abs(c.z) < 0.33), 'rio cabe no tabuleiro');
}

console.log('Movimento');
{
  const r = buildRiver(0);
  ok(hasSequence([2, 3, 4]) && hasSequence([6, 4, 5, 2]) && !hasSequence([2, 3, 5]) && !hasSequence([3, 4]), 'sequência de 3');
  const normalRun = (from, len) => { for (let i = from + 1; i <= from + len; i++) if (r.cells[i].type !== C.NORMAL) return false; return true; };
  let s = 1; while (!normalRun(s, 4)) s++;
  let m = resolveMove(r, s, 4, [4]);
  ok(m.pos === s + 4 && m.events.filter(e => e.type === 'step').length === 4, 'anda casa por casa');
  const cur = r.cells.find(c => c.type === C.CURRENT);
  m = resolveMove(r, cur.i - 3, 3, [3]);
  ok(m.events.some(e => e.type === 'current') && m.pos >= cur.i + CURRENT_PUSH - 0, `correnteza empurra 3 (${cur.i} → ${m.pos})`);
  const fall = r.cells.find(c => c.type === C.FALL);
  m = resolveMove(r, fall.i - 2, 2, [2]);
  ok(m.pos === fall.backTo && m.events.some(e => e.type === 'fall'), `cachoeira volta para o remanso (${fall.i} → ${m.pos})`);
  m = resolveMove(r, fall.i - 3, 2, [2]);
  ok(!m.events.some(e => e.type === 'fall'), 'só passar pela cachoeira não faz nada');
  const br = r.bridges[0];
  m = resolveMove(r, br.from - 2, 9, [2, 3, 4]);
  ok(m.bridge && m.events[2].type === 'bridge' && m.pos >= br.to + 7, `com sequência atravessa a ponte (${br.from - 2} + 9 → ${m.pos})`);
  const m2 = resolveMove(r, br.from - 2, 9, [5, 4]);
  ok(!m2.bridge && m2.pos < m.pos, 'sem sequência dá a volta');
  m = resolveMove(r, br.from, 0, [2, 3, 4]);
  ok(!m.bridge && m.pos === br.from, 'sem andar não atravessa');
  m = resolveMove(r, r.last - 3, 8, [5, 3]);
  ok(m.finished && m.over === 5, 'chega ao cais e sobra 5');
  const rr = buildRiver(1);
  const rock = rr.cells.find(c => c.type === C.ROCK);
  m = resolveMove(rr, rock.i - 4, 4, [4]);
  ok(m.stuck && m.pos === rock.i, 'parou na pedra: encalha');
  m = resolveMove(r, s, 4, [4], [null, s + 4, s + 2]);
  ok(m.bumped.length === 1 && m.bumped[0] === 1, 'parou em cima de outro barco: marola');
}

console.log('A vez (redemoinho, embalo, pedra, rodada)');
{
  const P = [{ name: 'a' }, { name: 'b' }];
  let race = new Race(0, P);
  let res = race.throwResult([1, 1, 5]);
  ok(res.bust && race.cur === 1 && race.boats[0].pos === 0 && race.boats[0].busts === 1, 'dois 1 no mesmo lance: redemoinho e passa a vez');
  race = new Race(0, P);
  res = race.throwResult([1, 4, 5]);
  ok(!res.bust && race.turn.marks === 1 && res.usable.join() === '1,2', 'um 1: marca e sobra 4 e 5');
  let threw = false; try { race.choose([0], 'stop'); } catch { threw = true; }
  ok(threw, 'não dá para usar o 1');
  threw = false; try { race.choose([], 'stop'); } catch { threw = true; }
  ok(threw, 'tem que usar pelo menos um dado');
  race.choose([2], 'again');
  ok(race.turn.hand === 1 && race.turn.M === 5 && race.phase === 'throw', 'usou o 5 e joga o 4 de novo');
  res = race.throwResult([1]);
  ok(res.bust && race.lastResult.lost === 5 && race.boats[0].pos === 0, 'segundo 1 na mesma vez: perdeu as 5 casas');
  // embalo
  race = new Race(0, P);
  race.throwResult([3, 4, 6]);
  race.choose([0, 1, 2], 'again');
  ok(race.turn.hand === 3 && race.turn.marks === 1 && race.turn.embalo && race.turn.M === 13, 'embalo: os 3 de novo, redemoinho girando');
  race.throwResult([2, 5, 6]);
  const before = race.cur;
  const r2 = race.choose([0, 1, 2], 'again');
  ok(r2 && race.cur !== before && race.boats[0].moved === r2.pos, `segundo embalo não existe: para sozinho (${race.lastResult.M} casas)`);
  ok(RULES.maxEmbalo === 1, 'um embalo por vez');
  race = new Race(0, P);
  race.throwResult([3, 4, 6]);
  race.choose([0, 1, 2], 'again');
  res = race.throwResult([1, 5, 6]);
  ok(res.bust && race.lastResult.lost === 13, 'no embalo qualquer 1 derruba');
  // pedra
  race = new Race(1, P);
  const rock = race.river.cells.find(c => c.type === C.ROCK);
  race.boats[0].pos = rock.i - 4;
  race.throwResult([4, 6, 6]);
  race.choose([0], 'stop');
  ok(race.boats[0].stuck, 'encalhou');
  playTurnInstant(race, ROBOT, rng(1));
  ok(race.cur === 0 && race.turn.hand === 2 && !race.boats[0].stuck, 'encalhado começa a vez seguinte com 2 dados');
  // rodada até o fim e colocação
  race = new Race(0, [{ name: 'a' }, { name: 'b' }, { name: 'c' }]);
  race.boats[0].pos = race.last - 2;
  race.boats[2].pos = race.last - 1;
  race.throwResult([3, 4, 6]);
  race.choose([0], 'stop');
  ok(race.boats[0].finished && race.phase !== 'over' && race.cur === 1, 'chegou ao cais: os outros ainda jogam a rodada');
  race.throwResult([1, 1, 2]);
  race.throwResult([2, 6, 6]);
  race.choose([1, 2], 'stop');
  ok(race.phase === 'over' && race.places[0] === 2 && race.places[1] === 0 && race.places[2] === 1, `quem sobrou mais casas no cais ganha (${race.places})`);
  ok(Math.abs(bustChance(3, 0) - 16 / 216) < 1e-9 && Math.abs(bustChance(3, 1) - (1 - 125 / 216)) < 1e-9 && Math.abs(bustChance(1, 1) - 1 / 6) < 1e-9 && bustChance(1, 0) === 0, 'chance de redemoinho certa');
}

console.log('Física dos dados');
{
  // dado parado numa face fica parado
  const d = makeDie(0, [0, DIE / 2 + 0.0005, 0], orientationFor(4, 0.3));
  for (let i = 0; i < 360; i++) stepDice([d], DT);
  ok(d.asleep && Math.abs(d.p[0]) < 1e-3 && Math.abs(d.p[2]) < 1e-3 && topFace(d).v === 4, 'dado deitado fica quieto e com a mesma face');
  for (let v = 1; v <= 6; v++) ok(topFace(makeDie(0, [0, 0, 0], orientationFor(v, v))).v === v, `orientação para a face ${v}`);
  // quique: cada batida no chão sobe menos
  const b = makeDie(0, [0, 0.2, 0], randomQuat(rng(4)));
  let peaks = [], up = false, lastY = b.p[1];
  for (let i = 0; i < 2000; i++) { stepDice([b], DT); if (b.v[1] > 0) up = true; else if (up) { peaks.push(lastY); up = false; } lastY = b.p[1]; }
  ok(peaks.length >= 1 && peaks.every((p, i) => i === 0 || p <= peaks[i - 1] + 1e-4) && peaks[0] < 0.2, `quica cada vez mais baixo (${peaks.slice(0, 3).map(p => (p * 100).toFixed(1)).join(', ')} cm)`);
  // justiça: muitos lançamentos de 3 dados
  const r = rng(2026);
  const cnt = [0, 0, 0, 0, 0, 0, 0];
  let maxT = 0, sumT = 0, outside = 0, forced = 0;
  const N = 1500;
  for (let k = 0; k < N; k++) {
    const ds = randomToss(3, r);
    const res = settle(ds, 10);
    maxT = Math.max(maxT, res.time); sumT += res.time;
    for (const x of ds) {
      if (Math.abs(x.p[0]) > TRAY.w / 2 || Math.abs(x.p[2]) > TRAY.d / 2 || x.p[1] < DIE / 2 - 0.002) outside++;
      if (x.forced) forced++;
    }
    res.values.forEach(v => cnt[v]++);
  }
  const total = N * 3, e = total / 6;
  const chi = cnt.slice(1).reduce((a, c) => a + (c - e) ** 2 / e, 0);
  console.log(`  ${total} faces: ${cnt.slice(1).map((c, i) => `${i + 1}: ${(c / total * 100).toFixed(1)}%`).join('  ')}  (qui² ${chi.toFixed(1)}), tempo médio ${(sumT / N).toFixed(2)} s, máx ${maxT.toFixed(1)} s, tortos ${forced}`);
  ok(chi < 20.5, `faces equilibradas (qui² ${chi.toFixed(1)} < 20,5)`);
  ok(cnt.slice(1).every(c => Math.abs(c / total - 1 / 6) < 0.025), 'cada face perto de 1/6');
  ok(outside === 0, 'nenhum dado sai da bandeja');
  ok(maxT <= 8.01 && sumT / N > 0.3 && sumT / N < 4, 'todos param a tempo');
  ok(forced < total * 0.005, `dado torto é raro (${forced})`);
}

console.log('Pilotos do computador');
{
  // foge da cachoeira: pode parar em cima dela com o 5, na frente com o 6
  const race = new Race(0, [{ name: 'a' }, { name: 'b' }]);
  const fall = race.river.cells.find(c => c.type === C.FALL && race.river.cells[c.i + 1].type === C.NORMAL);
  race.boats[0].pos = fall.i - 5;
  race.throwResult([1, 5, 6]);
  for (const p of [ROBOT, ...PILOTS]) {
    const d = decide(race, p, rng(3));
    const pv = race.preview(d.indices);
    ok(!(d.action === 'stop' && pv.move.events.some(e => e.type === 'fall')), `${p.name} não para na cachoeira`);
  }
  // perto do cais: para quando chega
  const r2 = new Race(0, [{ name: 'a' }, { name: 'b' }]);
  r2.boats[0].pos = r2.last - 6;
  r2.throwResult([2, 4, 6]);
  for (const p of [ROBOT, ...PILOTS]) {
    const d = decide(r2, p, rng(3));
    ok(d.action === 'stop' && r2.preview(d.indices).move.finished, `${p.name} para quando dá para chegar ao cais`);
  }
  // risco: cada um tem o seu jeito
  const stats = [ROBOT, ...PILOTS].map(p => {
    const r = rng(77);
    let busts = 0, gain = 0, turns = 0, ms = 0;
    for (let k = 0; k < 600; k++) {
      const race = new Race(k % 3, [{ name: 'a' }, { name: 'b' }]);
      race.boats[0].pos = Math.floor(r() * (race.last - 30));
      const from = race.boats[0].pos;
      const t1 = performance.now();
      playTurnInstant(race, p, r);
      ms = Math.max(ms, performance.now() - t1);
      turns++;
      if (race.boats[0].busts) busts++; else gain += race.boats[0].pos - from;
    }
    return { name: p.name, bust: busts / turns, gain: gain / turns, ms };
  });
  stats.forEach(s => console.log(`  ${s.name.padEnd(14)} redemoinho ${(s.bust * 100).toFixed(0)}%  avanço médio ${s.gain.toFixed(1)} casas/vez  (vez mais lenta: ${s.ms.toFixed(0)} ms)`));
  const [robo, lia, bento, faisca] = stats;
  ok(lia.bust < bento.bust && lia.bust < faisca.bust, 'Dona Lia cai menos no redemoinho');
  ok(faisca.bust > lia.bust + 0.1, 'Capitã Faísca arrisca bem mais');
  ok(robo.gain >= lia.gain && robo.gain >= faisca.gain - 0.3, 'o robô (só a conta) anda mais por vez que a cautelosa e não menos que a arrojada');
  ok(stats.every(s => s.ms < 400), 'ninguém demora para decidir');
}

console.log('Robô corre os 3 rios');
for (let ri = 0; ri < RIVERS.length; ri++) {
  const r = rng(500 + ri);
  const wins = [0, 0, 0, 0];
  let rounds = 0, done = 0, robotFinished = 0;
  const N = 30;
  for (let k = 0; k < N; k++) {
    const race = new Race(ri, [ROBOT, ...PILOTS].map(p => ({ name: p.name })));
    let guard = 0;
    while (race.phase !== 'over' && guard++ < 5000) {
      const pl = race.cur === 0 ? ROBOT : PILOTS[race.cur - 1];
      playTurnInstant(race, pl, r);
    }
    if (race.phase === 'over' && race.boats.some(b => b.finished)) done++;
    if (race.boats[0].finished) robotFinished++;
    wins[race.places[0]]++;
    rounds += race.round;
  }
  console.log(`  ${RIVERS[ri].name.padEnd(18)} ${N} corridas em ${(rounds / N).toFixed(1)} rodadas · vitórias: robô ${wins[0]}, Lia ${wins[1]}, Bento ${wins[2]}, Faísca ${wins[3]} · robô chegou ao cais ${robotFinished}x`);
  ok(done === N, `${RIVERS[ri].name}: toda corrida termina com alguém no cais`);
  ok(rounds / N >= 3 && rounds / N <= 9, `${RIVERS[ri].name}: corrida de tamanho bom (${(rounds / N).toFixed(1)} rodadas)`);
  ok(wins.every(w => w < N * 0.75), 'ninguém ganha sempre');
}

console.log('Teste de fumaça do jogo (main.js num navegador de mentira)');
{
  const { installFakeDom } = await import('./fakedom.js');
  const fake = installFakeDom();
  const errors = [];
  const origErr = console.error;
  console.error = (...a) => errors.push(a.join(' '));
  try {
    await import('../js/main.js');
    const dev = globalThis.dev;
    ok(dev && dev.state().tela === 'menu' && dev.state().menu, 'abre no menu');
    dev.autoplay = true;
    for (let ri = 1; ri <= 3; ri++) {
      dev.loadLevel(ri);
      let st = dev.state(), secs = 0;
      const seen = new Set();
      while (st.fase !== 'over' && secs < 2400) { st = dev.advance(0.5); secs += 0.5; seen.add(st.fase); }
      ok(!!st.colocacao && st.fase === 'over', `rio ${ri}: o robô joga a corrida inteira com dados de física (${secs} s de jogo, ${st.rodada} rodadas)`);
      ok(['ready', 'rolling', 'choose', 'moving'].every(f => seen.has(f)), `rio ${ri}: passa por jogar, rolar, escolher e remar`);
      if (st.colocacao) console.log(`  rio ${ri}: ${st.colocacao.join(', ')} em ${secs} s de jogo`);
      ok(st.barcos.every(b => b.casa === b.mostrada), `rio ${ri}: barcos na tela batem com as regras`);
    }
    const saved = JSON.parse(fake.store.get('dadosvr.v1') || '{}');
    ok(saved.races && saved.races.every(n => n === 1), 'progresso salvo das 3 corridas');
    // jogador humano: jogar com Espaço e escolher pelo dev (sem robô)
    dev.autoplay = false;
    dev.loadLevel(1);
    dev.advance(3);
    ok(dev.state().fase === 'ready' && dev.state().vez === 'você', 'vez do jogador espera o lançamento');
    dev.advance(5);
    ok(dev.state().fase === 'ready', 'sem jogar, a vez não passa sozinha');
  } catch (e) {
    ok(false, `main.js rodou sem erro (${e.stack || e})`);
  }
  console.error = origErr;
  ok(errors.length === 0, `sem erros no console (${errors.slice(0, 2).join(' | ')})`);
}

console.log(fails ? `\n${fails} de ${count} verificações falharam (${((Date.now() - t0) / 1000).toFixed(1)} s)` : `\nTudo certo (${count} verificações, ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(fails ? 1 : 0);
