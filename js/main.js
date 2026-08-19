import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Chess } from './chess.js';
import { createBoard, createPiece, squareToWorld, worldToSquare } from './pieces.js';
import { bindUnlock, play, ready, loaded } from './audio.js';
import { pickMove, LEVELS, thinkDelay } from './ai.js';

const GLYPH = {
  w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
  b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
};

const canvas = document.getElementById('scene');
const game = new Chess();

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07080b);
scene.fog = new THREE.Fog(0x07080b, 13, 30);

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 7;
controls.maxDistance = 18;
controls.minPolarAngle = 0.45;
controls.maxPolarAngle = 1.15;
controls.target.set(0, 0.3, 0);

function placeCamera(flipped) {
  const z = flipped ? -10.5 : 10.5;
  camera.position.set(0, 9.2, z);
  controls.update();
}

placeCamera(false);

function makeStudioEnv() {
  const env = new THREE.Scene();
  const warm = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 10),
    new THREE.MeshBasicMaterial({ color: 0xffd2a0 }),
  );
  warm.position.set(7, 8, 11);
  env.add(warm);
  const cool = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 10),
    new THREE.MeshBasicMaterial({ color: 0x6d86b0 }),
  );
  cool.position.set(-10, 6, -5);
  cool.rotation.y = 0.6;
  env.add(cool);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshBasicMaterial({ color: 0x16110c }),
  );
  floor.rotation.x = -Math.PI / 2;
  env.add(floor);
  const ceil = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshBasicMaterial({ color: 0x2a241c }),
  );
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = 16;
  env.add(ceil);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.03).texture;
  pmrem.dispose();
  return tex;
}

scene.environment = makeStudioEnv();

scene.add(new THREE.HemisphereLight(0xffe4c4, 0x0c0907, 0.28));

const key = new THREE.DirectionalLight(0xffe2c2, 1.65);
key.position.set(6.2, 13.5, 7.4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.00022;
key.shadow.normalBias = 0.035;
key.shadow.radius = 3.2;
key.shadow.camera.near = 2;
key.shadow.camera.far = 30;
key.shadow.camera.left = -8;
key.shadow.camera.right = 8;
key.shadow.camera.top = 8;
key.shadow.camera.bottom = -8;
scene.add(key);

const fill = new THREE.DirectionalLight(0x88a0c4, 0.32);
fill.position.set(-9, 5.5, 2.5);
scene.add(fill);

const rim = new THREE.DirectionalLight(0xffc07a, 0.55);
rim.position.set(-3, 7, -11);
scene.add(rim);

const spot = new THREE.SpotLight(0xffd8aa, 18, 24, 0.52, 0.62, 1.15);
spot.position.set(0.6, 11.5, 3.2);
spot.target.position.set(0, 0, 0);
scene.add(spot);
scene.add(spot.target);

const { root: boardRoot, tiles } = createBoard();
scene.add(boardRoot);

const selectMat = new THREE.MeshBasicMaterial({
  color: 0xc9a86a,
  transparent: true,
  opacity: 0.42,
  depthWrite: false,
});
const lastMat = new THREE.MeshBasicMaterial({
  color: 0x7aa2ff,
  transparent: true,
  opacity: 0.28,
  depthWrite: false,
});
const checkMat = new THREE.MeshBasicMaterial({
  color: 0xe07a6a,
  transparent: true,
  opacity: 0.4,
  depthWrite: false,
});
const moveMat = new THREE.MeshBasicMaterial({
  color: 0x111111,
  transparent: true,
  opacity: 0.38,
  depthWrite: false,
});
const capMat = new THREE.MeshBasicMaterial({
  color: 0xe07a6a,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
  side: THREE.DoubleSide,
});

const overlays = new THREE.Group();
scene.add(overlays);

const markers = new THREE.Group();
scene.add(markers);

let pieces = [];
let selected = -1;
let legal = [];
let flipped = false;
let busy = false;
let pending = null;
let hover = -1;
let vsComputer = true;
let difficulty = 'medium';
const anims = [];

function spawnPieces() {
  for (const p of pieces) scene.remove(p.mesh);
  pieces = [];
  for (let s = 0; s < 64; s++) {
    const cell = game.pieceAt(s);
    if (!cell) continue;
    const mesh = createPiece(cell.t, cell.c);
    const { x, z } = squareToWorld(s);
    mesh.position.set(x, 0, z);
    scene.add(mesh);
    pieces.push({ mesh, sq: s });
  }
}

function pieceAt(sq) {
  return pieces.find((p) => p.sq === sq);
}

function overlayAt(sq, mat) {
  const { x, z } = squareToWorld(sq);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.98), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.01, z);
  overlays.add(m);
}

