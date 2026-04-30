import * as Haptics from 'expo-haptics';

export type HapticEvent = 'move' | 'capture' | 'check' | 'checkmate' | 'illegal';

const IMPACT: Record<HapticEvent, () => Promise<void>> = {
  move:      () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  capture:   () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  check:     () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
  checkmate: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  illegal:   () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
};

export function useHaptics() {
  const trigger = (event: HapticEvent) => {
    IMPACT[event]().catch(() => {
      // Haptics not available on this device — silently ignore
    });
  };

  return { trigger };
}
