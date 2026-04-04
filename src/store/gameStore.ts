import { create } from 'zustand';
import { SetupParams } from '../types';

/**
 * Minimal global store for passing setup params from the Setup screen to Game.
 * We use zustand (lightweight, no boilerplate) instead of React context to
 * avoid prop-drilling across navigator boundaries.
 */
interface GameStore {
  setup: SetupParams | null;
  setSetup: (params: SetupParams) => void;
  clearSetup: () => void;
}

export const useGameStore = create<GameStore>(set => ({
  setup: null,
  setSetup: (params) => set({ setup: params }),
  clearSetup: () => set({ setup: null }),
}));