function drawMarkers() {
  overlays.clear();
  markers.clear();

  const last = game.history.at(-1);
  if (last) {
    overlayAt(last.from, lastMat);
    overlayAt(last.to, lastMat);
  }
  if (game.inCheck()) overlayAt(game.kingSquare(), checkMat);
  if (selected >= 0) overlayAt(selected, selectMat);

  const seen = new Set();
  for (const m of legal) {
    if (seen.has(m.to)) continue;
    seen.add(m.to);
    const { x, z } = squareToWorld(m.to);
    if (m.captured || m.ep) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.42, 28), capMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.02, z);
      markers.add(ring);
    } else {
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.12, 20), moveMat);
      dot.rotation.x = -Math.PI / 2;
      dot.position.set(x, 0.02, z);
      markers.add(dot);
    }
  }
}

function ease(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

function animateTo(obj, to, extra = {}) {
  return new Promise((resolve) => {
    anims.push({
      obj,
      from: obj.position.clone(),
      to,
      t: 0,
      dur: extra.dur ?? 0.32,
      lift: extra.lift ?? 0.35,
      fade: extra.fade ?? false,
      resolve,
    });
  });
}

function tickAnims(dt) {
  for (let i = anims.length - 1; i >= 0; i--) {
    const a = anims[i];
    a.t += dt / a.dur;
    const u = Math.min(1, a.t);
    const e = ease(u);
    a.obj.position.lerpVectors(a.from, a.to, e);
    if (a.lift) a.obj.position.y = Math.sin(e * Math.PI) * a.lift;
    if (a.fade) a.obj.scale.setScalar(1 - e);
    if (u >= 1) {
      if (!a.fade) a.obj.position.copy(a.to);
      a.resolve();
      anims.splice(i, 1);
    }
  }
}

const GLYPH_ORDER = 'qrnbp';

function renderCaps() {
  const { w, b } = game.captured();
  const fill = (el, list, color) => {
    const sorted = [...list].sort((a, c) => GLYPH_ORDER.indexOf(a) - GLYPH_ORDER.indexOf(c));
    el.innerHTML = sorted.map((t) => `<span>${GLYPH[color][t]}</span>`).join('');
  };
  fill(document.getElementById('cap-w'), w, 'w');
  fill(document.getElementById('cap-b'), b, 'b');
}

function renderMoves() {
  const rows = [];
  const h = game.history;
  for (let i = 0; i < h.length; i += 2) {
    rows.push(
      `<div><em>${(i / 2) + 1}.</em><span>${h[i].san}</span><span>${h[i + 1]?.san ?? ''}</span></div>`,
    );
  }
  const box = document.getElementById('moves');
  box.innerHTML = rows.join('');
  box.scrollTop = box.scrollHeight;
}

function setHud() {
  const white = game.turn === 'w';
  document.getElementById('turn-dot').className = `dot ${game.turn}`;
  document.getElementById('turn-label').textContent = white ? 'White to move' : 'Black to move';
  const st = game.status();
  const status = document.getElementById('status');
  status.classList.toggle('danger', st !== 'playing');
  status.textContent = st === 'playing' ? '' : st;
  const human = !vsComputer || game.turn === 'w';
  const level = LEVELS[difficulty] || LEVELS.medium;
  document.getElementById('hint').textContent = !human
    ? `Computer is thinking · ${level.label}`
    : white ? 'Select a white piece' : 'Select a black piece';
  renderCaps();
  renderMoves();
  drawMarkers();
  syncSettingsUi();

  if (st === 'checkmate' || st === 'stalemate' || st === 'draw') {
    document.getElementById('end-title').textContent = st === 'checkmate' ? 'Checkmate' : 'Draw';
    document.getElementById('end-copy').textContent = st === 'checkmate'
      ? `${white ? 'Black' : 'White'} wins`
      : st === 'stalemate'
        ? 'Draw — no legal moves'
        : `Draw — ${game.drawReason() || 'no decisive result'}`;
    document.getElementById('end').classList.add('show');
  } else {
    document.getElementById('end').classList.remove('show');
  }
}

function clearSelect() {
  selected = -1;
  legal = [];
  drawMarkers();
}

async function applyMove(from, to, promo = null) {
  const res = game.play(from, to, promo);
  if (!res.ok) return res;
  busy = true;
  clearSelect();

  const mover = pieceAt(from);
  const dest = squareToWorld(to);
  const jobs = [];

  if (res.move.castle) play('castle');
  else if (res.move.capturedPiece) play('capture');
  else play('move', 0.26);

  if (res.move.capturedPiece) {
    const victim = pieceAt(res.move.capSq);
    if (victim) {
      jobs.push(animateTo(victim.mesh, victim.mesh.position.clone(), { lift: 0, fade: true, dur: 0.24 })
        .then(() => {
          scene.remove(victim.mesh);
          pieces = pieces.filter((p) => p !== victim);
        }));
    }
  }

  if (mover) {
    jobs.push(animateTo(mover.mesh, new THREE.Vector3(dest.x, 0, dest.z)).then(() => {
      mover.sq = to;
    }));
  }

  if (res.move.castle && mover) {
    const rook = pieceAt(res.move.rookFrom);
    if (rook) {
      const rt = squareToWorld(res.move.rookTo);
      jobs.push(animateTo(rook.mesh, new THREE.Vector3(rt.x, 0, rt.z), { lift: 0.15 }).then(() => {
        rook.sq = res.move.rookTo;
      }));
    }
  }

  await Promise.all(jobs);

  if (res.move.promo && mover) {
    scene.remove(mover.mesh);
    const next = createPiece(res.move.promo, res.move.color);
    next.position.set(dest.x, 0, dest.z);
    scene.add(next);
    mover.mesh = next;
    mover.mesh.userData = { type: res.move.promo, color: res.move.color };
    play('promote');
  }

  if (res.status === 'checkmate') play('checkmate');
  else if (res.status === 'stalemate' || res.status === 'draw') play('stalemate');
  else if (res.status === 'check') play('check');

  busy = false;
  setHud();
  if (res.status === 'playing') queueComputer();
  return res;
}

function computerToMove() {
  return vsComputer && game.turn === 'b' && game.status() === 'playing';
}

function queueComputer() {
  if (!computerToMove() || busy) return;
  busy = true;
  setHud();
  window.setTimeout(async () => {
    const move = pickMove(game, difficulty);
    busy = false;
    if (!move) {
      setHud();
      return;
    }
    await applyMove(move.from, move.to, move.promo);
  }, thinkDelay(difficulty));
}

function setMode(on) {
  vsComputer = on;
  clearSelect();
  setHud();
  queueComputer();
}

function setDifficulty(level) {
  if (!LEVELS[level]) return;
  difficulty = level;
  setHud();
}

function markPills(root, attr, value) {
  if (!root) return;
  for (const btn of root.querySelectorAll(`[${attr}]`)) {
    btn.classList.toggle('on', btn.getAttribute(attr) === value);
  }
}

function syncSettingsUi() {
  const modeBtn = document.getElementById('btn-mode');
  if (modeBtn) {
    modeBtn.innerHTML = vsComputer
      ? 'Vs computer <span class="arrow-circle" aria-hidden="true">↗</span>'
      : 'Pass and play <span class="arrow-circle" aria-hidden="true">↗</span>';
  }
  markPills(document.getElementById('mode-pills'), 'data-mode', vsComputer ? 'computer' : 'pass');
  markPills(document.getElementById('diff-pills'), 'data-diff', difficulty);
  markPills(document.getElementById('hud-diff'), 'data-diff', difficulty);
  document.getElementById('diff-block')?.classList.toggle('is-off', !vsComputer);
  document.getElementById('diff-wrap')?.classList.toggle('is-off', !vsComputer);
}

function startMatch(fresh = false) {
  if (fresh) newGame();
  else setHud();
  const stage = document.getElementById('play');
  if (!stage) return;
  stage.classList.remove('arrive');
  void stage.offsetWidth;
  stage.classList.add('arrive');
  stage.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function newGame() {
  game.reset();
  selected = -1;
  legal = [];
  pending = null;
  busy = false;
  document.getElementById('promo').classList.remove('show');
  spawnPieces();
  setHud();
}

function undoMove() {
  if (busy || !game.history.length) return;
  game.undo();
  if (vsComputer && game.history.length && game.turn === 'b') game.undo();
  pending = null;
  document.getElementById('promo').classList.remove('show');
  spawnPieces();
  clearSelect();
  setHud();
}

const ray = new THREE.Raycaster();
const ptr = new THREE.Vector2();
const boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const planeHit = new THREE.Vector3();

function pick(ev) {
  const rect = canvas.getBoundingClientRect();
  ptr.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  ptr.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  ray.setFromCamera(ptr, camera);
  const hits = ray.intersectObjects(scene.children, true);
  let tile = null;
  for (const h of hits) {
    const root = h.object.userData.pieceRoot;
    if (root) {
      const rec = pieces.find((p) => p.mesh === root);
      if (rec) return { sq: rec.sq, piece: true };
    }
    if (tile == null && h.object.userData.square != null) {
      tile = { sq: h.object.userData.square, piece: false };
    }
  }
  if (tile) return tile;
  if (ray.ray.intersectPlane(boardPlane, planeHit)) {
    const sq = worldToSquare(planeHit.x, planeHit.z);
    if (sq >= 0) return { sq, piece: false };
  }
  return null;
}

function onPointer(ev) {
  if (busy || pending) return;
  const hit = pick(ev);
  canvas.style.cursor = hit ? 'pointer' : '';
  const next = hit ? hit.sq : -1;
  if (next === hover) return;
  hover = next;
}

async function onClick(ev) {
  if (busy || pending) return;
  if (vsComputer && game.turn === 'b') return;
  const hit = pick(ev);
  if (!hit) {
    clearSelect();
    return;
  }
  const cell = game.pieceAt(hit.sq);
  if (cell && cell.c === game.turn) {
    selected = hit.sq;
    legal = game.legalFrom(selected);
    drawMarkers();
    play('select');
    return;
  }
  if (selected < 0) return;
  const opts = legal.filter((m) => m.to === hit.sq);
  if (!opts.length) {
    clearSelect();
    return;
  }
  if (opts.some((m) => m.promo)) {
    pending = { from: selected, to: hit.sq };
    document.getElementById('promo').classList.add('show');
    return;
  }
  await applyMove(selected, hit.sq);
}

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointermove', onPointer);
canvas.addEventListener('click', (ev) => {
  if (drag && Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) > 5) return;
  onClick(ev);
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    clearSelect();
    pending = null;
    document.getElementById('promo').classList.remove('show');
  }
  if (e.key === 'u' || e.key === 'U') {
    if (!busy && game.history.length) play('undo');
    undoMove();
  }
});

