import { Chess, parseAlg } from './chess.js';
import { pickMove, LEVELS } from './ai.js';

function play(c, seq) {
  for (const s of seq) {
    const [a, b] = s.split(/[-x]/);
    const dest = b.length > 2 ? b.slice(0, 2) : b;
    const r = c.play(parseAlg(a), parseAlg(dest));
    if (!r.ok) throw new Error('illegal ' + s);
  }
}

const c = new Chess();
if (c.legalFrom(parseAlg('e2')).length !== 2) throw new Error('pawn e2');
if (c.legalFrom(parseAlg('b1')).length !== 2) throw new Error('knight');

play(c, ['e2-e4', 'e7-e5', 'd1-h5', 'b8-c6', 'f1-c4', 'g8-f6', 'h5-f7']);
if (c.status() !== 'checkmate') throw new Error('expected mate got ' + c.status());
if (c.kingSquare() < 0) throw new Error('kingSquare default missing');
console.log('scholars mate ok', c.history.map((m) => m.san).join(' '));

const d = new Chess();
play(d, ['e2-e4', 'e7-e5', 'g1-f3', 'b8-c6', 'f1-c4', 'g8-f6']);
const castle = d.legalFrom(parseAlg('e1')).filter((m) => m.castle);
if (!castle.some((m) => m.castle === 'K')) throw new Error('no O-O');
d.play(parseAlg('e1'), parseAlg('g1'));
if (d.history.at(-1).san !== 'O-O') throw new Error('castle san ' + d.history.at(-1).san);
console.log('castling ok');

const e = new Chess();
play(e, ['e2-e4', 'd7-d5', 'e4-d5', 'c7-c5', 'd5-d6']);
console.log('captures ok', e.captured());

const f = new Chess();
play(f, ['e2-e4', 'a7-a6', 'e4-e5', 'd7-d5']);
const ep = f.legalFrom(parseAlg('e5')).filter((m) => m.ep);
if (ep.length !== 1 || ep[0].to !== parseAlg('d6')) throw new Error('ep missing');
f.play(parseAlg('e5'), parseAlg('d6'));
if (f.pieceAt(parseAlg('d5'))) throw new Error('ep pawn remains');
if (!f.pieceAt(parseAlg('d6'))) throw new Error('ep dest empty');
console.log('en passant ok', f.history.at(-1).san);

const g = new Chess();
g.undo();
if (g.turn !== 'w') throw new Error('undo empty');
play(g, ['e2-e4', 'e7-e5']);
g.undo();
if (g.pieceAt(parseAlg('e7'))?.t !== 'p') throw new Error('undo failed');
console.log('undo ok');

const h = new Chess();
play(h, ['e2-e4', 'e7-e5', 'd1-h5', 'b8-c6', 'h5-e5']);
if (h.status() !== 'check') throw new Error('expected check got ' + h.status());
if (h.kingSquare('b') !== parseAlg('e8')) throw new Error('black king sq');
console.log('check ok');

const bare = new Chess();
bare.board = Array(64).fill(null);
bare.board[parseAlg('e1')] = { t: 'k', c: 'w' };
bare.board[parseAlg('e8')] = { t: 'k', c: 'b' };
bare.castle = { wK: false, wQ: false, bK: false, bQ: false };
if (bare.status() !== 'draw' || bare.drawReason() !== 'insufficient material') {
  throw new Error('bare kings ' + bare.status() + ' ' + bare.drawReason());
}
console.log('insufficient material ok');

const fifty = new Chess();
fifty.halfmove = 100;
if (fifty.status() !== 'draw' || fifty.drawReason() !== '50-move rule') {
  throw new Error('fifty ' + fifty.status());
}
console.log('50-move ok');

const fold = new Chess();
play(fold, ['g1-f3', 'g8-f6', 'f3-g1', 'f6-g8', 'g1-f3', 'g8-f6', 'f3-g1', 'f6-g8']);
if (fold.status() !== 'draw' || fold.drawReason() !== 'threefold repetition') {
  throw new Error('threefold got ' + fold.status() + ' ' + fold.drawReason());
}
console.log('threefold ok');

const snap = new Chess();
const first = snap.allLegal()[0];
const key = snap.key();
snap.probe(first);
snap.revert(first);
if (snap.key() !== key) throw new Error('probe leak');
console.log('probe ok');

for (const level of Object.keys(LEVELS)) {
  const ai = new Chess();
  const move = pickMove(ai, level);
  if (!move) throw new Error('no AI move ' + level);
  const ok = ai.allLegal().some((m) => m.from === move.from && m.to === move.to && m.promo === move.promo);
  if (!ok) throw new Error('illegal AI ' + level);
  const res = ai.play(move.from, move.to, move.promo);
  if (!res.ok) throw new Error('AI play failed ' + level);
}
console.log('AI legal ok', Object.keys(LEVELS).join(' '));

import { answer, explainPosition, suggestMove } from './coach.js';

const coach = new Chess();
const hint = suggestMove(coach, 'hard');
if (!hint.hint) throw new Error('coach hint missing');
const legalHint = coach.allLegal().some((m) => m.from === hint.hint.from && m.to === hint.hint.to);
if (!legalHint) throw new Error('coach hint illegal');
if (coach.history.length) throw new Error('suggest leaked a move');

const explained = explainPosition(coach);
if (!/White to play/.test(explained.text)) throw new Error('explain start ' + explained.text);

const again = answer(coach, 'play again');
if (again.action !== 'newgame') throw new Error('play again action');

const chal = answer(coach, 'challenge a friend', { shareUrl: 'http://x' });
if (chal.action !== 'challenge') throw new Error('challenge action');

const asked = answer(coach, 'suggest a move', { difficulty: 'hard' });
if (!asked.hint) throw new Error('suggest intent');

const square = answer(coach, 'what about e2');
if (!/e2/.test(square.text)) throw new Error('square ask ' + square.text);

console.log('coach ok');

console.log('ALL TESTS PASSED');
