const FILES = 'abcdefgh';
const PIECE_N = { p: '', n: 'N', b: 'B', r: 'R', q: 'Q', k: 'K' };

export function sq(file, rank) {
  return file + rank * 8;
}

export function fileOf(s) {
  return s & 7;
}

export function rankOf(s) {
  return s >> 3;
}

export function algebraic(s) {
  return FILES[s & 7] + ((s >> 3) + 1);
}

export function parseAlg(a) {
  return a.charCodeAt(0) - 97 + (Number(a[1]) - 1) * 8;
}

export function offset(from, df, dr) {
  const f = (from & 7) + df;
  const r = (from >> 3) + dr;
  if (f < 0 || f > 7 || r < 0 || r > 7) return -1;
  return f + r * 8;
}

function setupBoard() {
  const board = Array(64).fill(null);
  const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  for (let f = 0; f < 8; f++) {
    board[sq(f, 0)] = { t: back[f], c: 'w' };
    board[sq(f, 1)] = { t: 'p', c: 'w' };
    board[sq(f, 6)] = { t: 'p', c: 'b' };
    board[sq(f, 7)] = { t: back[f], c: 'b' };
  }
  return board;
}

export class Chess {
  constructor() {
    this.reset();
  }

  reset() {
    this.board = setupBoard();
    this.turn = 'w';
    this.castle = { wK: true, wQ: true, bK: true, bQ: true };
    this.ep = null;
    this.halfmove = 0;
    this.fullmove = 1;
    this.history = [];
    this.positions = [];
    this.positions.push(this.key());
  }

  key() {
    let s = this.turn;
    s += this.castle.wK ? 'K' : '';
    s += this.castle.wQ ? 'Q' : '';
    s += this.castle.bK ? 'k' : '';
    s += this.castle.bQ ? 'q' : '';
    s += this.ep == null ? '-' : String(this.ep);
    for (let i = 0; i < 64; i++) {
      const p = this.board[i];
      s += p ? p.c + p.t : '.';
    }
    return s;
  }

  repetitions() {
    const now = this.positions.at(-1) ?? this.key();
    let n = 0;
    for (const k of this.positions) if (k === now) n += 1;
    return n;
  }

  insufficientMaterial() {
    const extras = [];
    for (let i = 0; i < 64; i++) {
      const p = this.board[i];
      if (p && p.t !== 'k') extras.push({ t: p.t, sq: i });
    }
    if (!extras.length) return true;
    if (extras.length === 1 && (extras[0].t === 'n' || extras[0].t === 'b')) return true;
    if (extras.length === 2 && extras[0].t === 'b' && extras[1].t === 'b') {
      const color = (s) => ((s & 7) + (s >> 3)) & 1;
      return color(extras[0].sq) === color(extras[1].sq);
    }
    return false;
  }

  drawReason() {
    if (this.halfmove >= 100) return '50-move rule';
    if (this.insufficientMaterial()) return 'insufficient material';
    if (this.repetitions() >= 3) return 'threefold repetition';
    return '';
  }

  pieceAt(s) {
    return this.board[s];
  }

  kingSquare(color = this.turn) {
    for (let i = 0; i < 64; i++) {
      const p = this.board[i];
      if (p && p.t === 'k' && p.c === color) return i;
    }
    return -1;
  }

  isAttacked(target, byColor) {
    const pawnDir = byColor === 'w' ? -1 : 1;
    for (const df of [-1, 1]) {
      const s = offset(target, df, pawnDir);
      if (s >= 0) {
        const p = this.board[s];
        if (p && p.c === byColor && p.t === 'p') return true;
      }
    }

    const hops = [
      [1, 2], [2, 1], [-1, 2], [-2, 1],
      [1, -2], [2, -1], [-1, -2], [-2, -1],
    ];
    for (const [df, dr] of hops) {
      const s = offset(target, df, dr);
      if (s >= 0) {
        const p = this.board[s];
        if (p && p.c === byColor && p.t === 'n') return true;
      }
    }

    const king = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [1, -1], [-1, 1], [-1, -1],
    ];
    for (const [df, dr] of king) {
      const s = offset(target, df, dr);
      if (s >= 0) {
        const p = this.board[s];
        if (p && p.c === byColor && p.t === 'k') return true;
      }
    }

