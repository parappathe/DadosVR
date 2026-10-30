// Progresso e opções, salvos no navegador.
const KEY = 'dadosvr.v1';
const DEFAULTS = {
  best: [0, 0, 0],      // melhor colocação em cada rio (0 = nunca correu)
  wins: [0, 0, 0],      // vitórias em cada rio
  races: [0, 0, 0],     // corridas em cada rio
  sound: true,
  fps: false,
  fast: false,          // computador joga mais rápido
};

export function loadSave() {
  const fresh = () => ({ ...DEFAULTS, best: [0, 0, 0], wins: [0, 0, 0], races: [0, 0, 0] });
  try {
    const s = { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    for (const k of ['best', 'wins', 'races']) if (!Array.isArray(s[k]) || s[k].length !== 3) s[k] = [0, 0, 0];
    return s;
  } catch { return fresh(); }
}

export function storeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sem armazenamento: segue sem salvar */ }
}

// Rio liberado: o primeiro sempre; os outros quando chegou em 1º ou 2º no anterior.
export const riverUnlocked = (s, i) => i === 0 || (s.best[i - 1] >= 1 && s.best[i - 1] <= 2);
