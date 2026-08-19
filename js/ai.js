const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

const PST = {
  p: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, -20, -20, 10, 10, 5,
    5, -5, -10, 0, 0, -10, -5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, 5, 10, 25, 25, 10, 5, 5,
    10, 10, 20, 30, 30, 20, 10, 10,
    50, 50, 50, 50, 50, 50, 50, 50,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 5, 5, 0, 0, 0,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    5, 10, 10, 10, 10, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -10, 5, 5, 5, 5, 5, 0, -10,
    0, 0, 5, 5, 5, 5, 0, -5,
    -5, 0, 5, 5, 5, 5, 0, -5,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ],
  k: [
    20, 30, 10, 0, 0, 10, 30, 20,
    20, 20, 0, 0, 0, 0, 20, 20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
  ],
};

export const LEVELS = {
  easy: { id: 'easy', label: 'Easy', depth: 1, noise: 240, random: 0.55, delay: 220 },
  medium: { id: 'medium', label: 'Medium', depth: 2, noise: 28, random: 0.08, delay: 320 },
  hard: { id: 'hard', label: 'Hard', depth: 3, noise: 0, random: 0, delay: 480 },
};

function sqIndex(i, color) {
  return color === 'w' ? i : i ^ 56;
}

function evaluate(game, me, usePst) {
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const p = game.pieceAt(i);
    if (!p) continue;
    const v = VAL[p.t] || 0;
    let bonus = 0;
    if (usePst && PST[p.t]) bonus = PST[p.t][sqIndex(i, p.c)];
    else {
      const f = i & 7;
      const r = i >> 3;
      const pull = 6 - Math.abs(f - 3.5) - Math.abs(r - 3.5);
      if (p.t === 'p' || p.t === 'n') bonus = pull;
    }
    const side = p.c === me ? 1 : -1;
    score += side * (v + bonus);
  }
  const st = game.status();
  if (st === 'checkmate') return game.turn === me ? -100000 : 100000;
  if (st === 'stalemate' || st === 'draw') return 0;
  if (game.inCheck()) score += game.turn === me ? -45 : 45;
  return score;
}

function orderMoves(legal) {
  return [...legal].sort((a, b) => {
    const ac = a.captured ? VAL[a.captured] : 0;
    const bc = b.captured ? VAL[b.captured] : 0;
    return bc - ac || (b.promo ? 1 : 0) - (a.promo ? 1 : 0);
  });
}

function search(game, depth, alpha, beta, root, usePst) {
  const st = game.status();
  if (st === 'checkmate') return game.turn === root ? -100000 - depth : 100000 + depth;
  if (st === 'stalemate' || st === 'draw') return 0;
  if (depth <= 0) return evaluate(game, root, usePst);

  const legal = game.allLegal();
  if (!legal.length) return evaluate(game, root, usePst);

  const side = game.turn;
  let best = side === root ? -1e9 : 1e9;

  for (const m of orderMoves(legal)) {
    game.probe(m);
    const score = search(game, depth - 1, alpha, beta, root, usePst);
    game.revert(m);
    if (side === root) {
      if (score > best) best = score;
      if (best > alpha) alpha = best;
    } else {
      if (score < best) best = score;
      if (best < beta) beta = best;
    }
    if (alpha >= beta) break;
  }
  return best;
}

export function pickMove(game, level = 'medium') {
  const cfg = LEVELS[level] || LEVELS.medium;
  const me = game.turn;
  const legal = game.allLegal();
  if (!legal.length) return null;

  if (cfg.random && Math.random() < cfg.random) {
    return legal[Math.floor(Math.random() * legal.length)];
  }

  const usePst = cfg.id === 'hard';
  const ordered = orderMoves(legal);
  let best = ordered[0];
  let bestScore = -1e9;

  for (const m of ordered) {
    game.probe(m);
    let score = search(game, cfg.depth - 1, -1e9, 1e9, me, usePst);
    game.revert(m);
    if (cfg.noise) score += (Math.random() * 2 - 1) * cfg.noise;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

export function thinkDelay(level = 'medium') {
  return (LEVELS[level] || LEVELS.medium).delay;
}
