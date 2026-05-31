#!/usr/bin/env python3
"""
Validates every opening in src/data/openings.ts by replaying its moves
through a minimal chess engine written in pure Python (no dependencies).

Usage:
    python3 scripts/validate-openings.py

Exit code 0 = all openings valid.
Exit code 1 = one or more illegal moves found.

Run this every time you add or edit an opening.
"""

import re
import sys
from pathlib import Path

FILES = 'abcdefgh'
RANKS = '12345678'

INIT_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"


def sq2str(f, r):
    return FILES[f] + str(r + 1)


def board_from_fen(fen):
    board = {}
    r = 7
    for row in fen.split('/'):
        f = 0
        for c in row:
            if c.isdigit():
                f += int(c)
            else:
                board[(f, r)] = (c.lower(), 'w' if c.isupper() else 'b')
                f += 1
        r -= 1
    return board


def find_pieces(board, piece, color):
    return [(f, r) for (f, r), (p, c) in board.items() if p == piece and c == color]


def is_diagonal(f1, r1, f2, r2):
    return abs(f2 - f1) == abs(r2 - r1) and f1 != f2


def is_straight(f1, r1, f2, r2):
    return (f1 == f2 or r1 == r2) and (f1, r1) != (f2, r2)


def is_knight_move(f1, r1, f2, r2):
    return sorted([abs(f2 - f1), abs(r2 - r1)]) == [1, 2]


def path_clear(board, f1, r1, f2, r2):
    df = 0 if f2 == f1 else (1 if f2 > f1 else -1)
    dr = 0 if r2 == r1 else (1 if r2 > r1 else -1)
    cf, cr = f1 + df, r1 + dr
    while (cf, cr) != (f2, r2):
        if (cf, cr) in board:
            return False
        cf += df
        cr += dr
    return True


