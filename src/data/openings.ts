import { Opening } from '../types';

/**
 * Each opening is defined with the full move sequence (both sides) up to the
 * point where theory ends and free play begins.
 *
 * moves[] contains SAN notation for both colors in order:
 * [white_move_1, black_move_1, white_move_2, black_move_2, ...]
 */
export const OPENINGS: Opening[] = [
  // ── WHITE OPENINGS ──────────────────────────────────────────────────────────
  {
    id: 'ruy_lopez',
    name: 'Ruy López',
    eco: 'C65',
    color: 'white',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'],
    description: 'One of the oldest and most classic openings. White immediately puts pressure on the e5 pawn.',
  },
  {
    id: 'ruy_lopez_berlin',
    name: 'Ruy López — Berlin Defense',
    eco: 'C65',
    color: 'white',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6'],
    description: "Black's solid Berlin Defense. Highly theoretical endgame-oriented line.",
  },
  {
    id: 'italian_game',
    name: 'Italian Game',
    eco: 'C50',
    color: 'white',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'],
    description: 'A classical opening aiming for quick development and control of the center.',
  },
  {
    id: 'giuoco_piano',
    name: 'Giuoco Piano',
    eco: 'C54',
    color: 'white',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'd6'],
    description: 'The "Quiet Game". White prepares d4 to challenge the center.',
  },
  {
    id: 'kings_gambit',
    name: "King's Gambit",
    eco: 'C30',
    color: 'white',
    moves: ['e4', 'e5', 'f4'],
    description: 'An aggressive pawn sacrifice aiming to open the f-file and seize the center.',
  },
  {
    id: 'queens_gambit',
    name: "Queen's Gambit",
    eco: 'D06',
    color: 'white',
    moves: ['d4', 'd5', 'c4'],
    description: "White offers the c-pawn to gain central control. One of the most popular d4 openings.",
  },
  {
    id: 'queens_gambit_declined',
    name: "Queen's Gambit Declined",
    eco: 'D50',
    color: 'white',
    moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5'],
    description: "Black declines the gambit and fights for the center with pawns.",
  },
  {
    id: 'london_system',
    name: 'London System',
    eco: 'D02',
    color: 'white',
    moves: ['d4', 'd5', 'Nf3', 'Nf6', 'Bf4'],
    description: 'A solid, low-theory system where White develops pieces to natural squares.',
  },
  {
    id: 'catalan',
    name: 'Catalan Opening',
    eco: 'E04',
    color: 'white',
    moves: ['d4', 'Nf6', 'c4', 'e6', 'g3', 'd5', 'Bg2', 'dxc4'],
    description: 'White fianchettoes the bishop and exerts long-term pressure on the queenside.',
  },
  {
    id: 'english_opening',
    name: 'English Opening',
    eco: 'A10',
    color: 'white',
    moves: ['c4', 'e5', 'Nc3', 'Nf6', 'Nf3'],
    description: "A flexible flank opening controlling d5 and aiming for queenside pressure.",
  },

  // ── BLACK OPENINGS ───────────────────────────────────────────────────────────
  {
    id: 'scandinavian',
    name: 'Scandinavian Defense',
    eco: 'B01',
    color: 'black',
    moves: ['e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qa5'],
    description: "Black immediately challenges White's center with 1...d5.",
  },
  {
    id: 'sicilian_najdorf',
    name: 'Sicilian — Najdorf',
    eco: 'B90',
    color: 'black',
    moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'],
    description: 'The most popular chess opening at the highest level. Highly dynamic and complex.',
  },
  {
    id: 'sicilian_dragon',
    name: 'Sicilian — Dragon',
    eco: 'B70',
    color: 'black',
    moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'g6'],
    description: "Black fianchettoes the bishop and aims for sharp counterplay.",
  },
  {
    id: 'french_defense',
    name: 'French Defense',
    eco: 'C00',
    color: 'black',
    moves: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Nf6'],
    description: "A solid defense that cedes space initially but aims for counterplay later.",
  },
  {
    id: 'caro_kann',
    name: 'Caro-Kann Defense',
    eco: 'B10',
    color: 'black',
    moves: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5'],
    description: 'A solid and reliable defense. Black supports d5 with c6 without blocking the bishop.',
  },
  {
    id: 'kings_indian',
    name: "King's Indian Defense",
    eco: 'E61',
    color: 'black',
    moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3', 'O-O'],
    description: 'A hypermodern defense. Black allows White to build a big center then attacks it.',
  },
  {
    id: 'grunfeld',
    name: 'Grünfeld Defense',
    eco: 'D70',
    color: 'black',
    moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5', 'cxd5', 'Nxd5'],
    description: "Black invites White to build a big center in order to attack and destroy it.",
  },
  {
    id: 'nimzo_indian',
    name: 'Nimzo-Indian Defense',
    eco: 'E20',
    color: 'black',
    moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'],
    description: 'Black pins the knight and aims to damage White\'s pawn structure.',
  },
  {
    id: 'dutch_defense',
    name: 'Dutch Defense',
    eco: 'A80',
    color: 'black',
    moves: ['d4', 'f5', 'c4', 'Nf6', 'Nc3', 'e6'],
    description: "Black controls e4 immediately, aiming for kingside activity.",
  },
  {
    id: 'queens_indian',
    name: "Queen's Indian Defense",
    eco: 'E12',
    color: 'black',
    moves: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'b6', 'g3', 'Bb7'],
    description: "Black fianchettoes the bishop to control the long diagonal and fight for the center.",
  },
];

export const OPENINGS_BY_COLOR = {
  white: OPENINGS.filter(o => o.color === 'white'),
  black: OPENINGS.filter(o => o.color === 'black'),
};