    const rays = [
      [1, 0, 'r'], [-1, 0, 'r'], [0, 1, 'r'], [0, -1, 'r'],
      [1, 1, 'b'], [1, -1, 'b'], [-1, 1, 'b'], [-1, -1, 'b'],
    ];
    for (const [df, dr, slide] of rays) {
      let s = offset(target, df, dr);
      while (s >= 0) {
        const p = this.board[s];
        if (p) {
          if (p.c === byColor && (p.t === slide || p.t === 'q')) return true;
          break;
        }
        s = offset(s, df, dr);
      }
    }
    return false;
  }

  inCheck(color = this.turn) {
    return this.isAttacked(this.kingSquare(color), color === 'w' ? 'b' : 'w');
  }

  #push(moves, from, to, extra = {}) {
    const piece = this.board[from];
    const dest = this.board[to];
    if (dest && dest.c === piece.c) return;
    moves.push({
      from,
      to,
      piece: piece.t,
      color: piece.c,
      captured: dest ? dest.t : null,
      promo: null,
      castle: null,
      ep: false,
      ...extra,
    });
  }

  #slide(moves, from, dirs) {
    for (const [df, dr] of dirs) {
      let s = offset(from, df, dr);
      while (s >= 0) {
        const p = this.board[s];
        this.#push(moves, from, s);
        if (p) break;
        s = offset(s, df, dr);
      }
    }
  }

  #pseudo(from) {
    const piece = this.board[from];
    if (!piece) return [];
    const moves = [];
    const { t, c } = piece;

    if (t === 'p') {
      const dir = c === 'w' ? 1 : -1;
      const start = c === 'w' ? 1 : 6;
      const last = c === 'w' ? 7 : 0;
      const one = offset(from, 0, dir);
      if (one >= 0 && !this.board[one]) {
        this.#push(moves, from, one);
        if (rankOf(from) === start) {
          const two = offset(from, 0, dir * 2);
          if (two >= 0 && !this.board[two]) this.#push(moves, from, two);
        }
      }
      for (const df of [-1, 1]) {
        const cap = offset(from, df, dir);
        if (cap < 0) continue;
        if (this.board[cap] && this.board[cap].c !== c) this.#push(moves, from, cap);
        else if (this.ep === cap) this.#push(moves, from, cap, { ep: true, captured: 'p' });
      }
      for (const m of moves) {
        if (rankOf(m.to) === last) m.promo = 'q';
      }
      const promoted = [];
      for (const m of moves) {
        if (m.promo) {
          for (const promo of ['q', 'r', 'b', 'n']) {
            promoted.push({ ...m, promo });
          }
        } else promoted.push(m);
      }
      return promoted;
    }

    if (t === 'n') {
      for (const [df, dr] of [
        [1, 2], [2, 1], [-1, 2], [-2, 1],
        [1, -2], [2, -1], [-1, -2], [-2, -1],
      ]) {
        const s = offset(from, df, dr);
        if (s >= 0) this.#push(moves, from, s);
      }
      return moves;
    }

    if (t === 'b') {
      this.#slide(moves, from, [[1, 1], [1, -1], [-1, 1], [-1, -1]]);
      return moves;
    }

    if (t === 'r') {
      this.#slide(moves, from, [[1, 0], [-1, 0], [0, 1], [0, -1]]);
      return moves;
    }

    if (t === 'q') {
      this.#slide(moves, from, [
        [1, 0], [-1, 0], [0, 1], [0, -1],
        [1, 1], [1, -1], [-1, 1], [-1, -1],
      ]);
      return moves;
    }

    if (t === 'k') {
      for (const [df, dr] of [
        [1, 0], [-1, 0], [0, 1], [0, -1],
        [1, 1], [1, -1], [-1, 1], [-1, -1],
      ]) {
        const s = offset(from, df, dr);
        if (s >= 0) this.#push(moves, from, s);
      }
      const enemy = c === 'w' ? 'b' : 'w';
      if (!this.isAttacked(from, enemy)) {
        if (c === 'w') {
          if (this.castle.wK && !this.board[5] && !this.board[6]
            && !this.isAttacked(5, enemy) && !this.isAttacked(6, enemy)) {
            this.#push(moves, from, 6, { castle: 'K' });
          }
          if (this.castle.wQ && !this.board[1] && !this.board[2] && !this.board[3]
            && !this.isAttacked(3, enemy) && !this.isAttacked(2, enemy)) {
            this.#push(moves, from, 2, { castle: 'Q' });
          }
        } else {
          if (this.castle.bK && !this.board[61] && !this.board[62]
            && !this.isAttacked(61, enemy) && !this.isAttacked(62, enemy)) {
            this.#push(moves, from, 62, { castle: 'K' });
          }
          if (this.castle.bQ && !this.board[57] && !this.board[58] && !this.board[59]
            && !this.isAttacked(59, enemy) && !this.isAttacked(58, enemy)) {
            this.#push(moves, from, 58, { castle: 'Q' });
          }
        }
      }
    }
    return moves;
  }

  #make(m) {
    m.prevEp = this.ep;
    m.prevCastle = { ...this.castle };
    m.prevHalf = this.halfmove;
    const piece = this.board[m.from];

    if (m.ep) {
      m.capSq = piece.c === 'w' ? m.to - 8 : m.to + 8;
      m.capturedPiece = this.board[m.capSq];
      this.board[m.capSq] = null;
    } else {
      m.capSq = m.to;
      m.capturedPiece = this.board[m.to];
    }

    this.board[m.to] = m.promo ? { t: m.promo, c: piece.c } : piece;
    this.board[m.from] = null;

    if (m.castle === 'K') {
      m.rookFrom = piece.c === 'w' ? 7 : 63;
      m.rookTo = piece.c === 'w' ? 5 : 61;
      this.board[m.rookTo] = this.board[m.rookFrom];
      this.board[m.rookFrom] = null;
    } else if (m.castle === 'Q') {
      m.rookFrom = piece.c === 'w' ? 0 : 56;
      m.rookTo = piece.c === 'w' ? 3 : 59;
      this.board[m.rookTo] = this.board[m.rookFrom];
      this.board[m.rookFrom] = null;
    }

    if (piece.t === 'k') {
      if (piece.c === 'w') {
        this.castle.wK = false;
        this.castle.wQ = false;
      } else {
        this.castle.bK = false;
        this.castle.bQ = false;
      }
    }
    if (piece.t === 'r') {
      if (m.from === 0) this.castle.wQ = false;
      if (m.from === 7) this.castle.wK = false;
      if (m.from === 56) this.castle.bQ = false;
      if (m.from === 63) this.castle.bK = false;
    }
    if (m.capturedPiece?.t === 'r') {
      if (m.capSq === 0) this.castle.wQ = false;
      if (m.capSq === 7) this.castle.wK = false;
      if (m.capSq === 56) this.castle.bQ = false;
      if (m.capSq === 63) this.castle.bK = false;
    }

    this.ep = null;
    if (piece.t === 'p' && Math.abs(rankOf(m.to) - rankOf(m.from)) === 2) {
      this.ep = (m.from + m.to) >> 1;
    }

    if (piece.t === 'p' || m.capturedPiece) this.halfmove = 0;
    else this.halfmove += 1;
    if (piece.c === 'b') this.fullmove += 1;
    this.turn = piece.c === 'w' ? 'b' : 'w';
  }

  #unmake(m) {
    const color = m.color;
    this.turn = color;
    this.ep = m.prevEp;
    this.castle = { ...m.prevCastle };
    this.halfmove = m.prevHalf;
    if (color === 'b') this.fullmove -= 1;

    this.board[m.from] = { t: m.piece, c: color };
    this.board[m.to] = null;
    if (m.capturedPiece) this.board[m.capSq] = m.capturedPiece;
    if (m.castle) {
      this.board[m.rookFrom] = this.board[m.rookTo];
      this.board[m.rookTo] = null;
    }
  }

  allLegal() {
    const list = [];
    for (let from = 0; from < 64; from++) {
      const p = this.board[from];
      if (!p || p.c !== this.turn) continue;
      for (const m of this.#pseudo(from)) {
        this.#make(m);
        const ok = !this.inCheck(p.c);
        this.#unmake(m);
        if (ok) list.push(m);
      }
    }
    return list;
  }

  legalFrom(from) {
    return this.allLegal().filter((m) => m.from === from);
  }

  #disambig(m, legal) {
    if (m.piece === 'p' || m.piece === 'k') return '';
    const twins = legal.filter(
      (o) => o !== m && o.piece === m.piece && o.to === m.to && o.from !== m.from,
    );
    if (!twins.length) return '';
    const sameFile = twins.some((o) => fileOf(o.from) === fileOf(m.from));
    const sameRank = twins.some((o) => rankOf(o.from) === rankOf(m.from));
    if (!sameFile) return FILES[fileOf(m.from)];
    if (!sameRank) return String(rankOf(m.from) + 1);
    return algebraic(m.from);
  }

  #san(m, legal) {
    if (m.castle === 'K') return 'O-O';
    if (m.castle === 'Q') return 'O-O-O';
    const cap = m.captured || m.ep;
    let s = '';
    if (m.piece === 'p') {
      if (cap) s += FILES[fileOf(m.from)] + 'x';
      s += algebraic(m.to);
      if (m.promo) s += `=${PIECE_N[m.promo]}`;
      return s;
    }
    s = PIECE_N[m.piece] + this.#disambig(m, legal);
    if (cap) s += 'x';
    s += algebraic(m.to);
    if (m.promo) s += `=${PIECE_N[m.promo]}`;
    return s;
  }

  play(from, to, promo = null) {
    const legal = this.allLegal();
    const matches = legal.filter((m) => m.from === from && m.to === to);
    if (!matches.length) return { ok: false };
    const needsPromo = matches.some((m) => m.promo);
    if (needsPromo && !promo) return { ok: false, needsPromo: true };
    const m = needsPromo ? matches.find((x) => x.promo === promo) : matches[0];
    if (!m) return { ok: false };
    const san = this.#san(m, legal);
    this.#make(m);
    this.positions.push(this.key());
    const st = this.status();
    m.san = san + (st === 'checkmate' ? '#' : st === 'check' ? '+' : '');
    this.history.push(m);
    return { ok: true, move: m, status: st };
  }

  undo() {
    const m = this.history.pop();
    if (!m) return null;
    this.#unmake(m);
    this.positions.pop();
    return m;
  }

  status() {
    const legal = this.allLegal();
    const check = this.inCheck();
    if (!legal.length) return check ? 'checkmate' : 'stalemate';
    if (this.halfmove >= 100) return 'draw';
    if (this.insufficientMaterial()) return 'draw';
    if (this.repetitions() >= 3) return 'draw';
    if (check) return 'check';
    return 'playing';
  }

  probe(m) {
    this.#make(m);
  }

  revert(m) {
    this.#unmake(m);
  }

  captured() {
    const w = [];
    const b = [];
    for (const m of this.history) {
      if (!m.capturedPiece) continue;
      (m.capturedPiece.c === 'w' ? w : b).push(m.capturedPiece.t);
    }
    return { w, b };
  }
}
