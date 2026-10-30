// Navegador de mentira para o teste de fumaça do main.js no Node: documento, canvas 2D que não
// desenha nada, localStorage em memória e nenhum som (sem AudioContext) e nenhum WebXR.
export function installFakeDom() {
  const ctx2d = new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return (s) => ({ width: String(s).length * 10 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  const el = (tag = 'div') => ({
    tagName: tag.toUpperCase(), style: {}, dataset: {}, width: 300, height: 150, textContent: '', innerHTML: '', disabled: false,
    getContext: () => ctx2d, addEventListener() {}, removeEventListener() {}, appendChild() {}, setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
  });
  const els = new Map();
  globalThis.document = {
    createElement: (tag) => el(tag),
    createElementNS: (ns, tag) => el(tag),
    getElementById: (id) => { if (!els.has(id)) els.set(id, el()); return els.get(id); },
    addEventListener() {}, body: el('body'),
  };
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  Object.assign(globalThis, { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, isSecureContext: false });
  globalThis.window = globalThis;
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  globalThis.__DADOSVR_HEADLESS__ = true;
  return { els, store };
}
