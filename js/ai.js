const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

function evaluate(game, me) {
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const p = game.pieceAt(i);
    if (!p) continue;
    const v = VAL[p.t] || 0;
    score += p.c === me ? v : -v;
    const f = i & 7;
    const r = i >> 3;
    const center = 3.5;
    const pull = 6 - Math.abs(f - center) - Math.abs(r - center);
    if (p.t === 'p' || p.t === 'n') score += (p.c === me ? pull : -pull);
  }
  const st = game.status();
  if (st === 'checkmate') return game.turn === me ? -100000 : 100000;
  if (st === 'stalemate') return 0;
  if (game.inCheck()) score += game.turn === me ? -45 : 45;
  return score;
}

export function pickMove(game, depth = 2) {
  const me = game.turn;
  const legal = game.allLegal();
  if (!legal.length) return null;

  const ordered = [...legal].sort((a, b) => {
    const ac = a.captured ? VAL[a.captured] : 0;
    const bc = b.captured ? VAL[b.captured] : 0;
    return bc - ac || Math.random() - 0.5;
  });

  let best = ordered[0];
  let bestScore = -1e9;

  for (const m of ordered) {
    const res = game.play(m.from, m.to, m.promo);
    if (!res.ok) continue;
    const score = search(game, depth - 1, -1e9, 1e9, me);
    game.undo();
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

function search(game, depth, alpha, beta, root) {
  const st = game.status();
  if (st === 'checkmate') return game.turn === root ? -100000 - depth : 100000 + depth;
  if (st === 'stalemate') return 0;
  if (depth <= 0) return evaluate(game, root);

  const legal = game.allLegal();
  if (!legal.length) return evaluate(game, root);

  const side = game.turn;
  let best = side === root ? -1e9 : 1e9;

  for (const m of legal) {
    const res = game.play(m.from, m.to, m.promo);
    if (!res.ok) continue;
    const score = search(game, depth - 1, alpha, beta, root);
    game.undo();
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