document.getElementById('btn-new').onclick = () => {
  play('newgame');
  newGame();
};
document.getElementById('btn-end-new').onclick = () => {
  play('newgame');
  newGame();
};
document.getElementById('btn-undo').onclick = () => {
  if (!busy && game.history.length) play('undo');
  undoMove();
};
document.getElementById('btn-flip').onclick = () => {
  play('click');
  flipped = !flipped;
  placeCamera(flipped);
};
const modeBtn = document.getElementById('btn-mode');
if (modeBtn) {
  modeBtn.onclick = () => {
    play('click');
    setMode(!vsComputer);
  };
}
document.getElementById('mode-pills')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-mode]');
  if (!btn) return;
  play('click');
  setMode(btn.dataset.mode === 'computer');
});
document.getElementById('diff-pills')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-diff]');
  if (!btn) return;
  play('click');
  setDifficulty(btn.dataset.diff);
});
document.getElementById('hud-diff')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-diff]');
  if (!btn) return;
  play('click');
  setDifficulty(btn.dataset.diff);
});
document.querySelectorAll('.js-play').forEach((el) => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    play('click');
    startMatch(el.dataset.fresh === '1');
  });
});
document.getElementById('promo').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-promo]');
  if (!btn || !pending) return;
  play('click');
  const { from, to } = pending;
  pending = null;
  document.getElementById('promo').classList.remove('show');
  await applyMove(from, to, btn.dataset.promo);
});