def apply_move_san(board, san, color, ep_sq, castle_rights):
    board = dict(board)
    opp = 'b' if color == 'w' else 'w'
    new_ep = None

    # ── Castling ──────────────────────────────────────────────────────────────
    if san in ('O-O', 'O-O-O'):
        rank = 0 if color == 'w' else 7
        king_sq = (4, rank)
        dest = (6, rank) if san == 'O-O' else (2, rank)
        rook_sq = (7, rank) if san == 'O-O' else (0, rank)
        if board.get(king_sq) != ('k', color):
            raise ValueError(f"King not on e{rank + 1}")
        if board.get(rook_sq) != ('r', color):
            raise ValueError(f"Rook not on {'h' if san == 'O-O' else 'a'}{rank + 1}")
        f1, f2 = king_sq[0], dest[0]
        for ff in range(min(f1, f2) + 1, max(f1, f2)):
            if (ff, rank) in board:
                raise ValueError(f"Castling path blocked at {sq2str(ff, rank)}")
        del board[king_sq]
        board[dest] = ('k', color)
        del board[rook_sq]
        board[(5, rank) if san == 'O-O' else (3, rank)] = ('r', color)
        return board, new_ep, castle_rights

    # ── Strip check / mate / promotion ───────────────────────────────────────
    san_clean = san.rstrip('+#')
    promotion = None
    if '=' in san_clean:
        san_clean, promo = san_clean.split('=')
        promotion = promo.lower()

    is_capture = 'x' in san_clean
    san_clean = san_clean.replace('x', '')

    dest_str = san_clean[-2:]
    if dest_str[0] not in FILES or dest_str[1] not in RANKS:
        raise ValueError(f"Unrecognised destination square: '{dest_str}'")
    df, dr = FILES.index(dest_str[0]), int(dest_str[1]) - 1
    dest = (df, dr)
    prefix = san_clean[:-2]   # piece letter + optional disambiguation

    # ── Pawn moves ────────────────────────────────────────────────────────────
    if not prefix or prefix[0].islower():
        direction = 1 if color == 'w' else -1
        start_rank = 1 if color == 'w' else 6

        if is_capture:
            sf = FILES.index(prefix[0])
            sr = dr - direction
            from_sq = (sf, sr)
            if board.get(from_sq) != ('p', color):
                raise ValueError(f"No {color} pawn on {sq2str(sf, sr)} to capture to {dest_str}")
            if dest == ep_sq:
                ep_pawn = (df, sr)
                if ep_pawn in board:
                    del board[ep_pawn]
            elif board.get(dest, (None, None))[1] != opp:
                raise ValueError(f"No enemy piece on {dest_str} to capture")
        else:
            from_sq = (df, dr - direction)
            if board.get(from_sq) == ('p', color):
                pass
            elif (dr - direction * 2 == start_rank
                  and board.get((df, start_rank)) == ('p', color)
                  and (df, dr - direction) not in board):
                from_sq = (df, start_rank)
                new_ep = (df, start_rank + direction)
            else:
                raise ValueError(f"No {color} pawn can reach {dest_str}")
            if dest in board:
                raise ValueError(f"Square {dest_str} is occupied (pawn push)")

        del board[from_sq]
        is_promo = (color == 'w' and dr == 7) or (color == 'b' and dr == 0)
        board[dest] = (promotion if (promotion and is_promo) else ('q' if is_promo else 'p'), color)
        return board, new_ep, castle_rights

    # ── Piece moves ───────────────────────────────────────────────────────────
    piece = prefix[0].lower()
    disambig = prefix[1:] if len(prefix) > 1 else ''

    candidates = find_pieces(board, piece, color)
    valid = []
    for (ff, fr) in candidates:
        # Apply disambiguation filter
        if disambig:
            if len(disambig) == 2:
                if sq2str(ff, fr) != disambig:
                    continue
            elif disambig[0] in FILES:
                if FILES[ff] != disambig[0]:
                    continue
            elif disambig[0] in RANKS:
                if str(fr + 1) != disambig[0]:
                    continue

        if piece == 'n':
            ok = is_knight_move(ff, fr, df, dr)
        elif piece == 'b':
            ok = is_diagonal(ff, fr, df, dr) and path_clear(board, ff, fr, df, dr)
        elif piece == 'r':
            ok = is_straight(ff, fr, df, dr) and path_clear(board, ff, fr, df, dr)
        elif piece == 'q':
            ok = (is_diagonal(ff, fr, df, dr) or is_straight(ff, fr, df, dr)) \
                 and path_clear(board, ff, fr, df, dr)
        elif piece == 'k':
            ok = max(abs(df - ff), abs(dr - fr)) == 1
        else:
            ok = False

        if not ok:
            continue
        if dest in board and board[dest][1] == color:
            continue  # can't capture own piece
        valid.append((ff, fr))

    if not valid:
        raise ValueError(
            f"No valid {color} {piece} can move to {dest_str}"
            + (f" (disambiguation: '{disambig}')" if disambig else "")
        )
    if len(valid) > 1:
        squares = [sq2str(f, r) for f, r in valid]
        raise ValueError(
            f"Ambiguous: {len(valid)} {color} {piece}s can reach {dest_str}: {squares} "
            f"— add a file or rank to disambiguate (e.g. N{'f' if piece=='n' else piece}{'d' if 'd' in dest_str else dest_str[0]}{dest_str[1]})"
        )

    from_sq = valid[0]
    del board[from_sq]
    board[dest] = (piece, color)
    return board, new_ep, castle_rights


def validate(openings_ts_path: Path):
    src = openings_ts_path.read_text()
    pattern = re.compile(
        r"id:\s*'([^']+)'.*?moves:\s*\[([^\]]+)\]",
        re.DOTALL,
    )

    errors = []
    total = 0

    for m in pattern.finditer(src):
        oid = m.group(1)
        moves = re.findall(r"'([^']+)'", m.group(2))
        total += 1

        board = board_from_fen(INIT_FEN)
        ep_sq = None
        castle_rights = {'w': {'K': True, 'Q': True}, 'b': {'k': True, 'q': True}}
        color = 'w'

        for i, san in enumerate(moves):
            try:
                board, ep_sq, castle_rights = apply_move_san(
                    board, san, color, ep_sq, castle_rights
                )
                color = 'b' if color == 'w' else 'w'
            except ValueError as e:
                errors.append((oid, i + 1, san, str(e)))
                break

    return total, errors


def main():
    root = Path(__file__).parent.parent
    openings_path = root / 'src' / 'data' / 'openings.ts'

    if not openings_path.exists():
        print(f"ERROR: Cannot find {openings_path}", file=sys.stderr)
        sys.exit(1)

    total, errors = validate(openings_path)

    if errors:
        print(f"INVALID MOVES FOUND ({len(errors)} opening(s) with errors):\n")
        for oid, ply, san, reason in errors:
            print(f"  Opening : {oid}")
            print(f"  Ply     : {ply}  (move '{san}')")
            print(f"  Reason  : {reason}")
            print()
        sys.exit(1)
    else:
        print(f"OK — all {total} openings valid.")
        sys.exit(0)


if __name__ == '__main__':
    main()
