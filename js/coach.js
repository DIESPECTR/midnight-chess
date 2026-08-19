import { algebraic } from './chess.js';
import { pickMove } from './ai.js';

const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function sideName(c) {
  return c === 'w' ? 'White' : 'Black';
}

function material(game) {
  let w = 0;
  let b = 0;
  for (let i = 0; i < 64; i++) {
    const p = game.pieceAt(i);
    if (!p || p.t === 'k') continue;
    if (p.c === 'w') w += VAL[p.t];
    else b += VAL[p.t];
  }
  return { w, b, diff: w - b };
}

function phase(game) {
  const n = game.history.length;
  let minors = 0;
  for (let i = 0; i < 64; i++) {
    const p = game.pieceAt(i);
    if (p && p.t !== 'k' && p.t !== 'p') minors += 1;
  }
  if (n < 16 && minors >= 10) return 'opening';
  if (minors <= 6) return 'endgame';
  return 'middlegame';
}

function sanOf(game, m) {
  const res = game.play(m.from, m.to, m.promo);
  if (!res.ok) return `${algebraic(m.from)}${algebraic(m.to)}`;
  const san = res.move.san;
  game.undo();
  return san;
}

function whyMove(m) {
  if (m.castle === 'K') return 'Castles short — king to safety, rook into the game.';
  if (m.castle === 'Q') return 'Castles long — king tucked, rook ready for the center.';
  if (m.promo) return `Promotes to a ${NAME[m.promo]}.`;
  if (m.ep) return 'En passant — takes the pawn that just skipped past.';
  if (m.captured) return `Takes the ${NAME[m.captured]}.`;
  const to = m.to;
  if (m.piece === 'p' && (to === 27 || to === 28 || to === 35 || to === 36)) {
    return 'Takes a share of the center.';
  }
  if (m.piece === 'n' || m.piece === 'b') return `Develops the ${NAME[m.piece]}.`;
  if (m.piece === 'q') return 'Brings the queen out.';
  if (m.piece === 'r') return 'Activates a rook.';
  if (m.piece === 'k') return 'Steps the king.';
  return 'A useful improving move.';
}

export function greet() {
  return { text: "I'm your coach. Ask for a hint, or tap a chip." };
}

export function suggestMove(game, level = 'medium') {
  const st = game.status();
  if (st === 'checkmate') {
    return { text: 'Checkmate. Nothing left to suggest — tap Play again.' };
  }
  if (st === 'stalemate' || st === 'draw') {
    const why = game.drawReason();
    return { text: `That's a draw${why ? ` — ${why}` : ''}. Fresh board?` };
  }
  const move = pickMove(game, level);
  if (!move) return { text: 'No legal moves from here.' };
  const san = sanOf(game, move);
  const bits = [];
  if (game.inCheck()) bits.push(`${sideName(game.turn)} is in check — this gets you out.`);
  bits.push(`Look at ${san}.`);
  bits.push(whyMove(move));
  return {
    text: bits.join(' '),
    hint: { from: move.from, to: move.to, san },
  };
}

export function explainPosition(game, ctx = {}) {
  const st = game.status();
  const turn = sideName(game.turn);
  if (st === 'checkmate') {
    return { text: `Checkmate. ${turn} is done. Tap Play again when you want another.` };
  }
  if (st === 'stalemate') {
    return { text: 'Stalemate — no legal move, not in check. Draw.' };
  }
  if (st === 'draw') {
    return { text: `Draw by ${game.drawReason() || 'rule'}.` };
  }

  const mat = material(game);
  const last = game.history.at(-1);
  const ph = phase(game);
  const moveNo = Math.floor(game.history.length / 2) + 1;
  const bits = [`${ph[0].toUpperCase()}${ph.slice(1)}, move ${moveNo}. ${turn} to play.`];

  if (st === 'check') bits.push(`${turn} is in check. Get out: capture, block, or step the king.`);
  if (mat.diff === 0) bits.push('Material is even.');
  else if (mat.diff > 0) bits.push(`White is up ${mat.diff}.`);
  else bits.push(`Black is up ${-mat.diff}.`);
  if (last) bits.push(`Last move: ${last.san}.`);
  if (ph === 'opening') bits.push('Get pieces out and the king safe.');
  else if (ph === 'endgame') bits.push('Push passed pawns. The king belongs in the fight now.');
  else bits.push('Look for hanging pieces before you attack.');
  if (ctx.vsComputer && game.turn === 'b') bits.push('Computer is thinking — sit tight.');
  return { text: bits.join(' ') };
}

function explainSquare(game, sq) {
  const p = game.pieceAt(sq);
  const name = algebraic(sq);
  if (!p) return { text: `${name} is empty.` };
  const who = p.c === 'w' ? 'White' : 'Black';
  if (p.c !== game.turn) {
    return { text: `${name} is a ${who.toLowerCase()} ${NAME[p.t]}. Not their turn.` };
  }
  const legal = game.legalFrom(sq);
  if (!legal.length) return { text: `The ${NAME[p.t]} on ${name} has nowhere legal to go.` };
  const dests = [...new Set(legal.map((m) => algebraic(m.to)))].slice(0, 6).join(', ');
  return { text: `${who} ${NAME[p.t]} on ${name}. It can go ${dests}.` };
}

function challenge(ctx) {
  return {
    text: ctx.shareUrl
      ? 'Pass and play is on. I copied the link — send it, then Flip when you hand the board over.'
      : 'Pass and play is on. Flip the board when you pass it over.',
    action: 'challenge',
  };
}

function playAgain() {
  return { text: 'Fresh board. You have White.', action: 'newgame' };
}

function help() {
  return {
    text: 'Ask for a hint, what the position is, or tap a chip: suggest, explain, challenge, play again.',
  };
}

function parseSquare(q) {
  const m = q.match(/\b([a-h][1-8])\b/);
  if (!m) return null;
  return m[1].charCodeAt(0) - 97 + (Number(m[1][1]) - 1) * 8;
}

export function answer(game, raw, ctx = {}) {
  const text = String(raw || '').trim();
  const q = text.toLowerCase();
  if (!q) return explainPosition(game, ctx);
  if (/\b(play again|new game|restart|reset|another)\b/.test(q)) return playAgain();
  if (/\b(challenge|friend|share|link|invite|pass and play)\b/.test(q)) return challenge(ctx);
  if (/\b(suggest|hint|best|what should|good move|next move)\b/.test(q)) {
    return suggestMove(game, ctx.difficulty);
  }
  if (/\b(explain|position|what's going|whats going|why|how am i|eval|analyse|analyze)\b/.test(q)) {
    return explainPosition(game, ctx);
  }
  if (/\b(help|what can you|commands)\b/.test(q)) return help();
  const sq = parseSquare(q);
  if (sq != null) return explainSquare(game, sq);
  return explainPosition(game, ctx);
}

export function noteEvent(game) {
  const st = game.status();
  if (st === 'checkmate') return { text: 'Mate. Clean finish.' };
  if (st === 'stalemate') return { text: 'Stalemate — sneaky way to split the point.' };
  if (st === 'draw') return { text: `Draw — ${game.drawReason() || 'no way through'}.` };
  if (st === 'check') return { text: 'Check. Deal with the king first.' };
  return null;
}
