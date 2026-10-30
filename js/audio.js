// Sons sintetizados na hora (sem arquivos): dados chacoalhando e batendo na bandeja, água do rio,
// remadas, correnteza, cachoeira, redemoinho, ponte de madeira e festa na chegada.
// Só liga depois de um clique ou da entrada no VR (e nunca nos testes).
export class Sfx {
  constructor() { this.ctx = null; this.on = true; }

  unlock() {
    if (!this.ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.on ? 0.9 : 0;
      this.master.connect(this.ctx.destination);
      this.white = this.makeNoise(3, false);
      this.brown = this.makeNoise(3, true);
      this.river = this.loop(this.brown, 'bandpass', 520, 0.5);
      this.river.g.gain.value = 0.05;
      this.swirl = this.loop(this.white, 'bandpass', 700, 3);
      this.riverT = 0;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setOn(v) {
    this.on = v;
    if (this.master) this.master.gain.setTargetAtTime(v ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }

  makeNoise(sec, brown) {
    const c = this.ctx;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * sec), c.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { b = 0.98 * b + 0.02 * w; d[i] = b * 7; } else d[i] = w * 0.5;
    }
    return buf;
  }

  loop(buf, type, freq, q) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
    return { f, g };
  }

  tone(freq, dur, { type = 'sine', vol = 0.2, at = 0, slide = 0, attack = 0.004 } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur, { vol = 0.1, freq = 1200, q = 1, at = 0, type = 'bandpass', attack = 0, slide = 0 } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + at;
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.white;
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
    g.gain.setValueAtTime(attack ? 0.0001 : vol, t);
    if (attack) g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 2); src.stop(t + dur + 0.05);
  }

  // Rio correndo ao fundo, mudando devagar
  update(dt, swirl = 0) {
    if (!this.ctx) return;
    this.riverT -= dt;
    const t = this.ctx.currentTime;
    if (this.riverT <= 0) {
      this.riverT = 0.8 + Math.random() * 1.5;
      this.river.g.gain.setTargetAtTime(0.035 + Math.random() * 0.03, t, 0.8);
      this.river.f.frequency.setTargetAtTime(420 + Math.random() * 260, t, 1);
    }
    this.swirl.g.gain.setTargetAtTime(swirl * 0.09, t, 0.2);
    this.swirl.f.frequency.setTargetAtTime(500 + swirl * 500 + Math.sin(t * 6) * 120 * swirl, t, 0.05);
  }

  // Dados chacoalhando na mão: cliques de osso com a força do chacoalho (0..1)
  rattle(v) {
    if (!this.ctx || v < 0.05) return;
    const n = 1 + Math.floor(v * 3);
    for (let i = 0; i < n; i++) {
      const at = Math.random() * 0.03;
      this.noise(0.018, { vol: 0.05 + 0.1 * v, freq: 3200 + Math.random() * 2400, q: 4, at });
      this.tone(1800 + Math.random() * 900, 0.02, { vol: 0.03 * v, type: 'triangle', at });
    }
  }
  // Dado batendo: no feltro (abafado), na parede de madeira (seco) ou em outro dado (estalo)
  diceHit(kind, v) {
    if (!this.ctx) return;
    const s = Math.min(1, v / 1.5);
    if (kind === 'floor') { this.noise(0.04, { vol: 0.12 * s, freq: 900, q: 1.2 }); this.tone(260, 0.05, { vol: 0.08 * s, slide: 0.7 }); }
    else if (kind === 'wall') { this.noise(0.03, { vol: 0.16 * s, freq: 1700, q: 2 }); this.tone(520 + Math.random() * 80, 0.06, { vol: 0.1 * s, type: 'triangle', slide: 0.8 }); }
    else { this.noise(0.02, { vol: 0.14 * s, freq: 4200, q: 3 }); this.tone(2400 + Math.random() * 500, 0.03, { vol: 0.06 * s, type: 'triangle' }); }
  }
  grab() { this.tone(330, 0.07, { vol: 0.08, type: 'triangle', slide: 1.3 }); }
  click() { this.tone(660, 0.05, { vol: 0.07, type: 'square' }); }
  select(on) { this.tone(on ? 880 : 520, 0.07, { vol: 0.08, type: 'triangle' }); }
  // Um 1 saiu: o redemoinho começa a girar
  mark() { this.noise(0.9, { vol: 0.12, freq: 500, q: 2.5, attack: 0.2, slide: 2.2 }); this.tone(196, 0.6, { vol: 0.05, slide: 0.8, attack: 0.1 }); }
  // Redemoinho: tudo some girando
  bust() {
    this.noise(1.6, { vol: 0.22, freq: 1400, q: 3, attack: 0.1, slide: 0.25 });
    this.tone(330, 1.4, { vol: 0.08, type: 'sawtooth', slide: 0.3, attack: 0.05 });
    this.tone(415, 1.2, { vol: 0.05, type: 'sawtooth', slide: 0.3, attack: 0.05 });
  }
  paddle() { this.noise(0.12, { vol: 0.07, freq: 700 + Math.random() * 300, q: 1.4, type: 'bandpass', attack: 0.02 }); this.tone(380 + Math.random() * 60, 0.05, { vol: 0.03 }); }
  current() { this.noise(0.8, { vol: 0.14, freq: 600, q: 0.9, attack: 0.15, slide: 2.5 }); }
  fall() { this.noise(1.2, { vol: 0.25, freq: 2400, q: 0.6, type: 'lowpass', attack: 0.05, slide: 0.2 }); this.tone(500, 0.6, { vol: 0.06, slide: 0.35 }); }
  bridge() { for (let i = 0; i < 6; i++) this.tone(180 + (i % 2) * 40, 0.07, { vol: 0.09, type: 'triangle', at: i * 0.09 }); }
  rock() { this.noise(0.15, { vol: 0.2, freq: 300, q: 1, type: 'lowpass' }); this.tone(110, 0.25, { vol: 0.15, slide: 0.6 }); }
  bump() { this.noise(0.3, { vol: 0.1, freq: 800, q: 1 }); this.tone(240, 0.12, { vol: 0.06, slide: 1.3 }); }
  embalo() { [523, 659, 784].forEach((f, i) => this.tone(f, 0.16, { vol: 0.07, type: 'triangle', at: i * 0.07 })); }
  fanfare(win) {
    const notes = win ? [523, 659, 784, 1047, 784, 1047] : [392, 494, 587, 523];
    notes.forEach((f, i) => { this.tone(f, 0.28, { vol: 0.1, type: 'triangle', at: i * 0.13 }); this.tone(f / 2, 0.28, { vol: 0.05, at: i * 0.13 }); });
  }
  turnChime() { this.tone(988, 0.2, { vol: 0.05 }); this.tone(1319, 0.3, { vol: 0.04, at: 0.08 }); }
}