new ResizeObserver(resize).observe(canvas);
bindUnlock();
spawnPieces();
setHud();
resize();

window.__chessDebug = {
  clickNorm(nx, ny) {
    const r = canvas.getBoundingClientRect();
    const ev = { clientX: r.left + r.width * nx, clientY: r.top + r.height * ny };
    drag = { x: ev.clientX, y: ev.clientY };
    const hit = pick(ev);
    onClick(ev);
    return { hit, selected, legal: legal.map((m) => m.to), turn: game.turn, status: game.status() };
  },
  pickSq(sq) {
    if (vsComputer && game.turn === 'b') return { ok: false, reason: 'computer', turn: game.turn };
    const cell = game.pieceAt(sq);
    if (cell && cell.c === game.turn) {
      selected = sq;
      legal = game.legalFrom(selected);
      drawMarkers();
      play('select');
      return { ok: true, selected, legal: legal.map((m) => ({ to: m.to, promo: m.promo })), turn: game.turn };
    }
    if (selected < 0) return { ok: false, reason: 'no-select', sq, turn: game.turn };
    const opts = legal.filter((m) => m.to === sq);
    if (!opts.length) {
      clearSelect();
      return { ok: false, reason: 'illegal', sq, turn: game.turn };
    }
    if (opts.some((m) => m.promo)) {
      pending = { from: selected, to: sq };
      document.getElementById('promo').classList.add('show');
      return { ok: true, promo: true, from: pending.from, to: sq };
    }
    const from = selected;
    const p = applyMove(from, sq);
    return { ok: true, from, to: sq, pendingMove: p };
  },
  state() {
    return {
      selected,
      turn: game.turn,
      status: game.status(),
      history: game.history.map((m) => m.san),
      legal: legal.map((m) => m.to),
      vsComputer,
      difficulty,
    };
  },
  play,
  audioReady: ready,
  loaded,
  screenOf(sq) {
    const { x, z } = squareToWorld(sq);
    const v = new THREE.Vector3(x, 0.18, z).project(camera);
    const r = canvas.getBoundingClientRect();
    return {
      nx: (v.x + 1) / 2,
      ny: (1 - v.y) / 2,
      x: r.left + ((v.x + 1) / 2) * r.width,
      y: r.top + ((1 - v.y) / 2) * r.height,
    };
  },
  reset() {
    newGame();
    return this.state();
  },
  setDifficulty(level) {
    setDifficulty(level);
    return this.state();
  },
  setMode(on) {
    setMode(!!on);
    return this.state();
  },
  startMatch(fresh = false) {
    startMatch(!!fresh);
    return this.state();
  },
  async assemble() {
    for (const p of pieces) scene.remove(p.mesh);
    pieces = [];
    const order = [];
    for (let s = 0; s < 64; s++) {
      const cell = game.pieceAt(s);
      if (cell) order.push({ s, cell });
    }
    order.sort((a, b) => {
      const ra = a.s >> 3;
      const rb = b.s >> 3;
      const edgeA = ra === 0 || ra === 7 ? 0 : 1;
      const edgeB = rb === 0 || rb === 7 ? 0 : 1;
      return edgeA - edgeB || ra - rb || (a.s & 7) - (b.s & 7);
    });
    play('newgame');
    const jobs = [];
    for (let i = 0; i < order.length; i++) {
      const { s, cell } = order[i];
      const mesh = createPiece(cell.t, cell.c);
      const { x, z } = squareToWorld(s);
      mesh.position.set(x, 2.4 + (i % 8) * 0.08, z);
      scene.add(mesh);
      const rec = { mesh, sq: s };
      pieces.push(rec);
      jobs.push(
        new Promise((resolve) => {
          setTimeout(() => {
            animateTo(mesh, new THREE.Vector3(x, 0, z), { lift: 0, dur: 0.38 }).then(() => {
              play('move', 0);
              resolve();
            });
          }, i * 55);
        }),
      );
    }
    await Promise.all(jobs);
    setHud();
    return { ok: true, n: pieces.length };
  },
};

const clock = new THREE.Clock();
function loop() {
  requestAnimationFrame(loop);
  tickAnims(clock.getDelta());
  controls.update();
  renderer.render(scene, camera);
}
loop();
