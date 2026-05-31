export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'] as const;

export const DEFAULT_COLORS = {
  light: '#f0d9b5',
  dark: '#b58863',
};

export const HIGHLIGHT_COLORS = {
  lastMoveLight: '#cdd26a88',
  lastMoveDark: '#aaa23aaa',
  selected: '#20e07066',
  check: '#ff000088',
  premove: '#f6a82566',
  hintDot: '#00000033',
  hintCapture: '#00000022',
};


export const DRAG_SCALE = 1.3;
export const SNAP_DURATION_MS = 150;
export const MOVE_ANIM_DURATION_MS = 200;
