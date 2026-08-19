const FILES = {
  move: 'assets/sounds/move.wav',
  capture: 'assets/sounds/capture.wav',
  select: 'assets/sounds/select.wav',
  click: 'assets/sounds/click.wav',
  check: 'assets/sounds/check.wav',
  checkmate: 'assets/sounds/checkmate.wav',
  castle: 'assets/sounds/castle.wav',
  promote: 'assets/sounds/promote.wav',
  undo: 'assets/sounds/undo.wav',
  newgame: 'assets/sounds/newgame.wav',
  stalemate: 'assets/sounds/stalemate.wav',
};

const GAIN = {
  move: 0.72,
  capture: 0.82,
  select: 0.45,
  click: 0.4,
  check: 0.55,
  checkmate: 0.78,
  castle: 0.7,
  promote: 0.62,
  undo: 0.55,
  newgame: 0.68,
  stalemate: 0.6,
};

let ctx = null;
const buffers = new Map();
let unlocked = false;
let loadPromise = null;

function getCtx() {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export function unlock() {
  const c = getCtx();
  if (c.state === 'suspended') c.resume();
  unlocked = true;
}

export function load() {
  if (loadPromise) return loadPromise;
  const c = getCtx();
  loadPromise = Promise.all(
    Object.entries(FILES).map(async ([name, url]) => {
      const res = await fetch(url);
      const raw = await res.arrayBuffer();
      const buf = await c.decodeAudioData(raw.slice(0));
      buffers.set(name, buf);
    }),
  );
  return loadPromise;
}

export function play(name, delay = 0) {
  unlocked = true;
  const c = getCtx();
  const start = () => {
    const buf = buffers.get(name);
    if (!buf) return false;
    const src = c.createBufferSource();
    const gain = c.createGain();
    src.buffer = buf;
    gain.gain.value = GAIN[name] ?? 0.7;
    src.connect(gain);
    gain.connect(c.destination);
    src.start(c.currentTime + Math.max(0, delay));
    return true;
  };
  const go = () => {
    if (start()) return;
    load().then(start);
  };
  if (c.state === 'suspended') c.resume().then(go);
  else go();
}

export function ready() {
  return buffers.size === Object.keys(FILES).length;
}

export function loaded() {
  return [...buffers.keys()];
}

export function bindUnlock() {
  const once = () => {
    unlock();
    load();
    window.removeEventListener('pointerdown', once);
    window.removeEventListener('keydown', once);
  };
  window.addEventListener('pointerdown', once);
  window.addEventListener('keydown', once);
  load();
}
